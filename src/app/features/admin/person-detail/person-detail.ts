import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { PersonDetail } from '../../../core/admin/models';
import { resolveAdminBase } from '../../../core/admin/route-base';
import { LeadsService } from '../../../core/leads/leads.service';
import { LEAD_CATEGORY_BADGE_CLASSES, LEAD_CATEGORY_LABELS, LEAD_STATUS_BADGE_CLASSES, LEAD_STATUS_LABELS, LeadCategory, LeadSummary } from '../../../core/leads/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import {
  COMPLETE_STATUS_QUERY_VALUE,
  INCOMPLETE_STATUS_QUERY_VALUE,
  PagedResult,
  TICKET_STATUS_BADGE_CLASSES,
  TICKET_STATUS_LABELS,
  TicketDto,
  TicketStatus,
  priorityBadgeClasses,
} from '../../../core/tickets/models';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Modal } from '../../../shared/ui/modal/modal';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';
import { StaffFormModal } from '../staff-form-modal/staff-form-modal';
import { StaffRole } from '../../../core/admin/admin.service';
import { Toggle } from '../../../shared/ui/toggle/toggle';

type PersonRole = 'Party' | 'Developer' | 'SalesPerson' | 'Implementator';

const PAGE_SIZE = 10;
const POLL_MS = 10_000;
const STATUS_FILTERS: (TicketStatus | '')[] = ['', 'New', 'Assigned', 'InProgress', 'Resolved', 'Rejected', 'Closed', 'Revoked', 'Sale'];

/** Developer drill-down's "Incomplete/Complete/All" tri-state — see core/tickets/models.ts's own doc comment on the underlying status sets. */
const DEVELOPER_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: INCOMPLETE_STATUS_QUERY_VALUE, label: 'Incomplete' },
  { value: COMPLETE_STATUS_QUERY_VALUE, label: 'Complete' },
  { value: '', label: 'All' },
];

/** Sales Person drill-down's category filter. */
const LEAD_CATEGORY_FILTERS: (LeadCategory | '')[] = ['', 'APlus', 'Warm', 'Cool'];

/** Local calendar date as YYYY-MM-DD — see calls.ts's own copy of this helper. */
function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Admin's profile view of one Party or Developer — which one is set by the route (`data.personRole`). */
@Component({
  selector: 'app-person-detail',
  imports: [DatePipe, FormsModule, RouterLink, Pagination, ConfirmDialog, Modal, PasswordInput, StaffFormModal, Toggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notFound()) {
      <div class="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p class="text-sm text-slate-500">{{ notFound() }}</p>
        <a [routerLink]="backLink" class="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back</a>
      </div>
    } @else if (person(); as p) {
      <a [routerLink]="backLink" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back</a>

      <div class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-semibold text-slate-900">{{ p.displayName }}</h1>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'">
              {{ p.isActive ? 'Active' : 'Inactive' }}
            </span>
          </div>
          <p class="mt-1 text-sm text-slate-500">{{ p.email }} · {{ p.role }}</p>
        </div>

        <div class="flex flex-wrap gap-2">
          @if (isAdmin) {
            <button
              type="button"
              (click)="showImpersonateConfirm.set(true)"
              class="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
            >
              Log in as this account
            </button>
          }
          @if (isStaff) {
            <button
              type="button"
              (click)="showEditModal.set(true)"
              class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              type="button"
              (click)="newPassword.set(''); showPasswordModal.set(true)"
              class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset password
            </button>
          }
          <button
            type="button"
            (click)="showToggleActiveConfirm.set(true)"
            class="rounded-md border px-3 py-1.5 text-sm font-medium"
            [class]="p.isActive ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-green-300 text-green-600 hover:bg-green-50'"
          >
            {{ p.isActive ? 'Deactivate' : 'Activate' }}
          </button>
        </div>
      </div>

      @if (actionError()) {
        <p class="mt-3 text-sm text-red-600" role="alert">{{ actionError() }}</p>
      }

      <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2" [class.lg:grid-cols-4]="hasTicketRelationship">
        @if (hasTicketRelationship) {
          <div class="rounded-lg border border-slate-200 bg-white p-4">
            <p class="text-xs font-medium text-slate-500">{{ role === 'Party' ? 'Complaints raised' : 'Tickets assigned' }}</p>
            <p class="mt-1 text-2xl font-semibold text-slate-900">{{ p.totalTicketCount }}</p>
          </div>
          <div class="rounded-lg border border-slate-200 bg-white p-4">
            <p class="text-xs font-medium text-slate-500">Currently open</p>
            <p class="mt-1 text-2xl font-semibold text-slate-900">{{ p.openTicketCount }}</p>
          </div>
        }
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium text-slate-500">Joined</p>
          <p class="mt-1 text-sm font-medium text-slate-700">{{ p.createdAtUtc | date: 'mediumDate' }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium text-slate-500">Last login</p>
          <p class="mt-1 text-sm font-medium text-slate-700">{{ p.lastLoginAtUtc ? (p.lastLoginAtUtc | date: 'medium') : 'Never' }}</p>
        </div>
      </div>

      @if (role === 'Party') {
        <div class="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 class="text-sm font-semibold text-slate-900">Party details</h2>
          <dl class="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div>
              <dt class="text-slate-500">Location</dt>
              <dd class="font-medium text-slate-700">{{ p.location ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-slate-500">Branch</dt>
              <dd class="font-medium text-slate-700">{{ p.branch ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-slate-500">Owner phone</dt>
              <dd class="font-medium text-slate-700">{{ p.phoneNumber ?? '—' }}</dd>
            </div>
          </dl>

          <div class="mt-4 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div>
              <p class="text-sm font-medium text-slate-700">Allow this party to add complaints themselves</p>
              <p class="text-xs text-slate-500">Turn off if complaints should only ever be filed on their behalf.</p>
            </div>
            <app-toggle [ngModel]="p.canSelfFileComplaints" (ngModelChange)="toggleSelfFileComplaints(p, $event)" />
          </div>
        </div>
      }

      @if (isStaff && p.employeeProfile; as ep) {
        <div class="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 class="text-sm font-semibold text-slate-900">Employee profile</h2>

          @if (!ep.idCardComplete) {
            <p class="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ID card incomplete — missing{{ missingIdCardParts(ep) }}.
            </p>
          }

          <dl class="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-4">
            <div>
              <dt class="text-slate-500">Branch</dt>
              <dd class="font-medium text-slate-700">{{ p.branch ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-slate-500">Gender</dt>
              <dd class="font-medium text-slate-700">{{ ep.gender === 'Unspecified' ? '—' : ep.gender }}</dd>
            </div>
            @if (role === 'Developer') {
              <div>
                <dt class="text-slate-500">Developer type</dt>
                <dd class="font-medium text-slate-700">{{ ep.developerTypeName ?? '—' }}</dd>
              </div>
            }
            <div>
              <dt class="text-slate-500">Rank</dt>
              <dd class="font-medium text-slate-700">{{ ep.rankName ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-slate-500">ID card number</dt>
              <dd class="font-medium text-slate-700">{{ ep.idCardNumber ?? '—' }}</dd>
            </div>
          </dl>

          <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            @for (side of idCardSides; track side) {
              <div class="rounded-md border border-slate-200 p-3">
                <p class="text-xs font-medium text-slate-500">ID card — {{ side }}</p>
                @if (side === 'front' ? ep.hasIdCardFront : ep.hasIdCardBack) {
                  <a [href]="idCardUrl(side)" target="_blank" rel="noopener" class="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">View / download</a>
                } @else {
                  <p class="mt-2 text-sm text-amber-700">Not uploaded yet</p>
                }
                <div class="mt-2 flex items-center gap-2">
                  <input type="file" accept="image/*,application/pdf" (change)="uploadIdCard(side, $event)" class="text-xs" />
                  @if (side === 'front' ? ep.hasIdCardFront : ep.hasIdCardBack) {
                    <button type="button" (click)="removeIdCard(side)" class="text-xs font-medium text-red-600 hover:text-red-500">Remove</button>
                  }
                </div>
              </div>
            }
          </div>
          @if (idCardError()) {
            <p class="mt-2 text-sm text-red-600" role="alert">{{ idCardError() }}</p>
          }
        </div>
      }

      @if (hasTicketRelationship) {
      <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <h2 class="text-sm font-semibold text-slate-900">
            {{ role === 'Party' ? 'Complaints raised' : 'Tickets assigned' }} ({{ ticketsResult().totalCount }})
          </h2>
          <div class="flex flex-wrap items-center gap-2">
            @if (role === 'Developer') {
              <select
                [(ngModel)]="statusFilter"
                (ngModelChange)="onFilterChange()"
                class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                @for (option of developerStatusOptions; track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
              <div class="flex items-center gap-1.5">
                <label class="text-xs text-slate-500">From</label>
                <input
                  type="date"
                  [(ngModel)]="dateFrom"
                  (ngModelChange)="onFilterChange()"
                  class="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <label class="text-xs text-slate-500">To</label>
                <input
                  type="date"
                  [(ngModel)]="dateTo"
                  (ngModelChange)="onFilterChange()"
                  class="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            } @else {
              <select
                [(ngModel)]="statusFilter"
                (ngModelChange)="onFilterChange()"
                class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                @for (status of statusOptions; track status) {
                  <option [value]="status">{{ status === '' ? 'All statuses' : statusLabels[status] }}</option>
                }
              </select>
            }
            <input
              type="search"
              placeholder="Search title/description…"
              [(ngModel)]="search"
              (ngModelChange)="onFilterChange()"
              class="rounded-md border border-slate-300 py-1.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            @if (role === 'Developer') {
              <button
                type="button"
                (click)="generateReport()"
                [disabled]="generatingReport()"
                class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {{ generatingReport() ? 'Preparing…' : 'Generate Report' }}
              </button>
            }
          </div>
        </div>

        @if (ticketsLoading()) {
          <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-4 py-2.5">Ticket</th>
                  <th class="px-4 py-2.5">Title</th>
                  <th class="px-4 py-2.5">Status</th>
                  <th class="px-4 py-2.5">Priority</th>
                  <th class="px-4 py-2.5">{{ role === 'Party' ? 'Developer' : 'Party' }}</th>
                  <th class="px-4 py-2.5">Submitted</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (ticket of ticketsResult().items; track ticket.id) {
                  <tr class="cursor-pointer hover:bg-slate-50" [routerLink]="[base, 'tickets', ticket.id]">
                    <td class="px-4 py-2.5 font-mono text-xs text-slate-500">{{ ticket.ticketNumber }}</td>
                    <td class="px-4 py-2.5 font-medium text-slate-900">{{ ticket.title }}</td>
                    <td class="px-4 py-2.5">
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusClasses[ticket.status]">
                        {{ statusLabels[ticket.status] }}
                      </span>
                    </td>
                    <td class="px-4 py-2.5">
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="priorityClasses(ticket.priorityName)">
                        {{ ticket.priorityName }}
                      </span>
                    </td>
                    <td class="px-4 py-2.5 text-slate-600">
                      {{ role === 'Party' ? (ticket.assignedDeveloperDisplayName ?? '—') : ticket.createdByDisplayName }}
                    </td>
                    <td class="px-4 py-2.5 text-slate-600">{{ ticket.createdAtUtc | date: 'mediumDate' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-slate-500">No tickets match this filter.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <app-pagination
            [page]="ticketsPage()"
            [totalPages]="ticketsTotalPages()"
            [totalItems]="ticketsResult().totalCount"
            [pageSize]="pageSizeValue"
            (pageChange)="goToPage($event)"
          />
        }
      </div>
      }

      @if (role === 'SalesPerson') {
      <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <h2 class="text-sm font-semibold text-slate-900">Leads / deals ({{ leadsResult().totalCount }})</h2>
          <div class="flex flex-wrap items-center gap-2">
            <select
              [(ngModel)]="leadCategoryFilter"
              (ngModelChange)="onFilterChange()"
              class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              @for (category of leadCategoryOptions; track category) {
                <option [value]="category">{{ category === '' ? 'All categories' : categoryLabels[category] }}</option>
              }
            </select>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-500">From</label>
              <input
                type="date"
                [(ngModel)]="dateFrom"
                (ngModelChange)="onFilterChange()"
                class="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <label class="text-xs text-slate-500">To</label>
              <input
                type="date"
                [(ngModel)]="dateTo"
                (ngModelChange)="onFilterChange()"
                class="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <input
              type="search"
              placeholder="Search name/business…"
              [(ngModel)]="search"
              (ngModelChange)="onFilterChange()"
              class="rounded-md border border-slate-300 py-1.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              (click)="generateLeadsReport()"
              [disabled]="generatingReport()"
              class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {{ generatingReport() ? 'Preparing…' : 'Generate Report' }}
            </button>
          </div>
        </div>

        @if (leadsLoading()) {
          <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-4 py-2.5">Name</th>
                  <th class="px-4 py-2.5">Business</th>
                  <th class="px-4 py-2.5">Category</th>
                  <th class="px-4 py-2.5">Status</th>
                  <th class="px-4 py-2.5">Follow-ups</th>
                  <th class="px-4 py-2.5">Created</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (lead of leadsResult().items; track lead.id) {
                  <tr class="cursor-pointer hover:bg-slate-50" [routerLink]="[base, 'leads', lead.id]">
                    <td class="px-4 py-2.5 font-medium text-slate-900">{{ lead.name }}</td>
                    <td class="px-4 py-2.5 text-slate-600">{{ lead.businessName ?? '—' }}</td>
                    <td class="px-4 py-2.5">
                      @if (lead.currentCategory; as category) {
                        <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="categoryClasses[category]">{{ categoryLabels[category] }}</span>
                      } @else {
                        <span class="text-xs text-slate-400">Not yet followed up</span>
                      }
                    </td>
                    <td class="px-4 py-2.5">
                      @if (lead.currentStatus; as status) {
                        <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="leadStatusClasses[status]">{{ leadStatusLabels[status] }}</span>
                      } @else {
                        <span class="text-xs text-slate-400">—</span>
                      }
                    </td>
                    <td class="px-4 py-2.5 text-slate-600">{{ lead.followUpCount }}</td>
                    <td class="px-4 py-2.5 text-slate-600">{{ lead.createdAtUtc | date: 'mediumDate' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-slate-500">No leads match this filter.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <app-pagination
            [page]="leadsPage()"
            [totalPages]="leadsTotalPages()"
            [totalItems]="leadsResult().totalCount"
            [pageSize]="pageSizeValue"
            (pageChange)="goToLeadsPage($event)"
          />
        }
      </div>

      <!-- Print target for Generate Report — hidden until generateLeadsReport() stamps data-paper-size. -->
      <div id="person-leads-report-print-area" class="report-print-area">
        <h1 class="text-base font-semibold">{{ p.displayName }} — Leads Report</h1>
        <p class="text-xs text-slate-500">{{ dateFrom || 'All time' }} – {{ dateTo || 'present' }}</p>
        <table class="mt-3 w-full table-fixed border-collapse text-left text-[9px] leading-tight">
          <colgroup>
            <col style="width: 20%" /><col style="width: 20%" /><col style="width: 15%" /><col style="width: 15%" /><col style="width: 15%" /><col style="width: 15%" />
          </colgroup>
          <thead>
            <tr class="bg-slate-100">
              <th class="break-words border-b border-r border-slate-400 py-1 px-1">Name</th>
              <th class="break-words border-b border-r border-slate-400 py-1 px-1">Business</th>
              <th class="break-words border-b border-r border-slate-400 py-1 px-1">Category</th>
              <th class="break-words border-b border-r border-slate-400 py-1 px-1">Status</th>
              <th class="break-words border-b border-r border-slate-400 py-1 px-1">Follow-ups</th>
              <th class="break-words border-b border-slate-400 py-1 px-1">Created</th>
            </tr>
          </thead>
          <tbody>
            @for (lead of printLeads(); track lead.id) {
              <tr>
                <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ lead.name }}</td>
                <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ lead.businessName ?? '—' }}</td>
                <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ lead.currentCategory ? categoryLabels[lead.currentCategory] : '—' }}</td>
                <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ lead.currentStatus ? leadStatusLabels[lead.currentStatus] : '—' }}</td>
                <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ lead.followUpCount }}</td>
                <td class="break-words border-b border-slate-200 py-1 px-1">{{ lead.createdAtUtc | date: 'mediumDate' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="p-4 text-center">No leads match this filter.</td></tr>
            }
          </tbody>
        </table>
      </div>
      }

      @if (role === 'Developer') {
        <!-- Print target for Generate Report — hidden until generateReport() stamps data-paper-size (see styles.css's .report-print-area). -->
        <div id="person-tickets-report-print-area" class="report-print-area">
          <h1 class="text-base font-semibold">{{ p.displayName }} — Tickets Report</h1>
          <p class="text-xs text-slate-500">{{ dateFrom || 'All time' }} – {{ dateTo || 'present' }} · {{ reportStatusLabel() }}</p>
          <table class="mt-3 w-full table-fixed border-collapse text-left text-[9px] leading-tight">
            <colgroup>
              <col style="width: 12%" /><col style="width: 30%" /><col style="width: 22%" /><col style="width: 12%" /><col style="width: 12%" /><col style="width: 12%" />
            </colgroup>
            <thead>
              <tr class="bg-slate-100">
                <th class="break-words border-b border-r border-slate-400 py-1 px-1">Ticket</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1">Title</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1">Party</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1">Status</th>
                <th class="break-words border-b border-r border-slate-400 py-1 px-1">Priority</th>
                <th class="break-words border-b border-slate-400 py-1 px-1">Submitted</th>
              </tr>
            </thead>
            <tbody>
              @for (ticket of printTickets(); track ticket.id) {
                <tr>
                  <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ ticket.ticketNumber }}</td>
                  <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ ticket.title }}</td>
                  <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ ticket.createdByDisplayName }}</td>
                  <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ statusLabels[ticket.status] }}</td>
                  <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ ticket.priorityName }}</td>
                  <td class="break-words border-b border-slate-200 py-1 px-1">{{ ticket.createdAtUtc | date: 'mediumDate' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="p-4 text-center">No tickets match this filter.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      <app-confirm-dialog
        [open]="showToggleActiveConfirm()"
        [title]="p.isActive ? 'Deactivate this account?' : 'Activate this account?'"
        [message]="p.isActive ? 'They will be signed out of every device immediately and unable to log back in until reactivated.' : 'They will be able to sign in again.'"
        [confirmLabel]="p.isActive ? 'Deactivate' : 'Activate'"
        [destructive]="p.isActive"
        [busy]="actionPending()"
        (confirm)="toggleActive(p)"
        (cancel)="showToggleActiveConfirm.set(false)"
      />
      <app-confirm-dialog
        [open]="showImpersonateConfirm()"
        title="Log in as this account?"
        message="You'll be signed in as them in this browser — invisibly to them, it won't show up in their own Sessions list. You'll need to log back in as Admin afterwards to return."
        confirmLabel="Log in as them"
        [busy]="actionPending()"
        (confirm)="impersonate()"
        (cancel)="showImpersonateConfirm.set(false)"
      />

      @if (isStaff) {
        <app-staff-form-modal
          [role]="staffRole"
          mode="edit"
          [personId]="personId"
          [open]="showEditModal()"
          (closed)="showEditModal.set(false)"
          (saved)="onStaffSaved()"
        />

        <app-modal [open]="showPasswordModal()" (close)="showPasswordModal.set(false)">
          <h2 class="text-base font-semibold text-slate-900">Reset password</h2>
          <p class="mt-1 text-sm text-slate-500">Sets a new password immediately and signs {{ p.displayName }} out of every device.</p>
          <div class="mt-4">
            <label for="pd-newpass" class="block text-sm font-medium text-slate-700">New password</label>
            <app-password-input inputId="pd-newpass" autocomplete="new-password" [ngModel]="newPassword()" (ngModelChange)="newPassword.set($event)" />
          </div>
          @if (idCardError()) {
            <p class="mt-2 text-sm text-red-600" role="alert">{{ idCardError() }}</p>
          }
          <div class="mt-5 flex justify-end gap-3">
            <button type="button" (click)="showPasswordModal.set(false)" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button
              type="button"
              (click)="submitPasswordReset()"
              [disabled]="newPassword().length < 8 || actionPending()"
              class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {{ actionPending() ? 'Saving…' : 'Set password' }}
            </button>
          </div>
        </app-modal>
      }
    } @else {
      <p class="text-sm text-slate-500" role="status">Loading…</p>
    }
  `,
})
export class PersonDetailPage implements OnInit {
  protected readonly statusLabels = TICKET_STATUS_LABELS;
  protected readonly statusClasses = TICKET_STATUS_BADGE_CLASSES;
  protected readonly priorityClasses = priorityBadgeClasses;
  protected readonly statusOptions = STATUS_FILTERS;
  protected readonly developerStatusOptions = DEVELOPER_STATUS_FILTERS;
  protected readonly leadCategoryOptions = LEAD_CATEGORY_FILTERS;
  protected readonly categoryLabels = LEAD_CATEGORY_LABELS;
  protected readonly categoryClasses = LEAD_CATEGORY_BADGE_CLASSES;
  protected readonly leadStatusLabels = LEAD_STATUS_LABELS;
  protected readonly leadStatusClasses = LEAD_STATUS_BADGE_CLASSES;
  protected readonly pageSizeValue = PAGE_SIZE;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly adminService = inject(AdminService);
  private readonly ticketsService = inject(TicketsService);
  private readonly leadsService = inject(LeadsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly role: PersonRole = this.route.snapshot.data['personRole'];
  /** `/app/admin` or `/app/implementator` — this page is reached from both shells. */
  protected readonly base = resolveAdminBase(this.route);
  protected readonly isAdmin = this.base === '/app/admin';
  protected readonly backLink = `${this.base}/${
    {
      Party: 'parties',
      Developer: 'developers',
      SalesPerson: 'sales-people',
      Implementator: 'implementators',
    }[this.role]
  }`;
  protected readonly personId = this.route.snapshot.paramMap.get('id')!;

  /** SalesPerson and Implementator have no ticket relationship yet — see AdminService.GetSalesPeopleAsync's own comment (Implementator: RoleNames.Implementator's doc comment, account management only for now). */
  protected readonly hasTicketRelationship = this.role !== 'SalesPerson' && this.role !== 'Implementator';

  protected readonly isStaff = this.role !== 'Party';
  protected readonly staffRole = this.role as StaffRole;
  protected readonly idCardSides: ('front' | 'back')[] = ['front', 'back'];

  protected readonly person = signal<PersonDetail | null>(null);
  protected readonly notFound = signal<string | null>(null);
  protected readonly actionPending = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly showToggleActiveConfirm = signal(false);
  protected readonly showImpersonateConfirm = signal(false);
  protected readonly showEditModal = signal(false);
  protected readonly showPasswordModal = signal(false);
  protected readonly newPassword = signal('');
  protected readonly idCardError = signal<string | null>(null);

  protected search = '';
  /** A single TicketStatus for Party (existing behavior), or a comma-joined Incomplete/Complete status set for Developer — see DEVELOPER_STATUS_FILTERS. */
  protected statusFilter: string = '';
  /** Developer only — defaults to the last 30 days in ngOnInit; Party's view has no date filter. */
  protected dateFrom = '';
  protected dateTo = '';
  protected readonly ticketsPage = signal(1);
  protected readonly ticketsLoading = signal(true);
  protected readonly ticketsResult = signal<PagedResult<TicketDto>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly ticketsTotalPages = signal(1);

  protected readonly generatingReport = signal(false);
  protected readonly printTickets = signal<TicketDto[]>([]);
  protected readonly printLeads = signal<LeadSummary[]>([]);

  /** Sales Person only. */
  protected leadCategoryFilter: LeadCategory | '' = '';
  protected readonly leadsPage = signal(1);
  protected readonly leadsLoading = signal(true);
  protected readonly leadsResult = signal<PagedResult<LeadSummary>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly leadsTotalPages = signal(1);

  private readonly ticketsRefresh = new Subject<void>();
  private readonly leadsRefresh = new Subject<void>();

  ngOnInit(): void {
    this.loadPerson();

    if (this.role === 'SalesPerson') {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      this.dateFrom = isoDate(from);
      this.dateTo = isoDate(to);
      this.ticketsLoading.set(false);
      this.initLeads();
      return;
    }

    // No ticket relationship yet for this role — nothing to fetch.
    // Implementator: account management only for now.
    if (!this.hasTicketRelationship) {
      this.ticketsLoading.set(false);
      return;
    }

    // Developer drill-down defaults: Incomplete status, last 30 days — see
    // the Admin Dashboard's Developer detail spec. Party's view is
    // untouched (statusFilter stays '' / All, no date bound).
    if (this.role === 'Developer') {
      this.statusFilter = INCOMPLETE_STATUS_QUERY_VALUE;
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      this.dateFrom = isoDate(from);
      this.dateTo = isoDate(to);
    }

    merge(timer(0, POLL_MS), this.ticketsRefresh)
      .pipe(
        switchMap(() => {
          const filter = {
            page: this.ticketsPage(),
            pageSize: PAGE_SIZE,
            status: this.statusFilter || undefined,
            search: this.search || undefined,
            dateFrom: this.role === 'Developer' ? this.dateFrom || undefined : undefined,
            dateTo: this.role === 'Developer' ? this.dateTo || undefined : undefined,
            ...(this.role === 'Party' ? { createdByUserId: this.personId } : { assignedDeveloperId: this.personId }),
          };
          return this.ticketsService.getAdminTickets(filter).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) {
          this.ticketsResult.set(result);
          this.ticketsTotalPages.set(Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)));
        }
        this.ticketsLoading.set(false);
      });
  }

  private loadPerson(): void {
    const request$ =
      this.role === 'Party'
        ? this.adminService.getPartyDetail(this.personId)
        : this.role === 'Developer'
          ? this.adminService.getDeveloperDetail(this.personId)
          : this.role === 'SalesPerson'
            ? this.adminService.getSalesPersonDetail(this.personId)
            : this.adminService.getImplementatorDetail(this.personId);
    request$.subscribe({
      next: (person) => this.person.set(person),
      error: () => this.notFound.set(`This ${this.role.toLowerCase()} could not be found.`),
    });
  }

  // ---- Staff edit / password / ID card ----

  protected onStaffSaved(): void {
    this.showEditModal.set(false);
    this.loadPerson();
  }

  protected submitPasswordReset(): void {
    if (this.newPassword().length < 8 || this.actionPending()) return;
    this.actionPending.set(true);
    this.idCardError.set(null);
    this.adminService.setStaffPassword(this.personId, this.newPassword()).subscribe({
      next: () => {
        this.actionPending.set(false);
        this.showPasswordModal.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.idCardError.set(error.error?.error ?? 'Could not reset the password.');
      },
    });
  }

  protected idCardUrl(side: 'front' | 'back'): string {
    return this.adminService.idCardDownloadUrl(this.personId, side);
  }

  protected missingIdCardParts(ep: { idCardNumber: string | null; hasIdCardFront: boolean; hasIdCardBack: boolean }): string {
    const parts: string[] = [];
    if (!ep.idCardNumber) parts.push('number');
    if (!ep.hasIdCardFront) parts.push('front scan');
    if (!ep.hasIdCardBack) parts.push('back scan');
    return ' ' + parts.join(', ');
  }

  protected uploadIdCard(side: 'front' | 'back', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.idCardError.set(null);
    this.adminService.uploadIdCard(this.personId, side, file).subscribe({
      next: () => {
        input.value = '';
        this.loadPerson();
      },
      error: (error: HttpErrorResponse) => this.idCardError.set(error.error?.error ?? 'Could not upload that file.'),
    });
  }

  protected removeIdCard(side: 'front' | 'back'): void {
    this.idCardError.set(null);
    this.adminService.removeIdCard(this.personId, side).subscribe({
      next: () => this.loadPerson(),
      error: (error: HttpErrorResponse) => this.idCardError.set(error.error?.error ?? 'Could not remove that file.'),
    });
  }

  onFilterChange(): void {
    if (this.role === 'SalesPerson') {
      this.leadsPage.set(1);
      this.leadsRefresh.next();
      return;
    }
    this.ticketsPage.set(1);
    this.ticketsRefresh.next();
  }

  goToPage(page: number): void {
    this.ticketsPage.set(page);
    this.ticketsRefresh.next();
  }

  goToLeadsPage(page: number): void {
    this.leadsPage.set(page);
    this.leadsRefresh.next();
  }

  private initLeads(): void {
    merge(timer(0, POLL_MS), this.leadsRefresh)
      .pipe(
        switchMap(() =>
          this.leadsService
            .getLeads({
              page: this.leadsPage(),
              pageSize: PAGE_SIZE,
              category: this.leadCategoryFilter || undefined,
              search: this.search || undefined,
              dateFrom: this.dateFrom || undefined,
              dateTo: this.dateTo || undefined,
              salesPersonUserId: this.personId,
            })
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) {
          this.leadsResult.set(result);
          this.leadsTotalPages.set(Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)));
        }
        this.leadsLoading.set(false);
      });
  }

  /** Sales Person only — same "fetch everything for print" pattern as generateReport(). */
  protected generateLeadsReport(): void {
    if (this.generatingReport()) return;
    this.generatingReport.set(true);

    this.leadsService
      .getLeads({
        page: 1,
        pageSize: 1000,
        category: this.leadCategoryFilter || undefined,
        search: this.search || undefined,
        dateFrom: this.dateFrom || undefined,
        dateTo: this.dateTo || undefined,
        salesPersonUserId: this.personId,
      })
      .subscribe({
        next: (result) => {
          this.printLeads.set(result.items);
          this.generatingReport.set(false);
          const printArea = document.getElementById('person-leads-report-print-area');
          if (printArea) printArea.dataset['paperSize'] = 'A4';
          setTimeout(() => window.print(), 0);
        },
        error: () => {
          this.generatingReport.set(false);
        },
      });
  }

  protected toggleSelfFileComplaints(person: PersonDetail, canSelfFileComplaints: boolean): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.adminService.setPartyComplaintPermission(person.id, canSelfFileComplaints).subscribe({
      next: () => {
        this.actionPending.set(false);
        this.loadPerson();
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.actionError.set(error.error?.error ?? 'Could not update this setting.');
      },
    });
  }

  toggleActive(person: PersonDetail): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.adminService.setUserActive(person.id, !person.isActive).subscribe({
      next: () => {
        this.actionPending.set(false);
        this.showToggleActiveConfirm.set(false);
        this.loadPerson();
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.showToggleActiveConfirm.set(false);
        this.actionError.set(error.error?.error ?? 'Could not update this account.');
      },
    });
  }

  impersonate(): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.adminService.impersonateUser(this.personId).subscribe({
      next: () => {
        // Our own session cookies were just replaced with the target's —
        // a hard navigation re-resolves the app's identity from scratch.
        window.location.href = '/app';
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.showImpersonateConfirm.set(false);
        this.actionError.set(error.error?.error ?? 'Could not log in as this party.');
      },
    });
  }

  protected reportStatusLabel(): string {
    const option = this.developerStatusOptions.find((o) => o.value === this.statusFilter);
    return option ? option.label : 'All statuses';
  }

  /** Developer only. Fetches every matching ticket (not just the current page) then prints — same "fetch everything for print, separately from the paginated on-screen view" pattern as ReportsModal. */
  protected generateReport(): void {
    if (this.generatingReport()) return;
    this.generatingReport.set(true);

    this.ticketsService
      .getAdminTickets({
        page: 1,
        pageSize: 1000,
        status: this.statusFilter || undefined,
        search: this.search || undefined,
        dateFrom: this.dateFrom || undefined,
        dateTo: this.dateTo || undefined,
        assignedDeveloperId: this.personId,
      })
      .subscribe({
        next: (result) => {
          this.printTickets.set(result.items);
          this.generatingReport.set(false);
          const printArea = document.getElementById('person-tickets-report-print-area');
          if (printArea) printArea.dataset['paperSize'] = 'A4';
          // Deferred — the print-area content just changed via the signal
          // write above; this app is zoneless, so give that render a tick
          // to flush before window.print() captures the page.
          setTimeout(() => window.print(), 0);
        },
        error: () => {
          this.generatingReport.set(false);
        },
      });
  }
}
