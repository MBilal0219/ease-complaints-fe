import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateDeveloperRequest, CreatePartyRequest, DashboardStats, PagedResult, PersonDetail, PersonSummary } from './models';

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

  createParty(request: CreatePartyRequest): Observable<PersonSummary> {
    return this.http.post<PersonSummary>(`${BASE}/parties`, request);
  }

  createDeveloper(request: CreateDeveloperRequest): Observable<PersonSummary> {
    return this.http.post<PersonSummary>(`${BASE}/developers`, request);
  }

  getPartyDetail(id: string): Observable<PersonDetail> {
    return this.http.get<PersonDetail>(`${BASE}/parties/${id}`);
  }

  getDeveloperDetail(id: string): Observable<PersonDetail> {
    return this.http.get<PersonDetail>(`${BASE}/developers/${id}`);
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
