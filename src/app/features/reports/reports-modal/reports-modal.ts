import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { PersonSummary } from '../../../core/admin/models';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_ADMIN } from '../../../core/auth/models';
import { LEAD_CATEGORY_BADGE_CLASSES, LEAD_CATEGORY_LABELS, LEAD_STATUS_BADGE_CLASSES, LEAD_STATUS_LABELS, LeadCategory, LeadFollowUpStatus } from '../../../core/leads/models';
import {
  CustomerOption,
  ReferralReportFilter,
  ReferralReportRow,
  ReferralReportSummaryRow,
  ReferralReportType,
  ReportingPageSize,
  SalesPersonCallCount,
  SalesPersonCustomerCallCount,
} from '../../../core/reports/models';
import { ReportsService } from '../../../core/reports/reports.service';
import { Modal } from '../../../shared/ui/modal/modal';
import { Pagination } from '../../../shared/ui/pagination/pagination';

const PAGE_SIZE = 20;

interface CustomerGroup {
  key: string;
  customerUserId: string | null;
  companyName: string;
  personName: string | null;
  branchName: string | null;
  callCount: number;
  followUpCount: number;
  rows: ReferralReportRow[];
}

interface SalesPersonGroup {
  salesPersonUserId: string;
  salesPersonDisplayName: string;
  customers: CustomerGroup[];
  totalReferrals: number;
  totalCalls: number;
  totalFollowUps: number;
}

/**
 * Sales Person → Customer → Referral (+ its follow-ups), in that nesting —
 * the Detailed report's shape. Defensive against non-array input on
 * purpose: this runs as part of ReportsModal's own template bindings, which
 * — because they're projected into Modal via <ng-content> — Angular still
 * evaluates on every change-detection pass even while Modal's own `@if
 * (open())` keeps them out of the DOM, so this can be read before the first
 * HTTP response (or ever, if the popup is never opened) with whatever the
 * signals were last set to.
 */
function groupDetailedRows(rows: ReferralReportRow[] | null | undefined, callCounts: SalesPersonCustomerCallCount[] | null | undefined): SalesPersonGroup[] {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeCallCounts = Array.isArray(callCounts) ? callCounts : [];

  const countLookup = new Map<string, number>();
  for (const c of safeCallCounts) countLookup.set(`${c.salesPersonUserId}|${c.customerUserId}`, c.callCount);

  const groups: SalesPersonGroup[] = [];
  for (const row of safeRows) {
    let sp = groups[groups.length - 1];
    if (!sp || sp.salesPersonUserId !== row.salesPersonUserId) {
      sp = { salesPersonUserId: row.salesPersonUserId, salesPersonDisplayName: row.salesPersonDisplayName, customers: [], totalReferrals: 0, totalCalls: 0, totalFollowUps: 0 };
      groups.push(sp);
    }

    const custKey = row.customerUserId ?? 'direct';
    let cust = sp.customers[sp.customers.length - 1];
    if (!cust || cust.key !== custKey) {
      const callCount = row.customerUserId ? (countLookup.get(`${row.salesPersonUserId}|${row.customerUserId}`) ?? 0) : 0;
      cust = {
        key: custKey,
        customerUserId: row.customerUserId,
        companyName: row.customerCompanyName ?? 'Direct additions (not from a call)',
        personName: row.customerDisplayName,
        branchName: row.customerBranchName,
        callCount,
        followUpCount: 0,
        rows: [],
      };
      sp.customers.push(cust);
      sp.totalCalls += callCount;
    }
    cust.rows.push(row);
    cust.followUpCount += row.followUps.length;
    sp.totalReferrals += 1;
    sp.totalFollowUps += row.followUps.length;
  }
  return groups;
}

/** Local calendar date as YYYY-MM-DD — see calls.ts's own copy of this helper for why not toISOString(). */
function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function oneMonthAgo(): string {
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  return isoDate(from);
}

/**
 * "Referrals Collection Report" — shared by Admin and Sales Person, reached
 * from a "+ Reports" button on the Calls page (both roles' variants). See
 * docs/modules/sales-person-calls.md. Detailed = every referral, grouped
 * Sales Person → Customer → Referral (+ its follow-up history). Summarized =
 * grouped by customer only, with call/referral/follow-up counts and a
 * category breakdown (my own design, per the product owner's explicit
 * delegation — see ReportService.GetSummaryReportAllAsync's own doc comment
 * on the backend). Defaults to the last month; on-screen results are
 * paginated, Print always fetches every matching row first (the /all
 * endpoints) so what prints is always complete regardless of the page
 * you're viewing — and prints ONLY the report table, none of the popup's
 * own filter/button chrome.
 */
@Component({
  selector: 'app-reports-modal',
  imports: [DatePipe, DecimalPipe, FormsModule, Modal, Pagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()" maxWidthClass="max-w-5xl">
      <h2 class="text-base font-semibold text-slate-900">Referrals Collection Report</h2>

      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label class="block text-xs font-medium text-slate-700">From</label>
          <input type="date" [(ngModel)]="dateFrom" (ngModelChange)="onFilterChange()" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-700">To</label>
          <input type="date" [(ngModel)]="dateTo" (ngModelChange)="onFilterChange()" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-700">Customer</label>
          <select [(ngModel)]="customerUserId" (ngModelChange)="onFilterChange()" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">All customers</option>
            @for (c of customers(); track c.id) {
              <option [value]="c.id">{{ c.companyName || c.displayName }}</option>
            }
          </select>
        </div>

        @if (isAdmin()) {
          <div>
            <label class="block text-xs font-medium text-slate-700">Sales person</label>
            <select [(ngModel)]="salesPersonUserId" (ngModelChange)="onSalesPersonChange()" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">All sales people</option>
              @for (sp of salesPeople(); track sp.id) {
                <option [value]="sp.id">{{ sp.displayName }}</option>
              }
            </select>
          </div>
        }
      </div>

      @if (isAdmin() && breakdown().length > 0) {
        <div class="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Calls per sales person (this date range)</p>
          <div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
            @for (b of breakdown(); track b.salesPersonUserId) {
              <span>{{ b.salesPersonDisplayName }}: <span class="font-medium">{{ b.callCount }}</span></span>
            }
          </div>
        </div>
      }

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div class="flex rounded-md border border-slate-300 p-0.5 text-sm">
          <button type="button" (click)="setReportType('detailed')" class="rounded px-3 py-1 font-medium" [class]="reportType() === 'detailed' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'">
            Detailed
          </button>
          <button type="button" (click)="setReportType('summary')" class="rounded px-3 py-1 font-medium" [class]="reportType() === 'summary' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'">
            Summarized
          </button>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 text-sm">
            <label class="text-slate-500">Page size</label>
            <select [(ngModel)]="pageSizeForPrint" class="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </select>
          </div>
          <button
            type="button"
            (click)="print()"
            [disabled]="printing()"
            class="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {{ printing() ? 'Preparing…' : 'Print' }}
          </button>
        </div>
      </div>

      @if (error()) {
        <p class="mt-3 text-sm text-red-600" role="alert">{{ error() }}</p>
      }

      <div class="mt-4 max-h-[28rem] overflow-y-auto rounded-lg border border-slate-200">
        @if (loading()) {
          <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
        } @else if (reportType() === 'detailed') {
          @for (sp of detailedGroups(); track sp.salesPersonUserId) {
            <div class="border-b border-slate-100 bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
              {{ sp.salesPersonDisplayName }} — {{ sp.totalReferrals }} referral{{ sp.totalReferrals === 1 ? '' : 's' }} · {{ sp.totalCalls }} call{{ sp.totalCalls === 1 ? '' : 's' }} · {{ sp.totalFollowUps }} follow-up{{ sp.totalFollowUps === 1 ? '' : 's' }}
            </div>
            @for (cust of sp.customers; track cust.key) {
              <div class="border-b border-slate-100 bg-slate-50 px-4 py-1.5">
                <p class="text-sm font-medium text-slate-900">
                  {{ cust.companyName }}
                  @if (cust.branchName) {
                    <span class="font-normal text-slate-400">({{ cust.branchName }})</span>
                  }
                </p>
                <p class="text-xs text-slate-500">
                  @if (cust.personName) {
                    {{ cust.personName }} ·
                  }
                  {{ cust.callCount }} call{{ cust.callCount === 1 ? '' : 's' }} · {{ cust.rows.length }} referral{{ cust.rows.length === 1 ? '' : 's' }} · {{ cust.followUpCount }} follow-up{{ cust.followUpCount === 1 ? '' : 's' }}
                </p>
              </div>
              @for (row of cust.rows; track row.leadId) {
                <div class="border-b border-slate-100 px-6 py-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium text-slate-900">{{ row.leadName }}</span>
                    @if (row.businessName) {
                      <span class="text-xs text-slate-500">— {{ row.businessName }}</span>
                    }
                    @if (row.currentCategory; as category) {
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="categoryClass(category)">{{ categoryLabel(category) }}</span>
                    } @else {
                      <span class="text-xs text-slate-400">Not yet followed up</span>
                    }
                    @if (row.currentStatus; as status) {
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusClass(status)">{{ statusLabel(status) }}</span>
                    }
                    @if (row.agreementAmount != null) {
                      <span class="text-xs font-medium text-emerald-700">Agreement: {{ row.agreementAmount | number: '1.0-2' }}</span>
                    }
                  </div>
                  <p class="text-xs text-slate-500">{{ row.leadContact }} · added {{ row.createdAtUtc | date: 'mediumDate' }}</p>
                  @if (row.followUps.length > 0) {
                    <ul class="mt-1 space-y-0.5 border-l-2 border-slate-200 pl-2">
                      @for (fu of row.followUps; track fu.createdAtUtc) {
                        <li class="text-xs text-slate-500">
                          {{ fu.createdAtUtc | date: 'mediumDate' }} — <span class="font-medium">{{ categoryLabel(fu.category) }}</span> · {{ statusLabel(fu.status) }}
                          @if (fu.cancellationReason) {
                            (cancelled: {{ fu.cancellationReason }})
                          }
                          @if (fu.remarks || fu.feedback) {
                            : {{ fu.remarks || fu.feedback }}
                          }
                          (by {{ fu.actorDisplayName }})
                        </li>
                      }
                    </ul>
                  }
                </div>
              }
            }
          } @empty {
            <p class="p-8 text-center text-sm text-slate-500">No referrals match these filters.</p>
          }
        } @else {
          <!-- border-radius doesn't render on a border-collapse table itself
               in any browser — the standard fix is an overflow-hidden,
               rounded wrapper clipping the table to that shape, with the
               table's own OUTER edge borderless (only interior cell borders
               + the wrapper's one border, so corners aren't doubled/square). -->
          <div class="overflow-hidden rounded-lg border border-slate-300">
            <table class="w-full border-collapse text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Customer</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Total Calls</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Total Referrals</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Total Follow-ups</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">A+</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Cool</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Warm</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Not Yet Categorized</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Won</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">In Progress</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Cancelled</th>
                  <th class="border-b border-r border-slate-200 px-3 py-2">Agreement Amount</th>
                  <th class="border-b border-slate-200 px-3 py-2">Last Referral Date</th>
                </tr>
              </thead>
              <tbody>
                @for (row of summaryRows(); track row.customerUserId ?? 'direct') {
                  <tr>
                    <td class="border-b border-r border-slate-200 px-3 py-2">
                      @if (row.customerCompanyName) {
                        <p class="font-medium text-slate-900">{{ row.customerCompanyName }}</p>
                        <p class="text-xs text-slate-500">{{ row.customerDisplayName }}</p>
                      } @else {
                        <p class="text-slate-500">{{ row.customerDisplayName }}</p>
                      }
                    </td>
                    <td class="border-b border-r border-slate-200 px-3 py-2">{{ row.totalCalls }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2 font-medium">{{ row.totalReferrals }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2">{{ row.totalFollowUps }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2">{{ row.aPlusCount }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2">{{ row.coolCount }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2">{{ row.warmCount }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2">{{ row.uncategorizedCount }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2">{{ row.wonCount }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2">{{ row.inProgressCount }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2">{{ row.cancelledCount }}</td>
                    <td class="border-b border-r border-slate-200 px-3 py-2 text-emerald-700">{{ row.totalAgreementAmount | number: '1.0-2' }}</td>
                    <td class="border-b border-slate-200 px-3 py-2 text-xs text-slate-400">{{ row.lastReferralAtUtc | date: 'mediumDate' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="13" class="p-8 text-center text-sm text-slate-500">No referrals match these filters.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <div class="mt-2">
        <app-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="totalCount()" [pageSize]="pageSizeValue" (pageChange)="goToPage($event)" />
      </div>
    </app-modal>

    <!-- Print target — table data only, nothing else from this popup. Always
         fetched fresh (every matching row, unpaginated) when Print is
         clicked, independent of the on-screen page. -->
    <div id="report-print-area" class="report-print-area">
      <h1 class="text-base font-semibold">Referrals Collection Report — {{ reportType() === 'detailed' ? 'Detailed' : 'Summarized' }}</h1>
      <p class="text-xs text-slate-500">{{ dateFrom || 'All time' }} – {{ dateTo || 'present' }}</p>

      @if (reportType() === 'detailed') {
        @for (sp of printDetailedGroups(); track sp.salesPersonUserId) {
          <div class="mt-3 overflow-hidden rounded-lg border border-slate-400">
            <!-- table-fixed + an explicit colgroup, not just w-1/4-style hints
                 on cells — table-layout:auto (the default) lets a column grow
                 past its intended width to fit unwrapped content (the
                 follow-up history text especially), which is exactly what
                 pushed print output past the physical A4/A5 page edge.
                 Fixed layout + break-words below makes the widths actually
                 binding, wrapping long text instead of overflowing it. -->
            <table class="w-full table-fixed border-collapse text-left text-xs">
              <colgroup>
                <col style="width: 22%" />
                <col style="width: 13%" />
                <col style="width: 13%" />
                <col style="width: 52%" />
              </colgroup>
              <thead>
                <tr class="bg-slate-100">
                  <th colspan="4" class="border-b border-slate-400 py-1 px-2 text-sm">
                    {{ sp.salesPersonDisplayName }} — {{ sp.totalReferrals }} referral{{ sp.totalReferrals === 1 ? '' : 's' }} · {{ sp.totalCalls }} call{{ sp.totalCalls === 1 ? '' : 's' }} · {{ sp.totalFollowUps }} follow-up{{ sp.totalFollowUps === 1 ? '' : 's' }}
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (cust of sp.customers; track cust.key) {
                  <tr class="bg-slate-50">
                    <td colspan="4" class="break-words border-b border-slate-300 py-1 px-2 font-semibold">
                      {{ cust.companyName }} {{ cust.branchName ? '(' + cust.branchName + ')' : '' }} — {{ cust.callCount }} call{{ cust.callCount === 1 ? '' : 's' }},
                      {{ cust.rows.length }} referral{{ cust.rows.length === 1 ? '' : 's' }}, {{ cust.followUpCount }} follow-up{{ cust.followUpCount === 1 ? '' : 's' }}
                    </td>
                  </tr>
                  @for (row of cust.rows; track row.leadId) {
                    <tr class="align-top">
                      <td class="break-words border-b border-r border-slate-200 py-1 px-2">
                        {{ row.leadName }} {{ row.businessName ? '— ' + row.businessName : '' }}<br /><span class="text-slate-500">{{ row.leadContact }}</span>
                        @if (row.agreementAmount != null) {
                          <br /><span class="text-emerald-700">Agreement: {{ row.agreementAmount | number: '1.0-2' }}</span>
                        }
                      </td>
                      <td class="break-words border-b border-r border-slate-200 py-1 px-2">{{ row.currentCategory || 'Not yet' }}{{ row.currentStatus ? ' / ' + statusLabel(row.currentStatus) : '' }}</td>
                      <td class="break-words border-b border-r border-slate-200 py-1 px-2">{{ row.createdAtUtc | date: 'mediumDate' }}</td>
                      <td class="break-words border-b border-slate-200 py-1 px-2">
                        @for (fu of row.followUps; track fu.createdAtUtc) {
                          <div>
                            {{ fu.createdAtUtc | date: 'mediumDate' }} — {{ fu.category }} / {{ statusLabel(fu.status) }}{{ fu.cancellationReason ? ' (' + fu.cancellationReason + ')' : '' }}{{ fu.remarks || fu.feedback ? ': ' + (fu.remarks || fu.feedback) : '' }} ({{ fu.actorDisplayName }})
                          </div>
                        } @empty {
                          <span class="text-slate-400">No follow-ups yet.</span>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <div class="mt-3 overflow-hidden rounded-lg border border-slate-400">
          <!-- 13 columns across a paper-width page has no room to spare —
               break-words on every header (not just body cells, which
               already had it) so a single long word like "Cancelled" or
               "Categorized" wraps mid-word inside its fixed column instead
               of visually overflowing into the next one, which is what was
               happening before. Shorter, wrap-friendly header labels (vs.
               the on-screen table's fuller ones) plus a smaller print-only
               font keep every header to 1-2 wrapped lines instead of 3+. -->
          <table class="w-full table-fixed border-collapse text-left text-[9px] leading-tight">
            <colgroup>
              <col style="width: 14%" />
              <col style="width: 6%" />
              <col style="width: 7%" />
              <col style="width: 6%" />
              <col style="width: 5%" />
              <col style="width: 5%" />
              <col style="width: 5%" />
              <col style="width: 9%" />
              <col style="width: 5%" />
              <col style="width: 7%" />
              <col style="width: 7%" />
              <col style="width: 10%" />
              <col style="width: 14%" />
            </colgroup>
            <thead>
              <tr class="bg-slate-100">
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 align-bottom">Customer</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">Calls</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">Referrals</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">Follow-ups</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">A+</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">Cool</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">Warm</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">Uncategorized</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">Won</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">In Progress</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-center align-bottom">Cancelled</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1 text-right align-bottom">Amount</th>
                <th class="break-words border-b border-slate-400 py-1 px-1 align-bottom">Last Referral</th>
              </tr>
            </thead>
            <tbody>
              @for (row of printSummaryRows(); track row.customerUserId ?? 'direct') {
                <tr>
                  <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ row.customerCompanyName || row.customerDisplayName }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.totalCalls }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.totalReferrals }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.totalFollowUps }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.aPlusCount }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.coolCount }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.warmCount }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.uncategorizedCount }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.wonCount }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.inProgressCount }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-center">{{ row.cancelledCount }}</td>
                  <td class="border-b border-r border-slate-200 py-1 px-1 text-right text-emerald-700">{{ row.totalAgreementAmount | number: '1.0-2' }}</td>
                  <td class="break-words border-b border-slate-200 py-1 px-1 text-slate-500">{{ row.lastReferralAtUtc | date: 'mediumDate' }}</td>
                </tr>
              }
              <tr class="bg-slate-50 font-semibold">
                <td class="border-r border-slate-300 py-1 px-1">Total</td>
                <td class="border-r border-slate-300 py-1 px-1 text-center">{{ printSummaryTotals().calls }}</td>
                <td class="border-r border-slate-300 py-1 px-1 text-center">{{ printSummaryTotals().referrals }}</td>
                <td class="border-r border-slate-300 py-1 px-1 text-center">{{ printSummaryTotals().followUps }}</td>
                <td colspan="7" class="border-r border-slate-300"></td>
                <td class="border-r border-slate-300 py-1 px-1 text-right">{{ printSummaryTotals().agreementAmount | number: '1.0-2' }}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ReportsModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  protected readonly categoryLabels = LEAD_CATEGORY_LABELS;
  protected readonly categoryClasses = LEAD_CATEGORY_BADGE_CLASSES;
  protected readonly statusLabels = LEAD_STATUS_LABELS;
  protected readonly statusClasses = LEAD_STATUS_BADGE_CLASSES;
  protected readonly pageSizeValue = PAGE_SIZE;

  private readonly reportsService = inject(ReportsService);
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isAdmin = computed(() => this.authService.currentUser()?.roles.includes(ROLE_ADMIN) ?? false);

  protected dateFrom = '';
  protected dateTo = '';
  protected salesPersonUserId = '';
  protected customerUserId = '';
  protected pageSizeForPrint: ReportingPageSize = 'A4';

  protected readonly customers = signal<CustomerOption[]>([]);

  protected readonly reportType = signal<ReferralReportType>('detailed');
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly detailedRows = signal<ReferralReportRow[]>([]);
  protected readonly detailedCallCounts = signal<SalesPersonCustomerCallCount[]>([]);
  protected readonly summaryRows = signal<ReferralReportSummaryRow[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly salesPeople = signal<PersonSummary[]>([]);
  protected readonly breakdown = signal<SalesPersonCallCount[]>([]);
  protected readonly printing = signal(false);
  protected readonly printDetailedRows = signal<ReferralReportRow[]>([]);
  protected readonly printDetailedCallCounts = signal<SalesPersonCustomerCallCount[]>([]);
  protected readonly printSummaryRows = signal<ReferralReportSummaryRow[]>([]);

  protected readonly detailedGroups = computed(() => groupDetailedRows(this.detailedRows(), this.detailedCallCounts()));
  protected readonly printDetailedGroups = computed(() => groupDetailedRows(this.printDetailedRows(), this.printDetailedCallCounts()));
  protected readonly printSummaryTotals = computed(() =>
    this.printSummaryRows().reduce(
      (totals, r) => ({
        calls: totals.calls + r.totalCalls,
        referrals: totals.referrals + r.totalReferrals,
        followUps: totals.followUps + r.totalFollowUps,
        agreementAmount: totals.agreementAmount + r.totalAgreementAmount,
      }),
      { calls: 0, referrals: 0, followUps: 0, agreementAmount: 0 },
    ),
  );

  constructor() {
    // Everything below only ever does real work once `open()` is actually
    // true (guarded at the top) — but the guard still has to live inside
    // this subscription rather than an `@if` in the template: this
    // component's whole template is projected into <app-modal> via
    // <ng-content>, and Angular evaluates a host's own template bindings
    // (this component's) on every change-detection pass regardless of
    // whether the *receiving* `@if (open())` inside Modal's template
    // currently attaches that projected content to the DOM. So without this
    // guard, HTTP calls here would fire (and the group/print computeds
    // would run against not-yet-populated signals) as soon as this
    // component exists at all — i.e. as soon as the host page (e.g. the
    // Calls list) loads, not when the user actually opens the popup.
    toObservable(this.open)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isOpen) => {
        if (!isOpen) return;
        if (!this.dateFrom && !this.dateTo) {
          this.dateFrom = oneMonthAgo();
          this.dateTo = isoDate(new Date());
        }
        this.reportsService
          .getReportingPageSize()
          .pipe(catchError(() => of(null)))
          .subscribe((r) => {
            if (r) this.pageSizeForPrint = r.pageSize;
          });
        this.refreshCustomers();
        if (this.isAdmin()) {
          this.adminService
            .getSalesPeople('', 1, 100)
            .pipe(catchError(() => of({ items: [] as PersonSummary[], totalCount: 0, page: 1, pageSize: 100 })))
            .subscribe((r) => this.salesPeople.set(r.items));
        }
        this.refreshBreakdown();
        this.refresh();
      });
  }

  /** Re-scoped to the newly-selected Sales Person (Admin only) — the previously-picked customer may not belong to them, so it's cleared too. */
  protected onSalesPersonChange(): void {
    this.customerUserId = '';
    this.refreshCustomers();
    this.onFilterChange();
  }

  private refreshCustomers(): void {
    this.reportsService
      .getReportCustomers(this.isAdmin() ? this.salesPersonUserId || undefined : undefined)
      .pipe(catchError(() => of([] as CustomerOption[])))
      .subscribe((customers) => this.customers.set(customers));
  }

  protected setReportType(type: ReferralReportType): void {
    this.reportType.set(type);
    this.page.set(1);
    this.refresh();
  }

  protected onFilterChange(): void {
    this.page.set(1);
    this.refreshBreakdown();
    this.refresh();
  }

  protected goToPage(page: number): void {
    this.page.set(page);
    this.refresh();
  }

  dismiss(): void {
    this.closed.emit();
  }

  protected categoryLabel(category: string): string {
    return this.categoryLabels[category as LeadCategory] ?? category;
  }

  protected categoryClass(category: string): string {
    return this.categoryClasses[category as LeadCategory];
  }

  protected statusLabel(status: string): string {
    return this.statusLabels[status as LeadFollowUpStatus] ?? status;
  }

  protected statusClass(status: string): string {
    return this.statusClasses[status as LeadFollowUpStatus];
  }

  private buildFilter(): ReferralReportFilter {
    return {
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
      customerUserId: this.customerUserId || undefined,
      salesPersonUserId: this.isAdmin() ? this.salesPersonUserId || undefined : undefined,
      type: this.reportType(),
      page: this.page(),
      pageSize: PAGE_SIZE,
    };
  }

  private refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const filter = this.buildFilter();

    const onLoaded = (totalCount: number) => {
      this.totalCount.set(totalCount);
      this.totalPages.set(Math.max(1, Math.ceil(totalCount / PAGE_SIZE)));
      this.loading.set(false);
    };
    const onError = () => {
      this.loading.set(false);
      this.error.set('Could not load the report. Please try again.');
    };

    if (filter.type === 'summary') {
      this.reportsService.getSummaryReport(filter).subscribe({
        next: (result) => {
          this.summaryRows.set(result.items);
          this.detailedRows.set([]);
          onLoaded(result.totalCount);
        },
        error: onError,
      });
    } else {
      this.reportsService.getDetailedReport(filter).subscribe({
        next: (result) => {
          this.detailedRows.set(result.items);
          this.detailedCallCounts.set(result.callCounts);
          this.summaryRows.set([]);
          onLoaded(result.totalCount);
        },
        error: onError,
      });
    }
  }

  private refreshBreakdown(): void {
    if (!this.isAdmin()) return;
    this.reportsService
      .getSalesPersonBreakdown(this.dateFrom || undefined, this.dateTo || undefined)
      .pipe(catchError(() => of([] as SalesPersonCallCount[])))
      .subscribe((b) => this.breakdown.set(b));
  }

  print(): void {
    if (this.printing()) return;
    this.printing.set(true);
    const filter = this.buildFilter();

    const done = () => {
      this.printing.set(false);
      const printArea = document.getElementById('report-print-area');
      if (printArea) printArea.dataset['paperSize'] = this.pageSizeForPrint;
      // Deferred — same reasoning as OrderReceiptModal.print(): this is a
      // zoneless app, window.print() blocks/steals focus, and must run after
      // the pending render from the signal writes above has flushed.
      setTimeout(() => window.print(), 0);
    };
    const onPrintError = () => {
      this.printing.set(false);
      this.error.set('Could not prepare the report for print. Please try again.');
    };

    if (filter.type === 'summary') {
      this.reportsService.getSummaryReportAll(filter).subscribe({
        next: (rows) => {
          this.printSummaryRows.set(rows);
          this.printDetailedRows.set([]);
          this.printDetailedCallCounts.set([]);
          done();
        },
        error: onPrintError,
      });
    } else {
      this.reportsService.getDetailedReportAll(filter).subscribe({
        next: (result) => {
          this.printDetailedRows.set(result.items);
          this.printDetailedCallCounts.set(result.callCounts);
          this.printSummaryRows.set([]);
          done();
        },
        error: onPrintError,
      });
    }
  }
}
