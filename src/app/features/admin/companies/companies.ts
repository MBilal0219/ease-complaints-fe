import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { BranchOption } from '../../../core/admin/models';
import { CompanyFormModal } from '../company-form-modal/company-form-modal';

const POLL_MS = 15_000;

interface CompanyGroup {
  companyId: string;
  companyName: string;
  isInternal: boolean;
  branches: BranchOption[];
}

/**
 * Standalone Company/Branch management — pre-create org structure ahead of
 * assigning anyone to it, so a Party can later be attached to an existing,
 * still-unowned Branch (rather than always minting a brand-new one) and
 * Developer/Sales Person creation has more than the one default internal
 * Branch to pick from. See docs/modules/company-management.md.
 */
@Component({
  selector: 'app-companies',
  imports: [FormsModule, CompanyFormModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Companies</h1>
        <p class="mt-1 text-sm text-slate-500">
          Pre-create the org structure — companies and their branches — that Party/Developer/Sales Person accounts get attached to.
        </p>
      </div>
      <button
        type="button"
        (click)="showAddCompanyModal.set(true)"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        + Add Company
      </button>
    </div>

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else {
      <div class="mt-6 space-y-4">
        @for (company of companies(); track company.companyId) {
          <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold text-slate-900">{{ company.companyName }}</h2>
                @if (company.isInternal) {
                  <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Internal</span>
                }
                <span class="text-xs text-slate-400">{{ company.branches.length }} branch{{ company.branches.length === 1 ? '' : 'es' }}</span>
              </div>
              <button
                type="button"
                (click)="toggleAddBranch(company.companyId)"
                class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                + Add Branch
              </button>
            </div>

            @if (addingBranchFor() === company.companyId) {
              <div class="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 p-4">
                <input
                  type="text"
                  placeholder="Branch name"
                  [(ngModel)]="newBranchName"
                  class="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  (click)="submitAddBranch(company.companyId)"
                  [disabled]="!newBranchName.trim() || addingBranchBusy()"
                  class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {{ addingBranchBusy() ? 'Saving…' : 'Save' }}
                </button>
                <button type="button" (click)="cancelAddBranch()" class="text-sm font-medium text-slate-500 hover:text-slate-700">Cancel</button>
                @if (addBranchError()) {
                  <p class="w-full text-sm text-red-600" role="alert">{{ addBranchError() }}</p>
                }
              </div>
            }

            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th class="px-4 py-2">Branch</th>
                    <th class="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (branch of company.branches; track branch.branchId) {
                    <tr>
                      <td class="px-4 py-2 font-medium text-slate-900">{{ branch.branchName }}</td>
                      <td class="px-4 py-2">
                        @if (company.isInternal) {
                          <span class="text-slate-400">—</span>
                        } @else if (branch.ownerUserId) {
                          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Owned</span>
                        } @else {
                          <span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Available</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        } @empty {
          <p class="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No companies yet.</p>
        }
      </div>
    }

    <app-company-form-modal [open]="showAddCompanyModal()" (closed)="showAddCompanyModal.set(false)" (created)="onCompanyCreated()" />
  `,
})
export class CompaniesPage implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly showAddCompanyModal = signal(false);
  protected readonly addingBranchFor = signal<string | null>(null);
  protected readonly addingBranchBusy = signal(false);
  protected readonly addBranchError = signal<string | null>(null);
  protected newBranchName = '';

  private readonly branches = signal<BranchOption[]>([]);
  private readonly manualRefresh = new Subject<void>();

  protected readonly companies = computed<CompanyGroup[]>(() => {
    const groups = new Map<string, CompanyGroup>();
    for (const branch of this.branches()) {
      let group = groups.get(branch.companyId);
      if (!group) {
        group = { companyId: branch.companyId, companyName: branch.companyName, isInternal: branch.isInternal, branches: [] };
        groups.set(branch.companyId, group);
      }
      group.branches.push(branch);
    }
    return [...groups.values()].sort((a, b) => Number(b.isInternal) - Number(a.isInternal) || a.companyName.localeCompare(b.companyName));
  });

  ngOnInit(): void {
    merge(timer(0, POLL_MS), this.manualRefresh)
      .pipe(
        switchMap(() => this.adminService.getAssignableBranches().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) {
          this.branches.set(result);
        }
        this.loading.set(false);
      });
  }

  onCompanyCreated(): void {
    this.showAddCompanyModal.set(false);
    this.manualRefresh.next();
  }

  toggleAddBranch(companyId: string): void {
    this.addBranchError.set(null);
    this.newBranchName = '';
    this.addingBranchFor.set(this.addingBranchFor() === companyId ? null : companyId);
  }

  cancelAddBranch(): void {
    this.addingBranchFor.set(null);
    this.addBranchError.set(null);
  }

  submitAddBranch(companyId: string): void {
    const branchName = this.newBranchName.trim();
    if (!branchName || this.addingBranchBusy()) return;

    this.addingBranchBusy.set(true);
    this.addBranchError.set(null);
    this.adminService.addBranch(companyId, { branchName }).subscribe({
      next: () => {
        this.addingBranchBusy.set(false);
        this.addingBranchFor.set(null);
        this.manualRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.addingBranchBusy.set(false);
        this.addBranchError.set(error.error?.error ?? 'Could not add this branch.');
      },
    });
  }
}
