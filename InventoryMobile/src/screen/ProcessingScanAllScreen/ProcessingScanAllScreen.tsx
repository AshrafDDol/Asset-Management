import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { confirmationErrorMessage } from '../../api/client';
import { confirmHandheldIssue, ExpectedIssueAsset, getHandheldIssue, getPendingIssues, HandheldIssue } from '../../api/issueBatches';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'ProcessingScanAllScreen'>;
const normalize = (value: string) => value.trim().toUpperCase();

const ProcessingScanAllScreen: React.FC<Props> = ({ navigation }) => {
  const [issues, setIssues] = useState<HandheldIssue[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [unexpected, setUnexpected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getPendingIssues().then(rows => Promise.all(rows.map(row => getHandheldIssue(row.id)))).then(setIssues).catch(reason => setError(confirmationErrorMessage(reason))).finally(() => setLoading(false)); }, []);
  const items = useMemo(() => issues.flatMap(issue => issue.expectedItems.map(item => ({ issue, item }))), [issues]);
  const expected = useMemo(() => new Map(items.filter(row => row.item.epc).map(row => [normalize(row.item.epc!), row])), [items]);
  const missing = items.filter(row => !row.item.epc);
  const onTags = useCallback((tags: Array<{ epc: string }>) => {
    setMatched(previous => { const next = new Set(previous); tags.forEach(tag => { const epc = normalize(tag.epc); if (expected.has(epc)) next.add(epc); }); return next.size === previous.size ? previous : next; });
    setUnexpected(previous => { const next = new Set(previous); tags.forEach(tag => { const epc = normalize(tag.epc); if (!expected.has(epc)) next.add(epc); }); return next.size === previous.size ? previous : next; });
  }, [expected]);
  const reset = useCallback(() => { setMatched(new Set()); setUnexpected(new Set()); setError(null); }, []);
  const rfid = useRFIDSession(onTags, reset, !loading && items.length > 0 && missing.length === 0);
  const complete = items.length > 0 && missing.length === 0 && matched.size === items.length;
  const confirm = async () => {
    if (!complete || validating) return;
    setValidating(true); setError(null);
    try {
      await rfid.stop();
      await Promise.all(issues.map(issue => confirmHandheldIssue(issue.id, issue.expectedItems.map(item => ({ itemId: item.itemId, assetId: item.assetId, assignmentId: item.assignmentId!, epc: normalize(item.epc!) })), Array.from(unexpected))));
      await rfid.release(); setConfirmed(true); setValidating(false);
    } catch (reason) { setError(confirmationErrorMessage(reason)); setValidating(false); }
  };
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Processing work...</Text></View>;
  return <SafeAreaView style={styles.container}><Text style={styles.title}>Scan All Processing</Text><Text>Expected: {items.length}</Text><Text>Matched: {matched.size}</Text><Text>Unexpected: {unexpected.size}</Text><Text>RFID: {rfid.status} · {rfid.scanning ? 'Scanning' : 'Stopped'}</Text>
    {missing.length > 0 && <Text style={styles.error}>RFID confirmation blocked: {missing.map(row => row.item.assetCode).join(', ')} need EPC registration.</Text>}
    {complete && <Text style={styles.ok}>✓ Scan Complete · {matched.size} / {items.length}</Text>}{(error || rfid.error) && <Text style={styles.error}>{error || rfid.error}</Text>}
    {confirmed && <Text style={styles.ok}>✓ Confirmed</Text>}
    <FlatList data={items} keyExtractor={row => `${row.issue.id}-${row.item.assetId}`} renderItem={({ item: row }) => <ProcessingRow issue={row.issue} item={row.item} matched={matched} />} />
    <Pressable disabled={!complete || validating} onPress={confirmed ? () => navigation.goBack() : confirm} style={[styles.confirm, (!complete || validating) && styles.disabled]}><Text style={styles.confirmText}>{validating ? 'Validating with server...' : confirmed ? 'Done' : 'Confirm Processing'}</Text></Pressable>
  </SafeAreaView>;
};
const ProcessingRow = ({ issue, item, matched }: { issue: HandheldIssue; item: ExpectedIssueAsset; matched: Set<string> }) => <View style={styles.row}><Text style={styles.code}>{issue.jobNo || issue.batchNo} · {item.assetCode}</Text><Text>{item.itemName}</Text><Text>{item.epc && matched.has(normalize(item.epc)) ? 'Matched' : 'Not scanned'}</Text></View>;
const styles = StyleSheet.create({ container: { flex: 1, padding: 16, gap: 5 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 22, fontWeight: '700' }, row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' }, code: { fontWeight: '700' }, ok: { color: '#27823b', fontWeight: '700', marginVertical: 8 }, error: { color: '#a51d1d' }, confirm: { backgroundColor: '#1f6feb', padding: 14, alignItems: 'center' }, disabled: { backgroundColor: '#999' }, confirmText: { color: '#fff', fontWeight: '700' } });
export default ProcessingScanAllScreen;
