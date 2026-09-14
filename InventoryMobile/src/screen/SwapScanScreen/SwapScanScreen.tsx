import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { confirmationErrorMessage } from '../../api/client';
import {
  cancelSwap,
  confirmSwap,
  getSwapTask,
  SwapTask,
  verifySwapEpc,
} from '../../api/handheldWork';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'SwapScanScreen'>;
const normalize = (value: string) => value.trim().toUpperCase();

const SwapScanScreen: React.FC<Props> = ({ route, navigation }) => {
  const [task, setTask] = useState<SwapTask | null>(null);
  const [verified, setVerified] = useState({ old: false, replacement: false });
  const [unexpected, setUnexpected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workChanged, setWorkChanged] = useState(false);
  const verificationRef = useRef({ old: false, replacement: false });
  const verificationRequestRef = useRef<'OLD' | 'REPLACEMENT' | null>(null);
  const applyTask = useCallback((nextTask: SwapTask) => {
    const oldEpc = normalize(nextTask.targetItem.asset.epc?.epcCode || '');
    const newEpc = normalize(nextTask.replacementAsset.epc?.epcCode || '');
    const nextVerified = {
      old: Boolean(oldEpc && normalize(nextTask.oldVerifiedEpc || '') === oldEpc),
      replacement: Boolean(newEpc && normalize(nextTask.newVerifiedEpc || '') === newEpc),
    };
    verificationRef.current = nextVerified;
    setVerified(nextVerified);
    setTask(nextTask);
  }, []);
  useEffect(() => {
    getSwapTask(route.params.taskId)
      .then(applyTask)
      .catch(reason => setError(confirmationErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [applyTask, route.params.taskId]);

  const recordVerification = useCallback(async (step: 'OLD' | 'REPLACEMENT', epc: string) => {
    if (!task || verificationRequestRef.current) return;
    verificationRequestRef.current = step;
    try {
      applyTask(await verifySwapEpc(task.id, step, epc));
      setError(null);
    } catch (reason) {
      setError(confirmationErrorMessage(reason));
    } finally {
      verificationRequestRef.current = null;
    }
  }, [applyTask, task]);

  const onTags = useCallback(
    (tags: Array<{ epc: string }>) => {
      if (!task) return;
      const oldEpc = normalize(task.targetItem.asset.epc?.epcCode || '');
      const newEpc = normalize(task.replacementAsset.epc?.epcCode || '');
      for (const tag of tags) {
        const epc = normalize(tag.epc);
        if (!verificationRef.current.old && epc === oldEpc) {
          recordVerification('OLD', epc);
          break;
        }
        if (verificationRef.current.old && !verificationRef.current.replacement && epc === newEpc) {
          recordVerification('REPLACEMENT', epc);
          break;
        }
      }
      setUnexpected(previous => {
        const next = new Set(previous);
        tags.forEach(tag => {
          const epc = normalize(tag.epc);
          if (epc !== oldEpc && epc !== newEpc) next.add(epc);
        });
        return next.size === previous.size ? previous : next;
      });
    },
    [recordVerification, task],
  );
  const noReset = useCallback(() => undefined, []);
  const rfid = useRFIDSession(onTags, noReset, Boolean(task));

  const confirm = async () => {
    if (!task || !verified.old || !verified.replacement || validating) return;
    setValidating(true);
    setError(null);
    setWorkChanged(false);
    try {
      await rfid.stop();
      await confirmSwap(
        task.id,
        normalize(task.targetItem.asset.epc!.epcCode),
        normalize(task.replacementAsset.epc!.epcCode),
      );
      await rfid.release();
      setConfirmed(true);
      setValidating(false);
    } catch (reason) {
      const message = confirmationErrorMessage(reason);
      setWorkChanged(/stale|cancelled|conflict|changed|no longer/i.test(message));
      setError(message);
      setValidating(false);
    }
  };
  const requestCancellation = () => {
    if (validating) return;
    const taskId = task?.id ?? route.params.taskId;
    Alert.alert(
      'Cancel Handheld Swap?',
      'No Asset lifecycle records will be changed.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Swap',
          style: 'destructive',
          onPress: () => {
            setValidating(true);
            setError(null);
            cancelSwap(taskId, 'Cancelled from handheld')
              .then(() => rfid.release())
              .then(() => navigation.goBack())
              .catch(reason => {
                setError(confirmationErrorMessage(reason));
                setValidating(false);
              });
          },
        },
      ],
    );
  };
  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Loading Swap...</Text>
      </View>
    );
  if (!task)
    return (
      <View style={[styles.center, styles.errorState]}>
        <Text style={styles.error}>{error || 'Swap unavailable'}</Text>
        <Pressable onPress={requestCancellation} style={styles.cancel}>
          <Text style={styles.error}>Cancel stale Handheld Swap</Text>
        </Pressable>
      </View>
    );
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>
        {task.issueBatch.jobNo || task.issueBatch.batchNo}
      </Text>
      <Text style={styles.step}>
        {verified.old ? 'Step 2 of 2' : 'Step 1 of 2'}
      </Text>
      {!verified.old ? (
        <>
          <Text style={styles.prompt}>Scan Existing / Old Asset</Text>
          <Asset asset={task.targetItem.asset} />
        </>
      ) : (
        <>
          <Text style={styles.ok}>✓ Existing Asset Verified</Text>
          <Text style={styles.prompt}>Scan Replacement Asset</Text>
          <Asset asset={task.replacementAsset} />
        </>
      )}
      <View style={styles.results}>
        <Text>Old Asset {verified.old ? '✓' : '—'}</Text>
        <Text>Replacement {verified.replacement ? '✓' : '—'}</Text>
        <Pressable
          disabled={validating}
          onPress={() => {
            setLoading(true);
            getSwapTask(task.id)
              .then(applyTask)
              .catch(reason => setError(confirmationErrorMessage(reason)))
              .finally(() => setLoading(false));
          }}>
          <Text style={styles.refreshText}>Refresh shared verification</Text>
        </Pressable>
      </View>
      <Text>
        RFID: {rfid.status} · Trigger: {rfid.trigger} ·{' '}
        {rfid.scanning ? 'Scanning' : 'Stopped'}
      </Text>
      {unexpected.size > 0 && (
        <Text style={styles.warning}>
          {unexpected.size} unexpected EPC warning(s)
        </Text>
      )}
      {(error || rfid.error) && (
        <Text style={styles.error}>{error || rfid.error}</Text>
      )}
      {confirmed && <Text style={styles.ok}>✓ Swap Confirmed</Text>}
      {workChanged && (
        <Pressable style={styles.refresh} onPress={() => navigation.goBack()}>
          <Text>Back to refreshed work queue</Text>
        </Pressable>
      )}
      {!confirmed && (
        <Pressable
          disabled={validating}
          onPress={requestCancellation}
          style={styles.cancel}>
          <Text style={styles.error}>Cancel Handheld Swap</Text>
        </Pressable>
      )}
      <Pressable
        disabled={!verified.old || !verified.replacement || validating}
        onPress={confirmed ? () => navigation.goBack() : confirm}
        style={[
          styles.confirm,
          (!verified.old || !verified.replacement || validating) &&
            styles.disabled,
        ]}
      >
        <Text style={styles.confirmText}>
          {validating
            ? 'Validating with server...'
            : confirmed
            ? 'Done'
            : 'Confirm Swap'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
};

const Asset = ({ asset }: { asset: SwapTask['replacementAsset'] }) => (
  <View style={styles.asset}>
    <Text style={styles.code}>{asset.assetCode}</Text>
    <Text>{asset.itemName}</Text>
    <Text style={styles.epc}>{asset.epc?.epcCode || 'EPC missing'}</Text>
  </View>
);
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorState: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  step: { marginTop: 10, color: '#555' },
  prompt: { fontSize: 20, fontWeight: '700' },
  asset: { borderWidth: 1, borderColor: '#bbb', padding: 12 },
  code: { fontWeight: '700' },
  epc: { color: '#555', fontSize: 12 },
  ok: { color: '#27823b', fontWeight: '700', fontSize: 17 },
  results: { marginVertical: 12, gap: 4 },
  refreshText: { color: '#1f6feb', marginTop: 6 },
  warning: { color: '#8a5a00' },
  error: { color: '#a51d1d' },
  cancel: {
    borderWidth: 1,
    borderColor: '#a51d1d',
    padding: 10,
    alignItems: 'center',
  },
  refresh: {
    borderWidth: 1,
    borderColor: '#777',
    padding: 10,
    alignItems: 'center',
  },
  confirm: {
    marginTop: 'auto',
    backgroundColor: '#1f6feb',
    padding: 14,
    alignItems: 'center',
  },
  disabled: { backgroundColor: '#999' },
  confirmText: { color: '#fff', fontWeight: '700' },
});
export default SwapScanScreen;
