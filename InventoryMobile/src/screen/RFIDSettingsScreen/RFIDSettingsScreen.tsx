import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { testBackendConnection } from '../../api/client';
import IMSRFIDService from '../../services/rfid/IMSRFIDService';
import {
  DEFAULT_BACKEND_URL,
  isValidBackendUrl,
  loadBackendUrl,
  normalizeBackendUrl,
  saveBackendUrl,
} from '../../services/settings/BackendSettingsService';
import {
  DEFAULT_RFID_POWER,
  loadRFIDSettings,
  RFID_POWER_MAX,
  RFID_POWER_MIN,
  saveRFIDSettings,
} from '../../services/settings/RFIDSettingsService';

const POWER_OPTIONS = Array.from(
  { length: RFID_POWER_MAX - RFID_POWER_MIN + 1 },
  (_, index) => RFID_POWER_MIN + index,
);

const RFIDSettingsScreen: React.FC = () => {
  const [savedPower, setSavedPower] = useState(DEFAULT_RFID_POWER);
  const [selectedPower, setSelectedPower] = useState(DEFAULT_RFID_POWER);
  const [readerPower, setReaderPower] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    Promise.all([loadRFIDSettings(), loadBackendUrl()])
      .then(([settings, savedBackendUrl]) => {
        setSavedPower(settings.rfidPower);
        setSelectedPower(settings.rfidPower);
        setSoundEnabled(settings.soundEnabled);
        setVibrationEnabled(settings.vibrationEnabled);
        setBackendUrl(savedBackendUrl);
      })
      .catch(reason => {
        setIsError(true);
        setMessage(`Could not load RFID settings: ${String(reason)}`);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (saving) {
      return;
    }

    if (!isValidBackendUrl(backendUrl)) {
      setIsError(true);
      setMessage('Backend URL must start with http:// or https://.');
      return;
    }

    setSaving(true);
    setMessage('');
    setIsError(false);

    try {
      const persistedBackendUrl = await saveBackendUrl(backendUrl);
      setBackendUrl(persistedBackendUrl);

      const persisted = await saveRFIDSettings({
        rfidPower: selectedPower,
        soundEnabled,
        vibrationEnabled,
      });
      setSavedPower(persisted.rfidPower);

      const result = await IMSRFIDService.applyPowerWhenReady(
        persisted.rfidPower,
      );
      if (result.status === 'deferred') {
        setReaderPower(null);
        setMessage('Saved locally. Will apply when RFID reader is ready.');
      } else if (result.status === 'failed') {
        setReaderPower(result.readerPower ?? null);
        setIsError(true);
        setMessage(result.message);
      } else {
        setReaderPower(result.readerPower);
        if (result.readerPower !== persisted.rfidPower) {
          setIsError(true);
          setMessage(
            `Saved ${persisted.rfidPower} dBm, but reader reported ${result.readerPower} dBm.`,
          );
        } else {
          setMessage(`Saved and applied ${result.readerPower} dBm.`);
        }
      }
    } catch (reason) {
      setIsError(true);
      setMessage(`Could not save settings: ${String(reason)}`);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (testingConnection) {
      return;
    }

    if (!isValidBackendUrl(backendUrl)) {
      setConnectionError(true);
      setConnectionMessage('Cannot connect to server');
      return;
    }

    setTestingConnection(true);
    setConnectionMessage('');
    setConnectionError(false);
    const reachable = await testBackendConnection(
      normalizeBackendUrl(backendUrl),
    );
    setConnectionError(!reachable);
    setConnectionMessage(
      reachable ? '\u2713 Server reachable' : 'Cannot connect to server',
    );
    setTestingConnection(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Loading RFID settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>RFID Settings</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Server Connection</Text>
          <Text style={styles.fieldLabel}>Backend URL</Text>
          <TextInput
            accessibilityLabel="Backend URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={value => {
              setBackendUrl(value);
              setConnectionMessage('');
            }}
            placeholder={DEFAULT_BACKEND_URL}
            style={styles.urlInput}
            value={backendUrl}
          />
          <Pressable
            disabled={testingConnection}
            onPress={testConnection}
            style={[
              styles.testButton,
              testingConnection && styles.disabled,
            ]}>
            <Text style={styles.testButtonText}>
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </Text>
          </Pressable>
          {connectionMessage ? (
            <Text style={connectionError ? styles.error : styles.success}>
              {connectionMessage}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>RFID Power</Text>
          <Text style={styles.current}>Current: {savedPower} dBm</Text>
          <Text style={styles.selected}>Selected: {selectedPower} dBm</Text>
          {readerPower !== null ? (
            <Text style={styles.reader}>Reader Power: {readerPower} dBm</Text>
          ) : null}

          <Pressable
            style={styles.changeButton}
            onPress={() => setShowSelector(value => !value)}>
            <Text style={styles.changeButtonText}>Change Power</Text>
          </Pressable>

          {showSelector ? (
            <View style={styles.powerGrid}>
              {POWER_OPTIONS.map(power => {
                const selected = power === selectedPower;
                return (
                  <Pressable
                    key={power}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.powerOption,
                      selected && styles.powerOptionSelected,
                    ]}
                    onPress={() => setSelectedPower(power)}>
                    <Text
                      style={[
                        styles.powerOptionText,
                        selected && styles.powerOptionTextSelected,
                      ]}>
                      {power}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Scan Sound</Text>
            <Switch value={soundEnabled} onValueChange={setSoundEnabled} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Vibration</Text>
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
            />
          </View>
        </View>

        {message ? (
          <Text style={isError ? styles.error : styles.success}>{message}</Text>
        ) : null}

        <Pressable
          disabled={saving}
          style={[styles.saveButton, saving && styles.disabled]}
          onPress={save}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' },
  content: { padding: 18, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { color: '#0F172A', fontSize: 24, fontWeight: '800' },
  card: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  label: { color: '#0F172A', fontSize: 18, fontWeight: '700' },
  fieldLabel: { color: '#334155', fontSize: 14, fontWeight: '600' },
  urlInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  testButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#E8F0FE',
  },
  testButtonText: { color: '#1F6FEB', fontWeight: '700' },
  current: { color: '#334155', fontSize: 16 },
  selected: { color: '#1F6FEB', fontSize: 16, fontWeight: '700' },
  reader: { color: '#475569', fontSize: 14 },
  changeButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#E8F0FE',
  },
  changeButtonText: { color: '#1F6FEB', fontWeight: '700' },
  powerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  powerOption: {
    width: 48,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  powerOptionSelected: { borderColor: '#1F6FEB', backgroundColor: '#1F6FEB' },
  powerOptionText: { color: '#334155', fontWeight: '600' },
  powerOptionTextSelected: { color: '#FFFFFF' },
  toggleRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
  success: { color: '#166534', fontWeight: '600' },
  error: { color: '#A51D1D', fontWeight: '600' },
  saveButton: {
    borderRadius: 9,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#1F6FEB',
  },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

export default RFIDSettingsScreen;
