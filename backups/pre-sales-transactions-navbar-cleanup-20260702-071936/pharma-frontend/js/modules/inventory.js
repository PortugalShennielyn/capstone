import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

let inventoryRows = [];

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

function formatDate(value, fallback = '—') {
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

function renderInventorySummary(rows) {
    const container = document.getElementById('inventorySummaryCards');
    if (!container) return;

    const summary = rows.reduce((totals, row) => {
        const storage = Number(row.storage_quantity || 0);
        const shelf = Number(row.shelf_quantity || 0);
        const damaged = Number(row.damaged_quantity || 0);
        const total = storage + shelf + damaged;

        totals.total += total;
        totals.storage += storage;
        totals.shelf += shelf;
        totals.damaged += damaged;
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
        body.innerHTML = '<tr><td colspan="11" class="empty-row">No received inventory records found.</td></tr>';
        return;
    }

    body.innerHTML = rows.map((row) => {
        const productId = esc(row.product_id);
        const storageQty = Number(row.storage_quantity || 0);
        const shelfQty = Number(row.shelf_quantity || 0);
        const damagedQty = Number(row.damaged_quantity || 0);
        const totalQty = storageQty + shelfQty + damagedQty;

        return `
            <tr>
                <td><span class="brand-cell">${esc(cleanText(row.brand_name))}</span></td>
                <td>
                    <span class="product-cell">${esc(cleanText(row.product_name, 'Unnamed product'))}</span>
                </td>
                <td>${esc(cleanText(row.category_name))}</td>
                <td>${esc(cleanText(row.type_name))}</td>
                <td><span class="qty-number">${esc(storageQty)}</span></td>
                <td><span class="qty-number">${esc(shelfQty)}</span></td>
                <td><span class="qty-number">${esc(damagedQty)}</span></td>
                <td><span class="qty-number">${esc(totalQty)}</span></td>
                <td>
                    <div class="expiry-cell">
                        ${statusBadge(row.expiry_status)}
                        ${row.nearest_expiry_date ? `<span class="expiry-date">${esc(formatDate(row.nearest_expiry_date))}</span>` : ''}
                    </div>
                </td>
                <td><div class="date-stack">${esc(formatDate(row.last_received_date))}</div></td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-outline-secondary view-inventory-btn" type="button" title="View Details" aria-label="View Details" data-product-id="${productId}"><i class="fa-regular fa-eye"></i></button>
                        <button class="btn btn-sm btn-outline-primary move-selling-btn" type="button" title="Move Storage to Shelf" aria-label="Move Storage to Shelf" data-product-id="${productId}" ${storageQty <= 0 ? 'disabled' : ''}><i class="fa-solid fa-right-left"></i></button>
                        <button class="btn btn-sm btn-outline-secondary history-btn" type="button" title="View Stock Movement" aria-label="View Stock Movement" data-product-id="${productId}"><i class="fa-solid fa-clock-rotate-left"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadInventory() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/inventory/get_inventory.php`);
        inventoryRows = data.data || [];
        renderInventory(inventoryRows);
    } catch (error) {
        inventoryRows = [];
        renderInventory([]);
        PharmaUtils.toast.error(error.message);
    }
}

function detailBox(label, value) {
    return `<div class="detail-box"><span>${esc(label)}</span><strong>${esc(cleanText(value))}</strong></div>`;
}

function tableRows(rows, emptyText, renderer) {
    if (!rows?.length) {
        return `<tr><td colspan="8" class="text-center text-muted py-4">${esc(emptyText)}</td></tr>`;
    }
    return rows.map(renderer).join('');
}

function openDetails(productId) {
    const row = rowById(productId);
    if (!row) return;

    const categoryDetails = row.category_name === 'Medicine'
        ? [
            ['Generic Name', row.generic_name],
            ['Strength', row.strength],
            ['Dosage Form', row.dosage_form],
            ['Package Type', row.package_type]
        ]
        : [
            ['Feature/Variant', row.variant],
            ['Size', row.size],
            ['Unit Weight', row.net_weight],
            ['Package Type', row.package_type],
            ['Pack Content', row.pack_content]
        ];

    document.getElementById('inventoryDetails').innerHTML = `
        <section class="detail-section">
            <h6>Product Info</h6>
            <div class="detail-grid">
                ${detailBox('Brand Name', row.brand_name)}
                ${detailBox('Product Name', row.product_name)}
                ${detailBox('Category', row.category_name)}
                ${detailBox('Product Type', row.type_name)}
            </div>
        </section>
        <section class="detail-section">
            <h6>Category Details</h6>
            <div class="detail-grid">${categoryDetails.map(([label, value]) => detailBox(label, value)).join('')}</div>
        </section>
        <section class="detail-section">
            <h6>Stock Summary</h6>
            <div class="detail-grid">
                ${detailBox('Storage Qty', row.storage_quantity)}
                ${detailBox('Shelf Qty', row.shelf_quantity)}
                ${detailBox('Damaged Qty', row.damaged_quantity)}
                ${detailBox('Total Qty', row.total_quantity)}
            </div>
        </section>
        <section class="detail-section">
            <h6>Batch Breakdown</h6>
            <div class="table-responsive">
                <table class="table modal-table align-middle">
                    <thead><tr><th>Batch / PO Number</th><th>Supplier</th><th>Received Date</th><th>Expiry Date</th><th>Storage Qty</th><th>Shelf Qty</th><th>Damaged Qty</th><th>Status</th></tr></thead>
                    <tbody>${tableRows(row.batches, 'No batch records found.', (batch) => `
                        <tr>
                            <td>
                                <strong>${esc(batch.po_number || batch.batch_number || batch.batch_id)}</strong>
                                ${renderBatchBadges(batch)}
                            </td>
                            <td>${esc(cleanText(batch.supplier_name))}</td>
                            <td>${esc(formatDate(batch.received_date))}</td>
                            <td>${esc(formatDate(batch.expiry_date, 'N/A'))}</td>
                            <td><span class="qty-number">${esc(batch.storage_qty ?? 0)}</span></td>
                            <td><span class="qty-number">${esc(batch.shelf_qty ?? 0)}</span></td>
                            <td><span class="qty-number">${esc(batch.damaged_qty ?? 0)}</span></td>
                            <td>${statusBadge(batch.status)}<div class="small text-muted">${esc(cleanText(batch.batch_status))}</div></td>
                        </tr>
                    `)}</tbody>
                </table>
            </div>
        </section>
        <section class="detail-section mb-0">
            <h6>Last Received Info</h6>
            <div class="detail-grid">
                ${detailBox('Last Received Date', formatDate(row.last_received_date))}
                ${detailBox('Supplier', row.latest_supplier_name)}
                ${detailBox('PO Reference', row.latest_po_number)}
            </div>
        </section>
    `;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('inventoryDetailsModal')).show();
}

function openMoveModal(productId) {
    const row = rowById(productId);
    if (!row) return;

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

function openHistory(productId) {
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
                        <td>${esc(cleanText(item.user_name, '—'))}</td>
                        <td>${esc(cleanText(item.notes, '—'))}</td>
                    </tr>
                `)}</tbody>
            </table>
        </div>
    `;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('stockHistoryModal')).show();
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);
    document.getElementById('themeToggle').innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('drpTheme', theme);
}

setTheme(localStorage.getItem('drpTheme') || 'light');
document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
document.getElementById('btnRefreshInventory')?.addEventListener('click', loadInventory);
document.getElementById('moveShelfForm')?.addEventListener('submit', submitMove);
document.getElementById('table-inventory')?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.view-inventory-btn');
    const moveButton = event.target.closest('.move-selling-btn');
    const historyButton = event.target.closest('.history-btn');

    if (viewButton) openDetails(viewButton.dataset.productId);
    if (moveButton) openMoveModal(moveButton.dataset.productId);
    if (historyButton) openHistory(historyButton.dataset.productId);
});

loadInventory();
