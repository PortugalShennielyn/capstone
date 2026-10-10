const escapeHtml = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );

function productLabels(item) {
    const brand = String(item.brand_name || "").trim();
    const productName = String(item.generic_name || item.product_name || "").trim();
    const unprefixedName =
        brand && productName.toLowerCase().startsWith(`${brand.toLowerCase()} `)
            ? productName.slice(brand.length).trim()
            : productName;
    const primary = brand || productName || "-";
    const secondary = unprefixedName.toLowerCase() === primary.toLowerCase() ? "" : unprefixedName;
    return { primary, secondary };
}

export function purchaseRequestItemsSummary(items = []) {
    if (!items.length)
        return '<div class="request-items-summary"><strong>No products</strong></div>';

    const preview = items.slice(0, 2)
        .map((item) => {
            const { primary, secondary } = productLabels(item);
            return `<li><strong>${escapeHtml(primary)}</strong>${secondary ? `<span>${escapeHtml(secondary)}</span>` : ""}</li>`;
        })
        .join("");
    const remaining = items.length - 2;
    return `<div class="request-items-summary"><ul class="request-items-preview">${preview}</ul>${remaining > 0 ? `<small class="request-items-more">+${remaining} more items</small>` : ""}</div>`;
}
