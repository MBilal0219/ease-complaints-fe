import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SidebarLayout } from '../../layout/sidebar-layout/sidebar-layout';
import { NavItem } from '../../layout/sidebar-layout/nav-item';

const IMPLEMENTATOR_NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    route: '/app/implementator/dashboard',
    iconPath: 'M3.75 3.75h6.75v6.75H3.75V3.75Zm0 9.75h6.75v6.75H3.75V13.5Zm9.75-9.75h6.75v6.75h-6.75V3.75Zm0 9.75h6.75v6.75h-6.75V13.5Z',
  },
  {
    label: 'Complaints',
    route: '/app/implementator/tickets',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z',
  },
  {
    label: 'Kanban',
    route: '/app/implementator/kanban',
    iconPath: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
  },
  {
    label: 'Companies',
    route: '/app/implementator/companies',
    iconPath: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21',
  },
  {
    label: 'Parties',
    route: '/app/implementator/parties',
    iconPath: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
  },
];

/** Same shell/sidebar as every other role — only the nav items differ. Implementator manages the complaint workflow plus company/party admin (see RoleNames.ComplaintManagers on the backend) — the complaint/company-focused subset of the Admin area. */
@Component({
  selector: 'app-implementator-shell',
  imports: [SidebarLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-sidebar-layout [navItems]="navItems" />`,
})
export class ImplementatorShell {
  protected readonly navItems = IMPLEMENTATOR_NAV_ITEMS;
}
