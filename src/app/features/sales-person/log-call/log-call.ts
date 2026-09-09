import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { PagedResult, PersonSummary } from '../../../core/admin/models';
import { AuthService } from '../../../core/auth/auth.service';
import { TicketLookups } from '../../../core/tickets/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import {
  CALL_OUTCOME_LABELS,
  CallOutcome,
  PAYMENT_STATUS_LABELS,
  PaymentCallStatus,
} from '../../../core/sales-person/models';
import { SalesPersonService } from '../../../core/sales-person/sales-person.service';
import { CallSummary } from '../../../core/sales-person/models';

const EMPTY_CUSTOMERS: PagedResult<PersonSummary> = { items: [], totalCount: 0, page: 1, pageSize: 10 };
const PAYMENT_STATUSES: PaymentCallStatus[] = ['Cleared', 'PartiallyCleared', 'Extended', 'Other'];
const OUTCOMES: CallOutcome[] = ['Notes', 'Payment', 'Commitment', 'Complaint'];

/** Quick-pick offsets for a Commitment's promised date — see promiseQuickPicks. */
const PROMISE_QUICK_PICKS: { label: string; days: number }[] = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

/** Local calendar date as YYYY-MM-DD, for a native `<input type="date">` value — see reports-modal.ts's own copy of this helper for why not toISOString(). */
function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface LeadDraft {
  name: string;
  contact: string;
  email: string;
  businessName: string;
  businessContact: string;
  post: string;
  businessNature: string;
  remarks: string;
  feedback: string;
}

interface CallDraft {
  customerId: string;
  customerDisplayName: string;
  customerEmail: string;
  customerCompanyName: string;
  customerBranchName: string;
  leads: LeadDraft[];
  outcome: CallOutcome;
  notes: string;
  paymentStatus: PaymentCallStatus;
  paymentAmount: number | null;
  paymentAmountDue: number | null;
  paymentDueDate: string;
  paymentRemarks: string;
  commitmentPromisedDate: string;
  commitmentReferralRange: string;
  commitmentRemarks: string;
  followUpForCallId: string | null;
  complaintTitle: string;
  complaintCategoryId: number | null;
  complaintPriorityId: number | null;
  complaintDescription: string;
}

function blankLead(): LeadDraft {
  return { name: '', contact: '', email: '', businessName: '', businessContact: '', post: '', businessNature: '', remarks: '', feedback: '' };
}

function draftKey(userId: string): string {
  return `log-call-draft:${userId}`;
}

/** Separate key from draftKey above so a resumable draft and a follow-up prefill (from the Payment Follow-Up popup) can never collide — see payment-follow-up-modal.ts's callCustomer(). */
export function logCallPrefillKey(userId: string): string {
  return `log-call-prefill:${userId}`;
}

interface CallPrefill {
  customerId: string;
  customerDisplayName: string;
  customerCompanyName: string;
  followUpForCallId: string;
}

/**
 * One continuous flow for logging a call: search the customer, add as many
 * Leads as come up (accordion — only one expanded at a time, auto-
 * collapses and auto-scrolls on add), then record exactly one outcome.
 * Everything is composed here and submitted in a single request — see
 * docs/modules/sales-person-calls.md. Per user feedback, the lead and
 * outcome sections are visible from the moment the page loads (not gated
 * behind picking a customer first) — only the "save" is actually blocked
 * until a customer is chosen. Drafted to localStorage as you go so a lost
 * connection or a closed tab doesn't lose the work; nothing is created
 * server-side until "Save Call". No category field on a lead here — per
 * user feedback, a lead is only ever categorized via a follow-up (see
 * docs/modules/leads.md), never at the moment it's added.
 */
@Component({
  selector: 'app-log-call',
  imports: [DatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/app/sales-person/calls" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back to Calls</a>
    <h1 class="mt-2 text-lg font-semibold text-slate-900">Log a Call</h1>

    @if (showResumeBanner()) {
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span>You have an unsaved call in progress for {{ pendingDraft()?.customerDisplayName }}.</span>
        <div class="flex gap-2">
          <button type="button" (click)="resumeDraft()" class="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500">Resume</button>
          <button type="button" (click)="discardDraft()" class="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100">Discard</button>
        </div>
      </div>
    }

    <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
    <div class="lg:col-span-2">
      <!-- Customer -->
      <div class="rounded-lg border border-slate-200 bg-white p-5">
        <h2 class="text-sm font-semibold text-slate-900">Customer</h2>
        @if (selectedCustomer(); as customer) {
          <div class="mt-2 flex items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
            <div class="min-w-0">
              <div class="flex flex-wrap items-baseline gap-1.5">
                <span class="font-semibold text-slate-900">{{ customer.companyName }}</span>
                @if (customer.branchName) {
                  <span class="text-xs text-slate-400">({{ customer.branchName }})</span>
                }
              </div>
              <p class="text-xs text-slate-500">{{ customer.displayName }} · {{ customer.email }}</p>
            </div>
            <button type="button" (click)="clearCustomer()" class="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-500">Change</button>
          </div>
        } @else {
          <input
            type="search"
            placeholder="Search customers by name or email…"
            [(ngModel)]="customerSearch"
            (ngModelChange)="onSearchChange($event)"
            class="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          @if (searchResults().length > 0) {
            <div class="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200">
              @for (customer of searchResults(); track customer.id) {
                <button
                  type="button"
                  (click)="selectCustomer(customer)"
                  class="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <div class="flex flex-wrap items-baseline gap-1.5">
                    <span class="font-semibold text-slate-900">{{ customer.companyName }}</span>
                    @if (customer.branchName) {
                      <span class="text-xs text-slate-400">({{ customer.branchName }})</span>
                    }
                  </div>
                  <p class="text-xs text-slate-500">{{ customer.displayName }} · {{ customer.email }}</p>
                </button>
              }
            </div>
          }
        }
      </div>

      <!-- Leads (accordion) -->
      <div class="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-slate-900">Leads collected on this call</h2>
          <button type="button" (click)="addLead()" class="rounded-md border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
            + Add Referral
          </button>
        </div>

        @if (leads().length > 0) {
          <div class="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            @for (lead of leads(); track $index; let i = $index) {
              <div [id]="'lead-form-' + i" class="rounded-md border border-slate-200">
                @if (activeLeadIndex() === i) {
                  <div class="space-y-2.5 p-3">
                    <div class="grid grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        placeholder="Name"
                        [ngModel]="lead.name"
                        (ngModelChange)="updateLead(i, 'name', $event)"
                        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Contact"
                        [ngModel]="lead.contact"
                        (ngModelChange)="updateLead(i, 'contact', $event)"
                        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <input
                      type="email"
                      placeholder="Email (optional — saves asking again when closing the deal)"
                      [ngModel]="lead.email"
                      (ngModelChange)="updateLead(i, 'email', $event)"
                      class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div class="grid grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        placeholder="Business name"
                        [ngModel]="lead.businessName"
                        (ngModelChange)="updateLead(i, 'businessName', $event)"
                        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Business contact"
                        [ngModel]="lead.businessContact"
                        (ngModelChange)="updateLead(i, 'businessContact', $event)"
                        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div class="grid grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        placeholder="Post"
                        [ngModel]="lead.post"
                        (ngModelChange)="updateLead(i, 'post', $event)"
                        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Business nature"
                        [ngModel]="lead.businessNature"
                        (ngModelChange)="updateLead(i, 'businessNature', $event)"
                        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <textarea
                      rows="2"
                      placeholder="Remarks"
                      [ngModel]="lead.remarks"
                      (ngModelChange)="updateLead(i, 'remarks', $event)"
                      class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    ></textarea>
                    <textarea
                      rows="2"
                      placeholder="Feedback"
                      [ngModel]="lead.feedback"
                      (ngModelChange)="updateLead(i, 'feedback', $event)"
                      class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    ></textarea>
                    <div class="flex justify-end">
                      <button type="button" (click)="removeLead(i)" class="text-xs font-medium text-red-600 hover:text-red-700">Remove this lead</button>
                    </div>
                  </div>
                } @else {
                  <button type="button" (click)="activeLeadIndex.set(i)" class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <span class="font-medium text-slate-800">{{ lead.name || 'Untitled lead' }}{{ lead.businessName ? ' — ' + lead.businessName : '' }}</span>
                    <span class="text-xs text-slate-400">Not yet followed up</span>
                  </button>
                }
              </div>
            }
          </div>
        } @else {
          <p class="mt-3 text-sm text-slate-500">None yet — click "Add Referral" whenever one comes up during the call.</p>
        }
      </div>

      <!-- Outcome -->
      <div class="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 class="text-sm font-semibold text-slate-900">Outcome</h2>
        @if (followUpForCallId()) {
          <div class="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            Follow-up call for {{ selectedCustomer()?.displayName }} — logged as Payment.
          </div>
        } @else {
          <div class="mt-2 flex gap-4">
            @for (option of outcomes; track option) {
              <label class="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="radio" name="outcome" [value]="option" [ngModel]="outcome()" (ngModelChange)="outcome.set($event)" />
                {{ outcomeLabels[option] }}
              </label>
            }
          </div>
        }

        @if (outcome() === 'Notes') {
          <textarea
            rows="3"
            placeholder="What happened on this call?"
            [(ngModel)]="notes"
            class="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          ></textarea>
        } @else if (outcome() === 'Payment') {
          <div class="mt-3 space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3">
            <select
              [ngModel]="paymentStatus"
              (ngModelChange)="onPaymentStatusChange($event)"
              class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              @for (status of paymentStatuses; track status) {
                <option [value]="status">{{ paymentStatusLabels[status] }}</option>
              }
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount cleared (optional)"
              [(ngModel)]="paymentAmount"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            @if (paymentStatus !== 'Cleared') {
              <div class="grid grid-cols-2 gap-2.5">
                <div>
                  <label class="block text-xs font-medium text-slate-500">Due date (optional)</label>
                  <input
                    type="date"
                    [(ngModel)]="paymentDueDate"
                    class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-500">Amount still due (optional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    [(ngModel)]="paymentAmountDue"
                    class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            }
            <textarea
              rows="2"
              placeholder="Remarks"
              [(ngModel)]="paymentRemarks"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            ></textarea>
          </div>
        } @else if (outcome() === 'Commitment') {
          <div class="mt-3 space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div>
              <label class="block text-xs font-medium text-slate-500">When did they promise it?</label>
              <div class="mt-1 flex flex-wrap gap-1.5">
                @for (pick of promiseQuickPicks; track pick.label) {
                  <button
                    type="button"
                    (click)="pickPromisedDate(pick.days)"
                    class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {{ pick.label }}
                  </button>
                }
              </div>
              <input
                type="date"
                [(ngModel)]="commitmentPromisedDate"
                class="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <input
              type="text"
              placeholder="Referrals promised — e.g. 5 or 2-3"
              [(ngModel)]="commitmentReferralRange"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <textarea
              rows="2"
              placeholder="Remarks"
              [(ngModel)]="commitmentRemarks"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            ></textarea>
          </div>
        } @else if (outcome() === 'Complaint') {
          <div class="mt-3 space-y-2.5">
            <input
              type="text"
              placeholder="Title"
              [(ngModel)]="complaintTitle"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div class="grid grid-cols-2 gap-2.5">
              <select
                [(ngModel)]="complaintCategoryId"
                class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                @for (category of lookups()?.categories ?? []; track category.id) {
                  <option [value]="category.id">{{ category.name }}</option>
                }
              </select>
              <select
                [(ngModel)]="complaintPriorityId"
                class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                @for (priority of lookups()?.priorities ?? []; track priority.id) {
                  <option [value]="priority.id">{{ priority.name }}</option>
                }
              </select>
            </div>
            <textarea
              rows="3"
              placeholder="Description"
              [(ngModel)]="complaintDescription"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            ></textarea>
          </div>
        }
      </div>

      @if (errorMessage()) {
        <p class="mt-3 text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
      }

      <div class="mt-4 flex justify-end gap-3">
        <a routerLink="/app/sales-person/calls" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</a>
        <button
          type="button"
          (click)="submit()"
          [disabled]="submitting() || !canSubmit()"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {{ submitting() ? 'Saving…' : 'Save Call' }}
        </button>
      </div>
    </div>

    <!-- Call history for this customer — right side, only once one is picked -->
    <div>
      @if (selectedCustomer()) {
        <div class="rounded-lg border border-slate-200 bg-white">
          <h2 class="border-b border-slate-100 p-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Call history for this customer</h2>
          @if (history().length > 0) {
            <div class="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
              @for (past of history(); track past.id) {
                <a [routerLink]="['/app/sales-person/calls', past.id]" class="block px-3 py-2 text-sm hover:bg-slate-50">
                  <span class="font-medium text-slate-700">{{ past.outcome }}</span>
                  <span class="text-xs text-slate-400"> · {{ past.createdAtUtc | date: 'medium' }} · by {{ isMine(past) ? 'you' : past.salesPersonDisplayName }}</span>
                  @if (past.previewText) {
                    <p class="truncate text-xs text-slate-500">{{ past.previewText }}</p>
                  }
                </a>
              }
            </div>
          } @else {
            <p class="p-3 text-sm text-slate-400">No previous calls with this customer.</p>
          }
        </div>
      }
    </div>
    </div>
  `,
})
export class LogCallPage implements OnInit {
  protected readonly paymentStatuses = PAYMENT_STATUSES;
  protected readonly paymentStatusLabels = PAYMENT_STATUS_LABELS;
  protected readonly outcomes = OUTCOMES;
  protected readonly outcomeLabels = CALL_OUTCOME_LABELS;
  protected readonly promiseQuickPicks = PROMISE_QUICK_PICKS;

  private readonly salesPersonService = inject(SalesPersonService);
  private readonly ticketsService = inject(TicketsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected customerSearch = '';
  protected readonly selectedCustomer = signal<PersonSummary | null>(null);
  protected readonly searchResults = signal<PersonSummary[]>([]);
  private readonly searchTerm = signal('');

  protected readonly history = signal<CallSummary[]>([]);
  protected readonly leads = signal<LeadDraft[]>([]);
  protected readonly activeLeadIndex = signal<number | null>(null);

  protected readonly outcome = signal<CallOutcome>('Notes');
  protected notes = '';
  protected paymentStatus: PaymentCallStatus = 'Cleared';
  protected paymentAmount: number | null = null;
  protected paymentAmountDue: number | null = null;
  protected paymentDueDate = '';
  protected paymentRemarks = '';
  protected commitmentPromisedDate = '';
  protected commitmentReferralRange = '';
  protected commitmentRemarks = '';
  protected complaintTitle = '';
  protected complaintCategoryId: number | null = null;
  protected complaintPriorityId: number | null = null;
  protected complaintDescription = '';
  protected readonly lookups = signal<TicketLookups | null>(null);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly pendingDraft = signal<CallDraft | null>(null);
  protected readonly showResumeBanner = signal(false);
  private restoringDraft = false;

  /** Set from a Payment Follow-Up popup's Call quick action — see ngOnInit's prefill handling. Locks Outcome to Payment while set. */
  protected readonly followUpForCallId = signal<string | null>(null);

  private readonly draftSnapshot = computed<CallDraft | null>(() => {
    const customer = this.selectedCustomer();
    if (!customer) return null;
    return {
      customerId: customer.id,
      customerDisplayName: customer.displayName,
      customerEmail: customer.email,
      customerCompanyName: customer.companyName,
      customerBranchName: customer.branchName,
      leads: this.leads(),
      outcome: this.outcome(),
      notes: this.notes,
      paymentStatus: this.paymentStatus,
      paymentAmount: this.paymentAmount,
      paymentAmountDue: this.paymentAmountDue,
      paymentDueDate: this.paymentDueDate,
      paymentRemarks: this.paymentRemarks,
      commitmentPromisedDate: this.commitmentPromisedDate,
      commitmentReferralRange: this.commitmentReferralRange,
      commitmentRemarks: this.commitmentRemarks,
      followUpForCallId: this.followUpForCallId(),
      complaintTitle: this.complaintTitle,
      complaintCategoryId: this.complaintCategoryId,
      complaintPriorityId: this.complaintPriorityId,
      complaintDescription: this.complaintDescription,
    };
  });

  /**
   * Deliberately a plain method, NOT computed() — it reads notes/
   * paymentStatus/complaintXxx, which are plain mutable properties (bound
   * via [(ngModel)]), not signals. computed() only invalidates its cached
   * result when a tracked SIGNAL dependency changes (selectedCustomer/
   * outcome here) — typing into Notes re-renders the component (ngModel's
   * own event binding triggers change detection even in this zoneless app)
   * but doesn't touch either signal, so a computed() version kept returning
   * its stale cached value until outcome happened to change too. A plain
   * method has no cache to go stale — it re-evaluates fresh on every
   * template check, which already happens on every relevant keystroke.
   */
  protected canSubmit(): boolean {
    if (!this.selectedCustomer()) return false;
    const outcome = this.outcome();
    if (outcome === 'Notes') return this.notes.trim().length > 0;
    if (outcome === 'Payment') return !!this.paymentStatus;
    if (outcome === 'Commitment') {
      return this.commitmentPromisedDate.trim().length > 0 && this.commitmentReferralRange.trim().length > 0;
    }
    if (outcome === 'Complaint') {
      return this.complaintTitle.trim().length > 0 && this.complaintDescription.trim().length > 0 && !!this.complaintCategoryId && !!this.complaintPriorityId;
    }
    return false;
  }

  constructor() {
    toObservable(this.searchTerm)
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => (term.trim().length > 0 ? this.salesPersonService.getCustomers(term, 1, 10) : of(EMPTY_CUSTOMERS))),
        takeUntilDestroyed(),
      )
      .subscribe((result) => this.searchResults.set(result.items));

    // Draft persistence — nothing hits the server until Save Call; this just
    // survives a crash or lost connection between now and then.
    toObservable(this.draftSnapshot)
      .pipe(debounceTime(500), takeUntilDestroyed())
      .subscribe((snapshot) => {
        if (this.restoringDraft) return;
        const userId = this.authService.currentUser()?.id;
        if (!userId) return;
        if (snapshot) {
          localStorage.setItem(draftKey(userId), JSON.stringify(snapshot));
        }
      });

    effect(() => {
      // Auto-scroll to the newly-active lead form.
      const index = this.activeLeadIndex();
      if (index === null) return;
      queueMicrotask(() => {
        this.elementRef.nativeElement.querySelector(`#lead-form-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  ngOnInit(): void {
    this.ticketsService.getLookups().subscribe((lookups) => {
      this.lookups.set(lookups);
      this.complaintCategoryId ??= lookups.categories[0]?.id ?? null;
      this.complaintPriorityId ??= lookups.priorities[0]?.id ?? null;
    });

    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    // A follow-up prefill (from the Payment Follow-Up popup) takes priority
    // over an old abandoned draft — it's a deliberate, fresh action, so
    // there's no resume/discard choice to offer here. Consumed once: read
    // and removed immediately, not only on successful submit.
    try {
      const rawPrefill = localStorage.getItem(logCallPrefillKey(userId));
      if (rawPrefill) {
        localStorage.removeItem(logCallPrefillKey(userId));
        const prefill = JSON.parse(rawPrefill) as CallPrefill;
        this.selectedCustomer.set({
          id: prefill.customerId,
          displayName: prefill.customerDisplayName,
          email: '',
          companyName: prefill.customerCompanyName,
          branchName: '',
        } as PersonSummary);
        this.outcome.set('Payment');
        this.followUpForCallId.set(prefill.followUpForCallId);
        this.salesPersonService.getCalls({ customerUserId: prefill.customerId, page: 1, pageSize: 10 }).subscribe((result) => this.history.set(result.items));
        return;
      }
    } catch {
      // Corrupt/unreadable prefill — ignore it, fall through to normal flow.
    }

    try {
      const raw = localStorage.getItem(draftKey(userId));
      if (raw) {
        const draft = JSON.parse(raw) as CallDraft;
        this.pendingDraft.set(draft);
        this.showResumeBanner.set(true);
      }
    } catch {
      // Corrupt/unreadable draft — ignore it.
    }
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
  }

  /** Clearing stale hidden fields when the status flips back to Cleared — otherwise toggling away and back would resurrect a due date/amount the backend would then reject. */
  protected onPaymentStatusChange(status: PaymentCallStatus): void {
    this.paymentStatus = status;
    if (status === 'Cleared') {
      this.paymentDueDate = '';
      this.paymentAmountDue = null;
    }
  }

  protected pickPromisedDate(daysFromNow: number): void {
    this.commitmentPromisedDate = isoDate(new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000));
  }

  selectCustomer(customer: PersonSummary): void {
    this.selectedCustomer.set(customer);
    this.searchResults.set([]);
    this.salesPersonService.getCalls({ customerUserId: customer.id, page: 1, pageSize: 10 }).subscribe((result) => this.history.set(result.items));
  }

  clearCustomer(): void {
    this.selectedCustomer.set(null);
    this.customerSearch = '';
    this.history.set([]);
  }

  protected isMine(call: CallSummary): boolean {
    return call.salesPersonUserId === this.authService.currentUser()?.id;
  }

  addLead(): void {
    this.leads.update((list) => [...list, blankLead()]);
    this.activeLeadIndex.set(this.leads().length - 1);
  }

  removeLead(index: number): void {
    this.leads.update((list) => list.filter((_, i) => i !== index));
    this.activeLeadIndex.set(null);
  }

  updateLead<K extends keyof LeadDraft>(index: number, field: K, value: LeadDraft[K]): void {
    this.leads.update((list) => list.map((lead, i) => (i === index ? { ...lead, [field]: value } : lead)));
  }

  resumeDraft(): void {
    const draft = this.pendingDraft();
    if (!draft) return;

    this.restoringDraft = true;
    this.selectedCustomer.set({
      id: draft.customerId,
      displayName: draft.customerDisplayName,
      email: draft.customerEmail,
      companyName: draft.customerCompanyName,
      branchName: draft.customerBranchName,
    } as PersonSummary);
    this.leads.set(draft.leads);
    this.outcome.set(draft.outcome);
    this.notes = draft.notes;
    this.paymentStatus = draft.paymentStatus;
    this.paymentAmount = draft.paymentAmount;
    this.paymentAmountDue = draft.paymentAmountDue ?? null;
    this.paymentDueDate = draft.paymentDueDate ?? '';
    this.paymentRemarks = draft.paymentRemarks;
    this.commitmentPromisedDate = draft.commitmentPromisedDate ?? '';
    this.commitmentReferralRange = draft.commitmentReferralRange ?? '';
    this.commitmentRemarks = draft.commitmentRemarks ?? '';
    this.followUpForCallId.set(draft.followUpForCallId ?? null);
    this.complaintTitle = draft.complaintTitle;
    this.complaintCategoryId = draft.complaintCategoryId;
    this.complaintPriorityId = draft.complaintPriorityId;
    this.complaintDescription = draft.complaintDescription;
    this.showResumeBanner.set(false);
    this.salesPersonService.getCalls({ customerUserId: draft.customerId, page: 1, pageSize: 10 }).subscribe((result) => this.history.set(result.items));
    queueMicrotask(() => (this.restoringDraft = false));
  }

  discardDraft(): void {
    const userId = this.authService.currentUser()?.id;
    if (userId) localStorage.removeItem(draftKey(userId));
    this.pendingDraft.set(null);
    this.showResumeBanner.set(false);
  }

  submit(): void {
    const customer = this.selectedCustomer();
    if (!customer || this.submitting() || !this.canSubmit()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);

    const outcome = this.outcome();
    this.salesPersonService
      .createCall({
        customerUserId: customer.id,
        leads: this.leads().map((lead) => ({
          name: lead.name.trim(),
          contact: lead.contact.trim(),
          email: lead.email.trim() || undefined,
          businessName: lead.businessName.trim() || undefined,
          businessContact: lead.businessContact.trim() || undefined,
          post: lead.post.trim() || undefined,
          businessNature: lead.businessNature.trim() || undefined,
          remarks: lead.remarks.trim() || undefined,
          feedback: lead.feedback.trim() || undefined,
        })),
        outcome,
        notes: outcome === 'Notes' ? this.notes.trim() : undefined,
        paymentDetail:
          outcome === 'Payment'
            ? {
                status: this.paymentStatus,
                amountCleared: this.paymentAmount,
                amountDue: this.paymentStatus !== 'Cleared' ? this.paymentAmountDue : undefined,
                dueDateUtc: this.paymentStatus !== 'Cleared' ? this.paymentDueDate || undefined : undefined,
                remarks: this.paymentRemarks.trim() || undefined,
              }
            : undefined,
        commitmentDetail:
          outcome === 'Commitment'
            ? {
                promisedDateUtc: this.commitmentPromisedDate,
                referralCountRange: this.commitmentReferralRange.trim(),
                remarks: this.commitmentRemarks.trim() || undefined,
              }
            : undefined,
        complaint:
          outcome === 'Complaint'
            ? {
                title: this.complaintTitle.trim(),
                description: this.complaintDescription.trim(),
                categoryId: this.complaintCategoryId!,
                priorityId: this.complaintPriorityId!,
              }
            : undefined,
        followUpForCallId: this.followUpForCallId() ?? undefined,
      })
      .subscribe({
        next: (call) => {
          this.submitting.set(false);
          const userId = this.authService.currentUser()?.id;
          if (userId) localStorage.removeItem(draftKey(userId));
          this.router.navigate(['/app/sales-person/calls', call.id]);
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(error.error?.error ?? 'Could not save this call.');
        },
      });
  }
}
