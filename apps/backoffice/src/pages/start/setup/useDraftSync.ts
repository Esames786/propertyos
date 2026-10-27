import { useEffect, useEffectEvent } from 'react';
import type { DeepPartial, FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * Mirrors a step's typed values up to the wizard's draft as they change, so nothing is lost on
 * Back, Skip, a stepper jump, a language switch or a reload (the page decides what is stored).
 */
export function useDraftSync<T extends FieldValues>(methods: UseFormReturn<T>, sync: (values: DeepPartial<T>) => void) {
  const onValues = useEffectEvent(sync);
  useEffect(() => {
    const subscription = methods.watch((values) => onValues(values));
    return () => subscription.unsubscribe();
  }, [methods]);
}
