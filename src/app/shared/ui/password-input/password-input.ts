import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Drop-in replacement for `<input type="password">` with a show/hide eye
 * toggle — implements ControlValueAccessor so it works with
 * `formControlName` exactly like a native input.
 */
@Component({
  selector: 'app-password-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PasswordInput),
      multi: true,
    },
  ],
  template: `
    <div class="relative">
      <input
        [id]="inputId()"
        [type]="visible() ? 'text' : 'password'"
        [attr.autocomplete]="autocomplete()"
        [value]="value"
        [disabled]="disabled()"
        (input)="onInput($event)"
        (blur)="onTouched()"
        class="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
      />
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-label]="visible() ? 'Hide password' : 'Show password'"
        [attr.aria-pressed]="visible()"
        class="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
      >
        @if (visible()) {
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4.5 w-4.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        } @else {
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4.5 w-4.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        }
      </button>
    </div>
  `,
})
export class PasswordInput implements ControlValueAccessor {
  readonly inputId = input<string>('password');
  readonly autocomplete = input<string>('current-password');

  protected value = '';
  protected readonly visible = signal(false);
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string): void {
    this.value = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  onInput(event: Event): void {
    this.value = (event.target as HTMLInputElement).value;
    this.onChange(this.value);
  }

  toggle(): void {
    this.visible.update((v) => !v);
  }
}
