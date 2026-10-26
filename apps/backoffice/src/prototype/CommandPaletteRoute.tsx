import { useShell } from '@repo/ui';
import { useEffect } from 'react';
import LabHome from '../pages/lab/LabHome';

/** GLOBAL-001: the palette is an overlay, so its register URL opens it over the start page (C10). */
export function CommandPaletteRoute() {
  const { setPaletteOpen } = useShell();
  useEffect(() => {
    setPaletteOpen(true);
  }, [setPaletteOpen]);
  return <LabHome />;
}
