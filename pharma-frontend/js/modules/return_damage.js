import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const REASON_META = [
    { key:'all', label:'Total Return/Damage', color:'#7c3aed', aliases:[] },
    { key:'expired', label:'Expired', color:'#c2414b', aliases:['expired','expiry','expired product'] },
    { key:'broken_package', label:'Broken Package', color:'#c97939', aliases:['broken package','broken packaging','packaging damaged','damaged packaging'] },
    { key:'wrong_item', label:'Wrong Item', color:'#b68a24', aliases:['wrong item delivered','wrong item','incorrect item'] },
    { key:'quantity_issue', label:'Quantity Issue', color:'#2f8f9d', aliases:['incorrect quantity','quantity issue','shortage','missing quantity','overage'] },
    { key:'delivery_damage', label:'Delivery Damage', color:'#b95757', aliases:['damaged during delivery','damaged product','delivery damage','damaged','product damage'] },
    { key:'other', label:'Other', color:'#64748b', aliases:['other'] }
];

const RESOLUTION_LABELS = { 'Replacement':'Replacement', 'Current PO Credit':'Current PO Adjustment', 'Next PO Credit':'Credit Next PO' };

let activeReturnDamage = null;
let replacementReceivingRequestKey = '';
let returnRecords = [];
let activeReason = 'all';
let currentPage = 1;
let pageSize = 10;
let searchTimer = null;
let lastEditTrigger = null;

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
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' });
}

function normalizeReason(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\/_-]+/g,' ').replace(/\s+/g,' ');
    return REASON_META.find((item) => item.key !== 'all' && item.aliases.includes(normalized))?.key || 'other';
}

function displayReason(value) {
    const key = normalizeReason(value);
    return REASON_META.find((item) => item.key === key)?.label || 'Other';
}

function recordStatus(record) { return String(record.return_status || record.purchase_order_status || 'Awaiting supplier action'); }

function statusPresentation(record) {
    const raw = recordStatus(record);
    const value = raw.toLowerCase();
    const creditRemaining = Number(record.credit_remaining || 0);
    if (record.resolution_type === 'Next PO Credit' && creditRemaining > 0) return { label:'Credit available', tone:'info' };
    if (record.resolution_type === 'Next PO Credit' && record.credit_status === 'Partially Applied') return { label:'Credit partly used', tone:'info' };
    if (value.includes('credit applied')) return { label:'Credit applied', tone:'success' };
    if (value.includes('resolved') || value.includes('received') && !value.includes('partially')) return { label:'Resolved', tone:'success' };
    if (value.includes('credit') && value.includes('available')) return { label:'Credit available', tone:'info' };
    if (value.includes('replac')) return { label:value.includes('partial') ? 'Replacement partly received' : 'Awaiting replacement', tone:'waiting' };
    if (value.includes('cancel')) return { label:'Cancelled', tone:'problem' };
    if (value.includes('credit')) return { label:'Credit pending', tone:'waiting' };
    return { label:raw === 'Open' ? 'Awaiting supplier action' : raw, tone:'waiting' };
}

function resolutionLabel(record) { return RESOLUTION_LABELS[record.resolution_type] || (record.resolution_type ? record.resolution_type : 'Awaiting decision'); }

function productSpecification(record) {
    return [record.brand_name, record.variant_flavor, record.unit].filter((value) => value && !['N/A','None'].includes(String(value))).join(' • ') || 'Product specification unavailable';
}

function quantityUnit(record) { return record.affected_unit_name || record.unit || 'unit'; }

function requestedResolutionLabel(record) {
    const value = record.requested_resolution_type || record.resolution_type || '';
    return RESOLUTION_LABELS[value] || value || 'Not recorded';
}

function money(value) { return `₱${Number(value || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ','T'));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
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

function filteredRecords() {
    const search = document.getElementById('returnSearch')?.value.trim().toLowerCase() || '';
    const status = document.getElementById('returnStatusFilter')?.value || '';
    const reason = document.getElementById('returnReasonFilter')?.value || activeReason;
    return returnRecords.filter((record) => {
        const haystack = [record.po_number,record.supplier_name,record.product_name,record.brand_name].join(' ').toLowerCase();
        return (!search || haystack.includes(search)) && (!status || recordStatus(record) === status) && (!reason || reason === 'all' || normalizeReason(record.damage_reason) === reason);
    });
}

function renderReturnDamageRecords() {
    const body = document.querySelector('#table-return-damage tbody');
    if (!body) return;
    const filtered = filteredRecords();
    const pages = Math.max(1,Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage,pages);
    const start = (currentPage - 1) * pageSize;
    const records = filtered.slice(start,start + pageSize);
    if (!records.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty-row">No return/damage records match the current filters.</td></tr>';
        updatePagination(filtered.length,0,0);
        return;
    }

    body.innerHTML = records.map((record) => {
        const status = statusPresentation(record);
        const unit = quantityUnit(record);
        const isResolved = status.label === 'Resolved' || status.label === 'Credit applied';
        const manageAction = isResolved ? '' : `<button class="btn btn-sm btn-outline-secondary edit-return-btn" type="button" data-return-id="${escapeHtml(record.return_id)}" title="Manage return/damage" aria-label="Manage return/damage"><i class="fa-solid fa-sliders"></i></button>`;
        const replacementAction = record.resolution_type === 'Replacement' && Number(record.replacement_outstanding_qty || 0) > 0
            ? `<button class="btn btn-sm btn-outline-success replacement-return-btn" type="button" data-return-id="${escapeHtml(record.return_id)}" title="Receive replacement" aria-label="Receive replacement"><i class="fa-solid fa-box-open"></i></button>` : '';

        return `
        <tr>
            <td data-label="Reference"><div class="cell-primary">${escapeHtml(record.po_number)}</div><div class="cell-secondary">${formatDate(record.return_date)}</div></td>
            <td data-label="Supplier"><div class="cell-primary">${escapeHtml(record.supplier_name)}</div></td>
            <td data-label="Product"><div class="cell-primary">${escapeHtml(record.product_name)}</div><div class="cell-secondary">${escapeHtml(productSpecification(record))}</div></td>
            <td data-label="Quantity"><div class="quantity-grid"><span>Ordered <strong>${escapeHtml(record.ordered_quantity)}</strong></span><span>Received <strong>${escapeHtml(record.received_quantity)}</strong></span><span>Accepted <strong>${escapeHtml(record.accepted_quantity ?? '—')}</strong></span><span>Affected <strong>${escapeHtml(record.affected_quantity || record.damaged_quantity)} ${escapeHtml(unit)}</strong></span><span>Returned <strong>${escapeHtml(record.return_quantity)} ${escapeHtml(unit)}</strong></span></div></td>
            <td data-label="Issue"><div class="cell-primary">${escapeHtml(displayReason(record.damage_reason))}</div>${record.remarks ? `<div class="cell-secondary">${escapeHtml(record.remarks)}</div>` : ''}</td>
            <td data-label="Resolution"><div class="cell-primary">${escapeHtml(resolutionLabel(record))}</div><span class="status-pill status-${status.tone}">${escapeHtml(status.label)}</span></td>
            <td data-label="Actions">
                <div class="return-actions">
                    <button class="btn btn-sm btn-outline-primary view-return-btn" type="button" data-return-id="${escapeHtml(record.return_id)}" title="View details" aria-label="View details">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    ${manageAction}
                    ${replacementAction}
                </div>
            </td>
        </tr>
    `;
    }).join('');
    updatePagination(filtered.length,start + 1,start + records.length);
}

function updatePagination(total,first,last) {
    document.getElementById('returnPageSummary').textContent = total ? `${first}–${last} of ${total} records` : '0 records';
    document.getElementById('returnPrevPage').disabled = currentPage <= 1;
    document.getElementById('returnNextPage').disabled = currentPage * pageSize >= total;
}

function populateFilters() {
    const statuses = [...new Set(returnRecords.map(recordStatus))].sort();
    const statusSelect = document.getElementById('returnStatusFilter');
    const selected = statusSelect.value;
    statusSelect.innerHTML = '<option value="">All statuses</option>' + statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
    statusSelect.value = selected;
    document.getElementById('returnReasonFilter').innerHTML = '<option value="">All reasons</option>' + REASON_META.filter(item => item.key !== 'all').map((item) => `<option value="${item.key}">${escapeHtml(item.label)}</option>`).join('');
}

async function loadReturnDamageRecords() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_return_damage_orders.php`);
        returnRecords = data.returns || [];
        populateFilters();
        renderReturnDamageRecords();
    } catch (error) {
        returnRecords = [];
        renderReturnDamageRecords();
        PharmaUtils.toast.error(error.message);
    }
}

function updateClaimConfirmedAmountUi(resolutionId, wrapperId) {
    const resolution = document.getElementById(resolutionId)?.value || '';
    const wrapper = document.getElementById(wrapperId);
    wrapper?.classList.toggle('d-none', !['Current PO Credit', 'Next PO Credit'].includes(resolution));
    if (resolutionId === 'edit-claim-resolution') {
        const isNextPo = resolution === 'Next PO Credit';
        document.getElementById('editConfirmedAmountLabel').textContent = isNextPo ? 'Confirmed Credit Amount' : 'Confirmed Discount Amount';
        document.getElementById('editConfirmedAmountHelp').textContent = isNextPo
            ? 'Amount confirmed by the supplier. This credit will be available for a future PO.'
            : 'Amount confirmed by the supplier for adjustment against the current PO.';
    }
}

async function getReturnDamageDetails(returnId) {
    const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_return_damage_details.php?return_id=${encodeURIComponent(returnId)}`);
    return data.return_damage;
}

async function openViewModal(returnId) {
    try {
        const record = await getReturnDamageDetails(returnId);
        activeReturnDamage = record;
        const status = statusPresentation(record);
        const unit = quantityUnit(record);
        document.getElementById('viewReturnDamageSubtitle').textContent = `${record.po_number} • ${record.supplier_name} • ${formatDate(record.return_date)}${record.delivery_receipt_no ? ` • DR No. ${record.delivery_receipt_no}` : ''}`;
        const activities = Array.isArray(record.activities) ? record.activities : [];
        document.getElementById('viewReturnDamageDetails').innerHTML = `
            <section class="issue-section"><div class="issue-product-row"><div><h3>Product &amp; Inspection</h3><div class="issue-product-name">${escapeHtml(record.product_name)}</div><div class="cell-secondary">${escapeHtml(productSpecification(record))}</div></div><span class="status-pill status-${status.tone}">${escapeHtml(status.label)}</span></div>
                <div class="issue-quantity-row"><div><span>Ordered</span><strong>${escapeHtml(record.ordered_quantity)} ${escapeHtml(record.unit || unit)}</strong></div><div><span>Received</span><strong>${escapeHtml(record.received_quantity)} ${escapeHtml(record.unit || unit)}</strong></div><div><span>Accepted</span><strong>${escapeHtml(record.accepted_quantity ?? '—')} ${escapeHtml(record.unit || unit)}</strong></div><div><span>Affected</span><strong>${escapeHtml(record.affected_quantity)} ${escapeHtml(unit)}</strong></div><div><span>Returned</span><strong>${escapeHtml(record.return_quantity)} ${escapeHtml(unit)}</strong></div></div></section>
            <section class="issue-section"><h3>Issue</h3><dl class="definition-grid"><div><dt>Reason</dt><dd>${escapeHtml(displayReason(record.damage_reason))}</dd></div><div><dt>Physical Disposition</dt><dd>${escapeHtml(record.disposition || 'Not recorded')}</dd></div><div><dt>Requested Resolution</dt><dd>${escapeHtml(requestedResolutionLabel(record))}</dd></div><div><dt>Delivery Receipt</dt><dd>${escapeHtml(record.delivery_receipt_no || '—')}</dd></div><div class="wide"><dt>Inspection Remarks</dt><dd>${escapeHtml(record.inspection_remarks || record.remarks || '—')}</dd></div></dl></section>
            <section class="issue-section"><h3>Supplier Resolution</h3><dl class="definition-grid"><div><dt>Supplier Confirmed</dt><dd>${escapeHtml(resolutionLabel(record))}</dd></div><div><dt>Status</dt><dd><span class="status-pill status-${status.tone}">${escapeHtml(status.label)}</span></dd></div>${Number(record.credit_amount || record.supplier_adjustment || 0) > 0 ? `<div><dt>Confirmed Amount</dt><dd>${money(record.credit_amount || record.supplier_adjustment)}</dd></div><div><dt>Remaining Credit</dt><dd>${money(record.credit_remaining)}</dd></div>` : ''}${record.management_remarks ? `<div class="wide"><dt>Management Notes</dt><dd>${escapeHtml(record.management_remarks)}</dd></div>` : ''}</dl></section>
            ${activities.length ? `<section class="issue-section"><h3>Activity</h3><ol class="activity-timeline">${activities.map(event => `<li><strong>${escapeHtml(formatDateTime(event.created_at))}</strong> — ${escapeHtml(event.description)}</li>`).join('')}</ol></section>` : ''}`;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('viewReturnDamageModal')).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function openEditModal(returnId) {
    try {
        activeReturnDamage = await getReturnDamageDetails(returnId);
        document.getElementById('edit-return-id').value = activeReturnDamage.return_id;
        document.getElementById('editReturnDamageSubtitle').textContent = `${activeReturnDamage.po_number} • ${activeReturnDamage.supplier_name} • ${formatDate(activeReturnDamage.return_date)}`;
        const unit = quantityUnit(activeReturnDamage);
        document.getElementById('manageInspectionEvidence').innerHTML = `
            <div class="wide"><dt>Product</dt><dd>${escapeHtml(activeReturnDamage.product_name)}<div class="cell-secondary">${escapeHtml(productSpecification(activeReturnDamage))}</div></dd></div>
            <div><dt>PO</dt><dd>${escapeHtml(activeReturnDamage.po_number)}</dd></div><div><dt>Delivery Receipt</dt><dd>${escapeHtml(activeReturnDamage.delivery_receipt_no || '—')}</dd></div>
            <div><dt>Ordered</dt><dd>${escapeHtml(activeReturnDamage.ordered_quantity)} ${escapeHtml(activeReturnDamage.unit || unit)}</dd></div><div><dt>Received</dt><dd>${escapeHtml(activeReturnDamage.received_quantity)} ${escapeHtml(activeReturnDamage.unit || unit)}</dd></div>
            <div><dt>Accepted</dt><dd>${escapeHtml(activeReturnDamage.accepted_quantity ?? '—')} ${escapeHtml(activeReturnDamage.unit || unit)}</dd></div><div><dt>Affected</dt><dd>${escapeHtml(activeReturnDamage.affected_quantity)} ${escapeHtml(unit)}</dd></div>
            <div><dt>Returned</dt><dd>${escapeHtml(activeReturnDamage.return_quantity)} ${escapeHtml(unit)}</dd></div><div><dt>Issue</dt><dd>${escapeHtml(displayReason(activeReturnDamage.damage_reason))}</dd></div>
            <div><dt>Disposition</dt><dd>${escapeHtml(activeReturnDamage.disposition || 'Not recorded')}</dd></div><div class="wide"><dt>Inspection Remarks</dt><dd>${escapeHtml(activeReturnDamage.inspection_remarks || activeReturnDamage.remarks || '—')}</dd></div>`;
        document.getElementById('manageRequestedResolution').textContent = requestedResolutionLabel(activeReturnDamage);
        document.getElementById('editWorkflowStatus').innerHTML = `<span class="status-pill status-${statusPresentation(activeReturnDamage).tone}">${escapeHtml(statusPresentation(activeReturnDamage).label)}</span>`;
        document.getElementById('edit-claim-resolution').value = activeReturnDamage.resolution_type || '';
        document.getElementById('edit-claim-confirmed-amount').value = Number(activeReturnDamage.supplier_adjustment || 0) > 0 ? Number(activeReturnDamage.supplier_adjustment).toFixed(2) : '';
        updateClaimConfirmedAmountUi('edit-claim-resolution', 'editClaimConfirmedAmountWrap');
        document.getElementById('edit-return-remarks').value = activeReturnDamage.management_remarks || '';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('editReturnDamageModal')).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function saveReturnDamageEdit() {
    const button = document.getElementById('btnSaveReturnDamageEdit');
    try {
        const returnId = document.getElementById('edit-return-id')?.value;
        const payload = {
            return_id: returnId,
            resolution_type: document.getElementById('edit-claim-resolution')?.value || '',
            confirmed_amount: Number(document.getElementById('edit-claim-confirmed-amount')?.value || 0),
            management_remarks: document.getElementById('edit-return-remarks')?.value || ''
        };

        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Saving...';
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/update_purchase_order_return.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        bootstrap.Modal.getInstance(document.getElementById('editReturnDamageModal'))?.hide();
        PharmaUtils.toast.success(data.message);
        await loadReturnDamageRecords();
    } catch (error) {
        PharmaUtils.modal.error('Failed to update return/damage', error.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Save Changes';
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
    return { return_id: activeReturnDamage?.return_id, receiving_request_key: replacementReceivingRequestKey, delivery_receipt_no: document.getElementById('replacementDeliveryReceiptNo')?.value.trim() || '', delivered_quantity: delivered, damaged_quantity: damaged, issue_type: document.getElementById('replacementIssueType')?.value || '', remarks: document.getElementById('replacementRemarks')?.value.trim() || '', batches, good, allocated, outstanding };
}

function openReplacementArrival() {
    if (!activeReturnDamage) return;
    replacementReceivingRequestKey = globalThis.crypto?.randomUUID?.() || `replacement-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    bootstrap.Modal.getInstance(document.getElementById('viewReturnDamageModal'))?.hide();
    document.getElementById('replacementPoNumber').textContent = activeReturnDamage.po_number;
    document.getElementById('replacementSupplier').textContent = activeReturnDamage.supplier_name;
    document.getElementById('replacementProduct').textContent = [activeReturnDamage.brand_name, activeReturnDamage.product_name].filter(Boolean).join(' — ');
    document.getElementById('replacementOutstanding').textContent = String(activeReturnDamage.replacement_outstanding_qty || 0);
    document.getElementById('replacementDeliveryReceiptNo').value = '';
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
        replacementReceivingRequestKey = '';
        PharmaUtils.toast.success(data.message);
        await loadReturnDamageRecords();
    } catch (error) {
        PharmaUtils.modal.error('Failed to record replacement arrival', error.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Complete Replacement Receiving';
    }
}

function initReturnDamage() {
    setTheme(localStorage.getItem('drpTheme') || 'light');

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });
    document.getElementById('returnSearch')?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { currentPage = 1; renderReturnDamageRecords(); },300);
    });
    document.getElementById('returnStatusFilter')?.addEventListener('change', () => { currentPage = 1; renderReturnDamageRecords(); });
    document.getElementById('returnReasonFilter')?.addEventListener('change', (event) => { activeReason = event.target.value || 'all'; currentPage = 1; renderReturnDamageRecords(); });
    document.getElementById('returnPageSize')?.addEventListener('change', (event) => { pageSize = Number(event.target.value || 10); currentPage = 1; renderReturnDamageRecords(); });
    document.getElementById('returnPrevPage')?.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; renderReturnDamageRecords(); } });
    document.getElementById('returnNextPage')?.addEventListener('click', () => { if (currentPage * pageSize < filteredRecords().length) { currentPage += 1; renderReturnDamageRecords(); } });
    document.getElementById('btnSaveReturnDamageEdit')?.addEventListener('click', saveReturnDamageEdit);
    document.getElementById('edit-claim-resolution')?.addEventListener('change', () => updateClaimConfirmedAmountUi('edit-claim-resolution', 'editClaimConfirmedAmountWrap'));
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
        const replacementButton = event.target.closest('.replacement-return-btn');

        if (viewButton) openViewModal(viewButton.dataset.returnId);
        if (editButton) { lastEditTrigger = editButton; openEditModal(editButton.dataset.returnId); }
        if (replacementButton) getReturnDamageDetails(replacementButton.dataset.returnId).then((record) => { activeReturnDamage = record; openReplacementArrival(); }).catch((error) => PharmaUtils.toast.error(error.message));
    });
    document.getElementById('editReturnDamageModal')?.addEventListener('hidden.bs.modal', () => lastEditTrigger?.focus());

    loadReturnDamageRecords();
    window.setInterval(() => { if (!document.hidden && !document.querySelector('.modal.show')) loadReturnDamageRecords(); },30000);
}

initReturnDamage();
