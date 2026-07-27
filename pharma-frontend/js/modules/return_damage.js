import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const REASON_META = {
    'Total Return/Damage': '#7c3aed',
    'Expired': '#dc2626',
    'Broken package': '#f97316',
    'Wrong item delivered': '#eab308',
    'Incorrect quantity': '#06b6d4',
    'Damaged during delivery': '#ef4444',
    'Other': '#64748b'
};

let activeReturnDamage = null;

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

function formatDate(value) {
    if (!value) return 'Not set';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString();
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }

    localStorage.setItem('drpTheme', theme);
}

function statusBadge(record) {
    const status = record.return_status || record.purchase_order_status || 'Open';
    const color = ['Resolved', 'Replacement received'].includes(status) ? '#16a34a'
        : (status === 'Cancelled' ? '#64748b' : (status === 'Replacement partially received' ? '#2563eb' : '#f97316'));
    return `<span class="badge text-white" style="background:${color}">${escapeHtml(status)}</span>`;
}

function renderSummary(summary = {}) {
    const container = document.getElementById('return-summary');
    if (!container) return;

    container.innerHTML = Object.entries(REASON_META).map(([label, color]) => `
        <div class="summary-card" style="--summary-color:${color}">
            <strong>${Number(summary[label] || 0)}</strong>
            <p>${escapeHtml(label)}</p>
        </div>
    `).join('');
}

function renderReturnDamageRecords(records = []) {
    const body = document.querySelector('#table-return-damage tbody');
    if (!body) return;

    if (records.length === 0) {
        body.innerHTML = '<tr><td colspan="13" class="empty-row">No return/damage records found.</td></tr>';
        return;
    }

    body.innerHTML = records.map((record) => {
        const resolvedButton = record.return_status === 'Resolved'
            ? ''
            : `<button class="btn btn-sm btn-outline-success resolve-return-btn" type="button" data-return-id="${escapeHtml(record.return_id)}" title="Mark Resolved"><i class="fa-solid fa-check"></i></button>`;

        return `
        <tr>
            <td>${formatDate(record.return_date)}</td>
            <td>${escapeHtml(record.po_number)}</td>
            <td>${escapeHtml(record.supplier_name)}</td>
            <td>${escapeHtml(record.product_name)}</td>
            <td>${escapeHtml(record.brand_name)}</td>
            <td>${escapeHtml(record.ordered_quantity)}</td>
            <td>${escapeHtml(record.received_quantity)}</td>
            <td>${escapeHtml(record.damaged_quantity)}</td>
            <td>${escapeHtml(record.return_quantity)}</td>
            <td>${escapeHtml(record.damage_reason)}</td>
            <td>${escapeHtml(record.remarks || 'None')}</td>
            <td>${statusBadge(record)}</td>
            <td>
                <div class="return-actions">
                    <button class="btn btn-sm btn-outline-primary view-return-btn" type="button" data-return-id="${escapeHtml(record.return_id)}" title="View">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary edit-return-btn" type="button" data-return-id="${escapeHtml(record.return_id)}" title="Edit">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    ${resolvedButton}
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

async function loadReturnDamageRecords() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_return_damage_orders.php`);
        renderSummary(data.summary || {});
        renderReturnDamageRecords(data.returns || []);
    } catch (error) {
        renderSummary({});
        renderReturnDamageRecords([]);
        PharmaUtils.toast.error(error.message);
    }
}

function detailGrid(record) {
    const isMedicine = record.category_name === 'Medicine';
    const isLiquid = /\b(liquid|syrup|solution|suspension|drops|betadine|povidone)\b/.test(
        `${record.product_name || ''} ${record.brand_name || ''} ${record.type_name || ''}`.toLowerCase()
    );
    const medicineAmount = isLiquid && record.volume_value
        ? `${record.volume_value} ${record.volume_unit || ''}`.trim()
        : (record.strength || 'N/A');
    const medicineLabel = isLiquid ? 'Volume' : 'Strength';
    const groceryAmount = record.weight_volume_value
        ? `${record.weight_volume_value} ${record.weight_volume_unit || ''}`.trim()
        : 'N/A';

    const resolutionLabels = {
        return_for_credit: 'Return for supplier credit', return_for_replacement: 'Return for replacement',
        keep_with_discount: 'Keep with supplier discount', keep_damaged: 'Keep as damaged stock',
        reject_without_replacement: 'Reject without replacement', replacement_damage_event: 'Replacement arrived damaged'
    };
    return `
        <div class="detail-box"><span>Date</span><strong>${formatDate(record.return_date)}</strong></div>
        <div class="detail-box"><span>PO Number</span><strong>${escapeHtml(record.po_number)}</strong></div>
        <div class="detail-box"><span>Supplier Name</span><strong>${escapeHtml(record.supplier_name)}</strong></div>
        <div class="detail-box"><span>Product Name</span><strong>${escapeHtml(record.product_name)}</strong></div>
        <div class="detail-box"><span>Brand Name</span><strong>${escapeHtml(record.brand_name)}</strong></div>
        <div class="detail-box"><span>Category</span><strong>${escapeHtml(record.category_name || 'N/A')} / ${escapeHtml(record.type_name || 'N/A')}</strong></div>
        ${isMedicine
            ? `<div class="detail-box"><span>Generic Name</span><strong>${escapeHtml(record.generic_name || 'N/A')}</strong></div><div class="detail-box"><span>${medicineLabel}</span><strong>${escapeHtml(medicineAmount)}</strong></div><div class="detail-box"><span>Unit</span><strong>${escapeHtml(record.unit || 'N/A')}</strong></div><div class="detail-box"><span>Packaging</span><strong>${escapeHtml(record.packaging || 'N/A')}</strong></div>`
            : `<div class="detail-box"><span>Variant / Flavor</span><strong>${escapeHtml(record.variant_flavor || 'N/A')}</strong></div><div class="detail-box"><span>Size</span><strong>${escapeHtml(record.size_value || 'N/A')}</strong></div><div class="detail-box"><span>Weight/Volume</span><strong>${escapeHtml(groceryAmount)}</strong></div><div class="detail-box"><span>Unit</span><strong>${escapeHtml(record.unit || 'N/A')}</strong></div><div class="detail-box"><span>Packaging</span><strong>${escapeHtml(record.packaging || 'N/A')}</strong></div>`}
        <div class="detail-box"><span>Ordered Quantity</span><strong>${escapeHtml(record.ordered_quantity)}</strong></div>
        <div class="detail-box"><span>Received Quantity</span><strong>${escapeHtml(record.received_quantity)}</strong></div>
        <div class="detail-box"><span>Damaged Quantity</span><strong>${escapeHtml(record.damaged_quantity)}</strong></div>
        <div class="detail-box"><span>Return Quantity</span><strong>${escapeHtml(record.return_quantity)}</strong></div>
        <div class="detail-box"><span>Damage Reason</span><strong>${escapeHtml(record.damage_reason)}</strong></div>
        ${record.resolution ? `<div class="detail-box"><span>Resolution</span><strong>${escapeHtml(resolutionLabels[record.resolution] || record.resolution)}</strong></div>` : ''}
        ${Number(record.supplier_adjustment || 0) > 0 ? `<div class="detail-box"><span>Supplier Adjustment</span><strong>₱${Number(record.supplier_adjustment).toFixed(2)}</strong></div>` : ''}
        ${Number(record.replacement_expected_qty || 0) > 0 ? `<div class="detail-box"><span>Replacement Progress</span><strong>${escapeHtml(record.replacement_received_qty)} of ${escapeHtml(record.replacement_expected_qty)} received · ${escapeHtml(record.replacement_outstanding_qty)} outstanding</strong></div>` : ''}
        <div class="detail-box"><span>Remarks</span><strong>${escapeHtml(record.remarks || 'None')}</strong></div>
        <div class="detail-box"><span>Status</span><strong>${escapeHtml(record.return_status || record.purchase_order_status || 'Open')}</strong></div>
    `;
}

async function getReturnDamageDetails(returnId) {
    const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_return_damage_details.php?return_id=${encodeURIComponent(returnId)}`);
    return data.return_damage;
}

async function openViewModal(returnId) {
    try {
        const record = await getReturnDamageDetails(returnId);
        activeReturnDamage = record;
        document.getElementById('viewReturnDamageSubtitle').textContent = `${record.po_number} · ${record.supplier_name}`;
        document.getElementById('viewReturnDamageDetails').innerHTML = detailGrid(record);
        document.getElementById('btnOpenReplacementArrival')?.classList.toggle('d-none', record.resolution !== 'return_for_replacement' || Number(record.replacement_outstanding_qty || 0) <= 0);
        bootstrap.Modal.getOrCreateInstance(document.getElementById('viewReturnDamageModal')).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function openEditModal(returnId) {
    try {
        activeReturnDamage = await getReturnDamageDetails(returnId);
        document.getElementById('edit-return-id').value = activeReturnDamage.return_id;
        document.getElementById('editReturnDamageSubtitle').textContent = `${activeReturnDamage.po_number} · ${activeReturnDamage.supplier_name}`;
        document.getElementById('editReturnDamageDetails').innerHTML = detailGrid(activeReturnDamage);
        document.getElementById('edit-return-quantity').value = activeReturnDamage.return_quantity || 1;
        document.getElementById('edit-damage-reason').value = activeReturnDamage.damage_reason || 'Other';
        document.getElementById('edit-return-remarks').value = activeReturnDamage.remarks || '';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('editReturnDamageModal')).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function saveReturnDamageEdit() {
    try {
        const returnId = document.getElementById('edit-return-id')?.value;
        const payload = {
            return_id: returnId,
            return_quantity: Number(document.getElementById('edit-return-quantity')?.value || 0),
            damage_reason: document.getElementById('edit-damage-reason')?.value || '',
            remarks: document.getElementById('edit-return-remarks')?.value || ''
        };

        PharmaUtils.modal.loading('Updating Return/Damage...');
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/update_purchase_order_return.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        PharmaUtils.modal.close();
        bootstrap.Modal.getInstance(document.getElementById('editReturnDamageModal'))?.hide();
        PharmaUtils.toast.success(data.message);
        await loadReturnDamageRecords();
    } catch (error) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to update return/damage', error.message);
    }
}

async function markResolved(returnId) {
    try {
        if (window.Swal) {
            const result = await Swal.fire({
                title: 'Mark as resolved?',
                text: 'This will mark the return/damage record as resolved.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Mark Resolved',
                confirmButtonColor: '#16a34a'
            });

            if (!result.isConfirmed) return;
        } else if (!confirm('Mark this return/damage record as resolved?')) {
            return;
        }

        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/update_purchase_order_return.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ return_id: returnId, action: 'resolve' })
        });

        PharmaUtils.toast.success(data.message);
        await loadReturnDamageRecords();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function replacementBatchRow(batch = {}) {
    const requiresExpiry = String(activeReturnDamage?.category_name || '').toLowerCase() === 'medicine';
    const noExpiry = !requiresExpiry && !batch.expiry_date;
    return `<div class="replacement-batch-row">
        <div><label class="form-label small fw-semibold">Batch Identifier</label><input class="form-control form-control-sm replacement-batch-id" maxlength="50" value="${escapeHtml(batch.batch_identifier || '')}" placeholder="Optional"></div>
        <div><label class="form-label small fw-semibold">Good Qty</label><input class="form-control form-control-sm replacement-batch-qty" type="number" min="1" step="1" value="${escapeHtml(batch.quantity || '')}"></div>
        <div><label class="form-label small fw-semibold">Expiry Date${requiresExpiry ? ' *' : ''}</label><input class="form-control form-control-sm replacement-batch-expiry" type="date" value="${escapeHtml(batch.expiry_date || '')}" ${noExpiry ? 'disabled' : ''}>${requiresExpiry ? '' : `<label class="small mt-1"><input class="form-check-input replacement-no-expiry" type="checkbox" ${noExpiry ? 'checked' : ''}> No Expiry</label>`}</div>
        <button class="btn btn-sm btn-outline-danger replacement-remove-batch" type="button" title="Remove batch"><i class="fa-solid fa-trash"></i></button>
    </div>`;
}

function replacementFormState() {
    const outstanding = Number(activeReturnDamage?.replacement_outstanding_qty || 0);
    const delivered = Number(document.getElementById('replacementDeliveredQty')?.value || 0);
    const damaged = Number(document.getElementById('replacementDamagedQty')?.value || 0);
    const good = Math.max(0, delivered - damaged);
    const batches = [];
    let allocated = 0;
    document.querySelectorAll('#replacementBatchList .replacement-batch-row').forEach((row) => {
        const quantity = Number(row.querySelector('.replacement-batch-qty')?.value || 0);
        allocated += Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
        batches.push({ batch_identifier: row.querySelector('.replacement-batch-id')?.value.trim() || '', quantity, expiry_date: row.querySelector('.replacement-batch-expiry')?.value || '', no_expiry: row.querySelector('.replacement-no-expiry')?.checked === true });
    });
    document.getElementById('replacementGoodQty').textContent = String(good);
    document.getElementById('replacementIssueWrap')?.classList.toggle('d-none', damaged <= 0);
    document.getElementById('replacementAllocationState').textContent = `Allocated ${allocated} of ${good} · ${Math.max(0, outstanding - good)} outstanding after acceptance`;
    return { return_id: activeReturnDamage?.return_id, delivered_quantity: delivered, damaged_quantity: damaged, issue_type: document.getElementById('replacementIssueType')?.value || '', remarks: document.getElementById('replacementRemarks')?.value.trim() || '', batches, good, allocated, outstanding };
}

function openReplacementArrival() {
    if (!activeReturnDamage) return;
    bootstrap.Modal.getInstance(document.getElementById('viewReturnDamageModal'))?.hide();
    document.getElementById('replacementPoNumber').textContent = activeReturnDamage.po_number;
    document.getElementById('replacementSupplier').textContent = activeReturnDamage.supplier_name;
    document.getElementById('replacementProduct').textContent = [activeReturnDamage.brand_name, activeReturnDamage.product_name].filter(Boolean).join(' — ');
    document.getElementById('replacementOutstanding').textContent = String(activeReturnDamage.replacement_outstanding_qty || 0);
    document.getElementById('replacementArrivalSubtitle').textContent = `${activeReturnDamage.po_number} · ${activeReturnDamage.supplier_name}`;
    document.getElementById('replacementDeliveredQty').value = activeReturnDamage.replacement_outstanding_qty || 0;
    document.getElementById('replacementDamagedQty').value = '0';
    document.getElementById('replacementIssueType').value = '';
    document.getElementById('replacementRemarks').value = '';
    document.getElementById('replacementBatchList').innerHTML = replacementBatchRow({ quantity: activeReturnDamage.replacement_outstanding_qty || 0 });
    replacementFormState();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('replacementArrivalModal')).show();
}

async function saveReplacementArrival() {
    const payload = replacementFormState();
    if (!Number.isInteger(payload.delivered_quantity) || payload.delivered_quantity <= 0 || payload.delivered_quantity > payload.outstanding) return PharmaUtils.toast.error('Replacement delivered quantity must be within the outstanding quantity.');
    if (!Number.isInteger(payload.damaged_quantity) || payload.damaged_quantity < 0 || payload.damaged_quantity > payload.delivered_quantity) return PharmaUtils.toast.error('Damaged quantity is invalid.');
    if (payload.allocated !== payload.good) return PharmaUtils.toast.error('Batch quantities must equal the accepted good quantity.');
    if (payload.damaged_quantity > 0 && (!payload.issue_type || !payload.remarks)) return PharmaUtils.toast.error('Issue type and remarks are required for damaged replacement stock.');
    const button = document.getElementById('btnSaveReplacementArrival');
    try {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/record_replacement_arrival.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        bootstrap.Modal.getInstance(document.getElementById('replacementArrivalModal'))?.hide();
        PharmaUtils.toast.success(data.message);
        await loadReturnDamageRecords();
    } catch (error) {
        PharmaUtils.modal.error('Failed to record replacement arrival', error.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Save Replacement Arrival';
    }
}

function initReturnDamage() {
    setTheme(localStorage.getItem('drpTheme') || 'light');

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });
    document.getElementById('btnRefreshReturnDamage')?.addEventListener('click', loadReturnDamageRecords);
    document.getElementById('btnSaveReturnDamageEdit')?.addEventListener('click', saveReturnDamageEdit);
    document.getElementById('btnOpenReplacementArrival')?.addEventListener('click', openReplacementArrival);
    document.getElementById('btnSaveReplacementArrival')?.addEventListener('click', saveReplacementArrival);
    document.getElementById('btnAddReplacementBatch')?.addEventListener('click', () => {
        document.getElementById('replacementBatchList')?.insertAdjacentHTML('beforeend', replacementBatchRow());
        replacementFormState();
    });
    document.getElementById('replacementArrivalModal')?.addEventListener('input', replacementFormState);
    document.getElementById('replacementArrivalModal')?.addEventListener('change', (event) => {
        if (event.target.matches('.replacement-no-expiry')) {
            const expiry = event.target.closest('.replacement-batch-row')?.querySelector('.replacement-batch-expiry');
            if (expiry) { expiry.disabled = event.target.checked; if (event.target.checked) expiry.value = ''; }
        }
        replacementFormState();
    });
    document.getElementById('replacementBatchList')?.addEventListener('click', (event) => {
        event.target.closest('.replacement-remove-batch')?.closest('.replacement-batch-row')?.remove();
        replacementFormState();
    });
    document.getElementById('table-return-damage')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('.view-return-btn');
        const editButton = event.target.closest('.edit-return-btn');
        const resolveButton = event.target.closest('.resolve-return-btn');

        if (viewButton) openViewModal(viewButton.dataset.returnId);
        if (editButton) openEditModal(editButton.dataset.returnId);
        if (resolveButton) markResolved(resolveButton.dataset.returnId);
    });

    loadReturnDamageRecords();
}

initReturnDamage();
