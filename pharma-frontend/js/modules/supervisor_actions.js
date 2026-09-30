import API_BASE_URL from '../config/config.js';

export function initSupervisorActions() {
    const session = window.__drpSession || {};
    const roles = [session.role, ...(session.roles || [])].map(r => String(r || '').toLowerCase());
    const isSupervisor = roles.some(r =>
        r === 'supervisor' || r === 'ro-supervisor' || r === 'ro_supervisor'
    );

    const bar = document.getElementById('supervisorActions');
    const banner = document.getElementById('readOnlyBanner');
    const decisionsRow = document.getElementById('supervisorDecisionsRow');

    if (!isSupervisor) {
        if (bar) bar.hidden = true;
        if (banner) banner.hidden = true;
        if (decisionsRow) decisionsRow.hidden = true;
        return;
    }

    if (bar) bar.hidden = false;
    if (banner) banner.hidden = false;
    if (decisionsRow) decisionsRow.hidden = false;

    loadCounts();
    loadRecentDecisions();
    enforceReadOnlyMode();
    wireShiftDownload();
}

async function loadCounts() {
    try {
        const res = await fetch(`${API_BASE_URL}/reports/get_supervisor_summary.php`, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        setBadge('pendingPrCount',  data.pending_purchase_requests);
        setBadge('expiringCount',   data.expiring_within_30,      { alert: true });
        setBadge('outOfStockCount', data.out_of_stock_products,   { alert: true });
    } catch (e) {
        console.warn('[SUPERVISOR] counts failed', e);
    }
}

function setBadge(id, value, opts = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    const n = Number(value) || 0;
    el.textContent = n;
    el.classList.toggle('is-zero', n === 0);
    el.classList.toggle('is-alert', Boolean(opts.alert) && n > 0);
}

async function loadRecentDecisions() {
    const host = document.getElementById('supervisorDecisions');
    if (!host) return;
    try {
        const res = await fetch(`${API_BASE_URL}/purchase_requests/get_supervisor_decisions.php?limit=5`, {
            credentials: 'include',
            cache: 'no-store',
        });
        if (!res.ok) {
            host.innerHTML = '<div class="text-muted small">Unable to load.</div>';
            return;
        }
        const data = await res.json();
        if (!data.success || !data.decisions?.length) {
            host.innerHTML = '<div class="text-muted small py-2">No recent decisions.</div>';
            return;
        }
        host.innerHTML = data.decisions.map(d => `
            <div class="decision-row tone-${decisionTone(d.status)}">
                <div class="decision-icon"><i class="fa-solid ${decisionIcon(d.status)}"></i></div>
                <div class="decision-info">
                    <strong>${escape(d.pr_number || 'PR')}</strong>
                    <small>${escape(d.requested_by || '')} · ${escape(d.summary || '')}</small>
                </div>
                <span class="decision-status ${decisionTone(d.status)}">${escape(d.status)}</span>
                <small class="text-muted">${escape(d.decided_at || '')}</small>
            </div>
        `).join('');
    } catch (e) {
        host.innerHTML = '<div class="text-muted small">Network error.</div>';
    }
}

function decisionTone(s) {
    s = String(s || '').toLowerCase();
    if (s.includes('approved'))  return 'green';
    if (s.includes('rejected'))  return 'red';
    if (s.includes('revision'))  return 'amber';
    return 'gray';
}
function decisionIcon(s) {
    s = String(s || '').toLowerCase();
    if (s.includes('approved'))  return 'fa-circle-check';
    if (s.includes('rejected'))  return 'fa-circle-xmark';
    if (s.includes('revision'))  return 'fa-rotate-left';
    return 'fa-clock';
}

function enforceReadOnlyMode() {
    const editPatterns = /\b(add|create|edit|update|delete|remove|save|submit|approve|reject|deactivate|activate)\b/i;
    document.querySelectorAll('button, a.btn').forEach(el => {
        if (el.closest('#navbar-container')) return;
        if (el.closest('#userSettingsPanel')) return;
        if (el.closest('.supervisor-actions')) return;
        const text = (el.textContent || '').trim();
        const aria = el.getAttribute('aria-label') || '';
        if (editPatterns.test(text) || editPatterns.test(aria)) {
            el.classList.add('d-none');
            el.setAttribute('aria-hidden', 'true');
        }
    });
}

function wireShiftDownload() {
    document.getElementById('supDownloadShift')?.addEventListener('click', downloadShiftSummary);
}

async function downloadShiftSummary() {
    try {
        const res = await fetch(`${API_BASE_URL}/reports/get_supervisor_summary.php`, {
            credentials: 'include',
            cache: 'no-store',
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed');

        const lines = [
            ['Dr. R Pharmacy — Supervisor Shift Summary'],
            [`Generated: ${new Date().toLocaleString()}`],
            [],
            ['Metric', 'Value'],
            ['Pending Purchase Requests', data.pending_purchase_requests],
            ['Batches Expiring Within 30 Days', data.expiring_within_30],
            ['Out-of-Stock Products', data.out_of_stock_products],
        ];

        const csv = lines
            .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `supervisor-shift-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (e) {
        alert('Could not download shift summary: ' + e.message);
    }
}

function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}