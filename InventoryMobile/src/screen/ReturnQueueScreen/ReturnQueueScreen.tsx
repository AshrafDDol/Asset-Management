import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage } from '../../api/client';
import { getReturnJobs, ReturnJob } from '../../api/handheldWork';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'ReturnQueueScreen'>;
const ReturnQueueScreen: React.FC<Props> = ({ navigation }) => {
  const [items, setItems] = useState<ReturnJob[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(''); try { setItems(await getReturnJobs()); } catch (reason) { setError(apiErrorMessage(reason)); } finally { setLoading(false); setRefreshing(false); } }, []);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Return queue...</Text></View>;
  return <View style={styles.container}><View style={styles.header}><View><Text style={styles.title}>Return Queue</Text><Text style={styles.subtitle}>Assets currently issued</Text></View>{items.length > 0 && <Pressable style={styles.secondary} onPress={() => navigation.navigate('ReturnScanScreen', {})}><Text style={styles.secondaryText}>Scan All</Text></Pressable>}</View>{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={items} keyExtractor={item => String(item.id)} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true).catch(() => undefined)} />} ListEmptyComponent={<Text style={styles.empty}>No pending Return work</Text>} renderItem={({ item }) => <Pressable style={styles.card} onPress={() => navigation.navigate('ReturnScanScreen', { issueId: item.id })}><Text style={styles.cardTitle}>{item.jobNo || item.batchNo}</Text><Text>Recipient: {item.defaultRecipient?.fullName || 'Per asset'}</Text><Text>Assets Currently Issued: {item.pendingAssetCount}</Text></Pressable>} /></View>;
};
const styles = StyleSheet.create({ container: { flex: 1, padding: 16, backgroundColor: '#F4F7FB' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, title: { color: '#0F172A', fontSize: 24, fontWeight: '800' }, subtitle: { color: '#64748B', marginTop: 2 }, secondary: { borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#EFF6FF' }, secondaryText: { color: '#1D4ED8', fontWeight: '700' }, card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, marginBottom: 10, gap: 5, backgroundColor: '#FFFFFF' }, cardTitle: { color: '#0F172A', fontSize: 17, fontWeight: '700', marginBottom: 5 }, error: { color: '#A51D1D', marginBottom: 10 }, empty: { color: '#64748B', textAlign: 'center', padding: 24 } });
export default ReturnQueueScreen;
