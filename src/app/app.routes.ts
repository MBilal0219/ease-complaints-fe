import { Routes } from '@angular/router';
import { ROLE_ADMIN, ROLE_DEVELOPER, ROLE_USER } from './core/auth/models';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { roleGuard } from './core/guards/role.guard';
import { roleLandingRedirectGuard } from './core/guards/role-landing-redirect.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/reset-password/reset-password').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'invite/accept/:token',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/accept-invitation/accept-invitation').then((m) => m.AcceptInvitationPage),
  },

  // Bare /app never renders anything — it just resolves the caller's role
  // and redirects into that role's own shell below.
  {
    path: 'app',
    pathMatch: 'full',
    canActivate: [authGuard, roleLandingRedirectGuard],
    children: [],
  },

  // Every role uses the same sidebar shell (layout/sidebar-layout) — only
  // the nav items differ, set by each role's thin *-shell.ts wrapper.
  {
    path: 'app/admin',
    canActivate: [authGuard, roleGuard(ROLE_ADMIN)],
    loadComponent: () => import('./features/admin/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/admin/dashboard/dashboard').then((m) => m.DashboardPage) },
      { path: 'tickets', loadComponent: () => import('./features/admin/tickets/tickets').then((m) => m.AdminTicketsPage) },
      { path: 'tickets/:id', loadComponent: () => import('./features/tickets/ticket-detail/ticket-detail').then((m) => m.TicketDetailPage) },
      { path: 'parties', loadComponent: () => import('./features/admin/parties/parties').then((m) => m.PartiesPage) },
      { path: 'parties/:id', data: { personRole: 'Party' }, loadComponent: () => import('./features/admin/person-detail/person-detail').then((m) => m.PersonDetailPage) },
      { path: 'developers', loadComponent: () => import('./features/admin/developers/developers').then((m) => m.DevelopersPage) },
      { path: 'developers/:id', data: { personRole: 'Developer' }, loadComponent: () => import('./features/admin/person-detail/person-detail').then((m) => m.PersonDetailPage) },
      { path: 'sessions', loadComponent: () => import('./features/auth/sessions/sessions').then((m) => m.SessionsPage) },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage) },
    ],
  },
  {
    path: 'app/developer',
    canActivate: [authGuard, roleGuard(ROLE_DEVELOPER)],
    loadComponent: () => import('./features/developer/developer-shell').then((m) => m.DeveloperShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/developer/dashboard/dashboard').then((m) => m.DeveloperDashboardPage) },
      { path: 'board', loadComponent: () => import('./features/developer/kanban/kanban').then((m) => m.KanbanPage) },
      { path: 'tickets/:id', loadComponent: () => import('./features/tickets/ticket-detail/ticket-detail').then((m) => m.TicketDetailPage) },
      { path: 'sessions', loadComponent: () => import('./features/auth/sessions/sessions').then((m) => m.SessionsPage) },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage) },
    ],
  },
  {
    path: 'app/user',
    canActivate: [authGuard, roleGuard(ROLE_USER)],
    loadComponent: () => import('./features/user/user-shell').then((m) => m.UserShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/user/dashboard/dashboard').then((m) => m.PartyDashboardPage) },
      { path: 'my-complaints', loadComponent: () => import('./features/user/my-complaints/my-complaints').then((m) => m.MyComplaintsPage) },
      { path: 'new-complaint', loadComponent: () => import('./features/user/new-complaint/new-complaint').then((m) => m.NewComplaintPage) },
      { path: 'tickets/:id', loadComponent: () => import('./features/tickets/ticket-detail/ticket-detail').then((m) => m.TicketDetailPage) },
      // POS — see docs/modules/pos-overview.md. "Sale" (the Terminal) is now
      // a normal child route like every other POS page — see
      // docs/modules/pos-terminal-ui.md "Thirty-first pass": it used to be a
      // dedicated top-level route outside this shell entirely, with its own
      // full-bleed layout; it now renders inside UserShell/SidebarLayout like
      // everything else, via SidebarLayout's `fullBleedContent` input.
      { path: 'pos/sale', loadComponent: () => import('./features/user/pos-terminal/pos-terminal').then((m) => m.PosTerminalPage) },
      { path: 'pos/held-orders', loadComponent: () => import('./features/user/pos-held-orders/pos-held-orders').then((m) => m.PosHeldOrdersPage) },
      { path: 'pos/products', loadComponent: () => import('./features/user/pos-products/pos-products').then((m) => m.PosProductsPage) },
      { path: 'pos/categories', loadComponent: () => import('./features/user/pos-categories/pos-categories').then((m) => m.PosCategoriesPage) },
      { path: 'pos/tables', loadComponent: () => import('./features/user/pos-tables/pos-tables').then((m) => m.PosTablesPage) },
      { path: 'pos/billing', loadComponent: () => import('./features/user/pos-billing/pos-billing').then((m) => m.PosBillingPage) },
      { path: 'pos/settings', loadComponent: () => import('./features/user/pos-settings/pos-settings').then((m) => m.PosSettingsPage) },
      { path: 'sessions', loadComponent: () => import('./features/auth/sessions/sessions').then((m) => m.SessionsPage) },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage) },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
