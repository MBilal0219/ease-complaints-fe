import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from '../admin/models';
import { AuthService } from '../auth/auth.service';
import { ROLE_ADMIN } from '../auth/models';
import { CreateFollowUpRequest, CreateLeadRequest, LeadCategory, LeadDetail, LeadSource, LeadSummary, UpdateLeadRequest } from './models';

export interface LeadFilter {
  source?: LeadSource;
  category?: LeadCategory;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** Admin-only — scopes to one sales person's effective leads (Call.salesPersonUserId when referred, else the creator). See ILeadRepository.SearchAsync's own doc comment. */
  salesPersonUserId?: string;
  page: number;
  pageSize: number;
}

/**
 * Shared by both Admin and Sales Person — same list/detail/follow-up
 * capability either way (see docs/modules/leads.md), just against separate
 * per-role backend routes. Picks the right base path from the current
 * user's role rather than requiring every caller to know it.
 */
@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private get base(): string {
    const isAdmin = this.authService.currentUser()?.roles.includes(ROLE_ADMIN) ?? false;
    return isAdmin ? '/api/v1/admin/leads' : '/api/v1/sales-person/leads';
  }

  createLead(request: CreateLeadRequest): Observable<LeadSummary> {
    return this.http.post<LeadSummary>(this.base, request);
  }

  getLeads(filter: LeadFilter): Observable<PagedResult<LeadSummary>> {
    let params = new HttpParams().set('page', filter.page).set('pageSize', filter.pageSize);
    if (filter.source) params = params.set('source', filter.source);
    if (filter.category) params = params.set('category', filter.category);
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.search) params = params.set('search', filter.search);
    if (filter.salesPersonUserId) params = params.set('salesPersonUserId', filter.salesPersonUserId);
    return this.http.get<PagedResult<LeadSummary>>(this.base, { params });
  }

  getLead(id: string): Observable<LeadDetail> {
    return this.http.get<LeadDetail>(`${this.base}/${id}`);
  }

  addFollowUp(leadId: string, request: CreateFollowUpRequest): Observable<LeadDetail> {
    return this.http.post<LeadDetail>(`${this.base}/${leadId}/follow-ups`, request);
  }

  /** Optional — attached once a deal is won, from any follow-up logged after that point. */
  uploadAgreementDocument(leadId: string, file: File): Observable<LeadDetail> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<LeadDetail>(`${this.base}/${leadId}/agreement-document`, formData);
  }

  agreementDocumentDownloadUrl(leadId: string, documentId: string): string {
    // Bound directly into an <a href>/link.href, not an HttpClient call, so
    // the auth interceptor never sees it — needs the API origin itself.
    return `${environment.apiBaseUrl}${this.base}/${leadId}/agreement-document/${documentId}/download`;
  }

  /** Re-sends the lead's pending Won-conversion invitation (fresh token/expiry, old one revoked). */
  resendInvitation(leadId: string): Observable<LeadDetail> {
    return this.http.post<LeadDetail>(`${this.base}/${leadId}/resend-invitation`, {});
  }

  /** Sets/clears the agreement amount directly — the only way to change it once the lead is converted (no more follow-ups possible then). */
  updateAgreementAmount(leadId: string, agreementAmount: number | null): Observable<LeadDetail> {
    return this.http.put<LeadDetail>(`${this.base}/${leadId}/agreement-amount`, { agreementAmount });
  }

  /** Edits the Lead's own intake/contact fields — see UpdateLeadRequest's own doc comment. */
  updateLead(leadId: string, request: UpdateLeadRequest): Observable<LeadDetail> {
    return this.http.put<LeadDetail>(`${this.base}/${leadId}`, request);
  }
}
