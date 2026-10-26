import { useEffect } from 'react';

/**
 * Ctrl+K / ⌘+K. Matches the physical key (`event.code`), so it also works while an Urdu
 * keyboard layout is active, where `event.key` would be "ک".
 */
export function useCommandHotkey(onToggle: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyK' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToggle]);
}
