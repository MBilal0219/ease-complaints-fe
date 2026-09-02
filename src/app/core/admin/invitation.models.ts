export type InvitationRole = 'Developer' | 'User';

export interface Invitation {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAtUtc: string;
  expiresAtUtc: string;
  acceptedAtUtc: string | null;
  revokedAtUtc: string | null;
  status: 'Pending' | 'Accepted' | 'Revoked' | 'Expired';
}

export interface CreateInvitationRequest {
  email: string;
  displayName: string;
  role: InvitationRole;
  /** Required when role is 'User' (a Party) — ignored for Developer invitations. */
  location?: string;
  branch?: string;
  phoneNumber?: string;
}
