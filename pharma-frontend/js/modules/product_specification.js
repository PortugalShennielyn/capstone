function clean(value) {
    const text = String(value ?? '').trim();
    return !text || /^n\/?a$/i.test(text) || /^null$/i.test(text) ? '' : text;
}

function normalizedKey(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
}

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null);
}

/**
 * Formats a product measurement/count value without changing its precision.
 * This intentionally avoids Number() so large or highly precise DECIMAL text
 * is not rounded and user-entered significant digits remain intact.
 */
export function formatMeasurementValue(value) {
    if (value === null || value === undefined || value === '') return '';
    const text = String(value).trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !text.includes('.')) return text;
    return text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '').replace(/\.$/, '');
}

/** Cleans a leading numeric measurement while preserving its unit/text. */
export function formatMeasurementText(value) {
    const text = clean(value);
    const match = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(.*)$/);
    return match ? `${formatMeasurementValue(match[1])}${match[2]}` : text;
}

function matchingMeasurementUnit(saved = {}, definition = {}, units = []) {
    const savedId = clean(saved.measurement_unit_id);
    const group = normalizedKey(definition.measurement_group);
    const candidates = units.filter(candidate => !group || normalizedKey(candidate.measurement_group) === group);
    const byId = units.find(candidate => clean(candidate.measurement_unit_id) === savedId);
    const savedGroup = normalizedKey(saved.measurement_group || saved.unit_measurement_group);
    if (byId && (!group || normalizedKey(byId.measurement_group) === group)) return clean(byId.measurement_unit_id);

    // Archived units are absent from the active-unit cache. Preserve the one
    // historical saved ID only when Product Details confirms its real group.
    if (savedId && savedGroup && (!group || savedGroup === group)) return savedId;

    const savedUnit = normalizedKey(firstDefined(
        saved.unit_symbol,
        saved.measurement_unit_symbol,
        saved.unit_name,
        saved.measurement_unit_name
    ));
    if (!savedUnit) return savedId;

    const byLabel = candidates.find(candidate => [candidate.unit_symbol, candidate.unit_name]
        .some(value => normalizedKey(value) === savedUnit));
    return clean(byLabel?.measurement_unit_id);
}

/**
 * Align raw product_specification_values rows with the selected Product Type's
 * configured definitions. This is intentionally shared by Product Master edit
 * and supplier purchasing details so both views restore the same saved values.
 */
export function normalizeProductSpecificationValues(configuredDefinitions = [], savedValues = [], units = []) {
    const definitions = Array.isArray(configuredDefinitions) ? configuredDefinitions : [];
    const saved = Array.isArray(savedValues) ? savedValues : [];
    const savedById = new Map(saved
        .filter(value => clean(value?.specification_id))
        .map(value => [clean(value.specification_id), value]));
    const savedByName = new Map();
    saved.forEach(value => {
        [value?.specification_name, value?.display_name, value?.display_label].forEach(name => {
            const key = normalizedKey(name);
            if (key && !savedByName.has(key)) savedByName.set(key, value);
        });
    });

    const source = definitions.length ? definitions : saved;
    return source.map(definition => {
        const id = clean(definition?.specification_id);
        const nameKeys = [definition?.specification_name, definition?.display_name, definition?.display_label]
            .map(normalizedKey).filter(Boolean);
        const value = savedById.get(id) || nameKeys.map(key => savedByName.get(key)).find(Boolean) || {};
        const fieldStyle = clean(definition?.field_style || value?.field_style);
        const rawNumber = firstDefined(value?.value_number, value?.numeric_value);
        const rawText = firstDefined(value?.value_text, value?.text_value);
        const measurementUnitId = matchingMeasurementUnit(value, definition, units);
        const measurementUnit = units.find(unit => clean(unit?.measurement_unit_id) === measurementUnitId) || {};

        return {
            ...definition,
            ...value,
            specification_id: id || clean(value?.specification_id),
            specification_name: definition?.specification_name || value?.specification_name || '',
            display_name: definition?.display_name || definition?.display_label || value?.display_name || value?.display_label || definition?.specification_name || value?.specification_name || '',
            field_style: fieldStyle,
            value_text: rawText === undefined || rawText === null ? '' : String(rawText),
            value_number: formatMeasurementValue(rawNumber),
            measurement_unit_id: measurementUnitId,
            unit_name: clean(measurementUnit.unit_name) || clean(value?.unit_name) || clean(value?.measurement_unit_name),
            unit_symbol: clean(measurementUnit.unit_symbol) || clean(value?.unit_symbol) || clean(value?.measurement_unit_symbol),
            unit_measurement_group: clean(measurementUnit.measurement_group) || clean(value?.unit_measurement_group) || clean(value?.measurement_group)
        };
    });
}

function unit(value) {
    const text = clean(value);
    return { ml: 'mL', l: 'L', mg: 'mg', mcg: 'mcg', g: 'g', kg: 'kg', iu: 'IU', '%': '%' }[text.toLowerCase()] || text;
}

export function formatMeasurement(value, measurementUnit = '') {
    const displayAmount = formatMeasurementValue(value);
    const displayUnit = unit(measurementUnit);
    if (!displayAmount) return '';
    if (!displayUnit) return displayAmount;
    return displayUnit === '%' ? `${displayAmount}%` : `${displayAmount} ${displayUnit}`;
}

function normalizedDisplay(value) {
    const text = clean(value);
    const measurement = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(%|mcg|mg|g|kg|ml|l|iu)$/i);
    return measurement ? formatMeasurement(measurement[1], measurement[2]) : formatMeasurementText(text);
}

function addUnique(parts, value) {
    const text = normalizedDisplay(value);
    if (text && !parts.some((part) => part.toLowerCase() === text.toLowerCase())) parts.push(text);
}

export function formatProductSpecification(product = {}, empty = '-') {
    const category = clean(product.category_name).toLowerCase();
    const type = clean(product.type_name).toLowerCase();
    const parts = [];
    if (Array.isArray(product.specifications) && product.specifications.length) {
        product.specifications.forEach(specification => {
            addUnique(parts, specification.value_number !== null && specification.value_number !== undefined && specification.value_number !== ''
                ? formatMeasurement(specification.value_number, specification.unit_symbol)
                : specification.value_text);
        });
    } else if (category === 'medicine') {
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
        if (type === 'beverage') addUnique(parts, product.package_type);
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

export function formatProductPacking(product = {}, fallback = 'pcs') {
    return formatMeasurementText(product.packaging_size)
        || formatMeasurementText(product.pack_content)
        || formatMeasurementText(product.medical_pack_content)
        || clean(product.package_type)
        || clean(product.unit)
        || fallback;
}

export function productSearchText(product = {}) {
    return [formatProductIdentity(product), formatProductSpecification(product, ''), product.category_name, product.type_name, product.barcode]
        .map(clean).filter(Boolean).join(' ').toLowerCase();
}
