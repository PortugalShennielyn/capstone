import PharmaUtils from '../utils.js';
import { configureResizableModal, resetResizableModal } from './modal_size.js?v=2';
import { createLiveSync, publishDataUpdate } from './live_data.js?v=1';
import { cleanProductSpecificationText, formatProductIdentityParts, inventoryMedicineSpecificationParts, isPrescriptionProduct } from './product_specification.js?v=11';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';
const EXPIRY_SYNC_KEY = 'drpInventoryExpiryChanged';
const expiryChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('drp-inventory-expiry') : null;
const PRODUCT_IDENTITY_SEPARATOR = PharmaUtils.productIdentitySeparator || ' \u2022 ';

const stockThresholds = { storageLow: 30, shelfLow: 10, critical: 15 };
let inventoryRows = [];
let inventoryLoaded = false;
let activeDetailsProductId = null;
let lastDetailsTrigger = null;
let inventoryActorRole = '';
let inventoryView = 'storage';
let activeTransferOptions = null;
let activeTransferRequestId = '';
let transferHistoryRows = [];
const selectedPrProductIds = new Set();
const historyState = { productId: null, product: null, movements: [], filtered: [], page: 1, pageSize: 10 };

const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

function highlightSearchText(value, searchTerm) {
    const text = String(value ?? '');
    const term = String(searchTerm ?? '').trim();
    if (!term) return esc(text);
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`(${escapedTerm})`, 'ig');
    return text.split(matcher).map((part, index) => index % 2
        ? `<mark class="search-match">${esc(part)}</mark>`
        : esc(part)).join('');
}

async function fetchJson(url, options = {}) {
    return PharmaUtils.safeFetch(url, { credentials: 'include', ...options });
}

function cleanText(value, fallback = 'N/A') {
    const text = String(value ?? '').trim();
    return text ? text : fallback;
}

function inventoryUnitLabel(unit, quantity = 1) {
    const raw = cleanText(unit, 'unit');
    const normalized = raw.toLowerCase().replaceAll('.', '').trim();
    const singular = ['pc', 'pcs', 'piece', 'pieces', 'each'].includes(normalized)
        ? 'Piece'
        : raw.replace(/\bpack\b/ig, 'Pack').replace(/^./, (letter) => letter.toUpperCase());
    if (Number(quantity) === 1) return singular;
    if (/s$/i.test(singular)) return singular;
    if (/(?:x|z|ch|sh)$/i.test(singular)) return `${singular}es`;
    return `${singular}s`;
}

function inventoryQuantityLabel(quantity, unit) {
    return `${Number(quantity || 0).toLocaleString('en-PH')} ${inventoryUnitLabel(unit, Number(quantity || 0))}`;
}

function meaningful(value) {
    const text = String(value ?? '').trim();
    const normalized = text.toLowerCase();
    const invalidValues = new Set(['', 'n/a', 'not provided', 'null', 'undefined', 'none', '-', '\u2013', '\u2014']);
    const containsMojibakeDash = text.includes('\u00e2\u20ac') || text.includes('\u00c3\u00a2');
    return invalidValues.has(normalized) || containsMojibakeDash ? '' : text;
}

function normalizeDisplayText(value) {
    return PharmaUtils.normalizeDisplayText(value);
}

function pretty(value) {
    const text = normalizeDisplayText(value);
    return text && !/\d/.test(text) && text === text.toLowerCase()
        ? text.charAt(0).toUpperCase() + text.slice(1)
        : text;
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

function productIdentityParts(row) {
    const parts = formatProductIdentityParts(row);
    const isMedicine = meaningful(row?.category_name).toLowerCase() === 'medicine';
    const genericName = meaningful(row?.generic_name);
    const productName = meaningful(row?.product_name);
    const primary = isMedicine && genericName ? genericName : (parts.productName || productName || genericName);
    const secondary = !isMedicine && parts.genericName && parts.genericName.toLowerCase() !== String(primary || '').toLowerCase()
        ? parts.genericName
        : '';
    return { primary, secondary };
}

function productIdentityText(row, fallback = '') {
    const { primary, secondary } = productIdentityParts(row);
    return uniqueParts([primary, secondary]).join(' ') || fallback;
}

function renderProductIdentityCell(row, searchTerm) {
    const { primary, secondary } = productIdentityParts(row);
    if (!primary && !secondary) return '<span class="text-muted">—</span>';
    const badge = isPrescriptionProduct(row) ? '<span class="inventory-rx-badge" title="Prescription medicine">Rx</span>' : '';
    return `
        ${primary ? `<div class="inventory-product-name">${highlightSearchText(primary, searchTerm)}${badge}</div>` : ''}
        ${secondary ? `<div class="inventory-generic-name">${highlightSearchText(secondary, searchTerm)}</div>` : ''}
    `;
}

function joinedMeasurement(value, unit) {
    const rawAmount = meaningful(normalizeDisplayText(value));
    const amount = rawAmount && Number.isFinite(Number(rawAmount)) ? String(Number(rawAmount)) : rawAmount;
    const rawLabel = meaningful(normalizeDisplayText(unit));
    const label = {
        ml: 'mL',
        l: 'L',
        mg: 'mg',
        mcg: 'mcg',
        g: 'g',
        kg: 'kg',
        iu: 'IU',
        '%': '%'
    }[rawLabel.toLowerCase()] || rawLabel;
    return amount ? `${amount}${label ? (label === '%' ? label : ` ${label}`) : ''}` : '';
}

function formatProductIdentity(parts) {
    return PharmaUtils.formatProductIdentity(parts);
}

function buildInventorySpecification(product) {
    const normalizedSpecification = meaningful(cleanProductSpecificationText(product.normalized_specification));
    if (normalizedSpecification) return normalizedSpecification;
    const category = meaningful(product.category_name).toLowerCase();
    let candidates;

    if (category === 'medicine') {
        candidates = [
            joinedMeasurement(product.strength_value, product.strength_unit) || meaningful(product.strength),
            joinedMeasurement(product.net_content_value, product.net_content_unit),
            product.dosage_form,
            product.package_type
        ];
    } else if (category === 'medical supply' || category === 'medical supplies') {
        candidates = [
            product.medical_variant,
            product.medical_size,
            product.material,
            product.sterile_status,
            product.medical_package_type || product.package_type,
            product.medical_pack_content
        ];
    } else {
        const netWeight = joinedMeasurement(product.net_weight, product.unit);
        candidates = [
            product.variant,
            netWeight ? '' : product.size,
            netWeight,
            product.package_type
        ];
    }

    const parts = uniqueParts(candidates.map(meaningful));
    return parts.join(PRODUCT_IDENTITY_SEPARATOR) || 'No specification available';
}

function inventorySpecificationMarkup(product, searchTerm = '') {
    const parts = inventoryMedicineSpecificationParts(product);
    if (!parts) return `<span class="specification-cell" title="${esc(buildInventorySpecification(product))}">${highlightSearchText(buildInventorySpecification(product), searchTerm)}</span>`;
    const form = parts.dosageForm.toLowerCase();
    const icon = /powder/.test(form) ? 'fa-solid fa-flask'
        : /suspension|syrup|solution|drops|liquid/.test(form) ? 'fa-solid fa-droplet'
        : /supplement|vitamin/.test(form) ? 'fa-solid fa-leaf'
        : /capsule/.test(form) ? 'fa-solid fa-capsules' : 'fa-regular fa-circle-dot';
    return `<span class="inventory-catalog-specification">
        ${parts.dosageForm ? `<span class="inventory-specification-form"><i class="${icon}" aria-hidden="true"></i>${highlightSearchText(parts.dosageForm, searchTerm)}</span>` : ''}
        ${parts.strength ? `<strong class="inventory-specification-strength">${highlightSearchText(parts.strength, searchTerm)}</strong>` : ''}
        ${parts.details ? `<span class="inventory-specification-details">${highlightSearchText(parts.details, searchTerm)}</span>` : ''}
    </span>`;
}

function formatDate(value, fallback = '-') {
    if (!value) return fallback;
    const raw = String(value).trim();
    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'PHP' });
}

function formatDateTime(value, fallback = '-') {
    if (!value) return fallback;
    const date = new Date(String(value).trim().replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
}

function statusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'safe') return 'status-safe';
    if (normalized === 'expiring soon') return 'status-soon';
    if (normalized === 'expired') return 'status-expired';
    return 'status-na';
}

function applyStockThresholds(value) {
    const previous = JSON.stringify(stockThresholds);
    const storageLow = Number(value?.storageLow);
    const shelfLow = Number(value?.shelfLow);
    const critical = Number(value?.critical);
    if (Number.isInteger(storageLow) && storageLow >= 0) stockThresholds.storageLow = storageLow;
    if (Number.isInteger(shelfLow) && shelfLow >= 0) stockThresholds.shelfLow = shelfLow;
    if (Number.isInteger(critical) && critical >= 0) stockThresholds.critical = critical;
    return JSON.stringify(stockThresholds) !== previous;
}

function stockLevelTag(quantity, location) {
    if (location !== 'shelf' && location !== 'storage') return '';
    const qty = Number(quantity || 0);
    const low = location === 'shelf' ? stockThresholds.shelfLow : stockThresholds.storageLow;
    const place = location === 'shelf' ? 'Shelf' : 'Storage';
    if (qty <= 0) {
        return `<span class="qty-stock-tag is-out" title="${esc(place)} quantity is zero">Out of Stock</span>`;
    }
    if (qty <= stockThresholds.critical) {
        return `<span class="qty-stock-tag is-critical" title="${esc(place)} quantity is at or below the critical level of ${esc(stockThresholds.critical)}">Critical</span>`;
    }
    if (qty <= low) {
        return `<span class="qty-stock-tag is-low" title="${esc(place)} quantity is at or below the low stock level of ${esc(low)}">Low Stock</span>`;
    }
    return '';
}

function inventoryQuantityCell(quantity, unitName, location, extraClass = '') {
    const qty = Number(quantity || 0);
    return `<td class="inventory-col-qty${extraClass ? ` ${extraClass}` : ''}"><div class="qty-stack"><span class="qty-number">${esc(qty)}</span><small class="d-block text-muted">${esc(inventoryUnitLabel(unitName, qty))}</small>${stockLevelTag(qty, location)}</div></td>`;
}

function statusBadge(status) {
    const label = cleanText(status);
    return `<span class="status-badge expiry-badge ${statusClass(label)}">${esc(label)}</span>`;
}

function formatStatusLabel(status) {
    const label = cleanText(status, 'Active');
    return label.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function productStatusBadge(status, includeSellableNote = false) {
    const inactive = String(status || '').trim().toLowerCase() === 'inactive';
    const label = inactive && includeSellableNote ? 'Inactive — Not Sellable' : (inactive ? 'Inactive' : 'Active');
    return `<span class="inventory-product-status ${inactive ? 'is-inactive' : 'is-active'}">${esc(label)}</span>`;
}

function batchStatusClass(status) {
    return `batch-status-${String(status || 'active').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function batchStatusBadge(status) {
    const label = formatStatusLabel(status);
    return `<span class="batch-status-badge ${esc(batchStatusClass(label))}">${esc(label)}</span>`;
}

function batchBadge(label, className = 'batch-neutral') {
    return `<span class="batch-badge ${className}">${esc(label)}</span>`;
}

function renderBatchBadges(batch) {
    const badges = [];
    if (batch.use_first) badges.push(batchBadge('Use First', 'batch-use-first'));
    if (batch.is_new_batch) badges.push(batchBadge('New Batch', 'batch-new'));
    if (batch.is_old_batch) badges.push(batchBadge('Old Batch', 'batch-old'));
    if (batch.status === 'Expiring Soon') badges.push(batchBadge('Expiring Soon', 'batch-soon'));
    if (batch.status === 'Expired') badges.push(batchBadge('Expired', 'batch-expired'));
    return badges.length ? `<div class="batch-badge-row">${badges.join('')}</div>` : '';
}

function rowById(productId) {
    return inventoryRows.find((row) => String(row.product_id) === String(productId));
}

function isInactiveProduct(row) {
    return String(row?.product_status || 'Active').toLowerCase() === 'inactive';
}

function roleFromSession(session) {
    return String(session?.access_role || session?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function canCreatePurchaseRequest() {
    return ['super_admin', 'admin', 'manager'].includes(inventoryActorRole);
}

function isSalesClerkInventoryView() {
    return inventoryActorRole === 'salesclerk';
}

function applyRoleInventoryChrome() {
    const salesClerk = isSalesClerkInventoryView();
    document.getElementById('inventorySummaryCards')?.toggleAttribute('hidden', salesClerk);
    document.querySelector('[data-inventory-view="history"]')?.toggleAttribute('hidden', salesClerk);
    if (salesClerk && inventoryView !== 'storage') {
        inventoryView = 'storage';
        document.querySelectorAll('.inventory-view-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.inventoryView === 'storage');
        });
    }
}

function normalizeStockStatus(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const aliases = { out: 'out_of_stock', low: 'low_stock', healthy: 'in_stock', expiring: 'expiring_soon', available: 'in_stock' };
    const candidate = aliases[normalized] || normalized;
    return ['all', 'in_stock', 'low_stock', 'out_of_stock', 'expiring_soon', 'expired'].includes(candidate) ? candidate : 'all';
}

function matchesStockStatus(row, stockStatus) {
    if (stockStatus === 'all') return true;
    if (stockStatus === 'expiring_soon') {
        return row.has_expiring_batch === true || Number(row.has_expiring_batch) === 1 || row.expiry_status === 'Expiring Soon';
    }
    if (stockStatus === 'expired') return Number(row.has_expired_batch) === 1;
    return normalizeStockStatus(row.stock_status) === stockStatus;
}

function filteredInventoryRows() {
    const search = String(document.getElementById('inventorySearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('inventoryProductStatusFilter')?.value || 'all';
    const stockStatus = normalizeStockStatus(document.getElementById('inventoryStockStatusFilter')?.value || 'all');
    return inventoryRows.filter((row) => {
        if (inventoryView === 'storage' && stockStatus === 'all' && Number(row.has_expiry_pullout) === 1
            && Number(row.storage_quantity || 0) + Number(row.shelf_quantity || 0) === 0) return false;
        const rowStatus = isInactiveProduct(row) ? 'Inactive' : 'Active';
        const isActiveStockAlert = stockStatus === 'low_stock' || stockStatus === 'out_of_stock';
        const haystack = [
            row.brand_name, productIdentityText(row), row.barcode, row.category_name, row.type_name, buildInventorySpecification(row)
        ].join(' ').toLowerCase();
        return (status === 'all' || status === rowStatus)
            && (!isActiveStockAlert || rowStatus === 'Active')
            && matchesStockStatus(row, stockStatus)
            && (!search || haystack.includes(search));
    });
}

function currentStockStatusFilter() {
    return normalizeStockStatus(document.getElementById('inventoryStockStatusFilter')?.value || 'all');
}

function isPrSelectionMode() {
    return canCreatePurchaseRequest() && ['low_stock', 'out_of_stock'].includes(currentStockStatusFilter());
}

function isPrEligible(row) {
    return !isInactiveProduct(row) && ['low_stock', 'out_of_stock'].includes(normalizeStockStatus(row.stock_status));
}

async function showNoStorageStockModal(row) {
    const productId = String(row?.product_id || '');
    const unit = cleanText(row?.inventory_unit_symbol || row?.inventory_unit_name, 'unit');
    const canCreate = canCreatePurchaseRequest();
    const result = await Swal.fire({
        title: 'No stock available in Storage.',
        html: `
            <div class="text-start">
                <p class="mb-2"><strong>${esc(productIdentityText(row, 'Product'))}</strong></p>
                <p class="mb-2">Shelf Qty: <strong>${esc(inventoryQuantityLabel(Number(row?.shelf_quantity || 0), unit))}</strong></p>
                <p class="mb-2">Stock Status: <strong>${esc(formatStatusLabel(row?.stock_status || 'out of stock'))}</strong></p>
                <p class="mb-0">Replenishment must begin with a Purchase Requisition (PR).</p>
            </div>
        `,
        icon: 'info',
        showCancelButton: true,
        showConfirmButton: canCreate,
        confirmButtonText: 'Create PR',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#4f46e5'
    });
    if (result.isConfirmed && canCreate && productId) {
        window.location.href = `purchase_requests.html?${new URLSearchParams({ create: '1', source: 'inventory', product_id: productId, product_ids: productId })}`;
    }
}

function applyInventoryFilters() {
    if (inventoryView === 'history') {
        const search = String(document.getElementById('inventorySearch')?.value || '').trim().toLowerCase();
        const from = document.getElementById('transferHistoryFrom')?.value || '';
        const to = document.getElementById('transferHistoryTo')?.value || '';
        renderGlobalTransferHistory(transferHistoryRows.filter((row) => {
            const transferDate = String(row.created_at || '').slice(0, 10);
            const matchesSearch = !search || [row.brand_name,productIdentityText(row),buildInventorySpecification(row),row.selected_unit,row.source_location,row.destination_location,row.allocations].join(' ').toLowerCase().includes(search);
            return matchesSearch && (!from || transferDate >= from) && (!to || transferDate <= to);
        }));
        return;
    }
    renderInventory(filteredInventoryRows());
}

function transferAllocationMarkup(value) {
    const raw = cleanText(value, '-');
    if (raw === '-') return '<span class="text-muted">—</span>';

    return raw.split(/;\s*/).filter(Boolean).map((allocation) => {
        const parsed = allocation.match(/^(.*?)\s+\(([\d.,]+)\s+([^,()]+?)(?:,\s*exp\s+(\d{4}-\d{2}-\d{2}))?\)$/i);
        if (!parsed) return `<div class="inventory-history-allocation" title="${esc(allocation)}"><strong>Batch allocation</strong><small>${esc(allocation)}</small></div>`;
        const [, reference, quantity, unit, expiryDate] = parsed;
        const batchMatch = reference.match(/(?:^|[-_])(B\d+)$/i);
        const poMatch = reference.match(/PO[-_]?(\d{8})(\d{6})/i);
        const batchLabel = batchMatch ? `Batch ${batchMatch[1].toUpperCase()}` : 'Batch allocation';
        const poLabel = poMatch ? `PO-${poMatch[1]}-${poMatch[2]}` : '';
        const expiryLabel = expiryDate ? ` • Exp ${formatDate(expiryDate)}` : '';
        return `<div class="inventory-history-allocation" title="${esc(reference)}"><strong>${esc(batchLabel)}</strong><span>${esc(inventoryQuantityLabel(Number(String(quantity).replaceAll(',', '')), unit))}${esc(expiryLabel)}</span>${poLabel ? `<small>${esc(poLabel)}</small>` : ''}</div>`;
    }).join('');
}

function syncInventoryViewControls() {
    applyRoleInventoryChrome();
    const historyActive = inventoryView === 'history';
    document.querySelectorAll('.inventory-only-filter').forEach((field) => { field.hidden = historyActive; });
    document.querySelectorAll('.history-only-filter').forEach((field) => { field.hidden = !historyActive; });
    const filters = document.querySelector('.inventory-filters');
    filters?.classList.toggle('is-history', historyActive);
    const search = document.getElementById('inventorySearch');
    const label = document.querySelector('label[for="inventorySearch"]');
    if (search) search.placeholder = historyActive ? 'Search transfer history' : 'Search product, brand, specification, type, or barcode';
    if (label) label.textContent = historyActive ? 'Search Transfer History' : 'Search Inventory';
}

function renderGlobalTransferHistory(rows) {
    const inventoryWrap = document.querySelector('.inventory-table-wrap');
    let historyWrap = document.getElementById('globalTransferHistory');
    if (!historyWrap) {
        historyWrap = document.createElement('div');
        historyWrap.id = 'globalTransferHistory';
        historyWrap.className = 'table-responsive';
        inventoryWrap?.insertAdjacentElement('afterend', historyWrap);
    }
    if (inventoryWrap) inventoryWrap.hidden = true;
    historyWrap.hidden = false;
    historyWrap.innerHTML = `<table class="table table-hover align-middle inventory-table"><thead><tr><th>Date</th><th>Brand</th><th>Product</th><th>Specification</th><th>Movement</th><th>Selected Qty</th><th>Inventory Qty</th><th>Batch / Expiry Allocation</th></tr></thead><tbody>${rows.length ? rows.map((row) => `<tr><td>${esc(formatDateTime(row.created_at))}</td><td>${esc(row.brand_name || '-')}</td><td>${esc(productIdentityText(row, '-'))}</td><td><span class="history-specification">${esc(buildInventorySpecification(row))}</span></td><td><span class="status-badge status-safe">${esc(row.source_location)} → ${esc(row.destination_location)}</span></td><td>${esc(inventoryQuantityLabel(row.selected_quantity, row.selected_unit))}</td><td>${esc(inventoryQuantityLabel(row.base_quantity, row.base_unit))}</td><td>${transferAllocationMarkup(row.allocations)}</td></tr>`).join('') : '<tr><td class="empty-row" colspan="8">No inventory transfers recorded.</td></tr>'}</tbody></table>`;
    const historyTable = historyWrap.querySelector('table');
    const historyColumnClasses = ['inventory-history-col-date', 'inventory-history-col-brand', 'inventory-history-col-product', 'inventory-history-col-specification', 'inventory-history-col-movement', 'inventory-history-col-selected', 'inventory-history-col-base', 'inventory-history-col-allocation'];
    historyTable?.classList.add('inventory-history-table');
    historyTable?.querySelectorAll('tr').forEach((row) => {
        if (row.children.length !== historyColumnClasses.length) return;
        Array.from(row.children).forEach((cell, index) => cell.classList.add(historyColumnClasses[index] || ''));
    });
}

async function loadGlobalTransferHistory() {
    const data = await fetchJson(`${API_BASE_URL}/inventory/get_transfer_history.php?t=${Date.now()}`);
    transferHistoryRows = data.data || [];
    applyInventoryFilters();
}

function renderInventorySummary(rows) {
    const container = document.getElementById('inventorySummaryCards');
    if (!container) return;

    const summary = rows.reduce((totals, row) => {
        const storage = Number(row.storage_quantity || 0);
        const shelf = Number(row.shelf_quantity || 0);
        const total = storage + shelf;
        totals.total += total;
        totals.storage += storage;
        totals.shelf += shelf;
        totals.expired += Number(row.has_expired_batch) === 1 ? 1 : 0;
        totals.value += Number(row.inventory_value || 0);
        if (normalizeStockStatus(row.stock_status) === 'low_stock') totals.lowStock += 1;
        if (normalizeStockStatus(row.stock_status) === 'out_of_stock') totals.outOfStock += 1;
        if (row.has_expiring_batch === true || Number(row.has_expiring_batch) === 1 || row.expiry_status === 'Expiring Soon') totals.expiringSoon += 1;
        return totals;
    }, {
        total: 0,
        storage: 0,
        shelf: 0,
        expired: 0,
        lowStock: 0,
        outOfStock: 0,
        expiringSoon: 0,
        value: 0
    });

    const cards = [
        ['Total Inventory', summary.total, '#7c3aed', 'fa-solid fa-boxes-stacked'],
        ['Storage Stock', summary.storage, '#2563eb', 'fa-solid fa-warehouse'],
        ['Selling/Shelf Stock', summary.shelf, '#16a34a', 'fa-solid fa-cart-shopping'],
        ['Expired', summary.expired, '#dc2626', 'fa-solid fa-hourglass-half'],
        ['Low Stock', summary.lowStock, '#f59e0b', 'fa-solid fa-arrow-down'],
        ['Out of Stock', summary.outOfStock, '#dc2626', 'fa-solid fa-box-open'],
        ['Expiring Soon', summary.expiringSoon, '#d97706', 'fa-regular fa-clock'],
        ['Inventory Value', formatMoney(summary.value), '#0891b2', 'fa-solid fa-peso-sign']
    ];

    container.innerHTML = cards.map(([label, value, color, icon]) => {
        const isExpiryCard = label === 'Expired';
        const tag = isExpiryCard ? 'a' : 'div';
        return `
        <${tag} class="inventory-summary-card ${label === 'Inventory Value' ? 'is-value-card' : ''} ${isExpiryCard ? 'is-link-card' : ''}" style="--summary-color:${color}" ${isExpiryCard ? 'href="expiry_monitoring.html" aria-label="Open Expiry Monitoring for expired products" title="Products with expired stock"' : ''}>
            <span class="inventory-summary-icon"><i class="${esc(icon)}"></i></span>
            <span class="inventory-summary-content">
                <p>${esc(label)}</p>
                <strong>${esc(value)}</strong>
            </span>
        </${tag}>
    `;
    }).join('');
}

function updatePrSelectionControls(rows) {
    const selectionMode = isPrSelectionMode();
    const table = document.getElementById('table-inventory');
    const toolbar = document.getElementById('inventoryPrToolbar');
    const selectAll = document.getElementById('inventoryPrSelectAll');
    const createButton = document.getElementById('createInventoryPrButton');
    const countLabel = document.getElementById('inventoryPrSelectionCount');
    const eligibleVisibleIds = rows.filter(isPrEligible).map((row) => String(row.product_id));
    const eligibleAllIds = new Set(inventoryRows.filter((row) => isPrEligible(row) && matchesStockStatus(row, currentStockStatusFilter())).map((row) => String(row.product_id)));

    for (const productId of selectedPrProductIds) {
        if (!eligibleAllIds.has(productId)) selectedPrProductIds.delete(productId);
    }

    table?.classList.toggle('pr-selection-mode', selectionMode);
    if (toolbar) toolbar.hidden = !selectionMode;
    if (selectAll) selectAll.hidden = !selectionMode;
    if (countLabel) countLabel.textContent = `${selectedPrProductIds.size} ${selectedPrProductIds.size === 1 ? 'product' : 'products'} selected`;
    if (createButton) createButton.disabled = selectedPrProductIds.size === 0;
    if (selectAll) {
        const selectedVisible = eligibleVisibleIds.filter((productId) => selectedPrProductIds.has(productId)).length;
        selectAll.checked = eligibleVisibleIds.length > 0 && selectedVisible === eligibleVisibleIds.length;
        selectAll.indeterminate = selectedVisible > 0 && selectedVisible < eligibleVisibleIds.length;
        selectAll.disabled = eligibleVisibleIds.length === 0;
    }
}

function renderInventoryTableHeader() {
    const table = document.getElementById('table-inventory');
    const head = document.querySelector('#table-inventory thead');
    if (!table || !head) return;
    table.classList.toggle('inventory-storage-table', inventoryView === 'storage');
    table.classList.toggle('inventory-shelf-table', inventoryView === 'shelf');
    const selectAll = inventoryView === 'storage'
        ? '<input class="form-check-input me-1" id="inventoryPrSelectAll" type="checkbox" aria-label="Select all eligible inventory products" hidden>'
        : '';
    const common = `<th class="inventory-col-brand">${selectAll}Brand</th><th class="inventory-col-product">Product</th><th class="inventory-col-specification">Specification</th>`;
    head.innerHTML = inventoryView === 'shelf'
        ? `<tr>${common}<th class="inventory-col-qty">Shelf<br>Qty</th><th class="inventory-col-qty">Storage<br>Qty</th><th class="inventory-col-expiry">Nearest<br>Expiry</th><th class="inventory-col-status">POS Status</th><th class="inventory-col-action">Action</th></tr>`
        : `<tr>${common}<th class="inventory-col-qty">Storage<br>Qty</th><th class="inventory-col-qty">Shelf<br>Qty</th><th class="inventory-col-qty">On Hand</th><th class="inventory-col-expiry">Nearest<br>Expiry</th><th class="inventory-col-action">Action</th></tr>`;
}

function renderInventory(rows) {
    const inventoryWrap = document.querySelector('.inventory-table-wrap');
    const historyWrap = document.getElementById('globalTransferHistory');
    if (inventoryWrap) inventoryWrap.hidden = false;
    if (historyWrap) historyWrap.hidden = true;
    renderInventoryTableHeader();
    const body = document.querySelector('#table-inventory tbody');
    if (!body) return;

    applyRoleInventoryChrome();
    if (isSalesClerkInventoryView()) {
        document.getElementById('inventorySummaryCards')?.replaceChildren();
    } else {
        renderInventorySummary(inventoryRows.filter((row) => !isInactiveProduct(row)));
    }
    updatePrSelectionControls(rows);

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty-row">No received inventory records found.</td></tr>';
        return;
    }

    const searchTerm = String(document.getElementById('inventorySearch')?.value || '').trim();
    body.innerHTML = rows.map((row) => {
        const productId = esc(row.product_id);
        const inactive = isInactiveProduct(row);
        const storageQty = Number(row.storage_quantity || 0);
        const shelfQty = Number(row.shelf_quantity || 0);
        const inventoryUnit = cleanText(row.inventory_unit_name || row.inventory_unit_symbol, 'unit');
        const selectionControl = isPrSelectionMode()
            ? `<input class="form-check-input inventory-pr-checkbox me-1" type="checkbox" aria-label="Select ${esc(productIdentityText(row, 'product'))} for purchase request" data-product-id="${productId}" ${selectedPrProductIds.has(String(row.product_id)) ? 'checked' : ''}>`
            : '';
        const transferDirection = inventoryView === 'shelf' ? 'SHELF_TO_STORAGE' : 'STORAGE_TO_SHELF';
        const sourceQty = transferDirection === 'SHELF_TO_STORAGE' ? shelfQty : storageQty;
        const transferLabel = transferDirection === 'SHELF_TO_STORAGE' ? 'Return to Storage' : 'Transfer to Shelf';
        const transferClass = transferDirection === 'SHELF_TO_STORAGE' ? 'return-storage-btn' : 'move-selling-btn';
        const moveButton = inactive
            ? `<button class="btn btn-sm btn-outline-primary move-selling-btn" type="button" title="Reactivate this product before transferring stock." aria-label="${transferLabel} unavailable for inactive product" data-product-id="${productId}" disabled><i class="fa-solid fa-right-left"></i></button>`
            : `<button class="btn btn-sm btn-outline-primary ${transferClass}" type="button" title="${transferLabel}" aria-label="${transferLabel}" data-product-id="${productId}" data-direction="${transferDirection}"><i class="fa-solid fa-right-left"></i></button>`;
        const expiry = `<div class="expiry-cell">${statusBadge(row.expiry_status)}<span class="expiry-date">${esc(formatDate(row.nearest_expiry_date))}</span></div>`;
        const action = `<td class="inventory-col-action inventory-actions-column"><div class="table-actions">${moveButton}<button class="btn btn-sm btn-outline-secondary view-inventory-btn" type="button" title="View Details" aria-label="View Details" data-product-id="${productId}"><i class="fa-regular fa-eye"></i></button><button class="btn btn-sm btn-outline-secondary history-btn" type="button" title="View Stock Movement History" aria-label="View Stock Movement History" data-product-id="${productId}"><i class="fa-solid fa-clock-rotate-left"></i></button></div></td>`;
        const locationCells = inventoryView === 'shelf'
            ? `${inventoryQuantityCell(shelfQty, inventoryUnit, 'shelf')}${inventoryQuantityCell(storageQty, inventoryUnit, 'storage')}<td class="inventory-col-expiry">${expiry}</td><td class="inventory-col-status"><span class="pos-status ${shelfQty > 0 && !inactive ? 'is-available' : 'is-unavailable'}">${shelfQty > 0 && !inactive ? 'Available' : 'Unavailable'}</span></td>${action}`
            : `${inventoryQuantityCell(storageQty, inventoryUnit, 'storage')}${inventoryQuantityCell(shelfQty, inventoryUnit, 'shelf')}${inventoryQuantityCell(storageQty + shelfQty, inventoryUnit, 'onhand', 'inventory-on-hand')}<td class="inventory-col-expiry">${expiry}</td>${action}`;

        const rowClasses = [inactive ? 'is-inactive' : '', searchTerm ? 'has-search-match' : ''].filter(Boolean).join(' ');
        return `
            <tr data-product-id="${productId}" class="${rowClasses}">
                <td class="inventory-col-brand inventory-brand-column">${selectionControl}<span class="brand-cell">${highlightSearchText(cleanText(row.brand_name), searchTerm)}</span></td>
                <td class="inventory-col-product inventory-product-column">
                    <span class="product-cell">${renderProductIdentityCell(row, searchTerm)}</span>
                </td>
                <td class="inventory-col-specification inventory-specification-column">${inventorySpecificationMarkup(row, searchTerm)}</td>
                ${locationCells}
            </tr>
        `;
    }).join('');
    window.dispatchEvent(new CustomEvent('drp:tables-updated'));
}

function focusLinkedInventoryProduct() {
    const requestedProductId = new URLSearchParams(window.location.search).get('product_id');
    if (!requestedProductId) return;

    const row = Array.from(document.querySelectorAll('#table-inventory tbody tr[data-product-id]'))
        .find((candidate) => String(candidate.dataset.productId) === String(requestedProductId));
    if (!row) return;

    document.querySelectorAll('#table-inventory tbody tr.is-selected').forEach((candidate) => candidate.classList.remove('is-selected'));
    row.classList.add('is-selected');
    row.setAttribute('aria-current', 'true');
    window.requestAnimationFrame(() => row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }));
}

async function loadInventory() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/inventory/get_inventory.php?t=${Date.now()}`);
        const nextRows = data.data || [];
        const thresholdsChanged = applyStockThresholds(data.stockThresholds);
        if (inventoryLoaded && !thresholdsChanged && JSON.stringify(nextRows) === JSON.stringify(inventoryRows)) return;
        inventoryRows = nextRows;
        inventoryLoaded = true;
        applyInventoryFilters();
        focusLinkedInventoryProduct();
        if (activeDetailsProductId && document.getElementById('inventoryDetailsModal')?.classList.contains('show')) {
            openDetails(activeDetailsProductId, false);
        }
    } catch (error) {
        inventoryRows = [];
        renderInventory([]);
        PharmaUtils.toast.error(error.message);
    }
}

function stockSummaryItem(label, value, tag = '') {
    return `<div class="inventory-stock-summary-item"><span>${esc(label)}</span><strong>${esc(value)}</strong>${tag}</div>`;
}

function quantityWithUnit(quantity, unit) {
    const cleanUnit = cleanText(unit, 'unit');
    const suffix = Number(quantity) === 1 || cleanUnit.endsWith('s') ? cleanUnit : `${cleanUnit}s`;
    return `${Number(quantity).toLocaleString('en-PH')} ${suffix}`;
}

function infoItem(label, value) {
    return `<div class="inventory-info-item"><span>${esc(label)}</span><strong>${esc(cleanText(normalizeDisplayText(value), 'Not recorded'))}</strong></div>`;
}

function batchPriorityMarkup(batch) {
    const badges = [];
    if (batch.use_first) badges.push(batchBadge('Use First', 'batch-use-first'));
    if (batch.is_new_batch) badges.push(batchBadge('New Batch', 'batch-new'));
    if (batch.is_old_batch) badges.push(batchBadge('Old Batch', 'batch-old'));
    return badges.length ? `<div class="batch-priority-list">${badges.join('')}</div>` : '';
}

function tableRows(rows, emptyText, renderer, colspan = 8) {
    if (!rows?.length) {
        return `<tr><td colspan="${esc(colspan)}" class="text-center text-muted py-4">${esc(emptyText)}</td></tr>`;
    }
    return rows.map(renderer).join('');
}

function openDetails(productId, show = true) {
    const row = rowById(productId);
    if (!row) return;
    activeDetailsProductId = row.product_id;
    const productSpecification = buildInventorySpecification(row);
    const storageQty = Number(row.storage_quantity || 0);
    const shelfQty = Number(row.shelf_quantity || 0);
    const inventoryUnit = cleanText(row.inventory_unit_symbol || row.inventory_unit_name, 'unit');
    const damagedQty = Number(row.damaged_quantity || 0);
    const returnedQty = (row.batches || []).reduce((total, batch) => total + Number(batch.returned_qty || 0), 0);
    const onHandQty = storageQty + shelfQty;
    const inactive = isInactiveProduct(row);
    const hasReturned = returnedQty > 0 || (row.batches || []).some((batch) => Object.prototype.hasOwnProperty.call(batch, 'returned_qty'));
    const subtitle = document.getElementById('inventoryDetailsSubtitle');
    if (subtitle) subtitle.textContent = formatProductIdentity([row.brand_name, productIdentityText(row), productSpecification]);
    const statusContainer = document.getElementById('inventoryDetailsProductStatus');
    if (statusContainer) {
        statusContainer.innerHTML = `<strong>Product Status:</strong> ${productStatusBadge(row.product_status, true)}`;
    }
    document.getElementById('inventoryInactiveWarning')?.remove();
    if (statusContainer && inactive) {
        statusContainer.insertAdjacentHTML('afterend', '<div id="inventoryInactiveWarning" class="inventory-inactive-warning"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span>This product is inactive and cannot be sold. Existing stock and batch records are retained for inventory tracking.</span></div>');
    }
    const stockCards = document.getElementById('inventoryHeaderStockCards');
    if (stockCards) {
        stockCards.innerHTML = `
            ${stockSummaryItem('Storage Stock', quantityWithUnit(storageQty, inventoryUnit), stockLevelTag(storageQty, 'storage'))}
            ${stockSummaryItem('Shelf Stock', quantityWithUnit(shelfQty, inventoryUnit), stockLevelTag(shelfQty, 'shelf'))}
            ${stockSummaryItem('On Hand', quantityWithUnit(onHandQty, inventoryUnit))}
            ${stockSummaryItem('Damaged', quantityWithUnit(damagedQty, inventoryUnit))}
            ${stockSummaryItem('Returned', quantityWithUnit(hasReturned ? returnedQty : 0, inventoryUnit))}
            ${stockSummaryItem('Nearest Expiry', formatDate(row.nearest_expiry_date))}
        `;
    }

    document.getElementById('inventoryDetails').innerHTML = `
        <div class="inventory-details-record">
            <section class="inventory-flat-section product-identity-section">
                <h6>Product Information</h6>
                <div class="inventory-info-grid">
                    ${infoItem('Brand', row.brand_name)}
                    ${infoItem('Product', productIdentityText(row))}
                    ${infoItem('Generic Name', row.generic_name)}
                    ${infoItem('Category', row.category_name)}
                    ${infoItem('Product Type', row.type_name)}
                    ${infoItem('Specification', productSpecification)}
                    ${infoItem('Strength', meaningful(row.strength) || joinedMeasurement(row.strength_value, row.strength_unit))}
                    ${infoItem('Net Content', joinedMeasurement(row.net_content_value, row.net_content_unit) || joinedMeasurement(row.net_weight, row.unit) || row.size)}
                    ${infoItem('Dosage Form', row.dosage_form)}
                    ${infoItem('Packaging', row.package_type)}
                    ${infoItem('Selling / Inventory Unit', inventoryUnit)}
                </div>
            </section>

            <section class="inventory-flat-section batch-inventory-section">
                <h6>Batch Inventory</h6>
                <div class="batch-table-wrapper">
                <table class="table modal-table inventory-batch-table align-middle">
                    <thead>
                        <tr>
                            <th class="batch-number-cell">Batch Number</th>
                            <th class="po-reference-cell">PO Reference</th>
                            <th class="supplier-cell">Supplier</th>
                            <th class="received-date-cell">Received</th>
                            <th class="expiry-date-cell">Expiry</th>
                            <th>Storage</th>
                            <th>Shelf</th>
                            <th class="batch-status-column">Batch Status</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows(row.batches, 'No active inventory batches found for this product.', (batch) => `
                        <tr class="batch-status-${statusClass(batch.status)}">
                            <td class="batch-number-cell"><div class="batch-primary"><strong title="${esc(batch.batch_number || batch.batch_id)}">${esc(batch.batch_number || batch.batch_id)}</strong>${batchPriorityMarkup(batch)}</div></td>
                            <td class="po-reference-cell">${esc(meaningful(batch.po_number) || '-')}</td>
                            <td class="supplier-cell">${esc(meaningful(batch.supplier_name) || '-')}</td>
                            <td class="received-date-cell">${esc(formatDate(batch.received_date))}</td>
                            <td class="expiry-date-cell">${esc(formatDate(batch.expiry_date))}</td>
                            <td><span class="qty-number">${esc(batch.storage_qty ?? 0)}</span></td>
                            <td><span class="qty-number">${esc(batch.shelf_qty ?? 0)}</span></td>
                            <td class="batch-status-column">${batchStatusBadge(batch.batch_status)}</td>
                        </tr>
                    `, 8)}</tbody>
                </table>
                </div>
            </section>
        </div>
    `;

    if (show) {
        const modal = document.getElementById('inventoryDetailsModal');
        resetResizableModal('inventoryDetailsModal');
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }
}
async function openMoveModal(productId, direction = 'STORAGE_TO_SHELF') {
    const row = rowById(productId);
    if (!row) return;
    if (isInactiveProduct(row)) {
        PharmaUtils.toast.warning('Reactivate this product before moving stock to the selling shelf.');
        return;
    }

    const options = await fetchJson(`${API_BASE_URL}/inventory/get_transfer_options.php?product_id=${encodeURIComponent(productId)}&t=${Date.now()}`);
    activeTransferOptions = options;
    activeTransferRequestId = globalThis.crypto?.randomUUID?.() || '';
    const product = options.product;
    const storageQty = Number(product.storage_quantity || 0);
    const shelfQty = Number(product.shelf_quantity || 0);
    const toShelf = direction === 'STORAGE_TO_SHELF';
    if (toShelf && storageQty <= 0) {
        activeTransferOptions = null;
        await showNoStorageStockModal(row);
        return;
    }
    document.getElementById('moveProductId').value = product.product_id;
    document.getElementById('moveDirection').value = direction;
    document.getElementById('moveShelfTitle').textContent = toShelf ? 'Transfer to Shelf' : 'Return to Storage';
    document.getElementById('moveSourceLocation').textContent = toShelf ? 'Storage Inventory' : 'Shelf Inventory';
    document.getElementById('moveDestinationLocation').textContent = toShelf ? 'Shelf Inventory' : 'Storage Inventory';
    document.getElementById('moveProductName').textContent = productIdentityText({ ...row, ...product }, 'Unnamed product');
    document.getElementById('moveBrandName').textContent = cleanText(product.brand_name);
    document.getElementById('moveSpecification').textContent = buildInventorySpecification(row);
    document.getElementById('moveInventoryUnit').textContent = inventoryUnitLabel(product.base_unit);
    document.getElementById('moveStorageAvailable').textContent = inventoryQuantityLabel(storageQty, product.base_unit);
    document.getElementById('moveShelfBefore').textContent = inventoryQuantityLabel(shelfQty, product.base_unit);
    document.getElementById('moveQuantity').value = '';
    const unitSelect = document.getElementById('moveUnit');
    const allUnits = Array.isArray(options.units) ? options.units : [];
    const sourceQty = toShelf ? storageQty : shelfQty;
    const satisfiableUnits = allUnits.filter((unit) => Math.floor(sourceQty / Math.max(1, Number(unit.base_quantity || 1))) > 0);
    const baseUnitOption = allUnits.find((unit) => Number(unit.base_quantity || 1) === 1) || { unit: product.base_unit, base_quantity: 1 };
    const modalUnits = (satisfiableUnits.length ? satisfiableUnits : [baseUnitOption])
        .filter((unit, index, units) => units.findIndex((candidate) => String(candidate.unit || '').trim().toLowerCase() === String(unit.unit || '').trim().toLowerCase()) === index)
        .sort((left, right) => Number(right.base_quantity || 1) - Number(left.base_quantity || 1));
    unitSelect.innerHTML = modalUnits
        .map((unit) => {
            const factor = Number(unit.base_quantity || 1);
            const label = `${inventoryUnitLabel(unit.unit)} - ${inventoryQuantityLabel(factor, product.base_unit)}`;
            return `<option value="${esc(unit.unit)}" data-factor="${esc(factor)}">${esc(label)}</option>`;
        })
        .join('');
    unitSelect.value = modalUnits[0]?.unit || product.base_unit;
    document.getElementById('moveQuantity').value = '1';
    document.getElementById('moveShelfReceive').textContent = inventoryQuantityLabel(0, product.base_unit);
    document.getElementById('moveStorageRemaining').textContent = inventoryQuantityLabel(storageQty, product.base_unit);
    document.getElementById('moveShelfAfter').textContent = inventoryQuantityLabel(shelfQty, product.base_unit);
    document.getElementById('moveSubmitButton').innerHTML = `<i class="fa-solid fa-right-left me-2"></i>${toShelf ? 'Transfer Stock' : 'Return Stock'}`;
    updateTransferPreview();
    const feedback = document.getElementById('moveBatchFeedback');
    if (feedback) feedback.textContent = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('moveShelfModal')).show();
}

function renderTransferAllocationPreview(baseQty) {
    const container = document.getElementById('moveBatchList');
    if (!container || !activeTransferOptions) return;
    if (baseQty <= 0) {
        container.className = 'small text-muted mt-3';
        container.textContent = 'Enter a quantity to preview batch / expiry allocation.';
        return;
    }
    const toShelf = document.getElementById('moveDirection').value === 'STORAGE_TO_SHELF';
    const batches = toShelf ? activeTransferOptions.storage_batches : activeTransferOptions.shelf_batches;
    let remaining = baseQty;
    const allocations = [];
    for (const batch of batches || []) {
        if (remaining <= 0) break;
        const allocated = Math.min(remaining, Number(batch.available_quantity || 0));
        if (allocated <= 0) continue;
        allocations.push({ ...batch, allocated });
        remaining -= allocated;
    }
    container.className = 'transfer-allocation-preview';
    container.innerHTML = `<h6>Batch / Expiry Allocation (FEFO)</h6>${allocations.map((batch) => `
        <div class="transfer-allocation-row"><span><strong>${esc(cleanText(batch.batch_number, 'Unnumbered batch'))}</strong><br><span class="text-muted">Expiry: ${esc(formatDate(batch.expiry_date))}</span></span><strong>${esc(inventoryQuantityLabel(batch.allocated, activeTransferOptions.product.base_unit))}</strong></div>
    `).join('')}${remaining > 0 ? `<div class="transfer-allocation-row text-danger"><span>Insufficient ${esc(toShelf ? 'Storage' : 'Shelf')} stock</span><strong>${esc(inventoryQuantityLabel(remaining, activeTransferOptions.product.base_unit))} short</strong></div>` : ''}`;
}

function updateTransferPreview() {
    if (!activeTransferOptions) return;
    const quantityInput = document.getElementById('moveQuantity');
    const quantity = Number(quantityInput?.value || 0);
    const selected = document.getElementById('moveUnit')?.selectedOptions?.[0];
    const factor = Number(selected?.dataset.factor || 1);
    const baseQty = Number.isInteger(quantity) && quantity > 0 ? quantity * factor : 0;
    const product = activeTransferOptions.product;
    const toShelf = document.getElementById('moveDirection').value === 'STORAGE_TO_SHELF';
    const selectedUnit = selected?.value || product.base_unit;
    const sourceBatches = toShelf ? activeTransferOptions.storage_batches : activeTransferOptions.shelf_batches;
    const sourceQty = (sourceBatches || []).reduce((total, batch) => total + Number(batch.available_quantity || 0), 0);
    const maxTransferQty = Math.floor(sourceQty / Math.max(1, factor));
    const exceedsSource = baseQty > sourceQty;
    const validQuantity = baseQty > 0 && !exceedsSource;
    const feedback = document.getElementById('moveBatchFeedback');
    const submitButton = document.getElementById('moveSubmitButton');
    const moving = document.getElementById('moveMoving');
    const maxHelper = document.getElementById('moveMaxHelper');
    if (quantityInput) {
        quantityInput.max = String(maxTransferQty);
        quantityInput.classList.toggle('is-invalid', exceedsSource || (quantityInput.value !== '' && !Number.isInteger(quantity)));
    }
    if (maxHelper) maxHelper.textContent = `Maximum: ${inventoryQuantityLabel(maxTransferQty, selectedUnit)}`;
    document.getElementById('moveEquivalent').textContent = baseQty > 0
        ? `${inventoryQuantityLabel(quantity, selectedUnit)} = ${inventoryQuantityLabel(baseQty, product.base_unit)}`
        : 'Enter a quantity';
    if (moving) moving.textContent = baseQty > 0 ? inventoryQuantityLabel(quantity, selectedUnit) : 'Enter a quantity';
    document.getElementById('moveShelfReceive').textContent = inventoryQuantityLabel(toShelf ? (validQuantity ? baseQty : 0) : 0, product.base_unit);
    document.getElementById('moveStorageRemaining').textContent = validQuantity
        ? inventoryQuantityLabel(Number(product.storage_quantity) + (toShelf ? -baseQty : baseQty), product.base_unit)
        : (exceedsSource ? 'Cannot transfer' : inventoryQuantityLabel(Number(product.storage_quantity), product.base_unit));
    document.getElementById('moveShelfAfter').textContent = validQuantity
        ? inventoryQuantityLabel(Number(product.shelf_quantity) + (toShelf ? baseQty : -baseQty), product.base_unit)
        : inventoryQuantityLabel(Number(product.shelf_quantity), product.base_unit);
    if (feedback) {
        feedback.textContent = exceedsSource
            ? `Only ${inventoryQuantityLabel(maxTransferQty, selectedUnit)} can be transferred from the current ${inventoryQuantityLabel(sourceQty, product.base_unit)}.`
            : '';
    }
    if (submitButton) submitButton.disabled = !validQuantity;
    renderTransferAllocationPreview(validQuantity ? baseQty : 0);
}

async function submitMove(event) {
    event.preventDefault();

    const productId = document.getElementById('moveProductId').value;
    const feedback = document.getElementById('moveBatchFeedback');
    const quantity = Number(document.getElementById('moveQuantity').value);
    const unit = document.getElementById('moveUnit').value;
    if (!Number.isInteger(quantity) || quantity <= 0) {
        if (feedback) feedback.textContent = 'Transfer quantity must be a positive whole number.';
        return;
    }
    updateTransferPreview();
    if (document.getElementById('moveSubmitButton')?.disabled) return;

    if (feedback) feedback.textContent = '';

    const submitButton = document.getElementById('moveSubmitButton');
    submitButton.disabled = true;
    try {
        const data = await fetchJson(`${API_BASE_URL}/inventory/transfer_stock.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, movement_type: document.getElementById('moveDirection').value, quantity, unit, request_id: activeTransferRequestId })
        });

        bootstrap.Modal.getInstance(document.getElementById('moveShelfModal'))?.hide();
        PharmaUtils.toast.success(data.message || 'Stock transfer completed.');
        await loadInventory();
        publishDataUpdate('storage-updated', { productId });
        publishDataUpdate('shelf-updated', { productId });
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    } finally {
        submitButton.disabled = false;
    }
}

function openHistoryLegacy(productId) {
    const row = rowById(productId);
    if (!row) return;

    document.getElementById('stockHistory').innerHTML = `
        <div class="mb-3">
            <strong>${esc(productIdentityText(row, 'Unnamed product'))}</strong>
            <span class="text-muted ms-2">${esc(cleanText(row.brand_name))}</span>
        </div>
        <div class="table-responsive">
            <table class="table modal-table align-middle">
                <thead><tr><th>Date</th><th>Type</th><th>Quantity</th><th>From</th><th>To</th><th>User</th><th>Notes</th></tr></thead>
                <tbody>${tableRows(row.history, 'No stock movement records found.', (item) => `
                    <tr>
                        <td>${esc(formatDate(item.movement_date))}</td>
                        <td>${esc(cleanText(item.movement_type))}</td>
                        <td>${esc(item.quantity ?? 0)}</td>
                        <td>${esc(cleanText(item.from_location))}</td>
                        <td>${esc(cleanText(item.to_location))}</td>
                        <td>${esc(cleanText(item.user_name, 'â€”'))}</td>
                        <td>${esc(cleanText(item.notes, 'â€”'))}</td>
                    </tr>
                `)}</tbody>
            </table>
        </div>
    `;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('stockHistoryModal')).show();
}

function parseLegacyRemarks(value) {
    if (value && typeof value === 'object') return { text: '', metadata: value };
    const stored = String(value ?? '').trim();
    if (!stored) return { text: '', metadata: {} };
    let text = stored;
    let metadata = {};
    const tagged = stored.match(/^\[(?:RETURN|RECEIVING)_META_V\d+\](\{[^\r\n]*\})(?:\r?\n)?(.*)$/si);
    if (tagged) {
        try { metadata = JSON.parse(tagged[1]); } catch (error) { metadata = {}; }
        text = tagged[2] || '';
    } else {
        try {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object') { metadata = parsed; text = ''; }
        } catch (error) {
            const embedded = stored.match(/\{[^]*\}/);
            if (embedded) {
                try {
                    const parsed = JSON.parse(embedded[0]);
                    if (parsed && typeof parsed === 'object') metadata = parsed;
                    text = stored.replace(embedded[0], '');
                } catch (nestedError) {}
            }
        }
    }
    text = text.replace(/\[(?:RETURN|RECEIVING)_META_V\d+\]/gi, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return { text, metadata };
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
    const expectedShelf = Number(product?.shelf_quantity || 0);
    const expectedStorage = Number(product?.storage_quantity || 0);
    valid = valid && shelf === expectedShelf && storage === expectedStorage;
    movements.forEach((movement) => { movement.balance_verified = valid; });
    if (!valid && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
        console.warn('Stock movement balances could not be fully verified; historical balances are hidden.', {
            productId: product?.product_id,
            calculated: { shelf, storage, onHand: shelf + storage },
            current: { shelf: expectedShelf, storage: expectedStorage, onHand: expectedShelf + expectedStorage }
        });
    }
    return movements;
}

function historyBalanceMarkup(movement) {
    if (!movement.balance_verified || !movement.balance_after) return '<span class="text-muted">Verified balance unavailable</span>';
    const balance = movement.balance_after;
    return `<span class="movement-balance"><span>Shelf: <strong>${esc(balance.shelf)}</strong></span><span>Storage: <strong>${esc(balance.storage)}</strong></span><span>On Hand: <strong>${esc(balance.on_hand)}</strong></span></span>`;
}

function historyProductSummary(product) {
    const shelf = Number(product.shelf_quantity || 0);
    const storage = Number(product.storage_quantity || 0);
    return `<div class="stock-product-summary">
        <div class="stock-product-card"><span class="stock-product-label">Product</span><strong>${esc(formatProductIdentity([product.brand_name, productIdentityText(product)]) || 'Unnamed product')}</strong><span class="stock-product-meta">${esc(buildInventorySpecification(product))} &middot; SKU / Barcode: ${esc(product.barcode || 'Not recorded')}</span></div>
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
    const filterLabels = {
        po_received: 'PO Received', storage_to_shelf: 'Storage to Shelf', shelf_to_storage: 'Shelf to Storage',
        sale: 'Sale', sale_reversal: 'Sale Reversal', return_to_supplier: 'Return to Supplier',
        customer_return: 'Customer Return', damaged: 'Damaged', expired: 'Expired',
        manual_adjustment: 'Manual Adjustment', stock_count_correction: 'Stock Count Correction',
        replacement_received: 'Replacement Received'
    };
    const types = (supportedTypes || []).map((type) => `<option value="${esc(type.code)}">${esc(filterLabels[type.code] || type.label)}</option>`).join('');
    const batchOptions = Array.from(batches.entries()).map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('');
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
    const reason = meaningful(movement.reason) || parseLegacyRemarks(movement.remarks).text || 'â€”';
    return `<tr><td><time class="movement-date" datetime="${esc(movement.movement_date || '')}">${esc(formatDateTime(movement.movement_date))}</time></td><td><span class="movement-badge ${esc(movement.direction)}"><i class="${esc(movementIcon(movement))}" aria-hidden="true"></i>${esc(movement.movement_label)}</span></td><td><span class="movement-reference" title="${esc(movement.reference || 'â€”')}">${esc(movement.reference || 'â€”')}</span></td><td><span class="movement-location">${esc(movement.from_location || 'â€”')}</span></td><td><span class="movement-location">${esc(movement.to_location || 'â€”')}</span></td><td><span class="movement-quantity ${esc(movement.direction)}"><i class="${esc(movementIcon(movement))}" aria-hidden="true"></i>${esc(movementQuantity(movement))}</span></td><td>${historyBalanceMarkup(movement)}</td><td>${esc(movement.user_name || 'System')}</td><td><span class="movement-reason" title="${esc(reason)}">${esc(reason)}</span></td><td><button aria-label="View Movement Details" class="btn btn-sm btn-outline-secondary movement-detail-button" data-movement-id="${esc(movement.movement_id)}" title="View Movement Details" type="button"><i class="fa-regular fa-eye" aria-hidden="true"></i></button></td></tr>`;
}

function historyCardMarkup(movement) {
    const reason = meaningful(movement.reason) || parseLegacyRemarks(movement.remarks).text || 'â€”';
    return `<article class="stock-history-card"><div class="stock-history-card-head"><div><span class="movement-badge ${esc(movement.direction)}"><i class="${esc(movementIcon(movement))}" aria-hidden="true"></i>${esc(movement.movement_label)}</span><time class="movement-date mt-2" datetime="${esc(movement.movement_date || '')}">${esc(formatDateTime(movement.movement_date))}</time></div><span class="movement-quantity ${esc(movement.direction)}">${esc(movementQuantity(movement))}</span></div><div class="stock-history-card-route"><span>${esc(movement.from_location || 'â€”')}</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i><span>${esc(movement.to_location || 'â€”')}</span></div><div class="stock-history-card-balance">${historyBalanceMarkup(movement)}</div><div class="stock-history-card-foot"><div><span class="movement-reference">${esc(movement.reference || 'â€”')}</span><span class="movement-reason" title="${esc(reason)}">${esc(reason)}</span></div><button aria-label="View Movement Details" class="btn btn-sm btn-outline-secondary movement-detail-button" data-movement-id="${esc(movement.movement_id)}" title="View Movement Details" type="button"><i class="fa-regular fa-eye" aria-hidden="true"></i></button></div></article>`;
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
    results.innerHTML = `<div class="stock-history-table-shell"><table class="stock-history-table"><caption class="visually-hidden">Stock movement audit history</caption><thead><tr><th scope="col">Date &amp; Time</th><th scope="col">Movement</th><th scope="col">Reference</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Quantity Change</th><th scope="col">Balance After</th><th scope="col">Performed By</th><th scope="col">Reason</th><th scope="col">Action</th></tr></thead><tbody>${pageRows.map(historyRowMarkup).join('')}</tbody></table></div><div class="stock-history-cards">${pageRows.map(historyCardMarkup).join('')}</div><div class="stock-history-pagination"><span>Showing ${esc(start + 1)}â€“${esc(Math.min(start + historyState.pageSize, total))} of ${esc(total)} movements</span><div class="btn-group"><button class="btn btn-sm btn-light" id="historyPreviousPage" type="button" ${historyState.page === 1 ? 'disabled' : ''}>Previous</button><button class="btn btn-sm btn-light" id="historyNextPage" type="button" ${historyState.page === pages ? 'disabled' : ''}>Next</button></div></div>`;
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

function readableDetailLabel(key) {
    const labels = { po_number:'PO Number', batch_number:'Batch Number', supplier:'Supplier', expiry_date:'Expiry Date', received_date:'Received Date', ordered_quantity:'Ordered Quantity', received_quantity:'Received Quantity', accepted_quantity:'Accepted Quantity', damaged_quantity:'Damaged Quantity', returned_quantity:'Returned Quantity', batch_remaining_quantity:'Remaining Quantity in Batch', missing_quantity:'Missing Quantity', replacement_expected_quantity:'Replacement Expected', replacement_received_quantity:'Replacement Received', quantity_moved:'Quantity Moved', remaining_shelf_quantity:'Remaining on Shelf', sale_reference:'Sale Reference', receipt_number:'Receipt Number', quantity_sold:'Quantity Sold', cashier:'Cashier', transaction_time:'Transaction Time', return_status:'Return Status', return_resolution:'Return / Damage Resolution', delivered_quantity:'Delivered Quantity' };
    return labels[key] || key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function showMovementDetails(movementId) {
    const movement = historyState.movements.find((item) => item.movement_id === movementId);
    const drawer = document.getElementById('movementDetailsDrawer');
    const body = document.getElementById('movementDetailsBody');
    if (!movement || !drawer || !body) return;
    const remarks = parseLegacyRemarks(movement.remarks).text;
    const balances = movement.balance_verified ? [detailItem('Previous Shelf', movement.previous_balance.shelf), detailItem('New Shelf', movement.balance_after.shelf), detailItem('Previous Storage', movement.previous_balance.storage), detailItem('New Storage', movement.balance_after.storage), detailItem('Previous On Hand', movement.previous_balance.on_hand), detailItem('New On Hand', movement.balance_after.on_hand)].join('') : detailItem('Balance', 'Verified historical balance unavailable');
    const details = Object.entries(movement.details || {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
    const payments = Object.entries(movement.related_payment || {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
    document.getElementById('movementDetailsTitle').textContent = `${movement.movement_label} Details`;
    body.innerHTML = `<section class="movement-detail-section"><h3>General</h3><div class="movement-detail-grid">${detailItem('Date and Time', formatDateTime(movement.movement_date))}${detailItem('Movement Type', movement.movement_label)}${detailItem('Quantity', movementQuantity(movement))}${detailItem('Performed By', movement.user_name || 'System')}${detailItem('Reason', movement.reason || 'â€”')}</div></section><section class="movement-detail-section"><h3>Location and Balances</h3><div class="movement-detail-grid">${detailItem('From', movement.from_location || 'â€”')}${detailItem('To', movement.to_location || 'â€”')}${balances}</div></section>${details.length ? `<section class="movement-detail-section"><h3>Source Information</h3><div class="movement-detail-grid">${details.map(([key, value]) => detailItem(readableDetailLabel(key), /_date$/.test(key) ? formatDate(value) : (/_time$/.test(key) ? formatDateTime(value) : value))).join('')}</div></section>` : ''}${remarks ? `<section class="movement-detail-section"><h3>Remarks</h3><div class="movement-detail-remarks">${esc(remarks)}</div></section>` : ''}${payments.length ? `<details class="movement-payment-details"><summary>Related PO Payment Information</summary><div class="movement-detail-grid">${payments.map(([key, value]) => detailItem(readableDetailLabel(key), value)).join('')}</div></details>` : ''}`;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.querySelector('.movement-details-close')?.focus();
}

function closeMovementDetails() {
    const drawer = document.getElementById('movementDetailsDrawer');
    drawer?.classList.remove('is-open');
    drawer?.setAttribute('aria-hidden', 'true');
}

function bindHistoryControls() {
    ['historySearch', 'historyTypeFilter', 'historyBatchFilter', 'historyStartDate', 'historyEndDate'].forEach((id) => {
        const control = document.getElementById(id);
        control?.addEventListener(id === 'historySearch' ? 'input' : 'change', applyHistoryFilters);
    });
    document.getElementById('historyClearFilters')?.addEventListener('click', () => {
        ['historySearch', 'historyTypeFilter', 'historyBatchFilter', 'historyStartDate', 'historyEndDate'].forEach((id) => { const control = document.getElementById(id); if (control) control.value = ''; });
        applyHistoryFilters();
    });
}

async function loadHistory(productId) {
    const container = document.getElementById('stockHistory');
    if (!container) return;
    container.innerHTML = '<div class="stock-history-state"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Loading stock movements...</span></div>';
    closeMovementDetails();
    try {
        const response = await fetchJson(`${API_BASE_URL}/inventory/get_stock_movements.php?product_id=${encodeURIComponent(productId)}&t=${Date.now()}`);
        historyState.productId = productId;
        historyState.product = response.product || rowById(productId) || {};
        historyState.movements = enrichVerifiedBalances(response.movements || [], historyState.product);
        historyState.filtered = [...historyState.movements];
        historyState.page = 1;
        container.innerHTML = `${historyProductSummary(historyState.product)}${historyFilterToolbar(historyState.movements, response.supported_types || [])}<div id="stockHistorySummary"></div><div id="stockHistoryResults"></div>`;
        bindHistoryControls();
        renderHistoryResults();
        bootstrap.Modal.getInstance(document.getElementById('stockHistoryModal'))?.handleUpdate();
    } catch (error) {
        container.innerHTML = '<div class="stock-history-state is-error"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span>Unable to load stock movement history. Please try again.</span><button class="btn btn-sm btn-outline-danger" id="historyRetry" type="button">Retry</button></div>';
        document.getElementById('historyRetry')?.addEventListener('click', () => loadHistory(productId));
    }
}

function openHistory(productId) {
    if (!rowById(productId)) return;
    const modalElement = document.getElementById('stockHistoryModal');
    const dialog = modalElement?.querySelector('.stock-history-dialog');
    const content = modalElement?.querySelector('.stock-history-modal-content');
    [dialog, content].forEach((element) => {
        if (!element) return;
        ['width', 'height', 'max-width', 'max-height', 'inset', 'left', 'top', 'transform', 'margin'].forEach((property) => element.style.removeProperty(property));
    });
    modalElement?.querySelector('.stock-history-body')?.scrollTo({ top: 0, left: 0 });
    bootstrap.Modal.getOrCreateInstance(modalElement, { backdrop: 'static', keyboard: true }).show();
    loadHistory(productId);
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('drpTheme', theme);
}

setTheme(localStorage.getItem('drpTheme') || 'light');
configureResizableModal('inventoryDetailsModal', {
    variant: 'xlarge',
    width: 1280,
    height: 850,
    minWidth: 760,
    minHeight: 520,
    maxWidthRatio: 0.96,
    maxHeightRatio: 0.94
});
document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
document.getElementById('btnRefreshInventory')?.addEventListener('click', loadInventory);
document.getElementById('inventorySearch')?.addEventListener('input', applyInventoryFilters);
document.getElementById('inventoryProductStatusFilter')?.addEventListener('change', applyInventoryFilters);
document.getElementById('transferHistoryFrom')?.addEventListener('change', applyInventoryFilters);
document.getElementById('transferHistoryTo')?.addEventListener('change', applyInventoryFilters);
document.getElementById('clearTransferHistoryFilters')?.addEventListener('click', () => {
    const search = document.getElementById('inventorySearch');
    const from = document.getElementById('transferHistoryFrom');
    const to = document.getElementById('transferHistoryTo');
    if (search) search.value = '';
    if (from) from.value = '';
    if (to) to.value = '';
    applyInventoryFilters();
});
document.getElementById('inventoryStockStatusFilter')?.addEventListener('change', (event) => {
    const stockStatus = normalizeStockStatus(event.target.value);
    selectedPrProductIds.clear();
    const url = new URL(window.location.href);
    url.searchParams.delete('stock');
    if (stockStatus === 'all') url.searchParams.delete('stock_status');
    else url.searchParams.set('stock_status', stockStatus);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    applyInventoryFilters();
});
document.getElementById('moveShelfForm')?.addEventListener('submit', submitMove);
document.getElementById('moveUnit')?.addEventListener('change', updateTransferPreview);
document.getElementById('moveQuantity')?.addEventListener('input', updateTransferPreview);
document.getElementById('btnInventoryDetailsHistory')?.addEventListener('click', () => {
    if (!activeDetailsProductId) return;
    bootstrap.Modal.getInstance(document.getElementById('inventoryDetailsModal'))?.hide();
    openHistory(activeDetailsProductId);
});
document.getElementById('table-inventory')?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.view-inventory-btn');
const moveButton = event.target.closest('.move-selling-btn');
    const returnButton = event.target.closest('.return-storage-btn');
    const historyButton = event.target.closest('.history-btn');

    const actionButton = viewButton || moveButton || returnButton || historyButton;
    if (actionButton) {
        document.querySelectorAll('#table-inventory tbody tr').forEach((row) => row.classList.remove('is-selected'));
        actionButton.closest('tr')?.classList.add('is-selected');
    }

    if (viewButton) {
        lastDetailsTrigger = viewButton;
        openDetails(viewButton.dataset.productId);
    }
    if (moveButton) openMoveModal(moveButton.dataset.productId, moveButton.dataset.direction || 'STORAGE_TO_SHELF').catch((error) => PharmaUtils.toast.error(error.message));
    if (returnButton) openMoveModal(returnButton.dataset.productId, 'SHELF_TO_STORAGE').catch((error) => PharmaUtils.toast.error(error.message));
    if (historyButton) openHistory(historyButton.dataset.productId);
});
document.getElementById('moveQuantity')?.addEventListener('input', updateTransferPreview);
document.getElementById('moveUnit')?.addEventListener('change', updateTransferPreview);
document.querySelectorAll('.inventory-view-tab').forEach((button) => button.addEventListener('click', () => {
    inventoryView = button.dataset.inventoryView || 'storage';
    if (isSalesClerkInventoryView() && inventoryView !== 'storage') inventoryView = 'storage';
    document.querySelectorAll('.inventory-view-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    if (isSalesClerkInventoryView()) {
        document.querySelectorAll('.inventory-view-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.inventoryView === 'storage'));
    }
    syncInventoryViewControls();
    const heading = document.querySelector('.inventory-card h1');
    if (heading) heading.textContent = inventoryView === 'storage' ? 'Storage Inventory' : inventoryView === 'shelf' ? 'Shelf Inventory' : 'Transfer History';
    if (inventoryView === 'history') loadGlobalTransferHistory().catch((error) => PharmaUtils.toast.error(error.message));
    else applyInventoryFilters();
}));
document.getElementById('table-inventory')?.addEventListener('change', (event) => {
    if (event.target.id === 'inventoryPrSelectAll') {
        const eligibleVisibleRows = filteredInventoryRows().filter(isPrEligible);
        for (const row of eligibleVisibleRows) {
            const productId = String(row.product_id);
            if (event.target.checked) selectedPrProductIds.add(productId);
            else selectedPrProductIds.delete(productId);
        }
        applyInventoryFilters();
        return;
    }
    const checkbox = event.target.closest('.inventory-pr-checkbox');
    if (!checkbox) return;
    const productId = String(checkbox.dataset.productId || '');
    const row = rowById(productId);
    if (!row || !isPrEligible(row) || !isPrSelectionMode()) {
        checkbox.checked = false;
        selectedPrProductIds.delete(productId);
        return;
    }
    if (checkbox.checked) selectedPrProductIds.add(productId);
    else selectedPrProductIds.delete(productId);
    checkbox.closest('tr')?.classList.toggle('is-selected', checkbox.checked);
    updatePrSelectionControls(filteredInventoryRows());
});
document.getElementById('createInventoryPrButton')?.addEventListener('click', () => {
    if (!canCreatePurchaseRequest() || !isPrSelectionMode()) return;
    const eligibleIds = [...selectedPrProductIds].filter((productId) => {
        const row = rowById(productId);
        return row && isPrEligible(row);
    });
    if (!eligibleIds.length) return;
    const params = new URLSearchParams({ create: '1', source: 'inventory', product_ids: eligibleIds.join(',') });
    window.location.href = `purchase_requests.html?${params}`;
});

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
document.getElementById('stockHistoryModal')?.addEventListener('shown.bs.modal', () => {
    document.getElementById('stockHistoryTitle')?.focus();
});
document.getElementById('stockHistoryModal')?.addEventListener('hidden.bs.modal', () => {
    closeMovementDetails();
    historyState.productId = null;
});
document.getElementById('stockHistoryModal')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('movementDetailsDrawer')?.classList.contains('is-open')) {
        event.stopPropagation();
        closeMovementDetails();
    }
});

document.getElementById('inventoryDetailsModal')?.addEventListener('hidden.bs.modal', () => {
    activeDetailsProductId = null;
    document.getElementById('inventoryInactiveWarning')?.remove();
    const stockCards = document.getElementById('inventoryHeaderStockCards');
    if (stockCards) stockCards.innerHTML = '';
    lastDetailsTrigger?.focus?.();
    lastDetailsTrigger = null;
});
expiryChannel?.addEventListener('message', () => loadInventory());
window.addEventListener('storage', (event) => { if (event.key === EXPIRY_SYNC_KEY) loadInventory(); });
window.addEventListener('drp:inventory-expiry-changed', () => loadInventory());
window.addEventListener('pharma:session-ready', (event) => {
    inventoryActorRole = roleFromSession(event.detail);
    if (!canCreatePurchaseRequest()) selectedPrProductIds.clear();
    applyInventoryFilters();
});
if (window.__drpSession) inventoryActorRole = roleFromSession(window.__drpSession);

const inventoryQuery = new URLSearchParams(window.location.search);
const requestedStockStatus = normalizeStockStatus(inventoryQuery.get('stock_status') || inventoryQuery.get('stock'));
const stockStatusFilter = document.getElementById('inventoryStockStatusFilter');
if (stockStatusFilter) stockStatusFilter.value = requestedStockStatus;
loadInventory();
createLiveSync({ interval: 2000, events: ['storage-updated', 'shelf-updated', 'po-received', 'payment-completed', 'product-updated'], sync: loadInventory });

export { enrichVerifiedBalances, parseLegacyRemarks };
