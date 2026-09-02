import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { interval, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NavItem } from './nav-item';

/** Polling stand-in for real-time session push — see docs/modules/authentication.md. */
const SESSION_HEARTBEAT_MS = 10_000;

/**
 * Reusable app shell: responsive sidebar (collapsible on mobile, persistent
 * on desktop) with the caller's nav items and a profile block pinned to the
 * bottom. Admin/Developer/User shells all wrap this with their own
 * `navItems` and route configs — see layout/admin-shell.ts.
 */
@Component({
  selector: 'app-sidebar-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh bg-slate-50">
      <!-- Mobile backdrop -->
      @if (sidebarOpen()) {
        <div class="fixed inset-0 z-30 bg-slate-900/40 md:hidden" (click)="sidebarOpen.set(false)"></div>
      }

      <!-- Sidebar -->
      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:static md:translate-x-0"
        [class.translate-x-0]="sidebarOpen()"
        [class.-translate-x-full]="!sidebarOpen()"
      >
        <div class="flex h-16 shrink-0 items-center gap-2 px-5">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            {{ productName().charAt(0) }}
          </div>
          <span class="truncate text-sm font-semibold text-slate-900">{{ productName() }}</span>
        </div>

        <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          @for (item of navItems(); track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="bg-indigo-50 text-indigo-700"
              [routerLinkActiveOptions]="{ exact: false }"
              class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              (click)="sidebarOpen.set(false)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5 shrink-0">
                <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="item.iconPath" />
              </svg>
              {{ item.label }}
            </a>
          }
        </nav>

        <!-- Profile block, pinned to the bottom -->
        @if (authService.currentUser(); as user) {
          <div class="mt-auto border-t border-slate-100 bg-slate-50/60 p-4">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                {{ initials() }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-900">{{ user.displayName }}</p>
                <p class="truncate text-xs text-slate-500">{{ user.roles.join(', ') }}</p>
              </div>
            </div>
            <div class="mt-3 flex gap-2">
              <a
                routerLink="/app/profile"
                class="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Profile
              </a>
              <button
                type="button"
                (click)="logout()"
                [disabled]="loggingOut()"
                class="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Log out
              </button>
            </div>
          </div>
        }
      </aside>

      <!-- Main content -->
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
          <button
            type="button"
            (click)="sidebarOpen.set(true)"
            aria-label="Open navigation menu"
            class="rounded-md p-2 text-slate-600 hover:bg-slate-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-6 w-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <span class="text-sm font-semibold text-slate-900">{{ productName() }}</span>
        </header>

        <main class="flex-1 overflow-y-auto p-4 md:p-8">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class SidebarLayout implements OnInit {
  readonly navItems = input.required<NavItem[]>();
  readonly productName = input<string>('Complaint Management System');

  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sidebarOpen = signal(false);
  protected readonly loggingOut = signal(false);

  protected readonly initials = computed(() => {
    const name = this.authService.currentUser()?.displayName ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  });

  ngOnInit(): void {
    interval(SESSION_HEARTBEAT_MS)
      .pipe(
        switchMap(() => this.authService.checkSessionStillValid()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((stillValid) => {
        if (!stillValid) {
          this.router.navigateByUrl('/login');
        }
      });
  }

  logout(): void {
    this.loggingOut.set(true);
    this.authService.logout().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }
}
