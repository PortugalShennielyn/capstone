import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

async function fetchJson(url, options = {}) {
    const response = await fetch(url, { credentials: 'include', ...options });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
        throw new Error(data.error || data.message || 'Request failed.');
    }
    return data;
}

function dateText(value) {
    if (!value) return 'N/A';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleDateString('en-US');
}

function categoryDetail(row, field) {
    const isMedicine = row.category_name === 'Medicine';
    const isLiquid = /\b(liquid|syrup|solution|suspension|drops|betadine|povidone)\b/.test(
        `${row.product_name || ''} ${row.brand_name || ''} ${row.type_name || ''}`.toLowerCase()
    );
    if (field === 'generic') return isMedicine ? (row.generic_name || 'N/A') : (row.variant_flavor || 'N/A');
    if (field === 'strength') {
        if (!isMedicine) return row.weight_volume_value ? `${row.weight_volume_value} ${row.weight_volume_unit || ''}`.trim() : (row.size || 'N/A');
        if (isLiquid) return row.volume_value ? `${row.volume_value} ${row.volume_unit || ''}`.trim() : (row.strength || 'N/A');
        return row.strength || 'N/A';
    }
    if (field === 'size') return isMedicine ? (row.packaging || 'N/A') : (row.packaging || 'N/A');
    if (field === 'detailLabel') return isMedicine && isLiquid ? 'Volume' : (isMedicine ? 'Strength' : 'Weight/Volume');
    return 'N/A';
}

function renderInventorySummary(rows) {
    const container = document.getElementById('inventorySummaryCards');
    if (!container) return;

    const today = new Date();
    const soon = new Date();
    soon.setDate(today.getDate() + 30);

    const summary = rows.reduce((totals, row) => {
        const totalInventory = Number(row.total_inventory_quantity || 0);
        const available = Number(row.available_quantity || 0);
        const selling = Number(row.selling_quantity || 0);
        const damaged = Number(row.damaged_returned_quantity || 0);
        const expiry = row.expiry_date ? new Date(String(row.expiry_date).replace(' ', 'T')) : null;

        totals.totalInventory += totalInventory;
        totals.available += available;
        totals.selling += selling;
        totals.damaged += damaged;
        if (available > 0 && available <= 10) totals.lowStock += 1;
        if (expiry && !Number.isNaN(expiry.getTime()) && expiry >= today && expiry <= soon) totals.expiringSoon += 1;
        return totals;
    }, {
        totalInventory: 0,
        available: 0,
        selling: 0,
        damaged: 0,
        lowStock: 0,
        expiringSoon: 0
    });

    const cards = [
        ['Total Inventory', summary.totalInventory, '#7c3aed'],
        ['Available Stock', summary.available, '#2563eb'],
        ['Selling/Shelf Stock', summary.selling, '#16a34a'],
        ['Damaged/Returned', summary.damaged, '#ef4444'],
        ['Low Stock', summary.lowStock, '#f59e0b'],
        ['Expiring Soon', summary.expiringSoon, '#06b6d4']
    ];

    container.innerHTML = cards.map(([label, value, color]) => `
        <div class="inventory-summary-card" style="--summary-color:${color}">
            <strong>${esc(value)}</strong>
            <p>${esc(label)}</p>
        </div>
    `).join('');
}

function renderInventory(rows) {
    const body = document.querySelector('#table-inventory tbody');
    const count = document.getElementById('inventoryCount');
    if (!body) return;
    if (count) count.textContent = String(rows.length);
    renderInventorySummary(rows);

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="15" class="empty-row">No inventory records found.</td></tr>';
        return;
    }

    body.innerHTML = rows.map(row => `
        <tr>
            <td>${esc(row.product_name)}</td>
            <td>${esc(row.brand_name)}</td>
            <td>${esc(row.category_name || 'N/A')}</td>
            <td>${esc(row.type_name || 'N/A')}</td>
            <td>${esc(categoryDetail(row, 'generic'))}</td>
            <td>${esc(categoryDetail(row, 'strength'))}</td>
            <td>${esc(row.unit || 'N/A')}</td>
            <td>${esc(categoryDetail(row, 'size'))}</td>
            <td>${esc(row.total_inventory_quantity)}</td>
            <td>${esc(row.available_quantity)}</td>
            <td>${esc(row.selling_quantity)}</td>
            <td>${esc(row.damaged_returned_quantity)}</td>
            <td>${dateText(row.last_stock_in_date)}</td>
            <td>${dateText(row.expiry_date)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-sm btn-purple move-selling-btn" data-product-id="${esc(row.product_id)}" data-variation-id="${esc(row.variation_id || '')}" data-available="${esc(row.available_quantity)}" data-name="${esc(row.product_name)}" title="Move to Selling Stock">
                        <i class="fa-solid fa-arrow-right-arrow-left"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary view-inventory-btn" data-row="${encodeURIComponent(JSON.stringify(row))}" title="View Details">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function loadInventory() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/inventory/get_inventory.php`);
        renderInventory(data.data || []);
    } catch (error) {
        renderInventory([]);
        PharmaUtils.toast.error(error.message);
    }
}

async function moveToSelling(button) {
    const available = Number(button.dataset.available || 0);
    if (available <= 0) {
        PharmaUtils.toast.error('No available warehouse stock to move.');
        return;
    }

    const result = await Swal.fire({
        title: 'Move to Selling Stock',
        text: `Available warehouse quantity for ${button.dataset.name}: ${available}`,
        input: 'number',
        inputAttributes: { min: 1, max: available, step: 1 },
        inputValue: available,
        showCancelButton: true,
        confirmButtonText: 'Move Stock',
        confirmButtonColor: '#7c3aed'
    });

    if (!result.isConfirmed) return;

    const quantity = Number(result.value || 0);
    if (quantity <= 0 || quantity > available) {
        PharmaUtils.toast.error('Enter a valid quantity.');
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE_URL}/inventory/move_to_selling_stock.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: button.dataset.productId, variation_id: button.dataset.variationId, quantity })
        });
        PharmaUtils.toast.success(data.message);
        await loadInventory();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function viewInventory(button) {
    const row = JSON.parse(decodeURIComponent(button.dataset.row || '{}'));
    document.getElementById('inventoryDetails').innerHTML = `
        <div class="detail-box"><span>Product</span><strong>${esc(row.product_name)}</strong></div>
        <div class="detail-box"><span>Brand</span><strong>${esc(row.brand_name)}</strong></div>
        <div class="detail-box"><span>Category</span><strong>${esc(row.category_name || 'N/A')} / ${esc(row.type_name || 'N/A')}</strong></div>
        ${row.category_name === 'Medicine'
            ? `<div class="detail-box"><span>Generic Name</span><strong>${esc(row.generic_name || 'N/A')}</strong></div><div class="detail-box"><span>${esc(categoryDetail(row, 'detailLabel'))}</span><strong>${esc(categoryDetail(row, 'strength'))}</strong></div><div class="detail-box"><span>Unit</span><strong>${esc(row.unit || 'N/A')}</strong></div><div class="detail-box"><span>Packaging</span><strong>${esc(row.packaging || 'N/A')}</strong></div>`
            : `<div class="detail-box"><span>Variant / Flavor</span><strong>${esc(row.variant_flavor || 'N/A')}</strong></div><div class="detail-box"><span>Size</span><strong>${esc(row.size || 'N/A')}</strong></div><div class="detail-box"><span>Weight/Volume</span><strong>${esc(categoryDetail(row, 'strength'))}</strong></div><div class="detail-box"><span>Unit</span><strong>${esc(row.unit || 'N/A')}</strong></div><div class="detail-box"><span>Packaging</span><strong>${esc(row.packaging || 'N/A')}</strong></div>`}
        <div class="detail-box"><span>Warehouse Available</span><strong>${esc(row.available_quantity)}</strong></div>
        <div class="detail-box"><span>Selling Shelf</span><strong>${esc(row.selling_quantity)}</strong></div>
        <div class="detail-box"><span>Damaged/Returned</span><strong>${esc(row.damaged_returned_quantity)}</strong></div>
    `;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('inventoryDetailsModal')).show();
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
document.getElementById('table-inventory')?.addEventListener('click', (event) => {
    const moveButton = event.target.closest('.move-selling-btn');
    const viewButton = event.target.closest('.view-inventory-btn');
    if (moveButton) moveToSelling(moveButton);
    if (viewButton) viewInventory(viewButton);
});

loadInventory();
