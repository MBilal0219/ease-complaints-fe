/**
 * Product name shown in the UI, chosen by the hostname the app is served
 * from — an Eas Foods domain shows "Eas Foods", everything else keeps the
 * default. Mirror of the backend's Configurations/Branding.cs (used for
 * outgoing emails) — keep the host pattern in sync.
 */
const DEFAULT_PRODUCT_NAME = 'Complaint Management System';
const EAS_FOODS_PRODUCT_NAME = 'Eas Foods';
const EAS_FOODS_HOST = /eas?e?-?foods/i;

export function productNameForHost(hostname: string): string {
  return EAS_FOODS_HOST.test(hostname) ? EAS_FOODS_PRODUCT_NAME : DEFAULT_PRODUCT_NAME;
}

/** The product name for the domain this page is currently loaded from. */
export const PRODUCT_NAME = productNameForHost(typeof window === 'undefined' ? '' : window.location.hostname);
