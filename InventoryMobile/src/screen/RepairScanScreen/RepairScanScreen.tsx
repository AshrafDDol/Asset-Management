import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiErrorMessage } from '../../api/client';
import { cancelRepairTask, confirmRepairTask, getRepairTask, RepairTask } from '../../api/repairs';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'RepairScanScreen'>;
const normalize = (value: string) => value.trim().toUpperCase();
const validEpc = (value: string) => /^(?:[0-9A-F]{2})+$/.test(value);
const duration = (start?: string | null) => {
  if (!start) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const RepairScanScreen: React.FC<Props> = ({ route, navigation }) => {
  const [task, setTask] = useState<RepairTask | null>(null);
  const [verified, setVerified] = useState(false);
  const [wrongEpc, setWrongEpc] = useState('');
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => { getRepairTask(route.params.taskId).then(setTask).catch(reason => setError(apiErrorMessage(reason))).finally(() => setLoading(false)); }, [route.params.taskId]);
  useEffect(() => { const timer = setInterval(() => tick(value => value + 1), 60000); return () => clearInterval(timer); }, []);
  const onTags = useCallback((tags: Array<{ epc: string }>) => {
    if (!task || verified) return;
    const expected = normalize(task.repair.asset.epc?.epcCode || '');
    for (const tag of tags) {
      const scanned = normalize(tag.epc);
      if (!validEpc(scanned) || scanned !== expected) { setWrongEpc(scanned); continue; }
      setVerified(true); setWrongEpc(''); setError(''); break;
    }
  }, [task, verified]);
  const noReset = useCallback(() => undefined, []);
  const rfid = useRFIDSession(onTags, noReset, Boolean(task) && !done);
  const confirm = async () => {
    if (!task || !verified || submitting) return;
    setSubmitting(true); setError('');
    try {
      await rfid.stop();
      await confirmRepairTask(task.id, normalize(task.repair.asset.epc!.epcCode), task.action === 'COMPLETE_REPAIR' ? completionRemarks : undefined);
      await rfid.release(); setDone(true);
    } catch (reason) { setError(apiErrorMessage(reason)); setVerified(false); }
    finally { setSubmitting(false); }
  };
  const cancel = () => Alert.alert('Cancel prepared Repair action?', 'Cancelling this pending task does not change Asset status or location.', [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel Task', style: 'destructive', onPress: async () => { setSubmitting(true); try { await cancelRepairTask(route.params.taskId); await rfid.release(); navigation.goBack(); } catch (reason) { setError(apiErrorMessage(reason)); setSubmitting(false); } } }]);

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Repair...</Text></View>;
  if (!task) return <View style={styles.center}><Text style={styles.error}>{error || 'Repair task unavailable'}</Text></View>;
  const isStart = task.action === 'START_REPAIR';
  const finalLabel = isStart ? 'Start Repair' : 'Complete Repair';

  if (done) return <SafeAreaView style={styles.container}><View style={styles.successState}><Text style={styles.successTitle}>✓ {isStart ? 'Repair Started' : 'Repair Completed'}</Text></View><Pressable style={styles.confirm} onPress={() => navigation.goBack()}><Text style={styles.confirmText}>Done</Text></Pressable></SafeAreaView>;

  return <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{finalLabel}</Text>
      <View style={styles.assetCard}>
        <Text style={styles.code}>{task.repair.asset.assetCode}</Text>
        <Text style={styles.assetName}>{task.repair.asset.itemName}</Text>
        <View style={styles.divider} />
        <Text style={styles.fieldLabel}>Repair Location</Text>
        <Text style={styles.fieldValue}>{task.repair.repairLocation.name}</Text>
        <Text style={styles.fieldLabel}>Reason</Text>
        <Text style={styles.fieldValue}>{task.repair.reason}</Text>
        {!isStart && <><Text style={styles.fieldLabel}>Started</Text><Text style={styles.fieldValue}>{task.repair.startedAt ? new Date(task.repair.startedAt).toLocaleString() : '—'}</Text><Text style={styles.fieldLabel}>Duration</Text><Text style={styles.fieldValue}>{duration(task.repair.startedAt)}</Text></>}
      </View>
      <View style={styles.verificationCard}><Text style={styles.verificationLabel}>EPC Verification</Text><Text style={verified ? styles.verified : styles.waiting}>{verified ? '✓ EPC Verified' : 'Waiting for EPC'}</Text></View>
      {wrongEpc ? <Text style={styles.error}>Wrong EPC: {wrongEpc}. Task remains pending.</Text> : null}
      {(error || rfid.error) ? <Text style={styles.error}>{error || rfid.error}</Text> : null}
      {!isStart && <View><Text style={styles.inputLabel}>Completion remarks (optional)</Text><TextInput style={styles.input} value={completionRemarks} onChangeText={setCompletionRemarks} placeholder="Add completion remarks" maxLength={191} multiline /></View>}
    </ScrollView>
    <View style={styles.actions}><Pressable disabled={submitting} onPress={cancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel Prepared Action</Text></Pressable><Pressable disabled={!verified || submitting} onPress={confirm} style={[styles.confirm, styles.actionConfirm, (!verified || submitting) && styles.disabled]}><Text style={styles.confirmText}>{submitting ? 'Revalidating...' : finalLabel}</Text></Pressable></View>
  </SafeAreaView>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 20, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, title: { color: '#0F172A', fontSize: 23, fontWeight: '800' },
  assetCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 15, gap: 5, backgroundColor: '#FFFFFF' }, code: { color: '#0F172A', fontSize: 21, fontWeight: '800' }, assetName: { color: '#475569', fontSize: 15 }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', marginVertical: 7 }, fieldLabel: { color: '#64748B', fontSize: 12, fontWeight: '600', marginTop: 5 }, fieldValue: { color: '#0F172A', fontSize: 15 },
  verificationCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 15, gap: 7, backgroundColor: '#FFFFFF' }, verificationLabel: { color: '#64748B', fontSize: 13, fontWeight: '700' }, waiting: { color: '#334155', fontSize: 17, fontWeight: '600' }, verified: { color: '#27823B', fontSize: 17, fontWeight: '700' }, error: { color: '#A51D1D' }, inputLabel: { color: '#334155', fontSize: 13, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 76, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 11, backgroundColor: '#FFFFFF', textAlignVertical: 'top' },
  actions: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 10 }, cancel: { borderWidth: 1, borderColor: '#A51D1D', borderRadius: 10, padding: 13, alignItems: 'center', backgroundColor: '#FFFFFF' }, cancelText: { color: '#A51D1D', fontSize: 15, fontWeight: '700' }, confirm: { backgroundColor: '#1F6FEB', borderRadius: 10, padding: 15, alignItems: 'center', marginHorizontal: 16, marginBottom: 20 }, actionConfirm: { marginHorizontal: 0, marginBottom: 0 }, disabled: { backgroundColor: '#999' }, confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  successState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, successTitle: { color: '#27823B', fontSize: 22, fontWeight: '800' },
});
export default RepairScanScreen;
