import API_BASE_URL from '../config/config.js';

const input = document.getElementById('purchaseRequestQuantityLimitInput');
const message = document.getElementById('purchaseRequestQuantityLimitMessage');
const FALLBACK_LIMIT = 50;
const MAX_LIMIT = 1000000;

if (input) {
    if (!window.__drpSession) {
        await new Promise(resolve => window.addEventListener('pharma:session-ready', event => {
            window.__drpSession = event.detail || {};
            resolve();
        }, { once: true }));
    }

    const session = window.__drpSession || {};
    const roles = [session.role, session.access_role, ...(session.roles || []), ...(session.role_identifiers || [])]
        .map(role => String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_'));
    const canManage = roles.some(role => ['admin', 'super_admin'].includes(role));
    const setMessage = (text, isError = false) => {
        if (!message) return;
        message.textContent = text;
        message.classList.toggle('d-none', !text);
        message.classList.toggle('text-danger', isError);
        message.classList.toggle('text-muted', !isError);
    };
    const headers = () => ({
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Tab-Token': sessionStorage.getItem('pharma_tab_token') || ''
    });

    try {
        const response = await fetch(`${API_BASE_URL}/settings/get_admin_settings.php`, {
            credentials: 'include', cache: 'no-store', headers: headers()
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to load the PR quantity limit.');
        const savedLimit = Number(data.prQuantityLimit);
        input.value = String(Number.isInteger(savedLimit) && savedLimit > 0 ? savedLimit : FALLBACK_LIMIT);
    } catch (error) {
        setMessage(error.message || 'Unable to load the PR quantity limit.', true);
    }

    input.disabled = !canManage;
    input.addEventListener('change', async () => {
        const value = Number(input.value);
        if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
            input.value = String(FALLBACK_LIMIT);
            setMessage(`Enter a whole number from 1 to ${MAX_LIMIT.toLocaleString()}.`, true);
            return;
        }
        input.disabled = true;
        setMessage('Saving quantity limit…');
        try {
            const response = await fetch(`${API_BASE_URL}/settings/save_purchase_request_limit.php`, {
                method: 'POST', credentials: 'include', headers: headers(),
                body: JSON.stringify({ prQuantityLimit: value })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to save the PR quantity limit.');
            input.value = String(Number(data.prQuantityLimit) || value);
            setMessage('Purchase Request quantity limit saved.');
        } catch (error) {
            setMessage(error.message || 'Unable to save the PR quantity limit.', true);
        } finally {
            input.disabled = !canManage;
        }
    });
}
