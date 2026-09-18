import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { apiErrorMessage } from '../../api/client';
import { getPendingIssues, PendingIssue } from '../../api/issueBatches';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'PendingIssuesScreen'>;

const PendingIssuesScreen: React.FC<Props> = ({ navigation }) => {
  const [issues, setIssues] = useState<PendingIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setIssues(await getPendingIssues());
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /><Text>Loading pending issues...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pending Issue &amp; Confirmation</Text>
        <Pressable style={styles.scanAllButton} onPress={() => navigation.navigate('ProcessingScanAllScreen')}>
          <Text style={styles.scanAllText}>Scan All</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={issues}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListEmptyComponent={<Text style={styles.empty}>No pending issues</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('IssueConfirmationScreen', { issueId: item.id })}>
            <Text style={styles.cardTitle}>{item.jobNo || item.batchNo}</Text>
            <Text>To Location: {item.toLocation?.name || 'Per asset'}</Text>
            <Text>Recipient: {item.recipient?.fullName || 'Per asset'}</Text>
            <Text>Expected assets: {item.expectedAssetCount}</Text>
          </Pressable>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  title: { flex: 1, fontSize: 22, fontWeight: '700' },
  scanAllButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#1F6FEB' },
  scanAllText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  card: { borderColor: '#bbb', borderWidth: 1, borderRadius: 6, padding: 14, marginBottom: 10, gap: 3 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  error: { color: '#a51d1d', marginBottom: 10 },
  empty: { color: '#666', paddingVertical: 20, textAlign: 'center' },
});

export default PendingIssuesScreen;
