import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage } from '../../api/client';
import { getSwapTasks, SwapTask } from '../../api/handheldWork';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'SwapQueueScreen'>;
const SwapQueueScreen: React.FC<Props> = ({ navigation }) => {
  const [items, setItems] = useState<SwapTask[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(''); try { setItems(await getSwapTasks()); } catch (reason) { setError(apiErrorMessage(reason)); } finally { setLoading(false); setRefreshing(false); } }, []);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Swap queue...</Text></View>;
  return <View style={styles.container}><Text style={styles.title}>Swap Queue</Text><Text style={styles.subtitle}>Pending replacement verification</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={items} keyExtractor={item => String(item.id)} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true).catch(() => undefined)} />} ListEmptyComponent={<Text style={styles.empty}>No pending Swap work</Text>} renderItem={({ item }) => <Pressable style={styles.card} onPress={() => navigation.navigate('SwapScanScreen', { taskId: item.id })}><Text style={styles.cardTitle}>{item.issueBatch.jobNo || item.issueBatch.batchNo}</Text><Text>Existing: {item.targetItem.asset.assetCode} · {item.targetItem.asset.itemName}</Text><Text>Replacement: {item.replacementAsset.assetCode} · {item.replacementAsset.itemName}</Text><Text style={styles.action}>Verify Swap</Text></Pressable>} /></View>;
};
const styles = StyleSheet.create({ container: { flex: 1, padding: 16, backgroundColor: '#F4F7FB' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, title: { color: '#0F172A', fontSize: 24, fontWeight: '800' }, subtitle: { color: '#64748B', marginTop: 2, marginBottom: 14 }, card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginBottom: 9, gap: 3, backgroundColor: '#FFFFFF' }, cardTitle: { color: '#0F172A', fontSize: 17, fontWeight: '700' }, action: { color: '#1D4ED8', fontWeight: '700', marginTop: 5 }, error: { color: '#A51D1D', marginBottom: 10 }, empty: { color: '#64748B', textAlign: 'center', padding: 24 } });
export default SwapQueueScreen;
