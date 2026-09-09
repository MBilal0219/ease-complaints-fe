export type ReportingPageSize = 'A4' | 'A5';
export type ReferralReportType = 'detailed' | 'summary';

/** For the Reports popup's Customer filter — every customer a call has actually been logged with, not the full customer database. */
export interface CustomerOption {
  id: string;
  displayName: string;
  email: string;
  companyName: string;
  branchName: string;
}

/** One LeadFollowUp entry, nested under its referral in the Detailed report. */
export interface ReferralFollowUp {
  createdAtUtc: string;
  category: string;
  remarks: string | null;
  feedback: string | null;
  actorDisplayName: string;
  /** 'InProgress' | 'Won' | 'Cancelled' — see LeadFollowUpStatus. */
  status: string;
  cancellationReason: string | null;
  scheduledNextCallUtc: string | null;
  agreementAmount: number | null;
}

/** One referral row for the Detailed report — see ReportsService. CustomerXxx fields are null for a Source == 'Direct' referral (not tied to any call/customer). currentCategory is this referral's status. */
export interface ReferralReportRow {
  leadId: string;
  leadName: string;
  leadContact: string;
  businessName: string | null;
  businessContact: string | null;
  post: string | null;
  businessNature: string | null;
  remarks: string | null;
  source: 'Referral' | 'Direct';
  currentCategory: string | null;
  currentStatus: string | null;
  isConverted: boolean;
  agreementAmount: number | null;
  createdAtUtc: string;
  followUps: ReferralFollowUp[];
  salesPersonUserId: string;
  salesPersonDisplayName: string;
  callId: string | null;
  customerUserId: string | null;
  customerDisplayName: string | null;
  customerCompanyName: string | null;
  customerBranchName: string | null;
}

/** How many calls were logged for one (salesPersonUserId, customerUserId) pairing — independent of whether any produced a referral. */
export interface SalesPersonCustomerCallCount {
  salesPersonUserId: string;
  customerUserId: string;
  callCount: number;
}

export interface DetailedReferralReportPage {
  items: ReferralReportRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  callCounts: SalesPersonCustomerCallCount[];
}

export interface DetailedReferralReportAll {
  items: ReferralReportRow[];
  callCounts: SalesPersonCustomerCallCount[];
}

/** One row for the Summarized report — grouped by customer. customerUserId is null for the synthetic "Direct additions" row (totalCalls always 0 there). */
export interface ReferralReportSummaryRow {
  customerUserId: string | null;
  customerDisplayName: string;
  customerCompanyName: string | null;
  customerBranchName: string | null;
  totalCalls: number;
  totalReferrals: number;
  totalFollowUps: number;
  aPlusCount: number;
  coolCount: number;
  warmCount: number;
  uncategorizedCount: number;
  wonCount: number;
  inProgressCount: number;
  cancelledCount: number;
  totalAgreementAmount: number;
  lastReferralAtUtc: string;
}

/** Admin-only breakdown panel — "which sales person has how many calls, within the current filters." */
export interface SalesPersonCallCount {
  salesPersonUserId: string;
  salesPersonDisplayName: string;
  callCount: number;
}

export interface ReferralReportFilter {
  dateFrom?: string;
  dateTo?: string;
  customerUserId?: string;
  /** Admin only — ignored server-side for a Sales Person caller (forced to their own id). */
  salesPersonUserId?: string;
  type: ReferralReportType;
  page: number;
  pageSize: number;
}
