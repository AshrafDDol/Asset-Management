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
      <Text style={styles.title}>Pending Issue &amp; Confirmation</Text>
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
            <Text>Request: {item.batchNo}</Text>
            <Text>To Location: {item.toLocation?.name || 'Per asset'}</Text>
            <Text>Recipient: {item.recipient?.fullName || 'Per asset'}</Text>
            <Text>Expected assets: {item.expectedAssetCount}</Text>
            <Text>Status: {item.status}</Text>
          </Pressable>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  card: { borderColor: '#bbb', borderWidth: 1, borderRadius: 6, padding: 14, marginBottom: 10, gap: 3 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  error: { color: '#a51d1d', marginBottom: 10 },
  empty: { color: '#666', paddingVertical: 20, textAlign: 'center' },
});

export default PendingIssuesScreen;
