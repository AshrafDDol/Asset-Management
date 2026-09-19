import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage } from '../../api/client';
import { getPendingStockTakes, StockTake } from '../../api/stockTakes';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'StockTakeQueueScreen'>;
const StockTakeQueueScreen: React.FC<Props> = ({ navigation }) => {
  const [items, setItems] = useState<StockTake[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try { setItems(await getPendingStockTakes()); }
    catch (reason) { setError(apiErrorMessage(reason)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Stock Takes...</Text></View>;

  return <View style={styles.container}>
    <Text style={styles.title}>Stock Take</Text>
    <Text style={styles.subtitle}>Pending location audit sessions</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <FlatList
      data={items}
      keyExtractor={item => String(item.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true).catch(() => undefined)} />}
      ListEmptyComponent={<Text style={styles.empty}>No pending Stock Takes</Text>}
      renderItem={({ item }) => <Pressable style={styles.card} onPress={() => navigation.navigate('StockTakeScanScreen', { sessionId: item.id })}>
        <Text style={styles.cardTitle}>{item.stockTakeNo}</Text>
        <Text style={styles.cardText}><Text style={styles.cardLabel}>Location: </Text>{item.location.name} ({item.location.locationCode})</Text>
        <Text style={styles.cardText}><Text style={styles.cardLabel}>PIC: </Text>{item.pic}</Text>
        <Text style={styles.cardText}><Text style={styles.cardLabel}>Expected Assets: </Text>{item.summary.expected}</Text>
      </Pressable>}
    />
  </View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#F4F7FB' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, title: { color: '#0F172A', fontSize: 24, fontWeight: '800' }, subtitle: { color: '#64748B', marginTop: 2, marginBottom: 14 }, error: { color: '#A51D1D', marginBottom: 10 }, empty: { textAlign: 'center', color: '#64748B', padding: 24 },
  card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, marginBottom: 10, gap: 5, backgroundColor: '#FFFFFF' }, cardTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 5 }, cardText: { color: '#475569', fontSize: 14 }, cardLabel: { color: '#334155', fontWeight: '700' },
});
export default StockTakeQueueScreen;
