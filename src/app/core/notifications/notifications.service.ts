import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { NotificationDto, PagedResult } from './models';

const BASE = '/api/v1/notifications';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  getRecent(pageSize = 10): Observable<PagedResult<NotificationDto>> {
    return this.http.get<PagedResult<NotificationDto>>(BASE, { params: { page: 1, pageSize } });
  }

  getUnreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${BASE}/unread-count`);
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`${BASE}/${id}/read`, {});
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>(`${BASE}/read-all`, {});
  }
}
