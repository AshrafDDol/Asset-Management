import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { confirmationErrorMessage } from '../../api/client';
import {
  confirmReturns,
  getReturnJobs,
  ReturnItem,
} from '../../api/handheldWork';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'ReturnScanScreen'>;
const normalize = (value: string) => value.trim().toUpperCase();

const ReturnScanScreen: React.FC<Props> = ({ route, navigation }) => {
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [title, setTitle] = useState('Scan All Returns');
  const [loading, setLoading] = useState(true);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [unexpected, setUnexpected] = useState<Set<string>>(new Set());
  const [validating, setValidating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [workChanged, setWorkChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expectedByEpc = useMemo(
    () =>
      new Map(
        items
          .filter(item => item.asset.epc?.epcCode)
          .map(item => [normalize(item.asset.epc!.epcCode), item]),
      ),
    [items],
  );

  useEffect(() => {
    getReturnJobs()
      .then(jobs => {
        const selected = route.params.issueId
          ? jobs.filter(job => job.id === route.params.issueId)
          : jobs;
        setItems(selected.flatMap(job => job.items));
        if (selected.length === 1)
          setTitle(selected[0].jobNo || selected[0].batchNo);
      })
      .catch(reason => setError(confirmationErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [route.params.issueId]);

  const onTags = useCallback(
    (tags: Array<{ epc: string }>) => {
      setMatched(previous => {
        const next = new Set(previous);
        tags.forEach(tag => {
          const epc = normalize(tag.epc);
          if (expectedByEpc.has(epc)) next.add(epc);
        });
        return next.size === previous.size ? previous : next;
      });
      setUnexpected(previous => {
        const next = new Set(previous);
        tags.forEach(tag => {
          const epc = normalize(tag.epc);
          if (!expectedByEpc.has(epc)) next.add(epc);
        });
        return next.size === previous.size ? previous : next;
      });
    },
    [expectedByEpc],
  );
  const reset = useCallback(() => {
    setMatched(new Set());
    setUnexpected(new Set());
    setError(null);
  }, []);
  const rfid = useRFIDSession(onTags, reset, !loading && items.length > 0);

  const confirm = async () => {
    if (!matched.size || validating) return;
    setValidating(true);
    setError(null);
    setWorkChanged(false);
    try {
      await rfid.stop();
      const submitted = Array.from(matched).map(epc => {
        const item = expectedByEpc.get(epc)!;
        return {
          itemId: item.id,
          assignmentId: item.assignment!.id,
          assetId: item.assetId,
          epc,
        };
      });
      const response = await confirmReturns(
        submitted,
        route.params.issueId,
      );
      const failed = response.results.find(row =>
        response.status === 'ALREADY_CONFIRMED'
          ? row.classification !== 'ALREADY_RETURNED'
          : row.classification !== 'RETURNED',
      );
      if (failed)
        throw new Error(
          `Return validation failed for ${
            failed.epc
          }: ${failed.classification.replaceAll('_', ' ')}`,
        );
      await rfid.release();
      setConfirmed(true);
      setValidating(false);
    } catch (reason) {
      const message = confirmationErrorMessage(reason);
      const stale =
        /pending swap|work changed|selected job|no longer|stale|conflict/i.test(
          message,
        );
      setWorkChanged(stale);
      setError(
        stale
          ? `Work item changed\nOne or more assets are now assigned to another workflow. Refresh the work queue before continuing.\n\n${message}`
          : message,
      );
      setValidating(false);
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Loading return work...</Text>
      </View>
    );
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text>{items.length} assets currently pending return</Text>
      <Text style={styles.primaryCount}>
        {matched.size} assets scanned for return
      </Text>
      <Text>{items.length - matched.size} still outstanding</Text>
      <Text style={styles.status}>
        RFID: {rfid.status} · Trigger: {rfid.trigger} ·{' '}
        {rfid.scanning ? 'Scanning' : 'Stopped'}
      </Text>
      {(error || rfid.error) && (
        <Text style={styles.error}>{error || rfid.error}</Text>
      )}
      {workChanged && (
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.refresh}>
          <Text>Back to refreshed work queue</Text>
        </Pressable>
      )}
      {confirmed && (
        <Text style={styles.success}>
          ✓ Return Confirmed · {matched.size} asset(s) returned
        </Text>
      )}
      {unexpected.size > 0 && (
        <Text style={styles.warning}>
          {unexpected.size} unexpected EPC warning(s)
        </Text>
      )}
      <FlatList
        data={items}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => {
          const epc = normalize(item.asset.epc?.epcCode || '');
          const found = matched.has(epc);
          return (
            <View style={styles.row}>
              <Text style={styles.code}>{item.asset.assetCode}</Text>
              <Text>{item.asset.itemName}</Text>
              <Text style={styles.epc}>{epc || 'EPC missing'}</Text>
              <Text>{found ? 'Scanned for return' : 'Outstanding'}</Text>
            </View>
          );
        }}
      />
      <Pressable
        disabled={!matched.size || validating}
        onPress={confirmed ? () => navigation.goBack() : confirm}
        style={[
          styles.confirm,
          (!matched.size || validating) && styles.disabled,
        ]}
      >
        <Text style={styles.confirmText}>
          {validating
            ? 'Validating with server...'
            : confirmed
            ? 'Done'
            : `Confirm Return (${matched.size})`}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  primaryCount: { fontSize: 18, fontWeight: '700', marginTop: 10 },
  status: { marginVertical: 10 },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    paddingVertical: 9,
  },
  code: { fontWeight: '700' },
  epc: { color: '#555', fontSize: 12 },
  error: { color: '#a51d1d' },
  warning: { color: '#8a5a00' },
  refresh: {
    borderWidth: 1,
    borderColor: '#777',
    padding: 10,
    alignItems: 'center',
    marginVertical: 6,
  },
  success: { color: '#27823b', fontWeight: '700', fontSize: 17 },
  confirm: { backgroundColor: '#1f6feb', padding: 14, alignItems: 'center' },
  disabled: { backgroundColor: '#999' },
  confirmText: { color: '#fff', fontWeight: '700' },
});
export default ReturnScanScreen;
