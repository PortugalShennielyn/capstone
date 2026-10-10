import API_BASE_URL from '../config/config.js';

const storageInput = document.getElementById('storageLowStockThresholdInput');
const shelfInput = document.getElementById('shelfLowStockThresholdInput');
const criticalInput = document.getElementById('criticalStockThresholdInput');
const message = document.getElementById('stockThresholdMessage');
const defaults = { storageLow: 30, shelfLow: 10, critical: 15 };
let saved = { ...defaults };

if (storageInput && shelfInput && criticalInput) {
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
    const readWholeNumber = (input) => {
        const raw = String(input.value ?? '').trim();
        if (!/^\d+$/.test(raw)) return null;
        const value = Number(raw);
        return Number.isInteger(value) && value <= 1000000 ? value : null;
    };
    const applyValues = (thresholds) => {
        saved = {
            storageLow: Number.isInteger(Number(thresholds?.storageLow)) ? Number(thresholds.storageLow) : defaults.storageLow,
            shelfLow: Number.isInteger(Number(thresholds?.shelfLow)) ? Number(thresholds.shelfLow) : defaults.shelfLow,
            critical: Number.isInteger(Number(thresholds?.critical)) ? Number(thresholds.critical) : defaults.critical,
        };
        storageInput.value = String(saved.storageLow);
        shelfInput.value = String(saved.shelfLow);
        criticalInput.value = String(saved.critical);
    };
    const setDisabled = (disabled) => {
        storageInput.disabled = disabled;
        shelfInput.disabled = disabled;
        criticalInput.disabled = disabled;
    };

    try {
        const response = await fetch(`${API_BASE_URL}/settings/get_admin_settings.php`, {
            credentials: 'include', cache: 'no-store', headers: headers()
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to load stock thresholds.');
        applyValues(data.stockThresholds);
    } catch (error) {
        setMessage(error.message || 'Unable to load stock thresholds.', true);
    }

    setDisabled(!canManage);
    const saveThresholds = async () => {
        const storageLow = readWholeNumber(storageInput);
        const shelfLow = readWholeNumber(shelfInput);
        const critical = readWholeNumber(criticalInput);
        if (storageLow === null || shelfLow === null || critical === null) {
            applyValues(saved);
            setMessage('Enter whole numbers from 0 to 1,000,000.', true);
            return;
        }
        setDisabled(true);
        setMessage('Saving stock thresholds…');
        try {
            const response = await fetch(`${API_BASE_URL}/settings/save_stock_thresholds.php`, {
                method: 'POST', credentials: 'include', headers: headers(),
                body: JSON.stringify({ storageLow, shelfLow, critical })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to save stock thresholds.');
            applyValues(data.stockThresholds);
            setMessage('Stock thresholds saved. Storage and Shelf Inventory tags use these amounts.');
        } catch (error) {
            applyValues(saved);
            setMessage(error.message || 'Unable to save stock thresholds.', true);
        } finally {
            setDisabled(!canManage);
        }
    };
    [storageInput, shelfInput, criticalInput].forEach(input => input.addEventListener('change', saveThresholds));
}
