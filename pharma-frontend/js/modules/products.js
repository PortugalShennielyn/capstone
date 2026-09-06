import API_BASE_URL from '../config/config.js';
import PharmaUtils from '../utils.js';
import { publishDataUpdate } from './live_data.js?v=1';
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
    formatProductCatalogSpecificationLines,
    formatProductContainer,
    formatProductSpecification,
    normalizeProductSpecificationValues
} from './product_specification.js?v=14';
import {
    loadMeasurementUnits,
    measurementUnitsForContext
} from './measurement_units.js?v=4';


const PRODUCT_LIST_CACHE_KEY = 'productMasterFileCache:v1';
const PRODUCT_LIST_CACHE_VERSION = 4;
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
    medicineClassifications: [],
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
    supplierPromise: null,
    medicineClassifications: null,
    medicineClassificationPromise: null
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
let addProductSubmissionActive = false;
let productsLoadPromise = null;
let productTypeCustomizerTarget = { mode: 'add', variationIndex: 0 };

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
    return clean || '—';
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

async function cachedMedicineClassifications(forceRefresh = false) {
    if (!forceRefresh && referenceCache.medicineClassifications) return referenceCache.medicineClassifications;
    if (!forceRefresh && referenceCache.medicineClassificationPromise) return referenceCache.medicineClassificationPromise;

    const promise = PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_medicine_classifications.php`, {
        method: 'GET', credentials: 'include'
    }).then(response => {
        const rows = response?.classifications || [];
        referenceCache.medicineClassifications = rows;
        productState.medicineClassifications = rows;
        return rows;
    }).finally(() => {
        if (referenceCache.medicineClassificationPromise === promise) referenceCache.medicineClassificationPromise = null;
    });
    referenceCache.medicineClassificationPromise = promise;
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
    const specificationText = (product.specifications || []).map(specification => [
        specification.value_text,
        specification.value_number,
        specification.unit_name,
        specification.unit_symbol
    ].join(' ')).join(' ');

    return [
        product.product_name,
        product.brand_name,
        product.generic_name,
        product.medicine_classification,
        formatProductSpecification(product, ''),
        product.strength,
        product.dosage_form,
        product.net_content_value,
        product.net_content_unit,
        product.variant,
        product.size,
        product.net_weight,
        product.pack_content,
        product.barcode,
        product.category_name,
        product.type_name,
        specificationText,
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
                        <h3 class="product-title">${escapeHtml(productCatalogName(product))}${medicineRxBadge(product)}</h3>
                        <div class="product-brand">${escapeHtml(dash(product.brand_name))}</div>
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
    const categoryName = document.getElementById('productCategoryFilter')?.selectedOptions?.[0]?.textContent?.trim().toLowerCase() || '';
    const medicineClassValue = document.getElementById('medicineClassificationFilter')?.value || 'all';
    const medicineFilterActive = medicineClassValue !== 'all' && (!categoryValue || categoryName === 'medicine');
    const statusValue = document.getElementById('productStatusFilter')?.value || 'all';
    const pricingValue = document.getElementById('productPricingFilter')?.value || 'all';

    const filtered = productState.products.filter(product => {
        const matchesSearch = !searchValue || productSearchText(product).includes(searchValue);
        const matchesCategory = !categoryValue || String(product.category_id) === String(categoryValue);
        const matchesMedicineClass = !medicineFilterActive
            || medicineClassValue === 'all'
            || medicineClassificationFilterValue(product) === medicineClassValue;
        const matchesStatus = statusValue === 'all' || String(product.status || 'Active') === statusValue;
        const pricing = product.pricing || {};
        const pricingMethod = product.pricing_method || pricing.pricing_method || 'manual';
        const matchesPricing = pricingValue === 'all'
            || pricingValue === pricingMethod
            || (pricingValue === 'needs_update' && Boolean(pricing.category_pricing_eligible))
            || (pricingValue === 'no_cost' && !pricing.latest_cost_basis);

        return matchesSearch && matchesCategory && matchesMedicineClass && matchesStatus && matchesPricing;
    });

    filtered.sort((a, b) => {
        const nameA = productCatalogName(a).toLowerCase();
        const nameB = productCatalogName(b).toLowerCase();
        return nameA.localeCompare(nameB);
    });

    return filtered;
}

function productCatalogName(product) {
    const value = isMedicine(product) ? product.generic_name : product.product_name;
    return String(value || '').trim() || '—';
}

function isPrescriptionMedicine(product) {
    return isMedicine(product)
        && String(product.medicine_classification || '').trim().toLowerCase() === 'prescription (rx)';
}

function medicineClassificationFilterValue(product) {
    const classification = String(product.medicine_classification || '').trim().toLowerCase();
    if (classification === 'prescription (rx)') return 'prescription';
    if (classification === 'otc' || classification === 'non-prescription' || classification === 'non prescription') {
        return 'non-prescription';
    }
    return '';
}

function medicineRxBadge(product) {
    return isPrescriptionMedicine(product)
        ? '<span class="medicine-rx-badge" title="Prescription medicine">Rx</span>'
        : '';
}

function productCatalogSpecification(product) {
    const lines = formatProductCatalogSpecificationLines(product, '—');
    return `<div class="catalog-specification">${lines.map(line => `<span>${escapeHtml(line)}</span>`).join('')}</div>`;
}

function renderProductCards() {
    const tableBody = document.querySelector('#table-products tbody');
    if (!tableBody) return;

    const products = getFilteredProducts();
    document.querySelector('.pricing-selection-column')?.classList.toggle('d-none', !productState.pricingSelectionMode);
    document.getElementById('table-products')?.classList.toggle('pricing-selection-mode', productState.pricingSelectionMode);

    if (!products.length) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No products found.</td></tr>';
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
                <td><span class="product-clamp">${escapeHtml(dash(product.brand_name))}</span></td>
                <td class="product-column"><div class="medicine-product-identity"><span class="product-clamp">${escapeHtml(productCatalogName(product))}</span>${medicineRxBadge(product)}</div></td>
                <td>${productCatalogSpecification(product)}</td>
                <td class="product-container-cell">${escapeHtml(formatProductContainer(product, '—'))}</td>
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
        manageButton.innerHTML = `<i class="fa-solid fa-tags me-1"></i>Manage Prices${eligibleCount ? `<span class="manage-prices-count" title="${eligibleCount} products need review">${eligibleCount}</span>` : ''}`;
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
    const pricing = payload.pricing || {};
    const productStatus = normalizedProductStatus(product.status);
    const productIsActive = productStatus === 'Active';
    const identity = [product.brand_name, productCatalogName(product)].filter(Boolean).join(' \u00b7 ') || 'Product record';
    const identityLine = document.getElementById('productDetailsIdentityLine');
    if (identityLine) identityLine.textContent = product.barcode ? `${identity} \u00b7 ${product.barcode}` : identity;

    const inventoryLink = document.getElementById('productDetailsInventoryLink');
    if (inventoryLink) inventoryLink.href = `inventory.html?product_id=${encodeURIComponent(product.product_id || '')}`;

    const productRows = [
        productDetailPair(isMedicine(product) ? 'Brand Name' : 'Brand', product.brand_name),
        ...(isMedicine(product) ? [
            productDetailPair('Generic Name', product.generic_name),
            productDetailPair('Medicine Classification', product.medicine_classification)
        ] : [productDetailPair('Product Name', product.product_name)]),
        productDetailPair('Category', product.category_name),
        ...(!isMedicine(product) ? [productDetailPair('Product Type', product.type_name)] : []),
        productDetailPair('Barcode', product.barcode),
        productDetailPair('Product Status', productStatus),
        productDetailPair('Created', formatProductDetailDate(product.created_at))
    ];

    const specificationRows = [];
    if (isMedicine(product)) {
        specificationRows.push(productDetailPair('Strength / Concentration', product.strength || productDetailCombinedValue(product.strength_value, product.strength_unit)));
        specificationRows.push(productDetailPair('Dosage Form', product.dosage_form || product.type_name));
        specificationRows.push(productDetailPair('Net Content', productDetailCombinedValue(product.net_content_value, product.net_content_unit)));
        specificationRows.push(productDetailPair('Package / Container', product.package_type));
    } else if (Array.isArray(payload.specifications) && payload.specifications.length) {
        payload.specifications.forEach(specification => {
            const value = specification.value_number !== null && specification.value_number !== ''
                ? formatMeasurement(specification.value_number, specification.unit_symbol)
                : specification.value_text;
            specificationRows.push(productDetailPair(specification.display_name || specification.specification_name, value));
        });
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
    const pricingMethodLabel = { category_markup: 'Category markup', custom_markup: 'Custom markup', manual: 'Fixed / Manual price' }[pricing.pricing_method] || 'Fixed / Manual price';
    const pricingRows = [
        productDetailPair('Active Selling Price', `${formatPrice(pricing.active_selling_price ?? product.price)} per ${inventoryUnit}`),
        productDetailPair('Pricing Method', pricingMethodLabel)
    ];

    const tags = [product.category_name, product.type_name, product.barcode].filter(Boolean);
    container.innerHTML = `
        <div class="product-details-overview">
            <div class="product-details-primary">
                <div class="product-details-kicker">Product master record</div>
                <h4 class="product-details-name">${escapeHtml(productCatalogName(product))}${medicineRxBadge(product)}</h4>
                <div class="product-details-brand">${escapeHtml(product.brand_name || 'Brand not provided')}</div>
                <div class="product-details-tags">
                    ${tags.map((tag) => `<span class="product-details-tag">${escapeHtml(tag)}</span>`).join('')}
                    <span class="product-details-tag product-status-tag ${productIsActive ? 'is-active' : 'is-inactive'}">${escapeHtml(productStatus)}</span>
                </div>
            </div>
        </div>
        <div class="product-details-sections">
            ${productDetailSection('Product Identity', productRows)}
            ${productDetailSection(isMedicine(product) ? 'Medicine Details' : 'Product Specification', specificationRows)}
            ${productDetailSection('Pricing', pricingRows)}
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
                <h4 class="product-details-name">${escapeHtml(productCatalogName(product))}${medicineRxBadge(product)}</h4>
                <div class="product-details-brand">${escapeHtml(product.brand_name || 'Brand not provided')}</div>
                <div class="product-details-tags">
                    ${tags.map(tag => `<span class="product-details-tag">${escapeHtml(tag)}</span>`).join('')}
                    <span class="product-details-tag product-status-tag ${status === 'Active' ? 'is-active' : 'is-inactive'}">${escapeHtml(status)}</span>
                </div>
            </div>
        </div>
        <div class="product-details-sections">
            ${productDetailSection('Product Identity', [
                productDetailPair(isMedicine(product) ? 'Brand Name' : 'Brand', product.brand_name),
                ...(isMedicine(product) ? [productDetailPair('Generic Name', product.generic_name), productDetailPair('Medicine Classification', product.medicine_classification)] : [productDetailPair('Product Name', product.product_name), productDetailPair('Product Type', product.type_name)]),
                productDetailPair('Barcode', product.barcode),
                productDetailPair('Product Status', status)
            ])}
            ${productDetailSection(isMedicine(product) ? 'Medicine Details' : 'Product Specification', [
                productDetailPair('Specification', formatProductSpecification(product)),
                productDetailPair('Selling / Inventory Unit', product.inventory_unit_name || product.inventory_unit_symbol)
            ])}
            <section class="product-details-section product-details-section-pending" aria-live="polite">
                <h6>Verified Details</h6>
                <div><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading current product and pricing details...</div>
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
    if (identityLine) identityLine.textContent = [product.brand_name, productCatalogName(product)].filter(Boolean).join(' \u00b7 ') || 'Loading product record...';
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
        await populateMedicineClassificationSelects();
        updateMedicineClassificationFilter();
    } catch (err) {
        console.warn('Failed to load product card filters:', err.message || err);
    }
}

async function populateMedicineClassificationSelects() {
    const rows = await cachedMedicineClassifications();
    const targets = [
        ['productMedicineClassification', 'Select classification...'],
        ['editProductMedicineClassification', 'Select classification...']
    ];
    targets.forEach(([id, placeholder]) => {
        const select = document.getElementById(id);
        if (!select) return;
        const selected = select.value;
        select.innerHTML = `<option value="">${placeholder}</option>${rows.map(row => `<option value="${escapeHtml(row.value)}">${escapeHtml(row.value)}</option>`).join('')}`;
        if (rows.some(row => row.value === selected)) select.value = selected;
    });
}

function updateMedicineClassificationFilter() {
    const category = document.getElementById('productCategoryFilter')?.selectedOptions?.[0]?.textContent?.trim() || '';
    const isMedicineCategory = category.toLowerCase() === 'medicine';
    const isAllCategories = !category || category.toLowerCase() === 'all categories';
    const supportsMedicineFilter = isAllCategories || isMedicineCategory;
    const wrap = document.getElementById('medicineClassificationFilterWrap');
    const select = document.getElementById('medicineClassificationFilter');
    wrap?.classList.toggle('is-disabled', !supportsMedicineFilter);
    if (select) {
        select.disabled = !supportsMedicineFilter;
        select.setAttribute('aria-disabled', String(!supportsMedicineFilter));
        if (!supportsMedicineFilter) select.value = 'all';
    }
}

async function loadMeasurementUnitCache(options = {}) {
    const response = await loadMeasurementUnits(options);
    productState.units = response.units;
    productState.measurementGroups = response.measurement_groups;
    referenceCache.configurationsByType.forEach(configuration => {
        configuration.units = response.units;
        configuration.measurement_groups = response.measurement_groups;
    });
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
        const query = typeId ? `?type_id=${encodeURIComponent(typeId)}&include_units=0` : '?include_units=0';
        promise = Promise.all([
            PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_product_configuration.php${query}`, {
                method: 'GET', credentials: 'include', cache: 'no-store'
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

function getSelectedAddCategoryName() {
    return document.getElementById('productCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
}

function setMedicineFields(mode, categoryName, { clear = true } = {}) {
    const medicine = String(categoryName || '').trim().toLowerCase() === 'medicine';
    const prefix = mode === 'edit' ? 'editProduct' : 'product';
    document.getElementById(mode === 'edit' ? 'editProductModal' : 'addProductModal')?.classList.toggle('medicine-product-mode', medicine);
    const selector = mode === 'edit' ? '.edit-medicine-basic-field' : '.medicine-basic-field';
    document.querySelectorAll(selector).forEach(field => field.classList.toggle('d-none', !medicine));
    document.querySelectorAll(`${selector}.medicine-classification-basic-field`).forEach(field => field.classList.toggle('d-none', medicine));
    document.getElementById(mode === 'edit' ? 'editProductTypeField' : 'productTypeField')?.classList.toggle('d-none', medicine);
    const classification = document.getElementById(`${prefix}MedicineClassification`);
    const generic = document.getElementById(`${prefix}GenericName`);
    const brand = document.getElementById(mode === 'edit' ? 'editProductBrand' : 'productBrandName');
    const productName = document.getElementById(mode === 'edit' ? 'editProductName' : 'productName');
    const productNameField = document.getElementById(mode === 'edit' ? 'editProductNameField' : 'productNameField');
    const brandLabel = document.getElementById(mode === 'edit' ? 'editProductBrandLabel' : 'productBrandLabel');
    [classification, generic].filter(Boolean).forEach(field => {
        const skuOwnedClassification = field === classification && medicine;
        field.disabled = !medicine || skuOwnedClassification;
        field.required = medicine && !skuOwnedClassification;
        if (!medicine && clear) field.value = '';
    });
    productNameField?.classList.toggle('d-none', medicine);
    if (productName) {
        productName.disabled = medicine;
        productName.required = !medicine;
        if (medicine && clear) productName.value = '';
    }
    if (brand) brand.required = !medicine;
    if (brandLabel) brandLabel.textContent = 'Brand Name';
    const label = document.getElementById(mode === 'edit' ? 'editProductTypeLabel' : 'productTypeLabel');
    if (label) label.textContent = medicine ? 'Dosage Form' : 'Product Type';
}

function hasMeaningfulSkuValues(containerSelector) {
    return Array.from(document.querySelectorAll(`${containerSelector} input, ${containerSelector} select`)).some(control => {
        if (control.type === 'radio' || control.type === 'checkbox' || control.disabled) return false;
        const value = String(control.value || '').trim();
        return value !== '' && value !== CUSTOMIZE_OPTION;
    });
}

async function confirmProductTypeValueLoss(select, containerSelector) {
    const previousValue = select.dataset.previousValue || '';
    const nextValue = select.value;
    if (!previousValue || previousValue === nextValue || !hasMeaningfulSkuValues(containerSelector)) return true;
    select.value = previousValue;
    const result = await Swal.fire({
        icon: 'warning',
        title: 'Change Product Type?',
        text: 'SKU details that do not apply to the new Product Type will be cleared.',
        showCancelButton: true,
        confirmButtonText: 'Change Product Type'
    });
    if (!result.isConfirmed) return false;
    select.value = nextValue;
    return true;
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
    const genericName = getValue('productGenericName');
    const brandName = getValue('productBrandName');
    const payload = {
        brand_name: brandName,
        product_name: categoryName === 'Medicine' ? (brandName || genericName) : getValue('productName'),
        category_id: getValue('productCategory'),
        type_id: firstVariation.type_id || getValue('productType'),
        category_name: categoryName,
        product_type: selectedAddTypeName(),
        product_unit: getVariationProductUnit(firstVariation),
        unit: getVariationProductUnit(firstVariation),
        price: firstVariation.price || '0',
        barcode: firstVariation.barcode || '',
        generic_name: genericName,
        medicine_classification: firstVariation.medicine_classification || getValue('productMedicineClassification'),
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
        productState.types = smartTypeList(categoryNameById(categoryId), await cachedProductTypes(categoryId), selectedTypeId);
        productState.types.forEach(type => {
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
        const invalidSellingPrice = field.matches('.edit-var-price')
            && !empty
            && (!/^\d+(?:\.\d{1,2})?$/.test(String(field.value).trim()) || !Number.isFinite(Number(field.value)) || Number(field.value) <= 0);
        if (!empty && !belowMinimum && !invalidSellingPrice) return;

        const label = field.closest('.col-md-6, .col-12, section, div')?.querySelector('.form-label')?.textContent
            ?.replace('*', '').trim() || 'This field';
        const error = document.createElement('div');
        error.className = 'product-field-error';
        error.textContent = empty
            ? `${label} is required.`
            : (invalidSellingPrice ? `${label} must be greater than 0 with no more than 2 decimal places.` : `${label} must be ${field.min} or greater.`);
        const anchor = field.closest('.input-group, .variation-pair') || field;
        anchor.insertAdjacentElement('afterend', error);
        field.classList.add('is-invalid');
        field.setAttribute('aria-invalid', 'true');
        invalid.push(field);
    });

    form.querySelectorAll('#productGenericName, #editProductGenericName').forEach((field) => {
        if (field.disabled || field.closest('.d-none') || field.offsetParent === null || field.classList.contains('is-invalid')) return;
        const normalized = String(field.value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
        if (!['otc', 'rx', 'prescription', 'prescriptionrx'].includes(normalized)) return;
        const error = document.createElement('div');
        error.className = 'product-field-error';
        error.textContent = 'Enter the actual generic name / active ingredient. Rx and OTC are classifications.';
        field.insertAdjacentElement('afterend', error);
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
    populateMedicineClassificationSelects().catch(err => console.warn('Failed to load medicine classifications:', err.message || err));

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
        setMedicineFields('add', categoryName);
        renderAddVariations({ variations: collectAddVariations() }, categoryName);
    });

    document.getElementById('productType')?.addEventListener('change', async (event) => {
        if (event.target.value === CUSTOMIZE_OPTION) {
            event.target.value = event.target.dataset.previousValue || '';
            openProductTypeCustomizer();
            return;
        }
        if (!await confirmProductTypeValueLoss(event.target, '#addVariationList')) return;
        event.target.dataset.previousValue = event.target.value;
        await loadProductConfiguration(event.target.value);
        renderAddVariations({ variations: collectAddVariations() }, getSelectedAddCategoryName());
    });

    document.getElementById('btnCreateAnotherAddVariant')?.addEventListener('click', () => {
        const categoryName = getSelectedAddCategoryName();
        const typeName = selectedAddTypeName();
        const existing = collectAddVariations().find(variation => !variation.delete) || {};
        document.getElementById('addVariationList')?.insertAdjacentHTML('beforeend', editVariationEntry({ type_id: existing.type_id || getValue('productType'), medicine_classification: existing.medicine_classification || '' }, categoryName, typeName, true, 'add'));
        if (!document.querySelector('#addVariationList .edit-var-default:checked')) {
            document.querySelector('#addVariationList .edit-var-default')?.click();
        }
    });

    document.getElementById('addVariationList')?.addEventListener('click', (event) => {
        if (event.target.closest('.btn-customize-specifications')) {
            const skuTypeId = event.target.closest('.edit-variation-entry')?.querySelector('.medicine-sku-type')?.value;
            Promise.resolve(skuTypeId ? loadProductConfiguration(skuTypeId) : null).then(() => openSpecificationCustomizer());
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
        if (event.target.matches('.medicine-sku-type')) {
            void handleMedicineSkuTypeChange(event, 'add');
            return;
        }
        handleSellableSkuCustomization(event, false);
    });
    document.getElementById('addVariationList')?.addEventListener('focusin', rememberCustomizationValue);

    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (addProductSubmissionActive) return;
        if (!validateVisibleProductFields(addProductForm)) return;

        const payload = buildProductPayload();
        const saveButton = addProductForm.querySelector('button[type="submit"]');
        const saveButtonHtml = saveButton?.innerHTML || '';

        try {
            addProductSubmissionActive = true;
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Saving...';
            }
            PharmaUtils.modal.loading('Saving Product...');

            const result = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/add_product.php`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            // The create endpoint commits the entire product/SKU transaction before
            // returning. Render only the authoritative joined catalog response so
            // derived Medicine fields (including Package / Container) cannot be
            // temporarily replaced by an incomplete optimistic object.
            if (productsLoadPromise) await productsLoadPromise;
            invalidateProductListCache();
            await loadProductsTable({ skipCache: true, throwOnError: true });
            window.dispatchEvent(new CustomEvent('products:created', {
                detail: { productIds: result.product_ids || [result.product_id].filter(Boolean) }
            }));

            PharmaUtils.modal.close();
            await PharmaUtils.modal.success('Product Saved', 'Item added to system master files successfully.');

            addProductForm.reset();
            document.getElementById('productType').disabled = true;
            setMedicineFields('add', '');
            renderAddVariations();
            closeAddProductModal();
        } catch (err) {
            PharmaUtils.modal.close();
            PharmaUtils.modal.error('Failed to add product', err.message);
        } finally {
            addProductSubmissionActive = false;
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.innerHTML = saveButtonHtml;
            }
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
                        <td colspan="8" class="text-center text-danger py-4">
                            <div>${escapeHtml(err.message)}</div>
                            <button class="btn btn-sm btn-outline-primary mt-2 retry-products-btn" type="button">Retry</button>
                        </td>
                    </tr>
                `;
            }
            if (options?.throwOnError) throw err;
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
    const availableTypes = smartTypeList(categoryNameById(categoryId), await cachedProductTypes(categoryId), selectedTypeId);
    productState.types = availableTypes;
    availableTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type.type_id;
        option.textContent = type.type_name;
        typeSelect.appendChild(option);
    });
    if (selectedTypeId && !availableTypes.some(type => String(type.type_id) === String(selectedTypeId))) {
        const historical = getProductById(getValue('editProductId'));
        if (String(historical?.type_id || '') === String(selectedTypeId)) {
            const option = document.createElement('option');
            option.value = String(selectedTypeId);
            option.textContent = `${historical.type_name || 'Historical Product Type'} (Archived)`;
            typeSelect.appendChild(option);
        }
    }
    typeSelect.value = selectedTypeId ? String(selectedTypeId) : '';
    typeSelect.dataset.previousValue = typeSelect.value;
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
    const categoryName = document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
    setMedicineFields('edit', categoryName, { clear: false });
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
    const normalizedSelected = String(selected || '').trim().toLowerCase();
    const units = measurementUnitsForContext(productState.units, { group });
    const selectedUnit = units.find(unit => String(unit.measurement_unit_id) === String(selected))
        || units.find(unit => [unit.unit_symbol, unit.unit_name].some(value => String(value || '').trim().toLowerCase() === normalizedSelected));
    return [
        '<option value="">-</option>',
        ...units.map(unit => `<option value="${escapeHtml(unit.measurement_unit_id)}" ${String(unit.measurement_unit_id) === String(selectedUnit?.measurement_unit_id || '') ? 'selected' : ''}>${escapeHtml(unit.unit_symbol || unit.unit_name)}</option>`),
        '<option disabled>──────────</option>',
        `<option value="${CUSTOMIZE_OPTION}">⚙ Manage Units</option>`
    ].join('');
}

function inventoryUnitField(variation = {}) {
    const savedUnit = {
        unit_name: variation.inventory_unit_name || '',
        unit_symbol: variation.inventory_unit_symbol || '',
        measurement_group: 'Count'
    };
    return `<div class="col-md-6 permanent-inventory-unit"><label class="form-label">Selling / Inventory Unit <span class="text-danger">*</span></label><select class="form-select edit-var-inventory-unit" required>${dynamicUnitOptions('Count', variation.inventory_unit_id || '', savedUnit)}</select><div class="form-text">Base unit for stock and sales.</div></div>`;
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
        ...units.map(unit => `<option value="${escapeHtml(unit.measurement_unit_id)}" ${String(unit.measurement_unit_id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(unit.unit_symbol || unit.unit_name)}</option>`),
        selectedId && !selectedIsAvailable && historicalUnitMatchesGroup ? `<option value="${escapeHtml(selectedId)}" selected>${escapeHtml(archivedLabel)} — archived</option>` : '',
        '<option disabled>──────────</option>',
        `<option value="${CUSTOMIZE_OPTION}">⚙ Manage Units</option>`
    ].filter(Boolean).join('');
}

const MEASUREMENT_SELECT_SELECTOR = [
    '.dynamic-spec-unit', '.medicine-denominator-unit', '.dynamic-package-unit',
    '.edit-var-inventory-unit', '.edit-var-strength-unit', '.edit-var-net-content-unit',
    '.edit-var-weight-unit', '.edit-var-pack-content-unit', '.medicine-sku-type'
].join(',');
let activeMeasurementSelect = null;

function measurementSelectPortal() {
    let portal = document.getElementById('measurementSelectPortal');
    if (portal) return portal;
    portal = document.createElement('div');
    portal.id = 'measurementSelectPortal';
    portal.className = 'measurement-select-menu';
    portal.setAttribute('role', 'listbox');
    document.body.appendChild(portal);
    portal.addEventListener('click', event => {
        const optionButton = event.target.closest('.measurement-select-option');
        if (!optionButton || !activeMeasurementSelect) return;
        const select = activeMeasurementSelect;
        if (optionButton.dataset.action === 'add-dosage-form') {
            const mode = select.closest('#editVariationList') ? 'edit' : 'add';
            closeMeasurementSelectMenu();
            void openProductTypeCustomizer({ mode, sourceButton: select });
            return;
        }
        const previousValue = select.value;
        if (optionButton.dataset.value === CUSTOMIZE_OPTION) select.dataset.previousValue = previousValue;
        select.value = optionButton.dataset.value;
        if (select.value !== CUSTOMIZE_OPTION) select.dataset.previousValue = select.value;
        syncMeasurementSelect(select);
        closeMeasurementSelectMenu();
        select.dispatchEvent(new Event('input', { bubbles:true }));
        select.dispatchEvent(new Event('change', { bubbles:true }));
    });
    portal.addEventListener('keydown', event => {
        const options = Array.from(portal.querySelectorAll('.measurement-select-option'));
        const current = options.indexOf(document.activeElement);
        if (event.key === 'Escape') {
            event.preventDefault();
            const trigger = activeMeasurementSelect?._measurementTrigger;
            closeMeasurementSelectMenu();
            trigger?.focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            options[(current + direction + options.length) % options.length]?.focus();
        }
    });
    document.addEventListener('pointerdown', event => {
        if (!activeMeasurementSelect || event.target.closest('#measurementSelectPortal,.measurement-select')) return;
        closeMeasurementSelectMenu();
    });
    window.addEventListener('resize', closeMeasurementSelectMenu);
    document.addEventListener('scroll', event => {
        if (event.target instanceof Element && event.target.closest('#measurementSelectPortal')) return;
        closeMeasurementSelectMenu();
    }, true);
    return portal;
}

function closeMeasurementSelectMenu() {
    const portal = document.getElementById('measurementSelectPortal');
    if (portal) {
        portal.classList.remove('show');
        portal.replaceChildren();
    }
    activeMeasurementSelect?._measurementTrigger?.setAttribute('aria-expanded', 'false');
    activeMeasurementSelect = null;
}

function syncMeasurementSelect(select) {
    const trigger = select?._measurementTrigger;
    if (!trigger) return;
    const selected = select.selectedOptions?.[0];
    const label = selected?.textContent?.trim() || 'Select unit...';
    if (trigger.textContent !== label) trigger.textContent = label;
    trigger.disabled = select.disabled;
    trigger.setAttribute('aria-required', select.required ? 'true' : 'false');
}

function calculateSelectMenuPlacement(rect, contentHeight, viewportWidth = window.innerWidth, viewportHeight = window.innerHeight, matchTriggerWidth = false) {
    const viewportMargin = 12;
    const triggerGap = 4;
    const preferredMaxHeight = 280;
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - viewportMargin - triggerGap);
    const spaceAbove = Math.max(0, rect.top - viewportMargin - triggerGap);
    const desiredHeight = Math.min(preferredMaxHeight, Math.max(0, contentHeight));
    const openUpward = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const availableSpace = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(0, Math.min(preferredMaxHeight, availableSpace));
    const minimumWidth = matchTriggerWidth ? 140 : 180;
    const width = Math.min(Math.max(rect.width, minimumWidth), Math.max(minimumWidth, viewportWidth - (viewportMargin * 2)));
    const left = Math.max(viewportMargin, Math.min(rect.left, viewportWidth - width - viewportMargin));
    const menuHeight = Math.min(contentHeight, maxHeight);
    const top = openUpward
        ? Math.max(viewportMargin, rect.top - triggerGap - menuHeight)
        : Math.min(rect.bottom + triggerGap, viewportHeight - viewportMargin - menuHeight);
    return { left, top, width, maxHeight, openUpward };
}

function openMeasurementSelectMenu(select) {
    const trigger = select?._measurementTrigger;
    if (!trigger || trigger.disabled) return;
    if (activeMeasurementSelect === select) {
        closeMeasurementSelectMenu();
        return;
    }
    closeMeasurementSelectMenu();
    activeMeasurementSelect = select;
    const portal = measurementSelectPortal();
    const dosageForm = select.matches('.medicine-sku-type');
    const options = Array.from(select.options).map(option => {
        if (option.disabled) return '<div class="measurement-select-separator" role="separator"></div>';
        const selected = option.value === select.value;
        const customize = option.value === CUSTOMIZE_OPTION;
        const label = customize
            ? '<i class="fa-solid fa-gear" aria-hidden="true"></i><span>Manage Units</span>'
            : `<span class="measurement-select-option-label">${escapeHtml(option.textContent.trim())}</span>`;
        return `<button class="measurement-select-option${customize ? ' is-customize' : ''}" type="button" role="option" aria-selected="${selected ? 'true' : 'false'}" data-value="${escapeHtml(option.value)}">${label}</button>`;
    }).join('');
    const addDosageFormAction = dosageForm
        ? '<button class="measurement-select-option is-add-dosage-form" type="button" data-action="add-dosage-form"><i class="fa-solid fa-plus" aria-hidden="true"></i><span class="measurement-select-option-label">Add New Dosage Form...</span></button>'
        : '';
    portal.innerHTML = options + addDosageFormAction;
    const rect = trigger.getBoundingClientRect();
    portal.style.width = `${dosageForm ? Math.max(rect.width, 140) : Math.max(rect.width, 180)}px`;
    portal.style.maxHeight = '280px';
    portal.classList.add('show');
    const placement = calculateSelectMenuPlacement(rect, portal.scrollHeight, window.innerWidth, window.innerHeight, dosageForm);
    portal.style.width = `${placement.width}px`;
    portal.style.maxHeight = `${placement.maxHeight}px`;
    portal.style.left = `${placement.left}px`;
    portal.style.top = `${placement.top}px`;
    portal.dataset.placement = placement.openUpward ? 'top' : 'bottom';
    trigger.setAttribute('aria-expanded', 'true');
    portal.querySelector('[aria-selected="true"]')?.scrollIntoView({ block:'nearest' });
}

function enhanceMeasurementUnitSelect(select) {
    if (!select || select._measurementTrigger) {
        syncMeasurementSelect(select);
        return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'measurement-select';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'measurement-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'measurementSelectPortal');
    const fieldLabel = select.closest('.sku-dosage-form-field,.specification-field,.permanent-inventory-unit,.col-md-6,.col-12')
        ?.querySelector('.form-label')?.textContent?.replace('*', '')?.trim();
    trigger.setAttribute('aria-label', select.matches('.medicine-sku-type') ? 'Dosage Form' : `${fieldLabel || 'Measurement'} unit`);
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(trigger);
    select.classList.add('measurement-native-select');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select._measurementTrigger = trigger;
    trigger.addEventListener('click', () => openMeasurementSelectMenu(select));
    trigger.addEventListener('keydown', event => {
        if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openMeasurementSelectMenu(select);
        requestAnimationFrame(() => document.querySelector('#measurementSelectPortal .measurement-select-option')?.focus());
    });
    select.addEventListener('change', () => syncMeasurementSelect(select));
    select.addEventListener('invalid', event => {
        event.preventDefault();
        trigger.focus();
    });
    syncMeasurementSelect(select);
}

function refreshMeasurementUnitDropdowns(root = document) {
    if (root.matches?.(MEASUREMENT_SELECT_SELECTOR)) enhanceMeasurementUnitSelect(root);
    root.querySelectorAll?.(MEASUREMENT_SELECT_SELECTOR).forEach(enhanceMeasurementUnitSelect);
}

function initMeasurementUnitDropdowns() {
    refreshMeasurementUnitDropdowns();
    ['addVariationList', 'editVariationList'].forEach(id => {
        const container = document.getElementById(id);
        if (!container || container.dataset.measurementObserverReady === '1') return;
        container.dataset.measurementObserverReady = '1';
        new MutationObserver(() => refreshMeasurementUnitDropdowns(container)).observe(container, { childList:true, subtree:true });
    });
    ['addProductForm', 'editProductForm'].forEach(id => document.getElementById(id)?.addEventListener('reset', () => {
        setTimeout(() => refreshMeasurementUnitDropdowns(), 0);
    }));
}

function measurementGroupForControl(control) {
    if (control.matches('.dynamic-spec-unit')) return control.dataset.measurementGroup || '';
    if (control.matches('.dynamic-package-unit')) return 'Count';
    if (control.matches('.edit-var-inventory-unit')) return 'Count';
    if (control.matches('.edit-var-strength-unit')) return 'Weight';
    if (control.matches('.edit-var-weight-unit')) return 'Weight';
    if (control.matches('.edit-var-pack-content-unit')) return 'Count';
    if (control.matches('.edit-var-net-content-unit')) return 'Volume';
    if (control.matches('.medicine-denominator-unit')) return 'Volume';
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

function medicineStrengthField(specification, variation, mode = 'add', specifications = productState.specifications) {
    const numerator = specificationValue(variation, specification.specification_id);
    const denominatorDefinition = specifications.find(item =>
        String(item.specification_name || '').trim().toLowerCase().startsWith('strength denominator')
    );
    const denominator = denominatorDefinition ? specificationValue(variation, denominatorDefinition.specification_id) : {};
    const denominatorGroup = denominatorDefinition?.measurement_group || 'Volume';
    const concentration = Boolean(denominatorDefinition);
    const denominatorControls = concentration ? `<div class="medicine-strength-denominator">
                <span class="medicine-strength-divider" aria-hidden="true">/</span>
                <input class="form-control medicine-denominator-number" type="number" min="0.000001" step="any" value="${escapeHtml(formatMeasurementValue(denominator.value_number))}" placeholder="5" required>
                <select class="form-select medicine-denominator-unit" data-measurement-group="${escapeHtml(denominatorGroup)}" required>${dynamicUnitOptions(denominatorGroup, denominator.measurement_unit_id, denominator)}</select>
            </div>` : '';
    return `<div class="specification-field medicine-strength-field sku-strength-field ${concentration ? 'is-concentration-strength' : 'is-simple-strength'}" data-specification-id="${escapeHtml(specification.specification_id)}" data-denominator-specification-id="${escapeHtml(denominatorDefinition?.specification_id || '')}" data-specification-name="Strength" data-field-style="Number with Unit">
        <label class="form-label">Strength / Concentration <span class="text-danger">*</span></label>
        <div class="medicine-strength-composer">
            <div class="medicine-strength-numerator">
                <input class="form-control dynamic-spec-number" type="number" min="0.000001" step="any" value="${escapeHtml(formatMeasurementValue(numerator.value_number))}" placeholder="250" required>
                <select class="form-select dynamic-spec-unit" data-measurement-group="Weight" required>${dynamicUnitOptions('Weight', numerator.measurement_unit_id, numerator)}</select>
            </div>
            ${denominatorControls}
        </div>
        <div class="form-text medicine-strength-format-help">${concentration ? 'Concentration format: value unit / value unit.' : 'Simple strength format: value and unit.'}</div>
    </div>`;
}

function activeUnitForLabel(label = '', group = '') {
    const token = String(label || '').trim().toLowerCase();
    if (!token) return null;
    return measurementUnitsForContext(productState.units, { group }).find(unit =>
        [unit.unit_name, unit.unit_symbol].some(value => String(value || '').trim().toLowerCase() === token)
    ) || null;
}

function packageUnitOptions(value = {}) {
    const savedLabel = String(value.value_text || '').trim();
    const selectedId = value.measurement_unit_id || activeUnitForLabel(savedLabel, 'Count')?.measurement_unit_id || '';
    return dynamicUnitOptions('Count', selectedId, {
        measurement_group: 'Count',
        unit_name: savedLabel,
        unit_symbol: savedLabel,
    });
}

function dynamicSpecificationField(specification, variation, rowId, mode = 'add', configuration = {}) {
    const value = specificationValue(variation, specification.specification_id);
    const specificationName = String(specification.specification_name || '').trim().toLowerCase();
    const medicineCategory = String(document.getElementById(mode === 'edit' ? 'editProductCategory' : 'productCategory')?.selectedOptions?.[0]?.dataset.categoryName || '').toLowerCase() === 'medicine';
    const medicineStrength = specificationName === 'strength'
        && medicineCategory;
    const medicineSemanticClass = medicineCategory
        ? ({ volume: ' sku-net-content-field', flavor: ' sku-flavor-field', 'pack content': ' sku-pack-content-field', 'tablet count': ' sku-pack-content-field' }[specificationName] || '')
        : '';
    const required = medicineStrength ? ' required' : '';
    const label = `${escapeHtml(specification.display_name || specification.specification_name)}${medicineStrength ? ' <span class="text-danger">*</span>' : ''}`;
    if (medicineStrength) return medicineStrengthField(specification, variation, mode, configuration.specifications || productState.specifications);
    const attributes = `data-specification-id="${escapeHtml(specification.specification_id)}" data-specification-name="${escapeHtml(specification.specification_name)}" data-field-style="${escapeHtml(specification.field_style)}"`;
    const helper = '';
    if (specificationName === 'package type') {
        return `<div class="specification-field sku-package-field" ${attributes}><label class="form-label">${label}</label><select class="form-select dynamic-package-unit" data-measurement-group="Count">${packageUnitOptions(value)}</select></div>`;
    }
    if (specification.field_style === 'Number with Unit') {
        const medicineVolume = medicineCategory && specificationName === 'volume';
        return `<div class="specification-field${medicineVolume ? ' sku-net-content-field' : medicineSemanticClass}" ${attributes}><label class="form-label">${label}</label><div class="input-group"><input class="form-control dynamic-spec-number" type="number" min="0.000001" step="any" value="${escapeHtml(formatMeasurementValue(value.value_number))}"${required}><select class="form-select dynamic-spec-unit" data-measurement-group="${escapeHtml(specification.measurement_group || '')}"${required}>${dynamicUnitOptions(specification.measurement_group, value.measurement_unit_id, value)}</select></div>${helper}</div>`;
    }
    if (specification.field_style === 'Number Only') {
        return `<div class="specification-field" ${attributes}><label class="form-label">${label}</label><input class="form-control dynamic-spec-number" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(value.value_number))}"></div>`;
    }
    if (specification.field_style === 'Selection List') {
        const usesPackageChoices = specification.specification_name === 'Package Type';
        const choiceSource = usesPackageChoices ? [...(configuration.package_types || productState.packageTypes), ...(specification.choices || [])] : (specification.choices || []);
        const choices = Array.from(new Map(choiceSource.filter(Boolean).map(choice => [String(choice).trim().toLowerCase(), String(choice).trim()])).values());
        const savedChoice = String(value.value_text || '').trim();
        if (savedChoice && !choices.some(choice => choice.toLowerCase() === savedChoice.toLowerCase())) choices.unshift(savedChoice);
        if (specification.allow_custom_value) {
            const listId = `${rowId}-${specification.specification_id}`;
            return `<div class="specification-field${medicineSemanticClass}" ${attributes}><label class="form-label">${label}</label><input class="form-control dynamic-spec-text" list="${escapeHtml(listId)}" value="${escapeHtml(value.value_text ?? '')}" placeholder="Select or type"><datalist id="${escapeHtml(listId)}">${choices.map(choice => `<option value="${escapeHtml(choice)}"></option>`).join('')}<option value="${CUSTOMIZE_OPTION}" label="⚙ Customize / Add Specifications"></option></datalist></div>`;
        }
        return `<div class="specification-field${medicineSemanticClass}" ${attributes}><label class="form-label">${label}</label><select class="form-select dynamic-spec-text"><option value="">Select...</option>${choices.map(choice => `<option ${String(choice).toLowerCase() === String(value.value_text || '').toLowerCase() ? 'selected' : ''}>${escapeHtml(choice)}</option>`).join('')}<option disabled>──────────</option><option value="${CUSTOMIZE_OPTION}">⚙ Customize / Add Specifications</option></select></div>`;
    }
    return `<div class="specification-field${medicineSemanticClass}" ${attributes}><label class="form-label">${label}</label><input class="form-control dynamic-spec-text" value="${escapeHtml(value.value_text ?? '')}"></div>`;
}

function medicineSkuTypeOptions(selectedTypeId = '', mode = 'add', selectedTypeName = '') {
    const categoryId = getValue(mode === 'edit' ? 'editProductCategory' : 'productCategory');
    const types = referenceCache.typesByCategory.get(String(categoryId)) || productState.types || [];
    const known = types.some(type => String(type.type_id) === String(selectedTypeId));
    const preserved = selectedTypeId && !known ? `<option value="${escapeHtml(selectedTypeId)}" selected>${escapeHtml(selectedTypeName || 'Current dosage form')}</option>` : '';
    return `<option value="">Select dosage form...</option>${preserved}${types.map(type => `<option value="${escapeHtml(type.type_id)}" ${String(type.type_id) === String(selectedTypeId) ? 'selected' : ''}>${escapeHtml(type.type_name)}</option>`).join('')}`;
}

function medicineSkuClassificationOptions(selected = '') {
    return `<option value="">Select classification...</option>${productState.medicineClassifications.map(row => `<option value="${escapeHtml(row.value)}" ${String(row.value).toLowerCase() === String(selected).toLowerCase() ? 'selected' : ''}>${escapeHtml(row.value)}</option>`).join('')}`;
}

function variationConfiguration(variation = {}, mode = 'add') {
    const fallbackTypeId = getValue(mode === 'edit' ? 'editProductType' : 'productType');
    const typeId = variation.type_id || fallbackTypeId;
    if (referenceCache.configurationsByType.has(String(typeId))) return referenceCache.configurationsByType.get(String(typeId));
    if (String(productState.configurationTypeId) === String(typeId)) return {
        specifications: productState.specifications,
        package_types: productState.packageTypes
    };
    return { specifications: [], package_types: [] };
}

function dynamicVariationEntry(variation = {}, canDelete = true, mode = 'add') {
    const rowId = `dynamic-spec-${Math.random().toString(36).slice(2)}`;
    const deleteButton = canDelete ? '<button class="btn btn-sm btn-outline-danger btn-remove-edit-variation" type="button" title="Remove variant"><i class="fa-solid fa-trash-can"></i></button>' : '';
    const categoryName = document.getElementById(mode === 'edit' ? 'editProductCategory' : 'productCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
    const medicine = categoryName === 'Medicine';
    const configuration = variationConfiguration(variation, mode);
    const visibleSpecifications = (configuration.specifications || [])
        .filter(specification => {
            const name = String(specification.specification_name || '').trim().toLowerCase();
            return name !== 'medicine classification' && !name.startsWith('strength denominator');
        })
        .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
    if (medicine) {
        const layoutPriority = specification => ({
            'package type': 10,
            'volume': 20,
            'net content': 20,
            'pack content': 20,
            'tablet count': 20,
            'strength': 30,
            'flavor': 40
        }[String(specification.specification_name || '').trim().toLowerCase()] ?? 50);
        visibleSpecifications.sort((left, right) => layoutPriority(left) - layoutPriority(right) || Number(left.sort_order || 0) - Number(right.sort_order || 0));
    }
    const fields = visibleSpecifications.map(specification => dynamicSpecificationField(specification, variation, rowId, mode, configuration)).join('');
    const empty = '';
    const barcodeField = `<div class="col-md-6 sku-barcode-field"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" inputmode="text" value="${escapeHtml(variation.barcode || '')}"></div>`;
    const skuTail = medicine
        ? `${inventoryUnitField(variation)}${sellingPriceField(variation)}${barcodeField}`
        : `${inventoryUnitField(variation)}${barcodeField}${sellingPriceField(variation)}`;
    const skuIdentity = medicine ? `<div class="sku-medicine-identity-grid"><div class="sku-dosage-form-field"><label class="form-label">Dosage Form <span class="text-danger">*</span></label><div class="dosage-form-control"><select class="form-select medicine-sku-type" required>${medicineSkuTypeOptions(variation.type_id || getValue(mode === 'edit' ? 'editProductType' : 'productType'), mode, variation.type_name || '')}</select></div></div><div class="sku-classification-field"><label class="form-label">Medicine Classification <span class="text-danger">*</span></label><select class="form-select medicine-sku-classification" required>${medicineSkuClassificationOptions(variation.medicine_classification || getValue(mode === 'edit' ? 'editProductMedicineClassification' : 'productMedicineClassification'))}</select></div></div>` : '';
    return `<div class="edit-variation-entry${medicine ? ' is-medicine-variation' : ''}"><div class="d-flex align-items-center justify-content-end gap-2 mb-3"><button class="btn btn-sm btn-outline-secondary btn-customize-specifications" type="button"><i class="fa-solid fa-gear me-1"></i>Customize Specifications</button><input class="form-check-input edit-var-default d-none" type="radio" name="${mode}DefaultVariation" ${String(variation.is_default ?? 1) === '1' ? 'checked' : ''}>${deleteButton}</div>${empty}<div class="dynamic-specification-grid">${skuIdentity}${fields}${skuTail}</div></div>`;
}

function sellingPriceField(variation = {}) {
    return `<div class="col-md-6 sku-selling-price-field"><label class="form-label">Selling Price <span class="text-danger">*</span></label><div class="input-group"><span class="input-group-text">₱</span><input class="form-control edit-var-price" type="number" min="0.01" step="0.01" inputmode="decimal" value="${escapeHtml(variation.price ?? '')}" required></div></div>`;
}

function editVariationEntry(variation = {}, categoryName = 'Grocery', typeName = '', canDelete = true, mode = 'edit') {
    const selectedTypeId = mode === 'edit' ? getValue('editProductType') : getValue('productType');
    if (categoryName === 'Medicine' || (selectedTypeId && productState.configurationTypeId === selectedTypeId)) {
        return dynamicVariationEntry(variation, canDelete, mode);
    }
    const rule = getVariationRule(categoryName, typeName);
    const rowId = `variation-rule-${Math.random().toString(36).slice(2)}`;
    const defaultName = `${mode}DefaultVariation`;
    const deleteButton = canDelete ? '<button class="btn btn-sm btn-outline-danger btn-remove-edit-variation" type="button" title="Remove variant"><i class="fa-solid fa-trash-can"></i></button>' : '';
    const medicineFields = `
                <div class="col-md-6"><label class="form-label">Strength</label><div class="variation-pair"><input class="form-control edit-var-strength-value" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(variation.strength_value))}" placeholder="70"><select class="form-select edit-var-strength-unit">${measurementUnitOptionList('Weight', variation.strength_unit || '')}</select></div></div>
                <div class="col-md-6"><label class="form-label">Dosage Form</label><input class="form-control edit-var-dosage-form" value="${escapeHtml(variation.dosage_form || '')}" placeholder="Solution"></div>
                <div class="col-md-6"><label class="form-label">Net Content</label><div class="variation-pair"><input class="form-control edit-var-net-content-value" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(variation.net_content_value))}" placeholder="500"><select class="form-select edit-var-net-content-unit">${measurementUnitOptionList('Volume', variation.net_content_unit || '')}</select></div></div>
                <div class="col-md-6"><label class="form-label">Container Type</label><select class="form-select edit-var-package-type">${specificationChoiceOptionList(variation.package_type || '', ['bottle', 'box', 'pack', 'blister pack', 'sachet', 'tube', 'vial', 'ampule'])}</select></div>
                ${inventoryUnitField(variation)}
                ${sellingPriceField(variation)}
                <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
    `;
    const medicalFields = `
                <div class="col-md-6"><label class="form-label">Variant / Description</label><input class="form-control edit-var-name" value="${escapeHtml(variation.variant_name || '')}" placeholder="Ethyl Alcohol 70%"></div>
                <div class="col-md-6"><label class="form-label">Size</label><input class="form-control edit-var-size-value" value="${escapeHtml(formatMeasurementText(variation.size_value))}" placeholder="500 mL"></div>
                <div class="col-md-6"><label class="form-label">Material</label><input class="form-control edit-var-material" value="${escapeHtml(variation.material || '')}"></div>
                <div class="col-md-6"><label class="form-label">Sterile Status</label><select class="form-select edit-var-sterile-status"><option value="">-</option><option ${variation.sterile_status === 'Sterile' ? 'selected' : ''}>Sterile</option><option ${variation.sterile_status === 'Non-sterile' ? 'selected' : ''}>Non-sterile</option><option disabled>──────────</option><option value="${CUSTOMIZE_OPTION}">⚙ Customize / Add Specifications</option></select></div>
                <div class="col-md-6"><label class="form-label">Container Type</label><select class="form-select edit-var-package-type">${specificationChoiceOptionList(variation.package_type || '', ['bottle', 'box', 'pack', 'roll', 'tube'])}</select></div>
                ${inventoryUnitField(variation)}
                ${sellingPriceField(variation)}
                <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
    `;
    const groceryFields = `
                <div class="col-md-6"><label class="form-label">${escapeHtml(groceryVariantLabel(typeName))}</label><input class="form-control edit-var-name" list="${rowId}-variant" value="${escapeHtml(variation.variant_name || '')}" placeholder="Select or type">${datalist(`${rowId}-variant`, rule.variantOptions)}</div>
                <div class="col-md-6"><label class="form-label">Size</label><select class="form-select edit-var-size-value">${optionList(rule.sizeOptions, formatMeasurementText(variation.size_value))}</select></div>
                <div class="col-md-6"><label class="form-label">Net Weight</label><div class="variation-pair"><input class="form-control edit-var-weight-value" list="${rowId}-weight" type="number" min="0" step="any" value="${escapeHtml(formatMeasurementValue(variation.weight_value))}" placeholder="155"><select class="form-select edit-var-weight-unit">${measurementUnitOptionList('Weight', variation.weight_unit || '')}</select></div>${datalist(`${rowId}-weight`, rule.weightValues)}</div>
                <div class="col-md-6"><label class="form-label">Container Type</label><select class="form-select edit-var-package-type">${specificationChoiceOptionList(variation.package_type || '', ['can', 'bottle', 'box', 'pack', 'sachet', 'tube', 'jar', 'pouch'])}</select></div>
                <div class="col-md-6"><label class="form-label">Pack Content</label><div class="variation-pair"><input class="form-control edit-var-pack-content-qty" list="${rowId}-pack-content" type="number" min="0" step="1" value="${escapeHtml(formatMeasurementValue(variation.pack_content_qty))}" placeholder="12"><select class="form-select edit-var-pack-content-unit">${measurementUnitOptionList('Count', variation.pack_content_unit || '')}</select></div>${datalist(`${rowId}-pack-content`, rule.packContentValues)}</div>
                ${inventoryUnitField(variation)}
                <div class="col-md-6"><label class="form-label">Barcode</label><input class="form-control edit-var-barcode" value="${escapeHtml(variation.barcode || '')}"></div>
                ${sellingPriceField(variation)}
    `;

    const addMedicineFields = `<div class="row g-3">${medicineFields}</div>`;
    const addMedicalFields = `<div class="row g-3">${medicalFields}</div>`;
    const addGroceryFields = `<div class="row g-3">${groceryFields}</div>`;

    return `
        <div class="edit-variation-entry">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                <div class="ms-auto d-flex align-items-center gap-2">
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
}

function renderAddVariations(product = { variations: [{}] }, categoryName = '') {
    const list = document.getElementById('addVariationList');
    if (!list) return;
    const typeName = selectedAddTypeName();
    if (!getValue('productType') && (categoryName || getSelectedAddCategoryName()) !== 'Medicine') {
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
    const categorySelectId = containerSelector === '#editVariationList' ? 'editProductCategory' : 'productCategory';
    const categoryName = document.getElementById(categorySelectId)?.selectedOptions?.[0]?.dataset.categoryName || '';
    const detailSchema = categoryName === 'Medicine'
        ? 'medicine'
        : (categoryName === 'Medical Supplies' || categoryName === 'Medical Supply' ? 'medical_supply' : 'grocery');
    return Array.from(document.querySelectorAll(`${containerSelector} .edit-variation-entry`)).map(entry => ({
        detail_schema: entry.querySelector('.specification-field') ? 'dynamic' : detailSchema,
        type_id: entry.querySelector('.medicine-sku-type')?.value || '',
        medicine_classification: entry.querySelector('.medicine-sku-classification')?.value || '',
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
        specifications: Array.from(entry.querySelectorAll('.specification-field')).flatMap(field => {
            const packageUnitSelect = field.querySelector('.dynamic-package-unit');
            const packageUnitId = packageUnitSelect?.value === CUSTOMIZE_OPTION ? '' : (packageUnitSelect?.value || '');
            const packageUnit = packageUnitId
                ? productState.units.find(unit => String(unit.measurement_unit_id) === String(packageUnitId))
                : null;
            const primary = {
                specification_id: field.dataset.specificationId || '',
                value_text: packageUnit
                    ? String(packageUnit.unit_name || packageUnit.unit_symbol || '').trim()
                    : (field.querySelector('.dynamic-spec-text')?.value.trim() || ''),
                value_number: field.querySelector('.dynamic-spec-number')?.value.trim() || '',
                measurement_unit_id: packageUnitId || (field.querySelector('.dynamic-spec-unit')?.value === CUSTOMIZE_OPTION ? '' : (field.querySelector('.dynamic-spec-unit')?.value || ''))
            };
            if (!field.matches('.medicine-strength-field')) return [primary];
            const denominatorWrap = field.querySelector('.medicine-strength-denominator');
            const denominatorId = field.dataset.denominatorSpecificationId || '';
            if (!denominatorId || denominatorWrap?.classList.contains('d-none')) return [primary];
            const denominatorUnit = field.querySelector('.medicine-denominator-unit')?.value || '';
            return [primary, {
                specification_id: denominatorId,
                value_text: '',
                value_number: field.querySelector('.medicine-denominator-number')?.value.trim() || '',
                measurement_unit_id: denominatorUnit === CUSTOMIZE_OPTION ? '' : denominatorUnit
            }];
        })
    }));
}

function collectEditVariations() {
    return collectVariationEntries('#editVariationList');
}

function collectAddVariations() {
    return collectVariationEntries('#addVariationList');
}

async function handleMedicineSkuTypeChange(event, mode = 'add') {
    const select = event.target.closest('.medicine-sku-type');
    if (!select) return false;
    const containerSelector = mode === 'edit' ? '#editVariationList' : '#addVariationList';
    const entries = Array.from(document.querySelectorAll(`${containerSelector} .edit-variation-entry`));
    const index = entries.indexOf(select.closest('.edit-variation-entry'));
    const variations = collectVariationEntries(containerSelector);
    if (index < 0 || !variations[index]) return true;
    variations[index].type_id = select.value;
    // A dosage form owns its own configured specification values. Reusing values
    // from the previous form (even for shared fields such as Strength) can silently
    // turn a concentration into a tablet strength, so rebuild with empty values.
    variations[index].specifications = [];
    if (!select.value) return true;
    try {
        await loadProductConfiguration(select.value);
        if (index === 0) {
            const shared = document.getElementById(mode === 'edit' ? 'editProductType' : 'productType');
            if (shared) shared.value = select.value;
        }
        const categoryName = document.getElementById(mode === 'edit' ? 'editProductCategory' : 'productCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
        if (mode === 'edit') renderEditVariations({ variations }, categoryName);
        else renderAddVariations({ variations }, categoryName);
    } catch (error) {
        PharmaUtils.toast.error(error.message || 'Unable to load the selected dosage form.');
    }
    return true;
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
            type_id: product.type_id || '',
            type_name: product.type_name || product.dosage_form || '',
            medicine_classification: product.medicine_classification || '',
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
    document.getElementById('productGenericName').value = product.generic_name || '';
    setSelectValue('productMedicineClassification', product.medicine_classification || '');
    const categorySelect = document.getElementById('productCategory');
    const typeSelect = document.getElementById('productType');
    if (categorySelect) categorySelect.innerHTML = `<option value="${escapeHtml(product.category_id || '')}" data-category-name="${escapeHtml(product.category_name || '')}" selected>${escapeHtml(product.category_name || 'Current category')}</option>`;
    if (typeSelect) {
        typeSelect.innerHTML = `<option value="${escapeHtml(product.type_id || '')}" selected>${escapeHtml(product.type_name || 'Current product type')}</option>`;
        typeSelect.disabled = false;
    }
    setMedicineFields('add', product.category_name || '', { clear: false });

    const cachedConfiguration = referenceCache.configurationsByType.get(String(product.type_id || ''));
    if (cachedConfiguration) {
        applyProductConfiguration(product.type_id || '', cachedConfiguration);
        renderAddVariations({ variations: [{ price: '', type_id: product.type_id || '', type_name: product.type_name || '', medicine_classification: product.medicine_classification || '' }] }, product.category_name || '');
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
        renderAddVariations({ variations: [{ price: '', type_id: product.type_id || '', type_name: product.type_name || '', medicine_classification: product.medicine_classification || '' }] }, product.category_name || '');
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
    if (customInput) {
        customInput.required = method === 'custom_markup';
        customInput.disabled = method !== 'custom_markup';
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

    const manualPrice = Number(document.querySelector('#editVariationList .edit-variation-entry:first-child .edit-var-price')?.value);
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
    document.getElementById('editProductGenericName').value = product.generic_name || '';
    setSelectValue('editProductMedicineClassification', product.medicine_classification || '');
    document.getElementById('editProductStatus').value = product.status || 'Active';
    document.getElementById('editProductPricingMethod').value = product.pricing_method || product.pricing?.pricing_method || 'manual';
    document.getElementById('editProductCustomMarkup').value = product.pricing?.custom_markup_percentage ?? '';
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
    setMedicineFields('edit', product.category_name || '', { clear: false });

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
        const [categoryResult, typeResult, configurationResult, detailResult, classificationResult] = await Promise.allSettled([
            populateEditCategories(product.category_id || ''),
            populateEditTypes(product.category_id || '', product.type_id || ''),
            loadProductConfiguration(product.type_id || ''),
            detailPromise,
            populateMedicineClassificationSelects()
        ]);
        if (requestSequence !== editProductRequestSequence || getValue('editProductId') !== String(product.product_id || '')) return;
        const requiredFailure = [categoryResult, typeResult, configurationResult].find(result => result.status === 'rejected');
        if (requiredFailure) throw requiredFailure.reason;

        const details = detailResult.status === 'fulfilled' ? (detailResult.value?.data || {}) : {};
        if (detailResult.status === 'fulfilled') productDetailsCache.set(String(product.product_id), details);
        const hydratedProduct = { ...product, ...(details.product || {}) };
        document.getElementById('editProductGenericName').value = hydratedProduct.generic_name || '';
        setSelectValue('editProductMedicineClassification', hydratedProduct.medicine_classification || '');
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
    const genericName = getValue('editProductGenericName');
    const payload = {
        product_id: getValue('editProductId'),
        brand_name: getValue('editProductBrand'),
        product_name: categoryName === 'Medicine' ? (getValue('editProductName') || getValue('editProductBrand') || genericName) : getValue('editProductName'),
        category_id: getValue('editProductCategory'),
        type_id: collectEditVariations().find(variation => !variation.delete)?.type_id || getValue('editProductType'),
        generic_name: genericName,
        medicine_classification: collectEditVariations().find(variation => !variation.delete)?.medicine_classification || getValue('editProductMedicineClassification'),
        status: getValue('editProductStatus') || 'Active',
        pricing_method: pricingMethod,
        variations: collectEditVariations()
    };
    if (pricingMethod === 'custom_markup') payload.custom_markup_percentage = getValue('editProductCustomMarkup');
    if (pricingMethod === 'manual') payload.manual_selling_price = payload.variations.find(variation => !variation.delete)?.price || '';
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
                    generic_name: payload.generic_name,
                    medicine_classification: payload.medicine_classification,
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
            type_id: primaryVariation.type_id || payload.type_id,
            type_name: productState.types.find(type => String(type.type_id) === String(primaryVariation.type_id || payload.type_id))?.type_name || typeName || currentProduct.type_name,
            generic_name: categoryName === 'Medicine' ? payload.generic_name : null,
            medicine_classification: categoryName === 'Medicine' ? (primaryVariation.medicine_classification || payload.medicine_classification) : null,
            medicine_classification_badge: categoryName === 'Medicine' ? (productState.medicineClassifications.find(row => row.value === (primaryVariation.medicine_classification || payload.medicine_classification))?.badge || null) : null,
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

    ['productSearchInput', 'medicineClassificationFilter', 'productStatusFilter', 'productPricingFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderProductCards);
        document.getElementById(id)?.addEventListener('change', renderProductCards);
    });

    document.getElementById('productCategoryFilter')?.addEventListener('change', async (event) => {
        updateMedicineClassificationFilter();
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
        const product = getProductById(getValue('editProductId'));
        const categoryName = event.target.selectedOptions?.[0]?.dataset.categoryName || '';
        setMedicineFields('edit', categoryName);
        renderEditVariations(product || { variations: [{}] }, categoryName);
        updateEditPricingView();
    });
    document.getElementById('editProductType')?.addEventListener('change', async (event) => {
        if (!await confirmProductTypeValueLoss(event.target, '#editVariationList')) return;
        event.target.dataset.previousValue = event.target.value;
        await loadProductConfiguration(event.target.value);
        const product = getProductById(getValue('editProductId'));
        const categoryName = document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
        renderEditVariations(product || { variations: collectEditVariations() }, categoryName);
    });
    document.getElementById('btnAddEditVariation')?.addEventListener('click', () => {
        const product = getProductById(getValue('editProductId'));
        if (!product) return;
        const variations = collectEditVariations().filter(variation => !variation.delete);
        variations.push({ price: '', is_default: 0 });
        const categoryName = document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || product.category_name || '';
        renderEditVariations({ ...product, variations }, categoryName);
    });
    document.getElementById('editVariationList')?.addEventListener('click', (event) => {
        if (event.target.closest('.btn-customize-specifications')) {
            const skuTypeId = event.target.closest('.edit-variation-entry')?.querySelector('.medicine-sku-type')?.value;
            Promise.resolve(skuTypeId ? loadProductConfiguration(skuTypeId) : null).then(() => openSpecificationCustomizer(true));
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
        if (event.target.matches('.medicine-sku-type')) {
            void handleMedicineSkuTypeChange(event, 'edit');
            return;
        }
        handleSellableSkuCustomization(event, true);
    });
    document.getElementById('editVariationList')?.addEventListener('input', (event) => {
        if (event.target.matches('.edit-var-price')) updateEditPricingView({ preserveApply: true });
    });
    document.getElementById('editVariationList')?.addEventListener('focusin', rememberCustomizationValue);

    document.getElementById('editProductPricingMethod')?.addEventListener('change', () => updateEditPricingView());
    document.getElementById('editProductCustomMarkup')?.addEventListener('input', () => updateEditPricingView());
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

function showNestedModal(id, parentModalId = '') {
    const element = document.getElementById(id);
    if (!element) return;
    if (parentModalId) {
        element.dataset.parentModalId = parentModalId;
        document.getElementById(parentModalId)?.classList.add('has-product-customizer-open');
        if (element.dataset.parentUnlockReady !== '1') {
            element.dataset.parentUnlockReady = '1';
            element.addEventListener('hidden.bs.modal', () => {
                const parentModal = document.getElementById(element.dataset.parentModalId || '');
                parentModal?.classList.remove('has-product-customizer-open');
                if (parentModal?.classList.contains('show')) {
                    requestAnimationFrame(() => document.body.classList.add('modal-open'));
                }
                delete element.dataset.parentModalId;
            });
        }
    }
    bootstrap.Modal.getOrCreateInstance(element, { backdrop: 'static', keyboard: true }).show();
}

function renderCustomizerRows(containerId, rows, labelKey, idKey, editClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = rows.length ? rows.map(row => `<div class="customizer-row"><span>${escapeHtml(row[labelKey])}</span><button class="btn btn-sm btn-outline-secondary ${editClass}" type="button" data-id="${escapeHtml(row[idKey])}" data-name="${escapeHtml(row[labelKey])}"><i class="fa-solid fa-pen"></i><span class="visually-hidden">Rename</span></button></div>`).join('') : '<div class="p-3 text-muted text-center">No values found.</div>';
}

function setProductTypeEditor(type = null) {
    const editing = Boolean(type?.type_id);
    const categoryName = categoryNameById(getValue('newProductTypeCategory'));
    const medicine = categoryName === 'Medicine';
    const idInput = document.getElementById('customProductTypeId');
    const nameInput = document.getElementById('newProductTypeName');
    if (idInput) idInput.value = editing ? type.type_id : '';
    if (nameInput) nameInput.value = editing ? type.type_name : '';
    const mode = document.getElementById('productTypeFormMode');
    if (mode) mode.textContent = editing ? `Edit ${medicine ? 'Dosage Form' : 'Product Type'}` : `Add ${medicine ? 'Dosage Form' : 'Product Type'}`;
    const patternField = document.getElementById('dosageFormPatternField');
    const patternSelect = document.getElementById('dosageFormSpecificationPattern');
    patternField?.classList.toggle('d-none', !medicine || editing);
    if (patternSelect) {
        patternSelect.disabled = !medicine || editing;
        patternSelect.required = medicine && !editing;
        if (!editing) patternSelect.value = 'simple_strength';
    }
    const save = document.getElementById('btnSaveProductType');
    if (save) save.textContent = editing ? 'Save Changes' : `Save ${medicine ? 'Dosage Form' : 'Product Type'}`;
    showCustomizerError('customProductTypeError');
}

function renderProductTypeCustomizerRows(types = []) {
    const container = document.getElementById('productTypeCustomizerList');
    if (!container) return;
    const medicine = categoryNameById(getValue('newProductTypeCategory')) === 'Medicine';
    const label = medicine ? 'Dosage Form' : 'Product Type';
    container.innerHTML = types.length ? types.map(type => `<div class="customizer-row" data-type-id="${escapeHtml(type.type_id)}"><span>${escapeHtml(type.type_name)}</span><span class="product-type-actions"><button class="btn btn-outline-secondary edit-product-type-option" type="button" data-id="${escapeHtml(type.type_id)}" data-name="${escapeHtml(type.type_name)}" title="Edit ${label}" aria-label="Edit ${label}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button class="btn btn-outline-danger delete-product-type-option" type="button" data-id="${escapeHtml(type.type_id)}" data-name="${escapeHtml(type.type_name)}" title="Delete ${label}" aria-label="Delete ${label}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></span></div>`).join('') : `<div class="p-3 text-muted text-center">No ${label}s found.</div>`;
}

async function openCategoryCustomizer() {
    showNestedModal('customizeCategoriesModal');
    await populateAddCategories(getValue('productCategory'));
    renderCustomizerRows('categoryCustomizerList', productState.categories, 'category_name', 'category_id', 'edit-category-option');
    document.getElementById('customCategoryId').value = '';
    document.getElementById('customCategoryName').value = '';
    showCustomizerError('customCategoryError');
}

async function openProductTypeCustomizer({ mode = 'add', sourceButton = null } = {}) {
    const categoryId = getValue(mode === 'edit' ? 'editProductCategory' : 'productCategory');
    if (!categoryId || categoryId === CUSTOMIZE_OPTION) {
        PharmaUtils.toast.error('Select a real Category first.');
        return;
    }
    const containerSelector = mode === 'edit' ? '#editVariationList' : '#addVariationList';
    const entries = Array.from(document.querySelectorAll(`${containerSelector} .edit-variation-entry`));
    const sourceEntry = sourceButton?.closest('.edit-variation-entry');
    productTypeCustomizerTarget = { mode, variationIndex: sourceEntry ? Math.max(0, entries.indexOf(sourceEntry)) : 0 };
    const categoryName = categoryNameById(categoryId);
    const medicine = categoryName === 'Medicine';
    document.getElementById('productTypeCustomizerTitle').textContent = medicine ? 'Manage Dosage Forms' : 'Customize Product Types';
    document.getElementById('productTypeCustomizerSearch').placeholder = medicine ? 'Search Dosage Forms' : 'Search Product Types';
    document.getElementById('newProductTypeNameLabel').innerHTML = `${medicine ? 'Dosage Form' : 'Product Type'} Name <span class="text-danger">*</span>`;
    document.getElementById('newProductTypeCategory').value = categoryId;
    showNestedModal('addProductTypeModal', mode === 'edit' ? 'editProductModal' : 'addProductModal');
    const types = await cachedProductTypes(categoryId);
    renderProductTypeCustomizerRows(types);
    setProductTypeEditor();
    document.getElementById('productTypeCustomizerCategory').textContent = categoryName;
    showCustomizerError('customProductTypeError');
}

async function deleteProductType(typeId, typeName) {
    const medicine = categoryNameById(getValue('newProductTypeCategory')) === 'Medicine';
    const label = medicine ? 'Dosage Form' : 'Product Type';
    const confirmation = await Swal.fire({
        icon: 'warning',
        title: `Delete ${label}?`,
        text: `Are you sure you want to delete "${typeName}"?`,
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#dc3545',
        customClass: { container: 'product-specification-confirmation' }
    });
    if (!confirmation.isConfirmed) return;

    const categoryId = getValue('newProductTypeCategory');
    const mode = productTypeCustomizerTarget.mode;
    const containerSelector = mode === 'edit' ? '#editVariationList' : '#addVariationList';
    const variations = collectVariationEntries(containerSelector);
    const targetIndex = Math.min(productTypeCustomizerTarget.variationIndex, Math.max(0, variations.length - 1));
    const selectedTypeId = variations[targetIndex]?.type_id || getValue(mode === 'edit' ? 'editProductType' : 'productType');
    const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/delete_product_type.php`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_id: typeId, category_id: categoryId })
    });
    referenceCache.typesByCategory.delete(String(categoryId));
    invalidateProductConfiguration(typeId);
    const deletedSelectedType = String(selectedTypeId) === String(typeId);
    if (deletedSelectedType && variations[targetIndex]) variations[targetIndex].type_id = '';
    if (targetIndex === 0) {
        if (mode === 'edit') await populateEditTypes(categoryId, deletedSelectedType ? '' : selectedTypeId);
        else await populateAddTypes(categoryId, deletedSelectedType ? '' : selectedTypeId);
    } else {
        productState.types = await cachedProductTypes(categoryId, true);
    }
    if (deletedSelectedType) {
        productState.configurationTypeId = '';
        productState.specifications = [];
        if (mode === 'edit') renderEditVariations({ variations }, categoryNameById(categoryId));
        else renderAddVariations({ variations }, categoryNameById(categoryId));
    }
    renderProductTypeCustomizerRows(await cachedProductTypes(categoryId, true));
    setProductTypeEditor();
    PharmaUtils.toast.success(response.message);
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

function measurementUnitDisplayLabel(unit) {
    const name = String(unit?.unit_name || '').trim();
    const symbol = String(unit?.unit_symbol || '').trim();
    if (!name) return symbol || 'Measurement unit';
    return symbol && symbol.toLowerCase() !== name.toLowerCase() ? `${name} (${symbol})` : name;
}

function renderMeasurementUnits(group = document.getElementById('measurementUnitGroupFilter')?.value || '') {
    const query = String(document.getElementById('measurementUnitSearch')?.value || '').trim().toLowerCase();
    const sourceGroup = String(document.getElementById('addMeasurementUnitModal')?.dataset.sourceGroup || '').trim().toLowerCase();
    const activeUnits = productState.units.filter(unit => Number(unit.is_active ?? 1) === 1);
    const units = activeUnits.filter(unit => {
        if (group && String(unit.measurement_group).toLowerCase() !== String(group).toLowerCase()) return false;
        return !query || [unit.unit_name, unit.unit_symbol, unit.measurement_group]
            .some(value => String(value || '').toLowerCase().includes(query));
    });
    const container = document.getElementById('measurementUnitCustomizerList');
    if (container) {
        const rows = units.length ? units.map(unit => {
            const id = String(unit.measurement_unit_id);
            const isSystem = Number(unit.is_system ?? 1) === 1;
            const selectable = Boolean(sourceGroup) && String(unit.measurement_group || '').trim().toLowerCase() === sourceGroup;
            return `
            <div class="customizer-row measurement-unit-row${selectable ? ' is-selectable' : ''}" data-id="${escapeHtml(id)}"${selectable ? ` role="option" tabindex="0" aria-label="Select ${escapeHtml(unit.unit_symbol || unit.unit_name)}"` : ''}>
                <span class="measurement-unit-name">${escapeHtml(unit.unit_name)}</span>
                <span class="measurement-unit-symbol">${escapeHtml(unit.unit_symbol || unit.unit_name)}</span>
                <span class="measurement-unit-group">${escapeHtml(unit.measurement_group)}</span>
                <div class="measurement-unit-actions">
                    <button class="btn btn-sm btn-outline-secondary edit-measurement-unit-option" type="button" data-id="${escapeHtml(id)}" data-system="${isSystem ? '1' : '0'}" title="Edit unit" aria-label="Edit unit"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
                    ${isSystem ? `
                    <span class="system-measurement-unit-delete" role="button" tabindex="0" title="Built-in measurement unit cannot be deleted" aria-label="Built-in measurement unit cannot be deleted">
                        <button class="btn btn-sm btn-outline-danger delete-measurement-unit-option" type="button" data-id="${escapeHtml(id)}" disabled aria-hidden="true" tabindex="-1"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                    </span>` : `
                    <button class="btn btn-sm btn-outline-danger delete-measurement-unit-option" type="button" data-id="${escapeHtml(id)}" title="Delete ${escapeHtml(measurementUnitDisplayLabel(unit))}" aria-label="Delete ${escapeHtml(measurementUnitDisplayLabel(unit))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`}
                </div>
            </div>`;
        }).join('') : '<div class="p-3 text-muted text-center">No values found.</div>';
        container.innerHTML = `<div class="measurement-unit-table-header">
            <span>Unit</span><span>Symbol</span><span>Group</span><span>Actions</span>
        </div>${rows}`;
    }
}

function updateClearableInput(input) {
    input?.closest('.clearable-input')?.classList.toggle('has-value', Boolean(input.value));
}

function setMeasurementUnitEditorMode(unit = null) {
    const editing = Boolean(unit?.measurement_unit_id);
    const idInput = document.getElementById('customMeasurementUnitId');
    const nameInput = document.getElementById('newMeasurementUnitName');
    const symbolInput = document.getElementById('newMeasurementUnitSymbol');
    const groupInput = document.getElementById('newMeasurementUnitGroup');
    const cancelButton = document.getElementById('btnCancelMeasurementUnit');
    const saveButton = document.getElementById('btnSaveMeasurementUnit');
    const systemUnit = Number(unit?.is_system ?? 0) === 1;

    if (idInput) idInput.value = editing ? unit.measurement_unit_id : '';
    if (nameInput) nameInput.value = editing ? (unit.unit_name || '') : '';
    if (symbolInput) {
        symbolInput.value = editing ? (unit.unit_symbol || unit.unit_name || '') : '';
        symbolInput.disabled = editing && systemUnit;
    }
    if (groupInput) {
        if (editing) groupInput.value = unit.measurement_group || groupInput.value;
        groupInput.disabled = editing && systemUnit;
    }
    if (cancelButton) {
        cancelButton.textContent = editing ? 'Cancel Edit' : 'Cancel';
        if (editing) cancelButton.removeAttribute('data-bs-dismiss');
        else cancelButton.setAttribute('data-bs-dismiss', 'modal');
    }
    if (saveButton) saveButton.textContent = editing ? 'Save Changes' : 'Save';
    [nameInput, symbolInput].forEach(updateClearableInput);
}

async function openMeasurementUnitCustomizer(group = '', sourceSelect = null) {
    await loadProductConfiguration(productState.configurationTypeId || getValue('productType') || getValue('editProductType'));
    const groupSelect = document.getElementById('newMeasurementUnitGroup');
    groupSelect.innerHTML = productState.measurementGroups.map(value => `<option ${value === group ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
    if (!groupSelect.value && productState.measurementGroups.length) groupSelect.value = productState.measurementGroups[0];
    const filterSelect = document.getElementById('measurementUnitGroupFilter');
    filterSelect.innerHTML = `<option value="">All Measurement Groups</option>${productState.measurementGroups.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
    filterSelect.value = productState.measurementGroups.some(value => String(value).toLowerCase() === String(group).toLowerCase()) ? group : '';
    document.getElementById('addMeasurementUnitModal').dataset.sourceGroup = group;
    document.getElementById('addMeasurementUnitModal')._sourceSelect = sourceSelect;
    setMeasurementUnitEditorMode();
    document.getElementById('measurementUnitSearch').value = '';
    ['measurementUnitSearch', 'newMeasurementUnitName', 'newMeasurementUnitSymbol'].forEach(id => updateClearableInput(document.getElementById(id)));
    renderMeasurementUnits(filterSelect.value);
    showCustomizerError('customMeasurementUnitError');
    showNestedModal('addMeasurementUnitModal');
}

function selectMeasurementUnitFromManager(unitId) {
    const modal = document.getElementById('addMeasurementUnitModal');
    const sourceSelect = modal?._sourceSelect;
    const unit = productState.units.find(item => String(item.measurement_unit_id) === String(unitId));
    const expectedGroup = String(modal?.dataset.sourceGroup || '').trim().toLowerCase();
    if (!sourceSelect || !unit || String(unit.measurement_group || '').trim().toLowerCase() !== expectedGroup) return;
    sourceSelect.value = unit.measurement_unit_id;
    sourceSelect.dataset.previousValue = unit.measurement_unit_id;
    syncMeasurementSelect(sourceSelect);
    sourceSelect.dispatchEvent(new Event('change', { bubbles:true }));
    bootstrap.Modal.getInstance(modal)?.hide();
    sourceSelect._measurementTrigger?.focus();
}

async function removeMeasurementUnit(unit) {
    if (!unit?.measurement_unit_id) throw new Error('Unable to delete measurement unit.');
    if (Number(unit.is_system ?? 1) === 1) throw new Error('Built-in measurement unit cannot be deleted.');
    const confirmation = await Swal.fire({
        icon: 'warning',
        title: 'Delete Measurement Unit?',
        text: `Are you sure you want to delete "${measurementUnitDisplayLabel(unit)}"?`,
        showCancelButton: true,
        confirmButtonText: 'Delete',
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
        body: JSON.stringify({ measurement_unit_id: unit.measurement_unit_id })
    });
    preserved.forEach(variation => {
        if (String(variation.inventory_unit_id) === String(unit.measurement_unit_id)) variation.inventory_unit_id = '';
        (variation.specifications || []).forEach(value => {
            if (String(value.measurement_unit_id) === String(unit.measurement_unit_id)) value.measurement_unit_id = '';
        });
    });
    await loadMeasurementUnitCache({ forceRefresh:true });
    if (addContainer) renderAddVariations({ variations: preserved }, getSelectedAddCategoryName());
    if (editContainer) renderEditVariations({ variations: preserved }, document.getElementById('editProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '');
    renderMeasurementUnits(document.getElementById('measurementUnitGroupFilter')?.value || '');
    refreshMeasurementUnitDropdowns();
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
    initMeasurementUnitDropdowns();

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
        const editButton = event.target.closest('.edit-product-type-option');
        if (editButton) {
            setProductTypeEditor({ type_id: editButton.dataset.id, type_name: editButton.dataset.name });
            document.getElementById('newProductTypeName')?.focus();
            return;
        }
        const deleteButton = event.target.closest('.delete-product-type-option');
        if (!deleteButton) return;
        deleteProductType(deleteButton.dataset.id, deleteButton.dataset.name).catch(error => {
            showCustomizerError('customProductTypeError', error.message);
            Swal.fire({ icon: 'error', title: 'Product Type Not Deleted', text: error.message, confirmButtonText: 'OK', customClass: { container: 'product-specification-confirmation' } });
        });
    });
    document.getElementById('btnCancelProductTypeEdit')?.addEventListener('click', () => {
        if (getValue('customProductTypeId')) {
            setProductTypeEditor();
            return;
        }
        bootstrap.Modal.getInstance(document.getElementById('addProductTypeModal'))?.hide();
    });
    document.getElementById('addProductTypeForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const categoryId = getValue('newProductTypeCategory');
            const mode = productTypeCustomizerTarget.mode;
            const containerSelector = mode === 'edit' ? '#editVariationList' : '#addVariationList';
            const variations = collectVariationEntries(containerSelector);
            const editing = Boolean(getValue('customProductTypeId'));
            const medicine = categoryNameById(categoryId) === 'Medicine';
            const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/add_product_type.php`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type_id: getValue('customProductTypeId'), category_id: categoryId, type_name: getValue('newProductTypeName'), specification_pattern: medicine && !editing ? getValue('dosageFormSpecificationPattern') : '' }) });
            referenceCache.typesByCategory.delete(String(categoryId));
            invalidateProductConfiguration(response.type.type_id);
            productState.types = await cachedProductTypes(categoryId, true);
            const targetIndex = Math.min(productTypeCustomizerTarget.variationIndex, Math.max(0, variations.length - 1));
            if (!variations[targetIndex]) variations.push({});
            if (!editing) {
                variations[targetIndex].type_id = response.type.type_id;
                variations[targetIndex].type_name = response.type.type_name;
                variations[targetIndex].specifications = [];
            } else if (String(variations[targetIndex].type_id) === String(response.type.type_id)) {
                variations[targetIndex].type_name = response.type.type_name;
            }
            const selectedTypeId = editing
                ? (variations[targetIndex].type_id || getValue(mode === 'edit' ? 'editProductType' : 'productType'))
                : response.type.type_id;
            if (targetIndex === 0) {
                if (mode === 'edit') await populateEditTypes(categoryId, selectedTypeId);
                else await populateAddTypes(categoryId, selectedTypeId);
                const shared = document.getElementById(mode === 'edit' ? 'editProductType' : 'productType');
                if (shared) shared.dataset.previousValue = selectedTypeId;
            }
            if (selectedTypeId) await loadProductConfiguration(selectedTypeId);
            const categoryName = categoryNameById(categoryId);
            if (mode === 'edit') renderEditVariations({ variations }, categoryName);
            else renderAddVariations({ variations }, categoryName);
            bootstrap.Modal.getInstance(document.getElementById('addProductTypeModal'))?.hide();
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
        const protectedDelete = event.target.closest('.system-measurement-unit-delete');
        if (protectedDelete) {
            event.preventDefault();
            event.stopPropagation();
            const message = 'Built-in measurement unit cannot be deleted.';
            showCustomizerError('customMeasurementUnitError', message);
            PharmaUtils.toast.warning(message);
            return;
        }
        const deleteButton = event.target.closest('.delete-measurement-unit-option');
        if (deleteButton) {
            event.preventDefault();
            event.stopPropagation();
            const unit = productState.units.find(item => String(item.measurement_unit_id) === String(deleteButton.dataset.id));
            try {
                if (!unit) throw new Error('Unable to delete measurement unit.');
                await removeMeasurementUnit(unit);
            } catch (error) {
                const message = error?.message || 'Unable to delete measurement unit.';
                console.error('Unable to delete measurement unit.', error);
                showCustomizerError('customMeasurementUnitError', message);
                PharmaUtils.toast.error(message);
            }
            return;
        }
        const button = event.target.closest('.edit-measurement-unit-option');
        if (button) {
            event.preventDefault();
            event.stopPropagation();
            const unit = productState.units.find(item => String(item.measurement_unit_id) === String(button.dataset.id));
            if (!unit) return;
            setMeasurementUnitEditorMode(unit);
            document.getElementById('newMeasurementUnitName').focus();
            return;
        }
        const row = event.target.closest('.measurement-unit-row.is-selectable');
        if (row) selectMeasurementUnitFromManager(row.dataset.id);
    });
    document.getElementById('measurementUnitCustomizerList')?.addEventListener('keydown', event => {
        const protectedDelete = event.target.closest('.system-measurement-unit-delete');
        if (protectedDelete && ['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            const message = 'Built-in measurement unit cannot be deleted.';
            showCustomizerError('customMeasurementUnitError', message);
            PharmaUtils.toast.warning(message);
            return;
        }
        if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
        const row = event.target.closest('.measurement-unit-row.is-selectable');
        if (!row) return;
        event.preventDefault();
        selectMeasurementUnitFromManager(row.dataset.id);
    });
    document.getElementById('btnCancelMeasurementUnit')?.addEventListener('click', event => {
        if (!getValue('customMeasurementUnitId')) return;
        event.preventDefault();
        event.stopPropagation();
        setMeasurementUnitEditorMode();
        showCustomizerError('customMeasurementUnitError');
        document.getElementById('newMeasurementUnitName')?.focus();
    });
    document.getElementById('addMeasurementUnitForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const modal = document.getElementById('addMeasurementUnitModal');
        const sourceSelect = modal._sourceSelect;
        const addContainer = sourceSelect?.closest('#addVariationList');
        const editContainer = sourceSelect?.closest('#editVariationList');
        const preserved = addContainer ? collectAddVariations() : (editContainer ? collectEditVariations() : []);
        const sourceEntryIndex = sourceSelect ? Array.from(sourceSelect.closest(addContainer ? '#addVariationList' : '#editVariationList').querySelectorAll('.edit-variation-entry')).indexOf(sourceSelect.closest('.edit-variation-entry')) : -1;
        const sourceSpecificationField = sourceSelect?.closest('.specification-field');
        const specificationId = sourceSelect?.matches('.medicine-denominator-unit')
            ? (sourceSpecificationField?.dataset.denominatorSpecificationId || '')
            : (sourceSpecificationField?.dataset.specificationId || '');
        try {
            const editingUnitId = getValue('customMeasurementUnitId');
            const proposedName = getValue('newMeasurementUnitName');
            const proposedSymbol = getValue('newMeasurementUnitSymbol') || proposedName;
            if (/(?:[⁄/\\]|\bper\b|^\s*\d+(?:\.\d+)?\s*(?:mg|g|mcg|kg|iu|%|ml|l|tablet|capsule|piece|bottle|vial|ampule|sachet|box)\s*$)/iu.test(proposedName)
                || /(?:[⁄/\\]|\bper\b|^\s*\d+(?:\.\d+)?\s*(?:mg|g|mcg|kg|iu|%|ml|l|tablet|capsule|piece|bottle|vial|ampule|sachet|box)\s*$)/iu.test(proposedSymbol)) {
                throw new Error('Measurement units must be atomic and reusable (for example: mg, mL, tablet, or bottle). Enter concentration values in the Medicine Strength fields.');
            }
            const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/add_measurement_unit.php`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ measurement_unit_id: getValue('customMeasurementUnitId'), unit_name: getValue('newMeasurementUnitName'), unit_symbol: getValue('newMeasurementUnitSymbol'), measurement_group: getValue('newMeasurementUnitGroup') }) });
            await loadMeasurementUnitCache({ forceRefresh: true });
            if (!editingUnitId && sourceEntryIndex >= 0) {
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
            setMeasurementUnitEditorMode();
            bootstrap.Modal.getInstance(modal)?.hide();
            const refreshedContainer = addContainer
                ? document.getElementById('addVariationList')
                : (editContainer ? document.getElementById('editVariationList') : null);
            const refreshedEntry = refreshedContainer?.querySelectorAll('.edit-variation-entry')?.[sourceEntryIndex];
            const refreshedSource = sourceSelect?.matches('.edit-var-inventory-unit')
                ? refreshedEntry?.querySelector('.edit-var-inventory-unit')
                : (sourceSelect?.matches('.medicine-denominator-unit')
                    ? refreshedEntry?.querySelector('.medicine-denominator-unit')
                    : (sourceSelect?.matches('.dynamic-package-unit')
                        ? refreshedEntry?.querySelector('.dynamic-package-unit')
                        : Array.from(refreshedEntry?.querySelectorAll('.specification-field') || [])
                            .find(field => String(field.dataset.specificationId) === String(specificationId))
                            ?.querySelector('.dynamic-spec-unit')));
            refreshMeasurementUnitDropdowns(refreshedContainer || document);
            refreshedSource?._measurementTrigger?.focus();
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

window.addEventListener('products:created', (event) => publishDataUpdate('product-updated', event.detail || {}));
window.addEventListener('products:changed', (event) => publishDataUpdate('product-updated', event.detail || {}));

// Populate suppliers when add product modal opens
const _addProductModalEl = document.getElementById('addProductModal');
if (_addProductModalEl) {
    _addProductModalEl.addEventListener('show.bs.modal', () => {
        clearProductFormValidation(document.getElementById('addProductForm'));
        populateSupplierDropdown();
        populateMedicineClassificationSelects().catch(err => console.warn('Failed to load medicine classifications:', err.message || err));
        const prefilledVariant = document.getElementById('addProductForm')?.dataset.prefillMode === 'variant';
        if (prefilledVariant) return;
        setMedicineFields('add', '');
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
