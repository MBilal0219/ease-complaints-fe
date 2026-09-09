import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_ADMIN } from '../../../core/auth/models';
import { LeadsService } from '../../../core/leads/leads.service';

/**
 * Directly-added Lead — not tied to any call. Shared by Admin and Sales
 * Person, see docs/modules/leads.md. No category field here, deliberately —
 * per user feedback, a lead is only ever categorized via a follow-up.
 */
@Component({
  selector: 'app-lead-form',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="basePath()" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back to Leads</a>
    <h1 class="mt-2 text-lg font-semibold text-slate-900">Add a Lead</h1>
    <p class="mt-1 text-sm text-slate-500">For someone you're trying to sell to who isn't an existing customer yet.</p>

    <div class="mt-6 max-w-xl space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <label class="block text-sm font-medium text-slate-700">Name</label>
        <input
          type="text"
          [(ngModel)]="name"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700">Contact</label>
        <input
          type="text"
          [(ngModel)]="contact"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700">Email (optional)</label>
        <input
          type="email"
          [(ngModel)]="email"
          placeholder="Saves having to ask for it again when closing the deal"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-slate-700">Business name</label>
          <input
            type="text"
            [(ngModel)]="businessName"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">Business contact</label>
          <input
            type="text"
            [(ngModel)]="businessContact"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-slate-700">Post</label>
          <input
            type="text"
            [(ngModel)]="post"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">Business nature</label>
          <input
            type="text"
            [(ngModel)]="businessNature"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700">Remarks</label>
        <textarea
          rows="2"
          [(ngModel)]="remarks"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        ></textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700">Feedback</label>
        <textarea
          rows="2"
          [(ngModel)]="feedback"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        ></textarea>
      </div>
      <p class="text-xs text-slate-400">No category yet — that gets set the first time you log a follow-up.</p>

      @if (error()) {
        <p class="text-sm text-red-600" role="alert">{{ error() }}</p>
      }

      <div class="flex justify-end gap-3 pt-2">
        <a [routerLink]="basePath()" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</a>
        <button
          type="button"
          (click)="submit()"
          [disabled]="saving() || !name.trim() || !contact.trim()"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {{ saving() ? 'Saving…' : 'Add Lead' }}
        </button>
      </div>
    </div>
  `,
})
export class LeadFormPage {
  private readonly leadsService = inject(LeadsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected name = '';
  protected contact = '';
  protected email = '';
  protected businessName = '';
  protected businessContact = '';
  protected post = '';
  protected businessNature = '';
  protected remarks = '';
  protected feedback = '';
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly basePath = computed(() => {
    const roles = this.authService.currentUser()?.roles ?? [];
    return roles.includes(ROLE_ADMIN) ? '/app/admin/leads' : '/app/sales-person/leads';
  });

  submit(): void {
    if (this.saving() || !this.name.trim() || !this.contact.trim()) return;

    this.saving.set(true);
    this.error.set(null);
    this.leadsService
      .createLead({
        name: this.name.trim(),
        contact: this.contact.trim(),
        email: this.email.trim() || undefined,
        businessName: this.businessName.trim() || undefined,
        businessContact: this.businessContact.trim() || undefined,
        post: this.post.trim() || undefined,
        businessNature: this.businessNature.trim() || undefined,
        remarks: this.remarks.trim() || undefined,
        feedback: this.feedback.trim() || undefined,
      })
      .subscribe({
        next: (lead) => {
          this.saving.set(false);
          this.router.navigate([this.basePath(), lead.id]);
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(error.error?.error ?? 'Could not add this lead.');
        },
      });
  }
}
