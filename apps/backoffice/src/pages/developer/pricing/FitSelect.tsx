import { ChevronDown } from 'lucide-react';
import { Children, isValidElement, type ReactNode, type SelectHTMLAttributes } from 'react';

/** The chosen option's text, read from the `<option>` children (the E.3 screens render plain-text options). */
function chosenText(children: ReactNode, value: string): string {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ value?: unknown; children?: ReactNode }>(child)) continue;
    if (String(child.props.value ?? '') === value) return Children.toArray(child.props.children).map(String).join('');
  }
  return '';
}

/**
 * Wave 2 integration: a native `<select>` whose chosen text wraps instead of being cut off. At 320 px with 200 %
 * text a native select shows one line and cuts the rest (in Urdu from the start of the text: "…arkspur Heights").
 * Here the chosen option is drawn as ordinary wrapping text (aria-hidden), and the real select lies over it,
 * transparent and exactly as large: it keeps the focus, the keyboard, the phone's own picker, the label and what
 * screen readers announce. The focus ring is drawn on the box while the select has keyboard focus.
 */
export function FitSelect({ value, children, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'className'> & { value: string }) {
  return (
    <span
      data-fit-select=""
      className="relative grid min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel text-text has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-focus has-[select:disabled]:opacity-60"
    >
      <span aria-hidden="true" className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 px-3 py-2">
        <span data-fit-select-text="" className="min-w-0 flex-1 [overflow-wrap:anywhere]">{chosenText(children, value)}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </span>
      <select value={value} {...props} className="col-start-1 row-start-1 size-full min-w-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed">
        {children}
      </select>
    </span>
  );
}
