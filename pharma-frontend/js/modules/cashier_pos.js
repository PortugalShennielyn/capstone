import API_BASE_URL from '../config/config.js';
import {
    transactionDiscount,
    vatInclusivePaymentTotals,
    savedTransactionTotals,
} from './sales_financials.js?v=1';
import { createLiveSync, publishDataUpdate } from './live_data.js?v=1';

const state = {
    tab: 'waiting',
    orders: [],
    activeOrderId: null,
    activeOrder: null,
    searchTimer: null,
    receiptOnly: false,
    paymentDrafts: new Map(),
    submittingOrderIds: new Set(),
    receiptAddress: 'Address not configured',
    receiptContact: 'Contact not configured',
};

const nodes = {};

function collectCashierNodes() {
    Object.assign(nodes, {
        waiting: document.getElementById('waitingCount'),
        processing: document.getElementById('processingCount'),
        search: document.getElementById('cashierSearch'),
        list: document.getElementById('cashierOrderList'),
        detail: document.getElementById('cashierDetailPanel'),
        receiptPrint: document.getElementById('cashierReceiptPrintArea'),
    });

    const missing = ['waiting', 'processing', 'search', 'list', 'detail']
        .filter((key) => !nodes[key]);
    if (missing.length) {
        console.error(`Cashier POS could not initialize because required DOM nodes are missing: ${missing.join(', ')}`);
        return false;
    }
    return true;
}

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
    { value: 'senior', label: 'Senior Citizen (requires eligible-item setup)', disabled: true },
    { value: 'pwd', label: 'PWD (requires eligible-item setup)', disabled: true },
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

async function loadPharmacyReceiptSettings() {
    const settings = await apiFetch('/settings/get_business_hours.php');
    state.receiptAddress = cleanText(settings.profile?.address, 'Address not configured');
    state.receiptContact = cleanText(settings.profile?.contactNumber, 'Contact not configured');
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
    return transactionDiscount(type, customAmount, subtotal);
}

function paymentTotals(order, type, customAmount) {
    const totals = vatInclusivePaymentTotals(order, type, customAmount);
    return {
        discount: totals.discount,
        cashierDiscount: totals.cashierDiscount,
        vatableSales: totals.vatableSales,
        vat: totals.vat,
        finalAmount: totals.totalAmount,
    };
}

function safeCurrencyValue(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
}

function paymentDraft(order, isCompleted = false) {
    const orderId = Number(order.order_id);
    if (!state.paymentDrafts.has(orderId)) {
        const cash = safeCurrencyValue(isCompleted ? (order.amount_paid || order.cash_received) : order.cash_received);
        state.paymentDrafts.set(orderId, {
            cashText: cash > 0 ? cash.toFixed(2) : '',
            discountType: order.cashier_discount_type || 'none',
            discountAmountText: safeCurrencyValue(order.cashier_discount_amount).toFixed(2),
        });
    }
    return state.paymentDrafts.get(orderId);
}

function receiptSpec(item) {
    return [
        item.generic_name,
        item.strength || item.net_weight || item.specification,
    ].filter((part) => cleanText(part)).join(' / ');
}

function isPrescriptionItem(item) {
    return cleanText(item?.medicine_classification_badge) === 'Rx'
        || cleanText(item?.medicine_classification).toLowerCase() === 'prescription (rx)';
}

function rxTextMarkup(item) {
    return isPrescriptionItem(item) ? ' <span class="rx-inline">Rx</span>' : '';
}

function itemNameMarkup(item) {
    const product = cleanText(item.product_name, 'Item');
    return `${escapeHtml(product)}${rxTextMarkup(item)}`;
}

function itemSpecText(item) {
    const detail = [item.strength || item.net_weight, item.dosage_form].map(cleanText).filter(Boolean).join(' • ')
        || cleanText(item.specification);
    const generic = cleanText(item.generic_name).toLowerCase();
    if (!generic) return detail;
    return detail
        .split(/\s*[•/]\s*/)
        .map(cleanText)
        .filter((part) => part && part.toLowerCase() !== generic)
        .join(' • ');
}

function receiptSpecMarkup(item) {
    const brand = cleanText(item.brand_name);
    const detail = itemSpecText(item);
    return [brand ? escapeHtml(brand) : '', detail ? escapeHtml(detail) : ''].filter(Boolean).join('<br>');
}

function receiptProductLineMarkup(item) {
    const product = cleanText(item.product_name, 'Item');
    return `${escapeHtml(product)}${isPrescriptionItem(item) ? ' <span class="receipt-rx-print">Rx</span>' : ''}`;
}

function completedReceiptTotals(order) {
    return savedTransactionTotals(order);
}

function receiptItemRows(order) {
    if (!Array.isArray(order.items) || !order.items.length) {
        return '<div class="receipt-item-print"><span>0</span><span>No items found.</span><span class="receipt-money-print">0.00</span></div>';
    }

    return order.items.map((item) => {
        const spec = receiptSpecMarkup(item);
        return `
            <div class="receipt-item-print">
                <span>${escapeHtml(numberText(item.quantity))}</span>
                <span>
                    <span class="receipt-item-name-print">${receiptProductLineMarkup(item)}</span>
                    ${spec ? `<span class="receipt-item-spec-print">${spec}</span>` : ''}
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
                <div class="receipt-store-line">${escapeHtml(state.receiptAddress)}</div>
                <div class="receipt-store-line">Contact No. ${escapeHtml(state.receiptContact)}</div>
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
            <div class="receipt-total-print"><span>Discount:</span><span>${escapeHtml(plainMoney(totals.discount))}</span></div>
            <div class="receipt-total-print"><span>VATable Sales:</span><span>${escapeHtml(plainMoney(totals.vatableSales))}</span></div>
            <div class="receipt-total-print"><span>VAT (12%):</span><span>${escapeHtml(plainMoney(totals.vat))}</span></div>
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
        window.PharmacySearchHighlight?.apply(nodes.list, nodes.search.value);
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
    window.PharmacySearchHighlight?.apply(nodes.list, nodes.search.value);
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
        return `<tr><td colspan="5" class="text-center text-muted py-4">No order items.</td></tr>`;
    }

    return order.items.map((item) => {
        const nameMarkup = itemNameMarkup(item);
        const brand = cleanText(item.brand_name);
        const specText = itemSpecText(item);
        const plainDetails = [item.product_name, item.brand_name, item.generic_name, item.strength || item.net_weight || item.specification].filter(Boolean).join(' - ');
        const inactive = String(item.product_status || 'Active').toLowerCase() === 'inactive';
        return `
            <tr title="${escapeHtml(inactive ? `${plainDetails} - Inactive` : plainDetails)}">
                <td>${numberText(item.quantity)}</td>
                <td>
                    <span class="item-name">${nameMarkup}</span>
                    ${brand ? `<span class="item-generic-line">${escapeHtml(brand)}</span>` : ''}
                    ${specText ? `<span class="item-spec">${escapeHtml(specText)}</span>` : ''}
                    ${inactive ? '<span class="item-spec text-danger">Inactive &mdash; cannot be sold</span>' : ''}
                </td>
                <td class="unit-col">${escapeHtml(displayUnit(item.selected_unit))}</td>
                <td>${money(item.unit_price)}</td>
                <td>${money(item.line_total)}</td>
            </tr>
        `;
    }).join('');
}

function displayUnit(unit) {
    const value = String(unit || 'Unit').trim();
    if (/^(pc|pcs|piece|pieces|each)$/i.test(value)) return 'Piece';
    return value.replace(/\bpack\b/gi, 'Pack').replace(/\bbox\b/gi, 'Box');
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
    const draft = paymentDraft(order, isCompleted);
    const cashValue = safeCurrencyValue(draft.cashText);
    const amountPaid = isCompleted ? Number(order.amount_paid || 0) : 0;
    const selectedDiscountType = draft.discountType;
    const selectedDiscountAmount = safeCurrencyValue(draft.discountAmountText);
    const totals = paymentTotals(order, selectedDiscountType, selectedDiscountAmount);
    const paidFinalAmount = Number(order.final_amount || order.total_amount || 0);
    const displayFinalAmount = isCompleted ? paidFinalAmount : totals.finalAmount;
    const displayChange = isCompleted ? Number(order.change_amount || 0) : Math.max(0, cashValue - displayFinalAmount);
    const discountSelect = discountOptions.map((option) => `
        <option value="${option.value}" ${option.value === selectedDiscountType ? 'selected' : ''} ${option.disabled ? 'disabled' : ''}>${option.label}</option>
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
                <span>Total</span>
                <strong id="paymentHeroTotal">${money(displayFinalAmount)}</strong>
            </div>
            <label class="payment-hero-block" for="cashAmountInput">
                <span>Cash Received</span>
                <input class="cash-input" id="cashAmountInput" type="number" min="0" step="0.01" placeholder="0.00" value="${escapeHtml(draft.cashText)}" ${canPay ? '' : 'disabled'} inputmode="decimal" autocomplete="off">
            </label>
            <div class="payment-hero-block change">
                <span>Change</span>
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
                            <th class="unit-col">Unit</th>
                            <th class="price-col">Unit Price</th>
                            <th class="amount-col">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows(order)}</tbody>
                </table>
            </div>
            <div class="totals-list">
                <div class="total-line discount-line">
                    <span>Discount</span>
                    <span class="discount-control">
                        <select class="discount-select" id="cashierDiscountType" ${canPay ? '' : 'disabled'}>${discountSelect}</select>
                        <input class="discount-input ${selectedDiscountType === 'custom' ? '' : 'is-hidden'}" id="cashierDiscountAmount" type="number" min="0" step="0.01" value="${selectedDiscountAmount.toFixed(2)}" ${canPay ? '' : 'disabled'} inputmode="decimal" autocomplete="off" aria-label="Custom cashier discount amount">
                    </span>
                </div>
                <div class="total-line"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div>
                <div class="total-line"><span>Total Discount</span><strong id="totalDiscount">${money(isCompleted ? completedReceiptTotals(order).discount : totals.discount)}</strong></div>
                <div class="total-line"><span>VATable Sales</span><strong id="vatableSales">${money(isCompleted ? completedReceiptTotals(order).vatableSales : totals.vatableSales)}</strong></div>
                <div class="total-line"><span>VAT (12%)</span><strong id="vatAmount">${money(isCompleted ? completedReceiptTotals(order).vat : totals.vat)}</strong></div>
                <div class="total-line after-discount"><span>Total Amount</span><strong id="finalAmount">${money(displayFinalAmount)}</strong></div>
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
    const heroTotalNode = document.getElementById('paymentHeroTotal');
    const totalDiscountNode = document.getElementById('totalDiscount');
    const vatableNode = document.getElementById('vatableSales');
    const vatNode = document.getElementById('vatAmount');
    const discountType = document.getElementById('cashierDiscountType');
    const discountInput = document.getElementById('cashierDiscountAmount');

    if (cashInput && completeBtn && changeNode && finalNode && discountType && discountInput && cashInput.dataset.paymentBound !== 'true') {
        cashInput.dataset.paymentBound = 'true';
        const orderId = Number(order.order_id);
        const draft = paymentDraft(order);
        const updatePayment = () => {
            const type = discountType.value || 'none';
            discountInput.classList.toggle('is-hidden', type !== 'custom');
            discountInput.disabled = type !== 'custom';
            if (type !== 'custom') discountInput.value = discountAmount(type, 0, order.subtotal).toFixed(2);
            const customDiscount = safeCurrencyValue(discountInput.value);
            const totals = paymentTotals(order, type, customDiscount);
            const cash = safeCurrencyValue(cashInput.value);
            const change = Math.max(0, cash - totals.finalAmount);
            draft.cashText = cashInput.value;
            draft.discountType = type;
            draft.discountAmountText = discountInput.value;
            finalNode.textContent = money(totals.finalAmount);
            if (heroTotalNode) heroTotalNode.textContent = money(totals.finalAmount);
            if (totalDiscountNode) totalDiscountNode.textContent = money(totals.discount);
            if (vatableNode) vatableNode.textContent = money(totals.vatableSales);
            if (vatNode) vatNode.textContent = money(totals.vat);
            changeNode.textContent = money(change);
            const canComplete = cashInput.value.trim() !== '' && cash + 0.00001 >= totals.finalAmount
                && !state.submittingOrderIds.has(orderId);
            completeBtn.disabled = !canComplete;
            completeBtn.setAttribute('aria-disabled', String(!canComplete));
        };
        cashInput.addEventListener('input', updatePayment);
        cashInput.addEventListener('blur', () => {
            if (cashInput.value !== '' && (!Number.isFinite(Number(cashInput.value)) || Number(cashInput.value) < 0)) {
                cashInput.value = '';
                updatePayment();
            }
        });
        cashInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            updatePayment();
            if (!completeBtn.disabled) completeBtn.click();
        });
        discountType.addEventListener('change', updatePayment);
        discountInput.addEventListener('input', updatePayment);
        completeBtn.addEventListener('click', () => {
            updatePayment();
            if (completeBtn.disabled) return;
            completePayment(orderId, safeCurrencyValue(cashInput.value), discountType.value, safeCurrencyValue(discountInput.value));
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

async function loadOrders(keepSelection = true, { silent = false } = {}) {
    state.tab = normalizeWorkingTab(state.tab);
    if (!silent) nodes.list.innerHTML = '<div class="empty-list">Loading orders...</div>';
    try {
        const query = new URLSearchParams({
            tab: state.tab,
            search: cleanText(nodes.search?.value),
        });
        const data = await apiFetch(`/cashier/get_cashier_orders.php?${query.toString()}`, {
            headers: {},
        });
        const nextOrders = Array.isArray(data.orders) ? data.orders : [];
        const changed = JSON.stringify(nextOrders) !== JSON.stringify(state.orders);
        state.orders = nextOrders;
        renderSummary(data.summary || {});
        if (changed || !silent) renderOrders();

        if (!keepSelection || !state.activeOrderId) {
            return;
        }

        const stillVisible = state.orders.some((order) => Number(order.order_id) === Number(state.activeOrderId));
        if (!stillVisible) {
            state.activeOrderId = null;
            state.activeOrder = null;
            emptyDetail();
            return;
        }
        if (stillVisible && !silent) {
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
        publishDataUpdate('order-accepted', { orderId: Number(orderId) });
        toast('success', 'Order accepted.');
    } catch (error) {
        toast('error', error.message);
    }
}

async function completePayment(orderId, amountPaid, discountType = 'none', discountAmountValue = 0) {
    const normalizedOrderId = Number(orderId);
    if (state.submittingOrderIds.has(normalizedOrderId)) return;
    state.submittingOrderIds.add(normalizedOrderId);
    const button = document.getElementById('completePaymentBtn');
    if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
    }
    try {
        const data = await apiFetch('/cashier/complete_payment.php', {
            method: 'POST',
            body: JSON.stringify({
                order_id: normalizedOrderId,
                amount_paid: amountPaid,
                cashier_discount_type: discountType,
                cashier_discount_amount: discountAmountValue,
            }),
        });
        state.paymentDrafts.delete(normalizedOrderId);
        state.activeOrderId = normalizedOrderId;
        state.activeOrder = data;
        syncTabs();
        renderDetail(data);
        toast('success', 'Payment completed. Receipt is ready for printing.');
        await loadOrders(true);
        publishDataUpdate('payment-completed', { orderId: normalizedOrderId });
        publishDataUpdate('shelf-updated', { orderId: normalizedOrderId });
        printCashierReceipt(data, () => {
            showWaitingQueueAndSelectNext().catch((error) => toast('error', error.message));
        });
    } catch (error) {
        toast('error', error.message);
    } finally {
        state.submittingOrderIds.delete(normalizedOrderId);
        if (state.activeOrder && Number(state.activeOrder.order_id) === normalizedOrderId && state.activeOrder.status_group !== 'completed') {
            renderDetail(state.activeOrder);
        }
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

document.addEventListener('DOMContentLoaded', async () => {
    if (window.toastr) {
        window.toastr.options = {
            closeButton: true,
            progressBar: true,
            positionClass: 'toast-top-right',
            timeOut: 2600,
        };
    }
    if (!collectCashierNodes()) return;
    try {
        await loadPharmacyReceiptSettings();
    } catch (error) {
        state.receiptAddress = 'Address unavailable';
        state.receiptContact = 'Contact unavailable';
        console.error('Unable to load pharmacy contact details for the cashier receipt.', error);
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

createLiveSync({ interval: 2000, events: ['order-created', 'order-accepted', 'order-cancelled', 'payment-completed'], sync: () => loadOrders(true, { silent: true }) });
