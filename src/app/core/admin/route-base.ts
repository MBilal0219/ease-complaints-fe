import { ActivatedRoute } from '@angular/router';

/**
 * Pages under `/app/admin/*`, `/app/implementator/*`, and (Companies only,
 * for the one Sales Person with the temporary interim access — see
 * Constants.SpecialAccess on the backend) `/app/sales-person/*` need to
 * build their internal links against the right prefix. Walks the
 * ActivatedRoute's URL segments up to the shell to find which one we're in.
 */
export function resolveAdminBase(route: ActivatedRoute): '/app/admin' | '/app/implementator' | '/app/sales-person' {
  let current: ActivatedRoute | null = route;
  while (current) {
    for (const segment of current.snapshot.url) {
      if (segment.path === 'implementator') return '/app/implementator';
      if (segment.path === 'sales-person') return '/app/sales-person';
      if (segment.path === 'admin') return '/app/admin';
    }
    current = current.parent;
  }
  return '/app/admin';
}
