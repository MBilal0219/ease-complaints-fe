import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SidebarLayout } from '../../layout/sidebar-layout/sidebar-layout';
import { NavItem } from '../../layout/sidebar-layout/nav-item';

const USER_NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    route: '/app/user/dashboard',
    iconPath: 'M3.75 3.75h6.75v6.75H3.75V3.75Zm0 9.75h6.75v6.75H3.75V13.5Zm9.75-9.75h6.75v6.75h-6.75V3.75Zm0 9.75h6.75v6.75h-6.75V13.5Z',
  },
  {
    label: 'My Complaints',
    route: '/app/user/my-complaints',
    iconPath: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
  },
  {
    label: 'New Complaint',
    route: '/app/user/new-complaint',
    iconPath: 'M12 4.5v15m7.5-7.5h-15',
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
