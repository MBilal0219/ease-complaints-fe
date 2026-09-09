import { CreateTicketRequest } from '../tickets/models';
import { CreateLeadRequest, LeadSummary } from '../leads/models';

export type CallOutcome = 'Complaint' | 'Payment' | 'Notes' | 'Commitment';
export type PaymentCallStatus = 'Cleared' | 'PartiallyCleared' | 'Extended' | 'Other';

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  Complaint: 'Complaint',
  Payment: 'Payment',
  Notes: 'Notes',
  Commitment: 'Commitment',
};

export const CALL_OUTCOME_BADGE_CLASSES: Record<CallOutcome, string> = {
  Complaint: 'bg-rose-100 text-rose-700',
  Payment: 'bg-amber-100 text-amber-700',
  Notes: 'bg-slate-100 text-slate-700',
  Commitment: 'bg-sky-100 text-sky-700',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentCallStatus, string> = {
  Cleared: 'Cleared',
  PartiallyCleared: 'Partially cleared',
  Extended: 'Extended',
  Other: 'Other',
};

export interface SalesPersonDashboardStats {
  totalCalls: number;
  totalReferrals: number;
  aPlusReferrals: number;
  coolReferrals: number;
  warmReferrals: number;
  complaintsFiled: number;
}

export interface CreateCallPaymentDetailRequest {
  status: PaymentCallStatus;
  amountCleared?: number | null;
  /** Meaningless once status is Cleared — the backend rejects a request that sets both. */
  dueDateUtc?: string | null;
  /** The outstanding balance still owed — same Cleared-means-omit rule as dueDateUtc. Applies whenever status isn't Cleared, including PartiallyCleared (a partial payment still leaves a real balance due). */
  amountDue?: number | null;
  remarks?: string | null;
}

/** A promise of future referrals instead of any given today — see CallCommitmentDetail on the backend. */
export interface CreateCallCommitmentDetailRequest {
  /** A specific date, or "a week/two weeks/a month from now" resolved to a concrete date before sending. */
  promisedDateUtc: string;
  /** Free text, e.g. "5" or "2-3" — not parsed as a strict numeric range. */
  referralCountRange: string;
  remarks?: string | null;
}

/** One atomic call log: the customer, any number of Leads, and exactly one outcome — see docs/modules/sales-person-calls.md. */
export interface CreateCallRequest {
  customerUserId: string;
  leads: CreateLeadRequest[];
  outcome: CallOutcome;
  /** Required when outcome is Notes, optional otherwise. */
  notes?: string | null;
  /** Required when outcome is Payment, must be omitted otherwise. */
  paymentDetail?: CreateCallPaymentDetailRequest | null;
  /** Required when outcome is Commitment, must be omitted otherwise. */
  commitmentDetail?: CreateCallCommitmentDetailRequest | null;
  /** Required when outcome is Complaint, must be omitted otherwise. */
  complaint?: CreateTicketRequest | null;
  /** Set when this call is logged as a follow-up to an earlier overdue/upcoming Payment call — must reference a call for the same customer, and outcome must be Payment. */
  followUpForCallId?: string | null;
}

/** Narrow edit — only the field matching the call's EXISTING outcome is honored; outcome itself and the referrals collected are immutable after creation. A Complaint-outcome call rejects this entirely (edit the ticket instead). */
export interface UpdateCallRequest {
  /** Required when the call's outcome is Notes, must be omitted otherwise. */
  notes?: string | null;
  /** Required when the call's outcome is Payment, must be omitted otherwise. */
  paymentDetail?: CreateCallPaymentDetailRequest | null;
  /** Required when the call's outcome is Commitment, must be omitted otherwise. */
  commitmentDetail?: CreateCallCommitmentDetailRequest | null;
}

/** List-row shape — a scannable summary, not the full detail. See CallDetail. */
export interface CallSummary {
  id: string;
  customerUserId: string;
  customerDisplayName: string;
  customerEmail: string;
  /** The customer's own Company/Branch — see ADR-005. customerDisplayName is the *person's* name, not the company's. */
  customerCompanyName: string;
  customerBranchName: string;
  /** Party-only business fields on User — null for a customer that never filled them in. */
  customerPhoneNumber: string | null;
  customerLocation: string | null;
  salesPersonUserId: string;
  salesPersonDisplayName: string;
  outcome: CallOutcome;
  leadCount: number;
  previewText: string;
  createdAtUtc: string;
}

export interface CallCommitmentDetail {
  promisedDateUtc: string;
  referralCountRange: string;
  remarks: string | null;
}

/** Admin/Developer-safe — never carries payment info, see backend CallDetailDto's own doc comment. CommitmentDetail is fine here — unlike payment, it's not private. */
export interface CallDetail extends CallSummary {
  notes: string | null;
  createdTicketId: string | null;
  ticketNumber: string | null;
  leads: LeadSummary[];
  commitmentDetail: CallCommitmentDetail | null;
}

export interface CallPaymentDetail {
  status: PaymentCallStatus;
  amountCleared: number | null;
  dueDateUtc: string | null;
  amountDue: number | null;
  remarks: string | null;
}

/** One entry in a Payment call's "Follow-ups made" history — see CallDetailWithPayment.followUpCalls. */
export interface CallFollowUpSummary {
  callId: string;
  createdAtUtc: string;
  salesPersonUserId: string;
  salesPersonDisplayName: string;
}

/** Sales Person only — everything CallDetail has, plus PaymentDetail when present, plus this Payment-adjacent follow-up chain. */
export interface CallDetailWithPayment extends CallDetail {
  paymentDetail: CallPaymentDetail | null;
  isFollowUp: boolean;
  followUpForCallId: string | null;
  followUpForCallCreatedAtUtc: string | null;
  /** How many later calls were logged as a follow-up to THIS one. */
  followUpCallCount: number;
  followUpCalls: CallFollowUpSummary[];
}

/** The two Payment Follow-Up dashboard cards' numbers — see SalesPersonService.getPaymentFollowUpSummary. */
export interface PaymentFollowUpSummary {
  overdueCount: number;
  overdueTotalAmount: number;
  upcomingCount: number;
  upcomingTotalAmount: number;
  totalAmount: number;
  paidAmount: number;
}

/** One row in the Overdue/Upcoming Payments popup — one per customer, from their latest Payment call. */
export interface PaymentFollowUpCustomer {
  customerUserId: string;
  customerDisplayName: string;
  customerCompanyName: string;
  customerPhoneNumber: string | null;
  /** The Payment call this row is based on — pass this as followUpForCallId when logging a follow-up call. */
  callId: string;
  status: PaymentCallStatus;
  amountDue: number | null;
  dueDateUtc: string | null;
}

/** One row in the Calls page's left-side customer directory sidebar. */
export interface CustomerDirectoryEntry {
  customerUserId: string;
  displayName: string;
  companyName: string;
  branchName: string;
  location: string | null;
  lastCallAtUtc: string | null;
  lastCallBySalesPersonUserId: string | null;
  lastCallBySalesPersonDisplayName: string | null;
}
