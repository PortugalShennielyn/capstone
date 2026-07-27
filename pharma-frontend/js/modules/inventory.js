import PharmaUtils from '../utils.js';
import { configureResizableModal, resetResizableModal } from './modal_size.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';
const EXPIRY_SYNC_KEY = 'drpInventoryExpiryChanged';
const expiryChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('drp-inventory-expiry') : null;
const PRODUCT_IDENTITY_SEPARATOR = PharmaUtils.productIdentitySeparator || ' \u2022 ';

let inventoryRows = [];
let activeDetailsProductId = null;
let lastDetailsTrigger = null;
const historyState = { productId: null, product: null, movements: [], filtered: [], page: 1, pageSize: 10 };

const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

async function fetchJson(url, options = {}) {
    return PharmaUtils.safeFetch(url, { credentials: 'include', ...options });
}

function cleanText(value, fallback = 'N/A') {
    const text = String(value ?? '').trim();
    return text ? text : fallback;
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
    const category = meaningful(product.category_name).toLowerCase();
    let candidates;

    if (category === 'medicine') {
        candidates = [
            product.generic_name,
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

function filteredInventoryRows() {
    const search = String(document.getElementById('inventorySearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('inventoryProductStatusFilter')?.value || 'all';
    return inventoryRows.filter((row) => {
        const rowStatus = isInactiveProduct(row) ? 'Inactive' : 'Active';
        const haystack = [
            row.brand_name, row.product_name, row.barcode, row.category_name, row.type_name, buildInventorySpecification(row)
        ].join(' ').toLowerCase();
        return (status === 'all' || status === rowStatus) && (!search || haystack.includes(search));
    });
}

function applyInventoryFilters() {
    renderInventory(filteredInventoryRows());
}

function renderInventorySummary(rows) {
    const container = document.getElementById('inventorySummaryCards');
    if (!container) return;

    const summary = rows.reduce((totals, row) => {
        const storage = Number(row.storage_quantity || 0);
        const shelf = Number(row.shelf_quantity || 0);
        const damaged = Number(row.damaged_quantity || 0);
        const returned = Number(row.returned_quantity || 0);
        const total = storage + shelf;

        totals.total += total;
        totals.storage += storage;
        totals.shelf += shelf;
        totals.damaged += damaged + returned;
        totals.value += Number(row.inventory_value || 0);
        if (storage > 0 && storage <= 10) totals.lowStock += 1;
        if (row.expiry_status === 'Expiring Soon') totals.expiringSoon += 1;
        return totals;
    }, {
        total: 0,
        storage: 0,
        shelf: 0,
        damaged: 0,
        lowStock: 0,
        expiringSoon: 0,
        value: 0
    });

    const cards = [
        ['Total Inventory', summary.total, '#7c3aed', 'fa-solid fa-boxes-stacked'],
        ['Storage Stock', summary.storage, '#2563eb', 'fa-solid fa-warehouse'],
        ['Selling/Shelf Stock', summary.shelf, '#16a34a', 'fa-solid fa-cart-shopping'],
        ['Damaged/Returned', summary.damaged, '#dc2626', 'fa-solid fa-triangle-exclamation'],
        ['Low Stock', summary.lowStock, '#f59e0b', 'fa-solid fa-arrow-down'],
        ['Expiring Soon', summary.expiringSoon, '#d97706', 'fa-regular fa-clock'],
        ['Inventory Value', formatMoney(summary.value), '#0891b2', 'fa-solid fa-peso-sign']
    ];

    container.innerHTML = cards.map(([label, value, color, icon]) => `
        <div class="inventory-summary-card ${label === 'Inventory Value' ? 'is-value-card' : ''}" style="--summary-color:${color}">
            <span class="inventory-summary-icon"><i class="${esc(icon)}"></i></span>
            <span class="inventory-summary-content">
                <p>${esc(label)}</p>
                <strong>${esc(value)}</strong>
            </span>
        </div>
    `).join('');
}

function renderInventory(rows) {
    const body = document.querySelector('#table-inventory tbody');
    if (!body) return;

    renderInventorySummary(rows);

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="12" class="empty-row">No received inventory records found.</td></tr>';
        return;
    }

    body.innerHTML = rows.map((row) => {
        const productId = esc(row.product_id);
        const inactive = isInactiveProduct(row);
        const storageQty = Number(row.storage_quantity || 0);
        const shelfQty = Number(row.shelf_quantity || 0);
        const damagedQty = Number(row.damaged_quantity || 0);
        const totalQty = storageQty + shelfQty;
        const moveButton = inactive
            ? `<span class="disabled-action-tooltip" title="Reactivate this product before moving stock to the selling shelf."><button class="btn btn-sm btn-outline-primary move-selling-btn" type="button" aria-label="Move to Shelf unavailable: product is inactive" data-product-id="${productId}" disabled><i class="fa-solid fa-right-left"></i></button></span>`
            : `<button class="btn btn-sm btn-outline-primary move-selling-btn" type="button" title="Move Storage to Shelf" aria-label="Move Storage to Shelf" data-product-id="${productId}" ${storageQty <= 0 ? 'disabled' : ''}><i class="fa-solid fa-right-left"></i></button>`;

        return `
            <tr data-product-id="${productId}" class="${inactive ? 'is-inactive' : ''}">
                <td><span class="brand-cell">${esc(cleanText(row.brand_name))}</span></td>
                <td>
                    <span class="product-cell">${esc(cleanText(row.product_name, 'Unnamed product'))}</span>
                </td>
                <td><span class="specification-cell" title="${esc(buildInventorySpecification(row))}">${esc(buildInventorySpecification(row))}</span></td>
                <td>${esc(cleanText(row.type_name))}</td>
                <td>${productStatusBadge(row.product_status, true)}</td>
                <td><span class="qty-number">${esc(storageQty)}</span></td>
                <td><span class="qty-number">${esc(shelfQty)}</span></td>
                <td><span class="qty-number">${esc(damagedQty)}</span></td>
                <td><span class="qty-number">${esc(totalQty)}</span></td>
                <td>
                    <div class="expiry-cell">
                        ${Number(row.active_batch_count || 0) > 1 ? '<span class="expiry-kicker">Next Expiry</span>' : ''}
                        ${statusBadge(row.expiry_status)}
                        <span class="expiry-date">${esc(formatDate(row.nearest_expiry_date))}</span>
                    </div>
                </td>
                <td><div class="date-stack">${esc(formatDate(row.last_received_date))}</div></td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-outline-secondary view-inventory-btn" type="button" title="View Details" aria-label="View Details" data-product-id="${productId}"><i class="fa-regular fa-eye"></i></button>
                        ${moveButton}
                        <button class="btn btn-sm btn-outline-secondary history-btn" type="button" title="View Stock Movement History" aria-label="View Stock Movement History" data-product-id="${productId}"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></button>
                    </div>
                </td>
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
        inventoryRows = data.data || [];
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

function detailBox(label, value) {
    return `<div class="detail-box"><span>${esc(label)}</span><strong>${esc(cleanText(value))}</strong></div>`;
}

function identityItem(label, value) {
    return `<td>${esc(cleanText(normalizeDisplayText(value), 'Not recorded'))}</td>`;
}

function attributeRow(label, value) {
    return `<div><span>${esc(label)}</span><strong>${esc(cleanText(value))}</strong></div>`;
}

function stockTile(label, value, color = '#7c3aed', className = '') {
    return `<div class="inventory-header-stock-card ${esc(className)}" style="--stock-card-accent:${esc(color)}"><span class="inventory-header-stock-label">${esc(label)}</span><strong class="inventory-header-stock-value">${esc(value)}</strong></div>`;
}

function expiryRow(value) {
    return `<div class="inventory-header-stock-card expiry-card" style="--stock-card-accent:#d97706"><span class="inventory-header-stock-label">Nearest Expiry</span><strong class="inventory-header-stock-value">${esc(value)}</strong></div>`;
}

function batchPriorityMarkup(batch) {
    const badges = [];
    if (batch.use_first) badges.push(batchBadge('Use First', 'batch-use-first'));
    if (batch.is_new_batch) badges.push(batchBadge('New Batch', 'batch-new'));
    if (batch.is_old_batch) badges.push(batchBadge('Old Batch', 'batch-old'));
    return badges.length ? `<div class="batch-priority-list">${badges.join('')}</div>` : '';
}

function totalRemaining(batch) {
    return Number(batch.storage_qty || 0) + Number(batch.shelf_qty || 0);
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
    const category = String(row.category_name || '').toLowerCase();
    const attributes = (category === 'medicine'
        ? [
            ['Generic Name', row.generic_name],
            ['Strength', meaningful(row.strength) || joinedMeasurement(row.strength_value, row.strength_unit)],
            ['Net Content', joinedMeasurement(row.net_content_value, row.net_content_unit)],
            ['Dosage Form', row.dosage_form],
            ['Packaging', row.package_type]
        ]
        : (category === 'medical supply' || category === 'medical supplies')
        ? [
            ['Variant', row.medical_variant],
            ['Size', row.medical_size],
            ['Material', row.material],
            ['Sterile Status', row.sterile_status],
            ['Packaging', row.medical_package_type || row.package_type],
            ['Pack Content', row.medical_pack_content]
        ]
        : [
            ['Flavor / Variant', row.variant],
            ['Size', meaningful(row.net_weight) ? '' : row.size],
            ['Net Weight', joinedMeasurement(row.net_weight, row.unit)],
            ['Packaging', row.package_type],
            ['Pack Content', row.pack_content]
        ]).filter(([, value]) => meaningful(value));
    const storageQty = Number(row.storage_quantity || 0);
    const shelfQty = Number(row.shelf_quantity || 0);
    const damagedQty = Number(row.damaged_quantity || 0);
    const returnedQty = (row.batches || []).reduce((total, batch) => total + Number(batch.returned_qty || 0), 0);
    const onHandQty = storageQty + shelfQty;
    const inactive = isInactiveProduct(row);
    const batchCount = Number(row.active_batch_count || 0);
    const hasReturned = returnedQty > 0 || (row.batches || []).some((batch) => Object.prototype.hasOwnProperty.call(batch, 'returned_qty'));
    const subtitle = document.getElementById('inventoryDetailsSubtitle');
    if (subtitle) subtitle.textContent = formatProductIdentity([row.brand_name, row.product_name, productSpecification]);
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
            ${stockTile('Storage Stock', storageQty, '#2563eb')}
            ${stockTile('Shelf Stock', shelfQty, '#16a34a')}
            ${stockTile('On Hand', onHandQty, '#7c3aed', 'on-hand')}
            ${stockTile('Damaged', damagedQty, '#dc2626')}
            ${hasReturned ? stockTile('Returned', returnedQty, '#64748b') : stockTile('Returned', 0, '#64748b')}
            ${expiryRow(formatDate(row.nearest_expiry_date))}
        `;
    }

    document.getElementById('inventoryDetails').innerHTML = `
        <div class="inventory-details-record">
            <section class="product-identity-section">
                <h6>Product Identity</h6>
                <div class="product-identity-table-wrap">
                    <table class="product-identity-table">
                        <thead>
                            <tr>
                                <th>Brand</th>
                                <th>Product</th>
                                <th>Category</th>
                                <th>Product Type</th>
                                <th>Specification</th>
                                <th>Generic Name</th>
                                <th>Strength</th>
                                <th>Net Content</th>
                                <th>Dosage Form</th>
                                <th>Packaging</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                ${identityItem('Brand', row.brand_name)}
                                ${identityItem('Product', row.product_name)}
                                ${identityItem('Category', row.category_name)}
                                ${identityItem('Product Type', row.type_name)}
                                ${identityItem('Specification', productSpecification)}
                                ${identityItem('Generic Name', row.generic_name)}
                                ${identityItem('Strength', meaningful(row.strength) || joinedMeasurement(row.strength_value, row.strength_unit))}
                                ${identityItem('Net Content', joinedMeasurement(row.net_content_value, row.net_content_unit) || joinedMeasurement(row.net_weight, row.unit) || row.size)}
                                ${identityItem('Dosage Form', row.dosage_form)}
                                ${identityItem('Packaging', row.package_type)}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="inventory-record-section batch-inventory-section">
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
                            <th>Damaged</th>
                            <th class="returned-column">Returned</th>
                            <th>Total</th>
                            <th>Expiry Status</th>
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
                            <td><span class="qty-number">${esc(batch.damaged_qty ?? 0)}</span></td>
                            <td class="returned-column"><span class="qty-number">${esc(batch.returned_qty ?? 0)}</span></td>
                            <td><span class="qty-number">${esc(totalRemaining(batch))}</span></td>
                            <td>${statusBadge(batch.status)}</td>
                            <td class="batch-status-column">${batchStatusBadge(batch.batch_status)}</td>
                        </tr>
                    `, 12)}</tbody>
                </table>
                </div>
            </section>

            <div class="inventory-secondary-sections">
                ${attributes.length ? `<section class="inventory-record-section"><h6>Product Attributes</h6><div class="inventory-attribute-list">${attributes.map(([label, value]) => attributeRow(label, value)).join('')}</div></section>` : ''}
                <section class="inventory-record-section">
                    <h6>Receiving Information</h6>
                    <div class="inventory-attribute-list">
                        ${attributeRow('Last Received', formatDate(row.last_received_date))}
                        ${attributeRow('Supplier', row.latest_supplier_name)}
                        ${attributeRow('Most Recent PO', row.latest_po_number)}
                        ${attributeRow('Nearest Expiry', formatDate(row.nearest_expiry_date))}
                        ${attributeRow('Number of Active Batches', batchCount)}
                    </div>
                </section>
            </div>
        </div>
    `;

    if (show) {
        const modal = document.getElementById('inventoryDetailsModal');
        resetResizableModal('inventoryDetailsModal');
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }
}
function openMoveModal(productId) {
    const row = rowById(productId);
    if (!row) return;
    if (isInactiveProduct(row)) {
        PharmaUtils.toast.warning('Reactivate this product before moving stock to the selling shelf.');
        return;
    }

    const storageQty = Number(row.storage_quantity || 0);
    const shelfQty = Number(row.shelf_quantity || 0);
    document.getElementById('moveProductId').value = row.product_id;
    document.getElementById('moveProductName').textContent = `${cleanText(row.product_name, 'Unnamed product')} (${cleanText(row.brand_name)})`;
    document.getElementById('moveShelfQty').textContent = String(shelfQty);
    document.getElementById('moveStorageQty').textContent = String(storageQty);
    const batchList = document.getElementById('moveBatchList');
    const feedback = document.getElementById('moveBatchFeedback');
    if (feedback) feedback.textContent = '';

    const batches = (row.batches || []).filter((batch) => Number(batch.storage_qty || 0) > 0);
    if (batchList) {
        batchList.innerHTML = batches.length ? batches.map((batch, index) => `
            <div class="move-batch-row ${batch.use_first ? 'is-recommended' : ''}" data-batch-id="${esc(batch.batch_id)}">
                <div class="move-batch-main">
                    <div>
                        <strong>${esc(index + 1)}. ${esc(batch.po_number || batch.batch_number || batch.batch_id)}</strong>
                        ${renderBatchBadges(batch)}
                    </div>
                    <div class="move-batch-meta">
                        <span>Received: ${esc(formatDate(batch.received_date))}</span>
                        <span>Expiry: ${esc(formatDate(batch.expiry_date, 'N/A'))}</span>
                        <span>Storage Left: ${esc(batch.storage_qty)}</span>
                    </div>
                </div>
                <div class="move-batch-input">
                    <label class="form-label small fw-bold" for="moveBatchQty-${esc(batch.batch_id)}">Move Qty</label>
                    <input id="moveBatchQty-${esc(batch.batch_id)}" class="form-control move-batch-qty" type="number" min="0" step="1" max="${esc(batch.storage_qty)}" inputmode="numeric" data-batch-id="${esc(batch.batch_id)}" data-inventory-id="${esc(batch.inventory_id || '')}" data-max="${esc(batch.storage_qty)}" value="">
                </div>
            </div>
        `).join('') : '<div class="empty-row rounded border">No storage batches are available for this product.</div>';
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('moveShelfModal')).show();
}

async function submitMove(event) {
    event.preventDefault();

    const productId = document.getElementById('moveProductId').value;
    const feedback = document.getElementById('moveBatchFeedback');
    const batchInputs = Array.from(document.querySelectorAll('#moveBatchList .move-batch-qty'));
    const batches = [];
    let hasInvalid = false;

    batchInputs.forEach((input) => {
        const quantity = Number(input.value || 0);
        const max = Number(input.dataset.max || 0);
        input.classList.remove('is-invalid');

        if (!Number.isInteger(quantity) || quantity < 0 || quantity > max) {
            input.classList.add('is-invalid');
            hasInvalid = true;
            return;
        }

        if (quantity > 0) {
            batches.push({
                batch_id: input.dataset.batchId,
                inventory_id: input.dataset.inventoryId,
                quantity
            });
        }
    });

    if (hasInvalid || batches.length === 0) {
        if (feedback) {
            feedback.textContent = hasInvalid
                ? 'Move quantities must be whole numbers and cannot exceed each batch storage quantity.'
                : 'Enter a quantity for at least one batch.';
        }
        return;
    }

    if (feedback) feedback.textContent = '';

    try {
        const data = await fetchJson(`${API_BASE_URL}/inventory/move_to_selling_stock.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, batches })
        });

        bootstrap.Modal.getInstance(document.getElementById('moveShelfModal'))?.hide();
        PharmaUtils.toast.success(data.message || 'Stock moved to shelf.');
        await loadInventory();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function openHistoryLegacy(productId) {
    const row = rowById(productId);
    if (!row) return;

    document.getElementById('stockHistory').innerHTML = `
        <div class="mb-3">
            <strong>${esc(cleanText(row.product_name, 'Unnamed product'))}</strong>
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
        <div class="stock-product-card"><span class="stock-product-label">Product</span><strong>${esc(uniqueParts([product.brand_name, product.product_name]).join(' ') || 'Unnamed product')}</strong><span class="stock-product-meta">${esc(buildInventorySpecification(product))} &middot; SKU / Barcode: ${esc(product.barcode || 'Not recorded')}</span></div>
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
    document.getElementById('themeToggle').innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
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
    maxHeightRatio: 0.94,
    onResize: ({ modal }) => {
        const body = modal.querySelector('.modal-body');
        const tableWrapper = modal.querySelector('.batch-table-wrapper');
        if (!body || !tableWrapper) return;
        const bodyHeight = body.getBoundingClientRect().height;
        tableWrapper.style.maxHeight = `${Math.max(240, Math.min(470, bodyHeight * 0.48))}px`;
    }
});
document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
document.getElementById('btnRefreshInventory')?.addEventListener('click', loadInventory);
document.getElementById('inventorySearch')?.addEventListener('input', applyInventoryFilters);
document.getElementById('inventoryProductStatusFilter')?.addEventListener('change', applyInventoryFilters);
document.getElementById('moveShelfForm')?.addEventListener('submit', submitMove);
document.getElementById('btnInventoryDetailsHistory')?.addEventListener('click', () => {
    if (!activeDetailsProductId) return;
    bootstrap.Modal.getInstance(document.getElementById('inventoryDetailsModal'))?.hide();
    openHistory(activeDetailsProductId);
});
document.getElementById('table-inventory')?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.view-inventory-btn');
    const moveButton = event.target.closest('.move-selling-btn');
    const historyButton = event.target.closest('.history-btn');

    const actionButton = viewButton || moveButton || historyButton;
    if (actionButton) {
        document.querySelectorAll('#table-inventory tbody tr').forEach((row) => row.classList.remove('is-selected'));
        actionButton.closest('tr')?.classList.add('is-selected');
    }

    if (viewButton) {
        lastDetailsTrigger = viewButton;
        openDetails(viewButton.dataset.productId);
    }
    if (moveButton) openMoveModal(moveButton.dataset.productId);
    if (historyButton) openHistory(historyButton.dataset.productId);
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

loadInventory();

export { enrichVerifiedBalances, parseLegacyRemarks };
