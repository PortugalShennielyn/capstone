import API_BASE_URL from '../config/config.js';
import PharmaUtils from '../utils.js';
import {
    cleanDisplay,
    combineValueUnit as ruleCombineValueUnit,
    datalist as ruleDatalist,
    getVariationRule,
    optionList as ruleOptionList,
    uniqueDetailRows
} from './variation_rules.js';
import {
    formatMeasurement,
    formatMeasurementText,
    formatMeasurementValue,
    formatProductSpecification,
    normalizeProductSpecificationValues
} from './product_specification.js?v=7';
import {
    archiveMeasurementUnitCache,
    loadMeasurementUnits,
    measurementUnitsForContext,
    upsertMeasurementUnitCache
} from './measurement_units.js?v=4';

const selectedMeasurementUnitIds = new Set();

const PRODUCT_LIST_CACHE_KEY = 'productMasterFileCache:v1';
const PRODUCT_LIST_CACHE_VERSION = 2;
const PRODUCT_LIST_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

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
    packageTypes: [],
    measurementGroups: [],
    allSpecifications: [],
    configurationTypeId: '',
    specifications: [],
    pricingSelectionMode: false,
    selectedPricingProductIds: new Set()
};

const productsById = new Map();
const referenceCache = {
    categories: null,
    categoryPromise: null,
    typesByCategory: new Map(),
    typePromises: new Map(),
    configurationsByType: new Map(),
    configurationPromises: new Map(),
    suppliers: null,
    supplierPromise: null
};

let activeProductDetailsId = null;
let productDetailsRequestSequence = 0;
let productDetailsAbortController = null;
const productDetailsCache = new Map();
let editProductRequestSequence = 0;
let pendingSpecificationEdits = new Map();
let editPricingApplyRequested = false;
let selectedPricingPreviewRows = [];
let selectedPricingEligibleProductIds = new Set();
let selectedPricingSubmissionActive = false;
let productsLoadPromise = null;

function formatPrice(value) {
    return `\u20b1${Number(value || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatPriceNumber(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function readProductListCache() {
    try {
        const cached = JSON.parse(sessionStorage.getItem(PRODUCT_LIST_CACHE_KEY) || 'null');
        if (!cached || cached.version !== PRODUCT_LIST_CACHE_VERSION || !Array.isArray(cached.products)) return null;
        if (!Number.isFinite(cached.retrievedAt) || Date.now() - cached.retrievedAt > PRODUCT_LIST_CACHE_MAX_AGE_MS) {
            sessionStorage.removeItem(PRODUCT_LIST_CACHE_KEY);
            return null;
        }
        return cached.products;
    } catch {
        return null;
    }
}

function writeProductListCache(products) {
    try {
        sessionStorage.setItem(PRODUCT_LIST_CACHE_KEY, JSON.stringify({
            version: PRODUCT_LIST_CACHE_VERSION,
            retrievedAt: Date.now(),
            products
        }));
    } catch {}
}

function invalidateProductListCache() {
    try {
        sessionStorage.removeItem(PRODUCT_LIST_CACHE_KEY);
    } catch {}
}

function setProductRefreshIndicator(state) {
    const indicator = document.getElementById('productRefreshIndicator');
    if (!indicator) return;
    indicator.classList.toggle('d-none', state === 'hidden');
    indicator.innerHTML = state === 'error'
        ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Refresh failed</span>'
        : '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Refreshing...</span>';
}

function roundedCurrency(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : null;
}

function calculatedClientPrice(cost, markup) {
    const numericCost = Number(cost);
    const numericMarkup = Number(markup);
    if (!Number.isFinite(numericCost) || !Number.isFinite(numericMarkup) || numericCost < 0 || numericMarkup < 0) return null;
    return roundedCurrency(numericCost * (1 + (numericMarkup / 100)));
}

function signedPrice(value) {
    const number = roundedCurrency(value);
    if (number === null) return 'Not available';
    if (Math.abs(number) < 0.005) return formatPrice(0);
    return `${number < 0 ? '−' : '+'}${formatPrice(Math.abs(number))}`;
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
    const cleanValue = formatMeasurementValue(value);
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

const CUSTOMIZE_OPTION = '__customize__';

function isMedicine(product) {
    return product.category_name === 'Medicine';
}

function isGrocery(product) {
    return product.category_name === 'Grocery';
}

function smartTypeList(categoryName, types = [], selectedTypeId = '') {
    return types;
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
    return productsById.get(String(productId));
}

function replaceProducts(products) {
    productState.products = Array.isArray(products) ? products : [];
    productsById.clear();
    productState.products.forEach(product => productsById.set(String(product.product_id), product));
}

function commitLocalProductChanges(changedProducts, { prepend = false } = {}) {
    const changed = (Array.isArray(changedProducts) ? changedProducts : [changedProducts]).filter(Boolean);
    if (!changed.length) return;

    const byId = new Map(changed.map(product => [String(product.product_id), product]));
    const existingIds = new Set(productState.products.map(product => String(product.product_id)));
    const updated = productState.products.map(product => byId.get(String(product.product_id)) || product);
    const added = changed.filter(product => !existingIds.has(String(product.product_id)));
    replaceProducts(prepend ? [...added, ...updated] : [...updated, ...added]);
    renderProductCards();
    writeProductListCache(productState.products);
}

function reconcileProductsInBackground() {
    invalidateProductListCache();
    void loadProductsTable({ skipCache: true }).catch(error => {
        console.warn('Background product refresh failed:', error.message || error);
    });
}

async function cachedCategories(forceRefresh = false) {
    if (!forceRefresh && referenceCache.categories) return referenceCache.categories;
    if (!forceRefresh && referenceCache.categoryPromise) return referenceCache.categoryPromise;

    const promise = PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_categories.php`, {
        method: 'GET', credentials: 'include'
    }).then(response => {
        referenceCache.categories = response?.categories || [];
        productState.categories = referenceCache.categories;
        return referenceCache.categories;
    }).finally(() => {
        if (referenceCache.categoryPromise === promise) referenceCache.categoryPromise = null;
    });
    referenceCache.categoryPromise = promise;
    return promise;
}

async function cachedProductTypes(categoryId = '', forceRefresh = false) {
    const key = String(categoryId || '*');
    if (!forceRefresh && referenceCache.typesByCategory.has(key)) return referenceCache.typesByCategory.get(key);
    if (!forceRefresh && referenceCache.typePromises.has(key)) return referenceCache.typePromises.get(key);

    const query = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : '';
    const promise = PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_product_types.php${query}`, {
        method: 'GET', credentials: 'include'
    }).then(response => {
        const types = response?.types || [];
        referenceCache.typesByCategory.set(key, types);
        return types;
    }).finally(() => referenceCache.typePromises.delete(key));
    referenceCache.typePromises.set(key, promise);
    return promise;
}

async function cachedSuppliers(forceRefresh = false) {
    if (!forceRefresh && referenceCache.suppliers) return referenceCache.suppliers;
    if (!forceRefresh && referenceCache.supplierPromise) return referenceCache.supplierPromise;

    const promise = PharmaUtils.safeFetch(`${API_BASE_URL}/suppliers/get_suppliers.php`, {
        method: 'GET', credentials: 'include'
    }).then(response => {
        referenceCache.suppliers = response?.suppliers || response?.data || [];
        return referenceCache.suppliers;
    }).finally(() => {
        if (referenceCache.supplierPromise === promise) referenceCache.supplierPromise = null;
    });
    referenceCache.supplierPromise = promise;
    return promise;
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
            return cleanCardText(ruleCombineValueUnit(formatMeasurementValue(variation?.strength_value), variation?.strength_unit));
        case 'volume':
            return cleanCardText(ruleCombineValueUnit(formatMeasurementValue(variation?.volume_value), variation?.volume_unit));
        case 'weight':
            return cleanCardText(ruleCombineValueUnit(formatMeasurementValue(variation?.weight_value), variation?.weight_unit));
        case 'size':
            return cleanCardText([formatMeasurementText(variation?.size_value), variation?.size_unit].filter(hasDisplayValue).join(' '));
        case 'packContent':
            return cleanCardText(ruleCombineValueUnit(formatMeasurementValue(variation?.pack_content_qty), variation?.pack_content_unit));
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
            ['Size', formatMeasurementText(product.size)],
            ['Net Weight', formatMeasurementText(product.net_weight)],
            ['Container Type', product.package_type],
            ['Pack Content', formatMeasurementText(product.pack_content)]
        ]);
    }

    if (isMedicine(product)) {
        return cleanCardRows([
            ['Generic Name', product.generic_name],
            ['Strength', product.strength],
            ['Dosage Form', product.dosage_form],
            ['Container Type', product.package_type]
        ]);
    }

    return cleanCardRows([
        ['Type', product.type_name],
        ['Size', formatMeasurementText(product.size)],
        ['Pack Content', formatMeasurementText(product.pack_content)]
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
                <div class="product-meta">${escapeHtml(PharmaUtils.formatProductIdentity([
                    cleanCardText(product.category_name) || 'Product',
                    cleanCardText(product.type_name) || 'General'
                ]))}</div>
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
                    <button type="button" class="btn btn-outline-primary btn-icon edit-product-btn" data-product-id="${escapeHtml(product.product_id)}" title="Edit product" aria-label="Edit product">
                        <i class="fa-solid fa-pen" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger btn-icon delete-product-btn" data-product-id="${escapeHtml(product.product_id)}" title="Delete product" aria-label="Delete product">
                        <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
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
    const statusValue = document.getElementById('productStatusFilter')?.value || 'all';
    const pricingValue = document.getElementById('productPricingFilter')?.value || 'all';
    const sortValue = document.getElementById('productSortSelect')?.value || 'name-asc';

    const filtered = productState.products.filter(product => {
        const matchesSearch = !searchValue || productSearchText(product).includes(searchValue);
        const matchesCategory = !categoryValue || String(product.category_id) === String(categoryValue);
        const matchesType = !typeValue || String(product.type_id) === String(typeValue);
        const matchesStatus = statusValue === 'all' || String(product.status || 'Active') === statusValue;
        const pricing = product.pricing || {};
        const pricingMethod = product.pricing_method || pricing.pricing_method || 'manual';
        const matchesPricing = pricingValue === 'all'
            || pricingValue === pricingMethod
            || (pricingValue === 'needs_update' && Boolean(pricing.category_pricing_eligible))
            || (pricingValue === 'no_cost' && !pricing.latest_cost_basis);

        return matchesSearch && matchesCategory && matchesType && matchesStatus && matchesPricing;
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
    document.querySelector('.pricing-selection-column')?.classList.toggle('d-none', !productState.pricingSelectionMode);
    document.getElementById('table-products')?.classList.toggle('pricing-selection-mode', productState.pricingSelectionMode);

    if (!products.length) {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No products found.</td></tr>';
        syncSelectedPricingControls();
        return;
    }

    tableBody.innerHTML = products.map((product) => {
        const status = product.status || 'Active';
        const isActive = status === 'Active';
        const priceBadge = productPriceBadge(product);
        const selectionStatus = productPricingSelectionStatus(product);

        return `
            <tr class="product-row" data-product-id="${escapeHtml(product.product_id)}">
                <td class="text-center pricing-selection-column ${productState.pricingSelectionMode ? '' : 'd-none'}"><div class="pricing-selection-cell">${selectionStatus.eligible ? `<input class="form-check-input product-pricing-select" type="checkbox" value="${escapeHtml(product.product_id)}" aria-label="Select ${escapeHtml(product.product_name)} for category pricing" ${productState.selectedPricingProductIds.has(String(product.product_id)) ? 'checked' : ''}>` : `<input class="form-check-input" type="checkbox" aria-label="${escapeHtml(selectionStatus.label)}" disabled>`}<span class="pricing-selection-status ${selectionStatus.className}">${escapeHtml(selectionStatus.label)}</span></div></td>
                <td>
                    <button type="button" class="product-barcode-toggle" data-product-id="${escapeHtml(product.product_id)}" aria-label="Show barcode">
                        <i class="fa-solid fa-barcode"></i>
                    </button>
                </td>
                <td><span class="product-clamp">${escapeHtml(dash(product.brand_name))}</span></td>
                <td><span class="product-clamp">${escapeHtml(dash(product.product_name))}</span></td>
                <td>${escapeHtml(dash(product.type_name))}</td>
                <td><span class="product-clamp">${escapeHtml(formatProductSpecification(product))}</span></td>
                <td class="selling-price-cell"><div class="selling-price-stack"><span class="selling-price-value">₱${formatPriceNumber(product.price)}</span><span class="pricing-method-badge ${priceBadge.className}" title="${escapeHtml(priceBadge.title)}" aria-label="${escapeHtml(priceBadge.title)}">${priceBadge.code}</span></div></td>
                <td><span class="badge ${isActive ? 'text-bg-success' : 'text-bg-secondary'}">${escapeHtml(status)}</span></td>
                <td>
                    <div class="product-actions" role="group" aria-label="Product actions">
                        <button type="button" class="btn btn-outline-secondary btn-icon view-product-btn" data-product-id="${escapeHtml(product.product_id)}" aria-label="View product details">
                            <i class="fa-regular fa-eye" aria-hidden="true"></i>
                        </button>
                        <button type="button" class="btn btn-outline-primary btn-icon edit-product-btn" data-product-id="${escapeHtml(product.product_id)}" aria-label="Edit product">
                            <i class="fa-solid fa-pen" aria-hidden="true"></i>
                        </button>
                        <button type="button" class="btn ${isActive ? 'btn-outline-warning' : 'btn-outline-success'} btn-icon delete-product-btn" data-product-id="${escapeHtml(product.product_id)}" aria-label="${isActive ? 'Deactivate' : 'Reactivate'} product">
                            <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-circle-check'}" aria-hidden="true"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    syncSelectedPricingControls();
}

function productPriceBadge(product) {
    const pricing = product.pricing || {};
    const method = product.pricing_method || pricing.pricing_method || 'manual';
    if (method === 'manual') {
        return { code: 'MAN', title: 'Fixed / Manual Price', className: 'pricing-method-manual' };
    }
    if (method === 'custom_markup') {
        return { code: 'CUS', title: 'Custom Markup', className: 'pricing-method-custom' };
    }
    if (pricing.category_markup_is_fallback) {
        const fallbackMarkup = Number(pricing.category_markup_percentage ?? pricing.applied_markup_percentage ?? 15);
        const formattedMarkup = Number.isInteger(fallbackMarkup) ? fallbackMarkup : fallbackMarkup.toFixed(2);
        return {
            code: 'CAT',
            title: `Category Markup — Default ${formattedMarkup}% fallback`,
            className: 'pricing-method-category'
        };
    }
    return { code: 'CAT', title: 'Category Markup', className: 'pricing-method-category' };
}

function productPricingSelectionStatus(product) {
    const pricing = product.pricing || {};
    const method = product.pricing_method || pricing.pricing_method || 'manual';
    if (String(product.status || 'Active') !== 'Active') {
        return { label: 'Inactive', eligible: false, className: 'is-blocked' };
    }
    if (!pricing.latest_cost_basis) {
        return { label: 'No accepted cost', eligible: false, className: 'is-blocked' };
    }
    if (method === 'manual') {
        return { label: 'Eligible — Manual', eligible: true, className: 'is-eligible' };
    }
    if (method === 'custom_markup') {
        return { label: 'Eligible — Custom', eligible: true, className: 'is-eligible' };
    }
    if (pricing.category_pricing_eligible) {
        return { label: 'Eligible — Price outdated', eligible: true, className: 'is-outdated' };
    }
    return { label: 'Up to date', eligible: false, className: 'is-blocked' };
}

function syncSelectedPricingControls() {
    const selectedCount = productState.selectedPricingProductIds.size;
    const eligibleCount = productState.products.filter(product => product.pricing?.category_pricing_eligible).length;
    const visibleEligibleCount = getFilteredProducts().filter(product => productPricingSelectionStatus(product).eligible).length;
    const manageButton = document.getElementById('btnManagePrices');
    const selectionActions = document.getElementById('pricingSelectionActions');
    if (manageButton) {
        manageButton.classList.toggle('d-none', productState.pricingSelectionMode);
        manageButton.disabled = eligibleCount === 0;
        manageButton.innerHTML = `<i class="fa-solid fa-tags me-2"></i>Manage Prices${eligibleCount ? `<span class="manage-prices-count">${eligibleCount} need review</span>` : ''}`;
    }
    selectionActions?.classList.toggle('d-none', !productState.pricingSelectionMode);
    setPricingText('pricingSelectionCount', `${selectedCount} selected · ${visibleEligibleCount} eligible`);
    const button = document.getElementById('btnApplySelectedPricing');
    if (button) {
        button.disabled = selectedCount === 0;
        button.innerHTML = `<i class="fa-solid fa-percent me-2"></i>Apply Category Markup${selectedCount ? ` (${selectedCount} selected)` : ''}`;
    }
    const visible = Array.from(document.querySelectorAll('.product-pricing-select:not(:disabled)'));
    const selectAll = document.getElementById('selectAllProductsForPricing');
    if (selectAll) {
        const checked = visible.filter(input => input.checked).length;
        selectAll.checked = visible.length > 0 && checked === visible.length;
        selectAll.indeterminate = checked > 0 && checked < visible.length;
    }
}

function enterPricingSelectionMode() {
    productState.pricingSelectionMode = true;
    productState.selectedPricingProductIds.clear();
    renderProductCards();
}

function exitPricingSelectionMode() {
    productState.pricingSelectionMode = false;
    productState.selectedPricingProductIds.clear();
    selectedPricingEligibleProductIds.clear();
    selectedPricingPreviewRows = [];
    renderProductCards();
}

function productDetailValue(value) {
    if (value === null || value === undefined || String(value).trim() === '') return 'Not provided';
    return String(value);
}

function productDetailCombinedValue(value, unit) {
    const cleanValue = formatMeasurementValue(value);
    const cleanUnit = String(unit ?? '').trim();
    if (!cleanValue) return null;
    return cleanUnit ? `${cleanValue} ${cleanUnit}` : cleanValue;
}

function formatProductDetailDate(value) {
    if (!value) return 'Not provided';
    const text = String(value);
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
        ? `${text}T00:00:00`
        : text.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/, '$1T$2');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return productDetailValue(value);
    return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

function productDetailPair(label, value, html = false) {
    const content = html ? value : escapeHtml(productDetailValue(value));
    return `<div class="product-details-pair"><dt>${escapeHtml(label)}</dt><dd>${content}</dd></div>`;
}

function productDetailSection(title, rows) {
    if (!rows.length) return '';
    return `
        <section class="product-details-section">
            <h6>${escapeHtml(title)}</h6>
            <dl class="product-details-list">${rows.join('')}</dl>
        </section>
    `;
}

function normalizedProductStatus(status) {
    return String(status || '').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
}

function renderProductDetails(payload) {
    const container = document.getElementById('productDetailsContent');
    if (!container) return;

    const product = payload.product || {};
    const inventory = payload.inventory_summary || {};
    const suppliers = Array.isArray(payload.suppliers) ? payload.suppliers : [];
    const pricing = payload.pricing || {};
    const productStatus = normalizedProductStatus(product.status);
    const productIsActive = productStatus === 'Active';
    const identity = [product.brand_name, product.product_name].filter(Boolean).join(' \u00b7 ') || 'Product record';
    const identityLine = document.getElementById('productDetailsIdentityLine');
    if (identityLine) identityLine.textContent = product.barcode ? `${identity} \u00b7 ${product.barcode}` : identity;

    const inventoryLink = document.getElementById('productDetailsInventoryLink');
    if (inventoryLink) inventoryLink.href = `inventory.html?product_id=${encodeURIComponent(product.product_id || '')}`;

    const productRows = [
        productDetailPair('Barcode', product.barcode),
        productDetailPair('Brand', product.brand_name),
        productDetailPair('Product Name', product.product_name),
        productDetailPair('Category', product.category_name),
        productDetailPair('Product Type', product.type_name),
        productDetailPair('Product Status', productStatus),
        productDetailPair('Created', formatProductDetailDate(product.created_at))
    ];

    const specificationRows = [];
    if (Array.isArray(payload.specifications) && payload.specifications.length) {
        payload.specifications.forEach(specification => {
            const value = specification.value_number !== null && specification.value_number !== ''
                ? formatMeasurement(specification.value_number, specification.unit_symbol)
                : specification.value_text;
            specificationRows.push(productDetailPair(specification.display_name || specification.specification_name, value));
        });
    } else if (product.category_name === 'Medicine') {
        specificationRows.push(productDetailPair('Generic Name', product.generic_name));
        specificationRows.push(productDetailPair('Strength', product.strength || productDetailCombinedValue(product.strength_value, product.strength_unit)));
        specificationRows.push(productDetailPair('Dosage Form', product.dosage_form));
        specificationRows.push(productDetailPair('Net Content', productDetailCombinedValue(product.net_content_value, product.net_content_unit)));
        specificationRows.push(productDetailPair('Container Type', product.package_type));
    } else if (product.category_name === 'Grocery') {
        specificationRows.push(productDetailPair(groceryVariantLabel(product.type_name), product.variant));
        if (product.type_name === 'Beverage') {
            specificationRows.push(productDetailPair('Liquid Content', productDetailCombinedValue(product.net_weight, product.unit)));
            specificationRows.push(productDetailPair('Container Type', product.package_type));
            if (product.pack_content) specificationRows.push(productDetailPair('Pack Content', formatMeasurementText(product.pack_content)));
        } else {
            specificationRows.push(productDetailPair('Size', formatMeasurementText(product.size)));
            specificationRows.push(productDetailPair('Net Weight', productDetailCombinedValue(product.net_weight, product.unit)));
            specificationRows.push(productDetailPair('Container Type', product.package_type));
            specificationRows.push(productDetailPair('Pack Content', formatMeasurementText(product.pack_content)));
        }
    } else if (['Medical Supply', 'Medical Supplies'].includes(product.category_name)) {
        specificationRows.push(productDetailPair('Variant / Description', product.medical_variant || product.variant));
        specificationRows.push(productDetailPair('Size', formatMeasurementText(product.medical_size || product.size)));
        specificationRows.push(productDetailPair('Material', product.material));
        specificationRows.push(productDetailPair('Sterile Status', product.sterile_status));
        specificationRows.push(productDetailPair('Container Type', product.package_type));
        specificationRows.push(productDetailPair('Pack Content', formatMeasurementText(product.pack_content)));
    }

    const inventoryUnit = product.inventory_unit_name || product.inventory_unit_symbol || pricing.inventory_unit || 'unit';
    specificationRows.push(productDetailPair('Selling / Inventory Unit', inventoryUnit));
    const costBasis = pricing.latest_cost_basis || {};
    const pricingMethodLabel = { category_markup: 'Category markup', custom_markup: 'Custom markup', manual: 'Fixed / Manual price' }[pricing.pricing_method] || 'Fixed / Manual price';
    const pricingRows = [
        productDetailPair('Active Selling Price', `${formatPrice(pricing.active_selling_price ?? product.price)} per ${inventoryUnit}`),
        productDetailPair('Pricing Method', pricingMethodLabel),
        productDetailPair('Category', pricing.category_name || product.category_name),
        productDetailPair('Applied Markup Percentage', `${Number(pricing.applied_markup_percentage || 0).toFixed(2)}%`),
        productDetailPair('Latest Accepted Cost Basis', costBasis.unit_cost === undefined ? 'No accepted delivery' : `${formatPrice(costBasis.unit_cost)} per ${inventoryUnit}`),
        productDetailPair('Calculated Selling Price', pricing.calculated_selling_price === null || pricing.calculated_selling_price === undefined ? 'Not available' : `${formatPrice(pricing.calculated_selling_price)} per ${inventoryUnit}`),
        productDetailPair('Price Difference', pricing.price_difference === null || pricing.price_difference === undefined ? 'Not available' : formatPrice(pricing.price_difference)),
        productDetailPair('Price Status', pricing.price_status),
        productDetailPair('Last Price Update', formatProductDetailDate(pricing.last_price_update)),
        productDetailPair('Price Source', pricing.price_source)
    ];
    const latestSupplier = suppliers.find(supplier => supplier.is_latest_accepted_supplier) || suppliers[0];
    const supplierRows = latestSupplier ? [
        productDetailPair('Supplier', `${latestSupplier.supplier_name || 'Not provided'}${latestSupplier.is_latest_accepted_supplier ? ' (latest accepted)' : ''}`),
        productDetailPair('Purchase Unit', latestSupplier.purchase_unit),
        productDetailPair('Product Base Unit', inventoryUnit),
        productDetailPair(`Units per ${latestSupplier.purchase_unit || 'Purchase Unit'}`, `${latestSupplier.units_per_purchase_unit || 1} ${latestSupplier.inventory_unit || inventoryUnit}`),
        productDetailPair('Supplier Cost per Inventory Unit', latestSupplier.supplier_cost_price === null ? 'Not provided' : `${formatPrice(latestSupplier.supplier_cost_price)} per ${latestSupplier.inventory_unit || inventoryUnit}`),
        productDetailPair('Estimated Purchase Unit Cost', latestSupplier.supplier_cost_price === null ? 'Not provided' : `${formatPrice(latestSupplier.estimated_purchase_unit_cost)} per ${latestSupplier.purchase_unit || 'purchase unit'}`),
        ...(suppliers.length > 1 ? [productDetailPair('Other Assigned Suppliers', suppliers.filter(supplier => supplier !== latestSupplier).map(supplier => supplier.supplier_name).join(', '))] : [])
    ] : [productDetailPair('Supplier', 'Not provided')];
    const inventoryRows = [
        productDetailPair('Shelf Quantity', inventory.shelf_quantity ?? 0),
        productDetailPair('Storage Quantity', inventory.storage_quantity ?? 0),
        productDetailPair('Current On Hand', inventory.on_hand_quantity ?? 0),
        productDetailPair('Nearest Expiry', formatProductDetailDate(inventory.nearest_expiry_date)),
        productDetailPair('Active Batches', inventory.active_batch_count ?? 0)
    ];

    const damagedQuantity = Number(inventory.damaged_quantity || 0);
    const returnedQuantity = Number(inventory.returned_quantity || 0);
    const replacementPending = Number(inventory.replacement_pending_quantity || 0);
    const exceptions = [
        `<span class="product-exception ${damagedQuantity === 0 ? 'is-zero' : ''}" title="Units currently recorded as damaged and excluded from sellable on-hand stock"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Damaged Quantity</span><strong>${escapeHtml(damagedQuantity)}</strong></span>`,
        `<span class="product-exception is-returned ${returnedQuantity === 0 ? 'is-zero' : ''}" title="Units returned to the supplier; these are excluded from sellable on-hand stock"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Returned Quantity</span><strong>${escapeHtml(returnedQuantity)}</strong></span>`
    ];
    if (replacementPending > 0) {
        exceptions.push(`<span class="product-exception is-pending" title="Replacement units still expected from the supplier"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i><span>Replacement Pending</span><strong>${escapeHtml(replacementPending)}</strong></span>`);
    }

    const tags = [product.category_name, product.type_name, product.barcode].filter(Boolean);
    container.innerHTML = `
        <div class="product-details-overview">
            <div class="product-details-primary">
                <div class="product-details-kicker">Product master record</div>
                <h4 class="product-details-name">${escapeHtml(product.product_name || 'Unnamed product')}</h4>
                <div class="product-details-brand">${escapeHtml(product.brand_name || 'Brand not provided')}</div>
                <div class="product-details-tags">
                    ${tags.map((tag) => `<span class="product-details-tag">${escapeHtml(tag)}</span>`).join('')}
                    <span class="product-details-tag product-status-tag ${productIsActive ? 'is-active' : 'is-inactive'}">${escapeHtml(productStatus)}</span>
                </div>
            </div>
            <div class="product-details-stock-grid" aria-label="Current inventory summary">
                <div class="product-details-stock-tile"><span>Shelf</span><strong>${escapeHtml(inventory.shelf_quantity ?? 0)}</strong></div>
                <div class="product-details-stock-tile"><span>Storage</span><strong>${escapeHtml(inventory.storage_quantity ?? 0)}</strong></div>
                <div class="product-details-stock-tile is-total" title="Shelf plus storage; damaged and returned units are excluded"><span>On Hand</span><strong>${escapeHtml(inventory.on_hand_quantity ?? 0)}</strong></div>
                <div class="product-details-stock-tile"><span>Active Batches</span><strong>${escapeHtml(inventory.active_batch_count ?? 0)}</strong></div>
            </div>
        </div>
        <div class="product-details-sections">
            ${productDetailSection('Product Information', productRows)}
            ${productDetailSection('Product Specification', specificationRows)}
            ${productDetailSection('Pricing', pricingRows)}
            ${productDetailSection('Supplier Purchasing Setup', supplierRows)}
            ${productDetailSection('Inventory Snapshot', inventoryRows)}
            <section class="product-details-section">
                <h6>Stock Exceptions</h6>
                <p class="product-details-exception-note">These quantities are tracked separately and are not included in current on-hand stock.</p>
                <div class="product-details-exceptions">${exceptions.join('')}</div>
            </section>
        </div>
    `;
}

function renderProductDetailsPreview(product) {
    const container = document.getElementById('productDetailsContent');
    if (!container) return;

    const status = normalizedProductStatus(product.status);
    const tags = [product.category_name, product.type_name, product.barcode].filter(Boolean);
    container.innerHTML = `
        <div class="product-details-overview">
            <div class="product-details-primary">
                <div class="product-details-kicker">Product master record</div>
                <h4 class="product-details-name">${escapeHtml(product.product_name || 'Unnamed product')}</h4>
                <div class="product-details-brand">${escapeHtml(product.brand_name || 'Brand not provided')}</div>
                <div class="product-details-tags">
                    ${tags.map(tag => `<span class="product-details-tag">${escapeHtml(tag)}</span>`).join('')}
                    <span class="product-details-tag product-status-tag ${status === 'Active' ? 'is-active' : 'is-inactive'}">${escapeHtml(status)}</span>
                </div>
            </div>
        </div>
        <div class="product-details-sections">
            ${productDetailSection('Available Product Information', [
                productDetailPair('Barcode', product.barcode),
                productDetailPair('Product Type', product.type_name),
                productDetailPair('Specification', formatProductSpecification(product)),
                productDetailPair('Selling Price', formatPrice(product.price)),
                productDetailPair('Product Status', status)
            ])}
            <section class="product-details-section product-details-section-pending" aria-live="polite">
                <h6>Verified Details</h6>
                <div><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading current suppliers, pricing, and inventory...</div>
            </section>
        </div>
    `;
}

function invalidateProductDetails(productIds) {
    (Array.isArray(productIds) ? productIds : [productIds]).filter(Boolean).forEach(productId => {
        productDetailsCache.delete(String(productId));
    });
}

async function openProductDetailsModal(productId, options = {}) {
    const product = getProductById(productId);
    const container = document.getElementById('productDetailsContent');
    const modalElement = document.getElementById('productDetailsModal');
    if (!product || !container || !modalElement) return;

    const normalizedProductId = String(productId);
    activeProductDetailsId = normalizedProductId;
    const requestSequence = ++productDetailsRequestSequence;
    productDetailsAbortController?.abort();
    productDetailsAbortController = null;
    const identityLine = document.getElementById('productDetailsIdentityLine');
    if (identityLine) identityLine.textContent = [product.brand_name, product.product_name].filter(Boolean).join(' \u00b7 ') || 'Loading product record...';
    const editButton = document.getElementById('productDetailsEditButton');
    if (editButton) editButton.disabled = true;
    bootstrap.Modal.getOrCreateInstance(modalElement).show();

    const cachedDetails = options.forceRefresh ? null : productDetailsCache.get(normalizedProductId);
    if (cachedDetails) {
        renderProductDetails(cachedDetails);
        if (editButton) editButton.disabled = false;
        bootstrap.Modal.getInstance(modalElement)?.handleUpdate();
        return;
    }

    renderProductDetailsPreview(product);
    productDetailsAbortController = new AbortController();

    try {
        const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_product_details.php?product_id=${encodeURIComponent(productId)}&t=${Date.now()}`, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            signal: productDetailsAbortController.signal
        });
        if (requestSequence !== productDetailsRequestSequence) return;
        const details = response?.data || {};
        productDetailsCache.set(normalizedProductId, details);
        renderProductDetails(details);
        if (editButton) editButton.disabled = false;
        bootstrap.Modal.getInstance(modalElement)?.handleUpdate();
    } catch (error) {
        if (requestSequence !== productDetailsRequestSequence) return;
        if (error?.name === 'AbortError') return;
        container.innerHTML = `<div class="product-details-error"><div><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><div class="fw-bold mb-1">Product details could not be loaded.</div><div>${escapeHtml(error.message || 'Please try again.')}</div><button type="button" class="btn btn-sm btn-outline-primary mt-3 retry-product-details-btn">Retry</button></div></div>`;
    } finally {
        if (requestSequence === productDetailsRequestSequence) productDetailsAbortController = null;
    }
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

async function populateProductCardFilters() {
    const categoryFilter = document.getElementById('productCategoryFilter');
    if (!categoryFilter) return;

    try {
        productState.categories = await cachedCategories();
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
        productState.types = smartTypeList(categoryNameById(categoryId), await cachedProductTypes(categoryId), selectedType);
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
    const response = await loadMeasurementUnits();
    productState.units = response.units;
    productState.measurementGroups = response.measurement_groups;
    return productState.units;
}

function applyProductConfiguration(typeId, response) {
    productState.configurationTypeId = typeId;
    productState.specifications = response?.specifications || [];
    productState.allSpecifications = response?.all_specifications || [];
    productState.units = response?.units || [];
    productState.packageTypes = response?.package_types || [];
    productState.measurementGroups = response?.measurement_groups || [];
    return productState.specifications;
}

async function loadProductConfiguration(typeId = '', options = {}) {
    const key = String(typeId || '');
    if (!options.forceRefresh && referenceCache.configurationsByType.has(key)) {
        const cached = referenceCache.configurationsByType.get(key);
        const measurementUnits = await loadMeasurementUnits();
        cached.units = measurementUnits.units;
        cached.measurement_groups = measurementUnits.measurement_groups;
        return applyProductConfiguration(typeId, cached);
    }

    let promise = !options.forceRefresh ? referenceCache.configurationPromises.get(key) : null;
    if (!promise) {
        const query = typeId ? `?type_id=${encodeURIComponent(typeId)}` : '';
        promise = Promise.all([
            PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_product_configuration.php${query}`, {
                method: 'GET', credentials: 'include'
            }),
            loadMeasurementUnits({ forceRefresh: Boolean(options.forceRefresh) })
        ]).then(([response, measurementUnits]) => {
            response.units = measurementUnits.units;
            response.measurement_groups = measurementUnits.measurement_groups;
            referenceCache.configurationsByType.set(key, response);
            return response;
        }).finally(() => referenceCache.configurationPromises.delete(key));
        referenceCache.configurationPromises.set(key, promise);
    }
    return applyProductConfiguration(typeId, await promise);
}

function invalidateProductConfiguration(typeId) {
    const key = String(typeId || '');
    referenceCache.configurationsByType.delete(key);
    referenceCache.configurationPromises.delete(key);
}

function upsertMeasurementUnit(unit) {
    const merge = units => {
        const byId = new Map((Array.isArray(units) ? units : []).map(item => [String(item.measurement_unit_id), item]));
        byId.set(String(unit.measurement_unit_id), unit);
        return [...byId.values()].sort((left, right) =>
            String(left.measurement_group || '').localeCompare(String(right.measurement_group || ''))
            || String(left.unit_name || '').localeCompare(String(right.unit_name || ''))
        );
    };
    productState.units = merge(productState.units);
    upsertMeasurementUnitCache(unit);
    referenceCache.configurationsByType.forEach(response => {
        response.units = merge(response.units);
    });
}

function archiveMeasurementUnit(unitId) {
    const markArchived = units => (Array.isArray(units) ? units : []).map(unit =>
        String(unit.measurement_unit_id) === String(unitId) ? { ...unit, is_active: 0 } : unit
    );
    productState.units = markArchived(productState.units);
    referenceCache.configurationsByType.forEach(response => {
        response.units = markArchived(response.units);
    });
    archiveMeasurementUnitCache(unitId);
}

function getSelectedAddCategoryName() {
    return document.getElementById('productCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
}

function selectedAddTypeName() {
    return document.getElementById('productType')?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function getVariationProductUnit(variation = {}) {
    return cleanDisplay(variation.unit) || cleanDisplay(variation.package_type) || 'pcs';
}

function buildProductPayload() {
    const variations = collectAddVariations();
    const firstVariation = variations.find((variation) => !variation.delete) || variations[0] || {};
    const categoryName = getSelectedAddCategoryName();

    const pricingMethod = getValue('productPricingMethod') || 'manual';
    const payload = {
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
        status: getValue('productStatus') || 'Active',
        pricing_method: pricingMethod,
        variations
    };
    if (pricingMethod === 'custom_markup') payload.custom_markup_percentage = getValue('productCustomMarkup');

    return payload;
}

function updateAddPricingMethodView() {
    const custom = getValue('productPricingMethod') === 'custom_markup';
    document.getElementById('productCustomMarkupWrap')?.classList.toggle('d-none', !custom);
    const input = document.getElementById('productCustomMarkup');
    if (input) {
        input.required = custom;
        input.disabled = !custom;
    }
}

async function populateAddCategories(selectedCategoryId = '') {
    const categorySelect = document.getElementById('productCategory');
    if (!categorySelect) return;

    try {
        productState.categories = await cachedCategories();
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
        typeSelect.innerHTML = `<option value="" disabled selected>Select product type...</option><option value="${CUSTOMIZE_OPTION}">⚙ Customize Product Types</option><option disabled>──────────</option>`;
        smartTypeList(categoryNameById(categoryId), await cachedProductTypes(categoryId), selectedTypeId).forEach(type => {
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
        const suppliers = await cachedSuppliers();

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
        const suppliers = await cachedSuppliers();
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

function clearProductFormValidation(form) {
    form.querySelectorAll('.is-invalid').forEach((field) => {
        field.classList.remove('is-invalid');
        field.removeAttribute('aria-invalid');
    });
    form.querySelectorAll('.product-field-error').forEach((error) => error.remove());
}

function validateVisibleProductFields(form) {
    clearProductFormValidation(form);
    const invalid = [];

    form.querySelectorAll('[required]').forEach((field) => {
        if (field.disabled || field.closest('.d-none') || field.offsetParent === null) return;
        const empty = String(field.value ?? '').trim() === '';
        const belowMinimum = field.type === 'number'
            && field.value !== ''
            && field.min !== ''
            && Number(field.value) < Number(field.min);
        if (!empty && !belowMinimum) return;

        const label = field.closest('.col-md-6, .col-12, section, div')?.querySelector('.form-label')?.textContent
            ?.replace('*', '').trim() || 'This field';
        const error = document.createElement('div');
        error.className = 'product-field-error';
        error.textContent = empty ? `${label} is required.` : `${label} must be ${field.min} or greater.`;
        const anchor = field.closest('.input-group, .variation-pair') || field;
        anchor.insertAdjacentElement('afterend', error);
        field.classList.add('is-invalid');
        field.setAttribute('aria-invalid', 'true');
        invalid.push(field);
    });

    if (!invalid.length) return true;
    const first = invalid[0];
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => first.focus({ preventScroll: true }), 250);
    return false;
}

function initAddProductForm() {
    const addProductForm = document.getElementById('addProductForm');

    if (!addProductForm) {
        return;
    }
    if (addProductForm.dataset.productControllerReady === '1') return;
    addProductForm.dataset.productControllerReady = '1';
    initProductCustomizers();

    loadMeasurementUnitCache().then(() => {
        renderAddVariations({ variations: collectAddVariations() }, getSelectedAddCategoryName());
    }).catch((err) => console.warn('Failed to load unit options:', err.message || err));
    updateAddPricingMethodView();
    document.getElementById('productPricingMethod')?.addEventListener('change', updateAddPricingMethodView);

    document.getElementById('productCategory')?.addEventListener('change', async (event) => {
        if (event.target.value === CUSTOMIZE_OPTION) {
            event.target.value = event.target.dataset.previousValue || '';
            openCategoryCustomizer();
            return;
        }
        event.target.dataset.previousValue = event.target.value;
        productState.configurationTypeId = '';
        productState.specifications = [];
        await populateAddTypes(event.target.value, '');
        const categoryName = getSelectedAddCategoryName();
        renderAddVariations({ variations: collectAddVariations() }, categoryName);
    });

    document.getElementById('productType')?.addEventListener('change', async (event) => {
        if (event.target.value === CUSTOMIZE_OPTION) {
            event.target.value = event.target.dataset.previousValue || '';
            openProductTypeCustomizer();
            return;
        }
        event.target.dataset.previousValue = event.target.value;
        await loadProductConfiguration(event.target.value);
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
        if (event.target.closest('.btn-customize-specifications')) {
            openSpecificationCustomizer();
            return;
        }
        const removeButton = event.target.closest('.btn-remove-edit-variation');
        if (!removeButton) return;
        const entries = document.querySelectorAll('#addVariationList .edit-variation-entry');
        if (entries.length <= 1) return;
        removeButton.closest('.edit-variation-entry')?.remove();
        if (!document.querySelector('#addVariationList .edit-var-default:checked')) {
            document.querySelector('#addVariationList .edit-var-default')?.click();
        }
    });
    document.getElementById('addVariationList')?.addEventListener('change', (event) => {
        handleSellableSkuCustomization(event, false);
    });
    document.getElementById('addVariationList')?.addEventListener('focusin', rememberCustomizationValue);

    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateVisibleProductFields(addProductForm)) return;

        const payload = buildProductPayload();

        try {
            PharmaUtils.modal.loading('Saving Product...');

            const result = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/add_product.php`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            window.dispatchEvent(new CustomEvent('products:created', {
                detail: { productIds: result.product_ids || [result.product_id].filter(Boolean) }
            }));

            const createdIds = result.product_ids || [result.product_id].filter(Boolean);
            const createdProducts = createdIds.map((productId, index) => {
                const variation = payload.variations[index] || payload.variations[0] || {};
                return {
                    product_id: productId,
                    brand_name: payload.brand_name,
                    product_name: payload.product_name,
                    category_id: payload.category_id,
                    category_name: payload.category_name,
                    type_id: payload.type_id,
                    type_name: payload.product_type,
                    status: payload.status,
                    pricing_method: payload.pricing_method,
                    custom_markup_percentage: payload.custom_markup_percentage ?? null,
                    barcode: variation.barcode || '',
                    price: variation.price || payload.price || 0,
                    current_stock: 0,
                    specifications: variation.specifications || [],
                    variations: [variation]
                };
            });
            commitLocalProductChanges(createdProducts, { prepend: true });

            PharmaUtils.modal.close();
            await PharmaUtils.modal.success('Product Saved', 'Item added to system master files successfully.');

            addProductForm.reset();
            document.getElementById('productType').disabled = true;
            renderAddVariations();
            closeAddProductModal();
            if (payload.pricing_method !== 'manual') reconcileProductsInBackground();
        } catch (err) {
            PharmaUtils.modal.close();
            PharmaUtils.modal.error('Failed to add product', err.message);
        }
    });
}
async function loadProductsTable(options = {}) {
    const tableBody = document.querySelector('#table-products tbody') || document.querySelector('#productsTable tbody') || document.getElementById('productTableBody');

    if (!tableBody) return;
    if (productsLoadPromise) return productsLoadPromise;

    const startedAt = performance.now();
    const cachedProducts = options?.skipCache ? null : readProductListCache();
    let cachedRenderMs = null;
    if (cachedProducts) {
        const renderStartedAt = performance.now();
        replaceProducts(cachedProducts);
        renderProductCards();
        cachedRenderMs = performance.now() - renderStartedAt;
    }
    if (productState.products.length) setProductRefreshIndicator('refreshing');

    productsLoadPromise = (async () => {
        try {
            const requestStartedAt = performance.now();
            const resp = await fetchProductsWithRetry();
            const requestMs = performance.now() - requestStartedAt;
            const freshProducts = (resp && resp.data) ? resp.data : [];
            const changed = JSON.stringify(freshProducts) !== JSON.stringify(productState.products);
            const eligibleIds = new Set(freshProducts.filter(product => productPricingSelectionStatus(product).eligible).map(product => String(product.product_id)));
            productState.selectedPricingProductIds.forEach(productId => {
                if (!eligibleIds.has(productId)) productState.selectedPricingProductIds.delete(productId);
            });
            let renderMs = 0;
            replaceProducts(freshProducts);
            if (changed || !cachedProducts) {
                const renderStartedAt = performance.now();
                renderProductCards();
                renderMs = performance.now() - renderStartedAt;
            } else {
                syncSelectedPricingControls();
            }
            writeProductListCache(freshProducts);
            setProductRefreshIndicator('hidden');
            window.__productMasterPerformance = {
                cachedRenderMs,
                requestMs,
                renderMs,
                totalMs: performance.now() - startedAt,
                usedCache: Boolean(cachedProducts)
            };
        } catch (err) {
            if (productState.products.length) {
                setProductRefreshIndicator('error');
            } else {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center text-danger py-4">
                            <div>${escapeHtml(err.message)}</div>
                            <button class="btn btn-sm btn-outline-primary mt-2 retry-products-btn" type="button">Retry</button>
                        </td>
                    </tr>
                `;
            }
        } finally {
            productsLoadPromise = null;
        }
    })();
    return productsLoadPromise;
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

    productState.categories = await cachedCategories();

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

    typeSelect.innerHTML = '<option value="" disabled>Select product type...</option>';
    smartTypeList(categoryNameById(categoryId), await cachedProductTypes(categoryId), selectedTypeId).forEach(type => {
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
    return `${ruleOptionList(options, selected)}
        <option disabled>──────────</option>
        <option value="${CUSTOMIZE_OPTION}">⚙ Customize / Add Specifications</option>`;
}

function datalist(id, options = []) {
    return ruleDatalist(id, options).replace(
        '</datalist>',
        `<option value="${CUSTOMIZE_OPTION}" label="⚙ Customize / Add Specifications"></option></datalist>`
    );
}

function measurementUnitOptionList(group, selected = '') {
    const unitNames = measurementUnitsForContext(productState.units, { group })
        .map(unit => unit.unit_symbol || unit.unit_name);
    const normalizedSelected = String(selected || '').trim().toLowerCase();
    const options = Array.from(new Set(unitNames.filter(Boolean)));
    if (selected && !options.some(option => option.toLowerCase() === normalizedSelected)) {
        options.unshift(selected);
    }
    return [
        '<option value="">-</option>',
        ...options.map(option => `<option value="${escapeHtml(option)}" ${String(option).toLowerCase() === normalizedSelected ? 'selected' : ''}>${escapeHtml(option)}</option>`),
        '<option disabled>──────────</option>',
        `<option value="${CUSTOMIZE_OPTION}">⚙ Customize / Add Measurement Units</option>`
    ].join('');
}

function inventoryUnitField(variation = {}) {
    const savedUnit = {
        unit_name: variation.inventory_unit_name || '',
        unit_symbol: variation.inventory_unit_symbol || '',
        measurement_group: 'Count'
    };
    return `<div class="col-md-6 permanent-inventory-unit"><label class="form-label">Selling / Inventory Unit <span class="text-danger">*</span></label><select class="form-select edit-var-inventory-unit" required>${dynamicUnitOptions('Count', variation.inventory_unit_id || '', savedUnit)}</select><div class="form-text">Defines what quantity 1 means for stock, transfers, pricing, and POS.</div></div>`;
}

function specificationChoiceOptionList(selected = '', fallbackOptions = []) {
    const normalizedSelected = String(selected || '').trim().toLowerCase();
    const options = Array.from(new Set(fallbackOptions.filter(Boolean)));
    if (selected && !options.some(option => String(option).toLowerCase() === normalizedSelected)) {
        options.unshift(selected);
    }
    return [
        '<option value="">-</option>',
        ...options.map(option => `<option value="${escapeHtml(option)}" ${String(option).toLowerCase() === normalizedSelected ? 'selected' : ''}>${escapeHtml(option)}</option>`),
        '<option disabled>──────────</option>',
        `<option value="${CUSTOMIZE_OPTION}">⚙ Customize / Add Specifications</option>`
    ].join('');
}

function selectedEditTypeName() {
    return document.getElementById('editProductType')?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function specificationValue(variation, specificationId) {
    return (variation?.specifications || []).find(value => String(value.specification_id) === String(specificationId)) || {};
}

function dynamicUnitOptions(group, selectedId = '', savedUnit = {}) {
    const normalizedGroup = String(group || '').trim().toLowerCase();
    const units = measurementUnitsForContext(productState.units, { group: normalizedGroup });
    const selectedIsAvailable = units.some(unit => String(unit.measurement_unit_id) === String(selectedId));
    const archivedUnit = productState.units.find(unit => String(unit.measurement_unit_id) === String(selectedId)) || {};
    const savedGroup = savedUnit.measurement_group || savedUnit.unit_measurement_group || archivedUnit.measurement_group || '';
    const historicalUnitMatchesGroup = normalizedGroup && String(savedGroup).trim().toLowerCase() === normalizedGroup;
    const archivedLabel = savedUnit.unit_symbol || savedUnit.unit_name || savedUnit.measurement_unit_name || archivedUnit.unit_symbol || archivedUnit.unit_name || selectedId;
    return [
        '<option value="">Select unit...</option>',
        ...units.map(unit => `<option value="${escapeHtml(unit.measurement_unit_id)}" ${String(unit.measurement_unit_id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(unit.unit_symbol || unit.unit_name)} — ${escapeHtml(unit.measurement_group)}</option>`),
        selectedId && !selectedIsAvailable && historicalUnitMatchesGroup ? `<option value="${escapeHtml(selectedId)}" selected>${escapeHtml(archivedLabel)} — archived</option>` : '',
        '<option disabled>──────────</option>',
        `<option value="${CUSTOMIZE_OPTION}">⚙ Customize / Add Measurement Units</option>`
    ].filter(Boolean).join('');
}

function measurementGroupForControl(control) {
    if (control.matches('.dynamic-spec-unit')) return control.dataset.measurementGroup || '';
    if (control.matches('.edit-var-inventory-unit')) return 'Count';
    if (control.matches('.edit-var-strength-unit')) return 'Strength';
    if (control.matches('.edit-var-weight-unit')) return 'Weight';
    if (control.matches('.edit-var-pack-content-unit')) return 'Count';
    if (control.matches('.edit-var-net-content-unit')) return 'Volume';
    return '';
}

function specificationTargetForControl(control) {
    const field = control.closest('.specification-field');
    const container = field || control.closest('.col-md-6, .col-12');
    return {
        specificationId: field?.dataset.specificationId || '',
        label: container?.querySelector('.form-label')?.textContent?.trim() || ''
    };
}

function handleSellableSkuCustomization(event, editMode = false) {
    const control = event.target.closest('select, input[list]');
    if (!control || control.value !== CUSTOMIZE_OPTION) return false;

    control.value = control.dataset.previousValue || '';
    const measurementGroup = measurementGroupForControl(control);
    const action = measurementGroup
        ? openMeasurementUnitCustomizer(measurementGroup, control)
        : openSpecificationCustomizer(editMode, specificationTargetForControl(control));
    Promise.resolve(action).catch(error => PharmaUtils.toast.error(error.message || 'Unable to open customization.'));
    return true;
}

function rememberCustomizationValue(event) {
    const control = event.target.closest('select, input[list]');
    if (control && control.value !== CUSTOMIZE_OPTION) control.dataset.previousValue = control.value;
}

function dynamicSpecificationField(specification, variation, rowId) {
    const value = specificationValue(variation, specification.specification_id);
    const label = escapeHtml(specification.display_name || specification.specification_name);
    const attributes = `data-specification-id="${escapeHtml(specification.specification_id)}" data-field-style="${escapeHtml(specification.field_style)}"`;
    if (specification.field_style === 'Number with Unit') {
        return `<div class="specification-field" ${attributes}><label class="form-label">${label}</label><div class="input-group"><input class="form-control dynamic-spec-number" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(value.value_number))}"><select class="form-select dynamic-spec-unit" data-measurement-group="${escapeHtml(specification.measurement_group || '')}">${dynamicUnitOptions(specification.measurement_group, value.measurement_unit_id, value)}</select></div></div>`;
    }
    if (specification.field_style === 'Number Only') {
        return `<div class="specification-field" ${attributes}><label class="form-label">${label}</label><input class="form-control dynamic-spec-number" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(value.value_number))}"></div>`;
    }
    if (specification.field_style === 'Selection List') {
        const usesPackageChoices = specification.specification_name === 'Package Type';
        const choiceSource = usesPackageChoices ? [...productState.packageTypes, ...(specification.choices || [])] : (specification.choices || []);
        const choices = Array.from(new Map(choiceSource.filter(Boolean).map(choice => [String(choice).trim().toLowerCase(), String(choice).trim()])).values());
        const savedChoice = String(value.value_text || '').trim();
        if (savedChoice && !choices.some(choice => choice.toLowerCase() === savedChoice.toLowerCase())) choices.unshift(savedChoice);
        if (specification.allow_custom_value) {
            const listId = `${rowId}-${specification.specification_id}`;
            return `<div class="specification-field" ${attributes}><label class="form-label">${label}</label><input class="form-control dynamic-spec-text" list="${escapeHtml(listId)}" value="${escapeHtml(value.value_text ?? '')}" placeholder="Select or type"><datalist id="${escapeHtml(listId)}">${choices.map(choice => `<option value="${escapeHtml(choice)}"></option>`).join('')}<option value="${CUSTOMIZE_OPTION}" label="⚙ Customize / Add Specifications"></option></datalist></div>`;
        }
        return `<div class="specification-field" ${attributes}><label class="form-label">${label}</label><select class="form-select dynamic-spec-text"><option value="">Select...</option>${choices.map(choice => `<option ${String(choice).toLowerCase() === String(value.value_text || '').toLowerCase() ? 'selected' : ''}>${escapeHtml(choice)}</option>`).join('')}<option disabled>──────────</option><option value="${CUSTOMIZE_OPTION}">⚙ Customize / Add Specifications</option></select></div>`;
    }
    return `<div class="specification-field" ${attributes}><label class="form-label">${label}</label><input class="form-control dynamic-spec-text" value="${escapeHtml(value.value_text ?? '')}"></div>`;
}

function dynamicVariationEntry(variation = {}, canDelete = true, mode = 'add') {
    const rowId = `dynamic-spec-${Math.random().toString(36).slice(2)}`;
    const deleteButton = canDelete ? '<button class="btn btn-sm btn-outline-danger btn-remove-edit-variation" type="button" title="Remove variant"><i class="fa-solid fa-trash-can"></i></button>' : '';
    const fields = productState.specifications.map(specification => dynamicSpecificationField(specification, variation, rowId)).join('');
    const empty = productState.specifications.length ? '' : `<div class="dynamic-specification-empty"><p class="mb-2">No specifications have been configured for this Product Type.</p><button class="btn btn-sm btn-outline-secondary btn-customize-specifications" type="button">Customize Specifications</button></div>`;
    return `<div class="edit-variation-entry"><div class="d-flex align-items-center justify-content-between gap-2 mb-3"><span class="fw-bold small text-muted">${mode === 'edit' ? 'Product SKU Details' : 'Sellable SKU'}</span><div><button class="btn btn-sm btn-outline-secondary btn-customize-specifications me-2" type="button"><i class="fa-solid fa-gear me-1"></i>Customize Specifications</button><input class="form-check-input edit-var-default d-none" type="radio" name="${mode}DefaultVariation" ${String(variation.is_default ?? 1) === '1' ? 'checked' : ''}>${deleteButton}</div></div>${empty}<div class="dynamic-specification-grid">${fields}</div><div class="add-variant-purchasing"><h6 class="add-variant-subtitle">Inventory, Barcode &amp; Selling Price</h6><div class="row g-3">${inventoryUnitField(variation)}<div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" inputmode="text" value="${escapeHtml(variation.barcode || '')}"></div><div class="col-md-6"><label class="form-label">Selling Price</label><input class="form-control edit-var-price" type="number" min="0" step=".01" value="${escapeHtml(variation.price ?? '')}" required></div></div></div></div>`;
}

function editVariationEntry(variation = {}, categoryName = 'Grocery', typeName = '', canDelete = true, mode = 'edit') {
    if (productState.specifications.length > 0 && productState.configurationTypeId === (mode === 'edit' ? getValue('editProductType') : getValue('productType'))) {
        return dynamicVariationEntry(variation, canDelete, mode);
    }
    const rule = getVariationRule(categoryName, typeName);
    const rowId = `variation-rule-${Math.random().toString(36).slice(2)}`;
    const defaultName = `${mode}DefaultVariation`;
    const header = mode === 'edit' ? 'Product SKU Details' : 'Sellable SKU';
    const deleteButton = canDelete ? '<button class="btn btn-sm btn-outline-danger btn-remove-edit-variation" type="button" title="Remove variant"><i class="fa-solid fa-trash-can"></i></button>' : '';
    const medicineFields = `
                <div class="col-md-6"><label class="form-label">Generic Name</label><input class="form-control edit-var-generic-name" value="${escapeHtml(variation.generic_name || '')}" placeholder="Povidone-Iodine"></div>
                <div class="col-md-6"><label class="form-label">Strength</label><div class="variation-pair"><input class="form-control edit-var-strength-value" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(variation.strength_value))}" placeholder="70"><select class="form-select edit-var-strength-unit">${measurementUnitOptionList('Strength', variation.strength_unit || '')}</select></div></div>
                <div class="col-md-6"><label class="form-label">Dosage Form</label><input class="form-control edit-var-dosage-form" value="${escapeHtml(variation.dosage_form || '')}" placeholder="Solution"></div>
                <div class="col-md-6"><label class="form-label">Net Content</label><div class="variation-pair"><input class="form-control edit-var-net-content-value" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(variation.net_content_value))}" placeholder="500"><select class="form-select edit-var-net-content-unit">${measurementUnitOptionList('Volume', variation.net_content_unit || '')}</select></div></div>
                <div class="col-md-6"><label class="form-label">Container Type</label><select class="form-select edit-var-package-type">${specificationChoiceOptionList(variation.package_type || '', ['bottle', 'box', 'pack', 'blister pack', 'sachet', 'tube', 'vial', 'ampule'])}</select></div>
                ${inventoryUnitField(variation)}
                <div class="col-md-6"><label class="form-label">Price</label><input class="form-control edit-var-price" type="number" min="0" step=".01" value="${escapeHtml(variation.price ?? '')}" required></div>
                <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
    `;
    const medicalFields = `
                <div class="col-md-6"><label class="form-label">Variant / Description</label><input class="form-control edit-var-name" value="${escapeHtml(variation.variant_name || '')}" placeholder="Ethyl Alcohol 70%"></div>
                <div class="col-md-6"><label class="form-label">Size</label><input class="form-control edit-var-size-value" value="${escapeHtml(formatMeasurementText(variation.size_value))}" placeholder="500 mL"></div>
                <div class="col-md-6"><label class="form-label">Material</label><input class="form-control edit-var-material" value="${escapeHtml(variation.material || '')}"></div>
                <div class="col-md-6"><label class="form-label">Sterile Status</label><select class="form-select edit-var-sterile-status"><option value="">-</option><option ${variation.sterile_status === 'Sterile' ? 'selected' : ''}>Sterile</option><option ${variation.sterile_status === 'Non-sterile' ? 'selected' : ''}>Non-sterile</option><option disabled>──────────</option><option value="${CUSTOMIZE_OPTION}">⚙ Customize / Add Specifications</option></select></div>
                <div class="col-md-6"><label class="form-label">Container Type</label><select class="form-select edit-var-package-type">${specificationChoiceOptionList(variation.package_type || '', ['bottle', 'box', 'pack', 'roll', 'tube'])}</select></div>
                ${inventoryUnitField(variation)}
                <div class="col-md-6"><label class="form-label">Price</label><input class="form-control edit-var-price" type="number" min="0" step=".01" value="${escapeHtml(variation.price ?? '')}" required></div>
                <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
    `;
    const groceryFields = `
                <div class="col-md-6"><label class="form-label">${escapeHtml(groceryVariantLabel(typeName))}</label><input class="form-control edit-var-name" list="${rowId}-variant" value="${escapeHtml(variation.variant_name || '')}" placeholder="Select or type">${datalist(`${rowId}-variant`, rule.variantOptions)}</div>
                <div class="col-md-6"><label class="form-label">Size</label><select class="form-select edit-var-size-value">${optionList(rule.sizeOptions, formatMeasurementText(variation.size_value))}</select></div>
                <div class="col-md-6"><label class="form-label">Net Weight</label><div class="variation-pair"><input class="form-control edit-var-weight-value" list="${rowId}-weight" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(variation.weight_value))}" placeholder="155"><select class="form-select edit-var-weight-unit">${measurementUnitOptionList('Weight', variation.weight_unit || '')}</select></div>${datalist(`${rowId}-weight`, rule.weightValues)}</div>
                <div class="col-md-6"><label class="form-label">Container Type</label><select class="form-select edit-var-package-type">${specificationChoiceOptionList(variation.package_type || '', ['can', 'bottle', 'box', 'pack', 'sachet', 'tube', 'jar', 'pouch'])}</select></div>
                <div class="col-md-6"><label class="form-label">Pack Content</label><div class="variation-pair"><input class="form-control edit-var-pack-content-qty" list="${rowId}-pack-content" type="number" min="0" step="1" value="${escapeHtml(formatMeasurementValue(variation.pack_content_qty))}" placeholder="12"><select class="form-select edit-var-pack-content-unit">${measurementUnitOptionList('Count', variation.pack_content_unit || '')}</select></div>${datalist(`${rowId}-pack-content`, rule.packContentValues)}</div>
                ${inventoryUnitField(variation)}
                <div class="col-md-6"><label class="form-label">Price</label><input class="form-control edit-var-price" type="number" min="0" step=".01" value="${escapeHtml(variation.price ?? '')}" required></div>
                <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
    `;

    const addMedicineFields = `
        <div class="row g-3">
            <div class="col-md-6"><label class="form-label">Generic Name</label><input class="form-control edit-var-generic-name" value="${escapeHtml(variation.generic_name || '')}" placeholder="Povidone-Iodine"></div>
            <div class="col-md-6"><label class="form-label">Strength</label><div class="variation-pair"><input class="form-control edit-var-strength-value" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(variation.strength_value))}" placeholder="70"><select class="form-select edit-var-strength-unit">${measurementUnitOptionList('Strength', variation.strength_unit || '')}</select></div></div>
            <div class="col-md-6"><label class="form-label">Dosage Form</label><input class="form-control edit-var-dosage-form" value="${escapeHtml(variation.dosage_form || '')}" placeholder="Solution"></div>
            <div class="col-md-6"><label class="form-label">Net Content</label><div class="variation-pair"><input class="form-control edit-var-net-content-value" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(variation.net_content_value))}" placeholder="500"><select class="form-select edit-var-net-content-unit">${measurementUnitOptionList('Volume', variation.net_content_unit || '')}</select></div></div>
            ${inventoryUnitField(variation)}
            <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
        </div>
        <div class="add-variant-purchasing">
            <h6 class="add-variant-subtitle">Packaging &amp; Price</h6>
            <div class="row g-3">
                <div class="col-md-6"><label class="form-label">Container Type</label><select class="form-select edit-var-package-type">${specificationChoiceOptionList(variation.package_type || '', ['bottle', 'box', 'pack', 'blister pack', 'sachet', 'tube', 'vial', 'ampule'])}</select></div>
                <div class="col-md-6"><label class="form-label">Price</label><input class="form-control edit-var-price" type="number" min="0" step=".01" value="${escapeHtml(variation.price ?? '')}" required></div>
            </div>
        </div>
    `;
    const addMedicalFields = `<div class="row g-3">${medicalFields}</div>`;
    const addGroceryFields = `
        <div class="row g-3">
            <div class="col-md-6"><label class="form-label">${escapeHtml(groceryVariantLabel(typeName))}</label><input class="form-control edit-var-name" list="${rowId}-variant" value="${escapeHtml(variation.variant_name || '')}" placeholder="Select or type">${datalist(`${rowId}-variant`, rule.variantOptions)}</div>
            <div class="col-md-6"><label class="form-label">Size</label><select class="form-select edit-var-size-value">${optionList(rule.sizeOptions, formatMeasurementText(variation.size_value))}</select></div>
            <div class="col-md-6"><label class="form-label">Net Weight</label><div class="variation-pair"><input class="form-control edit-var-weight-value" list="${rowId}-weight" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(variation.weight_value))}" placeholder="155"><select class="form-select edit-var-weight-unit">${measurementUnitOptionList('Weight', variation.weight_unit || '')}</select></div>${datalist(`${rowId}-weight`, rule.weightValues)}</div>
            ${inventoryUnitField(variation)}
            <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
        </div>
        <div class="add-variant-purchasing">
            <h6 class="add-variant-subtitle">Packaging &amp; Price</h6>
            <div class="row g-3">
                <div class="col-md-6"><label class="form-label">Container Type</label><select class="form-select edit-var-package-type">${specificationChoiceOptionList(variation.package_type || '', ['can', 'bottle', 'box', 'pack', 'sachet', 'tube', 'jar', 'pouch'])}</select></div>
                <div class="col-md-6"><label class="form-label">Pack Content</label><div class="variation-pair"><input class="form-control edit-var-pack-content-qty" list="${rowId}-pack-content" type="number" min="0" step="1" value="${escapeHtml(formatMeasurementValue(variation.pack_content_qty))}" placeholder="12"><select class="form-select edit-var-pack-content-unit">${measurementUnitOptionList('Count', variation.pack_content_unit || '')}</select></div>${datalist(`${rowId}-pack-content`, rule.packContentValues)}</div>
                <div class="col-md-6"><label class="form-label">Price</label><input class="form-control edit-var-price" type="number" min="0" step=".01" value="${escapeHtml(variation.price ?? '')}" required></div>
            </div>
        </div>
    `;

    return `
        <div class="edit-variation-entry">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                <span class="fw-bold small text-muted">${escapeHtml(header)}</span>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-sm btn-outline-secondary btn-customize-specifications" type="button"><i class="fa-solid fa-gear me-1"></i>Customize Specifications</button>
                    <input class="form-check-input edit-var-default d-none" type="radio" name="${escapeHtml(defaultName)}" ${String(variation.is_default) === '1' ? 'checked' : ''}>
                    ${deleteButton}
                </div>
            </div>
            ${mode === 'add'
                ? (categoryName === 'Medicine' ? addMedicineFields : (categoryName === 'Medical Supplies' || categoryName === 'Medical Supply' ? addMedicalFields : addGroceryFields))
                : `<div class="row g-3">${categoryName === 'Medicine' ? medicineFields : (categoryName === 'Medical Supplies' || categoryName === 'Medical Supply' ? medicalFields : groceryFields)}</div>`}
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
    const existingSkuPrice = list.querySelector('.edit-variation-entry:first-child .edit-var-price');
    if (existingSkuPrice) {
        existingSkuPrice.required = false;
        existingSkuPrice.closest('.col-md-6')?.classList.add('d-none');
        const pricingHeading = existingSkuPrice.closest('.add-variant-purchasing')?.querySelector('.add-variant-subtitle');
        pricingHeading?.remove();
    }
}

function renderAddVariations(product = { variations: [{}] }, categoryName = '') {
    const list = document.getElementById('addVariationList');
    if (!list) return;
    const typeName = selectedAddTypeName();
    if (!getValue('productType')) {
        list.innerHTML = '<div class="dynamic-specification-empty">Select a Category and Product Type to configure sellable SKU details.</div>';
        return;
    }
    const variations = Array.isArray(product?.variations) && product.variations.length ? product.variations : [{}];
    list.innerHTML = variations.map((variation, index) => editVariationEntry(variation, categoryName || getSelectedAddCategoryName(), typeName, variations.length > 1 || index > 0, 'add')).join('');
    if (!list.querySelector('.edit-var-default:checked')) {
        list.querySelector('.edit-var-default')?.setAttribute('checked', 'checked');
    }
}

function collectVariationEntries(containerSelector) {
    return Array.from(document.querySelectorAll(`${containerSelector} .edit-variation-entry`)).map(entry => ({
        detail_schema: entry.querySelector('.specification-field') ? 'dynamic'
            : (entry.querySelector('.edit-var-generic-name') ? 'medicine'
                : (entry.querySelector('.edit-var-material, .edit-var-sterile-status') ? 'medical_supply' : 'grocery')),
        generic_name: entry.querySelector('.edit-var-generic-name')?.value.trim() || '',
        variant_name: entry.querySelector('.edit-var-name')?.value.trim() || '',
        strength_value: entry.querySelector('.edit-var-strength-value')?.value.trim() || '',
        strength_unit: entry.querySelector('.edit-var-strength-unit')?.value || '',
        net_content_value: entry.querySelector('.edit-var-net-content-value')?.value.trim() || '',
        net_content_unit: entry.querySelector('.edit-var-net-content-unit')?.value || '',
        dosage_form: entry.querySelector('.edit-var-dosage-form')?.value.trim() || '',
        size_value: entry.querySelector('.edit-var-size-value')?.value || '',
        weight_value: entry.querySelector('.edit-var-weight-value')?.value.trim() || '',
        weight_unit: entry.querySelector('.edit-var-weight-unit')?.value || '',
        package_type: entry.querySelector('.edit-var-package-type')?.value.trim() || '',
        pack_content_qty: entry.querySelector('.edit-var-pack-content-qty')?.value || '',
        pack_content_unit: entry.querySelector('.edit-var-pack-content-unit')?.value || '',
        material: entry.querySelector('.edit-var-material')?.value.trim() || '',
        sterile_status: entry.querySelector('.edit-var-sterile-status')?.value || '',
        inventory_unit_id: entry.querySelector('.edit-var-inventory-unit')?.value || '',
        price: entry.querySelector('.edit-var-price')?.value || '',
        barcode: entry.querySelector('.edit-var-barcode')?.value.trim() || '',
        is_default: entry.querySelector('.edit-var-default')?.checked ? 1 : 0,
        delete: entry.dataset.deleted === '1',
        specifications: Array.from(entry.querySelectorAll('.specification-field')).map(field => ({
            specification_id: field.dataset.specificationId || '',
            value_text: field.querySelector('.dynamic-spec-text')?.value.trim() || '',
            value_number: field.querySelector('.dynamic-spec-number')?.value.trim() || '',
            measurement_unit_id: field.querySelector('.dynamic-spec-unit')?.value === CUSTOMIZE_OPTION ? '' : (field.querySelector('.dynamic-spec-unit')?.value || '')
        }))
    }));
}

function collectEditVariations() {
    return collectVariationEntries('#editVariationList');
}

function collectAddVariations() {
    return collectVariationEntries('#addVariationList');
}

function productToVariation(product) {
    const inventoryUnit = {
        inventory_unit_id: product.inventory_unit_id || '',
        inventory_unit_name: product.inventory_unit_name || '',
        inventory_unit_symbol: product.inventory_unit_symbol || ''
    };
    if (isMedicine(product)) {
        return {
            ...inventoryUnit,
            generic_name: product.generic_name || '',
            variant_name: '',
            strength_value: formatMeasurementValue(product.medicine_strength_value ?? product.strength_value),
            strength_unit: product.strength_unit || '',
            dosage_form: product.dosage_form || '',
            net_content_value: formatMeasurementValue(product.net_content_value),
            net_content_unit: product.net_content_unit || '',
            package_type: product.package_type || product.medicine_package_type || '',
            price: product.price || '',
            barcode: product.barcode || '',
            is_default: 1
        };
    }

    if (['Medical Supply', 'Medical Supplies'].includes(product.category_name)) {
        return {
            ...inventoryUnit,
            variant_name: product.medical_variant || product.variant || '',
            size_value: formatMeasurementText(product.medical_size || product.size),
            material: product.material || '',
            sterile_status: product.sterile_status || '',
            package_type: product.medical_package_type || product.package_type || '',
            price: product.price || '',
            barcode: product.barcode || '',
            is_default: 1
        };
    }

    const [weightValue = '', weightUnit = ''] = String(product.net_weight ?? '').split(/\s+/, 2);
    const packMatch = String(product.pack_content || '').match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(.*)$/);
    return {
        ...inventoryUnit,
        variant_name: product.variant || '',
        size_value: formatMeasurementText(product.size),
        weight_value: formatMeasurementValue(weightValue),
        weight_unit: weightUnit,
        package_type: product.package_type || product.grocery_package_type || '',
        pack_content_qty: formatMeasurementValue(packMatch?.[1]),
        pack_content_unit: packMatch?.[2] || '',
        price: product.price || '',
        barcode: product.barcode || '',
        is_default: 1
    };
}

function legacySpecificationsForProduct(product) {
    const packMatch = String(product.pack_content || product.packaging_size || '').match(/^([0-9.]+)\s*(.*)$/);
    const unitId = (group, symbol) => productState.units.find(unit => unit.measurement_group === group && [unit.unit_symbol, unit.unit_name].some(value => String(value || '').toLowerCase() === String(symbol || '').toLowerCase()))?.measurement_unit_id || '';
    return productState.specifications.map(specification => {
        const name = String(specification.specification_name || '').toLowerCase();
        let valueText = '';
        let valueNumber = '';
        let symbol = '';
        if (['flavor', 'variant'].includes(name)) valueText = product.variant || product.variant_flavor || product.medical_variant || '';
        if (name === 'model') valueText = product.medical_variant || product.variant || '';
        if (name === 'material') valueText = product.material || '';
        if (name === 'sterile status') valueText = product.sterile_status || '';
        if (name === 'size') valueText = formatMeasurementText(product.size || product.medical_size);
        if (name === 'package type') valueText = product.package_type || product.medicine_package_type || product.grocery_package_type || product.medical_package_type || '';
        if (name === 'strength') { valueNumber = formatMeasurementValue(product.medicine_strength_value ?? product.strength_value); symbol = product.strength_unit || ''; }
        if (name === 'volume') { valueNumber = formatMeasurementValue(product.net_content_value ?? product.net_weight ?? product.weight_volume_value); symbol = product.net_content_unit || product.grocery_unit || product.weight_volume_unit || ''; }
        if (name === 'net weight') { valueNumber = formatMeasurementValue(product.net_weight ?? product.weight_volume_value); symbol = product.grocery_unit || product.weight_volume_unit || ''; }
        if (['pack content', 'tablet count'].includes(name)) { valueNumber = formatMeasurementValue(packMatch?.[1]); symbol = packMatch?.[2] || ''; }
        return {
            specification_id: specification.specification_id,
            value_text: valueText,
            value_number: valueNumber,
            measurement_unit_id: valueNumber ? unitId(specification.measurement_group, symbol) : ''
        };
    }).filter(value => value.value_text || value.value_number);
}

async function openCreateAnotherVariant(product) {
    const modalElement = document.getElementById('addProductModal');
    const form = document.getElementById('addProductForm');
    if (!modalElement || !form || !product) return;

    form.reset();
    form.dataset.prefillMode = 'variant';
    document.getElementById('productBrandName').value = product.brand_name || '';
    document.getElementById('productName').value = product.product_name || '';
    const categorySelect = document.getElementById('productCategory');
    const typeSelect = document.getElementById('productType');
    if (categorySelect) categorySelect.innerHTML = `<option value="${escapeHtml(product.category_id || '')}" data-category-name="${escapeHtml(product.category_name || '')}" selected>${escapeHtml(product.category_name || 'Current category')}</option>`;
    if (typeSelect) {
        typeSelect.innerHTML = `<option value="${escapeHtml(product.type_id || '')}" selected>${escapeHtml(product.type_name || 'Current product type')}</option>`;
        typeSelect.disabled = false;
    }

    const cachedConfiguration = referenceCache.configurationsByType.get(String(product.type_id || ''));
    if (cachedConfiguration) {
        applyProductConfiguration(product.type_id || '', cachedConfiguration);
        renderAddVariations({ variations: [{ price: product.price || '' }] }, product.category_name || '');
    } else {
        document.getElementById('addVariationList').innerHTML = '<div class="dynamic-specification-empty"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading Product Type specifications...</div>';
    }

    const editModal = document.getElementById('editProductModal');
    const showAddModal = () => bootstrap.Modal.getOrCreateInstance(modalElement).show();
    if (editModal?.classList.contains('show')) {
        editModal.addEventListener('hidden.bs.modal', showAddModal, { once: true });
        bootstrap.Modal.getOrCreateInstance(editModal).hide();
    } else {
        showAddModal();
    }

    try {
        await Promise.all([
            populateAddCategories(product.category_id || ''),
            populateAddTypes(product.category_id || '', product.type_id || ''),
            loadProductConfiguration(product.type_id || '')
        ]);
        renderAddVariations({ variations: [{ price: product.price || '' }] }, product.category_name || '');
        bootstrap.Modal.getInstance(modalElement)?.handleUpdate();
    } catch (error) {
        document.getElementById('addVariationList').innerHTML = `<div class="dynamic-specification-empty text-danger">${escapeHtml(error.message || 'Product Type specifications could not be loaded.')}</div>`;
    }
}

function editPricingContext() {
    const product = getProductById(getValue('editProductId')) || {};
    const pricing = product.pricing || {};
    const categoryId = getValue('editProductCategory') || product.category_id || '';
    const category = productState.categories.find(row => String(row.category_id) === String(categoryId)) || {};
    const basisValue = pricing.latest_cost_basis?.unit_cost;
    const cost = basisValue === null || basisValue === undefined || basisValue === '' ? null : Number(basisValue);
    return {
        product,
        pricing,
        category,
        cost: Number.isFinite(cost) ? cost : null,
        inventoryUnit: product.inventory_unit_name || product.inventory_unit_symbol || pricing.inventory_unit || 'unit',
        currentPrice: roundedCurrency(product.price ?? pricing.active_selling_price) ?? 0,
    };
}

function setPricingText(id, value, tone = '') {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = value;
    element.classList.toggle('is-positive', tone === 'positive');
    element.classList.toggle('is-negative', tone === 'negative');
}

function pricingDifferenceStatus(calculated, current) {
    if (calculated === null) return 'No accepted cost';
    const difference = roundedCurrency(calculated - current);
    return Math.abs(difference) < 0.005 ? 'Up to date' : 'Price differs';
}

function setPricingMethodStatus(label, tone = '') {
    const element = document.getElementById('editPricingMethodStatus');
    if (!element) return;
    element.textContent = label;
    element.classList.toggle('is-valid', tone === 'valid');
    element.classList.toggle('is-warning', tone === 'warning');
    element.classList.toggle('is-invalid', tone === 'invalid');
}

function resetEditPricingApplyState() {
    editPricingApplyRequested = false;
    const button = document.getElementById('btnApplyCalculatedPrice');
    if (button) {
        button.classList.remove('btn-success');
        button.classList.add('btn-outline-primary');
        button.innerHTML = '<i class="fa-solid fa-check me-1"></i>Apply Calculated Price';
    }
}

function updateEditPricingView({ preserveApply = false } = {}) {
    const method = getValue('editProductPricingMethod') || 'manual';
    const context = editPricingContext();
    const categoryMarkup = Number(context.category.effective_markup_percentage ?? context.pricing.category_markup_percentage ?? 0);
    const customMarkupText = getValue('editProductCustomMarkup');
    const customMarkup = customMarkupText === '' ? null : Number(customMarkupText);
    const activeMarkup = method === 'custom_markup' ? customMarkup : categoryMarkup;
    const calculated = context.cost === null || activeMarkup === null ? null : calculatedClientPrice(context.cost, activeMarkup);
    const difference = calculated === null ? null : roundedCurrency(calculated - context.currentPrice);
    const costLabel = context.cost === null ? 'No accepted delivery' : `${formatPrice(context.cost)} per ${context.inventoryUnit}`;
    const currentLabel = `${formatPrice(context.currentPrice)} per ${context.inventoryUnit}`;
    const calculatedLabel = calculated === null ? 'Not available' : `${formatPrice(calculated)} per ${context.inventoryUnit}`;

    document.getElementById('editCategoryPricingView')?.classList.toggle('d-none', method !== 'category_markup');
    document.getElementById('editCustomPricingView')?.classList.toggle('d-none', method !== 'custom_markup');
    document.getElementById('editManualPricingView')?.classList.toggle('d-none', method !== 'manual');
    const customInput = document.getElementById('editProductCustomMarkup');
    const manualInput = document.getElementById('editProductManualPrice');
    if (customInput) {
        customInput.required = method === 'custom_markup';
        customInput.disabled = method !== 'custom_markup';
    }
    if (manualInput) {
        manualInput.required = method === 'manual';
        manualInput.disabled = method !== 'manual';
    }

    setPricingText('editPricingCategory', context.category.category_name || context.product.category_name || 'Not available');
    setPricingText('editPricingCategoryMarkup', `${Number.isFinite(categoryMarkup) ? categoryMarkup.toFixed(2) : '0.00'}%`);
    setPricingText('editPricingMarkupSource', context.category.markup_source || context.pricing.category_markup_source || 'Category');
    setPricingText('editPricingCategoryCost', costLabel, context.cost === null ? 'negative' : '');
    setPricingText('editPricingCategoryCalculated', method === 'category_markup' ? calculatedLabel : 'Not available');
    setPricingText('editPricingCategoryCurrent', currentLabel);
    setPricingText('editPricingCategoryDifference', difference === null ? 'Not available' : signedPrice(difference), difference > 0 ? 'positive' : difference < 0 ? 'negative' : '');
    setPricingText('editPricingCategoryStatus', pricingDifferenceStatus(calculated, context.currentPrice));

    setPricingText('editPricingCustomCost', costLabel, context.cost === null ? 'negative' : '');
    setPricingText('editPricingCustomCalculated', method === 'custom_markup' ? calculatedLabel : 'Not available');
    setPricingText('editPricingCustomCurrent', currentLabel);
    setPricingText('editPricingCustomDifference', difference === null ? 'Not available' : signedPrice(difference), difference > 0 ? 'positive' : difference < 0 ? 'negative' : '');
    setPricingText('editPricingCustomStatus', customMarkup === null ? 'Enter a valid custom markup' : pricingDifferenceStatus(calculated, context.currentPrice));

    const manualPrice = Number(getValue('editProductManualPrice'));
    const gross = Number.isFinite(manualPrice) && context.cost !== null ? roundedCurrency(manualPrice - context.cost) : null;
    setPricingText('editPricingManualCost', costLabel, context.cost === null ? 'negative' : '');
    setPricingText('editPricingManualGross', gross === null ? 'Not available' : signedPrice(gross), gross > 0 ? 'positive' : gross < 0 ? 'negative' : '');
    setPricingText('editPricingManualCurrent', currentLabel);
    setPricingText('editPricingManualStatus', 'Manual price protected');

    if (method === 'manual') {
        setPricingMethodStatus('Manual price protected', 'valid');
    } else if (context.cost === null) {
        setPricingMethodStatus('No accepted cost', 'invalid');
    } else if (method === 'custom_markup' && (customMarkup === null || !Number.isFinite(customMarkup) || customMarkup < 0)) {
        setPricingMethodStatus('Enter custom markup', 'warning');
    } else if (calculated !== null && Math.abs(calculated - context.currentPrice) < 0.005) {
        setPricingMethodStatus('Up to date', 'valid');
    } else {
        setPricingMethodStatus('Price review needed', 'warning');
    }

    const applyButton = document.getElementById('btnApplyCalculatedPrice');
    if (applyButton) {
        applyButton.classList.toggle('d-none', method === 'manual');
        applyButton.disabled = calculated === null || !Number.isFinite(activeMarkup) || activeMarkup < 0;
    }
    if (!preserveApply) resetEditPricingApplyState();
    const note = document.getElementById('editPricingActionNote');
    if (note) note.textContent = method === 'manual'
        ? 'Category and supplier-cost changes will not overwrite this manual price.'
        : editPricingApplyRequested
            ? `The calculated price ${calculatedLabel} will become active when you save.`
            : 'Saving the pricing method preserves the active price unless you explicitly apply the calculation.';
}

async function openEditProduct(productId) {
    const product = getProductById(productId);
    const modalElement = document.getElementById('editProductModal');

    if (!product || !modalElement) return;

    document.getElementById('editProductId').value = product.product_id || '';
    document.getElementById('editProductBrand').value = product.brand_name || '';
    document.getElementById('editProductName').value = product.product_name || '';
    document.getElementById('editProductStatus').value = product.status || 'Active';
    document.getElementById('editProductPricingMethod').value = product.pricing_method || product.pricing?.pricing_method || 'manual';
    document.getElementById('editProductCustomMarkup').value = product.pricing?.custom_markup_percentage ?? '';
    document.getElementById('editProductManualPrice').value = roundedCurrency(product.price) ?? '';
    editPricingApplyRequested = false;
    const requestSequence = ++editProductRequestSequence;
    const form = document.getElementById('editProductForm');
    const saveButton = form?.querySelector('button[type="submit"]');
    if (saveButton) saveButton.disabled = true;
    const categorySelect = document.getElementById('editProductCategory');
    const typeSelect = document.getElementById('editProductType');
    if (categorySelect) {
        categorySelect.innerHTML = `<option value="${escapeHtml(product.category_id || '')}" data-category-name="${escapeHtml(product.category_name || '')}" selected>${escapeHtml(product.category_name || 'Current category')}</option>`;
    }
    if (typeSelect) {
        typeSelect.innerHTML = `<option value="${escapeHtml(product.type_id || '')}" selected>${escapeHtml(product.type_name || 'Current product type')}</option>`;
        typeSelect.disabled = false;
    }

    const cachedConfiguration = referenceCache.configurationsByType.get(String(product.type_id || ''));
    if (cachedConfiguration) {
        applyProductConfiguration(product.type_id || '', cachedConfiguration);
        const snapshotSpecifications = normalizeProductSpecificationValues(
            productState.specifications,
            Array.isArray(product.specifications) && product.specifications.length ? product.specifications : legacySpecificationsForProduct(product),
            productState.units
        );
        renderEditVariations({ ...product, variations: [{ ...productToVariation(product), specifications: snapshotSpecifications }] }, product.category_name || '');
    } else {
        const variationList = document.getElementById('editVariationList');
        if (variationList) variationList.innerHTML = '<div class="dynamic-specification-empty"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading Product Type specifications...</div>';
    }
    updateEditPricingView();

    try {
        const detailPromise = PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_product_details.php?product_id=${encodeURIComponent(product.product_id)}&t=${Date.now()}`, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store'
        });
        const [categoryResult, typeResult, configurationResult, detailResult] = await Promise.allSettled([
            populateEditCategories(product.category_id || ''),
            populateEditTypes(product.category_id || '', product.type_id || ''),
            loadProductConfiguration(product.type_id || ''),
            detailPromise
        ]);
        if (requestSequence !== editProductRequestSequence || getValue('editProductId') !== String(product.product_id || '')) return;
        const requiredFailure = [categoryResult, typeResult, configurationResult].find(result => result.status === 'rejected');
        if (requiredFailure) throw requiredFailure.reason;

        const details = detailResult.status === 'fulfilled' ? (detailResult.value?.data || {}) : {};
        if (detailResult.status === 'fulfilled') productDetailsCache.set(String(product.product_id), details);
        const hydratedProduct = { ...product, ...(details.product || {}) };
        const rawSavedSpecifications = Array.isArray(details.specifications) && details.specifications.length
            ? details.specifications
            : (Array.isArray(product.specifications) && product.specifications.length ? product.specifications : legacySpecificationsForProduct(hydratedProduct));
        const savedSpecifications = normalizeProductSpecificationValues(productState.specifications, rawSavedSpecifications, productState.units);
        toggleEditGenericField();
        renderEditVariations({ ...hydratedProduct, variations: [{ ...productToVariation(hydratedProduct), specifications: savedSpecifications }] }, product.category_name || '');
        updateEditPricingView();
        if (saveButton) saveButton.disabled = false;
        bootstrap.Modal.getOrCreateInstance(modalElement).show();
        bootstrap.Modal.getInstance(modalElement)?.handleUpdate();
    } catch (error) {
        const variationList = document.getElementById('editVariationList');
        if (variationList) variationList.innerHTML = `<div class="dynamic-specification-empty text-danger">${escapeHtml(error.message || 'Product Type specifications could not be loaded.')}</div>`;
        bootstrap.Modal.getOrCreateInstance(modalElement).show();
    }
}

async function submitEditProduct(event) {
    event.preventDefault();
    if (!validateVisibleProductFields(event.currentTarget)) return;

    const categorySelect = document.getElementById('editProductCategory');
    const categoryName = categorySelect?.selectedOptions?.[0]?.dataset.categoryName || '';
    const typeName = document.getElementById('editProductType')?.selectedOptions?.[0]?.textContent?.trim() || '';

    const pricingMethod = getValue('editProductPricingMethod') || 'manual';
    const payload = {
        product_id: getValue('editProductId'),
        brand_name: getValue('editProductBrand'),
        product_name: getValue('editProductName'),
        category_id: getValue('editProductCategory'),
        type_id: getValue('editProductType'),
        status: getValue('editProductStatus') || 'Active',
        pricing_method: pricingMethod,
        variations: collectEditVariations()
    };
    if (pricingMethod === 'custom_markup') payload.custom_markup_percentage = getValue('editProductCustomMarkup');
    if (pricingMethod === 'manual') payload.manual_selling_price = getValue('editProductManualPrice');
    if (pricingMethod !== 'manual' && editPricingApplyRequested) payload.apply_calculated_price = true;

    try {
        PharmaUtils.modal.loading('Updating Product...');
        const data = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/update_product.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const additionalVariations = payload.variations.slice(1).filter(variation => !variation.delete);
        if (additionalVariations.length) {
            await PharmaUtils.safeFetch(`${API_BASE_URL}/products/add_product.php`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brand_name: payload.brand_name,
                    product_name: payload.product_name,
                    category_id: payload.category_id,
                    type_id: payload.type_id,
                    pricing_method: payload.pricing_method,
                    custom_markup_percentage: payload.custom_markup_percentage,
                    status: payload.status,
                    variations: additionalVariations
                })
            });
        }

        const currentProduct = getProductById(payload.product_id) || {};
        const primaryVariation = payload.variations.find(variation => !variation.delete) || {};
        const savedPrice = primaryVariation.price || payload.manual_selling_price || currentProduct.price || 0;
        const savedSpecifications = normalizeProductSpecificationValues(
            productState.specifications,
            primaryVariation.specifications || currentProduct.specifications || [],
            productState.units
        );
        commitLocalProductChanges({
            ...currentProduct,
            product_id: payload.product_id,
            brand_name: payload.brand_name,
            product_name: payload.product_name,
            category_id: payload.category_id,
            category_name: categoryName || currentProduct.category_name,
            type_id: payload.type_id,
            type_name: typeName || currentProduct.type_name,
            status: payload.status,
            pricing_method: payload.pricing_method,
            custom_markup_percentage: payload.custom_markup_percentage ?? null,
            price: savedPrice,
            barcode: primaryVariation.barcode || currentProduct.barcode || '',
            specifications: savedSpecifications,
            variations: [primaryVariation],
            pricing: {
                ...(currentProduct.pricing || {}),
                pricing_method: payload.pricing_method,
                custom_markup_percentage: payload.custom_markup_percentage ?? null
            }
        });

        PharmaUtils.modal.close();
        bootstrap.Modal.getInstance(document.getElementById('editProductModal'))?.hide();
        invalidateProductDetails(payload.product_id);
        reconcileProductsInBackground();
        PharmaUtils.toast.success(data.message || 'Product updated successfully.');
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to update product', err.message);
    }
}

async function deleteProduct(productId) {
    const product = getProductById(productId);
    const nextStatus = (product?.status || 'Active') === 'Active' ? 'Inactive' : 'Active';
    const confirmed = await PharmaUtils.modal.confirm(
        nextStatus === 'Active' ? 'Reactivate Product?' : 'Deactivate Product?',
        nextStatus === 'Active'
            ? 'This product will become available in the POS and new purchase orders again. Existing inventory and history will remain unchanged.'
            : 'This product will no longer be available in the POS or new purchase orders. Existing stock, batches, and transaction history will remain available.',
        nextStatus === 'Active' ? 'Reactivate' : 'Deactivate Product'
    );

    if (!confirmed) return;

    try {
        PharmaUtils.modal.loading(`${nextStatus === 'Active' ? 'Activating' : 'Deactivating'} Product...`);
        const data = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/set_product_status.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, status: nextStatus })
        });

        PharmaUtils.modal.close();
        if (product) {
            product.status = data.product_status || nextStatus;
        }
        invalidateProductDetails(productId);
        renderProductCards();
        writeProductListCache(productState.products);
        PharmaUtils.toast.success(data.message || (nextStatus === 'Active'
            ? 'Product reactivated. Existing inventory and history were retained.'
            : 'Product deactivated. Existing inventory and history were retained.'));
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to change product status', err.message);
    }
}

function selectedPricingIds() {
    return Array.from(productState.selectedPricingProductIds);
}

function pricingMethodDisplay(method) {
    return { category_markup: 'Category markup', custom_markup: 'Custom markup', manual: 'Manual price' }[method] || 'Manual price';
}

function enrichSelectedPricingRow(row) {
    const product = getProductById(row.product_id) || {};
    return {
        ...row,
        barcode: product.barcode || row.product_id || '—',
        brand_name: product.brand_name || '—',
        product_name: product.product_name || row.product || '—',
        specification: formatProductSpecification(product, '—')
    };
}

function updateSelectedPricingPreviewSummary() {
    const selectedCount = selectedPricingEligibleProductIds.size;
    const eligibleCount = selectedPricingPreviewRows.filter(row => row.eligible_for_apply).length;
    const blockedCount = selectedPricingPreviewRows.length - eligibleCount;
    setPricingText('selectedPricingSelectedCount', String(selectedCount));
    setPricingText('selectedPricingEligibleCount', String(eligibleCount));
    setPricingText('selectedPricingBlockedCount', String(blockedCount));
    const summary = document.getElementById('selectedPricingPreviewSummary');
    if (summary) summary.textContent = `${selectedCount} eligible product${selectedCount === 1 ? '' : 's'} selected for application. ${blockedCount ? `${blockedCount} product${blockedCount === 1 ? '' : 's'} cannot be applied because pricing is current, cost is missing, or the product is inactive.` : 'All previewed products are eligible.'}`;
    const confirm = document.getElementById('btnConfirmSelectedPricing');
    if (confirm) confirm.disabled = selectedCount === 0 || selectedPricingSubmissionActive;
}

function renderSelectedPricingPreview() {
    const body = document.getElementById('selectedPricingPreviewBody');
    if (!body) return;
    const query = getValue('selectedPricingSearch').toLowerCase();
    const rows = selectedPricingPreviewRows.filter(row => !query || [row.barcode, row.brand_name, row.product_name, row.specification, row.category]
        .some(value => String(value || '').toLowerCase().includes(query)));
    body.innerHTML = rows.map(row => {
        const eligible = Boolean(row.eligible_for_apply);
        const checked = eligible && selectedPricingEligibleProductIds.has(String(row.product_id));
        return `<tr class="${eligible ? '' : 'is-ineligible'}">
            <td class="center-column"><input class="form-check-input bulk-pricing-select" type="checkbox" value="${escapeHtml(row.product_id)}" aria-label="Select ${escapeHtml(row.product_name)}" ${checked ? 'checked' : ''} ${eligible ? '' : 'disabled'}></td>
            <td class="text-column"><span class="identity-value" title="${escapeHtml(row.barcode)}">${escapeHtml(row.barcode)}</span></td>
            <td class="text-column"><span class="identity-value">${escapeHtml(row.brand_name)}</span></td>
            <td class="text-column"><span class="identity-value">${escapeHtml(row.product_name)}</span></td>
            <td class="text-column"><span class="specification-value">${escapeHtml(row.specification)}</span></td>
            <td class="text-column">${escapeHtml(row.category)}</td>
            <td class="text-column">${escapeHtml(pricingMethodDisplay(row.existing_pricing_method))}</td>
            <td class="numeric-column">${row.current_cost_basis === null ? '<span class="text-danger">No accepted cost</span>' : `${formatPrice(row.current_cost_basis)}<small class="d-block text-muted">per ${escapeHtml(row.inventory_unit)}</small>`}</td>
            <td class="numeric-column">${Number(row.applied_markup_percentage).toFixed(2)}%<small class="d-block text-muted">${escapeHtml(row.markup_source)}</small></td>
            <td class="numeric-column">${formatPrice(row.current_selling_price)}</td>
            <td class="numeric-column">${row.calculated_selling_price === null ? '—' : formatPrice(row.calculated_selling_price)}</td>
            <td class="numeric-column">${row.difference === null ? '—' : signedPrice(row.difference)}</td>
            <td class="center-column"><span class="bulk-pricing-status ${eligible ? 'is-ready' : 'is-blocked'}">${escapeHtml(row.eligibility_status || (eligible ? 'Ready' : 'Cannot apply'))}</span></td>
        </tr>`;
    }).join('') || '<tr><td colspan="13" class="text-center text-muted py-4">No preview products match this search.</td></tr>';
    updateSelectedPricingPreviewSummary();
}

async function previewSelectedCategoryPricing() {
    const productIds = selectedPricingIds();
    if (!productIds.length) return;
    try {
        PharmaUtils.modal.loading('Preparing Pricing Preview...');
        const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/apply_selected_category_pricing.php`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'preview', product_ids: productIds })
        });
        PharmaUtils.modal.close();
        selectedPricingPreviewRows = (response.products || []).map(enrichSelectedPricingRow);
        selectedPricingEligibleProductIds = new Set(selectedPricingPreviewRows.filter(row => row.eligible_for_apply).map(row => String(row.product_id)));
        const search = document.getElementById('selectedPricingSearch');
        if (search) search.value = '';
        renderSelectedPricingPreview();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('selectedPricingModal')).show();
    } catch (error) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Unable to preview pricing', error.message);
    }
}

async function applySelectedCategoryPricing() {
    const productIds = Array.from(selectedPricingEligibleProductIds);
    if (!productIds.length || selectedPricingSubmissionActive) return;
    const confirm = document.getElementById('btnConfirmSelectedPricing');
    try {
        selectedPricingSubmissionActive = true;
        if (confirm) {
            confirm.disabled = true;
            confirm.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Applying...';
        }
        PharmaUtils.modal.loading('Applying Category Markup...');
        const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/apply_selected_category_pricing.php`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'apply', product_ids: productIds })
        });
        PharmaUtils.modal.close();
        bootstrap.Modal.getInstance(document.getElementById('selectedPricingModal'))?.hide();
        invalidateProductDetails(productIds);
        exitPricingSelectionMode();
        invalidateProductListCache();
        await loadProductsTable({ skipCache: true });
        PharmaUtils.toast.success(response.message || 'Selected category pricing applied.');
    } catch (error) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Unable to apply pricing', error.message);
    } finally {
        selectedPricingSubmissionActive = false;
        if (confirm) confirm.innerHTML = 'Apply to Selected Products';
        updateSelectedPricingPreviewSummary();
    }
}

function initProductCards() {
    if (document.body.dataset.productCardsReady === '1') return;
    document.body.dataset.productCardsReady = '1';

    populateProductCardFilters();
    loadProductTypeFilter();

    ['productSearchInput', 'productTypeFilter', 'productStatusFilter', 'productPricingFilter', 'productSortSelect'].forEach(id => {
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
        const stock = document.getElementById('productStatusFilter');
        const pricing = document.getElementById('productPricingFilter');
        const sort = document.getElementById('productSortSelect');

        if (search) search.value = '';
        if (category) category.value = '';
        if (type) type.value = '';
        if (stock) stock.value = 'all';
        if (pricing) pricing.value = 'all';
        if (sort) sort.value = 'name-asc';
        loadProductTypeFilter();
        renderProductCards();
    });

    document.getElementById('table-products')?.addEventListener('click', (event) => {
        if (event.target.closest('.product-pricing-select')) {
            event.stopPropagation();
            return;
        }
        const viewButton = event.target.closest('.view-product-btn');
        const editButton = event.target.closest('.edit-product-btn');
        const deleteButton = event.target.closest('.delete-product-btn');
        const barcodeButton = event.target.closest('.product-barcode-toggle');
        const row = event.target.closest('.product-row');

        if (barcodeButton) {
            event.stopPropagation();
            openBarcodeModal(barcodeButton.dataset.productId);
            return;
        }

        if (viewButton) {
            event.stopPropagation();
            openProductDetailsModal(viewButton.dataset.productId);
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
    document.getElementById('table-products')?.addEventListener('change', event => {
        const checkbox = event.target.closest('.product-pricing-select');
        if (!checkbox) return;
        if (checkbox.checked) productState.selectedPricingProductIds.add(String(checkbox.value));
        else productState.selectedPricingProductIds.delete(String(checkbox.value));
        syncSelectedPricingControls();
    });
    document.getElementById('table-products')?.addEventListener('click', event => {
        if (event.target.closest('.retry-products-btn')) loadProductsTable();
    });
    document.getElementById('selectAllProductsForPricing')?.addEventListener('change', event => {
        document.querySelectorAll('.product-pricing-select').forEach(checkbox => {
            checkbox.checked = event.target.checked;
            if (checkbox.checked) productState.selectedPricingProductIds.add(String(checkbox.value));
            else productState.selectedPricingProductIds.delete(String(checkbox.value));
        });
        syncSelectedPricingControls();
    });
    document.getElementById('btnApplySelectedPricing')?.addEventListener('click', previewSelectedCategoryPricing);
    document.getElementById('btnManagePrices')?.addEventListener('click', enterPricingSelectionMode);
    document.getElementById('btnExitPricingSelection')?.addEventListener('click', exitPricingSelectionMode);
    document.getElementById('btnConfirmSelectedPricing')?.addEventListener('click', applySelectedCategoryPricing);
    document.getElementById('selectedPricingPreviewBody')?.addEventListener('change', event => {
        const checkbox = event.target.closest('.bulk-pricing-select');
        if (!checkbox || checkbox.disabled) return;
        if (checkbox.checked) selectedPricingEligibleProductIds.add(String(checkbox.value));
        else selectedPricingEligibleProductIds.delete(String(checkbox.value));
        updateSelectedPricingPreviewSummary();
    });
    document.getElementById('selectedPricingSearch')?.addEventListener('input', renderSelectedPricingPreview);
    document.getElementById('selectedPricingModal')?.addEventListener('shown.bs.modal', () => {
        renderSelectedPricingPreview();
        document.getElementById('selectedPricingSearch')?.focus({ preventScroll: true });
    });
    document.getElementById('selectedPricingModal')?.addEventListener('hidden.bs.modal', () => {
        exitPricingSelectionMode();
    });

    document.getElementById('productDetailsEditButton')?.addEventListener('click', () => {
        const productId = activeProductDetailsId;
        const detailsModal = document.getElementById('productDetailsModal');
        if (!productId || !detailsModal) return;

        detailsModal.addEventListener('hidden.bs.modal', () => openEditProduct(productId), { once: true });
        bootstrap.Modal.getOrCreateInstance(detailsModal).hide();
    });

    document.getElementById('productDetailsModal')?.addEventListener('shown.bs.modal', () => {
        document.getElementById('productDetailsModalTitle')?.focus({ preventScroll: true });
    });

    document.getElementById('productDetailsModal')?.addEventListener('hidden.bs.modal', () => {
        productDetailsAbortController?.abort();
        productDetailsAbortController = null;
        activeProductDetailsId = null;
        productDetailsRequestSequence += 1;
    });

    document.getElementById('productDetailsContent')?.addEventListener('click', event => {
        if (!event.target.closest('.retry-product-details-btn') || !activeProductDetailsId) return;
        openProductDetailsModal(activeProductDetailsId, { forceRefresh: true });
    });

    document.getElementById('editProductCategory')?.addEventListener('change', async (event) => {
        await populateEditTypes(event.target.value, '');
        toggleEditGenericField();
        const product = getProductById(getValue('editProductId'));
        const categoryName = event.target.selectedOptions?.[0]?.dataset.categoryName || '';
        renderEditVariations(product || { variations: [{}] }, categoryName);
        updateEditPricingView();
    });
    document.getElementById('editProductType')?.addEventListener('change', async (event) => {
        await loadProductConfiguration(event.target.value);
        const product = getProductById(getValue('editProductId'));
        const categoryName = document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
        renderEditVariations(product || { variations: collectEditVariations() }, categoryName);
    });
    document.getElementById('btnAddEditVariation')?.addEventListener('click', () => {
        const product = getProductById(getValue('editProductId'));
        if (!product) return;
        const variations = collectEditVariations().filter(variation => !variation.delete);
        variations.push({ price: product.price || '', is_default: 0 });
        const categoryName = document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || product.category_name || '';
        renderEditVariations({ ...product, variations }, categoryName);
    });
    document.getElementById('editVariationList')?.addEventListener('click', (event) => {
        if (event.target.closest('.btn-customize-specifications')) {
            openSpecificationCustomizer(true);
            return;
        }
        const removeButton = event.target.closest('.btn-remove-edit-variation');
        if (!removeButton) return;
        const entry = removeButton.closest('.edit-variation-entry');
        if (!entry) return;
        entry.remove();
        if (!document.querySelector('#editVariationList .edit-variation-entry:not(.d-none) .edit-var-default:checked')) {
            document.querySelector('#editVariationList .edit-variation-entry:not(.d-none) .edit-var-default')?.click();
        }
    });
    document.getElementById('editVariationList')?.addEventListener('change', (event) => {
        handleSellableSkuCustomization(event, true);
    });
    document.getElementById('editVariationList')?.addEventListener('focusin', rememberCustomizationValue);

    document.getElementById('editProductPricingMethod')?.addEventListener('change', () => updateEditPricingView());
    document.getElementById('editProductCustomMarkup')?.addEventListener('input', () => updateEditPricingView());
    document.getElementById('editProductManualPrice')?.addEventListener('input', () => updateEditPricingView({ preserveApply: true }));
    document.getElementById('btnApplyCalculatedPrice')?.addEventListener('click', () => {
        editPricingApplyRequested = true;
        const button = document.getElementById('btnApplyCalculatedPrice');
        if (button) {
            button.classList.remove('btn-outline-primary');
            button.classList.add('btn-success');
            button.innerHTML = '<i class="fa-solid fa-check-double me-1"></i>Calculated Price Selected';
        }
        updateEditPricingView({ preserveApply: true });
    });
    document.getElementById('editProductModal')?.addEventListener('shown.bs.modal', () => {
        updateEditPricingView({ preserveApply: true });
        const body = document.querySelector('#editProductModal .modal-body');
        if (body) body.scrollTop = 0;
    });
    document.getElementById('editProductModal')?.addEventListener('hidden.bs.modal', () => {
        editProductRequestSequence += 1;
        resetEditPricingApplyState();
    });

    document.getElementById('editProductForm')?.addEventListener('submit', submitEditProduct);
}

function showCustomizerError(id, message = '') {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('d-none', !message);
}

function showNestedModal(id) {
    const element = document.getElementById(id);
    if (!element) return;
    bootstrap.Modal.getOrCreateInstance(element, { backdrop: 'static', keyboard: true }).show();
}

function renderCustomizerRows(containerId, rows, labelKey, idKey, editClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = rows.length ? rows.map(row => `<div class="customizer-row"><span>${escapeHtml(row[labelKey])}</span><button class="btn btn-sm btn-outline-secondary ${editClass}" type="button" data-id="${escapeHtml(row[idKey])}" data-name="${escapeHtml(row[labelKey])}"><i class="fa-solid fa-pen"></i><span class="visually-hidden">Rename</span></button></div>`).join('') : '<div class="p-3 text-muted text-center">No values found.</div>';
}

async function openCategoryCustomizer() {
    showNestedModal('customizeCategoriesModal');
    await populateAddCategories(getValue('productCategory'));
    renderCustomizerRows('categoryCustomizerList', productState.categories, 'category_name', 'category_id', 'edit-category-option');
    document.getElementById('customCategoryId').value = '';
    document.getElementById('customCategoryName').value = '';
    showCustomizerError('customCategoryError');
}

async function openProductTypeCustomizer() {
    const categoryId = getValue('productCategory');
    if (!categoryId || categoryId === CUSTOMIZE_OPTION) {
        PharmaUtils.toast.error('Select a real Category first.');
        return;
    }
    showNestedModal('addProductTypeModal');
    const types = await cachedProductTypes(categoryId);
    renderCustomizerRows('productTypeCustomizerList', types, 'type_name', 'type_id', 'edit-product-type-option');
    document.getElementById('newProductTypeCategory').value = categoryId;
    document.getElementById('customProductTypeId').value = '';
    document.getElementById('newProductTypeName').value = '';
    document.getElementById('productTypeCustomizerCategory').textContent = categoryNameById(categoryId);
    showCustomizerError('customProductTypeError');
}

function renderSpecificationAssignments() {
    const assigned = new Set(productState.specifications.map(specification => String(specification.specification_id)));
    const container = document.getElementById('specificationAssignmentList');
    if (!container) return;
    container.innerHTML = productState.allSpecifications.length ? productState.allSpecifications.map(specification => {
        const pending = pendingSpecificationEdits.get(String(specification.specification_id));
        const displayName = pending?.display_name || specification.display_name || specification.specification_name;
        const style = pending?.field_style || specification.field_style;
        return `<div class="specification-assignment-row" data-specification-id="${escapeHtml(specification.specification_id)}">
            <input class="form-check-input specification-assignment m-0" type="checkbox" value="${escapeHtml(specification.specification_id)}" id="assign-${escapeHtml(specification.specification_id)}" ${assigned.has(String(specification.specification_id)) ? 'checked' : ''}>
            <label class="specification-assignment-name" for="assign-${escapeHtml(specification.specification_id)}" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</label>
            <span class="specification-assignment-style">${escapeHtml(style)}</span>
            <span class="specification-assignment-actions"><button class="btn btn-sm btn-outline-primary edit-specification-option" type="button" title="Edit ${escapeHtml(displayName)}" aria-label="Edit ${escapeHtml(displayName)}"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-danger delete-specification-option" type="button" title="Delete ${escapeHtml(displayName)}" aria-label="Delete ${escapeHtml(displayName)}"><i class="fa-solid fa-trash"></i></button></span>
        </div>`;
    }).join('') : '<div class="p-3 text-muted text-center">No specifications exist yet.</div>';
}

function specificationChoiceValues(listId) {
    return Array.from(document.querySelectorAll(`#${listId} .specification-choice-input`))
        .map(input => input.value.trim())
        .filter(Boolean);
}

function renderSpecificationChoiceList(listId, choices = [], disabled = false) {
    const list = document.getElementById(listId);
    if (!list) return;
    const values = Array.isArray(choices) ? choices.filter(value => String(value).trim()) : [];
    list.innerHTML = values.length ? values.map(value => `<div class="specification-choice-row"><input class="form-control specification-choice-input" value="${escapeHtml(value)}" ${disabled ? 'disabled' : ''} aria-label="Specification choice"><button class="btn btn-outline-danger remove-specification-choice" type="button" title="Remove choice" ${disabled ? 'disabled' : ''}><i class="fa-solid fa-xmark"></i></button></div>`).join('') : '<div class="specification-choice-empty">No choices yet. Use Add Choice.</div>';
}

function addSpecificationChoice(listId, value = '') {
    const list = document.getElementById(listId);
    if (!list) return;
    list.querySelector('.specification-choice-empty')?.remove();
    const row = document.createElement('div');
    row.className = 'specification-choice-row';
    row.innerHTML = `<input class="form-control specification-choice-input" value="${escapeHtml(value)}" aria-label="Specification choice"><button class="btn btn-outline-danger remove-specification-choice" type="button" title="Remove choice"><i class="fa-solid fa-xmark"></i></button>`;
    list.appendChild(row);
    row.querySelector('input')?.focus();
}

function configureSpecificationEditFields() {
    const style = getValue('editSpecificationStyle');
    document.getElementById('editSpecificationGroupWrap')?.classList.toggle('d-none', style !== 'Number with Unit');
    document.getElementById('editSpecificationChoicesWrap')?.classList.toggle('d-none', style !== 'Selection List');
}

function openSpecificationEditor(specificationId) {
    const specification = productState.allSpecifications.find(row => String(row.specification_id) === String(specificationId));
    if (!specification) return;
    const pending = pendingSpecificationEdits.get(String(specificationId)) || {};
    const canEditStructure = Boolean(specification.can_edit_structure);
    const canEditChoices = Boolean(specification.can_edit_choices);
    document.getElementById('editSpecificationId').value = specification.specification_id;
    document.getElementById('editSpecificationDisplayName').value = pending.display_name || specification.display_name || specification.specification_name;
    document.getElementById('editSpecificationStyle').value = pending.field_style || specification.field_style;
    document.getElementById('editSpecificationGroup').innerHTML = productState.measurementGroups.map(group => `<option ${group === (pending.measurement_group || specification.measurement_group) ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('');
    renderSpecificationChoiceList('editSpecificationChoiceList', pending.choices || specification.choices || [], !canEditChoices);
    document.getElementById('editSpecificationAllowCustom').checked = pending.allow_custom_value ?? specification.allow_custom_value ?? false;
    document.getElementById('editSpecificationStyle').disabled = !canEditStructure;
    document.getElementById('editSpecificationGroup').disabled = !canEditStructure;
    document.getElementById('editSpecificationAllowCustom').disabled = !canEditChoices;
    document.querySelector('[data-target="editSpecificationChoiceList"]')?.toggleAttribute('disabled', !canEditChoices);
    document.getElementById('editSpecificationScope').textContent = Number(specification.usage_count) > 1
        ? 'This is shared. Display Name applies to this Product Type; selection choices are shared wherever this specification is used.'
        : (Number(specification.value_count) > 0 ? 'The name can change, but structure remains protected because saved products use it.' : 'This specification is only used here, so its name and structure can be edited safely.');
    document.getElementById('newSpecificationEditor')?.classList.add('d-none');
    document.getElementById('editSpecificationEditor')?.classList.remove('d-none');
    configureSpecificationEditFields();
}

async function deleteSpecification(specificationId) {
    const specification = productState.allSpecifications.find(row => String(row.specification_id) === String(specificationId));
    if (!specification) return;
    const displayName = specification.display_name || specification.specification_name;
    const confirmation = await Swal.fire({
        icon: 'warning',
        title: 'Delete Specification?',
        text: `Are you sure you want to delete "${displayName}"?`,
        customClass: { container: 'product-specification-confirmation' },
        showCancelButton: true,
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#dc3545'
    });
    if (!confirmation.isConfirmed) return;

    const modal = document.getElementById('customizeSpecificationsModal');
    const editMode = modal?.dataset.editMode === '1';
    const typeId = getValue(editMode ? 'editProductType' : 'productType');
    const selectedAssignments = new Set(Array.from(document.querySelectorAll('.specification-assignment:checked')).map(input => String(input.value)));
    selectedAssignments.delete(String(specificationId));
    const preserved = editMode ? collectEditVariations() : collectAddVariations();
    const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/delete_product_specification.php`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specification_id: specificationId })
    });

    pendingSpecificationEdits.delete(String(specificationId));
    document.getElementById('editSpecificationEditor')?.classList.add('d-none');
    invalidateProductListCache();
    invalidateProductConfiguration(typeId);
    await loadProductConfiguration(typeId, { forceRefresh: true });
    renderSpecificationAssignments();
    selectedAssignments.forEach(id => {
        const input = document.getElementById(`assign-${id}`);
        if (input) input.checked = true;
    });
    if (editMode) {
        await loadProductsTable({ skipCache: true });
        renderEditVariations({ variations: preserved }, document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '');
    } else {
        renderAddVariations({ variations: preserved }, getSelectedAddCategoryName());
    }
    PharmaUtils.toast.success(response.message);
}

async function openSpecificationCustomizer(editMode = false, target = {}) {
    const typeId = getValue(editMode ? 'editProductType' : 'productType');
    if (!typeId) {
        PharmaUtils.toast.error('Select a Product Type first.');
        return;
    }
    document.getElementById('customizeSpecificationsModal').dataset.editMode = editMode ? '1' : '0';
    document.getElementById('specificationCustomizerContext').textContent = `${editMode ? selectedEditTypeName() : selectedAddTypeName()} · optional SKU fields`;
    pendingSpecificationEdits = new Map();
    const cachedConfiguration = referenceCache.configurationsByType.get(String(typeId));
    if (cachedConfiguration) {
        applyProductConfiguration(typeId, cachedConfiguration);
        renderSpecificationAssignments();
    } else {
        const assignments = document.getElementById('specificationAssignmentList');
        if (assignments) assignments.innerHTML = '<div class="p-3 text-muted text-center"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading specifications...</div>';
    }
    document.getElementById('newSpecificationEditor').classList.add('d-none');
    document.getElementById('editSpecificationEditor').classList.add('d-none');
    document.getElementById('newSpecificationName').value = '';
    document.getElementById('newSpecificationStyle').value = 'Text Entry';
    document.getElementById('measurementGroupEditor').classList.add('d-none');
    document.getElementById('selectionChoiceEditor').classList.add('d-none');
    renderSpecificationChoiceList('newSpecificationChoiceList');
    document.getElementById('newSpecificationAllowCustom').checked = true;
    showCustomizerError('customSpecificationError');
    showNestedModal('customizeSpecificationsModal');

    try {
        await loadProductConfiguration(typeId);
        const newGroupSelect = document.getElementById('newSpecificationGroup');
        if (newGroupSelect) newGroupSelect.innerHTML = productState.measurementGroups.map(group => `<option>${escapeHtml(group)}</option>`).join('');
        renderSpecificationAssignments();
    } catch (error) {
        showCustomizerError('customSpecificationError', error.message || 'Specifications could not be loaded.');
        return;
    }

    const aliases = {
        'container type': 'package type',
        'variant / description': 'variant',
        'liquid content': 'volume',
        'net content': 'volume'
    };
    const requestedLabel = String(target.label || '').trim().toLowerCase();
    const requestedName = aliases[requestedLabel] || requestedLabel;
    const targetSpecification = productState.allSpecifications.find(specification =>
        (target.specificationId && String(specification.specification_id) === String(target.specificationId))
        || String(specification.specification_name || '').trim().toLowerCase() === requestedName
        || String(specification.display_name || '').trim().toLowerCase() === requestedLabel
    );
    if (targetSpecification) {
        const assignment = document.getElementById(`assign-${targetSpecification.specification_id}`);
        if (assignment) assignment.checked = true;
        openSpecificationEditor(targetSpecification.specification_id);
    }
}

function applyMeasurementUnitListSearch() {
    renderMeasurementUnits();
}

function renderMeasurementUnits(group = document.getElementById('measurementUnitGroupFilter')?.value || '') {
    const query = String(document.getElementById('measurementUnitSearch')?.value || '').trim().toLowerCase();
    const activeUnits = productState.units.filter(unit => Number(unit.is_active ?? 1) === 1);
    const units = activeUnits.filter(unit => {
        if (group && String(unit.measurement_group).toLowerCase() !== String(group).toLowerCase()) return false;
        return !query || [unit.unit_name, unit.unit_symbol, unit.measurement_group]
            .some(value => String(value || '').toLowerCase().includes(query));
    });
    const activeCustomIds = new Set(activeUnits.filter(unit => Number(unit.is_system ?? 1) === 0).map(unit => String(unit.measurement_unit_id)));
    [...selectedMeasurementUnitIds].forEach(id => { if (!activeCustomIds.has(id)) selectedMeasurementUnitIds.delete(id); });
    const container = document.getElementById('measurementUnitCustomizerList');
    if (container) {
        const rows = units.length ? units.map(unit => {
            const id = String(unit.measurement_unit_id);
            const isProtected = Number(unit.is_system ?? 1) === 1;
            return `
            <div class="customizer-row measurement-unit-row" data-id="${escapeHtml(id)}">
                <input class="form-check-input measurement-unit-checkbox" type="checkbox" value="${escapeHtml(id)}" ${isProtected ? 'disabled title="Protected system unit"' : ''} ${selectedMeasurementUnitIds.has(id) ? 'checked' : ''} aria-label="Select ${escapeHtml(unit.unit_name)}">
                <span class="measurement-unit-name">${escapeHtml(`${unit.unit_name} (${unit.unit_symbol || unit.unit_name})`)}</span>
                <span class="measurement-unit-group">${escapeHtml(unit.measurement_group)}</span>
                <div class="measurement-unit-actions">
                     <button class="btn btn-sm btn-outline-primary select-measurement-unit-option" type="button" data-id="${escapeHtml(unit.measurement_unit_id)}"><i class="fa-solid fa-check me-1"></i>Select</button>
                     <button class="btn btn-sm btn-outline-secondary edit-measurement-unit-option" type="button" data-id="${escapeHtml(unit.measurement_unit_id)}" aria-label="Edit ${escapeHtml(unit.unit_name)}"><i class="fa-solid fa-pen me-1"></i>Edit</button>
                    ${isProtected ? '<span class="measurement-unit-protected">Protected</span>' : `<button class="btn btn-sm btn-outline-danger delete-measurement-unit-option" type="button" data-id="${escapeHtml(unit.measurement_unit_id)}" aria-label="Remove ${escapeHtml(unit.unit_name)}"><i class="fa-solid fa-trash me-1"></i>Delete</button>`}
                </div>
            </div>`;
        }).join('') : '<div class="p-3 text-muted text-center">No values found.</div>';
        container.innerHTML = `<div class="measurement-unit-table-header">
            <label><input class="form-check-input" id="measurementUnitSelectAll" type="checkbox"> <span>Select All</span></label>
            <span>Unit</span><span>Group</span><span>Actions</span>
        </div>${rows}`;
    }
    const visibleDeletableIds = units.filter(unit => Number(unit.is_system ?? 1) === 0).map(unit => String(unit.measurement_unit_id));
    const selectedVisible = visibleDeletableIds.filter(id => selectedMeasurementUnitIds.has(id)).length;
    const selectAll = document.getElementById('measurementUnitSelectAll');
    if (selectAll) {
        selectAll.disabled = visibleDeletableIds.length === 0;
        selectAll.checked = visibleDeletableIds.length > 0 && selectedVisible === visibleDeletableIds.length;
        selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleDeletableIds.length;
        selectAll.dataset.visibleIds = JSON.stringify(visibleDeletableIds);
    }
    const bulkButton = document.getElementById('btnDeleteSelectedMeasurementUnits');
    if (bulkButton) {
        bulkButton.classList.toggle('d-none', selectedMeasurementUnitIds.size === 0);
        bulkButton.disabled = selectedMeasurementUnitIds.size === 0;
        bulkButton.innerHTML = `<i class="fa-solid fa-trash me-1"></i>Delete Selected (${selectedMeasurementUnitIds.size})`;
    }
}

function updateClearableInput(input) {
    input?.closest('.clearable-input')?.classList.toggle('has-value', Boolean(input.value));
}

async function openMeasurementUnitCustomizer(group = '', sourceSelect = null) {
    await loadProductConfiguration(productState.configurationTypeId || getValue('productType') || getValue('editProductType'));
    const groupSelect = document.getElementById('newMeasurementUnitGroup');
    groupSelect.innerHTML = productState.measurementGroups.map(value => `<option ${value === group ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
    if (!groupSelect.value && productState.measurementGroups.length) groupSelect.value = productState.measurementGroups[0];
    const filterSelect = document.getElementById('measurementUnitGroupFilter');
    filterSelect.innerHTML = `<option value="">All Measurement Groups</option>${productState.measurementGroups.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
    filterSelect.value = '';
    document.getElementById('addMeasurementUnitModal').dataset.sourceGroup = group;
    document.getElementById('addMeasurementUnitModal')._sourceSelect = sourceSelect;
    document.getElementById('customMeasurementUnitId').value = '';
    document.getElementById('newMeasurementUnitName').value = '';
    document.getElementById('newMeasurementUnitSymbol').value = '';
    document.getElementById('measurementUnitSearch').value = '';
    selectedMeasurementUnitIds.clear();
    ['measurementUnitSearch', 'newMeasurementUnitName', 'newMeasurementUnitSymbol'].forEach(id => updateClearableInput(document.getElementById(id)));
    renderMeasurementUnits('');
    showCustomizerError('customMeasurementUnitError');
    showNestedModal('addMeasurementUnitModal');
}

async function removeMeasurementUnits(units, { bulk = false } = {}) {
    const removable = (Array.isArray(units) ? units : []).filter(unit => Number(unit.is_system ?? 1) === 0);
    if (!removable.length) return;
    const confirmation = await Swal.fire({
        icon: 'warning',
        title: bulk ? `Remove ${removable.length} selected measurement units?` : `Remove ${removable[0].unit_name}?`,
        text: bulk
            ? `Remove ${removable.length} selected measurement units from future selection? Existing products using these units will keep their saved values.`
            : 'This unit will no longer appear for new selections. Existing products using it will keep their saved value.',
        showCancelButton: true,
        confirmButtonText: bulk ? 'Remove Selected' : 'Remove from available units',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#dc3545'
    });
    if (!confirmation.isConfirmed) return;

    const modal = document.getElementById('addMeasurementUnitModal');
    const sourceSelect = modal?._sourceSelect;
    const addContainer = sourceSelect?.closest('#addVariationList');
    const editContainer = sourceSelect?.closest('#editVariationList');
    const preserved = addContainer ? collectAddVariations() : (editContainer ? collectEditVariations() : []);
    const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/delete_measurement_unit.php`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ measurement_unit_ids: removable.map(unit => unit.measurement_unit_id) })
    });
    (response.units || removable).forEach(unit => {
        archiveMeasurementUnit(unit.measurement_unit_id);
        selectedMeasurementUnitIds.delete(String(unit.measurement_unit_id));
    });
    if (addContainer) renderAddVariations({ variations: preserved }, getSelectedAddCategoryName());
    if (editContainer) renderEditVariations({ variations: preserved }, document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '');
    renderMeasurementUnits();
    PharmaUtils.toast.success(response.message);
}

async function previewCategoryPricingImpact() {
    const categoryId = getValue('customCategoryId');
    const markup = getValue('customCategoryMarkup');
    const wrap = document.getElementById('categoryPricingImpactWrap');
    const body = document.getElementById('categoryPricingImpactBody');
    const summary = document.getElementById('categoryPricingImpactSummary');
    if (!categoryId) {
        if (summary) summary.textContent = 'Save the new category before previewing product impact.';
        wrap?.classList.add('d-none');
        return { products: [], active_product_count: 0, applicable_product_count: 0 };
    }
    const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_category_pricing_impact.php?category_id=${encodeURIComponent(categoryId)}&markup_percentage=${encodeURIComponent(markup)}`, { method: 'GET', credentials: 'include' });
    if (summary) summary.textContent = `${response.active_product_count} active products reviewed; ${response.applicable_product_count} category-priced products can be applied. Manual prices remain protected.`;
    if (body) body.innerHTML = (response.products || []).map(row => `<tr><td>${escapeHtml(row.product)}</td><td>${row.current_cost_basis === null ? 'No accepted cost' : formatPrice(row.current_cost_basis)}</td><td>${Number(row.previous_markup).toFixed(2)}%</td><td>${Number(row.new_markup).toFixed(2)}%</td><td>${formatPrice(row.current_selling_price)}</td><td>${row.new_selling_price === null ? '—' : formatPrice(row.new_selling_price)}</td><td>${row.difference === null ? '—' : formatPrice(row.difference)}</td></tr>`).join('') || '<tr><td colspan="7" class="text-center text-muted">No active products in this category.</td></tr>';
    wrap?.classList.remove('d-none');
    return response;
}

function initProductCustomizers() {
    if (document.body.dataset.productCustomizersReady === '1') return;
    document.body.dataset.productCustomizersReady = '1';

    document.querySelectorAll('.product-customizer-modal').forEach(modal => {
        modal.addEventListener('shown.bs.modal', () => document.querySelectorAll('.modal-backdrop').item(document.querySelectorAll('.modal-backdrop').length - 1)?.classList.add('product-customizer-backdrop'));
    });
    document.addEventListener('input', event => {
        const search = event.target.closest('.customizer-search');
        if (!search) return;
        updateClearableInput(search);
        if (search.id === 'measurementUnitSearch') {
            applyMeasurementUnitListSearch();
            return;
        }
        const query = search.value.trim().toLowerCase();
        document.getElementById(search.dataset.target)?.querySelectorAll('.customizer-row, .form-check, .specification-assignment-row').forEach(row => {
            row.classList.toggle('d-none', query && !row.textContent.toLowerCase().includes(query));
        });
    });
    document.getElementById('addMeasurementUnitModal')?.addEventListener('input', event => {
        if (event.target.matches('#newMeasurementUnitName,#newMeasurementUnitSymbol')) updateClearableInput(event.target);
    });
    document.getElementById('addMeasurementUnitModal')?.addEventListener('click', event => {
        const button = event.target.closest('[data-clear-input]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const input = document.getElementById(button.dataset.clearInput);
        if (!input) return;
        input.value = '';
        updateClearableInput(input);
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.focus();
    });
    document.getElementById('categoryCustomizerList')?.addEventListener('click', event => {
        const button = event.target.closest('.edit-category-option');
        if (!button) return;
        document.getElementById('customCategoryId').value = button.dataset.id;
        document.getElementById('customCategoryName').value = button.dataset.name;
        const category = productState.categories.find(row => String(row.category_id) === String(button.dataset.id)) || {};
        document.getElementById('customCategoryMarkup').value = category.default_markup_percentage ?? 0;
        document.getElementById('customCategoryPricingBehavior').value = category.pricing_behavior || 'review_required';
        document.getElementById('categoryPricingImpactWrap')?.classList.add('d-none');
        document.getElementById('categoryPricingImpactSummary').textContent = '';
    });
    document.getElementById('btnPreviewCategoryPricing')?.addEventListener('click', async () => {
        try { await previewCategoryPricingImpact(); } catch (error) { showCustomizerError('customCategoryError', error.message); }
    });
    document.getElementById('categoryCustomizerForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const behavior = getValue('customCategoryPricingBehavior') || 'review_required';
            const impact = await previewCategoryPricingImpact();
            let applyPrices = false;
            if (behavior === 'automatic' && impact.applicable_product_count > 0) {
                const confirmation = await Swal.fire({ icon: 'question', title: 'Apply calculated selling prices?', text: `${impact.applicable_product_count} category-priced products can be updated. Manual prices will not change.`, showCancelButton: true, confirmButtonText: 'Save and apply', cancelButtonText: 'Save settings only' });
                applyPrices = confirmation.isConfirmed;
            }
            const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/save_category.php`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category_id: getValue('customCategoryId'), category_name: getValue('customCategoryName'), default_markup_percentage: getValue('customCategoryMarkup'), pricing_behavior: behavior, apply_prices: applyPrices }) });
            productDetailsCache.clear();
            invalidateProductListCache();
            referenceCache.categories = null;
            referenceCache.typesByCategory.clear();
            if (applyPrices) await loadProductsTable({ skipCache: true });
            await populateAddCategories(response.category.category_id);
            document.getElementById('productCategory').dataset.previousValue = response.category.category_id;
            await populateAddTypes(response.category.category_id, '');
            renderCustomizerRows('categoryCustomizerList', productState.categories, 'category_name', 'category_id', 'edit-category-option');
            document.getElementById('customCategoryId').value = '';
            document.getElementById('customCategoryName').value = '';
            document.getElementById('customCategoryMarkup').value = '0';
            document.getElementById('customCategoryPricingBehavior').value = 'review_required';
            document.getElementById('categoryPricingImpactWrap')?.classList.add('d-none');
            PharmaUtils.toast.success(response.message);
        } catch (error) { showCustomizerError('customCategoryError', error.message); }
    });
    document.getElementById('productTypeCustomizerList')?.addEventListener('click', event => {
        const button = event.target.closest('.edit-product-type-option');
        if (!button) return;
        document.getElementById('customProductTypeId').value = button.dataset.id;
        document.getElementById('newProductTypeName').value = button.dataset.name;
    });
    document.getElementById('addProductTypeForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const categoryId = getValue('newProductTypeCategory');
            const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/add_product_type.php`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type_id: getValue('customProductTypeId'), category_id: categoryId, type_name: getValue('newProductTypeName') }) });
            referenceCache.typesByCategory.delete(String(categoryId));
            invalidateProductConfiguration(response.type.type_id);
            await populateAddTypes(categoryId, response.type.type_id);
            document.getElementById('productType').dataset.previousValue = response.type.type_id;
            await loadProductConfiguration(response.type.type_id);
            renderAddVariations({ variations: collectAddVariations() }, getSelectedAddCategoryName());
            await openProductTypeCustomizer();
            PharmaUtils.toast.success(response.message);
        } catch (error) { showCustomizerError('customProductTypeError', error.message); }
    });
    document.getElementById('btnAddSpecification')?.addEventListener('click', () => {
        document.getElementById('editSpecificationEditor')?.classList.add('d-none');
        document.getElementById('newSpecificationEditor').classList.toggle('d-none');
        renderSpecificationChoiceList('newSpecificationChoiceList');
    });
    document.getElementById('customizeSpecificationsModal')?.addEventListener('click', event => {
        const addButton = event.target.closest('.add-specification-choice');
        if (addButton && !addButton.disabled) addSpecificationChoice(addButton.dataset.target);
        const removeButton = event.target.closest('.remove-specification-choice');
        if (removeButton && !removeButton.disabled) {
            const list = removeButton.closest('.specification-choice-list');
            removeButton.closest('.specification-choice-row')?.remove();
            if (list && !list.querySelector('.specification-choice-row')) renderSpecificationChoiceList(list.id);
        }
    });
    document.getElementById('customizeSpecificationsModal')?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || !event.target.matches('.specification-choice-input')) return;
        event.preventDefault();
        addSpecificationChoice(event.target.closest('.specification-choice-list').id);
    });
    document.getElementById('specificationAssignmentList')?.addEventListener('click', event => {
        const row = event.target.closest('.specification-assignment-row');
        if (!row) return;
        if (event.target.closest('.edit-specification-option')) openSpecificationEditor(row.dataset.specificationId);
        if (event.target.closest('.delete-specification-option')) {
            deleteSpecification(row.dataset.specificationId).catch(error => {
                showCustomizerError('customSpecificationError', error.message);
                Swal.fire({ icon: 'error', title: 'Specification Not Deleted', text: error.message, confirmButtonText: 'OK', customClass: { container: 'product-specification-confirmation' } });
            });
        }
    });
    document.getElementById('editSpecificationStyle')?.addEventListener('change', configureSpecificationEditFields);
    document.getElementById('btnApplySpecificationEdit')?.addEventListener('click', () => {
        const specificationId = getValue('editSpecificationId');
        const displayName = getValue('editSpecificationDisplayName');
        if (!specificationId || !displayName) {
            showCustomizerError('customSpecificationError', 'Display Name is required.');
            return;
        }
        const checkedAssignments = new Set(Array.from(document.querySelectorAll('.specification-assignment:checked')).map(input => input.value));
        pendingSpecificationEdits.set(String(specificationId), {
            specification_id: specificationId,
            display_name: displayName,
            field_style: getValue('editSpecificationStyle'),
            measurement_group: getValue('editSpecificationGroup'),
            choices: specificationChoiceValues('editSpecificationChoiceList'),
            allow_custom_value: document.getElementById('editSpecificationAllowCustom').checked
        });
        document.getElementById('editSpecificationEditor')?.classList.add('d-none');
        renderSpecificationAssignments();
        checkedAssignments.forEach(id => { const input = document.getElementById(`assign-${id}`); if (input) input.checked = true; });
    });
    document.getElementById('newSpecificationStyle')?.addEventListener('change', event => {
        document.getElementById('measurementGroupEditor').classList.toggle('d-none', event.target.value !== 'Number with Unit');
        document.getElementById('selectionChoiceEditor').classList.toggle('d-none', event.target.value !== 'Selection List');
        if (event.target.value === 'Selection List' && !document.querySelector('#newSpecificationChoiceList .specification-choice-row')) addSpecificationChoice('newSpecificationChoiceList');
    });
    document.getElementById('btnSaveSpecifications')?.addEventListener('click', async () => {
        const modal = document.getElementById('customizeSpecificationsModal');
        const editMode = modal.dataset.editMode === '1';
        const typeId = getValue(editMode ? 'editProductType' : 'productType');
        const assignments = Array.from(document.querySelectorAll('.specification-assignment:checked')).map(input => input.value);
        const adding = !document.getElementById('newSpecificationEditor').classList.contains('d-none') && getValue('newSpecificationName');
        const newSpecification = adding ? { specification_name: getValue('newSpecificationName'), field_style: getValue('newSpecificationStyle'), measurement_group: getValue('newSpecificationGroup'), choices: specificationChoiceValues('newSpecificationChoiceList'), allow_custom_value: document.getElementById('newSpecificationAllowCustom').checked } : null;
        const preserved = editMode ? collectEditVariations() : collectAddVariations();
        try {
            const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/save_product_configuration.php`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type_id: typeId, assignments, new_specification: newSpecification, specification_edits: Array.from(pendingSpecificationEdits.values()) }) });
            invalidateProductListCache();
            if (editMode) await loadProductsTable({ skipCache: true });
            invalidateProductConfiguration(typeId);
            await loadProductConfiguration(typeId, { forceRefresh: true });
            if (editMode) renderEditVariations({ variations: preserved }, document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '');
            else renderAddVariations({ variations: preserved }, getSelectedAddCategoryName());
            bootstrap.Modal.getInstance(modal)?.hide();
            PharmaUtils.toast.success(response.message);
        } catch (error) { showCustomizerError('customSpecificationError', error.message); }
    });
    document.getElementById('measurementUnitCustomizerList')?.addEventListener('click', async event => {
        const selectButton = event.target.closest('.select-measurement-unit-option');
        if (selectButton) {
            const modal = document.getElementById('addMeasurementUnitModal');
            const sourceSelect = modal?._sourceSelect;
            if (sourceSelect) {
                sourceSelect.value = selectButton.dataset.id;
                sourceSelect.dataset.previousValue = selectButton.dataset.id;
                sourceSelect.dispatchEvent(new Event('change', { bubbles:true }));
                bootstrap.Modal.getInstance(modal)?.hide();
                sourceSelect.focus();
                return;
            }
        }
        const deleteButton = event.target.closest('.delete-measurement-unit-option');
        if (deleteButton) {
            const unit = productState.units.find(item => String(item.measurement_unit_id) === String(deleteButton.dataset.id));
            if (!unit) return;
            try {
                await removeMeasurementUnits([unit]);
            } catch (error) {
                showCustomizerError('customMeasurementUnitError', error.message);
            }
            return;
        }
        const button = event.target.closest('.edit-measurement-unit-option');
        if (!button) return;
        const unit = productState.units.find(item => String(item.measurement_unit_id) === String(button.dataset.id));
        if (!unit) return;
        document.getElementById('customMeasurementUnitId').value = unit.measurement_unit_id;
        document.getElementById('newMeasurementUnitName').value = unit.unit_name;
        document.getElementById('newMeasurementUnitSymbol').value = unit.unit_symbol || unit.unit_name;
        document.getElementById('newMeasurementUnitGroup').value = unit.measurement_group;
        updateClearableInput(document.getElementById('newMeasurementUnitName'));
        updateClearableInput(document.getElementById('newMeasurementUnitSymbol'));
    });
    document.getElementById('measurementUnitCustomizerList')?.addEventListener('change', event => {
        if (event.target.id === 'measurementUnitSelectAll') {
            const visibleIds = JSON.parse(event.target.dataset.visibleIds || '[]');
            visibleIds.forEach(id => event.target.checked ? selectedMeasurementUnitIds.add(String(id)) : selectedMeasurementUnitIds.delete(String(id)));
            renderMeasurementUnits();
            return;
        }
        const checkbox = event.target.closest('.measurement-unit-checkbox');
        if (!checkbox || checkbox.disabled) return;
        if (checkbox.checked) selectedMeasurementUnitIds.add(String(checkbox.value));
        else selectedMeasurementUnitIds.delete(String(checkbox.value));
        renderMeasurementUnits();
    });
    document.getElementById('btnDeleteSelectedMeasurementUnits')?.addEventListener('click', async () => {
        const units = productState.units.filter(unit => selectedMeasurementUnitIds.has(String(unit.measurement_unit_id)));
        try {
            await removeMeasurementUnits(units, { bulk: true });
        } catch (error) {
            showCustomizerError('customMeasurementUnitError', error.message);
        }
    });
    document.getElementById('addMeasurementUnitForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const modal = document.getElementById('addMeasurementUnitModal');
        const sourceSelect = modal._sourceSelect;
        const addContainer = sourceSelect?.closest('#addVariationList');
        const editContainer = sourceSelect?.closest('#editVariationList');
        const preserved = addContainer ? collectAddVariations() : (editContainer ? collectEditVariations() : []);
        const sourceEntryIndex = sourceSelect ? Array.from(sourceSelect.closest(addContainer ? '#addVariationList' : '#editVariationList').querySelectorAll('.edit-variation-entry')).indexOf(sourceSelect.closest('.edit-variation-entry')) : -1;
        const specificationId = sourceSelect?.closest('.specification-field')?.dataset.specificationId || '';
        try {
            const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/add_measurement_unit.php`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ measurement_unit_id: getValue('customMeasurementUnitId'), unit_name: getValue('newMeasurementUnitName'), unit_symbol: getValue('newMeasurementUnitSymbol'), measurement_group: getValue('newMeasurementUnitGroup') }) });
            upsertMeasurementUnit(response.unit);
            if (sourceEntryIndex >= 0) {
                if (sourceSelect?.matches('.edit-var-inventory-unit')) {
                    preserved[sourceEntryIndex].inventory_unit_id = response.unit.measurement_unit_id;
                    preserved[sourceEntryIndex].inventory_unit_name = response.unit.unit_name;
                    preserved[sourceEntryIndex].inventory_unit_symbol = response.unit.unit_symbol;
                } else {
                    const value = preserved[sourceEntryIndex]?.specifications?.find(item => item.specification_id === specificationId);
                    if (value) value.measurement_unit_id = response.unit.measurement_unit_id;
                }
            }
            if (addContainer) renderAddVariations({ variations: preserved }, getSelectedAddCategoryName());
            if (editContainer) renderEditVariations({ variations: preserved }, document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '');
            renderMeasurementUnits();
            document.getElementById('customMeasurementUnitId').value = '';
            document.getElementById('newMeasurementUnitName').value = '';
            document.getElementById('newMeasurementUnitSymbol').value = '';
            updateClearableInput(document.getElementById('newMeasurementUnitName'));
            updateClearableInput(document.getElementById('newMeasurementUnitSymbol'));
            PharmaUtils.toast.success(response.message);
        } catch (error) { showCustomizerError('customMeasurementUnitError', error.message); }
    });
    document.getElementById('measurementUnitGroupFilter')?.addEventListener('change', event => renderMeasurementUnits(event.target.value));
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

export { initAddProductForm, initProductCards, loadProductsTable, loadInventoryTable };
export default initAddProductForm;

// Populate suppliers when add product modal opens
const _addProductModalEl = document.getElementById('addProductModal');
if (_addProductModalEl) {
    _addProductModalEl.addEventListener('show.bs.modal', () => {
        clearProductFormValidation(document.getElementById('addProductForm'));
        populateSupplierDropdown();
        const prefilledVariant = document.getElementById('addProductForm')?.dataset.prefillMode === 'variant';
        if (prefilledVariant) return;
        populateAddCategories();
        const typeSelect = document.getElementById('productType');
        if (typeSelect) {
            typeSelect.disabled = true;
            typeSelect.innerHTML = '<option value="" disabled selected>Select category first...</option>';
        }
        renderAddVariations();
        updateAddPricingMethodView();
    });
    _addProductModalEl.addEventListener('shown.bs.modal', () => {
        const body = _addProductModalEl.querySelector('.modal-body');
        if (body) body.scrollTop = 0;
    });
    _addProductModalEl.addEventListener('hidden.bs.modal', () => {
        delete document.getElementById('addProductForm')?.dataset.prefillMode;
    });
}
