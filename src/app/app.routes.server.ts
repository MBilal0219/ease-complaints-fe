import { RenderMode, ServerRoute } from '@angular/ssr';

// All current routes are either auth-gated or read cookie-derived state at
// render time (login, invite/accept/:token, /app/**), so build-time
// prerendering isn't applicable yet — that's a Frontend Foundation /SSR
// concern (see docs/modules/frontend-foundation.md, still NOT_STARTED).
// Client rendering keeps `ng build` working without pretending routes are
// static; revisit per-route render modes when that module starts.
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
