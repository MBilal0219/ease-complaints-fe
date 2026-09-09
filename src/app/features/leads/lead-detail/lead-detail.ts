import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_ADMIN } from '../../../core/auth/models';
import {
  LEAD_CATEGORY_BADGE_CLASSES,
  LEAD_CATEGORY_LABELS,
  LEAD_INVITATION_STATUS_BADGE_CLASSES,
  LEAD_INVITATION_STATUS_LABELS,
  LEAD_SOURCE_BADGE_CLASSES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_BADGE_CLASSES,
  LEAD_STATUS_LABELS,
  LeadCategory,
  LeadDetail,
  LeadFollowUpStatus,
} from '../../../core/leads/models';
import { LeadsService } from '../../../core/leads/leads.service';

const CATEGORY_OPTIONS: LeadCategory[] = ['APlus', 'Cool', 'Warm'];
const STATUS_OPTIONS: LeadFollowUpStatus[] = ['InProgress', 'Won', 'Cancelled'];

/** Local calendar date as YYYY-MM-DD — see calls.ts's own copy of this helper for why not toISOString(). */
function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Full audit trail for one Lead — shared by Admin and Sales Person, see docs/modules/leads.md. */
@Component({
  selector: 'app-lead-detail',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notFound()) {
      <div class="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p class="text-sm text-slate-500">{{ notFound() }}</p>
        <a [routerLink]="basePath()" class="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back to Leads</a>
      </div>
    } @else if (lead(); as l) {
      <a [routerLink]="basePath()" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back to Leads</a>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <h1 class="text-lg font-semibold text-slate-900">{{ l.name }}</h1>
        <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="sourceClasses[l.source]">{{ sourceLabels[l.source] }}</span>
        @if (l.currentCategory; as category) {
          <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="categoryClasses[category]">{{ categoryLabels[category] }}</span>
        } @else {
          <span class="text-xs text-slate-400">Not yet followed up</span>
        }
        @if (l.currentStatus; as status) {
          <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusClasses[status]">{{ statusLabels[status] }}</span>
        }
        @if (l.isConverted) {
          <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Converted to customer</span>
        } @else if (l.pendingInvitation; as invitation) {
          <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="invitationStatusClasses[invitation.status]">{{ invitationStatusLabels[invitation.status] }}</span>
        }
      </div>
      @if (l.source === 'Referral' && l.customerDisplayName) {
        <p class="mt-1 text-sm text-slate-500">
          Referred by {{ l.customerDisplayName }}
          @if (l.callId) {
            · <a [routerLink]="['/app/sales-person/calls', l.callId]" class="text-indigo-600 hover:text-indigo-500">view the call</a>
          }
        </p>
      }

      <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div class="rounded-lg border border-slate-200 bg-white">
            <h2 class="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">Timeline</h2>
            <div class="space-y-4 p-4">
              @for (entry of l.timeline; track $index) {
                <div class="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-sm font-medium text-slate-800">
                      {{ entry.type === 'Initial' ? 'Initial contact' : 'Follow-up' }} — {{ entry.actorDisplayName }} ({{ entry.actorRole }})
                    </span>
                    <span class="text-xs text-slate-400">{{ entry.createdAtUtc | date: 'medium' }}</span>
                  </div>
                  <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                    @if (entry.category; as category) {
                      <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" [class]="categoryClasses[category]">{{ categoryLabels[category] }}</span>
                    } @else {
                      <span class="inline-flex text-xs text-slate-400">Not yet categorized</span>
                    }
                    @if (entry.status; as status) {
                      <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusClasses[status]">{{ statusLabels[status] }}</span>
                    }
                  </div>
                  @if (entry.remarks) {
                    <p class="mt-1.5 text-sm text-slate-700">{{ entry.remarks }}</p>
                  }
                  @if (entry.cancellationReason) {
                    <p class="mt-1 text-sm text-red-700">Cancelled: {{ entry.cancellationReason }}</p>
                  }
                  @if (entry.scheduledNextCallUtc) {
                    <p class="mt-1 text-xs text-slate-500">Next call scheduled: {{ entry.scheduledNextCallUtc | date: 'mediumDate' }}</p>
                  }
                  @if (entry.agreementAmount != null) {
                    <p class="mt-1 text-xs font-medium text-emerald-700">Agreement amount: {{ entry.agreementAmount | number: '1.0-2' }}</p>
                  }
                  @if (entry.feedback) {
                    <p class="mt-1 text-sm italic text-slate-500">"{{ entry.feedback }}"</p>
                  }
                </div>
              }
            </div>

            @if (l.isConverted) {
              <div class="border-t border-slate-100 p-4">
                <p class="text-sm text-slate-500">This referral has been converted to a customer — no further follow-ups needed.</p>
              </div>
            } @else {
            <div class="border-t border-slate-100 p-4">
              <h3 class="text-sm font-medium text-slate-700">Log a follow-up</h3>
              <div class="mt-2 space-y-2.5">
                <div class="grid grid-cols-2 gap-2.5">
                  <select
                    [(ngModel)]="followUpCategory"
                    class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    @for (option of categoryOptions; track option) {
                      <option [value]="option">{{ categoryLabels[option] }}</option>
                    }
                  </select>
                  <select
                    [ngModel]="followUpStatus"
                    (ngModelChange)="onStatusChange($event)"
                    class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    @for (option of statusOptions; track option) {
                      <option [value]="option">{{ statusLabels[option] }}</option>
                    }
                  </select>
                </div>

                @if (followUpStatus === 'Cancelled') {
                  <textarea
                    rows="2"
                    placeholder="Reason for cancelling (required)"
                    [(ngModel)]="followUpCancellationReason"
                    class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  ></textarea>
                }

                @if (followUpStatus === 'InProgress') {
                  <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <label class="block text-xs font-medium text-slate-600">Schedule next call (optional)</label>
                    <div class="mt-1.5 flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        [(ngModel)]="followUpScheduledNextCall"
                        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button type="button" (click)="scheduleQuick(7)" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">+7 days</button>
                      <button type="button" (click)="scheduleQuick(14)" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">+2 weeks</button>
                      @if (followUpScheduledNextCall) {
                        <button type="button" (click)="followUpScheduledNextCall = ''" class="text-xs font-medium text-slate-400 hover:text-slate-600">Clear</button>
                      }
                    </div>
                    <p class="mt-1 text-xs text-slate-400">You'll get a reminder notification on this day.</p>
                  </div>
                }

                @if (showAgreementAmount()) {
                  <div class="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Agreement amount (optional)"
                      [(ngModel)]="followUpAgreementAmount"
                      class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <label class="block">
                      <span class="block text-xs font-medium text-emerald-800">Agreement document (optional)</span>
                      <input
                        type="file"
                        (change)="onAgreementFileSelected($event)"
                        class="mt-1 block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
                      />
                    </label>
                    @if (pendingAgreementFile(); as file) {
                      <p class="text-xs text-emerald-700">Selected: {{ file.name }}</p>
                    }
                    <p class="text-xs text-emerald-700/70">Either can be added now, or later on a future follow-up — both optional.</p>
                  </div>
                }

                @if (needsConversionFields()) {
                  <div class="space-y-2 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                    <p class="text-xs font-medium text-indigo-800">Closing this deal turns {{ l.name }} into a customer account.</p>
                    <input
                      type="email"
                      placeholder="Email (required to close)"
                      [(ngModel)]="followUpEmail"
                      class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <label class="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" [(ngModel)]="followUpSendInvite" />
                      Send an email invitation (recipient sets their own password)
                    </label>
                    @if (!followUpSendInvite) {
                      <input
                        type="password"
                        placeholder="Password (at least 8 characters)"
                        [(ngModel)]="followUpPassword"
                        class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    }
                  </div>
                }

                <textarea
                  rows="2"
                  placeholder="Remarks (optional)"
                  [(ngModel)]="followUpRemarks"
                  class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                ></textarea>
                <textarea
                  rows="2"
                  placeholder="Feedback (optional)"
                  [(ngModel)]="followUpFeedback"
                  class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                ></textarea>
                @if (followUpError()) {
                  <p class="text-sm text-red-600" role="alert">{{ followUpError() }}</p>
                }
                <div class="flex justify-end">
                  <button
                    type="button"
                    (click)="logFollowUp()"
                    [disabled]="saving() || !canSubmitFollowUp()"
                    class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {{ saving() ? 'Saving…' : 'Log follow-up' }}
                  </button>
                </div>
              </div>
            </div>
            }
          </div>
        </div>

        <div class="space-y-4">
          <div class="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 class="text-sm font-semibold text-slate-900">Details</h2>
            <dl class="mt-3 space-y-2.5">
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Contact</dt>
                <dd class="text-right font-medium text-slate-700">{{ l.contact }}</dd>
              </div>
              @if (l.email) {
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Email</dt>
                  <dd class="text-right font-medium text-slate-700">{{ l.email }}</dd>
                </div>
              }
              @if (l.businessName) {
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Business</dt>
                  <dd class="text-right font-medium text-slate-700">{{ l.businessName }}</dd>
                </div>
              }
              @if (l.businessContact) {
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Business contact</dt>
                  <dd class="text-right font-medium text-slate-700">{{ l.businessContact }}</dd>
                </div>
              }
              @if (l.post) {
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Post</dt>
                  <dd class="text-right font-medium text-slate-700">{{ l.post }}</dd>
                </div>
              }
              @if (l.businessNature) {
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Business nature</dt>
                  <dd class="text-right font-medium text-slate-700">{{ l.businessNature }}</dd>
                </div>
              }
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Added by</dt>
                <dd class="text-right font-medium text-slate-700">{{ l.createdByDisplayName }} ({{ l.createdByRole }})</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">First contacted</dt>
                <dd class="text-right font-medium text-slate-700">{{ l.createdAtUtc | date: 'medium' }}</dd>
              </div>
            </dl>
          </div>

          @if (l.pendingInvitation; as invitation) {
            <div class="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <h2 class="text-sm font-semibold text-slate-900">Invitation</h2>
              <div class="mt-2 flex items-center justify-between gap-2">
                <span class="truncate text-slate-600">{{ invitation.email }}</span>
                <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" [class]="invitationStatusClasses[invitation.status]">{{ invitationStatusLabels[invitation.status] }}</span>
              </div>
              <p class="mt-1 text-xs text-slate-400">Sent {{ invitation.createdAtUtc | date: 'medium' }} · expires {{ invitation.expiresAtUtc | date: 'medium' }}</p>

              @if (invitation.status !== 'Accepted') {
                <p class="mt-2 text-xs text-slate-500">Hasn't set up their account yet — resend the email, or message them directly (see the Agreement section below).</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    (click)="resendInvitation()"
                    [disabled]="resendingInvitation()"
                    class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {{ resendingInvitation() ? 'Resending…' : 'Resend email' }}
                  </button>
                </div>
                @if (resendError()) {
                  <p class="mt-1 text-xs text-red-600" role="alert">{{ resendError() }}</p>
                }
              }
            </div>
          }

          @if (hasEverWon()) {
            <div class="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold text-slate-900">Agreement</h2>
                <button
                  type="button"
                  (click)="sendAgreementViaWhatsApp(l)"
                  class="shrink-0 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  Message on WhatsApp
                </button>
              </div>
              @if (l.agreementDocuments.length > 0) {
                <p class="mt-1 text-xs text-slate-400">Downloads the latest agreement document too — attach it in the chat that opens.</p>
              }

              <div class="mt-2 flex items-center gap-1.5">
                <span class="shrink-0 text-xs text-slate-500">Amount:</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Not set yet"
                  [(ngModel)]="agreementAmountDraft"
                  class="w-28 rounded-md border px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  [class]="l.agreementAmount == null ? 'border-amber-400 bg-amber-50' : 'border-slate-300'"
                />
                <button
                  type="button"
                  (click)="saveAgreementAmount()"
                  [disabled]="savingAgreementAmount()"
                  class="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {{ savingAgreementAmount() ? '…' : 'Save' }}
                </button>
              </div>
              @if (l.agreementAmount == null) {
                <p class="mt-1 text-xs font-medium text-amber-700">Amount not added yet.</p>
              }
              @if (agreementAmountError()) {
                <p class="mt-1 text-xs text-red-600" role="alert">{{ agreementAmountError() }}</p>
              }

              <h3 class="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</h3>
              @if (l.agreementDocuments.length > 0) {
                <ul class="mt-2 space-y-1.5">
                  @for (doc of l.agreementDocuments; track doc.id) {
                    <li class="flex items-center justify-between gap-2">
                      <a [href]="downloadUrl(doc.id)" target="_blank" rel="noopener" class="truncate text-indigo-600 hover:text-indigo-500">{{ doc.originalFileName }}</a>
                      <span class="shrink-0 text-xs text-slate-400">{{ doc.uploadedAtUtc | date: 'mediumDate' }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="mt-2 text-xs text-slate-400">None attached yet.</p>
              }

              <label class="mt-3 block">
                <span class="sr-only">Upload agreement document</span>
                <input
                  type="file"
                  (change)="onDocumentSelected($event)"
                  [disabled]="uploadingDocument()"
                  class="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </label>
              @if (uploadingDocument()) {
                <p class="mt-1 text-xs text-slate-400">Uploading…</p>
              }
              @if (uploadError()) {
                <p class="mt-1 text-xs text-red-600" role="alert">{{ uploadError() }}</p>
              }
            </div>
          }
        </div>
      </div>
    } @else {
      <p class="text-sm text-slate-500" role="status">Loading…</p>
    }
  `,
})
export class LeadDetailPage implements OnInit {
  protected readonly sourceLabels = LEAD_SOURCE_LABELS;
  protected readonly sourceClasses = LEAD_SOURCE_BADGE_CLASSES;
  protected readonly categoryLabels = LEAD_CATEGORY_LABELS;
  protected readonly categoryClasses = LEAD_CATEGORY_BADGE_CLASSES;
  protected readonly categoryOptions = CATEGORY_OPTIONS;
  protected readonly statusLabels = LEAD_STATUS_LABELS;
  protected readonly statusClasses = LEAD_STATUS_BADGE_CLASSES;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly invitationStatusLabels = LEAD_INVITATION_STATUS_LABELS;
  protected readonly invitationStatusClasses = LEAD_INVITATION_STATUS_BADGE_CLASSES;

  private readonly route = inject(ActivatedRoute);
  private readonly leadsService = inject(LeadsService);
  private readonly authService = inject(AuthService);

  private readonly leadId = this.route.snapshot.paramMap.get('id')!;

  protected readonly lead = signal<LeadDetail | null>(null);
  protected readonly notFound = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly followUpError = signal<string | null>(null);

  protected followUpCategory: LeadCategory = 'Cool';
  protected followUpStatus: LeadFollowUpStatus = 'InProgress';
  protected followUpCancellationReason = '';
  protected followUpScheduledNextCall = '';
  protected followUpAgreementAmount: number | null = null;
  protected followUpEmail = '';
  protected followUpSendInvite = true;
  protected followUpPassword = '';
  protected followUpRemarks = '';
  protected followUpFeedback = '';
  protected readonly pendingAgreementFile = signal<File | null>(null);

  protected readonly uploadingDocument = signal(false);
  protected readonly uploadError = signal<string | null>(null);

  protected readonly resendingInvitation = signal(false);
  protected readonly resendError = signal<string | null>(null);

  protected agreementAmountDraft: number | null = null;
  protected readonly savingAgreementAmount = signal(false);
  protected readonly agreementAmountError = signal<string | null>(null);

  /** Keeps the editable draft in sync with the server's current value whenever the lead is refreshed (e.g. after a follow-up sets it, or a save here). */
  private readonly syncAgreementAmountDraft = effect(() => {
    const l = this.lead();
    if (l) this.agreementAmountDraft = l.agreementAmount;
  });

  protected readonly basePath = computed(() => {
    const roles = this.authService.currentUser()?.roles ?? [];
    return roles.includes(ROLE_ADMIN) ? '/app/admin/leads' : '/app/sales-person/leads';
  });

  ngOnInit(): void {
    this.leadsService.getLead(this.leadId).subscribe({
      next: (lead) => {
        this.lead.set(lead);
        this.followUpCategory = lead.currentCategory ?? 'Cool';
      },
      error: (error: HttpErrorResponse) => {
        this.notFound.set(error.status === 404 ? 'This lead could not be found.' : 'You do not have access to this lead.');
      },
    });
  }

  /** True once ANY follow-up has ever won this deal — mirrors the backend's own "already won" check (LeadService.AddFollowUpAsync), which is NOT the same as currentStatus === 'Won' since a later follow-up can revert to InProgress while paperwork is still being chased down. */
  protected hasEverWon(): boolean {
    const l = this.lead();
    if (!l) return false;
    return l.isConverted || l.timeline.some((entry) => entry.status === 'Won');
  }

  protected showAgreementAmount(): boolean {
    return this.followUpStatus === 'Won' || this.hasEverWon();
  }

  /** True only the first time a deal is won — a lead with no email yet and not already converted needs Email + invite/password to close. */
  protected needsConversionFields(): boolean {
    const l = this.lead();
    if (!l || this.followUpStatus !== 'Won') return false;
    return !l.isConverted && !l.email;
  }

  protected canSubmitFollowUp(): boolean {
    if (this.followUpStatus === 'Cancelled' && !this.followUpCancellationReason.trim()) return false;
    if (this.needsConversionFields()) {
      if (!this.followUpEmail.trim()) return false;
      if (!this.followUpSendInvite && this.followUpPassword.trim().length < 8) return false;
    }
    return true;
  }

  /** Selecting Won auto-jumps Category to Hot (the old "A+") — per user feedback, winning a deal means the lead was hot, not something to leave at whatever category it happened to be logged at before. Still freely changeable afterward. */
  protected onStatusChange(status: LeadFollowUpStatus): void {
    this.followUpStatus = status;
    if (status === 'Won') {
      this.followUpCategory = 'APlus';
    }
  }

  protected onAgreementFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.pendingAgreementFile.set(input.files?.[0] ?? null);
  }

  protected scheduleQuick(days: number): void {
    const date = new Date();
    date.setDate(date.getDate() + days);
    this.followUpScheduledNextCall = isoDate(date);
  }

  protected downloadUrl(documentId: string): string {
    return this.leadsService.agreementDocumentDownloadUrl(this.leadId, documentId);
  }

  logFollowUp(): void {
    if (this.saving() || !this.canSubmitFollowUp()) return;

    const needsConversion = this.needsConversionFields();

    this.saving.set(true);
    this.followUpError.set(null);
    this.leadsService
      .addFollowUp(this.leadId, {
        category: this.followUpCategory,
        status: this.followUpStatus,
        cancellationReason: this.followUpStatus === 'Cancelled' ? this.followUpCancellationReason.trim() : undefined,
        scheduledNextCallUtc: this.followUpStatus === 'InProgress' ? this.followUpScheduledNextCall || undefined : undefined,
        agreementAmount: this.showAgreementAmount() ? this.followUpAgreementAmount ?? undefined : undefined,
        email: needsConversion ? this.followUpEmail.trim() : undefined,
        sendInvite: needsConversion ? this.followUpSendInvite : undefined,
        password: needsConversion && !this.followUpSendInvite ? this.followUpPassword : undefined,
        remarks: this.followUpRemarks.trim() || undefined,
        feedback: this.followUpFeedback.trim() || undefined,
      })
      .subscribe({
        next: (updated) => {
          this.lead.set(updated);
          const file = this.pendingAgreementFile();
          if (file) {
            this.leadsService.uploadAgreementDocument(this.leadId, file).subscribe({
              next: (withDocument) => {
                this.saving.set(false);
                this.lead.set(withDocument);
                this.resetFollowUpForm();
              },
              error: (error: HttpErrorResponse) => {
                // The follow-up itself already saved — only the document attach failed. Leave the form's other fields
                // reset but surface the error so the user knows to retry the upload from the Agreement documents panel.
                this.saving.set(false);
                this.resetFollowUpForm();
                this.followUpError.set(error.error?.error ?? 'Follow-up saved, but the agreement document could not be uploaded. Try again from the Agreement documents panel.');
              },
            });
            return;
          }
          this.saving.set(false);
          this.resetFollowUpForm();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.followUpError.set(error.error?.error ?? 'Could not log this follow-up.');
        },
      });
  }

  private resetFollowUpForm(): void {
    this.followUpStatus = 'InProgress';
    this.followUpCancellationReason = '';
    this.followUpScheduledNextCall = '';
    this.followUpAgreementAmount = null;
    this.followUpEmail = '';
    this.followUpSendInvite = true;
    this.followUpPassword = '';
    this.followUpRemarks = '';
    this.followUpFeedback = '';
    this.pendingAgreementFile.set(null);
  }

  onDocumentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingDocument.set(true);
    this.uploadError.set(null);
    this.leadsService.uploadAgreementDocument(this.leadId, file).subscribe({
      next: (updated) => {
        this.uploadingDocument.set(false);
        this.lead.set(updated);
        input.value = '';
      },
      error: (error: HttpErrorResponse) => {
        this.uploadingDocument.set(false);
        this.uploadError.set(error.error?.error ?? 'Could not upload this document.');
        input.value = '';
      },
    });
  }

  resendInvitation(): void {
    if (this.resendingInvitation()) return;

    this.resendingInvitation.set(true);
    this.resendError.set(null);
    this.leadsService.resendInvitation(this.leadId).subscribe({
      next: (updated) => {
        this.resendingInvitation.set(false);
        this.lead.set(updated);
      },
      error: (error: HttpErrorResponse) => {
        this.resendingInvitation.set(false);
        this.resendError.set(error.error?.error ?? 'Could not resend this invitation.');
      },
    });
  }

  saveAgreementAmount(): void {
    if (this.savingAgreementAmount()) return;

    this.savingAgreementAmount.set(true);
    this.agreementAmountError.set(null);
    this.leadsService.updateAgreementAmount(this.leadId, this.agreementAmountDraft).subscribe({
      next: (updated) => {
        this.savingAgreementAmount.set(false);
        this.lead.set(updated);
      },
      error: (error: HttpErrorResponse) => {
        this.savingAgreementAmount.set(false);
        this.agreementAmountError.set(error.error?.error ?? 'Could not save this amount.');
      },
    });
  }

  /**
   * Manual outreach for a won deal. wa.me has no way to pre-attach a file to
   * a message — that's a hard platform limitation, not something this app
   * can work around without a real WhatsApp Business API integration (its
   * own separate account/credentials, same story as SMTP needing real Gmail
   * creds). So the practical middle ground: silently download the latest
   * agreement document (if any) the instant this is clicked, at the same
   * moment WhatsApp opens, so the sales person only has to drag one file
   * that's already sitting in their downloads into the chat that just
   * appeared — no separate hunt for it.
   */
  protected sendAgreementViaWhatsApp(lead: LeadDetail): void {
    const latestDoc = lead.agreementDocuments.at(-1);
    if (latestDoc) {
      const link = document.createElement('a');
      link.href = this.downloadUrl(latestDoc.id);
      link.download = latestDoc.originalFileName;
      link.click();
    }
    window.open(this.whatsAppUrl(lead), '_blank', 'noopener');
  }

  private whatsAppUrl(lead: LeadDetail): string {
    const phoneDigits = lead.contact.replace(/[^\d]/g, '');
    const amountLine = lead.agreementAmount != null ? ` Agreement amount: ${lead.agreementAmount}.` : '';
    const invitation = lead.pendingInvitation;
    const invitationLine =
      invitation && invitation.status !== 'Accepted'
        ? ` We've sent an account setup invitation to ${invitation.email} — please check your inbox (and spam folder) to complete registration.`
        : '';
    const attachmentLine = lead.agreementDocuments.length > 0 ? ` I'm sending the agreement document along too — one moment.` : '';
    const message =
      `Hi ${lead.name}, thanks again for closing the deal with us!${amountLine}${invitationLine}${attachmentLine} ` +
      `Let us know if you have any questions about the agreement.`;
    return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
  }
}
