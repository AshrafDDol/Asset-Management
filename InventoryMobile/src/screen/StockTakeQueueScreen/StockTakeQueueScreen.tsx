import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage } from '../../api/client';
import { getPendingStockTakes, StockTake } from '../../api/stockTakes';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'StockTakeQueueScreen'>;
const StockTakeQueueScreen: React.FC<Props> = ({ navigation }) => {
  const [items, setItems] = useState<StockTake[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(''); try { setItems(await getPendingStockTakes()); } catch (reason) { setError(apiErrorMessage(reason)); } finally { setLoading(false); setRefreshing(false); } }, []);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Stock Takes...</Text></View>;
  return <View style={styles.container}><Text style={styles.title}>Stock Take</Text><Text style={styles.subtitle}>Pending location audit sessions</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={items} keyExtractor={item => String(item.id)} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true).catch(() => undefined)} />} ListEmptyComponent={<Text style={styles.empty}>No pending Stock Takes</Text>} renderItem={({ item }) => <Pressable style={styles.card} onPress={() => navigation.navigate('StockTakeScanScreen', { sessionId: item.id })}><Text style={styles.cardTitle}>{item.stockTakeNo}</Text><Text>Location: {item.location.name} ({item.location.locationCode})</Text><Text>PIC: {item.pic}</Text><Text>Expected: {item.summary.expected}</Text><Text>Status: {item.status}</Text><Text style={styles.action}>Start / Continue Scan</Text></Pressable>} /></View>;
};
const styles = StyleSheet.create({ container: { flex: 1, padding: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, title: { fontSize: 24, fontWeight: '700' }, subtitle: { color: '#555', marginBottom: 12 }, error: { color: '#a51d1d' }, empty: { textAlign: 'center', color: '#666', padding: 24 }, card: { borderWidth: 1, borderColor: '#bbb', borderRadius: 7, padding: 14, marginBottom: 10, gap: 4 }, cardTitle: { fontSize: 18, fontWeight: '700' }, action: { color: '#1f6feb', fontWeight: '700', marginTop: 5 } });
export default StockTakeQueueScreen;
