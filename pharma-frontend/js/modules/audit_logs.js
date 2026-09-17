import API_BASE_URL from '../config/config.js';

const rowsEl = document.getElementById('auditRows');
const form = document.getElementById('auditFilters');
const statusEl = document.getElementById('auditStatus');
const prevBtn = document.getElementById('auditPrev');
const nextBtn = document.getElementById('auditNext');
const clearBtn = document.getElementById('auditClear');
const state = { page: 1, totalPages: 1, facetsLoaded: false };

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
}

function actionClass(action) {
    if (['LOGIN_SUCCESS', 'CREATE', 'APPROVE', 'PAYMENT'].includes(action)) return 'badge-green';
    if (['LOGIN_FAILED', 'DELETE', 'REJECT'].includes(action)) return 'badge-red';
    if (['UPDATE', 'TRANSFER', 'INSPECT'].includes(action)) return 'badge-blue';
    if (action === 'STATUS_CHANGE') return 'badge-yellow';
    if (action === 'LOGOUT') return 'badge-gray';
    return 'badge-gray';
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
        return `${row.display_name || 'System / Unknown'}${id}`;
    });
    fillSelect('auditAction', filters.actions || [], '', row => row);
    fillSelect('auditModule', filters.modules || [], '', row => row);
    state.facetsLoaded = true;
}

function renderRows(rows) {
    if (!rows.length) {
        rowsEl.innerHTML = '<tr><td class="empty-row" colspan="7">No audit logs found.</td></tr>';
        return;
    }
    rowsEl.innerHTML = rows.map(row => {
        const target = [row.target_type, row.target_id].filter(Boolean).join(' #') || row.target_id || '-';
        return `<tr>
            <td>${escapeHtml(formatDate(row.created_at))}</td>
            <td class="user-cell"><strong>${escapeHtml(row.display_name || 'System / Unknown')}</strong><small>${escapeHtml(row.employee_id || row.user_id || 'No ID recorded')}</small></td>
            <td><span class="badge-action ${actionClass(row.action)}">${escapeHtml(row.action || '-')}</span></td>
            <td>${escapeHtml(row.module || '-')}</td>
            <td class="description-cell">${escapeHtml(row.description || '-')}</td>
            <td>${escapeHtml(target)}</td>
            <td>${escapeHtml(row.ip_address || '-')}</td>
        </tr>`;
    }).join('');
}

async function load(page = 1) {
    state.page = page;
    rowsEl.innerHTML = '<tr><td class="empty-row" colspan="7">Loading audit logs...</td></tr>';
    try {
        const response = await fetch(`${API_BASE_URL}/audit/get_audit_logs.php?${query(page)}`, {
            credentials: 'include',
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to load audit logs.');
        renderFacets(data.filters || {});
        renderRows(data.data || []);
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

window.__drpSessionReadyPromise?.then(session => {
    const roles = new Set([session?.role, ...(session?.roles || []), ...(session?.role_identifiers || [])].map(role => String(role || '').toLowerCase().replace(/[\s-]+/g, '_')));
    if (!roles.has('admin') && !roles.has('ro_admin') && !roles.has('super_admin') && !roles.has('ro_super_admin')) return;
    load(1);
}).catch(() => {});
