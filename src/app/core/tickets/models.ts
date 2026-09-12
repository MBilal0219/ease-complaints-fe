export type TicketStatus = 'New' | 'Assigned' | 'InProgress' | 'Resolved' | 'Rejected' | 'Closed' | 'Revoked' | 'Sale' | 'Cancelled';

export type DealStatus = 'DeliveryDatePending' | 'Scheduled' | 'Completed';

/** Present once a ticket's status is 'Sale' — see docs/modules/sales-deals.md. */
export interface DealSummary {
  id: string;
  estimatedAmount: number;
  deliveryDate: string | null;
  status: DealStatus;
}

export interface Deal {
  id: string;
  ticketId: string;
  ticketNumber: string;
  ticketTitle: string;
  estimatedAmount: number;
  deliveryDate: string | null;
  status: DealStatus;
  createdByDisplayName: string;
  createdAtUtc: string;
  completedAtUtc: string | null;
}

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  DeliveryDatePending: 'Delivery date pending',
  Scheduled: 'Scheduled',
  Completed: 'Completed',
};

export const DEAL_STATUS_BADGE_CLASSES: Record<DealStatus, string> = {
  DeliveryDatePending: 'bg-amber-100 text-amber-700',
  Scheduled: 'bg-sky-100 text-sky-700',
  Completed: 'bg-green-100 text-green-700',
};

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
  /** Null when this complaint was created by an Implementator/Admin with no Party attached. */
  createdByUserId: string | null;
  createdByDisplayName: string;
  createdByEmail: string;
  /** The creating Party's Company — empty for an Implementator-created "no party" ticket. */
  companyName: string;
  assignedDeveloperId: string | null;
  assignedDeveloperDisplayName: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  resolvedAtUtc: string | null;
  closedAtUtc: string | null;
  revokedAtUtc: string | null;
  /** Set when a Sales Person filed this complaint during a call — see docs/modules/complaint-workflow-v2.md. */
  sourceCallId: string | null;
  deal: DealSummary | null;
  /** Sum of each root message's latest Sale-outcome sub-complaint amount, or null if none. Omitted for a Party viewer unless the Admin has turned on TicketSettings.showSaleAmountToParty. */
  totalSubComplaintSaleAmount: number | null;
  /** This complaint's subcomplaints/tasks — see TicketTaskDto. Null for a Party viewer (they see only the overall status above and their own conversation, never per-task detail). */
  tasks: TicketTaskDto[] | null;
  /** Sum of every task's Amount, or null if none set. Independent of totalSubComplaintSaleAmount above (a separate, older mechanic). */
  totalTaskAmount: number | null;
}

// ---- Subcomplaints/tasks — see Entities/TicketTask.cs on the backend ----

export type TicketTaskStatus = 'Pending' | 'Assigned' | 'InProgress' | 'OnHold' | 'Resolved' | 'Rejected' | 'Cancelled' | 'Reopened' | 'Sale';

export const TICKET_TASK_STATUS_LABELS: Record<TicketTaskStatus, string> = {
  Pending: 'Pending',
  Assigned: 'Assigned',
  InProgress: 'In Progress',
  OnHold: 'On Hold',
  Resolved: 'Resolved',
  Rejected: 'Rejected',
  Cancelled: 'Cancelled',
  Reopened: 'Reopened',
  Sale: 'Sale',
};

export const TICKET_TASK_STATUS_BADGE_CLASSES: Record<TicketTaskStatus, string> = {
  Pending: 'bg-blue-100 text-blue-700',
  Assigned: 'bg-amber-100 text-amber-700',
  InProgress: 'bg-purple-100 text-purple-700',
  OnHold: 'bg-yellow-100 text-yellow-800',
  Resolved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Cancelled: 'bg-slate-200 text-slate-600',
  Reopened: 'bg-sky-100 text-sky-700',
  Sale: 'bg-fuchsia-100 text-fuchsia-700',
};

/** A task is "active" work a developer should see — not Rejected/Cancelled/Resolved/Sale. Mirrors the backend's derived-status/Kanban-visibility rule. */
export const ACTIVE_TASK_STATUSES: TicketTaskStatus[] = ['Pending', 'Assigned', 'InProgress', 'OnHold', 'Reopened'];

export interface TicketTaskEffort {
  developerId: string;
  developerDisplayName: string;
  effortMinutes: number;
}

/**
 * One status transition on a task, rendered as a reply/activity entry
 * against the original subcomplaint — never a replacement of it.
 * changedByUserId/changedByDisplayName come back null for a Party viewer
 * (staff identity is redacted); render "you" client-side when
 * changedByUserId matches the current user's own id, never sent as literal
 * text by the server.
 */
export interface TicketTaskActivityDto {
  id: string;
  fromStatus: TicketTaskStatus | null;
  toStatus: TicketTaskStatus;
  changedByUserId: string | null;
  changedByDisplayName: string | null;
  changedByRole: string;
  changedAtUtc: string;
  reason: string | null;
  attachments: TicketAttachmentDto[];
}

export interface TicketTaskDto {
  id: string;
  ticketId: string;
  sequenceNumber: number;
  title: string | null;
  description: string;
  status: TicketTaskStatus;
  currentDeveloperId: string | null;
  currentDeveloperDisplayName: string | null;
  estimatedMinutes: number | null;
  amount: number | null;
  lastRejectReason: string | null;
  lastCancelReason: string | null;
  assignmentCount: number;
  totalEffortMinutes: number;
  perDeveloperEffort: TicketTaskEffort[];
  /** The developer's actual work clock — every interval spent InProgress, paused by OnHold. Not the same as totalEffortMinutes above (which counts the whole time a developer has been assigned, regardless of pauses). */
  inProgressElapsedMinutes: number;
  /** Files attached to this subcomplaint's own original submission. */
  attachments: TicketAttachmentDto[];
  /** The reply/activity feed — every status change with its reason and attachments. */
  activity: TicketTaskActivityDto[];
  createdByUserId: string;
  createdByDisplayName: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  resolvedAtUtc: string | null;
}

export interface CreateTicketTaskRequest {
  title?: string;
  description: string;
  estimateValue?: number;
  estimateUnit?: EstimateUnit;
  amount?: number;
  files?: File[];
}

/** The Party's own "submit a subcomplaint" request — Title is required (unlike CreateTicketTaskRequest's optional one). Every subcomplaint is Party-authored; the Implementator/Admin only triages it. */
export interface SubmitSubComplaintRequest {
  title: string;
  description: string;
  files?: File[];
}

export interface UpdateTicketTaskStatusRequest {
  status: TicketTaskStatus;
  /** Mandatory (enforced server-side) when status is Rejected, Resolved, or Cancelled. */
  reason?: string;
  files?: File[];
}

/** Implementator/Admin's "Add as Sale" — a lightweight per-task outcome (amount + description), not the ticket-level Deal subsystem. */
export interface MarkTicketTaskAsSaleRequest {
  amount: number;
  description: string;
  files?: File[];
}

/** "Minutes"|"Hours"|"Days"|"Weeks"|"Months" — a human-scale duration picker; normalized to minutes for storage. */
export type EstimateUnit = 'Minutes' | 'Hours' | 'Days' | 'Weeks' | 'Months';

export const ESTIMATE_UNITS: EstimateUnit[] = ['Minutes', 'Hours', 'Days', 'Weeks', 'Months'];

const MINUTES_PER_UNIT: Record<EstimateUnit, number> = {
  Minutes: 1,
  Hours: 60,
  Days: 60 * 24,
  Weeks: 60 * 24 * 7,
  Months: 60 * 24 * 30,
};

export function estimateToMinutes(value: number, unit: EstimateUnit): number {
  return Math.round(value * MINUTES_PER_UNIT[unit]);
}

/** Display-only — one step coarser than EstimateUnit's pickable list. "Year" only ever shows up when rendering a duration (e.g. accumulated effort); it's never an option in the Set Estimate dropdown since the backend's TicketTaskEstimateUnits doesn't recognize it. */
const DURATION_DISPLAY_UNITS: [string, number][] = [
  ['year', MINUTES_PER_UNIT.Months * 12],
  ['month', MINUTES_PER_UNIT.Months],
  ['week', MINUTES_PER_UNIT.Weeks],
  ['day', MINUTES_PER_UNIT.Days],
  ['hour', MINUTES_PER_UNIT.Hours],
  ['minute', 1],
];

/** Renders a duration as its two largest units — "2 hours 9 minutes" / "5 days 14 hours" — instead of a single unit that either loses precision (rounding to "2.2 hours") or stays needlessly granular ("129 minutes"). */
export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  const total = Math.round(minutes);
  if (total === 0) return '0 minutes';

  const parts: string[] = [];
  let remaining = total;
  for (const [label, unitMinutes] of DURATION_DISPLAY_UNITS) {
    if (parts.length === 2) break;
    if (remaining < unitMinutes) continue;
    const value = Math.floor(remaining / unitMinutes);
    remaining -= value * unitMinutes;
    parts.push(`${value} ${value === 1 ? label : label + 's'}`);
  }
  return parts.join(' ');
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

/** The Implementator/Admin's own "Create Complaint" — with an existing Party attached, or none at all. */
export interface CreateTicketAsImplementatorRequest {
  title: string;
  description: string;
  categoryId: number;
  priorityId: number;
  /** Null/omitted = "no party". */
  partyUserId?: string | null;
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
  /// Arbitrary date range (e.g. the Admin Dashboard's Developer/Sales drill-down) — an alternative to dateRange, not combined with it in practice.
  dateFrom?: string;
  dateTo?: string;
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

/** What a Developer/Admin reply attaches to a specific root message, treating it as its own "sub-complaint" — the same three actions a whole ticket has (status, reassignment, Sale conversion), just scoped to one message. */
export type TicketMessageOutcomeStatus = 'InProgress' | 'Resolved' | 'Rejected' | 'Sale';

export const TICKET_MESSAGE_OUTCOME_LABELS: Record<TicketMessageOutcomeStatus, string> = {
  InProgress: 'In Progress',
  Resolved: 'Resolved',
  Rejected: 'Rejected',
  Sale: 'Sale',
};

export const TICKET_MESSAGE_OUTCOME_BADGE_CLASSES: Record<TicketMessageOutcomeStatus, string> = {
  InProgress: 'bg-purple-100 text-purple-700',
  Resolved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Sale: 'bg-fuchsia-100 text-fuchsia-700',
};

export interface TicketMessageDto {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorDisplayName: string;
  body: string;
  createdAtUtc: string;
  attachments: TicketAttachmentDto[];
  /** Set when this message is a sub-complaint reply — the root message it targets. */
  parentMessageId: string | null;
  outcomeStatus: TicketMessageOutcomeStatus | null;
  /** Omitted for a Party viewer unless the Admin has turned on TicketSettings.showSaleAmountToParty. Present only when outcomeStatus === 'Sale'. */
  saleAmount: number | null;
  reassignedToDeveloperId: string | null;
  reassignedToDeveloperDisplayName: string | null;
  /** 'Party' | 'Developer' | null — null means this predates the conversation split and is shown in both threads. See req #16. */
  audience: TicketMessageAudience | null;
}

/** Party↔Implementator and Developer↔Implementator are kept as two separate conversation threads. */
export type TicketMessageAudience = 'Party' | 'Developer';

/** Posting a plain reply needs only body/files; replying to a specific message as its own sub-complaint additionally needs parentMessageId + outcomeStatus (Admin/assigned-Developer only). */
export interface PostMessageOutcome {
  parentMessageId: string;
  outcomeStatus: TicketMessageOutcomeStatus;
  saleAmount?: number | null;
  reassignedToDeveloperId?: string | null;
}

export interface TicketSettings {
  showSaleAmountToParty: boolean;
}

/// No resolved count — that's still an internal "awaiting Admin review" state folded into inProgressCount. Rejected is its own count now — a Party sees a rejection immediately, only Resolved stays masked as In Progress until an Admin formally closes it.
export interface PartyDashboardStats {
  totalComplaints: number;
  newCount: number;
  assignedCount: number;
  inProgressCount: number;
  rejectedCount: number;
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
  Sale: 'Sale',
  Cancelled: 'Cancelled',
};

export const TICKET_STATUS_BADGE_CLASSES: Record<TicketStatus, string> = {
  New: 'bg-blue-100 text-blue-700',
  Assigned: 'bg-amber-100 text-amber-700',
  InProgress: 'bg-purple-100 text-purple-700',
  Resolved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Closed: 'bg-slate-200 text-slate-600',
  Revoked: 'bg-orange-100 text-orange-700',
  Sale: 'bg-fuchsia-100 text-fuchsia-700',
  Cancelled: 'bg-slate-200 text-slate-600',
};

export interface StatusOption {
  value: TicketStatus;
  label: string;
}

/// The Admin dashboard's "Pending" card is New+Assigned+InProgress combined — this is both what that card links to and what the Admin tickets filter's "Pending" option expands to before it's sent to the backend (as `status=New,Assigned,InProgress`, comma-joined).
export const PENDING_STATUSES: TicketStatus[] = ['New', 'Assigned', 'InProgress'];
export const PENDING_STATUS_QUERY_VALUE = PENDING_STATUSES.join(',');

/// The Admin Dashboard's Developer drill-down "Incomplete/Complete/All" status filter — same New+Assigned+InProgress set as "Pending" above (renamed in that context since "Incomplete work" reads better for a task-workload table) plus its Complete-side counterpart.
export const INCOMPLETE_STATUSES: TicketStatus[] = ['New', 'Assigned', 'InProgress'];
export const INCOMPLETE_STATUS_QUERY_VALUE = INCOMPLETE_STATUSES.join(',');
export const COMPLETE_STATUSES: TicketStatus[] = ['Resolved', 'Closed', 'Sale'];
export const COMPLETE_STATUS_QUERY_VALUE = COMPLETE_STATUSES.join(',');

/// The Developer dashboard's "High priority (incl. Urgent)" card combines two priority names — a synthetic filter value the Kanban table's priority dropdown understands, matching either.
export const HIGH_OR_URGENT_PRIORITY_VALUE = 'HighOrUrgent';

/**
 * What the Admin status-pill dropdown offers, computed from the ticket's
 * current state — deliberately narrow (the backend enforces the same
 * restrictions independently, see TicketService.UpdateStatusAsAdminAsync):
 * InProgress always comes from a Developer's own action, Closed always goes
 * through the dedicated "Close ticket" flow (so a closing note can be
 * collected), and Sale always goes through the dedicated "Convert to Sale"
 * flow (so an Estimated Amount can be collected) — none of those three ever
 * appear here. Resolve/Reject ("Cancel" in the UI — see
 * docs/modules/complaint-workflow-v2.md) are the two Admin can set directly
 * from this dropdown.
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
  if (ticket.status === 'Revoked' || ticket.status === 'Sale' || ticket.status === 'Cancelled') {
    return [];
  }

  const options: StatusOption[] = [];
  if (includeAssign) {
    options.push({ value: 'Assigned', label: ticket.assignedDeveloperId ? 'Reassign' : 'Assign developer' });
  }
  options.push({ value: 'Resolved', label: 'Resolve' });
  options.push({ value: 'Rejected', label: 'Cancel' });
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

/// A card's left-border accent — same urgency scale as PRIORITY_BADGE_CLASSES, just as a border-left color instead of a badge fill.
export const PRIORITY_BORDER_CLASSES: Record<string, string> = {
  low: 'border-l-slate-300',
  medium: 'border-l-sky-400',
  high: 'border-l-orange-400',
  urgent: 'border-l-red-500',
};

export function priorityBorderClass(priorityName: string): string {
  return PRIORITY_BORDER_CLASSES[priorityName.toLowerCase()] ?? 'border-l-slate-300';
}

/// Categories are admin-configurable (no fixed set), so colors are assigned deterministically by hashing the name into a fixed palette — the same category always renders the same color without a hardcoded name→color table.
const CATEGORY_COLOR_PALETTE: string[] = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
  'bg-violet-100 text-violet-700',
  'bg-lime-100 text-lime-700',
  'bg-rose-100 text-rose-700',
];

export function categoryBadgeClasses(categoryName: string): string {
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) hash = (hash * 31 + categoryName.charCodeAt(i)) | 0;
  return CATEGORY_COLOR_PALETTE[Math.abs(hash) % CATEGORY_COLOR_PALETTE.length];
}
