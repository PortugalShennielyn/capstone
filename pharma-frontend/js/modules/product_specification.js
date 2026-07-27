function clean(value) {
    const text = String(value ?? '').trim();
    return !text || /^n\/?a$/i.test(text) || /^null$/i.test(text) ? '' : text;
}

function unit(value) {
    const text = clean(value);
    return { ml: 'mL', l: 'L', mg: 'mg', mcg: 'mcg', g: 'g', kg: 'kg', iu: 'IU', '%': '%' }[text.toLowerCase()] || text;
}

function amount(value) {
    const text = clean(value);
    return text && Number.isFinite(Number(text)) ? String(Number(text)) : text;
}

export function formatMeasurement(value, measurementUnit = '') {
    const displayAmount = amount(value);
    const displayUnit = unit(measurementUnit);
    if (!displayAmount) return '';
    if (!displayUnit) return displayAmount;
    return displayUnit === '%' ? `${displayAmount}%` : `${displayAmount} ${displayUnit}`;
}

function normalizedDisplay(value) {
    const text = clean(value);
    const measurement = text.match(/^(\d+(?:\.\d+)?)\s*(%|mcg|mg|g|kg|ml|l|iu)$/i);
    return measurement ? formatMeasurement(measurement[1], measurement[2]) : text;
}

function addUnique(parts, value) {
    const text = normalizedDisplay(value);
    if (text && !parts.some((part) => part.toLowerCase() === text.toLowerCase())) parts.push(text);
}

export function formatProductSpecification(product = {}, empty = '-') {
    const category = clean(product.category_name).toLowerCase();
    const parts = [];
    if (category === 'medicine') {
        addUnique(parts, product.generic_name);
        addUnique(parts, clean(product.strength) || formatMeasurement(product.medicine_strength_value ?? product.strength_value, product.strength_unit));
        addUnique(parts, product.dosage_form);
        addUnique(parts, formatMeasurement(product.net_content_value ?? product.volume_value, product.net_content_unit ?? product.volume_unit));
    } else if (category === 'medical supply' || category === 'medical supplies') {
        addUnique(parts, product.medical_variant ?? product.variant_flavor ?? product.variant);
        addUnique(parts, product.medical_size ?? product.display_size ?? product.size_value ?? product.size);
        addUnique(parts, product.material);
        addUnique(parts, product.sterile_status);
    } else {
        addUnique(parts, product.variant_flavor ?? product.variant);
        addUnique(parts, product.display_size ?? product.size_value ?? product.size);
        addUnique(parts, formatMeasurement(product.net_weight ?? product.weight_volume_value, product.grocery_unit ?? product.weight_volume_unit ?? product.unit));
    }
    return parts.join(' \u2022 ') || empty;
}

export function formatProductIdentity(product = {}) {
    const brand = clean(product.brand_name);
    const rawName = clean(product.product_name);
    const name = brand && rawName.toLowerCase().startsWith(`${brand.toLowerCase()} `)
        ? rawName.slice(brand.length).trim()
        : rawName;
    return [brand, name].filter(Boolean).join(' ') || 'Unnamed product';
}

export function productSearchText(product = {}) {
    return [formatProductIdentity(product), formatProductSpecification(product, ''), product.category_name, product.type_name, product.barcode]
        .map(clean).filter(Boolean).join(' ').toLowerCase();
}
