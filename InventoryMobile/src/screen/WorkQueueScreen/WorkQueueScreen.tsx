import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { apiErrorMessage } from '../../api/client';
import { getReturnJobs, getSwapTasks, getWorkCounts, ReturnJob, SwapTask, WorkCounts } from '../../api/handheldWork';
import { getPendingIssues, PendingIssue } from '../../api/issueBatches';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'WorkQueueScreen'>;
type Tab = 'PROCESSING' | 'SWAP' | 'RETURN';
type WorkItem = PendingIssue | SwapTask | ReturnJob;

const WorkQueueScreen: React.FC<Props> = ({ navigation }) => {
  const [tab, setTab] = useState<Tab>('PROCESSING');
  const [counts, setCounts] = useState<WorkCounts>({ processing: 0, swap: 0, return: 0 });
  const [processing, setProcessing] = useState<PendingIssue[]>([]);
  const [swaps, setSwaps] = useState<SwapTask[]>([]);
  const [returns, setReturns] = useState<ReturnJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  const tabButton = (label: string, value: Tab, count: number) => (
    <Pressable style={[styles.tab, tab === value && styles.activeTab]} onPress={() => setTab(value)}>
      <Text style={tab === value ? styles.activeText : undefined}>{label}</Text>
      {count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View>}
    </Pressable>
  );
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading work queue...</Text></View>;

  const data: WorkItem[] = tab === 'PROCESSING' ? processing : tab === 'SWAP' ? swaps : returns;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Handheld Work Queue</Text>
      <View style={styles.tabs}>{tabButton('Processing', 'PROCESSING', counts.processing)}{tabButton('Swap', 'SWAP', counts.swap)}{tabButton('Return', 'RETURN', counts.return)}</View>
      {error && <Text style={styles.error}>{error}</Text>}
      {tab === 'PROCESSING' && processing.length > 1 && <Pressable style={styles.secondary} onPress={() => navigation.navigate('ProcessingScanAllScreen')}><Text>Scan All Processing</Text></Pressable>}
      {tab === 'RETURN' && returns.length > 0 && <Pressable style={styles.secondary} onPress={() => navigation.navigate('ReturnScanScreen', {})}><Text>Scan All Returns</Text></Pressable>}
      <FlatList
        data={data}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListEmptyComponent={<Text style={styles.empty}>No pending work</Text>}
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
  container: { flex: 1, padding: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 }, tabs: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  tab: { flex: 1, borderWidth: 1, borderColor: '#888', padding: 9, flexDirection: 'row', justifyContent: 'center', gap: 5 }, activeTab: { backgroundColor: '#333' }, activeText: { color: '#fff' },
  badge: { backgroundColor: '#c62828', borderRadius: 10, minWidth: 20, alignItems: 'center' }, badgeText: { color: '#fff', fontSize: 12 },
  card: { borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 13, marginBottom: 9, gap: 3 }, cardTitle: { fontSize: 17, fontWeight: '700' }, action: { color: '#1f6feb', fontWeight: '700', marginTop: 4 },
  secondary: { borderWidth: 1, borderColor: '#777', padding: 10, alignItems: 'center', marginBottom: 10 }, error: { color: '#a51d1d' }, empty: { color: '#666', textAlign: 'center', padding: 20 },
});
export default WorkQueueScreen;
