import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PaymentMethod, PosSettings, SavePaymentMethodRequest, SavePosSettingsRequest } from './models';

const BASE = '/api/v1/pos/settings';

/** A restaurant's own POS settings (receipt branding) and payment methods — see docs/modules/pos-settings-and-payments.md. Every call is implicitly scoped to the caller's restaurant. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  getSettings(): Observable<PosSettings> {
    return this.http.get<PosSettings>(BASE);
  }

  updateSettings(request: SavePosSettingsRequest): Observable<PosSettings> {
    return this.http.put<PosSettings>(BASE, request);
  }

  setLogo(logo: File): Observable<PosSettings> {
    const form = new FormData();
    form.set('logo', logo, logo.name);
    return this.http.post<PosSettings>(`${BASE}/logo`, form);
  }

  clearLogo(): Observable<PosSettings> {
    return this.http.delete<PosSettings>(`${BASE}/logo`);
  }

  getPaymentMethods(): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>(`${BASE}/payment-methods`);
  }

  createPaymentMethod(request: SavePaymentMethodRequest): Observable<PaymentMethod> {
    return this.http.post<PaymentMethod>(`${BASE}/payment-methods`, request);
  }

  updatePaymentMethod(id: string, request: SavePaymentMethodRequest): Observable<PaymentMethod> {
    return this.http.put<PaymentMethod>(`${BASE}/payment-methods/${id}`, request);
  }

  setPaymentMethodActive(id: string, isActive: boolean): Observable<PaymentMethod> {
    return this.http.patch<PaymentMethod>(`${BASE}/payment-methods/${id}/active`, { isActive });
  }
}
