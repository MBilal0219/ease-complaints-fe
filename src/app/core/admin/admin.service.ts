import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ROLE_ADMIN, ROLE_IMPLEMENTATOR, ROLE_SALES_PERSON } from '../auth/models';
import { CallDetailWithPayment, CallSummary, CustomerDirectoryEntry, PaymentFollowUpCustomer, PaymentFollowUpSummary, UpdateCallRequest } from '../sales-person/models';
import { CallFilter } from '../sales-person/sales-person.service';
import {
  AddCompanyUserRequest,
  BranchOption,
  CompanyDetail,
  CompanyListItem,
  CompanyUser,
  CreateBranchRequest,
  CreateCompanyRequest,
  CreateDeveloperRequest,
  CreateImplementatorRequest,
  CreatePartyRequest,
  CreateSalesPersonRequest,
  DashboardStats,
  DeveloperPendingTicketFilter,
  DeveloperPendingTicketsResult,
  DeveloperWorkload,
  EmployeeProfileDetail,
  ImplementatorWorkload,
  LookupValue,
  PagedResult,
  PersonDetail,
  PersonSummary,
  SalesPersonWorkload,
  StaffMissingIdCardRow,
  UpdateBranchRequest,
  UpdateCompanyRequest,
  UpdateCompanyUserRequest,
  UpdateStaffRequest,
} from './models';

const BASE = '/api/v1/admin';

/** The three internal-staff roles, matched to their list/detail/update route segment. */
export type StaffRole = 'Developer' | 'SalesPerson' | 'Implementator';
const STAFF_ROUTE: Record<StaffRole, string> = {
  Developer: 'developers',
  SalesPerson: 'sales-people',
  Implementator: 'implementators',
};

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  /**
   * Company management methods only — everything else in this service stays
   * on the fixed Admin/Implementator route. TEMPORARY: routes a Sales
   * Person caller to the interim `/api/v1/sales-person/companies...`
   * endpoints (see Constants.SpecialAccess on the backend — one named
   * Sales Person only, until the full permission system replaces this).
   */
  private get companiesBase(): string {
    const roles = this.authService.currentUser()?.roles ?? [];
    return roles.includes(ROLE_SALES_PERSON) && !roles.includes(ROLE_ADMIN) && !roles.includes(ROLE_IMPLEMENTATOR)
      ? '/api/v1/sales-person'
      : BASE;
  }

  getDashboardStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${BASE}/dashboard`);
  }

  /** Admin Dashboard's Developers drill-down cards — every Developer's workload within the given date range. */
  getDeveloperWorkload(dateFrom?: string, dateTo?: string): Observable<DeveloperWorkload[]> {
    let params = new HttpParams();
    if (dateFrom) params = params.set('dateFrom', dateFrom);
    if (dateTo) params = params.set('dateTo', dateTo);
    return this.http.get<DeveloperWorkload[]>(`${BASE}/dashboard/developers`, { params });
  }

  /** Current pending complaints for one developer, with server-side searchable filters. */
  getDeveloperPendingTickets(developerId: string, filter: DeveloperPendingTicketFilter): Observable<DeveloperPendingTicketsResult> {
    let params = new HttpParams()
      .set('page', filter.page)
      .set('pageSize', filter.pageSize);
    if (filter.status) params = params.set('status', filter.status);
    if (filter.companyId) params = params.set('companyId', filter.companyId);
    if (filter.partyId) params = params.set('partyId', filter.partyId);
    if (filter.categoryId != null) params = params.set('categoryId', filter.categoryId);
    if (filter.priorityId != null) params = params.set('priorityId', filter.priorityId);
    if (filter.search) params = params.set('search', filter.search);
    return this.http.get<DeveloperPendingTicketsResult>(`${BASE}/dashboard/developers/${developerId}/pending`, { params });
  }

  /** Admin Dashboard's Sales drill-down cards — every Sales Person's workload within the given date range. */
  getSalesPersonWorkload(dateFrom?: string, dateTo?: string): Observable<SalesPersonWorkload[]> {
    let params = new HttpParams();
    if (dateFrom) params = params.set('dateFrom', dateFrom);
    if (dateTo) params = params.set('dateTo', dateTo);
    return this.http.get<SalesPersonWorkload[]>(`${BASE}/dashboard/sales`, { params });
  }

  /** Admin Dashboard's Implementators drill-down cards — every Implementator's task-triage activity within the given date range. */
  getImplementatorWorkload(dateFrom?: string, dateTo?: string): Observable<ImplementatorWorkload[]> {
    let params = new HttpParams();
    if (dateFrom) params = params.set('dateFrom', dateFrom);
    if (dateTo) params = params.set('dateTo', dateTo);
    return this.http.get<ImplementatorWorkload[]>(`${BASE}/dashboard/implementators`, { params });
  }

  /** Admin Dashboard's Payments card — company-wide, a deliberate exception to the usual Sales-Person-private payment rule. */
  getPaymentSummary(): Observable<PaymentFollowUpSummary> {
    return this.http.get<PaymentFollowUpSummary>(`${BASE}/payments/summary`);
  }

  getOverduePayments(): Observable<PaymentFollowUpCustomer[]> {
    return this.http.get<PaymentFollowUpCustomer[]>(`${BASE}/payments/overdue`);
  }

  getUpcomingPayments(): Observable<PaymentFollowUpCustomer[]> {
    return this.http.get<PaymentFollowUpCustomer[]>(`${BASE}/payments/upcoming`);
  }

  getParties(search: string, page: number, pageSize: number): Observable<PagedResult<PersonSummary>> {
    return this.http.get<PagedResult<PersonSummary>>(`${BASE}/parties`, { params: this.buildParams(search, page, pageSize) });
  }

  getDevelopers(search: string, page: number, pageSize: number): Observable<PagedResult<PersonSummary>> {
    return this.http.get<PagedResult<PersonSummary>>(`${BASE}/developers`, { params: this.buildParams(search, page, pageSize) });
  }

  getSalesPeople(search: string, page: number, pageSize: number): Observable<PagedResult<PersonSummary>> {
    return this.http.get<PagedResult<PersonSummary>>(`${BASE}/sales-people`, { params: this.buildParams(search, page, pageSize) });
  }

  getImplementators(search: string, page: number, pageSize: number): Observable<PagedResult<PersonSummary>> {
    return this.http.get<PagedResult<PersonSummary>>(`${BASE}/implementators`, { params: this.buildParams(search, page, pageSize) });
  }

  /** Oversight view — never includes payment detail, see backend CallDetailDto's own doc comment. */
  getCalls(filter: CallFilter): Observable<PagedResult<CallSummary>> {
    let params = new HttpParams().set('page', filter.page).set('pageSize', filter.pageSize);
    if (filter.customerUserId) params = params.set('customerUserId', filter.customerUserId);
    if (filter.outcome) params = params.set('outcome', filter.outcome);
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.search) params = params.set('search', filter.search);
    return this.http.get<PagedResult<CallSummary>>(`${BASE}/calls`, { params });
  }

  /** Calls page's left-side customer directory sidebar — company-wide, not privacy-sensitive. */
  getCustomerDirectory(): Observable<CustomerDirectoryEntry[]> {
    return this.http.get<CustomerDirectoryEntry[]>(`${BASE}/customers/directory`);
  }

  /** Admin-safe — the response is typed as CallDetailWithPayment for convenience (same base shape), but the backend never actually sends paymentDetail/follow-up fields to Admin; call-detail.ts's template only reads those inside an `outcome === 'Payment'` branch it hides for Admin. */
  getCall(id: string): Observable<CallDetailWithPayment> {
    return this.http.get<CallDetailWithPayment>(`${BASE}/calls/${id}`);
  }

  /** Notes/Commitment only — a Payment-outcome call is rejected server-side (Forbidden), since Admin never sees PaymentDetail at all. */
  updateCall(id: string, request: UpdateCallRequest): Observable<CallDetailWithPayment> {
    return this.http.put<CallDetailWithPayment>(`${BASE}/calls/${id}`, request);
  }

  createParty(request: CreatePartyRequest): Observable<PersonSummary> {
    return this.http.post<PersonSummary>(`${BASE}/parties`, request);
  }

  /** Turns a Party's own ability to file complaints/subcomplaints on or off. */
  setPartyComplaintPermission(partyId: string, canSelfFileComplaints: boolean): Observable<void> {
    return this.http.put<void>(`${BASE}/parties/${partyId}/complaint-permission`, { canSelfFileComplaints });
  }

  createDeveloper(request: CreateDeveloperRequest): Observable<PersonSummary> {
    return this.http.post<PersonSummary>(`${BASE}/developers`, request);
  }

  createSalesPerson(request: CreateSalesPersonRequest): Observable<PersonSummary> {
    return this.http.post<PersonSummary>(`${BASE}/sales-people`, request);
  }

  createImplementator(request: CreateImplementatorRequest): Observable<PersonSummary> {
    return this.http.post<PersonSummary>(`${BASE}/implementators`, request);
  }

  getPartyDetail(id: string): Observable<PersonDetail> {
    return this.http.get<PersonDetail>(`${BASE}/parties/${id}`);
  }

  getDeveloperDetail(id: string): Observable<PersonDetail> {
    return this.http.get<PersonDetail>(`${BASE}/developers/${id}`);
  }

  getSalesPersonDetail(id: string): Observable<PersonDetail> {
    return this.http.get<PersonDetail>(`${BASE}/sales-people/${id}`);
  }

  getImplementatorDetail(id: string): Observable<PersonDetail> {
    return this.http.get<PersonDetail>(`${BASE}/implementators/${id}`);
  }

  /** Populates the Company/Branch picker on the Party/Developer/Sales Person "add user" forms, and the standalone Companies page. */
  getAssignableBranches(): Observable<BranchOption[]> {
    return this.http.get<BranchOption[]>(`${BASE}/branches`);
  }

  /** Creates a brand-new Company + its first Branch, no owning User yet. See company-management.md. */
  createCompany(request: CreateCompanyRequest): Observable<BranchOption> {
    return this.http.post<BranchOption>(`${this.companiesBase}/companies`, request);
  }

  /** Adds a Branch to an already-existing Company — customer or internal alike. */
  addBranch(companyId: string, request: CreateBranchRequest): Observable<BranchOption> {
    return this.http.post<BranchOption>(`${this.companiesBase}/companies/${companyId}/branches`, request);
  }

  /** Renames a Branch. */
  updateBranch(companyId: string, branchId: string, request: UpdateBranchRequest): Observable<BranchOption> {
    return this.http.put<BranchOption>(`${this.companiesBase}/companies/${companyId}/branches/${branchId}`, request);
  }

  getCompanies(dateFrom?: string, dateTo?: string, search?: string): Observable<CompanyListItem[]> {
    let params = new HttpParams();
    if (dateFrom) params = params.set('dateFrom', dateFrom);
    if (dateTo) params = params.set('dateTo', dateTo);
    if (search) params = params.set('search', search);
    return this.http.get<CompanyListItem[]>(`${this.companiesBase}/companies`, { params });
  }

  getCompaniesForReport(dateFrom?: string, dateTo?: string, search?: string): Observable<CompanyListItem[]> {
    let params = new HttpParams();
    if (dateFrom) params = params.set('dateFrom', dateFrom);
    if (dateTo) params = params.set('dateTo', dateTo);
    if (search) params = params.set('search', search);
    return this.http.get<CompanyListItem[]>(`${this.companiesBase}/companies/all`, { params });
  }

  getCompanyDetail(id: string): Observable<CompanyDetail> {
    return this.http.get<CompanyDetail>(`${this.companiesBase}/companies/${id}`);
  }

  addCompanyUser(companyId: string, request: AddCompanyUserRequest): Observable<CompanyUser> {
    return this.http.post<CompanyUser>(`${this.companiesBase}/companies/${companyId}/users`, request);
  }

  updateCompany(id: string, request: UpdateCompanyRequest): Observable<CompanyDetail> {
    return this.http.put<CompanyDetail>(`${this.companiesBase}/companies/${id}`, request);
  }

  updateCompanyUser(companyId: string, userId: string, request: UpdateCompanyUserRequest): Observable<CompanyUser> {
    return this.http.put<CompanyUser>(`${this.companiesBase}/companies/${companyId}/users/${userId}`, request);
  }

  deleteCompanyUser(companyId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.companiesBase}/companies/${companyId}/users/${userId}`);
  }

  setUserActive(id: string, isActive: boolean): Observable<void> {
    return this.http.patch<void>(`${BASE}/users/${id}/status`, { isActive });
  }

  // ---- Staff edit / password / ID card ----

  updateStaff(role: StaffRole, id: string, request: UpdateStaffRequest): Observable<PersonSummary> {
    return this.http.put<PersonSummary>(`${BASE}/${STAFF_ROUTE[role]}/${id}`, request);
  }

  setStaffPassword(id: string, newPassword: string): Observable<void> {
    return this.http.put<void>(`${BASE}/staff/${id}/password`, { newPassword });
  }

  uploadIdCard(id: string, side: 'front' | 'back', file: File): Observable<EmployeeProfileDetail> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<EmployeeProfileDetail>(`${BASE}/staff/${id}/id-card/${side}`, form);
  }

  removeIdCard(id: string, side: 'front' | 'back'): Observable<void> {
    return this.http.delete<void>(`${BASE}/staff/${id}/id-card/${side}`);
  }

  /** Goes straight into an <a href>/<img src>, so it bypasses the auth interceptor and needs the API origin baked in (same as LeadsService.agreementDocumentDownloadUrl). */
  idCardDownloadUrl(id: string, side: 'front' | 'back'): string {
    return `${environment.apiBaseUrl}${BASE}/staff/${id}/id-card/${side}/download`;
  }

  getStaffMissingIdCard(): Observable<StaffMissingIdCardRow[]> {
    return this.http.get<StaffMissingIdCardRow[]>(`${BASE}/staff/missing-id-card`);
  }

  // ---- Employee lookups ----

  getDeveloperTypes(): Observable<LookupValue[]> {
    return this.http.get<LookupValue[]>(`${BASE}/lookups/developer-types`);
  }

  createDeveloperType(name: string): Observable<LookupValue> {
    return this.http.post<LookupValue>(`${BASE}/lookups/developer-types`, { name });
  }

  getRanks(): Observable<LookupValue[]> {
    return this.http.get<LookupValue[]>(`${BASE}/lookups/ranks`);
  }

  createRank(name: string): Observable<LookupValue> {
    return this.http.post<LookupValue>(`${BASE}/lookups/ranks`, { name });
  }

  /** Any non-Admin account (Party, Developer, Sales Person, Implementator, BranchAdmin) — mints the admin's browser a fresh session as that user, invisible in their own "My Sessions" list. See admin.md for the one-way tradeoff. */
  impersonateUser(id: string): Observable<{ id: string; email: string; displayName: string; roles: string[] }> {
    return this.http.post<{ id: string; email: string; displayName: string; roles: string[] }>(`${BASE}/users/${id}/impersonate`, {});
  }

  private buildParams(search: string, page: number, pageSize: number): HttpParams {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) {
      params = params.set('search', search);
    }
    return params;
  }
}
