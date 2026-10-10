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

const SELLABLE_CONTAINER_UNITS = new Set([
    'bag', 'blister pack', 'bottle', 'box', 'bundle', 'can', 'carton', 'case',
    'jar', 'pack', 'pouch', 'roll', 'sachet', 'strip', 'tray', 'tube', 'vial'
]);

const CONTAINER_SPECIFICATION_NAMES = new Set([
    'package type', 'package container', 'pack container', 'container type', 'container', 'packaging'
]);

function productInventoryUnit(product = {}) {
    return clean(product.inventory_unit_symbol) || clean(product.inventory_unit_name);
}

function formatPackContent(product, value, measurementUnit = '') {
    const content = measurementUnit ? formatMeasurement(value, measurementUnit) : normalizedDisplay(value);
    if (!content || content.includes('/')) return content;

    const sellingUnit = productInventoryUnit(product);
    const normalizedSellingUnit = normalizedKey(sellingUnit);
    const inferredContentUnit = clean(measurementUnit) || clean(String(content).replace(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*/, ''));
    const normalizedContentUnit = normalizedKey(inferredContentUnit);
    if (!SELLABLE_CONTAINER_UNITS.has(normalizedSellingUnit) || normalizedSellingUnit === normalizedContentUnit) {
        return content;
    }
    return `${content}/${sellingUnit.toLowerCase()}`;
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

function presentationText(value) {
    const text = normalizedDisplay(value);
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function specificationValue(specification = {}) {
    if (specification.value_number !== null && specification.value_number !== undefined && specification.value_number !== '') {
        return formatMeasurement(specification.value_number, specification.unit_symbol || specification.unit_name);
    }
    return clean(specification.value_text) || clean(specification.unit_symbol) || clean(specification.unit_name);
}

function pluralizeCountMeasurement(value, specification = {}) {
    const text = clean(value);
    const amount = Number(specification.value_number);
    if (!text || !Number.isFinite(amount) || amount === 1) return text;

    const unitLabel = unit(specification.unit_symbol || specification.unit_name);
    if (!unitLabel || /s$/i.test(unitLabel)) return text;
    const pluralizable = new Set(['tablet', 'capsule', 'suppository', 'piece', 'bottle', 'vial', 'ampule', 'sachet', 'box']);
    if (!pluralizable.has(unitLabel.toLowerCase())) return text;
    return text.replace(new RegExp(`${unitLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), `${unitLabel}${unitLabel.toLowerCase() === 'box' ? 'es' : 's'}`);
}

/** Returns the single most relevant existing package/container value for a catalog row. */
export function formatProductContainer(product = {}, empty = '—') {
    const specifications = Array.isArray(product.specifications) ? product.specifications : [];
    const configuredContainer = specifications.find(specification => CONTAINER_SPECIFICATION_NAMES.has(
        normalizedKey(specification.specification_name || specification.display_name)
    ));
    const storedContainer = specificationValue(configuredContainer)
        || clean(product.package_type)
        || clean(product.medicine_package_type)
        || clean(product.grocery_package_type)
        || clean(product.medical_package_type)
        || clean(product.container)
        || clean(product.packaging);
    if (storedContainer) return presentationText(storedContainer);

    const sellingUnit = productInventoryUnit(product);
    return SELLABLE_CONTAINER_UNITS.has(normalizedKey(sellingUnit)) ? presentationText(sellingUnit) : empty;
}

/** Product Master Form column: use a medicine's dosage form or the product type. */
export function formatProductForm(product = {}, empty = '—') {
    const specifications = Array.isArray(product.specifications) ? product.specifications : [];
    const formSpecification = specifications.find(specification => {
        const name = normalizedKey(specification.specification_name || specification.display_name);
        return ['dosage form', 'form', 'product form'].includes(name);
    });
    const form = specificationValue(formSpecification) || product.dosage_form || product.type_name;
    return presentationText(form) || empty;
}

// Back-compat alias for older product UI modules that still reference the
// previous `formatProductFor` symbol name.
export function formatProductFor(product = {}, empty = '—') {
    return formatProductForm(product, empty);
}

/** Separates medicine form, strength, and pack details for the catalog cell. */
export function medicineCatalogSpecificationParts(product = {}) {
    if (normalizedKey(product.category_name) !== 'medicine') return null;
    const specifications = Array.isArray(product.specifications) ? product.specifications : [];
    const specificationName = specification => normalizedKey(specification?.specification_name || specification?.display_name);
    const byName = new Map(specifications.map(specification => [specificationName(specification), specification]));
    const firstNamed = (...names) => names.map(name => byName.get(name)).find(Boolean);

    const dosageForm = specificationValue(firstNamed('dosage form'))
        || clean(product.dosage_form)
        || clean(product.type_name);
    const numerator = specificationValue(firstNamed('strength'));
    const denominatorSpecification = specifications.find(specification =>
        /^(strength|concentration) denominator(?: |$)/.test(specificationName(specification))
    );
    const denominator = specificationValue(denominatorSpecification);
    const fallbackStrength = clean(product.strength)
        || formatMeasurement(product.medicine_strength_value ?? product.strength_value, product.strength_unit);
    const strength = (numerator && denominator ? `${numerator} / ${denominator}` : (numerator || fallbackStrength))
        .replace(/\s*\/\s*/g, ' / ');
    const contentSpecification = firstNamed('volume', 'net content');
    const rawContent = specificationValue(contentSpecification);
    const contentName = specificationName(contentSpecification);
    const netContent = (contentName === 'pack content' || contentName === 'tablet count'
        ? pluralizeCountMeasurement(rawContent, contentSpecification)
        : rawContent)
        || formatMeasurement(product.net_content_value ?? product.volume_value, product.net_content_unit ?? product.volume_unit);
    const standardNames = new Set([
        'medicine classification', 'dosage form', 'strength', 'strength denominator',
        'concentration denominator', 'volume', 'net content', 'pack content', 'tablet count', 'package type',
        'package container', 'container type'
    ]);
    const detailParts = [];
    addUnique(detailParts, netContent);
    specifications.forEach(specification => {
        const name = specificationName(specification);
        if (!name || standardNames.has(name) || /^(strength|concentration) denominator(?: |$)/.test(name)) return;
        addUnique(detailParts, presentationText(specificationValue(specification)));
    });

    return {
        dosageForm: presentationText(dosageForm),
        strength,
        details: detailParts.join(' \u2022 '),
        detailCount: detailParts.length,
        hasConcentration: Boolean(denominator) || strength.includes('/')
    };
}

/** Builds the catalog-style medicine lines from the flattened inventory API fields. */
export function inventoryMedicineSpecificationParts(product = {}) {
    const parts = medicineCatalogSpecificationParts(product);
    if (!parts) return null;

    const cleanDecimals = value => String(value || '').replace(/\b\d+\.\d+\b/g, number => formatMeasurementValue(number));
    const details = parts.details ? parts.details.split(/\s*•\s*/).map(cleanDecimals) : [];
    const form = normalizedKey(parts.dosageForm);
    const flattened = cleanProductSpecificationText(product.normalized_specification);
    const values = flattened.split(/\s*•\s*/);
    let displayStrength = cleanDecimals(parts.strength);
    if (displayStrength && !displayStrength.includes('/') && /powder|suspension|syrup|solution|drops|liquid/.test(form)) {
        const strengthIndex = values.findIndex(value => normalizedKey(cleanDecimals(value)) === normalizedKey(displayStrength));
        const denominator = values[strengthIndex + 1];
        if (strengthIndex >= 0 && /^\d+(?:\.\d+)?\s*mL$/i.test(clean(denominator))) {
            displayStrength = `${displayStrength} / ${presentationText(cleanDecimals(denominator))}`;
        }
    }
    const strength = normalizedKey(displayStrength).replace(/\s*\/\s*/g, ' / ');
    const container = normalizedKey(formatProductContainer(product, ''));
    const type = normalizedKey(product.type_name);
    values.forEach(value => {
        const item = normalizedKey(cleanDecimals(value));
        if (!item || item === form || item === type || item === container
            || item === strength || (item.length > 2 && strength.includes(item))) return;
        let display = presentationText(cleanDecimals(value));
        display = display.replace(/^(\d+(?:\.\d+)?)\s+(tablet|capsule|bottle|vial|ampule|sachet|piece|box)$/i,
            (_, count, unitName) => `${count} ${Number(count) === 1 ? unitName : unitName === 'box' ? 'boxes' : `${unitName}s`}`);
        addUnique(details, display);
    });
    return { ...parts, strength: displayStrength, details: details.join(' • ') };
}

/** Retains the compact text format used outside the Product Master table. */
export function formatMedicineSpecificationLines(product = {}, empty = '-') {
    const parts = medicineCatalogSpecificationParts(product);
    if (!parts) {
        const specification = formatProductSpecification(product, empty);
        return specification ? [specification] : [];
    }

    const { dosageForm, strength, details, detailCount, hasConcentration } = parts;
    const lines = [dosageForm, strength, details].filter(Boolean);
    const simpleLine = lines.join(' \u2022 ');
    const isSimple = !hasConcentration && detailCount <= 2 && simpleLine.length <= 72;
    if (isSimple && simpleLine) return [simpleLine];
    return lines.length ? lines : (empty ? [empty] : []);
}

/** Product Catalog specification output excludes packaging, which has its own column. */
export function formatProductCatalogSpecificationLines(product = {}, empty = '—') {
    if (normalizedKey(product.category_name) === 'medicine') {
        const parts = medicineCatalogSpecificationParts(product);
        if (!parts) return empty ? [empty] : [];
        const lines = [parts.strength, parts.details].filter(Boolean);
        return lines.length ? lines : (empty ? [empty] : []);
    }
    const specifications = Array.isArray(product.specifications)
        ? product.specifications.filter(specification => !CONTAINER_SPECIFICATION_NAMES.has(
            normalizedKey(specification.specification_name || specification.display_name)
        ) && !['pack content', 'tablet count'].includes(normalizedKey(specification.specification_name || specification.display_name)))
        : product.specifications;
    const specification = formatProductSpecification({
        ...product,
        specifications,
        package_type: '',
        medicine_package_type: '',
        grocery_package_type: '',
        medical_package_type: '',
        container: '',
        packaging: '',
        pack_content: '',
        medical_pack_content: '',
        packaging_size: ''
    }, empty);
    return specification ? [specification] : [];
}

export function formatProductSpecification(product = {}, empty = '-') {
    const category = clean(product.category_name).toLowerCase();
    const type = clean(product.type_name).toLowerCase();
    const parts = [];
    if (Array.isArray(product.specifications) && product.specifications.length) {
        const specificationName = specification => normalizedKey(specification.specification_name || specification.display_name);
        const specificationValue = specification => specification?.value_number !== null
            && specification?.value_number !== undefined && specification?.value_number !== ''
            ? formatMeasurement(specification.value_number, specification.unit_symbol || specification.unit_name)
            : clean(specification?.value_text);
        if (category === 'medicine') {
            const byName = new Map(product.specifications.map(specification => [specificationName(specification), specification]));
            const numerator = specificationValue(byName.get('strength'));
            const denominator = specificationValue(byName.get('strength denominator'));
            addUnique(parts, numerator && denominator ? `${numerator}/${denominator}` : numerator);
            addUnique(parts, specificationValue(byName.get('dosage form')) || product.dosage_form || product.type_name);
            const netContent = specificationValue(byName.get('volume'));
            addUnique(parts, netContent);

            product.specifications.forEach(specification => {
                const name = specificationName(specification);
                if (['medicine classification', 'strength', 'strength denominator', 'dosage form', 'volume', 'package type'].includes(name)) return;
                const isPackContent = name === 'pack content';
                addUnique(parts, isPackContent
                    ? formatPackContent(product, specification.value_number ?? specification.value_text, specification.unit_symbol || specification.unit_name)
                    : specificationValue(specification));
            });
        } else {
            product.specifications.forEach(specification => {
                const name = specificationName(specification);
                if (name === 'medicine classification') return;
                const isPackContent = name === 'pack content';
                const value = specification.value_number !== null && specification.value_number !== undefined && specification.value_number !== ''
                    ? (isPackContent
                        ? formatPackContent(product, specification.value_number, specification.unit_symbol || specification.unit_name)
                        : formatMeasurement(specification.value_number, specification.unit_symbol || specification.unit_name))
                    : (isPackContent ? formatPackContent(product, specification.value_text) : specification.value_text);
                addUnique(parts, value);
            });
        }
    } else if (category === 'medicine') {
        addUnique(parts, clean(product.strength) || formatMeasurement(product.medicine_strength_value ?? product.strength_value, product.strength_unit));
        addUnique(parts, product.dosage_form || product.type_name);
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
        addUnique(parts, formatPackContent(product, product.pack_content));
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

export function isPrescriptionProduct(product = {}) {
    const badge = clean(product.medicine_classification_badge);
    const classification = clean(product.medicine_classification || product.classification || product.rx_classification).toLowerCase();
    return badge.toLowerCase() === 'rx'
        || classification === 'prescription (rx)'
        || classification === 'prescription'
        || classification === 'rx';
}

export function cleanProductSpecificationText(value = '') {
    return clean(value)
        .split(/\s*•\s*/)
        .map(part => clean(part))
        .filter(part => part && !/^(?:prescription(?:\s*\(rx\))?|rx|otc|non[-\s]?prescription)$/i.test(part))
        .join(' • ');
}

export function formatProductIdentityParts(product = {}) {
    const brand = clean(product.brand_name);
    const productName = clean(product.product_name);
    const genericName = clean(product.generic_name);
    const displayName = productName || brand || genericName || 'Unnamed product';
    const generic = genericName && genericName.toLowerCase() !== displayName.toLowerCase() ? genericName : '';
    return {
        productName: displayName,
        genericName: generic,
        isPrescription: isPrescriptionProduct(product)
    };
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
