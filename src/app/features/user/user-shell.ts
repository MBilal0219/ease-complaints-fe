import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SidebarLayout } from '../../layout/sidebar-layout/sidebar-layout';
import { NavItem } from '../../layout/sidebar-layout/nav-item';

const USER_NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    route: '/app/user/dashboard',
    iconPath: 'M3.75 3.75h6.75v6.75H3.75V3.75Zm0 9.75h6.75v6.75H3.75V13.5Zm9.75-9.75h6.75v6.75h-6.75V3.75Zm0 9.75h6.75v6.75h-6.75V13.5Z',
  },
];

/** Same shell/sidebar as Admin and Developer — only the nav items differ per role. */
@Component({
  selector: 'app-user-shell',
  imports: [SidebarLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-sidebar-layout [navItems]="navItems" />`,
})
export class UserShell {
  protected readonly navItems = USER_NAV_ITEMS;
}
