import { CreateTicketRequest } from '../tickets/models';
import { CreateLeadRequest, LeadSummary } from '../leads/models';

export type CallOutcome = 'Complaint' | 'Payment' | 'Notes';
export type PaymentCallStatus = 'Cleared' | 'PartiallyCleared' | 'Extended' | 'Other';

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  Complaint: 'Complaint',
  Payment: 'Payment',
  Notes: 'Notes',
};

export const CALL_OUTCOME_BADGE_CLASSES: Record<CallOutcome, string> = {
  Complaint: 'bg-rose-100 text-rose-700',
  Payment: 'bg-amber-100 text-amber-700',
  Notes: 'bg-slate-100 text-slate-700',
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
  /** Required when outcome is Complaint, must be omitted otherwise. */
  complaint?: CreateTicketRequest | null;
}

/** Narrow edit — only the field matching the call's EXISTING outcome is honored; outcome itself and the referrals collected are immutable after creation. A Complaint-outcome call rejects this entirely (edit the ticket instead). */
export interface UpdateCallRequest {
  /** Required when the call's outcome is Notes, must be omitted otherwise. */
  notes?: string | null;
  /** Required when the call's outcome is Payment, must be omitted otherwise. */
  paymentDetail?: CreateCallPaymentDetailRequest | null;
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
  salesPersonUserId: string;
  salesPersonDisplayName: string;
  outcome: CallOutcome;
  leadCount: number;
  previewText: string;
  createdAtUtc: string;
}

/** Admin/Developer-safe — never carries payment info, see backend CallDetailDto's own doc comment. */
export interface CallDetail extends CallSummary {
  notes: string | null;
  createdTicketId: string | null;
  ticketNumber: string | null;
  leads: LeadSummary[];
}

export interface CallPaymentDetail {
  status: PaymentCallStatus;
  amountCleared: number | null;
  remarks: string | null;
}

/** Sales Person only. */
export interface CallDetailWithPayment extends CallDetail {
  paymentDetail: CallPaymentDetail | null;
}
