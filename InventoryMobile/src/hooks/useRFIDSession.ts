import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import IMSRFIDService from '../services/rfid/IMSRFIDService';
import { RFIDTag } from '../types/RFIDTag';

export function useRFIDSession(onTags: (tags: RFIDTag[]) => void, onNewSession: () => void, enabled = true) {
  const focused = useIsFocused();
  const [status, setStatus] = useState('Released');
  const [scanning, setScanning] = useState(false);
  const [trigger, setTrigger] = useState<'DOWN' | 'UP'>('UP');
  const [error, setError] = useState<string | null>(null);
  const tagsRef = useRef(onTags);
  const sessionRef = useRef(onNewSession);
  const appState = useRef(AppState.currentState);
  tagsRef.current = onTags;
  sessionRef.current = onNewSession;

  const initialize = useCallback(async () => {
    setStatus('Initializing...');
    const ready = await IMSRFIDService.initialize();
    setStatus(ready ? 'Ready' : 'Error');
  }, []);

  useEffect(() => {
    const removeTags = IMSRFIDService.onTags(tags => tagsRef.current(tags));
    const removeTrigger = IMSRFIDService.onTrigger(event => {
      setTrigger(event.action);
      if (event.startsSession) sessionRef.current();
      IMSRFIDService.isScanning().then(setScanning).catch(() => setScanning(false));
    });
    const removeError = IMSRFIDService.onError(message => { setError(message); setStatus('Error'); });
    const appSubscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const previous = appState.current;
      appState.current = next;
      if (previous === 'active' && next !== 'active') {
        setScanning(false); setTrigger('UP'); setStatus('Released');
        IMSRFIDService.release().catch(() => undefined);
      } else if (previous !== 'active' && next === 'active' && focused && enabled) {
        initialize().catch(reason => setError(String(reason)));
      }
    });
    return () => { removeTags(); removeTrigger(); removeError(); appSubscription.remove(); };
  }, [enabled, focused, initialize]);

  useEffect(() => {
    if (focused && enabled && AppState.currentState === 'active') initialize().catch(reason => setError(String(reason)));
    else IMSRFIDService.release().catch(() => undefined);
  }, [enabled, focused, initialize]);

  useEffect(() => () => { IMSRFIDService.destroy().catch(() => undefined); }, []);
  return { status, scanning, trigger, error, stop: () => IMSRFIDService.stopScan(), release: () => IMSRFIDService.release() };
}
