import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResult, Sale, SaleSearchFilter, SaveSaleRequest } from './models';

const BASE = '/api/v1/pos/sales';

/** A restaurant's own orders/bills — see docs/modules/pos-sales-and-billing.md. Every call is implicitly scoped to the caller's restaurant. */
@Injectable({ providedIn: 'root' })
export class SaleService {
  private readonly http = inject(HttpClient);

  search(filter: SaleSearchFilter): Observable<PagedResult<Sale>> {
    let params = new HttpParams().set('page', filter.page).set('pageSize', filter.pageSize);
    if (filter.status) params = params.set('status', filter.status);
    if (filter.orderType) params = params.set('orderType', filter.orderType);
    if (filter.dateFromUtc) params = params.set('dateFromUtc', filter.dateFromUtc);
    if (filter.dateToUtc) params = params.set('dateToUtc', filter.dateToUtc);
    if (filter.search) params = params.set('search', filter.search);
    return this.http.get<PagedResult<Sale>>(BASE, { params });
  }

  getById(id: string): Observable<Sale> {
    return this.http.get<Sale>(`${BASE}/${id}`);
  }

  createHeld(request: SaveSaleRequest): Observable<Sale> {
    return this.http.post<Sale>(BASE, request);
  }

  updateHeld(id: string, request: SaveSaleRequest): Observable<Sale> {
    return this.http.put<Sale>(`${BASE}/${id}`, request);
  }

  punch(id: string, paymentMethodId: string): Observable<Sale> {
    return this.http.post<Sale>(`${BASE}/${id}/punch`, { paymentMethodId });
  }

  voidAndReissue(id: string, voidReason: string): Observable<Sale> {
    return this.http.post<Sale>(`${BASE}/${id}/void-and-reissue`, { voidReason });
  }

  /** The Terminal's "Cancel Order" — abandons a Held sale entirely (its Dine-In table, if any, is freed server-side first). Only a Held sale can be cancelled. */
  cancelHeld(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${id}`);
  }
}
