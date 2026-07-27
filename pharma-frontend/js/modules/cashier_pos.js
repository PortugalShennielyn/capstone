import API_BASE_URL from '../config/config.js';

const state = {
    tab: 'waiting',
    orders: [],
    activeOrderId: null,
    activeOrder: null,
    searchTimer: null,
    receiptOnly: false,
};

const nodes = {
    waiting: document.getElementById('summaryWaiting'),
    processing: document.getElementById('summaryProcessing'),
    completed: document.getElementById('summaryCompleted'),
    sales: document.getElementById('summarySales'),
    search: document.getElementById('cashierSearch'),
    list: document.getElementById('cashierOrderList'),
    detail: document.getElementById('cashierDetailPanel'),
    refresh: document.getElementById('refreshCashierBtn'),
    receiptPrint: document.getElementById('cashierReceiptPrintArea'),
};

const money = (value) => `\u20b1${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})}`;

const numberText = (value) => Number(value || 0).toLocaleString('en-PH');

const plainMoney = (value) => Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const discountOptions = [
    { value: 'none', label: 'No discount' },
    { value: 'senior', label: 'Senior Citizen (20%)' },
    { value: 'pwd', label: 'PWD (20%)' },
    { value: 'promo', label: 'Promo (10%)' },
    { value: 'custom', label: 'Custom amount' },
];

const cleanText = (value, fallback = '') => {
    const text = String(value ?? '').trim();
    return text ? text : fallback;
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatDateTime = (value) => {
    if (!value) return '-';
    const normalized = String(value).replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-PH', {
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const formatReceiptDateTime = (value) => {
    if (!value) return '-';
    const normalized = String(value).replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const toast = (type, message) => {
    if (window.toastr && typeof window.toastr[type] === 'function') {
        window.toastr[type](message);
        return;
    }
    console[type === 'error' ? 'error' : 'log'](message);
};

async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status === 'error') {
        throw new Error(data.message || 'Request failed.');
    }
    if (data && typeof data === 'object' && data.data && typeof data.data === 'object') {
        return data.data;
    }
    return data || {};
}

function statusClass(order) {
    const group = order.status_group || order.status_code || '';
    if (group.includes('completed')) return 'status-completed';
    if (group.includes('processing') || group.includes('accepted')) return 'status-processing';
    if (group.includes('cancelled') || group.includes('rejected')) return 'status-cancelled';
    return 'status-waiting';
}

function renderSummary(summary = {}) {
    nodes.waiting.textContent = numberText(summary.waiting_orders);
    nodes.processing.textContent = numberText(summary.processing_orders);
    nodes.completed.textContent = numberText(summary.completed_today);
    nodes.sales.textContent = money(summary.total_sales_today);
}

function orderActionLabel(order) {
    return order.status_code === 'waiting_cashier' ? 'Open' : 'Open';
}

function orderActionClass(order) {
    return order.status_code === 'waiting_cashier' ? 'mini-action' : 'mini-action secondary';
}

function normalizeWorkingTab(tab) {
    return tab === 'processing' ? 'processing' : 'waiting';
}

function discountAmount(type, customAmount, subtotal) {
    const base = Math.max(0, Number(subtotal || 0));
    if (type === 'senior' || type === 'pwd') return Math.min(base, base * 0.2);
    if (type === 'promo') return Math.min(base, base * 0.1);
    if (type === 'custom') return Math.min(base, Math.max(0, Number(customAmount || 0)));
    return 0;
}

function paymentTotals(order, type, customAmount) {
    const subtotal = Math.max(0, Number(order.subtotal || 0));
    const discount = discountAmount(type, customAmount, subtotal);
    const taxable = Math.max(0, subtotal - discount);
    const vat = taxable * 0.12;
    const finalAmount = taxable + vat;
    return { discount, vat, finalAmount };
}

function receiptSpec(item) {
    return [
        item.generic_name,
        item.strength || item.net_weight || item.specification,
    ].filter((part) => cleanText(part)).join(' / ');
}

function receiptProductLine(item) {
    const brand = cleanText(item.brand_name);
    const product = cleanText(item.product_name, 'Item');
    if (brand && product && brand.toLowerCase() !== product.toLowerCase()) {
        return `${brand} ${product}`;
    }
    return product || brand || 'Item';
}

function completedReceiptTotals(order) {
    const discountType = order.cashier_discount_type || 'none';
    const cashierDiscount = Number(order.cashier_discount_amount || 0);
    const calculated = paymentTotals(order, discountType, cashierDiscount);
    const finalAmount = Number(order.final_amount || order.total_amount || calculated.finalAmount || 0);
    const subtotal = Number(order.subtotal || 0);
    const discount = Number(cashierDiscount || calculated.discount || 0);
    const vat = Number(calculated.vat || order.vat || Math.max(0, finalAmount - Math.max(0, subtotal - discount)));
    const cashReceived = Number(order.amount_paid || order.cash_received || 0);
    const change = Number(order.change_amount || Math.max(0, cashReceived - finalAmount));

    return {
        subtotal,
        vat,
        discount,
        finalAmount,
        cashReceived,
        change,
    };
}

function receiptItemRows(order) {
    if (!Array.isArray(order.items) || !order.items.length) {
        return '<div class="receipt-item-print"><span>0</span><span>No items found.</span><span class="receipt-money-print">0.00</span></div>';
    }

    return order.items.map((item) => {
        const spec = receiptSpec(item);
        return `
            <div class="receipt-item-print">
                <span>${escapeHtml(numberText(item.quantity))}</span>
                <span>
                    <span class="receipt-item-name-print">${escapeHtml(receiptProductLine(item))}</span>
                    ${spec ? `<span class="receipt-item-spec-print">${escapeHtml(spec)}</span>` : ''}
                </span>
                <span class="receipt-money-print">${escapeHtml(plainMoney(item.line_total))}</span>
            </div>
        `;
    }).join('');
}

function renderReceiptPrintArea(order) {
    if (!nodes.receiptPrint) return;
    if (!order || order.status_group !== 'completed') {
        nodes.receiptPrint.innerHTML = '';
        return;
    }

    const totals = completedReceiptTotals(order);
    nodes.receiptPrint.innerHTML = `
        <div class="thermal-receipt">
            <div class="receipt-center">
                <div class="receipt-store-name">DOC R PHARMACY</div>
                <div class="receipt-store-line">Store Address Here</div>
                <div class="receipt-store-line">Contact No. Here</div>
            </div>

            <div class="receipt-title-print">SALES RECEIPT</div>

            <div class="receipt-meta-print">
                <div class="receipt-meta-row-print"><span>Receipt No:</span><span>${escapeHtml(order.receipt_no || '-')}</span></div>
                <div class="receipt-meta-row-print"><span>Order No:</span><span>${escapeHtml(order.order_no || '-')}</span></div>
                <div class="receipt-meta-row-print"><span>Date:</span><span>${escapeHtml(formatReceiptDateTime(order.completed_at || order.created_at))}</span></div>
                <div class="receipt-meta-row-print"><span>Cashier:</span><span>${escapeHtml(order.cashier_name || 'Cashier')}</span></div>
                <div class="receipt-meta-row-print"><span>Sales Clerk:</span><span>${escapeHtml(order.sales_clerk_name || 'Sales Clerk')}</span></div>
                <div class="receipt-meta-row-print"><span>Customer:</span><span>${escapeHtml(order.customer_name || 'Walk-in Customer')}</span></div>
            </div>

            <div class="receipt-divider-print"></div>
            <div class="receipt-items-head-print">
                <span>QTY</span>
                <span>ITEM</span>
                <span class="receipt-money-print">AMOUNT</span>
            </div>
            <div class="receipt-divider-print"></div>
            ${receiptItemRows(order)}
            <div class="receipt-divider-print"></div>

            <div class="receipt-total-print"><span>Subtotal:</span><span>${escapeHtml(plainMoney(totals.subtotal))}</span></div>
            <div class="receipt-total-print"><span>VAT (12%):</span><span>${escapeHtml(plainMoney(totals.vat))}</span></div>
            <div class="receipt-total-print"><span>Discount:</span><span>${escapeHtml(plainMoney(totals.discount))}</span></div>
            <div class="receipt-total-print is-grand"><span>TOTAL:</span><span>${escapeHtml(plainMoney(totals.finalAmount))}</span></div>

            <div class="receipt-payment-print receipt-payment-spaced"><span>Cash Received:</span><span>${escapeHtml(plainMoney(totals.cashReceived))}</span></div>
            <div class="receipt-payment-print"><span>Change:</span><span>${escapeHtml(plainMoney(totals.change))}</span></div>

            <div class="receipt-divider-print"></div>
            <div class="receipt-footer-print">
                <div>Thank you!</div>
                <div class="receipt-note">This serves as your sales receipt.</div>
            </div>
        </div>
    `;
}

function printCashierReceipt(order = state.activeOrder, afterPrint) {
    if (!order || order.status_group !== 'completed') {
        toast('error', 'Open a completed transaction before printing the receipt.');
        return;
    }

    renderReceiptPrintArea(order);
    let handled = false;
    const finish = () => {
        if (handled) return;
        handled = true;
        window.removeEventListener('afterprint', finish);
        if (typeof afterPrint === 'function') afterPrint();
    };

    if (typeof afterPrint === 'function') {
        window.addEventListener('afterprint', finish, { once: true });
        window.setTimeout(finish, 1000);
    }

    window.setTimeout(() => window.print(), 50);
}

function showReceiptOnly(order) {
    state.activeOrderId = Number(order.order_id || 0);
    state.activeOrder = order;
    renderReceiptPrintArea(order);
    document.body.classList.add('cashier-receipt-only');
    nodes.receiptPrint?.setAttribute('aria-hidden', 'false');
}

function exitReceiptOnly() {
    document.body.classList.remove('cashier-receipt-only');
    nodes.receiptPrint?.setAttribute('aria-hidden', 'true');
}

function renderOrders() {
    if (!state.orders.length) {
        const message = state.tab === 'waiting'
            ? 'No waiting orders.'
            : `No ${state.tab.replace('_', ' ')} orders found.`;
        nodes.list.innerHTML = `<div class="empty-list">${escapeHtml(message)}</div>`;
        return;
    }

    nodes.list.innerHTML = state.orders.map((order) => {
        const active = Number(order.order_id) === Number(state.activeOrderId) ? ' active' : '';
        const timeLabel = order.status_code === 'completed'
            ? order.completed_at
            : (order.cashier_accepted_at || order.sent_to_cashier_at || order.created_at);

        return `
            <article class="order-card${active}" data-order-card="${order.order_id}">
                <div class="order-card-head">
                    <div>
                        <strong>${escapeHtml(order.order_no)}</strong>
                        <small>${escapeHtml(order.customer_name || 'Walk-in Customer')}</small>
                    </div>
                    <span class="status-badge ${statusClass(order)}">${escapeHtml(order.status)}</span>
                </div>
                <div class="order-meta">
                    <span>Sales Clerk<b>${escapeHtml(order.sales_clerk_name || 'Unassigned')}</b></span>
                    <span>Total Amount<b>${money(order.total_amount)}</b></span>
                    <span>Cash Received<b>${money(order.cash_received)}</b></span>
                    <span>Items<b>${numberText(order.item_count)} item${Number(order.item_count) === 1 ? '' : 's'}</b></span>
                    <span>Time Sent<b>${escapeHtml(formatDateTime(timeLabel))}</b></span>
                </div>
                <div class="order-card-foot">
                    <small>${numberText(order.total_quantity)} total qty</small>
                    <button class="${orderActionClass(order)}" type="button" data-order-action="${order.order_id}">
                        ${escapeHtml(orderActionLabel(order))}
                    </button>
                </div>
            </article>
        `;
    }).join('');
}

function emptyDetail() {
    renderReceiptPrintArea(null);
    nodes.detail.innerHTML = `
        <div class="empty-detail">
            <span><i class="fa-solid fa-receipt"></i></span>
            <strong>Select an order from the queue.</strong>
        </div>
    `;
}

function nextWaitingDetail() {
    renderReceiptPrintArea(null);
    nodes.detail.innerHTML = `
        <div class="empty-detail">
            <span><i class="fa-solid fa-hourglass-half"></i></span>
            <strong>No waiting orders.</strong>
        </div>
    `;
}

function itemRows(order) {
    if (!Array.isArray(order.items) || !order.items.length) {
        return `<tr><td colspan="4" class="text-center text-muted py-4">No order items.</td></tr>`;
    }

    return order.items.map((item) => {
        const specParts = [item.brand_name, item.specification].filter(Boolean).join(' / ');
        const details = [item.product_name, specParts].filter(Boolean).join(' - ');
        const inactive = String(item.product_status || 'Active').toLowerCase() === 'inactive';
        return `
            <tr title="${escapeHtml(inactive ? `${details} - Inactive` : details)}">
                <td>${numberText(item.quantity)}</td>
                <td>
                    <span class="item-name">${escapeHtml(item.product_name)}</span>
                    ${specParts ? `<span class="item-spec">${escapeHtml(specParts)}</span>` : ''}
                    ${inactive ? '<span class="item-spec text-danger">Inactive &mdash; cannot be sold</span>' : ''}
                </td>
                <td>${money(item.unit_price)}</td>
                <td>${money(item.line_total)}</td>
            </tr>
        `;
    }).join('');
}

function renderDetail(order) {
    if (!order) {
        renderReceiptPrintArea(null);
        emptyDetail();
        return;
    }

    const isWaiting = order.status_code === 'waiting_cashier';
    const isCompleted = order.status_group === 'completed';
    const inactiveItem = !isCompleted && (order.items || []).find((item) => String(item.product_status || 'Active').toLowerCase() === 'inactive');
    const canPay = !inactiveItem && ['accepted_by_cashier', 'processing_payment', 'processing'].includes(order.status_code);
    const cashValue = Number(isCompleted ? (order.amount_paid || order.cash_received || 0) : (order.cash_received || 0));
    const amountPaid = isCompleted ? Number(order.amount_paid || 0) : 0;
    const selectedDiscountType = order.cashier_discount_type || 'none';
    const selectedDiscountAmount = Number(order.cashier_discount_amount || 0);
    const totals = paymentTotals(order, selectedDiscountType, selectedDiscountAmount);
    const paidFinalAmount = Number(order.final_amount || order.total_amount || 0);
    const displayFinalAmount = isCompleted ? paidFinalAmount : totals.finalAmount;
    const displayChange = isCompleted ? Number(order.change_amount || 0) : Math.max(0, cashValue - displayFinalAmount);
    const discountSelect = discountOptions.map((option) => `
        <option value="${option.value}" ${option.value === selectedDiscountType ? 'selected' : ''}>${option.label}</option>
    `).join('');

    nodes.detail.innerHTML = `
        <div class="detail-head">
            <div class="order-title">
                <h2>${escapeHtml(order.order_no)}</h2>
                <p>${escapeHtml(order.status)}</p>
            </div>
            <span class="status-badge ${statusClass(order)}">${escapeHtml(order.status)}</span>
        </div>
        <div class="detail-meta">
            <span>Sales Clerk<b>${escapeHtml(order.sales_clerk_name || 'Unassigned')}</b></span>
            <span>Cashier<b>${escapeHtml(order.cashier_name || 'Unassigned')}</b></span>
            <span>Customer<b>${escapeHtml(order.customer_name || 'Walk-in Customer')}</b></span>
            <span>Time Sent<b>${escapeHtml(formatDateTime(order.sent_to_cashier_at || order.created_at))}</b></span>
            <span>${isCompleted ? 'Completed At' : 'Time Accepted'}<b>${escapeHtml(formatDateTime(isCompleted ? order.completed_at : order.cashier_accepted_at))}</b></span>
        </div>
        ${inactiveItem ? `<div class="alert alert-danger py-2 px-3 mb-3"><strong>${escapeHtml(inactiveItem.product_name)}</strong> is now inactive. Remove it from the order before continuing.</div>` : ''}
        <section class="payment-hero" aria-label="Payment summary">
            <div class="payment-hero-block">
                <span>TOTAL</span>
                <strong>${money(order.total_amount)}</strong>
            </div>
            <label class="payment-hero-block" for="cashAmountInput">
                <span>CASH RECEIVED</span>
                <input class="cash-input" id="cashAmountInput" type="number" min="0" step="0.01"
                    placeholder="0.00" value="${cashValue > 0 ? cashValue.toFixed(2) : ''}" ${canPay ? '' : 'disabled'}
                    inputmode="decimal" autocomplete="off">
            </label>
            <div class="payment-hero-block change">
                <span>CHANGE</span>
                <strong id="changeAmount">${money(displayChange)}</strong>
            </div>
        </section>
        <div class="detail-scroll">
            <div class="items-wrap">
                <table class="items-table">
                    <thead>
                        <tr>
                            <th class="qty-col">Qty</th>
                            <th>Item</th>
                            <th class="price-col">Unit Price</th>
                            <th class="amount-col">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows(order)}</tbody>
                </table>
            </div>
            <div class="totals-list">
                <div class="total-line"><span>Total Items</span><strong>${numberText(order.item_count)}</strong></div>
                <div class="total-line"><span>Total Quantity</span><strong>${numberText(order.total_quantity)}</strong></div>
                <div class="total-line"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div>
                <label class="total-line discount-line" for="cashierDiscountType">
                    <span>Discount</span>
                    <span class="discount-control">
                        <select class="discount-select" id="cashierDiscountType" ${canPay ? '' : 'disabled'}>${discountSelect}</select>
                        <input class="discount-input ${selectedDiscountType === 'custom' ? '' : 'is-hidden'}" id="cashierDiscountAmount" type="number" min="0" step="0.01" value="${selectedDiscountAmount.toFixed(2)}" ${canPay ? '' : 'disabled'} inputmode="decimal" autocomplete="off" aria-label="Custom cashier discount amount">
                    </span>
                </label>
                <div class="total-line after-discount"><span>Total (After Discount)</span><strong id="finalAmount">${money(displayFinalAmount)}</strong></div>
            </div>
            ${isCompleted ? `
                <div class="receipt-box">
                    Receipt No: ${escapeHtml(order.receipt_no || '-')}<br>
                    Cashier: ${escapeHtml(order.cashier_name || 'Unassigned')}<br>
                    Sales Clerk: ${escapeHtml(order.sales_clerk_name || 'Unassigned')}<br>
                    Customer: ${escapeHtml(order.customer_name || 'Walk-in Customer')}<br>
                    Cash Received: ${money(amountPaid || cashValue)}<br>
                    Change: ${money(order.change_amount)}<br>
                    Total Amount: ${money(displayFinalAmount)}
                </div>
            ` : ''}
        </div>
        <div class="detail-actions">
            ${isWaiting ? `
                <button class="primary-action" type="button" data-accept-active="${order.order_id}">
                    <i class="fa-solid fa-folder-open"></i> Open Order
                </button>
            ` : ''}
            ${canPay ? `
                <button class="primary-action" type="button" id="completePaymentBtn" disabled>
                    <i class="fa-solid fa-circle-check"></i> Complete Payment
                </button>
            ` : ''}
            ${isCompleted ? `
                <button class="secondary-action" type="button" id="printReceiptBtn">
                    <i class="fa-solid fa-print"></i> Print Receipt
                </button>
            ` : ''}
        </div>
    `;

    renderReceiptPrintArea(isCompleted ? order : null);
    bindDetailEvents(order);
}

function bindDetailEvents(order) {
    const cashInput = document.getElementById('cashAmountInput');
    const completeBtn = document.getElementById('completePaymentBtn');
    const changeNode = document.getElementById('changeAmount');
    const finalNode = document.getElementById('finalAmount');
    const discountType = document.getElementById('cashierDiscountType');
    const discountInput = document.getElementById('cashierDiscountAmount');

    if (cashInput && completeBtn && changeNode && finalNode && discountType && discountInput) {
        const updatePayment = () => {
            const type = discountType.value || 'none';
            discountInput.classList.toggle('is-hidden', type !== 'custom');
            discountInput.disabled = type !== 'custom';
            if (type !== 'custom') discountInput.value = discountAmount(type, 0, order.subtotal).toFixed(2);
            const totals = paymentTotals(order, type, Number(discountInput.value || 0));
            const cash = Number(cashInput.value || 0);
            const change = Math.max(0, cash - totals.finalAmount);
            finalNode.textContent = money(totals.finalAmount);
            changeNode.textContent = money(change);
            completeBtn.disabled = !cashInput.value || cash < totals.finalAmount;
        };
        cashInput.addEventListener('input', updatePayment);
        discountType.addEventListener('change', updatePayment);
        discountInput.addEventListener('input', updatePayment);
        completeBtn.addEventListener('click', () => {
            completePayment(order.order_id, Number(cashInput.value || 0), discountType.value, Number(discountInput.value || 0));
        });
        updatePayment();
    }

    const acceptActive = nodes.detail.querySelector('[data-accept-active]');
    if (acceptActive) {
        acceptActive.addEventListener('click', () => acceptOrder(order.order_id));
    }

    const printBtn = document.getElementById('printReceiptBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => printCashierReceipt(order));
    }
}

async function loadOrders(keepSelection = true) {
    state.tab = normalizeWorkingTab(state.tab);
    nodes.list.innerHTML = '<div class="empty-list">Loading orders...</div>';
    try {
        const query = new URLSearchParams({
            tab: state.tab,
            search: cleanText(nodes.search?.value),
        });
        const data = await apiFetch(`/cashier/get_cashier_orders.php?${query.toString()}`, {
            headers: {},
        });
        state.orders = Array.isArray(data.orders) ? data.orders : [];
        renderSummary(data.summary || {});
        renderOrders();

        if (!keepSelection || !state.activeOrderId) {
            return;
        }

        const stillVisible = state.orders.some((order) => Number(order.order_id) === Number(state.activeOrderId));
        if (stillVisible) {
            await loadOrderDetail(state.activeOrderId);
        }
    } catch (error) {
        nodes.list.innerHTML = `<div class="empty-list">${escapeHtml(error.message)}</div>`;
        toast('error', error.message);
    }
}

async function showWaitingQueueAndSelectNext() {
    state.tab = 'waiting';
    state.activeOrderId = null;
    state.activeOrder = null;
    syncTabs();
    exitReceiptOnly();
    await loadOrders(false);
    const nextOrder = state.orders.find((order) => order.status_code === 'waiting_cashier') || state.orders[0];
    if (nextOrder?.order_id) {
        await loadOrderDetail(nextOrder.order_id);
    } else {
        nextWaitingDetail();
    }
}

async function loadOrderDetail(orderId) {
    try {
        const data = await apiFetch(`/cashier/get_cashier_order.php?order_id=${encodeURIComponent(orderId)}`, {
            headers: {},
        });
        if (data.status_group === 'completed' && state.receiptOnly) {
            showReceiptOnly(data);
            return;
        }
        if (data.status_group === 'completed') {
            toast('error', 'Completed transactions can be viewed from transaction history.');
            return;
        }
        exitReceiptOnly();
        state.activeOrderId = Number(orderId);
        state.activeOrder = data;
        renderOrders();
        renderDetail(data);
    } catch (error) {
        toast('error', error.message);
    }
}

async function acceptOrder(orderId) {
    try {
        const data = await apiFetch('/cashier/accept_order.php', {
            method: 'POST',
            body: JSON.stringify({ order_id: Number(orderId) }),
        });
        state.activeOrderId = Number(orderId);
        state.activeOrder = data;
        state.tab = 'processing';
        syncTabs();
        renderDetail(data);
        await loadOrders(true);
        toast('success', 'Order accepted.');
    } catch (error) {
        toast('error', error.message);
    }
}

async function completePayment(orderId, amountPaid, discountType = 'none', discountAmountValue = 0) {
    try {
        const data = await apiFetch('/cashier/complete_payment.php', {
            method: 'POST',
            body: JSON.stringify({
                order_id: Number(orderId),
                amount_paid: amountPaid,
                cashier_discount_type: discountType,
                cashier_discount_amount: discountAmountValue,
            }),
        });
        state.activeOrderId = Number(orderId);
        state.activeOrder = data;
        syncTabs();
        renderDetail(data);
        toast('success', 'Payment completed. Receipt is ready for printing.');
        printCashierReceipt(data, () => {
            showWaitingQueueAndSelectNext().catch((error) => toast('error', error.message));
        });
    } catch (error) {
        toast('error', error.message);
    }
}

function syncTabs() {
    document.querySelectorAll('[data-cashier-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.cashierTab === state.tab);
    });
}

function bindEvents() {
    document.querySelectorAll('[data-cashier-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            state.tab = button.dataset.cashierTab || 'waiting';
            state.tab = normalizeWorkingTab(state.tab);
            state.activeOrderId = null;
            state.activeOrder = null;
            syncTabs();
            emptyDetail();
            loadOrders(false);
        });
    });

    nodes.search.addEventListener('input', () => {
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => loadOrders(false), 250);
    });

    nodes.refresh.addEventListener('click', () => loadOrders(true));

    nodes.list.addEventListener('click', (event) => {
        const action = event.target.closest('[data-order-action]');
        const card = event.target.closest('[data-order-card]');
        const orderId = action?.dataset.orderAction || card?.dataset.orderCard;
        if (!orderId) return;

        const order = state.orders.find((item) => Number(item.order_id) === Number(orderId));
        if (action && order?.status_code === 'waiting_cashier') {
            acceptOrder(orderId);
            return;
        }
        loadOrderDetail(orderId);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.toastr) {
        window.toastr.options = {
            closeButton: true,
            progressBar: true,
            positionClass: 'toast-top-right',
            timeOut: 2600,
        };
    }
    bindEvents();
    emptyDetail();
    const targetOrderId = new URLSearchParams(window.location.search).get('order_id');
    if (targetOrderId) {
        state.receiptOnly = true;
        state.activeOrderId = Number(targetOrderId);
        loadOrders(true).then(() => loadOrderDetail(targetOrderId)).catch((error) => toast('error', error.message));
    } else {
        loadOrders(false);
    }
});
