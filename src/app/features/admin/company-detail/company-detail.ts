import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminService } from '../../../core/admin/admin.service';
import { CompanyDetail } from '../../../core/admin/models';
import { resolveAdminBase } from '../../../core/admin/route-base';
import { CompanyUserForm } from './company-user-form';

const DEFAULT_BRANCH_NAME = 'Head Office';

/**
 * Company create + management screen — replaces the old popup. Two modes by
 * route: `{base}/companies/new` shows just the create form; after Save it
 * navigates to `{base}/companies/:id`, which adds the branch row + the
 * users / add-user split view. Shared by the Admin and Implementator shells.
 * See docs/modules/company-management.md.
 */
@Component({
  selector: 'app-company-detail',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, CompanyUserForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="[base, 'companies']" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">← Companies</a>

    @if (notFound()) {
      <p class="mt-4 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{{ notFound() }}</p>
    } @else if (mode() === 'create') {
      <h1 class="mt-2 text-lg font-semibold text-slate-900">New company</h1>
      <p class="mt-1 text-sm text-slate-500">Create the company and its first branch. You can add users once it's saved.</p>

      <form class="mt-6 max-w-lg space-y-4 rounded-lg border border-slate-200 bg-white p-4" [formGroup]="createForm" (ngSubmit)="create()" novalidate>
        <div>
          <label for="cd-name" class="block text-sm font-medium text-slate-700">Company name</label>
          <input id="cd-name" type="text" formControlName="companyName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="cd-branch" class="block text-sm font-medium text-slate-700">First branch</label>
          <input id="cd-branch" type="text" formControlName="branchName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>

        @if (createError()) {
          <p class="text-sm text-red-600" role="alert">{{ createError() }}</p>
        }

        <button
          type="submit"
          [disabled]="createForm.invalid || saving()"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {{ saving() ? 'Saving…' : 'Save' }}
        </button>
      </form>
    } @else if (company(); as c) {
      <div class="mt-2 flex items-center gap-2">
        <h1 class="text-lg font-semibold text-slate-900">{{ c.name }}</h1>
        @if (c.isInternal) {
          <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Internal</span>
        }
      </div>
      <p class="mt-1 text-sm text-slate-500">Created {{ c.createdAtUtc | date: 'mediumDate' }} · {{ c.branches.length }} branch{{ c.branches.length === 1 ? '' : 'es' }}</p>

      <!-- Branches + inline add-branch -->
      <div class="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-slate-900">Branches</h2>
          <button
            type="button"
            (click)="toggleAddBranch()"
            class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + Add Branch
          </button>
        </div>

        @if (addingBranch()) {
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Branch name"
              [formControl]="newBranchName"
              class="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              (click)="submitAddBranch()"
              [disabled]="!newBranchName.value.trim() || addBranchBusy()"
              class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {{ addBranchBusy() ? 'Saving…' : 'Save' }}
            </button>
            <button type="button" (click)="addingBranch.set(false)" class="text-sm font-medium text-slate-500 hover:text-slate-700">Cancel</button>
            @if (addBranchError()) {
              <p class="w-full text-sm text-red-600" role="alert">{{ addBranchError() }}</p>
            }
          </div>
        }

        <ul class="mt-3 divide-y divide-slate-100 text-sm">
          @for (branch of c.branches; track branch.id) {
            <li class="flex items-center justify-between py-2">
              <span class="font-medium text-slate-800">{{ branch.name }}</span>
              @if (c.isInternal) {
                <span class="text-xs text-slate-400">—</span>
              } @else if (branch.ownerUserId) {
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Owned</span>
              } @else {
                <span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Available</span>
              }
            </li>
          }
        </ul>
      </div>

      <!-- Split view: users (left) + add-user form (right) -->
      <div class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div class="lg:col-span-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div class="border-b border-slate-100 p-4">
            <h2 class="text-sm font-semibold text-slate-900">Users ({{ c.users.length }})</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-4 py-2">Name</th>
                  <th class="px-4 py-2">Email</th>
                  <th class="px-4 py-2">Role</th>
                  <th class="px-4 py-2">Branch</th>
                  <th class="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (user of c.users; track user.id) {
                  <tr>
                    <td class="px-4 py-2 font-medium text-slate-900">{{ user.displayName }}</td>
                    <td class="px-4 py-2 text-slate-600">{{ user.email }}</td>
                    <td class="px-4 py-2 text-slate-600">{{ user.role }}</td>
                    <td class="px-4 py-2 text-slate-600">{{ user.branchName }}</td>
                    <td class="px-4 py-2">
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="user.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'">
                        {{ user.isActive ? 'Active' : 'Inactive' }}
                      </span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="px-4 py-8 text-center text-slate-500">No users yet — add the first one on the right.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <app-company-user-form [companyId]="c.id" [branches]="c.branches" (added)="reload()" />
      </div>
    } @else {
      <p class="mt-4 text-sm text-slate-500" role="status">Loading…</p>
    }
  `,
})
export class CompanyDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);

  protected readonly base = resolveAdminBase(this.route);
  private readonly companyId = this.route.snapshot.paramMap.get('id');
  protected readonly mode = signal<'create' | 'detail'>(this.companyId ? 'detail' : 'create');

  protected readonly company = signal<CompanyDetail | null>(null);
  protected readonly notFound = signal<string | null>(null);

  protected readonly saving = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly createForm = this.fb.nonNullable.group({
    companyName: ['', [Validators.required]],
    branchName: [DEFAULT_BRANCH_NAME, [Validators.required]],
  });

  protected readonly addingBranch = signal(false);
  protected readonly addBranchBusy = signal(false);
  protected readonly addBranchError = signal<string | null>(null);
  protected readonly newBranchName = this.fb.nonNullable.control('');

  ngOnInit(): void {
    if (this.companyId) this.reload();
  }

  reload(): void {
    if (!this.companyId) return;
    this.adminService.getCompanyDetail(this.companyId).subscribe({
      next: (detail) => this.company.set(detail),
      error: () => this.notFound.set('This company could not be found.'),
    });
  }

  create(): void {
    if (this.createForm.invalid || this.saving()) return;
    this.saving.set(true);
    this.createError.set(null);
    const { companyName, branchName } = this.createForm.getRawValue();
    this.adminService.createCompany({ companyName, branchName: branchName.trim() || undefined }).subscribe({
      next: (branch) => {
        this.router.navigate([this.base, 'companies', branch.companyId]);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.createError.set(error.error?.error ?? 'Could not create this company.');
      },
    });
  }

  toggleAddBranch(): void {
    this.addBranchError.set(null);
    this.newBranchName.setValue('');
    this.addingBranch.update((v) => !v);
  }

  submitAddBranch(): void {
    const branchName = this.newBranchName.value.trim();
    if (!branchName || this.addBranchBusy() || !this.companyId) return;
    this.addBranchBusy.set(true);
    this.addBranchError.set(null);
    this.adminService.addBranch(this.companyId, { branchName }).subscribe({
      next: () => {
        this.addBranchBusy.set(false);
        this.addingBranch.set(false);
        this.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.addBranchBusy.set(false);
        this.addBranchError.set(error.error?.error ?? 'Could not add this branch.');
      },
    });
  }
}
