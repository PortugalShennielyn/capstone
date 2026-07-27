import API_BASE_URL from '../config/config.js';
import {
    ACCESS_DENIED_MESSAGE,
    isPageAllowed,
    primaryAccessRole,
    sessionRoleSet
} from './rbac.js?v=3';

const TAB_TOKEN_KEY = 'pharma_tab_token';
const TAB_CHANNEL = 'pharma_tab_session_channel';
const TAB_RUNTIME_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const OWNER_STALE_MS = 2400;
const ADMIN_SETTINGS_KEY = 'drpAdminSettings';
const DEFAULT_SESSION_TIMEOUT_MS = 1800000;
const SESSION_CHECK_TIMEOUT_MS = 10000;

let duplicateCheckPromise = null;
let activeChannel = null;
let ownerHeartbeat = null;
let fetchPatched = false;
let inactivityTimer = null;
let inactivityLogoutStarted = false;
let currentSession = null;
let sessionInitPromise = null;
let authRedirectInProgress = false;

function tabToken() {
    try {
        return sessionStorage.getItem(TAB_TOKEN_KEY) || '';
    } catch (error) {
        return '';
    }
}

function setTabToken(token) {
    if (token) {
        try {
            sessionStorage.setItem(TAB_TOKEN_KEY, token);
        } catch (error) {}
    }
}

function clearTabToken() {
    try {
        const token = tabToken();
        if (token) {
            const owner = readOwner(token);
            if (owner?.runtimeId === TAB_RUNTIME_ID) {
                localStorage.removeItem(ownerKey(token));
            }
        }
        sessionStorage.removeItem(TAB_TOKEN_KEY);
    } catch (error) {}
}

function redirectToLogin() {
    if (authRedirectInProgress) {
        return;
    }
    authRedirectInProgress = true;
    clearTabToken();
    if (!window.location.pathname.endsWith('/login.html')) {
        window.location.replace('login.html');
    }
}

function readAdminSettings() {
    try {
        return JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || '{}') || {};
    } catch (error) {
        return {};
    }
}

function sessionTimeoutConfig() {
    const settings = readAdminSettings();
    const security = settings.security || {};
    const sessionTimeoutMs = Number(security.sessionTimeoutMs || DEFAULT_SESSION_TIMEOUT_MS);
    return {
        enabled: security.autoLogoutEnabled !== false,
        sessionTimeoutMs: Number.isFinite(sessionTimeoutMs) && sessionTimeoutMs > 0
            ? sessionTimeoutMs
            : DEFAULT_SESSION_TIMEOUT_MS
    };
}

async function clearServerSession() {
    try {
        await fetch(`${API_BASE_URL}/auth/logout.php`, {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store'
        });
    } catch (error) {}
}

async function expireInactiveSession() {
    if (inactivityLogoutStarted || window.location.pathname.endsWith('/login.html')) {
        return;
    }

    inactivityLogoutStarted = true;
    window.clearTimeout(inactivityTimer);
    await clearServerSession();
    clearTabToken();
    window.alert('Your session has expired due to inactivity. Please log in again.');
    window.location.replace('login.html');
}

function resetInactivityTimer() {
    if (window.location.pathname.endsWith('/login.html')) {
        return;
    }

    const config = sessionTimeoutConfig();
    window.clearTimeout(inactivityTimer);
    if (!config.enabled) {
        return;
    }

    inactivityTimer = window.setTimeout(expireInactiveSession, config.sessionTimeoutMs);
}

function startInactivityTimer() {
    if (window.__drpInactivityTimerStarted || window.location.pathname.endsWith('/login.html')) {
        resetInactivityTimer();
        return;
    }

    window.__drpInactivityTimerStarted = true;
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((eventName) => {
        window.addEventListener(eventName, resetInactivityTimer, { passive: true });
    });
    window.addEventListener('drp:admin-settings-updated', resetInactivityTimer);
    window.addEventListener('storage', (event) => {
        if (event.key === ADMIN_SETTINGS_KEY) {
            resetInactivityTimer();
        }
    });
    resetInactivityTimer();
}

function duplicateTabCheck() {
    const token = tabToken();
    if (!token || typeof BroadcastChannel === 'undefined') {
        return Promise.resolve(localStorageOwnerIsActive(token));
    }

    if (duplicateCheckPromise) {
        return duplicateCheckPromise;
    }

    duplicateCheckPromise = new Promise((resolve) => {
        const channel = new BroadcastChannel(TAB_CHANNEL);
        let duplicate = false;

        const done = () => {
            channel.close();
            resolve(duplicate);
        };

        channel.addEventListener('message', (event) => {
            const message = event.data || {};
            if (message.token !== token || message.runtimeId === TAB_RUNTIME_ID) {
                return;
            }

            if (message.type === 'tab-check') {
                channel.postMessage({ type: 'tab-active', token, runtimeId: TAB_RUNTIME_ID });
                return;
            }

            if (message.type === 'tab-active') {
                duplicate = true;
                done();
            }
        });

        channel.postMessage({ type: 'tab-check', token, runtimeId: TAB_RUNTIME_ID });
        window.setTimeout(done, 260);
    });

    return duplicateCheckPromise.finally(() => {
        duplicateCheckPromise = null;
    });
}

function ownerKey(token) {
    return `pharma_tab_owner_${token}`;
}

function readOwner(token) {
    try {
        const rawOwner = localStorage.getItem(ownerKey(token));
        return rawOwner ? JSON.parse(rawOwner) : null;
    } catch (error) {
        return null;
    }
}

function writeOwner(token) {
    try {
        localStorage.setItem(ownerKey(token), JSON.stringify({
            runtimeId: TAB_RUNTIME_ID,
            touchedAt: Date.now()
        }));
    } catch (error) {}
}

function localStorageOwnerIsActive(token) {
    const owner = readOwner(token);
    return Boolean(
        owner
        && owner.runtimeId
        && owner.runtimeId !== TAB_RUNTIME_ID
        && Date.now() - Number(owner.touchedAt || 0) < OWNER_STALE_MS
    );
}

function startActiveTabResponder() {
    const token = tabToken();
    if (!token) {
        return;
    }

    if (!ownerHeartbeat) {
        writeOwner(token);
        ownerHeartbeat = window.setInterval(() => writeOwner(tabToken()), 900);
        window.addEventListener('beforeunload', () => {
            const currentToken = tabToken();
            const owner = readOwner(currentToken);
            if (owner?.runtimeId === TAB_RUNTIME_ID) {
                localStorage.removeItem(ownerKey(currentToken));
            }
        });
    }

    if (!activeChannel && typeof BroadcastChannel !== 'undefined') {
        activeChannel = new BroadcastChannel(TAB_CHANNEL);
        activeChannel.addEventListener('message', (event) => {
            const message = event.data || {};
            if (message.type !== 'tab-check' || message.token !== tabToken() || message.runtimeId === TAB_RUNTIME_ID) {
                return;
            }

            activeChannel.postMessage({
                type: 'tab-active',
                token: tabToken(),
                runtimeId: TAB_RUNTIME_ID
            });
        });
    }
}

function installAuthenticatedFetch() {
    if (fetchPatched || typeof window.fetch !== 'function') {
        return;
    }

    const originalFetch = window.fetch.bind(window);
    fetchPatched = true;

    window.fetch = (resource, options = {}) => {
        const requestUrl = typeof resource === 'string'
            ? resource
            : resource?.url || '';
        const isApiRequest = requestUrl.startsWith(API_BASE_URL) || requestUrl.includes('/pharma-api/');
        const token = tabToken();

        if (!isApiRequest || !token) {
            return originalFetch(resource, options);
        }

        const headers = new Headers(options.headers || {});
        if (!headers.has('X-Tab-Token')) {
            headers.set('X-Tab-Token', token);
        }

        return originalFetch(resource, {
            ...options,
            credentials: options.credentials || 'include',
            headers
        });
    };
}

async function serverSessionIsActive() {
    const token = tabToken();
    if (!token) {
        return false;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);

    try {
        const response = await fetch(`${API_BASE_URL}/auth/check_session.php`, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
            headers: {
                'X-Tab-Token': token
            }
        });

        if (response.status === 401 || response.status === 403) {
            currentSession = null;
            return false;
        }

        if (!response.ok) {
            return null;
        }

        try {
            currentSession = await response.json();
        } catch (error) {
            return null;
        }

        return true;
    } catch (error) {
        return null;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function sessionRoles() {
    return Array.from(sessionRoleSet(currentSession));
}

function roleAllowedForPage() {
    const filename = window.location.pathname.split('/').pop() || '';
    return isPageAllowed(currentSession, filename);
}

function redirectUnauthorizedPage() {
    try {
        sessionStorage.setItem('drpAccessDeniedMessage', ACCESS_DENIED_MESSAGE);
    } catch (error) {}
    const roles = sessionRoles();
    if (roles.includes('salesclerk') || roles.includes('ro_sales_clerk')) {
        window.location.replace('sales_clerk_pos.html?access=denied');
        return;
    }
    if (roles.includes('cashier') || roles.includes('ro_cashier')) {
        window.location.replace('cashier_pos.html?access=denied');
        return;
    }
    window.location.replace('dashboard.html?access=denied');
}

function revealAccessDeniedMessage() {
    let message = '';
    const url = new URL(window.location.href);
    if (url.searchParams.get('access') === 'denied') {
        message = ACCESS_DENIED_MESSAGE;
        url.searchParams.delete('access');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    try {
        message = message || sessionStorage.getItem('drpAccessDeniedMessage') || '';
        sessionStorage.removeItem('drpAccessDeniedMessage');
    } catch (error) {}
    if (!message) return;

    window.setTimeout(() => {
        if (window.toastr) {
            window.toastr.error(message);
            return;
        }
        const main = document.querySelector('main, #mainWrapper, .main-wrapper');
        if (!main || document.getElementById('rbacAccessDeniedNotice')) return;
        const notice = document.createElement('div');
        notice.id = 'rbacAccessDeniedNotice';
        notice.setAttribute('role', 'alert');
        notice.style.cssText = 'margin:12px 18px;padding:12px 14px;border:1px solid #fecaca;border-radius:10px;color:#991b1b;background:#fef2f2;font-weight:750;';
        notice.textContent = message;
        main.prepend(notice);
    }, 0);
}

async function ensurePageTabSession() {
    if (sessionInitPromise) {
        return sessionInitPromise;
    }

    sessionInitPromise = initializePageSession().finally(() => {
        sessionInitPromise = null;
    });

    return sessionInitPromise;
}

async function initializePageSession() {
    installAuthenticatedFetch();

    if (!tabToken()) {
        redirectToLogin();
        return false;
    }

    await duplicateTabCheck();

    const sessionState = await serverSessionIsActive();
    if (sessionState === false) {
        redirectToLogin();
        return false;
    }
    if (sessionState === null) {
        return null;
    }

    if (!roleAllowedForPage()) {
        redirectUnauthorizedPage();
        return false;
    }

    const accessRole = primaryAccessRole(currentSession);
    document.body.dataset.sessionRole = accessRole;
    window.__drpSession = Object.freeze({ ...currentSession, access_role: accessRole });
    window.dispatchEvent(new CustomEvent('pharma:session-ready', { detail: window.__drpSession }));
    startActiveTabResponder();
    startInactivityTimer();
    revealAccessDeniedMessage();
    return currentSession || true;
}

export {
    TAB_TOKEN_KEY,
    clearTabToken,
    ensurePageTabSession,
    redirectToLogin,
    setTabToken,
    tabToken
};

if (!window.location.pathname.endsWith('/login.html')) {
    installAuthenticatedFetch();
    ensurePageTabSession();
}
