const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const peso = value => Number(value || 0).toLocaleString('en-PH', { style:'currency', currency:'PHP' });
const number = value => Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits:2 });
const date = value => value ? new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' }) : '';

function contentUnitLabel(unit, quantity) {
    const value = String(unit || 'unit').trim();
    if (Number(quantity) === 1 || /s$/i.test(value)) return value;
    if (/^pc$/i.test(value)) return 'pcs';
    if (/(?:s|x|z|ch|sh)$/i.test(value)) return `${value}es`;
    return `${value}s`;
}

function specification(item) {
    const values = [item.generic_name, item.strength, item.variant_flavor, item.size_value, item.dosage_form, item.packaging];
    return values.map(value => String(value || '').trim()).filter((value, index, all) => value && all.findIndex(candidate => candidate.toLowerCase() === value.toLowerCase()) === index).join(' · ');
}

function contactLine(order) {
    const values = [order.supplier_address, order.supplier_phone, order.supplier_email].map(value => String(value || '').trim()).filter(Boolean);
    return values.map((value, index) => `${index ? '<span class="contact-separator">●</span>' : ''}<span>${escapeHtml(value)}</span>`).join('');
}

function field(label, value) {
    const text = String(value || '').trim();
    return text ? `<div class="field"><span>${escapeHtml(label)}:</span><strong>${escapeHtml(text)}</strong></div>` : '<div class="meta-spacer" aria-hidden="true"></div>';
}

function firstPageHeader(order) {
    const contacts = contactLine(order);
    const leftMetadata = [
        field('Branch Company', 'Doc R Pharmacy - CDO'),
        field('Supplier', order.supplier_name),
        field('Order Date', date(order.order_date)),
        field('Payment Mode', order.payment_terms),
    ].join('');
    const rightMetadata = [
        field('PO No.', order.po_number),
        field('PR Reference', order.pr_number || 'Historical / Manual PO'),
        field('ETA', date(order.expected_delivery_date)),
    ].join('');
    return `<header class="supplier-heading"><div class="pharmacy-name">DOC R PHARMACY</div><div class="document-title-row"><div class="document-title">PURCHASE ORDER</div><span class="document-status">${escapeHtml(order.status || 'Draft')}</span></div><h1>${escapeHtml(order.supplier_name || 'Purchase Order Supplier')}</h1>${contacts ? `<div class="supplier-contact">${contacts}</div>` : ''}</header><hr class="document-rule"><section class="meta po-meta"><div class="meta-block po-meta-left">${leftMetadata}</div><div class="meta-block po-meta-right">${rightMetadata}</div></section>`;
}

function continuationHeader(order) {
    return `<header class="continuation-header"><strong>${escapeHtml(order.supplier_name || 'Purchase Order Supplier')}</strong><span>${escapeHtml(order.po_number || 'Purchase Order')} · Continued</span></header>`;
}

function tableShell() {
    return `<table class="order-table"><thead><tr><th style="width:5%">No.</th><th style="width:34%">Product / Specification</th><th style="width:18%">Contents</th><th style="width:10%">Order Qty</th><th style="width:11%">Purchase Unit</th><th style="width:11%">Supplier Price</th><th style="width:11%">Line Total</th></tr></thead><tbody></tbody></table>`;
}

function rowHtml(item, index) {
    const orderQty = Number(item.purchase_qty || item.quantity || 0);
    const conversion = Number(item.units_per_purchase_unit || 1);
    const purchaseUnit = item.purchase_unit || 'unit';
    const inventoryUnit = item.unit || 'units';
    const supplierPrice = item.price == null || item.price === '' ? null : Number(item.price) * conversion;
    const lineTotal = item.line_total == null || item.line_total === '' ? null : Number(item.line_total);
    const detail = [item.brand_name, specification(item)].filter(Boolean).join(' · ');
    const normalizedInventoryUnit = contentUnitLabel(inventoryUnit, conversion);
    return `<tr><td class="center">${index + 1}</td><td class="product"><strong>${escapeHtml(item.product_name || '-')}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}${item.pr_approved_qty == null ? '' : `<span>PR Approved: ${number(item.pr_approved_qty)} ${escapeHtml(item.pr_unit)}</span>`}</td><td class="center">1 ${escapeHtml(purchaseUnit)} = ${number(conversion)} ${escapeHtml(normalizedInventoryUnit)}</td><td class="center"><strong>${number(orderQty)}</strong></td><td class="center">${escapeHtml(purchaseUnit)}</td><td class="money">${supplierPrice === null ? '—' : peso(supplierPrice)}</td><td class="money">${lineTotal === null ? '—' : peso(lineTotal)}</td></tr>`;
}

function createPage(order, first) {
    const page = document.createElement('article');
    page.className = 'po-page';
    page.innerHTML = `<div class="page-main">${first ? firstPageHeader(order) : continuationHeader(order)}${tableShell()}</div><footer class="continuation-footer"><span>${escapeHtml(order.po_number || 'Purchase Order')} · ${escapeHtml(order.supplier_name || '')}</span><span></span></footer>`;
    return page;
}

function finalSections(order) {
    const roles = order.print_roles || {};
    const preparedName = String(roles.preparedName || '').trim();
    const preparedRole = String(roles.preparedRole || '').trim() || 'Manager';
    const approvedName = String(roles.approvedName || '').trim();
    const approvedRole = String(roles.approvedRole || '').trim() || 'Supervisor';
    const hasActualTotal = order.total_amount !== null && order.total_amount !== undefined && order.total_amount !== '';
    return { totals:hasActualTotal ? `<section class="actual-total"><span>Supplier Receipt / Actual PO Total</span><strong>${peso(order.total_amount)}</strong></section>` : '', signatures:`<section class="signatures"><div class="signature"><span class="signature-caption">Prepared By</span><div class="signature-space"></div><span class="signature-name">${escapeHtml(preparedName) || '&nbsp;'}</span><div class="signature-line" aria-hidden="true"></div><span class="signature-role">${escapeHtml(preparedRole)}</span></div><div class="signature"><span class="signature-caption">Checked &amp; Approved By</span><div class="signature-space"></div><span class="signature-name">${escapeHtml(approvedName) || '&nbsp;'}</span><div class="signature-line" aria-hidden="true"></div><span class="signature-role">${escapeHtml(approvedRole)}</span></div></section>`, footer:`<footer class="document-footer"><span>${escapeHtml(order.po_number || 'Purchase Order')} · ${escapeHtml(order.supplier_name || '')}</span><span>Doc R Pharmacy Procurement</span></footer>` };
}

function overflowing(page) {
    return page.scrollHeight > page.clientHeight + 1;
}

function makeFinal(page, order) {
    page.querySelector('.continuation-footer')?.remove();
    const sections = finalSections(order);
    page.querySelector('.page-main').insertAdjacentHTML('beforeend', sections.totals);
    page.insertAdjacentHTML('beforeend', sections.signatures + sections.footer);
}

function removeFinal(page, order) {
    page.querySelector('.actual-total')?.remove();
    page.querySelector('.signatures')?.remove();
    page.querySelector('.document-footer')?.remove();
    page.insertAdjacentHTML('beforeend', `<footer class="continuation-footer"><span>${escapeHtml(order.po_number || 'Purchase Order')} · ${escapeHtml(order.supplier_name || '')}</span><span></span></footer>`);
}

export function renderPurchaseOrderDocument(order, container) {
    container.innerHTML = '';
    const rowMarkup = (order.items || []).map(rowHtml);
    let page = createPage(order, true);
    container.appendChild(page);
    let tbody = page.querySelector('tbody');
    rowMarkup.forEach(markup => {
        tbody.insertAdjacentHTML('beforeend', markup);
        if (!overflowing(page)) return;
        const overflowRow = tbody.lastElementChild;
        overflowRow.remove();
        page = createPage(order, false);
        container.appendChild(page);
        tbody = page.querySelector('tbody');
        tbody.appendChild(overflowRow);
    });

    let pages = [...container.querySelectorAll('.po-page')];
    let last = pages.at(-1);
    makeFinal(last, order);
    if (overflowing(last)) {
        removeFinal(last, order);
        const finalPage = createPage(order, false);
        container.appendChild(finalPage);
        makeFinal(finalPage, order);
        const sourceBody = last.querySelector('tbody');
        const targetBody = finalPage.querySelector('tbody');
        const sourceRows = [...sourceBody.rows];
        const minimumRemaining = last === container.firstElementChild ? Math.ceil(sourceRows.length / 2) : 1;
        for (let index = sourceRows.length - 1; index >= minimumRemaining; index -= 1) {
            const clone = sourceRows[index].cloneNode(true);
            targetBody.prepend(clone);
            if (overflowing(finalPage)) { clone.remove(); break; }
            sourceRows[index].remove();
        }
    }

    pages = [...container.querySelectorAll('.po-page')];
    pages.forEach((current, index) => {
        const pageNumber = `Page ${index + 1} of ${pages.length}`;
        const continuation = current.querySelector('.continuation-footer span:last-child');
        const documentFooter = current.querySelector('.document-footer span:last-child');
        if (continuation) continuation.textContent = pageNumber;
        if (documentFooter) documentFooter.textContent = `Doc R Pharmacy Procurement · ${pageNumber}`;
    });
    return { pageCount:pages.length, height:container.scrollHeight };
}
