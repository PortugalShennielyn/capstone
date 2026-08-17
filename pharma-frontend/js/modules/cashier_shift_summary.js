import API_BASE_URL from '../config/config.js';
import verifySession from './auth.js?v=5';

const todayIso = localIsoDate();
const state = {
    user: null,
    isAdmin: false,
    controller: null,
    requestId: 0,
    lastData: null,
    startDate: todayIso,
    endDate: todayIso,
    draftStartDate: todayIso,
    draftEndDate: todayIso,
    hasUnsavedRange: false,
    requestedCashierId: '',
};

const page = document.getElementById('shiftPage');
const cashierSelect = document.getElementById('cashierSelect');
const cashierIdentity = document.getElementById('cashierIdentity');
const printButton = document.getElementById('printShiftSummary');
const dateRangeButton = document.getElementById('dateRangeButton');
const dateRangeLabel = document.getElementById('dateRangeLabel');
const dateRangePopover = document.getElementById('dateRangePopover');
const dateRangeStart = document.getElementById('dateRangeStart');
const dateRangeEnd = document.getElementById('dateRangeEnd');
const dateRangeValidation = document.getElementById('dateRangeValidation');
const dateRangeCancel = document.getElementById('dateRangeCancel');
const dateRangeApply = document.getElementById('dateRangeApply');
const modal = document.getElementById('transactionDetailModal');
const modalBody = document.getElementById('transactionModalBody');
const modalTitle = document.getElementById('transactionModalTitle');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[character]));
}

function normalizeRole(role) {
    return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
        .replace(/^(manager[/_]owner|owner[/_]manager|manager_\/_owner)$/, 'manager');
}

function userRoles(user) {
    return new Set([
        user?.role,
        ...(Array.isArray(user?.roles) ? user.roles : []),
        ...(Array.isArray(user?.role_identifiers) ? user.role_identifiers : []),
    ].map(normalizeRole).filter(Boolean));
}

function localIsoDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function currency(value) {
    return `PHP ${Number(value || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function number(value) {
    return Number(value || 0).toLocaleString('en-PH');
}

function formatDate(value, options = {}) {
    const date = parseIsoDate(value);
    if (!date) return String(value || '');
    return date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: options.short ? 'short' : 'long',
        day: 'numeric',
    });
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
}

function formatTime(value) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleTimeString('en-PH', {
        hour: 'numeric', minute: '2-digit',
    });
}

function duration(first, last) {
    if (!first || !last) return '-';
    const start = new Date(String(first).replace(' ', 'T'));
    const end = new Date(String(last).replace(' ', 'T'));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '-';
    const totalMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function methodLabel(value) {
    return String(value || 'cash').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isSingleDay() {
    return state.startDate === state.endDate;
}

function displayPeriod(startDate = state.startDate, endDate = state.endDate, short = false) {
    if (startDate === endDate) return formatDate(startDate, { short });
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    if (!start || !end) return `${startDate} - ${endDate}`;
    if (short && start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}-${end.toLocaleDateString('en-PH', { day: 'numeric', year: 'numeric' })}`;
    }
    return `${formatDate(startDate, { short })} - ${formatDate(endDate, { short })}`;
}

function selectedDateText(data) {
    if (!data.is_single_day) return `Selected period: ${displayPeriod(data.selected_start_date, data.selected_end_date)}`;
    if (data.selected_start_date === todayIso) return 'Selected date: Today';
    return `Selected date: ${formatDate(data.selected_start_date)}`;
}

async function request(path, signal) {
    const token = sessionStorage.getItem('pharma_tab_token') || '';
    const response = await fetch(`${API_BASE_URL}/${path}`, {
        credentials: 'include',
        cache: 'no-store',
        signal,
        headers: token ? { 'X-Tab-Token': token } : {},
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === 'error') {
        throw new Error(payload.message || 'The shift summary could not be loaded. Please try again.');
    }
    return payload.data;
}

function rangeValidationMessage(startDate = dateRangeStart.value, endDate = dateRangeEnd.value) {
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    const today = parseIsoDate(todayIso);
    if (!startDate) return 'Start Date is required.';
    if (!endDate) return 'End Date is required.';
    if (!start || !end) return 'Use valid report dates.';
    if (end < start) return 'End Date cannot be earlier than Start Date.';
    if (start > today || end > today) return 'Future dates are not available.';
    return '';
}

function setDateRangeButton() {
    dateRangeLabel.textContent = displayPeriod(state.startDate, state.endDate, true);
}

function openDatePopover() {
    state.draftStartDate = state.startDate;
    state.draftEndDate = state.endDate;
    state.hasUnsavedRange = false;
    dateRangeStart.value = state.draftStartDate;
    dateRangeEnd.value = state.draftEndDate;
    dateRangeValidation.textContent = '';
    dateRangePopover.hidden = false;
    dateRangeButton.setAttribute('aria-expanded', 'true');
}

function closeDatePopover(force = false) {
    if (!force && state.hasUnsavedRange) return;
    dateRangePopover.hidden = true;
    dateRangeButton.setAttribute('aria-expanded', 'false');
    dateRangeValidation.textContent = '';
}

function setDraftRange(startDate, endDate) {
    dateRangeStart.value = startDate;
    dateRangeEnd.value = endDate;
    state.draftStartDate = startDate;
    state.draftEndDate = endDate;
    state.hasUnsavedRange = startDate !== state.startDate || endDate !== state.endDate;
    dateRangeValidation.textContent = rangeValidationMessage();
}

function applyShortcut(kind) {
    const today = parseIsoDate(todayIso);
    let start = new Date(today);
    let end = new Date(today);
    if (kind === 'yesterday') {
        start = addDays(today, -1);
        end = addDays(today, -1);
    }
    if (kind === 'last7') start = addDays(today, -6);
    if (kind === 'month') start = new Date(today.getFullYear(), today.getMonth(), 1);
    setDraftRange(localIsoDate(start), localIsoDate(end));
}

function updateUrl() {
    const query = new URLSearchParams({
        start_date: state.startDate,
        end_date: state.endDate,
    });
    const cashierId = cashierSelect.value || state.requestedCashierId;
    if (state.isAdmin && cashierId) query.set('cashier_id', cashierId);
    const nextUrl = `${window.location.pathname}?${query.toString()}`;
    window.history.pushState({ startDate: state.startDate, endDate: state.endDate, cashierId }, '', nextUrl);
}

function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start_date') || params.get('date') || todayIso;
    const end = params.get('end_date') || params.get('date') || start;
    const message = rangeValidationMessage(start, end);
    state.startDate = message ? todayIso : start;
    state.endDate = message ? todayIso : end;
    return params.get('cashier_id') || '';
}

function renderLoading(firstLoad) {
    page.setAttribute('aria-busy', 'true');
    if (!firstLoad && state.lastData) {
        page.classList.add('is-refreshing');
        return;
    }
    page.innerHTML = `
        <div class="loading-card" role="status">
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <span>Loading shift summary...</span>
        </div>`;
}

function renderState(icon, title, message, options = {}) {
    page.innerHTML = `
        <div class="state-card${options.error ? ' is-error' : ''}">
            <div>
                <i class="fa-solid ${escapeHtml(icon)}" aria-hidden="true"></i>
                <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>
            </div>
            ${options.retry ? '<button class="retry-button interactive-only" type="button" data-retry-summary>Retry</button>' : ''}
        </div>`;
}

function renderInitializationError() {
    renderState('fa-triangle-exclamation', 'Unable to open Shift Summary', 'The shift summary could not be loaded. Please try again.', { error: true, retry: true });
}

function setControlsLoading(isLoading) {
    cashierSelect.disabled = isLoading;
    dateRangeButton.disabled = isLoading;
    dateRangeApply.disabled = isLoading;
    printButton.disabled = isLoading || !state.lastData;
}

function renderCashierControls(data) {
    if (!state.isAdmin) {
        cashierSelect.hidden = true;
        cashierIdentity.hidden = false;
        cashierIdentity.querySelector('span').textContent = data.cashier_name || state.user?.full_name || state.user?.username || 'My Shift';
        return;
    }

    const selected = data.selected_cashier_id || state.requestedCashierId || cashierSelect.value || '';
    const cashiers = Array.isArray(data.cashiers) ? data.cashiers : [];
    const existing = cashierSelect.value;
    cashierSelect.replaceChildren(new Option('Select cashier', ''));
    cashiers.forEach((cashier) => cashierSelect.add(new Option(cashier.name || 'Cashier', cashier.user_id)));
    cashierSelect.value = selected || existing;
    state.requestedCashierId = cashierSelect.value || selected || '';
    cashierSelect.hidden = false;
    cashierIdentity.hidden = true;
}

function kpi(icon, label, value, support = '') {
    return `
        <article class="kpi-card">
            <span class="kpi-icon"><i class="fa-solid ${escapeHtml(icon)}"></i></span>
            <div>
                <span class="kpi-label">${escapeHtml(label)}</span>
                <strong class="kpi-value">${escapeHtml(value)}</strong>
                ${support ? `<span class="kpi-support">${escapeHtml(support)}</span>` : ''}
            </div>
        </article>`;
}

function renderPaymentBreakdown(rows) {
    if (!rows.length) return '<div class="activity-empty">No completed payment records for the selected period.</div>';
    return `<div class="breakdown-list">${rows.map((row) => `
        <div class="breakdown-row">
            <span>${escapeHtml(methodLabel(row.payment_method))}<small class="payment-meta">${escapeHtml(number(row.transaction_count))} transaction${Number(row.transaction_count) === 1 ? '' : 's'}</small></span>
            <strong>${escapeHtml(currency(row.amount))}</strong>
        </div>`).join('')}</div>`;
}

function historyUrl(data) {
    const query = new URLSearchParams({
        date_start: data.selected_start_date,
        date_end: data.selected_end_date,
    });
    if (state.isAdmin && data.selected_cashier_id) query.set('cashier_id', data.selected_cashier_id);
    return `cashier_transaction_history.html?${query.toString()}`;
}

function renderRecent(rows, data) {
    if (!rows.length) {
        return '<div class="state-card"><div><strong>No completed transactions</strong><span>No completed transactions were found for the selected cashier and date range.</span></div></div>';
    }
    const timeHeader = data.is_single_day ? 'Time' : 'Date / Time';
    return `
        <div class="table-scroll">
            <table class="shift-table">
                <thead><tr><th>${timeHeader}</th><th>Receipt No.</th><th>Customer</th><th>Payment Method</th><th class="money-cell">Total</th><th>Status</th><th class="action-cell">Action</th></tr></thead>
                <tbody>${rows.map((row) => `
                    <tr>
                        <td>${escapeHtml(data.is_single_day ? formatTime(row.completed_at) : formatDateTime(row.completed_at))}</td>
                        <td class="receipt-cell" title="${escapeHtml(row.receipt_no || row.order_no)}">${escapeHtml(row.receipt_no || row.order_no || '-')}</td>
                        <td>${escapeHtml(row.customer_name || 'Walk-in Customer')}</td>
                        <td>${escapeHtml(methodLabel(row.payment_method))}</td>
                        <td class="money-cell">${escapeHtml(currency(row.total_amount))}</td>
                        <td><span class="status-pill completed">${escapeHtml(row.status || 'Completed')}</span></td>
                        <td class="action-cell"><button class="view-button interactive-only" type="button" data-view-transaction="${escapeHtml(row.order_id)}" title="View transaction details" aria-label="View transaction ${escapeHtml(row.receipt_no || row.order_no || row.order_id)}"><i class="fa-regular fa-eye"></i></button></td>
                    </tr>`).join('')}</tbody>
            </table>
        </div>`;
}

function renderActivity(data) {
    const activity = data.activity || {};
    const completedCount = Number(activity.completed_transaction_count || 0);
    if (data.is_single_day) {
        return `
            <h2 class="card-heading">Shift Activity</h2>
            <div class="detail-list">
                <div class="detail-row"><span>Cashier</span><strong>${escapeHtml(data.cashier_name)}</strong></div>
                <div class="detail-row"><span>Date Status</span><strong>${escapeHtml(data.selected_start_date === todayIso ? 'Today' : formatDate(data.selected_start_date))}</strong></div>
                <div class="detail-row"><span>First Transaction</span><strong>${escapeHtml(formatTime(activity.first_transaction_time))}</strong></div>
                <div class="detail-row"><span>Last Transaction</span><strong>${escapeHtml(formatTime(activity.last_transaction_time))}</strong></div>
                <div class="detail-row"><span>Transaction Activity Duration</span><strong>${escapeHtml(duration(activity.first_transaction_time, activity.last_transaction_time))}</strong></div>
                <div class="detail-row"><span>Completed Transactions</span><strong>${escapeHtml(number(completedCount))}</strong></div>
            </div>`;
    }

    return `
        <h2 class="card-heading">Period Activity</h2>
        <div class="detail-list">
            <div class="detail-row"><span>Cashier</span><strong>${escapeHtml(data.cashier_name)}</strong></div>
            <div class="detail-row"><span>Period Start</span><strong>${escapeHtml(formatDate(data.selected_start_date))}</strong></div>
            <div class="detail-row"><span>Period End</span><strong>${escapeHtml(formatDate(data.selected_end_date))}</strong></div>
            <div class="detail-row"><span>Active Days</span><strong>${escapeHtml(number(activity.active_days || 0))}</strong></div>
            <div class="detail-row"><span>Completed Transactions</span><strong>${escapeHtml(number(completedCount))}</strong></div>
        </div>`;
}

function renderSummary(data) {
    renderCashierControls(data);
    if (state.isAdmin && !data.selected_cashier_id) {
        state.lastData = null;
        printButton.disabled = true;
        renderState('fa-user-check', 'Select a cashier', 'Select a cashier to review their shift summary.');
        return;
    }

    state.lastData = data;
    const summary = data.summary || {};
    const sales = data.sales_breakdown || {};
    const cashMatched = Math.abs(Number(summary.cash_variance || 0)) < .005;
    const generated = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const completedCount = Number(summary.completed_transactions || 0);
    const cancelledCount = Number(summary.cancelled_voided_transactions || 0);
    const reportTitle = data.is_single_day ? 'Shift Summary' : 'Activity Summary';
    const recentTitle = data.is_single_day ? 'Recent Transactions for This Shift' : 'Recent Transactions for This Period';
    const selectedText = selectedDateText(data);

    page.innerHTML = `
        <div class="loading-strip"><span class="spinner-border spinner-border-sm"></span><span>Updating report...</span></div>
        <header class="print-report-head">
            <strong>${escapeHtml(data.pharmacy?.name || 'Dr. R Pharmacy')}</strong>
            <h1>Cashier ${escapeHtml(reportTitle)}</h1>
            <p>Cashier: ${escapeHtml(data.cashier_name)} &nbsp; | &nbsp; Period: ${escapeHtml(displayPeriod(data.selected_start_date, data.selected_end_date))}</p>
            <p>Generated: ${escapeHtml(generated)}</p>
        </header>
        <section class="selected-shift">
            <i class="fa-solid fa-user-clock"></i>
            <div><h1>${escapeHtml(data.cashier_name)} &mdash; ${escapeHtml(reportTitle)}</h1><p>Transaction activity based on completed payment records. This is not a physical drawer count.</p></div>
            <span class="date-badge">${escapeHtml(displayPeriod(data.selected_start_date, data.selected_end_date, true))}</span>
        </section>
        <section class="kpi-grid" aria-label="Shift key totals">
            ${kpi('fa-chart-line', 'Net Completed Sales', currency(summary.total_completed_sales))}
            ${kpi('fa-circle-check', 'Completed Transactions', `${number(completedCount)} Transaction${completedCount === 1 ? '' : 's'}`)}
            ${kpi('fa-ban', 'Cancelled / Voided', `${number(cancelledCount)} Voided`)}
            ${kpi('fa-receipt', 'Average Transaction Value', currency(sales.average_transaction_value))}
            ${kpi('fa-tag', 'Discounts / Refunds', currency(Number(sales.discounts || 0) + Number(sales.refunds || 0)))}
        </section>
        <section class="primary-grid">
            <article class="report-card">
                <h2 class="card-heading">Cash Sales Reconciliation</h2>
                <p class="card-subtitle">Cash activity based on finalized payment records. This is not a physical drawer count.</p>
                <div class="calculation-list">
                    <div class="calculation-row"><span>Cash Tendered</span><strong>${escapeHtml(currency(summary.cash_tendered))}</strong></div>
                    <div class="calculation-row negative"><span>Less: Change Given</span><strong>-${escapeHtml(currency(summary.change_given))}</strong></div>
                    <div class="calculation-row total"><span>Net Cash Sales</span><strong>${escapeHtml(currency(summary.net_cash_sales))}</strong></div>
                </div>
                <p class="reconciliation-note">Cash tendered minus change given represents recorded cash-paid sales.</p>
                <div class="comparison-strip">
                    <div><span>Recorded Cash-Paid Sales</span><strong>${escapeHtml(currency(summary.cash_paid_sales))}</strong></div>
                    <span class="comparison-badge ${cashMatched ? 'matched' : 'review'}">${cashMatched ? 'System Totals Match' : `Review Difference: ${escapeHtml(currency(Math.abs(Number(summary.cash_variance || 0))))}`}</span>
                </div>
            </article>
            <article class="report-card">
                ${renderActivity(data)}
            </article>
        </section>
        <section class="breakdown-grid">
            <article class="report-card">
                <h2 class="card-heading">Payment Breakdown</h2>
                ${renderPaymentBreakdown(data.payment_breakdown || [])}
            </article>
            <article class="report-card">
                <h2 class="card-heading">Sales Breakdown</h2>
                <div class="breakdown-list">
                    <div class="breakdown-row"><span>Gross Completed Sales</span><strong>${escapeHtml(currency(sales.gross_completed_sales))}</strong></div>
                    <div class="breakdown-row negative"><span>Discounts</span><strong>-${escapeHtml(currency(sales.discounts))}</strong></div>
                    ${sales.refunds_supported ? `<div class="breakdown-row negative"><span>Refunds</span><strong>-${escapeHtml(currency(sales.refunds))}</strong></div>` : ''}
                    <div class="breakdown-row total"><span>Net Completed Sales</span><strong>${escapeHtml(currency(sales.net_completed_sales))}</strong></div>
                    <div class="breakdown-row"><span>Average Transaction Value</span><strong>${escapeHtml(currency(sales.average_transaction_value))}</strong></div>
                </div>
            </article>
        </section>
        <section class="report-card transactions-card">
            <header class="transactions-head">
                <h2>${escapeHtml(recentTitle)}</h2>
                <a class="history-link interactive-only" href="${escapeHtml(historyUrl(data))}"><i class="fa-solid fa-clock-rotate-left"></i>View Full Transaction History</a>
            </header>
            ${renderRecent(data.recent_transactions || [], data)}
        </section>
        ${data.has_records ? '' : `<p class="activity-empty">${escapeHtml('No completed transactions were found for the selected cashier and date range.')}</p>`}`;

    printButton.disabled = false;
    page.dataset.selectedText = selectedText;
}

async function loadSummary(options = {}) {
    const requestId = ++state.requestId;
    state.controller?.abort();
    state.controller = new AbortController();
    const firstLoad = !state.lastData;
    renderLoading(firstLoad);
    setControlsLoading(true);
    setDateRangeButton();
    if (options.pushUrl) updateUrl();

    try {
        const query = new URLSearchParams({
            start_date: state.startDate,
            end_date: state.endDate,
        });
        const cashierId = cashierSelect.value || state.requestedCashierId;
        if (state.isAdmin && cashierId) query.set('cashier_id', cashierId);
        const data = await request(`cashier/get_cashier_shift_summary.php?${query}`, state.controller.signal);
        if (requestId !== state.requestId) return;
        renderSummary(data);
    } catch (error) {
        if (error.name === 'AbortError' || requestId !== state.requestId) return;
        state.lastData = null;
        renderState('fa-triangle-exclamation', 'Unable to load summary', error.message || 'The shift summary could not be loaded. Please try again.', { error: true, retry: true });
    } finally {
        if (requestId === state.requestId) {
            page.classList.remove('is-refreshing');
            page.setAttribute('aria-busy', 'false');
            setControlsLoading(false);
        }
    }
}

function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
}

function detailItemName(item) {
    const brand = String(item.brand_name || '').trim();
    const name = String(item.product_name || 'Item').trim();
    return brand && brand.toLowerCase() !== name.toLowerCase() ? `${brand} ${name}` : name || brand || 'Item';
}

function renderTransactionDetail(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const salesDiscount = Number(order.sales_clerk_discount || 0);
    const cashierDiscount = Number(order.cashier_discount_amount || 0);
    const totalDiscount = salesDiscount + cashierDiscount;
    modalTitle.textContent = order.receipt_no || order.order_no || 'Transaction';
    modalBody.innerHTML = `
        <div class="modal-summary-grid">
            <div class="modal-summary-item"><span>Receipt number</span><strong>${escapeHtml(order.receipt_no || '-')}</strong></div>
            <div class="modal-summary-item"><span>Transaction date and time</span><strong>${escapeHtml(formatDateTime(order.completed_at || order.created_at))}</strong></div>
            <div class="modal-summary-item"><span>Cashier</span><strong>${escapeHtml(order.cashier_name || 'Cashier')}</strong></div>
            ${order.sales_clerk_name ? `<div class="modal-summary-item"><span>Sales clerk</span><strong>${escapeHtml(order.sales_clerk_name)}</strong></div>` : ''}
            <div class="modal-summary-item"><span>Customer</span><strong>${escapeHtml(order.customer_name || 'Walk-in Customer')}</strong></div>
            <div class="modal-summary-item"><span>Payment method</span><strong>${escapeHtml(methodLabel(order.payment_method))}</strong></div>
            <div class="modal-summary-item"><span>Cash tendered</span><strong>${escapeHtml(currency(order.amount_paid || order.cash_received))}</strong></div>
            <div class="modal-summary-item"><span>Change</span><strong>${escapeHtml(currency(order.change_amount))}</strong></div>
            <div class="modal-summary-item"><span>Status</span><strong>${escapeHtml(order.status || 'Completed')}</strong></div>
        </div>
        <div class="modal-table-scroll"><table class="modal-items">
            <thead><tr><th>Sold Item</th><th>Quantity</th><th class="money-cell">Unit Price</th><th class="money-cell">Line Total</th></tr></thead>
            <tbody>${items.length ? items.map((item) => `<tr><td>${escapeHtml(detailItemName(item))}</td><td>${escapeHtml(number(item.quantity))}</td><td class="money-cell">${escapeHtml(currency(item.unit_price))}</td><td class="money-cell">${escapeHtml(currency(item.line_total))}</td></tr>`).join('') : '<tr><td colspan="4">No item details were found.</td></tr>'}</tbody>
        </table></div>
        <div class="modal-totals">
            <div class="modal-total-row"><span>Subtotal</span><strong>${escapeHtml(currency(order.subtotal))}</strong></div>
            <div class="modal-total-row"><span>Discounts</span><strong>-${escapeHtml(currency(totalDiscount))}</strong></div>
            <div class="modal-total-row"><span>VAT</span><strong>${escapeHtml(currency(order.vat))}</strong></div>
            <div class="modal-total-row grand"><span>Final Total</span><strong>${escapeHtml(currency(order.total_amount))}</strong></div>
        </div>`;
}

async function openTransactionDetail(orderId) {
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modalTitle.textContent = 'Receipt';
    modalBody.innerHTML = '<div class="loading-card"><span class="spinner-border spinner-border-sm"></span><span>Loading transaction details...</span></div>';
    try {
        const order = await request(`cashier/get_cashier_order.php?order_id=${encodeURIComponent(orderId)}`);
        renderTransactionDetail(order);
    } catch (error) {
        modalBody.innerHTML = `<div class="state-card"><div><strong>Unable to load transaction</strong><span>${escapeHtml(error.message)}</span></div></div>`;
    }
}

function handlePageClick(event) {
    const viewButton = event.target.closest('[data-view-transaction]');
    if (viewButton) openTransactionDetail(viewButton.dataset.viewTransaction);
    if (event.target.closest('[data-retry-summary]')) loadSummary();
}

function handleModalClick(event) {
    if (event.target.closest('[data-close-transaction-modal]')) closeModal();
}

function handleKeydown(event) {
    if (event.key === 'Escape') {
        if (!modal.hidden) closeModal();
        if (!dateRangePopover.hidden) closeDatePopover(true);
    }
}

async function initializeShiftSummary() {
    state.user = await verifySession();
    const roles = userRoles(state.user);
    state.isAdmin = ['admin', 'manager', 'super_admin', 'ro_admin', 'ro_manager', 'ro_super_admin'].some((role) => roles.has(role));
    const urlCashier = readUrlState();
    state.requestedCashierId = urlCashier;
    setDateRangeButton();

    dateRangeStart.max = todayIso;
    dateRangeEnd.max = todayIso;
    cashierSelect.hidden = !state.isAdmin;
    cashierIdentity.hidden = state.isAdmin;
    if (!state.isAdmin) cashierIdentity.querySelector('span').textContent = state.user?.full_name || state.user?.username || 'My Shift';

    dateRangeButton.addEventListener('click', () => {
        if (dateRangePopover.hidden) openDatePopover();
        else closeDatePopover(true);
    });
    dateRangeStart.addEventListener('input', () => setDraftRange(dateRangeStart.value, dateRangeEnd.value));
    dateRangeEnd.addEventListener('input', () => setDraftRange(dateRangeStart.value, dateRangeEnd.value));
    document.querySelectorAll('[data-range-shortcut]').forEach((button) => button.addEventListener('click', () => applyShortcut(button.dataset.rangeShortcut)));
    dateRangeCancel.addEventListener('click', () => closeDatePopover(true));
    dateRangeApply.addEventListener('click', () => {
        const message = rangeValidationMessage();
        dateRangeValidation.textContent = message;
        if (message) return;
        state.startDate = dateRangeStart.value;
        state.endDate = dateRangeEnd.value;
        state.hasUnsavedRange = false;
        closeDatePopover(true);
        loadSummary({ pushUrl: true });
    });
    document.addEventListener('click', (event) => {
        if (dateRangePopover.hidden) return;
        if (event.target.closest('.date-range-wrap')) return;
        closeDatePopover(false);
    });
    cashierSelect.addEventListener('change', () => {
        state.requestedCashierId = cashierSelect.value || '';
        loadSummary({ pushUrl: true });
    });
    printButton.addEventListener('click', () => window.print());
    page.addEventListener('click', handlePageClick);
    modal.addEventListener('click', handleModalClick);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('popstate', () => {
        const cashierId = readUrlState();
        state.requestedCashierId = cashierId;
        if (state.isAdmin && cashierId) cashierSelect.value = cashierId;
        loadSummary();
    });
    await loadSummary();
}

if (!window.__cashierShiftSummaryInitialized) {
    window.__cashierShiftSummaryInitialized = true;
    initializeShiftSummary().catch(renderInitializationError);
}
