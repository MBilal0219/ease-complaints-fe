import { ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, interval, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ToastService } from '../../core/toast/toast.service';
import { NotificationBell } from '../../shared/ui/notification-bell/notification-bell';
import { Toast } from '../../shared/ui/toast/toast';
import { NavItem } from './nav-item';

/** Polling stand-in for real-time session push — see docs/modules/authentication.md. */
const SESSION_HEARTBEAT_MS = 10_000;

/** Tailwind's `md` breakpoint (768px) — used at runtime, alongside `isPosRoute`, to decide whether tapping a nav link should also auto-close the sidebar (true wherever it's currently an overlay: mobile at any width, or POS at every width) or leave it alone (desktop push, outside `/pos/`, user-toggled only). */
const MOBILE_BREAKPOINT_PX = 768;

/**
 * Reusable app shell, shared by every role (Admin/Developer/User — see
 * layout/admin-shell.ts etc.) and now the POS Terminal too, so the whole app
 * has exactly one header/sidebar design instead of the Terminal's own
 * previously-separate full-bleed chrome. See docs/modules/pos-terminal-ui.md
 * "Thirty-first pass".
 *
 * Full-width header at the very top (not offset by the sidebar), with the
 * sidebar sitting below it, left-hand side, sliding in/out via one
 * `sidebarVisible` signal. Two different visual behaviors share that one
 * signal, chosen by `isPosRoute` (reactive — tracks the current route, not
 * just the one it started on): outside `/pos/`, the sidebar **pushes**
 * content (`<main>`'s own left margin toggles in sync, no backdrop, desktop
 * convention); on any `/pos/` route it **overlays** content instead (no
 * margin push, a dimming backdrop at every breakpoint — not just mobile —
 * and a nav-link tap or backdrop click closes it), since POS screens want
 * their full width back the moment the sidebar isn't actively needed.
 * `isPosRoute` flipping (entering or leaving the `/pos/` section) also
 * auto-collapses/expands `sidebarVisible` to match — but only on that
 * transition, not on every navigation within the same section, so a manual
 * toggle while browsing several POS pages (or several non-POS ones) in a
 * row isn't fought on each click.
 *
 * `headerNavItems` is an optional second list of links shown directly in the
 * header (not nested in the sidebar's collapsible groups) — the User shell
 * passes the POS section's own items there; Admin/Developer leave it empty.
 * `fullBleedContent` drops <main>'s padding/scroll wrapper for a page (the
 * Terminal) that manages its own internal scrolling regions instead of using
 * this shell's default padded/scrollable content area.
 */
@Component({
  selector: 'app-sidebar-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NotificationBell, Toast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-dvh flex-col overflow-hidden bg-slate-50">
      <!-- Full-width header — spans the whole top, not offset by the sidebar. -->
      <header class="z-40 flex h-16 w-full shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
        <button
          type="button"
          (click)="sidebarVisible.set(!sidebarVisible())"
          aria-label="Toggle navigation menu"
          class="shrink-0 rounded-md p-2 text-slate-600 hover:bg-slate-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-6 w-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>

        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          {{ productName().charAt(0) }}
        </div>
        <span class="hidden shrink-0 truncate text-sm font-semibold text-slate-900 sm:inline">{{ productName() }}</span>

        @if (headerNavItems().length > 0) {
          <nav class="ml-2 hidden min-w-0 items-center gap-1 overflow-x-auto md:flex">
            @for (item of headerNavItems(); track item.route) {
              <a
                [routerLink]="item.route"
                routerLinkActive="bg-indigo-50 text-indigo-700"
                [routerLinkActiveOptions]="{ exact: false }"
                class="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4 shrink-0">
                  <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="item.iconPath" />
                </svg>
                {{ item.label }}
              </a>
            }
          </nav>
        }

        <div class="ml-auto flex shrink-0 items-center gap-2">
          <app-notification-bell />

          @if (authService.currentUser(); as user) {
            <div class="relative" #accountMenuRoot>
              <button
                type="button"
                (click)="toggleMenu($event)"
                aria-label="Account menu"
                class="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 hover:bg-indigo-200"
              >
                {{ initials() }}
              </button>

              @if (menuOpen()) {
                <div class="absolute right-0 top-full z-10 mt-2 w-60 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                  <div class="border-b border-slate-100 px-3 py-2">
                    <p class="truncate text-sm font-medium text-slate-900">{{ user.displayName }}</p>
                    <p class="truncate text-xs text-slate-500">{{ user.email }}</p>
                    <p class="truncate text-[11px] uppercase tracking-wide text-slate-400">{{ user.roles.join(', ') }}</p>
                  </div>
                  <a
                    [routerLink]="profileRoute()"
                    (click)="menuOpen.set(false)"
                    class="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
                      />
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
        </div>
      </header>

      <div class="flex min-h-0 flex-1 overflow-hidden">
        <!-- Backdrop — always shown below md (mobile always overlays), and
             at every breakpoint on a /pos/ route (POS always overlays, even
             on desktop, instead of pushing content). -->
        @if (sidebarVisible()) {
          <div class="fixed inset-0 z-30 bg-slate-900/40" [class.md:hidden]="!isPosRoute()" (click)="sidebarVisible.set(false)"></div>
        }

        <!-- Sidebar — sits below the header (top-16, not inset-y-0), sliding
             via translateX at every breakpoint now, not just on mobile. -->
        <aside
          class="fixed bottom-0 left-0 top-16 z-40 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-transform duration-200"
          [class.translate-x-0]="sidebarVisible()"
          [class.-translate-x-full]="!sidebarVisible()"
        >
          <nav class="flex-1 space-y-1 px-3 py-3">
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
                          (click)="closeIfOverlay()"
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
                  (click)="closeIfOverlay()"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5 shrink-0">
                    <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="item.iconPath" />
                  </svg>
                  {{ item.label }}
                </a>
              }
            }
          </nav>
        </aside>

        <!-- Main content — offset by the sidebar's width whenever it's
             visible AND pushing (never on a /pos/ route, where the sidebar
             overlays instead — see the class doc comment). transition-
             [margin] keeps the push in sync with the sidebar's own slide
             animation. fullBleedContent drops the padded/scrollable wrapper
             for a page that manages its own internal scrolling regions (the
             POS Terminal) instead of this shell's default one. -->
        <main
          class="flex min-h-0 flex-1 flex-col overflow-hidden transition-[margin] duration-200"
          [class.md:ml-64]="sidebarVisible() && !isPosRoute()"
        >
          <div [class]="fullBleedContent() ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-y-auto p-4 md:p-8'">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>

    <app-toast />
  `,
})
export class SidebarLayout implements OnInit {
  readonly navItems = input.required<NavItem[]>();
  readonly productName = input<string>('Complaint Management System');
  /** Extra links shown directly in the header, not nested in the sidebar's collapsible groups — e.g. the User shell's POS section. Empty for shells that don't need this (Admin/Developer). */
  readonly headerNavItems = input<NavItem[]>([]);
  /** Drops <main>'s default padding/scroll wrapper for a page that manages its own internal scrolling regions instead (the POS Terminal). */
  readonly fullBleedContent = input<boolean>(false);

  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);
  private readonly toastService = inject(ToastService);

  @ViewChild('accountMenuRoot') private accountMenuRoot?: ElementRef<HTMLElement>;

  protected readonly loggingOut = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly expandedGroups = signal<ReadonlySet<string>>(new Set());

  /** Reactive — tracks the *current* route, not just the one this component started on. Drives both the overlay-vs-push visual choice and (via ngOnInit's subscription) the auto-collapse/expand on entering/leaving the section. */
  protected readonly isPosRoute = signal(this.router.url.includes('/pos/'));

  /** Visible everywhere by default, except a route under `/pos/` — that initial value is `!isPosRoute()`'s starting value; after that, only the toggle button, `closeIfOverlay()`, or an `isPosRoute` transition (see ngOnInit) ever touches it. */
  protected readonly sidebarVisible = signal(!this.isPosRoute());

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

  /** Tapping a nav link auto-closes the sidebar wherever it's currently an overlay (mobile at any breakpoint, or POS at every breakpoint) but leaves it alone wherever it pushes content instead (desktop, outside `/pos/`) — there it's otherwise only user-toggled. */
  protected closeIfOverlay(): void {
    if (this.isPosRoute() || window.innerWidth < MOBILE_BREAKPOINT_PX) {
      this.sidebarVisible.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.accountMenuRoot?.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  ngOnInit(): void {
    // Connected for the lifetime of this shell (every authenticated route
    // renders inside one) — see docs/modules/realtime.md. Consumers
    // (notification-bell, list pages) inject RealtimeService directly
    // rather than this component re-broadcasting events further.
    this.realtimeService.connect();
    this.destroyRef.onDestroy(() => this.realtimeService.disconnect());

    // Surfaces every push as a toast on top of the notification bell's own
    // badge/list — see ToastService's doc comment. Purely additive: a
    // dropped connection just means no toast, same "degrades to polling
    // only" story as everywhere else that consumes this observable.
    this.realtimeService.notificationCreated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((payload) => {
      this.toastService.show(payload.title, payload.message, payload.ticketId);
    });

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

    // Keeps isPosRoute genuinely reactive (not just the value it started
    // with) and auto-collapses/expands the sidebar exactly on the
    // transition into/out of a /pos/ route — not on every navigation
    // within the same section, so a manual toggle while browsing several
    // POS (or several non-POS) pages in a row isn't fought on each click.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        const wasPos = this.isPosRoute();
        const isPos = event.urlAfterRedirects.includes('/pos/');
        if (isPos !== wasPos) {
          this.isPosRoute.set(isPos);
          this.sidebarVisible.set(!isPos);
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
