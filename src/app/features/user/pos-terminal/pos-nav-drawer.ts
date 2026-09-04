import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { USER_NAV_ITEMS } from '../user-shell';

/**
 * Minimal slide-over nav overlay for the POS Terminal — this screen lives
 * outside the normal SidebarLayout entirely (see docs/modules/pos-terminal-ui.md,
 * "dedicated full-bleed layout"), so it needs its own lightweight escape
 * hatch back to the rest of the app rather than embedding the full sidebar
 * (which owns its own router-outlet and isn't meant to nest inside another
 * routed page). Flat list, not the sidebar's nested-group accordion — this
 * is just a way out, not the primary nav experience while on this screen.
 */
@Component({
  selector: 'app-pos-nav-drawer',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex">
        <div class="fixed inset-0 bg-slate-900/50" (click)="closed.emit()"></div>
        <aside class="relative flex h-full w-72 flex-col bg-white shadow-xl">
          <div class="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <span class="text-sm font-semibold text-slate-900">Menu</span>
            <button type="button" (click)="closed.emit()" aria-label="Close menu" class="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            @for (item of flatLinks; track item.route) {
              <a
                [routerLink]="item.route"
                (click)="closed.emit()"
                class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5 shrink-0">
                  <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="item.iconPath" />
                </svg>
                {{ item.label }}
              </a>
            }
          </nav>

          <div class="border-t border-slate-100 p-3">
            <button
              type="button"
              (click)="logout()"
              class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5 shrink-0">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3H21" />
              </svg>
              Log out
            </button>
          </div>
        </aside>
      </div>
    }
  `,
})
export class PosNavDrawer {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly flatLinks = USER_NAV_ITEMS.flatMap((item) => (item.children ? item.children : [item])).filter((item) => !!item.route);

  logout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }
}
