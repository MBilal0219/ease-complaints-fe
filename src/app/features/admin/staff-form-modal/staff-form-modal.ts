import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService, StaffRole } from '../../../core/admin/admin.service';
import { CreateStaffRequest, LookupValue, UpdateStaffRequest } from '../../../core/admin/models';
import { CompanyBranchSelect } from '../../../shared/ui/company-branch-select/company-branch-select';
import { Modal } from '../../../shared/ui/modal/modal';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';

const ROLE_LABEL: Record<StaffRole, string> = {
  Developer: 'Developer',
  SalesPerson: 'Sales Person',
  Implementator: 'Implementator',
};

/**
 * One form for creating or editing any internal-staff account (Developer /
 * Sales Person / Implementator). Replaces the three near-identical
 * *-form-modal components. Password is create-only — editing a password is a
 * separate action on the person's profile page. Company + Branch are
 * required (Save stays disabled until both are picked). Developer type and
 * rank are admin-extensible dropdowns with an inline "add new" affordance.
 */
@Component({
  selector: 'app-staff-form-modal',
  imports: [ReactiveFormsModule, Modal, PasswordInput, CompanyBranchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">
        {{ mode() === 'create' ? 'Add' : 'Edit' }} {{ roleLabel() }}
      </h2>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="sf-name" class="block text-sm font-medium text-slate-700">Name</label>
          <input id="sf-name" type="text" formControlName="displayName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="sf-email" class="block text-sm font-medium text-slate-700">Email</label>
          <input id="sf-email" type="email" formControlName="email" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        @if (mode() === 'create') {
          <div>
            <label for="sf-password" class="block text-sm font-medium text-slate-700">Password</label>
            <app-password-input inputId="sf-password" autocomplete="new-password" formControlName="password" />
          </div>
        }
        <div>
          <label class="block text-sm font-medium text-slate-700">Company &amp; branch</label>
          <div class="mt-1"><app-company-branch-select formControlName="branchId" /></div>
        </div>
        <div>
          <label for="sf-gender" class="block text-sm font-medium text-slate-700">Gender</label>
          <select id="sf-gender" formControlName="gender" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">Not specified</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        @if (role() === 'Developer') {
          <div>
            <label for="sf-devtype" class="block text-sm font-medium text-slate-700">Developer type</label>
            <select id="sf-devtype" formControlName="developerTypeId" (change)="onLookupChange('developerType', $any($event.target).value)" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option [ngValue]="null">— none —</option>
              @for (t of developerTypes(); track t.id) {
                <option [ngValue]="t.id">{{ t.name }}</option>
              }
              <option value="__add">＋ Add new type…</option>
            </select>
            @if (addingLookup() === 'developerType') {
              <div class="mt-2 flex gap-2">
                <input type="text" [value]="newLookupName()" (input)="newLookupName.set($any($event.target).value)" placeholder="New type name" class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
                <button type="button" (click)="saveNewLookup('developerType')" class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">Add</button>
              </div>
            }
          </div>
        }

        <div>
          <label for="sf-rank" class="block text-sm font-medium text-slate-700">Rank</label>
          <select id="sf-rank" formControlName="rankId" (change)="onLookupChange('rank', $any($event.target).value)" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option [ngValue]="null">— none —</option>
            @for (r of ranks(); track r.id) {
              <option [ngValue]="r.id">{{ r.name }}</option>
            }
            <option value="__add">＋ Add new rank…</option>
          </select>
          @if (addingLookup() === 'rank') {
            <div class="mt-2 flex gap-2">
              <input type="text" [value]="newLookupName()" (input)="newLookupName.set($any($event.target).value)" placeholder="New rank name" class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
              <button type="button" (click)="saveNewLookup('rank')" class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">Add</button>
            </div>
          }
        </div>

        <div>
          <label for="sf-idcard" class="block text-sm font-medium text-slate-700">ID card number <span class="text-slate-400">(optional)</span></label>
          <input id="sf-idcard" type="text" formControlName="idCardNumber" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <p class="mt-1 text-xs text-slate-400">Upload the front &amp; back scans from the person's profile page after saving.</p>
        </div>

        @if (errorMessage()) {
          <p class="text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
        }

        <div class="flex justify-end gap-3 pt-2">
          <button type="button" (click)="dismiss()" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button
            type="submit"
            [disabled]="form.invalid || submitting()"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {{ submitting() ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
})
export class StaffFormModal {
  readonly open = input.required<boolean>();
  readonly role = input.required<StaffRole>();
  readonly mode = input<'create' | 'edit'>('create');
  /** Required in edit mode. */
  readonly personId = input<string | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly developerTypes = signal<LookupValue[]>([]);
  protected readonly ranks = signal<LookupValue[]>([]);
  protected readonly addingLookup = signal<'developerType' | 'rank' | null>(null);
  protected readonly newLookupName = signal('');

  protected readonly roleLabel = computed(() => ROLE_LABEL[this.role()]);

  protected readonly form = this.fb.group({
    displayName: this.fb.nonNullable.control('', [Validators.required]),
    email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    password: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]),
    branchId: this.fb.control<string | null>(null),
    gender: this.fb.nonNullable.control(''),
    developerTypeId: this.fb.control<number | null>(null),
    rankId: this.fb.control<number | null>(null),
    idCardNumber: this.fb.nonNullable.control(''),
  });

  constructor() {
    this.adminService.getDeveloperTypes().subscribe((v) => this.developerTypes.set(v));
    this.adminService.getRanks().subscribe((v) => this.ranks.set(v));

    effect(() => {
      if (!this.open()) return;
      this.errorMessage.set(null);
      this.addingLookup.set(null);

      const passwordCtrl = this.form.controls.password;
      const branchCtrl = this.form.controls.branchId;
      if (this.mode() === 'create') {
        passwordCtrl.enable();
        passwordCtrl.setValidators([Validators.required, Validators.minLength(8)]);
        // Company + branch must be picked before Save is enabled — but only on add.
        branchCtrl.setValidators([Validators.required]);
      } else {
        passwordCtrl.disable();
        passwordCtrl.clearValidators();
        branchCtrl.clearValidators();
      }
      passwordCtrl.updateValueAndValidity();
      branchCtrl.updateValueAndValidity();

      if (this.mode() === 'edit' && this.personId()) {
        this.loadForEdit(this.personId()!);
      } else {
        this.form.reset({ displayName: '', email: '', password: '', branchId: null, gender: '', developerTypeId: null, rankId: null, idCardNumber: '' });
      }
    });
  }

  private detailFetcher() {
    return this.role() === 'Developer'
      ? this.adminService.getDeveloperDetail.bind(this.adminService)
      : this.role() === 'SalesPerson'
        ? this.adminService.getSalesPersonDetail.bind(this.adminService)
        : this.adminService.getImplementatorDetail.bind(this.adminService);
  }

  private loadForEdit(id: string): void {
    this.detailFetcher()(id).subscribe((d) => {
      this.form.reset({
        displayName: d.displayName,
        email: d.email,
        password: '',
        branchId: null,
        gender: d.employeeProfile?.gender && d.employeeProfile.gender !== 'Unspecified' ? d.employeeProfile.gender : '',
        developerTypeId: d.employeeProfile?.developerTypeId ?? null,
        rankId: d.employeeProfile?.rankId ?? null,
        idCardNumber: d.employeeProfile?.idCardNumber ?? '',
      });
      // Branch isn't returned on PersonDetail as an id; leave it for the admin to re-confirm.
    });
  }

  protected onLookupChange(kind: 'developerType' | 'rank', value: string): void {
    if (value === '__add') {
      this.addingLookup.set(kind);
      this.newLookupName.set('');
      // reset the select back to null so "__add" isn't a persisted value
      if (kind === 'developerType') this.form.controls.developerTypeId.setValue(null);
      else this.form.controls.rankId.setValue(null);
    } else {
      this.addingLookup.set(null);
    }
  }

  protected saveNewLookup(kind: 'developerType' | 'rank'): void {
    const name = this.newLookupName().trim();
    if (!name) return;
    const req = kind === 'developerType' ? this.adminService.createDeveloperType(name) : this.adminService.createRank(name);
    req.subscribe({
      next: (created) => {
        if (kind === 'developerType') {
          this.developerTypes.update((v) => [...v, created]);
          this.form.controls.developerTypeId.setValue(created.id);
        } else {
          this.ranks.update((v) => [...v, created]);
          this.form.controls.rankId.setValue(created.id);
        }
        this.addingLookup.set(null);
      },
      error: (error: HttpErrorResponse) => this.errorMessage.set(error.error?.error ?? 'Could not add that value.'),
    });
  }

  dismiss(): void {
    this.closed.emit();
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.errorMessage.set(null);

    const v = this.form.getRawValue();
    const profile = {
      gender: v.gender || undefined,
      developerTypeId: this.role() === 'Developer' ? v.developerTypeId : null,
      rankId: v.rankId,
      idCardNumber: v.idCardNumber.trim() || null,
    };

    const done = {
      next: () => {
        this.submitting.set(false);
        this.saved.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not save.');
      },
    };

    if (this.mode() === 'create') {
      const req: CreateStaffRequest = {
        displayName: v.displayName,
        email: v.email,
        password: v.password,
        branchId: v.branchId ?? undefined,
        profile,
      };
      const call =
        this.role() === 'Developer' ? this.adminService.createDeveloper(req)
        : this.role() === 'SalesPerson' ? this.adminService.createSalesPerson(req)
        : this.adminService.createImplementator(req);
      call.subscribe(done);
    } else {
      const req: UpdateStaffRequest = {
        displayName: v.displayName,
        email: v.email,
        branchId: v.branchId ?? undefined,
        profile,
      };
      this.adminService.updateStaff(this.role(), this.personId()!, req).subscribe(done);
    }
  }
}
