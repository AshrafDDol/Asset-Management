import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage } from '../../api/client';
import { completeStockTake, getStockTake, StockTake, StockTakeItem } from '../../api/stockTakes';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';
import { playStockTakeFeedback, prepareScanFeedback } from '../../services/feedback/ScanFeedbackService';
import StockTakeSyncService, { StockTakeSyncSnapshot } from '../../services/stockTake/StockTakeSyncService';

type Props = NativeStackScreenProps<ScreenStackParamList, 'StockTakeScanScreen'>;
type MagnifiedValue = { label: string; value: string };
type DisplayRow = { kind: 'expected'; item: StockTakeItem } | { kind: 'unexpected'; epc: string };
const normalize = (value: string) => value.trim().toUpperCase();

const StockTakeRow = memo(({ row, found, confirmed, onMagnify }: { row: DisplayRow; found: boolean; confirmed: boolean; onMagnify: (label: string, value: string) => void }) => {
  if (row.kind === 'unexpected') return <View style={styles.tableRow}>
    <Pressable style={styles.codeColumn} onPress={() => onMagnify('Asset Code', '—')}><Text numberOfLines={1} style={[styles.cellText, styles.unexpectedText]}>—</Text></Pressable>
    <Pressable style={styles.nameColumn} onPress={() => onMagnify('Asset Name', 'Unexpected Scan')}><Text numberOfLines={1} style={[styles.cellText, styles.unexpectedText]}>Unexpected Scan</Text></Pressable>
    <Text style={[styles.statusColumn, styles.statusText, styles.unexpectedText]}>Unexpected</Text>
    <Pressable style={styles.epcColumn} onPress={() => onMagnify('EPC', row.epc)}><Text numberOfLines={1} style={[styles.epcText, styles.unexpectedText]}>{row.epc}</Text></Pressable>
  </View>;
  const epc = row.item.expectedEpc || 'No EPC';
  return <View style={styles.tableRow}>
    <Pressable style={styles.codeColumn} onPress={() => onMagnify('Asset Code', row.item.expectedAssetCode)}><Text numberOfLines={1} style={[styles.cellText, found && styles.foundText]}>{row.item.expectedAssetCode}</Text></Pressable>
    <Pressable style={styles.nameColumn} onPress={() => onMagnify('Asset Name', row.item.expectedItemName)}><Text numberOfLines={1} style={[styles.cellText, found && styles.foundText]}>{row.item.expectedItemName}</Text></Pressable>
    <Text style={[styles.statusColumn, styles.statusText, found && styles.foundText]}>{confirmed ? 'Confirmed' : found ? 'Detected' : 'Missing'}</Text>
    <Pressable style={styles.epcColumn} onPress={() => onMagnify('EPC', epc)}><Text numberOfLines={1} style={[styles.epcText, found && styles.foundText]}>{epc}</Text></Pressable>
  </View>;
});

const StockTakeScanScreen: React.FC<Props> = ({ route, navigation }) => {
  const sessionId = route.params.sessionId;
  const [session, setSession] = useState<StockTake | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showUnexpected, setShowUnexpected] = useState(false);
  const [magnifiedValue, setMagnifiedValue] = useState<MagnifiedValue | null>(null);
  const [locallyFoundIds, setLocallyFoundIds] = useState<Set<number>>(new Set());
  const [confirmedFoundIds, setConfirmedFoundIds] = useState<Set<number>>(new Set());
  const [unexpectedEpcs, setUnexpectedEpcs] = useState<string[]>([]);
  const [sync, setSync] = useState<StockTakeSyncSnapshot>({ pendingCount: 0, syncing: false, error: null });
  const expectedByEpc = useRef(new Map<string, StockTakeItem>());
  const seen = useRef(new Set<string>());
  const generation = useRef(0);
  const feedbackActive = useRef(false);
  const expectedSignature = useRef('');

  const applyAuthoritativeSession = useCallback((next: StockTake, replaceSession: boolean) => {
    const signature = next.items.map(item => `${item.id}:${normalize(item.expectedEpc || '')}`).join('|');
    if (replaceSession || signature !== expectedSignature.current) {
      expectedSignature.current = signature;
      expectedByEpc.current = new Map(next.items.filter(item => Boolean(item.expectedEpc)).map(item => [normalize(item.expectedEpc || ''), item]));
      setSession(next);
    }
    const confirmedIds = new Set(next.items.filter(item => item.result === 'FOUND').map(item => item.id));
    setConfirmedFoundIds(confirmedIds);
    setLocallyFoundIds(previous => new Set([...previous, ...confirmedIds]));
    setUnexpectedEpcs(previous => [...new Set([...previous, ...next.unexpected.map(scan => normalize(scan.epc))])]);
    next.items.forEach(item => { if (item.result === 'FOUND' && item.expectedEpc) seen.current.add(normalize(item.expectedEpc)); });
    next.unexpected.forEach(scan => seen.current.add(normalize(scan.epc)));
  }, []);

  useEffect(() => {
    let active = true;
    const removeSyncListener = StockTakeSyncService.subscribe(sessionId, (snapshot, confirmed) => {
      if (!active) return;
      setSync(snapshot);
      if (confirmed) applyAuthoritativeSession(confirmed, false);
    });
    Promise.all([getStockTake(sessionId), StockTakeSyncService.initialize(sessionId), prepareScanFeedback()])
      .then(([next, syncSnapshot]) => {
        if (!active) return;
        applyAuthoritativeSession(next, true);
        const pendingFound = new Set<number>();
        const pendingUnexpected: string[] = [];
        StockTakeSyncService.getPendingEpcs(sessionId).forEach(epc => {
          seen.current.add(epc);
          const expected = expectedByEpc.current.get(epc);
          if (expected) pendingFound.add(expected.id); else pendingUnexpected.push(epc);
        });
        setLocallyFoundIds(previous => new Set([...previous, ...pendingFound]));
        setUnexpectedEpcs(previous => [...new Set([...previous, ...pendingUnexpected])]);
        setSync(syncSnapshot);
      }).catch(reason => { if (active) setError(apiErrorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    const appStateSubscription = AppState.addEventListener('change', next => {
      if (next !== 'active') {
        feedbackActive.current = false;
        generation.current += 1;
        StockTakeSyncService.persistNow().catch(reason => setError(apiErrorMessage(reason)));
      }
    });
    return () => {
      active = false;
      feedbackActive.current = false;
      generation.current += 1;
      removeSyncListener();
      appStateSubscription.remove();
      StockTakeSyncService.persistNow().catch(() => undefined);
    };
  }, [applyAuthoritativeSession, sessionId]);

  const onNewScanGeneration = useCallback(() => { generation.current += 1; feedbackActive.current = true; }, []);
  const onTriggerEvent = useCallback((action: 'DOWN' | 'UP') => {
    if (action === 'UP') {
      feedbackActive.current = false;
      generation.current += 1;
      StockTakeSyncService.synchronizeNow(sessionId).catch(reason => setError(`Synchronization paused: ${apiErrorMessage(reason)}`));
    }
  }, [sessionId]);
  const onTags = useCallback((tags: Array<{ epc: string }>) => {
    const callbackGeneration = generation.current;
    const unique: string[] = [];
    const foundIds: number[] = [];
    const unexpected: string[] = [];
    tags.forEach(tag => {
      const epc = normalize(tag.epc);
      if (!epc || seen.current.has(epc)) return;
      seen.current.add(epc);
      unique.push(epc);
      const expected = expectedByEpc.current.get(epc);
      if (expected) foundIds.push(expected.id); else unexpected.push(epc);
      playStockTakeFeedback(Boolean(expected), () => feedbackActive.current && generation.current === callbackGeneration).catch(() => undefined);
    });
    if (!unique.length) return;
    if (foundIds.length) setLocallyFoundIds(previous => new Set([...previous, ...foundIds]));
    if (unexpected.length) setUnexpectedEpcs(previous => [...previous, ...unexpected]);
    StockTakeSyncService.enqueue(sessionId, unique).catch(reason => setError(`Detected scans could not all be durably queued: ${apiErrorMessage(reason)}`));
  }, [sessionId]);

  const rfid = useRFIDSession(onTags, onNewScanGeneration, Boolean(session) && (session?.status === 'PENDING' || session?.status === 'IN_PROGRESS'), onTriggerEvent);
  const finish = () => Alert.alert('Complete Stock Take?', 'All pending scans must synchronize before the audit can be finalized.', [{ text: 'Keep Scanning', style: 'cancel' }, { text: 'Complete', onPress: async () => {
    setSubmitting(true); setError(''); feedbackActive.current = false; generation.current += 1;
    try {
      await rfid.stop();
      await StockTakeSyncService.synchronizeNow(sessionId);
      applyAuthoritativeSession(await completeStockTake(sessionId), true);
      await rfid.release();
    } catch (reason) { setError(`Stock Take was not completed. ${apiErrorMessage(reason)}`); }
    finally { setSubmitting(false); }
  } }]);
  const onMagnify = useCallback((label: string, value: string) => setMagnifiedValue({ label, value }), []);
  const rows = useMemo<DisplayRow[]>(() => {
    if (!session) return [];
    const expected: DisplayRow[] = session.items.map(item => ({ kind: 'expected', item }));
    return showUnexpected ? [...expected, ...unexpectedEpcs.map(epc => ({ kind: 'unexpected' as const, epc }))] : expected;
  }, [session, showUnexpected, unexpectedEpcs]);
  const renderRow = useCallback(({ item }: { item: DisplayRow }) => item.kind === 'unexpected'
    ? <StockTakeRow row={item} found={false} confirmed={false} onMagnify={onMagnify} />
    : <StockTakeRow row={item} found={locallyFoundIds.has(item.item.id)} confirmed={confirmedFoundIds.has(item.item.id)} onMagnify={onMagnify} />,
  [confirmedFoundIds, locallyFoundIds, onMagnify]);
  const missingCount = Math.max(0, session ? session.items.length - locallyFoundIds.size : 0);

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Stock Take...</Text></View>;
  if (!session) return <View style={styles.center}><Text style={styles.error}>{error || 'Stock Take unavailable'}</Text></View>;
  if (session.status === 'COMPLETED') return <SafeAreaView style={styles.container}><View style={styles.successState}><Text style={styles.successTitle}>✓ Stock Take Completed</Text></View><Pressable style={styles.complete} onPress={() => navigation.goBack()}><Text style={styles.completeText}>Done</Text></Pressable></SafeAreaView>;

  return <SafeAreaView style={styles.container}>
    <View style={styles.content}>
      <View style={styles.screenHeader}><Text style={styles.screenTitle}>Stock Take Scan</Text><View style={styles.readerStatus}><View style={[styles.rfidLed, rfid.lifecycleStatus === 'SCANNING' && styles.rfidLedScanning, rfid.lifecycleStatus === 'ERROR' && styles.rfidLedError]} /><Text style={styles.readerStatusText}>{rfid.lifecycleStatus}</Text></View></View>
      <View style={styles.detailCard}><Text style={styles.stockTakeNo}>{session.stockTakeNo}</Text><Text numberOfLines={1} style={styles.detailText}><Text style={styles.detailLabel}>Location: </Text>{session.location.name} ({session.location.locationCode})</Text><Text numberOfLines={1} style={styles.detailText}><Text style={styles.detailLabel}>PIC: </Text>{session.pic}</Text></View>
      <View style={styles.progressCard}>
        <View style={styles.progressRow}><View style={styles.progressItem}><Text style={styles.progressLabel}>Expected</Text><Text style={styles.progressValue}>{session.items.length}</Text></View><View style={styles.progressItem}><Text style={styles.progressLabel}>Detected</Text><Text style={styles.progressValue}>{locallyFoundIds.size}</Text></View><View style={styles.progressItem}><Text style={styles.progressLabel}>Pending</Text><Text style={[styles.progressValue, sync.pendingCount > 0 && styles.pendingText]}>{sync.pendingCount}{sync.syncing ? '…' : ''}</Text></View></View>
        <View style={styles.progressRow}><View style={styles.progressItem}><Text style={styles.progressLabel}>Confirmed</Text><Text style={styles.progressValue}>{confirmedFoundIds.size}</Text></View><View style={styles.progressItem}><Text style={styles.progressLabel}>Missing</Text><Text style={styles.progressValue}>{missingCount}</Text></View><View style={styles.progressItem}><Text style={styles.progressLabel}>Unexpected</Text><Text style={styles.progressValue}>{unexpectedEpcs.length}</Text></View></View>
      </View>
      {(error || rfid.error || sync.error) ? <Text style={styles.error}>{error || rfid.error || `Synchronization paused: ${sync.error}`}</Text> : null}
      <View style={styles.assetsCard}>
        <View style={styles.assetsHeader}><Text style={styles.sectionTitle}>Assets</Text><View style={styles.filterControl}><Text style={styles.filterLabel}>Unexpected</Text><Switch value={showUnexpected} onValueChange={setShowUnexpected} /></View></View>
        <ScrollView horizontal nestedScrollEnabled directionalLockEnabled showsHorizontalScrollIndicator style={styles.tableViewport} contentContainerStyle={styles.tableScroller}><View style={styles.tableContent}>
          <View style={[styles.tableRow, styles.tableHeader]}><Text style={[styles.codeColumn, styles.headerText]}>Asset Code</Text><Text style={[styles.nameColumn, styles.headerText]}>Asset Name</Text><Text style={[styles.statusColumn, styles.headerText]}>Status</Text><Text style={[styles.epcColumn, styles.headerText]}>EPC</Text></View>
          <FlatList data={rows} keyExtractor={item => item.kind === 'expected' ? `e-${item.item.id}` : `u-${item.epc}`} renderItem={renderRow} initialNumToRender={16} maxToRenderPerBatch={20} windowSize={7} removeClippedSubviews nestedScrollEnabled showsVerticalScrollIndicator style={styles.virtualTable} contentContainerStyle={styles.tableRows} />
        </View></ScrollView>
      </View>
    </View>
    <Modal transparent animationType="fade" visible={magnifiedValue !== null} onRequestClose={() => setMagnifiedValue(null)}><Pressable style={styles.modalBackdrop} onPress={() => setMagnifiedValue(null)}><Pressable style={styles.valueModal} onPress={event => event.stopPropagation()}><Text style={styles.valueLabel}>{magnifiedValue?.label}</Text><Text style={styles.valueText}>{magnifiedValue?.value}</Text><Pressable style={styles.closeButton} onPress={() => setMagnifiedValue(null)}><Text style={styles.closeButtonText}>Close</Text></Pressable></Pressable></Pressable></Modal>
    <View style={styles.actionBar}><Pressable disabled={submitting} style={[styles.complete, submitting && styles.disabled]} onPress={finish}><Text style={styles.completeText}>{submitting ? 'Synchronizing...' : 'Complete Stock Take'}</Text></Pressable></View>
  </SafeAreaView>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { flex: 1, minHeight: 0, paddingHorizontal: 10, paddingTop: 8, gap: 6 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  screenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 30 }, screenTitle: { color: '#0F172A', fontSize: 21, fontWeight: '800' }, readerStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 }, readerStatusText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  rfidLed: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#94A3B8' }, rfidLedScanning: { backgroundColor: '#22C55E' }, rfidLedError: { backgroundColor: '#DC2626' },
  detailCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 7, gap: 1, backgroundColor: '#FFFFFF' }, stockTakeNo: { color: '#0F172A', fontSize: 16, fontWeight: '800' }, detailText: { color: '#475569', fontSize: 12 }, detailLabel: { color: '#334155', fontWeight: '700' },
  progressCard: { gap: 4, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#EAF2FF' }, progressRow: { flexDirection: 'row', gap: 4 }, progressItem: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.65)' }, progressLabel: { color: '#64748B', fontSize: 10, fontWeight: '700' }, progressValue: { color: '#0F172A', fontSize: 13, fontWeight: '800' }, pendingText: { color: '#9A6700' },
  assetsCard: { flex: 1, minHeight: 220, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 11, paddingHorizontal: 8, paddingTop: 7, paddingBottom: 5, backgroundColor: '#FFFFFF' }, assetsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, marginBottom: 3 }, sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800' }, filterControl: { flexDirection: 'row', alignItems: 'center', gap: 4 }, filterLabel: { color: '#475569', fontSize: 12, fontWeight: '600' },
  tableViewport: { flex: 1, minHeight: 0 }, tableScroller: { flexGrow: 1 }, tableContent: { width: 610, flex: 1, minHeight: 0 }, virtualTable: { flex: 1, width: 610, minHeight: 0 }, tableRows: { flexGrow: 1 }, tableRow: { flexDirection: 'row', minHeight: 44, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, tableHeader: { minHeight: 38, backgroundColor: '#F8FAFC' }, headerText: { color: '#475569', fontSize: 11, fontWeight: '700', paddingHorizontal: 8 }, cellText: { color: '#334155', fontSize: 11, paddingHorizontal: 8 },
  codeColumn: { width: 105 }, nameColumn: { width: 150 }, statusColumn: { width: 115 }, epcColumn: { width: 240 }, statusText: { color: '#475569', fontSize: 12, fontWeight: '600', paddingHorizontal: 9 }, epcText: { color: '#475569', fontSize: 12, paddingHorizontal: 9 }, foundText: { color: '#27823B', fontWeight: '700' }, unexpectedText: { color: '#8A5A00', fontWeight: '700' },
  error: { color: '#A51D1D', fontSize: 12 }, actionBar: { paddingHorizontal: 10, paddingTop: 7, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#CBD5E1', backgroundColor: '#F4F7FB' }, complete: { backgroundColor: '#1F6FEB', borderRadius: 9, paddingVertical: 12, alignItems: 'center' }, disabled: { backgroundColor: '#999' }, completeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, successState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, successTitle: { color: '#27823B', fontSize: 22, fontWeight: '800' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.45)' }, valueModal: { width: '100%', maxWidth: 420, borderRadius: 16, padding: 20, gap: 14, backgroundColor: '#FFFFFF' }, valueLabel: { color: '#64748B', fontSize: 13, fontWeight: '700' }, valueText: { color: '#0F172A', fontSize: 20, lineHeight: 28 }, closeButton: { alignSelf: 'flex-end', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#1F6FEB' }, closeButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
export default StockTakeScanScreen;
