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

function reportKind(data) {
    return data?.is_single_day ? 'END OF SHIFT REPORT' : 'CASHIER PERIOD SUMMARY';
}

function shiftStatus(data) {
    if (!data?.is_single_day) return 'Period Summary';
    if (data.selected_end_date < todayIso) return 'Closed';
    return 'Active';
}

function reportFrom(data) {
    return data?.activity?.first_transaction_time || `${data.selected_start_date} 00:00:00`;
}

function reportTo(data) {
    if (data?.activity?.last_transaction_time) return data.activity.last_transaction_time;
    return data?.is_single_day ? `${data.selected_end_date} 23:59:59` : `${data.selected_end_date} 23:59:59`;
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
    cashierSelect.replaceChildren(new Option('All Cashiers', ''));
    cashiers.forEach((cashier) => cashierSelect.add(new Option(cashier.name || 'Cashier', cashier.user_id)));
    cashierSelect.value = selected;
    state.requestedCashierId = selected;
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

function renderRecent(rows, data, options = {}) {
    if (!rows.length) {
        return '<div class="state-card"><div><strong>No completed transactions</strong><span>No completed transactions were found for the selected cashier and date range.</span></div></div>';
    }
    const timeHeader = data.is_single_day ? 'Time' : 'Date / Time';
    const allCashiers = options.allCashiers === true;
    return `
        <div class="table-scroll">
            <table class="shift-table${allCashiers ? ' all-cashiers-table' : ''}">
                <thead><tr>${allCashiers ? '<th class="index-cell">#</th>' : ''}<th>${timeHeader}</th><th>Receipt No.</th>${allCashiers ? '<th>Cashier</th>' : ''}<th>Customer</th><th>Payment Method</th><th class="money-cell">Total</th><th class="status-cell">Status</th><th class="action-cell">Action</th></tr></thead>
                <tbody>${rows.slice(0, allCashiers ? 10 : rows.length).map((row, index) => `
                    <tr>
                        ${allCashiers ? `<td class="index-cell">${index + 1}</td>` : ''}
                        <td>${escapeHtml(data.is_single_day ? formatTime(row.completed_at) : formatDateTime(row.completed_at))}</td>
                        <td class="receipt-cell" title="${escapeHtml(row.receipt_no || row.order_no)}">${escapeHtml(row.receipt_no || row.order_no || '-')}</td>
                        ${allCashiers ? `<td>${escapeHtml(row.cashier_name || 'Cashier')}</td>` : ''}
                        <td>${escapeHtml(row.customer_name || 'Walk-in Customer')}</td>
                        <td>${escapeHtml(methodLabel(row.payment_method))}</td>
                        <td class="money-cell">${escapeHtml(currency(row.total_amount))}</td>
                        <td class="status-cell"><span class="status-pill completed">${escapeHtml(row.status || 'Completed')}</span></td>
                        <td class="action-cell"><button class="view-button interactive-only" type="button" data-view-transaction="${escapeHtml(row.order_id)}" title="View transaction details" aria-label="View transaction ${escapeHtml(row.receipt_no || row.order_no || row.order_id)}"><i class="fa-regular fa-eye"></i></button></td>
                    </tr>`).join('')}</tbody>
            </table>
        </div>`;
}

function renderActivity(data) {
    const activity = data.activity || {};
    const completedCount = Number(activity.completed_transaction_count || 0);
    return `
        <h2 class="card-heading">Shift Information</h2>
        <div class="detail-list">
            <div class="detail-row"><span>Cashier</span><strong>${escapeHtml(data.cashier_name || 'All Cashiers')}</strong></div>
            <div class="detail-row"><span>Shift Start</span><strong>${escapeHtml(formatDateTime(reportFrom(data)))}</strong></div>
            <div class="detail-row"><span>Shift End</span><strong>${escapeHtml(formatDateTime(reportTo(data)))}</strong></div>
            <div class="detail-row"><span>Status</span><strong>${escapeHtml(shiftStatus(data))}</strong></div>
            <div class="detail-row"><span>Completed Transactions</span><strong>${escapeHtml(number(completedCount))}</strong></div>
        </div>`;
}

function renderCashierSummaryGrid(reports) {
    if (!reports.length) {
        return '<div class="state-card"><div><strong>No cashier activity</strong><span>No cashier transactions were found for the selected date range.</span></div></div>';
    }

    return `
        <section class="cashier-summaries">
            <header class="cashier-summaries-head">
                <h2>Cashier Summaries</h2>
                <span>${escapeHtml(number(reports.length))} cashier${reports.length === 1 ? '' : 's'} in this period</span>
            </header>
            <div class="cashier-summary-grid">
                ${reports.map((report) => {
                    const summary = report.summary || {};
                    const sales = report.sales_breakdown || {};
                    return `
                        <article class="cashier-summary-item">
                            <span class="eyebrow">${escapeHtml(report.cashier_name || 'Cashier')}</span>
                            <h3>${escapeHtml(report.cashier_name || 'Cashier')} <span>— Cashier Transaction Summary</span></h3>
                            <div class="report-lines">
                                <div><span>Completed Transactions</span><strong>${escapeHtml(number(summary.completed_transactions))}</strong></div>
                                <div><span>Cancelled / Voided</span><strong>${escapeHtml(number(summary.cancelled_voided_transactions))}</strong></div>
                                <div><span>Refunded Transactions</span><strong>${escapeHtml(number(summary.refunded_transactions))}</strong></div>
                                <div><span>Gross Sales</span><strong>${escapeHtml(currency(sales.gross_completed_sales))}</strong></div>
                                <div><span>Net Sales</span><strong>${escapeHtml(currency(sales.net_completed_sales))}</strong></div>
                                <div class="grand"><span>Total Collected</span><strong>${escapeHtml(currency(sales.net_completed_sales))}</strong></div>
                            </div>
                        </article>`;
                }).join('')}
            </div>
        </section>`;
}

function renderPrintReport(data, generated) {
    const summary = data.summary || {};
    const sales = data.sales_breakdown || {};
    const timezone = data.pharmacy?.timezone || 'Asia/Manila';
    const paperCurrency = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const printedAt = new Date().toLocaleString('en-PH', { timeZone: timezone, dateStyle: 'long', timeStyle: 'short' });
    const recentRows = (data.recent_transactions || []).slice(0, 10);
    const address = String(data.pharmacy?.address || '').trim();
    const period = displayPeriod(data.selected_start_date, data.selected_end_date);
    return `
        <section class="print-receipt-report">
            <header class="cashier-paper-head">
                <h1>DOC R PHARMACY</h1>
                ${address ? `<p>${escapeHtml(address)}</p>` : ''}
            </header>
            <div class="cashier-paper-report-title">
                <h2>SALES REPORT</h2>
                <p>Reporting Period: ${escapeHtml(period)}</p>
                <small>Date Printed: ${escapeHtml(printedAt)}</small>
            </div>
            <section class="cashier-paper-summary">
                <h3>Sales Summary</h3>
                <div class="cashier-paper-metrics">
                    <article><span>Completed Transactions</span><strong>${escapeHtml(number(summary.completed_transactions))}</strong></article>
                    <article><span>Gross Sales</span><strong>${escapeHtml(paperCurrency(sales.gross_completed_sales))}</strong></article>
                    <article><span>Discounts</span><strong>${escapeHtml(paperCurrency(sales.discounts))}</strong></article>
                    <article><span>Net Sales</span><strong>${escapeHtml(paperCurrency(sales.net_completed_sales))}</strong></article>
                </div>
            </section>
            <section class="cashier-paper-transactions">
                <h3>Transaction Details</h3>
                <table>
                    <thead><tr><th>Receipt No.</th><th>Date / Time</th><th>Cashier</th><th>Payment</th><th>Amount</th></tr></thead>
                    <tbody>${recentRows.length ? recentRows.map((row) => `<tr><td>${escapeHtml(row.receipt_no || row.order_no || '-')}</td><td>${escapeHtml(formatDateTime(row.completed_at))}</td><td>${escapeHtml(row.cashier_name || data.cashier_name || 'Cashier')}</td><td>${escapeHtml(methodLabel(row.payment_method))}</td><td>${escapeHtml(paperCurrency(row.total_amount))}</td></tr>`).join('') : '<tr><td colspan="5" class="cashier-paper-empty">No completed transactions for this reporting period.</td></tr>'}</tbody>
                </table>
                <p class="cashier-paper-note">Transaction details list up to 10 recent completed transactions. Summary totals reflect the selected reporting period.</p>
            </section>
            <footer class="cashier-paper-signatures">
                <div><span>Prepared by:</span><strong>${escapeHtml(data.cashier_name || '____________________')}</strong></div>
                <div><span>Reviewed by:</span><strong>____________________</strong></div>
            </footer>
        </section>`;
}

function renderSummaryReport(data, options = {}) {
    const summary = data.summary || {};
    const sales = data.sales_breakdown || {};
    const completedCount = Number(summary.completed_transactions || 0);
    const cancelledCount = Number(summary.cancelled_voided_transactions || 0);
    const refundedCount = Number(summary.refunded_transactions || 0);
    const paymentRows = data.payment_breakdown || [];
    const totalCollected = paymentRows.reduce((total, row) => total + Number(row.amount || 0), 0);

    return `
        <section class="summary-report">
            <header class="report-header">
                <div>
                    <span class="eyebrow">${escapeHtml(options.eyebrow || data.cashier_name)}</span>
                    <h1>${escapeHtml(options.title || 'Cashier Transaction Summary')}</h1>
                    <p>${escapeHtml(data.is_single_day ? `Shift period: ${formatDateTime(reportFrom(data))} to ${formatDateTime(reportTo(data))}` : `Selected period: ${displayPeriod(data.selected_start_date, data.selected_end_date)}`)}</p>
                </div>
                <span class="status-pill report-status">${escapeHtml(options.badge || shiftStatus(data))}</span>
            </header>
            <div class="report-grid two">
                <article class="report-section">
                    <h2>Transaction Summary</h2>
                    <div class="report-lines">
                        <div><span>Completed Transactions</span><strong>${escapeHtml(number(completedCount))}</strong></div>
                        <div><span>Cancelled / Voided</span><strong>${escapeHtml(number(cancelledCount))}</strong></div>
                        <div><span>Refunded Transactions</span><strong>${escapeHtml(number(refundedCount))}</strong></div>
                    </div>
                </article>
                <article class="report-section">
                    ${renderActivity(data)}
                </article>
            </div>
            <hr class="report-divider">
            <div class="report-grid two">
                <article class="report-section">
                    <h2>Sales</h2>
                    <div class="report-lines">
                        <div><span>Gross Completed Sales</span><strong>${escapeHtml(currency(sales.gross_completed_sales))}</strong></div>
                        <div class="negative"><span>Less: Discounts</span><strong>-${escapeHtml(currency(sales.discounts))}</strong></div>
                        <div class="negative"><span>Less: Refunds</span><strong>-${escapeHtml(currency(sales.refunds))}</strong></div>
                        <div class="grand"><span>NET SALES</span><strong>${escapeHtml(currency(sales.net_completed_sales))}</strong></div>
                    </div>
                </article>
                <article class="report-section">
                    <h2>Payment / Tender Breakdown</h2>
                    <div class="report-lines">
                        ${paymentRows.length ? paymentRows.map((row) => `<div><span>${escapeHtml(methodLabel(row.payment_method))}</span><strong>${escapeHtml(currency(row.amount))}</strong></div>`).join('') : '<div><span>No collected tenders</span><strong>PHP 0.00</strong></div>'}
                        <div class="grand"><span>TOTAL COLLECTED</span><strong>${escapeHtml(currency(totalCollected))}</strong></div>
                    </div>
                </article>
            </div>
        </section>`;
}

function renderSummary(data) {
    renderCashierControls(data);
    state.lastData = data;
    const generated = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const recentTitle = 'Recent Transactions';
    const selectedText = selectedDateText(data);

    page.innerHTML = `
        <div class="loading-strip"><span class="spinner-border spinner-border-sm"></span><span>Updating report...</span></div>
        ${renderPrintReport(data, generated)}
        ${renderSummaryReport(data)}
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

function sumValues(rows, path) {
    return rows.reduce((total, row) => total + Number(path.split('.').reduce((value, key) => value?.[key], row) || 0), 0);
}

function aggregatePaymentBreakdown(rows) {
    const byMethod = new Map();
    rows.flatMap((row) => row.payment_breakdown || []).forEach((payment) => {
        const key = String(payment.payment_method || 'cash').toLowerCase();
        const current = byMethod.get(key) || { payment_method: payment.payment_method || 'cash', transaction_count: 0, amount: 0 };
        current.transaction_count += Number(payment.transaction_count || 0);
        current.amount += Number(payment.amount || 0);
        byMethod.set(key, current);
    });
    return Array.from(byMethod.values()).sort((a, b) => methodLabel(a.payment_method).localeCompare(methodLabel(b.payment_method)));
}

function aggregateRecentTransactions(rows) {
    const byOrder = new Map();
    rows.flatMap((row) => row.recent_transactions || []).forEach((transaction) => {
        if (!byOrder.has(String(transaction.order_id))) byOrder.set(String(transaction.order_id), transaction);
    });
    return Array.from(byOrder.values())
        .sort((a, b) => new Date(String(b.completed_at || '').replace(' ', 'T')) - new Date(String(a.completed_at || '').replace(' ', 'T')))
        .slice(0, 12);
}

function buildAllCashiersData(base, reports) {
    const activeReports = reports.filter((report) => report?.has_records);
    const paymentBreakdown = aggregatePaymentBreakdown(activeReports);
    const completedTransactions = sumValues(activeReports, 'summary.completed_transactions');
    const grossSales = sumValues(activeReports, 'sales_breakdown.gross_completed_sales');
    const netSales = sumValues(activeReports, 'sales_breakdown.net_completed_sales');
    const cashTendered = sumValues(activeReports, 'summary.cash_tendered');
    const changeGiven = sumValues(activeReports, 'summary.change_given');
    const netCashSales = cashTendered - changeGiven;
    return {
        ...base,
        selected_cashier_id: '',
        cashier_name: 'All Cashiers',
        all_cashiers: true,
        cashier_reports: activeReports,
        has_records: activeReports.length > 0,
        summary: {
            total_completed_sales: netSales,
            cash_tendered: cashTendered,
            change_given: changeGiven,
            net_cash_sales: netCashSales,
            cash_paid_sales: sumValues(activeReports, 'summary.cash_paid_sales'),
            cash_variance: sumValues(activeReports, 'summary.cash_variance'),
            completed_transactions: completedTransactions,
            cancelled_voided_transactions: sumValues(activeReports, 'summary.cancelled_voided_transactions'),
            refunded_transactions: sumValues(activeReports, 'summary.refunded_transactions'),
        },
        activity: {
            first_transaction_time: activeReports.map((report) => report.activity?.first_transaction_time).filter(Boolean).sort()[0] || null,
            last_transaction_time: activeReports.map((report) => report.activity?.last_transaction_time).filter(Boolean).sort().at(-1) || null,
            completed_transaction_count: completedTransactions,
            active_days: sumValues(activeReports, 'activity.active_days'),
        },
        payment_breakdown: paymentBreakdown,
        sales_breakdown: {
            gross_completed_sales: grossSales,
            discounts: sumValues(activeReports, 'sales_breakdown.discounts'),
            refunds: sumValues(activeReports, 'sales_breakdown.refunds'),
            refunds_supported: true,
            net_completed_sales: netSales,
            average_transaction_value: completedTransactions > 0 ? netSales / completedTransactions : 0,
        },
        recent_transactions: aggregateRecentTransactions(activeReports),
    };
}

function renderAllCashiersSummary(data) {
    renderCashierControls(data);
    state.lastData = data;
    const generated = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const reports = data.cashier_reports || [];
    page.innerHTML = `
        <div class="loading-strip"><span class="spinner-border spinner-border-sm"></span><span>Updating report...</span></div>
        ${renderPrintReport({ ...data, cashier_name: 'All Cashiers', include_recent_print: true }, generated).replace(reportKind(data), 'ALL CASHIERS PERIOD SUMMARY')}
        ${reports.map((report) => renderPrintReport(report, generated)).join('')}
        <section class="all-cashiers-report">
            ${renderSummaryReport(data, { eyebrow: 'All Cashiers', title: 'All Cashiers Summary', badge: data.is_single_day ? 'End of Shift' : 'Period Summary' })}
            ${renderCashierSummaryGrid(reports)}
            <section class="transactions-card">
            <header class="transactions-head">
                <h2>Recent Transactions (All Cashiers)</h2>
                <a class="history-link interactive-only" href="${escapeHtml(historyUrl(data))}"><i class="fa-solid fa-clock-rotate-left"></i>View Full Transaction History</a>
            </header>
            ${renderRecent(data.recent_transactions || [], data, { allCashiers: true })}
            </section>
        </section>`;
    printButton.disabled = false;
    page.dataset.selectedText = selectedDateText(data);
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
        if (state.isAdmin && !cashierId) {
            renderCashierControls(data);
            const cashiers = Array.isArray(data.cashiers) ? data.cashiers : [];
            if (!cashiers.length) {
                renderAllCashiersSummary(buildAllCashiersData(data, []));
                return;
            }
            const reports = await Promise.all(cashiers.map((cashier) => {
                const cashierQuery = new URLSearchParams({
                    start_date: state.startDate,
                    end_date: state.endDate,
                    cashier_id: cashier.user_id,
                });
                return request(`cashier/get_cashier_shift_summary.php?${cashierQuery}`, state.controller.signal)
                    .catch(() => null);
            }));
            if (requestId !== state.requestId) return;
            renderAllCashiersSummary(buildAllCashiersData(data, reports.filter(Boolean)));
        } else {
            renderSummary(data);
        }
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
        if (state.isAdmin) cashierSelect.value = cashierId || '';
        loadSummary();
    });
    await loadSummary();
}

if (!window.__cashierShiftSummaryInitialized) {
    window.__cashierShiftSummaryInitialized = true;
    initializeShiftSummary().catch(renderInitializationError);
}
