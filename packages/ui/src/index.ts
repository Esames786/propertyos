// Providers and seams
export { AppProviders } from './providers/AppProviders';
export { NavigationProvider, useNavigation, useQueryParam, useQueryParams, type AppLocation, type NavigateOptions } from './navigation/RouterAdapter';
export { TransportProvider, useTransport, useApiQuery, queryOwner, MOCK_MODE_KEY, type MockMode, type TransportFactory } from './data/TransportProvider';
export { useApiMutation, useApiPrefetch } from './data/useApi';
export { SessionProvider, useSession, useCan } from './permissions/SessionProvider';
export { PermissionGate } from './permissions/PermissionGate';
export { allowed, filterAllowed } from './permissions/can';
export { PreferencesProvider, usePreferences, useReducedMotion, PREFERENCES_KEY } from './preferences/PreferencesProvider';
export { DisplayPreferencesProvider, useDisplayPreferences, TEXT_SCALES, FIRST_RUN_SCALES, DEFAULT_TEXT_SCALE, displayPreferencesKey, isTextScale, percentOf, type TextScale, type DisplayPreferences } from './preferences/DisplayPreferences';
export { TextSizeChooser, TextSizeSettings, TextSizeWelcome } from './preferences/TextSize';
export { Stepper, type StepperStep } from './data/Stepper';
export { usePrototypeTools, PrototypeToolsPreference, PROTOTYPE_TOOLS_KEY } from './preferences/prototypeTools';
export { LanguagePreferences, AccessibilityPreferences, TourPreferences } from './preferences/PreferencesForm';

// Accessibility
export { LiveAnnouncerProvider, useAnnounce } from './a11y/LiveAnnouncer';
export { VisuallyHidden } from './a11y/VisuallyHidden';
export { SkipLink, MAIN_CONTENT_ID } from './a11y/SkipLink';

// Primitives
export { Button, buttonClass, type ButtonProps } from './primitives/Button';
export { IconButton } from './primitives/IconButton';
export { Link } from './primitives/Link';
export { DirectionalIcon } from './primitives/DirectionalIcon';
export { Spinner } from './primitives/Spinner';

// Data display
export { Money } from './data/Money';
export { DateTime } from './data/DateTime';
export { Reference } from './data/Reference';
export { StatusLabel, Badge, DemoBadge, type StatusTone } from './data/StatusLabel';
export { KeyValueList } from './data/KeyValueList';
export { ActivityTimeline } from './data/ActivityTimeline';
export { AnimatedNumber } from './data/AnimatedNumber';
export { StatTile, type StatDelta } from './data/StatTile';
export { IconTile, HueChip, TILE_INK, TILE_SOFT_BG, type TileHue } from './data/IconTile';
export { MetricCard } from './data/MetricCard';
export { AmountStrip } from './data/AmountStrip';
export { RecordCard } from './data/RecordCard';
export { ContactButtons } from './data/ContactButtons';

// Charts (SVG/HTML on d3-scale + d3-shape; every chart has a data-table twin)
export * from './charts';

// Property presentation
export { Photo, IllustrativeChip } from './property/Photo';
export { PlotIllustration } from './property/PlotIllustration';

// Feedback
export { ToastProvider, useToast } from './feedback/Toast';
export { Skeleton, SkeletonBlock } from './feedback/Skeleton';
export { EmptyState, ErrorState, OfflineState, ForbiddenState, NotFoundState } from './feedback/States';
export { InlineAlert } from './feedback/InlineAlert';

// Overlays
export { Dialog } from './overlays/Dialog';
export { ConfirmDialog } from './overlays/ConfirmDialog';
export { Drawer } from './overlays/Drawer';
export { MenuButton, type MenuAction, type MenuGroup } from './overlays/Menu';
export { Tooltip } from './overlays/Tooltip';

// Layout
export { UrlTabs, type TabItem } from './layout/Tabs';
export { PillTabs, type PillTab } from './layout/PillTabs';
export { SegmentedControl } from './layout/SegmentedControl';
export { Breadcrumbs, type Crumb } from './layout/Breadcrumbs';
export { PageHeader } from './layout/PageHeader';
export { WorkspaceHeader } from './layout/WorkspaceHeader';
export { Panel } from './layout/Panel';
export { RelatedDrawer, type RelatedGroup } from './layout/RelatedDrawer';
export { PlannedScreenView } from './layout/PlannedScreenView';
export { QuickActions, type QuickAction } from './layout/QuickActions';
export { SectionHeading } from './layout/SectionHeading';
export { FilterPills, type FilterPill } from './layout/FilterPills';

// Motion (every effect is skipped under reduced motion)
export { Stagger, RevealItem, PageEnter } from './motion/Reveal';

// Forms
export { Form, zodResolver, useFormMeta } from './forms/Form';
export { PlainCheckbox, PlainTextArea, PlainTextField } from './forms/PlainFields';
export { TextField, TextAreaField, PhoneField, CnicField } from './forms/TextFields';
export { CheckboxField, RadioGroupField, SelectField, SelectControl, Switch, type Option } from './forms/ChoiceFields';
export { AsyncSelectField, type AsyncItem } from './forms/AsyncSelectField';
export { MultiSelectField } from './forms/MultiSelectField';
export { UnitPickerField, type UnitSelection } from './forms/UnitPickerField';
export { CurrencyField } from './forms/CurrencyField';
export { DateField } from './forms/DateField';
export { FileUploadField } from './forms/FileUploadField';

// Shell and command
export { AppShell } from './shell/AppShell';
export { CustomerShell } from './shell/CustomerShell';
export { DemoSignIn } from './shell/DemoSignIn';
export { useShell } from './shell/ShellContext';
export { LocaleToggle } from './shell/LocaleSwitcher';
export { NotificationList } from './shell/NotificationsPanel';
export { ShortcutList } from './shell/HelpMenu';
export { QuickCreateMenu, quickCreateAvailable } from './shell/QuickCreateMenu';
export { PROTOTYPE_NAV, withPrototypeTools, TENANT_NAV, TENANT_QUICK_CREATE, TENANT_SEARCH_SCOPES, navItemFor, evaluate, workspaceRouteTarget, suspensionOf, partyAreaLabelKey, contextualNav } from './workspace/tenantWorkspace';
export { AccessOutcomeView } from './layout/AccessOutcomeView';
export { CommandPalette } from './command/CommandPalette';
export type { NavItem, Destination, HelpKey, ShellLinks } from './shell/types';

// Utilities
export { cn } from './lib/cn';
export { useT, dynamicT } from './lib/useT';
export { useMediaQuery, useIsDesktop, useIsTabletUp, BREAKPOINTS } from './lib/useMediaQuery';
