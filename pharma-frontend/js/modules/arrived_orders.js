import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

let activeReceiveOrder = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function fetchJson(url, options = {}) {
    const data = await PharmaUtils.safeFetch(url, { credentials: 'include', ...options });

    if (data.success === false) {
        const detail = data.error ? ` ${data.error}` : '';
        throw new Error(`${data.message || 'Request failed.'}${detail}`);
    }

    return data;
}

function formatDate(value) {
    if (!value) return 'Not set';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime())
        ? escapeHtml(value)
        : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function peso(value) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(Number(value || 0));
}

function statusBadge(status) {
    return `<span class="badge text-white" style="background:#8b5cf6">${escapeHtml(status)}</span>`;
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

function renderArrivedOrders(orders) {
    const body = document.querySelector('#table-arrived-orders tbody');
    const count = document.getElementById('arrivedOrderCount');
    if (!body) return;

    if (count) count.textContent = String(orders.length);

    if (orders.length === 0) {
        body.innerHTML = '<tr><td colspan="10" class="empty-row">No arrived purchase orders ready for receiving.</td></tr>';
        return;
    }

    body.innerHTML = orders.map((order) => `
        <tr>
            <td>${formatDate(order.order_date)}</td>
            <td>${escapeHtml(order.po_number)}</td>
            <td>${escapeHtml(order.supplier_name)}</td>
            <td>${numberedList(order.item_names || (order.items || []).map((item) => item.product_name))}</td>
            <td>${numberedList(Array.isArray(order.brand_names) ? order.brand_names : (order.items || []).map((item) => item.brand_name))}</td>
            <td>${numberedList(order.quantities || (order.items || []).map((item) => item.quantity), { plain: true })}</td>
            <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
            <td>${formatDate(order.expected_delivery_date)}</td>
            <td>${statusBadge(order.status)}</td>
            <td>
                <div class="arrived-actions">
                    <button class="btn btn-sm btn-outline-primary view-arrived-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success receive-arrived-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Receive Items">
                        <i class="fa-solid fa-boxes-packing"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function loadArrivedOrders() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_arrived_orders.php`);
        renderArrivedOrders(data.purchase_orders || []);
    } catch (error) {
        renderArrivedOrders([]);
        PharmaUtils.toast.error(error.message);
    }
}

async function getPurchaseOrder(poId) {
    const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_order.php?po_id=${encodeURIComponent(poId)}`);
    return data.purchase_order;
}

function detailGrid(order) {
    return `
        <div class="detail-box"><span>PO Number</span><strong>${escapeHtml(order.po_number)}</strong></div>
        <div class="detail-box"><span>Supplier Name</span><strong>${escapeHtml(order.supplier_name)}</strong></div>
        <div class="detail-box"><span>Order Date</span><strong>${formatDate(order.order_date)}</strong></div>
        <div class="detail-box"><span>Payment Terms</span><strong>${escapeHtml(order.payment_terms || 'Not set')}</strong></div>
        <div class="detail-box"><span>Expected Delivery</span><strong>${formatDate(order.expected_delivery_date)}</strong></div>
        <div class="detail-box"><span>Status</span><strong>${escapeHtml(order.status)}</strong></div>
    `;
}

async function openViewOrder(poId) {
    try {
        const order = await getPurchaseOrder(poId);
        document.getElementById('viewArrivedPoNumber').textContent = `${order.po_number} · ${order.supplier_name}`;
        document.getElementById('viewArrivedDetails').innerHTML = detailGrid(order);
        document.getElementById('viewArrivedItems').innerHTML = order.items.map((item) => `
            <tr>
                <td>${escapeHtml(item.product_name)}</td>
                <td>${escapeHtml(item.brand_name)}</td>
                <td>${escapeHtml(item.quantity)}</td>
                <td>${escapeHtml(item.received_quantity || 0)}</td>
                <td>${escapeHtml(item.damaged_quantity || 0)}</td>
            </tr>
        `).join('');
        bootstrap.Modal.getOrCreateInstance(document.getElementById('viewArrivedOrderModal')).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function renderReceiveItems(order) {
    const body = document.querySelector('#table-arrived-receive-items tbody');
    if (!body) return;

    body.innerHTML = order.items.map((item) => `
        <tr data-po-item-id="${escapeHtml(item.po_item_id)}">
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.brand_name)}</td>
            <td>${escapeHtml(item.quantity)}</td>
            <td><input class="form-control form-control-sm received-qty-input" type="number" min="0" max="${escapeHtml(item.quantity)}" value="${escapeHtml(item.quantity)}"></td>
            <td><input class="form-control form-control-sm damaged-qty-input" type="number" min="0" max="${escapeHtml(item.quantity)}" value="0"></td>
            <td><input class="form-control form-control-sm expiry-date-input" type="date"></td>
            <td><textarea class="form-control form-control-sm receive-remarks-input" rows="1"></textarea></td>
        </tr>
    `).join('');
}

function orderTotal(order) {
    if (Number(order?.total_amount || 0) > 0) {
        return Number(order.total_amount);
    }

    return (order?.items || []).reduce((total, item) => {
        return total + (Number(item.quantity || 0) * Number(item.price || 0));
    }, 0);
}

function paymentSummary() {
    const originalTotal = (activeReceiveOrder?.items || []).reduce((total, item) => {
        return total + (Number(item.quantity || 0) * Number(item.price || 0));
    }, 0);
    const additionalAmount = Number(document.getElementById('receiveAdditionalAmount')?.value || 0);
    let damageDeduction = 0;
    let hasDamage = false;

    document.querySelectorAll('#table-arrived-receive-items tbody tr').forEach((row) => {
        const poItemId = row.dataset.poItemId;
        const orderItem = activeReceiveOrder?.items.find((item) => String(item.po_item_id) === String(poItemId));
        const damagedQuantity = Number(row.querySelector('.damaged-qty-input')?.value || 0);
        const unitPrice = Number(orderItem?.price || 0);

        if (damagedQuantity > 0) hasDamage = true;
        damageDeduction += Math.max(0, damagedQuantity) * unitPrice;
    });

    const subtotalPayable = Math.max(0, originalTotal - damageDeduction);
    const finalAmount = subtotalPayable + Math.max(0, additionalAmount);

    return {
        originalTotal,
        damageDeduction,
        additionalAmount,
        finalAmount,
        hasDamage
    };
}

function renderPaymentSummary() {
    const summary = paymentSummary();
    const original = document.getElementById('receiveOriginalTotal');
    const deduction = document.getElementById('receiveDamageDeduction');
    const finalAmount = document.getElementById('receiveFinalAmount');

    if (original) original.textContent = peso(summary.originalTotal);
    if (deduction) deduction.textContent = peso(summary.damageDeduction);
    if (finalAmount) finalAmount.textContent = peso(summary.finalAmount);
}

async function openReceiveOrder(poId) {
    try {
        activeReceiveOrder = await getPurchaseOrder(poId);
        document.getElementById('receiveArrivedPoNumber').textContent = activeReceiveOrder.po_number;
        document.getElementById('receiveArrivedSupplierName').textContent = activeReceiveOrder.supplier_name;
        document.getElementById('receiveArrivedRemarks').value = '';
        const additionalAmount = document.getElementById('receiveAdditionalAmount');
        const adjustmentReason = document.getElementById('receiveAdjustmentReason');
        if (additionalAmount) additionalAmount.value = '0';
        if (adjustmentReason) adjustmentReason.value = '';
        renderReceiveItems(activeReceiveOrder);
        renderPaymentSummary();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('receiveArrivedOrderModal')).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function receivePayload() {
    if (!activeReceiveOrder) throw new Error('No arrived purchase order selected.');

    const items = [];
    const summary = paymentSummary();

    if (summary.additionalAmount < 0) {
        throw new Error('Additional amount cannot be negative.');
    }

    document.querySelectorAll('#table-arrived-receive-items tbody tr').forEach((row) => {
        const poItemId = row.dataset.poItemId;
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(poItemId));
        const receivedQuantity = Number(row.querySelector('.received-qty-input')?.value || 0);
        const damagedQuantity = Number(row.querySelector('.damaged-qty-input')?.value || 0);
        const expiryDate = row.querySelector('.expiry-date-input')?.value || '';
        const remarks = row.querySelector('.receive-remarks-input')?.value || '';
        const orderedQuantity = Number(orderItem?.quantity || 0);

        if (receivedQuantity < 0 || damagedQuantity < 0) {
            throw new Error('Received and damaged quantities cannot be negative.');
        }

        if (receivedQuantity > orderedQuantity) {
            throw new Error('Received quantity cannot exceed ordered quantity.');
        }

        if (damagedQuantity > receivedQuantity) {
            throw new Error('Damaged quantity cannot be greater than received quantity.');
        }

        items.push({
            po_item_id: poItemId,
            received_quantity: receivedQuantity,
            damaged_quantity: damagedQuantity,
            expiry_date: expiryDate,
            remarks
        });
    });

    return {
        po_id: activeReceiveOrder.po_id,
        remarks: document.getElementById('receiveArrivedRemarks')?.value || '',
        amount_paid: summary.finalAmount,
        additional_amount: summary.additionalAmount,
        adjustment_reason: document.getElementById('receiveAdjustmentReason')?.value || '',
        items
    };
}

async function confirmReceive() {
    try {
        const payload = receivePayload();
        PharmaUtils.modal.loading('Receiving Arrived Order...');
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/receive_purchase_order.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        PharmaUtils.modal.close();
        bootstrap.Modal.getInstance(document.getElementById('receiveArrivedOrderModal'))?.hide();
        PharmaUtils.toast.success(data.has_damage
            ? 'Received good items, recorded damaged items, and moved the PO to Complete Delivery.'
            : data.message);
        await loadArrivedOrders();
    } catch (error) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to receive arrived order', error.message);
    }
}

function initArrivedOrders() {
    setTheme(localStorage.getItem('drpTheme') || 'light');

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });
    document.getElementById('btnRefreshArrivedOrders')?.addEventListener('click', loadArrivedOrders);
    document.getElementById('btnConfirmArrivedReceive')?.addEventListener('click', confirmReceive);
    document.getElementById('receiveAdditionalAmount')?.addEventListener('input', renderPaymentSummary);
    document.getElementById('table-arrived-receive-items')?.addEventListener('input', (event) => {
        if (event.target.closest('.received-qty-input, .damaged-qty-input')) {
            renderPaymentSummary();
        }
    });
    document.getElementById('table-arrived-orders')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('.view-arrived-btn');
        const receiveButton = event.target.closest('.receive-arrived-btn');

        if (viewButton) openViewOrder(viewButton.dataset.poId);
        if (receiveButton) openReceiveOrder(receiveButton.dataset.poId);
    });

    loadArrivedOrders();
}

initArrivedOrders();
