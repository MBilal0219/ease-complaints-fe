import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Deal, DealStatus, PagedResult } from './models';

const BASE = '/api/v1/admin/deals';

/** See docs/modules/sales-deals.md. */
@Injectable({ providedIn: 'root' })
export class DealsService {
  private readonly http = inject(HttpClient);

  getDeals(status: DealStatus | '', page: number, pageSize: number): Observable<PagedResult<Deal>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<PagedResult<Deal>>(BASE, { params });
  }

  getDeal(id: string): Observable<Deal> {
    return this.http.get<Deal>(`${BASE}/${id}`);
  }

  setDeliveryDate(id: string, deliveryDate: string): Observable<Deal> {
    return this.http.patch<Deal>(`${BASE}/${id}/delivery-date`, { deliveryDate });
  }

  markCompleted(id: string): Observable<Deal> {
    return this.http.post<Deal>(`${BASE}/${id}/complete`, {});
  }
}
