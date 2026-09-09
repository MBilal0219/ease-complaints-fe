export interface DashboardStats {
  totalUsers: number;
  totalDevelopers: number;
  totalSalesPeople: number;
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
}

export interface CreateDeveloperRequest {
  displayName: string;
  email: string;
  password: string;
  /** Optional — an existing Branch of the internal Company, from the Company/Branch picker. Defaults to the one internal Branch when omitted. */
  branchId?: string;
}

export interface CreateSalesPersonRequest {
  displayName: string;
  email: string;
  password: string;
  /** See CreateDeveloperRequest.branchId. */
  branchId?: string;
}

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
  branchName: string;
}

/** Adds a Branch to an already-existing Company — customer or internal alike. */
export interface CreateBranchRequest {
  branchName: string;
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
}
