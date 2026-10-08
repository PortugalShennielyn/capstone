import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';
const EXPIRY_SYNC_KEY = 'drpInventoryExpiryChanged';
const expiryChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('drp-inventory-expiry') : null;

function localTodayDateString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

let expiryRows = [];
let activeExpiryRow = null;
let expiryPage = 1;
let expiryPageSize = 10;

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

function isPrescription(row) {
    const explicit = row.is_prescription ?? row.prescription_required ?? row.requires_prescription;
    if (explicit !== undefined && explicit !== null && explicit !== '') {
        return explicit === true || explicit === 1 || ['1', 'true', 'yes'].includes(String(explicit).toLowerCase());
    }
    return /prescription\s*\(?(?:rx)\)?|\brx\b/i.test(String(row.normalized_specification || ''));
}

function prescriptionTag(row) {
    return isPrescription(row) ? '<span class="prescription-tag" title="Prescription medicine">Rx</span>' : '';
}

function joinedMeasurement(value, unit) {
    const amount = meaningful(value);
    const label = meaningful(unit);
    return amount ? `${amount}${label ? ` ${label}` : ''}` : '';
}

function specification(row) {
    const normalizedSpecification = meaningful(row.normalized_specification);
    if (normalizedSpecification) {
        return normalizedSpecification
            .replace(/\bPrescription\s*\(\s*Rx\s*\)\s*•?\s*/gi, '')
            .replace(/(^|\s*[•|]\s*)\bRx\b(?=\s*[•|]|$)/gi, '$1')
            .replace(/^\s*[•|]\s*|\s*[•|]\s*$/g, '')
            .trim();
    }
    if (String(row.category_name || '').toLowerCase() === 'medicine') {
        const strength = meaningful(row.strength) || joinedMeasurement(row.strength_value, row.strength_unit);
        return uniqueParts([
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
        'Expired – Action Required': 'fa-triangle-exclamation',
        Expired: 'fa-triangle-exclamation',
        'Expiring Soon': 'fa-clock',
        Safe: 'fa-circle-check',
        'Not Recorded': 'fa-circle-minus'
    };
    const className = label === 'Expired – Action Required' ? 'expired' : label.toLowerCase().replaceAll(' ', '-');
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

function canEditExpiry(row) {
    return Number(row.can_edit_expiry) === 1;
}

function expiryLockNotice(row) {
    return canEditExpiry(row) ? '' : '<div class="expiry-lock-notice"><strong>Expiry date locked</strong><span>The expiry date can only be corrected within 24 hours of receiving the batch before inventory activity occurs. The alert window can still be changed.</span></div>';
}

function renderSummaryCards(rows) {
    const container = document.getElementById('expirySummaryCards');
    if (!container) return;
    const totals = rows.reduce((acc, row) => {
        const status = row.expiry_status || 'Not Recorded';
        acc.total += 1;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { total: 0, Safe: 0, 'Expiring Soon': 0, 'Expired – Action Required': 0, Expired: 0, 'Not Recorded': 0 });
    const cards = [
        ['Total Batches', totals.total, '#7c3aed'],
        ['Safe', totals.Safe, '#16a34a'],
        ['Expiring Soon', totals['Expiring Soon'], '#d97706'],
        ['Expired – Action Required', totals['Expired – Action Required'] + totals.Expired, '#dc2626'],
        ['Not Recorded', totals['Not Recorded'], '#64748b']
    ];
    container.innerHTML = cards.map(([label, value, color]) => `
        <div class="summary-card" style="--summary-color:${color}"><strong>${Number(value || 0)}</strong><p>${escapeHtml(label)}</p></div>
    `).join('');
}

function initializeTooltips() {
    document.querySelectorAll('#table-expiry-monitoring [data-bs-toggle="tooltip"]').forEach((element) => bootstrap.Tooltip.getOrCreateInstance(element));
}

function applySearchHighlight() {
    const input = document.getElementById('expirySearch');
    const body = document.querySelector('#table-expiry-monitoring tbody');
    if (!input || !body) return;
    if (window.PharmacySearchHighlight) {
        window.PharmacySearchHighlight.apply(body, input.value);
        window.PharmacySearchHighlight.refresh(input);
        requestAnimationFrame(() => window.PharmacySearchHighlight?.apply(body, input.value));
        return;
    }
    window.addEventListener('pharmacy-search-highlight-ready', () => {
        window.PharmacySearchHighlight?.apply(body, input.value);
    }, { once: true });
}

function productReference(row) {
    const productName = meaningful(row.product_name) || 'Unnamed product';
    const genericName = meaningful(row.generic_name);
    const brandName = meaningful(row.brand_name);
    const identity = uniqueParts([productName, genericName]);
    const separateBrand = brandName && !identity.some((part) => part.toLowerCase() === brandName.toLowerCase());
    return `<span class="product-primary">${escapeHtml(identity.join(' • '))} ${prescriptionTag(row)}</span>${separateBrand ? `<span class="product-secondary">${escapeHtml(brandName)}</span>` : ''}<span class="product-secondary">${escapeHtml(productSpecification(row))}</span>`;
}

function productSecondary(row) {
    const identity = uniqueParts([row.product_name, row.generic_name]);
    const brand = meaningful(row.brand_name);
    const brandPart = brand && !identity.some((part) => part.toLowerCase() === brand.toLowerCase()) ? brand : '';
    return uniqueParts([brandPart, ...productSpecification(row).split('•')]).join(' • ') || '—';
}

function productSpecification(row) {
    const specificationParts = specification(row).split('•');
    return uniqueParts([
        ...specificationParts,
        row.inventory_unit_symbol || row.inventory_unit_name
    ]).join(' • ') || '—';
}

function updatePagination(total, first, last) {
    const count = document.getElementById('expiryRecordCount');
    const previous = document.getElementById('expiryPreviousPage');
    const next = document.getElementById('expiryNextPage');
    const totalPages = Math.max(1, Math.ceil(total / expiryPageSize));
    if (count) count.textContent = total ? `${first}–${last} of ${total} records` : '0 records';
    if (previous) previous.disabled = expiryPage <= 1;
    if (next) next.disabled = expiryPage >= totalPages;
}

function renderExpiryRows(rows, totalFiltered = rows.length) {
    const body = document.querySelector('#table-expiry-monitoring tbody');
    if (!body) return;
    if (!rows.length) {
        const hasFilters = Boolean(document.getElementById('expirySearch')?.value.trim()
            || document.getElementById('expiryStatusFilter')?.value
            || document.getElementById('expiryCategoryFilter')?.value);
        body.innerHTML = `<tr><td colspan="9" class="empty-row">${hasFilters ? 'No expiry records match the current filters.' : 'No received inventory batches found.'}</td></tr>`;
        updatePagination(0, 0, 0);
        applySearchHighlight();
        return;
    }
    body.innerHTML = rows.map((row) => `
        <tr data-batch-id="${escapeHtml(row.batch_id)}">
            <td>${productReference(row)}</td>
            <td><span class="batch-reference">${escapeHtml(meaningful(row.batch_number) || meaningful(row.batch_id) || '—')}</span></td>
            <td><span class="batch-reference">${escapeHtml(meaningful(row.po_number) || '—')}</span></td>
            <td>${escapeHtml(Number(row.storage_qty || 0))}</td>
            <td>${escapeHtml(Number(row.shelf_qty || 0))}</td>
            <td><div class="expiry-date-stack"><strong>${escapeHtml(row.expiry_date ? formatDate(row.expiry_date) : 'Not Recorded')}</strong><span>${row.expiry_date ? `Alert: ${escapeHtml(alertText(row.expiry_alert_days))}` : '—'}</span></div></td>
            <td>${daysText(row.days_until_expiry)}</td>
            <td>${statusBadge(row.expiry_status)}</td>
            <td class="expiry-action-cell">
                <div class="expiry-actions">
                    <button class="btn btn-sm btn-outline-secondary view-expiry-btn" type="button" title="View Expiry Details" aria-label="View Expiry Details" data-bs-toggle="tooltip" data-batch-id="${escapeHtml(row.batch_id)}"><i class="fa-regular fa-eye"></i></button>
                    <button class="btn btn-sm btn-outline-primary edit-expiry-btn" type="button" title="Edit Expiry Settings" aria-label="Edit Expiry Settings" data-bs-toggle="tooltip" data-batch-id="${escapeHtml(row.batch_id)}"><i class="fa-solid fa-pen"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
    const first = (expiryPage - 1) * expiryPageSize + 1;
    updatePagination(totalFiltered, first, first + rows.length - 1);
    window.dispatchEvent(new CustomEvent('drp:tables-updated'));
    initializeTooltips();
    applySearchHighlight();
}

function filteredExpiryRows() {
    const search = document.getElementById('expirySearch')?.value.trim().toLocaleLowerCase() || '';
    const status = document.getElementById('expiryStatusFilter')?.value || '';
    const category = document.getElementById('expiryCategoryFilter')?.value || '';
    return expiryRows.filter((row) => {
        if (status && String(row.expiry_status || 'Not Recorded') !== status) return false;
        if (category && String(row.category_name || '') !== category) return false;
        if (!search) return true;
        return [row.product_name, row.generic_name, row.brand_name, specification(row), row.inventory_unit_name, row.inventory_unit_symbol, row.batch_number, row.batch_id, row.po_number, row.category_name, row.type_name]
            .some((value) => String(value ?? '').toLocaleLowerCase().includes(search));
    });
}

function renderFilteredExpiryRows({ resetPage = false } = {}) {
    if (resetPage) expiryPage = 1;
    const filtered = filteredExpiryRows();
    const totalPages = Math.max(1, Math.ceil(filtered.length / expiryPageSize));
    expiryPage = Math.min(expiryPage, totalPages);
    const start = (expiryPage - 1) * expiryPageSize;
    renderExpiryRows(filtered.slice(start, start + expiryPageSize), filtered.length);
}

function populateCategoryFilter(rows) {
    const select = document.getElementById('expiryCategoryFilter');
    if (!select) return;
    const selected = select.value;
    const categories = [...new Set(rows.map((row) => meaningful(row.category_name)).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
    select.innerHTML = '<option value="">All categories</option>'
        + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    if (categories.includes(selected)) select.value = selected;
}

async function loadExpiryMonitoring() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/inventory/get_expiry_monitoring.php?t=${Date.now()}`);
        expiryRows = data.data || [];
        (data.notifications || []).forEach((notification) => {
            const message = `${notification.product_name} (Batch ${notification.batch_number}) expires in ${notification.days_until_expiry} day${Number(notification.days_until_expiry) === 1 ? '' : 's'}.`;
            if (typeof toastr !== 'undefined') toastr.warning(message, 'Expiry Alert');
            else PharmaUtils.toast.error(`Expiry Alert: ${message}`);
        });
        renderSummaryCards(expiryRows);
        populateCategoryFilter(expiryRows);
        renderFilteredExpiryRows();
        if (activeExpiryRow && document.getElementById('expiryDetailsModal')?.classList.contains('show')) {
            const refreshed = expiryRows.find((row) => String(row.batch_id) === String(activeExpiryRow.batch_id));
            if (refreshed) openExpiryDetails(refreshed.batch_id, false);
        }
    } catch (error) {
        expiryRows = [];
        renderSummaryCards([]);
        populateCategoryFilter([]);
        renderFilteredExpiryRows();
        PharmaUtils.toast.error(error.message);
    }
}

function detailField(label, value) {
    return `<div class="expiry-info-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(meaningful(value) || '—')}</strong></div>`;
}

function openExpiryDetails(batchId, show = true) {
    const row = expiryRows.find((item) => String(item.batch_id) === String(batchId));
    if (!row) return;
    activeExpiryRow = row;
    const content = document.getElementById('expiryDetailsContent');
    const damagedField = Number(row.damaged_qty || 0) > 0 ? detailField('Damaged Qty', row.damaged_qty) : '';
    if (content) content.innerHTML = `
        <section class="expiry-modal-section">
            <h3>Product Identity</h3>
            <div class="expiry-identity-grid">
                <div class="expiry-identity-field"><span>Product Identity</span><strong>${escapeHtml(uniqueParts([row.product_name, row.generic_name]).join(' • ') || 'Unnamed product')} ${prescriptionTag(row)}</strong>${meaningful(row.brand_name) && !uniqueParts([row.product_name, row.generic_name]).some((part) => part.toLowerCase() === meaningful(row.brand_name).toLowerCase()) ? `<span class="expiry-identity-brand">${escapeHtml(row.brand_name)}</span>` : ''}</div>
                <div class="expiry-identity-field"><span>Specification</span><div class="expiry-identity-specification">${escapeHtml(productSpecification(row))}</div></div>
            </div>
        </section>
        <section class="expiry-modal-section">
            <h3>Batch Information</h3>
            <div class="expiry-info-grid">
                ${detailField('Batch Number', row.batch_number)}${detailField('PO Number', row.po_number)}${detailField('Received Date', formatDate(row.received_date))}
                ${detailField('Originally Received', row.received_quantity)}${detailField('Storage Qty', Number(row.storage_qty || 0))}${detailField('Shelf Qty', Number(row.shelf_qty || 0))}
                ${detailField('Remaining Qty', Number(row.available_quantity || 0))}${detailField('Quarantined for Return', Number(row.expiry_quarantined_quantity || 0))}
                ${detailField('Supplier', row.supplier_name)}${damagedField}
            </div>
        </section>
        <section class="expiry-modal-section">
            <h3>Expiry Information</h3>
            <div class="expiry-info-grid expiry-info-grid-four">
                ${detailField('Expiry Date', row.expiry_date ? formatDate(row.expiry_date) : 'Not Recorded')}
                ${detailField('Alert Before', alertText(row.expiry_alert_days))}
                ${detailField('Days Left', daysText(row.days_until_expiry))}
                <div class="expiry-info-item"><span>Expiry Status</span><strong>${statusBadge(row.expiry_status)}</strong></div>
                ${detailField('Action Status', row.expiry_action_status || 'Not Reviewed')}
            </div>${expiryLockNotice(row)}
        </section>
        <section class="expiry-modal-section">
            <h3>Review Action</h3>
            <div class="expiry-settings-grid">
                <div>
                    <label class="form-label fw-semibold" for="expiryReviewActionSelect">Review Action</label>
                    <select class="form-select" id="expiryReviewActionSelect">
                        <option value="">Select Review Action</option>
                        <option value="Return for Replacement">Return for Replacement</option>
                        <option value="Not Eligible for Return">Not Eligible for Return</option>
                        <option value="For Disposal">For Disposal</option>
                    </select>
                </div>
                <div id="expiryReturnQuantityWrap" class="d-none">
                    <label class="form-label fw-semibold" for="expiryReturnQuantity">Return Quantity</label>
                    <input id="expiryReturnQuantity" class="form-control" type="number" min="1" max="${Number(row.available_quantity || 0)}" step="1">
                </div>
            </div>
            <div id="expiryReturnReasonWrap" class="mt-3 d-none">
                <label class="form-label fw-semibold" for="expiryReturnReason">Return Reason</label>
                <select id="expiryReturnReason" class="form-select"><option value="Near Expiry">Near Expiry</option></select>
            </div>
            <button id="btnSaveExpiryReviewAction" class="btn btn-outline-primary btn-sm mt-3" type="button">Save Review Action</button>
            <div id="expiryDisposalFields" class="mt-3 d-none">
                <div class="expiry-settings-grid">
                    <div><label class="form-label fw-semibold" for="expiryDisposalQuantity">Disposal Quantity</label><input id="expiryDisposalQuantity" class="form-control" type="number" min="1" max="${Number(row.available_quantity || 0)}" step="1" value="${Number(row.available_quantity || 0)}"></div>
                    <div><label class="form-label fw-semibold" for="expiryDisposalDate">Disposal Date</label><input id="expiryDisposalDate" class="form-control" type="date" max="${localTodayDateString()}" value="${localTodayDateString()}"></div>
                    <div><label class="form-label fw-semibold" for="expiryDisposalReason">Reason</label><input id="expiryDisposalReason" class="form-control" type="text" maxlength="255"></div>
                    <div><label class="form-label fw-semibold" for="expiryDisposalRemarks">Remarks</label><textarea id="expiryDisposalRemarks" class="form-control" rows="2" maxlength="1000"></textarea></div>
                </div>
                <button id="btnConfirmExpiryDisposal" class="btn btn-danger btn-sm mt-3" type="button">Confirm Disposal</button>
            </div>
        </section>`;
    const actionSelect = document.getElementById('expiryReviewActionSelect');
    if (actionSelect && ['Return for Replacement', 'Not Eligible for Return', 'For Disposal'].includes(row.expiry_action_status)) {
        actionSelect.value = row.expiry_action_status;
    }
    const returnQty = document.getElementById('expiryReturnQuantity');
    if (returnQty) returnQty.value = String(Number(row.expiry_quarantined_quantity || 0) || '');
    refreshExpiryActionFields();
    const editButton = document.getElementById('btnEditExpiryFromDetails');
    if (editButton) editButton.hidden = false;
    if (show) bootstrap.Modal.getOrCreateInstance(document.getElementById('expiryDetailsModal')).show();
}

function refreshExpiryActionFields() {
    const action = document.getElementById('expiryReviewActionSelect')?.value || '';
    const returnMode = action === 'Return for Replacement';
    const disposalMode = action === 'For Disposal';
    document.getElementById('expiryReturnQuantityWrap')?.classList.toggle('d-none', !returnMode);
    document.getElementById('expiryReturnReasonWrap')?.classList.toggle('d-none', !returnMode);
    document.getElementById('expiryDisposalFields')?.classList.toggle('d-none', !disposalMode);
    const saveButton = document.getElementById('btnSaveExpiryReviewAction');
    if (saveButton) {
        const sameAction = action && action === activeExpiryRow?.expiry_action_status;
        saveButton.hidden = !action || (sameAction && action !== 'Return for Replacement');
    }
    const disposeButton = document.getElementById('btnConfirmExpiryDisposal');
    if (disposeButton) disposeButton.disabled = Number(activeExpiryRow?.available_quantity || 0) <= 0;
}

async function saveExpiryReviewAction() {
    try {
        if (!activeExpiryRow) throw new Error('Select an inventory batch first.');
        const reviewAction = document.getElementById('expiryReviewActionSelect')?.value || '';
        if (!reviewAction) throw new Error('Select a Review Action.');
        const returnQuantity = Number(document.getElementById('expiryReturnQuantity')?.value || 0);
        if (reviewAction === 'Return for Replacement'
            && (!Number.isInteger(returnQuantity) || returnQuantity <= 0 || returnQuantity > Number(activeExpiryRow.available_quantity || 0))) {
            throw new Error('Return quantity must be a positive whole number within the remaining batch quantity.');
        }
        PharmaUtils.modal.loading('Saving Review Action...');
        const data = await fetchJson(`${API_BASE_URL}/inventory/update_expiry_action.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                batch_id: activeExpiryRow.batch_id,
                review_action: reviewAction,
                return_quantity: returnQuantity,
                return_reason: document.getElementById('expiryReturnReason')?.value || ''
            })
        });
        PharmaUtils.modal.close();
        await loadExpiryMonitoring();
        openExpiryDetails(activeExpiryRow.batch_id, false);
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to save Review Action', error.message);
    }
}

async function confirmExpiryDisposal() {
    try {
        if (!activeExpiryRow) throw new Error('Select an inventory batch first.');
        if (activeExpiryRow.expiry_action_status !== 'For Disposal') {
            throw new Error('Mark the batch For Disposal before confirming disposal.');
        }
        const quantity = Number(document.getElementById('expiryDisposalQuantity')?.value || 0);
        const available = Number(activeExpiryRow.available_quantity || 0);
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > available) {
            throw new Error('Disposal quantity must be a positive whole number within the remaining batch quantity.');
        }
        const reason = document.getElementById('expiryDisposalReason')?.value.trim() || '';
        if (!reason) throw new Error('Disposal reason is required.');
        PharmaUtils.modal.loading('Recording Disposal...');
        const data = await fetchJson(`${API_BASE_URL}/inventory/confirm_expiry_disposal.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                batch_id: activeExpiryRow.batch_id,
                quantity,
                reason,
                disposal_date: document.getElementById('expiryDisposalDate')?.value || '',
                remarks: document.getElementById('expiryDisposalRemarks')?.value || ''
            })
        });
        PharmaUtils.modal.close();
        await loadExpiryMonitoring();
        openExpiryDetails(activeExpiryRow.batch_id, false);
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to confirm disposal', error.message);
    }
}

function openEditExpiryModal(batchId) {
    const row = expiryRows.find((item) => String(item.batch_id) === String(batchId));
    if (!row) return;
    document.getElementById('editExpiryBatchId').value = row.batch_id;
    document.getElementById('editExpiryInventoryId').value = row.inventory_id || '';
    document.getElementById('editExpiryProductName').textContent = meaningful(row.product_name) || 'Unnamed product';
    document.getElementById('editExpiryProductMeta').textContent = productSecondary(row);
    document.getElementById('editExpiryBatchNumber').textContent = row.batch_number || '—';
    document.getElementById('editExpiryPoNumber').textContent = row.po_number || '—';
    document.getElementById('editExpiryDateInput').min = localTodayDateString();
    document.getElementById('editExpiryDateInput').disabled = !canEditExpiry(row);
    document.getElementById('editExpiryDateInput').value = row.expiry_date || '';
    const expiryLock = document.getElementById('editExpiryDateLockNotice');
    if (expiryLock) expiryLock.hidden = canEditExpiry(row);
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
    const preset = ['30', '60'].includes(String(days)) ? String(days) : '30';
    if (select) select.value = preset;
}

function selectedAlertDays() {
    const selected = document.getElementById('editExpiryAlertSelect')?.value || '30';
    const days = Number(selected);
    if (![30, 60].includes(days)) throw new Error('Expiry alerts can be set to 30 or 60 days only.');
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
        if (expiryDate && expiryDate < localTodayDateString()) throw new Error('Expiry date cannot be earlier than today.');
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
document.getElementById('btnSaveExpiryDate')?.addEventListener('click', saveExpiryDate);
document.getElementById('btnEditExpiryFromDetails')?.addEventListener('click', editFromDetails);
document.getElementById('btnSaveExpiryReviewAction')?.addEventListener('click', saveExpiryReviewAction);
document.getElementById('btnConfirmExpiryDisposal')?.addEventListener('click', confirmExpiryDisposal);
document.getElementById('expiryDetailsContent')?.addEventListener('change', (event) => {
    if (event.target?.id === 'expiryReviewActionSelect') refreshExpiryActionFields();
});
document.getElementById('table-expiry-monitoring')?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.view-expiry-btn');
    const editButton = event.target.closest('.edit-expiry-btn');
    if (viewButton) { selectActionRow(viewButton); openExpiryDetails(viewButton.dataset.batchId); }
    if (editButton) { selectActionRow(editButton); openEditExpiryModal(editButton.dataset.batchId); }
});
document.getElementById('expirySearch')?.addEventListener('input', () => renderFilteredExpiryRows({ resetPage: true }));
document.getElementById('expirySearch')?.addEventListener('search', () => renderFilteredExpiryRows({ resetPage: true }));
document.getElementById('expiryStatusFilter')?.addEventListener('change', () => renderFilteredExpiryRows({ resetPage: true }));
document.getElementById('expiryCategoryFilter')?.addEventListener('change', () => renderFilteredExpiryRows({ resetPage: true }));
document.getElementById('expiryPageSize')?.addEventListener('change', (event) => {
    expiryPageSize = Number(event.target.value || 10);
    renderFilteredExpiryRows({ resetPage: true });
});
document.getElementById('expiryPreviousPage')?.addEventListener('click', () => {
    if (expiryPage <= 1) return;
    expiryPage -= 1;
    renderFilteredExpiryRows();
});
document.getElementById('expiryNextPage')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(filteredExpiryRows().length / expiryPageSize));
    if (expiryPage >= totalPages) return;
    expiryPage += 1;
    renderFilteredExpiryRows();
});
expiryChannel?.addEventListener('message', () => loadExpiryMonitoring());
window.addEventListener('storage', (event) => { if (event.key === EXPIRY_SYNC_KEY) loadExpiryMonitoring(); });
loadExpiryMonitoring();
