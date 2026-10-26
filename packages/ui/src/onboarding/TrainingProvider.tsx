import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useTransport } from '../data/TransportProvider';
import { useT } from '../lib/useT';

interface TrainingContextValue {
  /** Practice mode is on: show the TRAINING banner and send writes as training requests. */
  active: boolean;
  start: () => void;
  end: () => Promise<void>;
}

const TrainingContext = createContext<TrainingContextValue | null>(null);

/**
 * Practice mode (doc 09 §2C). Training state is separate from normal work: practice writes carry
 * `training: true` and land in an isolated store that is discarded when practice ends.
 */
export function TrainingProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const { transport } = useTransport();
  const announce = useAnnounce();
  const { t } = useT();

  const start = useCallback(() => setActive(true), []);
  const end = useCallback(async () => {
    try {
      await transport.request({ method: 'POST', path: '/practice/reset', training: true });
    } finally {
      setActive(false);
      announce(t('onboarding:practice.ended'));
    }
  }, [transport, announce, t]);

  const value = useMemo(() => ({ active, start, end }), [active, start, end]);
  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

export function useTraining(): TrainingContextValue {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error('useTraining must be used inside <TrainingProvider>');
  return ctx;
}
