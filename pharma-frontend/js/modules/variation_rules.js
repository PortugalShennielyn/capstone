const base = {
    text: [],
    strengthUnits: ['mcg', 'mg', 'g', 'IU'],
    syrupStrengthUnits: ['mg/5mL', 'mg/mL'],
    volumeUnits: ['mL', 'L', 'oz'],
    weightUnits: ['g', 'kg', 'oz'],
    packContentUnits: ['pcs', 'tablets', 'capsules', 'bottles', 'sachets', 'cans', 'packs', 'tubes', 'vials', 'ampules', 'strips'],
    packageTypes: ['Pack', 'Jumbo Pack', 'Box', 'Bottle', 'Can', 'Sachet', 'Carton', 'Pouch', 'Blister Pack', 'Blister', 'Strip', 'Tube', 'Jar', 'Ampule', 'Vial', 'Dropper', 'Canister']
};

const RULES = {
    grocery: {
        default: {
            fields: ['variant', 'size', 'weight', 'packaging'],
            variantLabel: 'Variant / Feature',
            sizeOptions: ['Small', 'Medium', 'Large', 'Family Size'],
            weightValues: ['20', '50', '100', '150', '200', '250'],
            weightUnits: base.weightUnits,
            packagingOptions: ['Pack', 'Box']
        },
        'baby care': {
            fields: ['variant', 'size', 'packaging', 'packContent'],
            variantLabel: 'Variant / Feature',
            variantOptions: ['Dry', 'Ultra Dry', 'Ultra-cushy', 'Sensitive', 'Overnight', 'Premium Care', 'Active Baby', 'Extra Soft', 'Aloe', 'Unscented'],
            sizeOptions: ['Newborn', 'Small', 'Medium', 'Large', 'XL', 'XXL', 'Jumbo'],
            packagingOptions: ['Pack', 'Jumbo Pack', 'Box'],
            packContentValues: ['10', '20', '30', '40', '50', '60', '80', '100', '120'],
            packContentUnits: ['pcs']
        },
        beverage: {
            fields: ['variant', 'volume', 'packaging'],
            variantLabel: 'Flavor',
            variantOptions: ['Original', 'Orange', 'Apple', 'Grape', 'Lemon', 'Mango', 'Strawberry', 'Chocolate', 'Vanilla', 'Coffee', 'Mocha'],
            volumeValues: ['150', '180', '200', '250', '300', '330', '500', '750', '1000', '1500', '2000'],
            volumeUnits: base.volumeUnits,
            packagingOptions: ['Bottle', 'Can', 'Sachet', 'Box', 'Carton']
        },
        'canned goods': {
            fields: ['variant', 'weight', 'packaging'],
            variantLabel: 'Flavor / Variant',
            variantOptions: ['Adobo', 'Menudo', 'Hot & Spicy', 'Caldereta', 'Afritada', 'Flakes in Oil', 'Spicy', 'Original', 'Sweet & Spicy', 'Garlic'],
            weightValues: ['50', '80', '90', '100', '120', '155', '175', '180', '200', '250', '300'],
            weightUnits: base.weightUnits,
            packagingOptions: ['Can', 'Pouch']
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
            packagingOptions: ['Pack', 'Box']
        },
        'personal care': {
            fields: ['variant', 'size', 'volume', 'packaging'],
            variantLabel: 'Scent',
            sizeLabel: 'Variant',
            variantOptions: ['Fresh', 'Lavender', 'Aloe', 'Lemon', 'Floral', 'Baby Powder'],
            sizeOptions: ['Sensitive', 'Anti-bacterial', 'Whitening', 'Moisturizing'],
            volumeValues: ['50', '100', '150', '200', '250', '500', '1000'],
            volumeUnits: ['mL'],
            packagingOptions: ['Bottle', 'Sachet', 'Tube']
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
            packagingOptions: ['Bottle', 'Sachet', 'Pouch']
        }
    },
    medicine: {
        default: {
            fields: ['strength', 'form', 'packaging', 'packContent'],
            strengthUnits: base.strengthUnits,
            packagingOptions: ['Blister Pack', 'Bottle', 'Box', 'Strip'],
            packContentValues: ['6', '10', '12', '20', '30', '50', '100'],
            packContentUnits: ['tablets']
        },
        tablet: {
            fields: ['strength', 'form', 'packaging', 'packContent'],
            formValue: 'Tablet',
            strengthUnits: base.strengthUnits,
            packagingOptions: ['Blister Pack', 'Bottle', 'Box', 'Strip'],
            packContentValues: ['6', '10', '12', '20', '30', '50', '100'],
            packContentUnits: ['tablets']
        },
        capsule: {
            fields: ['strength', 'form', 'packaging', 'packContent'],
            formValue: 'Capsule',
            strengthUnits: base.strengthUnits,
            packagingOptions: ['Blister', 'Bottle'],
            packContentValues: ['6', '10', '12', '20', '30', '50', '100'],
            packContentUnits: ['capsules']
        },
        syrup: {
            fields: ['variant', 'strength', 'volume', 'packaging'],
            variantLabel: 'Flavor',
            variantOptions: ['Orange', 'Strawberry', 'Grape', 'Bubblegum'],
            strengthUnits: base.syrupStrengthUnits,
            volumeValues: ['30', '60', '90', '120', '150', '200'],
            volumeUnits: ['mL'],
            packagingOptions: ['Bottle']
        },
        suspension: {
            alias: 'syrup'
        },
        drops: {
            fields: ['volume', 'packaging'],
            volumeValues: ['5', '10', '15'],
            volumeUnits: ['mL'],
            packagingOptions: ['Bottle', 'Dropper']
        },
        cream: {
            fields: ['weight', 'form', 'packaging'],
            formValue: 'Cream',
            weightValues: ['5', '10', '15', '20', '30', '50', '100'],
            weightUnits: ['g', 'mL'],
            packagingOptions: ['Tube', 'Jar']
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
            fields: ['strength', 'volume', 'form', 'packaging'],
            formValue: 'Injection',
            strengthUnits: base.strengthUnits,
            volumeValues: ['1', '2', '5', '10', '20'],
            volumeUnits: ['mL'],
            packagingOptions: ['Ampule', 'Vial']
        },
        inhaler: {
            fields: ['volume', 'packaging'],
            volumeValues: ['100', '200'],
            volumeUnits: ['mL'],
            packagingOptions: ['Canister']
        },
        nebulizer: {
            alias: 'inhaler'
        },
        powder: {
            fields: ['weight', 'packaging'],
            weightValues: ['1', '5', '10', '15', '20'],
            weightUnits: ['g'],
            packagingOptions: ['Sachet', 'Box']
        },
        sachet: {
            alias: 'powder'
        },
        'first aid': {
            fields: ['size', 'volume', 'packaging'],
            sizeOptions: ['Small', 'Medium', 'Large', 'Roll', 'Pad', 'Bottle'],
            volumeValues: ['50', '100', '250', '500', '1000'],
            volumeUnits: ['mL'],
            packagingOptions: ['Pack', 'Box', 'Bottle', 'Roll']
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
