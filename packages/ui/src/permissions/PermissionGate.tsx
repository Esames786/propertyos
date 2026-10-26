import type { Permission } from '@repo/contracts';
import type { ReactNode } from 'react';
import { useSession } from './SessionProvider';

/**
 * Renders children only when the demo persona has the permission. Hiding UI is a usability aid,
 * not a security control: the transport (and later the backend) enforces access independently.
 */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | readonly Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useSession();
  const required = Array.isArray(permission) ? permission : [permission];
  return <>{required.every((p) => can(p as Permission)) ? children : fallback}</>;
}
