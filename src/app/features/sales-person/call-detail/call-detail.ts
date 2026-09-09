import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LEAD_CATEGORY_BADGE_CLASSES, LEAD_CATEGORY_LABELS } from '../../../core/leads/models';
import { CALL_OUTCOME_BADGE_CLASSES, CALL_OUTCOME_LABELS, CallDetailWithPayment, CallSummary, PaymentCallStatus } from '../../../core/sales-person/models';
import { PAYMENT_STATUS_LABELS } from '../../../core/sales-person/models';
import { SalesPersonService } from '../../../core/sales-person/sales-person.service';

const PAYMENT_STATUS_OPTIONS: PaymentCallStatus[] = ['Cleared', 'PartiallyCleared', 'Extended', 'Other'];

/** Quick-pick offsets for a Commitment's promised date — see log-call.ts's own copy of this list. */
const PROMISE_QUICK_PICKS: { label: string; days: number }[] = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

/** Local calendar date as YYYY-MM-DD, for a native `<input type="date">` value — see log-call.ts's own copy of this helper. */
function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Full detail for one call — outcome, payment/complaint specifics, every
 * Lead collected during it, and (right side) this customer's complete
 * call history with the currently-viewed one pinned to the top and
 * highlighted. See docs/modules/sales-person-calls.md.
 *
 * Reads the route id reactively (not a one-time snapshot) — clicking another
 * entry in the history list navigates to the same route with a different
 * `:id`, which Angular's router reuses this component instance for rather
 * than recreating it, so a snapshot-based id would silently keep showing
 * the previous call.
 */
@Component({
  selector: 'app-call-detail',
  imports: [DatePipe, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notFound()) {
      <div class="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p class="text-sm text-slate-500">{{ notFound() }}</p>
        <a routerLink="/app/sales-person/calls" class="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back to Calls</a>
      </div>
    } @else if (call(); as c) {
      <a routerLink="/app/sales-person/calls" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back to Calls</a>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <h1 class="text-lg font-semibold text-slate-900">{{ c.customerCompanyName }}</h1>
        @if (c.customerBranchName) {
          <span class="text-sm text-slate-400">({{ c.customerBranchName }})</span>
        }
        <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="outcomeClasses[c.outcome]">{{ outcomeLabels[c.outcome] }}</span>
      </div>
      <p class="mt-1 text-sm text-slate-500">{{ c.createdAtUtc | date: 'medium' }} · logged by {{ isMine(c) ? 'you' : c.salesPersonDisplayName }}</p>

      <div class="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 class="text-sm font-semibold text-slate-900">Customer details</h2>
        <dl class="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt class="text-xs font-medium text-slate-500">Name</dt>
            <dd class="mt-0.5 font-medium text-slate-700">{{ c.customerDisplayName }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-slate-500">Email</dt>
            <dd class="mt-0.5 font-medium text-slate-700">{{ c.customerEmail }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-slate-500">Phone</dt>
            <dd class="mt-0.5 font-medium text-slate-700">{{ c.customerPhoneNumber ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-slate-500">Location</dt>
            <dd class="mt-0.5 font-medium text-slate-700">{{ c.customerLocation ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-slate-500">Company</dt>
            <dd class="mt-0.5 font-medium text-slate-700">{{ c.customerCompanyName }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-slate-500">Branch</dt>
            <dd class="mt-0.5 font-medium text-slate-700">{{ c.customerBranchName || '—' }}</dd>
          </div>
        </dl>
      </div>

      <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2 space-y-4">
          <div class="rounded-lg border border-slate-200 bg-white p-5">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-slate-900">Outcome</h2>
              @if (c.outcome !== 'Complaint' && !editing()) {
                <button type="button" (click)="startEdit(c)" class="text-xs font-medium text-indigo-600 hover:text-indigo-500">Edit</button>
              }
            </div>

            @if (editing()) {
              @if (c.outcome === 'Notes') {
                <textarea
                  rows="3"
                  [(ngModel)]="notesDraft"
                  class="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                ></textarea>
              } @else if (c.outcome === 'Payment') {
                <div class="mt-2 space-y-2.5">
                  <select
                    [ngModel]="paymentStatusDraft"
                    (ngModelChange)="onPaymentStatusDraftChange($event)"
                    class="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    @for (option of paymentStatusOptions; track option) {
                      <option [value]="option">{{ paymentStatusLabels[option] }}</option>
                    }
                  </select>
                  <input
                    type="number"
                    placeholder="Amount cleared"
                    [(ngModel)]="paymentAmountDraft"
                    class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  @if (paymentStatusDraft !== 'Cleared') {
                    <div class="grid grid-cols-2 gap-2.5">
                      <div>
                        <label class="block text-xs font-medium text-slate-500">Due date (optional)</label>
                        <input
                          type="date"
                          [(ngModel)]="paymentDueDateDraft"
                          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-slate-500">Amount still due (optional)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          [(ngModel)]="paymentAmountDueDraft"
                          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  }
                  <textarea
                    rows="2"
                    placeholder="Remarks"
                    [(ngModel)]="paymentRemarksDraft"
                    class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  ></textarea>
                </div>
              } @else if (c.outcome === 'Commitment') {
                <div class="mt-2 space-y-2.5">
                  <div>
                    <label class="block text-xs font-medium text-slate-500">When did they promise it?</label>
                    <div class="mt-1 flex flex-wrap gap-1.5">
                      @for (pick of promiseQuickPicks; track pick.label) {
                        <button
                          type="button"
                          (click)="pickPromisedDateDraft(pick.days)"
                          class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {{ pick.label }}
                        </button>
                      }
                    </div>
                    <input
                      type="date"
                      [(ngModel)]="commitmentPromisedDateDraft"
                      class="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Referrals promised — e.g. 5 or 2-3"
                    [(ngModel)]="commitmentReferralRangeDraft"
                    class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <textarea
                    rows="2"
                    placeholder="Remarks"
                    [(ngModel)]="commitmentRemarksDraft"
                    class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  ></textarea>
                </div>
              }
              @if (editError()) {
                <p class="mt-2 text-sm text-red-600" role="alert">{{ editError() }}</p>
              }
              <div class="mt-3 flex justify-end gap-2">
                <button type="button" (click)="cancelEdit()" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                <button
                  type="button"
                  (click)="saveEdit(c)"
                  [disabled]="saving()"
                  class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {{ saving() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            } @else if (c.outcome === 'Notes') {
              <p class="mt-2 whitespace-pre-wrap text-sm text-slate-600">{{ c.notes || 'No notes recorded.' }}</p>
            } @else if (c.outcome === 'Payment' && c.paymentDetail; as payment) {
              @if (c.isFollowUp) {
                <p class="mt-2 text-xs text-sky-700">
                  Follow-up for the
                  <a [routerLink]="['/app/sales-person/calls', c.followUpForCallId]" class="font-medium underline hover:no-underline">
                    {{ c.followUpForCallCreatedAtUtc | date: 'mediumDate' }}
                  </a>
                  call.
                </p>
              }
              <div class="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span class="font-medium">{{ paymentStatusLabels[payment.status] }}</span>
                @if (payment.amountCleared) {
                  <span> — {{ payment.amountCleared }} cleared</span>
                }
                @if (payment.amountDue) {
                  <span> — {{ payment.amountDue }} still due</span>
                }
                @if (payment.dueDateUtc) {
                  <p class="mt-1 text-amber-700">Due {{ payment.dueDateUtc | date: 'mediumDate' }}</p>
                }
                @if (payment.remarks) {
                  <p class="mt-1 text-amber-700">{{ payment.remarks }}</p>
                }
              </div>
              @if (c.followUpCallCount > 0) {
                <div class="mt-2 rounded-md border border-slate-200 p-3">
                  <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Follow-ups made ({{ c.followUpCallCount }})</p>
                  <ul class="mt-1.5 space-y-1">
                    @for (followUp of c.followUpCalls; track followUp.callId) {
                      <li class="text-sm">
                        <a [routerLink]="['/app/sales-person/calls', followUp.callId]" class="font-medium text-indigo-600 hover:text-indigo-500">
                          {{ followUp.createdAtUtc | date: 'medium' }}
                        </a>
                        <span class="text-slate-500"> by {{ isMine(followUp) ? 'you' : followUp.salesPersonDisplayName }}</span>
                      </li>
                    }
                  </ul>
                </div>
              }
            } @else if (c.outcome === 'Commitment' && c.commitmentDetail; as commitment) {
              <div class="mt-2 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">
                <span class="font-medium">{{ commitment.referralCountRange }} referral(s) promised</span>
                <p class="mt-1 text-sky-700">By {{ commitment.promisedDateUtc | date: 'mediumDate' }}</p>
                @if (commitment.remarks) {
                  <p class="mt-1 text-sky-700">{{ commitment.remarks }}</p>
                }
              </div>
            } @else if (c.outcome === 'Complaint') {
              <p class="mt-2 text-sm text-slate-600">
                Filed as a complaint
                @if (c.ticketNumber) {
                  — <span class="font-medium text-slate-800">{{ c.ticketNumber }}</span>
                }
              </p>
            }
          </div>

          <div class="rounded-lg border border-slate-200 bg-white">
            <h2 class="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">Referrals collected ({{ c.leads.length }})</h2>
            <div class="divide-y divide-slate-100">
              @for (lead of c.leads; track lead.id) {
                <a [routerLink]="['/app/sales-person/leads', lead.id]" class="block p-4 hover:bg-slate-50">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="font-medium text-slate-900">{{ lead.name }}</span>
                    @if (lead.currentCategory; as category) {
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="categoryClasses[category]">{{ categoryLabels[category] }}</span>
                    } @else {
                      <span class="text-xs text-slate-400">Not yet followed up</span>
                    }
                  </div>
                  @if (lead.businessName) {
                    <p class="mt-1 text-sm text-slate-500">{{ lead.businessName }}</p>
                  }
                </a>
              } @empty {
                <p class="p-8 text-center text-sm text-slate-500">No referrals collected on this call.</p>
              }
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white">
          <h2 class="border-b border-slate-100 p-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Call history — {{ c.customerCompanyName }}
          </h2>
          <div class="max-h-[36rem] divide-y divide-slate-100 overflow-y-auto">
            @for (past of history(); track past.id) {
              @if (past.id === c.id) {
                <div class="block border-l-4 border-indigo-500 bg-indigo-50 px-3 py-2.5">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-semibold text-indigo-900">{{ past.outcome }}</span>
                    <span class="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">Viewing</span>
                  </div>
                  <span class="text-xs text-indigo-600">{{ past.createdAtUtc | date: 'medium' }} · by {{ isMine(past) ? 'you' : past.salesPersonDisplayName }}</span>
                  @if (past.previewText) {
                    <p class="mt-0.5 truncate text-xs text-indigo-700">{{ past.previewText }}</p>
                  }
                </div>
              } @else {
                <a [routerLink]="['/app/sales-person/calls', past.id]" class="block px-3 py-2.5 text-sm hover:bg-slate-50">
                  <span class="font-medium text-slate-700">{{ past.outcome }}</span>
                  <span class="text-xs text-slate-400"> · {{ past.createdAtUtc | date: 'medium' }} · by {{ isMine(past) ? 'you' : past.salesPersonDisplayName }}</span>
                  @if (past.previewText) {
                    <p class="mt-0.5 truncate text-xs text-slate-500">{{ past.previewText }}</p>
                  }
                </a>
              }
            }
          </div>
        </div>
      </div>
    } @else {
      <p class="text-sm text-slate-500" role="status">Loading…</p>
    }
  `,
})
export class CallDetailPage {
  protected readonly outcomeLabels = CALL_OUTCOME_LABELS;
  protected readonly outcomeClasses = CALL_OUTCOME_BADGE_CLASSES;
  protected readonly paymentStatusLabels = PAYMENT_STATUS_LABELS;
  protected readonly paymentStatusOptions = PAYMENT_STATUS_OPTIONS;
  protected readonly categoryLabels = LEAD_CATEGORY_LABELS;
  protected readonly categoryClasses = LEAD_CATEGORY_BADGE_CLASSES;
  protected readonly promiseQuickPicks = PROMISE_QUICK_PICKS;

  private readonly route = inject(ActivatedRoute);
  private readonly salesPersonService = inject(SalesPersonService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly call = signal<CallDetailWithPayment | null>(null);
  protected readonly notFound = signal<string | null>(null);
  private readonly rawHistory = signal<CallSummary[]>([]);

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected notesDraft = '';
  protected paymentStatusDraft: PaymentCallStatus = 'Cleared';
  protected paymentAmountDraft: number | null = null;
  protected paymentDueDateDraft = '';
  protected paymentAmountDueDraft: number | null = null;
  protected paymentRemarksDraft = '';
  protected commitmentPromisedDateDraft = '';
  protected commitmentReferralRangeDraft = '';
  protected commitmentRemarksDraft = '';

  /** The currently-viewed call pinned to the top, regardless of its date, so it's always immediately visible — the rest stay in the usual newest-first order. */
  protected readonly history = computed(() => {
    const current = this.call();
    const items = this.rawHistory();
    if (!current) return items;
    const currentEntry = items.find((h) => h.id === current.id);
    if (!currentEntry) return items;
    return [currentEntry, ...items.filter((h) => h.id !== current.id)];
  });

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')!),
        distinctUntilChanged(),
        switchMap((id) => this.salesPersonService.getCall(id).pipe(catchError((error: HttpErrorResponse) => of(error)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result instanceof HttpErrorResponse) {
          this.notFound.set(result.status === 404 ? 'This call could not be found.' : 'You do not have access to this call.');
          return;
        }
        this.notFound.set(null);
        this.call.set(result);
        this.salesPersonService
          .getCalls({ customerUserId: result.customerUserId, page: 1, pageSize: 20 })
          .subscribe((page) => this.rawHistory.set(page.items));
      });
  }

  /** Loosely typed on purpose — used for both CallSummary rows and CallFollowUpSummary entries, which share this one field. */
  protected isMine(entry: { salesPersonUserId: string }): boolean {
    return entry.salesPersonUserId === this.authService.currentUser()?.id;
  }

  protected startEdit(c: CallDetailWithPayment): void {
    this.notesDraft = c.notes ?? '';
    this.paymentStatusDraft = c.paymentDetail?.status ?? 'Cleared';
    this.paymentAmountDraft = c.paymentDetail?.amountCleared ?? null;
    this.paymentDueDateDraft = c.paymentDetail?.dueDateUtc?.slice(0, 10) ?? '';
    this.paymentAmountDueDraft = c.paymentDetail?.amountDue ?? null;
    this.paymentRemarksDraft = c.paymentDetail?.remarks ?? '';
    this.commitmentPromisedDateDraft = c.commitmentDetail?.promisedDateUtc.slice(0, 10) ?? '';
    this.commitmentReferralRangeDraft = c.commitmentDetail?.referralCountRange ?? '';
    this.commitmentRemarksDraft = c.commitmentDetail?.remarks ?? '';
    this.editError.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.editError.set(null);
  }

  /** Clearing stale hidden values when the status flips back to Cleared — see log-call.ts's own copy of this same guard. */
  protected onPaymentStatusDraftChange(status: PaymentCallStatus): void {
    this.paymentStatusDraft = status;
    if (status === 'Cleared') {
      this.paymentDueDateDraft = '';
      this.paymentAmountDueDraft = null;
    }
  }

  protected pickPromisedDateDraft(daysFromNow: number): void {
    this.commitmentPromisedDateDraft = isoDate(new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000));
  }

  protected saveEdit(c: CallDetailWithPayment): void {
    if (this.saving()) return;

    this.saving.set(true);
    this.editError.set(null);
    const request =
      c.outcome === 'Notes'
        ? { notes: this.notesDraft.trim() }
        : c.outcome === 'Payment'
          ? {
              paymentDetail: {
                status: this.paymentStatusDraft,
                amountCleared: this.paymentAmountDraft,
                dueDateUtc: this.paymentStatusDraft !== 'Cleared' ? this.paymentDueDateDraft || null : null,
                amountDue: this.paymentStatusDraft !== 'Cleared' ? this.paymentAmountDueDraft : null,
                remarks: this.paymentRemarksDraft.trim() || null,
              },
            }
          : {
              commitmentDetail: {
                promisedDateUtc: this.commitmentPromisedDateDraft,
                referralCountRange: this.commitmentReferralRangeDraft.trim(),
                remarks: this.commitmentRemarksDraft.trim() || null,
              },
            };

    this.salesPersonService.updateCall(c.id, request).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.editing.set(false);
        this.call.set(updated);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.editError.set(error.error?.error ?? 'Could not save these changes.');
      },
    });
  }
}
