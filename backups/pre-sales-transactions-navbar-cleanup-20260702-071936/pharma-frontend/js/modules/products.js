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
    inventoryBatches: {}
};
let openAddStockFromButton = null;

function formatPrice(value) {
    return `\u20b1${Number(value || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });
}

function getProductStock(product) {
    if (product.current_stock !== undefined && product.current_stock !== null) {
        return Number(product.current_stock || 0);
    }

    return Number(product.current_stock ?? product.stock_quantity ?? product.quantity_remaining ?? 0);
}

function getProductStrength(product) {
    const value = String(product.strength || product.strength_size_value || '').trim();

    if (!value || value === 'N/A') {
        return 'N/A';
    }

    return value;
}

function getProductUnit(product) {
    return 'N/A';
}

function getProductSize(product) {
    const size = String(product.size || product.size_value || '').trim();

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

function groceryVariantLabel(typeName = '') {
    const normalized = String(typeName || '').trim().toLowerCase();
    if (['canned goods', 'beverage', 'snacks'].includes(normalized)) return 'Flavor';
    if (normalized === 'baby care') return 'Feature';
    return 'Variant';
}

function isMedicalSupplyType(typeName = '') {
    const normalized = String(typeName || '').trim().toLowerCase();
    return ['first aid', 'medical supply', 'device/equipment', 'ppe'].includes(normalized);
}

function medicineDescriptionLabel(typeName = '') {
    return isMedicalSupplyType(typeName) ? 'Item Description' : 'Generic Name';
}

function medicineSpecificationLabel(typeName = '') {
    return isMedicalSupplyType(typeName) ? 'Specification / Pack Size' : 'Strength';
}

function dash(value) {
    const clean = cleanCardText(value);
    return clean || '-';
}

function productVariantGeneric(product) {
    return isMedicine(product) ? dash(product.generic_name) : dash(product.variant);
}

function productSubDetail(product) {
    if (isMedicine(product)) return dash(product.strength);
    return dash(cleanCardText(product.size) || cleanCardText(product.net_weight));
}

const FORM_OPTIONS = ['tablet', 'capsule', 'sachet', 'tube', 'vial', 'ampule', 'bottle', 'box', 'pack', 'can', 'jar', 'roll', 'strip', 'blister pack', 'plastic pack', 'carton', 'pouch'];
const SMART_TYPES = {
    Medicine: ['Tablet', 'Capsule', 'Syrup', 'Drops', 'Injection', 'Ointment', 'Cream', 'Gel', 'Solution', 'Suspension', 'Powder', 'Patch', 'Inhaler', 'Nebulizer', 'Suppository', 'First Aid', 'Medical Supply', 'Device/Equipment', 'PPE'],
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
    if (product?.category_name === 'Medicine' || product?.category_name === 'Grocery') {
        return [];
    }

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
    return;
}

function getDefaultVariation(product) {
    return null;
}

function getActiveProductStock(product) {
    return getProductStock(product);
}

function getActiveProductPrice(product) {
    return product.price;
}

function productSearchText(product) {
    const variationText = (product.variations || []).map(variation => [
        variation.barcode,
        variation.sku
    ].join(' ')).join(' ');

    return [
        product.product_name,
        product.brand_name,
        product.generic_name,
        product.strength,
        product.variant,
        product.size,
        product.net_weight,
        product.pack_content,
        product.barcode,
        product.category_name,
        product.type_name,
        variationText
    ].join(' ').toLowerCase();
}

function productCardDetailRows(product) {
    const rule = getVariationRule(product.category_name || '', product.type_name || '');

    if (isGrocery(product)) {
        return cleanCardRows([
            [rule.variantLabel || 'Variant', product.variant],
            ['Size', product.size],
            ['Net Weight', product.net_weight],
            ['Package Type', product.package_type],
            ['Pack Content', product.pack_content]
        ]);
    }

    if (isMedicine(product)) {
        return cleanCardRows([
            ['Generic Name', product.generic_name],
            ['Strength', product.strength],
            ['Dosage Form', product.dosage_form],
            ['Package Type', product.package_type]
        ]);
    }

    return cleanCardRows([
        ['Type', product.type_name],
        ['Size', product.size],
        ['Pack Content', product.pack_content]
    ]);
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
    const stock = getActiveProductStock(product);
    const stockStatus = getStockStatus(stock);
    const detailRows = productCardDetailRows(product);

    return `
        <article class="product-card" data-product-id="${escapeHtml(product.product_id)}">
            <div class="product-card-body">
                <div class="product-card-head">
                    <div class="product-name-block">
                        <h3 class="product-title">${escapeHtml(product.product_name || 'Unnamed Product')}</h3>
                        <div class="product-brand">${escapeHtml(product.brand_name || 'No brand')}</div>
                    </div>
                    <div class="product-card-tools">
                        <button type="button" class="product-barcode-toggle" data-product-id="${escapeHtml(product.product_id)}" title="Show barcode" aria-label="Show barcode">
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
                    <button class="btn btn-sm btn-purple btn-icon add-stock-btn" data-id="${escapeHtml(product.product_id)}" title="Move to selling shelf" aria-label="Move to selling shelf">
                        <i class="fa-solid fa-boxes-stacked"></i>
                    </button>
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
    const product = getProductById(productId);
    if (product) renderProductCards();
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
    const tableBody = document.querySelector('#table-products tbody');
    if (!tableBody) return;

    const products = getFilteredProducts();

    if (!products.length) {
        tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">No products found.</td></tr>';
        return;
    }

    tableBody.innerHTML = products.map((product) => {
        const stock = getActiveProductStock(product);
        const stockStatus = getStockStatus(stock);

        return `
            <tr class="product-row" data-product-id="${escapeHtml(product.product_id)}" title="View product details">
                <td>
                    <button type="button" class="product-barcode-toggle" data-product-id="${escapeHtml(product.product_id)}" title="Show barcode" aria-label="Show barcode">
                        <i class="fa-solid fa-barcode"></i>
                    </button>
                </td>
                <td><span class="product-clamp">${escapeHtml(dash(product.brand_name))}</span></td>
                <td><span class="product-clamp">${escapeHtml(dash(product.product_name))}</span></td>
                <td>${escapeHtml(dash(product.category_name))}</td>
                <td>${escapeHtml(dash(product.type_name))}</td>
                <td><span class="product-clamp">${escapeHtml(productVariantGeneric(product))}</span></td>
                <td>${escapeHtml(productSubDetail(product))}</td>
                <td>${formatPrice(product.price)}</td>
                <td><span class="stock-pill ${stockStatus}"><i class="fa-solid fa-boxes-stacked"></i>${escapeHtml(stock)}</span></td>
                <td>
                    <div class="product-actions" role="group" aria-label="Product actions">
                        <button class="btn btn-sm btn-purple btn-icon add-stock-btn" data-id="${escapeHtml(product.product_id)}" title="Move to selling shelf" aria-label="Move to selling shelf">
                            <i class="fa-solid fa-boxes-stacked"></i>
                        </button>
                        <button type="button" class="btn btn-outline-primary btn-icon edit-product-btn" data-product-id="${escapeHtml(product.product_id)}" title="Edit product">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-icon delete-product-btn" data-product-id="${escapeHtml(product.product_id)}" title="Delete product">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function detailBox(label, value) {
    return `
        <div class="product-details-box">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(dash(value))}</strong>
        </div>
    `;
}

function openProductDetailsModal(productId) {
    const product = getProductById(productId);
    const container = document.getElementById('productDetailsContent');
    if (!product || !container) return;

    const rows = [
        ['Barcode', product.barcode],
        ['Supplier Name', product.supplier_name],
        ['Brand Name', product.brand_name],
        ['Product Name', product.product_name],
        ['Category', product.category_name],
        ['Product Type', product.type_name],
        ['Price', formatPrice(product.price)],
        ['Selling/Shelf Stock', String(product.selling_stock ?? 0)],
        ['Total Inventory Quantity', String(product.total_inventory_quantity ?? 0)],
        ['Available Quantity', String(product.available_stock ?? 0)],
        ['Damaged/Returned Quantity', product.damaged_returned_stock],
        ['Nearest Expiry Date', formatDate(product.nearest_expiry_date)],
        ['Created Date', formatDate(product.created_at)]
    ];

    if (isMedicine(product)) {
        rows.push(['Generic Name', product.generic_name]);
        rows.push(['Strength', product.strength]);
        rows.push(['Dosage Form', product.dosage_form]);
        rows.push(['Package Type', product.package_type]);
    } else {
        rows.push([groceryVariantLabel(product.type_name), product.variant]);
        rows.push(['Size', product.size]);
        rows.push(['Net Weight', product.net_weight]);
        rows.push(['Package Type', product.package_type]);
        rows.push(['Pack Content', product.pack_content]);
    }

    container.innerHTML = rows.map(([label, value]) => detailBox(label, value)).join('');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('productDetailsModal')).show();
}

function openBarcodeModal(productId) {
    const product = getProductById(productId);
    if (!product) return;

    const barcode = product.barcode || `AUTO-${product.product_id || ''}`;
    const productName = document.getElementById('barcodeModalProductName');
    const brand = document.getElementById('barcodeModalBrand');
    const text = document.getElementById('barcodeModalText');
    const displayText = document.getElementById('barcodeModalDisplayText');

    if (productName) productName.textContent = dash(product.product_name);
    if (brand) brand.textContent = dash(product.brand_name);
    if (text) text.textContent = barcode || '-';
    if (displayText) displayText.textContent = barcode || '-';

    const modal = document.getElementById('productBarcodeModal');
    if (modal) bootstrap.Modal.getOrCreateInstance(modal).show();
}

function inventoryBatchLabel(batch) {
    const batchNumber = dash(batch.batch_number);
    const available = Number(batch.quantity_remaining || 0);
    const expirationDate = formatDate(batch.expiration_date);
    return `Batch: ${batchNumber} | Available: ${available} | Expiry: ${expirationDate}`;
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
        variations
    };

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

async function populateEditSupplierDropdown(selectedSupplierId = '') {
    const select = document.getElementById('editSupplierId');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Select supplier...</option>';

    try {
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/suppliers/get_suppliers.php`, {
            method: 'GET',
            credentials: 'include'
        });

        const suppliers = resp?.suppliers || resp?.data || [];
        suppliers.forEach(supplier => {
            const option = document.createElement('option');
            option.value = supplier.supplier_id ?? supplier.id ?? '';
            option.textContent = supplier.supplier_name ?? supplier.name ?? 'Unknown';
            select.appendChild(option);
        });
        if (selectedSupplierId) select.value = String(selectedSupplierId);
    } catch (err) {
        console.warn('Failed to load edit suppliers:', err.message || err);
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

    loadMeasurementUnitCache().then(() => {
        renderAddVariations({ variations: collectAddVariations() }, getSelectedAddCategoryName());
    }).catch((err) => console.warn('Failed to load unit options:', err.message || err));

    document.getElementById('productCategory')?.addEventListener('change', async (event) => {
        await populateAddTypes(event.target.value, '');
        const categoryName = getSelectedAddCategoryName();
        renderAddVariations({ variations: collectAddVariations() }, categoryName);
    });

    document.getElementById('productType')?.addEventListener('change', () => {
        renderAddVariations({ variations: collectAddVariations() }, getSelectedAddCategoryName());
    });

    document.getElementById('btnCreateAnotherAddVariant')?.addEventListener('click', () => {
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
    const tableBody = document.querySelector('#table-products tbody') || document.querySelector('#productsTable tbody') || document.getElementById('productTableBody');

    if (!tableBody) return;

    try {
        productState.products = [];
        const resp = await fetchProductsWithRetry();

        const products = (resp && resp.data) ? resp.data : [];
        productState.products = products;
        renderProductCards();
    } catch (err) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-danger py-4">${escapeHtml(err.message)}</td>
            </tr>
        `;
    }
}

async function fetchProductsWithRetry() {
    let lastError;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 10000);
        const cacheBust = `?t=${Date.now()}-${attempt}`;

        try {
            return await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_products.php${cacheBust}`, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
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
    return;
}

function optionList(options, selected = '') {
    return ruleOptionList(options, selected);
}

function measurementUnitOptionList(selected = '', fallbackOptions = []) {
    const unitNames = productState.units.length
        ? productState.units.map(unit => unit.unit_name)
        : fallbackOptions;
    const normalizedSelected = String(selected || '').trim().toLowerCase();
    const options = Array.from(new Set(unitNames.filter(Boolean)));
    if (selected && !options.some(option => option.toLowerCase() === normalizedSelected)) {
        options.unshift(selected);
    }
    return [
        '<option value="">-</option>',
        ...options.map(option => `<option value="${escapeHtml(option)}" ${String(option).toLowerCase() === normalizedSelected ? 'selected' : ''}>${escapeHtml(option)}</option>`)
    ].join('');
}

function selectedEditTypeName() {
    return document.getElementById('editProductType')?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function editVariationEntry(variation = {}, categoryName = 'Grocery', typeName = '', canDelete = true, mode = 'edit') {
    const rule = getVariationRule(categoryName, typeName);
    const rowId = `variation-rule-${Math.random().toString(36).slice(2)}`;
    const defaultName = `${mode}DefaultVariation`;
    const header = mode === 'edit' ? 'Product SKU Details' : 'Sellable SKU';
    const deleteButton = canDelete ? '<button class="btn btn-sm btn-outline-danger btn-remove-edit-variation" type="button" title="Remove variant"><i class="fa-solid fa-trash-can"></i></button>' : '';
    const medicineFields = `
                <div class="col-md-6"><label class="form-label">Generic Name</label><input class="form-control edit-var-generic-name" value="${escapeHtml(variation.generic_name || '')}" placeholder="Povidone-Iodine"></div>
                <div class="col-md-6"><label class="form-label">Strength</label><input class="form-control edit-var-strength-value" type="text" value="${escapeHtml(variation.strength_value || '')}" placeholder="10% or 500 mg"></div>
                <div class="col-md-6"><label class="form-label">Dosage Form</label><input class="form-control edit-var-dosage-form" value="${escapeHtml(variation.dosage_form || '')}" placeholder="Solution"></div>
                <div class="col-md-6"><label class="form-label">Package Type</label><select class="form-select edit-var-package-type">${measurementUnitOptionList(variation.package_type || '', ['bottle', 'box', 'pack', 'blister pack', 'sachet', 'tube', 'vial', 'ampule'])}</select></div>
                <div class="col-md-6"><label class="form-label">Price</label><input class="form-control edit-var-price" type="number" min="0" step=".01" value="${escapeHtml(variation.price ?? '')}" required></div>
                <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
    `;
    const groceryFields = `
                <div class="col-md-6"><label class="form-label">${escapeHtml(groceryVariantLabel(typeName))}</label><input class="form-control edit-var-name" list="${rowId}-variant" value="${escapeHtml(variation.variant_name || '')}" placeholder="Select or type">${datalist(`${rowId}-variant`, rule.variantOptions)}</div>
                <div class="col-md-6"><label class="form-label">Size</label><select class="form-select edit-var-size-value">${optionList(rule.sizeOptions, variation.size_value || '')}</select></div>
                <div class="col-md-6"><label class="form-label">Net Weight</label><div class="variation-pair"><input class="form-control edit-var-weight-value" list="${rowId}-weight" type="number" min="0" step="any" value="${escapeHtml(variation.weight_value || '')}" placeholder="155"><select class="form-select edit-var-weight-unit">${measurementUnitOptionList(variation.weight_unit || '', rule.weightUnits)}</select></div>${datalist(`${rowId}-weight`, rule.weightValues)}</div>
                <div class="col-md-6"><label class="form-label">Package Type</label><select class="form-select edit-var-package-type">${measurementUnitOptionList(variation.package_type || '', ['can', 'bottle', 'box', 'pack', 'sachet', 'tube', 'jar', 'pouch'])}</select></div>
                <div class="col-md-6"><label class="form-label">Pack Content</label><div class="variation-pair"><input class="form-control edit-var-pack-content-qty" list="${rowId}-pack-content" type="number" min="0" step="1" value="${escapeHtml(variation.pack_content_qty || '')}" placeholder="12"><select class="form-select edit-var-pack-content-unit">${measurementUnitOptionList(variation.pack_content_unit || '', rule.packContentUnits)}</select></div>${datalist(`${rowId}-pack-content`, rule.packContentValues)}</div>
                <div class="col-md-6"><label class="form-label">Price</label><input class="form-control edit-var-price" type="number" min="0" step=".01" value="${escapeHtml(variation.price ?? '')}" required></div>
                <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
    `;

    return `
        <div class="edit-variation-entry">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                <span class="fw-bold small text-muted">${escapeHtml(header)}</span>
                <div class="d-flex align-items-center gap-2">
                    <input class="form-check-input edit-var-default d-none" type="radio" name="${escapeHtml(defaultName)}" ${String(variation.is_default) === '1' ? 'checked' : ''}>
                    ${deleteButton}
                </div>
            </div>
            <div class="row g-3">
                ${categoryName === 'Medicine' ? medicineFields : groceryFields}
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
        generic_name: entry.querySelector('.edit-var-generic-name')?.value.trim() || '',
        variant_name: entry.querySelector('.edit-var-name')?.value.trim() || '',
        strength_value: entry.querySelector('.edit-var-strength-value')?.value.trim() || '',
        strength_unit: entry.querySelector('.edit-var-strength-unit')?.value || '',
        dosage_form: entry.querySelector('.edit-var-dosage-form')?.value.trim() || '',
        size_value: entry.querySelector('.edit-var-size-value')?.value || '',
        weight_value: entry.querySelector('.edit-var-weight-value')?.value.trim() || '',
        weight_unit: entry.querySelector('.edit-var-weight-unit')?.value || '',
        package_type: entry.querySelector('.edit-var-package-type')?.value.trim() || '',
        pack_content_qty: entry.querySelector('.edit-var-pack-content-qty')?.value || '',
        pack_content_unit: entry.querySelector('.edit-var-pack-content-unit')?.value || '',
        price: entry.querySelector('.edit-var-price')?.value || '0',
        barcode: entry.querySelector('.edit-var-barcode')?.value.trim() || '',
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

function productToVariation(product) {
    if (isMedicine(product)) {
        return {
            generic_name: product.generic_name || '',
            variant_name: '',
            strength_value: product.strength || '',
            strength_unit: '',
            dosage_form: product.dosage_form || '',
            package_type: product.package_type || product.medicine_package_type || '',
            price: product.price || '',
            barcode: product.barcode || '',
            is_default: 1
        };
    }

    const [weightValue = '', weightUnit = ''] = String(product.net_weight || '').split(/\s+/, 2);
    const packMatch = String(product.pack_content || '').match(/^(\d+)\s*(.*)$/);
    return {
        variant_name: product.variant || '',
        size_value: product.size || '',
        weight_value: weightValue,
        weight_unit: weightUnit,
        package_type: product.package_type || product.grocery_package_type || '',
        pack_content_qty: packMatch?.[1] || '',
        pack_content_unit: packMatch?.[2] || '',
        price: product.price || '',
        barcode: product.barcode || '',
        is_default: 1
    };
}

async function openCreateAnotherVariant(product) {
    const modalElement = document.getElementById('addProductModal');
    const form = document.getElementById('addProductForm');
    if (!modalElement || !form || !product) return;

    form.reset();
    await populateSupplierDropdown();
    await populateAddCategories(product.category_id || '');
    await populateAddTypes(product.category_id || '', product.type_id || '');

    const supplierId = String(product.supplier_ids || '').split(',').map(item => item.trim()).filter(Boolean)[0] || '';
    const supplierSelect = document.getElementById('supplier_id');
    if (supplierSelect && supplierId) supplierSelect.value = supplierId;

    document.getElementById('productBrandName').value = product.brand_name || '';
    document.getElementById('productName').value = product.product_name || '';
    document.getElementById('productCategory').value = product.category_id || '';
    document.getElementById('productType').value = product.type_id || '';

    renderAddVariations({ variations: [{ price: product.price || '' }] }, product.category_name || '');
    bootstrap.Modal.getInstance(document.getElementById('editProductModal'))?.hide();
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

async function openEditProduct(productId) {
    const product = getProductById(productId);
    const modalElement = document.getElementById('editProductModal');

    if (!product || !modalElement) return;

    document.getElementById('editProductId').value = product.product_id || '';
    document.getElementById('editProductBrand').value = product.brand_name || '';
    document.getElementById('editProductName').value = product.product_name || '';
    await populateEditSupplierDropdown(String(product.supplier_ids || '').split(',').map(item => item.trim()).filter(Boolean)[0] || '');

    await populateEditCategories(product.category_id || '');
    await populateEditTypes(product.category_id || '', product.type_id || '');
    toggleEditGenericField();
    renderEditVariations({ ...product, variations: [productToVariation(product)] }, product.category_name || '');

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
        supplier_id: getValue('editSupplierId') || null,
        category_id: getValue('editProductCategory'),
        type_id: getValue('editProductType'),
        variations: collectEditVariations()
    };

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

        productState.products = productState.products.filter(product => String(product.product_id) !== String(productId));
        renderProductCards();
        PharmaUtils.modal.close();
        await loadProductsTable();
        PharmaUtils.toast.success(data.status === 'already_deleted' ? 'Product already removed.' : (data.message || 'Product deleted successfully.'));
    } catch (err) {
        PharmaUtils.modal.close();
        if (/product not found/i.test(err.message || '')) {
            productState.products = productState.products.filter(product => String(product.product_id) !== String(productId));
            renderProductCards();
            await loadProductsTable();
            PharmaUtils.toast.success('Product already removed.');
            return;
        }
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

    document.getElementById('table-products')?.addEventListener('click', (event) => {
        const addStockButton = event.target.closest('.add-stock-btn');
        const editButton = event.target.closest('.edit-product-btn');
        const deleteButton = event.target.closest('.delete-product-btn');
        const barcodeButton = event.target.closest('.product-barcode-toggle');
        const row = event.target.closest('.product-row');

        if (barcodeButton) {
            event.stopPropagation();
            openBarcodeModal(barcodeButton.dataset.productId);
            return;
        }

        if (addStockButton) {
            event.stopPropagation();
            if (typeof openAddStockFromButton === 'function') openAddStockFromButton(addStockButton);
            return;
        }

        if (editButton) {
            event.stopPropagation();
            openEditProduct(editButton.dataset.productId);
            return;
        }

        if (deleteButton) {
            event.stopPropagation();
            deleteProduct(deleteButton.dataset.productId);
            return;
        }

        if (row) openProductDetailsModal(row.dataset.productId);
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
        const product = getProductById(getValue('editProductId'));
        if (product) openCreateAnotherVariant(product);
    });
    document.getElementById('editVariationList')?.addEventListener('click', (event) => {
        const removeButton = event.target.closest('.btn-remove-edit-variation');
        if (!removeButton) return;
        const entry = removeButton.closest('.edit-variation-entry');
        if (!entry) return;
        entry.remove();
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
    const inventoryBatchSelect = document.getElementById('inventoryBatchSelect');
    const quantityToMove = document.getElementById('quantityToMove');
    const noBatchMessage = document.getElementById('noInventoryBatchMessage');
    const moveSubmit = document.getElementById('moveToShelfSubmit');
    const moveProductName = document.getElementById('moveShelfProductName');
    const moveBrand = document.getElementById('moveShelfBrand');
    const moveCategory = document.getElementById('moveShelfCategory');
    const moveType = document.getElementById('moveShelfType');
    const moveAvailableTotal = document.getElementById('moveShelfAvailableTotal');
    const moveBatchNumber = document.getElementById('moveShelfBatchNumber');
    const moveBatchAvailable = document.getElementById('moveShelfBatchAvailable');
    const moveBatchExpiry = document.getElementById('moveShelfBatchExpiry');
    if (!addStockModal || !addStockForm || !stockProductId || !inventoryBatchSelect || !quantityToMove || !moveSubmit) {
        return;
    }

    function setMoveFormEnabled(isEnabled, showNoBatchMessage = !isEnabled) {
        inventoryBatchSelect.disabled = !isEnabled;
        quantityToMove.disabled = !isEnabled;
        moveSubmit.disabled = !isEnabled;
        noBatchMessage?.classList.toggle('d-none', !showNoBatchMessage);
    }

    function selectedInventoryBatch() {
        return productState.inventoryBatches[stockProductId.value]?.find((batch) => String(batch.inventory_id) === String(inventoryBatchSelect.value));
    }

    function renderSelectedBatchDetails() {
        const batch = selectedInventoryBatch();
        if (moveBatchNumber) moveBatchNumber.textContent = dash(batch?.batch_number);
        if (moveBatchAvailable) moveBatchAvailable.textContent = batch ? String(Number(batch.quantity_remaining || 0)) : '-';
        if (moveBatchExpiry) moveBatchExpiry.textContent = batch ? formatDate(batch.expiration_date) : '-';
    }

    function updateQuantityLimit() {
        const batch = selectedInventoryBatch();
        const available = Number(batch?.quantity_remaining || 0);
        quantityToMove.max = available > 0 ? String(available) : '';
        if (available > 0 && Number(quantityToMove.value || 0) > available) {
            quantityToMove.value = String(available);
        }
        renderSelectedBatchDetails();
    }

    async function loadAvailableInventoryBatches(productId) {
        inventoryBatchSelect.innerHTML = '<option value="" selected>Loading available batches...</option>';
        quantityToMove.value = '';
        if (moveAvailableTotal) moveAvailableTotal.textContent = '0';
        renderSelectedBatchDetails();
        setMoveFormEnabled(false, false);

        const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/inventory/get_available_batches.php?product_id=${encodeURIComponent(productId)}`, {
            credentials: 'include'
        });
        const batches = Array.isArray(response.data) ? response.data : [];
        productState.inventoryBatches[productId] = batches;
        const totalAvailable = batches.reduce((total, batch) => total + Number(batch.quantity_remaining || 0), 0);
        if (moveAvailableTotal) moveAvailableTotal.textContent = String(totalAvailable);

        if (!batches.length) {
            inventoryBatchSelect.innerHTML = '<option value="" selected>No available inventory batch</option>';
            renderSelectedBatchDetails();
            setMoveFormEnabled(false, true);
            return;
        }

        inventoryBatchSelect.innerHTML = [
            '<option value="" selected disabled>Select inventory batch...</option>',
            ...batches.map((batch) => `<option value="${escapeHtml(batch.inventory_id)}">${escapeHtml(inventoryBatchLabel(batch))}</option>`)
        ].join('');
        inventoryBatchSelect.value = batches[0].inventory_id;
        updateQuantityLimit();
        setMoveFormEnabled(true);
    }

    inventoryBatchSelect.addEventListener('change', updateQuantityLimit);

    openAddStockFromButton = async (addStockButton) => {
        stockProductId.value = addStockButton.dataset.id || '';
        const product = getProductById(stockProductId.value);
        if (moveProductName) moveProductName.textContent = dash(product?.product_name);
        if (moveBrand) moveBrand.textContent = dash(product?.brand_name);
        if (moveCategory) moveCategory.textContent = dash(product?.category_name);
        if (moveType) moveType.textContent = dash(product?.type_name);
        if (moveAvailableTotal) moveAvailableTotal.textContent = String(Number(product?.available_stock || 0));
        renderSelectedBatchDetails();

        bootstrap.Modal.getOrCreateInstance(addStockModal).show();
        try {
            await loadAvailableInventoryBatches(stockProductId.value);
        } catch (err) {
            inventoryBatchSelect.innerHTML = '<option value="" selected>Unable to load batches</option>';
            setMoveFormEnabled(false, false);
            PharmaUtils.toast?.error?.(err.message || 'Unable to load inventory batches.');
        }
    };

    document.addEventListener('click', (event) => {
        const addStockButton = event.target.closest('.add-stock-btn');

        if (!addStockButton) {
            return;
        }

        event.stopPropagation();
        openAddStockFromButton(addStockButton);
    });

    addStockForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const batch = selectedInventoryBatch();
        const quantity = Number(quantityToMove.value || 0);
        const available = Number(batch?.quantity_remaining || 0);

        if (!batch) {
            PharmaUtils.modal.error('Select Inventory Batch', 'Please select an available inventory batch.');
            return;
        }

        if (quantity <= 0) {
            PharmaUtils.modal.error('Invalid Quantity', 'Quantity to move must be greater than zero.');
            return;
        }

        if (quantity > available) {
            PharmaUtils.modal.error('Invalid Quantity', 'Quantity to move cannot exceed the selected batch available quantity.');
            return;
        }

        const payload = {
            product_id: stockProductId.value,
            inventory_id: batch.inventory_id,
            quantity_to_move: quantity
        };

        try {
            PharmaUtils.modal.loading('Moving Stock...');

            await PharmaUtils.safeFetch(`${API_BASE_URL}/inventory/move_to_selling_stock.php`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            PharmaUtils.modal.close();
            await PharmaUtils.modal.success('Stock Moved', 'Stock moved to selling shelf successfully.');

            const movedProductId = stockProductId.value;
            addStockForm.reset();
            productState.inventoryBatches[movedProductId] = [];
            closeAddStockModal();
            await loadProductsTable();
            if (document.querySelector('#table-inventory tbody')) {
                await loadInventoryTable();
            }
        } catch (err) {
            PharmaUtils.modal.close();
            PharmaUtils.modal.error('Failed to move stock', err.message);
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
        renderAddVariations();
    });
}
