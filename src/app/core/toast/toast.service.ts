import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  ticketId: string | null;
}

const AUTO_DISMISS_MS = 8_000;

/**
 * Fire-and-forget toast popups — layered on top of the existing DB-backed
 * Notification system (see docs/modules/realtime.md), not a second
 * notification store. `SidebarLayout` feeds this from
 * `RealtimeService.notificationCreated$` so a toast only ever appears for a
 * push that actually arrived; the notification bell's own poll/badge is
 * unaffected either way.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSignal = signal<ToastMessage[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  show(title: string, message: string, ticketId: string | null = null): void {
    const toast: ToastMessage = { id: crypto.randomUUID(), title, message, ticketId };
    this.toastsSignal.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), AUTO_DISMISS_MS);
  }

  dismiss(id: string): void {
    this.toastsSignal.update((list) => list.filter((t) => t.id !== id));
  }
}
