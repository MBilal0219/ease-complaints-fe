import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

/** Reads the non-HttpOnly XSRF-TOKEN cookie for the double-submit CSRF header. See SECURITY.md. */
@Injectable({ providedIn: 'root' })
export class CsrfTokenReader {
  private readonly document = inject(DOCUMENT);

  read(): string | null {
    const match = this.document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}
