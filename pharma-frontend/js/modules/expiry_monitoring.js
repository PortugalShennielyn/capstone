import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';
const EXPIRY_SYNC_KEY = 'drpInventoryExpiryChanged';
const expiryChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('drp-inventory-expiry') : null;

let expiryRows = [];
let activeExpiryRow = null;

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

function meaningful(value) {
    const text = String(value ?? '').trim();
    return text && !['n/a', 'null', 'undefined', 'none'].includes(text.toLowerCase()) ? text : '';
}

function pretty(value) {
    const text = meaningful(value);
    return text && !/\d/.test(text) && text === text.toLowerCase() ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : text;
}

function uniqueParts(parts) {
    const seen = new Set();
    return parts.map(pretty).filter((part) => {
        if (!part) return false;
        const key = part.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function joinedMeasurement(value, unit) {
    const amount = meaningful(value);
    const label = meaningful(unit);
    return amount ? `${amount}${label ? ` ${label}` : ''}` : '';
}

function specification(row) {
    if (String(row.category_name || '').toLowerCase() === 'medicine') {
        const strength = meaningful(row.strength) || joinedMeasurement(row.strength_value, row.strength_unit);
        return uniqueParts([
            row.generic_name,
            strength,
            joinedMeasurement(row.net_content_value, row.net_content_unit),
            row.dosage_form,
            row.package_type
        ]).join(' • ');
    }
    return uniqueParts([
        row.variant,
        meaningful(row.net_weight) ? joinedMeasurement(row.net_weight, row.unit) : row.size,
        row.package_type
    ]).join(' • ');
}

function formatDate(value, fallback = '—') {
    if (!value) return fallback;
    const raw = String(value).trim();
    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : new Date(raw.replace(' ', 'T'));
    return Number.isNaN(date.getTime())
        ? fallback
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('drpTheme', theme);
}

function statusBadge(status) {
    const label = meaningful(status) || 'Not Recorded';
    const icons = {
        Expired: 'fa-triangle-exclamation',
        'Expiring Soon': 'fa-clock',
        Safe: 'fa-circle-check',
        'Not Recorded': 'fa-circle-minus'
    };
    const className = label.toLowerCase().replaceAll(' ', '-');
    return `<span class="expiry-status-badge ${escapeHtml(className)}"><i class="fa-solid ${icons[label] || 'fa-circle-minus'}"></i>${escapeHtml(label)}</span>`;
}

function daysText(value) {
    if (value === null || value === undefined || value === '') return '—';
    const days = Number(value);
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
    return `${days} day${days === 1 ? '' : 's'}`;
}

function alertText(value) {
    const days = Number(value || 30);
    return `${days} day${days === 1 ? '' : 's'} before`;
}

function renderSummaryCards(rows) {
    const container = document.getElementById('expirySummaryCards');
    if (!container) return;
    const totals = rows.reduce((acc, row) => {
        const status = row.expiry_status || 'Not Recorded';
        acc.total += 1;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { total: 0, Safe: 0, 'Expiring Soon': 0, Expired: 0, 'Not Recorded': 0 });
    const cards = [
        ['Total Batches', totals.total, '#7c3aed'],
        ['Safe', totals.Safe, '#16a34a'],
        ['Expiring Soon', totals['Expiring Soon'], '#d97706'],
        ['Expired', totals.Expired, '#dc2626'],
        ['Not Recorded', totals['Not Recorded'], '#64748b']
    ];
    container.innerHTML = cards.map(([label, value, color]) => `
        <div class="summary-card" style="--summary-color:${color}"><strong>${Number(value || 0)}</strong><p>${escapeHtml(label)}</p></div>
    `).join('');
}

function initializeTooltips() {
    document.querySelectorAll('#table-expiry-monitoring [data-bs-toggle="tooltip"]').forEach((element) => bootstrap.Tooltip.getOrCreateInstance(element));
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
        <tr data-batch-id="${escapeHtml(row.batch_id)}">
            <td>${escapeHtml(row.product_name)}</td>
            <td>${escapeHtml(row.brand_name)}</td>
            <td>${escapeHtml(row.category_name)}</td>
            <td>${escapeHtml(row.type_name)}</td>
            <td title="${escapeHtml(row.batch_number)}">${escapeHtml(row.batch_number)}</td>
            <td>${escapeHtml(row.received_quantity)}</td>
            <td>${escapeHtml(row.available_quantity)}</td>
            <td><div class="expiry-date-stack">${statusBadge(row.expiry_status)}<span>${escapeHtml(formatDate(row.expiry_date))}</span></div></td>
            <td>${alertText(row.expiry_alert_days)}</td>
            <td>${daysText(row.days_until_expiry)}</td>
            <td>${statusBadge(row.expiry_status)}</td>
            <td class="expiry-action-cell">
                <div class="expiry-actions">
                    <button class="btn btn-sm btn-outline-secondary view-expiry-btn" type="button" title="View Expiry Details" aria-label="View Expiry Details" data-bs-toggle="tooltip" data-batch-id="${escapeHtml(row.batch_id)}"><i class="fa-regular fa-eye"></i></button>
                    <button class="btn btn-sm btn-outline-primary edit-expiry-btn" type="button" title="Edit Expiry" aria-label="Edit Expiry" data-bs-toggle="tooltip" data-batch-id="${escapeHtml(row.batch_id)}"><i class="fa-solid fa-pen"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
    window.dispatchEvent(new CustomEvent('drp:tables-updated'));
    initializeTooltips();
}

async function loadExpiryMonitoring() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/inventory/get_expiry_monitoring.php?t=${Date.now()}`);
        expiryRows = data.data || [];
        renderExpiryRows(expiryRows);
        if (activeExpiryRow && document.getElementById('expiryDetailsModal')?.classList.contains('show')) {
            const refreshed = expiryRows.find((row) => String(row.batch_id) === String(activeExpiryRow.batch_id));
            if (refreshed) openExpiryDetails(refreshed.batch_id, false);
        }
    } catch (error) {
        expiryRows = [];
        renderExpiryRows([]);
        PharmaUtils.toast.error(error.message);
    }
}

function detailItem(label, value) {
    return `<div class="expiry-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(meaningful(value) || '—')}</strong></div>`;
}

function openExpiryDetails(batchId, show = true) {
    const row = expiryRows.find((item) => String(item.batch_id) === String(batchId));
    if (!row) return;
    activeExpiryRow = row;
    const content = document.getElementById('expiryDetailsContent');
    if (content) content.innerHTML = `
        <section class="expiry-detail-section"><h3>Product Identity</h3><div class="expiry-detail-grid">
            ${detailItem('Brand', row.brand_name)}${detailItem('Product', row.product_name)}${detailItem('Specification', specification(row))}${detailItem('Category', row.category_name)}${detailItem('Product Type', row.type_name)}
        </div></section>
        <section class="expiry-detail-section"><h3>Batch Information</h3><div class="expiry-detail-grid">
            ${detailItem('Batch Number', row.batch_number)}${detailItem('PO Number', row.po_number)}${detailItem('Supplier', row.supplier_name)}${detailItem('Received Date', formatDate(row.received_date))}${detailItem('Received Qty', row.received_quantity)}${detailItem('Storage Qty', row.storage_qty)}${detailItem('Shelf Qty', row.shelf_qty)}${detailItem('Damaged Qty', row.damaged_qty)}
        </div></section>
        <section class="expiry-detail-section"><h3>Expiry Information</h3><div class="expiry-detail-grid">
            ${detailItem('Expiry Date', formatDate(row.expiry_date))}${detailItem('Days Remaining', daysText(row.days_until_expiry))}<div class="expiry-detail-item"><span>Expiry Status</span>${statusBadge(row.expiry_status)}</div>${detailItem('Alert Threshold', alertText(row.expiry_alert_days))}
        </div></section>
        <section class="expiry-detail-section mb-0"><h3>Inventory Summary</h3><div class="expiry-stock-grid">
            ${detailItem('Storage', row.storage_qty)}${detailItem('Shelf', row.shelf_qty)}${detailItem('Damaged', row.damaged_qty)}
        </div></section>`;
    if (show) bootstrap.Modal.getOrCreateInstance(document.getElementById('expiryDetailsModal')).show();
}

function openEditExpiryModal(batchId) {
    const row = expiryRows.find((item) => String(item.batch_id) === String(batchId));
    if (!row) return;
    document.getElementById('editExpiryBatchId').value = row.batch_id;
    document.getElementById('editExpiryInventoryId').value = row.inventory_id || '';
    document.getElementById('editExpiryProductName').textContent = `${row.brand_name || '—'} • ${row.product_name || '—'} • ${specification(row) || '—'}`;
    document.getElementById('editExpiryBatchNumber').textContent = row.batch_number || '—';
    document.getElementById('editExpiryDateInput').value = row.expiry_date || '';
    setAlertControls(Number(row.expiry_alert_days || 30));
    bootstrap.Modal.getOrCreateInstance(document.getElementById('editExpiryDateModal')).show();
}

function editFromDetails() {
    if (!activeExpiryRow) return;
    const modalElement = document.getElementById('expiryDetailsModal');
    const modal = bootstrap.Modal.getInstance(modalElement);
    modalElement.addEventListener('hidden.bs.modal', () => openEditExpiryModal(activeExpiryRow.batch_id), { once: true });
    modal?.hide();
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
    const days = selected === 'custom' ? Number(document.getElementById('editExpiryCustomDays')?.value || 30) : Number(selected);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) throw new Error('Alert before expiry must be between 1 and 3650 days.');
    return days;
}

function publishExpiryChange(detail) {
    window.dispatchEvent(new CustomEvent('drp:inventory-expiry-changed', { detail }));
    if (expiryChannel) expiryChannel.postMessage(detail);
    else localStorage.setItem(EXPIRY_SYNC_KEY, JSON.stringify({ ...detail, updatedAt: Date.now() }));
}

async function saveExpiryDate() {
    try {
        const batchId = document.getElementById('editExpiryBatchId')?.value;
        const inventoryId = document.getElementById('editExpiryInventoryId')?.value;
        const expiryDate = document.getElementById('editExpiryDateInput')?.value || '';
        const expiryAlertDays = selectedAlertDays();
        if (!batchId) throw new Error('Inventory batch is required.');
        PharmaUtils.modal.loading('Saving Expiry Date...');
        const data = await fetchJson(`${API_BASE_URL}/inventory/update_expiry_date.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch_id: batchId, inventory_id: inventoryId, expiry_date: expiryDate, expiry_alert_days: expiryAlertDays })
        });
        PharmaUtils.modal.close();
        bootstrap.Modal.getInstance(document.getElementById('editExpiryDateModal'))?.hide();
        await loadExpiryMonitoring();
        publishExpiryChange({ batchId: data.batch_id, productId: data.product_id });
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to update expiry date', error.message);
    }
}

function selectActionRow(button) {
    document.querySelectorAll('#table-expiry-monitoring tbody tr').forEach((row) => row.classList.remove('is-selected'));
    button.closest('tr')?.classList.add('is-selected');
}

setTheme(localStorage.getItem('drpTheme') || 'light');
document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
document.getElementById('btnRefreshExpiry')?.addEventListener('click', loadExpiryMonitoring);
document.getElementById('btnSaveExpiryDate')?.addEventListener('click', saveExpiryDate);
document.getElementById('btnEditExpiryFromDetails')?.addEventListener('click', editFromDetails);
document.getElementById('editExpiryAlertSelect')?.addEventListener('change', () => {
    const selected = document.getElementById('editExpiryAlertSelect')?.value || '30';
    document.getElementById('editExpiryCustomWrap')?.classList.toggle('d-none', selected !== 'custom');
});
document.getElementById('table-expiry-monitoring')?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.view-expiry-btn');
    const editButton = event.target.closest('.edit-expiry-btn');
    if (viewButton) { selectActionRow(viewButton); openExpiryDetails(viewButton.dataset.batchId); }
    if (editButton) { selectActionRow(editButton); openEditExpiryModal(editButton.dataset.batchId); }
});
expiryChannel?.addEventListener('message', () => loadExpiryMonitoring());
window.addEventListener('storage', (event) => { if (event.key === EXPIRY_SYNC_KEY) loadExpiryMonitoring(); });
loadExpiryMonitoring();
