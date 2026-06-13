import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const STATUS_COLORS = {
    'Delivered': '#16a34a'
};
let deliveredOrders = [];

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, { credentials: 'include', ...options });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
        throw new Error(data.error || data.message || 'Request failed.');
    }
    return data;
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('drpTheme', theme);
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

function statusBadge() {
    return `<span class="badge status-badge text-white" style="background:${STATUS_COLORS.Delivered}">Delivered</span>`;
}

function numberedList(values, options = {}) {
    const list = Array.isArray(values) ? values : [];
    const plain = options.plain ? ' plain' : '';
    if (!list.length) return '<span class="text-muted">None</span>';

    return `
        <ol class="line-list${plain}">
            ${list.map((value, index) => `
                <li>
                    ${options.plain ? '' : `<span class="idx">${index + 1}.</span>`}
                    <span class="txt">${escapeHtml(value)}</span>
                </li>
            `).join('')}
        </ol>
    `;
}

function getOrderById(poId) {
    return deliveredOrders.find(order => String(order.po_id) === String(poId));
}

function renderCompleteDeliveryTable(orders) {
    const body = document.querySelector('#table-complete-delivery tbody');
    const count = document.getElementById('completeDeliveryCount');
    if (!body) return;
    if (count) count.textContent = String(orders.length);

    if (!orders.length) {
        body.innerHTML = '<tr><td colspan="12" class="empty-row">No completed deliveries found.</td></tr>';
        return;
    }

    body.innerHTML = orders.map(order => {
        const items = order.items || [];
        const itemNames = order.item_names || items.map(item => item.product_name);
        const brandNames = order.brand_names || items.map(item => item.brand_name);
        const orderedQuantities = order.quantities || items.map(item => item.quantity);
        const receivedQuantities = items.map(item => Number(item.received_quantity || 0));
        const deliveryDate = order.delivery_date || order.received_date || order.expected_delivery_date || order.order_date;

        return `
            <tr>
                <td>${formatDate(deliveryDate)}</td>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td>${numberedList(itemNames)}</td>
                <td>${numberedList(brandNames)}</td>
                <td>${numberedList(orderedQuantities, { plain: true })}</td>
                <td>${numberedList(receivedQuantities, { plain: true })}</td>
                <td><span class="money-nowrap">${peso(order.total_amount)}</span></td>
                <td><span class="money-nowrap">${peso(order.final_payment)}</span></td>
                <td>${escapeHtml(order.payment_state || order.payment_status || 'Unpaid')}</td>
                <td>${statusBadge()}</td>
                <td>
                    <div class="complete-actions">
                        <button class="btn btn-sm btn-outline-primary view-complete-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View details">
                            <i class="fa-regular fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadCompleteDeliveries() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_orders.php?scope=complete`);
        deliveredOrders = data.purchase_orders || [];
        renderCompleteDeliveryTable(deliveredOrders);
    } catch (error) {
        deliveredOrders = [];
        renderCompleteDeliveryTable([]);
        PharmaUtils.toast.error(error.message);
    }
}

function openDetails(poId) {
    const order = getOrderById(poId);
    if (!order) return;

    const deliveryDate = order.delivery_date || order.received_date || order.expected_delivery_date || order.order_date;
    document.getElementById('completeDeliveryPoNumber').textContent = order.po_number || `PO-${order.po_id}`;
    document.getElementById('completeDeliveryDetails').innerHTML = `
        <div class="detail-box"><span>PO Number</span><strong>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</strong></div>
        <div class="detail-box"><span>Supplier</span><strong>${escapeHtml(order.supplier_name || 'N/A')}</strong></div>
        <div class="detail-box"><span>Delivery Date</span><strong>${formatDate(deliveryDate)}</strong></div>
        <div class="detail-box"><span>Total Amount</span><strong>${peso(order.total_amount)}</strong></div>
        <div class="detail-box"><span>Final Payment</span><strong>${peso(order.final_payment)}</strong></div>
        <div class="detail-box"><span>Payment Status</span><strong>${escapeHtml(order.payment_state || order.payment_status || 'Unpaid')}</strong></div>
        <div class="detail-box"><span>Status</span><strong>${escapeHtml(order.status || 'Delivered')}</strong></div>
        <div class="detail-box"><span>Remarks</span><strong>${escapeHtml(order.receiving_remarks || 'N/A')}</strong></div>
    `;

    document.getElementById('completeDeliveryItems').innerHTML = (order.items || []).map(item => `
        <tr>
            <td>${escapeHtml(item.product_name || 'N/A')}</td>
            <td>${escapeHtml(item.brand_name || 'N/A')}</td>
            <td>${escapeHtml(item.quantity || 0)}</td>
            <td>${escapeHtml(item.received_quantity || 0)}</td>
            <td>${escapeHtml(Math.max(Number(item.damaged_quantity || 0), Number(item.returned_quantity || 0)))}</td>
            <td>${peso(item.price)}</td>
            <td>${peso(item.returned_amount)}</td>
        </tr>
    `).join('');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('completeDeliveryDetailsModal')).show();
}

setTheme(localStorage.getItem('drpTheme') || 'light');
document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
document.getElementById('btnRefreshCompleteDelivery')?.addEventListener('click', loadCompleteDeliveries);
document.getElementById('table-complete-delivery')?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.view-complete-btn');
    if (viewButton) openDetails(viewButton.dataset.poId);
});

loadCompleteDeliveries();
