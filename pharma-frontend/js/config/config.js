// Resolve the API from the served frontend location so local installs under
// different project folders use their own API path and session cookie.
const API_BASE_URL = new URL('../../../pharma-api/v1', import.meta.url)
    .href.replace(/\/$/, '');

export default API_BASE_URL;
