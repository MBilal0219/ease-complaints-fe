import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SidebarLayout } from '../../layout/sidebar-layout/sidebar-layout';
import { NavItem } from '../../layout/sidebar-layout/nav-item';

const IMPLEMENTATOR_NAV_ITEMS: NavItem[] = [
  {
    label: 'Complaints',
    route: '/app/implementator/tickets',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z',
  },
];

/** Same shell/sidebar as every other role — only the nav items differ. Implementator manages the complaint workflow only (see RoleNames.ComplaintManagers on the backend) — no account-management or dashboard area of its own. */
@Component({
  selector: 'app-implementator-shell',
  imports: [SidebarLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-sidebar-layout [navItems]="navItems" />`,
})
export class ImplementatorShell {
  protected readonly navItems = IMPLEMENTATOR_NAV_ITEMS;
}
