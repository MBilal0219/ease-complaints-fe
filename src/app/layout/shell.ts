import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh bg-slate-50">
      <header class="border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <a routerLink="/app" class="text-sm font-semibold text-slate-900">Complaint Management System</a>

          @if (authService.currentUser(); as user) {
            <div class="flex items-center gap-4">
              <a routerLink="/app/sessions" class="text-sm text-slate-600 hover:text-slate-900">Sessions</a>
              <span class="text-sm text-slate-600">{{ user.displayName }} · {{ user.roles.join(', ') }}</span>
              <button
                type="button"
                (click)="logout()"
                [disabled]="loggingOut()"
                class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Log out
              </button>
            </div>
          }
        </div>
      </header>

      <main class="mx-auto max-w-4xl px-4 py-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class Shell {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loggingOut = signal(false);

  logout(): void {
    this.loggingOut.set(true);
    this.authService.logout().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }
}
