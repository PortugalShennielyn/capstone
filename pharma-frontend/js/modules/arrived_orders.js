import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

let activeReceiveOrder = null;
let lastReceivingReport = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function fetchJson(url, options = {}) {
    const data = await PharmaUtils.safeFetch(url, { credentials: 'include', ...options });

    if (data.success === false) {
        const detail = data.error ? ` ${data.error}` : '';
        throw new Error(`${data.message || 'Request failed.'}${detail}`);
    }

    return data;
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

function statusBadge(status) {
    return `<span class="badge text-white" style="background:#8b5cf6">${escapeHtml(status)}</span>`;
}

function listText(values) {
    if (Array.isArray(values)) return values.map((value) => escapeHtml(value)).join(', ');
    return escapeHtml(values || 'None');
}

function numberedList(values, options = {}) {
    const list = Array.isArray(values) ? values : [];
    const plain = options.plain ? ' table-line-list-plain' : '';

    if (list.length === 0) return '<span class="text-muted">None</span>';

    return `
        <ol class="table-line-list${plain}">
            ${list.map((value, index) => `
                <li>
                    ${options.plain ? '' : `<span class="line-index">${index + 1}.</span>`}
                    <span class="line-text">${escapeHtml(value)}</span>
                </li>
            `).join('')}
        </ol>
    `;
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }

    localStorage.setItem('drpTheme', theme);
}

function renderArrivedOrders(orders) {
    const body = document.querySelector('#table-arrived-orders tbody');
    const count = document.getElementById('arrivedOrderCount');
    if (!body) return;

    if (count) count.textContent = String(orders.length);

    if (orders.length === 0) {
        body.innerHTML = '<tr><td colspan="10" class="empty-row">No arrived purchase orders ready for receiving.</td></tr>';
        return;
    }

    body.innerHTML = orders.map((order) => `
        <tr>
            <td>${formatDate(order.order_date)}</td>
            <td>${escapeHtml(order.po_number)}</td>
            <td>${escapeHtml(order.supplier_name)}</td>
            <td>${numberedList(order.item_names || (order.items || []).map((item) => item.product_name))}</td>
            <td>${numberedList(Array.isArray(order.brand_names) ? order.brand_names : (order.items || []).map((item) => item.brand_name))}</td>
            <td>${numberedList(order.quantities || (order.items || []).map((item) => item.quantity), { plain: true })}</td>
            <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
            <td>${formatDate(order.expected_delivery_date)}</td>
            <td>${statusBadge(order.status)}</td>
            <td>
                <div class="arrived-actions">
                    <button class="btn btn-sm btn-outline-primary view-arrived-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success receive-arrived-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Receive Items">
                        <i class="fa-solid fa-boxes-packing"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function loadArrivedOrders() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_arrived_orders.php`);
        renderArrivedOrders(data.purchase_orders || []);
    } catch (error) {
        renderArrivedOrders([]);
        PharmaUtils.toast.error(error.message);
    }
}

async function getPurchaseOrder(poId) {
    const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_order.php?po_id=${encodeURIComponent(poId)}`);
    return data.purchase_order;
}

function detailGrid(order) {
    return `
        <div class="detail-box"><span>PO Number</span><strong>${escapeHtml(order.po_number)}</strong></div>
        <div class="detail-box"><span>Supplier Name</span><strong>${escapeHtml(order.supplier_name)}</strong></div>
        <div class="detail-box"><span>Order Date</span><strong>${formatDate(order.order_date)}</strong></div>
        <div class="detail-box"><span>Payment Terms</span><strong>${escapeHtml(order.payment_terms || 'Not set')}</strong></div>
        <div class="detail-box"><span>Expected Delivery</span><strong>${formatDate(order.expected_delivery_date)}</strong></div>
        <div class="detail-box"><span>Status</span><strong>${escapeHtml(order.status)}</strong></div>
    `;
}

async function openViewOrder(poId) {
    try {
        const order = await getPurchaseOrder(poId);
        document.getElementById('viewArrivedPoNumber').textContent = `${order.po_number} · ${order.supplier_name}`;
        document.getElementById('viewArrivedDetails').innerHTML = detailGrid(order);
        document.getElementById('viewArrivedItems').innerHTML = order.items.map((item) => `
            <tr>
                <td>${escapeHtml(item.product_name)}</td>
                <td>${escapeHtml(item.brand_name)}</td>
                <td>${escapeHtml(item.quantity)}</td>
                <td>${escapeHtml(item.received_quantity || 0)}</td>
                <td>${escapeHtml(item.damaged_quantity || 0)}</td>
                <td>${escapeHtml(item.returned_quantity || 0)}</td>
            </tr>
        `).join('');
        bootstrap.Modal.getOrCreateInstance(document.getElementById('viewArrivedOrderModal')).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function renderReceiveItems(order) {
    const body = document.querySelector('#table-arrived-receive-items tbody');
    if (!body) return;

    body.innerHTML = order.items.map((item) => `
        <tr data-po-item-id="${escapeHtml(item.po_item_id)}">
            <td class="product-cell">${escapeHtml(item.product_name)}</td>
            <td class="brand-cell">${escapeHtml(item.brand_name)}</td>
            <td>${escapeHtml(item.quantity)}</td>
            <td>${peso(item.price)}</td>
            <td><input class="form-control form-control-sm received-qty-input" type="number" min="0" max="${escapeHtml(item.quantity)}" step="1" value="${escapeHtml(item.quantity)}"></td>
            <td><input class="form-control form-control-sm damaged-qty-input" type="number" min="0" max="${escapeHtml(item.quantity)}" step="1" value="0"></td>
            <td>
                <select class="form-select form-select-sm damage-action-input" disabled>
                    <option value="none">None</option>
                    <option value="return">Return to Supplier</option>
                    <option value="keep">Keep as Damaged</option>
                </select>
            </td>
            <td><input class="form-control form-control-sm expiry-date-input date-input" type="date"></td>
            <td><textarea class="form-control form-control-sm receive-remarks-input" rows="1"></textarea></td>
        </tr>
    `).join('');
}

function orderTotal(order) {
    if (Number(order?.total_amount || 0) > 0) {
        return Number(order.total_amount);
    }

    return (order?.items || []).reduce((total, item) => {
        return total + (Number(item.quantity || 0) * Number(item.price || 0));
    }, 0);
}

function numericInputValue(input) {
    const value = Number(input?.value || 0);
    return Number.isFinite(value) ? value : 0;
}

function wholeQuantity(input) {
    return numericInputValue(input);
}

function supplierDiscountValue() {
    const input = document.getElementById('receiveSupplierDiscount');
    if (!input || input.value === '') return 0;
    const value = Number(input.value);
    return Number.isFinite(value) ? value : Number.NaN;
}

function paymentSummary() {
    const originalTotal = orderTotal(activeReceiveOrder);
    const supplierDiscount = supplierDiscountValue();
    let supplierCredit = 0;
    let acceptedGoods = 0;
    let rejectedGoods = 0;
    const errors = [];

    if (!Number.isFinite(supplierDiscount)) {
        errors.push('Supplier discount must be a valid amount.');
    } else if (supplierDiscount < 0) {
        errors.push('Supplier discount cannot be negative.');
    }

    document.querySelectorAll('#table-arrived-receive-items tbody tr').forEach((row) => {
        const poItemId = row.dataset.poItemId;
        const orderItem = activeReceiveOrder?.items.find((item) => String(item.po_item_id) === String(poItemId));
        const receivedQuantity = wholeQuantity(row.querySelector('.received-qty-input'));
        const damagedQuantity = wholeQuantity(row.querySelector('.damaged-qty-input'));
        const actionInput = row.querySelector('.damage-action-input');
        const damageAction = actionInput?.value || 'none';
        const orderedQuantity = Number(orderItem?.quantity || 0);
        const unitPrice = Number(orderItem?.price || 0);
        const rejectedQuantity = damagedQuantity;
        const goodQuantity = receivedQuantity - rejectedQuantity;
        const itemCredit = damageAction === 'return' ? Math.max(0, rejectedQuantity) * unitPrice : 0;

        supplierCredit += itemCredit;
        acceptedGoods += Math.max(0, goodQuantity);
        rejectedGoods += Math.max(0, rejectedQuantity);

        if (damagedQuantity <= 0 && actionInput) {
            actionInput.value = 'none';
            actionInput.disabled = true;
        } else if (actionInput) {
            actionInput.disabled = false;
            if (damageAction === 'none') {
                errors.push('Select a damage action when damaged quantity is greater than zero.');
            }
        }

        if (receivedQuantity < 0 || damagedQuantity < 0) {
            errors.push('Quantities cannot be negative.');
        }
        if (![receivedQuantity, damagedQuantity].every(Number.isInteger)) {
            errors.push('Quantities must be whole numbers.');
        }
        if (receivedQuantity > orderedQuantity) {
            errors.push('Received quantity cannot exceed ordered quantity.');
        }
        if (damagedQuantity > receivedQuantity) {
            errors.push('Damaged quantity cannot exceed received quantity.');
        }
    });

    const finalAmount = originalTotal - supplierCredit - (Number.isFinite(supplierDiscount) ? Math.max(0, supplierDiscount) : 0);

    return {
        originalTotal,
        supplierCredit,
        supplierDiscount: Number.isFinite(supplierDiscount) ? Math.max(0, supplierDiscount) : 0,
        finalAmount,
        acceptedGoods,
        rejectedGoods,
        hasRejected: rejectedGoods > 0,
        hasAdjustment: supplierCredit !== 0 || (Number.isFinite(supplierDiscount) && supplierDiscount !== 0),
        valid: errors.length === 0,
        errors: [...new Set(errors)]
    };
}

function renderPaymentSummary() {
    const summary = paymentSummary();
    const original = document.getElementById('receiveOriginalTotal');
    const rejected = document.getElementById('receiveRejectedQty');
    const credit = document.getElementById('receiveSupplierCredit');
    const finalAmount = document.getElementById('receiveFinalAmount');
    const validation = document.getElementById('receiveValidationMessage');
    const confirmButton = document.getElementById('btnConfirmArrivedReceive');

    if (original) original.textContent = peso(summary.originalTotal);
    if (rejected) rejected.textContent = `${summary.rejectedGoods} items`;
    if (credit) credit.textContent = `-${peso(summary.supplierCredit)}`;
    if (finalAmount) finalAmount.textContent = peso(summary.finalAmount);
    if (validation) validation.textContent = summary.errors[0] || '';
    if (confirmButton) confirmButton.disabled = !summary.valid;
}

async function openReceiveOrder(poId) {
    try {
        activeReceiveOrder = await getPurchaseOrder(poId);
        document.getElementById('receiveArrivedPoNumber').textContent = activeReceiveOrder.po_number;
        document.getElementById('receiveArrivedSupplierName').textContent = activeReceiveOrder.supplier_name;
        document.getElementById('receiveArrivedRemarks').value = '';
        const supplierDiscount = document.getElementById('receiveSupplierDiscount');
        if (supplierDiscount) supplierDiscount.value = '0';
        renderReceiveItems(activeReceiveOrder);
        renderPaymentSummary();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('receiveArrivedOrderModal')).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function reportNumber(poNumber) {
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `RR-${stamp}-${String(poNumber || 'PO').replace(/[^A-Za-z0-9]+/g, '').slice(-6)}`;
}

function reportRows(payload) {
    return payload.items.map((payloadItem) => {
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(payloadItem.po_item_id)) || {};
        const receivedQty = Number(payloadItem.received_quantity || 0);
        const damagedQty = Number(payloadItem.damaged_quantity || 0);
        const goodQty = Math.max(0, receivedQty - damagedQty);
        const unitCost = Number(orderItem.price || 0);
        const lineTotal = receivedQty * unitCost;
        const supplierCredit = payloadItem.damage_action === 'return' ? damagedQty * unitCost : 0;
        const actionLabel = payloadItem.damage_action === 'return'
            ? 'Return to Supplier'
            : (payloadItem.damage_action === 'keep' ? 'Keep as Damaged' : 'None');
        return `
            <tr>
                <td>${escapeHtml(orderItem.product_name)}</td>
                <td>${escapeHtml(orderItem.brand_name)}</td>
                <td>${escapeHtml(orderItem.quantity)}</td>
                <td>${receivedQty}</td>
                <td>${goodQty}</td>
                <td>${damagedQty}</td>
                <td>${escapeHtml(actionLabel)}</td>
                <td>${peso(unitCost)}</td>
                <td>${peso(lineTotal)}</td>
                <td>${escapeHtml(payloadItem.expiry_date || 'Not set')}</td>
                <td>${escapeHtml(payloadItem.remarks || '')}</td>
            </tr>
        `;
    }).join('');
}

function buildReceivingReport(payload, response) {
    const summary = paymentSummary();
    const now = new Date();
    const receivedBy = document.querySelector('.profile-name, #navbarUserName, [data-user-name]')?.textContent?.trim() || 'Admin';
    const items = payload.items.map((payloadItem) => {
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(payloadItem.po_item_id)) || {};
        const receivedQty = Number(payloadItem.received_quantity || 0);
        const damagedQty = Number(payloadItem.damaged_quantity || 0);
        const goodQty = Math.max(0, receivedQty - damagedQty);
        const unitCost = Number(orderItem.price || 0);
        const supplierCredit = payloadItem.damage_action === 'return' ? damagedQty * unitCost : 0;
        const actionLabel = payloadItem.damage_action === 'return'
            ? 'Return to Supplier'
            : (payloadItem.damage_action === 'keep' ? 'Keep as Damaged' : 'None');
        return {
            product: orderItem.product_name || '',
            brand: orderItem.brand_name || '',
            orderedQty: Number(orderItem.quantity || 0),
            unitLabel: orderItem.purchase_unit || orderItem.unit || 'packs',
            receivedQty,
            goodQty,
            damagedQty,
            damageAction: actionLabel,
            unitCost,
            supplierCredit,
            lineTotal: receivedQty * unitCost,
            expiryDate: payloadItem.expiry_date || 'Not set',
            remarks: payloadItem.remarks || ''
        };
    });
    return {
        pharmacy: {
            name: 'Dr. R Pharmacy',
            address: 'Pharmacy address not configured',
            contact: 'Contact number not configured',
            email: ''
        },
        reportNumber: reportNumber(activeReceiveOrder.po_number),
        poNumber: activeReceiveOrder.po_number,
        supplierName: activeReceiveOrder.supplier_name,
        supplierAddress: activeReceiveOrder.supplier_address || 'Not available',
        deliveryDate: formatDate(activeReceiveOrder.expected_delivery_date),
        receivedAt: now.toLocaleString('en-PH'),
        receivedBy,
        paymentTerms: activeReceiveOrder.payment_terms || 'Not set',
        status: response.po_status || '',
        remarks: payload.remarks || '',
        summary: {
            totalOrderedQty: items.reduce((total, item) => total + item.orderedQty, 0),
            totalReceivedQty: items.reduce((total, item) => total + item.receivedQty, 0),
            totalAcceptedQty: items.reduce((total, item) => total + item.goodQty, 0),
            totalRejectedQty: items.reduce((total, item) => total + item.damagedQty, 0),
            supplierCredit: summary.supplierCredit,
            supplierDiscount: summary.supplierDiscount,
            finalPayment: summary.finalAmount
        },
        items
    };
}

function renderReceivingReport(report) {
    const content = document.getElementById('receivingReportContent');
    if (!content || !activeReceiveOrder) return;
    const unitLabel = report.items.find((item) => item.unitLabel)?.unitLabel || 'packs';
    content.innerHTML = `
        <div class="receipt-center">
            <h3 class="receipt-title">${escapeHtml(report.pharmacy.name)}</h3>
            <div>${escapeHtml(report.pharmacy.address)}</div>
            <div>${escapeHtml(report.pharmacy.contact)}</div>
        </div>
        <div class="receipt-subtitle">Goods Received Note</div>
        <div class="receipt-line"><span>GRN No:</span><span>${escapeHtml(report.reportNumber)}</span></div>
        <div class="receipt-line"><span>PO No:</span><span>${escapeHtml(report.poNumber)}</span></div>
        <div class="receipt-line"><span>Supplier:</span><span>${escapeHtml(report.supplierName)}</span></div>
        <div class="receipt-line"><span>Received By:</span><span>${escapeHtml(report.receivedBy)}</span></div>
        <div class="receipt-line"><span>Received Date:</span><span>${escapeHtml(report.receivedAt)}</span></div>
        <div class="receipt-line"><span>Status:</span><span>${escapeHtml(report.status)}</span></div>
        <div class="receipt-line"><span>Payment Terms:</span><span>${escapeHtml(report.paymentTerms)}</span></div>
        <div class="receipt-divider"></div>
        <div class="receipt-subtitle">Items Received</div>
        <div>
            ${report.items.map((item, index) => `
                <div class="receipt-item">
                    <div class="receipt-item-name">${index + 1}. ${escapeHtml(item.product)}</div>
                    <div class="receipt-item-detail">Brand: ${escapeHtml(item.brand)}</div>
                    <div class="receipt-item-detail">Ordered: ${item.orderedQty} ${escapeHtml(item.unitLabel)}</div>
                    <div class="receipt-item-detail">Received: ${item.receivedQty}</div>
                    <div class="receipt-item-detail">Good: ${item.goodQty}</div>
                    <div class="receipt-item-detail">Damaged: ${item.damagedQty}</div>
                    <div class="receipt-item-detail">Action: ${escapeHtml(item.damageAction)}</div>
                    <div class="receipt-item-detail">Unit Cost: ${peso(item.unitCost)}</div>
                    <div class="receipt-item-detail">Credit: -${peso(item.supplierCredit)}</div>
                    <div class="receipt-item-detail">Expiry: ${escapeHtml(item.expiryDate)}</div>
                    ${item.remarks ? `<div class="receipt-item-detail">Remarks: ${escapeHtml(item.remarks)}</div>` : ''}
                </div>
            `).join('')}
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-subtitle">Summary</div>
        <div class="receipt-line"><span>Total Ordered:</span><span>${report.summary.totalOrderedQty} ${escapeHtml(unitLabel)}</span></div>
        <div class="receipt-line"><span>Total Received:</span><span>${report.summary.totalReceivedQty} ${escapeHtml(unitLabel)}</span></div>
        <div class="receipt-line"><span>Total Good:</span><span>${report.summary.totalAcceptedQty} ${escapeHtml(unitLabel)}</span></div>
        <div class="receipt-line"><span>Total Damaged:</span><span>${report.summary.totalRejectedQty} ${escapeHtml(unitLabel)}</span></div>
        <div class="receipt-line"><span>Supplier Credit:</span><span>-${peso(report.summary.supplierCredit)}</span></div>
        <div class="receipt-line"><span>Supplier Discount:</span><span>-${peso(report.summary.supplierDiscount)}</span></div>
        <div class="receipt-final receipt-line"><span>FINAL PAYMENT:</span><span>${peso(report.summary.finalPayment)}</span></div>
        <div class="receipt-divider"></div>
        <div><strong>Remarks:</strong></div>
        <div>${escapeHtml(report.remarks || 'None')}</div>
        <div class="receipt-signatures">
            <div>Received By: __________</div>
            <div>Checked By: __________</div>
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-center">Thank you.</div>
    `;
}

function receivePayload() {
    if (!activeReceiveOrder) throw new Error('No arrived purchase order selected.');

    const items = [];
    const summary = paymentSummary();

    if (!summary.valid) {
        throw new Error(summary.errors[0] || 'Please review the receiving quantities.');
    }

    document.querySelectorAll('#table-arrived-receive-items tbody tr').forEach((row) => {
        const poItemId = row.dataset.poItemId;
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(poItemId));
        const receivedQuantity = Number(row.querySelector('.received-qty-input')?.value || 0);
        const damagedQuantity = Number(row.querySelector('.damaged-qty-input')?.value || 0);
        const damageAction = row.querySelector('.damage-action-input')?.value || 'none';
        const expiryDate = row.querySelector('.expiry-date-input')?.value || '';
        const remarks = row.querySelector('.receive-remarks-input')?.value || '';
        const orderedQuantity = Number(orderItem?.quantity || 0);

        if (receivedQuantity < 0 || damagedQuantity < 0) {
            throw new Error('Received and damaged quantities cannot be negative.');
        }

        if (receivedQuantity > orderedQuantity) {
            throw new Error('Received quantity cannot exceed ordered quantity.');
        }

        if (damagedQuantity > receivedQuantity) {
            throw new Error('Damaged quantity cannot be greater than received quantity.');
        }

        if (damagedQuantity > 0 && damageAction === 'none') {
            throw new Error('Select a damage action when damaged quantity is greater than zero.');
        }

        items.push({
            po_item_id: poItemId,
            received_quantity: receivedQuantity,
            damaged_quantity: damagedQuantity,
            damage_action: damageAction,
            returned_quantity: damageAction === 'return' ? damagedQuantity : 0,
            expiry_date: expiryDate,
            remarks
        });
    });

    return {
        po_id: activeReceiveOrder.po_id,
        remarks: document.getElementById('receiveArrivedRemarks')?.value || '',
        amount_paid: summary.finalAmount,
        supplier_discount: summary.supplierDiscount,
        additional_amount: summary.supplierDiscount,
        items
    };
}

function downloadReceivingReportPdf() {
    if (!lastReceivingReport) return;
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
        window.print();
        return;
    }

    const report = lastReceivingReport;
    const unitLabel = report.items.find((item) => item.unitLabel)?.unitLabel || 'packs';
    const estimatedHeight = Math.max(180, 110 + (report.items.length * 58));
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, estimatedHeight] });
    const width = 80;
    const margin = 5;
    const contentWidth = width - (margin * 2);
    let y = 7;

    const addWrapped = (text, options = {}) => {
        doc.setFont('courier', options.bold ? 'bold' : 'normal');
        doc.setFontSize(options.size || 9);
        const lines = doc.splitTextToSize(String(text ?? ''), contentWidth);
        doc.text(lines, options.center ? width / 2 : margin, y, { align: options.center ? 'center' : 'left' });
        y += lines.length * ((options.size || 9) * 0.42) + (options.gap ?? 1.5);
    };
    const addLine = (label, value) => addWrapped(`${label} ${value}`);
    const divider = () => {
        doc.setDrawColor(0, 0, 0);
        doc.line(margin, y, width - margin, y);
        y += 4;
    };

    doc.setTextColor(0, 0, 0);
    addWrapped(report.pharmacy.name.toUpperCase(), { center: true, bold: true, size: 12, gap: 1 });
    addWrapped(report.pharmacy.address, { center: true, size: 8, gap: .5 });
    addWrapped(report.pharmacy.contact, { center: true, size: 8, gap: 3 });
    addWrapped('GOODS RECEIVED NOTE', { center: true, bold: true, size: 10, gap: 3 });
    addLine('GRN No:', report.reportNumber);
    addLine('PO No:', report.poNumber);
    addLine('Supplier:', report.supplierName);
    addLine('Received By:', report.receivedBy);
    addLine('Received Date:', report.receivedAt);
    addLine('Status:', report.status);
    addLine('Payment Terms:', report.paymentTerms);
    divider();
    addWrapped('ITEMS RECEIVED', { center: true, bold: true, size: 10 });
    report.items.forEach((item, index) => {
        addWrapped(`${index + 1}. ${item.product}`, { bold: true });
        addWrapped(`   Brand: ${item.brand}`);
        addWrapped(`   Ordered: ${item.orderedQty} ${item.unitLabel}`);
        addWrapped(`   Received: ${item.receivedQty}`);
        addWrapped(`   Good: ${item.goodQty}`);
        addWrapped(`   Damaged: ${item.damagedQty}`);
        addWrapped(`   Action: ${item.damageAction}`);
        addWrapped(`   Unit Cost: ${peso(item.unitCost)}`);
        addWrapped(`   Credit: -${peso(item.supplierCredit)}`);
        addWrapped(`   Expiry: ${item.expiryDate}`, { gap: 3 });
    });
    divider();
    addWrapped('SUMMARY', { center: true, bold: true, size: 10 });
    addLine('Total Ordered:', `${report.summary.totalOrderedQty} ${unitLabel}`);
    addLine('Total Received:', `${report.summary.totalReceivedQty} ${unitLabel}`);
    addLine('Total Good:', `${report.summary.totalAcceptedQty} ${unitLabel}`);
    addLine('Total Damaged:', `${report.summary.totalRejectedQty} ${unitLabel}`);
    addLine('Supplier Credit:', `-${peso(report.summary.supplierCredit)}`);
    addLine('Supplier Discount:', `-${peso(report.summary.supplierDiscount)}`);
    addWrapped(`FINAL PAYMENT: ${peso(report.summary.finalPayment)}`, { bold: true, size: 11, gap: 4 });
    divider();
    addWrapped('Remarks:', { bold: true });
    addWrapped(report.remarks || 'None', { gap: 6 });
    addWrapped('Received By: __________');
    addWrapped('Checked By: __________', { gap: 5 });
    addWrapped('Thank you.', { center: true });
    doc.save(`${report.reportNumber}.pdf`);
}

async function confirmReceive() {
    try {
        const payload = receivePayload();
        PharmaUtils.modal.loading('Receiving Arrived Order...');
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/receive_purchase_order.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        PharmaUtils.modal.close();
        bootstrap.Modal.getInstance(document.getElementById('receiveArrivedOrderModal'))?.hide();
        lastReceivingReport = buildReceivingReport(payload, data);
        renderReceivingReport(lastReceivingReport);
        bootstrap.Modal.getOrCreateInstance(document.getElementById('receivingSuccessModal'))?.show();
        PharmaUtils.toast.success(data.has_adjustment
            ? 'Received good items, recorded damaged items, and moved the PO to Complete Delivery.'
            : data.message);
        await loadArrivedOrders();
    } catch (error) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to receive arrived order', error.message);
    }
}

function initArrivedOrders() {
    setTheme(localStorage.getItem('drpTheme') || 'light');

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });
    document.getElementById('btnRefreshArrivedOrders')?.addEventListener('click', loadArrivedOrders);
    document.getElementById('btnConfirmArrivedReceive')?.addEventListener('click', confirmReceive);
    document.getElementById('receiveSupplierDiscount')?.addEventListener('input', (event) => {
        if (Number(event.target.value || 0) < 0) event.target.value = '0';
        renderPaymentSummary();
    });
    document.getElementById('table-arrived-receive-items')?.addEventListener('input', (event) => {
        if (event.target.closest('.received-qty-input, .damaged-qty-input')) {
            if (Number(event.target.value || 0) < 0) event.target.value = '0';
            renderPaymentSummary();
        }
    });
    document.getElementById('table-arrived-receive-items')?.addEventListener('change', (event) => {
        if (event.target.closest('.damage-action-input')) renderPaymentSummary();
    });
    document.getElementById('btnViewReceivingReport')?.addEventListener('click', () => {
        bootstrap.Modal.getInstance(document.getElementById('receivingSuccessModal'))?.hide();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('receivingReportModal'))?.show();
    });
    document.getElementById('btnDownloadReceivingPdf')?.addEventListener('click', downloadReceivingReportPdf);
    document.getElementById('btnDownloadReceivingPdfFromReport')?.addEventListener('click', downloadReceivingReportPdf);
    document.getElementById('table-arrived-orders')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('.view-arrived-btn');
        const receiveButton = event.target.closest('.receive-arrived-btn');

        if (viewButton) openViewOrder(viewButton.dataset.poId);
        if (receiveButton) openReceiveOrder(receiveButton.dataset.poId);
    });

    loadArrivedOrders();
}

initArrivedOrders();
