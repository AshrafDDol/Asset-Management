import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage } from '../../api/client';
import { completeStockTake, getStockTake, recordStockTakeScans, StockTake } from '../../api/stockTakes';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'StockTakeScanScreen'>;
type MagnifiedValue = { label: string; value: string };
const normalize = (value: string) => value.trim().toUpperCase();

const StockTakeScanScreen: React.FC<Props> = ({ route, navigation }) => {
  const [session, setSession] = useState<StockTake | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showUnexpected, setShowUnexpected] = useState(false);
  const [magnifiedValue, setMagnifiedValue] = useState<MagnifiedValue | null>(null);
  const seen = useRef(new Set<string>());
  const request = useRef(Promise.resolve());

  useEffect(() => {
    getStockTake(route.params.sessionId).then(next => {
      setSession(next);
      next.items.forEach(item => { if (item.result === 'FOUND' && item.expectedEpc) seen.current.add(normalize(item.expectedEpc)); });
      next.unexpected.forEach(scan => seen.current.add(normalize(scan.epc)));
    }).catch(reason => setError(apiErrorMessage(reason))).finally(() => setLoading(false));
  }, [route.params.sessionId]);
  const onTags = useCallback((tags: Array<{ epc: string }>) => {
    const unique = tags.map(tag => normalize(tag.epc)).filter(epc => epc && !seen.current.has(epc));
    if (!unique.length) return;
    unique.forEach(epc => seen.current.add(epc));
    request.current = request.current.then(() => recordStockTakeScans(route.params.sessionId, unique)).then(setSession).catch(reason => { unique.forEach(epc => seen.current.delete(epc)); setError(apiErrorMessage(reason)); });
  }, [route.params.sessionId]);
  const noReset = useCallback(() => undefined, []);
  const rfid = useRFIDSession(onTags, noReset, Boolean(session) && (session?.status === 'PENDING' || session?.status === 'IN_PROGRESS'));
  const finish = () => Alert.alert('Complete Stock Take?', 'This will finalize the audit results.\nFound, Missing and Unexpected results will be saved.', [{ text: 'Keep Scanning', style: 'cancel' }, { text: 'Complete', onPress: async () => { setSubmitting(true); setError(''); try { await rfid.stop(); await request.current; setSession(await completeStockTake(route.params.sessionId)); await rfid.release(); } catch (reason) { setError(apiErrorMessage(reason)); } finally { setSubmitting(false); } } }]);

  const magnifiableCell = (label: string, value: string, style: object, found = false, warning = false) => <Pressable style={style} onPress={() => setMagnifiedValue({ label, value })}><Text numberOfLines={1} style={[styles.cellText, found && styles.foundText, warning && styles.unexpectedText]}>{value}</Text></Pressable>;
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Stock Take...</Text></View>;
  if (!session) return <View style={styles.center}><Text style={styles.error}>{error || 'Stock Take unavailable'}</Text></View>;
  if (session.status === 'COMPLETED') return <SafeAreaView style={styles.container}><View style={styles.successState}><Text style={styles.successTitle}>✓ Stock Take Completed</Text></View><Pressable style={styles.complete} onPress={() => navigation.goBack()}><Text style={styles.completeText}>Done</Text></Pressable></SafeAreaView>;

  return <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled>
      <Text style={styles.screenTitle}>Stock Take Scan</Text>
      <View style={styles.detailCard}><Text style={styles.stockTakeNo}>{session.stockTakeNo}</Text><View style={styles.divider} /><Text style={styles.detailText}><Text style={styles.detailLabel}>Location: </Text>{session.location.name} ({session.location.locationCode})</Text><Text style={styles.detailText}><Text style={styles.detailLabel}>PIC: </Text>{session.pic}</Text></View>
      {(error || rfid.error) ? <Text style={styles.error}>{error || rfid.error}</Text> : null}
      <View style={styles.assetsCard}>
        <View style={styles.assetsHeader}><Text style={styles.sectionTitle}>Assets</Text><View style={styles.filterControl}><Text style={styles.filterLabel}>Filter</Text><Switch value={showUnexpected} onValueChange={setShowUnexpected} trackColor={{ false: '#CBD5E1', true: '#93C5FD' }} thumbColor={showUnexpected ? '#2563EB' : '#F8FAFC'} /></View></View>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableContent}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.verticalTable} contentContainerStyle={styles.tableContent}>
            <View style={[styles.tableRow, styles.tableHeader]}><Text style={[styles.codeColumn, styles.headerText]}>Asset Code</Text><Text style={[styles.nameColumn, styles.headerText]}>Asset Name</Text><Text style={[styles.statusColumn, styles.headerText]}>Status</Text><Text style={[styles.epcColumn, styles.headerText]}>EPC</Text></View>
            {session.items.map(item => {
              const found = item.result === 'FOUND';
              const epc = item.expectedEpc || 'No EPC';
              return <View style={styles.tableRow} key={`e-${item.id}`}>{magnifiableCell('Asset Code', item.expectedAssetCode, styles.codeColumn, found)}{magnifiableCell('Asset Name', item.expectedItemName, styles.nameColumn, found)}<Text style={[styles.statusColumn, styles.statusText, found && styles.foundText]}>{found ? 'Found' : 'Missing'}</Text><Pressable style={styles.epcColumn} onPress={() => setMagnifiedValue({ label: 'EPC', value: epc })}><Text numberOfLines={1} style={[styles.epcText, found && styles.foundText]}>{epc}</Text></Pressable></View>;
            })}
            {showUnexpected && session.unexpected.map(scan => <View style={styles.tableRow} key={`u-${scan.id}`}>{magnifiableCell('Asset Code', '—', styles.codeColumn, false, true)}{magnifiableCell('Asset Name', 'Unexpected Scan', styles.nameColumn, false, true)}<Text style={[styles.statusColumn, styles.statusText, styles.unexpectedText]}>Unexpected</Text><Pressable style={styles.epcColumn} onPress={() => setMagnifiedValue({ label: 'EPC', value: scan.epc })}><Text numberOfLines={1} style={[styles.epcText, styles.unexpectedText]}>{scan.epc}</Text></Pressable></View>)}
          </ScrollView>
        </ScrollView>
      </View>
    </ScrollView>
    <Modal transparent animationType="fade" visible={magnifiedValue !== null} onRequestClose={() => setMagnifiedValue(null)}><Pressable style={styles.modalBackdrop} onPress={() => setMagnifiedValue(null)}><Pressable style={styles.valueModal} onPress={event => event.stopPropagation()}><Text style={styles.valueLabel}>{magnifiedValue?.label}</Text><Text style={styles.valueText}>{magnifiedValue?.value}</Text><Pressable style={styles.closeButton} onPress={() => setMagnifiedValue(null)}><Text style={styles.closeButtonText}>Close</Text></Pressable></Pressable></Pressable></Modal>
    <Pressable disabled={submitting} style={[styles.complete, submitting && styles.disabled]} onPress={finish}><Text style={styles.completeText}>{submitting ? 'Finalizing...' : 'Complete Stock Take'}</Text></Pressable>
  </SafeAreaView>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 20, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, screenTitle: { color: '#0F172A', fontSize: 23, fontWeight: '800' },
  detailCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, gap: 5, backgroundColor: '#FFFFFF' }, stockTakeNo: { color: '#0F172A', fontSize: 20, fontWeight: '800' }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', marginVertical: 6 }, detailText: { color: '#475569', fontSize: 14 }, detailLabel: { color: '#334155', fontWeight: '700' },
  assetsCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, backgroundColor: '#FFFFFF' }, assetsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' }, filterControl: { flexDirection: 'row', alignItems: 'center', gap: 6 }, filterLabel: { color: '#475569', fontSize: 13, fontWeight: '600' },
  tableContent: { width: 610 }, verticalTable: { height: 310, width: 610 }, tableRow: { flexDirection: 'row', minHeight: 52, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, tableHeader: { minHeight: 44, backgroundColor: '#F8FAFC' }, headerText: { color: '#475569', fontSize: 12, fontWeight: '700', paddingHorizontal: 9 }, cellText: { color: '#334155', fontSize: 12, paddingHorizontal: 9 }, codeColumn: { width: 105 }, nameColumn: { width: 150 }, statusColumn: { width: 115 }, epcColumn: { width: 240 }, statusText: { color: '#475569', fontSize: 12, fontWeight: '600', paddingHorizontal: 9 }, epcText: { color: '#475569', fontSize: 12, paddingHorizontal: 9 }, foundText: { color: '#27823B', fontWeight: '700' }, unexpectedText: { color: '#8A5A00', fontWeight: '700' },
  error: { color: '#A51D1D' }, complete: { backgroundColor: '#1F6FEB', borderRadius: 10, padding: 15, alignItems: 'center', marginHorizontal: 16, marginTop: 8, marginBottom: 20 }, disabled: { backgroundColor: '#999' }, completeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, successState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, successTitle: { color: '#27823B', fontSize: 22, fontWeight: '800' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.45)' }, valueModal: { width: '100%', maxWidth: 420, borderRadius: 16, padding: 20, gap: 14, backgroundColor: '#FFFFFF' }, valueLabel: { color: '#64748B', fontSize: 13, fontWeight: '700' }, valueText: { color: '#0F172A', fontSize: 20, lineHeight: 28 }, closeButton: { alignSelf: 'flex-end', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#1F6FEB' }, closeButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
export default StockTakeScanScreen;
