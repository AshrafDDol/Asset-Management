import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { confirmationErrorMessage } from '../../api/client';
import { cancelSwap, confirmSwap, getSwapTask, SwapTask, verifySwapEpc } from '../../api/handheldWork';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';
import { playAcceptedScanFeedback } from '../../services/feedback/ScanFeedbackService';

type Props = NativeStackScreenProps<ScreenStackParamList, 'SwapScanScreen'>;
const normalize = (value: string) => value.trim().toUpperCase();

const SwapScanScreen: React.FC<Props> = ({ route, navigation }) => {
  const [task, setTask] = useState<SwapTask | null>(null);
  const [verified, setVerified] = useState({ old: false, replacement: false });
  const [, setUnexpected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    getSwapTask(route.params.taskId).then(applyTask).catch(reason => setError(confirmationErrorMessage(reason))).finally(() => setLoading(false));
  }, [applyTask, route.params.taskId]);

  const recordVerification = useCallback(async (step: 'OLD' | 'REPLACEMENT', epc: string) => {
    if (!task || verificationRequestRef.current) return;
    verificationRequestRef.current = step;
    try {
      const wasVerified = step === 'OLD' ? verificationRef.current.old : verificationRef.current.replacement;
      const nextTask = await verifySwapEpc(task.id, step, epc);
      applyTask(nextTask);
      const isVerified = step === 'OLD' ? verificationRef.current.old : verificationRef.current.replacement;
      if (!wasVerified && isVerified) { playAcceptedScanFeedback().catch(() => undefined); }
      setError(null);
    }
    catch (reason) { setError(confirmationErrorMessage(reason)); }
    finally { verificationRequestRef.current = null; }
  }, [applyTask, task]);

  const onTags = useCallback((tags: Array<{ epc: string }>) => {
    if (!task) return;
    const oldEpc = normalize(task.targetItem.asset.epc?.epcCode || '');
    const newEpc = normalize(task.replacementAsset.epc?.epcCode || '');
    for (const tag of tags) {
      const epc = normalize(tag.epc);
      if (!verificationRef.current.old && epc === oldEpc) { recordVerification('OLD', epc); break; }
      if (verificationRef.current.old && !verificationRef.current.replacement && epc === newEpc) { recordVerification('REPLACEMENT', epc); break; }
    }
    setUnexpected(previous => {
      const next = new Set(previous);
      tags.forEach(tag => { const epc = normalize(tag.epc); if (epc !== oldEpc && epc !== newEpc) next.add(epc); });
      return next.size === previous.size ? previous : next;
    });
  }, [recordVerification, task]);
  const noReset = useCallback(() => undefined, []);
  const rfid = useRFIDSession(onTags, noReset, Boolean(task));

  const confirm = async () => {
    if (!task || !verified.old || !verified.replacement || validating) return;
    setValidating(true); setError(null); setWorkChanged(false);
    try {
      await rfid.stop();
      await confirmSwap(task.id, normalize(task.targetItem.asset.epc!.epcCode), normalize(task.replacementAsset.epc!.epcCode));
      await rfid.release(); setConfirmed(true); setValidating(false);
    } catch (reason) {
      const message = confirmationErrorMessage(reason);
      setWorkChanged(/stale|cancelled|conflict|changed|no longer/i.test(message));
      setError(message); setValidating(false);
    }
  };
  const requestCancellation = () => {
    if (validating) return;
    const taskId = task?.id ?? route.params.taskId;
    Alert.alert('Cancel Handheld Swap?', 'No Asset lifecycle records will be changed.', [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel Swap', style: 'destructive', onPress: () => { setValidating(true); setError(null); cancelSwap(taskId, 'Cancelled from handheld').then(() => rfid.release()).then(() => navigation.goBack()).catch(reason => { setError(confirmationErrorMessage(reason)); setValidating(false); }); } }]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Swap...</Text></View>;
  if (!task) return <View style={[styles.center, styles.errorState]}><Text style={styles.error}>{error || 'Swap unavailable'}</Text><Pressable onPress={requestCancellation} style={styles.cancel}><Text style={styles.cancelText}>Cancel stale Handheld Swap</Text></Pressable></View>;
  if (confirmed) return <SafeAreaView style={styles.container}><View style={styles.successState}><Text style={styles.successTitle}>✓ Swap Confirmed</Text></View><Pressable style={styles.confirm} onPress={() => navigation.goBack()}><Text style={styles.confirmText}>Done</Text></Pressable></SafeAreaView>;

  const currentAsset = verified.old ? task.replacementAsset : task.targetItem.asset;
  const currentStep = verified.old ? 'Step 2 of 2' : 'Step 1 of 2';
  const currentHeading = verified.old ? 'Step 2: Scan Replacement Asset' : 'Step 1: Scan Existing Asset';
  const refreshVerification = async () => {
    setRefreshing(true);
    try { applyTask(await getSwapTask(task.id)); setError(null); }
    catch (reason) { setError(confirmationErrorMessage(reason)); }
    finally { setRefreshing(false); }
  };

  return <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refreshVerification().catch(() => undefined)} />}>
      <View style={styles.screenHeader}><Text style={styles.screenTitle}>Swap Verification</Text><View style={[styles.rfidLed, rfid.status === 'Ready' && styles.rfidLedReady]} /></View>
      <View style={styles.headingCard}><Text style={styles.jobTitle}>{task.issueBatch.jobNo || task.issueBatch.batchNo}</Text><Text style={styles.step}>{currentStep}</Text><Text style={styles.stepHeading}>{currentHeading}</Text></View>
      <View style={styles.tableCard}><ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableContent}>
        <View style={styles.tableContent}>
          <View style={[styles.tableRow, styles.tableHeader]}><Text style={[styles.typeColumn, styles.headerText]}>Type</Text><Text style={[styles.codeColumn, styles.headerText]}>Asset Code</Text><Text style={[styles.nameColumn, styles.headerText]}>Asset Name</Text><Text style={[styles.statusColumn, styles.headerText]}>Status</Text></View>
          <VerificationRow type="Existing" asset={task.targetItem.asset} verified={verified.old} />
          <VerificationRow type="Replacement" asset={task.replacementAsset} verified={verified.replacement} />
        </View>
      </ScrollView></View>
      <View style={styles.targetCard}><Text style={styles.cardTitle}>Current Scan Target</Text><Text style={styles.targetCode}>{currentAsset.assetCode}</Text><Text style={styles.targetName}>{currentAsset.itemName}</Text><Text style={styles.targetEpc}>EPC: {currentAsset.epc?.epcCode || 'EPC missing'}</Text></View>
      {(error || rfid.error) && <Text style={styles.error}>{error || rfid.error}</Text>}
      {workChanged && <Pressable style={styles.refresh} onPress={() => navigation.goBack()}><Text>Back to refreshed work queue</Text></Pressable>}
    </ScrollView>
    <View style={styles.actions}><Pressable disabled={validating} onPress={requestCancellation} style={styles.cancel}><Text style={styles.cancelText}>Cancel Handheld Swap</Text></Pressable><Pressable disabled={!verified.old || !verified.replacement || validating} onPress={confirm} style={[styles.confirm, styles.actionConfirm, (!verified.old || !verified.replacement || validating) && styles.disabled]}><Text style={styles.confirmText}>{validating ? 'Validating with server...' : 'Confirm Swap'}</Text></Pressable></View>
  </SafeAreaView>;
};

const VerificationRow = ({ type, asset, verified }: { type: string; asset: SwapTask['replacementAsset']; verified: boolean }) => <View style={styles.tableRow}><Text style={[styles.typeColumn, styles.cellText, verified && styles.verifiedText]}>{type}</Text><Text style={[styles.codeColumn, styles.cellText, verified && styles.verifiedText]}>{asset.assetCode}</Text><Text numberOfLines={1} style={[styles.nameColumn, styles.cellText, verified && styles.verifiedText]}>{asset.itemName}</Text><Text style={[styles.statusColumn, styles.statusText, verified && styles.verifiedText]}>{verified ? 'Verified' : 'Waiting'}</Text></View>;

const styles = StyleSheet.create({
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rfidLed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#94A3B8' }, rfidLedReady: { backgroundColor: '#22C55E' },
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 20, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, errorState: { padding: 20, gap: 12 }, screenTitle: { color: '#0F172A', fontSize: 23, fontWeight: '800' },
  headingCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, gap: 4, backgroundColor: '#FFFFFF' }, jobTitle: { color: '#0F172A', fontSize: 20, fontWeight: '800' }, step: { color: '#64748B', fontSize: 13, marginTop: 3 }, stepHeading: { color: '#0F172A', fontSize: 17, fontWeight: '700' },
  tableCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 12, backgroundColor: '#FFFFFF' }, tableContent: { width: 445 }, tableRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, tableHeader: { minHeight: 44, backgroundColor: '#F8FAFC' }, headerText: { color: '#475569', fontSize: 12, fontWeight: '700', paddingHorizontal: 8 }, cellText: { color: '#334155', fontSize: 12, paddingHorizontal: 8 }, statusText: { color: '#475569', fontSize: 12, fontWeight: '600', paddingHorizontal: 8 }, typeColumn: { width: 95 }, codeColumn: { width: 100 }, nameColumn: { width: 150 }, statusColumn: { width: 100 }, verifiedText: { color: '#27823B', fontWeight: '700' },
  targetCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 15, gap: 4, backgroundColor: '#FFFFFF' }, cardTitle: { color: '#64748B', fontSize: 13, fontWeight: '700', marginBottom: 5 }, targetCode: { color: '#0F172A', fontSize: 18, fontWeight: '800' }, targetName: { color: '#334155', fontSize: 15 }, targetEpc: { color: '#475569', fontSize: 13, marginTop: 4 },
  error: { color: '#A51D1D' }, refresh: { borderWidth: 1, borderColor: '#777', borderRadius: 8, padding: 10, alignItems: 'center' },
  actions: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 10 }, cancel: { borderWidth: 1, borderColor: '#A51D1D', borderRadius: 10, padding: 13, alignItems: 'center', backgroundColor: '#FFFFFF' }, cancelText: { color: '#A51D1D', fontSize: 15, fontWeight: '700' }, confirm: { marginHorizontal: 16, marginBottom: 20, borderRadius: 10, backgroundColor: '#1F6FEB', padding: 15, alignItems: 'center' }, actionConfirm: { marginHorizontal: 0, marginBottom: 0 }, disabled: { backgroundColor: '#999' }, confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, successState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, successTitle: { color: '#27823B', fontSize: 22, fontWeight: '800' },
});
export default SwapScanScreen;
