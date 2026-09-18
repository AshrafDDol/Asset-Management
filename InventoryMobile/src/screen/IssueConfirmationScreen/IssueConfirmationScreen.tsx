import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage, confirmationErrorMessage } from '../../api/client';
import { confirmHandheldIssue, ExpectedIssueAsset, getHandheldIssue, HandheldIssue } from '../../api/issueBatches';
import { ScreenStackParamList } from '../../navigation/types';
import IMSRFIDService, { RFIDTriggerEvent } from '../../services/rfid/IMSRFIDService';

type Props = NativeStackScreenProps<ScreenStackParamList, 'IssueConfirmationScreen'>;
type ResultState = 'SCANNING' | 'VALIDATING' | 'CONFIRMED' | 'ERROR';
type MagnifiedValue = { label: string; value: string };
const normalizeEpc = (epc: string) => epc.trim().toUpperCase();

const IssueConfirmationScreen: React.FC<Props> = ({ route, navigation }) => {
  const isFocused = useIsFocused();
  const [issue, setIssue] = useState<HandheldIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setRfidStatus] = useState('Released');
  const [, setTrigger] = useState<'DOWN' | 'UP'>('UP');
  const [, setScanning] = useState(false);
  const [matchedEpcs, setMatchedEpcs] = useState<Set<string>>(new Set());
  const [unexpectedEpcs, setUnexpectedEpcs] = useState<Set<string>>(new Set());
  const [showUnexpected, setShowUnexpected] = useState(false);
  const [magnifiedValue, setMagnifiedValue] = useState<MagnifiedValue | null>(null);
  const [showScanComplete, setShowScanComplete] = useState(false);
  const [result, setResult] = useState<ResultState>('SCANNING');
  const [error, setError] = useState<string | null>(null);
  const [workChanged, setWorkChanged] = useState(false);
  const mounted = useRef(false);
  const appState = useRef(AppState.currentState);
  const completionNotified = useRef(false);

  const expectedByEpc = useMemo(() => {
    const map = new Map<string, ExpectedIssueAsset>();
    issue?.expectedItems.forEach(item => { if (item.epc) map.set(normalizeEpc(item.epc), item); });
    return map;
  }, [issue]);
  const missingEpcAssets = useMemo(() => issue?.expectedItems.filter(item => !item.epc) ?? [], [issue]);
  const complete = Boolean(issue) && (issue?.expectedAssetCount ?? 0) > 0 && missingEpcAssets.length === 0 && matchedEpcs.size === issue?.expectedAssetCount;

  useEffect(() => {
    mounted.current = true;
    getHandheldIssue(route.params.issueId).then(value => { if (mounted.current) setIssue(value); }).catch(reason => { if (mounted.current) setError(apiErrorMessage(reason)); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [route.params.issueId]);

  const initialize = useCallback(async () => {
    setRfidStatus('Initializing...');
    const ready = await IMSRFIDService.initialize();
    if (mounted.current) setRfidStatus(ready ? 'Ready' : 'Error');
  }, []);

  useEffect(() => {
    const removeTags = IMSRFIDService.onTags(batch => {
      setMatchedEpcs(previous => { const next = new Set(previous); batch.forEach(tag => { const epc = normalizeEpc(tag.epc); if (expectedByEpc.has(epc)) next.add(epc); }); return next.size === previous.size ? previous : next; });
      setUnexpectedEpcs(previous => { const next = new Set(previous); batch.forEach(tag => { const epc = normalizeEpc(tag.epc); if (epc && !expectedByEpc.has(epc)) next.add(epc); }); return next.size === previous.size ? previous : next; });
    });
    const removeTrigger = IMSRFIDService.onTrigger((event: RFIDTriggerEvent) => {
      setTrigger(event.action);
      if (event.startsSession) { setMatchedEpcs(new Set()); setUnexpectedEpcs(new Set()); setShowUnexpected(false); completionNotified.current = false; setShowScanComplete(false); setResult('SCANNING'); setError(null); }
      IMSRFIDService.isScanning().then(setScanning).catch(() => setScanning(false));
    });
    const removeError = IMSRFIDService.onError(setError);
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const previous = appState.current; appState.current = next;
      if (previous === 'active' && next !== 'active') { setScanning(false); setTrigger('UP'); setRfidStatus('Released'); IMSRFIDService.release().catch(() => undefined); }
      else if (previous !== 'active' && next === 'active' && isFocused && missingEpcAssets.length === 0 && result !== 'CONFIRMED') initialize().catch(reason => setError(String(reason)));
    });
    return () => { subscription.remove(); removeTags(); removeTrigger(); removeError(); };
  }, [expectedByEpc, initialize, isFocused, missingEpcAssets.length, result]);

  useEffect(() => {
    if (!issue || missingEpcAssets.length > 0 || result === 'CONFIRMED') return;
    if (isFocused && AppState.currentState === 'active') initialize().catch(reason => setError(String(reason)));
    else { setRfidStatus('Released'); setScanning(false); IMSRFIDService.release().catch(() => undefined); }
  }, [initialize, isFocused, issue, missingEpcAssets.length, result]);
  useEffect(() => () => { IMSRFIDService.destroy().catch(() => undefined); }, []);

  useEffect(() => {
    if (!complete || completionNotified.current || result === 'CONFIRMED') return;
    completionNotified.current = true;
    setShowScanComplete(true);
    const timeout = setTimeout(() => setShowScanComplete(false), 500);
    return () => clearTimeout(timeout);
  }, [complete, result]);

  const confirm = async () => {
    if (!issue || !complete || result === 'VALIDATING' || result === 'CONFIRMED') return;
    setResult('VALIDATING'); setError(null); setWorkChanged(false);
    try {
      await IMSRFIDService.stopScan(); setScanning(false);
      const matched = issue.expectedItems.map(item => ({ itemId: item.itemId, assetId: item.assetId, assignmentId: item.assignmentId!, epc: normalizeEpc(item.epc!) }));
      await confirmHandheldIssue(issue.id, matched, Array.from(unexpectedEpcs));
      setResult('CONFIRMED'); setRfidStatus('Released'); await IMSRFIDService.release();
    } catch (reason) {
      const message = confirmationErrorMessage(reason); setResult('ERROR'); setWorkChanged(/work item changed|pending swap|conflict/i.test(message)); setError(message);
    }
  };

  const magnifiableCell = (label: string, value: string, style: object, matched = false) => <Pressable style={style} onPress={() => setMagnifiedValue({ label, value })}><Text numberOfLines={1} style={[styles.cellText, matched && styles.matchedText]}>{value}</Text></Pressable>;
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading issue...</Text></View>;
  if (!issue) return <View style={styles.center}><Text style={styles.error}>{error || 'Issue is unavailable'}</Text></View>;

  return <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled>
      <Text style={styles.screenTitle}>Asset Issue</Text>
      <View style={styles.detailCard}><Text style={styles.jobTitle}>{issue.jobNo || issue.batchNo}</Text><Text style={styles.request}>Request: {issue.batchNo}</Text><View style={styles.detailDivider} /><Text style={styles.detailText}><Text style={styles.detailLabel}>To Location: </Text>{issue.toLocation?.name || 'Per asset'}</Text><Text style={styles.detailText}><Text style={styles.detailLabel}>Recipient: </Text>{issue.recipient?.fullName || 'Per asset'}</Text></View>
      {missingEpcAssets.length > 0 && <View style={styles.blocked}><Text style={styles.error}>RFID confirmation blocked. Register EPCs for:</Text>{missingEpcAssets.map(item => <Text key={item.assetId}>{item.assetCode} — {item.itemName}</Text>)}</View>}
      <View style={styles.assetsCard}>
        <View style={styles.assetsHeader}><Text style={styles.sectionTitle}>Assets</Text><View style={styles.filterControl}><Text style={styles.filterLabel}>Filter</Text><Switch value={showUnexpected} onValueChange={setShowUnexpected} trackColor={{ false: '#CBD5E1', true: '#93C5FD' }} thumbColor={showUnexpected ? '#2563EB' : '#F8FAFC'} /></View></View>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.horizontalTable}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.verticalTable} contentContainerStyle={styles.tableContent}>
            <View style={[styles.tableRow, styles.tableHeader]}><Text style={[styles.codeColumn, styles.headerText]}>Asset Code</Text><Text style={[styles.nameColumn, styles.headerText]}>Asset Name</Text><Text style={[styles.statusColumn, styles.headerText]}>Status</Text><Text style={[styles.epcColumn, styles.headerText]}>EPC</Text></View>
            {issue.expectedItems.map(item => {
              const matched = Boolean(item.epc && matchedEpcs.has(normalizeEpc(item.epc)));
              const epc = item.epc || 'EPC MISSING';
              return <View style={styles.tableRow} key={item.assetId}>{magnifiableCell('Asset Code', item.assetCode, styles.codeColumn, matched)}{magnifiableCell('Asset Name', item.itemName, styles.nameColumn, matched)}<Text style={[styles.statusColumn, styles.statusText, matched && styles.matchedText]}>{matched ? 'Matched' : 'Not Matched'}</Text><Pressable style={styles.epcColumn} onPress={() => setMagnifiedValue({ label: 'EPC', value: epc })}><Text numberOfLines={1} style={[styles.epcText, matched && styles.matchedText]}>{epc}</Text></Pressable></View>;
            })}
            {showUnexpected && Array.from(unexpectedEpcs).map(epc => <View style={styles.tableRow} key={epc}>{magnifiableCell('Asset Code', '—', styles.codeColumn)}{magnifiableCell('Asset Name', 'Unexpected Scan', styles.nameColumn)}<Text style={[styles.statusColumn, styles.statusText]}>Unexpected</Text><Pressable style={styles.epcColumn} onPress={() => setMagnifiedValue({ label: 'EPC', value: epc })}><Text numberOfLines={1} style={styles.epcText}>{epc}</Text></Pressable></View>)}
          </ScrollView>
        </ScrollView>
      </View>
      {result === 'CONFIRMED' && <View style={styles.complete}><Text style={styles.completeTitle}>✓ Issue Confirmed</Text><Text>Assets successfully validated and updated.</Text></View>}
      {result === 'VALIDATING' && <Text style={styles.validating}>Validating with server...</Text>}{error && <Text style={styles.error}>{error}</Text>}{workChanged && <Pressable style={styles.refresh} onPress={() => navigation.goBack()}><Text>Back to refreshed work queue</Text></Pressable>}
    </ScrollView>
    {showScanComplete && <View pointerEvents="none" style={styles.scanCompleteOverlay}><View style={styles.scanCompleteToast}><Text style={styles.scanCompleteText}>✓ Scan Complete</Text></View></View>}
    <Modal transparent animationType="fade" visible={magnifiedValue !== null} onRequestClose={() => setMagnifiedValue(null)}><Pressable style={styles.modalBackdrop} onPress={() => setMagnifiedValue(null)}><Pressable style={styles.valueModal} onPress={event => event.stopPropagation()}><Text style={styles.valueLabel}>{magnifiedValue?.label}</Text><Text style={styles.valueText}>{magnifiedValue?.value}</Text><Pressable style={styles.closeButton} onPress={() => setMagnifiedValue(null)}><Text style={styles.closeButtonText}>Close</Text></Pressable></Pressable></Pressable></Modal>
    <Pressable accessibilityRole="button" disabled={!complete || result === 'VALIDATING'} onPress={result === 'CONFIRMED' ? () => navigation.goBack() : confirm} style={[styles.confirm, (!complete || result === 'VALIDATING') && styles.disabled]}><Text style={styles.confirmText}>{result === 'VALIDATING' ? 'Validating...' : result === 'CONFIRMED' ? 'Done' : 'Confirm'}</Text></Pressable>
  </SafeAreaView>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 20, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, screenTitle: { color: '#0F172A', fontSize: 23, fontWeight: '800' },
  detailCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, gap: 4, backgroundColor: '#FFFFFF' }, jobTitle: { color: '#0F172A', fontSize: 21, fontWeight: '800' }, request: { color: '#64748B', fontSize: 13 }, detailDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', marginVertical: 5 }, detailText: { color: '#334155', fontSize: 14 }, detailLabel: { color: '#0F172A', fontWeight: '700' },
  sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' }, assetsCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, backgroundColor: '#FFFFFF' }, assetsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, filterControl: { flexDirection: 'row', alignItems: 'center', gap: 6 }, filterLabel: { color: '#475569', fontSize: 13, fontWeight: '600' },
  horizontalTable: { minWidth: 610 }, verticalTable: { height: 300, width: 610 }, tableContent: { width: 610 }, tableRow: { flexDirection: 'row', minHeight: 52, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, tableHeader: { minHeight: 44, backgroundColor: '#F8FAFC' }, headerText: { color: '#475569', fontSize: 12, fontWeight: '700', paddingHorizontal: 9 }, cellText: { color: '#334155', fontSize: 12, paddingHorizontal: 9 }, codeColumn: { width: 105 }, nameColumn: { width: 150 }, statusColumn: { width: 115 }, epcColumn: { width: 240 }, statusText: { color: '#475569', fontSize: 12, fontWeight: '600', paddingHorizontal: 9 }, epcText: { color: '#475569', fontSize: 12, paddingHorizontal: 9 }, matchedText: { color: '#27823B', fontWeight: '600' },
  blocked: { borderWidth: 1, borderColor: '#A51D1D', borderRadius: 12, padding: 12, backgroundColor: '#FFFFFF' }, error: { color: '#A51D1D', marginVertical: 6 }, complete: { borderWidth: 1, borderColor: '#27823B', borderRadius: 14, padding: 14, backgroundColor: '#F0FDF4' }, completeTitle: { color: '#27823B', fontSize: 18, fontWeight: '700' }, validating: { fontWeight: '600' }, refresh: { borderWidth: 1, borderColor: '#777', borderRadius: 8, padding: 10, alignItems: 'center' }, confirm: { backgroundColor: '#1F6FEB', padding: 15, alignItems: 'center', marginHorizontal: 16, marginTop: 8, marginBottom: 20, borderRadius: 10 }, disabled: { backgroundColor: '#999' }, confirmText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  scanCompleteOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, scanCompleteToast: { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 16, backgroundColor: '#166534', shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 }, scanCompleteText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' }, modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.45)' }, valueModal: { width: '100%', maxWidth: 420, borderRadius: 16, padding: 20, gap: 14, backgroundColor: '#FFFFFF' }, valueLabel: { color: '#64748B', fontSize: 13, fontWeight: '700' }, valueText: { color: '#0F172A', fontSize: 20, lineHeight: 28 }, closeButton: { alignSelf: 'flex-end', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#1F6FEB' }, closeButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
export default IssueConfirmationScreen;
