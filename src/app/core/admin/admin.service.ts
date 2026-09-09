import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CallSummary } from '../sales-person/models';
import { CallFilter } from '../sales-person/sales-person.service';
import {
  BranchOption,
  CreateBranchRequest,
  CreateCompanyRequest,
  CreateDeveloperRequest,
  CreatePartyRequest,
  CreateSalesPersonRequest,
  DashboardStats,
  PagedResult,
  PersonDetail,
  PersonSummary,
} from './models';

const BASE = '/api/v1/admin';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  getDashboardStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${BASE}/dashboard`);
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

  createParty(request: CreatePartyRequest): Observable<PersonSummary> {
    return this.http.post<PersonSummary>(`${BASE}/parties`, request);
  }

  createDeveloper(request: CreateDeveloperRequest): Observable<PersonSummary> {
    return this.http.post<PersonSummary>(`${BASE}/developers`, request);
  }

  createSalesPerson(request: CreateSalesPersonRequest): Observable<PersonSummary> {
    return this.http.post<PersonSummary>(`${BASE}/sales-people`, request);
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

  /** Populates the Company/Branch picker on the Party/Developer/Sales Person "add user" forms, and the standalone Companies page. */
  getAssignableBranches(): Observable<BranchOption[]> {
    return this.http.get<BranchOption[]>(`${BASE}/branches`);
  }

  /** Creates a brand-new Company + its first Branch, no owning User yet. See company-management.md. */
  createCompany(request: CreateCompanyRequest): Observable<BranchOption> {
    return this.http.post<BranchOption>(`${BASE}/companies`, request);
  }

  /** Adds a Branch to an already-existing Company — customer or internal alike. */
  addBranch(companyId: string, request: CreateBranchRequest): Observable<BranchOption> {
    return this.http.post<BranchOption>(`${BASE}/companies/${companyId}/branches`, request);
  }

  setUserActive(id: string, isActive: boolean): Observable<void> {
    return this.http.patch<void>(`${BASE}/users/${id}/status`, { isActive });
  }

  /** Party only — mints the admin's browser a fresh session as that party. See admin.md for the one-way tradeoff. */
  impersonateParty(id: string): Observable<{ id: string; email: string; displayName: string; roles: string[] }> {
    return this.http.post<{ id: string; email: string; displayName: string; roles: string[] }>(`${BASE}/parties/${id}/impersonate`, {});
  }

  private buildParams(search: string, page: number, pageSize: number): HttpParams {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) {
      params = params.set('search', search);
    }
    return params;
  }
}
