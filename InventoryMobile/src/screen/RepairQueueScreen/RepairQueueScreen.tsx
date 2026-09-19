import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage } from '../../api/client';
import { getRepairTasks, RepairTask } from '../../api/repairs';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'RepairQueueScreen'>;
const duration = (start?: string | null) => {
  if (!start) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};
const friendly = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const RepairQueueScreen: React.FC<Props> = ({ navigation }) => {
  const [items, setItems] = useState<RepairTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [, tick] = useState(0);
  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try { setItems((await getRepairTasks()).filter(item => item.status === 'PENDING')); }
    catch (reason) { setError(apiErrorMessage(reason)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));
  useEffect(() => { const timer = setInterval(() => tick(value => value + 1), 60000); return () => clearInterval(timer); }, []);
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Repair work...</Text></View>;

  return <View style={styles.container}>
    <Text style={styles.title}>Repair</Text>
    <Text style={styles.subtitle}>Pending repair actions</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <FlatList
      data={items}
      keyExtractor={item => String(item.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true).catch(() => undefined)} />}
      ListEmptyComponent={<Text style={styles.empty}>No pending Repair work</Text>}
      renderItem={({ item }) => <Pressable style={styles.card} onPress={() => navigation.navigate('RepairScanScreen', { taskId: item.id })}>
        <Text style={styles.cardTitle}>{item.repair.asset.assetCode}</Text>
        <Text style={styles.assetName}>{item.repair.asset.itemName}</Text>
        <View style={styles.cardDivider} />
        <Text style={styles.action}>{friendly(item.action)}</Text>
        <Text style={styles.location}>{item.repair.repairLocation.name}</Text>
        <Text style={styles.detail}><Text style={styles.detailLabel}>Reason: </Text>{item.repair.reason}</Text>
        {item.action === 'COMPLETE_REPAIR' && <Text style={styles.detail}><Text style={styles.detailLabel}>Current Duration: </Text>{duration(item.repair.startedAt)}</Text>}
      </Pressable>}
    />
  </View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#F4F7FB' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, title: { color: '#0F172A', fontSize: 24, fontWeight: '800' }, subtitle: { color: '#64748B', marginTop: 2, marginBottom: 14 }, error: { color: '#A51D1D', marginBottom: 10 }, empty: { textAlign: 'center', color: '#64748B', padding: 24 },
  card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, marginBottom: 10, gap: 4, backgroundColor: '#FFFFFF' }, cardTitle: { color: '#0F172A', fontSize: 20, fontWeight: '800' }, assetName: { color: '#475569', fontSize: 15 }, cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', marginVertical: 7 }, action: { color: '#0F172A', fontSize: 15, fontWeight: '700' }, location: { color: '#334155', fontSize: 14, marginBottom: 3 }, detail: { color: '#475569', fontSize: 14 }, detailLabel: { color: '#334155', fontWeight: '700' },
});
export default RepairQueueScreen;
