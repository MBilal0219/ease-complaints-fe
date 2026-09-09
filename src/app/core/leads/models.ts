/** "Lead" everywhere in the UI — a prospective customer not yet fully added to the system, see docs/modules/leads.md. `Referral`/`Direct` distinguish *how* it came in and surface as the per-entry status badge (LEAD_SOURCE_LABELS below), not as the page/concept name. */
export type LeadSource = 'Referral' | 'Direct';

/** Status badge for *how* this lead came in — did it come out of a logged call, or get added directly through the "+ Add Lead" form? */
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  Referral: 'Referral',
  Direct: 'New Added',
};

export const LEAD_SOURCE_BADGE_CLASSES: Record<LeadSource, string> = {
  Referral: 'bg-indigo-100 text-indigo-700',
  Direct: 'bg-slate-200 text-slate-700',
};

/** Backend enum member is still `APlus` (see LeadCategory.cs — no data migration needed for a label-only rename) — the UI now calls it "Hot", per user feedback ("keep three options: cool, warm, hot"). Auto-selected when a follow-up's Status is set to Won — see lead-detail.ts's onStatusChange. */
export type LeadCategory = 'APlus' | 'Cool' | 'Warm';

export const LEAD_CATEGORY_LABELS: Record<LeadCategory, string> = {
  APlus: 'Hot',
  Cool: 'Cool',
  Warm: 'Warm',
};

export const LEAD_CATEGORY_BADGE_CLASSES: Record<LeadCategory, string> = {
  APlus: 'bg-orange-100 text-orange-700',
  Cool: 'bg-sky-100 text-sky-700',
  Warm: 'bg-amber-100 text-amber-700',
};

/** What happened with one follow-up attempt — orthogonal to LeadCategory (how warm). See LeadFollowUpStatus on the backend. */
export type LeadFollowUpStatus = 'InProgress' | 'Won' | 'Cancelled';

export const LEAD_STATUS_LABELS: Record<LeadFollowUpStatus, string> = {
  InProgress: 'In Progress',
  Won: 'Won',
  Cancelled: 'Cancelled',
};

export const LEAD_STATUS_BADGE_CLASSES: Record<LeadFollowUpStatus, string> = {
  InProgress: 'bg-slate-200 text-slate-700',
  Won: 'bg-emerald-100 text-emerald-700',
  Cancelled: 'bg-red-100 text-red-700',
};

/** Status of the Won-conversion invitation email (the "send invitation" path only — see LeadDetail.pendingInvitation). Null/absent everywhere else: never won, won by direct password, or already converted (isConverted flips true instead). */
export type LeadInvitationStatus = 'Pending' | 'Accepted' | 'Revoked' | 'Expired';

export const LEAD_INVITATION_STATUS_LABELS: Record<LeadInvitationStatus, string> = {
  Pending: 'Invite pending',
  Accepted: 'Invite accepted',
  Revoked: 'Invite revoked',
  Expired: 'Invite expired',
};

export const LEAD_INVITATION_STATUS_BADGE_CLASSES: Record<LeadInvitationStatus, string> = {
  Pending: 'bg-amber-100 text-amber-700',
  Accepted: 'bg-emerald-100 text-emerald-700',
  Revoked: 'bg-slate-200 text-slate-700',
  Expired: 'bg-red-100 text-red-700',
};

export interface LeadPendingInvitation {
  id: string;
  email: string;
  status: LeadInvitationStatus;
  createdAtUtc: string;
  expiresAtUtc: string;
}

/**
 * Fields shared by a call-collected lead and a directly-added one — see
 * docs/modules/leads.md. Deliberately no category here — a lead starts
 * uncategorized; category is only ever set via a follow-up.
 */
export interface CreateLeadRequest {
  name: string;
  contact: string;
  businessName?: string | null;
  businessContact?: string | null;
  post?: string | null;
  businessNature?: string | null;
  remarks?: string | null;
  feedback?: string | null;
  /** Optional — captured up front so it doesn't have to be chased down later at deal-close time. */
  email?: string | null;
}

export interface CreateFollowUpRequest {
  remarks?: string | null;
  category: LeadCategory;
  feedback?: string | null;
  status: LeadFollowUpStatus;
  /** Required when status === 'Cancelled'. */
  cancellationReason?: string | null;
  /** Only honored when status === 'InProgress'. ISO datetime. */
  scheduledNextCallUtc?: string | null;
  /** Only accepted once the lead is won (this follow-up or an earlier one). */
  agreementAmount?: number | null;
  /** Only used the first time a lead is won and has no email yet. */
  email?: string | null;
  /** True: send an email invitation. False: create the account immediately with `password`. */
  sendInvite?: boolean;
  password?: string | null;
}

export interface LeadSummary {
  id: string;
  source: LeadSource;
  callId: string | null;
  customerDisplayName: string | null;
  name: string;
  businessName: string | null;
  /** Null until the first follow-up — see CreateLeadRequest's own doc comment. */
  currentCategory: LeadCategory | null;
  currentStatus: LeadFollowUpStatus | null;
  isConverted: boolean;
  pendingInvitationStatus: LeadInvitationStatus | null;
  followUpCount: number;
  createdByDisplayName: string;
  createdByRole: string;
  createdAtUtc: string;
  lastActivityAtUtc: string;
}

export interface LeadTimelineEntry {
  type: 'Initial' | 'FollowUp';
  actorDisplayName: string;
  actorRole: string;
  remarks: string | null;
  /** Null on the "Initial" entry; always set on a "FollowUp" entry. */
  category: LeadCategory | null;
  status: LeadFollowUpStatus | null;
  cancellationReason: string | null;
  scheduledNextCallUtc: string | null;
  agreementAmount: number | null;
  feedback: string | null;
  createdAtUtc: string;
}

export interface LeadAgreementDocument {
  id: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByDisplayName: string;
  uploadedAtUtc: string;
}

export interface LeadDetail {
  id: string;
  source: LeadSource;
  callId: string | null;
  customerDisplayName: string | null;
  name: string;
  contact: string;
  businessName: string | null;
  businessContact: string | null;
  post: string | null;
  businessNature: string | null;
  email: string | null;
  currentCategory: LeadCategory | null;
  currentStatus: LeadFollowUpStatus | null;
  isConverted: boolean;
  convertedUserId: string | null;
  agreementAmount: number | null;
  agreementDocuments: LeadAgreementDocument[];
  pendingInvitation: LeadPendingInvitation | null;
  createdByDisplayName: string;
  createdByRole: string;
  createdAtUtc: string;
  timeline: LeadTimelineEntry[];
}
