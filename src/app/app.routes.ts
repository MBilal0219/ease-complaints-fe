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

  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', canActivate: [roleLandingRedirectGuard], children: [] },
      {
        path: 'admin',
        canActivate: [roleGuard(ROLE_ADMIN)],
        loadComponent: () => import('./features/landing/admin-landing').then((m) => m.AdminLandingPage),
      },
      {
        path: 'developer',
        canActivate: [roleGuard(ROLE_DEVELOPER)],
        loadComponent: () => import('./features/landing/developer-landing').then((m) => m.DeveloperLandingPage),
      },
      {
        path: 'user',
        canActivate: [roleGuard(ROLE_USER)],
        loadComponent: () => import('./features/landing/user-landing').then((m) => m.UserLandingPage),
      },
      {
        path: 'sessions',
        loadComponent: () => import('./features/auth/sessions/sessions').then((m) => m.SessionsPage),
      },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
