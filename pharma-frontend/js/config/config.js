// Keep the frontend and PHP API on one hostname so the browser consistently
// sends the same project-scoped session cookie (localhost and 127.0.0.1 are
// different cookie origins).
const isLocalHost = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
const isDevelopmentPort = isLocalHost && !['', '80', '443'].includes(window.location.port);
const API_BASE_URL = isDevelopmentPort
    ? `${window.location.protocol}//${window.location.hostname}/PharmacySystem_for_DocR/pharma-api/v1`
    : new URL('../../../pharma-api/v1', import.meta.url).href.replace(/\/$/, '');

export default API_BASE_URL;
