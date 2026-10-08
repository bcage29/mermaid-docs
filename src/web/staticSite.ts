import { STATIC_MODE_META } from '../core/staticSite.js';

/**
 * Whether this page is a site written by `mermaid-docs build`, with no server behind it.
 *
 * Read from the page rather than fixed at build time, because the live server and a
 * published site serve the same bundle. Module scripts run after the document is parsed,
 * so the tag is already there to read.
 */
export const STATIC_SITE =
  document.querySelector(`meta[name="${STATIC_MODE_META}"]`)?.getAttribute('content') === 'static';
