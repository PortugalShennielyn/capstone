import API_BASE_URL from '../config/config.js';

const page = document.body.dataset.cashierPage || '';
const state = {
    queueTab: 'waiting',
    reportPage: 1,
    perPage: 10,
    dateStart: '',
    dateEnd: '',
    paymentMethod: '',
    cashierId: '',
    currentUserRole: '',
    canViewStaffDetails: false,
};
const money = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plainMoney = (value) => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = (value) => Number(value || 0).toLocaleString('en-PH');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const dt = (value) => {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-PH', { month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' });
};
const receiptDt = (value) => {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const isoDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const dateLabel = (value) => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};
const normalizeRole = (role) => String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

async function api(path) {
    const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status === 'error') throw new Error(data.message || 'Request failed.');
    return data.data || data;
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

async function loadCurrentUser() {
    const data = await api('/auth/check_session.php');
    const roles = [
        data.role,
        ...(Array.isArray(data.roles) ? data.roles : []),
        ...(Array.isArray(data.role_identifiers) ? data.role_identifiers : []),
    ].map(normalizeRole).filter(Boolean);
    state.currentUserRole = roles[0] || '';
    state.canViewStaffDetails = roles.some((role) => ['admin', 'manager', 'super_admin', 'ro_admin', 'ro_manager', 'ro_super_admin'].includes(role));
    return data;
}

function badge(status) {
    const key = String(status || '').toLowerCase();
    const group = key.includes('complete') ? 'completed' : key.includes('cancel') || key.includes('reject') ? 'cancelled' : key.includes('accept') || key.includes('process') ? 'processing' : 'waiting';
    return `<span class="status-pill status-${group}">${esc(String(status || 'Waiting').replace(/_/g, ' '))}</span>`;
}

function receiptProductLine(item) {
    const brand = String(item.brand_name || '').trim();
    const product = String(item.product_name || 'Item').trim();
    if (brand && product && brand.toLowerCase() !== product.toLowerCase()) return `${brand} ${product}`;
    return product || brand || 'Item';
}

function receiptSpec(item) {
    return [item.generic_name, item.strength || item.net_weight || item.specification]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' / ');
}

function receiptTotals(order) {
    const subtotal = Number(order.subtotal || 0);
    const discount = Number(order.cashier_discount_amount || 0);
    const taxable = Math.max(0, subtotal - discount);
    const vat = Number(taxable * 0.12 || order.vat || 0);
    const finalAmount = Number(order.final_amount || order.total_amount || (taxable + vat));
    const cashReceived = Number(order.amount_paid || order.cash_received || 0);
    const change = Number(order.change_amount || Math.max(0, cashReceived - finalAmount));
    return { subtotal, discount, vat, finalAmount, cashReceived, change };
}

function receiptItems(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) {
        return '<div class="receipt-item-print"><span>0</span><span>No items found.</span><span class="receipt-money-print">0.00</span></div>';
    }
    return items.map((item) => {
        const spec = receiptSpec(item);
        return `
            <div class="receipt-item-print">
                <span>${esc(count(item.quantity))}</span>
                <span>
                    <span class="receipt-item-name-print">${esc(receiptProductLine(item))}</span>
                    ${spec ? `<span class="receipt-item-spec-print">${esc(spec)}</span>` : ''}
                </span>
                <span class="receipt-money-print">${esc(plainMoney(item.line_total))}</span>
            </div>
        `;
    }).join('');
}

function receiptHtml(order) {
    const totals = receiptTotals(order);
    return `
        <div class="thermal-receipt">
            <div class="receipt-center">
                <div class="receipt-store-name">DOC R PHARMACY</div>
                <div class="receipt-store-line">Store Address Here</div>
                <div class="receipt-store-line">Contact No. Here</div>
            </div>
            <div class="receipt-title-print">SALES RECEIPT</div>
            <div class="receipt-meta-print">
                <div class="receipt-meta-row-print"><span>Receipt No:</span><span>${esc(order.receipt_no || '-')}</span></div>
                <div class="receipt-meta-row-print"><span>Order No:</span><span>${esc(order.order_no || '-')}</span></div>
                <div class="receipt-meta-row-print"><span>Date:</span><span>${esc(receiptDt(order.completed_at || order.created_at))}</span></div>
                <div class="receipt-meta-row-print"><span>Cashier:</span><span>${esc(order.cashier_name || 'Cashier')}</span></div>
                ${state.canViewStaffDetails ? `<div class="receipt-meta-row-print"><span>Sales Clerk:</span><span>${esc(order.sales_clerk_name || 'Sales Clerk')}</span></div>` : ''}
                <div class="receipt-meta-row-print"><span>Customer:</span><span>${esc(order.customer_name || 'Walk-in Customer')}</span></div>
            </div>
            <div class="receipt-divider-print"></div>
            <div class="receipt-items-head-print"><span>QTY</span><span>ITEM</span><span class="receipt-money-print">AMOUNT</span></div>
            <div class="receipt-divider-print"></div>
            ${receiptItems(order)}
            <div class="receipt-divider-print"></div>
            <div class="receipt-total-print"><span>Subtotal:</span><span>${esc(plainMoney(totals.subtotal))}</span></div>
            <div class="receipt-total-print"><span>VAT (12%):</span><span>${esc(plainMoney(totals.vat))}</span></div>
            <div class="receipt-total-print"><span>Discount:</span><span>${esc(plainMoney(totals.discount))}</span></div>
            <div class="receipt-total-print is-grand"><span>TOTAL:</span><span>${esc(plainMoney(totals.finalAmount))}</span></div>
            <div class="receipt-payment-print receipt-payment-spaced"><span>Cash Received:</span><span>${esc(plainMoney(totals.cashReceived))}</span></div>
            <div class="receipt-payment-print"><span>Change:</span><span>${esc(plainMoney(totals.change))}</span></div>
            <div class="receipt-divider-print"></div>
            <div class="receipt-footer-print"><div>Thank you!</div><div class="receipt-note">This serves as your sales receipt.</div></div>
        </div>
    `;
}

function ensureReceiptShell() {
    let printArea = document.getElementById('cashierReceiptPrintArea');
    if (!printArea) {
        printArea = document.createElement('section');
        printArea.id = 'cashierReceiptPrintArea';
        printArea.setAttribute('aria-hidden', 'true');
        document.body.appendChild(printArea);
    }
    let modal = document.getElementById('cashierReceiptModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cashierReceiptModal';
        modal.className = 'receipt-modal no-print';
        modal.innerHTML = `
            <div class="receipt-modal-backdrop" data-close-receipt></div>
            <section class="receipt-modal-panel" role="dialog" aria-modal="true" aria-label="Sales receipt">
                <div class="receipt-modal-body" id="cashierReceiptModalBody"></div>
                <div class="receipt-modal-actions">
                    <button class="secondary-action" type="button" data-close-receipt>Close</button>
                    <button class="action-link" type="button" id="cashierReceiptModalPrint"><i class="fa-solid fa-print"></i>Print Receipt</button>
                </div>
            </section>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (event) => {
            if (event.target.closest('[data-close-receipt]')) modal.classList.remove('show');
        });
        modal.querySelector('#cashierReceiptModalPrint')?.addEventListener('click', () => window.print());
    }
    return { printArea, modal, body: modal.querySelector('#cashierReceiptModalBody') };
}

async function openReceipt(orderId) {
    const { printArea, modal, body } = ensureReceiptShell();
    body.innerHTML = '<div class="empty-state">Loading receipt...</div>';
    modal.classList.add('show');
    const order = await api(`/cashier/get_cashier_order.php?order_id=${encodeURIComponent(orderId)}`);
    if (order.status_group !== 'completed') throw new Error('Receipt is available after payment is completed.');
    const html = receiptHtml(order);
    printArea.innerHTML = html;
    body.innerHTML = html;
}

function bindSearch(loader) {
    const input = document.getElementById('cashierSearch');
    if (!input) return;
    let timer = 0;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(loader, 250);
    });
}

function reportColumns(type = 'completed') {
    if (type === 'cancelled') {
        return [
            ['order', 'Order No'], ['customer', 'Customer'], ['staff', 'Sales Clerk'], ['staff', 'Cashier'],
            ['money', 'Total Amount'], ['customer', 'Reason'], ['staff', 'Cancelled By'], ['date', 'Cancelled Date/Time'], ['method', 'Status'],
        ];
    }
    const columns = [
        ['order', 'Order No.'],
        ['customer', 'Customer'],
    ];
    if (state.canViewStaffDetails) columns.push(['staff', 'Sales Clerk']);
    if (type === 'receipts' && state.canViewStaffDetails) columns.push(['staff', 'Cashier']);
    columns.push(
        ['items', 'Items'],
        ['money', 'Total Amount'],
        ['money', 'Cash Received'],
        ['money', 'Change'],
        ['method', 'Payment Method'],
        ['date', 'Completed Date/Time'],
        ['action', 'Action'],
    );
    return columns;
}

function renderReportStructure(type = 'completed') {
    const columns = reportColumns(type);
    const colgroup = document.getElementById('reportColumns');
    const head = document.getElementById('reportHead');
    head?.closest('table')?.classList.toggle('has-staff-details', state.canViewStaffDetails);
    if (colgroup) {
        colgroup.innerHTML = columns.map(([key]) => `<col class="col-${key}">`).join('');
    }
    if (head) {
        head.innerHTML = `<tr>${columns.map(([key, label]) => `<th class="${key === 'action' ? 'action-col' : ''}">${esc(label)}</th>`).join('')}</tr>`;
    }
}

function updateDateRangeLabel() {
    const label = document.getElementById('dateRangeLabel');
    if (!label) return;
    if (state.dateStart && state.dateEnd) {
        label.textContent = `${dateLabel(state.dateStart)} - ${dateLabel(state.dateEnd)}`;
    } else if (state.dateStart) {
        label.textContent = `From ${dateLabel(state.dateStart)}`;
    } else if (state.dateEnd) {
        label.textContent = `Until ${dateLabel(state.dateEnd)}`;
    } else {
        label.textContent = 'Date Range';
    }
}

function setDateRange(start, end) {
    state.dateStart = start || '';
    state.dateEnd = end || '';
    const startInput = document.getElementById('dateRangeStart');
    const endInput = document.getElementById('dateRangeEnd');
    if (startInput) startInput.value = state.dateStart;
    if (endInput) endInput.value = state.dateEnd;
    updateDateRangeLabel();
}

function setDateShortcut(shortcut) {
    const today = new Date();
    let start = new Date(today);
    let end = new Date(today);
    if (shortcut === 'yesterday') {
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
    } else if (shortcut === 'last7') {
        start.setDate(start.getDate() - 6);
    } else if (shortcut === 'month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    setDateRange(isoDate(start), isoDate(end));
}

function bindReportControls() {
    bindSearch(() => {
        state.reportPage = 1;
        loadReport('completed').catch(console.error);
    });
    const payment = document.getElementById('paymentMethodFilter');
    payment?.addEventListener('change', () => {
        state.paymentMethod = payment.value || '';
        state.reportPage = 1;
        loadReport('completed').catch(console.error);
    });
    const clear = document.getElementById('clearCashierFilters');
    clear?.addEventListener('click', () => {
        const search = document.getElementById('cashierSearch');
        if (search) search.value = '';
        if (payment) payment.value = '';
        state.paymentMethod = '';
        state.reportPage = 1;
        setDateRange('', '');
        loadReport('completed').catch(console.error);
    });

    const button = document.getElementById('dateRangeButton');
    const popover = document.getElementById('dateRangePopover');
    button?.addEventListener('click', () => {
        if (!popover) return;
        popover.hidden = !popover.hidden;
    });
    document.getElementById('dateRangeCancel')?.addEventListener('click', () => {
        if (popover) popover.hidden = true;
    });
    document.getElementById('dateRangeApply')?.addEventListener('click', () => {
        setDateRange(document.getElementById('dateRangeStart')?.value || '', document.getElementById('dateRangeEnd')?.value || '');
        state.reportPage = 1;
        if (popover) popover.hidden = true;
        loadReport('completed').catch(console.error);
    });
    document.querySelectorAll('[data-range-shortcut]').forEach((shortcut) => {
        shortcut.addEventListener('click', () => {
            setDateShortcut(shortcut.dataset.rangeShortcut);
            state.reportPage = 1;
            if (popover) popover.hidden = true;
            loadReport('completed').catch(console.error);
        });
    });
    document.addEventListener('click', (event) => {
        if (!popover || popover.hidden) return;
        if (!event.target.closest('.date-range-wrap')) popover.hidden = true;
    });
}

function updatePaymentOptions(methods = []) {
    const select = document.getElementById('paymentMethodFilter');
    if (!select) return;
    const selected = state.paymentMethod || select.value || '';
    const options = ['<option value="">All Payment Methods</option>'];
    methods.forEach((method) => {
        const value = String(method || '').trim();
        if (!value) return;
        options.push(`<option value="${esc(value)}">${esc(value.charAt(0).toUpperCase() + value.slice(1))}</option>`);
    });
    select.innerHTML = options.join('');
    select.value = selected;
}

function renderPagination(pagination = {}) {
    const footer = document.getElementById('reportPagination');
    if (!footer) return;
    const total = Number(pagination.total || 0);
    const pageNo = Number(pagination.page || state.reportPage || 1);
    const perPage = Number(pagination.per_page || state.perPage || 10);
    if (!total) {
        footer.hidden = true;
        footer.innerHTML = '';
        return;
    }
    const from = (pageNo - 1) * perPage + 1;
    const to = Math.min(total, pageNo * perPage);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    footer.hidden = false;
    footer.innerHTML = `
        <span>Showing ${esc(count(from))}-${esc(count(to))} of ${esc(count(total))} transactions</span>
        <div class="pagination-actions">
            <button type="button" data-report-page="${pageNo - 1}" ${pageNo <= 1 ? 'disabled' : ''} aria-label="Previous page"><i class="fa-solid fa-chevron-left"></i></button>
            <span>Page ${esc(count(pageNo))} of ${esc(count(totalPages))}</span>
            <button type="button" data-report-page="${pageNo + 1}" ${pageNo >= totalPages ? 'disabled' : ''} aria-label="Next page"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
    `;
    footer.querySelectorAll('[data-report-page]').forEach((button) => {
        button.addEventListener('click', () => {
            const next = Number(button.dataset.reportPage || 1);
            if (!next || next === state.reportPage) return;
            state.reportPage = next;
            loadReport('completed').catch(console.error);
        });
    });
}

function bindQueueTabs() {
    document.querySelectorAll('[data-queue-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            state.queueTab = button.dataset.queueTab || 'waiting';
            document.querySelectorAll('[data-queue-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
            loadQueue().catch(console.error);
        });
    });
}

async function loadDashboard() {
    const data = await api('/cashier/get_cashier_dashboard.php');
    const s = data.summary || {};
    setText('waitingOrders', count(s.waiting_orders));
    setText('processingOrders', count(s.processing_orders));
    setText('completedToday', count(s.completed_today));
    setText('totalSalesToday', money(s.total_sales_today));
    setText('cashCollectedToday', money(s.cash_collected_today));
    const list = document.getElementById('activityList');
    if (!list) return;
    const rows = data.activities || [];
    list.innerHTML = rows.length ? rows.map((row) => `
        <div class="activity-item">
            <strong>${esc(row.description)}</strong>
            <span>${esc(row.action)} - ${esc(dt(row.created_at))}</span>
        </div>
    `).join('') : '<div class="empty-state">No cashier activities yet.</div>';
}

async function loadQueue() {
    const query = new URLSearchParams({ tab: state.queueTab, search: document.getElementById('cashierSearch')?.value || '' });
    const data = await api(`/cashier/get_cashier_orders.php?${query}`);
    const rows = data.orders || [];
    const tbody = document.getElementById('queueRows');
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((row) => `
        <tr>
            <td>${esc(row.order_no)}</td>
            <td>${esc(row.customer_name)}</td>
            <td>${esc(row.sales_clerk_name)}</td>
            <td>${count(row.item_count)}</td>
            <td class="money">${money(row.total_amount)}</td>
            <td class="money">${money(row.cash_received)}</td>
            <td>${badge(row.status)}</td>
            <td>${esc(dt(row.sent_to_cashier_at || row.cashier_accepted_at || row.completed_at || row.created_at))}</td>
            <td class="action-col">${row.status_group === 'completed' || row.status_code === 'completed'
                ? `<button class="action-link icon-action" type="button" data-view-receipt data-order-id="${esc(row.order_id)}" title="View Receipt" aria-label="View Receipt"><i class="fa-regular fa-eye"></i></button>`
                : `<a class="action-link" href="cashier_pos.html?order_id=${encodeURIComponent(row.order_id)}"><i class="fa-solid fa-folder-open"></i>Open</a>`}</td>
        </tr>
    `).join('') : '<tr class="empty-row"><td colspan="9">No queue orders found.</td></tr>';
}

async function loadReport(type) {
    const usesDynamicReportTable = Boolean(document.getElementById('reportHead'));
    if (usesDynamicReportTable) renderReportStructure(type);
    const query = new URLSearchParams({
        type,
        search: document.getElementById('cashierSearch')?.value || '',
        page: String(state.reportPage),
        per_page: String(state.perPage),
    });
    if (state.dateStart) query.set('date_start', state.dateStart);
    if (state.dateEnd) query.set('date_end', state.dateEnd);
    if (state.paymentMethod) query.set('payment_method', state.paymentMethod);
    if (state.cashierId) query.set('cashier_id', state.cashierId);
    const data = await api(`/cashier/get_cashier_report.php?${query}`);
    const rows = data.rows || [];
    const tbody = document.getElementById('reportRows');
    if (!tbody) return;
    updatePaymentOptions(data.payment_methods || []);

    if (type === 'cancelled') {
        tbody.innerHTML = rows.length ? rows.map((row) => `
            <tr>
                <td>${esc(row.order_no)}</td><td>${esc(row.customer_name)}</td><td>${esc(row.sales_clerk_name)}</td>
                <td>${esc(row.cashier_name || '-')}</td><td class="money">${money(row.total_amount)}</td>
                <td>${esc(row.cancellation_reason || '-')}</td><td>${esc(row.cancelled_by_name || '-')}</td>
                <td>${esc(dt(row.cancelled_at))}</td><td>${badge(row.status)}</td>
            </tr>
        `).join('') : '<tr class="empty-row"><td colspan="9">No cancelled or voided sales found.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.length ? rows.map((row) => `
        <tr>
            <td class="nowrap">${esc(row.order_no)}</td><td>${esc(row.customer_name)}</td>
            ${state.canViewStaffDetails || !usesDynamicReportTable ? `<td>${esc(row.sales_clerk_name)}</td>` : ''}
            ${type === 'receipts' && (state.canViewStaffDetails || !usesDynamicReportTable) ? `<td>${esc(row.cashier_name || '-')}</td>` : ''}
            ${usesDynamicReportTable ? `<td class="nowrap">${esc(count(row.item_count || 0))} ${Number(row.item_count || 0) === 1 ? 'item' : 'items'}</td>` : ''}
            <td class="money">${money(row.total_amount)}</td><td class="money">${money(row.amount_paid || row.cash_received)}</td>
            <td class="money">${money(row.payment_change_amount ?? row.change_amount)}</td><td>${esc(row.payment_method || 'cash')}</td>
            <td class="nowrap">${esc(dt(row.completed_at || row.printed_at))}</td>
            <td class="action-col"><button class="action-link icon-action" type="button" data-view-receipt data-order-id="${esc(row.order_id)}" title="View Receipt" aria-label="View Receipt"><i class="fa-regular fa-eye"></i></button></td>
        </tr>
    `).join('') : `<tr class="empty-row"><td colspan="${usesDynamicReportTable ? reportColumns(type).length : (type === 'receipts' ? 11 : 10)}">${document.getElementById('cashierSearch')?.value || state.dateStart || state.dateEnd || state.paymentMethod ? 'No transactions match the selected filters.' : 'No completed cashier transactions found.'}</td></tr>`;
    renderPagination(data.pagination || {});
}

async function loadShift() {
    const data = await api('/cashier/get_cashier_shift_summary.php');
    setText('shiftCompletedSales', money(data.total_completed_sales_today));
    setText('shiftCashCollected', money(data.total_cash_collected_today));
    setText('shiftChangeGiven', money(data.total_change_given_today));
    setText('shiftCompletedCount', count(data.completed_transactions));
    setText('shiftCancelledCount', count(data.cancelled_transactions));
    setText('shiftFirstTime', dt(data.first_transaction_time));
    setText('shiftLastTime', dt(data.last_transaction_time));
}

async function loadProfile() {
    const data = await api('/auth/check_session.php');
    setText('profileName', data.full_name || data.username || '-');
    setText('profileUsername', data.username || '-');
    setText('profileRole', 'Cashier');
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', (event) => {
        const button = event.target.closest('[data-view-receipt], [data-receipt-order]');
        if (!button) return;
        const orderId = button.dataset.orderId || button.dataset.receiptId || button.dataset.receiptOrder;
        if (!orderId) return;
        openReceipt(orderId).catch((error) => {
            const { modal, body } = ensureReceiptShell();
            modal.classList.add('show');
            body.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
        });
    });
    if (page === 'dashboard') loadDashboard().catch(console.error);
    if (page === 'queue') { bindSearch(loadQueue); bindQueueTabs(); loadQueue().catch(console.error); }
    if (page === 'completed') {
        const urlFilters = new URLSearchParams(window.location.search);
        state.cashierId = urlFilters.get('cashier_id') || '';
        setDateRange(urlFilters.get('date_start') || '', urlFilters.get('date_end') || '');
        loadCurrentUser()
            .catch(console.error)
            .finally(() => {
                renderReportStructure('completed');
                bindReportControls();
                loadReport('completed').catch(console.error);
            });
    }
    if (page === 'cancelled') { bindSearch(() => loadReport('cancelled')); loadReport('cancelled').catch(console.error); }
    if (page === 'receipts') { bindSearch(() => loadReport('receipts')); loadReport('receipts').catch(console.error); }
    if (page === 'shift') loadShift().catch(console.error);
    if (page === 'profile') loadProfile().catch(console.error);
});
