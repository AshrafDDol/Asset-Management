import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { apiErrorMessage, confirmationErrorMessage } from '../../api/client';
import {
  confirmHandheldIssue,
  ExpectedIssueAsset,
  getHandheldIssue,
  HandheldIssue,
} from '../../api/issueBatches';
import { ScreenStackParamList } from '../../navigation/types';
import IMSRFIDService, { RFIDTriggerEvent } from '../../services/rfid/IMSRFIDService';

type Props = NativeStackScreenProps<ScreenStackParamList, 'IssueConfirmationScreen'>;
type Filter = 'ALL' | 'VALID' | 'UNEXPECTED';
type ResultState = 'SCANNING' | 'VALIDATING' | 'CONFIRMED' | 'ERROR';

const normalizeEpc = (epc: string) => epc.trim().toUpperCase();

const IssueConfirmationScreen: React.FC<Props> = ({ route, navigation }) => {
  const isFocused = useIsFocused();
  const [issue, setIssue] = useState<HandheldIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [rfidStatus, setRfidStatus] = useState('Released');
  const [trigger, setTrigger] = useState<'DOWN' | 'UP'>('UP');
  const [scanning, setScanning] = useState(false);
  const [matchedEpcs, setMatchedEpcs] = useState<Set<string>>(new Set());
  const [unexpectedEpcs, setUnexpectedEpcs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('ALL');
  const [result, setResult] = useState<ResultState>('SCANNING');
  const [error, setError] = useState<string | null>(null);
  const [workChanged, setWorkChanged] = useState(false);
  const mounted = useRef(false);
  const appState = useRef(AppState.currentState);

  const expectedByEpc = useMemo(() => {
    const map = new Map<string, ExpectedIssueAsset>();
    issue?.expectedItems.forEach(item => {
      if (item.epc) map.set(normalizeEpc(item.epc), item);
    });
    return map;
  }, [issue]);
  const missingEpcAssets = useMemo(
    () => issue?.expectedItems.filter(item => !item.epc) ?? [],
    [issue],
  );
  const complete = Boolean(issue) && (issue?.expectedAssetCount ?? 0) > 0 && missingEpcAssets.length === 0 && matchedEpcs.size === issue?.expectedAssetCount;

  useEffect(() => {
    mounted.current = true;
    getHandheldIssue(route.params.issueId)
      .then(value => { if (mounted.current) setIssue(value); })
      .catch(reason => { if (mounted.current) setError(apiErrorMessage(reason)); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [route.params.issueId]);

  const initialize = useCallback(async () => {
    setRfidStatus('Initializing...');
    const ready = await IMSRFIDService.initialize();
    if (mounted.current) setRfidStatus(ready ? 'Ready' : 'Error');
  }, []);

  useEffect(() => {
    const removeTags = IMSRFIDService.onTags(batch => {
      setMatchedEpcs(previous => {
        const next = new Set(previous);
        batch.forEach(tag => {
          const epc = normalizeEpc(tag.epc);
          if (expectedByEpc.has(epc)) next.add(epc);
        });
        return next.size === previous.size ? previous : next;
      });
      setUnexpectedEpcs(previous => {
        const next = new Set(previous);
        batch.forEach(tag => {
          const epc = normalizeEpc(tag.epc);
          if (epc && !expectedByEpc.has(epc)) next.add(epc);
        });
        return next.size === previous.size ? previous : next;
      });
    });
    const removeTrigger = IMSRFIDService.onTrigger((event: RFIDTriggerEvent) => {
      setTrigger(event.action);
      if (event.startsSession) {
        setMatchedEpcs(new Set());
        setUnexpectedEpcs(new Set());
        setFilter('ALL');
        setResult('SCANNING');
        setError(null);
      }
      IMSRFIDService.isScanning().then(setScanning).catch(() => setScanning(false));
    });
    const removeError = IMSRFIDService.onError(setError);
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const previous = appState.current;
      appState.current = next;
      if (previous === 'active' && next !== 'active') {
        setScanning(false);
        setTrigger('UP');
        setRfidStatus('Released');
        IMSRFIDService.release().catch(() => undefined);
      } else if (previous !== 'active' && next === 'active' && isFocused && missingEpcAssets.length === 0 && result !== 'CONFIRMED') {
        initialize().catch(reason => setError(String(reason)));
      }
    });
    return () => {
      subscription.remove();
      removeTags();
      removeTrigger();
      removeError();
    };
  }, [expectedByEpc, initialize, isFocused, missingEpcAssets.length, result]);

  useEffect(() => {
    if (!issue || missingEpcAssets.length > 0 || result === 'CONFIRMED') return;
    if (isFocused && AppState.currentState === 'active') {
      initialize().catch(reason => setError(String(reason)));
    } else {
      setRfidStatus('Released');
      setScanning(false);
      IMSRFIDService.release().catch(() => undefined);
    }
  }, [initialize, isFocused, issue, missingEpcAssets.length, result]);

  useEffect(() => () => { IMSRFIDService.destroy().catch(() => undefined); }, []);

  const confirm = async () => {
    if (!issue || !complete || result === 'VALIDATING' || result === 'CONFIRMED') return;
    setResult('VALIDATING');
    setError(null);
    setWorkChanged(false);
    try {
      await IMSRFIDService.stopScan();
      setScanning(false);
      const matched = issue.expectedItems.map(item => ({
        itemId: item.itemId,
        assetId: item.assetId,
        assignmentId: item.assignmentId!,
        epc: normalizeEpc(item.epc!),
      }));
      await confirmHandheldIssue(issue.id, matched, Array.from(unexpectedEpcs));
      setResult('CONFIRMED');
      setRfidStatus('Released');
      await IMSRFIDService.release();
    } catch (reason) {
      const message = confirmationErrorMessage(reason);
      setResult('ERROR');
      setWorkChanged(/work item changed|pending swap|conflict/i.test(message));
      setError(message);
    }
  };

  const rows = useMemo(() => {
    const expectedRows = (issue?.expectedItems ?? []).map(item => ({ kind: 'EXPECTED' as const, item }));
    const unexpectedRows = Array.from(unexpectedEpcs).map(epc => ({ kind: 'UNEXPECTED' as const, epc }));
    if (filter === 'VALID') return expectedRows;
    if (filter === 'UNEXPECTED') return unexpectedRows;
    return [...expectedRows, ...unexpectedRows];
  }, [filter, issue, unexpectedEpcs]);

  const filterButton = (label: string, value: Filter) => (
    <Pressable style={[styles.filter, filter === value && styles.filterActive]} onPress={() => setFilter(value)}>
      <Text style={filter === value ? styles.filterActiveText : undefined}>{label}</Text>
    </Pressable>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading issue...</Text></View>;
  if (!issue) return <View style={styles.center}><Text style={styles.error}>{error || 'Issue is unavailable'}</Text></View>;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{issue.jobNo || issue.batchNo}</Text>
      <Text>Request: {issue.batchNo}</Text>
      <Text>To Location: {issue.toLocation?.name || 'Per asset'}</Text>
      <Text>Recipient: {issue.recipient?.fullName || 'Per asset'}</Text>
      <View style={styles.summary}>
        <Text>Expected: {issue.expectedAssetCount}</Text>
        <Text>Matched: {matchedEpcs.size}</Text>
        <Text>Unexpected: {unexpectedEpcs.size}</Text>
      </View>
      <Text>RFID: {rfidStatus} · Trigger: {trigger} · {scanning ? 'Scanning' : 'Stopped'}</Text>

      {missingEpcAssets.length > 0 && (
        <View style={styles.blocked}>
          <Text style={styles.error}>RFID confirmation blocked. Register EPCs for:</Text>
          {missingEpcAssets.map(item => <Text key={item.assetId}>{item.assetCode} — {item.itemName}</Text>)}
        </View>
      )}
      {complete && result !== 'CONFIRMED' && (
        <View style={styles.complete}><Text style={styles.completeTitle}>✓ Scan Complete</Text><Text>{matchedEpcs.size} / {issue.expectedAssetCount} expected assets successfully scanned</Text></View>
      )}
      {result === 'CONFIRMED' && (
        <View style={styles.complete}><Text style={styles.completeTitle}>✓ Issue Confirmed</Text><Text>Assets successfully validated and updated.</Text></View>
      )}
      {result === 'VALIDATING' && <Text style={styles.validating}>Validating with server...</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      {workChanged && (
        <Pressable style={styles.refresh} onPress={() => navigation.goBack()}>
          <Text>Back to refreshed work queue</Text>
        </Pressable>
      )}

      <View style={styles.filters}>{filterButton('All', 'ALL')}{filterButton('Valid', 'VALID')}{filterButton('Unexpected', 'UNEXPECTED')}</View>
      <FlatList
        data={rows}
        keyExtractor={row => row.kind === 'EXPECTED' ? `asset-${row.item.assetId}` : `epc-${row.epc}`}
        renderItem={({ item: row }) => row.kind === 'EXPECTED' ? (
          <View style={styles.row}>
            <Text style={styles.assetCode}>{row.item.assetCode}</Text>
            <Text>{row.item.itemName}</Text>
            <Text style={styles.epc}>{row.item.epc || 'EPC MISSING'}</Text>
            <Text>{row.item.epc && matchedEpcs.has(normalizeEpc(row.item.epc)) ? 'Matched' : 'Not scanned'}</Text>
          </View>
        ) : (
          <View style={styles.row}><Text style={styles.unexpected}>{row.epc}</Text><Text style={styles.unexpected}>Unexpected</Text></View>
        )}
      />
      <Pressable
        accessibilityRole="button"
        disabled={!complete || result === 'VALIDATING' || result === 'CONFIRMED'}
        onPress={confirm}
        style={[styles.confirm, (!complete || result === 'VALIDATING' || result === 'CONFIRMED') && styles.disabled]}>
        <Text style={styles.confirmText}>{result === 'VALIDATING' ? 'Validating...' : result === 'CONFIRMED' ? 'Confirmed' : 'Confirm'}</Text>
      </Pressable>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 12 },
  filters: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  filter: { borderWidth: 1, borderColor: '#888', paddingHorizontal: 14, paddingVertical: 8 },
  filterActive: { backgroundColor: '#333' },
  filterActiveText: { color: '#fff' },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc', paddingVertical: 9 },
  assetCode: { fontWeight: '700' },
  epc: { fontSize: 12, color: '#555' },
  unexpected: { color: '#777' },
  blocked: { borderWidth: 1, borderColor: '#a51d1d', padding: 10, marginTop: 10 },
  error: { color: '#a51d1d', marginVertical: 6 },
  complete: { borderWidth: 1, borderColor: '#27823b', padding: 10, marginTop: 10 },
  completeTitle: { color: '#27823b', fontSize: 18, fontWeight: '700' },
  validating: { marginTop: 10, fontWeight: '600' },
  refresh: { borderWidth: 1, borderColor: '#777', padding: 10, alignItems: 'center' },
  confirm: { backgroundColor: '#1f6feb', padding: 14, alignItems: 'center', marginTop: 10 },
  disabled: { backgroundColor: '#999' },
  confirmText: { color: '#fff', fontWeight: '700' },
});

export default IssueConfirmationScreen;
