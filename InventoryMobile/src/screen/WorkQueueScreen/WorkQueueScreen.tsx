import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiErrorMessage, AUTH_TOKEN_KEY } from '../../api/client';
import { getWorkCounts, WorkCounts } from '../../api/handheldWork';
import { getPendingStockTakes } from '../../api/stockTakes';
import { getRepairTasks } from '../../api/repairs';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'WorkQueueScreen'>;
type Operator = { username: string; roleName: string };
type HomeCounts = WorkCounts & { stockTake: number; repair: number };
const decodeBase64 = (value: string) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0; let bitCount = 0; let decoded = '';
  for (const character of value.split('=')[0]) {
    const digit = alphabet.indexOf(character); if (digit < 0) continue;
    bits = bits * 64 + digit; bitCount += 6;
    if (bitCount >= 8) { bitCount -= 8; const divisor = 2 ** bitCount; decoded += String.fromCharCode(Math.floor(bits / divisor) % 256); bits %= divisor; }
  }
  return decoded;
};

const WorkQueueScreen: React.FC<Props> = ({ navigation }) => {
  const [counts, setCounts] = useState<HomeCounts>({ processing: 0, swap: 0, return: 0, stockTake: 0, repair: 0 });
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState<string | null>(null); const [operator, setOperator] = useState<Operator | null>(null);
  const loadOperator = useCallback(async () => { const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY); if (!token) return; try { const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='); const payload = JSON.parse(decodeBase64(padded)) as Partial<Operator>; if (payload.username) setOperator({ username: payload.username, roleName: payload.roleName || 'Operator' }); } catch { setOperator(null); } }, []);
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(null); try { const [work, stockTakes, repairTasks] = await Promise.all([getWorkCounts(), getPendingStockTakes(), getRepairTasks()]); setCounts({ ...work, stockTake: stockTakes.length, repair: repairTasks.filter(task => task.status === 'PENDING').length }); } catch (reason) { setError(apiErrorMessage(reason)); } finally { setLoading(false); setRefreshing(false); } }, []);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); loadOperator().catch(() => undefined); }, [load, loadOperator]));
  const moduleCard = (label: string, subtitle: string, symbol: string, onPress: () => void, count?: number) => <Pressable style={styles.moduleCard} onPress={onPress}><View style={styles.moduleTopRow}><View style={styles.moduleSymbol}><Text style={styles.symbolText}>{symbol}</Text></View>{!!count && <View style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View>}</View><Text style={styles.moduleTitle}>{label}</Text><Text style={styles.moduleSubtitle}>{subtitle}</Text><Text style={styles.openLabel}>Open</Text></Pressable>;
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading work queue...</Text></View>;
  return <View style={styles.container}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />} contentContainerStyle={styles.content}><View style={styles.hero}><View><Text style={styles.eyebrow}>IMS HANDHELD</Text><Text style={styles.title}>Home</Text><Text style={styles.welcome}>{operator ? `${operator.username} · ${operator.roleName}` : 'Signed-in operator'}</Text></View><Pressable style={styles.refreshButton} disabled={refreshing} onPress={() => load(true)}><Text style={styles.refreshText}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text></Pressable></View>{error && <Text style={styles.error}>{error}</Text>}<Text style={styles.sectionLabel}>WORK AREAS</Text><View style={styles.modules}>{moduleCard('Asset Issue', 'Process prepared jobs', 'AI', () => navigation.navigate('PendingIssuesScreen'), counts.processing)}{moduleCard('Return', 'Receive issued assets', 'RT', () => navigation.navigate('ReturnQueueScreen'), counts.return)}{moduleCard('Swap', 'Verify replacements', 'SW', () => navigation.navigate('SwapQueueScreen'), counts.swap)}{moduleCard('Stock Take', 'Count by location', 'ST', () => navigation.navigate('StockTakeQueueScreen'), counts.stockTake)}{moduleCard('Repair', 'Start or complete repair', 'RP', () => navigation.navigate('RepairQueueScreen'), counts.repair)}</View></ScrollView></View>;
};
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 32 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }, eyebrow: { color: '#64748B', fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: '#0F172A', fontSize: 30, fontWeight: '800' }, welcome: { color: '#475569', marginTop: 3 },
  refreshButton: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FFFFFF' }, refreshText: { color: '#1D4ED8', fontWeight: '700' }, sectionLabel: { color: '#64748B', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 8 }, modules: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moduleCard: { width: '48%', minHeight: 142, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, backgroundColor: '#FFFFFF' }, moduleTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }, moduleSymbol: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E8F0' }, symbolText: { color: '#334155', fontSize: 12, fontWeight: '800' }, moduleTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' }, moduleSubtitle: { color: '#64748B', fontSize: 12, marginTop: 3 }, openLabel: { color: '#2563EB', fontSize: 12, fontWeight: '700', marginTop: 'auto' },
  badge: { backgroundColor: '#DC2626', borderRadius: 12, minWidth: 24, height: 24, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' }, error: { color: '#A51D1D', marginBottom: 12 },
});
export default WorkQueueScreen;
