import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-user-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Welcome, {{ authService.currentUser()?.displayName }}</h1>
    <p class="mt-1 text-sm text-slate-500">
      Signed in as User. Complaint creation and tracking are built in a later module.
    </p>
  `,
})
export class UserLandingPage {
  protected readonly authService = inject(AuthService);
}
