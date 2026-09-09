import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResult, PersonSummary } from '../admin/models';
import { CallDetailWithPayment, CallOutcome, CallSummary, CreateCallRequest, SalesPersonDashboardStats, UpdateCallRequest } from './models';

const BASE = '/api/v1/sales-person';

export interface CallFilter {
  customerUserId?: string;
  outcome?: CallOutcome;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class SalesPersonService {
  private readonly http = inject(HttpClient);

  getDashboardStats(): Observable<SalesPersonDashboardStats> {
    return this.http.get<SalesPersonDashboardStats>(`${BASE}/dashboard`);
  }

  /** Every Party account, company-wide — who a Sales Person can call. */
  getCustomers(search: string, page: number, pageSize: number): Observable<PagedResult<PersonSummary>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<PagedResult<PersonSummary>>(`${BASE}/customers`, { params });
  }

  /** One atomic call log — customer, any number of Leads, and exactly one outcome. See docs/modules/sales-person-calls.md. */
  createCall(request: CreateCallRequest): Observable<CallDetailWithPayment> {
    return this.http.post<CallDetailWithPayment>(`${BASE}/calls`, request);
  }

  getCalls(filter: CallFilter): Observable<PagedResult<CallSummary>> {
    let params = new HttpParams().set('page', filter.page).set('pageSize', filter.pageSize);
    if (filter.customerUserId) params = params.set('customerUserId', filter.customerUserId);
    if (filter.outcome) params = params.set('outcome', filter.outcome);
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.search) params = params.set('search', filter.search);
    return this.http.get<PagedResult<CallSummary>>(`${BASE}/calls`, { params });
  }

  getCall(id: string): Observable<CallDetailWithPayment> {
    return this.http.get<CallDetailWithPayment>(`${BASE}/calls/${id}`);
  }

  /** Narrow edit — Notes or PaymentDetail only, matching the call's existing outcome. See UpdateCallRequest's own doc comment. */
  updateCall(id: string, request: UpdateCallRequest): Observable<CallDetailWithPayment> {
    return this.http.put<CallDetailWithPayment>(`${BASE}/calls/${id}`, request);
  }
}
