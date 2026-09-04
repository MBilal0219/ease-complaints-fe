import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SettingsService } from '../../../core/settings/settings.service';
import { PaymentMethod, PosSettings } from '../../../core/settings/models';
import { Toggle } from '../../../shared/ui/toggle/toggle';
import { PaymentMethodFormModal } from '../payment-method-form-modal/payment-method-form-modal';

@Component({
  selector: 'app-pos-settings',
  imports: [ReactiveFormsModule, FormsModule, Toggle, PaymentMethodFormModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Settings</h1>
    <p class="mt-1 text-sm text-slate-500">Receipt branding and how you get paid.</p>

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else {
      <div class="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 class="text-sm font-semibold text-slate-900">Receipt</h2>

        <div class="mt-4 flex items-center gap-3">
          @if (logoPreview()) {
            <img [src]="logoPreview()" alt="Logo" class="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
            <button type="button" (click)="removeLogo()" class="text-sm font-medium text-red-600 hover:text-red-500">Remove logo</button>
          } @else {
            <input #logoInput type="file" accept="image/*" class="hidden" (change)="onLogoSelected($event)" />
            <button type="button" (click)="logoInput.click()" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Upload logo
            </button>
          }
        </div>

        <form class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" [formGroup]="settingsForm" (ngSubmit)="saveSettings()" novalidate>
          <div class="sm:col-span-2">
            <label for="footer-text" class="block text-sm font-medium text-slate-700">Receipt footer text</label>
            <textarea id="footer-text" rows="2" formControlName="receiptFooterText" placeholder="e.g. Thank you for dining with us!" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
          </div>
          <div>
            <label for="currency-symbol" class="block text-sm font-medium text-slate-700">Currency symbol</label>
            <input id="currency-symbol" type="text" formControlName="currencySymbol" maxlength="5" class="mt-1 w-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div class="sm:col-span-2">
            <button
              type="submit"
              [disabled]="settingsForm.invalid || savingSettings()"
              class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {{ savingSettings() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </form>
      </div>

      <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 class="text-sm font-semibold text-slate-900">Payment methods</h2>
          <button type="button" (click)="openCreateMethod()" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">+ Add method</button>
        </div>
        <table class="w-full text-left text-sm">
          <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-5 py-2.5">Name</th>
              <th class="px-5 py-2.5">Tax rate</th>
              <th class="px-5 py-2.5">Active</th>
              <th class="px-5 py-2.5"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (method of paymentMethods(); track method.id) {
              <tr>
                <td class="px-5 py-2.5 font-medium text-slate-900">{{ method.name }}</td>
                <td class="px-5 py-2.5 text-slate-600">{{ method.taxRatePercent }}%</td>
                <td class="px-5 py-2.5">
                  <app-toggle [ngModel]="method.isActive" (ngModelChange)="toggleActive(method, $event)" [ngModelOptions]="{ standalone: true }" />
                </td>
                <td class="px-5 py-2.5 text-right">
                  <button type="button" (click)="openEditMethod(method)" class="font-medium text-indigo-600 hover:text-indigo-500">Edit</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (errorMessage()) {
      <p class="mt-4 text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
    }

    <app-payment-method-form-modal [open]="showMethodModal()" [method]="editingMethod()" (closed)="showMethodModal.set(false)" (saved)="onMethodSaved()" />
  `,
})
export class PosSettingsPage implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly logoPreview = signal<string | null>(null);
  protected readonly paymentMethods = signal<PaymentMethod[]>([]);
  protected readonly savingSettings = signal(false);
  protected readonly showMethodModal = signal(false);
  protected readonly editingMethod = signal<PaymentMethod | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly settingsForm = this.fb.nonNullable.group({
    receiptFooterText: [''],
    currencySymbol: ['$', [Validators.required, Validators.maxLength(5)]],
  });

  ngOnInit(): void {
    this.refresh();
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.settingsService.setLogo(file).subscribe({
      next: (settings) => this.applySettings(settings),
      error: (error: HttpErrorResponse) => this.errorMessage.set(error.error?.error ?? 'Could not upload logo.'),
    });
  }

  removeLogo(): void {
    this.settingsService.clearLogo().subscribe({
      next: (settings) => this.applySettings(settings),
      error: (error: HttpErrorResponse) => this.errorMessage.set(error.error?.error ?? 'Could not remove logo.'),
    });
  }

  saveSettings(): void {
    if (this.settingsForm.invalid || this.savingSettings()) return;

    this.savingSettings.set(true);
    this.errorMessage.set(null);
    const { receiptFooterText, currencySymbol } = this.settingsForm.getRawValue();

    this.settingsService.updateSettings({ receiptFooterText: receiptFooterText || null, currencySymbol }).subscribe({
      next: (settings) => {
        this.savingSettings.set(false);
        this.applySettings(settings);
      },
      error: (error: HttpErrorResponse) => {
        this.savingSettings.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not save settings.');
      },
    });
  }

  openCreateMethod(): void {
    this.editingMethod.set(null);
    this.showMethodModal.set(true);
  }

  openEditMethod(method: PaymentMethod): void {
    this.editingMethod.set(method);
    this.showMethodModal.set(true);
  }

  onMethodSaved(): void {
    this.showMethodModal.set(false);
    this.refreshPaymentMethods();
  }

  toggleActive(method: PaymentMethod, isActive: boolean): void {
    this.settingsService.setPaymentMethodActive(method.id, isActive).subscribe({
      next: (updated) => this.paymentMethods.update((all) => all.map((m) => (m.id === updated.id ? updated : m))),
      error: (error: HttpErrorResponse) => this.errorMessage.set(error.error?.error ?? 'Could not update this payment method.'),
    });
  }

  private applySettings(settings: PosSettings): void {
    this.logoPreview.set(settings.logoUrl);
    this.settingsForm.reset({ receiptFooterText: settings.receiptFooterText ?? '', currencySymbol: settings.currencySymbol });
  }

  private refreshPaymentMethods(): void {
    this.settingsService
      .getPaymentMethods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((methods) => this.paymentMethods.set(methods));
  }

  private refresh(): void {
    this.loading.set(true);
    forkJoin({ settings: this.settingsService.getSettings(), methods: this.settingsService.getPaymentMethods() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ settings, methods }) => {
          this.applySettings(settings);
          this.paymentMethods.set(methods);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
