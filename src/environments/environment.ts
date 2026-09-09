/**
 * Local/dev default — relative paths, resolved against whatever origin serves
 * the app. `ng serve`'s proxy.conf.json forwards /api to http://localhost:4000.
 * Swapped for environment.prod.ts in production builds — see angular.json's
 * "production" configuration fileReplacements.
 */
export const environment = {
  production: false,
  apiBaseUrl: '',
};
