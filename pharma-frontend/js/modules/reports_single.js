import API_BASE_URL from '../config/config.js';

const SECTIONS = [
    { key: 'sales',     label: 'Sales Transactions',   icon: 'fa-receipt',        priority: 1 },
    { key: 'inventory', label: 'Inventory Stock',      icon: 'fa-boxes-stacked',  priority: 2 },
    { key: 'expiry',    label: 'Expiry Risk',          icon: 'fa-calendar-xmark', priority: 3 },
    { key: 'products',  label: 'Product Performance',  icon: 'fa-cube',           priority: 4 },
    { key: 'purchases', label: 'Purchases',            icon: 'fa-truck-ramp-box', priority: 5 },
    { key: 'staff',     label: 'Staff Performance',    icon: 'fa-users',          priority: 6 },
];

const chartTones = {
    purple: '#7c3aed', blue: '#2563eb', teal: '#0f9f92',
    indigo: '#4f46e5', green: '#16a34a', amber: '#d97706',
    red: '#dc2626', gray: '#64748b',
    sales: '#2563eb', inventory: '#0f9f92', purchases: '#4f46e5', expiry: '#dc2626',
};

const statusColors = {
    Healthy: '#16a34a', Completed: '#16a34a', Delivered: '#16a34a', Paid: '#16a34a',
    Accepted: '#16a34a', 'Fully Paid': '#16a34a', Approved: '#16a34a', 'Fast Moving': '#16a34a',
    'Low Stock': '#d97706', 'Expiring Soon': '#d97706', Pending: '#d97706',
    'Partially Paid': '#d97706', 'Slow Moving': '#d97706', Watch: '#d97706',
    'Revision Requested': '#d97706', 'Pending Supervisor Approval': '#d97706',
    Draft: '#94a3b8', 'No Sales': '#94a3b8', 'Not Yet Payable': '#94a3b8',
    'Out of Stock': '#dc2626', Expired: '#dc2626', Critical: '#dc2626',
    Cancelled: '#dc2626', Rejected: '#dc2626', 'High Stock / Low Sales': '#dc2626',
    Arrived: '#4f46e5', Steady: '#0f9f92',
};

const money  = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const number = new Intl.NumberFormat('en-PH');
const qs  = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];

const state = { sections: {}, charts: new Map(), loading: false, controller: null };

const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const fmt = (v, type) => type === 'currency' ? money.format(Number(v || 0)) : number.format(Number(v || 0));

export function initReportsSingle() {
    if (!qs('#reportStack')) return;
    wireFilters();
    loadAllReports();
}

function wireFilters() {
    const params = new URLSearchParams(location.search);
    if (params.get('start_date'))   qs('#fStartDate').value = params.get('start_date');
    if (params.get('end_date'))     qs('#fEndDate').value   = params.get('end_date');
    if (params.get('expiry_days'))  qs('#fExpiry').value    = params.get('expiry_days');
    if (params.get('stock_status')) qs('#fStock').value     = params.get('stock_status');

    qs('#applyFilters')?.addEventListener('click', () => {
        const p = new URLSearchParams();
        ['start_date','end_date','category_id','supplier_id','stock_status','expiry_days'].forEach(k => {
            const el = qs(`[name="${k}"]`);
            if (el && el.value) p.set(k, el.value);
        });
        history.replaceState(null, '', `${location.pathname}?${p}`);
        loadAllReports();
    });

    qs('#resetFilters')?.addEventListener('click', () => {
        qsa('#filtersBar input, #filtersBar select').forEach(el => {
            if (el.type === 'date') el.value = '';
            else if (el.tagName === 'SELECT') el.selectedIndex = 0;
        });
        qs('#fExpiry').value = '30';
        history.replaceState(null, '', location.pathname);
        loadAllReports();
    });

    qs('#reportRefresh')?.addEventListener('click', loadAllReports);
}

async function loadAllReports() {
    if (state.loading) return;
    state.loading = true;
    state.controller?.abort();
    state.controller = new AbortController();
    const ctrl = state.controller;

    destroyCharts();
    state.sections = {};
    qs('#reportLoading')?.classList.remove('d-none');
    qs('#reportError')?.classList.add('d-none');
    if (qs('#reportStack')) qs('#reportStack').innerHTML = '';

    try {
        await Promise.all(SECTIONS.map(meta => loadSection(meta, ctrl.signal)));
        if (ctrl !== state.controller) return;
        populateFilters();
        renderAll();
        qs('#reportLoading')?.classList.add('d-none');
    } catch (err) {
        if (err.name === 'AbortError') return;
        qs('#reportLoading')?.classList.add('d-none');
        qs('#reportError')?.classList.remove('d-none');
        if (qs('#reportError')) qs('#reportError').textContent = err.message || 'Failed to load.';
    } finally {
        if (ctrl === state.controller) state.loading = false;
    }
}

async function loadSection(meta, signal) {
    const params = new URLSearchParams(location.search);
    params.set('category', meta.key);
    try {
        const res = await fetch(`${API_BASE_URL}/reports/get_report.php?${params}`, { credentials: 'include', cache: 'no-store', signal });
        const data = await res.json();
        if (!res.ok || data.status !== 'success') {
            if (res.status === 403) { state.sections[meta.key] = { skipped: true }; return; }
            throw new Error(data.message || `Failed to load ${meta.label}.`);
        }
        state.sections[meta.key] = { data };
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        state.sections[meta.key] = { error: err.message };
    }
}

function populateFilters() {
    let filters = null;
    for (const key of Object.keys(state.sections)) {
        const sec = state.sections[key];
        if (sec && sec.data && sec.data.filters) { filters = sec.data.filters; break; }
    }
    if (!filters) return;

    const url = new URLSearchParams(location.search);

    const cat = qs('#fCategory');
    if (cat) {
        const prev = cat.value || url.get('category_id') || '';
        cat.innerHTML = '<option value="">Select category</option>' +
            (filters.categories || []).map(c => {
                const id = typeof c === 'object' ? c.id : c;
                const name = typeof c === 'object' ? c.name : c;
                return `<option value="${esc(id)}">${esc(name)}</option>`;
            }).join('');
        if ([...cat.options].some(o => o.value === prev)) cat.value = prev;
    }

    const sup = qs('#fSupplier');
    if (sup) {
        const prev = sup.value || url.get('supplier_id') || '';
        sup.innerHTML = '<option value="">Select supplier</option>' +
            (filters.suppliers || []).map(s => {
                const id = typeof s === 'object' ? s.id : s;
                const name = typeof s === 'object' ? s.name : s;
                return `<option value="${esc(id)}">${esc(name)}</option>`;
            }).join('');
        if ([...sup.options].some(o => o.value === prev)) sup.value = prev;
    }
}

/* ─────────── RENDER ─────────── */
function renderAll() {
    const stack = qs('#reportStack');
    if (!stack) return;

    const sections = SECTIONS
        .filter(m => state.sections[m.key] && !state.sections[m.key].skipped)
        .sort((a, b) => (a.priority || 50) - (b.priority || 50));

    stack.innerHTML =
        sections.map(meta => renderDataCard(meta, state.sections[meta.key])).join('') +
        renderTotals(sections);

    // Wire per-card search
    qsa('.data-card .search input').forEach(input => {
        input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const card = e.target.closest('.data-card');
            card.querySelectorAll('tbody tr').forEach(tr => {
                tr.style.display = tr.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
        });
    });

    // Draw charts after DOM is ready
    requestAnimationFrame(() => {
        sections.forEach(meta => {
            const sec = state.sections[meta.key];
            if (sec && sec.data) drawSectionChart(meta, sec.data);
        });
    });
}

function renderDataCard(meta, sec) {
    if (sec.error) {
        return `
            <div class="data-card">
                <div class="data-card-header"><h2><i class="fa-solid ${meta.icon} me-2" style="color:#7c3aed;"></i>${esc(meta.label)}</h2></div>
                <div class="err-box" style="margin:16px;">${esc(sec.error)}</div>
            </div>`;
    }

    const data = sec.data;
    const columns = Object.entries(data.columns || {});
    const rows = data.rows || [];

    if (!columns.length) {
        return `
            <div class="data-card">
                <div class="data-card-header"><h2><i class="fa-solid ${meta.icon} me-2" style="color:#7c3aed;"></i>${esc(meta.label)}</h2></div>
                <div class="empty-note">No data available for this section.</div>
            </div>`;
    }

    const thead = columns.map(([k, label]) => `<th>${esc(label)}</th>`).join('');
    const tbody = rows.length
        ? rows.slice(0, 15).map(row => `<tr>${columns.map(([k]) => {
            const val = row[k];
            if ((data.currency_columns || []).includes(k)) return `<td>${esc(money.format(Number(val || 0)))}</td>`;
            if (val === null || val === '') return `<td class="muted">—</td>`;
            return `<td>${esc(String(val))}</td>`;
        }).join('')}</tr>`).join('')
        : `<tr><td colspan="${columns.length}" class="muted" style="text-align:center;padding:24px;">No records for this period.</td></tr>`;

    // Pick the first chart with data
    const chart = (data.charts || []).find(c => (c.rows || []).some(r => Number(r.value) > 0));
    const chartHtml = chart
        ? `<div class="chart-area">
               <div class="chart-label">${esc(chart.title)}</div>
               <div class="chart-canvas">
                   <canvas id="chart_${esc(meta.key)}"></canvas>
               </div>
           </div>`
        : '';

    return `
        <div class="data-card">
            <div class="data-card-header">
                <h2><i class="fa-solid ${meta.icon} me-2" style="color:#7c3aed;"></i>${esc(meta.label)}</h2>
                <div class="search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" placeholder="Search ${esc(meta.label.toLowerCase())}…">
                </div>
            </div>

            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr>${thead}</tr></thead>
                    <tbody>${tbody}</tbody>
                </table>
            </div>

            ${chartHtml}
        </div>`;
}

function renderTotals(sections) {
    if (!sections.length) return '';

    const cards = sections.map(meta => {
        const data = state.sections[meta.key]?.data;
        if (!data || !data.summary || !data.summary.length) return '';
        const rows = data.summary.slice(0, 5).map(card => `
            <div class="total-row">
                <span>${esc(card.title)}</span>
                <strong>${esc(fmt(card.value, card.format))}</strong>
            </div>
        `).join('');
        return `<div class="total-card"><h3>${esc(meta.label)}</h3>${rows}</div>`;
    }).join('');

    return `<h2 class="totals-title">Totals</h2><div class="totals-grid">${cards}</div>`;
}

/* ─────────── CHARTS ─────────── */
function destroyCharts() {
    state.charts.forEach(c => { try { c.destroy(); } catch {} });
    state.charts.clear();
}

function drawSectionChart(meta, data) {
    const chart = (data.charts || []).find(c => (c.rows || []).some(r => Number(r.value) > 0));
    if (!chart) return;

    const canvas = document.getElementById(`chart_${meta.key}`);
    if (!canvas || typeof Chart === 'undefined') return;

    const positive = (chart.rows || []).filter(r => Number(r.value) > 0);
    if (!positive.length) return;

    const isLine = chart.type === 'line';
    const isDoughnut = chart.type === 'doughnut';
    const horizontal = chart.orientation === 'horizontal';
    const currency = /sales|cost|revenue|payable|value|amount/i.test(chart.title);

    const values = positive.map(r => Number(r.value));
    const labels = positive.map(r => r.label);
    const colors = isDoughnut
        ? positive.map(r => statusColors[r.label] || chartTones[chart.tone] || chartTones.blue)
        : positive.map((_, i) => i === 0 ? (chartTones[chart.tone] || chartTones.blue) : `${chartTones[chart.tone] || chartTones.blue}${Math.max(55, 210 - i * 28).toString(16).padStart(2, '0')}`);

    const instance = new Chart(canvas, {
        type: chart.type,
        data: {
            labels,
            datasets: [{
                label: chart.title,
                data: values,
                backgroundColor: isLine ? `${chartTones.blue}22` : colors,
                borderColor: isLine ? chartTones.blue : colors,
                borderWidth: isLine ? 2 : 0,
                tension: 0.3,
                fill: isLine,
                pointRadius: isLine ? 3 : 0,
                pointHoverRadius: 5,
                borderRadius: isDoughnut ? 0 : 4,
                cutout: isDoughnut ? '60%' : undefined,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: horizontal ? 'y' : 'x',
            animation: { duration: 200 },
            plugins: {
                legend: {
                    display: isDoughnut,
                    position: 'bottom',
                    labels: { boxWidth: 8, font: { size: 10 }, padding: 12, usePointStyle: true, pointStyle: 'circle' },
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 8,
                    cornerRadius: 6,
                    displayColors: false,
                    callbacks: {
                        label: ctx => currency ? money.format(ctx.raw) : number.format(ctx.raw),
                    },
                },
            },
            scales: isDoughnut ? {} : {
                x: {
                    beginAtZero: horizontal,
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        font: { size: 10 },
                        color: '#94a3b8',
                        callback: function (v) {
                            if (horizontal) return currency ? money.format(v) : number.format(v);
                            return this.getLabelForValue(v);
                        },
                    },
                },
                y: {
                    beginAtZero: !horizontal,
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        font: { size: 10 },
                        color: '#94a3b8',
                        callback: function (v) {
                            if (!horizontal && currency) return money.format(v);
                            return this.getLabelForValue(v);
                        },
                    },
                },
            },
        },
    });

    state.charts.set(meta.key, instance);
}