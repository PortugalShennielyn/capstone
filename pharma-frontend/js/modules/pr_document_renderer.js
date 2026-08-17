import { formatProductSpecification, formatProductPacking } from './product_specification.js?v=2';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[character]));

function displayDate(value) {
    const raw = String(value || '').slice(0, 10);
    const date = raw ? new Date(`${raw}T00:00:00`) : null;
    return date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
        : '-';
}

function inventoryQuantity(inventory, item, inventoryKey, itemKey) {
    const value = inventory?.[inventoryKey] ?? item?.[itemKey] ?? 0;
    return Number(value || 0);
}

export function renderPurchaseRequestDocument(container, request, { productById = new Map(), inventoryById = new Map() } = {}) {
    if (!container || !request) return;
    const rows = (request.items || []).map((item, index) => {
        const product = productById.get(String(item.product_id)) || item;
        const inventory = inventoryById.get(String(item.product_id)) || item;
        const shelf = inventoryQuantity(inventory, item, 'shelf_quantity', 'shelf_stock');
        const storage = inventoryQuantity(inventory, item, 'storage_quantity', 'storage_stock');
        const onHand = inventory?.on_hand ?? item?.on_hand ?? (shelf + storage);
        const identity = [product.brand_name, product.product_name].filter(Boolean).join(' - ') || 'Unnamed product';
        const baseInventoryUnit = String(item.unit || product.base_inventory_unit || '').trim();
        return `<tr><td>${index + 1}</td><td class="product-description"><strong>${escapeHtml(identity)}</strong><span>${escapeHtml(formatProductSpecification(product, item.specification || 'Not specified'))}</span></td><td>${escapeHtml(baseInventoryUnit || formatProductPacking(product, 'Unit not configured'))}</td><td>${escapeHtml(shelf)}</td><td>${escapeHtml(storage)}</td><td><strong>${escapeHtml(Number(onHand || 0))}</strong></td><td><strong>${escapeHtml(item.requested_qty)}</strong></td></tr>`;
    }).join('');

    container.innerHTML = `
        <header class="document-header"><div><h1 class="pharmacy-name">DOC R PHARMACY</h1><p class="document-title">PURCHASE REQUEST</p></div><div class="document-mark">INTERNAL REQUISITION</div></header>
        <section class="request-meta" aria-label="Purchase request information">
            <div class="meta-field"><span class="meta-label">PR No.:</span><span class="meta-value">${escapeHtml(request.pr_number || 'DRAFT / Auto-generated on submission')}</span></div>
            <div class="meta-field"><span class="meta-label">Request Date:</span><span class="meta-value">${escapeHtml(displayDate(request.request_date))}</span></div>
            <div class="meta-field approval-date-field"><span class="meta-label">Approval Date:</span><span class="meta-value">${escapeHtml(request.decided_at ? displayDate(request.decided_at) : '__________')}</span></div>
        </section>
        <table class="pr-print-table"><thead><tr><th>No.</th><th>Product Description</th><th>Unit / Packing</th><th>Shelf</th><th>Storage</th><th>On Hand</th><th>Requested Qty</th></tr></thead><tbody>${rows}</tbody></table>
        <section class="signature-grid"><div class="signature-line">Requested By</div><div class="signature-line">Checked / Reviewed By (CEO)</div><div class="signature-line">Date</div></section>
        <footer class="document-footer"><span>Doc R Pharmacy &bull; Purchase Request</span><span>${escapeHtml(request.pr_number || 'Purchase Request')}</span></footer>`;
}
