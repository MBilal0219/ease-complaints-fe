import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { interval, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationBell } from '../../shared/ui/notification-bell/notification-bell';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NotificationBell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-dvh overflow-hidden bg-slate-50">
      <!-- Mobile backdrop -->
      @if (sidebarOpen()) {
        <div class="fixed inset-0 z-30 bg-slate-900/40 md:hidden" (click)="sidebarOpen.set(false)"></div>
      }

      <!-- Sidebar — fixed at every breakpoint so it never scrolls with the
           main content; on mobile it's toggled on/off-screen via transform,
           on desktop md:translate-x-0 pins it permanently visible. -->
      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:translate-x-0"
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
          @for (item of navItems(); track item.label) {
            @if (item.children) {
              <div>
                <button
                  type="button"
                  (click)="toggleGroup(item.label)"
                  class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5 shrink-0">
                    <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="item.iconPath" />
                  </svg>
                  <span class="flex-1 text-left">{{ item.label }}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    class="h-4 w-4 shrink-0 transition-transform"
                    [class.rotate-90]="isGroupExpanded(item.label)"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                @if (isGroupExpanded(item.label)) {
                  <div class="ml-4 mt-1 space-y-1 border-l border-slate-100 pl-3">
                    @for (child of item.children; track child.route) {
                      <a
                        [routerLink]="child.route"
                        routerLinkActive="bg-indigo-50 text-indigo-700"
                        [routerLinkActiveOptions]="{ exact: false }"
                        class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        (click)="sidebarOpen.set(false)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4 shrink-0">
                          <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="child.iconPath" />
                        </svg>
                        {{ child.label }}
                      </a>
                    }
                  </div>
                }
              </div>
            } @else {
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
          }
        </nav>

        <!-- Profile block, pinned to the bottom -->
        @if (authService.currentUser(); as user) {
          <div class="relative mt-auto border-t border-slate-100 bg-slate-50/60 p-4" #profileMenuRoot>
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                {{ initials() }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-900">{{ user.displayName }}</p>
                <p class="truncate text-xs text-slate-500">{{ user.email }}</p>
                <p class="truncate text-[11px] uppercase tracking-wide text-slate-400">{{ user.roles.join(', ') }}</p>
              </div>
              <button
                type="button"
                (click)="toggleMenu($event)"
                aria-label="Account menu"
                class="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
                  <path d="M12 6.75a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                </svg>
              </button>
            </div>

            @if (menuOpen()) {
              <div class="absolute bottom-full left-4 right-4 z-10 mb-2 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <a
                  [routerLink]="profileRoute()"
                  (click)="menuOpen.set(false)"
                  class="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                  Settings
                </a>
                <button
                  type="button"
                  (click)="logout()"
                  [disabled]="loggingOut()"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3H21" />
                  </svg>
                  Log out
                </button>
              </div>
            }
          </div>
        }
      </aside>

      <!-- Main content — offset by the sidebar's width on desktop, since the
           sidebar is now fixed/out-of-flow at every breakpoint. The outer
           wrapper is an exact h-dvh with overflow-hidden (not just
           min-h-dvh), which is what actually makes <main>'s overflow-y-auto
           below the one and only scrolling region — otherwise this column
           just grows with its content and the whole page scrolls, taking
           the header along with it instead of leaving it pinned. -->
      <div class="flex min-w-0 flex-1 flex-col md:ml-64">
        <header class="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button
            type="button"
            (click)="sidebarOpen.set(true)"
            aria-label="Open navigation menu"
            class="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-6 w-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <span class="text-sm font-semibold text-slate-900 md:hidden">{{ productName() }}</span>
          <div class="ml-auto">
            <app-notification-bell />
          </div>
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
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly sidebarOpen = signal(false);
  protected readonly loggingOut = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly expandedGroups = signal<ReadonlySet<string>>(new Set());

  protected readonly initials = computed(() => {
    const name = this.authService.currentUser()?.displayName ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  });

  /** Derived from the caller's own nav items so this shell never has to be told its role's URL prefix directly. Skips group headers (e.g. "Complaints", "POS"), which have no route of their own. */
  protected readonly profileRoute = computed(() => {
    const firstRoute = this.navItems().find((item) => item.route)?.route ?? '/app';
    return `${firstRoute.split('/').slice(0, 3).join('/')}/profile`;
  });

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  toggleGroup(label: string): void {
    this.expandedGroups.update((groups) => {
      const next = new Set(groups);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  isGroupExpanded(label: string): boolean {
    return this.expandedGroups().has(label);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  ngOnInit(): void {
    // Auto-expand whichever group the current route is actually inside of,
    // once, at load — after that the user's own clicks are in charge.
    const currentUrl = this.router.url;
    const groupsToExpand = this.navItems()
      .filter((item) => item.children?.some((child) => child.route && currentUrl.startsWith(child.route)))
      .map((item) => item.label);
    if (groupsToExpand.length > 0) {
      this.expandedGroups.set(new Set(groupsToExpand));
    }

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
