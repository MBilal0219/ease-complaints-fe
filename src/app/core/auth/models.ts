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
