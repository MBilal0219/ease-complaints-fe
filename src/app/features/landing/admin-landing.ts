import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';

interface InvitationDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAtUtc: string;
  expiresAtUtc: string;
}

/**
 * Minimal invite panel — the full Admin dashboard (tickets, reports, user
 * management beyond inviting) is a later module. This exists because
 * Admin-issued invitations are explicitly part of Authentication & Onboarding.
 */
@Component({
  selector: 'app-admin-landing',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Welcome, {{ authService.currentUser()?.displayName }}</h1>
    <p class="mt-1 text-sm text-slate-500">
      Signed in as Admin. Invite Developers or Users below — the full Admin dashboard and ticket
      management screens belong to a later module.
    </p>

    <form class="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4" [formGroup]="form" (ngSubmit)="submit()">
      <div>
        <label for="displayName" class="block text-sm font-medium text-slate-700">Name</label>
        <input id="displayName" type="text" formControlName="displayName" class="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label for="email" class="block text-sm font-medium text-slate-700">Email</label>
        <input id="email" type="email" formControlName="email" class="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label for="role" class="block text-sm font-medium text-slate-700">Role</label>
        <select id="role" formControlName="role" class="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="Developer">Developer</option>
          <option value="User">User</option>
        </select>
      </div>
      <button
        type="submit"
        [disabled]="form.invalid || submitting()"
        class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {{ submitting() ? 'Sending…' : 'Send invitation' }}
      </button>
    </form>

    @if (errorMessage()) {
      <p class="mt-2 text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
    }

    <ul class="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      @for (invitation of invitations(); track invitation.id) {
        <li class="flex items-center justify-between px-4 py-3 text-sm">
          <span>{{ invitation.displayName }} · {{ invitation.email }} · {{ invitation.role }}</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{{ invitation.status }}</span>
        </li>
      } @empty {
        <li class="px-4 py-3 text-sm text-slate-500">No invitations sent yet.</li>
      }
    </ul>
  `,
})
export class AdminLandingPage implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);

  protected readonly invitations = signal<InvitationDto[]>([]);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    role: ['Developer', [Validators.required]],
  });

  ngOnInit(): void {
    this.loadInvitations();
  }

  private loadInvitations(): void {
    this.http.get<InvitationDto[]>('/api/v1/auth/invitations').subscribe({
      next: (invitations) => this.invitations.set(invitations),
      error: () => this.invitations.set([]),
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.http.post<InvitationDto>('/api/v1/auth/invitations', this.form.getRawValue()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.form.reset({ displayName: '', email: '', role: 'Developer' });
        this.loadInvitations();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not send the invitation.');
      },
    });
  }
}
