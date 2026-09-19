import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { confirmationErrorMessage } from '../../api/client';
import { confirmReturns, getReturnJobs, ReturnItem } from '../../api/handheldWork';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';
import { playAcceptedScanFeedback } from '../../services/feedback/ScanFeedbackService';

type Props = NativeStackScreenProps<ScreenStackParamList, 'ReturnScanScreen'>;
type MagnifiedValue = { label: string; value: string };
const normalize = (value: string) => value.trim().toUpperCase();

const ReturnScanScreen: React.FC<Props> = ({ route, navigation }) => {
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [jobTitle, setJobTitle] = useState('');
  const [recipient, setRecipient] = useState('Per asset');
  const [jobByItemId, setJobByItemId] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [unexpected, setUnexpected] = useState<Set<string>>(new Set());
  const [showUnexpected, setShowUnexpected] = useState(false);
  const [magnifiedValue, setMagnifiedValue] = useState<MagnifiedValue | null>(null);
  const [validating, setValidating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [workChanged, setWorkChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedbackAcceptedRef = useRef(new Set<string>());
  const isScanAll = route.params.issueId === undefined;

  const expectedByEpc = useMemo(() => new Map(items.filter(item => item.asset.epc?.epcCode).map(item => [normalize(item.asset.epc!.epcCode), item])), [items]);
  const displayItems = useMemo(() => {
    const selectedIndex = new Map(selectedOrder.map((epc, index) => [epc, index]));
    return items.map((item, originalIndex) => ({ item, originalIndex, selectedIndex: selectedIndex.get(normalize(item.asset.epc?.epcCode || '')) }))
      .sort((a, b) => {
        const aSelected = a.selectedIndex !== undefined;
        const bSelected = b.selectedIndex !== undefined;
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        if (aSelected && bSelected) return a.selectedIndex! - b.selectedIndex!;
        return a.originalIndex - b.originalIndex;
      })
      .map(row => row.item);
  }, [items, selectedOrder]);

  useEffect(() => {
    getReturnJobs().then(jobs => {
      const selected = route.params.issueId ? jobs.filter(job => job.id === route.params.issueId) : jobs;
      setItems(selected.flatMap(job => job.items));
      setJobByItemId(new Map(selected.flatMap(job => job.items.map(item => [item.id, job.jobNo || job.batchNo]))));
      if (selected.length === 1) {
        setJobTitle(selected[0].jobNo || selected[0].batchNo);
        setRecipient(selected[0].defaultRecipient?.fullName || 'Per asset');
      }
    }).catch(reason => setError(confirmationErrorMessage(reason))).finally(() => setLoading(false));
  }, [route.params.issueId]);

  const onTags = useCallback((tags: Array<{ epc: string }>) => {
    const accepted = tags.some(tag => { const epc = normalize(tag.epc); if (!expectedByEpc.has(epc) || feedbackAcceptedRef.current.has(epc)) return false; feedbackAcceptedRef.current.add(epc); return true; });
    if (accepted) playAcceptedScanFeedback().catch(() => undefined);
    setMatched(previous => {
      const next = new Set(previous);
      tags.forEach(tag => { const epc = normalize(tag.epc); if (expectedByEpc.has(epc)) next.add(epc); });
      return next.size === previous.size ? previous : next;
    });
    setSelectedOrder(previous => {
      const next = [...previous];
      tags.forEach(tag => { const epc = normalize(tag.epc); if (expectedByEpc.has(epc) && !next.includes(epc)) next.unshift(epc); });
      return next.length === previous.length ? previous : next;
    });
    setUnexpected(previous => {
      const next = new Set(previous);
      tags.forEach(tag => { const epc = normalize(tag.epc); if (!expectedByEpc.has(epc)) next.add(epc); });
      return next.size === previous.size ? previous : next;
    });
  }, [expectedByEpc]);
  const reset = useCallback(() => { feedbackAcceptedRef.current.clear(); setMatched(new Set()); setSelectedOrder([]); setUnexpected(new Set()); setShowUnexpected(false); setError(null); }, []);
  const rfid = useRFIDSession(onTags, reset, !loading && items.length > 0);

  const confirm = async () => {
    if (!matched.size || validating) return;
    setValidating(true); setError(null); setWorkChanged(false);
    try {
      await rfid.stop();
      const submitted = Array.from(matched).map(epc => {
        const item = expectedByEpc.get(epc)!;
        return { itemId: item.id, assignmentId: item.assignment!.id, assetId: item.assetId, epc };
      });
      const response = await confirmReturns(submitted, route.params.issueId);
      const failed = response.results.find(row => response.status === 'ALREADY_CONFIRMED' ? row.classification !== 'ALREADY_RETURNED' : row.classification !== 'RETURNED');
      if (failed) throw new Error(`Return validation failed for ${failed.epc}: ${failed.classification.replaceAll('_', ' ')}`);
      await rfid.release(); setConfirmed(true); setValidating(false);
    } catch (reason) {
      const message = confirmationErrorMessage(reason);
      const stale = /pending swap|work changed|selected job|no longer|stale|conflict/i.test(message);
      setWorkChanged(stale);
      setError(stale ? `Work item changed\nOne or more assets are now assigned to another workflow. Refresh the work queue before continuing.\n\n${message}` : message);
      setValidating(false);
    }
  };

  const magnifiableCell = (label: string, value: string, style: object, selected = false, warning = false) => <Pressable style={style} onPress={() => setMagnifiedValue({ label, value })}><Text numberOfLines={1} style={[styles.cellText, selected && styles.selectedText, warning && styles.warningText]}>{value}</Text></Pressable>;
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading return work...</Text></View>;

  return <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled>
      <View style={styles.screenHeader}>{isScanAll ? <View><Text style={styles.title}>Return</Text><Text style={styles.subtitle}>Scan All</Text></View> : <Text style={styles.title}>Return Verification</Text>}<View style={[styles.rfidLed, rfid.status === 'Ready' && styles.rfidLedReady]} /></View>
      {!isScanAll && <View style={styles.detailCard}><Text style={styles.jobTitle}>{jobTitle}</Text><Text style={styles.detailText}><Text style={styles.detailLabel}>Recipient: </Text>{recipient}</Text></View>}
      {(error || rfid.error) && <Text style={styles.error}>{error || rfid.error}</Text>}
      {workChanged && <Pressable onPress={() => navigation.goBack()} style={styles.refresh}><Text>Back to refreshed work queue</Text></Pressable>}
      {confirmed && <View style={styles.successCard}><Text style={styles.success}>✓ Return Confirmed</Text><Text>{matched.size} asset(s) returned</Text></View>}
      <View style={styles.assetsCard}>
        <View style={styles.assetsHeader}><Text style={styles.sectionTitle}>Assets</Text><View style={styles.filterControl}><Text style={styles.filterLabel}>Filter</Text><Switch value={showUnexpected} onValueChange={setShowUnexpected} trackColor={{ false: '#CBD5E1', true: '#93C5FD' }} thumbColor={showUnexpected ? '#2563EB' : '#F8FAFC'} /></View></View>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={isScanAll ? styles.scanAllTable : styles.jobTable}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={isScanAll ? styles.scanAllVertical : styles.jobVertical} contentContainerStyle={isScanAll ? styles.scanAllTable : styles.jobTable}>
            <View style={[styles.tableRow, styles.tableHeader]}>{isScanAll && <Text style={[styles.jobColumn, styles.headerText]}>Job</Text>}<Text style={[styles.codeColumn, styles.headerText]}>Asset Code</Text><Text style={[styles.nameColumn, styles.headerText]}>Asset Name</Text><Text style={[styles.statusColumn, styles.headerText]}>Status</Text><Text style={[styles.epcColumn, styles.headerText]}>EPC</Text></View>
            {displayItems.map(item => {
              const epc = normalize(item.asset.epc?.epcCode || '');
              const selected = matched.has(epc);
              const displayEpc = epc || 'EPC missing';
              return <View style={styles.tableRow} key={item.id}>{isScanAll && <Text numberOfLines={1} style={[styles.jobColumn, styles.cellText, selected && styles.selectedText]}>{jobByItemId.get(item.id) || '—'}</Text>}{magnifiableCell('Asset Code', item.asset.assetCode, styles.codeColumn, selected)}{magnifiableCell('Asset Name', item.asset.itemName, styles.nameColumn, selected)}<Text style={[styles.statusColumn, styles.statusText, selected && styles.selectedText]}>{selected ? 'Selected' : 'Outstanding'}</Text><Pressable style={styles.epcColumn} onPress={() => setMagnifiedValue({ label: 'EPC', value: displayEpc })}><Text numberOfLines={1} style={[styles.epcText, selected && styles.selectedText]}>{displayEpc}</Text></Pressable></View>;
            })}
            {showUnexpected && Array.from(unexpected).map(epc => <View style={styles.tableRow} key={epc}>{isScanAll && <Text style={[styles.jobColumn, styles.cellText, styles.warningText]}>—</Text>}{magnifiableCell('Asset Code', '—', styles.codeColumn, false, true)}{magnifiableCell('Asset Name', 'Unexpected Scan', styles.nameColumn, false, true)}<Text style={[styles.statusColumn, styles.statusText, styles.warningText]}>Unexpected</Text><Pressable style={styles.epcColumn} onPress={() => setMagnifiedValue({ label: 'EPC', value: epc })}><Text numberOfLines={1} style={[styles.epcText, styles.warningText]}>{epc}</Text></Pressable></View>)}
          </ScrollView>
        </ScrollView>
      </View>
    </ScrollView>
    <Modal transparent animationType="fade" visible={magnifiedValue !== null} onRequestClose={() => setMagnifiedValue(null)}><Pressable style={styles.modalBackdrop} onPress={() => setMagnifiedValue(null)}><Pressable style={styles.valueModal} onPress={event => event.stopPropagation()}><Text style={styles.valueLabel}>{magnifiedValue?.label}</Text><Text style={styles.valueText}>{magnifiedValue?.value}</Text><Pressable style={styles.closeButton} onPress={() => setMagnifiedValue(null)}><Text style={styles.closeButtonText}>Close</Text></Pressable></Pressable></Pressable></Modal>
    <Pressable disabled={!matched.size || validating} onPress={confirmed ? () => navigation.goBack() : confirm} style={[styles.confirm, (!matched.size || validating) && styles.disabled]}><Text style={styles.confirmText}>{validating ? 'Validating with server...' : confirmed ? 'Done' : `Confirm Return (${matched.size})`}</Text></Pressable>
  </SafeAreaView>;
};

const styles = StyleSheet.create({
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rfidLed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#94A3B8' }, rfidLedReady: { backgroundColor: '#22C55E' },
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 20, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, title: { color: '#0F172A', fontSize: 23, fontWeight: '800' }, subtitle: { color: '#64748B', fontSize: 13, marginTop: 2 },
  detailCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, gap: 5, backgroundColor: '#FFFFFF' }, jobTitle: { color: '#0F172A', fontSize: 21, fontWeight: '800' }, detailText: { color: '#334155', fontSize: 14 }, detailLabel: { color: '#0F172A', fontWeight: '700' },
  assetsCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, backgroundColor: '#FFFFFF' }, assetsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' }, filterControl: { flexDirection: 'row', alignItems: 'center', gap: 6 }, filterLabel: { color: '#475569', fontSize: 13, fontWeight: '600' },
  jobTable: { width: 610 }, scanAllTable: { width: 700 }, jobVertical: { height: 300, width: 610 }, scanAllVertical: { height: 320, width: 700 }, tableRow: { flexDirection: 'row', minHeight: 52, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, tableHeader: { minHeight: 44, backgroundColor: '#F8FAFC' }, headerText: { color: '#475569', fontSize: 12, fontWeight: '700', paddingHorizontal: 9 }, cellText: { color: '#334155', fontSize: 12, paddingHorizontal: 9 }, jobColumn: { width: 90 }, codeColumn: { width: 105 }, nameColumn: { width: 150 }, statusColumn: { width: 115 }, epcColumn: { width: 240 }, statusText: { color: '#475569', fontSize: 12, fontWeight: '600', paddingHorizontal: 9 }, epcText: { color: '#475569', fontSize: 12, paddingHorizontal: 9 }, selectedText: { color: '#27823B', fontWeight: '600' }, warningText: { color: '#8A5A00', fontWeight: '600' },
  error: { color: '#A51D1D' }, refresh: { borderWidth: 1, borderColor: '#777', borderRadius: 8, padding: 10, alignItems: 'center' }, successCard: { borderWidth: 1, borderColor: '#27823B', borderRadius: 14, padding: 14, backgroundColor: '#F0FDF4' }, success: { color: '#27823B', fontWeight: '700', fontSize: 17 }, confirm: { backgroundColor: '#1F6FEB', padding: 15, alignItems: 'center', marginHorizontal: 16, marginTop: 8, marginBottom: 20, borderRadius: 10 }, disabled: { backgroundColor: '#999' }, confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.45)' }, valueModal: { width: '100%', maxWidth: 420, borderRadius: 16, padding: 20, gap: 14, backgroundColor: '#FFFFFF' }, valueLabel: { color: '#64748B', fontSize: 13, fontWeight: '700' }, valueText: { color: '#0F172A', fontSize: 20, lineHeight: 28 }, closeButton: { alignSelf: 'flex-end', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#1F6FEB' }, closeButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
export default ReturnScanScreen;
