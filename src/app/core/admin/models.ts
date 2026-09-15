export interface DashboardStats {
  totalUsers: number;
  totalDevelopers: number;
  totalSalesPeople: number;
  totalImplementators: number;
  totalTickets: number;
  newCount: number;
  assignedCount: number;
  inProgressCount: number;
  resolvedCount: number;
  rejectedCount: number;
  closedCount: number;
  pendingCount: number;
  newToday: number;
  newLast7Days: number;
  totalDeals: number;
  deliveryDatePendingDeals: number;
  totalCalls: number;
  totalReferrals: number;
  complaintsFromCalls: number;
  /** Developer/SalesPerson/Implementator accounts without a complete ID card (number + front + back). */
  missingIdCardCount: number;
  /** Customer companies (excludes the internal one). */
  totalCompanies: number;
}

/** One developer's workload card on the Admin Dashboard's Developers drill-down. */
export interface DeveloperWorkload {
  developerId: string;
  developerDisplayName: string;
  totalParties: number;
  pendingTasks: number;
  completedTasks: number;
  totalTasks: number;
  pendingAmount: number;
}

/** One sales person's workload card on the Admin Dashboard's Sales drill-down. referralCallsCount: calls logged to existing customers in range. leadCallsCount: follow-up calls made to referred people in range. dealsCount/leadCallsCount together are the "Total Active Sale" ratio (e.g. "2/4"). */
export interface SalesPersonWorkload {
  salesPersonUserId: string;
  salesPersonDisplayName: string;
  warmCount: number;
  dealsCount: number;
  warmToCoolCount: number;
  pendingAmount: number;
  referralCallsCount: number;
  leadCallsCount: number;
  referralsCollectedCount: number;
}

/** One implementator's task-triage activity card on the Admin Dashboard's Implementators drill-down. triagedCount: every Assign/Resolve/Reject/mark-as-Sale action they performed in range. */
export interface ImplementatorWorkload {
  implementatorUserId: string;
  implementatorDisplayName: string;
  triagedCount: number;
}

export interface PersonSummary {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
  createdAtUtc: string;
  lastLoginAtUtc: string | null;
  openTicketCount: number;
  /** Every user belongs to exactly one Company/Branch — see ADR-005. displayName is the *person's* name, not the company's. */
  companyName: string;
  branchName: string;
  /** Internal-staff only — false for a Party or for staff still missing a number / front / back. */
  idCardComplete: boolean;
}

/** Gender / DeveloperType / Rank / ID-card-number — shared by the create and edit forms. All optional. */
export interface EmployeeProfileFields {
  gender?: string;
  developerTypeId?: number | null;
  rankId?: number | null;
  idCardNumber?: string | null;
}

export interface UpdateStaffRequest {
  displayName: string;
  email: string;
  branchId?: string;
  profile: EmployeeProfileFields;
}

export interface SetStaffPasswordRequest {
  newPassword: string;
}

export interface LookupValue {
  id: number;
  name: string;
}

/** One row in the dashboard "Missing ID Card" popup. */
export interface StaffMissingIdCardRow {
  id: string;
  displayName: string;
  role: string;
  developerTypeName?: string | null;
  rankName?: string | null;
  branchName: string;
}

/** The employee-profile block on PersonDetail. */
export interface EmployeeProfileDetail {
  gender: string;
  developerTypeId: number | null;
  developerTypeName: string | null;
  rankId: number | null;
  rankName: string | null;
  idCardNumber: string | null;
  hasIdCardFront: boolean;
  hasIdCardBack: boolean;
  idCardComplete: boolean;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface CreatePartyRequest {
  displayName: string;
  email: string;
  location: string;
  branch: string;
  phoneNumber: string;
  password: string;
  /** Optional — an existing customer Company's id, from the Company/Branch picker. Adds a new Branch under it instead of a brand-new Company. Ignored if branchId is also given. See sales-person-role.md. */
  companyId?: string;
  /** Optional — an existing, currently-unowned customer Branch's id (typically pre-created via the Companies page — see company-management.md). This Party becomes its owner directly; the branch field above is ignored. Takes priority over companyId. */
  branchId?: string;
  /** Whether this Party may file complaints/subcomplaints themselves. Defaults true (the normal case) — set false for a Party who should only ever have complaints filed on their behalf. */
  canSelfFileComplaints?: boolean;
}

export interface SetPartyComplaintPermissionRequest {
  canSelfFileComplaints: boolean;
}

export interface CreateStaffRequest {
  displayName: string;
  email: string;
  password: string;
  /** An existing Branch of the internal Company, from the Company/Branch picker. The form requires it; the backend defaults to the one internal Branch when omitted. */
  branchId?: string;
  profile: EmployeeProfileFields;
}

export type CreateDeveloperRequest = CreateStaffRequest;
export type CreateSalesPersonRequest = CreateStaffRequest;
export type CreateImplementatorRequest = CreateStaffRequest;

/** One row of the Admin "add user" Company/Branch picker and the standalone Companies page — see sales-person-role.md and company-management.md. */
export interface BranchOption {
  branchId: string;
  branchName: string;
  companyId: string;
  companyName: string;
  isInternal: boolean;
  /** Null when this (customer) Branch has no owner yet — e.g. pre-created via the Companies page. Always null for an internal Branch. */
  ownerUserId: string | null;
}

/** Creates a brand-new Company + its first Branch, no owning User. See company-management.md. */
export interface CreateCompanyRequest {
  companyName: string;
  /** Defaults to "Head Office" server-side when omitted. */
  branchName?: string;
}

/** Adds a Branch to an already-existing Company — customer or internal alike. */
export interface CreateBranchRequest {
  branchName: string;
}

/** One row of the Companies management list. */
export interface CompanyListItem {
  id: string;
  name: string;
  isInternal: boolean;
  branchCount: number;
  userCount: number;
  createdAtUtc: string;
  /** Who explicitly added this company, and when (createdAtUtc above) — null if it was never added through this screen. */
  createdByUserId: string | null;
  createdByDisplayName: string | null;
}

export interface CompanyBranch {
  id: string;
  name: string;
  ownerUserId: string | null;
}

export interface CompanyUser {
  id: string;
  displayName: string;
  email: string;
  role: string;
  branchId: string;
  branchName: string;
  location: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  createdAtUtc: string;
}

export interface CompanyDetail {
  id: string;
  name: string;
  isInternal: boolean;
  createdAtUtc: string;
  createdByUserId: string | null;
  createdByDisplayName: string | null;
  branches: CompanyBranch[];
  users: CompanyUser[];
}

export interface AddCompanyUserRequest {
  displayName: string;
  email: string;
  branchId: string;
  location?: string;
  phoneNumber?: string;
  password: string;
}

export interface UpdateCompanyRequest {
  companyName: string;
}

export interface UpdateBranchRequest {
  branchName: string;
}

export interface UpdateCompanyUserRequest {
  displayName: string;
  email: string;
  branchId: string;
  location?: string;
  phoneNumber?: string;
}

export interface PersonDetail {
  id: string;
  displayName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAtUtc: string;
  lastLoginAtUtc: string | null;
  location: string | null;
  branch: string | null;
  phoneNumber: string | null;
  openTicketCount: number;
  totalTicketCount: number;
  /** Party-only — whether they may file complaints/subcomplaints themselves. Meaningless (always true) for a staff role. */
  canSelfFileComplaints: boolean;
  /** Internal-staff (Developer/SalesPerson/Implementator) employee profile — null for a Party. */
  employeeProfile: EmployeeProfileDetail | null;
}
