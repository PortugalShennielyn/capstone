import API_BASE_URL from '../config/config.js';

const rowsEl = document.getElementById('auditRows');
const form = document.getElementById('auditFilters');
const statusEl = document.getElementById('auditStatus');
const prevBtn = document.getElementById('auditPrev');
const nextBtn = document.getElementById('auditNext');
const clearBtn = document.getElementById('auditClear');
const summaryEls = {
    total: document.getElementById('auditSummaryTotal'),
    success: document.getElementById('auditSummarySuccess'),
    failure: document.getElementById('auditSummaryFailure'),
    security: document.getElementById('auditSummarySecurity')
};
const summaryPeriodEl = document.getElementById('auditSummaryPeriod');
const state = { page: 1, totalPages: 1, facetsLoaded: false, management: { type: '', page: 1, totalPages: 1, rows: [] }, salesHistory: { type: '', page: 1, totalPages: 1 } };
const transactionActions = new Set([
    'TRANSACTION_CREATED', 'TRANSACTION_DRAFT_SAVED', 'TRANSACTION_SENT_TO_CASHIER',
    'TRANSACTION_ACCEPTED', 'TRANSACTION_PAYMENT_PROCESSING', 'TRANSACTION_CANCELLED',
    'TRANSACTION_REJECTED', 'TRANSACTION_STATUS_CHANGED', 'SALE_COMPLETED',
    'REFUND_ISSUED', 'DISCOUNT_APPLIED'
]);

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
}

function actionClass(action) {
    if (action === 'SALE_COMPLETED') return 'badge-green';
    if (action === 'REFUND_ISSUED' || action === 'DISCOUNT_APPLIED') return 'badge-yellow';
    if (action === 'TRANSACTION_VOIDED' || action === 'TRANSACTION_CANCELLED' || action === 'TRANSACTION_REJECTED') return 'badge-red';
    if (String(action || '').startsWith('TRANSACTION_')) return 'badge-blue';
    if (['LOGIN_SUCCESS', 'CREATE', 'APPROVE', 'PAYMENT'].includes(action)) return 'badge-green';
    if (['LOGIN_FAILED', 'ACCESS_DENIED', 'DELETE', 'REJECT'].includes(action)) return 'badge-red';
    if (['UPDATE', 'TRANSFER', 'INSPECT'].includes(action)) return 'badge-blue';
    if (action === 'STATUS_CHANGE') return 'badge-yellow';
    if (action === 'LOGOUT') return 'badge-gray';
    return 'badge-gray';
}

function actionLabel(action) {
    const value = String(action || '').trim().toUpperCase();
    if (/^[A-Z](?:_[A-Z])*_+$/.test(value)) return 'Legacy action';
    const labels = {
        LOGIN_SUCCESS: 'Login successful', LOGIN_FAILED: 'Login failed', LOGOUT: 'Logout',
        SESSION_TIMEOUT: 'Session timeout', SESSION_EXPIRED: 'Session expired',
        SESSION_REVOKED: 'Session revoked', STATUS_CHANGE: 'Status changed',
        SALE_COMPLETED: 'Sale Completed', REFUND_ISSUED: 'Refund Issued',
        TRANSACTION_VOIDED: 'Transaction Voided', DISCOUNT_APPLIED: 'Discount Applied',
        TRANSACTION_CANCELLED: 'Transaction Cancelled',
        TRANSACTION_CREATED: 'Transaction Created',
        TRANSACTION_DRAFT_SAVED: 'Transaction Draft Saved',
        TRANSACTION_SENT_TO_CASHIER: 'Transaction Sent to Cashier',
        TRANSACTION_ACCEPTED: 'Transaction Accepted',
        TRANSACTION_PAYMENT_PROCESSING: 'Transaction Payment Processing',
        TRANSACTION_REJECTED: 'Transaction Rejected',
        TRANSACTION_STATUS_CHANGED: 'Transaction Status Changed'
    };
    return labels[value] || value.toLowerCase().replace(/_/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function formatDate(value) {
    const date = new Date(String(value || '').replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
}

function query(page = 1) {
    const params = new URLSearchParams({ page: String(page), per_page: '25' });
    new FormData(form).forEach((value, key) => {
        const cleaned = String(value || '').trim();
        if (cleaned) params.set(key, cleaned);
    });
    return params;
}

function renderSummary(summary = {}) {
    summaryEls.total.textContent = Number(summary.total_activities || 0).toLocaleString();
    summaryEls.success.textContent = Number(summary.successful_actions || 0).toLocaleString();
    summaryEls.failure.textContent = Number(summary.failed_actions || 0).toLocaleString();
    summaryEls.security.textContent = Number(summary.security_events || 0).toLocaleString();
    const sales = summary.sales_transactions || {};
    document.getElementById('salesCountCompleted').textContent = Number(sales.sale_completed || 0).toLocaleString();
    document.getElementById('salesCountRefund').textContent = Number(sales.refund_issued || 0).toLocaleString();
    document.getElementById('salesCountCancelled').textContent = Number(sales.transaction_cancelled || 0).toLocaleString();
    document.getElementById('salesCountDiscount').textContent = Number(sales.discount_applied || 0).toLocaleString();
    const management = summary.system_user_management || {};
    document.getElementById('managementCountAccounts').textContent = Number(management.accounts_created || 0).toLocaleString();
    document.getElementById('managementCountRoles').textContent = Number(management.role_changes || 0).toLocaleString();
    document.getElementById('managementCountSettings').textContent = Number(management.settings_changed || 0).toLocaleString();

    const dateFrom = document.getElementById('auditDateFrom').value;
    const dateTo = document.getElementById('auditDateTo').value;
    if (dateFrom && dateTo) {
        summaryPeriodEl.textContent = `Based on activity from ${dateFrom} through ${dateTo}.`;
    } else if (dateFrom) {
        summaryPeriodEl.textContent = `Based on activity from ${dateFrom} onward.`;
    } else if (dateTo) {
        summaryPeriodEl.textContent = `Based on activity through ${dateTo}.`;
    } else {
        summaryPeriodEl.textContent = 'Based on all recorded activity.';
    }
}

function fillSelect(id, rows, valueKey, labelFn) {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    const first = select.querySelector('option')?.outerHTML || '<option value="">All</option>';
    select.innerHTML = first + rows.map(row => `<option value="${escapeHtml(row[valueKey] || row)}">${escapeHtml(labelFn(row))}</option>`).join('');
    select.value = current;
}

function renderFacets(filters = {}) {
    if (state.facetsLoaded) return;
    fillSelect('auditUser', filters.users || [], 'user_id', row => {
        const id = row.employee_id ? ` (${row.employee_id})` : '';
        const role = row.role ? ` · ${row.role}` : '';
        return `${row.display_name || 'System / Unknown'}${role}${id}`;
    });
    const actions = [...new Set([...(filters.actions || []), ...transactionActions, 'ACCOUNT_CREATED', 'ROLE_CHANGED', 'SETTINGS_CHANGED'])].sort();
    const modules = [...new Set([...(filters.modules || []), 'Sales & Transactions', 'System & User Management'])].sort();
    fillSelect('auditAction', actions, '', row => actionLabel(row));
    fillSelect('auditModule', modules, '', row => row);
    state.facetsLoaded = true;
}

function renderRows(rows) {
    if (!rows.length) {
        rowsEl.innerHTML = '<tr><td class="empty-row" colspan="8">No audit logs found.</td></tr>';
        return;
    }
    rowsEl.innerHTML = rows.map(row => {
        const detail = parseDetails(row.details);
        const transactionId = row.transaction_id || detail.transaction_id || detail.receipt_no || detail.order_no || '';
        const amount = row.action === 'DISCOUNT_APPLIED'
            ? (row.discount_amount ?? detail.discount_amount ?? '')
            : row.action === 'REFUND_ISSUED'
                ? (row.refund_amount ?? detail.refund_amount ?? '')
                : (row.amount ?? detail.amount ?? detail.total_amount ?? '');
        const outcome = String(row.event_status || 'Unknown');
        const outcomeLabel = outcome.toLowerCase() === 'failure' ? 'Failed' : outcome;
        const outcomeClass = outcome.toLowerCase() === 'success' ? 'event-success' : outcome.toLowerCase() === 'denied' ? 'event-denied' : 'event-failure';
        return `<tr>
            <td data-label="Date &amp; Time">${escapeHtml(formatDate(row.created_at))}</td>
            <td data-label="User / Role" class="user-cell"><strong>${escapeHtml(row.display_name || 'System / Unknown')}</strong><small>${escapeHtml([row.role, row.employee_id || row.user_id].filter(Boolean).join(' · ') || 'No user details recorded')}</small></td>
            <td data-label="Action / Outcome"><span class="badge-action ${actionClass(row.action)}">${escapeHtml(actionLabel(row.action))}</span><span class="event-status ${outcomeClass}">${escapeHtml(outcomeLabel)}</span></td>
            <td data-label="Module">${escapeHtml(row.module || '-')}</td>
            <td data-label="Event Description" class="description-cell">${escapeHtml(row.description || '-')}</td>
            <td data-label="Transaction ID">${transactionId ? `<span class="transaction-id">${escapeHtml(transactionId)}</span>` : '—'}</td>
            <td data-label="Amount" class="amount-cell">${amount !== '' && Number.isFinite(Number(amount)) ? escapeHtml(formatCurrency(amount)) : '—'}</td>
            <td data-label="Details"><button class="btn btn-sm details-btn" type="button" data-audit-row="${rows.indexOf(row)}"><i class="fa-regular fa-eye me-1"></i>View Details</button></td>
        </tr>`;
    }).join('');
}

async function load(page = 1) {
    state.page = page;
    rowsEl.innerHTML = '<tr><td class="empty-row" colspan="8">Loading audit logs...</td></tr>';
    try {
        const response = await fetch(`${API_BASE_URL}/audit/get_audit_logs.php?${query(page)}`, {
            credentials: 'include',
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to load audit logs.');
        renderSummary(data.summary || {});
        renderFacets(data.filters || {});
        state.rows = data.data || [];
        renderRows(state.rows);
        const pagination = data.pagination || {};
        state.page = Number(pagination.page || page);
        state.totalPages = Number(pagination.total_pages || 1);
        statusEl.textContent = `Page ${state.page} of ${state.totalPages} • ${Number(pagination.total || 0)} records`;
        prevBtn.disabled = state.page <= 1;
        nextBtn.disabled = state.page >= state.totalPages;
    } catch (error) {
        rowsEl.innerHTML = `<tr><td class="empty-row" colspan="7">${escapeHtml(error.message)}</td></tr>`;
        prevBtn.disabled = true;
        nextBtn.disabled = true;
    }
}

function parseDetails(value) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(String(value || '{}')); } catch { return {}; }
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));
}

function openDetails(row) {
    const detail = parseDetails(row.details);
    const values = [
        ['Audit Event ID', row.audit_id],
        ['Transaction ID', row.transaction_id || detail.transaction_id || detail.receipt_no || detail.order_no],
        ['Action Type', actionLabel(row.action)],
        ['User Name', row.display_name],
        ['User Role', row.role],
        ['Date & Time', formatDate(row.created_at)],
        ['Transaction Total', row.action === 'DISCOUNT_APPLIED' ? null : (row.amount ?? detail.amount ?? detail.total_amount)],
        ['Refund Amount', row.refund_amount ?? detail.refund_amount],
        ['Discount Type', row.discount_type ?? detail.discount_type],
        ['Discount Amount', row.discount_amount ?? detail.discount_amount],
        [row.action === 'TRANSACTION_CANCELLED' ? 'Cancellation Reason' : 'Void Reason', row.cancellation_reason ?? detail.cancellation_reason ?? row.void_reason ?? detail.void_reason],
        ['Outcome', row.event_status],
        ['Affected Record', [row.target_type, row.target_id].filter(Boolean).join(' #')],
        ['IP Address', row.ip_address],
        ['Request ID', row.request_id],
        ['Source Device', row.device],
    ].filter(([, value]) => value !== null && value !== undefined && value !== '');
    const dl = document.getElementById('auditDetailsBody');
    dl.innerHTML = values.map(([label, value]) => `<dt class="col-sm-4 text-secondary">${escapeHtml(label)}</dt><dd class="col-sm-8 text-break">${escapeHtml(['Transaction Total', 'Refund Amount', 'Discount Amount'].includes(label) && Number.isFinite(Number(value)) ? formatCurrency(value) : value)}</dd>`).join('');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('auditDetailsModal')).show();
}


form?.addEventListener('submit', event => {
    event.preventDefault();
    load(1);
});
clearBtn?.addEventListener('click', () => {
    form.reset();
    load(1);
});
prevBtn?.addEventListener('click', () => load(Math.max(1, state.page - 1)));
nextBtn?.addEventListener('click', () => load(Math.min(state.totalPages, state.page + 1)));
rowsEl?.addEventListener('click', event => {
    const button = event.target.closest('[data-audit-row]');
    if (!button) return;
    const row = state.rows?.[Number(button.dataset.auditRow)];
    if (row) openDetails(row);
});
const salesHistoryConfig = {
    REFUND_ISSUED: {
        key: 'refunds', title: 'Refund History', subtitle: 'Review issued refunds and their related transactions.',
        empty: 'No refund records found. Refund processing is not currently available in the application.',
        placeholder: 'Search transaction ID or cashier...',
        columns: ['Date & Time', 'Transaction ID', 'Cashier or User', 'Refund Amount', 'Refund Reason', 'Status'],
        values: (row, detail) => [formatDate(row.created_at), row.transaction_id || '—', row.display_name || 'Unknown', row.refund_amount ?? '—', detail.refund_reason || detail.reason || '—', row.event_status || '—']
    },
    TRANSACTION_CANCELLED: {
        key: 'cancelled', title: 'Cancelled Transactions History', subtitle: 'Review cancelled or voided transactions and their recorded reasons.',
        empty: 'No cancelled transactions found.',
        placeholder: 'Search transaction ID, cashier, or cancellation reason...',
        columns: ['Date & Time', 'Transaction ID', 'Cashier or User', 'Transaction Amount', 'Cancellation or Void Reason', 'Status'],
        values: (row, detail) => [formatDate(row.created_at), row.transaction_id || '—', row.display_name || 'Unknown', row.amount ?? '—', row.cancellation_reason || detail.void_reason || detail.cancellation_reason || '—', row.event_status || '—']
    },
    DISCOUNT_APPLIED: {
        key: 'discounts', title: 'Discount History', subtitle: 'Review discounts applied to completed transactions.',
        empty: 'No discount records found.',
        placeholder: 'Search transaction ID, cashier, or discount type...',
        columns: ['Date & Time', 'Transaction ID', 'Cashier or User', 'Discount Type', 'Discount Amount', 'Final Transaction Total', 'Status'],
        values: (row, detail) => [formatDate(row.created_at), row.transaction_id || '—', row.display_name || 'Unknown', (detail.discount_type && detail.discount_type !== 'none') ? detail.discount_type : (Number(detail.sales_clerk_discount || 0) > 0 ? 'Sales Clerk Discount' : '—'), row.discount_amount ?? detail.discount_amount ?? '—', row.amount ?? detail.amount ?? '—', row.event_status || '—']
    }
};

function renderSalesHistory(rows, config) {
    const head = document.getElementById('salesHistoryHead');
    const body = document.getElementById('salesHistoryRows');
    head.innerHTML = `<tr>${config.columns.map(label => `<th>${escapeHtml(label)}</th>`).join('')}</tr>`;
    if (!rows.length) {
        body.innerHTML = `<tr><td class="text-center text-secondary py-4" colspan="${config.columns.length}">${escapeHtml(config.empty)}</td></tr>`;
        return;
    }
    body.innerHTML = rows.map(row => {
        const detail = parseDetails(row.details);
        const values = config.values(row, detail);
        return `<tr>${values.map((value, index) => {
            const status = index === values.length - 1;
            const outcome = String(value || '').toLowerCase();
            const badge = outcome === 'success' || outcome === 'refunded' ? 'badge-green' : (outcome === 'denied' || outcome === 'cancelled' ? 'badge-yellow' : 'badge-red');
            const isMoney = ['Refund Amount', 'Transaction Amount', 'Discount Amount', 'Final Transaction Total'].includes(config.columns[index]);
            const display = isMoney && value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? formatCurrency(value) : value;
            return `<td>${status ? `<span class="badge-action ${badge}">${escapeHtml(display)}</span>` : escapeHtml(display)}</td>`;
        }).join('')}</tr>`;
    }).join('');
}

async function loadSalesHistory(page = 1) {
    const config = salesHistoryConfig[state.salesHistory.action];
    if (!config) return;
    const body = document.getElementById('salesHistoryRows');
    body.innerHTML = `<tr><td class="text-center text-secondary py-4" colspan="${config.columns.length}">Loading records…</td></tr>`;
    const params = new URLSearchParams({ sales_history: config.key, sales_search: document.getElementById('salesHistorySearch').value.trim(), date_from: document.getElementById('auditDateFrom').value, date_to: document.getElementById('auditDateTo').value, page: String(page), per_page: '10' });
    try {
        const response = await fetch(`${API_BASE_URL}/audit/get_audit_logs.php?${params}`, { credentials: 'include', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to load sales history.');
        const pagination = data.pagination || {};
        state.salesHistory.page = Number(pagination.page || page);
        state.salesHistory.totalPages = Number(pagination.total_pages || 1);
        renderSalesHistory(data.data || [], config);
        const total = Number(pagination.total || 0);
        document.getElementById('salesHistoryStatus').textContent = `${total ? `Showing ${(state.salesHistory.page - 1) * 10 + 1}–${Math.min(state.salesHistory.page * 10, total)} of ${total}` : '0 records'} · Page ${state.salesHistory.page} of ${state.salesHistory.totalPages}`;
        document.getElementById('salesHistoryPrev').disabled = state.salesHistory.page <= 1;
        document.getElementById('salesHistoryNext').disabled = state.salesHistory.page >= state.salesHistory.totalPages;
    } catch (error) {
        body.innerHTML = `<tr><td class="text-center text-danger py-4" colspan="${config.columns.length}">${escapeHtml(error.message)}</td></tr>`;
        document.getElementById('salesHistoryStatus').textContent = 'Records could not be loaded.';
        document.getElementById('salesHistoryPrev').disabled = true;
        document.getElementById('salesHistoryNext').disabled = true;
    }
}

document.querySelectorAll('.sales-count-card').forEach(card => card.addEventListener('click', () => {
    const action = card.dataset.action;
    const config = salesHistoryConfig[action];
    if (!config) {
        // Preserve the existing Sale Completed card behavior exactly.
        document.getElementById('auditModule').value = 'Sales & Transactions';
        document.getElementById('auditAction').value = action;
        load(1);
        return;
    }
    state.salesHistory.action = action;
    document.getElementById('salesHistoryTitle').textContent = config.title;
    document.getElementById('salesHistorySubtitle').textContent = config.subtitle;
    document.getElementById('salesHistorySearch').value = '';
    document.getElementById('salesHistorySearch').placeholder = config.placeholder;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('salesHistoryModal')).show();
    loadSalesHistory(1);
}));
document.getElementById('salesHistorySearch')?.addEventListener('input', () => loadSalesHistory(1));
document.getElementById('salesHistoryPrev')?.addEventListener('click', () => loadSalesHistory(Math.max(1, state.salesHistory.page - 1)));
document.getElementById('salesHistoryNext')?.addEventListener('click', () => loadSalesHistory(Math.min(state.salesHistory.totalPages, state.salesHistory.page + 1)));

const managementConfig = {
    accounts_created: {
        title: 'Account Creation History', subtitle: 'Review recorded account creations and assigned roles.',
        empty: 'No account-creation records found.',
        columns: ['Date & Time', 'Created By', 'Actor Role', 'New Account', 'New Role', 'Event Description', 'Outcome'],
        values: (row, detail) => [formatDate(row.created_at), row.display_name || 'Unknown', row.role || '—', detail.affected_username || '—', detail.new_role || '—', row.description || '—', row.event_status || '—']
    },
    role_changes: {
        title: 'Role Change History', subtitle: 'Review verified role assignments recorded by the system.',
        empty: 'No role-change records found.',
        columns: ['Date & Time', 'Changed By', 'Actor Role', 'Affected User', 'Previous Role', 'New Role', 'Event Description', 'Outcome'],
        values: (row, detail) => [formatDate(row.created_at), row.display_name || 'Unknown', row.role || '—', detail.affected_username || '—', detail.previous_role || '—', detail.new_role || '—', row.description || '—', row.event_status || '—']
    },
    settings_changed: {
        title: 'Store Settings Change History', subtitle: 'Review actual changes to editable store and document settings.',
        empty: 'No store-settings change records found.',
        columns: ['Date & Time', 'Changed By', 'Actor Role', 'Setting Name', 'Previous Value', 'New Value', 'Event Description', 'Outcome'],
        values: (row, detail) => [formatDate(row.created_at), row.display_name || 'Unknown', row.role || '—', detail.setting_name || '—', detail.previous_value ?? '—', detail.new_value ?? '—', row.description || '—', row.event_status || '—']
    }
};

function renderManagementRows(rows, type) {
    const config = managementConfig[type];
    const head = document.getElementById('managementHistoryHead');
    const body = document.getElementById('managementHistoryRows');
    head.innerHTML = `<tr>${config.columns.map(label => `<th>${escapeHtml(label)}</th>`).join('')}</tr>`;
    if (!rows.length) {
        body.innerHTML = `<tr><td class="text-center text-secondary py-4" colspan="${config.columns.length}">${escapeHtml(config.empty)}</td></tr>`;
        return;
    }
    body.innerHTML = rows.map(row => {
        const detail = parseDetails(row.details);
        const values = config.values(row, detail);
        return `<tr>${values.map((value, index) => {
            const statusColumn = index === values.length - 1;
            const cls = statusColumn ? (String(value).toLowerCase() === 'success' ? 'badge-green' : String(value).toLowerCase() === 'denied' ? 'badge-yellow' : 'badge-red') : '';
            const displayValue = value && typeof value === 'object' ? JSON.stringify(value) : value;
            return `<td>${statusColumn ? `<span class="badge-action ${cls}">${escapeHtml(displayValue)}</span>` : escapeHtml(displayValue)}</td>`;
        }).join('')}</tr>`;
    }).join('');
}

async function loadManagementHistory(page = 1) {
    const { type } = state.management;
    if (!managementConfig[type]) return;
    const body = document.getElementById('managementHistoryRows');
    body.innerHTML = `<tr><td class="text-center text-secondary py-4" colspan="8">Loading history…</td></tr>`;
    const params = new URLSearchParams({
        management_type: type, management_search: document.getElementById('managementHistorySearch').value.trim(),
        date_from: document.getElementById('managementHistoryFrom').value,
        date_to: document.getElementById('managementHistoryTo').value,
        page: String(page), per_page: '10'
    });
    try {
        const response = await fetch(`${API_BASE_URL}/audit/get_audit_logs.php?${params}`, { credentials: 'include', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to load this history.');
        state.management.rows = data.data || [];
        state.management.page = Number(data.pagination?.page || page);
        state.management.totalPages = Number(data.pagination?.total_pages || 1);
        renderManagementRows(state.management.rows, type);
        const total = Number(data.pagination?.total || 0);
        document.getElementById('managementHistoryStatus').textContent = `${total ? `Showing ${(state.management.page - 1) * 10 + 1}–${Math.min(state.management.page * 10, total)} of ${total}` : '0 records'} · Page ${state.management.page} of ${state.management.totalPages}`;
        document.getElementById('managementHistoryPrev').disabled = state.management.page <= 1;
        document.getElementById('managementHistoryNext').disabled = state.management.page >= state.management.totalPages;
    } catch (error) {
        body.innerHTML = `<tr><td class="text-center text-danger py-4" colspan="8">${escapeHtml(error.message)}</td></tr>`;
        document.getElementById('managementHistoryStatus').textContent = 'History could not be loaded.';
    }
}

document.querySelectorAll('.management-count-card').forEach(card => card.addEventListener('click', () => {
    const type = card.dataset.managementType;
    const config = managementConfig[type];
    if (!config) return;
    state.management.type = type;
    document.getElementById('managementHistoryTitle').textContent = config.title;
    document.getElementById('managementHistorySubtitle').textContent = config.subtitle;
    document.getElementById('managementHistorySearch').value = '';
    document.getElementById('managementHistoryFrom').value = document.getElementById('auditDateFrom').value;
    document.getElementById('managementHistoryTo').value = document.getElementById('auditDateTo').value;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('managementHistoryModal')).show();
    loadManagementHistory(1);
}));
document.getElementById('managementHistoryApply')?.addEventListener('click', () => loadManagementHistory(1));
document.getElementById('managementHistorySearch')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); loadManagementHistory(1); } });
document.getElementById('managementHistoryPrev')?.addEventListener('click', () => loadManagementHistory(Math.max(1, state.management.page - 1)));
document.getElementById('managementHistoryNext')?.addEventListener('click', () => loadManagementHistory(Math.min(state.management.totalPages, state.management.page + 1)));
document.getElementById('managementHistoryViewAll')?.addEventListener('click', () => {
    const config = managementConfig[state.management.type];
    if (!config) return;
    document.getElementById('auditModule').value = 'System & User Management';
    document.getElementById('auditAction').value = ({ accounts_created: 'ACCOUNT_CREATED', role_changes: 'ROLE_CHANGED', settings_changed: 'SETTINGS_CHANGED' })[state.management.type];
    bootstrap.Modal.getInstance(document.getElementById('managementHistoryModal'))?.hide();
    load(1);
});

window.__drpSessionReadyPromise?.then(session => {
    const roles = new Set([session?.role, ...(session?.roles || []), ...(session?.role_identifiers || [])].map(role => String(role || '').toLowerCase().replace(/[\s-]+/g, '_')));
    if (!roles.has('admin') && !roles.has('ro_admin') && !roles.has('super_admin') && !roles.has('ro_super_admin')) {
        rowsEl.innerHTML = '<tr><td class="empty-row" colspan="8">Administrator access is required to view audit logs.</td></tr>';
        statusEl.textContent = 'Access denied';
        return;
    }
    load(1);
}).catch(() => {
    rowsEl.innerHTML = '<tr><td class="empty-row" colspan="8">Sign in with an administrator account to view audit logs.</td></tr>';
    statusEl.textContent = 'Authentication required';
});
