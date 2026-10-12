import PharmaUtils from '../utils.js';
import { cleanProductSpecificationText } from './product_specification.js?v=11';

const API_BASE_URL = window.location.port ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1' : '../pharma-api/v1';
const historyState = { productId: null, product: null, movements: [], filtered: [], page: 1, pageSize: 10 };
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const text = value => String(value ?? '').trim();

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(String(value).trim().replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function parseLegacyRemarks(value) {
    const stored = String(value ?? '').trim();
    if (!stored) return '';
    const tagged = stored.match(/^\[(?:RETURN|RECEIVING)_META_V\d+\](\{[^\r\n]*\})(?:\r?\n)?(.*)$/si);
    let remarks = stored;
    if (tagged) remarks = tagged[2] || '';
    else if (stored.startsWith('{')) remarks = '';
    return remarks.replace(/\[(?:RETURN|RECEIVING)_META_V\d+\]/gi, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function movementIcon(movement) {
    if (movement.direction === 'in') return 'fa-solid fa-arrow-down';
    if (movement.direction === 'out') return 'fa-solid fa-arrow-up';
    if (movement.direction === 'transfer') return 'fa-solid fa-arrow-right-arrow-left';
    if (['damaged', 'expired'].includes(movement.movement_code)) return 'fa-solid fa-triangle-exclamation';
    return 'fa-solid fa-rotate-left';
}

function movementQuantity(movement) {
    const quantity = Math.abs(Number(movement.quantity || 0));
    if (movement.direction === 'in') return `+${quantity}`;
    if (movement.direction === 'out') return `-${quantity}`;
    return String(quantity);
}

function enrichVerifiedBalances(movements, product) {
    const chronological = [...movements].sort((left, right) => String(left.movement_date || '').localeCompare(String(right.movement_date || '')));
    let shelf = 0;
    let storage = 0;
    let valid = true;
    chronological.forEach((movement) => {
        movement.previous_balance = { shelf, storage, on_hand: shelf + storage };
        shelf += Number(movement.shelf_change || 0);
        storage += Number(movement.storage_change || 0);
        movement.balance_after = { shelf, storage, on_hand: shelf + storage };
        if (shelf < 0 || storage < 0) valid = false;
    });
    valid = valid && shelf === Number(product?.shelf_quantity || 0) && storage === Number(product?.storage_quantity || 0);
    movements.forEach((movement) => { movement.balance_verified = valid; });
    return movements;
}

function historyBalanceMarkup(movement) {
    if (!movement.balance_verified || !movement.balance_after) return '<span class="text-muted">Verified balance unavailable</span>';
    const balance = movement.balance_after;
    return `<span class="movement-balance"><span>Shelf: <strong>${esc(balance.shelf)}</strong></span><span>Storage: <strong>${esc(balance.storage)}</strong></span><span>On Hand: <strong>${esc(balance.on_hand)}</strong></span></span>`;
}

function specificationText(product) {
    const saved = text(cleanProductSpecificationText(product?.normalized_specification));
    return saved || text(product?.specification) || 'No specification available';
}

function historyProductSummary(product) {
    const shelf = Number(product.shelf_quantity || 0);
    const storage = Number(product.storage_quantity || 0);
    const name = [product.brand_name, product.product_name || product.generic_name].map(text).filter(Boolean).join(' ');
    return `<div class="stock-product-summary">
        <div class="stock-product-card"><span class="stock-product-label">Product</span><strong>${esc(name || 'Unnamed product')}</strong><span class="stock-product-meta">${esc(specificationText(product))} &middot; SKU / Barcode: ${esc(product.barcode || 'Not recorded')}</span></div>
        <div class="stock-summary-card"><span>Current Shelf Stock</span><strong>${esc(shelf)}</strong></div>
        <div class="stock-summary-card"><span>Current Storage Stock</span><strong>${esc(storage)}</strong></div>
        <div class="stock-summary-card on-hand"><span>Current On Hand</span><strong>${esc(shelf + storage)}</strong></div>
    </div>`;
}

function historyFilterToolbar(movements, supportedTypes) {
    const batches = new Map();
    movements.forEach((movement) => {
        const key = String(movement.batch_id || movement.batch_number || '').trim();
        if (key) batches.set(key, movement.batch_number || key);
    });
    const types = (supportedTypes || []).map((type) => `<option value="${esc(type.code)}">${esc(type.label)}</option>`).join('');
    const batchOptions = [...batches.entries()].map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('');
    return `<div class="stock-history-toolbar" role="search" aria-label="Stock movement filters">
        <div class="stock-history-field"><label for="historySearch">Search</label><input class="form-control" id="historySearch" type="search" placeholder="PO, batch, receipt, reason, or user"></div>
        <div class="stock-history-field"><label for="historyTypeFilter">Movement Type</label><select class="form-select" id="historyTypeFilter"><option value="">All Movements</option>${types}</select></div>
        <div class="stock-history-field"><label>Date Range</label><div class="stock-date-range"><input aria-label="Start date" class="form-control" id="historyStartDate" type="date"><span>to</span><input aria-label="End date" class="form-control" id="historyEndDate" type="date"></div></div>
        ${batches.size > 1 ? `<div class="stock-history-field"><label for="historyBatchFilter">Batch</label><select class="form-select" id="historyBatchFilter"><option value="">All Batches</option>${batchOptions}</select></div>` : ''}
        <div class="stock-toolbar-actions"><button aria-label="Clear stock movement filters" class="btn btn-light" id="historyClearFilters" title="Clear Filters" type="button"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button></div>
    </div>`;
}

function movementSummaryMarkup(rows) {
    const summary = rows.reduce((totals, movement) => {
        const change = Number(movement.on_hand_change || 0);
        if (change > 0) totals.stockIn += change;
        if (change < 0) totals.stockOut += Math.abs(change);
        totals.net += change;
        totals.count += 1;
        return totals;
    }, { stockIn: 0, stockOut: 0, net: 0, count: 0 });
    return `<div class="movement-summary-grid"><div class="movement-summary-card stock-in"><span>Total Stock In</span><strong>+${esc(summary.stockIn)}</strong></div><div class="movement-summary-card stock-out"><span>Total Stock Out</span><strong>-${esc(summary.stockOut)}</strong></div><div class="movement-summary-card net"><span>Net Change</span><strong>${summary.net > 0 ? '+' : ''}${esc(summary.net)}</strong></div><div class="movement-summary-card count"><span>Movements</span><strong>${esc(summary.count)}</strong></div></div>`;
}

function historyRowMarkup(movement) {
    const reason = text(movement.reason) || parseLegacyRemarks(movement.remarks) || '—';
    return `<tr><td><time class="movement-date" datetime="${esc(movement.movement_date || '')}">${esc(formatDateTime(movement.movement_date))}</time></td><td><span class="movement-badge ${esc(movement.direction)}"><i class="${esc(movementIcon(movement))}" aria-hidden="true"></i>${esc(movement.movement_label)}</span></td><td><span class="movement-reference" title="${esc(movement.reference || '—')}">${esc(movement.reference || '—')}</span></td><td><span class="movement-location">${esc(movement.from_location || '—')}</span></td><td><span class="movement-location">${esc(movement.to_location || '—')}</span></td><td><span class="movement-quantity ${esc(movement.direction)}"><i class="${esc(movementIcon(movement))}" aria-hidden="true"></i>${esc(movementQuantity(movement))}</span></td><td>${historyBalanceMarkup(movement)}</td><td>${esc(movement.user_name || 'System')}</td><td><span class="movement-reason" title="${esc(reason)}">${esc(reason)}</span></td><td><button aria-label="View Movement Details" class="btn btn-sm btn-outline-secondary movement-detail-button" data-movement-id="${esc(movement.movement_id)}" title="View Movement Details" type="button"><i class="fa-regular fa-eye" aria-hidden="true"></i></button></td></tr>`;
}

function renderHistoryResults() {
    const results = document.getElementById('stockHistoryResults');
    const summary = document.getElementById('stockHistorySummary');
    if (!results || !summary) return;
    summary.innerHTML = movementSummaryMarkup(historyState.filtered);
    const total = historyState.filtered.length;
    const pages = Math.max(1, Math.ceil(total / historyState.pageSize));
    historyState.page = Math.min(Math.max(1, historyState.page), pages);
    const start = (historyState.page - 1) * historyState.pageSize;
    const pageRows = historyState.filtered.slice(start, start + historyState.pageSize);
    if (!pageRows.length) {
        results.innerHTML = '<div class="stock-history-state">No stock movements found for the selected filters.</div>';
        return;
    }
    results.innerHTML = `<div class="stock-history-table-shell"><table class="stock-history-table"><caption class="visually-hidden">Stock movement audit history</caption><thead><tr><th scope="col">Date &amp; Time</th><th scope="col">Movement</th><th scope="col">Reference</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Quantity Change</th><th scope="col">Balance After</th><th scope="col">Performed By</th><th scope="col">Reason</th><th scope="col">Action</th></tr></thead><tbody>${pageRows.map(historyRowMarkup).join('')}</tbody></table></div><div class="stock-history-pagination"><span>Showing ${esc(start + 1)}–${esc(Math.min(start + historyState.pageSize, total))} of ${esc(total)} movements</span><div class="btn-group"><button class="btn btn-sm btn-light" id="historyPreviousPage" type="button" ${historyState.page === 1 ? 'disabled' : ''}>Previous</button><button class="btn btn-sm btn-light" id="historyNextPage" type="button" ${historyState.page === pages ? 'disabled' : ''}>Next</button></div></div>`;
}

function applyHistoryFilters() {
    const search = String(document.getElementById('historySearch')?.value || '').trim().toLowerCase();
    const type = document.getElementById('historyTypeFilter')?.value || '';
    const batch = document.getElementById('historyBatchFilter')?.value || '';
    const start = document.getElementById('historyStartDate')?.value || '';
    const end = document.getElementById('historyEndDate')?.value || '';
    historyState.filtered = historyState.movements.filter((movement) => {
        const haystack = [movement.reference, movement.batch_number, movement.reason, movement.remarks, movement.user_name, movement.movement_label].join(' ').toLowerCase();
        const date = String(movement.movement_date || '').slice(0, 10);
        const batchKey = String(movement.batch_id || movement.batch_number || '');
        return (!search || haystack.includes(search)) && (!type || movement.movement_code === type) && (!batch || batchKey === batch) && (!start || date >= start) && (!end || date <= end);
    });
    historyState.page = 1;
    renderHistoryResults();
}

function detailItem(label, value) {
    if (value === null || value === undefined || value === '') return '';
    return `<div class="movement-detail-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function showMovementDetails(movementId) {
    const movement = historyState.movements.find((item) => String(item.movement_id) === String(movementId));
    const drawer = document.getElementById('movementDetailsDrawer');
    const body = document.getElementById('movementDetailsBody');
    if (!movement || !drawer || !body) return;
    const remarks = parseLegacyRemarks(movement.remarks);
    const balances = movement.balance_verified
        ? [detailItem('Previous Shelf', movement.previous_balance.shelf), detailItem('New Shelf', movement.balance_after.shelf), detailItem('Previous Storage', movement.previous_balance.storage), detailItem('New Storage', movement.balance_after.storage), detailItem('Previous On Hand', movement.previous_balance.on_hand), detailItem('New On Hand', movement.balance_after.on_hand)].join('')
        : detailItem('Balance', 'Verified historical balance unavailable');
    document.getElementById('movementDetailsTitle').textContent = `${movement.movement_label} Details`;
    body.innerHTML = `<section class="movement-detail-section"><h3>General</h3><div class="movement-detail-grid">${detailItem('Date and Time', formatDateTime(movement.movement_date))}${detailItem('Movement Type', movement.movement_label)}${detailItem('Quantity', movementQuantity(movement))}${detailItem('Performed By', movement.user_name || 'System')}${detailItem('Reason', movement.reason || '—')}</div></section><section class="movement-detail-section"><h3>Location and Balances</h3><div class="movement-detail-grid">${detailItem('From', movement.from_location || '—')}${detailItem('To', movement.to_location || '—')}${balances}</div></section>${remarks ? `<section class="movement-detail-section"><h3>Remarks</h3><div class="movement-detail-remarks">${esc(remarks)}</div></section>` : ''}`;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
}

function closeMovementDetails() {
    const drawer = document.getElementById('movementDetailsDrawer');
    drawer?.classList.remove('is-open');
    drawer?.setAttribute('aria-hidden', 'true');
}

function bindHistoryControls() {
    ['historySearch', 'historyTypeFilter', 'historyBatchFilter', 'historyStartDate', 'historyEndDate'].forEach((id) => {
        document.getElementById(id)?.addEventListener(id === 'historySearch' ? 'input' : 'change', applyHistoryFilters);
    });
    document.getElementById('historyClearFilters')?.addEventListener('click', () => {
        ['historySearch', 'historyTypeFilter', 'historyBatchFilter', 'historyStartDate', 'historyEndDate'].forEach((id) => {
            const control = document.getElementById(id);
            if (control) control.value = '';
        });
        applyHistoryFilters();
    });
}

async function loadHistory(productId, fallbackProduct, batchId = '') {
    const container = document.getElementById('stockHistory');
    if (!container) return;
    container.innerHTML = '<div class="stock-history-state"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Loading stock movements...</span></div>';
    closeMovementDetails();
    try {
        const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/inventory/get_stock_movements.php?product_id=${encodeURIComponent(productId)}&t=${Date.now()}`, { credentials: 'include' });
        historyState.productId = productId;
        historyState.product = { ...(fallbackProduct || {}), ...(response.product || {}) };
        historyState.movements = enrichVerifiedBalances(response.movements || [], historyState.product);
        historyState.filtered = [...historyState.movements];
        historyState.page = 1;
        container.innerHTML = `${historyProductSummary(historyState.product)}${historyFilterToolbar(historyState.movements, response.supported_types || [])}<div id="stockHistorySummary"></div><div id="stockHistoryResults"></div>`;
        bindHistoryControls();
        const batchFilter = document.getElementById('historyBatchFilter');
        if (batchId && batchFilter && [...batchFilter.options].some((option) => option.value === String(batchId))) {
            batchFilter.value = String(batchId);
            applyHistoryFilters();
        } else {
            renderHistoryResults();
        }
    } catch (error) {
        container.innerHTML = '<div class="stock-history-state is-error"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span>Unable to load stock movement history. Please try again.</span></div>';
        PharmaUtils.toast.error(error.message);
    }
}

export function openStockHistory(product, batchId = '') {
    const modalElement = document.getElementById('stockHistoryModal');
    if (!modalElement || !product?.product_id) return;
    const dialog = modalElement.querySelector('.stock-history-dialog');
    const content = modalElement.querySelector('.stock-history-modal-content');
    [dialog, content].forEach((element) => {
        if (!element) return;
        ['width', 'height', 'max-width', 'max-height', 'inset', 'left', 'top', 'transform', 'margin'].forEach((property) => element.style.removeProperty(property));
    });
    bootstrap.Modal.getOrCreateInstance(modalElement, { backdrop: 'static', keyboard: true }).show();
    loadHistory(product.product_id, product, batchId);
}

document.getElementById('stockHistory')?.addEventListener('click', (event) => {
    const detailsButton = event.target.closest('.movement-detail-button');
    if (detailsButton) {
        showMovementDetails(detailsButton.dataset.movementId);
        return;
    }
    if (event.target.closest('#historyPreviousPage')) {
        historyState.page = Math.max(1, historyState.page - 1);
        renderHistoryResults();
    }
    if (event.target.closest('#historyNextPage')) {
        historyState.page += 1;
        renderHistoryResults();
    }
});
document.querySelector('#movementDetailsDrawer .movement-details-close')?.addEventListener('click', closeMovementDetails);
document.getElementById('stockHistoryModal')?.addEventListener('hidden.bs.modal', closeMovementDetails);
