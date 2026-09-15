import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage } from '../../api/client';
import { completeStockTake, getStockTake, recordStockTakeScans, StockTake } from '../../api/stockTakes';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'StockTakeScanScreen'>;
const normalize = (value: string) => value.trim().toUpperCase();
const StockTakeScanScreen: React.FC<Props> = ({ route, navigation }) => {
  const [session, setSession] = useState<StockTake | null>(null); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  const seen = useRef(new Set<string>()); const request = useRef(Promise.resolve());
  useEffect(() => { getStockTake(route.params.sessionId).then(next => { setSession(next); next.items.forEach(item => { if (item.result === 'FOUND' && item.expectedEpc) seen.current.add(normalize(item.expectedEpc)); }); next.unexpected.forEach(scan => seen.current.add(normalize(scan.epc))); }).catch(reason => setError(apiErrorMessage(reason))).finally(() => setLoading(false)); }, [route.params.sessionId]);
  const onTags = useCallback((tags: Array<{ epc: string }>) => {
    const unique = tags.map(tag => normalize(tag.epc)).filter(epc => epc && !seen.current.has(epc));
    if (!unique.length) return;
    unique.forEach(epc => seen.current.add(epc));
    request.current = request.current.then(() => recordStockTakeScans(route.params.sessionId, unique)).then(setSession).catch(reason => { unique.forEach(epc => seen.current.delete(epc)); setError(apiErrorMessage(reason)); });
  }, [route.params.sessionId]);
  const noReset = useCallback(() => undefined, []);
  const rfid = useRFIDSession(onTags, noReset, Boolean(session) && (session?.status === 'PENDING' || session?.status === 'IN_PROGRESS'));
  const finish = () => Alert.alert('Complete Stock Take?', 'This only finalizes audit results. No Asset status or location will change.', [{ text: 'Keep Scanning', style: 'cancel' }, { text: 'Complete', onPress: async () => { setSubmitting(true); setError(''); try { await rfid.stop(); await request.current; setSession(await completeStockTake(route.params.sessionId)); await rfid.release(); } catch (reason) { setError(apiErrorMessage(reason)); } finally { setSubmitting(false); } } }]);
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Stock Take...</Text></View>;
  if (!session) return <View style={styles.center}><Text style={styles.error}>{error || 'Stock Take unavailable'}</Text></View>;
  const rows = [...session.items.map(item => ({ key: `e-${item.id}`, code: item.expectedAssetCode, item: `${item.expectedItemName} · ${item.expectedCategoryName}`, epc: item.expectedEpc || 'No EPC', result: item.result })), ...session.unexpected.map(scan => ({ key: `u-${scan.id}`, code: '—', item: 'Unexpected scan', epc: scan.epc, result: 'UNEXPECTED' }))];
  return <SafeAreaView style={styles.container}><Text style={styles.title}>{session.stockTakeNo}</Text><Text>{session.location.name} ({session.location.locationCode})</Text><View style={styles.summary}>{Object.entries(session.summary).map(([key, value]) => <View style={styles.metric} key={key}><Text style={styles.number}>{value}</Text><Text>{key.toUpperCase()}</Text></View>)}</View><Text>RFID: {rfid.status} · {rfid.scanning ? 'Scanning' : 'Stopped'}</Text>{(error || rfid.error) ? <Text style={styles.error}>{error || rfid.error}</Text> : null}<FlatList data={rows} keyExtractor={item => item.key} renderItem={({ item }) => <View style={styles.row}><View style={styles.rowText}><Text style={styles.code}>{item.code}</Text><Text>{item.item}</Text><Text style={styles.epc}>{item.epc}</Text></View><Text style={item.result === 'FOUND' ? styles.found : item.result === 'UNEXPECTED' ? styles.unexpected : styles.missing}>{item.result}</Text></View>} />{session.status === 'COMPLETED' ? <Pressable style={styles.complete} onPress={() => navigation.goBack()}><Text style={styles.completeText}>Done</Text></Pressable> : <Pressable disabled={submitting} style={[styles.complete, submitting && styles.disabled]} onPress={finish}><Text style={styles.completeText}>{submitting ? 'Finalizing...' : 'Complete Stock Take'}</Text></Pressable>}</SafeAreaView>;
};
const styles = StyleSheet.create({ container: { flex: 1, padding: 14, gap: 7 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, title: { fontSize: 22, fontWeight: '700' }, summary: { flexDirection: 'row', gap: 6, marginVertical: 10 }, metric: { flex: 1, borderWidth: 1, borderColor: '#bbb', padding: 7, alignItems: 'center' }, number: { fontSize: 22, fontWeight: '700' }, row: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#ddd', paddingVertical: 9, gap: 8 }, rowText: { flex: 1 }, code: { fontWeight: '700' }, epc: { color: '#555', fontSize: 12 }, found: { color: '#27823b', fontWeight: '700' }, missing: { color: '#a51d1d', fontWeight: '700' }, unexpected: { color: '#8a5a00', fontWeight: '700' }, error: { color: '#a51d1d' }, complete: { backgroundColor: '#1f6feb', padding: 14, alignItems: 'center' }, disabled: { backgroundColor: '#999' }, completeText: { color: '#fff', fontWeight: '700' } });
export default StockTakeScanScreen;
