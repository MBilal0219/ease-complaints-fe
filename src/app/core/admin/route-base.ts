import { ActivatedRoute } from '@angular/router';

/**
 * Pages under both `/app/admin/*` and `/app/implementator/*` (Companies,
 * Parties, person detail) need to build their internal links against the
 * right prefix. Walks the ActivatedRoute's URL segments up to the shell to
 * find which one we're in.
 */
export function resolveAdminBase(route: ActivatedRoute): '/app/admin' | '/app/implementator' {
  let current: ActivatedRoute | null = route;
  while (current) {
    for (const segment of current.snapshot.url) {
      if (segment.path === 'implementator') return '/app/implementator';
      if (segment.path === 'admin') return '/app/admin';
    }
    current = current.parent;
  }
  return '/app/admin';
}
