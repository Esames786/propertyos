# PropertyOS — Design Tokens, Components, Interaction Patterns V2

## Visual direction
Backoffice: modern precise enterprise SaaS, highly readable and consistent. Customer app: premium fintech/luxury property hybrid. Public website: cinematic motion where it tells a story; accessible fallbacks.

## Example tokens (validate exact contrast combinations before shipping)
```css
:root {
  --color-bg: #F8FAFC;
  --color-panel: #FFFFFF;
  --color-text: #111827;
  --color-muted: #475569;
  --color-border: #CBD5E1;
  --color-primary: #1D4ED8;
  --color-success: #166534;
  --color-warning: #92400E;
  --color-error: #B91C1C;
  --color-focus: #1D4ED8;
  --radius-sm: 6px;
  --radius-control: 8px;
  --radius-card: 12px;
  --motion-fast: 120ms;
  --motion-regular: 200ms;
}
```

Spacing 4px rhythm: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80.

Backoffice page title ~24px; section 18px; body 14–16px; secondary 13px; customer body 16–18px. Urdu line-height adjusted by chosen font, not simply copied from Latin metrics.

## Component families
- Foundation: Button, IconButton, Link, Input, Label, Checkbox, Radio, Switch, Combobox, AsyncSelect, MultiSelect, DatePicker, CurrencyInput, PhoneInput, ValidationSummary.
- Layout: AppShell, AppHeader, Sidebar, MobileBottomNav, Breadcrumbs, WorkspaceHeader, Tabs, Panel, Card, SplitView.
- Records: EntityReference, RelatedDrawer, ActivityTimeline, Status, Money, Date, DataGrid, FilterBar, SavedView, QuickPreview.
- Operations: Dialog, Drawer, BottomSheet, Wizard, Stepper, Upload, DocumentPreview, Toast, NotificationCenter, Skeleton, Empty/Error/Forbidden/Offline states.
- Global: LocaleSwitcher, ThemeSettings, AccessibleLiveAnnouncer, HelpDrawer, CommandPalette, QuickCreate, PermissionGuard.
- Specialty: InventoryMatrix with list alternative, FloorExplorer, PaymentPlanBuilder, InvoiceLedger, Reconciliation, MaintenanceBoard, VisitCalendar, ConstructionTimeline.

## Behavior matrix
| Component | Desktop | Tablet | Phone | Keyboard/Screen reader |
|---|---|---|---|---|
| Sidebar | fixed/collapsible | collapsible | accessible sheet | nav landmark, focus control |
| Workspace tabs | row + More | scroll + More | scroll/section menu | tab semantics, arrow keys |
| Related drawer | right-side | right-side | full-screen sheet | focus trap/return |
| Data list | grid/table | table/cards | cards or scroll table | semantic table/list |
| Quick action | toolbar | compact toolbar | actions sheet | labels, no icon-only ambiguity |
| Inventory matrix | grid | scroll grid | floor selector + list | alternative table/list |
| Search | Ctrl+K | Ctrl+K | search button | combobox/listbox semantics |
| Payment proof | file input/drop | file input | camera/file picker | labeled upload and status |

## Critical feedback
- Button spinner is local and action disabled until resolved.
- Skeleton only for loading content, not fabricated success.
- Success toast includes accessible announcement and reference when relevant.
- Destructive action modal says exact effect and asks reason when appropriate.
- If resource changed in another session, show conflict and next action.
- No giant centered loading overlay on every route.
- Sound OFF by default; cannot replace visible labels.
- Wording must be plain, localized and specific.

## Motion system
Backoffice transitions 100–250ms. Customer UI modest transitions. Public website may use GSAP/ScrollTrigger and visual 3D only where value exceeds performance/accessibility cost. Reduced-motion alternative shows all important content as static accessible flow.

## Responsive references
360/390/430 phone; 768 tablet; 1024 landscape tablet; 1280/1440/1920 desktop; 200% zoom and 320px reflow.

## Branding guardrails
Company/tenant can customize logo, brand accent, illustrations and project photography, but contrast, semantic states, functional controls and accessibility minimums must remain protected.


## Guided onboarding component family — V2.1
`GuidedTourProvider`, `TourRegistry`, `TourAnchor`, `TourOverlay`, `TourPopover`, `TourControls`, `TourProgressStore`, `PracticeModeBanner`.
Visual: subtle 45–65% dim scrim with cutout/ring, minimal pulse, accessible popover anchored to target, safe mobile bottom sheet fallback, no flashing or forced blur.
Behavior: first-login opt-in; context/role/permission-specific module tours; language and device responsive; text-only and screen-reader alternative; skip/resume/replay; per-tour/version/prototype-persona progress.
See `09_INTERACTIVE_GUIDED_ONBOARDING.md`.
