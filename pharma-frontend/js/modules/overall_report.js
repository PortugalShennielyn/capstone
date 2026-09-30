import API_BASE_URL from '../config/config.js';

let cachedReport = null;

export function initOverallReport() {
    const button = document.getElementById('generateOverallReport');
    if (!button) return;

    button.addEventListener('click', () => generateOverallReport(button));

    document.getElementById('overallPrintBtn')?.addEventListener('click', printReport);
    document.getElementById('overallDownloadBtn')?.addEventListener('click', downloadCsv);
}

async function generateOverallReport(button) {
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating…';

    const body = document.getElementById('overallReportBody');
    body.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="mt-3 text-muted">Generating consolidated report…</p>
        </div>`;

    const modalEl = document.getElementById('overallReportModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    try {
        const params = new URLSearchParams(location.search);
        const url = `${API_BASE_URL}/reports/get_overall_report.php?${params.toString()}`;

        const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
        const data = await res.json();

        if (!res.ok || data.status !== 'success') {
            throw new Error(data.message || 'Unable to generate the overall report.');
        }

        cachedReport = data;
        body.innerHTML = renderReportHtml(data);
    } catch (err) {
        body.innerHTML = `<div class="overall-error">
            <i class="fa-solid fa-circle-exclamation me-2"></i>
            ${escapeHtml(err.message)}
        </div>`;
    } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
    }
}

function renderReportHtml(data) {
    const sections = Object.values(data.sections || {});
    const generated = data.generated || new Date().toISOString();
    const pharmacyName = data.system?.pharmacy_name || 'Dr. R Pharmacy';
    const dateRange = data.system?.date_range
        ? `${data.system.date_range.start} → ${data.system.date_range.end}`
        : 'Default period';

    const header = `
        <div style="text-align:center;margin-bottom:24px;">
            <h2 style="color:#6b21a8;font-size:1.25rem;margin:0 0 4px;font-weight:800;">${escapeHtml(pharmacyName)}</h2>
            <h1 style="font-size:1.6rem;margin:0 0 6px;font-weight:800;">Overall Report</h1>
            <p style="color:#64748b;font-size:0.85rem;margin:0;">${escapeHtml(dateRange)}</p>
            <p style="color:#94a3b8;font-size:0.75rem;margin:4px 0 0;">Generated ${escapeHtml(new Date(generated).toLocaleString())}</p>
        </div>`;

    const sectionHtml = sections.map(section => {
        if (section.error) {
            return `
                <div class="overall-section">
                    <h3><i class="fa-solid fa-circle-exclamation"></i> ${titleCase(section.category)}</h3>
                    <div class="overall-error">${escapeHtml(section.error)}</div>
                </div>`;
        }

        const cards = (section.summary || []).map(card => `
            <div class="overall-summary-card">
                <span>${escapeHtml(card.title || '')}</span>
                <strong>${formatValue(card.value, card.format)}</strong>
            </div>
        `).join('');

        const rowCount = (section.rows || []).length;
        const note = rowCount === 0
            ? '<p style="color:#94a3b8;font-size:0.8rem;margin-top:8px;">No detailed rows for this period.</p>'
            : `<p style="color:#64748b;font-size:0.78rem;margin-top:8px;">${rowCount} detailed row${rowCount === 1 ? '' : 's'} available in the full report.</p>`;

        return `
            <div class="overall-section">
                <h3><i class="fa-solid fa-circle-check"></i> ${titleCase(section.category)}</h3>
                ${cards ? `<div class="overall-summary-grid">${cards}</div>` : ''}
                ${note}
            </div>`;
    }).join('');

    return header + sectionHtml;
}

function titleCase(s) {
    return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(value, type) {
    const n = Number(value || 0);
    if (type === 'currency') {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);
    }
    return new Intl.NumberFormat('en-PH').format(n);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function printReport() {
    const content = document.getElementById('overallReportBody')?.innerHTML || '';
    const win = window.open('', '_blank');
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Overall Report — Dr. R Pharmacy</title>
            <style>
                body { font-family: Inter, Arial, sans-serif; padding: 32px; color: #0f172a; }
                h1, h2, h3 { margin: 0 0 12px; }
                .overall-section { margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; }
                .overall-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; }
                .overall-summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
                .overall-summary-card span { display:block; font-size: 10px; color:#64748b; text-transform: uppercase; }
                .overall-summary-card strong { display:block; font-size: 14px; margin-top: 2px; }
                .overall-error { color:#991b1b; background:#fee2e2; padding:6px 10px; border-radius:6px; }
                @media print { body { padding: 16px; } }
            </style>
        </head>
        <body>${content}</body>
        </html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 350);
}

function downloadCsv() {
    if (!cachedReport) { alert('Generate the report first.'); return; }

    const lines = [];
    const pharmacyName = cachedReport.system?.pharmacy_name || 'Dr. R Pharmacy';
    const dateRange = cachedReport.system?.date_range
        ? `${cachedReport.system.date_range.start} → ${cachedReport.system.date_range.end}`
        : 'Default period';

    lines.push([pharmacyName]);
    lines.push(['Overall Report']);
    lines.push([`Date Range: ${dateRange}`]);
    lines.push([`Generated: ${cachedReport.generated}`]);
    lines.push([]);

    Object.values(cachedReport.sections || {}).forEach(section => {
        lines.push([`── ${titleCase(section.category).toUpperCase()} ──`]);
        if (section.error) {
            lines.push(['Error', section.error]);
            lines.push([]);
            return;
        }
        lines.push(['Metric', 'Value']);
        (section.summary || []).forEach(card => {
            lines.push([card.title || '', formatValue(card.value, card.format)]);
        });
        lines.push([]);
    });

    const csv = lines.map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overall-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}