import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiErrorMessage, AUTH_TOKEN_KEY } from '../../api/client';
import { getReturnJobs, getSwapTasks, getWorkCounts, ReturnJob, SwapTask, WorkCounts } from '../../api/handheldWork';
import { getPendingIssues, PendingIssue } from '../../api/issueBatches';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'WorkQueueScreen'>;
type Tab = 'PROCESSING' | 'SWAP' | 'RETURN';
type WorkItem = PendingIssue | SwapTask | ReturnJob;
type Operator = { username: string; roleName: string };
const decodeBase64 = (value: string) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0; let bitCount = 0; let decoded = '';
  for (const character of value.split('=')[0]) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) continue;
    bits = bits * 64 + digit; bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      const divisor = 2 ** bitCount;
      decoded += String.fromCharCode(Math.floor(bits / divisor) % 256);
      bits %= divisor;
    }
  }
  return decoded;
};

const WorkQueueScreen: React.FC<Props> = ({ navigation }) => {
  const [tab, setTab] = useState<Tab>('PROCESSING');
  const [counts, setCounts] = useState<WorkCounts>({ processing: 0, swap: 0, return: 0 });
  const [processing, setProcessing] = useState<PendingIssue[]>([]);
  const [swaps, setSwaps] = useState<SwapTask[]>([]);
  const [returns, setReturns] = useState<ReturnJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);

  const loadOperator = useCallback(async () => {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    try {
      const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
      const payload = JSON.parse(decodeBase64(padded)) as Partial<Operator>;
      if (payload.username) setOperator({ username: payload.username, roleName: payload.roleName || 'Operator' });
    } catch {
      setOperator(null);
    }
  }, []);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [nextCounts, nextProcessing, nextSwaps, nextReturns] = await Promise.all([
        getWorkCounts(), getPendingIssues(), getSwapTasks(), getReturnJobs(),
      ]);
      setCounts(nextCounts); setProcessing(nextProcessing); setSwaps(nextSwaps); setReturns(nextReturns);
    } catch (reason) { setError(apiErrorMessage(reason)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    load().catch(() => undefined);
    loadOperator().catch(() => undefined);
  }, [load, loadOperator]));

  const moduleCard = (label: string, subtitle: string, symbol: string, onPress: () => void, count?: number, selected = false) => (
    <Pressable style={[styles.moduleCard, selected && styles.selectedModule]} onPress={onPress}>
      <View style={styles.moduleTopRow}>
        <View style={[styles.moduleSymbol, selected && styles.selectedSymbol]}><Text style={[styles.symbolText, selected && styles.selectedSymbolText]}>{symbol}</Text></View>
        {!!count && <View style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View>}
      </View>
      <Text style={styles.moduleTitle}>{label}</Text>
      <Text style={styles.moduleSubtitle}>{subtitle}</Text>
      <Text style={styles.openLabel}>{selected ? 'Current queue' : 'Open'}</Text>
    </Pressable>
  );
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading work queue...</Text></View>;

  const data: WorkItem[] = tab === 'PROCESSING' ? processing : tab === 'SWAP' ? swaps : returns;
  const queueTitle = tab === 'PROCESSING' ? 'Asset Issue Queue' : tab === 'SWAP' ? 'Swap Queue' : 'Return Queue';
  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
          <View style={styles.hero}>
            <View><Text style={styles.eyebrow}>IMS HANDHELD</Text><Text style={styles.title}>Home</Text><Text style={styles.welcome}>{operator ? `${operator.username} · ${operator.roleName}` : 'Signed-in operator'}</Text></View>
            <Pressable style={styles.refreshButton} disabled={refreshing} onPress={() => load(true)}><Text style={styles.refreshText}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text></Pressable>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <Text style={styles.sectionLabel}>WORK AREAS</Text>
          <View style={styles.modules}>
            {moduleCard('Asset Issue', 'Process prepared jobs', 'AI', () => setTab('PROCESSING'), counts.processing, tab === 'PROCESSING')}
            {moduleCard('Return', 'Receive issued assets', 'RT', () => setTab('RETURN'), counts.return, tab === 'RETURN')}
            {moduleCard('Swap', 'Verify replacements', 'SW', () => setTab('SWAP'), counts.swap, tab === 'SWAP')}
            {moduleCard('Stock Take', 'Count by location', 'ST', () => navigation.navigate('StockTakeQueueScreen'))}
            {moduleCard('Repair', 'Start or complete repair', 'RP', () => navigation.navigate('RepairQueueScreen'))}
          </View>
          <View style={styles.queueHeader}><View><Text style={styles.sectionLabel}>CURRENT WORK</Text><Text style={styles.queueTitle}>{queueTitle}</Text></View>{tab === 'PROCESSING' && processing.length > 1 && <Pressable style={styles.secondary} onPress={() => navigation.navigate('ProcessingScanAllScreen')}><Text style={styles.secondaryText}>Scan All</Text></Pressable>}{tab === 'RETURN' && returns.length > 0 && <Pressable style={styles.secondary} onPress={() => navigation.navigate('ReturnScanScreen', {})}><Text style={styles.secondaryText}>Scan All</Text></Pressable>}</View>
        </>}
        ListEmptyComponent={<Text style={styles.empty}>No pending work in this queue</Text>}
        renderItem={({ item }) => {
          if (tab === 'PROCESSING') {
            const job = item as unknown as PendingIssue;
            return <Pressable style={styles.card} onPress={() => navigation.navigate('IssueConfirmationScreen', { issueId: job.id })}><Text style={styles.cardTitle}>{job.jobNo || job.batchNo}</Text><Text>Recipient: {job.recipient?.fullName || 'Per asset'}</Text><Text>To Location: {job.toLocation?.name || 'Per asset'}</Text><Text>{job.expectedAssetCount} assets pending</Text><Text style={styles.action}>Scan</Text></Pressable>;
          }
          if (tab === 'SWAP') {
            const task = item as unknown as SwapTask;
            return <Pressable style={styles.card} onPress={() => navigation.navigate('SwapScanScreen', { taskId: task.id })}><Text style={styles.cardTitle}>{task.issueBatch.jobNo || task.issueBatch.batchNo}</Text><Text>Existing: {task.targetItem.asset.assetCode} · {task.targetItem.asset.itemName}</Text><Text>Replacement: {task.replacementAsset.assetCode} · {task.replacementAsset.itemName}</Text><Text style={styles.action}>Verify Swap</Text></Pressable>;
          }
          const job = item as unknown as ReturnJob;
          return <Pressable style={styles.card} onPress={() => navigation.navigate('ReturnScanScreen', { issueId: job.id })}><Text style={styles.cardTitle}>{job.jobNo || job.batchNo}</Text><Text>Recipient: {job.defaultRecipient?.fullName || 'Per asset'}</Text><Text>{job.pendingAssetCount} assets currently issued</Text><Text style={styles.action}>Scan Returns</Text></Pressable>;
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 32 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }, eyebrow: { color: '#64748B', fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: '#0F172A', fontSize: 30, fontWeight: '800' }, welcome: { color: '#475569', marginTop: 3 },
  refreshButton: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FFFFFF' }, refreshText: { color: '#1D4ED8', fontWeight: '700' },
  sectionLabel: { color: '#64748B', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 8 }, modules: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  moduleCard: { width: '48%', minHeight: 142, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, backgroundColor: '#FFFFFF' }, selectedModule: { borderColor: '#93C5FD', backgroundColor: '#EFF6FF' }, moduleTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  moduleSymbol: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E8F0' }, selectedSymbol: { backgroundColor: '#2563EB' }, symbolText: { color: '#334155', fontSize: 12, fontWeight: '800' }, selectedSymbolText: { color: '#FFFFFF' },
  moduleTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' }, moduleSubtitle: { color: '#64748B', fontSize: 12, marginTop: 3 }, openLabel: { color: '#2563EB', fontSize: 12, fontWeight: '700', marginTop: 'auto' },
  badge: { backgroundColor: '#DC2626', borderRadius: 12, minWidth: 24, height: 24, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  queueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, queueTitle: { color: '#0F172A', fontSize: 21, fontWeight: '800' },
  card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginBottom: 9, gap: 3, backgroundColor: '#FFFFFF' }, cardTitle: { color: '#0F172A', fontSize: 17, fontWeight: '700' }, action: { color: '#1D4ED8', fontWeight: '700', marginTop: 5 },
  secondary: { borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#EFF6FF' }, secondaryText: { color: '#1D4ED8', fontWeight: '700' }, error: { color: '#A51D1D', marginBottom: 12 }, empty: { color: '#64748B', textAlign: 'center', padding: 24, backgroundColor: '#FFFFFF', borderRadius: 12 },
});
export default WorkQueueScreen;
