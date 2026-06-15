import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

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
    return Number.isNaN(date.getTime())
        ? escapeHtml(value)
        : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function money(value) {
    return Number(value || 0).toFixed(2);
}

function statusBadge(status) {
    return `<span class="badge text-white" style="background:#f59e0b">${escapeHtml(status)}</span>`;
}

function listText(values) {
    if (Array.isArray(values)) return values.map((value) => escapeHtml(value)).join(', ');
    return escapeHtml(values || 'None');
}

function numberedList(values, options = {}) {
    const list = Array.isArray(values) ? values : [];
    const plain = options.plain ? ' table-line-list-plain' : '';

    if (list.length === 0) return '<span class="text-muted">None</span>';

    return `
        <ol class="table-line-list${plain}">
            ${list.map((value, index) => `
                <li>
                    ${options.plain ? '' : `<span class="line-index">${index + 1}.</span>`}
                    <span class="line-text">${escapeHtml(value)}</span>
                </li>
            `).join('')}
        </ol>
    `;
}

function productDetailValue(item, field) {
    const isMedicine = item.category_name === 'Medicine';

    if (field === 'genericVariant') {
        return isMedicine ? (item.generic_name || 'N/A') : (item.variant_flavor || 'N/A');
    }

    if (field === 'strengthSize') {
        return isMedicine ? (item.strength || 'N/A') : (item.size_value || 'N/A');
    }

    if (field === 'packaging') {
        return isMedicine ? (item.size_value || 'N/A') : (item.packaging || 'N/A');
    }

    return 'N/A';
}

function productLineTotal(item) {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.price || 0);
    return quantity * unitPrice;
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

function renderPendingOrders(orders) {
    const tableBody = document.querySelector('#table-pending-orders tbody');
    const countLabel = document.getElementById('pendingOrderCount');
    if (!tableBody) return;

    if (countLabel) {
        countLabel.textContent = String(orders.length);
    }

    if (orders.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" class="po-empty">No pending purchase orders for approval.</td></tr>';
        return;
    }

    tableBody.innerHTML = orders.map((order) => `
        <tr>
            <td>${formatDate(order.order_date)}</td>
            <td>${escapeHtml(order.supplier_name)}</td>
            <td>${numberedList((order.items || []).length ? order.items.map((item) => item.product_name) : (order.item_names || []))}</td>
            <td>${numberedList(Array.isArray(order.brand_names) ? order.brand_names : (order.items || []).map((item) => item.brand_name))}</td>
            <td>${numberedList(order.quantities || (order.items || []).map((item) => item.quantity), { plain: true })}</td>
            <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
            <td>${formatDate(order.expected_delivery_date)}</td>
            <td>${statusBadge(order.status)}</td>
            <td>
                <div class="d-inline-flex align-items-center justify-content-center gap-2">
                    <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-success approve-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Approve">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger cancel-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Cancel">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function loadPendingOrders() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_pending_orders.php`);
        renderPendingOrders(data.purchase_orders || []);
    } catch (error) {
        renderPendingOrders([]);
        PharmaUtils.toast.error(error.message);
    }
}

async function openViewPurchaseOrder(poId) {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_order.php?po_id=${encodeURIComponent(poId)}`);
        const order = data.purchase_order;

        document.getElementById('pendingViewPoNumber').textContent = order.po_number;
        document.getElementById('pendingViewDetails').innerHTML = `
            <div class="po-detail-box"><span>Supplier</span><strong>${escapeHtml(order.supplier_name)}</strong></div>
            <div class="po-detail-box"><span>Order Date</span><strong>${formatDate(order.order_date)}</strong></div>
            <div class="po-detail-box"><span>Payment Terms</span><strong>${escapeHtml(order.payment_terms)}</strong></div>
            <div class="po-detail-box"><span>Expected Delivery</span><strong>${formatDate(order.expected_delivery_date)}</strong></div>
            <div class="po-detail-box"><span>Status</span><strong>${escapeHtml(order.status)}</strong></div>
        `;
        document.getElementById('pendingViewItems').innerHTML = order.items.map((item) => `
            <tr>
                <td>${escapeHtml(item.product_name)}</td>
                <td>${escapeHtml(item.brand_name)}</td>
                <td>${escapeHtml(item.category_name || 'N/A')}</td>
                <td>${escapeHtml(item.type_name || 'N/A')}</td>
                <td>${escapeHtml(productDetailValue(item, 'genericVariant'))}</td>
                <td>${escapeHtml(productDetailValue(item, 'strengthSize'))}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(productDetailValue(item, 'packaging'))}</td>
                <td>${money(item.price)}</td>
                <td>${escapeHtml(item.quantity)}</td>
                <td>${money(productLineTotal(item))}</td>
            </tr>
        `).join('');

        bootstrap.Modal.getOrCreateInstance(document.getElementById('pendingOrderViewModal')).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function approvePurchaseOrder(poId) {
    try {
        if (window.Swal) {
            const result = await Swal.fire({
                title: 'Approve purchase order?',
                text: 'This will mark the order as approved by the owner.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Approve',
                confirmButtonColor: '#16a34a'
            });

            if (!result.isConfirmed) return;
        } else if (!confirm('Approve this purchase order?')) {
            return;
        }

        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/approve_purchase_order.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ po_id: poId })
        });

        PharmaUtils.toast.success(data.message);
        await loadPendingOrders();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function cancelPurchaseOrder(poId) {
    try {
        if (window.Swal) {
            const result = await Swal.fire({
                title: 'Cancel purchase order?',
                text: 'This will mark the pending order as cancelled.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Cancel Order',
                confirmButtonColor: '#dc2626'
            });

            if (!result.isConfirmed) return;
        } else if (!confirm('Cancel this purchase order?')) {
            return;
        }

        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/cancel_purchase_order.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ po_id: poId })
        });

        PharmaUtils.toast.success(data.message);
        await loadPendingOrders();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function initPendingOrders() {
    setTheme(localStorage.getItem('drpTheme') || 'light');

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });

    document.getElementById('btnRefreshPendingOrders')?.addEventListener('click', loadPendingOrders);
    document.getElementById('table-pending-orders')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('.view-po-btn');
        const approveButton = event.target.closest('.approve-po-btn');
        const cancelButton = event.target.closest('.cancel-po-btn');

        if (viewButton) openViewPurchaseOrder(viewButton.dataset.poId);
        if (approveButton) approvePurchaseOrder(approveButton.dataset.poId);
        if (cancelButton) cancelPurchaseOrder(cancelButton.dataset.poId);
    });

    loadPendingOrders();
}

initPendingOrders();
