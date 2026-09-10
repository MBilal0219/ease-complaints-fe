import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { CompanyListItem } from '../../../core/admin/models';
import { resolveAdminBase } from '../../../core/admin/route-base';

const POLL_MS = 15_000;

/**
 * Standalone Company/Branch management — the list view. Create is now its own
 * screen ({base}/companies/new), and each row opens the company detail screen
 * where branches and users are managed. Reached from both the Admin and the
 * Implementator shell. See docs/modules/company-management.md.
 */
@Component({
  selector: 'app-companies',
  imports: [DatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Companies</h1>
        <p class="mt-1 text-sm text-slate-500">
          The org structure — companies and their branches — that Party accounts are attached to.
        </p>
      </div>
      <a
        [routerLink]="[base, 'companies', 'new']"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        + Add Company
      </a>
    </div>

    <div class="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div class="grow">
        <label for="co-search" class="block text-xs font-medium text-slate-500">Search</label>
        <input
          id="co-search"
          type="search"
          placeholder="Company name…"
          [(ngModel)]="search"
          (ngModelChange)="onFilterChange()"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label for="co-from" class="block text-xs font-medium text-slate-500">Created from</label>
        <input
          id="co-from"
          type="date"
          [(ngModel)]="dateFrom"
          (ngModelChange)="onFilterChange()"
          class="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label for="co-to" class="block text-xs font-medium text-slate-500">Created to</label>
        <input
          id="co-to"
          type="date"
          [(ngModel)]="dateTo"
          (ngModelChange)="onFilterChange()"
          class="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <button
        type="button"
        (click)="generateReport()"
        [disabled]="generatingReport()"
        class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {{ generatingReport() ? 'Preparing…' : 'Generate Report' }}
      </button>
    </div>

    <div class="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      @if (loading()) {
        <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Company</th>
                <th class="px-4 py-2.5">Branches</th>
                <th class="px-4 py-2.5">Users</th>
                <th class="px-4 py-2.5">Created</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (company of companies(); track company.id) {
                <tr class="cursor-pointer hover:bg-slate-50" [routerLink]="[base, 'companies', company.id]">
                  <td class="px-4 py-2.5 font-medium text-slate-900">
                    {{ company.name }}
                    @if (company.isInternal) {
                      <span class="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Internal</span>
                    }
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ company.branchCount }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ company.userCount }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ company.createdAtUtc | date: 'mediumDate' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="px-4 py-8 text-center text-slate-500">No companies match this filter.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Print target for Generate Report — hidden until generateReport() stamps data-paper-size (see styles.css's .report-print-area). -->
    <div id="companies-report-print-area" class="report-print-area">
      <h1 class="text-base font-semibold">Companies Report</h1>
      <p class="text-xs text-slate-500">
        {{ dateFrom || 'All time' }} – {{ dateTo || 'present' }}{{ search ? ' · “' + search + '”' : '' }}
      </p>
      <table class="mt-3 w-full table-fixed border-collapse text-left text-[9px] leading-tight">
        <colgroup>
          <col style="width: 46%" /><col style="width: 18%" /><col style="width: 18%" /><col style="width: 18%" />
        </colgroup>
        <thead>
          <tr class="bg-slate-100">
            <th class="break-words border-b border-r border-slate-400 py-1 px-1">Company</th>
            <th class="break-words border-b border-r border-slate-400 py-1 px-1">Branches</th>
            <th class="break-words border-b border-r border-slate-400 py-1 px-1">Users</th>
            <th class="break-words border-b border-slate-400 py-1 px-1">Created</th>
          </tr>
        </thead>
        <tbody>
          @for (company of printCompanies(); track company.id) {
            <tr>
              <td class="break-words border-b border-r border-slate-200 py-1 px-1">
                {{ company.name }}{{ company.isInternal ? ' (Internal)' : '' }}
              </td>
              <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ company.branchCount }}</td>
              <td class="break-words border-b border-r border-slate-200 py-1 px-1">{{ company.userCount }}</td>
              <td class="break-words border-b border-slate-200 py-1 px-1">{{ company.createdAtUtc | date: 'mediumDate' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="p-4 text-center">No companies match this filter.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class CompaniesPage implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  /** `/app/admin` or `/app/implementator` — this page is shared by both shells. */
  protected readonly base = resolveAdminBase(inject(ActivatedRoute));

  protected readonly loading = signal(true);
  protected readonly generatingReport = signal(false);
  protected readonly companies = signal<CompanyListItem[]>([]);
  protected readonly printCompanies = signal<CompanyListItem[]>([]);

  protected search = '';
  protected dateFrom = '';
  protected dateTo = '';

  private readonly filter = signal({ search: '', dateFrom: '', dateTo: '' });
  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    merge(timer(0, POLL_MS), this.manualRefresh)
      .pipe(
        switchMap(() => {
          const f = this.filter();
          return this.adminService
            .getCompanies(f.dateFrom || undefined, f.dateTo || undefined, f.search || undefined)
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) this.companies.set(result);
        this.loading.set(false);
      });
  }

  onFilterChange(): void {
    this.filter.set({ search: this.search.trim(), dateFrom: this.dateFrom, dateTo: this.dateTo });
    this.manualRefresh.next();
  }

  generateReport(): void {
    if (this.generatingReport()) return;
    this.generatingReport.set(true);
    this.adminService
      .getCompaniesForReport(this.dateFrom || undefined, this.dateTo || undefined, this.search.trim() || undefined)
      .subscribe({
        next: (rows) => {
          this.printCompanies.set(rows);
          this.generatingReport.set(false);
          const printArea = document.getElementById('companies-report-print-area');
          if (printArea) printArea.dataset['paperSize'] = 'A4';
          // Zoneless — give the signal write above a tick to render before print captures the page.
          setTimeout(() => window.print(), 0);
        },
        error: () => this.generatingReport.set(false),
      });
  }
}
