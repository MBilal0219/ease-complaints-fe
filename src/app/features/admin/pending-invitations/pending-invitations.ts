import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { InvitationsService } from '../../../core/admin/invitations.service';
import { Invitation, InvitationRole } from '../../../core/admin/invitation.models';

const POLL_MS = 8_000;

/** Live-updating list of pending invitations for one role, with resend/revoke. */
@Component({
  selector: 'app-pending-invitations',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pendingInvitations().length > 0) {
      <div class="rounded-lg border border-slate-200 bg-white">
        <h3 class="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Pending invitations
        </h3>
        <ul class="divide-y divide-slate-100">
          @for (invitation of pendingInvitations(); track invitation.id) {
            <li class="flex items-center justify-between px-4 py-3 text-sm">
              <div class="min-w-0">
                <p class="truncate font-medium text-slate-900">{{ invitation.displayName }}</p>
                <p class="truncate text-xs text-slate-500">{{ invitation.email }} · expires {{ invitation.expiresAtUtc | date: 'medium' }}</p>
              </div>
              <div class="flex shrink-0 gap-2">
                <button
                  type="button"
                  (click)="resend(invitation.id)"
                  [disabled]="actingId() === invitation.id"
                  class="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Resend
                </button>
                <button
                  type="button"
                  (click)="revoke(invitation.id)"
                  [disabled]="actingId() === invitation.id"
                  class="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Revoke
                </button>
              </div>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class PendingInvitations implements OnInit {
  readonly role = input.required<InvitationRole>();

  private readonly invitationsService = inject(InvitationsService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly allInvitations = signal<Invitation[]>([]);
  protected readonly pendingInvitations = computed(() =>
    this.allInvitations().filter((i) => i.role === this.role() && i.status === 'Pending'),
  );

  protected readonly actingId = signal<string | null>(null);
  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    merge(timer(0, POLL_MS), this.manualRefresh)
      .pipe(
        switchMap(() => this.invitationsService.list().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((invitations) => {
        if (invitations) {
          this.allInvitations.set(invitations);
        }
      });
  }

  refresh(): void {
    this.manualRefresh.next();
  }

  resend(id: string): void {
    this.actingId.set(id);
    this.invitationsService.resend(id).subscribe({
      next: () => {
        this.actingId.set(null);
        this.refresh();
      },
      error: () => this.actingId.set(null),
    });
  }

  revoke(id: string): void {
    this.actingId.set(id);
    this.invitationsService.revoke(id).subscribe({
      next: () => {
        this.actingId.set(null);
        this.refresh();
      },
      error: () => this.actingId.set(null),
    });
  }
}
