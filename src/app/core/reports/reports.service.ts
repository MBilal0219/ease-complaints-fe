import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResult } from '../admin/models';
import { AuthService } from '../auth/auth.service';
import { ROLE_ADMIN } from '../auth/models';
import { CustomerOption, DetailedReferralReportAll, DetailedReferralReportPage, ReferralReportFilter, ReferralReportSummaryRow, ReportingPageSize, SalesPersonCallCount } from './models';

/** Shared by Admin and Sales Person — same reporting/print capability either way, against separate per-role backend routes. Picks the right base path from the current user's role, same pattern as LeadsService. */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private get base(): string {
    const isAdmin = this.authService.currentUser()?.roles.includes(ROLE_ADMIN) ?? false;
    return isAdmin ? '/api/v1/admin' : '/api/v1/sales-person';
  }

  getReportingPageSize(): Observable<{ pageSize: ReportingPageSize }> {
    return this.http.get<{ pageSize: ReportingPageSize }>(`${this.base}/settings/reporting-page-size`);
  }

  updateReportingPageSize(pageSize: ReportingPageSize): Observable<{ pageSize: ReportingPageSize }> {
    return this.http.put<{ pageSize: ReportingPageSize }>(`${this.base}/settings/reporting-page-size`, { pageSize });
  }

  getDetailedReport(filter: ReferralReportFilter): Observable<DetailedReferralReportPage> {
    return this.http.get<DetailedReferralReportPage>(`${this.base}/reports/referrals`, { params: this.buildParams(filter) });
  }

  getSummaryReport(filter: ReferralReportFilter): Observable<PagedResult<ReferralReportSummaryRow>> {
    return this.http.get<PagedResult<ReferralReportSummaryRow>>(`${this.base}/reports/referrals`, { params: this.buildParams(filter) });
  }

  getDetailedReportAll(filter: ReferralReportFilter): Observable<DetailedReferralReportAll> {
    return this.http.get<DetailedReferralReportAll>(`${this.base}/reports/referrals/all`, { params: this.buildParams(filter) });
  }

  getSummaryReportAll(filter: ReferralReportFilter): Observable<ReferralReportSummaryRow[]> {
    return this.http.get<ReferralReportSummaryRow[]>(`${this.base}/reports/referrals/all`, { params: this.buildParams(filter) });
  }

  /** Admin only — the backend rejects this for a Sales Person caller. */
  getSalesPersonBreakdown(dateFrom?: string, dateTo?: string): Observable<SalesPersonCallCount[]> {
    let params = new HttpParams();
    if (dateFrom) params = params.set('dateFrom', dateFrom);
    if (dateTo) params = params.set('dateTo', dateTo);
    return this.http.get<SalesPersonCallCount[]>(`${this.base}/reports/sales-person-breakdown`, { params });
  }

  /** Every customer actually talked to — scoped to the caller for Sales Person; Admin may narrow to one specific Sales Person, or omit for every customer across all Sales People. */
  getReportCustomers(salesPersonUserId?: string): Observable<CustomerOption[]> {
    let params = new HttpParams();
    if (salesPersonUserId) params = params.set('salesPersonUserId', salesPersonUserId);
    return this.http.get<CustomerOption[]>(`${this.base}/reports/customers`, { params });
  }

  private buildParams(filter: ReferralReportFilter): HttpParams {
    let params = new HttpParams().set('type', filter.type).set('page', filter.page).set('pageSize', filter.pageSize);
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.customerUserId) params = params.set('customerUserId', filter.customerUserId);
    if (filter.salesPersonUserId) params = params.set('salesPersonUserId', filter.salesPersonUserId);
    return params;
  }
}
