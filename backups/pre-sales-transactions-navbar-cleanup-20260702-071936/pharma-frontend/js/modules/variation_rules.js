const base = {
    text: [],
    strengthUnits: ['mg', 'mcg', 'g', 'IU', 'mg/mL', 'mg/5mL', '%'],
    syrupStrengthUnits: ['mg/5mL', 'mg/mL', '%'],
    volumeUnits: ['mL', 'L', 'cc'],
    weightUnits: ['g', 'kg', 'oz', 'lb'],
    packContentUnits: ['pcs', 'tablets', 'capsules', 'bottles', 'sachets', 'cans', 'packs', 'tubes', 'vials', 'ampules', 'strips', 'g', 'kg', 'oz', 'lb', 'mL', 'L', 'cc'],
    packageTypes: ['tablet', 'capsule', 'sachet', 'tube', 'vial', 'ampule', 'bottle', 'box', 'pack', 'can', 'jar', 'roll', 'strip', 'blister pack', 'plastic pack', 'carton', 'pouch']
};

const RULES = {
    grocery: {
        default: {
            fields: ['variant', 'size', 'weight', 'packaging'],
            variantLabel: 'Variant / Feature',
            sizeOptions: ['Small', 'Medium', 'Large', 'Family Size'],
            weightValues: ['20', '50', '100', '150', '200', '250'],
            weightUnits: base.weightUnits,
            packagingOptions: ['pack', 'box']
        },
        'baby care': {
            fields: ['variant', 'size', 'packaging', 'packContent'],
            variantLabel: 'Variant / Feature',
            variantOptions: ['Sensitive', 'Ultra Dry', 'Ultra Soft', 'Overnight', 'Extra Absorbent'],
            sizeOptions: ['NB', 'S', 'M', 'L', 'XL', 'XXL'],
            packagingOptions: ['pack', 'box'],
            packContentValues: ['12', '24', '36', '48'],
            packContentUnits: ['pcs']
        },
        beverage: {
            fields: ['variant', 'volume', 'packaging'],
            variantLabel: 'Flavor',
            variantOptions: ['Original', 'Orange', 'Apple', 'Grape', 'Lemon', 'Mango', 'Strawberry', 'Chocolate', 'Vanilla', 'Coffee', 'Mocha'],
            volumeValues: ['250', '500', '1', '1.5'],
            volumeUnits: base.volumeUnits,
            packagingOptions: ['bottle', 'can', 'sachet', 'box', 'carton']
        },
        'canned goods': {
            fields: ['variant', 'weight', 'packaging'],
            variantLabel: 'Flavor',
            variantOptions: ['Adobo', 'Menudo', 'Hot & Spicy', 'Caldereta', 'Afritada', 'Flakes in Oil', 'Spicy', 'Original', 'Sweet & Spicy', 'Garlic'],
            weightValues: ['100', '175', '200'],
            weightUnits: base.weightUnits,
            packagingOptions: ['can', 'pouch']
        },
        dairy: {
            fields: ['variant', 'size', 'volume'],
            variantLabel: 'Flavor',
            sizeLabel: 'Fat Type',
            variantOptions: ['Original', 'Chocolate', 'Strawberry', 'Vanilla', 'Cheese'],
            sizeOptions: ['Full Cream', 'Low Fat', 'Non-Fat'],
            volumeValues: ['180', '250', '500', '1000'],
            volumeUnits: ['mL', 'L']
        },
        snacks: {
            fields: ['variant', 'size', 'weight', 'packaging'],
            variantLabel: 'Flavor',
            variantOptions: ['Cheese', 'BBQ', 'Sour Cream', 'Onion', 'Spicy', 'Chocolate', 'Vanilla'],
            sizeOptions: ['Small', 'Medium', 'Large', 'Family Size'],
            weightValues: ['20', '30', '50', '80', '100', '150', '200'],
            weightUnits: ['g', 'oz'],
            packagingOptions: ['pack', 'box']
        },
        'personal care': {
            fields: ['variant', 'size', 'volume', 'packaging'],
            variantLabel: 'Scent',
            sizeLabel: 'Variant',
            variantOptions: ['Fresh', 'Lavender', 'Aloe', 'Lemon', 'Floral', 'Baby Powder'],
            sizeOptions: ['Sensitive', 'Anti-bacterial', 'Whitening', 'Moisturizing'],
            volumeValues: ['50', '100', '150', '200', '250', '500', '1000'],
            volumeUnits: ['mL'],
            packagingOptions: ['bottle', 'sachet', 'tube']
        },
        'hygiene product': {
            alias: 'personal care'
        },
        'bread/bakery': {
            fields: ['variant', 'weight', 'size'],
            variantLabel: 'Flavor',
            variantOptions: ['Plain', 'Cheese', 'Chocolate', 'Ube', 'Wheat', 'Garlic', 'Butter'],
            weightValues: ['50', '100', '200', '350', '500'],
            weightUnits: ['g'],
            sizeOptions: ['Small', 'Medium', 'Large', 'Family Size']
        },
        noodles: {
            fields: ['variant', 'size'],
            variantLabel: 'Flavor',
            sizeLabel: 'Pack Size',
            variantOptions: ['Beef', 'Chicken', 'Pork', 'Seafood', 'Spicy', 'Original', 'Calamansi', 'Chili-Mansi'],
            sizeOptions: ['Single Pack', 'Twin Pack', '5 Pack', '6 Pack', '10 Pack']
        },
        condiments: {
            fields: ['variant', 'volume', 'packaging'],
            variantLabel: 'Flavor',
            variantOptions: ['Original', 'Spicy', 'Sweet', 'Garlic', 'Chili', 'Soy', 'Vinegar', 'Tomato'],
            volumeValues: ['100', '150', '250', '350', '500', '750', '1000'],
            volumeUnits: ['mL', 'L'],
            packagingOptions: ['bottle', 'sachet', 'pouch']
        }
    },
    medicine: {
        default: {
            fields: ['strength', 'form', 'packContent'],
            strengthUnits: base.strengthUnits,
            packagingOptions: ['blister pack', 'bottle', 'box', 'strip'],
            packContentValues: ['6', '10', '12', '20', '30', '50', '100'],
            packContentUnits: ['tablets']
        },
        tablet: {
            fields: ['strength', 'form', 'packContent'],
            formValue: 'tablet',
            strengthUnits: base.strengthUnits,
            packagingOptions: ['blister pack', 'bottle', 'box', 'strip'],
            packContentValues: ['6', '10', '12', '20', '30', '50', '100'],
            packContentUnits: ['tablets']
        },
        capsule: {
            fields: ['strength', 'form', 'packContent'],
            formValue: 'capsule',
            strengthUnits: base.strengthUnits,
            packagingOptions: ['blister pack', 'bottle'],
            packContentValues: ['6', '10', '12', '20', '30', '50', '100'],
            packContentUnits: ['capsules']
        },
        syrup: {
            fields: ['variant', 'strength', 'volume', 'form'],
            variantLabel: 'Flavor',
            variantOptions: ['Orange', 'Strawberry', 'Grape', 'Bubblegum'],
            strengthUnits: base.syrupStrengthUnits,
            volumeValues: ['30', '60', '90', '120', '150', '200'],
            volumeUnits: ['mL'],
            formValue: 'bottle'
        },
        suspension: {
            alias: 'syrup'
        },
        solution: {
            alias: 'syrup'
        },
        drops: {
            fields: ['volume', 'form'],
            volumeValues: ['5', '10', '15'],
            volumeUnits: ['mL'],
            formValue: 'bottle'
        },
        cream: {
            fields: ['weight', 'form'],
            formValue: 'tube',
            weightValues: ['5', '10', '15', '20', '30', '50', '100'],
            weightUnits: ['g']
        },
        gel: {
            alias: 'cream'
        },
        ointment: {
            alias: 'cream'
        },
        lotion: {
            alias: 'cream'
        },
        injection: {
            fields: ['strength', 'volume', 'form'],
            formValue: 'vial',
            strengthUnits: base.strengthUnits,
            volumeValues: ['1', '2', '5', '10', '20'],
            volumeUnits: ['mL'],
            packagingOptions: ['ampule', 'vial']
        },
        inhaler: {
            fields: ['volume', 'form'],
            volumeValues: ['100', '200'],
            volumeUnits: ['mL'],
            formValue: 'bottle'
        },
        nebulizer: {
            alias: 'inhaler'
        },
        powder: {
            fields: ['weight', 'form'],
            weightValues: ['1', '5', '10', '15', '20'],
            weightUnits: ['g'],
            formValue: 'sachet'
        },
        sachet: {
            alias: 'powder'
        },
        patch: {
            fields: ['strength', 'form', 'packContent'],
            formValue: 'pack',
            strengthUnits: base.strengthUnits,
            packContentValues: ['1', '3', '5', '10'],
            packContentUnits: ['pcs']
        },
        suppository: {
            fields: ['strength', 'form', 'packContent'],
            formValue: 'strip',
            strengthUnits: base.strengthUnits,
            packContentValues: ['6', '10', '12'],
            packContentUnits: ['pcs']
        },
        'first aid': {
            fields: ['size', 'volume', 'packaging'],
            sizeOptions: ['Small', 'Medium', 'Large', 'Roll', 'Pad', 'Bottle'],
            volumeValues: ['50', '100', '250', '500', '1000'],
            volumeUnits: ['mL'],
            packagingOptions: ['pack', 'box', 'bottle', 'roll']
        },
        'medical supply': {
            alias: 'first aid'
        },
        'device/equipment': {
            fields: ['variant', 'size'],
            variantLabel: 'Model',
            sizeLabel: 'Size / Color',
            variantOptions: ['Standard', 'Digital', 'Manual', 'Portable', 'Rechargeable'],
            sizeOptions: ['Small', 'Medium', 'Large', 'White', 'Blue', 'Black']
        }
    }
};

function normalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveAlias(categoryKey, rule) {
    let current = rule;
    const seen = new Set();
    while (current?.alias && !seen.has(current.alias)) {
        seen.add(current.alias);
        current = RULES[categoryKey]?.[current.alias] || current;
    }
    return current;
}

export function getVariationRule(categoryName, typeName = '') {
    const categoryKey = normalizeName(categoryName) === 'medicine' ? 'medicine' : 'grocery';
    const typeKey = normalizeName(typeName);
    const group = RULES[categoryKey] || RULES.grocery;
    const rule = resolveAlias(categoryKey, group[typeKey] || group.default);
    return {
        categoryKey,
        typeName,
        fields: rule.fields || group.default.fields,
        variantLabel: rule.variantLabel || 'Variant / Flavor',
        sizeLabel: rule.sizeLabel || 'Size',
        formValue: rule.formValue || typeName || '',
        variantOptions: rule.variantOptions || base.text,
        sizeOptions: rule.sizeOptions || [],
        strengthUnits: rule.strengthUnits || base.strengthUnits,
        volumeValues: rule.volumeValues || [],
        volumeUnits: rule.volumeUnits || base.volumeUnits,
        weightValues: rule.weightValues || [],
        weightUnits: rule.weightUnits || base.weightUnits,
        packagingOptions: rule.packagingOptions || base.packageTypes,
        packContentValues: rule.packContentValues || [],
        packContentUnits: rule.packContentUnits || base.packContentUnits
    };
}

export function optionList(options = [], selected = '', placeholder = 'Select...') {
    const cleanSelected = String(selected || '').trim();
    const values = [...new Set(options.filter(value => String(value || '').trim() !== ''))];
    if (cleanSelected && !values.some(value => String(value).toLowerCase() === cleanSelected.toLowerCase())) {
        values.unshift(cleanSelected);
    }
    return [
        `<option value="">${placeholder}</option>`,
        ...values.map(value => `<option value="${escapeOption(value)}" ${String(value) === cleanSelected ? 'selected' : ''}>${escapeOption(value)}</option>`)
    ].join('');
}

export function datalist(id, options = []) {
    const values = [...new Set(options.filter(value => String(value || '').trim() !== ''))];
    return `<datalist id="${escapeOption(id)}">${values.map(value => `<option value="${escapeOption(value)}"></option>`).join('')}</datalist>`;
}

export function cleanDisplay(value) {
    const clean = String(value ?? '').trim();
    return clean && clean.toUpperCase() !== 'N/A' && clean.toUpperCase() !== 'NULL' ? clean : '';
}

export function combineValueUnit(value, unit) {
    const cleanValue = cleanDisplay(value);
    const cleanUnit = cleanDisplay(unit);
    if (!cleanValue) return '';
    return cleanUnit && cleanValue.toLowerCase() !== cleanUnit.toLowerCase() ? `${cleanValue} ${cleanUnit}` : cleanValue;
}

export function uniqueDetailRows(rows = []) {
    const seen = new Set();
    const seenValues = new Set();
    return rows
        .map(([label, value]) => [label, cleanDisplay(value)])
        .filter(([, value]) => value)
        .filter(([label, value]) => {
            const key = `${label}:${value}`.toLowerCase();
            const valueKey = value.toLowerCase();
            if (seen.has(key) || seenValues.has(valueKey)) return false;
            seen.add(key);
            seenValues.add(valueKey);
            return true;
        });
}

function escapeOption(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
