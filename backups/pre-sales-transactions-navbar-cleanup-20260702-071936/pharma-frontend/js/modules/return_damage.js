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
    const color = status === 'Resolved' ? '#16a34a' : '#ef4444';
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
        document.getElementById('viewReturnDamageSubtitle').textContent = `${record.po_number} · ${record.supplier_name}`;
        document.getElementById('viewReturnDamageDetails').innerHTML = detailGrid(record);
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

function initReturnDamage() {
    setTheme(localStorage.getItem('drpTheme') || 'light');

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });
    document.getElementById('btnRefreshReturnDamage')?.addEventListener('click', loadReturnDamageRecords);
    document.getElementById('btnSaveReturnDamageEdit')?.addEventListener('click', saveReturnDamageEdit);
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
