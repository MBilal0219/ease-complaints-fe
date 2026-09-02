import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateInvitationRequest, Invitation } from './invitation.models';

const BASE = '/api/v1/auth/invitations';

@Injectable({ providedIn: 'root' })
export class InvitationsService {
  private readonly http = inject(HttpClient);

  list(): Observable<Invitation[]> {
    return this.http.get<Invitation[]>(BASE);
  }

  create(request: CreateInvitationRequest): Observable<Invitation> {
    return this.http.post<Invitation>(BASE, request);
  }

  resend(id: string): Observable<Invitation> {
    return this.http.post<Invitation>(`${BASE}/${id}/resend`, {});
  }

  revoke(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${id}`);
  }
}
