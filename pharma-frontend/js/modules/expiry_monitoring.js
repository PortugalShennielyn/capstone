import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

let expiryRows = [];

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function fetchJson(url, options = {}) {
    return PharmaUtils.safeFetch(url, { credentials: 'include', ...options });
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('drpTheme', theme);
}

function formatDate(value) {
    if (!value) return 'N/A';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime())
        ? escapeHtml(value)
        : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function statusBadge(status) {
    const colors = {
        'Expired': '#ef4444',
        'Expiring Soon': '#f59e0b',
        'Good': '#16a34a',
        'No Expiry Date': '#64748b'
    };
    const icons = {
        'Expired': '<i class="fa-solid fa-triangle-exclamation me-1"></i>',
        'Expiring Soon': '<i class="fa-solid fa-triangle-exclamation me-1"></i>',
        'Good': '<i class="fa-solid fa-circle-check me-1"></i>',
        'No Expiry Date': '<i class="fa-solid fa-circle-minus me-1"></i>'
    };
    return `<span class="badge status-badge text-white" style="background:${colors[status] || '#64748b'}">${icons[status] || ''}${escapeHtml(status)}</span>`;
}

function daysText(value) {
    return value === null || value === undefined || value === '' ? 'N/A' : escapeHtml(value);
}

function alertText(value) {
    const days = Number(value || 30);
    return `${days} day${days === 1 ? '' : 's'} before`;
}

function renderSummaryCards(rows) {
    const container = document.getElementById('expirySummaryCards');
    if (!container) return;

    const totals = rows.reduce((acc, row) => {
        const status = row.expiry_status || 'No Expiry Date';
        acc.total += 1;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { total: 0, Good: 0, 'Expiring Soon': 0, Expired: 0, 'No Expiry Date': 0 });

    const cards = [
        ['Total Batches', totals.total, '#7c3aed'],
        ['Good', totals.Good, '#16a34a'],
        ['Expiring Soon', totals['Expiring Soon'], '#f59e0b'],
        ['Expired', totals.Expired, '#ef4444'],
        ['No Expiry Date', totals['No Expiry Date'], '#64748b']
    ];

    container.innerHTML = cards.map(([label, value, color]) => `
        <div class="summary-card" style="--summary-color:${color}">
            <strong>${Number(value || 0)}</strong>
            <p>${escapeHtml(label)}</p>
        </div>
    `).join('');
}

function renderExpiryRows(rows) {
    const body = document.querySelector('#table-expiry-monitoring tbody');
    if (!body) return;
    renderSummaryCards(rows);

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="12" class="empty-row">No received inventory batches found.</td></tr>';
        return;
    }

    body.innerHTML = rows.map((row) => `
        <tr>
            <td>${escapeHtml(row.product_name)}</td>
            <td>${escapeHtml(row.brand_name)}</td>
            <td>${escapeHtml(row.category_name)}</td>
            <td>${escapeHtml(row.type_name)}</td>
            <td>${escapeHtml(row.batch_number)}</td>
            <td>${escapeHtml(row.received_quantity)}</td>
            <td>${escapeHtml(row.available_quantity)}</td>
            <td>${formatDate(row.expiry_date)}</td>
            <td>${alertText(row.expiry_alert_days)}</td>
            <td>${daysText(row.days_until_expiry)}</td>
            <td>${statusBadge(row.expiry_status)}</td>
            <td>
                <div class="expiry-actions">
                    <button class="btn btn-sm btn-outline-secondary edit-expiry-btn" type="button" title="Edit Expiry Date" data-inventory-id="${escapeHtml(row.inventory_id)}">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function loadExpiryMonitoring() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/inventory/get_expiry_monitoring.php`);
        expiryRows = data.data || [];
        renderExpiryRows(expiryRows);
    } catch (error) {
        expiryRows = [];
        renderExpiryRows([]);
        PharmaUtils.toast.error(error.message);
    }
}

function openEditExpiryModal(inventoryId) {
    const row = expiryRows.find((item) => String(item.inventory_id) === String(inventoryId));
    if (!row) return;

    document.getElementById('editExpiryInventoryId').value = row.inventory_id;
    document.getElementById('editExpiryProductName').textContent = `${row.product_name || 'N/A'} (${row.brand_name || 'N/A'})`;
    document.getElementById('editExpiryBatchNumber').textContent = row.batch_number || 'N/A';
    document.getElementById('editExpiryDateInput').value = row.expiry_date || '';
    setAlertControls(Number(row.expiry_alert_days || 30));
    bootstrap.Modal.getOrCreateInstance(document.getElementById('editExpiryDateModal')).show();
}

function setAlertControls(days) {
    const select = document.getElementById('editExpiryAlertSelect');
    const customWrap = document.getElementById('editExpiryCustomWrap');
    const customInput = document.getElementById('editExpiryCustomDays');
    const preset = ['7', '15', '30', '60'].includes(String(days)) ? String(days) : 'custom';

    if (select) select.value = preset;
    if (customWrap) customWrap.classList.toggle('d-none', preset !== 'custom');
    if (customInput) customInput.value = String(days || 30);
}

function selectedAlertDays() {
    const selected = document.getElementById('editExpiryAlertSelect')?.value || '30';
    const days = selected === 'custom'
        ? Number(document.getElementById('editExpiryCustomDays')?.value || 30)
        : Number(selected);

    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        throw new Error('Alert before expiry must be between 1 and 3650 days.');
    }

    return days;
}

async function saveExpiryDate() {
    try {
        const inventoryId = document.getElementById('editExpiryInventoryId')?.value;
        const expiryDate = document.getElementById('editExpiryDateInput')?.value || '';
        const expiryAlertDays = selectedAlertDays();

        if (!inventoryId) throw new Error('Inventory batch is required.');

        PharmaUtils.modal.loading('Saving Expiry Date...');
        const data = await fetchJson(`${API_BASE_URL}/inventory/update_expiry_date.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inventory_id: inventoryId,
                expiry_date: expiryDate,
                expiry_alert_days: expiryAlertDays
            })
        });
        PharmaUtils.modal.close();
        bootstrap.Modal.getInstance(document.getElementById('editExpiryDateModal'))?.hide();
        PharmaUtils.toast.success(data.message);
        await loadExpiryMonitoring();
    } catch (error) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to update expiry date', error.message);
    }
}

setTheme(localStorage.getItem('drpTheme') || 'light');
document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
document.getElementById('btnRefreshExpiry')?.addEventListener('click', loadExpiryMonitoring);
document.getElementById('btnSaveExpiryDate')?.addEventListener('click', saveExpiryDate);
document.getElementById('editExpiryAlertSelect')?.addEventListener('change', () => {
    const selected = document.getElementById('editExpiryAlertSelect')?.value || '30';
    document.getElementById('editExpiryCustomWrap')?.classList.toggle('d-none', selected !== 'custom');
});
document.getElementById('table-expiry-monitoring')?.addEventListener('click', (event) => {
    const button = event.target.closest('.edit-expiry-btn');
    if (button) openEditExpiryModal(button.dataset.inventoryId);
});
loadExpiryMonitoring();
