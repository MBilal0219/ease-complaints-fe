import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SidebarLayout } from '../../layout/sidebar-layout/sidebar-layout';
import { NavItem } from '../../layout/sidebar-layout/nav-item';

/** The dedicated, full-bleed POS Terminal route — see docs/modules/pos-terminal-ui.md "Thirty-first pass". It's the one child route under this shell that needs SidebarLayout's `fullBleedContent` (it manages its own internal scrolling regions) instead of the default padded/scrollable content area. */
const POS_TERMINAL_ROUTE = '/app/user/pos/sale';

export const USER_NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    route: '/app/user/dashboard',
    iconPath: 'M3.75 3.75h6.75v6.75H3.75V3.75Zm0 9.75h6.75v6.75H3.75V13.5Zm9.75-9.75h6.75v6.75h-6.75V3.75Zm0 9.75h6.75v6.75h-6.75V13.5Z',
  },
  {
    label: 'Complaints',
    iconPath: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    children: [
      {
        label: 'New Complaint',
        route: '/app/user/new-complaint',
        iconPath: 'M12 4.5v15m7.5-7.5h-15',
      },
      {
        label: 'My Complaints',
        route: '/app/user/my-complaints',
        iconPath: 'M9 12h3.75M9 15h3.75M9 18h3.75m3-16.5H6.75a2.25 2.25 0 0 0-2.25 2.25v16.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75L15.75 1.5Z',
      },
    ],
  },
  {
    label: 'POS',
    iconPath: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3M3.75 4.5h16.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5Z',
    children: [
      {
        label: 'Sale',
        route: '/app/user/pos/sale',
        iconPath: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.98-4.804 2.53-7.454.107-.51-.281-.996-.803-.996H5.25M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z',
      },
      {
        label: 'Held Orders',
        route: '/app/user/pos/held-orders',
        iconPath: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
      },
      {
        label: 'Products',
        route: '/app/user/pos/products',
        iconPath: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z',
      },
      {
        label: 'Categories',
        route: '/app/user/pos/categories',
        iconPath: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
      },
      {
        label: 'Tables',
        route: '/app/user/pos/tables',
        iconPath: 'M3.75 6.75h16.5M3.75 6.75v10.5A2.25 2.25 0 0 0 6 19.5h12a2.25 2.25 0 0 0 2.25-2.25V6.75M3.75 6.75 5.25 3h13.5l1.5 3.75M8.25 19.5V6.75m7.5 12.75V6.75',
      },
      {
        label: 'Billing',
        route: '/app/user/pos/billing',
        iconPath: 'M9 14.25 4.5 9.75l4.5-4.5M4.5 9.75h9a5.25 5.25 0 0 1 0 10.5h-1.5m0-15.75h6.75a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25',
      },
      {
        label: 'Settings',
        route: '/app/user/pos/settings',
        iconPath: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z',
      },
    ],
  },
];

/** Same shell/sidebar as Admin and Developer, plus two things only User needs: the POS section's items surfaced directly in the header (not just nested in the sidebar's collapsible "POS" group), and full-bleed content specifically for the Terminal route. */
@Component({
  selector: 'app-user-shell',
  imports: [SidebarLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-sidebar-layout [navItems]="navItems" [headerNavItems]="posHeaderItems" [fullBleedContent]="isTerminalRoute()" />`,
})
export class UserShell {
  protected readonly navItems = USER_NAV_ITEMS;
  protected readonly posHeaderItems = USER_NAV_ITEMS.find((item) => item.label === 'POS')?.children ?? [];

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isTerminalRoute = signal(this.router.url.startsWith(POS_TERMINAL_ROUTE));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.isTerminalRoute.set(event.urlAfterRedirects.startsWith(POS_TERMINAL_ROUTE)));
  }
}
