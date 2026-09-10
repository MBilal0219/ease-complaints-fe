import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

/**
 * Supplies the double-submit CSRF token for the X-XSRF-TOKEN header.
 *
 * Same-origin (local dev): the non-HttpOnly XSRF-TOKEN cookie is readable
 * directly. Cross-origin (prod frontend on a different domain than the API):
 * document.cookie can't see the API's cookie, so AuthService feeds the token
 * in from the login / refresh / me response bodies (CurrentUserDto.csrfToken)
 * and it's held in memory here. The cookie itself is still sent to the API
 * automatically by the browser; this only covers the "read it back for the
 * header" half that the same-origin policy otherwise blocks.
 */
@Injectable({ providedIn: 'root' })
export class CsrfTokenReader {
  private readonly document = inject(DOCUMENT);
  private inMemoryToken: string | null = null;

  /** Called by AuthService whenever an auth response carries a token. */
  setToken(token: string | null | undefined): void {
    if (token) {
      this.inMemoryToken = token;
    }
  }

  clear(): void {
    this.inMemoryToken = null;
  }

  read(): string | null {
    if (this.inMemoryToken) {
      return this.inMemoryToken;
    }
    const match = this.document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}
