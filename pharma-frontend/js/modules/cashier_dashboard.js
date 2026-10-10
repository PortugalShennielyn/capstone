import API_BASE_URL from '../config/config.js';

const charts = {};
const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})}`;
const count = (value) => Number(value || 0).toLocaleString('en-PH');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]));

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function updateClock() {
    const now = new Date();
    setText('dashboardDate', now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }));
    setText('topbarDate', now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }));
    setText('topbarClock', now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }));
    const today = localDateKey(now);
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

function dateRangeThisWeek() {
    const today = new Date();
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

function renderCharts(series = {}) {
    const todayData = chartRowsByKey(series.today, 'bucket');
    const hourLabels = Array.from({ length: 24 }, (_, hour) => {
        const suffix = hour < 12 ? 'AM' : 'PM';
        const labelHour = hour % 12 || 12;
        return `${labelHour} ${suffix}`;
    });
    drawChart('salesTodayChart', hourLabels, Array.from({ length: 24 }, (_, hour) => todayData.get(String(hour)) || 0), true);

    const weekDates = dateRangeThisWeek();
    const weekData = chartRowsByKey(series.week, 'bucket');
    drawChart('salesWeekChart', weekDates.map((date) => date.toLocaleDateString('en-PH', { weekday: 'short' })), weekDates.map((date) => weekData.get(localDateKey(date)) || 0));

    const now = new Date();
    const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthDates = Array.from({ length: monthDays }, (_, index) => new Date(now.getFullYear(), now.getMonth(), index + 1));
    const monthData = chartRowsByKey(series.month, 'bucket');
    drawChart('salesMonthChart', monthDates.map((date) => String(date.getDate())), monthDates.map((date) => monthData.get(localDateKey(date)) || 0));
}

function renderActivity(rows = []) {
    const list = document.getElementById('activityList');
    if (!list) return;
    list.innerHTML = rows.length ? rows.map((row) => `
        <div class="activity-item">
            <strong>${escapeHtml(row.description)}</strong>
            <span>${escapeHtml(row.action)} · ${escapeHtml(formatDateTime(row.created_at))}</span>
        </div>
    `).join('') : '<div class="empty-state">No cashier activities yet.</div>';
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
    const response = await fetch(`${API_BASE_URL}/cashier/get_cashier_dashboard.php`, {
        credentials: 'include',
        cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === 'error') {
        throw new Error(payload.message || 'Unable to load cashier dashboard.');
    }
    const data = payload.data || payload;
    renderSummary(data.summary || {});
    renderTransactions(data.recent_transactions || []);
    renderActivity(data.activities || []);
    renderCharts(data.charts || {});
}

function bindNotifications() {
    const button = document.getElementById('dashboardNotifications');
    const popover = document.getElementById('notificationPopover');
    if (!button || !popover) return;
    button.addEventListener('click', () => {
        popover.hidden = !popover.hidden;
        button.setAttribute('aria-expanded', String(!popover.hidden));
    });
    document.addEventListener('click', (event) => {
        if (popover.hidden || event.target.closest('.notification-wrap')) return;
        popover.hidden = true;
        button.setAttribute('aria-expanded', 'false');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    window.setInterval(updateClock, 30000);
    bindNotifications();
    loadDashboard().catch((error) => {
        console.error(error);
        const tbody = document.getElementById('dashboardTransactions');
        if (tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${escapeHtml(error.message || 'Unable to load transactions.')}</td></tr>`;
    });
});