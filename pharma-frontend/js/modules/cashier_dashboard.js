import API_BASE_URL from '../config/config.js?v=2';

const charts = {};
let dashboardRequest = null;
let businessDate = localDateKey(new Date());
const shiftControlBody = document.getElementById('cashierShiftControlBody');
const shiftStatusBadge = document.getElementById('cashierShiftStatus');
const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})}`;
const count = (value) => Number(value || 0).toLocaleString('en-PH');
const openingCashPartialPattern = /^\d*(?:\.\d{0,2})?$/;
const openingCashPattern = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;
const maxOpeningCash = 9999999999.99;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]));

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

function renderWelcome(session) {
    const nameNode = document.getElementById('cashierWelcomeName');
    if (!nameNode || !session) return;

    const fullName = String(session.full_name || '').trim();
    const firstName = String(session.first_name || '').trim();
    const lastName = String(session.last_name || '').trim();
    const displayName = fullName || [firstName, lastName].filter(Boolean).join(' ') || firstName || String(session.username || '').trim();
    if (!displayName) return;

    nameNode.textContent = displayName;
    nameNode.classList.remove('is-loading');
}

async function requestApi(path, options = {}) {
    const token = sessionStorage.getItem('pharma_tab_token') || '';
    const response = await fetch(`${API_BASE_URL}/${path}`, {
        ...options,
        credentials: 'include',
        cache: 'no-store',
        headers: {
            ...(token ? { 'X-Tab-Token': token } : {}),
            ...(options.headers || {}),
        },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === 'error') {
        throw new Error(payload.message || 'Unable to update cashier shift. Please try again.');
    }
    return payload.data || {};
}

async function requestDashboardApi(path) {
    const token = sessionStorage.getItem('pharma_tab_token') || '';
    const response = await fetch(`${API_BASE_URL}/${path}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: token ? { 'X-Tab-Token': token } : {},
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === 'error') {
        throw new Error(payload.message || 'Unable to load cashier dashboard.');
    }
    return payload.data || payload;
}

function shiftStatus(activeShift, latestShift) {
    if (activeShift) return { label: 'Active', className: 'active' };
    if (latestShift?.status === 'closed') return { label: 'Closed', className: 'closed' };
    return { label: 'Not started', className: '' };
}

function renderShiftControl(data) {
    if (!shiftControlBody || !shiftStatusBadge) return;
    const activeShift = data.active_shift || null;
    const latestShift = (Array.isArray(data.shifts) ? data.shifts : [])[0] || null;
    const status = shiftStatus(activeShift, latestShift);
    shiftStatusBadge.textContent = status.label;
    shiftStatusBadge.className = `dashboard-shift-status ${status.className}`.trim();

    if (data.can_manage_shift !== true) {
        shiftControlBody.innerHTML = '<p class="dashboard-shift-note">Shift controls are available to the signed-in cashier.</p>';
        return;
    }

    const latestDetails = latestShift?.status === 'closed' ? `
        <div class="dashboard-shift-details">
            <div><span>Last shift opened</span><strong>${escapeHtml(formatDateTime(latestShift.opened_at))}</strong></div>
            <div><span>Last shift ended</span><strong>${escapeHtml(formatDateTime(latestShift.closed_at))}</strong></div>
            <div><span>Opening cash</span><strong>${money(latestShift.opening_cash)}</strong></div>
        </div>` : '';

    if (activeShift) {
        shiftControlBody.innerHTML = `
            <div class="dashboard-shift-details">
                <div><span>Shift status</span><strong>Active</strong></div>
                <div><span>Opening cash / float</span><strong>${money(activeShift.opening_cash)}</strong></div>
                <div><span>Shift started</span><strong>${escapeHtml(formatDateTime(activeShift.opened_at))}</strong></div>
            </div>
            <form class="dashboard-shift-form" id="cashierEndShiftForm" data-shift-id="${escapeHtml(activeShift.shift_id)}">
                <label>Actual Cash Count (₱)<input name="actual_cash" type="number" min="0" step="0.01" max="9999999999.99" inputmode="decimal" required></label>
                <label>Variance Remarks (optional)<textarea name="variance_remarks" maxlength="500" rows="1" placeholder="Explain any cash shortage or overage"></textarea></label>
                <button class="new-sale-button" type="button" data-end-cashier-shift><i class="fa-solid fa-lock"></i> End Shift</button>
            </form>
            <p class="dashboard-shift-note">Enter the cash drawer count to save reconciliation and close this shift.</p>
            <dialog class="dashboard-shift-confirm" id="endShiftConfirmation" aria-labelledby="endShiftConfirmationTitle">
                <h2 id="endShiftConfirmationTitle">End this cashier shift?</h2>
                <p>This will save the actual cash count and close the active shift. You will need to start a new shift before processing more cashier sales.</p>
                <div class="dashboard-shift-confirm-actions">
                    <button type="button" class="dashboard-shift-cancel" data-cancel-end-shift>Cancel</button>
                    <button type="button" class="new-sale-button" data-confirm-end-shift>Confirm End Shift</button>
                </div>
            </dialog>
            <p class="dashboard-shift-feedback" id="dashboardShiftFeedback" role="status"></p>`;
        const endButton = shiftControlBody.querySelector('[data-end-cashier-shift]');
        endButton?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const form = shiftControlBody.querySelector('#cashierEndShiftForm');
            if (form?.reportValidity()) shiftControlBody.querySelector('#endShiftConfirmation')?.showModal();
        });
        shiftControlBody.querySelector('[data-cancel-end-shift]')?.addEventListener('click', () => {
            shiftControlBody.querySelector('#endShiftConfirmation')?.close();
        });
        shiftControlBody.querySelector('[data-confirm-end-shift]')?.addEventListener('click', () => {
            shiftControlBody.querySelector('#endShiftConfirmation')?.close();
            submitShiftControl(shiftControlBody.querySelector('#cashierEndShiftForm'), 'close');
        });
        return;
    }

    shiftControlBody.innerHTML = `${latestDetails}
        <form class="dashboard-shift-form start-shift-form" id="cashierStartShiftForm">
            <label>Opening Cash / Float (₱)<input name="opening_cash" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" pattern="(?:[0-9]+(?:\\.[0-9]{1,2})?|\\.[0-9]{1,2})" aria-describedby="dashboardShiftFeedback" required></label>
            <button class="new-sale-button" type="submit" disabled><i class="fa-solid fa-play"></i> Start Shift</button>
            <button class="new-sale-button" type="button" disabled><i class="fa-solid fa-lock"></i> End Shift</button>
        </form>
        <p class="dashboard-shift-note">A shift must be active before a cashier can complete a payment.</p>
        <p class="dashboard-shift-feedback" id="dashboardShiftFeedback" role="status"></p>`;
}

async function loadShiftControl(reportDate = businessDate) {
    if (!shiftControlBody) return;
    const query = new URLSearchParams({ start_date: reportDate, end_date: reportDate });
    try {
        const data = await requestApi(`cashier/get_cashier_shift_summary.php?${query}`);
        renderShiftControl(data);
    } catch (error) {
        if (shiftStatusBadge) {
            shiftStatusBadge.textContent = 'Unavailable';
            shiftStatusBadge.className = 'dashboard-shift-status';
        }
        shiftControlBody.innerHTML = `<p class="dashboard-shift-feedback error" role="alert">${escapeHtml(error.message || 'Could not load shift status.')}</p><button class="dashboard-shift-retry" type="button" data-retry-shift-control>Try again</button>`;
    }
}

async function submitShiftControl(form, action) {
    if (!form) return;
    const feedback = document.getElementById('dashboardShiftFeedback');
    const button = form.querySelector('button[type="submit"], [data-end-cashier-shift]');
    if (form.dataset.submitting === 'true') return;
    const openingInput = action === 'start' ? form.elements.namedItem('opening_cash') : null;
    if (openingInput) validateOpeningCash(openingInput, true);
    if (!form.reportValidity()) {
        if (feedback) {
            feedback.classList.add('error');
            feedback.textContent = action === 'start'
                ? 'Enter a valid opening cash amount (up to two decimal places).'
                : 'Enter the actual cash count before ending the shift.';
        }
        return;
    }

    const values = Object.fromEntries(new FormData(form).entries());
    if (action === 'start') values.opening_cash = String(values.opening_cash || '').trim();
    values.action = action;
    if (action === 'close') values.shift_id = form.dataset.shiftId;
    form.dataset.submitting = 'true';
    if (button) button.disabled = true;
    if (feedback) {
        feedback.classList.remove('error');
        feedback.textContent = action === 'start' ? 'Starting shift...' : 'Saving cash count and ending shift...';
    }

    try {
        await requestApi('cashier/manage_cashier_shift.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        });
        await loadShiftControl();
        const result = document.getElementById('dashboardShiftFeedback');
        if (result) result.textContent = action === 'start' ? 'Shift started successfully.' : 'Shift ended and cash reconciliation saved.';
        loadDashboard().catch((error) => console.error(error));
    } catch (error) {
        form.dataset.submitting = 'false';
        if (button) button.disabled = false;
        if (feedback) {
            feedback.classList.add('error');
            feedback.textContent = error.message || 'Unable to update cashier shift.';
        }
    }
}

function openingCashCandidateIsValid(value) {
    if (!openingCashPartialPattern.test(value)) return false;
    if (value === '' || value === '.' || value.endsWith('.')) return true;
    return Number(value) <= maxOpeningCash;
}

function validateOpeningCash(input, showFeedback = false) {
    const value = input.value.trim();
    const valid = openingCashPattern.test(value) && Number(value) <= maxOpeningCash;
    input.setCustomValidity(valid ? '' : 'Enter an amount from ₱0.00 to ₱9,999,999,999.99 with no more than two decimal places.');
    const form = input.closest('#cashierStartShiftForm');
    const button = form?.querySelector('button[type="submit"]');
    if (button) button.disabled = !valid;
    const feedback = document.getElementById('dashboardShiftFeedback');
    if (feedback && showFeedback && !valid) {
        feedback.classList.add('error');
        feedback.textContent = 'Enter a valid opening cash amount (up to two decimal places).';
    } else if (feedback && valid && /opening cash|pasted amount|use digits/i.test(feedback.textContent)) {
        feedback.classList.remove('error');
        feedback.textContent = '';
    }
    return valid;
}

shiftControlBody?.addEventListener('beforeinput', (event) => {
    const input = event.target;
    if (input.name !== 'opening_cash' || event.isComposing || event.inputType?.startsWith('delete')) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const inserted = event.data ?? '';
    if (!openingCashCandidateIsValid(input.value.slice(0, start) + inserted + input.value.slice(end))) {
        event.preventDefault();
        const feedback = document.getElementById('dashboardShiftFeedback');
        if (feedback) {
            feedback.classList.add('error');
            feedback.textContent = 'Use digits and one decimal point, with up to two decimal places.';
        }
    }
});

shiftControlBody?.addEventListener('paste', (event) => {
    const input = event.target;
    if (input.name !== 'opening_cash') return;
    const pasted = event.clipboardData?.getData('text') ?? '';
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const candidate = input.value.slice(0, start) + pasted + input.value.slice(end);
    if (!openingCashCandidateIsValid(candidate)) {
        event.preventDefault();
        const feedback = document.getElementById('dashboardShiftFeedback');
        if (feedback) {
            feedback.classList.add('error');
            feedback.textContent = 'Pasted amount must contain only digits and one decimal point, with up to two decimal places.';
        }
    }
});

shiftControlBody?.addEventListener('input', (event) => {
    if (event.target.name !== 'opening_cash') return;
    const value = event.target.value;
    if (!openingCashCandidateIsValid(value)) {
        event.target.value = event.target.dataset.previousValidValue || '';
    } else {
        event.target.dataset.previousValidValue = value;
    }
    validateOpeningCash(event.target);
});

shiftControlBody?.addEventListener('submit', (event) => {
    if (event.target.id === 'cashierStartShiftForm') {
        event.preventDefault();
        submitShiftControl(event.target, 'start');
    } else if (event.target.id === 'cashierEndShiftForm') {
        event.preventDefault();
        submitShiftControl(event.target, 'close');
    }
});

shiftControlBody?.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-shift-control]')) loadShiftControl();
});

window.addEventListener('pharma:session-ready', (event) => renderWelcome(event.detail));
if (window.__drpSession) renderWelcome(window.__drpSession);
if (window.__drpSessionReadyPromise && typeof window.__drpSessionReadyPromise.then === 'function') {
    window.__drpSessionReadyPromise.then(() => renderWelcome(window.__drpSession)).catch(() => {});
}

function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function updateClock() {
    const now = new Date();
    const today = businessDate || localDateKey(now);
    const query = new URLSearchParams({ start_date: today, end_date: today });
    const reportLink = document.getElementById('salesReportLink');
    if (reportLink) reportLink.href = `cashier_shift_summary.html?${query}`;
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-PH', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
}

function renderTransactions(rows) {
    const tbody = document.getElementById('dashboardTransactions');
    if (!tbody) return;
    if (!rows.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No completed POS transactions yet today.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((row) => {
        const transactionNo = row.receipt_no || row.order_no || row.order_id;
        return `<tr>
            <td class="transaction-number">${escapeHtml(transactionNo)}</td>
            <td>${escapeHtml(row.customer_name || 'Walk-in Customer')}</td>
            <td class="money">${money(row.amount)}</td>
            <td>${escapeHtml(String(row.payment_method || 'cash').replace(/_/g, ' '))}</td>
            <td class="transaction-date">${escapeHtml(formatDateTime(row.completed_at))}</td>
            <td><span class="status-pill status-completed">${escapeHtml(row.status || 'Completed')}</span></td>
            <td class="action-col"><button class="action-link icon-action" type="button" data-view-receipt data-order-id="${escapeHtml(row.order_id)}" title="View receipt" aria-label="View receipt for ${escapeHtml(transactionNo)}"><i class="fa-regular fa-eye"></i></button></td>
        </tr>`;
    }).join('');
}

function dateRangeThisWeek(businessDate) {
    const today = new Date(`${businessDate}T00:00:00`);
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return date;
    });
}

function chartRowsByKey(rows, keyName) {
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.bucket), Number(row.amount || 0)]));
}

function chartOptions(currencyAxis = true) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (context) => `Sales: ${money(context.parsed.y)}` } },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#7c8598', maxRotation: 0 } },
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(148, 163, 184, .2)' },
                ticks: {
                    color: '#7c8598',
                    callback: (value) => currencyAxis ? `₱${Number(value).toLocaleString('en-PH')}` : value,
                },
            },
        },
    };
}

function drawChart(id, labels, values, hourly = false) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    charts[id]?.destroy();
    charts[id] = new window.Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Sales',
                data: values,
                borderColor: '#7146e8',
                backgroundColor: 'rgba(113, 70, 232, .13)',
                borderWidth: 2.5,
                pointRadius: values.length > 14 ? 0 : 3,
                pointHoverRadius: 5,
                pointBackgroundColor: '#7146e8',
                fill: true,
                tension: .34,
            }],
        },
        options: {
            ...chartOptions(),
            scales: {
                ...chartOptions().scales,
                x: {
                    ...chartOptions().scales.x,
                    ticks: hourly ? { ...chartOptions().scales.x.ticks, callback: (_, index) => index % 3 === 0 ? labels[index] : '' } : chartOptions().scales.x.ticks,
                },
            },
        },
    });
}

function renderCharts(series = {}, businessDate = localDateKey(new Date())) {
    const todayData = chartRowsByKey(series.today, 'bucket');
    const hourLabels = Array.from({ length: 24 }, (_, hour) => {
        const suffix = hour < 12 ? 'AM' : 'PM';
        const labelHour = hour % 12 || 12;
        return `${labelHour} ${suffix}`;
    });
    drawChart('salesTodayChart', hourLabels, Array.from({ length: 24 }, (_, hour) => todayData.get(String(hour)) || 0), true);

    const weekDates = dateRangeThisWeek(businessDate);
    const weekData = chartRowsByKey(series.week, 'bucket');
    drawChart('salesWeekChart', weekDates.map((date) => date.toLocaleDateString('en-PH', { weekday: 'short' })), weekDates.map((date) => weekData.get(localDateKey(date)) || 0));

    const now = new Date(`${businessDate}T00:00:00`);
    const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthDates = Array.from({ length: monthDays }, (_, index) => new Date(now.getFullYear(), now.getMonth(), index + 1));
    const monthData = chartRowsByKey(series.month, 'bucket');
    drawChart('salesMonthChart', monthDates.map((date) => String(date.getDate())), monthDates.map((date) => monthData.get(localDateKey(date)) || 0));
}

function renderSummary(summary = {}) {
    const totalSales = money(summary.total_sales_today);
    const transactions = count(summary.completed_today);
    const units = count(summary.units_sold_today);
    const average = money(summary.average_sale_today);
    setText('totalSalesToday', totalSales);
    setText('completedToday', transactions);
    setText('unitsSoldToday', units);
    setText('cashCollectedToday', money(summary.cash_received_today ?? summary.cash_collected_today));
    setText('returnsToday', count(summary.returns_today));
    setText('overviewTotalSales', totalSales);
    setText('averageSaleToday', average);
    setText('overviewTransactions', transactions);
    setText('overviewUnits', units);
    setText('summaryTotalSales', totalSales);
    setText('summaryTransactions', transactions);
    setText('summaryUnits', units);
    setText('summaryAverage', average);
}

async function loadDashboard() {
    if (dashboardRequest) return dashboardRequest;
    dashboardRequest = (async () => {
        const data = await requestDashboardApi('cashier/get_cashier_dashboard.php');
        businessDate = data.business_date || businessDate;
        updateClock();
        renderSummary(data.summary || {});
        renderTransactions(data.recent_transactions || []);
        const dateNode = document.getElementById('salesSummaryDate');
        if (dateNode) dateNode.textContent = `Business date: ${data.business_date || '—'}`;
        renderCharts(data.charts || {}, data.business_date || localDateKey(new Date()));
        const errorNode = document.getElementById('dashboardDataError');
        if (errorNode) errorNode.hidden = true;
        return data;
    })();
    try {
        return await dashboardRequest;
    } finally {
        dashboardRequest = null;
    }
}

function renderDashboardError(error) {
    const message = error.message || 'Unable to load cashier dashboard.';
    ['totalSalesToday', 'cashCollectedToday', 'overviewTotalSales', 'averageSaleToday', 'summaryTotalSales', 'summaryAverage']
        .forEach((id) => setText(id, 'Unavailable'));
    ['completedToday', 'unitsSoldToday', 'overviewTransactions', 'overviewUnits', 'summaryTransactions', 'summaryUnits', 'returnsToday']
        .forEach((id) => setText(id, 'Unavailable'));
    const tbody = document.getElementById('dashboardTransactions');
    if (tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${escapeHtml(message)}</td></tr>`;
    const errorNode = document.getElementById('dashboardDataError');
    if (errorNode) {
        errorNode.hidden = false;
        const messageNode = errorNode.querySelector('[data-dashboard-error-message]');
        if (messageNode) messageNode.textContent = message;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    window.setInterval(updateClock, 30000);
    loadDashboard().catch((error) => {
        console.error(error);
        renderDashboardError(error);
    }).finally(() => loadShiftControl());
    document.getElementById('retryCashierDashboard')?.addEventListener('click', () => {
        loadDashboard().catch((error) => {
            console.error(error);
            renderDashboardError(error);
        });
    });
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            loadDashboard().catch((error) => {
                console.error(error);
                renderDashboardError(error);
            }).finally(() => loadShiftControl());
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            loadDashboard().catch((error) => {
                console.error(error);
                renderDashboardError(error);
            }).finally(() => loadShiftControl());
        }
    });
});
