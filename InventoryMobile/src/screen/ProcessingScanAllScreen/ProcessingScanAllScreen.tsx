import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { confirmationErrorMessage } from '../../api/client';
import { confirmHandheldIssue, getHandheldIssue, getPendingIssues, HandheldIssue } from '../../api/issueBatches';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'ProcessingScanAllScreen'>;
type MagnifiedValue = { label: string; value: string };
const normalize = (value: string) => value.trim().toUpperCase();

const ProcessingScanAllScreen: React.FC<Props> = ({ navigation }) => {
  const [issues, setIssues] = useState<HandheldIssue[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [unexpected, setUnexpected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnexpected, setShowUnexpected] = useState(false);
  const [magnifiedValue, setMagnifiedValue] = useState<MagnifiedValue | null>(null);
  const [showScanComplete, setShowScanComplete] = useState(false);
  const completionNotified = useRef(false);

  useEffect(() => { getPendingIssues().then(rows => Promise.all(rows.map(row => getHandheldIssue(row.id)))).then(setIssues).catch(reason => setError(confirmationErrorMessage(reason))).finally(() => setLoading(false)); }, []);
  const items = useMemo(() => issues.flatMap(issue => issue.expectedItems.map(item => ({ issue, item }))), [issues]);
  const expected = useMemo(() => new Map(items.filter(row => row.item.epc).map(row => [normalize(row.item.epc!), row])), [items]);
  const missing = items.filter(row => !row.item.epc);
  const onTags = useCallback((tags: Array<{ epc: string }>) => {
    setMatched(previous => { const next = new Set(previous); tags.forEach(tag => { const epc = normalize(tag.epc); if (expected.has(epc)) next.add(epc); }); return next.size === previous.size ? previous : next; });
    setUnexpected(previous => { const next = new Set(previous); tags.forEach(tag => { const epc = normalize(tag.epc); if (!expected.has(epc)) next.add(epc); }); return next.size === previous.size ? previous : next; });
  }, [expected]);
  const reset = useCallback(() => { setMatched(new Set()); setUnexpected(new Set()); setShowUnexpected(false); completionNotified.current = false; setShowScanComplete(false); setError(null); }, []);
  const rfid = useRFIDSession(onTags, reset, !loading && items.length > 0 && missing.length === 0);
  const complete = items.length > 0 && missing.length === 0 && matched.size === items.length;

  useEffect(() => {
    if (!complete || completionNotified.current || confirmed) return;
    completionNotified.current = true;
    setShowScanComplete(true);
    const timeout = setTimeout(() => setShowScanComplete(false), 500);
    return () => clearTimeout(timeout);
  }, [complete, confirmed]);

  const confirm = async () => {
    if (!complete || validating) return;
    setValidating(true); setError(null);
    try {
      await rfid.stop();
      await Promise.all(issues.map(issue => confirmHandheldIssue(issue.id, issue.expectedItems.map(item => ({ itemId: item.itemId, assetId: item.assetId, assignmentId: item.assignmentId!, epc: normalize(item.epc!) })), Array.from(unexpected))));
      await rfid.release(); setConfirmed(true); setValidating(false);
    } catch (reason) { setError(confirmationErrorMessage(reason)); setValidating(false); }
  };

  const magnifiableCell = (label: string, value: string, style: object, matchedRow = false, unexpectedRow = false) => <Pressable style={style} onPress={() => setMagnifiedValue({ label, value })}><Text numberOfLines={1} style={[styles.cellText, matchedRow && styles.matchedText, unexpectedRow && styles.unexpectedText]}>{value}</Text></Pressable>;
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Asset Issue work...</Text></View>;

  return <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled>
      <View><Text style={styles.title}>Asset Issue</Text><Text style={styles.subtitle}>Scan All</Text></View>
      {missing.length > 0 && <Text style={styles.error}>RFID confirmation blocked: {missing.map(row => row.item.assetCode).join(', ')} need EPC registration.</Text>}
      {(error || rfid.error) && <Text style={styles.error}>{error || rfid.error}</Text>}
      {confirmed && <Text style={styles.ok}>✓ Confirmed</Text>}
      <View style={styles.assetsCard}>
        <View style={styles.assetsHeader}><Text style={styles.sectionTitle}>Assets</Text><View style={styles.filterControl}><Text style={styles.filterLabel}>Filter</Text><Switch value={showUnexpected} onValueChange={setShowUnexpected} trackColor={{ false: '#CBD5E1', true: '#93C5FD' }} thumbColor={showUnexpected ? '#2563EB' : '#F8FAFC'} /></View></View>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.horizontalTable}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.verticalTable} contentContainerStyle={styles.tableContent}>
            <View style={[styles.tableRow, styles.tableHeader]}><Text style={[styles.jobColumn, styles.headerText]}>Job</Text><Text style={[styles.codeColumn, styles.headerText]}>Asset Code</Text><Text style={[styles.nameColumn, styles.headerText]}>Asset Name</Text><Text style={[styles.statusColumn, styles.headerText]}>Status</Text><Text style={[styles.epcColumn, styles.headerText]}>EPC</Text></View>
            {items.map(row => {
              const matchedRow = Boolean(row.item.epc && matched.has(normalize(row.item.epc)));
              const epc = row.item.epc || 'EPC MISSING';
              return <View style={styles.tableRow} key={`${row.issue.id}-${row.item.assetId}`}><Text numberOfLines={1} style={[styles.jobColumn, styles.cellText, matchedRow && styles.matchedText]}>{row.issue.jobNo || row.issue.batchNo}</Text>{magnifiableCell('Asset Code', row.item.assetCode, styles.codeColumn, matchedRow)}{magnifiableCell('Asset Name', row.item.itemName, styles.nameColumn, matchedRow)}<Text style={[styles.statusColumn, styles.statusText, matchedRow && styles.matchedText]}>{matchedRow ? 'Matched' : 'Not Matched'}</Text><Pressable style={styles.epcColumn} onPress={() => setMagnifiedValue({ label: 'EPC', value: epc })}><Text numberOfLines={1} style={[styles.epcText, matchedRow && styles.matchedText]}>{epc}</Text></Pressable></View>;
            })}
            {showUnexpected && Array.from(unexpected).map(epc => <View style={styles.tableRow} key={epc}><Text style={[styles.jobColumn, styles.cellText, styles.unexpectedText]}>—</Text>{magnifiableCell('Asset Code', '—', styles.codeColumn, false, true)}{magnifiableCell('Asset Name', 'Unexpected Scan', styles.nameColumn, false, true)}<Text style={[styles.statusColumn, styles.statusText, styles.unexpectedText]}>Unexpected</Text><Pressable style={styles.epcColumn} onPress={() => setMagnifiedValue({ label: 'EPC', value: epc })}><Text numberOfLines={1} style={[styles.epcText, styles.unexpectedText]}>{epc}</Text></Pressable></View>)}
          </ScrollView>
        </ScrollView>
      </View>
    </ScrollView>
    {showScanComplete && <View pointerEvents="none" style={styles.scanCompleteOverlay}><View style={styles.scanCompleteToast}><Text style={styles.scanCompleteText}>✓ Scan Complete</Text></View></View>}
    <Modal transparent animationType="fade" visible={magnifiedValue !== null} onRequestClose={() => setMagnifiedValue(null)}><Pressable style={styles.modalBackdrop} onPress={() => setMagnifiedValue(null)}><Pressable style={styles.valueModal} onPress={event => event.stopPropagation()}><Text style={styles.valueLabel}>{magnifiedValue?.label}</Text><Text style={styles.valueText}>{magnifiedValue?.value}</Text><Pressable style={styles.closeButton} onPress={() => setMagnifiedValue(null)}><Text style={styles.closeButtonText}>Close</Text></Pressable></Pressable></Pressable></Modal>
    <Pressable disabled={!complete || validating} onPress={confirmed ? () => navigation.goBack() : confirm} style={[styles.confirm, (!complete || validating) && styles.disabled]}><Text style={styles.confirmText}>{validating ? 'Validating with server...' : confirmed ? 'Done' : 'Confirm Asset Issue'}</Text></Pressable>
  </SafeAreaView>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 20, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, title: { color: '#0F172A', fontSize: 23, fontWeight: '800' }, subtitle: { color: '#64748B', fontSize: 13, marginTop: 2 },
  assetsCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, backgroundColor: '#FFFFFF' }, assetsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' }, filterControl: { flexDirection: 'row', alignItems: 'center', gap: 6 }, filterLabel: { color: '#475569', fontSize: 13, fontWeight: '600' },
  horizontalTable: { minWidth: 700 }, verticalTable: { height: 320, width: 700 }, tableContent: { width: 700 }, tableRow: { flexDirection: 'row', minHeight: 52, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, tableHeader: { minHeight: 44, backgroundColor: '#F8FAFC' }, headerText: { color: '#475569', fontSize: 12, fontWeight: '700', paddingHorizontal: 9 }, cellText: { color: '#334155', fontSize: 12, paddingHorizontal: 9 }, jobColumn: { width: 90 }, codeColumn: { width: 105 }, nameColumn: { width: 150 }, statusColumn: { width: 115 }, epcColumn: { width: 240 }, statusText: { color: '#475569', fontSize: 12, fontWeight: '600', paddingHorizontal: 9 }, epcText: { color: '#475569', fontSize: 12, paddingHorizontal: 9 }, matchedText: { color: '#27823B', fontWeight: '600' }, unexpectedText: { color: '#9A6700', fontWeight: '600' },
  ok: { color: '#27823B', fontWeight: '700' }, error: { color: '#A51D1D' }, confirm: { backgroundColor: '#1F6FEB', padding: 15, alignItems: 'center', marginHorizontal: 16, marginTop: 8, marginBottom: 20, borderRadius: 10 }, disabled: { backgroundColor: '#999' }, confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  scanCompleteOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, scanCompleteToast: { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 16, backgroundColor: '#166534', shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 }, scanCompleteText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' }, modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.45)' }, valueModal: { width: '100%', maxWidth: 420, borderRadius: 16, padding: 20, gap: 14, backgroundColor: '#FFFFFF' }, valueLabel: { color: '#64748B', fontSize: 13, fontWeight: '700' }, valueText: { color: '#0F172A', fontSize: 20, lineHeight: 28 }, closeButton: { alignSelf: 'flex-end', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#1F6FEB' }, closeButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
export default ProcessingScanAllScreen;
