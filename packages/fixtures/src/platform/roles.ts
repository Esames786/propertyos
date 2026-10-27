/**
 * Platform HQ reads a tenant's own roles for "Preview as client" (see role-templates.ts): the
 * preview of a role is the effective access of the people who hold it, never a separate list.
 */
export { rolesOf } from '../role-templates';
