import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_ADMIN } from '../../../core/auth/models';
import { LEAD_CATEGORY_BADGE_CLASSES, LEAD_CATEGORY_LABELS } from '../../../core/leads/models';
import { TicketLookups } from '../../../core/tickets/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import {
  CALL_OUTCOME_BADGE_CLASSES,
  CALL_OUTCOME_LABELS,
  CallDetailWithPayment,
  CallOutcome,
  CallSummary,
  PAYMENT_STATUS_LABELS,
  PaymentCallStatus,
  UpdateCallLeadRequest,
  UpdateCallRequest,
} from '../../../core/sales-person/models';
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

/** One referral row in the edit form — see log-call.ts's own LeadDraft. `id` set means it's an existing Lead (Remarks/Feedback aren't re-editable, see UpdateCallLeadRequest); omitted means it's a brand-new one being added right now. */
interface EditLeadDraft {
  id?: string;
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

function blankEditLead(): EditLeadDraft {
  return { name: '', contact: '', email: '', businessName: '', businessContact: '', post: '', businessNature: '', remarks: '', feedback: '' };
}

/**
 * Full detail for one call — outcome, payment/complaint specifics, every
 * Lead collected during it, and (right side) this customer's complete
 * call history with the currently-viewed one pinned to the top and
 * highlighted. See docs/modules/sales-person-calls.md.
 *
 * Editing mirrors log-call.ts's own create form almost exactly: Outcome may
 * be switched among Notes/Payment/Commitment (never into/out of Complaint —
 * see UpdateCallRequest's own doc comment), referrals can be added or have
 * their own intake fields corrected, and a Complaint call's linked Ticket
 * content (Title/Description/Category/Priority) is editable in place. Every
 * edit stamps `editedAtUtc`, shown as a small "(edited)" marker — a
 * WhatsApp-style notice, not a full audit trail.
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
        <a [routerLink]="basePath()" class="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back to Calls</a>
      </div>
    } @else if (call(); as c) {
      <a [routerLink]="basePath()" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back to Calls</a>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <h1 class="text-lg font-semibold text-slate-900">{{ c.customerCompanyName }}</h1>
        @if (c.customerBranchName) {
          <span class="text-sm text-slate-400">({{ c.customerBranchName }})</span>
        }
        <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="outcomeClasses[c.outcome]">{{ outcomeLabels[c.outcome] }}</span>
      </div>
      <p class="mt-1 text-sm text-slate-500">
        {{ c.createdAtUtc | date: 'medium' }} · logged by {{ isMine(c) ? 'you' : c.salesPersonDisplayName }}
        @if (c.editedAtUtc) {
          · <span class="text-slate-400" [title]="'Edited ' + (c.editedAtUtc | date: 'medium')">(edited)</span>
        }
      </p>

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
              @if (canEdit(c) && !editing()) {
                <button type="button" (click)="startEdit(c)" class="text-xs font-medium text-indigo-600 hover:text-indigo-500">Edit</button>
              }
            </div>

            @if (editing()) {
              <div class="mt-2 flex flex-wrap gap-4">
                @for (option of editableOutcomes(c); track option) {
                  <label class="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="radio" name="edit-outcome" [value]="option" [ngModel]="outcomeDraft" (ngModelChange)="outcomeDraft = $event" [disabled]="c.outcome === 'Complaint'" />
                    {{ outcomeLabels[option] }}
                  </label>
                }
              </div>

              @if (outcomeDraft === 'Notes') {
                <textarea
                  rows="3"
                  placeholder="What happened on this call?"
                  [(ngModel)]="notesDraft"
                  class="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                ></textarea>
              } @else if (outcomeDraft === 'Payment') {
                <div class="mt-3 space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3">
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
              } @else if (outcomeDraft === 'Commitment') {
                <div class="mt-3 space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3">
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
              } @else if (outcomeDraft === 'Complaint') {
                <div class="mt-3 space-y-2.5">
                  <input
                    type="text"
                    placeholder="Title"
                    [(ngModel)]="complaintTitleDraft"
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
                    [(ngModel)]="complaintDescriptionDraft"
                    class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  ></textarea>
                </div>
              }

              <div class="mt-4 border-t border-slate-100 pt-3">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-medium text-slate-700">Referrals collected on this call</h3>
                  <button type="button" (click)="addEditLead()" class="rounded-md border border-indigo-300 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
                    + Add Referral
                  </button>
                </div>

                @if (editLeads().length > 0) {
                  <div class="mt-2 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                    @for (lead of editLeads(); track $index; let i = $index) {
                      <div [id]="'edit-lead-form-' + i" class="rounded-md border border-slate-200">
                        @if (activeEditLeadIndex() === i) {
                          <div class="space-y-2 p-2.5">
                            <div class="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Name"
                                [ngModel]="lead.name"
                                (ngModelChange)="updateEditLead(i, 'name', $event)"
                                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <input
                                type="text"
                                placeholder="Contact"
                                [ngModel]="lead.contact"
                                (ngModelChange)="updateEditLead(i, 'contact', $event)"
                                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                            <input
                              type="email"
                              placeholder="Email"
                              [ngModel]="lead.email"
                              (ngModelChange)="updateEditLead(i, 'email', $event)"
                              class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <div class="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Business name"
                                [ngModel]="lead.businessName"
                                (ngModelChange)="updateEditLead(i, 'businessName', $event)"
                                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <input
                                type="text"
                                placeholder="Business contact"
                                [ngModel]="lead.businessContact"
                                (ngModelChange)="updateEditLead(i, 'businessContact', $event)"
                                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Post"
                                [ngModel]="lead.post"
                                (ngModelChange)="updateEditLead(i, 'post', $event)"
                                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <input
                                type="text"
                                placeholder="Business nature"
                                [ngModel]="lead.businessNature"
                                (ngModelChange)="updateEditLead(i, 'businessNature', $event)"
                                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                            @if (!lead.id) {
                              <textarea
                                rows="2"
                                placeholder="Remarks"
                                [ngModel]="lead.remarks"
                                (ngModelChange)="updateEditLead(i, 'remarks', $event)"
                                class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              ></textarea>
                              <textarea
                                rows="2"
                                placeholder="Feedback"
                                [ngModel]="lead.feedback"
                                (ngModelChange)="updateEditLead(i, 'feedback', $event)"
                                class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              ></textarea>
                            }
                            <div class="flex justify-end">
                              @if (!lead.id) {
                                <button type="button" (click)="removeEditLead(i)" class="text-xs font-medium text-red-600 hover:text-red-700">Remove this referral</button>
                              } @else {
                                <button type="button" (click)="activeEditLeadIndex.set(null)" class="text-xs font-medium text-slate-500 hover:text-slate-700">Done</button>
                              }
                            </div>
                          </div>
                        } @else {
                          <button type="button" (click)="activeEditLeadIndex.set(i)" class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                            <span class="font-medium text-slate-800">{{ lead.name || 'Untitled lead' }}{{ lead.businessName ? ' — ' + lead.businessName : '' }}</span>
                            @if (!lead.id) {
                              <span class="text-xs font-medium text-indigo-500">New</span>
                            }
                          </button>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <p class="mt-2 text-sm text-slate-500">None yet.</p>
                }
              </div>

              @if (editError()) {
                <p class="mt-2 text-sm text-red-600" role="alert">{{ editError() }}</p>
              }
              <div class="mt-3 flex justify-end gap-2">
                <button type="button" (click)="cancelEdit()" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                <button
                  type="button"
                  (click)="saveEdit(c)"
                  [disabled]="saving() || !canSaveEdit()"
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
                  <a [routerLink]="[basePath(), c.followUpForCallId]" class="font-medium underline hover:no-underline">
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
                        <a [routerLink]="[basePath(), followUp.callId]" class="font-medium text-indigo-600 hover:text-indigo-500">
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
              @if (c.notes) {
                <p class="mt-1 whitespace-pre-wrap text-sm text-slate-600">{{ c.notes }}</p>
              }
            }
          </div>

          <div class="rounded-lg border border-slate-200 bg-white">
            <h2 class="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">Referrals collected ({{ c.leads.length }})</h2>
            <div class="divide-y divide-slate-100">
              @for (lead of c.leads; track lead.id) {
                <a [routerLink]="[leadsBasePath(), lead.id]" class="block p-4 hover:bg-slate-50">
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
                <a [routerLink]="[basePath(), past.id]" class="block px-3 py-2.5 text-sm hover:bg-slate-50">
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
  private readonly adminService = inject(AdminService);
  private readonly ticketsService = inject(TicketsService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  /** Same shared component mounted at both /app/admin/calls/:id and /app/sales-person/calls/:id — see calls.ts's own isAdmin computed. Admin's GET/PUT never carry PaymentDetail (see AdminService.getCall/updateCall) — canEdit() hides the Edit button for a Payment-outcome call when viewed as Admin. */
  protected readonly isAdmin = computed(() => this.authService.currentUser()?.roles.includes(ROLE_ADMIN) ?? false);
  /** See leads-list.ts's own copy of this pattern. */
  protected readonly basePath = computed(() => (this.isAdmin() ? '/app/admin/calls' : '/app/sales-person/calls'));
  protected readonly leadsBasePath = computed(() => (this.isAdmin() ? '/app/admin/leads' : '/app/sales-person/leads'));

  protected readonly call = signal<CallDetailWithPayment | null>(null);
  protected readonly notFound = signal<string | null>(null);
  private readonly rawHistory = signal<CallSummary[]>([]);

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected outcomeDraft: CallOutcome = 'Notes';
  protected notesDraft = '';
  protected paymentStatusDraft: PaymentCallStatus = 'Cleared';
  protected paymentAmountDraft: number | null = null;
  protected paymentDueDateDraft = '';
  protected paymentAmountDueDraft: number | null = null;
  protected paymentRemarksDraft = '';
  protected commitmentPromisedDateDraft = '';
  protected commitmentReferralRangeDraft = '';
  protected commitmentRemarksDraft = '';
  protected complaintTitleDraft = '';
  protected complaintDescriptionDraft = '';
  protected complaintCategoryId: number | null = null;
  protected complaintPriorityId: number | null = null;
  protected readonly lookups = signal<TicketLookups | null>(null);

  protected readonly editLeads = signal<EditLeadDraft[]>([]);
  protected readonly activeEditLeadIndex = signal<number | null>(null);

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
        switchMap((id) => {
          const call$ = this.isAdmin() ? this.adminService.getCall(id) : this.salesPersonService.getCall(id);
          return call$.pipe(catchError((error: HttpErrorResponse) => of(error)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result instanceof HttpErrorResponse) {
          this.notFound.set(result.status === 404 ? 'This call could not be found.' : 'You do not have access to this call.');
          return;
        }
        this.notFound.set(null);
        this.call.set(result);
        const history$ = this.isAdmin()
          ? this.adminService.getCalls({ customerUserId: result.customerUserId, page: 1, pageSize: 20 })
          : this.salesPersonService.getCalls({ customerUserId: result.customerUserId, page: 1, pageSize: 20 });
        history$.subscribe((page) => this.rawHistory.set(page.items));
      });
  }

  /** Hides Edit entirely for a Payment-outcome call viewed as Admin — Admin's GET never carries PaymentDetail, so there's nothing valid to edit, and the backend rejects it outright anyway. */
  protected canEdit(c: CallDetailWithPayment): boolean {
    return !(this.isAdmin() && c.outcome === 'Payment');
  }

  /** A Complaint call is locked to Complaint (its Ticket is its own independent record — see UpdateCallRequest's own doc comment); Admin never gets Payment as an option since they can't see/edit PaymentDetail at all. */
  protected editableOutcomes(c: CallDetailWithPayment): CallOutcome[] {
    if (c.outcome === 'Complaint') return ['Complaint'];
    return this.isAdmin() ? ['Notes', 'Commitment'] : ['Notes', 'Payment', 'Commitment'];
  }

  /** Loosely typed on purpose — used for both CallSummary rows and CallFollowUpSummary entries, which share this one field. */
  protected isMine(entry: { salesPersonUserId: string }): boolean {
    return entry.salesPersonUserId === this.authService.currentUser()?.id;
  }

  protected startEdit(c: CallDetailWithPayment): void {
    this.outcomeDraft = c.outcome;
    this.notesDraft = c.notes ?? '';
    this.paymentStatusDraft = c.paymentDetail?.status ?? 'Cleared';
    this.paymentAmountDraft = c.paymentDetail?.amountCleared ?? null;
    this.paymentDueDateDraft = c.paymentDetail?.dueDateUtc?.slice(0, 10) ?? '';
    this.paymentAmountDueDraft = c.paymentDetail?.amountDue ?? null;
    this.paymentRemarksDraft = c.paymentDetail?.remarks ?? '';
    this.commitmentPromisedDateDraft = c.commitmentDetail?.promisedDateUtc.slice(0, 10) ?? '';
    this.commitmentReferralRangeDraft = c.commitmentDetail?.referralCountRange ?? '';
    this.commitmentRemarksDraft = c.commitmentDetail?.remarks ?? '';
    this.editLeads.set(
      c.leads.map((l) => ({
        id: l.id,
        name: l.name,
        contact: l.contact,
        email: l.email ?? '',
        businessName: l.businessName ?? '',
        businessContact: l.businessContact ?? '',
        post: l.post ?? '',
        businessNature: l.businessNature ?? '',
        remarks: '',
        feedback: '',
      })),
    );
    this.activeEditLeadIndex.set(null);

    if (c.outcome === 'Complaint') {
      this.complaintTitleDraft = c.complaintTitle ?? '';
      this.complaintDescriptionDraft = c.complaintDescription ?? '';
      this.complaintCategoryId = c.complaintCategoryId;
      this.complaintPriorityId = c.complaintPriorityId;
    }
    if (!this.lookups()) {
      this.ticketsService.getLookups().subscribe((lookups) => {
        this.lookups.set(lookups);
        this.complaintCategoryId ??= lookups.categories[0]?.id ?? null;
        this.complaintPriorityId ??= lookups.priorities[0]?.id ?? null;
      });
    }

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

  protected addEditLead(): void {
    this.editLeads.update((list) => [...list, blankEditLead()]);
    this.activeEditLeadIndex.set(this.editLeads().length - 1);
    queueMicrotask(() => {
      this.elementRef.nativeElement.querySelector(`#edit-lead-form-${this.editLeads().length - 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  /** Only a brand-new (no id) row can be removed — an existing Lead is never deleted from here, see UpdateCallLeadRequest's own doc comment. */
  protected removeEditLead(index: number): void {
    if (this.editLeads()[index]?.id) return;
    this.editLeads.update((list) => list.filter((_, i) => i !== index));
    this.activeEditLeadIndex.set(null);
  }

  protected updateEditLead<K extends keyof EditLeadDraft>(index: number, field: K, value: EditLeadDraft[K]): void {
    this.editLeads.update((list) => list.map((lead, i) => (i === index ? { ...lead, [field]: value } : lead)));
  }

  protected canSaveEdit(): boolean {
    if (this.outcomeDraft === 'Notes') return this.notesDraft.trim().length > 0;
    if (this.outcomeDraft === 'Payment') return !!this.paymentStatusDraft;
    if (this.outcomeDraft === 'Commitment') {
      return this.commitmentPromisedDateDraft.trim().length > 0 && this.commitmentReferralRangeDraft.trim().length > 0;
    }
    if (this.outcomeDraft === 'Complaint') {
      return this.complaintTitleDraft.trim().length > 0 && this.complaintDescriptionDraft.trim().length > 0 && !!this.complaintCategoryId && !!this.complaintPriorityId;
    }
    return false;
  }

  protected saveEdit(c: CallDetailWithPayment): void {
    if (this.saving() || !this.canSaveEdit()) return;

    this.saving.set(true);
    this.editError.set(null);

    const outcome = this.outcomeDraft;
    const leads: UpdateCallLeadRequest[] = this.editLeads().map((lead) => ({
      id: lead.id,
      name: lead.name.trim(),
      contact: lead.contact.trim(),
      email: lead.email.trim() || undefined,
      businessName: lead.businessName.trim() || undefined,
      businessContact: lead.businessContact.trim() || undefined,
      post: lead.post.trim() || undefined,
      businessNature: lead.businessNature.trim() || undefined,
      remarks: lead.remarks.trim() || undefined,
      feedback: lead.feedback.trim() || undefined,
    }));

    const request: UpdateCallRequest = {
      outcome,
      leads,
      notes: outcome === 'Notes' ? this.notesDraft.trim() : outcome === 'Complaint' ? this.notesDraft.trim() || null : undefined,
      paymentDetail:
        outcome === 'Payment'
          ? {
              status: this.paymentStatusDraft,
              amountCleared: this.paymentAmountDraft,
              dueDateUtc: this.paymentStatusDraft !== 'Cleared' ? this.paymentDueDateDraft || null : null,
              amountDue: this.paymentStatusDraft !== 'Cleared' ? this.paymentAmountDueDraft : null,
              remarks: this.paymentRemarksDraft.trim() || null,
            }
          : undefined,
      commitmentDetail:
        outcome === 'Commitment'
          ? {
              promisedDateUtc: this.commitmentPromisedDateDraft,
              referralCountRange: this.commitmentReferralRangeDraft.trim(),
              remarks: this.commitmentRemarksDraft.trim() || null,
            }
          : undefined,
      complaint:
        outcome === 'Complaint'
          ? {
              title: this.complaintTitleDraft.trim(),
              description: this.complaintDescriptionDraft.trim(),
              categoryId: this.complaintCategoryId!,
              priorityId: this.complaintPriorityId!,
            }
          : undefined,
    };

    const save$ = this.isAdmin() ? this.adminService.updateCall(c.id, request) : this.salesPersonService.updateCall(c.id, request);
    save$.subscribe({
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
