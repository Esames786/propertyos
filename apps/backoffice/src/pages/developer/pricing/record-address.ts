import { ApiError } from '@repo/contracts';
import { useApiPrefetch, useQueryParam, useSession } from '@repo/ui';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Wave 2 integration: contextual deep links to private drafts. The draft a screen shows lives in the address
 * (`?record=<id>`; INV-007's drawer: `?record=<unit>&draft=<id>`), so a link opens exactly that draft in context
 * for its creator, Back and Forward move between the drafts opened, and a reload keeps the draft. The server
 * answers a draft of another creator, project or organisation exactly like an id never issued (404), and the
 * screens show one not-found state for all of them.
 *
 * The shell checks every `?record=` before it renders the page (Gate B `/access/record`); while an id it has
 * not checked yet is pending it shows a placeholder instead of the page, which would drop the editor's state
 * and the keyboard focus. Opening a record from the page therefore warms that same check first
 * (`useApiPrefetch` uses the shell's cache key), so the page stays mounted and focus stays where it was.
 *
 * `onAddressChange` runs when the parameter changes by other means (Back, Forward, a link), so an editor never
 * keeps the previous draft's edits, version floor or request keys.
 */
export function useRecordAddress(name: 'record' | 'draft', onAddressChange: (value: string | null) => void) {
  const [value, setValue] = useQueryParam(name);
  const { persona } = useSession();
  const prefetch = useApiPrefetch();
  const ours = useRef(value);
  const onChange = useRef(onAddressChange);
  useEffect(() => {
    onChange.current = onAddressChange;
  });
  useEffect(() => {
    if (value === ours.current) return;
    ours.current = value;
    onChange.current(value);
  }, [value]);
  const open = useCallback(
    async (id: string | null, options: { replace?: boolean } = {}) => {
      if (id === value) return;
      ours.current = id;
      // Prefetching never throws; a failed check leaves the page to its own requests, as the shell does.
      if (id && name === 'record' && persona) await prefetch({ method: 'GET', path: '/access/record', query: { id } }, persona.id);
      setValue(id, { replace: options.replace ?? false });
    },
    [name, persona, prefetch, setValue, value],
  );
  return [value, open] as const;
}

/** The server's answer for a draft that is not the person's to open, or was never issued: one not-found for all. */
export const isNotFound = (error: unknown): boolean => error instanceof ApiError && error.problem.status === 404;
