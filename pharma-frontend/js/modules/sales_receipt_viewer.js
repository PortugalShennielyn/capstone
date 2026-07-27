import API_BASE_URL from '../config/config.js';

let shellReady = false;

const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const plainMoney = (value) => Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const dateText = (value) => {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

function injectStyles() {
    if (document.getElementById('salesReceiptViewerStyles')) return;
    const style = document.createElement('style');
    style.id = 'salesReceiptViewerStyles';
    style.textContent = `
        #cashierReceiptPrintArea{display:none}
        .receipt-modal{position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;padding:18px}
        .receipt-modal.show{display:flex}
        .receipt-modal-backdrop{position:absolute;inset:0;background:rgba(16,25,54,.46)}
        .receipt-modal-panel{position:relative;z-index:1;width:min(380px,96vw);max-height:94vh;display:flex;flex-direction:column;overflow:hidden;border-radius:8px;background:#fff;box-shadow:0 24px 70px rgba(16,25,54,.24)}
        .receipt-modal-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:14px;background:#fff}
        .receipt-modal-body .thermal-receipt{width:80mm;max-width:100%;margin:0 auto;padding:4mm;color:#000;background:#fff;font-family:Arial,monospace,sans-serif;font-size:11px;line-height:1.3}
        .receipt-modal-actions{flex:0 0 auto;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 14px;border-top:1px solid #e6eaf2;background:#fff}
        .receipt-modal-actions button{min-height:40px;border-radius:8px;font-size:12px;font-weight:900}
        .receipt-modal-print{border:1px solid #cbd5e1;color:#334155;background:#fff}
        .receipt-modal-close{border:0;color:#fff;background:#2563eb}
        .receipt-center{text-align:center}
        .receipt-store-name{font-size:13px;font-weight:800;text-transform:uppercase}
        .receipt-store-line,.receipt-note{font-size:10px}
        .receipt-title-print{margin-top:3mm;font-size:12px;font-weight:800;text-align:center}
        .receipt-meta-print{display:grid;gap:1mm;margin-top:3mm}
        .receipt-meta-row-print,.receipt-total-print,.receipt-payment-print{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2mm}
        .receipt-meta-row-print span:last-child,.receipt-total-print span:last-child,.receipt-payment-print span:last-child{min-width:0;text-align:right;overflow-wrap:anywhere}
        .receipt-divider-print{margin:2.5mm 0 1.5mm;border-top:1px dashed #000}
        .receipt-items-head-print,.receipt-item-print{display:grid;grid-template-columns:9mm minmax(0,1fr) 18mm;gap:1.5mm;align-items:start}
        .receipt-items-head-print{margin-bottom:1.5mm;font-weight:800}
        .receipt-item-print{margin:0 0 1.8mm}
        .receipt-item-name-print{display:block;min-width:0;overflow-wrap:anywhere}
        .receipt-item-spec-print{display:block;margin-top:.6mm;font-size:10px;overflow-wrap:anywhere}
        .receipt-money-print{text-align:right;white-space:nowrap}
        .receipt-total-print.is-grand{margin-top:1.5mm;font-size:12px;font-weight:800}
        .receipt-payment-spaced{margin-top:3mm}
        .receipt-footer-print{margin-top:3mm;text-align:center}
        @page{size:80mm auto;margin:0}
        @media print{
            html,body{width:80mm!important;max-width:80mm!important;margin:0!important;padding:0!important;background:white!important}
            body *{visibility:hidden!important}
            #cashierReceiptPrintArea,#cashierReceiptPrintArea *{visibility:visible!important}
            #cashierReceiptPrintArea{display:block!important;position:fixed!important;left:0!important;top:0!important;width:80mm!important;max-width:80mm!important;min-width:80mm!important;margin:0!important;padding:4mm!important;box-sizing:border-box!important;background:white!important;color:black!important;box-shadow:none!important;border:none!important;overflow:visible!important;font-family:Arial,monospace,sans-serif!important;font-size:11px!important;line-height:1.3!important}
            #cashierReceiptPrintArea .thermal-receipt{width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;background:white!important;color:black!important}
            .no-print,nav,aside,header,.sidebar,.navbar,.page-header,.cashier-layout,.cashier-main,.order-queue,.tabs,.search-bar,button{display:none!important}
        }
    `;
    document.head.appendChild(style);
}

function ensureShell() {
    injectStyles();
    let printArea = document.getElementById('cashierReceiptPrintArea');
    if (!printArea) {
        printArea = document.createElement('section');
        printArea.id = 'cashierReceiptPrintArea';
        printArea.setAttribute('aria-hidden', 'true');
        document.body.appendChild(printArea);
    }
    let modal = document.getElementById('salesReceiptViewerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'salesReceiptViewerModal';
        modal.className = 'receipt-modal no-print';
        modal.innerHTML = `
            <div class="receipt-modal-backdrop" data-close-sales-receipt></div>
            <section class="receipt-modal-panel" role="dialog" aria-modal="true" aria-label="Sales receipt">
                <div class="receipt-modal-body" id="salesReceiptViewerBody"></div>
                <div class="receipt-modal-actions">
                    <button class="receipt-modal-print" type="button" id="salesReceiptPrintBtn"><i class="fa-solid fa-print me-2"></i>Print Receipt</button>
                    <button class="receipt-modal-close" type="button" data-close-sales-receipt>Close</button>
                </div>
            </section>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (event) => {
            if (event.target.closest('[data-close-sales-receipt]')) modal.classList.remove('show');
        });
        modal.querySelector('#salesReceiptPrintBtn')?.addEventListener('click', () => window.print());
    }
    shellReady = true;
    return { printArea, modal, body: modal.querySelector('#salesReceiptViewerBody') };
}

async function api(path) {
    const token = sessionStorage.getItem('pharma_tab_token') || '';
    const response = await fetch(`${API_BASE_URL}${path}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: token ? { 'X-Tab-Token': token } : {},
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status === 'error') throw new Error(data.message || 'Unable to load receipt.');
    return data.data || data;
}

function itemName(item) {
    const brand = String(item.brand_name || '').trim();
    const product = String(item.product_name || 'Item').trim();
    if (brand && product && brand.toLowerCase() !== product.toLowerCase()) return `${brand} ${product}`;
    return product || brand || 'Item';
}

function itemSpec(item) {
    return [item.generic_name, item.strength || item.net_weight || item.specification]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' / ');
}

function totals(order) {
    const subtotal = Number(order.subtotal || 0);
    const discount = Number(order.cashier_discount_amount || 0);
    const taxable = Math.max(0, subtotal - discount);
    const vat = Number((taxable * 0.12) || order.vat || 0);
    const finalAmount = Number(order.final_amount || order.total_amount || taxable + vat);
    const cashReceived = Number(order.amount_paid || order.cash_received || 0);
    const change = Number(order.change_amount || Math.max(0, cashReceived - finalAmount));
    return { subtotal, discount, vat, finalAmount, cashReceived, change };
}

function receiptHtml(order) {
    const total = totals(order);
    const items = Array.isArray(order.items) ? order.items : [];
    const rows = items.length ? items.map((item) => {
        const spec = itemSpec(item);
        return `
            <div class="receipt-item-print">
                <span>${esc(Number(item.quantity || 0).toLocaleString('en-PH'))}</span>
                <span>
                    <span class="receipt-item-name-print">${esc(itemName(item))}</span>
                    ${spec ? `<span class="receipt-item-spec-print">${esc(spec)}</span>` : ''}
                </span>
                <span class="receipt-money-print">${esc(plainMoney(item.line_total))}</span>
            </div>
        `;
    }).join('') : '<div class="receipt-item-print"><span>0</span><span>No items found.</span><span class="receipt-money-print">0.00</span></div>';

    return `
        <div class="thermal-receipt">
            <div class="receipt-center">
                <div class="receipt-store-name">DOC R PHARMACY</div>
                <div class="receipt-store-line">Store Address Here</div>
                <div class="receipt-store-line">Contact No. Here</div>
            </div>
            <div class="receipt-title-print">SALES RECEIPT</div>
            <div class="receipt-meta-print">
                <div class="receipt-meta-row-print"><span>Receipt No:</span><span>${esc(order.receipt_no || '-')}</span></div>
                <div class="receipt-meta-row-print"><span>Order No:</span><span>${esc(order.order_no || '-')}</span></div>
                <div class="receipt-meta-row-print"><span>Date:</span><span>${esc(dateText(order.completed_at || order.created_at))}</span></div>
                <div class="receipt-meta-row-print"><span>Cashier:</span><span>${esc(order.cashier_name || 'Cashier')}</span></div>
                <div class="receipt-meta-row-print"><span>Sales Clerk:</span><span>${esc(order.sales_clerk_name || 'Sales Clerk')}</span></div>
                <div class="receipt-meta-row-print"><span>Customer:</span><span>${esc(order.customer_name || 'Walk-in Customer')}</span></div>
            </div>
            <div class="receipt-divider-print"></div>
            <div class="receipt-items-head-print"><span>QTY</span><span>ITEM</span><span class="receipt-money-print">AMOUNT</span></div>
            <div class="receipt-divider-print"></div>
            ${rows}
            <div class="receipt-divider-print"></div>
            <div class="receipt-total-print"><span>Subtotal:</span><span>${esc(plainMoney(total.subtotal))}</span></div>
            <div class="receipt-total-print"><span>VAT (12%):</span><span>${esc(plainMoney(total.vat))}</span></div>
            <div class="receipt-total-print"><span>Discount:</span><span>${esc(plainMoney(total.discount))}</span></div>
            <div class="receipt-total-print is-grand"><span>TOTAL:</span><span>${esc(plainMoney(total.finalAmount))}</span></div>
            <div class="receipt-payment-print receipt-payment-spaced"><span>Cash Received:</span><span>${esc(plainMoney(total.cashReceived))}</span></div>
            <div class="receipt-payment-print"><span>Change:</span><span>${esc(plainMoney(total.change))}</span></div>
            <div class="receipt-divider-print"></div>
            <div class="receipt-footer-print"><div>Thank you!</div><div class="receipt-note">This serves as your sales receipt.</div></div>
        </div>
    `;
}

export async function openSalesReceipt(orderId) {
    const { printArea, modal, body } = ensureShell();
    body.innerHTML = '<div class="empty-state">Loading receipt...</div>';
    modal.classList.add('show');
    const order = await api(`/cashier/get_cashier_order.php?order_id=${encodeURIComponent(orderId)}`);
    if (order.status_group !== 'completed') throw new Error('Receipt is available after payment is completed.');
    const html = receiptHtml(order);
    printArea.innerHTML = html;
    body.innerHTML = html;
}

export function bindSalesReceiptButtons(root = document) {
    if (!shellReady) ensureShell();
    root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-view-receipt], [data-sales-receipt-order]');
        if (!button) return;
        const orderId = button.dataset.orderId || button.dataset.receiptId || button.dataset.salesReceiptOrder;
        if (!orderId) return;
        openSalesReceipt(orderId).catch((error) => {
            const { modal, body } = ensureShell();
            modal.classList.add('show');
            body.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
        });
    });
}
