import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useRFIDSession } from '../../hooks/useRFIDSession';
import IMSRFIDService from '../../services/rfid/IMSRFIDService';
import { RFIDTag } from '../../types/RFIDTag';
import {
  addRSSIObservation,
  emptyRSSIMeasurements,
  RSSIMeasurements,
} from './rssiMeasurements';

const VISUAL_UPDATE_INTERVAL_MS = 100;
const normalizeEpc = (value: string): string => value.trim().toUpperCase();

const RFIDRSSIDiagnosticScreen: React.FC = () => {
  const [targetInput, setTargetInput] = useState('');
  const normalizedTarget = useMemo(() => normalizeEpc(targetInput), [targetInput]);
  const [measurements, setMeasurements] = useState<RSSIMeasurements>(
    emptyRSSIMeasurements,
  );
  const measurementsRef = useRef(measurements);
  const acceptingRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushMeasurements = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setMeasurements({ ...measurementsRef.current });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      setMeasurements({ ...measurementsRef.current });
    }, VISUAL_UPDATE_INTERVAL_MS);
  }, []);

  const resetMeasurements = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const empty = emptyRSSIMeasurements();
    measurementsRef.current = empty;
    setMeasurements(empty);
  }, []);

  const onTriggerEvent = useCallback(
    (action: 'DOWN' | 'UP') => {
      if (action === 'UP') {
        acceptingRef.current = false;
        flushMeasurements();
      } else {
        acceptingRef.current = false;
      }
    },
    [flushMeasurements],
  );

  const noTags = useCallback((_tags: RFIDTag[]) => undefined, []);
  const noSessionReset = useCallback(() => undefined, []);
  const rfid = useRFIDSession(noTags, noSessionReset, true, onTriggerEvent);

  useEffect(() => {
    acceptingRef.current =
      rfid.lifecycleStatus === 'SCANNING' && rfid.trigger === 'DOWN';
  }, [rfid.lifecycleStatus, rfid.trigger]);

  useEffect(() => {
    const removeObservations = IMSRFIDService.onTargetObservations(normalizedTarget, tag => {
      if (!acceptingRef.current) return;
      measurementsRef.current = addRSSIObservation(
        measurementsRef.current,
        tag.rssi,
        Date.now(),
      );
      scheduleFlush();
    });
    return () => {
      acceptingRef.current = false;
      removeObservations();
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [normalizedTarget, scheduleFlush]);

  const onTargetChange = useCallback(
    (value: string) => {
      setTargetInput(value);
      resetMeasurements();
    },
    [resetMeasurements],
  );

  const lifecycle = useMemo(() => {
    if (rfid.lifecycleStatus !== 'RELEASED') return rfid.lifecycleStatus;
    return rfid.error ? 'ERROR' : 'STARTING';
  }, [rfid.error, rfid.lifecycleStatus]);

  const targetReady = normalizedTarget.length > 0;
  const inputLocked = rfid.trigger === 'DOWN' || rfid.scanning;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.targetCard}>
          <Text style={styles.label}>Target EPC</Text>
          <TextInput
            accessibilityLabel="Target EPC"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!inputLocked}
            onChangeText={onTargetChange}
            placeholder="Enter one EPC"
            style={[styles.input, inputLocked && styles.inputDisabled]}
            value={targetInput}
          />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Reader</Text>
            <Text style={styles.statusValue}>{lifecycle}</Text>
            <Text style={styles.trigger}>Trigger {rfid.trigger}</Text>
          </View>
          {!targetReady ? (
            <Text style={styles.hint}>Enter a target EPC, then hold the physical trigger.</Text>
          ) : null}
          {rfid.error ? <Text style={styles.error}>{rfid.error}</Text> : null}
        </View>

        <View style={styles.rssiCard}>
          <Text style={styles.rssiCaption}>LATEST RAW RSSI</Text>
          <Text style={styles.rssiValue}>
            {measurements.latest === null ? '—' : measurements.latest}
          </Text>
          <Text style={styles.rawNote}>Raw SDK integer; not distance or assumed dBm</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Observations</Text>
            <Text style={styles.metricValue}>{measurements.count}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Minimum</Text>
            <Text style={styles.metricValue}>{measurements.minimum ?? '—'}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Maximum</Text>
            <Text style={styles.metricValue}>{measurements.maximum ?? '—'}</Text>
          </View>
        </View>

        <View style={styles.recentCard}>
          <Text style={styles.label}>Recent readings</Text>
          <FlatList
            data={measurements.recent}
            keyExtractor={sample => String(sample.id)}
            ListEmptyComponent={<Text style={styles.empty}>No target observations yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.sampleRow}>
                <Text style={styles.sampleNumber}>#{item.id}</Text>
                <Text style={styles.sampleRSSI}>{item.rssi ?? 'Unavailable'}</Text>
                <Text style={styles.sampleTime}>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </Text>
              </View>
            )}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={resetMeasurements}
          style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Clear / Reset Measurements</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' },
  content: { flex: 1, padding: 12, gap: 10 },
  targetCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, gap: 7 },
  label: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, paddingHorizontal: 10, color: '#0F172A', backgroundColor: '#FFFFFF' },
  inputDisabled: { backgroundColor: '#E2E8F0', color: '#475569' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusLabel: { color: '#64748B', fontWeight: '600' },
  statusValue: { color: '#1D4ED8', fontWeight: '900' },
  trigger: { marginLeft: 'auto', color: '#475569', fontWeight: '700' },
  hint: { color: '#64748B', fontSize: 12 },
  error: { color: '#B91C1C', fontSize: 12, fontWeight: '600' },
  rssiCard: { alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 12 },
  rssiCaption: { color: '#94A3B8', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  rssiValue: { color: '#FFFFFF', fontSize: 48, fontWeight: '900', lineHeight: 56 },
  rawNote: { color: '#CBD5E1', fontSize: 11 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricCard: { flex: 1, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 9 },
  metricLabel: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  metricValue: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 2 },
  recentCard: { flex: 1, minHeight: 120, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, gap: 6 },
  empty: { color: '#64748B', paddingVertical: 14, textAlign: 'center' },
  sampleRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  sampleNumber: { width: 54, color: '#64748B' },
  sampleRSSI: { flex: 1, color: '#0F172A', fontSize: 16, fontWeight: '800' },
  sampleTime: { color: '#64748B', fontSize: 12 },
  resetButton: { borderRadius: 9, padding: 13, alignItems: 'center', backgroundColor: '#334155' },
  resetButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

export default RFIDRSSIDiagnosticScreen;
