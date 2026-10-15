import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import IMSRFIDService from '../services/rfid/IMSRFIDService';
import { RFIDTag } from '../types/RFIDTag';

export type RFIDKnownLifecycle = 'READY' | 'STARTING' | 'SCANNING' | 'STOPPING' | 'ERROR' | 'RELEASED';

export function useRFIDSession(
  onTags: (tags: RFIDTag[]) => void,
  onNewSession: () => void,
  enabled = true,
  onTriggerEvent?: (action: 'DOWN' | 'UP', startsSession: boolean) => void,
) {
  const focused = useIsFocused();
  const [status, setStatus] = useState('Released');
  const [scanning, setScanning] = useState(false);
  const [trigger, setTrigger] = useState<'DOWN' | 'UP'>('UP');
  const [error, setError] = useState<string | null>(null);
  const [lifecycleStatus, setLifecycleStatus] = useState<RFIDKnownLifecycle>('RELEASED');
  const tagsRef = useRef(onTags);
  const sessionRef = useRef(onNewSession);
  const appState = useRef(AppState.currentState);
  tagsRef.current = onTags;
  sessionRef.current = onNewSession;

  const initialize = useCallback(async () => {
    setStatus('Initializing...');
    const ready = await IMSRFIDService.initialize();
    setStatus(ready ? 'Ready' : 'Error');
    setLifecycleStatus(ready ? 'READY' : 'ERROR');
  }, []);

  useEffect(() => {
    const removeTags = IMSRFIDService.onTags(tags => tagsRef.current(tags));
    const removeTrigger = IMSRFIDService.onTrigger(event => {
      setTrigger(event.action);
      if (event.startsSession) sessionRef.current();
      onTriggerEvent?.(event.action, Boolean(event.startsSession));
      setLifecycleStatus(event.action === 'DOWN' ? 'STARTING' : 'STOPPING');
      IMSRFIDService.isScanning().then(active => {
        setScanning(active);
        setLifecycleStatus(active ? 'SCANNING' : 'READY');
      }).catch(() => {
        setScanning(false);
        setLifecycleStatus('ERROR');
      });
    });
    const removeError = IMSRFIDService.onError(message => { setError(message); setStatus('Error'); setLifecycleStatus('ERROR'); });
    const appSubscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const previous = appState.current;
      appState.current = next;
      if (previous === 'active' && next !== 'active') {
        setScanning(false); setTrigger('UP'); setStatus('Released'); setLifecycleStatus('RELEASED');
        IMSRFIDService.release().catch(() => undefined);
      } else if (previous !== 'active' && next === 'active' && focused && enabled) {
        initialize().catch(reason => setError(String(reason)));
      }
    });
    return () => { removeTags(); removeTrigger(); removeError(); appSubscription.remove(); };
  }, [enabled, focused, initialize, onTriggerEvent]);

  useEffect(() => {
    if (focused && enabled && AppState.currentState === 'active') initialize().catch(reason => setError(String(reason)));
    else IMSRFIDService.release().catch(() => undefined);
  }, [enabled, focused, initialize]);

  useEffect(() => () => { IMSRFIDService.destroy().catch(() => undefined); }, []);
  return { status, lifecycleStatus, scanning, trigger, error, stop: () => IMSRFIDService.stopScan(), release: () => IMSRFIDService.release() };
}
