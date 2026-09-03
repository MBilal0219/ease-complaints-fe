import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of, switchMap, timer } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_ADMIN, ROLE_DEVELOPER } from '../../../core/auth/models';
import { NotificationDto } from '../../../core/notifications/models';
import { NotificationsService } from '../../../core/notifications/notifications.service';

const POLL_MS = 15_000;

/** Bell + unread badge + dropdown of recent notifications — polled, not pushed (see ADR-003). Lives in the sidebar shell's top bar, present for every role. */
@Component({
  selector: 'app-notification-bell',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="toggle($event)"
        aria-label="Notifications"
        class="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        @if (unreadCount() > 0) {
          <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {{ unreadCount() > 9 ? '9+' : unreadCount() }}
          </span>
        }
      </button>

      @if (open()) {
        <div class="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span class="text-sm font-semibold text-slate-900">Notifications</span>
            @if (unreadCount() > 0) {
              <button type="button" (click)="markAllRead()" class="text-xs font-medium text-indigo-600 hover:text-indigo-500">
                Mark all as read
              </button>
            }
          </div>

          <div class="max-h-96 overflow-y-auto">
            @for (n of notifications(); track n.id) {
              <button
                type="button"
                (click)="openNotification(n)"
                class="block w-full border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50"
                [class.bg-indigo-50]="!n.isRead"
              >
                <p class="text-sm font-medium text-slate-900">{{ n.title }}</p>
                <p class="mt-0.5 line-clamp-2 text-xs text-slate-500">{{ n.message }}</p>
                <p class="mt-1 text-[11px] text-slate-400">{{ n.createdAtUtc | date: 'short' }}</p>
              </button>
            } @empty {
              <p class="px-3 py-8 text-center text-sm text-slate-400">You're all caught up.</p>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationBell implements OnInit {
  private readonly notificationsService = inject(NotificationsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly unreadCount = signal(0);
  protected readonly notifications = signal<NotificationDto[]>([]);

  private readonly rolePrefix = computed(() => {
    const roles = this.authService.currentUser()?.roles ?? [];
    if (roles.includes(ROLE_ADMIN)) return '/app/admin';
    if (roles.includes(ROLE_DEVELOPER)) return '/app/developer';
    return '/app/user';
  });

  ngOnInit(): void {
    timer(0, POLL_MS)
      .pipe(
        switchMap(() => this.notificationsService.getUnreadCount().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) this.unreadCount.set(result.count);
      });
  }

  toggle(event: Event): void {
    event.stopPropagation();
    const willOpen = !this.open();
    this.open.set(willOpen);
    if (willOpen) {
      this.notificationsService.getRecent().subscribe((result) => this.notifications.set(result.items));
    }
  }

  openNotification(notification: NotificationDto): void {
    this.open.set(false);
    if (!notification.isRead) {
      this.notificationsService.markRead(notification.id).subscribe(() => {
        this.unreadCount.update((count) => Math.max(0, count - 1));
      });
    }
    if (notification.ticketId) {
      this.router.navigate([`${this.rolePrefix()}/tickets`, notification.ticketId]);
    }
  }

  markAllRead(): void {
    this.notificationsService.markAllRead().subscribe(() => {
      this.unreadCount.set(0);
      this.notifications.update((list) => list.map((n) => ({ ...n, isRead: true })));
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
