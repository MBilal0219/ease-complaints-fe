import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

export interface NotificationPushPayload {
  id: string;
  title: string;
  message: string;
  ticketId: string | null;
  createdAtUtc: string;
}

/**
 * True push for the existing DB-backed Notification system — see
 * docs/modules/realtime.md. Deliberately thin: this does not replace
 * polling anywhere (every list/dashboard page keeps its own `timer(0, N)`
 * poll as the fallback of record), it just lets pages that inject this
 * service react to a change immediately instead of waiting up to N seconds.
 * Auth "just works" with zero config here — see Program.cs's own comment on
 * why the same HttpOnly-cookie JWT that regular API calls use is read on the
 * hub's handshake too.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private connection: signalR.HubConnection | null = null;
  private readonly notificationCreated = new Subject<NotificationPushPayload>();

  /** Fires whenever the server pushes a newly-created Notification — see NotificationHub. */
  readonly notificationCreated$ = this.notificationCreated.asObservable();

  /** Idempotent — safe to call from every shell's ngOnInit even if already connected. */
  connect(): void {
    if (this.connection) return;

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl('/api/hubs/notifications')
      .withAutomaticReconnect()
      .build();

    this.connection.on('notification.created', (payload: NotificationPushPayload) => this.notificationCreated.next(payload));

    // A push connection is a nice-to-have, not a requirement — every
    // consumer of notificationCreated$ is layered on top of a page that
    // already polls independently, so a failed/dropped connection here
    // degrades silently back to "polling only," never an error the user sees.
    this.connection.start().catch(() => {});
  }

  disconnect(): void {
    this.connection?.stop().catch(() => {});
    this.connection = null;
  }
}
