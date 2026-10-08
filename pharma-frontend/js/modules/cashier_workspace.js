import API_BASE_URL from '../config/config.js';
import { savedTransactionTotals } from './sales_financials.js?v=1';

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
    receiptAddress: 'Address not configured',
    receiptContact: 'Contact not configured',
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

async function loadPharmacyReceiptSettings() {
    const settings = await api('/settings/get_business_hours.php');
    state.receiptAddress = String(settings.profile?.address || '').trim() || 'Address not configured';
    state.receiptContact = String(settings.profile?.contactNumber || '').trim() || 'Contact not configured';
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
    return savedTransactionTotals(order);
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
                <div class="receipt-store-line">${esc(state.receiptAddress)}</div>
                <div class="receipt-store-line">Contact No. ${esc(state.receiptContact)}</div>
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
            <div class="receipt-total-print"><span>Discount:</span><span>${esc(plainMoney(totals.discount))}</span></div>
            <div class="receipt-total-print"><span>VATable Sales:</span><span>${esc(plainMoney(totals.vatableSales))}</span></div>
            <div class="receipt-total-print"><span>VAT (12%):</span><span>${esc(plainMoney(totals.vat))}</span></div>
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
    try {
        await loadPharmacyReceiptSettings();
    } catch (error) {
        state.receiptAddress = 'Address unavailable';
        state.receiptContact = 'Contact unavailable';
        console.error('Unable to load pharmacy contact details for the cashier transaction receipt.', error);
    }
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
    window.PharmacySearchHighlight?.apply(tbody, document.getElementById('cashierSearch')?.value || '');
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
        window.PharmacySearchHighlight?.apply(tbody, document.getElementById('cashierSearch')?.value || '');
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
    window.PharmacySearchHighlight?.apply(tbody, document.getElementById('cashierSearch')?.value || '');
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

function initialsFromName(value) {
    return String(value || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'C';
}

function profileHeaders() {
    const token = sessionStorage.getItem('pharma_tab_token') || '';
    return {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { 'X-Tab-Token': token } : {})
    };
}

function setProfileMessage(id, message = '', success = false) {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = message;
    node.style.color = success ? '#16803c' : '#b42318';
}

function loadStoredProfileImage(id, storageKey) {
    try {
        const image = localStorage.getItem(storageKey);
        const node = document.getElementById(id);
        if (image && node) {
            node.classList.add('has-image');
            node.style.backgroundImage = `url("${image}")`;
        }
    } catch (error) {}
}

function bindProfilePhotoInput(inputId, targetId, storageKey) {
    const input = document.getElementById(inputId);
    const target = document.getElementById(targetId);
    if (!input || !target) return;
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            const image = String(reader.result || '');
            target.classList.add('has-image');
            target.style.backgroundImage = `url("${image}")`;
            try { localStorage.setItem(storageKey, image); } catch (error) {}
        });
        reader.readAsDataURL(file);
    });
}

function bindProfileControls() {
    const cover = document.getElementById('profileCover');
    try {
        const storedCover = localStorage.getItem('pharmacyCashierCoverPhoto');
        if (storedCover && cover) cover.style.backgroundImage = `url("${storedCover}")`;
    } catch (error) {}
    bindProfilePhotoInput('profilePhotoInput', 'profileAvatar', 'pharmacyCashierProfilePhoto');
    const coverInput = document.getElementById('coverPhotoInput');
    document.getElementById('changeProfilePhotoBtn')?.addEventListener('click', () => document.getElementById('profilePhotoInput')?.click());
    document.getElementById('changeCoverBtn')?.addEventListener('click', () => coverInput?.click());
    coverInput?.addEventListener('change', () => {
        const file = coverInput.files?.[0];
        if (!file || !file.type.startsWith('image/') || !cover) return;
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            const image = String(reader.result || '');
            cover.style.backgroundImage = `url("${image}")`;
            cover.style.backgroundPosition = 'center';
            cover.style.backgroundSize = 'cover';
            try { localStorage.setItem('pharmacyCashierCoverPhoto', image); } catch (error) {}
        });
        reader.readAsDataURL(file);
    });
    loadStoredProfileImage('profileAvatar', 'pharmacyCashierProfilePhoto');
}

function bindProfileForms() {
    document.getElementById('cashierProfileForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fullName = document.getElementById('profileNameInput')?.value.trim() || '';
        if (!fullName) return setProfileMessage('profileMessage', 'Full name is required.');
        const submit = event.currentTarget.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        try {
            const response = await fetch(`${API_BASE_URL}/auth/update_profile.php`, {
                method: 'POST', credentials: 'include', headers: profileHeaders(),
                body: JSON.stringify({
                    full_name: fullName,
                    email: event.currentTarget.dataset.email || '',
                    contact_number: event.currentTarget.dataset.contactNumber || '',
                    first_name: event.currentTarget.dataset.firstName || '',
                    last_name: event.currentTarget.dataset.lastName || ''
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to update profile.');
            setText('profileName', fullName);
            setText('profileNameDetail', fullName);
            setText('profileUsername', `@${data.username || document.getElementById('profileUsernameDetail')?.textContent || ''}`);
            setProfileMessage('profileMessage', 'Profile updated successfully.', true);
            window.__drpNavbarProfileDisplay?.cache({ ...data, full_name: fullName });
            window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('editProfileModal'))?.hide();
        } catch (error) {
            setProfileMessage('profileMessage', error.message || 'Unable to update profile.');
        } finally {
            if (submit) submit.disabled = false;
        }
    });

    document.getElementById('cashierPasswordForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form).entries());
        if (values.new_password !== values.confirm_password) return setProfileMessage('passwordMessage', 'New passwords do not match.');
        try {
            const response = await fetch(`${API_BASE_URL}/auth/update_password.php`, {
                method: 'POST', credentials: 'include', headers: profileHeaders(), body: JSON.stringify(values)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to update password.');
            form.reset();
            setProfileMessage('passwordMessage', data.message || 'Password updated successfully.', true);
        } catch (error) {
            setProfileMessage('passwordMessage', error.message || 'Unable to update password.');
        }
    });

    bindCashierOtpReset();
}

function setOtpStep(step) {
    document.querySelectorAll('[data-otp-panel]').forEach((panel) => {
        panel.hidden = Number(panel.dataset.otpPanel) !== step;
    });
    document.querySelectorAll('[data-otp-step]').forEach((marker) => {
        marker.classList.toggle('active', Number(marker.dataset.otpStep) <= step);
    });
}

async function cashierOtpRequest(action, payload = {}) {
    const response = await fetch(`${API_BASE_URL}/auth/cashier_password_reset_otp.php`, {
        method: 'POST',
        credentials: 'include',
        headers: profileHeaders(),
        cache: 'no-store',
        body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status === 'error' || data.success === false) {
        throw new Error(data.message || 'OTP service is currently unavailable.');
    }
    return data.data || data;
}

function bindCashierOtpReset() {
    const modalElement = document.getElementById('otpResetModal');
    const modal = modalElement && window.bootstrap?.Modal.getOrCreateInstance(modalElement);
    const setBusy = (busy) => {
        ['sendOtpBtn', 'verifyOtpBtn', 'resendOtpBtn', 'resetWithOtpBtn'].forEach((id) => {
            const button = document.getElementById(id);
            if (button) button.disabled = busy;
        });
    };
    const sendOtp = async () => {
        const identifier = document.getElementById('otpIdentifier')?.value.trim() || '';
        if (!identifier) {
            setProfileMessage('otpResetMessage', 'Enter your cashier username or registered email.');
            document.getElementById('otpIdentifier')?.focus();
            return;
        }
        setBusy(true);
        setProfileMessage('otpResetMessage', 'Sending OTP...');
        try {
            const data = await cashierOtpRequest('request', { identifier });
            const destination = data.masked_email ? ` (${data.masked_email})` : '';
            const sentText = document.getElementById('otpSentText');
            if (sentText) sentText.textContent = `Enter the 6-digit code sent to your registered email${destination}.`;
            setOtpStep(2);
            setProfileMessage('otpResetMessage', data.message || 'OTP sent to your registered email.', true);
        } catch (error) {
            setProfileMessage('otpResetMessage', error.message || 'Unable to send OTP. Please check your email configuration.');
        } finally {
            setBusy(false);
        }
    };

    document.getElementById('openOtpResetBtn')?.addEventListener('click', () => {
        setOtpStep(1);
        document.getElementById('otpCode').value = '';
        document.getElementById('otpNewPassword').value = '';
        document.getElementById('otpConfirmPassword').value = '';
        setProfileMessage('otpResetMessage', '');
        modal?.show();
    });
    document.getElementById('sendOtpBtn')?.addEventListener('click', sendOtp);
    document.getElementById('resendOtpBtn')?.addEventListener('click', sendOtp);
    document.getElementById('otpIdentifier')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        sendOtp();
    });
    document.getElementById('verifyOtpBtn')?.addEventListener('click', async () => {
        const code = document.getElementById('otpCode')?.value.trim() || '';
        if (!/^\d{6}$/.test(code)) {
            setProfileMessage('otpResetMessage', 'Enter the 6-digit OTP sent to your registered email.');
            return;
        }
        setBusy(true);
        setProfileMessage('otpResetMessage', 'Verifying OTP...');
        try {
            const data = await cashierOtpRequest('verify', { otp: code });
            setOtpStep(3);
            setProfileMessage('otpResetMessage', data.message || 'OTP verified. Create your new password.', true);
        } catch (error) {
            setProfileMessage('otpResetMessage', error.message || 'Unable to verify OTP.');
        } finally {
            setBusy(false);
        }
    });
    document.getElementById('resetWithOtpBtn')?.addEventListener('click', async () => {
        const newPassword = document.getElementById('otpNewPassword')?.value || '';
        const confirmPassword = document.getElementById('otpConfirmPassword')?.value || '';
        if (newPassword.length < 8 || newPassword.length > 72) {
            setProfileMessage('otpResetMessage', 'New password must be between 8 and 72 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setProfileMessage('otpResetMessage', 'New passwords do not match.');
            return;
        }
        setBusy(true);
        setProfileMessage('otpResetMessage', 'Updating password...');
        try {
            const data = await cashierOtpRequest('reset', { new_password: newPassword, confirm_password: confirmPassword });
            document.getElementById('cashierPasswordForm')?.reset();
            setProfileMessage('passwordMessage', data.message || 'Password reset successfully.', true);
            setProfileMessage('otpResetMessage', data.message || 'Password reset successfully.', true);
            modal?.hide();
        } catch (error) {
            setProfileMessage('otpResetMessage', error.message || 'Unable to reset password.');
        } finally {
            setBusy(false);
        }
    });
}

function updateProfileDateTime() {
    const node = document.getElementById('profileDateTime');
    if (node) node.textContent = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
}

async function loadProfile() {
    const data = await api('/auth/check_session.php');
    const fullName = data.full_name || data.username || 'Cashier';
    const username = data.username || '-';
    const initials = initialsFromName(fullName);

    setText('profileName', fullName);
    setText('profileUsername', `@${username}`);
    setText('profileNameDetail', fullName);
    setText('profileUsernameDetail', username);
    setText('profileRole', 'Cashier');

    const profileNameInput = document.getElementById('profileNameInput');
    const profileUsernameInput = document.getElementById('profileUsernameInput');
    const profileRoleInput = document.getElementById('profileRoleInput');
    const profileForm = document.getElementById('cashierProfileForm');
    const modalAvatar = document.getElementById('modalAvatar');
    const profileAvatar = document.getElementById('profileAvatar');

    if (profileNameInput) profileNameInput.value = fullName;
    if (profileUsernameInput) profileUsernameInput.value = username;
    const otpIdentifier = document.getElementById('otpIdentifier');
    if (otpIdentifier) otpIdentifier.value = data.email || username;
    if (profileRoleInput) profileRoleInput.value = 'Cashier';
    if (profileForm) {
        profileForm.dataset.email = data.email || '';
        profileForm.dataset.contactNumber = data.contact_number || '';
        profileForm.dataset.firstName = data.first_name || '';
        profileForm.dataset.lastName = data.last_name || '';
    }
    if (modalAvatar) modalAvatar.textContent = initials;
    if (profileAvatar) profileAvatar.textContent = initials;
    bindProfileControls();
    bindProfileForms();
    updateProfileDateTime();
    window.setInterval(updateProfileDateTime, 30000);
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
    if (page === 'dashboard' && !document.getElementById('salesTodayChart')) loadDashboard().catch(console.error);
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
