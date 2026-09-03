export interface DashboardStats {
  totalUsers: number;
  totalDevelopers: number;
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
}

export interface PersonSummary {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
  createdAtUtc: string;
  lastLoginAtUtc: string | null;
  openTicketCount: number;
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
}

export interface CreateDeveloperRequest {
  displayName: string;
  email: string;
  password: string;
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
