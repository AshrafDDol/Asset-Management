import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { apiErrorMessage } from '../../api/client';
import { FindAssetResult, searchFindAssets } from '../../api/assets';
import { useRFIDSession } from '../../hooks/useRFIDSession';
import { playFindAssetBeep, playFindAssetStartVibration } from '../../services/feedback/ScanFeedbackService';
import {
  AudioSignalSnapshot,
  beepIntervalForCategory,
  FIND_ASSET_AUDIO_EVALUATION_MS,
  FIND_ASSET_RENDER_INTERVAL_MS,
  FIND_ASSET_SCANNING_BEEP_MS,
  FIND_ASSET_STALE_MS,
  FindAssetAudioFilter,
  FindAssetSignalTracker,
  freshnessForReading,
  isFindAssetFeedbackActive,
  ProximityBeepScheduler,
  ProximityReading,
  visualSignalForReading,
} from '../../services/rfid/FindAssetProximity';
import IMSRFIDService from '../../services/rfid/IMSRFIDService';
import { RFIDTag } from '../../types/RFIDTag';

const SEARCH_DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 2;
const normalizeEpc = (value: string): string => value.trim().toUpperCase();
const locationLabel = (asset: FindAssetResult): string =>
  asset.locationPath || (asset.location ? `${asset.location.name} (${asset.location.locationCode})` : 'No recorded location');

const FindAssetScreen: React.FC = () => {
  const isFocused = useIsFocused();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FindAssetResult[]>([]);
  const [selected, setSelected] = useState<FindAssetResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('Enter at least 2 characters.');
  const [reading, setReading] = useState<ProximityReading | null>(null);
  const [audioSignal, setAudioSignal] = useState<AudioSignalSnapshot | null>(null);
  const [freshness, setFreshness] = useState<'LIVE' | 'UNCERTAIN' | 'NO SIGNAL'>('NO SIGNAL');
  const [manualIntent, setManualIntent] = useState(false);
  const [manualLifecycle, setManualLifecycle] = useState<'STARTING' | 'SCANNING' | 'STOPPING' | null>(null);
  const trackerRef = useRef(new FindAssetSignalTracker());
  const audioFilterRef = useRef(new FindAssetAudioFilter());
  const latestReadingRef = useRef<ProximityReading | null>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestIdRef = useRef(0);
  const feedbackGenerationRef = useRef(0);
  const acceptingRef = useRef(false);
  const previousScanningRef = useRef(false);
  const manualIntentRef = useRef(false);
  const manualCommandRef = useRef(0);
  const beepIntervalRef = useRef(FIND_ASSET_SCANNING_BEEP_MS);
  const beepSchedulerRef = useRef(
    new ProximityBeepScheduler(playFindAssetBeep, () => beepIntervalRef.current),
  );
  const lastObservationAtRef = useRef<number | null>(null);
  const longestObservationGapRef = useRef(0);

  const cancelFeedback = useCallback((clearSignal = true) => {
    feedbackGenerationRef.current += 1;
    acceptingRef.current = false;
    beepSchedulerRef.current.stop();
    if (renderTimerRef.current !== null) clearTimeout(renderTimerRef.current);
    if (staleTimerRef.current !== null) clearTimeout(staleTimerRef.current);
    if (audioTimerRef.current !== null) clearInterval(audioTimerRef.current);
    renderTimerRef.current = null;
    staleTimerRef.current = null;
    audioTimerRef.current = null;
    if (clearSignal) {
      trackerRef.current.reset();
      audioFilterRef.current.reset();
      latestReadingRef.current = null;
      beepIntervalRef.current = FIND_ASSET_SCANNING_BEEP_MS;
      setReading(null);
      setAudioSignal(null);
      setFreshness('NO SIGNAL');
    }
  }, []);

  const onTriggerEvent = useCallback((action: 'DOWN' | 'UP') => {
    if (action === 'UP' && !manualIntentRef.current) cancelFeedback();
  }, [cancelFeedback]);
  const noTags = useCallback((_tags: RFIDTag[]) => undefined, []);
  const noSessionReset = useCallback(() => undefined, []);
  const rfid = useRFIDSession(noTags, noSessionReset, Boolean(selected), onTriggerEvent);

  useEffect(() => {
    if (selected || query.trim().length < MIN_SEARCH_LENGTH) {
      requestIdRef.current += 1;
      setSearching(false);
      if (!selected) {
        setResults([]);
        setSearchMessage('Enter at least 2 characters.');
      }
      return;
    }
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchMessage('');
      searchFindAssets(query)
        .then(found => {
          if (requestId !== requestIdRef.current) return;
          setResults(found);
          setSearchMessage(found.length ? '' : 'No assets with an active EPC were found.');
        })
        .catch(reason => {
          if (requestId !== requestIdRef.current) return;
          setResults([]);
          setSearchMessage(apiErrorMessage(reason));
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, selected]);

  useEffect(() => {
    const physicalScanning =
      rfid.lifecycleStatus === 'SCANNING' && rfid.trigger === 'DOWN';
    const scanning = isFindAssetFeedbackActive(
      rfid.lifecycleStatus,
      rfid.trigger,
      manualIntentRef.current,
      manualLifecycle,
    );
    acceptingRef.current = scanning;
    if (scanning && !previousScanningRef.current) {
      console.info('[FindAssetAudio] scheduler started', { mode: physicalScanning ? 'trigger' : 'manual' });
      lastObservationAtRef.current = null;
      longestObservationGapRef.current = 0;
      const generation = ++feedbackGenerationRef.current;
      beepIntervalRef.current = FIND_ASSET_SCANNING_BEEP_MS;
      beepSchedulerRef.current.start();
      playFindAssetStartVibration(() =>
        acceptingRef.current && generation === feedbackGenerationRef.current,
      ).catch(() => undefined);
      audioTimerRef.current = setInterval(() => {
        if (!acceptingRef.current) return;
        const now = Date.now();
        const current = trackerRef.current.current(now);
        if (!current) return;
        setFreshness(freshnessForReading(current, now));
        const nextAudioSignal = audioFilterRef.current.evaluate(now);
        if (!nextAudioSignal) return;
        setAudioSignal(previous => {
          if (
            previous?.category === nextAudioSignal.category &&
            previous.trend === nextAudioSignal.trend &&
            previous.median === nextAudioSignal.median
          ) return previous;
          return nextAudioSignal;
        });
        const nextInterval = beepIntervalForCategory(nextAudioSignal.category);
        if (nextInterval !== beepIntervalRef.current) {
          beepIntervalRef.current = nextInterval;
          beepSchedulerRef.current.reschedule();
        }
      }, FIND_ASSET_AUDIO_EVALUATION_MS);
    }
    if (!scanning) {
      if (previousScanningRef.current) console.info('[FindAssetAudio] scheduler stopped');
      cancelFeedback();
    }
    previousScanningRef.current = scanning;
  }, [cancelFeedback, manualLifecycle, rfid.lifecycleStatus, rfid.trigger]);

  useEffect(() => {
    if (rfid.lifecycleStatus !== 'ERROR' && rfid.lifecycleStatus !== 'RELEASED') return;
    manualCommandRef.current += 1;
    manualIntentRef.current = false;
    setManualIntent(false);
    setManualLifecycle(null);
    cancelFeedback();
  }, [cancelFeedback, rfid.lifecycleStatus]);

  useEffect(() => {
    if (isFocused) return;
    manualCommandRef.current += 1;
    manualIntentRef.current = false;
    setManualIntent(false);
    setManualLifecycle(null);
    cancelFeedback();
  }, [cancelFeedback, isFocused]);

  const targetEpc = normalizeEpc(selected?.epc?.epcCode || '');
  useEffect(() => {
    if (!targetEpc) return;
    const remove = IMSRFIDService.onTargetObservations(targetEpc, tag => {
      if (!acceptingRef.current) return;
      const observedAt = Date.now();
      if (lastObservationAtRef.current !== null) {
        const gap = observedAt - lastObservationAtRef.current;
        longestObservationGapRef.current = Math.max(longestObservationGapRef.current, gap);
        if (gap >= FIND_ASSET_AUDIO_EVALUATION_MS) {
          console.info('[FindAssetSignal] target observation gap', {
            gapMs: gap,
            longestGapMs: longestObservationGapRef.current,
          });
        }
      }
      lastObservationAtRef.current = observedAt;
      const next = trackerRef.current.accept(tag.rssi, observedAt);
      if (!next) return;
      audioFilterRef.current.add(tag.rssi, next.observedAt);
      latestReadingRef.current = next;
      setFreshness('LIVE');

      if (renderTimerRef.current === null) {
        renderTimerRef.current = setTimeout(() => {
          renderTimerRef.current = null;
          if (acceptingRef.current) setReading(latestReadingRef.current);
        }, FIND_ASSET_RENDER_INTERVAL_MS);
      }
      if (staleTimerRef.current !== null) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(() => {
        staleTimerRef.current = null;
        if (acceptingRef.current && !trackerRef.current.current(Date.now())) {
          trackerRef.current.reset();
          const scanningIntervalChanged =
            beepIntervalRef.current !== FIND_ASSET_SCANNING_BEEP_MS;
          beepIntervalRef.current = FIND_ASSET_SCANNING_BEEP_MS;
          if (scanningIntervalChanged) beepSchedulerRef.current.reschedule();
          latestReadingRef.current = null;
          setReading(null);
          setAudioSignal(null);
          setFreshness('NO SIGNAL');
        }
      }, FIND_ASSET_STALE_MS + 10);
    });
    return () => {
      remove();
      cancelFeedback();
    };
  }, [cancelFeedback, targetEpc]);

  useEffect(() => () => cancelFeedback(), [cancelFeedback]);

  const startManualScan = useCallback(async () => {
    if (!selected || !targetEpc || manualLifecycle === 'STOPPING') return;
    const generation = ++manualCommandRef.current;
    manualIntentRef.current = true;
    setManualIntent(true);
    setManualLifecycle('STARTING');
    const started = await IMSRFIDService.startManualScan();
    if (generation !== manualCommandRef.current) return;
    manualIntentRef.current = started;
    setManualIntent(started);
    setManualLifecycle(started ? 'SCANNING' : null);
  }, [manualLifecycle, selected, targetEpc]);

  const stopManualScan = useCallback(async () => {
    const generation = ++manualCommandRef.current;
    manualIntentRef.current = false;
    setManualIntent(false);
    setManualLifecycle('STOPPING');
    const physicalScanContinues =
      rfid.trigger === 'DOWN' && rfid.lifecycleStatus === 'SCANNING';
    if (!physicalScanContinues) cancelFeedback();
    await IMSRFIDService.stopManualScan();
    if (generation === manualCommandRef.current) setManualLifecycle(null);
  }, [cancelFeedback, rfid.lifecycleStatus, rfid.trigger]);

  const selectAsset = useCallback((asset: FindAssetResult) => {
    cancelFeedback();
    lastObservationAtRef.current = null;
    longestObservationGapRef.current = 0;
    setSelected(asset);
    setResults([]);
  }, [cancelFeedback]);

  const clearSelection = useCallback(() => {
    manualCommandRef.current += 1;
    manualIntentRef.current = false;
    setManualIntent(false);
    setManualLifecycle(null);
    IMSRFIDService.stopManualScan().catch(() => undefined);
    cancelFeedback();
    lastObservationAtRef.current = null;
    longestObservationGapRef.current = 0;
    setSelected(null);
    setQuery('');
    setSearchMessage('Enter at least 2 characters.');
  }, [cancelFeedback]);

  const visualSignal = visualSignalForReading(reading);
  const visualStrength = visualSignal?.strength || 0;
  const meterWidth = `${Math.round(visualStrength * 100)}%` as `${number}%`;
  const lifecycle = manualLifecycle || (rfid.lifecycleStatus === 'RELEASED' ? (selected ? 'STARTING' : 'READY') : rfid.lifecycleStatus);
  const canStartManual =
    Boolean(targetEpc) &&
    manualLifecycle === null &&
    (rfid.lifecycleStatus === 'READY' || rfid.lifecycleStatus === 'SCANNING');

  if (!selected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.searchContent}>
          <Text style={styles.title}>Find Asset</Text>
          <TextInput accessibilityLabel="Search assets" autoCapitalize="characters" autoCorrect={false} onChangeText={setQuery} placeholder="Asset code, item name, or EPC" style={styles.input} value={query} />
          {searching ? <ActivityIndicator /> : null}
          {searchMessage ? <Text style={styles.message}>{searchMessage}</Text> : null}
          <FlatList
            data={results}
            keyboardShouldPersistTaps="handled"
            keyExtractor={asset => String(asset.id)}
            renderItem={({ item }) => (
              <Pressable onPress={() => selectAsset(item)} style={styles.resultCard}>
                <Text style={styles.assetCode}>{item.assetCode}</Text>
                <Text style={styles.itemName}>{item.itemName}</Text>
                <Text style={styles.detail}>EPC: {item.epc?.epcCode}</Text>
                <Text style={styles.detail}>Location: {locationLabel(item)}</Text>
              </Pressable>
            )}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.locateContent}>
        <View style={styles.assetCard}>
          <View style={styles.assetHeader}><Text style={styles.assetCode}>{selected.assetCode}</Text><Pressable disabled={manualLifecycle !== null || rfid.trigger === 'DOWN'} onPress={clearSelection}><Text style={styles.changeAsset}>Change</Text></Pressable></View>
          <Text style={styles.itemName}>{selected.itemName}</Text>
          <Text style={styles.detail}>Location: {locationLabel(selected)}</Text>
        </View>
        <View style={styles.readerRow}><Text style={styles.readerLabel}>Reader</Text><Text style={styles.readerState}>{lifecycle}</Text><Text style={styles.trigger}>Trigger {rfid.trigger}</Text></View>
        <Text style={styles.instruction}>{acceptingRef.current ? 'Scanning — release trigger or tap Stop Scan to stop.' : 'Hold the physical trigger or tap Start Scan.'}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={manualLifecycle === 'STOPPING' || (!manualIntent && !canStartManual)}
          onPress={manualIntent ? stopManualScan : startManualScan}
          style={[styles.scanButton, manualIntent && styles.stopButton, (manualLifecycle === 'STOPPING' || (!manualIntent && !canStartManual)) && styles.disabledButton]}>
          <Text style={styles.scanButtonText}>{manualIntent ? 'Stop Scan' : manualLifecycle === 'STOPPING' ? 'Stopping…' : 'Start Scan'}</Text>
        </Pressable>
        {rfid.error ? <Text style={styles.error}>{rfid.error}</Text> : null}
        <View style={styles.signalCard}>
          <Text style={[styles.detection, visualSignal ? styles.detected : styles.noSignal]}>{visualSignal?.category || 'NO SIGNAL'}</Text>
          <View style={styles.meterTrack}><View style={[styles.meterFill, { width: meterWidth }]} /></View>
          <View style={styles.signalMetaRow}><View><Text style={styles.metaLabel}>TREND</Text><Text style={styles.metaValue}>{visualSignal ? audioSignal?.trend || 'STABLE' : 'STABLE'}</Text></View><View><Text style={styles.metaLabel}>FRESHNESS</Text><Text style={styles.metaValue}>{freshness}</Text></View><View><Text style={styles.metaLabel}>{freshness === 'UNCERTAIN' ? 'LAST RSSI' : 'RAW RSSI'}</Text><Text style={styles.metaValue}>{visualSignal?.raw ?? '—'}</Text></View></View>
          <Text style={styles.strengthText}>{visualSignal ? `${Math.round(visualStrength * 100)}% relative signal` : 'Waiting for the selected EPC'}</Text>
        </View>
        <Text style={styles.disclaimer}>Relative signal only. RSSI is not physical distance or guaranteed direction.</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, searchContent: { flex: 1, padding: 14, gap: 10 }, locateContent: { padding: 14, gap: 12 },
  title: { color: '#0F172A', fontSize: 25, fontWeight: '900' }, input: { minHeight: 48, borderWidth: 1, borderColor: '#94A3B8', borderRadius: 9, paddingHorizontal: 12, color: '#0F172A', backgroundColor: '#FFFFFF' },
  message: { color: '#64748B', textAlign: 'center', paddingVertical: 8 }, resultCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, marginBottom: 8 },
  assetCard: { backgroundColor: '#FFFFFF', borderRadius: 11, padding: 13, gap: 3 }, assetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, assetCode: { color: '#0F172A', fontSize: 17, fontWeight: '900' }, itemName: { color: '#334155', fontSize: 15, fontWeight: '600' }, detail: { color: '#64748B', fontSize: 12, marginTop: 2 }, changeAsset: { color: '#2563EB', fontWeight: '800', padding: 6 },
  readerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, gap: 8 }, readerLabel: { color: '#64748B' }, readerState: { color: '#1D4ED8', fontWeight: '900' }, trigger: { marginLeft: 'auto', color: '#475569', fontWeight: '700' }, instruction: { color: '#475569', fontSize: 12, textAlign: 'center' }, error: { color: '#B91C1C', fontWeight: '600' },
  scanButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2563EB' }, stopButton: { backgroundColor: '#B91C1C' }, disabledButton: { opacity: 0.45 }, scanButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  signalCard: { alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 14, padding: 16 }, detection: { fontSize: 24, fontWeight: '900', letterSpacing: 1 }, detected: { color: '#4ADE80' }, noSignal: { color: '#FCA5A5' },
  meterTrack: { width: '100%', height: 34, borderRadius: 17, overflow: 'hidden', backgroundColor: '#334155', marginTop: 14 }, meterFill: { height: '100%', borderRadius: 17, backgroundColor: '#22C55E' }, signalMetaRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }, metaLabel: { color: '#94A3B8', fontSize: 9, fontWeight: '800' }, metaValue: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginTop: 2 }, strengthText: { color: '#CBD5E1', marginTop: 10, textAlign: 'center', fontSize: 12 }, disclaimer: { color: '#64748B', fontSize: 11, textAlign: 'center', paddingHorizontal: 12 },
});

export default FindAssetScreen;
