/** A Branch Admin's own self-service team — everyone sharing their Company/Branch. See docs/modules/company-management.md. */
export interface TeamMember {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
  createdAtUtc: string;
}

/** Always creates a plain User on the caller's own Branch — never another Branch Admin. */
export interface CreateTeamMemberRequest {
  displayName: string;
  email: string;
  password: string;
}
