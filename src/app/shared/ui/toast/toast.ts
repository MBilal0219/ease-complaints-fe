import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_ADMIN, ROLE_DEVELOPER } from '../../../core/auth/models';
import { ToastService } from '../../../core/toast/toast.service';

/**
 * Fixed-position stack of toast popups, one per push notification — see
 * ToastService's own doc comment. Lives once in `SidebarLayout`, alongside
 * the notification bell it does not replace.
 */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pointer-events-none fixed right-4 top-20 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          (click)="open(toast.id, toast.ticketId)"
          class="pointer-events-auto flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-slate-900">{{ toast.title }}</p>
            <p class="mt-0.5 line-clamp-2 text-xs text-slate-500">{{ toast.message }}</p>
          </div>
          <button
            type="button"
            (click)="dismiss($event, toast.id)"
            aria-label="Dismiss"
            class="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class Toast {
  protected readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  private readonly rolePrefix = computed(() => {
    const roles = this.authService.currentUser()?.roles ?? [];
    if (roles.includes(ROLE_ADMIN)) return '/app/admin';
    if (roles.includes(ROLE_DEVELOPER)) return '/app/developer';
    return '/app/user';
  });

  open(id: string, ticketId: string | null): void {
    this.toastService.dismiss(id);
    if (ticketId) {
      this.router.navigate([`${this.rolePrefix()}/tickets`, ticketId]);
    }
  }

  dismiss(event: Event, id: string): void {
    event.stopPropagation();
    this.toastService.dismiss(id);
  }
}
