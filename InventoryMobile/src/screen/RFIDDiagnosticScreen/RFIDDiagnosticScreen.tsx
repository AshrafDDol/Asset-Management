import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  AppStateStatus,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import IMSRFIDService, {
  RFIDTriggerEvent,
} from '../../services/rfid/IMSRFIDService';
import { RFIDTag } from '../../types/RFIDTag';

const EXPECTED_EPCS = [
  '4133C0586BE6093010401641',
  '617368726166',
  'AA0110000003032500000003',
  'BBF7852ABCDA54',
] as const;

const normalizeEpc = (epc: string): string => epc.trim().toUpperCase();
const EXPECTED_EPC_SET = new Set<string>(EXPECTED_EPCS.map(normalizeEpc));
const EXPECTED_COUNT = EXPECTED_EPCS.length;

type RFIDStatus = 'Initializing...' | 'Ready' | 'Released' | 'Error';
type Filter = 'ALL' | 'VALID' | 'UNEXPECTED';

const RFIDDiagnosticScreen: React.FC = () => {
  const isFocused = useIsFocused();
  const [status, setStatus] = useState<RFIDStatus>('Released');
  const [trigger, setTrigger] = useState<'DOWN' | 'UP'>('UP');
  const [scanning, setScanning] = useState(false);
  const [tags, setTags] = useState<RFIDTag[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [completionReached, setCompletionReached] = useState(false);
  const [error, setError] = useState('None');
  const activeTriggerKeys = useRef(new Set<number>());
  const mounted = useRef(false);
  const appState = useRef(AppState.currentState);
  const focused = useRef(isFocused);
  const lifecycleVersion = useRef(0);

  const validTags = useMemo(
    () => tags.filter(tag => EXPECTED_EPC_SET.has(normalizeEpc(tag.epc))),
    [tags],
  );
  const unexpectedTags = useMemo(
    () => tags.filter(tag => !EXPECTED_EPC_SET.has(normalizeEpc(tag.epc))),
    [tags],
  );
  const matchedCount = validTags.length;
  const remainingCount = EXPECTED_COUNT - matchedCount;

  const filteredTags = useMemo(() => {
    if (filter === 'VALID') {
      return validTags;
    }
    if (filter === 'UNEXPECTED') {
      return unexpectedTags;
    }
    return tags;
  }, [filter, tags, unexpectedTags, validTags]);

  useEffect(() => {
    if (matchedCount === EXPECTED_COUNT) {
      setCompletionReached(true);
    }
  }, [matchedCount]);

  const initialize = useCallback(async () => {
    const requestedVersion = lifecycleVersion.current;
    setError('None');
    setStatus('Initializing...');
    try {
      const ready = await IMSRFIDService.initialize();
      if (
        mounted.current &&
        lifecycleVersion.current === requestedVersion &&
        AppState.currentState === 'active'
      ) {
        setStatus(ready ? 'Ready' : 'Error');
      }
    } catch (reason) {
      if (mounted.current && lifecycleVersion.current === requestedVersion) {
        setStatus('Error');
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    appState.current = AppState.currentState;
    const triggerKeys = activeTriggerKeys.current;

    const removeTags = IMSRFIDService.onTags(() => {
      setTags(IMSRFIDService.getSessionTags());
    });
    const removeTrigger = IMSRFIDService.onTrigger((event: RFIDTriggerEvent) => {
      setTrigger(event.action);

      if (event.action === 'DOWN') {
        triggerKeys.add(event.keyCode);
        if (event.startsSession) {
          setTags([]);
          setCompletionReached(false);
          setFilter('ALL');
        }
      } else {
        triggerKeys.delete(event.keyCode);
      }

      IMSRFIDService.isScanning()
        .then(isActive => {
          setScanning(isActive);
          setTags(IMSRFIDService.getSessionTags());
        })
        .catch(reason => {
          setScanning(false);
          setError(reason instanceof Error ? reason.message : String(reason));
          setStatus('Error');
        });
    });
    const removeError = IMSRFIDService.onError(message => {
      setError(message);
      setStatus('Error');
    });
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        const previousState = appState.current;
        appState.current = nextState;

        if (
          nextState === 'active' &&
          previousState !== 'active' &&
          focused.current
        ) {
          lifecycleVersion.current += 1;
          initialize().catch(() => undefined);
          return;
        }

        if (
          nextState !== 'active' &&
          previousState === 'active' &&
          focused.current
        ) {
          lifecycleVersion.current += 1;
          triggerKeys.clear();
          setScanning(false);
          setTrigger('UP');
          setStatus('Released');
          IMSRFIDService.release().catch(reason => {
            if (mounted.current) {
              setError(reason instanceof Error ? reason.message : String(reason));
            }
          });
        }
      },
    );

    return () => {
      mounted.current = false;
      lifecycleVersion.current += 1;
      appStateSubscription.remove();
      removeTags();
      removeTrigger();
      removeError();
      triggerKeys.clear();
      IMSRFIDService.destroy().catch(() => undefined);
    };
  }, [initialize]);

  useEffect(() => {
    focused.current = isFocused;
    lifecycleVersion.current += 1;

    if (isFocused && AppState.currentState === 'active') {
      initialize().catch(() => undefined);
      return;
    }

    activeTriggerKeys.current.clear();
    setScanning(false);
    setTrigger('UP');
    setStatus('Released');
    IMSRFIDService.release().catch(reason => {
      if (mounted.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    });
  }, [initialize, isFocused]);

  const renderFilter = (label: string, value: Filter) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => setFilter(value)}
      style={[styles.filterButton, filter === value && styles.activeFilter]}>
      <Text style={filter === value ? styles.activeFilterText : undefined}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Asset Management Test</Text>

      <View style={styles.summary}>
        <Text>Expected: {EXPECTED_COUNT}</Text>
        <Text>Matched: {matchedCount}</Text>
        <Text>Remaining: {remainingCount}</Text>
        <Text>Unexpected: {unexpectedTags.length}</Text>
      </View>

      {completionReached && (
        <View style={styles.completion}>
          <Text style={styles.completionTitle}>✓ Scan Complete</Text>
          <Text>4 / 4 expected items successfully scanned</Text>
        </View>
      )}

      <View style={styles.statusRow}>
        <Text>RFID: {status}</Text>
        <Text>Trigger: {trigger}</Text>
        <Text>Scan: {scanning ? 'Scanning' : 'Stopped'}</Text>
      </View>
      {error !== 'None' && <Text style={styles.error}>Error: {error}</Text>}

      <View style={styles.filters}>
        {renderFilter('All', 'ALL')}
        {renderFilter('Valid', 'VALID')}
        {renderFilter('Unexpected', 'UNEXPECTED')}
      </View>

      <FlatList
        data={filteredTags}
        keyExtractor={item => item.epc}
        ListEmptyComponent={<Text style={styles.empty}>No EPCs scanned</Text>}
        renderItem={({ item }) => {
          const normalizedScannedEpc = normalizeEpc(item.epc);
          const isValid = EXPECTED_EPC_SET.has(normalizedScannedEpc);
          return (
            <View style={styles.tagRow}>
              <Text style={isValid ? styles.validTag : styles.unexpectedTag}>
                {normalizedScannedEpc}
              </Text>
              <Text style={styles.diagnosticText}>
                Raw SDK EPC: {item.rawEpc ?? item.epc}
              </Text>
              <Text style={styles.diagnosticText}>
                Normalized scanned EPC: {normalizedScannedEpc}
              </Text>
              <Text style={styles.diagnosticText}>
                Normalized expected EPC:{' '}
                {isValid ? normalizedScannedEpc : 'No exact expected EPC'}
              </Text>
              <Text style={styles.diagnosticText}>
                Exact match: {isValid ? 'YES' : 'NO'}
              </Text>
              {item.rssi !== undefined && (
                <Text style={styles.rssi}>RSSI {item.rssi}</Text>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  summary: {
    gap: 4,
    marginBottom: 12,
  },
  completion: {
    borderColor: '#27823b',
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  completionTitle: {
    color: '#27823b',
    fontSize: 18,
    fontWeight: '700',
  },
  statusRow: {
    gap: 2,
    marginBottom: 8,
  },
  error: {
    color: '#a51d1d',
    marginBottom: 8,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterButton: {
    borderColor: '#888',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  activeFilter: {
    backgroundColor: '#333',
  },
  activeFilterText: {
    color: '#fff',
  },
  tagRow: {
    borderBottomColor: '#ddd',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  validTag: {
    fontWeight: '700',
  },
  unexpectedTag: {
    color: '#777',
  },
  rssi: {
    color: '#777',
    fontSize: 12,
    marginTop: 2,
  },
  diagnosticText: {
    color: '#555',
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: '#777',
    paddingVertical: 12,
  },
});

export default RFIDDiagnosticScreen;
