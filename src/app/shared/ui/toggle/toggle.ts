import { ChangeDetectionStrategy, Component, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Modern pill switch, wired as a boolean ControlValueAccessor for `formControlName`. */
@Component({
  selector: 'app-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Toggle),
      multi: true,
    },
  ],
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      [disabled]="disabled()"
      (click)="flip()"
      class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
      [class]="checked() ? 'bg-indigo-600' : 'bg-slate-200'"
    >
      <span
        class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
        [class.translate-x-6]="checked()"
        [class.translate-x-1]="!checked()"
      ></span>
    </button>
  `,
})
export class Toggle implements ControlValueAccessor {
  protected readonly checked = signal(false);
  protected readonly disabled = signal(false);

  private onChange: (value: boolean) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: boolean): void {
    this.checked.set(!!value);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  flip(): void {
    if (this.disabled()) return;
    this.checked.update((v) => !v);
    this.onChange(this.checked());
    this.onTouched();
  }
}
