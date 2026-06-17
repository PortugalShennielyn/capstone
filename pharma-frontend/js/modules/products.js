import API_BASE_URL from '../config/config.js';
import PharmaUtils from '../utils.js';
import {
    cleanDisplay,
    combineValueUnit as ruleCombineValueUnit,
    datalist,
    getVariationRule,
    optionList as ruleOptionList,
    uniqueDetailRows
} from './variation_rules.js';

function getValue(id) {
    return document.getElementById(id)?.value.trim() || '';
}

function setSelectValue(selectId, value) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const cleanValue = String(value || '').trim();
    const option = Array.from(select.options).find((item) => item.value.toLowerCase() === cleanValue.toLowerCase());

    if (option) {
        select.value = option.value;
        return;
    }

    if (cleanValue) {
        const custom = document.createElement('option');
        custom.value = cleanValue;
        custom.textContent = cleanValue;
        select.appendChild(custom);
        select.value = cleanValue;
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

const productState = {
    products: [],
    categories: [],
    types: [],
    units: [],
    selectedVariations: {}
};

function formatPrice(value) {
    return `\u20b1${Number(value || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function getProductStock(product) {
    if (Array.isArray(product.variations)) {
        return product.variations.reduce((total, variation) => total + Number(variation.stock ?? variation.current_stock ?? 0), 0);
    }

    return Number(product.current_stock ?? product.stock_quantity ?? product.quantity_remaining ?? 0);
}

function getProductStrength(product) {
    const value = String(product.strength_size_value || product.strength_size || '').trim();

    if (!value || value === 'N/A') {
        return 'N/A';
    }

    return value;
}

function getProductUnit(product) {
    const unit = String(product.measurement_unit_name || '').trim();
    return unit && unit !== 'N/A' ? unit : 'N/A';
}

function getProductSize(product) {
    const size = String(product.size_value || product.packaging_size || product.size_weight || product.goods_type || product.unit || '').trim();

    if (size && size !== 'N/A') {
        return size;
    }

    return 'N/A';
}

function detailText(product) {
    return [
        product.product_name,
        product.brand_name,
        product.category_name,
        product.type_name
    ].join(' ').toLowerCase();
}

function medicineKind(product) {
    const text = detailText(product);

    if (/\b(tablet|tablets|capsule|capsules|pill|pills)\b/.test(text)) {
        return 'solid';
    }

    if (/\b(liquid|syrup|solution|suspension|drops|betadine|povidone)\b/.test(text)) {
        return 'liquid';
    }

    if (/\b(first aid|medical supply|supply|supplies|bandage|gauze|cotton|plaster)\b/.test(text)) {
        return 'supply';
    }

    return 'solid';
}

function volumeValue(value) {
    const text = String(value || 'N/A').trim();

    if (/^\d+(\.\d+)?\s*g$/i.test(text)) {
        return text.replace(/\s*g$/i, 'mL');
    }

    return text || 'N/A';
}

function combineValueUnit(value, unit) {
    const cleanValue = String(value || '').trim();
    const cleanUnit = String(unit || '').trim();

    if (!cleanValue || cleanValue === 'N/A') return 'N/A';
    return cleanUnit ? `${cleanValue} ${cleanUnit}` : cleanValue;
}

function hasDisplayValue(value) {
    return cleanDisplay(value) !== '';
}

function nonEmptyRows(rows) {
    return uniqueDetailRows(rows);
}

function cleanCardText(value) {
    const clean = cleanDisplay(value);
    if (!clean) return '';

    const words = clean.split(/\s+/);
    const compact = words.filter((word, index) => index === 0 || word.toLowerCase() !== words[index - 1].toLowerCase());
    return compact.join(' ');
}

function cleanCardLabel(label) {
    const clean = String(label || '').trim();
    if (/^package type$/i.test(clean)) return 'Form';
    if (/^flavor\s*\/\s*variant$/i.test(clean)) return 'Flavor';
    return clean;
}

function cleanCardRows(rows) {
    return nonEmptyRows(rows.map(([label, value]) => [cleanCardLabel(label), cleanCardText(value)]));
}

const FORM_OPTIONS = ['tablet', 'capsule', 'sachet', 'tube', 'vial', 'ampule', 'bottle', 'box', 'pack', 'can', 'jar', 'roll', 'strip', 'blister pack', 'plastic pack', 'carton', 'pouch'];
const SMART_TYPES = {
    Medicine: ['Tablet', 'Capsule', 'Syrup', 'Drops', 'Injection', 'Ointment', 'Cream', 'Gel', 'Solution', 'Suspension', 'Powder', 'Patch', 'Inhaler', 'Nebulizer', 'Suppository', 'First Aid', 'Medical Supply', 'Device/Equipment'],
    Grocery: ['Beverage', 'Snacks', 'Canned Goods', 'Noodles', 'Condiments', 'Dairy', 'Bread/Bakery', 'Biscuits', 'Baby Care', 'Hygiene Product', 'Household Item', 'Personal Care']
};

function isMedicine(product) {
    return product.category_name === 'Medicine';
}

function isGrocery(product) {
    return product.category_name === 'Grocery';
}

function smartTypeList(categoryName, types = [], selectedTypeId = '') {
    const allowed = SMART_TYPES[categoryName] || [];
    if (!allowed.length) return types;

    const allowedKeys = new Set(allowed.map((type) => type.toLowerCase()));
    return types.filter((type) => allowedKeys.has(String(type.type_name || '').toLowerCase()) || String(type.type_id) === String(selectedTypeId));
}

function categoryNameById(categoryId) {
    return productState.categories.find((category) => String(category.category_id) === String(categoryId))?.category_name || '';
}

function getStockStatus(stock) {
    if (stock <= 0) return 'out-stock';
    if (stock <= 10) return 'low-stock';
    return 'in-stock';
}

function getProductById(productId) {
    return productState.products.find(product => String(product.product_id) === String(productId));
}

function getVariationName(variation) {
    const name = variation?.variation_name || variation?.variant_name || variation?.variant_flavor;
    if (hasDisplayValue(name)) return name;

    const fallback = [
        combineValueUnit(variation?.strength_value, variation?.strength_unit),
        combineValueUnit(variation?.volume_value, variation?.volume_unit),
        combineValueUnit(variation?.weight_value, variation?.weight_unit),
        variation?.size_value,
        variation?.packaging
    ].find(hasDisplayValue);

    return fallback || 'Default';
}

function getVariationAttributeValue(variation, attribute) {
    switch (attribute) {
        case 'variant':
            return cleanCardText(variation?.variant_name || variation?.variant_flavor || variation?.variation_name);
        case 'strength':
            return cleanCardText(ruleCombineValueUnit(variation?.strength_value, variation?.strength_unit));
        case 'volume':
            return cleanCardText(ruleCombineValueUnit(variation?.volume_value, variation?.volume_unit));
        case 'weight':
            return cleanCardText(ruleCombineValueUnit(variation?.weight_value, variation?.weight_unit));
        case 'size':
            return cleanCardText([variation?.size_value, variation?.size_unit].filter(hasDisplayValue).join(' '));
        case 'packContent':
            return cleanCardText(ruleCombineValueUnit(variation?.pack_content_qty, variation?.pack_content_unit));
        default:
            return '';
    }
}

function variationAttributeDefinitions(product) {
    const rule = getVariationRule(product.category_name || '', product.type_name || '');
    const fields = new Set(rule.fields || []);
    const definitions = [];

    if (fields.has('variant')) definitions.push(['variant', cleanCardLabel(rule.variantLabel || 'Variant / Feature')]);
    if (fields.has('strength')) definitions.push(['strength', 'Strength']);
    if (fields.has('volume')) definitions.push(['volume', 'Volume']);
    if (fields.has('weight')) definitions.push(['weight', 'Net Weight']);
    if (fields.has('size')) definitions.push(['size', cleanCardLabel(rule.sizeLabel || 'Size')]);
    if (fields.has('packContent')) definitions.push(['packContent', 'Pack Content']);

    return definitions;
}

function productVariationGroups(product) {
    const variations = Array.isArray(product?.variations) ? product.variations : [];
    if (variations.length <= 1) return [];

    return variationAttributeDefinitions(product)
        .map(([attribute, label]) => {
            const choices = [];
            const seen = new Set();

            variations.forEach((variation) => {
                const value = getVariationAttributeValue(variation, attribute);
                const key = value.toLowerCase();
                if (!value || seen.has(key)) return;
                seen.add(key);
                choices.push(value);
            });

            return { attribute, label, choices };
        })
        .filter((group) => group.choices.length > 1);
}

function variationMatchesAttributes(variation, attributes) {
    return Object.entries(attributes).every(([attribute, value]) => {
        if (!value) return true;
        return getVariationAttributeValue(variation, attribute).toLowerCase() === String(value).toLowerCase();
    });
}

function selectVariationByAttribute(product, attribute, value) {
    const variations = Array.isArray(product?.variations) ? product.variations : [];
    if (!variations.length) return;

    const activeVariation = getDefaultVariation(product) || variations[0];
    const activeAttributes = Object.fromEntries(
        productVariationGroups(product).map((group) => [
            group.attribute,
            getVariationAttributeValue(activeVariation, group.attribute)
        ])
    );
    activeAttributes[attribute] = value;

    const exactMatch = variations.find((variation) => variationMatchesAttributes(variation, activeAttributes));
    const clickedMatch = variations.find((variation) => getVariationAttributeValue(variation, attribute).toLowerCase() === String(value).toLowerCase());
    const selected = exactMatch || clickedMatch || activeVariation;
    productState.selectedVariations[product.product_id] = selected.variation_id;
}

function getDefaultVariation(product) {
    const variations = Array.isArray(product?.variations) ? product.variations : [];
    if (!variations.length) return null;

    const selectedId = productState.selectedVariations[product.product_id];
    return variations.find(variation => String(variation.variation_id) === String(selectedId))
        || variations.find(variation => String(variation.is_default) === '1')
        || variations.find(variation => String(variation.variation_id) === String(product.variation_id))
        || variations[0];
}

function getActiveProductStock(product) {
    const variation = getDefaultVariation(product);
    return variation ? Number(variation.stock ?? variation.current_stock ?? 0) : getProductStock(product);
}

function getActiveProductPrice(product) {
    const variation = getDefaultVariation(product);
    return variation?.price ?? product.price;
}

function productSearchText(product) {
    const variationText = (product.variations || []).map(variation => [
        getVariationName(variation),
        variation.size_value,
        variation.weight_value,
        variation.weight_unit,
        variation.packaging,
        variation.barcode,
        variation.sku
    ].join(' ')).join(' ');

    return [
        product.product_name,
        product.brand_name,
        product.generic_name,
        product.variant_flavor,
        product.packaging,
        product.barcode,
        product.category_name,
        product.type_name,
        variationText
    ].join(' ').toLowerCase();
}

function productCardDetailRows(product) {
    const strength = getProductStrength(product);
    const size = getProductSize(product);
    const variation = getDefaultVariation(product);
    const rule = getVariationRule(product.category_name || '', product.type_name || '');
    const form = isGrocery(product)
        ? (variation?.packaging || product.packaging || '')
        : (rule.formValue || variation?.unit || product.type_name);
    const buttonLabels = new Set(productVariationGroups(product).map((group) => group.label));

    if (isGrocery(product)) {
        return cleanCardRows([
            rule.fields.includes('variant') ? [rule.variantLabel || 'Variant / Feature', getVariationAttributeValue(variation, 'variant')] : ['', ''],
            rule.fields.includes('size') ? [rule.sizeLabel || 'Size', variation?.size_value || product.display_size || size] : ['', ''],
            rule.fields.includes('volume') ? ['Volume', ruleCombineValueUnit(variation?.volume_value, variation?.volume_unit)] : ['', ''],
            rule.fields.includes('weight') ? ['Net Weight', ruleCombineValueUnit(variation?.weight_value ?? product.weight_volume_value, variation?.weight_unit ?? product.weight_volume_unit)] : ['', ''],
            ['Form', form],
            rule.fields.includes('packContent') ? ['Pack Content', ruleCombineValueUnit(variation?.pack_content_qty, variation?.pack_content_unit)] : ['', '']
        ]).filter(([label]) => !buttonLabels.has(label));
    }

    if (isMedicine(product)) {
        return cleanCardRows([
            ['Generic', product.generic_name],
            rule.fields.includes('strength') ? ['Strength', ruleCombineValueUnit(variation?.strength_value || product.strength_value || strength, variation?.strength_unit || product.strength_unit)] : ['', ''],
            rule.fields.includes('weight') ? ['Net Weight', ruleCombineValueUnit(variation?.weight_value || product.weight_volume_value || product.strength_value, variation?.weight_unit || product.weight_volume_unit || product.strength_unit)] : ['', ''],
            rule.fields.includes('volume') ? ['Volume', ruleCombineValueUnit(variation?.volume_value || product.volume_value, variation?.volume_unit || product.volume_unit)] : ['', ''],
            rule.fields.includes('variant') ? [rule.variantLabel || 'Flavor', getVariationAttributeValue(variation, 'variant')] : ['', ''],
            rule.fields.includes('size') ? [rule.sizeLabel || 'Size', variation?.size_value || product.display_size || size] : ['', ''],
            rule.fields.includes('form') ? ['Form', form] : ['', ''],
            rule.fields.includes('packaging') && !rule.fields.includes('form') ? ['Form', variation?.packaging || product.packaging] : ['', ''],
            rule.fields.includes('packContent') ? ['Pack Content', ruleCombineValueUnit(variation?.pack_content_qty, variation?.pack_content_unit)] : ['', '']
        ]).filter(([label]) => !buttonLabels.has(label));
    }

    return cleanCardRows([
        ['Type', product.type_name],
        ['Size', variation?.size_value || size],
        ['Form', variation?.packaging || product.packaging],
        ['Pack Content', ruleCombineValueUnit(variation?.pack_content_qty, variation?.pack_content_unit)]
    ]).filter(([label]) => !buttonLabels.has(label));
}

function variationLabel(variation) {
    const parts = [
        variation.variant_name,
        combineValueUnit(variation.strength_value, variation.strength_unit),
        combineValueUnit(variation.volume_value, variation.volume_unit),
        combineValueUnit(variation.weight_value, variation.weight_unit),
        [variation.size_value, variation.size_unit].filter(Boolean).join(' '),
        variation.unit,
        variation.packaging
    ].filter((value) => value && value !== 'N/A');

    return parts.length ? parts.join(' | ') : 'Default';
}

function productVariationChips(product) {
    const groups = productVariationGroups(product);
    if (!groups.length) {
        return '';
    }

    const activeVariation = getDefaultVariation(product);
    return `
        <div class="product-variant-tabs">
            ${groups.map((group) => `
                <div class="product-variant-group">
                    <div class="product-variant-label">${escapeHtml(group.label)}</div>
                    <div class="product-variant-chip-row">
                        ${group.choices.map((choice) => {
                            const activeValue = getVariationAttributeValue(activeVariation, group.attribute);
                            return `
                                <button type="button"
                                    class="product-variant-chip ${activeValue.toLowerCase() === choice.toLowerCase() ? 'is-active' : ''}"
                                    data-product-id="${escapeHtml(product.product_id)}"
                                    data-variation-attribute="${escapeHtml(group.attribute)}"
                                    data-variation-value="${escapeHtml(choice)}">
                                    ${escapeHtml(choice)}
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderProductCard(product) {
    const activeVariation = getDefaultVariation(product);
    const stock = getActiveProductStock(product);
    const stockStatus = getStockStatus(stock);
    const detailRows = productCardDetailRows(product);
    const variationId = activeVariation?.variation_id || '';

    return `
        <article class="product-card" data-product-id="${escapeHtml(product.product_id)}">
            <div class="product-card-body">
                <div class="product-card-head">
                    <div class="product-name-block">
                        <h3 class="product-title">${escapeHtml(product.product_name || 'Unnamed Product')}</h3>
                        <div class="product-brand">${escapeHtml(product.brand_name || 'No brand')}</div>
                    </div>
                    <div class="product-card-tools">
                        <button type="button" class="product-barcode-toggle" data-product-id="${escapeHtml(product.product_id)}" data-variation-id="${escapeHtml(variationId)}" title="Show barcode" aria-label="Show barcode">
                            <i class="fa-solid fa-barcode"></i>
                        </button>
                    </div>
                </div>
                <div class="product-meta">${escapeHtml(cleanCardText(product.category_name) || 'Product')} &bull; ${escapeHtml(cleanCardText(product.type_name) || 'General')}</div>
                ${productVariationChips(product)}
                <div class="product-detail-list">
                    ${detailRows.map(([label, value]) => `<div class="product-detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}
                </div>
                <div class="product-stock-row">
                    <span class="stock-pill ${stockStatus}">
                        <i class="fa-solid fa-boxes-stacked"></i>
                        ${escapeHtml(stock)}
                    </span>
                    <span class="product-price">${formatPrice(getActiveProductPrice(product))}</span>
                </div>
                <div class="product-card-actions">
                    <button class="btn btn-sm btn-purple add-stock-btn" data-id="${escapeHtml(product.product_id)}" data-variation-id="${escapeHtml(variationId)}">Add Stock</button>
                    <button type="button" class="btn btn-outline-primary btn-icon edit-product-btn" data-product-id="${escapeHtml(product.product_id)}" title="Edit product">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger btn-icon delete-product-btn" data-product-id="${escapeHtml(product.product_id)}" title="Delete product">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        </article>
    `;
}

function refreshProductCard(productId) {
    const grid = document.getElementById('productsGrid');
    const product = getProductById(productId);
    const card = grid?.querySelector(`.product-card[data-product-id="${CSS.escape(String(productId))}"]`);

    if (!grid || !product || !card) {
        renderProductCards();
        return;
    }

    card.outerHTML = renderProductCard(product);
}

function getFilteredProducts() {
    const searchValue = document.getElementById('productSearchInput')?.value.trim().toLowerCase() || '';
    const categoryValue = document.getElementById('productCategoryFilter')?.value || '';
    const typeValue = document.getElementById('productTypeFilter')?.value || '';
    const stockValue = document.getElementById('productStockFilter')?.value || 'all';
    const sortValue = document.getElementById('productSortSelect')?.value || 'name-asc';

    const filtered = productState.products.filter(product => {
        const stockStatus = getStockStatus(getProductStock(product));
        const matchesSearch = !searchValue || productSearchText(product).includes(searchValue);
        const matchesCategory = !categoryValue || String(product.category_id) === String(categoryValue);
        const matchesType = !typeValue || String(product.type_id) === String(typeValue);
        const matchesStock = stockValue === 'all' || stockStatus === stockValue;

        return matchesSearch && matchesCategory && matchesType && matchesStock;
    });

    filtered.sort((a, b) => {
        const nameA = String(a.product_name || '').toLowerCase();
        const nameB = String(b.product_name || '').toLowerCase();
        const priceA = Number(a.price || 0);
        const priceB = Number(b.price || 0);
        const stockA = getProductStock(a);
        const stockB = getProductStock(b);

        switch (sortValue) {
            case 'name-desc':
                return nameB.localeCompare(nameA);
            case 'price-asc':
                return priceA - priceB;
            case 'price-desc':
                return priceB - priceA;
            case 'stock-asc':
                return stockA - stockB;
            case 'stock-desc':
                return stockB - stockA;
            case 'name-asc':
            default:
                return nameA.localeCompare(nameB);
        }
    });

    return filtered;
}

function renderProductCards() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    const products = getFilteredProducts();

    if (!products.length) {
        grid.innerHTML = `
            <div class="empty-products">
                <div class="fw-bold mb-1">No products found</div>
                <div>Try changing your search, category, stock status, or sort filters.</div>
            </div>
        `;
        return;
    }

    grid.innerHTML = products.map(renderProductCard).join('');
}

function openBarcodeModal(productId, variationId = '') {
    const product = getProductById(productId);
    if (!product) return;

    const variation = (product.variations || []).find((item) => String(item.variation_id) === String(variationId));
    const barcode = variation?.barcode || product.barcode || `AUTO-${product.product_id || ''}`;
    const productName = document.getElementById('barcodeModalProductName');
    const brand = document.getElementById('barcodeModalBrand');
    const text = document.getElementById('barcodeModalText');
    const displayText = document.getElementById('barcodeModalDisplayText');

    if (productName) productName.textContent = product.product_name || 'Unnamed Product';
    if (brand) brand.textContent = product.brand_name || 'No brand';
    if (text) text.textContent = variation ? `${variationLabel(variation)} - ${barcode}` : barcode;
    if (displayText) displayText.textContent = barcode;

    const modal = document.getElementById('productBarcodeModal');
    if (modal) bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function populateProductCardFilters() {
    const categoryFilter = document.getElementById('productCategoryFilter');
    if (!categoryFilter) return;

    try {
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_categories.php`, {
            method: 'GET',
            credentials: 'include'
        });

        productState.categories = resp?.categories || [];
        categoryFilter.innerHTML = '<option value="">All Categories</option>';
        productState.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.category_id;
            option.textContent = category.category_name;
            categoryFilter.appendChild(option);
        });
    } catch (err) {
        console.warn('Failed to load product card filters:', err.message || err);
    }
}

async function loadProductTypeFilter(categoryId = '') {
    const typeFilter = document.getElementById('productTypeFilter');
    if (!typeFilter) return;

    const selectedType = typeFilter.value;
    typeFilter.innerHTML = '<option value="">All Product Types</option>';

    try {
        const query = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : '';
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_product_types.php${query}`, {
            method: 'GET',
            credentials: 'include'
        });

        productState.types = smartTypeList(categoryNameById(categoryId), resp?.types || [], selectedType);
        productState.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type.type_id;
            option.textContent = type.type_name;
            option.dataset.categoryId = type.category_id;
            typeFilter.appendChild(option);
        });

        if (selectedType && productState.types.some(type => String(type.type_id) === String(selectedType))) {
            typeFilter.value = selectedType;
        }
    } catch (err) {
        console.warn('Failed to load product type filter:', err.message || err);
    }
}

async function loadMeasurementUnitCache() {
    if (productState.units.length) return productState.units;

    const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_measurement_units.php`, {
        method: 'GET',
        credentials: 'include'
    });

    productState.units = resp?.units || [];
    return productState.units;
}

function getSelectedAddCategoryName() {
    return document.getElementById('productCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
}

function selectedAddTypeName() {
    return document.getElementById('productType')?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function getVariationProductUnit(variation = {}) {
    return cleanDisplay(variation.unit) || cleanDisplay(variation.packaging) || 'pcs';
}

function buildProductPayload() {
    const variations = collectAddVariations();
    const firstVariation = variations.find((variation) => !variation.delete) || variations[0] || {};
    const categoryName = getSelectedAddCategoryName();

    const payload = {
        supplier_id: getValue('supplier_id') || null,
        brand_name: getValue('productBrandName'),
        product_name: getValue('productName'),
        category_id: getValue('productCategory'),
        type_id: getValue('productType'),
        category_name: categoryName,
        product_type: selectedAddTypeName(),
        product_unit: getVariationProductUnit(firstVariation),
        unit: getVariationProductUnit(firstVariation),
        price: firstVariation.price || '0',
        barcode: firstVariation.barcode || '',
        image_url: getValue('productImageUrl'),
        variations
    };

    if (categoryName === 'Medicine') {
        payload.generic_name = getValue('genericName');
    }

    return payload;
}

async function populateAddCategories(selectedCategoryId = '') {
    const categorySelect = document.getElementById('productCategory');
    if (!categorySelect) return;

    try {
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_categories.php`, {
            method: 'GET',
            credentials: 'include'
        });

        productState.categories = resp?.categories || [];
        categorySelect.innerHTML = '<option value="" disabled selected>Select category...</option>';
        productState.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.category_id;
            option.textContent = category.category_name;
            option.dataset.categoryName = category.category_name;
            categorySelect.appendChild(option);
        });

        if (selectedCategoryId) {
            categorySelect.value = String(selectedCategoryId);
        }
    } catch (err) {
        console.warn('Failed to load add product categories:', err.message || err);
    }
}

async function populateAddTypes(categoryId = '', selectedTypeId = '') {
    const typeSelect = document.getElementById('productType');
    if (!typeSelect) return;

    typeSelect.disabled = true;
    typeSelect.innerHTML = '<option value="" disabled selected>Select category first...</option>';

    if (!categoryId) return;

    try {
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_product_types.php?category_id=${encodeURIComponent(categoryId)}`, {
            method: 'GET',
            credentials: 'include'
        });

        typeSelect.innerHTML = '<option value="" disabled selected>Select product type...</option>';
        smartTypeList(categoryNameById(categoryId), resp?.types || [], selectedTypeId).forEach(type => {
            const option = document.createElement('option');
            option.value = type.type_id;
            option.textContent = type.type_name;
            typeSelect.appendChild(option);
        });
        typeSelect.value = selectedTypeId ? String(selectedTypeId) : '';
        typeSelect.disabled = false;
    } catch (err) {
        console.warn('Failed to load add product types:', err.message || err);
    }
}

async function populateSupplierDropdown() {
    const select = document.getElementById('supplier_id');
    if (!select) return;

    // Reset options and add placeholder
    select.innerHTML = '<option value="" disabled selected>Select Supplier...</option>';

    try {
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/suppliers/get_suppliers.php`, {
            method: 'GET',
            credentials: 'include'
        });

        const suppliers = resp?.suppliers || resp?.data || [];

        suppliers.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.supplier_id ?? s.id ?? '';
            opt.textContent = s.supplier_name ?? s.name ?? 'Unknown';
            select.appendChild(opt);
        });
    } catch (err) {
        console.warn('Failed to load suppliers:', err.message || err);
    }
}

function closeAddProductModal() {
    const modalElement = document.getElementById('addProductModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElement);

    modalInstance?.hide();
}

function closeAddStockModal() {
    const modalElement = document.getElementById('addStockModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElement);

    modalInstance?.hide();
}

function initAddProductForm() {
    const addProductForm = document.getElementById('addProductForm');

    if (!addProductForm) {
        return;
    }

    document.getElementById('productCategory')?.addEventListener('change', async (event) => {
        await populateAddTypes(event.target.value, '');
        const categoryName = getSelectedAddCategoryName();
        const genericWrap = document.getElementById('addGenericNameWrap');
        const genericInput = document.getElementById('genericName');
        genericWrap?.classList.toggle('d-none', categoryName !== 'Medicine');
        if (genericInput) genericInput.required = categoryName === 'Medicine';
        renderAddVariations({ variations: collectAddVariations() }, categoryName);
    });

    document.getElementById('productType')?.addEventListener('change', () => {
        renderAddVariations({ variations: collectAddVariations() }, getSelectedAddCategoryName());
    });

    document.getElementById('btnAddProductVariation')?.addEventListener('click', () => {
        const categoryName = getSelectedAddCategoryName();
        const typeName = selectedAddTypeName();
        document.getElementById('addVariationList')?.insertAdjacentHTML('beforeend', editVariationEntry({}, categoryName, typeName, true, 'add'));
        if (!document.querySelector('#addVariationList .edit-var-default:checked')) {
            document.querySelector('#addVariationList .edit-var-default')?.click();
        }
    });

    document.getElementById('addVariationList')?.addEventListener('click', (event) => {
        const removeButton = event.target.closest('.btn-remove-edit-variation');
        if (!removeButton) return;
        const entries = document.querySelectorAll('#addVariationList .edit-variation-entry');
        if (entries.length <= 1) return;
        removeButton.closest('.edit-variation-entry')?.remove();
        if (!document.querySelector('#addVariationList .edit-var-default:checked')) {
            document.querySelector('#addVariationList .edit-var-default')?.click();
        }
    });

    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = buildProductPayload();

        try {
            PharmaUtils.modal.loading('Saving Product...');

            await PharmaUtils.safeFetch(`${API_BASE_URL}/products/add_product.php`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            PharmaUtils.modal.close();
            await PharmaUtils.modal.success('Product Saved', 'Item added to system master files successfully.');

            addProductForm.reset();
            document.getElementById('addGenericNameWrap')?.classList.add('d-none');
            document.getElementById('productType').disabled = true;
            renderAddVariations();
            closeAddProductModal();
            await loadProductsTable();
        } catch (err) {
            PharmaUtils.modal.close();
            PharmaUtils.modal.error('Failed to add product', err.message);
        }
    });
}
async function loadProductsTable() {
    const cardGrid = document.getElementById('productsGrid');
    const tableBody = document.querySelector('#table-products tbody') || document.querySelector('#productsTable tbody') || document.getElementById('productTableBody');

    if (!cardGrid && !tableBody) return;

    try {
        const resp = await fetchProductsWithRetry();

        const products = (resp && resp.data) ? resp.data : [];
        productState.products = products;

        if (cardGrid) {
            renderProductCards();
            return;
        }

        tableBody.innerHTML = '';

        if (products.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted py-4">No products found.</td>
                </tr>
            `;
            return;
        }

        products.forEach((product) => {
            const categoryName = product.category_name || '';
            const genericName = categoryName === 'Medicine'
                ? escapeHtml(product.generic_name || 'N/A')
                : escapeHtml(product.variant_flavor || 'N/A');
            const isLiquid = /\b(liquid|syrup|solution|suspension|drops|betadine|povidone)\b/.test(`${product.product_name || ''} ${product.brand_name || ''} ${product.type_name || ''}`.toLowerCase());
            const strengthSize = categoryName === 'Grocery'
                ? `Size: ${product.size_value || 'N/A'} / Weight/Volume: ${combineValueUnit(product.weight_volume_value, product.weight_volume_unit)} / Unit: ${product.product_unit || product.measurement_unit_name || 'N/A'}${product.packaging ? ` / ${product.packaging}` : ''}`.trim()
                : (isLiquid
                    ? `Volume: ${combineValueUnit(product.volume_value || product.strength_value || product.strength_size_value, product.volume_unit)} / Unit: ${product.product_unit || product.measurement_unit_name || 'N/A'} / Packaging: ${product.packaging || 'N/A'}`
                    : `Strength: ${combineValueUnit(product.strength_value || product.strength_size_value, product.strength_unit)} / Unit: ${product.product_unit || product.measurement_unit_name || 'N/A'} / Packaging: ${product.packaging || 'N/A'}`);

            tableBody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td>${escapeHtml(product.barcode)}</td>
                    <td>${escapeHtml(product.brand_name)}</td>
                    <td>${escapeHtml(product.product_name)}</td>
                    <td>${escapeHtml(categoryName || 'N/A')}</td>
                    <td>${escapeHtml(product.type_name || 'N/A')}</td>
                    <td>${genericName}</td>
                    <td>${escapeHtml(strengthSize)}</td>
                    <td>${Number(product.price || 0).toFixed(2)}</td>
                    <td>
                        <div class="table-actions product-actions" role="group" aria-label="Product actions">
                            <button class="btn btn-sm btn-purple add-stock-btn" data-id="${escapeHtml(product.product_id)}">Add Stock</button>
                            <button type="button" class="btn btn-outline-primary" data-product-id="${escapeHtml(product.product_id)}" title="Edit product">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button type="button" class="btn btn-outline-danger" data-product-id="${escapeHtml(product.product_id)}" title="Delete product">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `);
        });
    } catch (err) {
        if (cardGrid) {
            cardGrid.innerHTML = `
                <div class="empty-products">
                    <div class="fw-bold mb-1">Unable to load products</div>
                    <div>${escapeHtml(err.message || 'Please refresh the page.')}</div>
                </div>
            `;
            return;
        }

        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-danger py-4">${escapeHtml(err.message)}</td>
                </tr>
            `;
        }
    }
}

async function fetchProductsWithRetry() {
    let lastError;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 10000);
        const cacheBust = attempt === 0 ? '' : `?t=${Date.now()}`;

        try {
            return await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_products.php${cacheBust}`, {
                method: 'GET',
                credentials: 'include',
                signal: controller.signal
            });
        } catch (err) {
            lastError = err;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    throw lastError || new Error('Unable to load products.');
}

async function populateEditCategories(selectedCategoryId = '') {
    const categorySelect = document.getElementById('editProductCategory');
    if (!categorySelect) return;

    if (!productState.categories.length) {
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_categories.php`, {
            method: 'GET',
            credentials: 'include'
        });
        productState.categories = resp?.categories || [];
    }

    categorySelect.innerHTML = '<option value="" disabled>Select category...</option>';
    productState.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.category_id;
        option.textContent = category.category_name;
        option.dataset.categoryName = category.category_name;
        categorySelect.appendChild(option);
    });

    categorySelect.value = selectedCategoryId ? String(selectedCategoryId) : '';
}

async function populateEditTypes(categoryId = '', selectedTypeId = '') {
    const typeSelect = document.getElementById('editProductType');
    if (!typeSelect) return;

    typeSelect.disabled = true;
    typeSelect.innerHTML = '<option value="" disabled selected>Select category first...</option>';

    if (!categoryId) return;

    const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_product_types.php?category_id=${encodeURIComponent(categoryId)}`, {
        method: 'GET',
        credentials: 'include'
    });

    typeSelect.innerHTML = '<option value="" disabled>Select product type...</option>';
    smartTypeList(categoryNameById(categoryId), resp?.types || [], selectedTypeId).forEach(type => {
        const option = document.createElement('option');
        option.value = type.type_id;
        option.textContent = type.type_name;
        typeSelect.appendChild(option);
    });
    typeSelect.value = selectedTypeId ? String(selectedTypeId) : '';
    typeSelect.disabled = false;
}

async function populateEditUnits(selectedUnitId = '') {
    const unitSelect = document.getElementById('editProductMeasurementUnit');
    const groceryUnitSelect = document.getElementById('editProductMeasurementUnitGrocery');
    if (!unitSelect && !groceryUnitSelect) return;

    const units = await loadMeasurementUnitCache();
    [unitSelect, groceryUnitSelect].filter(Boolean).forEach(select => {
        select.innerHTML = '<option value="" disabled>Select measurement unit...</option>';
        units.forEach(unit => {
            const option = document.createElement('option');
            option.value = unit.measurement_unit_id;
            option.textContent = unit.unit_name;
            select.appendChild(option);
        });
        select.value = selectedUnitId ? String(selectedUnitId) : '';
    });
}

function syncEditUnitSelects(sourceId) {
    const source = document.getElementById(sourceId);
    const targetId = sourceId === 'editProductMeasurementUnit'
        ? 'editProductMeasurementUnitGrocery'
        : 'editProductMeasurementUnit';
    const target = document.getElementById(targetId);

    if (source && target) {
        target.value = source.value;
    }
}

function populateSelectFromUnits(select, units, selectedUnitId) {
    if (!select) return;
    select.innerHTML = '<option value="" disabled>Select measurement unit...</option>';
    units.forEach(unit => {
        const option = document.createElement('option');
        option.value = unit.measurement_unit_id;
        option.textContent = unit.unit_name;
        select.appendChild(option);
    });
    select.value = selectedUnitId ? String(selectedUnitId) : '';
}

function toggleEditGenericField() {
    const categorySelect = document.getElementById('editProductCategory');
    const categoryName = categorySelect?.selectedOptions?.[0]?.dataset.categoryName || '';
    const generic = document.getElementById('editProductGeneric');
    document.getElementById('editGenericNameWrap')?.classList.toggle('d-none', categoryName !== 'Medicine');
    if (generic) generic.required = categoryName === 'Medicine';
}

function optionList(options, selected = '') {
    return ruleOptionList(options, selected);
}

function selectedEditTypeName() {
    return document.getElementById('editProductType')?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function editVariationEntry(variation = {}, categoryName = 'Grocery', typeName = '', canDelete = true, mode = 'edit') {
    const rule = getVariationRule(categoryName, typeName);
    const show = (field) => rule.fields.includes(field);
    const formValue = categoryName === 'Medicine'
        ? (cleanDisplay(variation.unit) || rule.formValue || typeName)
        : (cleanDisplay(variation.packaging) || cleanDisplay(variation.unit) || rule.formValue || typeName);
    const rowId = `variation-rule-${Math.random().toString(36).slice(2)}`;
    const defaultName = `${mode}DefaultVariation`;

    return `
        <div class="edit-variation-entry" data-variation-id="${escapeHtml(variation.variation_id || '')}">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                <span class="fw-bold small text-muted">Variation</span>
                <div class="d-flex align-items-center gap-2">
                    <label class="small text-muted mb-0"><input class="form-check-input edit-var-default me-1" type="radio" name="${escapeHtml(defaultName)}" ${String(variation.is_default) === '1' ? 'checked' : ''}>Default</label>
                    ${canDelete ? '<button class="btn btn-sm btn-outline-danger btn-remove-edit-variation" type="button" title="Delete variation"><i class="fa-solid fa-trash-can"></i></button>' : ''}
                </div>
            </div>
            <div class="row g-3">
                <div class="col-md-4 ${show('variant') ? '' : 'd-none'}"><label class="form-label">${escapeHtml(rule.variantLabel)}</label><input class="form-control edit-var-name" list="${rowId}-variant" value="${escapeHtml(variation.variant_name || '')}" placeholder="Select or type">${datalist(`${rowId}-variant`, rule.variantOptions)}</div>
                <div class="col-md-4 ${show('strength') ? '' : 'd-none'}"><label class="form-label">Strength</label><div class="variation-pair"><input class="form-control edit-var-strength-value" type="number" min="0" step="any" value="${escapeHtml(variation.strength_value || '')}" placeholder="500"><select class="form-select edit-var-strength-unit">${optionList(rule.strengthUnits, variation.strength_unit || '')}</select></div></div>
                <div class="col-md-4 ${show('volume') ? '' : 'd-none'}"><label class="form-label">Volume</label><div class="variation-pair"><input class="form-control edit-var-volume-value" list="${rowId}-volume" type="number" min="0" step="any" value="${escapeHtml(variation.volume_value || '')}" placeholder="60"><select class="form-select edit-var-volume-unit">${optionList(rule.volumeUnits, variation.volume_unit || '')}</select></div>${datalist(`${rowId}-volume`, rule.volumeValues)}</div>
                <div class="col-md-4 ${show('size') ? '' : 'd-none'}"><label class="form-label">${escapeHtml(rule.sizeLabel)}</label><select class="form-select edit-var-size-value">${optionList(rule.sizeOptions, variation.size_value || '')}</select></div>
                <div class="col-md-4 ${show('weight') ? '' : 'd-none'}"><label class="form-label">Net Weight</label><div class="variation-pair"><input class="form-control edit-var-weight-value" list="${rowId}-weight" type="number" min="0" step="any" value="${escapeHtml(variation.weight_value || '')}" placeholder="155"><select class="form-select edit-var-weight-unit">${optionList(rule.weightUnits, variation.weight_unit || '')}</select></div>${datalist(`${rowId}-weight`, rule.weightValues)}</div>
                <div class="col-md-4 ${show('form') ? '' : 'd-none'}"><label class="form-label">Form</label><select class="form-select edit-var-unit">${optionList(FORM_OPTIONS, formValue)}</select></div>
                <div class="col-md-4 ${show('packaging') ? '' : 'd-none'}"><label class="form-label">Form</label><select class="form-select edit-var-packaging">${optionList(rule.packagingOptions, variation.packaging || '')}</select></div>
                <div class="col-md-4 ${show('packContent') ? '' : 'd-none'}"><label class="form-label">Pack Content</label><div class="variation-pair"><input class="form-control edit-var-pack-content-qty" list="${rowId}-pack-content" type="number" min="0" step="1" value="${escapeHtml(variation.pack_content_qty || '')}" placeholder="12"><select class="form-select edit-var-pack-content-unit">${optionList(rule.packContentUnits, variation.pack_content_unit || '')}</select></div>${datalist(`${rowId}-pack-content`, rule.packContentValues)}</div>
                <div class="col-md-4"><label class="form-label">Price</label><input class="form-control edit-var-price" type="number" min="0" step=".01" value="${escapeHtml(variation.price ?? '')}" required></div>
                <div class="col-md-4"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
                <div class="col-md-4"><label class="form-label">Stock</label><input class="form-control edit-var-stock" type="number" min="0" step="1" value="${escapeHtml(variation.stock ?? variation.current_stock ?? 0)}"></div>
                <div class="col-md-4"><label class="form-label">SKU</label><input class="form-control edit-var-sku" value="${escapeHtml(variation.sku || '')}"></div>
            </div>
        </div>
    `;
}

function renderEditVariations(product, categoryName = '') {
    const list = document.getElementById('editVariationList');
    if (!list) return;
    const typeName = selectedEditTypeName() || product?.type_name || '';
    const variations = Array.isArray(product?.variations) && product.variations.length ? product.variations : [{}];
    list.innerHTML = variations.map((variation, index) => editVariationEntry(variation, categoryName || product?.category_name || '', typeName, variations.length > 1 || index > 0, 'edit')).join('');
    if (!list.querySelector('.edit-var-default:checked')) {
        list.querySelector('.edit-var-default')?.setAttribute('checked', 'checked');
    }
}

function renderAddVariations(product = { variations: [{}] }, categoryName = '') {
    const list = document.getElementById('addVariationList');
    if (!list) return;
    const typeName = selectedAddTypeName();
    const variations = Array.isArray(product?.variations) && product.variations.length ? product.variations : [{}];
    list.innerHTML = variations.map((variation, index) => editVariationEntry(variation, categoryName || getSelectedAddCategoryName(), typeName, variations.length > 1 || index > 0, 'add')).join('');
    if (!list.querySelector('.edit-var-default:checked')) {
        list.querySelector('.edit-var-default')?.setAttribute('checked', 'checked');
    }
}

function collectVariationEntries(containerSelector) {
    return Array.from(document.querySelectorAll(`${containerSelector} .edit-variation-entry`)).map(entry => ({
        variation_id: entry.dataset.variationId || '',
        variant_name: entry.querySelector('.edit-var-name')?.value.trim() || '',
        strength_value: entry.querySelector('.edit-var-strength-value')?.value.trim() || '',
        strength_unit: entry.querySelector('.edit-var-strength-unit')?.value || '',
        volume_value: entry.querySelector('.edit-var-volume-value')?.value.trim() || '',
        volume_unit: entry.querySelector('.edit-var-volume-unit')?.value || '',
        size_value: entry.querySelector('.edit-var-size-value')?.value || '',
        weight_value: entry.querySelector('.edit-var-weight-value')?.value.trim() || '',
        weight_unit: entry.querySelector('.edit-var-weight-unit')?.value || '',
        unit: entry.querySelector('.edit-var-unit')?.value.trim() || '',
        packaging: entry.querySelector('.edit-var-packaging')?.value || '',
        pack_content_qty: entry.querySelector('.edit-var-pack-content-qty')?.value || '',
        pack_content_unit: entry.querySelector('.edit-var-pack-content-unit')?.value || '',
        price: entry.querySelector('.edit-var-price')?.value || '0',
        barcode: entry.querySelector('.edit-var-barcode')?.value.trim() || '',
        stock: entry.querySelector('.edit-var-stock')?.value || '0',
        sku: entry.querySelector('.edit-var-sku')?.value.trim() || '',
        is_default: entry.querySelector('.edit-var-default')?.checked ? 1 : 0,
        delete: entry.dataset.deleted === '1'
    }));
}

function collectEditVariations() {
    return collectVariationEntries('#editVariationList');
}

function collectAddVariations() {
    return collectVariationEntries('#addVariationList');
}

async function openEditProduct(productId) {
    const product = getProductById(productId);
    const modalElement = document.getElementById('editProductModal');

    if (!product || !modalElement) return;

    document.getElementById('editProductId').value = product.product_id || '';
    document.getElementById('editProductBrand').value = product.brand_name || '';
    document.getElementById('editProductName').value = product.product_name || '';
    document.getElementById('editProductGeneric').value = product.generic_name || '';
    document.getElementById('editProductImageUrl').value = product.image_url || product.image_path || '';

    await populateEditCategories(product.category_id || '');
    await populateEditTypes(product.category_id || '', product.type_id || '');
    toggleEditGenericField();
    renderEditVariations(product, product.category_name || '');

    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

async function submitEditProduct(event) {
    event.preventDefault();

    const categorySelect = document.getElementById('editProductCategory');
    const categoryName = categorySelect?.selectedOptions?.[0]?.dataset.categoryName || '';

    const payload = {
        product_id: getValue('editProductId'),
        brand_name: getValue('editProductBrand'),
        product_name: getValue('editProductName'),
        category_id: getValue('editProductCategory'),
        type_id: getValue('editProductType'),
        image_url: getValue('editProductImageUrl'),
        variations: collectEditVariations()
    };

    if (categoryName === 'Medicine') {
        payload.generic_name = getValue('editProductGeneric');
    }

    try {
        PharmaUtils.modal.loading('Updating Product...');
        const data = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/update_product.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        PharmaUtils.modal.close();
        bootstrap.Modal.getInstance(document.getElementById('editProductModal'))?.hide();
        await loadProductsTable();
        PharmaUtils.toast.success(data.message || 'Product updated successfully.');
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to update product', err.message);
    }
}

async function deleteProduct(productId) {
    const product = getProductById(productId);
    const confirmed = await PharmaUtils.modal.confirm(
        'Delete Product?',
        `Delete ${product?.product_name || 'this product'} from the product master file?`,
        'Delete'
    );

    if (!confirmed) return;

    try {
        PharmaUtils.modal.loading('Deleting Product...');
        const data = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/delete_product.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId })
        });

        PharmaUtils.modal.close();
        await loadProductsTable();
        PharmaUtils.toast.success(data.message || 'Product deleted successfully.');
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to delete product', err.message);
    }
}

function initProductCards() {
    populateProductCardFilters();
    loadProductTypeFilter();

    ['productSearchInput', 'productTypeFilter', 'productStockFilter', 'productSortSelect'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderProductCards);
        document.getElementById(id)?.addEventListener('change', renderProductCards);
    });

    document.getElementById('productCategoryFilter')?.addEventListener('change', async (event) => {
        await loadProductTypeFilter(event.target.value);
        renderProductCards();
    });

    document.getElementById('clearProductFilters')?.addEventListener('click', () => {
        const search = document.getElementById('productSearchInput');
        const category = document.getElementById('productCategoryFilter');
        const type = document.getElementById('productTypeFilter');
        const stock = document.getElementById('productStockFilter');
        const sort = document.getElementById('productSortSelect');

        if (search) search.value = '';
        if (category) category.value = '';
        if (type) type.value = '';
        if (stock) stock.value = 'all';
        if (sort) sort.value = 'name-asc';
        loadProductTypeFilter();
        renderProductCards();
    });

    document.getElementById('productsGrid')?.addEventListener('click', (event) => {
        const editButton = event.target.closest('.edit-product-btn');
        const deleteButton = event.target.closest('.delete-product-btn');
        const barcodeButton = event.target.closest('.product-barcode-toggle');
        const variationChip = event.target.closest('.product-variant-chip');

        if (barcodeButton) {
            openBarcodeModal(barcodeButton.dataset.productId, barcodeButton.dataset.variationId || '');
            return;
        }

        if (variationChip) {
            const product = getProductById(variationChip.dataset.productId);
            if (product) {
                selectVariationByAttribute(product, variationChip.dataset.variationAttribute, variationChip.dataset.variationValue);
                refreshProductCard(product.product_id);
            }
            return;
        }

        if (editButton) openEditProduct(editButton.dataset.productId);
        if (deleteButton) deleteProduct(deleteButton.dataset.productId);
    });

    document.getElementById('editProductCategory')?.addEventListener('change', async (event) => {
        await populateEditTypes(event.target.value, '');
        toggleEditGenericField();
        const product = getProductById(getValue('editProductId'));
        const categoryName = event.target.selectedOptions?.[0]?.dataset.categoryName || '';
        renderEditVariations(product || { variations: [{}] }, categoryName);
    });
    document.getElementById('editProductType')?.addEventListener('change', () => {
        const product = getProductById(getValue('editProductId'));
        const categoryName = document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
        renderEditVariations(product || { variations: collectEditVariations() }, categoryName);
    });
    document.getElementById('btnAddEditVariation')?.addEventListener('click', () => {
        const categoryName = document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
        const typeName = selectedEditTypeName();
        document.getElementById('editVariationList')?.insertAdjacentHTML('beforeend', editVariationEntry({}, categoryName, typeName, true, 'edit'));
        if (!document.querySelector('#editVariationList .edit-var-default:checked')) {
            document.querySelector('#editVariationList .edit-var-default')?.click();
        }
    });
    document.getElementById('editVariationList')?.addEventListener('click', (event) => {
        const removeButton = event.target.closest('.btn-remove-edit-variation');
        if (!removeButton) return;
        const entry = removeButton.closest('.edit-variation-entry');
        if (!entry) return;
        if (entry.dataset.variationId) {
            entry.dataset.deleted = '1';
            entry.classList.add('d-none');
        } else {
            entry.remove();
        }
        if (!document.querySelector('#editVariationList .edit-variation-entry:not(.d-none) .edit-var-default:checked')) {
            document.querySelector('#editVariationList .edit-variation-entry:not(.d-none) .edit-var-default')?.click();
        }
    });

    document.getElementById('editProductForm')?.addEventListener('submit', submitEditProduct);
}

async function loadInventoryTable() {
    const tableBody = document.querySelector('#table-inventory tbody');
    if (!tableBody) return;

    try {
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/inventory/get_inventory.php`, {
            method: 'GET',
            credentials: 'include'
        });

        const items = (resp && resp.data) ? resp.data : [];
        tableBody.innerHTML = '';

        if (items.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-4">No inventory records.</td>
                </tr>
            `;
            return;
        }

        items.forEach(row => {
            const remaining = row.quantity_remaining ?? row.remaining_qty ?? row.remaining ?? 0;
            const exp = row.expiration_date || row.expiry_date || '';
            let statusBadge = '<span class="badge bg-success">In stock</span>';
            if (exp) {
                const expDate = new Date(exp);
                if (!isNaN(expDate) && expDate < new Date()) {
                    statusBadge = '<span class="badge bg-danger">Expired</span>';
                } else if (remaining <= 0) {
                    statusBadge = '<span class="badge bg-danger">Out</span>';
                } else if (remaining <= 5) {
                    statusBadge = '<span class="badge bg-warning text-dark">Low</span>';
                }
            }

            tableBody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td>${escapeHtml(row.product_name || row.brand_name || '')}</td>
                    <td>${escapeHtml(row.batch_number || '')}</td>
                    <td>${escapeHtml(String(row.quantity_stocked ?? ''))}</td>
                    <td>${escapeHtml(String(remaining))}</td>
                    <td>${escapeHtml(exp)}</td>
                    <td>${statusBadge}</td>
                </tr>
            `);
        });
    } catch (err) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger py-4">${escapeHtml(err.message)}</td>
            </tr>
        `;
    }
}

function initAddStockForm() {
    const addStockModal = document.getElementById('addStockModal');
    const addStockForm = document.getElementById('addStockForm');
    const stockProductId = document.getElementById('stockProductId');
    let stockVariationId = '';

    if (!addStockModal || !addStockForm || !stockProductId) {
        return;
    }

    document.addEventListener('click', (event) => {
        const addStockButton = event.target.closest('.add-stock-btn');

        if (!addStockButton) {
            return;
        }

        stockProductId.value = addStockButton.dataset.id || '';
        stockVariationId = addStockButton.dataset.variationId || '';
        const product = getProductById(stockProductId.value);
        const variation = (product?.variations || []).find((item) => String(item.variation_id) === String(stockVariationId));
        const summary = document.getElementById('stockProductSummary');

        if (summary && product) {
            summary.innerHTML = `
                <div class="fw-bold">${escapeHtml(product.product_name || '')}</div>
                <div class="text-muted small">${escapeHtml(product.brand_name || '')} &bull; ${escapeHtml(variation ? variationLabel(variation) : product.category_name || 'N/A')} &bull; Current stock: ${escapeHtml(variation?.stock ?? getProductStock(product))}</div>
            `;
        }

        bootstrap.Modal.getOrCreateInstance(addStockModal).show();
    });

    addStockForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = {
            product_id: stockProductId.value,
            variation_id: stockVariationId,
            batch_number: getValue('batchNumber'),
            quantity_stocked: getValue('quantityStocked'),
            expiration_date: getValue('expirationDate')
        };

        try {
            PharmaUtils.modal.loading('Saving Stock...');

            await PharmaUtils.safeFetch(`${API_BASE_URL}/inventory/add_stock.php`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            PharmaUtils.modal.close();
            await PharmaUtils.modal.success('Stock Added', 'Inventory batch saved successfully.');

            addStockForm.reset();
            closeAddStockModal();
            await loadProductsTable();
        } catch (err) {
            PharmaUtils.modal.close();
            PharmaUtils.modal.error('Failed to add stock', err.message);
        }
    });
}

export { initAddProductForm, initAddStockForm, initProductCards, loadProductsTable, loadInventoryTable };
export default initAddProductForm;

// Populate suppliers when add product modal opens
const _addProductModalEl = document.getElementById('addProductModal');
if (_addProductModalEl) {
    _addProductModalEl.addEventListener('show.bs.modal', () => {
        populateSupplierDropdown();
        populateAddCategories();
        const typeSelect = document.getElementById('productType');
        if (typeSelect) {
            typeSelect.disabled = true;
            typeSelect.innerHTML = '<option value="" disabled selected>Select category first...</option>';
        }
        document.getElementById('addGenericNameWrap')?.classList.add('d-none');
        renderAddVariations();
    });
}
