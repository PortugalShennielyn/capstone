import { formatProductSpecification, formatProductPacking } from "./product_specification.js?v=8";

const escapeHtml = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[character],
    );

function displayDate(value) {
    const raw = String(value || "").slice(0, 10);
    const date = raw ? new Date(`${raw}T00:00:00`) : null;
    return date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
        : "-";
}

function inventoryQuantity(inventory, item, inventoryKey, itemKey) {
    const value = inventory?.[inventoryKey] ?? item?.[itemKey] ?? 0;
    return Number(value || 0);
}

function formatQuantity(value, emptyValue = "—") {
    const raw = String(value ?? "").trim();
    if (!raw) return emptyValue;
    const quantity = Number(raw);
    if (!Number.isFinite(quantity)) return raw;
    return quantity.toLocaleString("en-PH", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    });
}

function distinctDisplayParts(parts) {
    const seen = new Set();
    return parts.filter((part) => {
        const value = String(part || "").trim();
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function displayUnitLabel(unit, quantity = 1) {
    const clean = String(unit || "").trim();
    if (!clean) return "";
    const display = clean.charAt(0).toUpperCase() + clean.slice(1);
    if (Number(quantity) === 1 || /s$/i.test(display)) return display;
    if (/(s|x|z|ch|sh)$/i.test(display)) return `${display}es`;
    if (/y$/i.test(display)) return `${display.slice(0, -1)}ies`;
    return `${display}s`;
}

export function renderPurchaseRequestDocument(
    container,
    request,
    { productById = new Map(), inventoryById = new Map() } = {},
) {
    if (!container || !request) return;
    const roles = request.print_roles || {};
    const preparedName = String(roles.prPreparedName || "").trim();
    const preparedRole = String(roles.prPreparedRole || "").trim() || "Manager";
    // The immutable approval audit record controls whether the configured
    // reviewer is printed. Account identities remain audit data and are not
    // substitutes for the document signatory configured by administrators.
    const hasRecordedApproval = Boolean(request.supervisor_user_id && request.decided_at);
    const reviewedName = hasRecordedApproval ? String(roles.prReviewedName || "").trim() : "";
    const reviewedRole = String(roles.prReviewedRole || "").trim() || "Supervisor";
    const rows = (request.items || [])
        .map((item, index) => {
            const product = productById.get(String(item.product_id)) || item;
            const inventory = inventoryById.get(String(item.product_id)) || item;
            const shelf = inventoryQuantity(inventory, item, "shelf_quantity", "shelf_stock");
            const storage = inventoryQuantity(inventory, item, "storage_quantity", "storage_stock");
            const onHand = inventory?.on_hand ?? item?.on_hand ?? shelf + storage;
            const displayName = String(
                product.generic_name ||
                    item.generic_name ||
                    product.product_name ||
                    item.product_name ||
                    "",
            ).trim() || "Unnamed product";
            const secondaryIdentity = distinctDisplayParts([
                product.brand_name || item.brand_name,
                formatProductSpecification(product, item.specification || "Not specified"),
            ]).join(" • ");
            const baseInventoryUnit = String(
                item.base_inventory_unit || product.base_inventory_unit || "",
            ).trim();
            const requestedQty = `${formatQuantity(item.requested_qty, "0")} ${displayUnitLabel(item.unit, item.requested_qty)}`;
            const equivalent =
                item.requested_base_qty == null
                    ? ""
                    : `${formatQuantity(item.requested_base_qty)} ${displayUnitLabel(baseInventoryUnit, item.requested_base_qty)}`;
            const approvedQty =
                item.approved_qty == null
                    ? "—"
                    : `${formatQuantity(item.approved_qty)} ${displayUnitLabel(item.unit, item.approved_qty)}`;
            return `<tr><td>${index + 1}</td><td class="product-description"><strong>${escapeHtml(displayName)}</strong><span>${escapeHtml(secondaryIdentity)}</span></td><td>${escapeHtml(baseInventoryUnit || formatProductPacking(product, "Unit not configured"))}</td><td>${escapeHtml(shelf)}</td><td>${escapeHtml(storage)}</td><td><strong>${escapeHtml(Number(onHand || 0))}</strong></td><td class="quantity-cell"><div class="quantity-stack"><span>${escapeHtml(requestedQty)}</span>${equivalent ? `<small>${escapeHtml(equivalent)}</small>` : ""}</div></td><td class="quantity-cell">${escapeHtml(approvedQty)}</td></tr>`;
        })
        .join("");

    container.innerHTML = `
        <header class="document-header"><div><h1 class="pharmacy-name">DOC R PHARMACY</h1><p class="document-title">PURCHASE REQUEST</p></div><div class="document-mark">INTERNAL REQUISITION</div></header>
        <section class="request-meta" aria-label="Purchase request information">
            <div class="meta-field"><span class="meta-label">PR No.:</span><span class="meta-value">${escapeHtml(request.pr_number || "DRAFT / Auto-generated on submission")}</span></div>
            <div class="meta-field"><span class="meta-label">Request Date:</span><span class="meta-value">${escapeHtml(displayDate(request.request_date))}</span></div>
            <div class="meta-field approval-date-field"><span class="meta-label">Approval Date:</span><span class="meta-value">${escapeHtml(hasRecordedApproval ? displayDate(request.decided_at) : "__________")}</span></div>
        </section>
        <table class="pr-print-table"><thead><tr><th>No.</th><th>Product Description</th><th>Base Inventory Unit</th><th>Shelf</th><th>Storage</th><th>On Hand</th><th>Requested Qty</th><th>Approved Qty</th></tr></thead><tbody>${rows}</tbody></table>
        <section class="signature-grid">
            <div class="signature-block"><span class="signature-caption">Requested / Prepared By</span><div class="signature-space"></div><span class="signature-name">${escapeHtml(preparedName) || "&nbsp;"}</span><div class="signature-line" aria-hidden="true"></div><span class="signature-role">${escapeHtml(preparedRole)}</span></div>
            <div class="signature-block"><span class="signature-caption">Checked / Reviewed By</span><div class="signature-space"></div><span class="signature-name">${escapeHtml(reviewedName) || "&nbsp;"}</span><div class="signature-line" aria-hidden="true"></div><span class="signature-role">${escapeHtml(reviewedRole) || "&nbsp;"}</span></div>
        </section>
        <footer class="document-footer"><span>Doc R Pharmacy &bull; Purchase Request</span><span>${escapeHtml(request.pr_number || "Purchase Request")}</span></footer>`;
}
