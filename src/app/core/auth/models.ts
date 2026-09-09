export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

export interface AuthSessionSummary {
  id: string;
  isCurrent: boolean;
  createdAtUtc: string;
  lastSeenAtUtc: string;
  expiresAtUtc: string;
  ipAddress: string | null;
  deviceType: string | null;
  deviceName: string | null;
  platform: string | null;
  browser: string | null;
}

export interface InvitationValidation {
  valid: boolean;
  email?: string;
  displayName?: string;
  role?: string;
}

export const ROLE_ADMIN = 'Admin';
export const ROLE_DEVELOPER = 'Developer';
export const ROLE_USER = 'User';
export const ROLE_SALES_PERSON = 'SalesPerson';
/** Layered on top of ROLE_USER, never instead of it — see backend RoleNames.BranchAdmin's own doc comment. */
export const ROLE_BRANCH_ADMIN = 'BranchAdmin';
/** Account management only for now — see backend RoleNames.Implementator's own doc comment. */
export const ROLE_IMPLEMENTATOR = 'Implementator';
