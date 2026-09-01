import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-developer-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Welcome, {{ authService.currentUser()?.displayName }}</h1>
    <p class="mt-1 text-sm text-slate-500">
      Signed in as Developer. The ticket workboard is built in a later module.
    </p>
  `,
})
export class DeveloperLandingPage {
  protected readonly authService = inject(AuthService);
}
