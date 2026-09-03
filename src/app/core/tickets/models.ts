export type TicketStatus = 'New' | 'Assigned' | 'InProgress' | 'Resolved' | 'Rejected' | 'Closed' | 'Revoked';

export interface CategoryDto {
  id: number;
  name: string;
}

export interface PriorityDto {
  id: number;
  name: string;
}

export interface TicketLookups {
  categories: CategoryDto[];
  priorities: PriorityDto[];
}

export interface TicketDto {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: TicketStatus;
  categoryId: number;
  categoryName: string;
  priorityId: number;
  priorityName: string;
  createdByUserId: string;
  createdByDisplayName: string;
  createdByEmail: string;
  assignedDeveloperId: string | null;
  assignedDeveloperDisplayName: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  resolvedAtUtc: string | null;
  closedAtUtc: string | null;
  revokedAtUtc: string | null;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface CreateTicketRequest {
  title: string;
  description: string;
  categoryId: number;
  priorityId: number;
}

export interface TicketFilter {
  /// One status, or several comma-separated (e.g. "New,Assigned,InProgress" — see PENDING_STATUSES).
  status?: string;
  categoryId?: number;
  priorityId?: number;
  assignedDeveloperId?: string;
  /// Admin-only — scopes the Admin tickets list to one Party's own complaints (reused by the Party profile page).
  createdByUserId?: string;
  /// "today" or "last7days" — mirrors the exact cutoff the dashboard stats use, so a card's count and the list it links to can never disagree.
  dateRange?: 'today' | 'last7days';
  search?: string;
  page: number;
  pageSize: number;
}

/// Matches the backend's FileCategory enum (Image/Archive/Other/Video).
export type AttachmentCategory = 'Image' | 'Archive' | 'Other' | 'Video';

export interface TicketAttachmentDto {
  id: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  category: AttachmentCategory;
  downloadUrl: string;
}

export interface TicketMessageDto {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorDisplayName: string;
  body: string;
  createdAtUtc: string;
  attachments: TicketAttachmentDto[];
}

/// No resolved/rejected counts — those are internal states folded into inProgressCount, matching the per-ticket status masking a Party receives.
export interface PartyDashboardStats {
  totalComplaints: number;
  newCount: number;
  assignedCount: number;
  inProgressCount: number;
  closedCount: number;
  revokedCount: number;
}

export interface DeveloperDashboardStats {
  totalAssigned: number;
  assignedCount: number;
  inProgressCount: number;
  resolvedCount: number;
  rejectedCount: number;
  closedCount: number;
  highPriorityActiveCount: number;
  urgentPriorityActiveCount: number;
}

/// Every status a New ticket can eventually reach, in the order the workflow visits them — used to render progress UI.
export const TICKET_STATUS_ORDER: TicketStatus[] = ['New', 'Assigned', 'InProgress', 'Resolved', 'Closed'];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  New: 'New',
  Assigned: 'Assigned',
  InProgress: 'In Progress',
  Resolved: 'Resolved',
  Rejected: 'Rejected',
  Closed: 'Closed',
  Revoked: 'Revoked',
};

export const TICKET_STATUS_BADGE_CLASSES: Record<TicketStatus, string> = {
  New: 'bg-blue-100 text-blue-700',
  Assigned: 'bg-amber-100 text-amber-700',
  InProgress: 'bg-purple-100 text-purple-700',
  Resolved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Closed: 'bg-slate-200 text-slate-600',
  Revoked: 'bg-orange-100 text-orange-700',
};

export interface StatusOption {
  value: TicketStatus;
  label: string;
}

/// The Admin dashboard's "Pending" card is New+Assigned+InProgress combined — this is both what that card links to and what the Admin tickets filter's "Pending" option expands to before it's sent to the backend (as `status=New,Assigned,InProgress`, comma-joined).
export const PENDING_STATUSES: TicketStatus[] = ['New', 'Assigned', 'InProgress'];
export const PENDING_STATUS_QUERY_VALUE = PENDING_STATUSES.join(',');

/// The Developer dashboard's "High priority (incl. Urgent)" card combines two priority names — a synthetic filter value the Kanban table's priority dropdown understands, matching either.
export const HIGH_OR_URGENT_PRIORITY_VALUE = 'HighOrUrgent';

/**
 * What the Admin status-pill dropdown offers, computed from the ticket's
 * current state — deliberately narrow (the backend enforces the same
 * restrictions independently, see TicketService.UpdateStatusAsAdminAsync):
 * InProgress/Resolved only ever come from a Developer's own action, and
 * Closed always goes through the dedicated "Close ticket" flow (so a
 * closing note can be collected) rather than this dropdown.
 *
 * @param includeAssign Pass false where a dedicated Assign/Reassign button
 * already exists next to the dropdown (ticket-detail) to avoid offering the
 * same action twice; true where the dropdown is the only inline control
 * (the tickets table).
 */
export function adminStatusOptionsFor(ticket: Pick<TicketDto, 'status' | 'assignedDeveloperId'>, includeAssign: boolean): StatusOption[] {
  if (ticket.status === 'Closed') {
    return [{ value: ticket.assignedDeveloperId ? 'Assigned' : 'New', label: 'Reopen' }];
  }
  if (ticket.status === 'Revoked') {
    return [];
  }

  const options: StatusOption[] = [];
  if (includeAssign) {
    options.push({ value: 'Assigned', label: ticket.assignedDeveloperId ? 'Reassign' : 'Assign developer' });
  }
  options.push({ value: 'Rejected', label: 'Reject' });
  return options;
}

/// Colored by "how urgently this needs attention" — matches the Priority seed data (Low/Medium/High/Urgent), case-insensitive with a neutral fallback for anything else.
export const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export function priorityBadgeClasses(priorityName: string): string {
  return PRIORITY_BADGE_CLASSES[priorityName.toLowerCase()] ?? 'bg-slate-100 text-slate-600';
}
