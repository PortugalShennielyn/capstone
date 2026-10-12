import API_BASE_URL from '../config/config.js?v=2';
import verifySession from './auth.js?v=6';

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
    historyType: 'completed',
    historyPage: 1,
    historySearch: '',
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
    return `₱${Number(value || 0).toLocaleString('en-PH', {
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
    return data?.is_single_day ? 'DAILY SHIFT SUMMARY' : 'CASHIER PERIOD SUMMARY';
}

function shiftStatus(data) {
    if (!data?.is_single_day) return 'Period Summary';
    if (data.selected_end_date < todayIso) return 'Historical Summary';
    return 'Today Summary';
}

function reportFrom(data) {
    return data?.activity?.first_transaction_time || `${data.selected_start_date} 00:00:00`;
}

function reportTo(data) {
    if (data?.activity?.last_transaction_time) return data.activity.last_transaction_time;
    return data?.is_single_day ? `${data.selected_end_date} 23:59:59` : `${data.selected_end_date} 23:59:59`;
}

async function request(path, signal, options = {}) {
    const token = sessionStorage.getItem('pharma_tab_token') || '';
    const { headers: extraHeaders = {}, ...fetchOptions } = options;
    const response = await fetch(`${API_BASE_URL}/${path}`, {
        ...fetchOptions,
        credentials: 'include',
        cache: 'no-store',
        signal,
        headers: { ...(token ? { 'X-Tab-Token': token } : {}), ...extraHeaders },
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

function renderPaymentBreakdown(data) {
    const summary = data.summary || {};
    return `<div class="cash-payment-summary">
        <div><span>Total Cash Sales</span><strong>${escapeHtml(currency(summary.cash_paid_sales))}</strong></div>
        <div><span>Total GCash Sales</span><strong>${escapeHtml(currency(summary.gcash_paid_sales))}</strong></div>
        <div><span>Total Payments Collected</span><strong>${escapeHtml(currency(summary.total_payments_collected))}</strong></div>
    </div>`;
}

function renderKpiCards(data) {
    const summary = data.summary || {};
    const sales = data.sales_breakdown || {};
    const reconciliation = data.reconciliation || {};
    const netCash = Number(summary.net_cash_collected ?? summary.cash_paid_sales ?? 0);
    const variance = reconciliation.cash_variance;
    return `<section class="shift-kpi-grid" aria-label="Shift totals">
        ${kpi('fa-receipt', 'Completed Transactions', number(summary.completed_transactions))}
        ${kpi('fa-peso-sign', 'Gross Sales', currency(sales.gross_completed_sales))}
        ${kpi('fa-percent', 'Total Discounts', currency(sales.discounts))}
        ${kpi('fa-arrow-rotate-left', 'Total Refunds', currency(sales.refunds))}
        ${kpi('fa-tag', 'Net Sales', currency(sales.net_completed_sales))}
        ${kpi('fa-money-bill-wave', 'Total Cash Collected', currency(netCash))}
        ${kpi('fa-scale-balanced', 'Cash Variance', variance === null || variance === undefined ? 'Not counted' : currency(variance), variance === null || variance === undefined ? 'Save a cash count to reconcile' : Number(variance) < 0 ? 'Cash shortage' : Number(variance) > 0 ? 'Cash overage' : 'Cash matches')}
    </section>`;
}

function renderCashReconciliation(data) {
    const recon = data.reconciliation || {};
    if (!data.is_single_day) return `<section class="report-card reconciliation-card"><h2 class="card-heading"><i class="fa-solid fa-coins"></i> Cash Reconciliation</h2><p class="muted-copy">Cash counts are recorded per day. Select one date to view or save a reconciliation.</p></section>`;
    const variance = recon.cash_variance;
    const varianceLabel = variance === null || variance === undefined ? 'Not counted' : Number(variance) < 0 ? `Short ${currency(Math.abs(Number(variance)))}` : Number(variance) > 0 ? `Over ${currency(variance)}` : 'Cash matches';
    const varianceClass = variance === null || variance === undefined ? 'pending' : Number(variance) < 0 ? 'variance' : Number(variance) > 0 ? 'overage' : 'completed';
    return `<section class="report-card reconciliation-card">
        <header class="section-title"><h2><i class="fa-solid fa-coins"></i> Cash Reconciliation</h2><span class="status-pill ${varianceClass}">${escapeHtml(varianceLabel)}</span></header>
        <div class="reconciliation-lines">
            <div><span>Beginning Cash / Opening Float</span><strong>${escapeHtml(recon.beginning_cash == null ? 'Not recorded' : currency(recon.beginning_cash))}</strong></div>
            <div><span>Total Cash Sales</span><strong>${escapeHtml(currency(recon.cash_sales))}</strong></div>
            <div><span>Cash In</span><strong>${recon.cash_in_supported ? escapeHtml(currency(recon.cash_in)) : 'Not tracked'}</strong></div>
            <div><span>Cash Out</span><strong>${recon.cash_out_supported ? escapeHtml(currency(recon.cash_out)) : 'Not tracked'}</strong></div>
            <div><span>Cash Refunds Paid</span><strong>${escapeHtml(currency(recon.cash_refunds_paid))}</strong></div>
            <div class="expected"><span>Expected Cash</span><strong>${escapeHtml(recon.expected_cash == null ? 'Enter opening float' : currency(recon.expected_cash))}</strong></div>
            <div><span>Actual Cash Count</span><strong>${escapeHtml(recon.actual_cash == null ? 'Not counted' : currency(recon.actual_cash))}</strong></div>
            <div class="variance"><span>Cash Variance</span><strong>${escapeHtml(variance == null ? 'Not counted' : currency(variance))}</strong></div>
        </div>
        <p class="muted-copy">${escapeHtml(recon.updated_at ? `Last saved ${formatDateTime(recon.updated_at)}.` : 'Cash counts for tracked shifts are recorded when the cashier ends the shift from the dashboard.')}</p>
    </section>`;
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
    const allCashiers = options.allCashiers === true;
    return `
        <div class="table-scroll">
            <table class="shift-table${allCashiers ? ' all-cashiers-table' : ''}">
                <thead><tr>${allCashiers ? '<th class="index-cell">#</th>' : ''}<th>Date / Time</th><th>Receipt / Transaction No.</th><th>Cashier</th><th>Items</th><th class="money-cell">Gross</th><th class="money-cell">Discount</th><th class="money-cell">Refund</th><th class="money-cell">Net</th><th>Payment</th><th class="status-cell">Status</th><th class="action-cell">Details</th></tr></thead>
                <tbody>${rows.slice(0, allCashiers ? 10 : rows.length).map((row, index) => `
                    <tr>
                        ${allCashiers ? `<td class="index-cell">${index + 1}</td>` : ''}
                        <td>${escapeHtml(formatDateTime(row.completed_at))}</td>
                        <td class="receipt-cell" title="${escapeHtml(row.receipt_no || row.order_no)}">${escapeHtml(row.receipt_no || row.order_no || '-')}</td>
                        <td>${escapeHtml(row.cashier_name || data.cashier_name || 'Cashier')}</td>
                        <td>${escapeHtml(number(row.item_count || 0))}</td>
                        <td class="money-cell">${escapeHtml(currency(row.gross_amount ?? row.total_amount))}</td>
                        <td class="money-cell">${escapeHtml(currency(row.discount_amount))}</td>
                        <td class="money-cell">${escapeHtml(currency(row.refund_amount))}</td>
                        <td class="money-cell">${escapeHtml(currency(row.net_amount ?? row.total_amount))}</td>
                        <td>${escapeHtml(methodLabel(row.payment_method))}</td>
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
            <div class="detail-row"><span>Cashier</span><strong>${escapeHtml(data.cashier_name)}</strong></div>
            <div class="detail-row"><span>First Transaction</span><strong>${escapeHtml(formatDateTime(data.activity?.first_transaction_time))}</strong></div>
            <div class="detail-row"><span>Last Transaction</span><strong>${escapeHtml(formatDateTime(data.activity?.last_transaction_time))}</strong></div>
            <div class="detail-row"><span>Selected Period</span><strong>${escapeHtml(displayPeriod(data.selected_start_date, data.selected_end_date, true))}</strong></div>
            <div class="detail-row"><span>Shift Status</span><strong>${escapeHtml(shiftStatus(data))}</strong></div>
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
                    const shifts = Array.isArray(report.shifts) ? report.shifts : [];
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
                            ${shifts.length ? `<div class="cashier-shift-mini-list">${shifts.map((shift) => `
                                <div class="cashier-shift-mini">
                                    <strong>Shift #${escapeHtml(number(shift.shift_id))} · ${escapeHtml(shift.status === 'closed' ? 'Closed' : 'Open')}</strong>
                                    <span>${escapeHtml(formatDateTime(shift.opened_at))} – ${escapeHtml(shift.closed_at ? formatDateTime(shift.closed_at) : 'In progress')}</span>
                                    <span>Payments ${escapeHtml(currency(shift.total_payments_collected))}${shift.cash_variance === null ? '' : ` · Cash variance ${escapeHtml(currency(shift.cash_variance))}`}</span>
                                </div>`).join('')}</div>` : ''}
                        </article>`;
                }).join('')}
            </div>
        </section>`;
}

function renderPrintReport(data, generated, title = 'SHIFT SUMMARY') {
    const summary = data.summary || {};
    const sales = data.sales_breakdown || {};
    const reconciliation = data.reconciliation || {};
    const activeShift = data.active_shift || null;
    const shifts = Array.isArray(data.shifts) ? data.shifts : [];
    const displayedShift = activeShift || shifts[0] || null;
    const status = activeShift ? 'Active' : displayedShift?.status === 'closed' ? 'Closed' : 'No shift recorded';
    const reconStatus = reconciliation.cash_variance == null
        ? 'Pending'
        : Number(reconciliation.cash_variance) < 0 ? 'Cash Shortage'
            : Number(reconciliation.cash_variance) > 0 ? 'Cash Overage' : 'Balanced';
    const dateLabel = displayPeriod(data.selected_start_date, data.selected_end_date);
    const printedShifts = shifts.map((shift) => `
        <article class="print-shift-card">
            <h4>Shift #${escapeHtml(number(shift.shift_id))} · ${escapeHtml(shift.status === 'closed' ? 'Closed' : 'Active')}</h4>
            <div class="print-lines">
                <div><span>Cashier</span><strong>${escapeHtml(shift.cashier_name || data.cashier_name || 'Cashier')}</strong></div>
                <div><span>Shift Start</span><strong>${escapeHtml(formatDateTime(shift.opened_at))}</strong></div>
                <div><span>Shift End</span><strong>${escapeHtml(shift.closed_at ? formatDateTime(shift.closed_at) : 'In progress')}</strong></div>
                <div><span>Duration</span><strong>${escapeHtml(shift.closed_at ? duration(shift.opened_at, shift.closed_at) : 'In progress')}</strong></div>
                <div><span>Completed Transactions</span><strong>${escapeHtml(number(shift.completed_transactions))}</strong></div>
                <div><span>Opening Cash</span><strong>${escapeHtml(currency(shift.opening_cash))}</strong></div>
                <div><span>Cash Sales</span><strong>${escapeHtml(currency(shift.cash_paid_sales))}</strong></div>
                <div><span>GCash Sales</span><strong>${escapeHtml(currency(shift.gcash_paid_sales))}</strong></div>
                <div><span>Payments Collected</span><strong>${escapeHtml(currency(shift.total_payments_collected))}</strong></div>
                <div><span>Expected Cash</span><strong>${escapeHtml(shift.expected_cash == null ? 'Not available' : currency(shift.expected_cash))}</strong></div>
                <div><span>Actual Cash Count</span><strong>${escapeHtml(shift.actual_cash == null ? 'Not counted' : currency(shift.actual_cash))}</strong></div>
                <div><span>Cash Variance</span><strong>${escapeHtml(shift.cash_variance == null ? 'Not counted' : currency(shift.cash_variance))}</strong></div>
                ${shift.variance_remarks ? `<div><span>Variance Remarks</span><strong>${escapeHtml(shift.variance_remarks)}</strong></div>` : ''}
            </div>
        </article>`).join('');
    return `
        <section class="print-receipt-report">
            <h1>${escapeHtml(data.pharmacy?.name || 'Dr. R Pharmacy')}</h1>
            <h2>${escapeHtml(title)}</h2>
            <div class="print-meta">
                <div><span>Report Type</span><strong>${escapeHtml(reportKind(data))}</strong></div>
                <div><span>From</span><strong>${escapeHtml(formatDateTime(reportFrom(data)))}</strong></div>
                <div><span>To</span><strong>${escapeHtml(formatDateTime(reportTo(data)))}</strong></div>
                <div><span>Cashier</span><strong>${escapeHtml(data.cashier_name || (data.all_cashiers ? 'All Cashiers' : 'Cashier'))}</strong></div>
                <div><span>Selected Date</span><strong>${escapeHtml(dateLabel)}</strong></div>
                <div><span>Status</span><strong>${escapeHtml(shiftStatus(data))}</strong></div>
                <div><span>Printed</span><strong>${escapeHtml(generated)}</strong></div>
            </div>
            <section class="print-section">
            <h3>SALES</h3>
            <div class="print-lines">
                <div><span>Gross Sales</span><strong>${escapeHtml(currency(sales.gross_completed_sales))}</strong></div>
                <div><span>Discounts</span><strong>-${escapeHtml(currency(sales.discounts))}</strong></div>
                <div><span>Refunds</span><strong>-${escapeHtml(currency(sales.refunds))}</strong></div>
                <div class="total"><span>Net Sales</span><strong>${escapeHtml(currency(sales.net_completed_sales))}</strong></div>
            </div>
            </section>
            <section class="print-section">
            <h3>TENDER / PAYMENT BREAKDOWN</h3>
            <div class="print-lines">
                <div><span>Total Cash Sales</span><strong>${escapeHtml(currency(summary.cash_paid_sales))}</strong></div>
                <div><span>Total GCash Sales</span><strong>${escapeHtml(currency(summary.gcash_paid_sales))}</strong></div>
                <div><span>Cash Refunds</span><strong>-${escapeHtml(currency(summary.cash_refunds))}</strong></div>
                <div><span>GCash Refunds</span><strong>-${escapeHtml(currency(summary.gcash_refunds))}</strong></div>
                <div><span>Total Cash Collected</span><strong>${escapeHtml(currency(summary.net_cash_collected))}</strong></div>
                <div><span>Total GCash Collected</span><strong>${escapeHtml(currency(summary.net_gcash_collected))}</strong></div>
                <div class="total"><span>Total Payments Collected</span><strong>${escapeHtml(currency(summary.total_payments_collected))}</strong></div>
            </div>
            </section>
            <section class="print-section">
            <h3>CASH RECONCILIATION</h3>
            <div class="print-lines">
                <div><span>Beginning Cash / Opening Float</span><strong>${escapeHtml(reconciliation.beginning_cash == null ? 'Not recorded' : currency(reconciliation.beginning_cash))}</strong></div>
                <div><span>Total Cash Sales</span><strong>${escapeHtml(currency(reconciliation.cash_sales))}</strong></div>
                <div><span>Cash In</span><strong>${reconciliation.cash_in_supported ? escapeHtml(currency(reconciliation.cash_in)) : 'Not tracked'}</strong></div>
                <div><span>Cash Out</span><strong>${reconciliation.cash_out_supported ? escapeHtml(currency(reconciliation.cash_out)) : 'Not tracked'}</strong></div>
                <div><span>Cash Refunds Paid</span><strong>${escapeHtml(currency(reconciliation.cash_refunds_paid))}</strong></div>
                <div><span>Expected Cash</span><strong>${escapeHtml(reconciliation.expected_cash == null ? 'Not available' : currency(reconciliation.expected_cash))}</strong></div>
                <div><span>Actual Cash Count</span><strong>${escapeHtml(reconciliation.actual_cash == null ? 'Not counted' : currency(reconciliation.actual_cash))}</strong></div>
                <div><span>Cash Variance</span><strong>${escapeHtml(reconciliation.cash_variance == null ? 'Not counted' : currency(reconciliation.cash_variance))}</strong></div>
                <div><span>Variance Remarks</span><strong>${escapeHtml(reconciliation.variance_remarks || '—')}</strong></div>
            </div>
            </section>
            <section class="print-section">
            <h3>TRANSACTIONS</h3>
            <div class="print-lines">
                <div><span>Completed</span><strong>${escapeHtml(number(summary.completed_transactions))}</strong></div>
                <div><span>Voided</span><strong>${escapeHtml(number(summary.cancelled_voided_transactions))}</strong></div>
                <div><span>Refunded</span><strong>${escapeHtml(number(summary.refunded_transactions))}</strong></div>
            </div>
            </section>
            <section class="print-section">
            <h3>SHIFT INFORMATION</h3>
            <div class="print-lines">
                <div><span>Cashier Name</span><strong>${escapeHtml(data.cashier_name || 'Cashier')}</strong></div>
                <div><span>Shift Start</span><strong>${escapeHtml(displayedShift?.opened_at ? formatDateTime(displayedShift.opened_at) : '—')}</strong></div>
                <div><span>Shift End</span><strong>${escapeHtml(displayedShift?.closed_at ? formatDateTime(displayedShift.closed_at) : activeShift ? 'In progress' : '—')}</strong></div>
                <div><span>Shift Status</span><strong>${escapeHtml(data.all_cashiers ? 'Aggregate report' : status)}</strong></div>
                <div><span>Beginning Cash / Opening Float</span><strong>${escapeHtml(displayedShift ? currency(displayedShift.opening_cash) : reconciliation.beginning_cash == null ? 'Not recorded' : currency(reconciliation.beginning_cash))}</strong></div>
                <div><span>Completed Transactions</span><strong>${escapeHtml(number(summary.completed_transactions))}</strong></div>
                <div><span>Total Cash Sales</span><strong>${escapeHtml(currency(summary.cash_paid_sales))}</strong></div>
                <div><span>Cash Reconciliation Status</span><strong>${escapeHtml(data.all_cashiers ? 'Per cashier' : reconStatus)}</strong></div>
            </div>
            </section>
            <section class="print-tracked-section">
                <h3>TRACKED SHIFTS</h3>
                ${printedShifts ? `<div class="print-shift-list">${printedShifts}</div>` : '<p class="print-empty">No tracked shifts were found for the selected report date.</p>'}
            </section>
        </section>`;
}

function printShiftSummary() {
    if (!state.lastData || page.getAttribute('aria-busy') === 'true') return;

    const printedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const reports = state.lastData.all_cashiers
        ? [
            renderPrintReport(state.lastData, printedAt, 'ALL CASHIERS SHIFT SUMMARY'),
            ...(state.lastData.cashier_reports || []).map((report) => renderPrintReport(report, printedAt)),
        ]
        : [renderPrintReport(state.lastData, printedAt)];
    const template = document.createElement('template');
    template.innerHTML = reports.join('').trim();
    const refreshedReports = Array.from(template.content.children);
    const currentReports = Array.from(page.querySelectorAll('.print-receipt-report'));

    currentReports.forEach((report, index) => {
        const refreshedReport = refreshedReports[index];
        if (refreshedReport) report.replaceWith(refreshedReport);
        else report.remove();
    });
    if (!currentReports.length && refreshedReports.length) {
        page.prepend(...refreshedReports);
    } else if (refreshedReports.length > currentReports.length) {
        page.prepend(...refreshedReports.slice(currentReports.length));
    }

    window.print();
}

function renderSummaryReport(data, options = {}) {
    const summary = data.summary || {};
    const recon = data.reconciliation || {};
    const activeShift = data.active_shift;
    const latestShift = (data.shifts || [])[0] || null;
    const displayedShift = activeShift || latestShift;
    const variance = recon.cash_variance;
    const reconLabel = variance == null ? 'Pending' : Number(variance) < 0 ? 'Cash Shortage' : Number(variance) > 0 ? 'Cash Overage' : 'Balanced';
    const reconClass = variance == null ? 'pending' : Number(variance) === 0 ? 'completed' : 'variance';
    const beginningCash = data.all_cashiers
        ? 'Per-cashier records'
        : displayedShift
            ? currency(displayedShift.opening_cash)
            : recon.beginning_cash == null ? 'Not recorded' : currency(recon.beginning_cash);
    const shiftState = activeShift ? 'Active' : displayedShift?.status === 'closed' ? 'Closed' : 'No shift recorded';
    const shiftEnded = activeShift ? 'In progress' : displayedShift?.closed_at ? formatDateTime(displayedShift.closed_at) : '—';
    const activityWindow = `Recorded transaction activity: ${formatDateTime(data.activity?.first_transaction_time)} – ${formatDateTime(data.activity?.last_transaction_time)}.`;
    return `
        <section class="report-card shift-info-card">
            <header class="shift-info-heading"><h2><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i> Shift Information</h2></header>
            <div class="shift-info-grid">
                <div class="shift-info-column">
                    <div class="shift-info-row"><span>Cashier Name</span><strong>${escapeHtml(data.cashier_name || options.eyebrow || 'Cashier')}</strong></div>
                    <div class="shift-info-row"><span>Shift Start</span><strong>${escapeHtml(displayedShift?.opened_at ? formatDateTime(displayedShift.opened_at) : '—')}</strong></div>
                    <div class="shift-info-row"><span>Shift End</span><strong>${escapeHtml(shiftEnded)}</strong></div>
                    <div class="shift-info-row"><span>Shift Status</span><strong>${escapeHtml(data.all_cashiers ? 'Aggregate report' : shiftState)}</strong></div>
                    <div class="shift-info-row"><span>Beginning Cash</span><strong>${escapeHtml(beginningCash)}</strong></div>
                </div>
                <div class="shift-info-column">
                    <div class="shift-info-row"><span>Completed Transactions</span><strong>${escapeHtml(number(summary.completed_transactions))}</strong></div>
                    <div class="shift-info-row"><span>Total Cash Sales</span><strong>${escapeHtml(currency(summary.cash_paid_sales))}</strong></div>
                    <div class="shift-info-row"><span>Cash Reconciliation Status</span><strong><span class="status-pill ${reconClass}">${escapeHtml(data.all_cashiers ? 'Per cashier' : reconLabel)}</span></strong></div>
                </div>
            </div>
            <p class="shift-info-note">${escapeHtml(activityWindow)} ${escapeHtml(data.all_cashiers ? 'Activity is aggregated across cashiers.' : 'New cashier transactions require an active tracked shift. Older transactions remain in date-based summaries.')}</p>
        </section>`;
}

function renderTrackedShifts(data) {
    const shifts = Array.isArray(data.shifts) ? data.shifts : [];
    if (!shifts.length) return '';
    return `<section class="report-card tracked-shifts-card">
        <header class="section-title"><h2><i class="fa-solid fa-clock-rotate-left"></i> Tracked Shifts</h2><span class="status-pill report-status">${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'}</span></header>
        <div class="tracked-shift-list">${shifts.map((shift) => `
            <article class="tracked-shift">
                <div class="tracked-shift-heading"><strong>Shift #${escapeHtml(number(shift.shift_id))}</strong><span class="status-pill ${shift.status === 'closed' ? 'completed' : 'pending'}">${escapeHtml(shift.status === 'closed' ? 'Closed' : 'Active')}</span></div>
                <div class="tracked-shift-times"><span>Started ${escapeHtml(formatDateTime(shift.opened_at))}</span><span>Ended ${escapeHtml(shift.closed_at ? formatDateTime(shift.closed_at) : 'In progress')}</span><span>Duration ${escapeHtml(shift.closed_at ? duration(shift.opened_at, shift.closed_at) : 'In progress')}</span></div>
                <div class="tracked-shift-totals">
                    <div><span>Transactions</span><strong>${escapeHtml(number(shift.completed_transactions))}</strong></div>
                    <div><span>Opening Cash</span><strong>${escapeHtml(currency(shift.opening_cash))}</strong></div>
                    <div><span>Cash Sales</span><strong>${escapeHtml(currency(shift.cash_paid_sales))}</strong></div>
                    <div><span>GCash Sales</span><strong>${escapeHtml(currency(shift.gcash_paid_sales))}</strong></div>
                    <div><span>Payments Collected</span><strong>${escapeHtml(currency(shift.total_payments_collected))}</strong></div>
                    <div><span>Expected Cash</span><strong>${escapeHtml(shift.expected_cash == null ? 'Not closed' : currency(shift.expected_cash))}</strong></div>
                    <div><span>Actual Cash</span><strong>${escapeHtml(shift.actual_cash == null ? 'Not counted' : currency(shift.actual_cash))}</strong></div>
                    <div><span>Cash Variance</span><strong>${escapeHtml(shift.cash_variance == null ? 'Not counted' : currency(shift.cash_variance))}</strong></div>
                </div>
                ${shift.variance_remarks ? `<p class="tracked-shift-remarks">${escapeHtml(shift.variance_remarks)}</p>` : ''}
            </article>`).join('')}</div>
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
        ${renderKpiCards(data)}
        <div class="shift-content-grid">
        <div class="shift-main-column">
        ${renderSummaryReport(data)}
        </div>
        <aside class="shift-side-column">
            ${renderCashReconciliation(data)}
        </aside>
        </div>
        <div class="shift-wide-sections">
        ${renderTrackedShifts(data)}
        <section class="report-card payment-summary-card"><header class="section-title"><h2><i class="fa-solid fa-wallet"></i> Transaction Summary</h2><span class="status-pill report-status">Cash &amp; GCash</span></header>${renderPaymentBreakdown(data)}</section>
        <section class="report-card transactions-card">
            <header class="transactions-head">
                <h2>${escapeHtml(recentTitle)}</h2>
                <a class="history-link interactive-only" href="${escapeHtml(historyUrl(data))}"><i class="fa-solid fa-clock-rotate-left"></i>View Full Transaction History</a>
            </header>
            <nav class="history-tabs interactive-only" aria-label="Shift transaction history">
                <button type="button" class="history-tab active" data-history-tab="completed">Recent Transactions</button>
                <button type="button" class="history-tab" data-history-tab="refunds">Refunds</button>
                <button type="button" class="history-tab" data-history-tab="cancelled">Voids &amp; Cancelled</button>
            </nav>
            <form class="history-search interactive-only" id="shiftHistorySearch"><label for="shiftHistoryQuery">Search history</label><input id="shiftHistoryQuery" type="search" value="${escapeHtml(state.historySearch)}" placeholder="Search receipt, cashier, reason, or transaction"><button type="submit">Search</button></form>
            <div id="shiftHistoryContent">${renderRecent(data.recent_transactions || [], data)}</div>
        </section>
        </div>
        ${data.has_records ? '' : `<p class="activity-empty">${escapeHtml('No completed transactions were found for the selected cashier and date range.')}</p>`}`;

    printButton.disabled = false;
    page.dataset.selectedText = selectedText;
}

function renderHistoryRows(type, rows, pagination = {}) {
    if (!rows.length) {
        const empty = type === 'refunds' ? 'No refund records were found.' : type === 'cancelled' ? 'No cancelled transactions were found.' : 'No completed transactions were found.';
        return `<div class="state-card"><div><strong>${escapeHtml(empty)}</strong><span>Try another search or date range.</span></div></div>`;
    }
    const body = rows.map((row) => {
        const isRefund = type === 'refunds';
        const isCancelled = type === 'cancelled';
        const when = isRefund ? row.recorded_at : isCancelled ? row.cancelled_at : row.completed_at;
        const reference = row.receipt_no || row.order_no || '-';
        const amount = isRefund ? row.refund_amount : row.total_amount;
        const actor = isCancelled ? (row.cancelled_by_name || row.cashier_name || 'Unknown') : (row.cashier_name || 'Cashier');
        const reason = isRefund ? (row.refund_reason || 'Not recorded') : isCancelled ? (row.cancellation_reason || 'Not recorded') : '—';
        const status = isRefund ? 'Refunded' : isCancelled ? String(row.status || 'Cancelled') : String(row.status || 'Completed');
        const date = formatDateTime(when);
        if (!isRefund && !isCancelled) {
            return `<tr><td>${escapeHtml(date)}</td><td class="receipt-cell">${escapeHtml(reference)}</td><td>${escapeHtml(actor)}</td><td>${escapeHtml(number(row.item_count || 0))}</td><td class="money-cell">${escapeHtml(currency(row.gross_amount ?? row.total_amount))}</td><td class="money-cell">${escapeHtml(currency(row.discount_amount))}</td><td class="money-cell">${escapeHtml(currency(row.refund_amount))}</td><td class="money-cell">${escapeHtml(currency(Number(row.final_amount ?? row.total_amount ?? 0) - Number(row.refund_amount || 0)))}</td><td>${escapeHtml(methodLabel(row.payment_method))}</td><td><span class="status-pill completed">${escapeHtml(status)}</span></td><td class="action-cell"><button class="view-button interactive-only" type="button" data-view-transaction="${escapeHtml(row.order_id)}" aria-label="View ${escapeHtml(reference)}"><i class="fa-regular fa-eye"></i></button></td></tr>`;
        }
        return `<tr><td>${escapeHtml(date)}</td><td class="receipt-cell">${escapeHtml(reference)}</td><td>${escapeHtml(actor)}</td>${isRefund ? `<td>${escapeHtml(methodLabel(row.payment_method))}</td>` : ''}<td class="money-cell">${escapeHtml(currency(amount))}</td><td>${escapeHtml(reason)}</td><td><span class="status-pill ${isCancelled ? 'variance' : 'completed'}">${escapeHtml(status)}</span></td><td class="action-cell"><button class="view-button interactive-only" type="button" data-view-transaction="${escapeHtml(row.order_id)}" aria-label="View ${escapeHtml(reference)}"><i class="fa-regular fa-eye"></i></button></td></tr>`;
    }).join('');
    const pageNumber = Number(pagination.page || 1);
    const totalPages = Math.max(1, Math.ceil(Number(pagination.total || rows.length) / Number(pagination.per_page || 10)));
    const refundNote = type === 'refunds' ? '<p class="muted-copy history-data-note">Refund processing time and reason are not stored in the current payment records; the displayed date is the original payment timestamp. Cash and GCash refunds are separated.</p>' : '';
    const headings = type === 'completed'
        ? '<th>Date &amp; Time</th><th>Receipt / Transaction</th><th>Cashier</th><th>Items</th><th class="money-cell">Gross</th><th class="money-cell">Discount</th><th class="money-cell">Refund</th><th class="money-cell">Net</th><th>Payment</th><th>Status</th><th>Details</th>'
        : type === 'refunds'
            ? '<th>Date &amp; Time</th><th>Receipt / Transaction</th><th>Cashier</th><th>Method</th><th class="money-cell">Amount</th><th>Reason</th><th>Status</th><th>Details</th>'
            : '<th>Date &amp; Time</th><th>Receipt / Transaction</th><th>Cashier</th><th class="money-cell">Amount</th><th>Reason</th><th>Status</th><th>Details</th>';
    return `${refundNote}<div class="table-scroll"><table class="shift-table history-table"><thead><tr>${headings}</tr></thead><tbody>${body}</tbody></table></div><footer class="history-pagination"><span>${escapeHtml(number(pagination.total ?? rows.length))} records · Page ${pageNumber} of ${totalPages}</span><div><button type="button" data-history-page="${Math.max(1, pageNumber - 1)}" ${pageNumber <= 1 ? 'disabled' : ''}>Previous</button><button type="button" data-history-page="${Math.min(totalPages, pageNumber + 1)}" ${pageNumber >= totalPages ? 'disabled' : ''}>Next</button></div></footer>`;
}

async function loadHistory(type = state.historyType, pageNumber = 1) {
    state.historyType = type;
    state.historyPage = pageNumber;
    document.querySelectorAll('[data-history-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.historyTab === type));
    const content = document.getElementById('shiftHistoryContent');
    if (!content) return;
    content.innerHTML = '<div class="loading-card"><span class="spinner-border spinner-border-sm"></span><span>Loading transaction history...</span></div>';
    const query = new URLSearchParams({
        type,
        date_start: state.startDate,
        date_end: state.endDate,
        search: state.historySearch,
        page: String(pageNumber),
        per_page: '10',
    });
    const selectedCashier = cashierSelect.value || state.requestedCashierId;
    if (state.isAdmin && selectedCashier) query.set('cashier_id', selectedCashier);
    try {
        const response = await request(`cashier/get_cashier_report.php?${query}`);
        content.innerHTML = renderHistoryRows(type, response.rows || [], response.pagination || {});
    } catch (error) {
        content.innerHTML = `<div class="state-card is-error"><div><strong>Unable to load transaction history</strong><span>${escapeHtml(error.message || 'Please try again.')}</span></div></div>`;
    }
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
    const activeReports = reports.filter((report) => report?.has_records || report?.active_shift || report?.shifts?.length);
    const paymentBreakdown = aggregatePaymentBreakdown(activeReports);
    const completedTransactions = sumValues(activeReports, 'summary.completed_transactions');
    const grossSales = sumValues(activeReports, 'sales_breakdown.gross_completed_sales');
    const netSales = sumValues(activeReports, 'sales_breakdown.net_completed_sales');
    const cashTendered = sumValues(activeReports, 'summary.cash_tendered');
    const changeGiven = sumValues(activeReports, 'summary.change_given');
    const cashPaidSales = sumValues(activeReports, 'summary.cash_paid_sales');
    const gcashPaidSales = sumValues(activeReports, 'summary.gcash_paid_sales');
    const cashRefunds = sumValues(activeReports, 'summary.cash_refunds');
    const gcashRefunds = sumValues(activeReports, 'summary.gcash_refunds');
    const netCashSales = cashPaidSales - cashRefunds;
    const netGcashSales = gcashPaidSales - gcashRefunds;
    return {
        ...base,
        selected_cashier_id: '',
        cashier_name: 'All Cashiers',
        all_cashiers: true,
        cashier_reports: activeReports,
        has_records: activeReports.some((report) => report?.has_records),
        summary: {
            total_completed_sales: netSales,
            cash_tendered: cashTendered,
            change_given: changeGiven,
            net_cash_sales: netCashSales,
            cash_paid_sales: cashPaidSales,
            gcash_paid_sales: gcashPaidSales,
            cash_refunds: cashRefunds,
            gcash_refunds: gcashRefunds,
            net_cash_collected: netCashSales,
            net_gcash_collected: netGcashSales,
            total_payments_collected: netCashSales + netGcashSales,
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
        ${renderPrintReport({ ...data, cashier_name: 'All Cashiers', include_recent_print: true }, generated, 'ALL CASHIERS SHIFT SUMMARY')}
        ${reports.map((report) => renderPrintReport(report, generated)).join('')}
        ${renderKpiCards(data)}
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
    const historyTab = event.target.closest('[data-history-tab]');
    if (historyTab) loadHistory(historyTab.dataset.historyTab, 1);
    const historyPage = event.target.closest('[data-history-page]');
    if (historyPage && !historyPage.disabled) loadHistory(state.historyType, Number(historyPage.dataset.historyPage));
    const viewButton = event.target.closest('[data-view-transaction]');
    if (viewButton) openTransactionDetail(viewButton.dataset.viewTransaction);
    if (event.target.closest('[data-retry-summary]')) loadSummary();
}

function handlePageSubmit(event) {
    if (event.target.id === 'shiftHistorySearch') {
        event.preventDefault();
        state.historySearch = document.getElementById('shiftHistoryQuery')?.value.trim() || '';
        loadHistory(state.historyType, 1);
    }
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
    printButton.addEventListener('click', printShiftSummary);
    page.addEventListener('click', handlePageClick);
    page.addEventListener('submit', handlePageSubmit);
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
