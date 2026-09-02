import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-profile',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Profile</h1>

    @if (authService.currentUser(); as user) {
      <div class="mt-6 max-w-md rounded-lg border border-slate-200 bg-white p-4">
        <dl class="divide-y divide-slate-100 text-sm">
          <div class="flex justify-between py-2">
            <dt class="text-slate-500">Name</dt>
            <dd class="font-medium text-slate-900">{{ user.displayName }}</dd>
          </div>
          <div class="flex justify-between py-2">
            <dt class="text-slate-500">Email</dt>
            <dd class="font-medium text-slate-900">{{ user.email }}</dd>
          </div>
          <div class="flex justify-between py-2">
            <dt class="text-slate-500">Role</dt>
            <dd class="font-medium text-slate-900">{{ user.roles.join(', ') }}</dd>
          </div>
        </dl>
      </div>

      <div class="mt-4 flex gap-3 text-sm">
        <a routerLink="/app/sessions" class="text-indigo-600 hover:underline">Manage sessions</a>
        <a routerLink="/forgot-password" class="text-indigo-600 hover:underline">Change password</a>
      </div>
    }
  `,
})
export class ProfilePage {
  protected readonly authService = inject(AuthService);
}
