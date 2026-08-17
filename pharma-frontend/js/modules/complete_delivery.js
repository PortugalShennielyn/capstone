import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const STATUS_COLORS = {
    'Delivered': '#16a34a',
};
let deliveredOrders = [];
let currentReceiptReport = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function fetchJson(url, options = {}) {
    return PharmaUtils.safeFetch(url, { credentials: 'include', ...options });
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('drpTheme', theme);
}

function formatDate(value) {
    if (!value) return 'Not set';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime())
        ? escapeHtml(value)
        : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function peso(value) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(Number(value || 0));
}

function statusBadge(status = 'Delivered') {
    const label = status || 'Delivered';
    return `<span class="badge status-badge text-white" style="background:${STATUS_COLORS[label] || '#16a34a'}">${escapeHtml(label)}</span>`;
}

function grnNumber(poNumber, dateValue) {
    const parsedDate = dateValue ? new Date(String(dateValue).replace(' ', 'T')) : new Date();
    const validDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const stamp = validDate.toISOString().slice(0, 10).replaceAll('-', '');
    return `GRN-${stamp}-${String(poNumber || '0001').replace(/[^A-Za-z0-9]+/g, '').slice(-4).padStart(4, '0')}`;
}

function formatDateTime(value) {
    if (!value) return new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime())
        ? String(value)
        : date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function numberedList(values, options = {}) {
    const list = Array.isArray(values) ? values : [];
    const plain = options.plain ? ' plain' : '';
    if (!list.length) return '<span class="text-muted">None</span>';

    return `
        <ol class="line-list${plain}">
            ${list.map((value, index) => `
                <li>
                    ${options.plain ? '' : `<span class="idx">${index + 1}.</span>`}
                    <span class="txt">${escapeHtml(value)}</span>
                </li>
            `).join('')}
        </ol>
    `;
}

function getOrderById(poId) {
    return deliveredOrders.find(order => String(order.po_id) === String(poId));
}

async function getPurchaseOrder(poId) {
    const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_order.php?po_id=${encodeURIComponent(poId)}`);
    return data.purchase_order;
}

function receiptReportFromOrder(order, settings = {}) {
    const profile = settings.profile || {};
    const grnSettings = settings.grn || {};
    const items = (order.items || []).map((item) => {
        const receivedQty = Number(item.received_quantity || 0);
        const conversion = Math.max(1, Number(item.units_per_purchase_unit || 1));
        const damagedQty = Number(item.damaged_quantity || 0);
        const creditQty = Number(item.supplier_credit_quantity || 0);
        const unitCost = Number(item.price || 0);
        return {
            product: item.product_name || '',
            brand: item.brand_name || '',
            orderedQty: Number(item.purchase_qty || (Number(item.inventory_qty_ordered || item.quantity || 0) / conversion)),
            unitLabel: item.purchase_unit || item.unit || 'packs',
            receivedQty: receivedQty / conversion,
            inventoryEquivalent: receivedQty,
            inventoryUnit: item.unit || 'unit',
            goodQty: Math.max(0, receivedQty - damagedQty),
            damagedQty,
            damageAction: creditQty > 0 ? 'Return to Supplier' : (damagedQty > 0 ? 'Keep as Damaged' : 'None'),
            unitCost,
            supplierCredit: creditQty * unitCost,
            expiryDate: item.received_expiry_date || 'Not set',
            remarks: item.return_remarks || ''
        };
    });
    const supplierCredit = items.reduce((total, item) => total + item.supplierCredit, 0);
    const totalAmount = Number(order.total_amount || 0);
    const finalPayment = Number(order.final_payment || 0);
    const supplierDiscount = Math.max(0, totalAmount - supplierCredit - finalPayment);
    const receivedDate = order.received_date || order.delivery_date || order.order_date || '';

    return {
        pharmacyName: profile.name || 'Dr. R Pharmacy',
        pharmacyAddress: profile.address || '',
        contact: profile.contactNumber || '',
        grnNo: grnNumber(order.po_number, receivedDate),
        poNo: order.po_number || `PO-${order.po_id}`,
        supplier: order.supplier_name || 'N/A',
        receivedBy: grnSettings.receivedByName || '',
        checkedBy: '',
        approvedBy: grnSettings.approvedByName || '',
        receivedDate: formatDateTime(receivedDate),
        status: order.status || 'Delivered',
        paymentTerms: order.payment_terms || 'Not set',
        remarks: order.receiving_remarks || '',
        supplierCredit,
        supplierDiscount,
        finalPayment,
        items
    };
}

function receiptItemName(item) {
    const product = String(item.product || '').trim();
    const brand = String(item.brand || '').trim();
    if (!brand || product.toLowerCase().includes(brand.toLowerCase())) return product || brand || 'Item';
    return `${brand} ${product}`.trim();
}

function receiptDamageLabel(item) {
    if (!item.damagedQty) return 'None';
    return item.damageAction === 'Return to Supplier' ? 'Returned' : 'Kept';
}

function receiptTotals(report) {
    return {
        ordered: report.items.reduce((sum, item) => sum + item.orderedQty, 0),
        accepted: report.items.reduce((sum, item) => sum + item.goodQty, 0),
        damaged: report.items.reduce((sum, item) => sum + item.damagedQty, 0)
    };
}

function receiptDetailHtml(report) {
    return `
        <div class="receipt full-report">
            <div class="center"><strong>${escapeHtml(report.pharmacyName)}</strong></div>
            <div class="title">FULL RECEIVING REPORT</div>
            <div class="dash"></div>
            ${report.items.map((item, index) => `
                <div class="item">
                    <strong>${index + 1}. ${escapeHtml(receiptItemName(item))}</strong><br>
                    &nbsp;&nbsp;Ordered: ${item.orderedQty} ${escapeHtml(item.unitLabel)}<br>
                    &nbsp;&nbsp;Received: ${item.receivedQty}<br>
                    &nbsp;&nbsp;Inventory Equivalent: ${item.inventoryEquivalent} ${escapeHtml(item.inventoryUnit)}<br>
                    &nbsp;&nbsp;Accepted: ${item.goodQty}<br>
                    &nbsp;&nbsp;Damaged: ${item.damagedQty} (${escapeHtml(receiptDamageLabel(item))})<br>
                    &nbsp;&nbsp;Unit Cost: ${peso(item.unitCost)}<br>
                    &nbsp;&nbsp;Supplier Credit: -${peso(item.supplierCredit)}<br>
                    &nbsp;&nbsp;Expiry: ${escapeHtml(item.expiryDate)}<br>
                    &nbsp;&nbsp;Remarks: ${escapeHtml(item.remarks || 'None')}
                </div>
                <div class="dash"></div>
            `).join('')}
        </div>
    `;
}

function receiptHtml(report) {
    const totals = receiptTotals(report);
    return `
        <div class="receipt">
            <div class="center receipt-head"><strong>${escapeHtml(report.pharmacyName)}</strong><br>${escapeHtml(report.pharmacyAddress)}<br>${escapeHtml(report.contact)}</div>
            <div class="title">GOODS RECEIVED NOTE</div>
            <div class="line"><span>PO No:</span><span>${escapeHtml(report.poNo)}</span></div>
            <div class="line"><span>GRN No:</span><span>${escapeHtml(report.grnNo)}</span></div>
            <div class="line"><span>Supplier:</span><span>${escapeHtml(report.supplier)}</span></div>
            <div class="line"><span>Received:</span><span>${escapeHtml(report.receivedDate)}</span></div>
            <div class="line"><span>Received By:</span><span>${escapeHtml(report.receivedBy)}</span></div>
            <div class="line"><span>Status:</span><span>${escapeHtml(report.status)}</span></div>
            <div class="dash"></div>
            <div class="title">ITEMS</div>
            ${report.items.map((item, index) => `
                <div class="item">
                    <strong>${index + 1}. ${escapeHtml(receiptItemName(item))}</strong><br>
                    &nbsp;&nbsp;${item.orderedQty} ${escapeHtml(item.unitLabel)} x ${peso(item.unitCost)}<br>
                    &nbsp;&nbsp;Accepted: ${item.goodQty}<br>
                    &nbsp;&nbsp;Damaged: ${item.damagedQty} (${escapeHtml(receiptDamageLabel(item))})
                </div>
                <div class="dash"></div>
            `).join('')}
            <div class="title">SUMMARY</div>
            <div class="line"><span>Items Ordered</span><span>${totals.ordered}</span></div>
            <div class="line"><span>Items Accepted</span><span>${totals.accepted}</span></div>
            <div class="line"><span>Damaged</span><span>${totals.damaged}</span></div>
            <br>
            <div class="line"><span>Supplier Credit:</span><span>-${peso(report.supplierCredit)}</span></div>
            <div class="line"><span>Supplier Discount:</span><span>-${peso(report.supplierDiscount)}</span></div>
            <div class="final center">FINAL PAYMENT<br><strong>${peso(report.finalPayment)}</strong></div>
            <div class="dash"></div>
            <strong>Remarks:</strong><br>${escapeHtml(report.remarks || 'None')}
            <div class="signature">Received By:</div>
            <div class="sign-line"></div>
            <div class="signature">Checked By:</div>
            <div class="sign-line"></div>
            <div class="signature">Approved By: ${escapeHtml(report.approvedBy || '')}</div>
            <div class="sign-line"></div>
            <div class="dash"></div>
            <div class="center">Thank you.</div>
        </div>
    `;
}

function downloadReceiptPdf(report = currentReceiptReport) {
    if (!report) return;
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
        PharmaUtils.toast.error('PDF library is not available.');
        return;
    }
    const height = Math.max(180, 112 + (report.items.length * 26));
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, height] });
    const margin = 5;
    let y = 7;
    const add = (text, options = {}) => {
        doc.setFont('courier', options.bold ? 'bold' : 'normal');
        doc.setFontSize(options.size || 9);
        const lines = doc.splitTextToSize(String(text ?? ''), 70);
        doc.text(lines, options.center ? 40 : margin, y, { align: options.center ? 'center' : 'left' });
        y += lines.length * ((options.size || 9) * 0.42) + (options.gap ?? 1.5);
    };
    const dash = () => { doc.line(margin, y, 75, y); y += 3.5; };
    const pair = (label, value, options = {}) => {
        doc.setFont('courier', options.bold ? 'bold' : 'normal');
        doc.setFontSize(options.size || 9);
        doc.text(String(label), margin, y);
        doc.text(String(value), 75, y, { align: 'right' });
        y += options.gap ?? 4;
    };
    const totals = receiptTotals(report);

    add(report.pharmacyName, { center: true, bold: true, size: 12 });
    add(report.pharmacyAddress, { center: true, size: 8 });
    add(report.contact, { center: true, size: 8, gap: 3 });
    add('GOODS RECEIVED NOTE', { center: true, bold: true, size: 10, gap: 3 });
    add(`PO No: ${report.poNo}`);
    add(`GRN No: ${report.grnNo}`);
    add(`Supplier: ${report.supplier}`);
    add(`Received: ${report.receivedDate}`);
    add(`Received By: ${report.receivedBy}`);
    add(`Status: ${report.status}`);
    dash();
    add('ITEMS', { center: true, bold: true, size: 10 });
    report.items.forEach((item, index) => {
        add(`${index + 1}. ${receiptItemName(item)}`, { bold: true });
        add(`   ${item.orderedQty} ${item.unitLabel} x ${peso(item.unitCost)}`);
        add(`   Accepted: ${item.goodQty}`);
        add(`   Damaged: ${item.damagedQty} (${receiptDamageLabel(item)})`, { gap: 3 });
        dash();
    });
    add('SUMMARY', { center: true, bold: true, size: 10 });
    pair('Items Ordered', totals.ordered);
    pair('Items Accepted', totals.accepted);
    pair('Damaged', totals.damaged);
    y += 2;
    pair('Supplier Credit', `-${peso(report.supplierCredit)}`);
    pair('Supplier Discount', `-${peso(report.supplierDiscount)}`, { gap: 6 });
    add('FINAL PAYMENT', { center: true, bold: true, size: 11, gap: 1 });
    add(peso(report.finalPayment), { center: true, bold: true, size: 14, gap: 4 });
    dash();
    add('Remarks:', { bold: true });
    add(report.remarks || 'None', { gap: 5 });
    add('Received By:', { gap: 7 });
    dash();
    add('Checked By:', { gap: 7 });
    dash();
    add(`Approved By: ${report.approvedBy || ''}`, { gap: 7 });
    dash();
    add('Thank you.', { center: true });
    doc.save(`${report.grnNo}.pdf`);
}

window.__drpDownloadCompleteReceiptPdf = () => downloadReceiptPdf();

function openReceiptPreview(report) {
    currentReceiptReport = report;
    const receiptWindow = window.open('', '_blank', 'width=420,height=720');
    if (!receiptWindow) {
        PharmaUtils.toast.error('Please allow popups to view the receiving receipt.');
        return;
    }
    receiptWindow.document.write(`
        <!doctype html>
        <html>
        <head>
            <title>Goods Received Note</title>
            <style>
                body { margin: 0; color: #000; background: #f3f4f6; font-family: "Courier New", monospace; }
                .actions { display: flex; gap: 8px; justify-content: center; padding: 14px; }
                button { padding: 8px 12px; border: 1px solid #000; background: #fff; color: #000; cursor: pointer; }
                .receipt { width: 80mm; margin: 0 auto 24px; padding: 10px 12px; background: #fff; box-sizing: border-box; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
                .center { text-align: center; }
                .receipt-head strong { font-size: 14px; }
                .title { margin: 10px 0 8px; text-align: center; font-weight: 800; }
                .line { display: flex; justify-content: space-between; gap: 8px; }
                .line span:last-child { text-align: right; overflow-wrap: anywhere; }
                .dash { margin: 9px 0; border-top: 1px dashed #000; }
                .item { margin-top: 7px; overflow-wrap: anywhere; }
                .final { margin-top: 10px; font-weight: 900; font-size: 13px; }
                .final strong { display: block; margin-top: 3px; font-size: 18px; }
                .signature { margin-top: 16px; }
                .sign-line { margin-top: 14px; border-top: 1px solid #000; }
                .full-report { display: none; }
                body.show-full .receipt-summary { display: none; }
                body.show-full .full-report { display: block; }
                @media print { body { background: #fff; } .actions { display: none; } .receipt { margin: 0; width: 80mm; } }
            </style>
        </head>
        <body>
            <div class="actions">
                <button onclick="window.opener.__drpDownloadCompleteReceiptPdf && window.opener.__drpDownloadCompleteReceiptPdf()">Print / Download PDF</button>
                <button onclick="document.body.classList.toggle('show-full')">Full Report</button>
                <button onclick="window.close()">Close</button>
            </div>
            <div class="receipt-summary">${receiptHtml(report)}</div>
            ${receiptDetailHtml(report)}
        </body>
        </html>
    `);
    receiptWindow.document.close();
}

async function openDeliveredReceipt(poId) {
    try {
        const [order, settings] = await Promise.all([
            getPurchaseOrder(poId),
            fetchJson(`${API_BASE_URL}/settings/get_admin_settings.php`)
        ]);
        openReceiptPreview(receiptReportFromOrder(order, settings));
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function renderCompleteDeliveryTable(orders) {
    const body = document.querySelector('#table-complete-delivery tbody');
    const count = document.getElementById('completeDeliveryCount');
    if (!body) return;
    if (count) count.textContent = String(orders.length);

    if (!orders.length) {
        body.innerHTML = '<tr><td colspan="12" class="empty-row">No completed deliveries found.</td></tr>';
        return;
    }

    body.innerHTML = orders.map(order => {
        const items = order.items || [];
        const itemNames = order.item_names || items.map(item => item.product_name);
        const brandNames = order.brand_names || items.map(item => item.brand_name);
        const orderedQuantities = order.quantities || items.map(item => item.quantity);
        const receivedQuantities = items.map(item => Number(item.received_quantity || 0) / Math.max(1, Number(item.units_per_purchase_unit || 1)));
        const deliveryDate = order.delivery_date || order.received_date || order.expected_delivery_date || order.order_date;

        return `
            <tr>
                <td>${formatDate(deliveryDate)}</td>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td>${numberedList(itemNames)}</td>
                <td>${numberedList(brandNames)}</td>
                <td>${numberedList(orderedQuantities, { plain: true })}</td>
                <td>${numberedList(receivedQuantities, { plain: true })}</td>
                <td><span class="money-nowrap">${peso(order.total_amount)}</span></td>
                <td><span class="money-nowrap">${peso(order.final_payment)}</span></td>
                <td>${escapeHtml(order.payment_state || order.payment_status || 'Unpaid')}</td>
                <td>${statusBadge(order.status || 'Delivered')}</td>
                <td class="complete-actions-cell">
                    <div class="complete-actions">
                        <button class="btn btn-sm btn-outline-primary view-complete-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View details">
                            <i class="fa-regular fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-dark complete-receipt-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View Receiving Receipt" aria-label="View Receiving Receipt ${escapeHtml(order.po_number || '')}">
                            <i class="fa-solid fa-receipt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadCompleteDeliveries() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_orders.php?scope=complete`);
        deliveredOrders = data.purchase_orders || [];
        renderCompleteDeliveryTable(deliveredOrders);
    } catch (error) {
        deliveredOrders = [];
        renderCompleteDeliveryTable([]);
        PharmaUtils.toast.error(error.message);
    }
}

function openDetails(poId) {
    const order = getOrderById(poId);
    if (!order) return;

    const deliveryDate = order.delivery_date || order.received_date || order.expected_delivery_date || order.order_date;
    document.getElementById('completeDeliveryPoNumber').textContent = order.po_number || `PO-${order.po_id}`;
    document.getElementById('completeDeliveryDetails').innerHTML = `
        <div class="detail-box"><span>PO Number</span><strong>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</strong></div>
        <div class="detail-box"><span>Supplier</span><strong>${escapeHtml(order.supplier_name || 'N/A')}</strong></div>
        <div class="detail-box"><span>Delivery Date</span><strong>${formatDate(deliveryDate)}</strong></div>
        <div class="detail-box"><span>Total Amount</span><strong>${peso(order.total_amount)}</strong></div>
        <div class="detail-box"><span>Final Payment</span><strong>${peso(order.final_payment)}</strong></div>
        <div class="detail-box"><span>Payment Status</span><strong>${escapeHtml(order.payment_state || order.payment_status || 'Unpaid')}</strong></div>
        <div class="detail-box"><span>Status</span><strong>${escapeHtml(order.status || 'Delivered')}</strong></div>
        <div class="detail-box"><span>Remarks</span><strong>${escapeHtml(order.receiving_remarks || 'N/A')}</strong></div>
    `;

    document.getElementById('completeDeliveryItems').innerHTML = (order.items || []).map(item => `
        <tr>
            <td>${escapeHtml(item.product_name || 'N/A')}</td>
            <td>${escapeHtml(item.brand_name || 'N/A')}</td>
            <td>${escapeHtml(item.purchase_qty || item.quantity || 0)} ${escapeHtml(item.purchase_unit || item.unit || '')}</td>
            <td>${escapeHtml(Number(item.received_quantity || 0) / Math.max(1, Number(item.units_per_purchase_unit || 1)))} ${escapeHtml(item.purchase_unit || '')}<small class="d-block text-muted">${escapeHtml(item.received_quantity || 0)} ${escapeHtml(item.unit || '')} inventory</small></td>
            <td>${escapeHtml(Math.max(Number(item.damaged_quantity || 0), Number(item.returned_quantity || 0)))}</td>
            <td>${peso(item.price)}</td>
            <td>${peso(item.returned_amount)}</td>
        </tr>
    `).join('');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('completeDeliveryDetailsModal')).show();
}

setTheme(localStorage.getItem('drpTheme') || 'light');
document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
document.getElementById('btnRefreshCompleteDelivery')?.addEventListener('click', loadCompleteDeliveries);
document.getElementById('table-complete-delivery')?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.view-complete-btn');
    const receiptButton = event.target.closest('.complete-receipt-btn');
    if (viewButton) openDetails(viewButton.dataset.poId);
    if (receiptButton) openDeliveredReceipt(receiptButton.dataset.poId);
});

loadCompleteDeliveries();
