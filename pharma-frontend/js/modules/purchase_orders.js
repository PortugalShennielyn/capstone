import PharmaUtils from '../utils.js';
import { formatProductIdentity, formatProductSpecification } from './product_specification.js';
import { purchasingConversion, inventoryQuantityFromPurchase } from './purchasing_conversion.js?v=1';

const PURCHASE_ORDER_RUNTIME_VERSION = '70-po-total-column';
document.documentElement.dataset.purchaseOrderRuntime = PURCHASE_ORDER_RUNTIME_VERSION;

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const STATUS_META = {
    'Pending': '#f59e0b',
    'In transit': '#06b6d4',
    'Arrived': '#8b5cf6',
    'Delivered': '#16a34a',
    'Cancelled': '#64748b'
};

const OPEN_CLAIMS_META = { label: 'Open Claims', color: '#ef4444' };

const STATUS_LABELS = {
    'In transit': 'In Transit'
};

const createDraftItems = [];
const editDraftItems = [];
let activeReceiveOrder = null;
let activeReturnOrder = null;
let supplierCache = [];
let currentPoView = 'active';
let purchaseOrdersInitialized = false;
let purchaseOrdersLoadToken = 0;
let lastStatusSummaryHtml = '';
let currentRenderedTableHead = '';
let selectedCreateDraftIndex = null;
let activeEditOrder = null;
let activeViewOrder = null;
let editMajorFieldsLocked = false;
let editingPoItemId = null;
let editingPoItemKey = null;
let editDraftClientSequence = 0;
let editItemActionBusy = false;
let inspectionQueueOrders = [];
let activeInspectionProductIndex = 0;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function fetchJson(url, options = {}) {
    return PharmaUtils.safeFetch(url, { credentials: 'include', ...options });
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('drpTheme', theme);
}

function formatDate(value) {
    if (!value) return 'Not set';
    const text = String(value);
    const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnlyMatch
        ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
        : new Date(text.replace(' ', 'T'));
    return Number.isNaN(date.getTime())
        ? escapeHtml(value)
        : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function money(value) {
    return Number(value || 0).toFixed(2);
}

function peso(value) {
    const numericValue = Number(value || 0);
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(Math.abs(numericValue) < 0.005 ? 0 : numericValue);
}

const REASON_OPTIONS = [
    'Wrong supplier',
    'Wrong item',
    'Wrong quantity',
    'Price too high',
    'Duplicate PO',
    'Budget issue',
    'Need revision',
    'Other'
];

const CANCEL_REASON_OPTIONS = [
    'Ordered by mistake',
    'Wrong supplier',
    'Wrong item',
    'Wrong quantity',
    'Price issue',
    'Duplicate PO',
    'Supplier unavailable',
    'Other'
];

function wordCount(value) {
    return cleanText(value).split(/\s+/).filter(Boolean).length;
}

async function requestControlledReason({ title, label, confirmButtonText, errorMessage, confirmColor = '#7c3aed', options = REASON_OPTIONS }) {
    if (!window.Swal) {
        const fallback = prompt(label || title) || '';
        if (!fallback.trim()) {
            PharmaUtils.toast.error(errorMessage);
            return '';
        }
        return fallback.trim();
    }

    const selectOptions = options.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('');
    const result = await Swal.fire({
        title,
        html: `
            <div class="text-start">
                <label class="form-label fw-semibold" for="poReasonSelect">${escapeHtml(label)}</label>
                <select id="poReasonSelect" class="form-select">
                    <option value="" selected disabled>Select reason...</option>
                    ${selectOptions}
                </select>
                <div id="poReasonOtherWrap" class="mt-3 d-none">
                    <label class="form-label fw-semibold" for="poReasonOther">Manual reason</label>
                    <textarea id="poReasonOther" class="form-control" rows="3" maxlength="220" placeholder="Enter a short reason..."></textarea>
                    <div class="small text-muted mt-1"><span id="poReasonWordCount">0</span>/20 words</div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText,
        confirmButtonColor: confirmColor,
        didOpen: () => {
            const select = document.getElementById('poReasonSelect');
            const wrap = document.getElementById('poReasonOtherWrap');
            const textarea = document.getElementById('poReasonOther');
            const counter = document.getElementById('poReasonWordCount');
            const update = () => {
                wrap?.classList.toggle('d-none', select?.value !== 'Other');
                if (counter && textarea) counter.textContent = String(wordCount(textarea.value));
            };
            select?.addEventListener('change', update);
            textarea?.addEventListener('input', update);
            update();
        },
        preConfirm: () => {
            const selected = document.getElementById('poReasonSelect')?.value || '';
            const manual = cleanText(document.getElementById('poReasonOther')?.value || '');
            if (!selected) {
                Swal.showValidationMessage('Select a reason.');
                return false;
            }
            if (selected === 'Other') {
                const count = wordCount(manual);
                if (!manual) {
                    Swal.showValidationMessage('Enter the manual reason.');
                    return false;
                }
                if (count > 20) {
                    Swal.showValidationMessage('Manual reason must be 20 words or fewer.');
                    return false;
                }
                return manual;
            }
            return selected;
        }
    });

    return result.isConfirmed ? cleanText(result.value) : '';
}

function cleanText(value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return ['N/A', 'NA', 'NULL', 'NONE'].includes(text.toUpperCase()) ? '' : text;
}

function displayText(value) {
    const text = cleanText(value);
    return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function displayDetailText(value) {
    const text = cleanText(value);
    return /^[a-z]/.test(text) ? displayText(text) : text;
}

function compactMeasurement(value) {
    return displayDetailText(value)
        .replace(/(\d)\s+([a-zA-Z%]+)/g, '$1$2')
        .replace(/\s+/g, ' ')
        .trim();
}

function attributeNumber(value) {
    const text = cleanText(value);
    if (!text || !/^-?\d+(?:\.0+)?$|^-?\d+\.\d+$/.test(text)) return text;
    return String(Number(text));
}

function measurementWithUnit(value, unit) {
    const amount = attributeNumber(value);
    const unitText = cleanText(unit);
    if (!amount) return '';
    if (!unitText || /[a-zA-Z%]+/.test(amount)) return amount;
    return `${amount} ${unitText}`;
}

function groceryNetWeightDisplay(item, fallback = '') {
    return measurementWithUnit(item.weight_volume_value || item.net_weight, item.weight_volume_unit || item.grocery_unit) || fallback;
}

function medicineStrengthDisplay(item) {
    const strength = measurementWithUnit(item.strength_value, item.strength_unit);
    if (strength) return strength;
    return cleanText(item.strength_size_display || item.strength_size_value || item.strength) || '';
}

function medicineNetContentDisplay(item) {
    return measurementWithUnit(item.net_content_value || item.volume_value, item.net_content_unit || item.volume_unit);
}

function removePrefix(value, prefix) {
    const text = cleanText(value).replace(/^[\s-]+|[\s-]+$/g, '');
    const label = cleanText(prefix);

    if (!text || !label) return text;
    if (text.toLowerCase() === label.toLowerCase()) return text;

    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text
        .replace(new RegExp(`^${escapedLabel}\\s*[-:]\\s*`, 'i'), '')
        .replace(new RegExp(`^${escapedLabel}\\s+`, 'i'), '')
        .trim() || text;
}

function removeBrandPrefix(productName, brandName) {
    const product = cleanText(productName).replace(/^[\s-]+|[\s-]+$/g, '');
    const brand = cleanText(brandName);

    if (!product || !brand) return product;
    if (product.toLowerCase() === brand.toLowerCase()) return product;

    const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return product
        .replace(new RegExp(`^${escapedBrand}\\s*[-:]\\s*`, 'i'), '')
        .replace(new RegExp(`^${escapedBrand}\\s+`, 'i'), '')
        .trim() || product;
}

function productDisplayParts(item) {
    const brand = cleanText(item.brand_name);
    const productName = cleanText(item.product_name);
    const rawVariant = cleanText(item.variant_flavor);
    const category = cleanText(item.category_name).toLowerCase();
    const variant = category === 'grocery' && rawVariant.length <= 24 ? rawVariant : '';
    const productLooksLikeBrand = productName && brand && !productName.toLowerCase().includes(brand.toLowerCase()) && !brand.toLowerCase().includes(productName.toLowerCase()) && !productName.includes(' ') && brand.includes(' ');
    const productWithoutBrand = removeBrandPrefix(productName, brand);
    const displayBrand = variant ? productName : (productLooksLikeBrand ? productName : brand);
    const baseProduct = variant || (productLooksLikeBrand ? brand : productWithoutBrand) || productName;
    const strength = medicineStrengthDisplay(item);
    const netWeight = groceryNetWeightDisplay(item);
    const size = displayDetailText(item.size_display || item.size_value);
    const identifier = category === 'medicine'
        ? strength
        : (category === 'grocery' ? (netWeight || size) : '');
    const displayProduct = identifier && !baseProduct.toLowerCase().includes(identifier.toLowerCase())
        ? `${baseProduct} ${identifier}`
        : baseProduct;

    return {
        brand: displayBrand || brand,
        product: removePrefix(displayProduct, displayBrand),
        rawProduct: productName
    };
}

function productDropdownLabel(product) {
    const identity = formatProductIdentity(product);
    const specification = formatProductSpecification(product, '');
    return [identity, specification].filter(Boolean).join(' \u2022 ');
}

function productOptionDetail(product) {
    return formatProductSpecification(product, '');
}

function productCoreName(item) {
    const brand = cleanText(item.brand_name);
    const productName = cleanText(item.product_name);
    const rawVariant = cleanText(item.variant_flavor);
    const tableName = cleanText(item.product_display_name);
    const size = productSizeOnlyValue(item) || productSizeValue(item);
    const packaging = productPackagingValue(item);
    const swappedBrand = productName && brand && !productName.toLowerCase().includes(brand.toLowerCase()) && !brand.toLowerCase().includes(productName.toLowerCase()) && !productName.includes(' ') && brand.includes(' ');
    const rawProduct = swappedBrand ? brand : removeBrandPrefix(productName, brand);
    let name = rawProduct;

    if (!name) name = tableName || rawProduct || cleanText(item.product_name);
    [rawVariant, size, packaging].filter(Boolean).forEach((part) => {
        const escapedPart = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        name = name.replace(new RegExp(`\\s*[-:]?\\s*${escapedPart}\\s*$`, 'i'), '').trim() || name;
    });

    return name || tableName || cleanText(item.product_name);
}

function poBrandName(item) {
    return cleanText(item.brand_name) || cleanText(item.brand_display_name);
}

function productSizeValue(item) {
    const category = cleanText(item.category_name).toLowerCase();
    if (category === 'grocery') {
        return groceryNetWeightDisplay(item) || compactMeasurement(item.size_display || item.size_value);
    }
    if (category === 'medicine') {
        return medicineStrengthDisplay(item);
    }

    return compactMeasurement(
        item.size_display
        || item.size_value
        || sizeDisplayFromDetails(item)
    );
}

function productStrengthValue(item) {
    const category = cleanText(item.category_name).toLowerCase();
    if (category !== 'medicine') return '';

    return medicineStrengthDisplay(item);
}

function productSizeOnlyValue(item) {
    const category = cleanText(item.category_name).toLowerCase();
    if (category === 'medicine') return '';
    if (category === 'grocery') {
        return groceryNetWeightDisplay(item) || compactMeasurement(item.size_display || item.size_value || sizeDisplayFromDetails(item));
    }

    return compactMeasurement(
        item.weight_volume_value
        || item.size_display
        || item.size_value
        || sizeDisplayFromDetails(item)
    );
}

function productPackagingValue(item) {
    return displayDetailText(item.packaging || item.package_type);
}

function sameText(left, right) {
    return cleanText(left).toLowerCase() === cleanText(right).toLowerCase();
}

function pluralizeUnit(unit, quantity = 2) {
    const raw = cleanText(unit || 'pcs');
    const lower = raw.toLowerCase();
    const fixedUnits = {
        pcs: 'pcs',
        pc: 'pcs',
        mg: 'mg',
        mcg: 'mcg',
        g: 'g',
        kg: 'kg',
        ml: 'mL',
        l: 'L'
    };
    const text = fixedUnits[lower] || displayDetailText(raw);
    if (Number(quantity) === 1) return text;
    if (/s$/i.test(text)) return text;
    if (/y$/i.test(text)) return text.replace(/y$/i, 'ies');
    if (/(x|z|ch|sh)$/i.test(text)) return `${text}es`;
    return `${text}s`;
}

function pluralizeStockUnit(unit, quantity = 2) {
    const raw = cleanText(unit || 'pcs');
    const lower = raw.toLowerCase();
    const fixedUnits = {
        pcs: 'pcs',
        pc: 'pcs',
        piece: 'pcs',
        pieces: 'pcs',
        can: 'cans',
        cans: 'cans',
        bottle: 'bottles',
        bottles: 'bottles',
        pack: 'packs',
        packs: 'packs',
        sachet: 'sachets',
        sachets: 'sachets',
        'blister pack': 'pcs',
        blister: 'pcs'
    };
    const text = fixedUnits[lower] || displayDetailText(raw);
    if (Number(quantity) === 1) {
        if (['cans', 'bottles', 'packs', 'sachets'].includes(text.toLowerCase())) {
            return text.replace(/s$/i, '');
        }
        return text;
    }
    if (/s$/i.test(text)) return text;
    if (/y$/i.test(text)) return text.replace(/y$/i, 'ies');
    return `${text}s`;
}

function stockCountUnit(item, quantity = 2) {
    const packaging = cleanText(productPackagingValue(item)).toLowerCase();
    const unit = cleanText(item.unit || unitDisplayFromDetails(item)).toLowerCase();
    const packageMap = {
        can: 'can',
        cans: 'can',
        bottle: 'bottle',
        bottles: 'bottle',
        pack: 'pack',
        packs: 'pack',
        sachet: 'sachet',
        sachets: 'sachet'
    };

    if (packageMap[packaging]) return pluralizeStockUnit(packageMap[packaging], quantity);
    if (packaging === 'blister pack') return 'pcs';
    if (['g', 'gram', 'grams', 'kg', 'mg', 'mcg', 'ml', 'l'].includes(unit)) {
        return 'pcs';
    }
    return pluralizeStockUnit(unit || 'pcs', quantity);
}

function packageContentUnitText(unit) {
    const text = cleanText(unit || 'pcs');
    const lower = text.toLowerCase();
    if (['pc', 'pcs', 'piece', 'pieces'].includes(lower)) return 'pc';
    return displayDetailText(text);
}

function inventoryQuantityLabel(quantity, unit) {
    const count = Number(quantity || 0);
    const unitLabel = packageContentUnitText(unit);
    if (count === 1) return `1 ${unitLabel}`;
    if (unitLabel.toLowerCase() === 'pc') return `${count} pcs`;
    return `${count} ${displayDetailText(pluralizeStockUnit(unitLabel, count))}`;
}

function quantityWithInventoryUnit(item, quantity) {
    const count = Number(quantity || 0);
    return inventoryQuantityLabel(count, stockCountUnit(item, count));
}

function purchaseUnitQuantityLabel(item) {
    const quantity = Number(item.purchase_qty || item.quantity || 0);
    const purchaseUnit = purchaseUnitInfo(item).purchaseUnit || 'Package';
    const unit = pluralizeUnit(purchaseUnit, quantity);
    return `${quantity} ${unit}`;
}

function unitPriceLabel(unit) {
    const text = cleanText(unit || 'pc');
    return text.toLowerCase() === 'pcs' ? 'pc' : text;
}

function normalizePurchaseUnit(unit) {
    const text = cleanText(unit).replace(/^by\s+/i, '').trim();
    const lower = text.toLowerCase();
    if (['pc', 'piece', 'pieces'].includes(lower)) return 'pcs';
    return text;
}

function parsePackContent(value) {
    const text = cleanText(value);
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (!match) {
        return { quantity: 1, unit: '', label: text };
    }

    const quantity = Number(match[1]);
    const unit = cleanText(match[2]);
    return {
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit,
        label: [match[1], unit].filter(Boolean).join(' ')
    };
}

function purchaseUnitInfo(item) {
    const suppliedUnit = normalizePurchaseUnit(item.purchase_unit);
    const suppliedQty = Number(item.units_per_purchase_unit || item.purchase_unit_qty || 0);
    const packaging = productPackagingValue(item) || 'Unit';
    const supplierPackage = suppliedUnit || 'Box';
    const quantity = suppliedQty > 0 ? suppliedQty : 1;
    const containerText = stockCountUnit(item, quantity);
    const singleContainerText = stockCountUnit(item, 1);
    const packageText = displayText(supplierPackage);
    const unitLabel = quantity > 1 ? `${packageText} (${quantity} ${containerText})` : packageText;
    const displayContainerText = packageContentUnitText(containerText);
    const displaySingleContainerText = packageContentUnitText(singleContainerText);
    const packageContentsLabel = inventoryQuantityLabel(quantity, quantity === 1 ? displaySingleContainerText : displayContainerText);
    const conversion = `1 ${packageText} = ${packageContentsLabel}`;

    return {
        label: unitLabel || 'Unit',
        conversion,
        purchaseUnit: packageText,
        quantity,
        stockUnit: displayContainerText,
        singleStockUnit: displaySingleContainerText,
        packaging: displayText(packaging),
        containsLabel: packageContentsLabel,
        packageContentsLabel,
        unitContainsLabel: packageContentsLabel,
        conversionNote: conversion
    };
}

function supplierCostUnitLabel(item) {
    const purchaseUnit = purchaseUnitInfo(item);
    return item.cost_basis === 'purchase_unit'
        ? (purchaseUnit.purchaseUnit || 'purchase unit')
        : unitPriceLabel(purchaseUnit.singleStockUnit);
}

function productTableName(item) {
    return cleanText(item.product_display_name) || productDisplayParts(item).product || cleanText(item.product_name);
}

function inactivePoProductWarning(item) {
    return String(item?.product_status || 'Active').toLowerCase() === 'inactive'
        ? '<span class="small text-danger fw-bold d-block mt-1"><i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>Product is inactive. Review this item before receiving.</span>'
        : '';
}

function productTableBrand(item) {
    return cleanText(item.brand_name) || cleanText(item.brand_display_name) || productDisplayParts(item).brand;
}

function productTableProductName(item) {
    const brand = cleanText(item.brand_name);
    const productName = cleanText(item.product_name);
    const productLabel = cleanText(item.product_display_name);
    const rawVariant = cleanText(item.variant_flavor);
    const size = productSizeOnlyValue(item) || productSizeValue(item);
    const packaging = productPackagingValue(item);
    let baseName = removeBrandPrefix(productName, brand);

    [rawVariant, size, packaging].filter(Boolean).forEach((part) => {
        const escapedPart = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        baseName = baseName.replace(new RegExp(`\\s*[-:]?\\s*${escapedPart}\\s*$`, 'i'), '').trim();
    });

    if (!baseName || sameText(baseName, brand)) {
        baseName = removeBrandPrefix(productLabel, brand)
            || productDisplayParts(item).product
            || productCoreName(item);
    }

    if (sameText(baseName, brand)) {
        baseName = rawVariant || productLabel || productName;
    }

    return baseName || productTableName(item) || 'Unnamed product';
}

function productSpecification(item) {
    const category = cleanText(item.category_name).toLowerCase();
    const variant = cleanText(item.variant_flavor);
    const generic = cleanText(item.generic_name);
    const strength = productStrengthValue(item);
    const netWeight = category === 'medicine' ? '' : (groceryNetWeightDisplay(item) || compactMeasurement(item.size_value || item.size_display));
    const volume = category === 'medicine' ? medicineNetContentDisplay(item) : '';
    const form = cleanText(item.dosage_form || item.type_name);
    const packaging = productPackagingValue(item);
    const parts = category === 'medicine'
        ? [generic, strength, volume, form || packaging]
        : [variant, netWeight, packaging];
    const seen = new Set();

    return parts
        .map((part) => displayDetailText(part))
        .filter((part) => {
            if (!part || ['medicine', 'grocery'].includes(part.toLowerCase())) return false;
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(' \u2022 ');
}

function productDisplayWithSpecification(item) {
    const productName = productCoreName(item) || cleanText(item.product_name) || 'Unnamed product';
    const specification = productSpecification(item);
    return [productName, specification].filter(Boolean).join(' \u2014 ');
}

function productNetWeightLabel(item) {
    return productSizeOnlyValue(item) || productSizeValue(item) || '-';
}

function productTableValueList(items, valueGetter, fallbackNames = [], options = {}) {
    const sourceItems = Array.isArray(items) && items.length ? items : [];
    const className = options.className ? ` ${options.className}` : '';

    if (!sourceItems.length) {
        return numberedList(fallbackNames);
    }

    return `
        <ol class="po-line-list${className}">
            ${sourceItems.map((item, index) => {
                const value = cleanText(valueGetter(item)) || '-';
                return `
                    <li>
                        <span class="line-index">${index + 1}.</span>
                        <span class="line-text">${escapeHtml(value)}</span>
                    </li>
                `;
            }).join('')}
        </ol>
    `;
}

function productTableCellList(items, fallbackNames = []) {
    return productTableValueList(items, productTableProductName, fallbackNames, { className: 'po-product-lines' });
}

function brandTableCellList(items) {
    return productTableValueList(items, productTableBrand, [], { className: 'po-brand-lines' });
}

function specificationTableCellList(items) {
    return productTableValueList(items, productSpecification, [], { className: 'po-spec-lines' });
}

function purchaseOrderItemsSummary(items = [], fallbackNames = []) {
    const source = items.length ? items : fallbackNames.map((name) => ({ product_name: name }));
    const count = source.length;
    if (!count) {
        return '<div class="po-items-summary"><strong>No products</strong></div>';
    }

    const fullProductName = (item) => cleanText(item.product_name) || productTableProductName(item) || 'Unnamed product';
    const firstItem = source[0];
    const firstName = fullProductName(firstItem);
    const brand = cleanText(firstItem.brand_name);
    const secondary = count > 1 ? `+${count - 1} more` : (brand && brand.toLowerCase() !== firstName.toLowerCase() ? brand : '');
    const allNames = source.map(fullProductName).join(', ');

    return `<div class="po-items-summary" title="${escapeHtml(allNames)}"><strong>${escapeHtml(firstName)}</strong>${secondary ? `<span>${escapeHtml(secondary)}</span>` : ''}</div>`;
}

function unitDisplayFromDetails(item) {
    const category = cleanText(item.category_name).toLowerCase();
    const dosageForm = cleanText(item.dosage_form);
    const productUnit = cleanText(item.product_unit || item.unit || item.measurement_unit_name);
    const pack = parsePackContent(item.pack_content || item.pack_content_unit || '');
    const weightUnit = cleanText(item.weight_volume_unit) || cleanText(item.weight_volume_value).match(/[a-zA-Z%]+$/)?.[0] || '';
    const volumeUnit = cleanText(item.volume_unit) || cleanText(item.volume_value).match(/[a-zA-Z%]+$/)?.[0] || '';
    const strengthUnit = cleanText(item.strength_unit) || cleanText(item.strength_value).match(/[a-zA-Z%]+$/)?.[0] || '';

    if (category === 'medicine' && /^(tablet|capsule|caplet)$/i.test(dosageForm)) {
        return 'pcs';
    }

    if (category === 'medicine' && /\b(liquid|syrup|solution|suspension|drops)\b/i.test(dosageForm)) {
        return volumeUnit || 'mL';
    }

    if (category === 'grocery') {
        return pack.unit || weightUnit || volumeUnit || productUnit || 'pcs';
    }

    return displayText(productUnit || volumeUnit || strengthUnit || pack.unit || 'pcs');
}

function sizeDisplayFromDetails(item) {
    const weight = groceryNetWeightDisplay(item);
    const volume = [cleanText(item.volume_value), cleanText(item.volume_unit)].filter(Boolean).join(' ');
    return weight || volume || cleanText(item.size_value);
}

function statusBadge(status) {
    const color = STATUS_META[status] || '#64748b';
    return `<span class="badge status-badge text-white" style="background:${color}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function purchaseOrderStatusStack(order) {
    const claimBadge = cleanText(order.open_claim_badge);
    return `<div class="po-status-stack">${statusBadge(order.status)}${claimBadge ? `<span class="po-claim-badge">${escapeHtml(claimBadge)}</span>` : ''}</div>`;
}

function paymentStatusBadge(status = 'Unpaid') {
    const current = status === 'Fully Paid' ? 'Paid' : status;
    const normalized = ['Unpaid', 'Partially Paid', 'Paid'].includes(current) ? current : 'Unpaid';
    return `<span class="po-payment-badge ${normalized.toLowerCase().replaceAll(' ', '-')}">${escapeHtml(normalized)}</span>`;
}

function isPurchaseOrderPaid(status, remainingBalance) {
    return ['Paid', 'Fully Paid'].includes(String(status || '')) || Number(remainingBalance || 0) <= 0;
}

function validNextStatuses(order) {
    const status = order.status || 'Pending';
    const approved = order.approval_status === 'Approved';
    if (status === 'Pending') return approved ? ['In transit', 'Cancelled'] : ['Cancelled'];
    if (status === 'In transit') return ['Arrived', 'Cancelled'];
    if (status === 'Arrived') return ['Cancelled'];
    return [];
}

function isOperationallyLocked(order) {
    return ['In transit', 'Arrived', 'Delivered', 'Cancelled', 'Rejected'].includes(order.status || '');
}

function canEditMajorFields(order) {
    const approval = order.approval_status || 'Pending';
    return !isOperationallyLocked(order) && ['Pending', 'Revision Requested'].includes(approval);
}

function statusActionButton(order) {
    const nextStatuses = validNextStatuses(order);
    if (!nextStatuses.length) return '';
    return `
        <button class="btn btn-sm btn-outline-secondary status-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Change PO Status" aria-label="Change PO Status ${escapeHtml(order.po_number || '')}">
            <i class="fa-solid fa-list-check"></i>
        </button>
    `;
}

function numberedList(values, options = {}) {
    const list = Array.isArray(values) ? values : [];
    const plain = options.plain ? ' po-line-list-plain' : '';

    if (list.length === 0) return '<span class="text-muted">None</span>';

    return `
        <ol class="po-line-list${plain}">
            ${list.map((value, index) => `
                <li>
                    ${options.plain ? '' : `<span class="line-index">${index + 1}.</span>`}
                    <span class="line-text">${escapeHtml(value)}</span>
                </li>
            `).join('')}
        </ol>
    `;
}

function productDetailValue(item, field) {
    const isMedicine = item.category_name === 'Medicine';
    const medicineText = `${item.product_name || ''} ${item.brand_name || ''} ${item.type_name || ''}`.toLowerCase();
    const isLiquid = /\b(liquid|syrup|solution|suspension|drops|betadine|povidone)\b/.test(medicineText);

    if (field === 'genericVariant') {
        return isMedicine ? cleanText(item.generic_name) : cleanText(item.variant_flavor);
    }

    if (field === 'strengthSize') {
        if (isMedicine) {
            return medicineStrengthDisplay(item) || cleanText(item.strength);
        }

        return item.weight_volume_value
            ? groceryNetWeightDisplay(item, 'Not set')
            : cleanText(item.size_value);
    }

    if (field === 'packaging') {
        return cleanText(item.packaging);
    }

    return '';
}

function calculatePurchaseItem(item) {
    const orderQty = Number(item.purchase_qty ?? item.quantity ?? 0);
    const unitsPerPurchaseUnit = Number(item.units_per_purchase_unit ?? item.purchase_unit_qty ?? 1);
    const supplierUnitCost = Number(item.price ?? 0);

    if (!Number.isSafeInteger(orderQty) || orderQty < 1) {
        throw new Error('Order quantity must be a positive whole number.');
    }
    if (!Number.isSafeInteger(unitsPerPurchaseUnit) || unitsPerPurchaseUnit < 1) {
        throw new Error('Units per Purchase Unit must be a positive whole number.');
    }
    if (!Number.isFinite(supplierUnitCost) || supplierUnitCost < 0) {
        throw new Error('Supplier cost must be zero or greater.');
    }

    const totalBaseUnits = orderQty * unitsPerPurchaseUnit;
    const supplierUnitCostCents = Math.round((supplierUnitCost + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(totalBaseUnits) || !Number.isSafeInteger(supplierUnitCostCents)) {
        throw new Error('The purchase quantity or supplier cost is too large.');
    }

    const costQuantity = item.cost_basis === 'purchase_unit' ? orderQty : totalBaseUnits;
    const lineTotalCents = costQuantity * supplierUnitCostCents;
    if (!Number.isSafeInteger(lineTotalCents)) {
        throw new Error('The purchase-order line total is too large.');
    }

    return {
        orderQty,
        unitsPerPurchaseUnit,
        supplierUnitCost: supplierUnitCostCents / 100,
        totalBaseUnits,
        lineTotal: lineTotalCents / 100
    };
}

function applyPurchaseItemCalculation(item) {
    const calculation = calculatePurchaseItem(item);
    item.inventory_qty_ordered = calculation.totalBaseUnits;
    item.supplier_unit_cost = calculation.supplierUnitCost;
    item.line_total = calculation.lineTotal;
    return calculation;
}

function productLineTotal(item) {
    return calculatePurchaseItem(item).lineTotal;
}

function inventoryQtyForItem(item) {
    return calculatePurchaseItem(item).totalBaseUnits;
}

function updateCreateSummary() {
    renderSelectedProductPanel();
}

function readPurchaseUnitOverrides(prefix = 'po') {
    const purchaseUnit = cleanText(document.getElementById(`${prefix}-purchase-unit`)?.value);
    const unitsPerPurchaseUnit = Math.max(1, Number(document.getElementById(`${prefix}-units-per-purchase-unit`)?.value || 1));
    return { purchaseUnit, unitsPerPurchaseUnit };
}

function setCreatePurchaseUnitFields(item) {
    if (!item) {
        setSelectValue('po-purchase-unit', 'Box');
        setValue('po-units-per-purchase-unit', '1');
        return;
    }
    const purchaseUnit = purchaseUnitInfo(item);
    setSelectValue('po-purchase-unit', purchaseUnit.purchaseUnit || 'Box');
    setValue('po-units-per-purchase-unit', purchaseUnit.quantity || 1);
}

function syncPurchaseUnitFieldsFromSelectedProduct() {
    selectedCreateDraftIndex = null;
    const productSelect = document.getElementById('po-product-select');
    const selectedOption = productSelect?.options[productSelect.selectedIndex];
    if (productSelect) productSelect.title = selectedOption?.title || selectedOption?.textContent || '';
    const item = selectedOptionItem('po-product-select', false);
    setCreatePurchaseUnitFields(item);
    const selectedItem = selectedOptionItem('po-product-select');
    const existingItem = selectedItem ? createDraftItemByKey(draftLineKey(selectedItem)) : null;
    if (existingItem) {
        selectedCreateDraftIndex = createDraftItems.indexOf(existingItem);
        setValue('po-quantity', calculatePurchaseItem(existingItem).orderQty);
    } else {
        setValue('po-quantity', 1);
    }
    renderSelectedProductPanel();
}

function selectedOptionItem(selectId = 'po-product-select', useOverrides = true) {
    const productSelect = document.getElementById(selectId);
    const option = productSelect?.options[productSelect.selectedIndex];
    return productSelect?.value && option ? draftItemFromOption(option, 1, selectId === 'po-product-select' && useOverrides ? readPurchaseUnitOverrides('po') : {}) : null;
}

function infoMetric(label, value) {
    const cleanValue = cleanText(value);
    if (!cleanValue) return '';
    return `<div class="po-info-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(cleanValue)}</strong></div>`;
}

function detailMetric(label, value) {
    const cleanValue = cleanText(value) || '-';
    return `<div class="po-info-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(cleanValue)}</strong></div>`;
}

function createProductDetailSnapshot(item = {}) {
    const purchaseUnit = purchaseUnitInfo(item);
    const inventoryQty = Number(item.inventory_qty_ordered || inventoryQtyForItem(item) || 0);
    return {
        brand_name: poBrandName(item),
        product_name: productCoreName(item),
        specification: productSpecification(item),
        category_name: item.category_name,
        type_name: item.type_name,
        generic_name: item.generic_name,
        strength: productStrengthValue(item),
        net_content: medicineNetContentDisplay(item),
        net_weight: productNetWeightLabel(item),
        unit: item.unit || unitDisplayFromDetails(item),
        packaging: item.packaging || productPackagingValue(item),
        shelf_stock: Number(item.shelf_stock || 0),
        storage_stock: Number(item.storage_stock || 0),
        stock: Number(item.stock || 0),
        reorder_level: Number(item.reorder_level || 10),
        supplier_cost: Number(item.price || 0),
        selling_price: Number(item.selling_price || 0),
        purchase_conversion: purchaseUnit.conversionNote || '',
        stock_to_receive: inventoryQty ? quantityWithInventoryUnit(item, inventoryQty) : ''
    };
}

function productDetailsForPreview(item = {}) {
    const details = item.product_details || createProductDetailSnapshot(item);
    const metrics = [
        detailMetric('Brand', details.brand_name),
        detailMetric('Product', details.product_name),
        detailMetric('Specification', details.specification),
        detailMetric('Product Type', details.type_name),
        detailMetric('Shelf Stock', Number(details.shelf_stock || 0)),
        detailMetric('Storage Stock', Number(details.storage_stock || 0)),
        detailMetric('On Hand', Number(details.stock || 0)),
    ];

    return metrics.filter(Boolean).join('');
}

function receiptRow(label, value, options = {}) {
    const cleanValue = cleanText(value) || '-';
    const totalClass = options.strong ? ' po-receipt-row-total' : '';
    const highlightClass = options.highlight ? ' po-receipt-row-highlight' : '';
    return `
        <div class="po-receipt-row${totalClass}${highlightClass}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(cleanValue)}</strong>
        </div>
    `;
}

function selectedSupplierName(prefix = 'po') {
    const select = document.getElementById(`${prefix}-supplier-select`);
    const option = select?.options[select.selectedIndex];
    return cleanText(option?.textContent || '') || 'Not selected';
}

function quantityGroupSummary(items, valueGetter, unitGetter, emptyLabel) {
    const groups = new Map();

    items.forEach((item) => {
        const value = Number(valueGetter(item) || 0);
        if (value <= 0) return;
        const unit = cleanText(unitGetter(item, value) || emptyLabel);
        groups.set(unit, (groups.get(unit) || 0) + value);
    });

    if (groups.size === 0) return `0 ${emptyLabel}`;

    return [...groups.entries()]
        .map(([unit, value]) => `${value} ${unit}`)
        .join(', ');
}

function draftPackageSummary(items) {
    return quantityGroupSummary(
        items,
        (item) => Number(item.purchase_qty || item.quantity || 0),
        (item, value) => pluralizeUnit(purchaseUnitInfo(item).purchaseUnit || 'package', value),
        'packages'
    );
}

function draftStockSummary(items) {
    return quantityGroupSummary(
        items,
        (item) => inventoryQtyForItem(item),
        (item, value) => packageContentUnitText(stockCountUnit(item, value)),
        'pcs'
    );
}

function updateCreatePoSubmitState() {
    const button = document.getElementById('btnSubmitPo');
    if (!button) return;
    const ready = Boolean(
        document.getElementById('po-supplier-select')?.value
        && document.getElementById('po-payment-terms')?.value
        && document.getElementById('po-expected-delivery')?.value
        && createDraftItems.length
    );
    button.disabled = !ready;
    button.setAttribute('aria-disabled', ready ? 'false' : 'true');
    button.title = ready ? '' : 'Complete the purchase order information and add at least one item.';
}

function totalPurchaseUnits(items) {
    return items.reduce((total, item) => total + Number(item.purchase_qty || item.quantity || 0), 0);
}

function supplierVatRate() {
    // Supplier, supplier-product, and PO records do not expose a tax basis.
    // The backend stores total_amount as the sum of line totals, without adding VAT.
    return 0;
}

function draftLineKey(item) {
    const supplierProductId = cleanText(item.supplier_product_id);
    const supplierId = cleanText(item.supplier_id);
    const productId = cleanText(item.product_id);
    const purchaseUnit = normalizePurchaseUnit(item.purchase_unit || purchaseUnitInfo(item).purchaseUnit).toLowerCase();
    const unitsPerPurchaseUnit = Number(item.units_per_purchase_unit || item.purchase_unit_qty || 1);
    const supplierMappingKey = supplierProductId || [supplierId, productId].join(':');
    return [supplierMappingKey, productId, purchaseUnit, unitsPerPurchaseUnit].join('::');
}

function createDraftItemByKey(itemKey) {
    return createDraftItems.find((item) => draftLineKey(item) === itemKey) || null;
}

function renderQuantityValidation(input, message = '') {
    const validation = input?.closest('.po-summary-fact')?.querySelector('.po-quantity-validation');
    if (validation) validation.textContent = message;
}

function updateDraftItemQuantity(itemKey, nextQuantity, focusControl = '') {
    const item = createDraftItemByKey(itemKey);
    const quantityText = String(nextQuantity ?? '').trim();
    if (!item || !/^[1-9]\d*$/.test(quantityText)) return false;

    const quantity = Number(quantityText);
    if (!Number.isSafeInteger(quantity) || quantity < 1) return false;

    item.purchase_qty = quantity;
    item.quantity = quantity;
    applyPurchaseItemCalculation(item);
    item.product_details = createProductDetailSnapshot(item);
    selectedCreateDraftIndex = createDraftItems.indexOf(item);
    const selectedOption = selectedOptionItem('po-product-select');
    if (selectedOption && draftLineKey(selectedOption) === itemKey) {
        setValue('po-quantity', quantity);
    }
    renderSelectedProductPanel({ focusLineKey: itemKey, focusControl });
    return true;
}

function syncSelectedCreateDraftItemFromInputs() {
    const quantityText = getValue('po-quantity');
    if (!/^[1-9]\d*$/.test(quantityText) || !Number.isSafeInteger(Number(quantityText))) return;
    const selectedItem = selectedOptionItem('po-product-select');
    if (!selectedItem) return;
    const itemKey = draftLineKey(selectedItem);
    if (createDraftItemByKey(itemKey)) updateDraftItemQuantity(itemKey, quantityText);
}

function purchaseSummaryItemHtml(item, index) {
    const purchaseUnit = purchaseUnitInfo(item);
    const orderQty = Number(item.purchase_qty || item.quantity || 0);
    const packageLabel = pluralizeUnit(purchaseUnit.purchaseUnit || 'package', orderQty);
    const lineKey = draftLineKey(item);
    const specification = productSpecification(item);
    const inventoryQuantity = inventoryQtyForItem(item);
    const stockToReceiveLabel = inventoryQuantityLabel(inventoryQuantity, packageContentUnitText(stockCountUnit(item, inventoryQuantity)));

    return `
        <article class="po-summary-item" data-line-key="${escapeHtml(lineKey)}">
            <div class="po-summary-item-header">
                <span class="po-summary-line-number" aria-label="Line ${index + 1}">${index + 1}</span>
                <div class="po-summary-product" title="${escapeHtml(productDisplayWithSpecification(item))}">
                    <span class="po-summary-product-name">${escapeHtml(productCoreName(item) || item.product_name || 'Unnamed product')}</span>
                    ${specification ? `<span class="po-summary-product-spec">${escapeHtml(specification)}</span>` : ''}
                </div>
                <button class="btn btn-sm btn-outline-danger po-summary-remove-item" type="button" data-line-key="${escapeHtml(lineKey)}" aria-label="Remove ${escapeHtml(productDisplayWithSpecification(item))}">
                    <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                    <span>Remove</span>
                </button>
            </div>
            <div class="po-summary-facts">
                <div class="po-summary-fact">
                    <span>Purchase Unit</span>
                    <strong>${escapeHtml(purchaseUnit.purchaseUnit || 'Package')}</strong>
                </div>
                <div class="po-summary-fact">
                    <span>Order Quantity</span>
                    <div class="po-quantity-stepper">
                        <button class="po-quantity-decrease" type="button" data-line-key="${escapeHtml(lineKey)}" aria-label="Decrease order quantity" ${orderQty <= 1 ? 'disabled aria-disabled="true" title="Minimum quantity is 1"' : ''}>&minus;</button>
                        <input class="po-quantity-input" type="number" min="1" step="1" inputmode="numeric" value="${orderQty}" data-line-key="${escapeHtml(lineKey)}" aria-label="Order quantity" aria-describedby="po-quantity-error-${createDraftItems.indexOf(item)}">
                        <button class="po-quantity-increase" type="button" data-line-key="${escapeHtml(lineKey)}" aria-label="Increase order quantity">+</button>
                    </div>
                    <strong class="po-quantity-unit-label">${escapeHtml(`${orderQty} ${packageLabel}`)}</strong>
                    <div id="po-quantity-error-${createDraftItems.indexOf(item)}" class="po-quantity-validation" aria-live="polite"></div>
                </div>
                <div class="po-summary-fact">
                    <span>Units per Purchase Unit</span>
                    <strong>${purchaseUnit.quantity}</strong>
                </div>
            </div>
            <div class="po-summary-line-totals">
                <div class="po-line-total"><span>Stock to Receive</span><strong>${escapeHtml(stockToReceiveLabel)}</strong></div>
                <div class="po-line-total"><span>Supplier Unit Cost</span><strong>${peso(item.price)} / ${escapeHtml(unitPriceLabel(purchaseUnit.singleStockUnit))}</strong></div>
                <div class="po-line-total"><span>Line Total</span><strong>${peso(productLineTotal(item))}</strong></div>
            </div>
        </article>
    `;
}

function renderPurchaseItemsSummary(items) {
    if (items.length === 0) {
        return '<div class="po-summary-empty"><strong>No purchase items added yet.</strong>Select a product above and click Add Item.</div>';
    }

    return items.map((item, index) => purchaseSummaryItemHtml(item, index)).join('');
}

function currentStockHtml(item) {
    if (!item) return '';
    const details = item.product_details || createProductDetailSnapshot(item);
    const shelfStock = Number(details.shelf_stock || 0);
    const storageStock = Number(details.storage_stock || 0);
    const onHand = Number.isFinite(Number(details.stock)) ? Number(details.stock) : shelfStock + storageStock;

    return `
        <div class="po-current-stock-strip" role="status" aria-live="polite">
            <strong>Current Stock</strong>
            <div class="po-current-stock-values">
                <span>Shelf: <b>${shelfStock}</b></span>
                <span>Storage: <b>${storageStock}</b></span>
                <span>On Hand: <b>${onHand}</b></span>
            </div>
        </div>
    `;
}

function renderSelectedProductPanel(options = {}) {
    const panel = document.getElementById('po-selected-product-panel');
    if (!panel) return;

    const selectedDraftItem = Number.isInteger(selectedCreateDraftIndex) ? createDraftItems[selectedCreateDraftIndex] : null;
    const item = selectedDraftItem || selectedOptionItem('po-product-select');

    const calculationSnapshot = createDraftItems.map((draftItem) => {
        const calculation = applyPurchaseItemCalculation(draftItem);
        return {
            supplier_product_id: draftItem.supplier_product_id || '',
            product_id: draftItem.product_id,
            purchase_qty: calculation.orderQty,
            purchase_unit: draftItem.purchase_unit || purchaseUnitInfo(draftItem).purchaseUnit,
            units_per_purchase_unit: calculation.unitsPerPurchaseUnit,
            inventory_qty_ordered: calculation.totalBaseUnits,
            supplier_unit_cost: calculation.supplierUnitCost,
            line_total: calculation.lineTotal
        };
    });
    document.documentElement.dataset.purchaseOrderCalculation = JSON.stringify(calculationSnapshot);
    const subtotal = calculationSnapshot.reduce((total, draftItem) => total + draftItem.line_total, 0);
    const vatRate = supplierVatRate();
    const vat = subtotal * vatRate;
    const grandTotal = subtotal + vat;
    const financialDetails = [
        receiptRow('Purchase Items', String(createDraftItems.length)),
        receiptRow('Total Purchase Units', String(totalPurchaseUnits(createDraftItems))),
        receiptRow('Stock Expected', draftStockSummary(createDraftItems)),
        '<div class="po-receipt-divider"></div>',
        receiptRow('Supplier', selectedSupplierName('po')),
        '<div class="po-receipt-divider"></div>',
        receiptRow('Subtotal', peso(subtotal)),
        ...(vatRate > 0 ? [receiptRow(`VAT (${Math.round(vatRate * 100)}%)`, peso(vat))] : []),
        '<div class="po-receipt-divider"></div>',
        receiptRow('GRAND TOTAL', peso(grandTotal), { strong: true, highlight: true })
    ].join('');
    panel.innerHTML = `
        ${currentStockHtml(item)}
        <div class="po-create-workspace">
            <section class="po-workspace-card po-purchase-items-card" aria-labelledby="po-purchase-items-heading">
                <div class="po-workspace-card-header">
                    <h4 id="po-purchase-items-heading">Purchase Items</h4>
                    <span class="po-line-count" aria-label="${createDraftItems.length} unique purchase lines">${createDraftItems.length}</span>
                </div>
                <div class="po-summary-items">${renderPurchaseItemsSummary(createDraftItems)}</div>
            </section>
            <aside class="po-workspace-card po-order-summary-card" aria-labelledby="po-order-summary-heading">
                <div class="po-workspace-card-header">
                    <h4 id="po-order-summary-heading">Order Summary</h4>
                </div>
                <div class="po-receipt-summary">${financialDetails}</div>
                <div class="po-summary-tax-note">VAT is not applied to this order.</div>
        </div>
    `;
    panel.classList.add('is-visible');
    updateCreatePoSubmitState();
    if (options.focusLineKey && options.focusControl) {
        const line = [...panel.querySelectorAll('.po-summary-item')]
            .find((element) => element.dataset.lineKey === options.focusLineKey);
        const control = line?.querySelector(options.focusControl);
        control?.focus({ preventScroll: true });
        if (control?.classList.contains('po-quantity-input')) {
            const caret = String(control.value).length;
            try { control.setSelectionRange(caret, caret); } catch (error) { /* Number inputs may not expose text selection. */ }
        }
    }
}

function isMedicineItem(item) {
    return String(item?.category_name || '').trim().toLowerCase() === 'medicine';
}

function draftItemFromOption(option, quantity = 1, overrides = {}) {
    if (!option) return null;
    const unitsPerPurchaseUnit = Math.max(1, Number(overrides.unitsPerPurchaseUnit || option.dataset.unitsPerPurchaseUnit || option.dataset.purchaseUnitQty || 1));
    const purchaseUnit = normalizePurchaseUnit(overrides.purchaseUnit || option.dataset.purchaseUnit || '');
    const purchaseQty = Math.max(1, Number(quantity || 1));

    return {
        po_item_id: null,
        supplier_product_id: option.dataset.supplierProductId || '',
        supplier_id: option.dataset.supplierId || '',
        product_id: option.value,
        product_name: option.dataset.productName || option.textContent || '',
        product_display_name: option.dataset.productDisplayName || '',
        brand_name: option.dataset.brand || '',
        brand_display_name: option.dataset.brandDisplayName || '',
        unit: option.dataset.unit || '',
        category_name: option.dataset.categoryName || '',
        type_name: option.dataset.typeName || '',
        generic_name: option.dataset.genericName || '',
        dosage_form: option.dataset.dosageForm || '',
        package_type: option.dataset.packageType || '',
        strength: option.dataset.strength || '',
        strength_value: option.dataset.strengthValue || '',
        strength_unit: option.dataset.strengthUnit || '',
        net_content_value: option.dataset.netContentValue || option.dataset.volumeValue || '',
        net_content_unit: option.dataset.netContentUnit || option.dataset.volumeUnit || '',
        volume_value: option.dataset.volumeValue || '',
        volume_unit: option.dataset.volumeUnit || '',
        variant_flavor: option.dataset.variantFlavor || '',
        size_value: option.dataset.sizeValue || '',
        weight_volume_value: option.dataset.weightVolumeValue || '',
        weight_volume_unit: option.dataset.weightVolumeUnit || '',
        size_display: option.dataset.sizeDisplay || '',
        packaging: option.dataset.packaging || '',
        purchase_unit: purchaseUnit,
        units_per_purchase_unit: unitsPerPurchaseUnit,
        purchase_unit_conversion: option.dataset.purchaseUnitConversion || '',
        purchase_unit_qty: unitsPerPurchaseUnit,
        pack_content: option.dataset.packContent || '',
        shelf_stock: Number(option.dataset.shelfStock || 0),
        storage_stock: Number(option.dataset.storageStock || 0),
        selling_price: Number(option.dataset.sellingPrice || option.dataset.price || 0),
        reorder_level: Number(option.dataset.reorderLevel || 10),
        stock: option.dataset.stock || '',
        price: Number(option.dataset.price || 0),
        purchase_qty: purchaseQty,
        inventory_qty_ordered: purchaseQty * unitsPerPurchaseUnit,
        supplier_unit_cost: Number(option.dataset.price || 0),
        line_total: purchaseQty * unitsPerPurchaseUnit * Number(option.dataset.price || 0),
        quantity: purchaseQty
    };
}

function setValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value ?? '';
}

function setSelectValue(id, value) {
    const select = document.getElementById(id);
    if (!select) return;
    const cleanValue = cleanText(value);
    if (cleanValue && ![...select.options].some(option => sameText(option.value, cleanValue))) {
        select.add(new Option(cleanValue, cleanValue));
    }
    select.value = cleanValue;
}

function getValue(id) {
    return document.getElementById(id)?.value?.trim() || '';
}

function nextEditDraftClientId() {
    editDraftClientSequence += 1;
    return `draft-${Date.now()}-${editDraftClientSequence}`;
}

function ensureEditItemIdentity(item) {
    if (item && !item.po_item_id && !item.client_item_id) item.client_item_id = nextEditDraftClientId();
    return item;
}

function editItemKey(item) {
    if (!item) return '';
    if (item.po_item_id) return `po:${String(item.po_item_id)}`;
    ensureEditItemIdentity(item);
    return `draft:${String(item.client_item_id)}`;
}

function editDraftItemByKey(itemKey) {
    return editDraftItems.find((item) => editItemKey(item) === itemKey) || null;
}

function clearEditValidation() {
    ['edit-po-product-select', 'edit-po-quantity', 'edit-po-editor-purchase-unit', 'edit-po-editor-contains', 'edit-po-editor-price']
        .forEach((id) => document.getElementById(id)?.classList.remove('is-invalid'));
    ['edit-po-product-error', 'edit-po-quantity-error', 'edit-po-purchase-unit-error', 'edit-po-contains-error', 'edit-po-price-error']
        .forEach((id) => { const element = document.getElementById(id); if (element) element.textContent = ''; });
}

function showEditFieldError(fieldId, errorId, message) {
    document.getElementById(fieldId)?.classList.add('is-invalid');
    const error = document.getElementById(errorId);
    if (error) error.textContent = message;
}

function clearEditProductEditor({ focusProduct = false } = {}) {
    editingPoItemId = null;
    editingPoItemKey = null;
    const editor = document.getElementById('edit-po-product-editor');
    if (editor) editor.classList.add('d-none');
    clearEditValidation();
    setValue('edit-po-editor-index', '');
    setValue('edit-po-editor-product-id', '');
    [
        'edit-po-editor-product-name',
        'edit-po-editor-brand-name',
        'edit-po-editor-category-name',
        'edit-po-editor-type-name',
        'edit-po-editor-generic-variant',
        'edit-po-editor-strength-size',
        'edit-po-editor-unit',
        'edit-po-editor-packaging',
        'edit-po-editor-price',
        'edit-po-editor-quantity',
        'edit-po-editor-contains',
        'edit-po-editor-conversion',
        'edit-po-editor-stock-receive',
        'edit-po-editor-selling-price',
        'edit-po-editor-shelf-stock',
        'edit-po-editor-storage-stock',
        'edit-po-editor-on-hand',
        'edit-po-editor-reorder-level'
    ].forEach((id) => setValue(id, ''));
    setSelectValue('edit-po-editor-purchase-unit', 'Box');
    setValue('edit-po-quantity', '1');
    const productSelect = document.getElementById('edit-po-product-select');
    if (productSelect) productSelect.value = '';
    const button = document.getElementById('btnEditAddPoItem');
    if (button) button.textContent = 'Add Item';
    document.getElementById('btnCancelEditPoItem')?.classList.add('d-none');
    const modeLabel = document.getElementById('edit-po-mode-label');
    if (modeLabel) {
        modeLabel.textContent = 'Add mode';
        modeLabel.classList.remove('is-editing');
    }
    document.querySelectorAll('#table-edit-po-items tbody tr.is-selected').forEach((row) => {
        row.classList.remove('is-selected');
        row.setAttribute('aria-selected', 'false');
    });
    renderEditSummary();
    if (focusProduct && !productSelect?.disabled) productSelect?.focus({ preventScroll: true });
}

function updateEditStockToReceive() {
    const quantity = Math.max(0, Number(getValue('edit-po-editor-quantity') || document.getElementById('edit-po-quantity')?.value || 0));
    const contains = Math.max(1, Number(getValue('edit-po-editor-contains') || 1));
    const selectedOption = document.getElementById('edit-po-product-select')?.selectedOptions?.[0] || null;
    const optionItem = selectedOption ? draftItemFromOption(selectedOption, quantity || 1) : null;
    const existingItem = editDraftItemByKey(editingPoItemKey);
    const item = {
        ...(optionItem || existingItem || {}),
        unit: getValue('edit-po-editor-unit') || optionItem?.unit || existingItem?.unit,
        packaging: getValue('edit-po-editor-packaging') || optionItem?.packaging || existingItem?.packaging,
        purchase_unit: getValue('edit-po-editor-purchase-unit') || optionItem?.purchase_unit || existingItem?.purchase_unit,
        units_per_purchase_unit: contains,
        purchase_unit_qty: contains
    };
    const purchaseUnit = purchaseUnitInfo(item);
    setValue('edit-po-editor-stock-receive', quantityWithInventoryUnit(item, quantity * contains));
    setValue('edit-po-editor-conversion', purchaseUnit.conversionNote || '');
}

function showEditProductEditor(item, itemKey = null) {
    const editor = document.getElementById('edit-po-product-editor');
    if (!editor || !item) return;

    const medicine = isMedicineItem(item);
    const purchaseUnit = purchaseUnitInfo(item);
    const orderQty = Number(item.purchase_qty || item.quantity || 1);
    const onHand = Number(item.shelf_stock || 0) + Number(item.storage_stock || 0);
    const reorderLevel = Number(item.reorder_level || 10);
    editingPoItemKey = itemKey || null;
    editingPoItemId = itemKey ? (item.po_item_id || item.client_item_id) : null;
    editor.classList.remove('d-none');
    clearEditValidation();

    setValue('edit-po-editor-index', editingPoItemKey || '');
    setValue('edit-po-editor-product-id', item.product_id);
    setValue('edit-po-editor-product-name', item.product_name);
    setValue('edit-po-editor-brand-name', item.brand_name);
    setValue('edit-po-editor-category-name', item.category_name);
    setValue('edit-po-editor-type-name', item.type_name);
    setValue('edit-po-editor-generic-variant', medicine ? item.generic_name : item.variant_flavor);
    setValue('edit-po-editor-strength-size', medicine ? productStrengthValue(item) : productSizeOnlyValue(item));
    setValue('edit-po-editor-unit', item.unit);
    setValue('edit-po-editor-packaging', item.packaging);
    setValue('edit-po-editor-price', money(item.price));
    setSelectValue('edit-po-editor-purchase-unit', purchaseUnit.purchaseUnit || 'Box');
    setValue('edit-po-editor-contains', purchaseUnit.quantity || 1);
    setValue('edit-po-editor-quantity', orderQty);
    setValue('edit-po-quantity', orderQty);
    setValue('edit-po-editor-selling-price', peso(item.selling_price || item.price || 0));
    setValue('edit-po-editor-shelf-stock', Number(item.shelf_stock || 0));
    setValue('edit-po-editor-storage-stock', Number(item.storage_stock || 0));
    setValue('edit-po-editor-on-hand', onHand);
    setValue('edit-po-editor-reorder-level', reorderLevel);
    updateEditStockToReceive();

    const productSelect = document.getElementById('edit-po-product-select');
    if (productSelect && item.product_id) productSelect.value = item.product_id;

    const button = document.getElementById('btnEditAddPoItem');
    if (button) button.textContent = editingPoItemId === null ? 'Add Item' : 'Update Selected Item';
    document.getElementById('btnCancelEditPoItem')?.classList.toggle('d-none', editingPoItemId === null);
    const modeLabel = document.getElementById('edit-po-mode-label');
    if (modeLabel) {
        modeLabel.textContent = editingPoItemId === null ? 'Add mode' : 'Editing selected item';
        modeLabel.classList.toggle('is-editing', editingPoItemId !== null);
    }

    renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
    if (activeEditOrder) applyEditLocks(activeEditOrder);
}

function readEditProductEditor() {
    const productId = getValue('edit-po-editor-product-id') || document.getElementById('edit-po-product-select')?.value || '';
    const quantity = Number(getValue('edit-po-editor-quantity') || document.getElementById('edit-po-quantity')?.value || 0);
    const price = Number(getValue('edit-po-editor-price') || 0);
    const purchaseUnit = cleanText(document.getElementById('edit-po-editor-purchase-unit')?.value) || 'pcs';
    const unitsPerPurchaseUnit = Math.max(1, Number(getValue('edit-po-editor-contains') || 1));
    const categoryName = getValue('edit-po-editor-category-name');
    const medicine = categoryName.trim().toLowerCase() === 'medicine';
    const genericOrVariant = getValue('edit-po-editor-generic-variant');
    const strengthOrSize = getValue('edit-po-editor-strength-size');
    const packaging = getValue('edit-po-editor-packaging');

    clearEditValidation();
    let invalid = false;
    if (!productId) { showEditFieldError('edit-po-product-select', 'edit-po-product-error', 'Select a product.'); invalid = true; }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) { showEditFieldError('edit-po-quantity', 'edit-po-quantity-error', 'Enter a positive whole number.'); invalid = true; }
    if (!purchaseUnit) { showEditFieldError('edit-po-editor-purchase-unit', 'edit-po-purchase-unit-error', 'Select a purchase unit.'); invalid = true; }
    if (!Number.isSafeInteger(unitsPerPurchaseUnit) || unitsPerPurchaseUnit <= 0) { showEditFieldError('edit-po-editor-contains', 'edit-po-contains-error', 'Enter a positive whole number.'); invalid = true; }
    if (!Number.isFinite(price) || price < 0) { showEditFieldError('edit-po-editor-price', 'edit-po-price-error', 'Enter a valid unit cost.'); invalid = true; }
    if (invalid) throw new Error('Check the highlighted item fields.');
    const existingItem = editDraftItemByKey(editingPoItemKey);
    const selectedOption = document.getElementById('edit-po-product-select')?.selectedOptions?.[0] || null;
    const optionItem = selectedOption ? draftItemFromOption(selectedOption, quantity) : null;
    const masterItem = optionItem || existingItem || {};

    return {
        po_item_id: existingItem?.po_item_id || null,
        client_item_id: existingItem?.client_item_id || null,
        product_id: productId,
        product_name: masterItem.product_name || getValue('edit-po-editor-product-name'),
        product_display_name: masterItem.product_display_name || '',
        brand_name: masterItem.brand_name || getValue('edit-po-editor-brand-name'),
        brand_display_name: masterItem.brand_display_name || '',
        category_name: masterItem.category_name || categoryName,
        type_name: masterItem.type_name || getValue('edit-po-editor-type-name'),
        generic_name: medicine ? (masterItem.generic_name || genericOrVariant) : '',
        variant_flavor: medicine ? '' : (masterItem.variant_flavor || genericOrVariant),
        strength: medicine ? (masterItem.strength || strengthOrSize) : '',
        strength_value: medicine ? (masterItem.strength_value || strengthOrSize) : '',
        strength_unit: masterItem.strength_unit || '',
        net_content_value: masterItem.net_content_value || masterItem.volume_value || '',
        net_content_unit: masterItem.net_content_unit || masterItem.volume_unit || '',
        volume_value: masterItem.volume_value || '',
        volume_unit: masterItem.volume_unit || '',
        size_value: medicine ? '' : (masterItem.size_value || strengthOrSize),
        weight_volume_value: medicine ? '' : (masterItem.weight_volume_value || strengthOrSize),
        weight_volume_unit: masterItem.weight_volume_unit || '',
        unit: masterItem.unit || getValue('edit-po-editor-unit'),
        packaging: masterItem.packaging || packaging,
        purchase_unit: purchaseUnit || existingItem?.purchase_unit || optionItem?.purchase_unit || 'pcs',
        units_per_purchase_unit: unitsPerPurchaseUnit,
        purchase_unit_qty: unitsPerPurchaseUnit,
        selling_price: masterItem.selling_price || 0,
        shelf_stock: masterItem.shelf_stock || 0,
        storage_stock: masterItem.storage_stock || 0,
        stock: masterItem.stock || 0,
        reorder_level: masterItem.reorder_level || 10,
        price,
        purchase_qty: quantity,
        inventory_qty_ordered: quantity * unitsPerPurchaseUnit,
        quantity
    };
}

function addOrUpdateEditDraftItem() {
    if (editItemActionBusy || editMajorFieldsLocked) return;
    const button = document.getElementById('btnEditAddPoItem');
    try {
        editItemActionBusy = true;
        if (button) button.disabled = true;
        const productSelect = document.getElementById('edit-po-product-select');
        const option = productSelect?.options[productSelect.selectedIndex];
        const editor = document.getElementById('edit-po-product-editor');

        if (editor?.classList.contains('d-none')) {
            const fromOption = draftItemFromOption(option, document.getElementById('edit-po-quantity')?.value || 1);
            if (!fromOption) throw new Error('Select a product first.');
            showEditProductEditor(fromOption);
        }

        const item = ensureEditItemIdentity(readEditProductEditor());
        const duplicate = editDraftItems.find((candidate) =>
            editItemKey(candidate) !== editingPoItemKey
            && String(candidate.product_id) === String(item.product_id)
            && normalizePurchaseUnit(candidate.purchase_unit).toLowerCase() === normalizePurchaseUnit(item.purchase_unit).toLowerCase()
        );
        if (duplicate) {
            throw new Error('This product is already in the purchase order. Select its row to update the quantity.');
        }

        if (editingPoItemId === null) {
            editDraftItems.push(item);
        } else {
            const existingItem = editDraftItemByKey(editingPoItemKey);
            if (!existingItem) throw new Error('The selected purchase-order item is no longer available.');
            Object.assign(existingItem, item);
        }
        item.product_details = createProductDetailSnapshot(item);

        renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
        clearEditProductEditor({ focusProduct: true });
        if (activeEditOrder) applyEditLocks(activeEditOrder);
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    } finally {
        editItemActionBusy = false;
        if (button) button.disabled = editMajorFieldsLocked;
    }
}

function renderEditSummary() {
    const summary = document.getElementById('edit-po-summary');
    if (!summary) return;

    const totalItems = editDraftItems.length;
    const totalOrderQty = editDraftItems.reduce((total, item) => total + Number(item.purchase_qty || item.quantity || 0), 0);
    const totalStock = editDraftItems.reduce((total, item) => total + Number(item.inventory_qty_ordered || inventoryQtyForItem(item) || 0), 0);
    const estimatedCost = editDraftItems.reduce((total, item) => total + productLineTotal(item), 0);
    summary.innerHTML = [
        detailMetric('Total Items', totalItems),
        detailMetric('Total Order Qty', totalOrderQty),
        detailMetric('Total Stock to Receive', totalStock),
        detailMetric('Estimated Cost', peso(estimatedCost))
    ].join('');
    const count = document.getElementById('edit-po-item-count');
    if (count) {
        count.textContent = String(totalItems);
        count.setAttribute('aria-label', `${totalItems} purchase-order item${totalItems === 1 ? '' : 's'}`);
    }
    const saveButton = document.getElementById('btnUpdatePo');
    if (saveButton && saveButton.dataset.saving !== 'true') {
        saveButton.disabled = totalItems === 0 || Boolean(activeEditOrder && isOperationallyLocked(activeEditOrder));
        if (totalItems === 0) saveButton.title = 'Add at least one item before saving.';
    }
}

function showModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    if (window.bootstrap?.Modal) {
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
        return;
    }

    modal.classList.add('show');
    modal.style.display = 'block';
    modal.removeAttribute('aria-hidden');
    modal.setAttribute('aria-modal', 'true');
    document.body.classList.add('modal-open');
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    if (window.bootstrap?.Modal) {
        window.bootstrap.Modal.getInstance(modal)?.hide();
        return;
    }

    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    modal.removeAttribute('aria-modal');
    document.body.classList.remove('modal-open');
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function poModalParts(modalId) {
    const modal = document.getElementById(modalId);
    const dialog = modal?.querySelector('.modal-dialog') || null;
    const content = modal?.querySelector('.modal-content') || null;
    return { modal, dialog, content };
}

function setPoFloatingModalRect(config, nextRect = {}) {
    const { modal, dialog } = poModalParts(config.modalId);
    if (!modal || !dialog) return;

    const current = dialog.getBoundingClientRect();
    const minWidth = Math.min(config.minWidth || 720, window.innerWidth - 16);
    const minHeight = Math.min(config.minHeight || 520, window.innerHeight - 16);
    const maxWidth = Math.max(minWidth, window.innerWidth - 16);
    const maxHeight = Math.max(minHeight, window.innerHeight - 16);
    const width = clampNumber(nextRect.width ?? current.width, minWidth, maxWidth);
    const height = clampNumber(nextRect.height ?? current.height, minHeight, maxHeight);
    const left = clampNumber(nextRect.left ?? current.left, 8, Math.max(8, window.innerWidth - width - 8));
    const top = clampNumber(nextRect.top ?? current.top, 8, Math.max(8, window.innerHeight - height - 8));

    modal.classList.add('po-modal-positioned');
    modal.style.setProperty(`--${config.varPrefix}-left`, `${left}px`);
    modal.style.setProperty(`--${config.varPrefix}-top`, `${top}px`);
    modal.style.setProperty(`--${config.varPrefix}-width`, `${width}px`);
    modal.style.setProperty(`--${config.varPrefix}-height`, `${height}px`);
    config.onRectChange?.();
}

function centerPoFloatingModal(config) {
    const { modal, dialog } = poModalParts(config.modalId);
    if (!modal || !dialog) return;

    const rect = dialog.getBoundingClientRect();
    const minWidth = config.minWidth || 720;
    const minHeight = config.minHeight || 520;
    const width = Math.min(Math.max(rect.width, minWidth), window.innerWidth - 16);
    const height = Math.min(Math.max(rect.height, minHeight), window.innerHeight - 16);
    setPoFloatingModalRect(config, {
        width,
        height,
        left: (window.innerWidth - width) / 2,
        top: Math.max(8, (window.innerHeight - height) / 2)
    });
}

function initPoFloatingModalControls(config) {
    const { modal, dialog, content } = poModalParts(config.modalId);
    if (!modal || !dialog || !content || modal.dataset.floatingControlsReady === 'true') return;
    modal.dataset.floatingControlsReady = 'true';

    const header = modal.querySelector('.modal-header');
    const corner = document.getElementById(config.cornerId);

    modal.addEventListener('shown.bs.modal', () => {
        if (!modal.classList.contains('po-modal-positioned')) {
            centerPoFloatingModal(config);
        } else {
            setPoFloatingModalRect(config);
        }
    });

    header?.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('button, a, input, select, textarea')) return;
        event.preventDefault();
        header.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setPoFloatingModalRect(config, {
                left: start.left + moveEvent.clientX - startX,
                top: start.top + moveEvent.clientY - startY,
                width: start.width,
                height: start.height
            });
        };
        const stop = () => {
            header.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    corner?.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        corner.classList.add('is-dragging');
        corner.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setPoFloatingModalRect(config, {
                left: start.left,
                top: start.top,
                width: start.width + moveEvent.clientX - startX,
                height: start.height + moveEvent.clientY - startY
            });
        };
        const stop = () => {
            corner.classList.remove('is-dragging');
            corner.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    window.addEventListener('resize', () => {
        if (modal.classList.contains('show')) setPoFloatingModalRect(config);
    });
}

function createPoModalParts() {
    const modal = document.getElementById('createPurchaseOrderModal');
    const dialog = modal?.querySelector('.modal-dialog') || null;
    const content = modal?.querySelector('.modal-content') || null;
    return { modal, dialog, content };
}

function setCreatePoModalRect(nextRect = {}, options = {}) {
    const { modal, dialog } = createPoModalParts();
    if (!modal || !dialog) return;

    const current = dialog.getBoundingClientRect();
    const preferredWidth = Number.parseFloat(modal.dataset.poPreferredWidth || '');
    const preferredHeight = Number.parseFloat(modal.dataset.poPreferredHeight || '');
    const minWidth = Math.min(900, window.innerWidth - 16);
    const minHeight = Math.min(540, window.innerHeight - 16);
    const maxWidth = Math.max(minWidth, window.innerWidth - 16);
    const maxHeight = Math.max(minHeight, window.innerHeight - 16);
    const width = clampNumber(
        nextRect.width ?? (Number.isFinite(preferredWidth) ? preferredWidth : current.width),
        minWidth,
        maxWidth
    );
    const height = clampNumber(
        nextRect.height ?? (Number.isFinite(preferredHeight) ? preferredHeight : current.height),
        minHeight,
        maxHeight
    );
    const left = clampNumber(nextRect.left ?? current.left, 8, Math.max(8, window.innerWidth - width - 8));
    const top = clampNumber(nextRect.top ?? current.top, 8, Math.max(8, window.innerHeight - height - 8));

    if (!Number.isFinite(preferredWidth) || options.rememberUserSize) {
        modal.dataset.poPreferredWidth = String(width);
    }
    if (!Number.isFinite(preferredHeight) || options.rememberUserSize) {
        modal.dataset.poPreferredHeight = String(height);
    }
    modal.classList.add('po-modal-positioned');
    modal.style.setProperty('--po-modal-left', `${left}px`);
    modal.style.setProperty('--po-modal-top', `${top}px`);
    modal.style.setProperty('--po-modal-width', `${width}px`);
    modal.style.setProperty('--po-modal-height', `${height}px`);
    applyCreatePoFormExpansion();
}

function centerCreatePoModal() {
    const { modal, dialog } = createPoModalParts();
    if (!modal || !dialog) return;

    const rect = dialog.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, Math.min(900, window.innerWidth - 16)), window.innerWidth - 16);
    const height = Math.min(Math.max(rect.height, 540), window.innerHeight - 16);
    setCreatePoModalRect({
        width,
        height,
        left: (window.innerWidth - width) / 2,
        top: Math.max(8, (window.innerHeight - height) / 2)
    });
}

function createPoFormHeights() {
    const modal = document.getElementById('createPurchaseOrderModal');
    const body = modal?.querySelector('.modal-body');
    const form = modal?.querySelector('.po-create-form');
    const primary = modal?.querySelector('.po-form-primary-row');
    const item = modal?.querySelector('.po-form-item-row');
    const divider = document.getElementById('po-create-resize-divider');
    if (!modal || !body || !form || !primary || !item || !divider) return null;

    const previousHeight = primary.style.height;
    primary.style.height = 'auto';
    const expandedPrimary = Math.ceil(primary.scrollHeight);
    primary.style.height = previousHeight;

    const itemHeight = Math.ceil(item.getBoundingClientRect().height);
    const collapsed = 0;
    return {
        modal,
        body,
        form,
        primary,
        item,
        divider,
        itemHeight,
        collapsed,
        expanded: Math.max(expandedPrimary, collapsed)
    };
}

function applyCreatePoFormExpansion(nextHeight = null, options = {}) {
    const parts = createPoFormHeights();
    if (!parts) return;
    const { modal, body, itemHeight, divider, collapsed, expanded } = parts;
    const userHeight = Number.parseFloat(modal.dataset.poFormUserPrimaryHeight || '');
    const lowerMinHeight = 220;
    const maxHeightForViewport = Math.max(collapsed, body.clientHeight - itemHeight - divider.offsetHeight - lowerMinHeight - 24);
    const allowedExpanded = clampNumber(Math.min(expanded, maxHeightForViewport), collapsed, expanded);
    const shouldForceCollapsed = allowedExpanded <= collapsed + 2;
    const target = shouldForceCollapsed
        ? collapsed
        : nextHeight ?? (Number.isFinite(userHeight) ? userHeight : allowedExpanded);
    const height = clampNumber(target, collapsed, allowedExpanded);
    const range = Math.max(1, expanded - collapsed);
    const opacity = clampNumber((height - collapsed) / range, 0, 1);

    modal.dataset.poFormPrimaryHeight = String(height);
    if (options.rememberUserHeight) {
        modal.dataset.poFormUserPrimaryHeight = String(height);
    }
    modal.classList.toggle('po-form-collapsed', height <= collapsed + 2);
    modal.style.setProperty('--po-form-primary-height', `${height}px`);
    modal.style.setProperty('--po-form-primary-opacity', opacity.toFixed(3));
    modal.style.setProperty('--po-form-primary-gap', `${Math.round(10 * opacity)}px`);
    updateCreatePoLowerHeight();
}

function updateCreatePoLowerHeight() {
    const modal = document.getElementById('createPurchaseOrderModal');
    const body = modal?.querySelector('.modal-body');
    const form = modal?.querySelector('.po-create-form');
    const divider = document.getElementById('po-create-resize-divider');
    if (!modal || !body || !form || !divider) return;

    const available = Math.max(220, body.clientHeight - form.offsetHeight - divider.offsetHeight - 14);
    modal.style.setProperty('--po-create-lower-height', `${available}px`);
}

function initCreatePoModalLayoutControls() {
    const { modal, dialog, content } = createPoModalParts();
    if (!modal || !dialog || !content || modal.dataset.layoutControlsReady === 'true') return;
    modal.dataset.layoutControlsReady = 'true';

    const header = modal.querySelector('.modal-header');
    const divider = document.getElementById('po-create-resize-divider');
    const corner = document.getElementById('po-modal-corner-resize');
    const lower = document.getElementById('po-create-lower');

    modal.addEventListener('shown.bs.modal', () => {
        if (!modal.classList.contains('po-modal-positioned')) {
            centerCreatePoModal();
        } else {
            setCreatePoModalRect();
        }
        applyCreatePoFormExpansion();
    });

    header?.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('button, a, input, select, textarea')) return;
        event.preventDefault();
        header.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setCreatePoModalRect({
                left: start.left + moveEvent.clientX - startX,
                top: start.top + moveEvent.clientY - startY,
                width: start.width,
                height: start.height
            });
        };
        const stop = () => {
            header.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    divider?.addEventListener('pointerdown', (event) => {
        const heights = createPoFormHeights();
        if (event.button !== 0 || !heights) return;
        event.preventDefault();
        divider.classList.add('is-dragging');
        divider.setPointerCapture?.(event.pointerId);
        const startY = event.clientY;
        const startHeight = Number.parseFloat(modal.dataset.poFormPrimaryHeight || '') || heights.expanded;

        const move = (moveEvent) => applyCreatePoFormExpansion(
            startHeight + moveEvent.clientY - startY,
            { rememberUserHeight: true }
        );
        const stop = () => {
            divider.classList.remove('is-dragging');
            divider.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    corner?.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        corner.classList.add('is-dragging');
        corner.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setCreatePoModalRect(
                {
                    left: start.left,
                    top: start.top,
                    width: start.width + moveEvent.clientX - startX,
                    height: start.height + moveEvent.clientY - startY
                },
                { rememberUserSize: true }
            );
        };
        const stop = () => {
            corner.classList.remove('is-dragging');
            corner.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    window.addEventListener('resize', () => {
        if (modal.classList.contains('show')) setCreatePoModalRect();
    });
}

function editPoModalParts() {
    const modal = document.getElementById('editPurchaseOrderModal');
    const dialog = modal?.querySelector('.modal-dialog') || null;
    const content = modal?.querySelector('.modal-content') || null;
    return { modal, dialog, content };
}

function setEditPoModalRect(nextRect = {}) {
    const { modal, dialog } = editPoModalParts();
    if (!modal || !dialog) return;

    const current = dialog.getBoundingClientRect();
    const minWidth = Math.min(720, window.innerWidth - 16);
    const minHeight = Math.min(540, window.innerHeight - 16);
    const maxWidth = Math.max(minWidth, window.innerWidth - 16);
    const maxHeight = Math.max(minHeight, window.innerHeight - 16);
    const width = clampNumber(nextRect.width ?? current.width, minWidth, maxWidth);
    const height = clampNumber(nextRect.height ?? current.height, minHeight, maxHeight);
    const left = clampNumber(nextRect.left ?? current.left, 8, Math.max(8, window.innerWidth - width - 8));
    const top = clampNumber(nextRect.top ?? current.top, 8, Math.max(8, window.innerHeight - height - 8));

    modal.classList.add('po-modal-positioned');
    modal.style.setProperty('--po-edit-modal-left', `${left}px`);
    modal.style.setProperty('--po-edit-modal-top', `${top}px`);
    modal.style.setProperty('--po-edit-modal-width', `${width}px`);
    modal.style.setProperty('--po-edit-modal-height', `${height}px`);
    applyEditPoFormExpansion();
}

function centerEditPoModal() {
    const { modal, dialog } = editPoModalParts();
    if (!modal || !dialog) return;

    const rect = dialog.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 720), window.innerWidth - 16);
    const height = Math.min(Math.max(rect.height, 540), window.innerHeight - 16);
    setEditPoModalRect({
        width,
        height,
        left: (window.innerWidth - width) / 2,
        top: Math.max(8, (window.innerHeight - height) / 2)
    });
}

function editPoFormHeights() {
    const modal = document.getElementById('editPurchaseOrderModal');
    const body = modal?.querySelector('.modal-body');
    const form = modal?.querySelector('.po-edit-form');
    const primary = modal?.querySelector('.po-edit-primary-row');
    const item = modal?.querySelector('.po-edit-item-row');
    const divider = document.getElementById('edit-po-resize-divider');
    if (!modal || !body || !form || !primary || !item || !divider) return null;

    const previousHeight = primary.style.height;
    primary.style.height = 'auto';
    const expandedPrimary = Math.ceil(primary.scrollHeight);
    primary.style.height = previousHeight;

    return {
        modal,
        body,
        form,
        primary,
        itemHeight: Math.ceil(item.getBoundingClientRect().height),
        divider,
        collapsed: 0,
        expanded: Math.max(expandedPrimary, 0)
    };
}

function applyEditPoFormExpansion(nextHeight = null) {
    const parts = editPoFormHeights();
    if (!parts) return;
    const { modal, body, itemHeight, divider, collapsed, expanded } = parts;
    const current = Number.parseFloat(modal.dataset.poEditFormPrimaryHeight || '');
    const lowerMinHeight = 220;
    const maxHeightForViewport = Math.max(collapsed, body.clientHeight - itemHeight - divider.offsetHeight - lowerMinHeight - 24);
    const allowedExpanded = clampNumber(Math.min(expanded, maxHeightForViewport), collapsed, expanded);
    const shouldForceCollapsed = allowedExpanded <= collapsed + 2;
    const target = shouldForceCollapsed
        ? collapsed
        : nextHeight ?? (Number.isFinite(current) ? current : allowedExpanded);
    const height = clampNumber(target, collapsed, allowedExpanded);
    const range = Math.max(1, expanded - collapsed);
    const opacity = clampNumber((height - collapsed) / range, 0, 1);

    modal.dataset.poEditFormPrimaryHeight = String(height);
    modal.classList.toggle('po-form-collapsed', height <= collapsed + 2);
    modal.style.setProperty('--po-edit-form-primary-height', `${height}px`);
    modal.style.setProperty('--po-edit-form-primary-opacity', opacity.toFixed(3));
    modal.style.setProperty('--po-edit-form-primary-gap', `${Math.round(10 * opacity)}px`);
    updateEditPoLowerHeight();
}

function updateEditPoLowerHeight() {
    const modal = document.getElementById('editPurchaseOrderModal');
    const body = modal?.querySelector('.modal-body');
    const form = modal?.querySelector('.po-edit-form');
    const divider = document.getElementById('edit-po-resize-divider');
    if (!modal || !body || !form || !divider) return;

    const available = Math.max(220, body.clientHeight - form.offsetHeight - divider.offsetHeight - 14);
    modal.style.setProperty('--po-edit-lower-height', `${available}px`);
}

function initEditPoModalLayoutControls() {
    const { modal, dialog, content } = editPoModalParts();
    if (!modal || !dialog || !content || modal.dataset.layoutControlsReady === 'true') return;
    modal.dataset.layoutControlsReady = 'true';

    const header = modal.querySelector('.modal-header');
    const divider = document.getElementById('edit-po-resize-divider');
    const corner = document.getElementById('edit-po-modal-corner-resize');

    modal.addEventListener('shown.bs.modal', () => {
        if (!modal.classList.contains('po-modal-positioned')) {
            centerEditPoModal();
        } else {
            setEditPoModalRect();
        }
        applyEditPoFormExpansion();
    });

    header?.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('button, a, input, select, textarea')) return;
        event.preventDefault();
        header.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setEditPoModalRect({
                left: start.left + moveEvent.clientX - startX,
                top: start.top + moveEvent.clientY - startY,
                width: start.width,
                height: start.height
            });
        };
        const stop = () => {
            header.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    divider?.addEventListener('pointerdown', (event) => {
        const heights = editPoFormHeights();
        if (event.button !== 0 || !heights) return;
        event.preventDefault();
        divider.classList.add('is-dragging');
        divider.setPointerCapture?.(event.pointerId);
        const startY = event.clientY;
        const startHeight = Number.parseFloat(modal.dataset.poEditFormPrimaryHeight || '') || heights.expanded;

        const move = (moveEvent) => applyEditPoFormExpansion(startHeight + moveEvent.clientY - startY);
        const stop = () => {
            divider.classList.remove('is-dragging');
            divider.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    corner?.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        corner.classList.add('is-dragging');
        corner.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setEditPoModalRect({
                left: start.left,
                top: start.top,
                width: start.width + moveEvent.clientX - startX,
                height: start.height + moveEvent.clientY - startY
            });
        };
        const stop = () => {
            corner.classList.remove('is-dragging');
            corner.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    window.addEventListener('resize', () => {
        if (modal.classList.contains('show')) setEditPoModalRect();
    });
}

function initViewPoModalLayoutControls() {
    initPoFloatingModalControls({
        modalId: 'viewPurchaseOrderModal',
        cornerId: 'view-po-modal-corner-resize',
        varPrefix: 'po-view-modal',
        minWidth: 720,
        minHeight: 520
    });
}

function renderSupplierOptions(select, selectedId = '') {
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>Select Supplier...</option>';
    supplierCache.forEach((supplier) => {
        const option = document.createElement('option');
        option.value = supplier.supplier_id;
        option.textContent = supplier.supplier_name;
        if (String(supplier.supplier_id) === String(selectedId)) option.selected = true;
        select.appendChild(option);
    });
}

async function loadPOSuppliers() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/suppliers/get_suppliers.php`);
        supplierCache = data.suppliers || [];
        renderSupplierOptions(document.getElementById('po-supplier-select'));
        renderSupplierOptions(document.getElementById('edit-po-supplier-select'));
    } catch (err) {
        const supplierSelect = document.getElementById('po-supplier-select');
        if (supplierSelect) supplierSelect.innerHTML = '<option value="" disabled selected>Unable to load</option>';
        PharmaUtils.toast.error(err.message);
    }
}

async function loadSupplierProducts(supplierId, productSelectId = 'po-product-select') {
    const productSelect = document.getElementById(productSelectId);
    if (!productSelect) return;

    productSelect.disabled = true;
    productSelect.innerHTML = '<option value="" disabled selected>Loading products...</option>';

    try {
        const data = await fetchJson(`${API_BASE_URL}/suppliers/get_supplier_products.php?supplier_id=${encodeURIComponent(supplierId)}`);
        const products = data.products || [];
        productSelect.innerHTML = '<option value="" disabled selected>Select product...</option>';

        products.forEach((product) => {
            const option = document.createElement('option');
            const unitDisplay = unitDisplayFromDetails(product);
            const sizeDisplay = sizeDisplayFromDetails(product);
            const optionLabel = productDropdownLabel(product);
            const optionDetail = productOptionDetail(product);
            const purchaseUnit = purchaseUnitInfo(product);
            const optionParts = [optionLabel];
            option.value = product.product_id;
            option.textContent = optionParts.join(' \u2022 ');
            option.title = [optionLabel, optionDetail].filter(Boolean).join('\n');
            option.dataset.productName = cleanText(product.product_name);
            option.dataset.supplierProductId = cleanText(product.supplier_product_id);
            option.dataset.supplierId = cleanText(supplierId);
            option.dataset.productDisplayName = productCoreName(product);
            option.dataset.brand = cleanText(product.brand_name);
            option.dataset.brandDisplayName = poBrandName(product);
            option.dataset.unit = unitDisplay;
            option.dataset.price = product.price || '0';
            option.dataset.supplierPriceBasis = product.supplier_price_basis || 'base_unit';
            option.dataset.sellingPrice = product.selling_price || product.price || '0';
            option.dataset.categoryName = cleanText(product.category_name);
            option.dataset.typeName = cleanText(product.type_name);
            option.dataset.genericName = cleanText(product.generic_name);
            option.dataset.dosageForm = cleanText(product.dosage_form);
            option.dataset.packageType = displayText(product.package_type);
            option.dataset.strength = cleanText(product.strength_size_display || product.strength_size_value || product.strength_value);
            option.dataset.strengthValue = cleanText(product.strength_value);
            option.dataset.strengthUnit = cleanText(product.strength_unit);
            option.dataset.netContentValue = cleanText(product.net_content_value || product.volume_value);
            option.dataset.netContentUnit = cleanText(product.net_content_unit || product.volume_unit);
            option.dataset.volumeValue = cleanText(product.volume_value);
            option.dataset.volumeUnit = cleanText(product.volume_unit);
            option.dataset.variantFlavor = cleanText(product.variant_flavor);
            option.dataset.sizeValue = cleanText(product.size_value);
            option.dataset.weightVolumeValue = cleanText(product.weight_volume_value);
            option.dataset.weightVolumeUnit = cleanText(product.weight_volume_unit);
            option.dataset.sizeDisplay = sizeDisplay;
            option.dataset.packaging = cleanText(product.package_type || product.packaging);
            option.dataset.stock = String(Number(product.stock || 0));
            option.dataset.shelfStock = String(Number(product.shelf_stock || 0));
            option.dataset.storageStock = String(Number(product.storage_stock || 0));
            option.dataset.reorderLevel = String(Number(product.reorder_level || product.reorder_qty || 10));
            option.dataset.packContent = cleanText(product.pack_content);
            option.dataset.purchaseUnit = purchaseUnit.purchaseUnit;
            option.dataset.purchaseUnitConversion = purchaseUnit.conversion;
            option.dataset.purchaseUnitQty = String(purchaseUnit.quantity);
            option.dataset.unitsPerPurchaseUnit = String(purchaseUnit.quantity);
            option.dataset.optionDetail = optionDetail;
            productSelect.appendChild(option);
        });

        productSelect.disabled = products.length === 0;
        if (productSelectId === 'po-product-select') syncPurchaseUnitFieldsFromSelectedProduct();
        return products;
    } catch (err) {
        productSelect.innerHTML = '<option value="" disabled selected>Unable to load products</option>';
        PharmaUtils.toast.error(err.message);
        return [];
    }
}

async function prefillApprovedPurchaseRequest() {
    const prId = new URLSearchParams(window.location.search).get('pr_id');
    if (!prId) return;

    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_requests/get_purchase_requests.php`);
        const request = (data.requests || data.data?.requests || []).find((entry) => String(entry.pr_id) === String(prId));
        const remainingItems = (request?.items || []).filter((item) => Number(item.remaining_qty || 0) > 0);
        if (!request || request.status !== 'Approved' || !remainingItems.length) {
            throw new Error('This purchase request is not available for PO conversion.');
        }

        let matchedSupplier = null;
        let matchedProductIds = new Set();
        for (const supplier of supplierCache) {
            const products = await loadSupplierProducts(supplier.supplier_id, 'po-product-select');
            const productIds = new Set(products.map((product) => String(product.product_id)));
            const coveredIds = new Set(remainingItems.map(item => String(item.product_id)).filter(productId => productIds.has(productId)));
            if (coveredIds.size > matchedProductIds.size) {
                matchedSupplier = supplier;
                matchedProductIds = coveredIds;
            }
        }
        if (!matchedSupplier) {
            throw new Error('No active supplier is assigned to the remaining products in this approved request.');
        }

        const supplierSelect = document.getElementById('po-supplier-select');
        supplierSelect.value = matchedSupplier.supplier_id;
        await loadSupplierProducts(matchedSupplier.supplier_id, 'po-product-select');
        const productSelect = document.getElementById('po-product-select');
        createDraftItems.length = 0;
        for (const requestItem of remainingItems.filter(item => matchedProductIds.has(String(item.product_id)))) {
            const option = [...productSelect.options].find((entry) => String(entry.value) === String(requestItem.product_id));
            const units = Math.max(1, Number(option?.dataset.unitsPerPurchaseUnit || 1));
            const requestedQty = Number(requestItem.remaining_qty || 0);
            if (!option || requestedQty <= 0 || requestedQty % units !== 0) {
                throw new Error(`${requestItem.product_name || 'A requested product'} cannot be ordered in exactly ${requestedQty} base units with its supplier packaging.`);
            }
            createDraftItems.push(draftItemFromOption(option, requestedQty / units));
        }

        renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
        renderSelectedProductPanel();
        updateCreateSummary();
        const badge = document.getElementById('po-conversion-source');
        if (badge) {
            badge.classList.remove('d-none');
            const remainingSupplierCount = remainingItems.length - createDraftItems.length;
            badge.querySelector('strong').textContent = `${request.pr_number} · ${request.requested_by_name}${remainingSupplierCount > 0 ? ` · ${remainingSupplierCount} item(s) remain for another PO` : ''}`;
        }
        showModal('createPurchaseOrderModal');
    } catch (error) {
        PharmaUtils.modal.error('Cannot convert purchase request', error.message);
    }
}

function renderStatusSummary(counts = {}, openClaimsCount = 0) {
    const container = document.getElementById('po-status-summary');
    if (!container) return;

    const lifecycleCards = Object.entries(STATUS_META).map(([status, color]) => `
        <div class="status-card" style="--status-color:${color}">
            <strong>${Number(counts[status] || 0)}</strong>
            <p>${escapeHtml(STATUS_LABELS[status] || status)}</p>
        </div>
    `).join('');
    const nextHtml = `${lifecycleCards}
        <div class="status-card status-card-informational" style="--status-color:${OPEN_CLAIMS_META.color}">
            <strong>${Number(openClaimsCount || 0)}</strong>
            <p>${escapeHtml(OPEN_CLAIMS_META.label)}</p>
        </div>`;

    if (nextHtml === lastStatusSummaryHtml) return;

    lastStatusSummaryHtml = nextHtml;
    container.innerHTML = nextHtml;
}

function renderTableHead(view = currentPoView) {
    const head = document.getElementById('purchase-orders-head');
    if (!head) return;
    const table = document.getElementById('table-purchase-orders');
    if (table) {
        table.dataset.poView = view;
        table.closest('.po-table-scroll')?.classList.toggle('po-active-fit', view === 'active');
        const minWidth = view === 'delivered' ? '1810px' : (view === 'arrived' ? '1740px' : (view === 'archived' ? '1880px' : '0px'));
        table.style.setProperty('min-width', minWidth, 'important');

        const activeColumnWidths = [
            ['col-po-number', '12%'],
            ['col-pr-number', '13%'],
            ['col-supplier', '14%'],
            ['col-items-summary', '13%'],
            ['col-money', '9%'],
            ['col-delivery', '8%'],
            ['col-terms', '9%'],
            ['col-status', '12%'],
            ['col-actions', '10%']
        ];
        const columnLayouts = {
            active: activeColumnWidths.map(([columnClass]) => columnClass),
            arrived: ['col-date', 'col-po-number', 'col-supplier', 'col-brand', 'col-items', 'col-specification', 'col-qty', 'col-money', 'col-terms', 'col-delivery', 'col-status', 'col-actions'],
            delivered: ['col-po-number', 'col-supplier', 'col-specification', 'col-received', 'col-received', 'col-received', 'col-inventory-qty', 'col-money', 'col-money', 'col-money', 'col-money', 'col-payment-status', 'col-date', 'col-actions'],
            archived: ['col-po-number', 'col-supplier', 'col-brand', 'col-items', 'col-specification', 'col-qty', 'col-money', 'col-date', 'col-supplier', 'col-reason', 'col-status', 'col-actions']
        };
        const colgroup = document.getElementById('purchase-orders-colgroup');
        if (colgroup) {
            colgroup.innerHTML = view === 'active'
                ? activeColumnWidths.map(([columnClass, width]) => `<col class="${columnClass}" style="width:${width}">`).join('')
                : (columnLayouts[view] || columnLayouts.active).map((columnClass) => `<col class="${columnClass}">`).join('');
        }
    }

    if (view === 'arrived') {
        const nextHead = `
            <tr>
                <th class="col-date">Order Date</th>
                <th class="col-po-number">PO Number</th>
                <th class="col-supplier">Supplier</th>
                <th class="col-brand">Brand</th>
                <th class="col-items">Product</th>
                <th class="col-specification">Specification</th>
                <th class="col-qty">Order Qty</th>
                <th class="col-money">PO Total</th>
                <th class="col-terms">Payment Mode</th>
                <th class="col-delivery">ETA</th>
                <th class="col-status">Status</th>
                <th class="col-actions">Actions</th>
            </tr>
        `;
        if (currentRenderedTableHead !== nextHead) {
            head.innerHTML = nextHead;
            currentRenderedTableHead = nextHead;
        }
        return;
    }

    if (view === 'delivered') {
        const nextHead = `
            <tr>
                <th class="col-po-number">PO Number</th>
                <th class="col-supplier">Supplier</th>
                <th class="col-specification">Product / Specification</th>
                <th class="col-received">Received Qty</th>
                <th class="col-received">Returned Qty</th>
                <th class="col-received">Damaged Qty</th>
                <th class="col-inventory-qty">Inventory Added</th>
                <th class="col-money">PO Total</th>
                <th class="col-money">Adjusted Payable</th>
                <th class="col-money">Amount Paid</th>
                <th class="col-money">Balance</th>
                <th class="col-payment-status">Payment Status</th>
                <th class="col-date">Received Date</th>
                <th class="col-actions">Actions</th>
            </tr>
        `;
        if (currentRenderedTableHead !== nextHead) {
            head.innerHTML = nextHead;
            currentRenderedTableHead = nextHead;
        }
        return;
    }

    if (view === 'archived') {
        const nextHead = `
            <tr>
                <th class="col-po-number">PO Number</th>
                <th class="col-supplier">Supplier</th>
                <th class="col-brand">Brand</th>
                <th class="col-items">Product</th>
                <th class="col-specification">Specification</th>
                <th class="col-qty">Order Qty</th>
                <th class="col-money">PO Total</th>
                <th class="col-date">Cancelled Date</th>
                <th class="col-supplier">Cancelled By</th>
                <th class="col-reason">Cancel Reason</th>
                <th class="col-status">Status</th>
                <th class="col-actions">Actions</th>
            </tr>
        `;
        if (currentRenderedTableHead !== nextHead) {
            head.innerHTML = nextHead;
            currentRenderedTableHead = nextHead;
        }
        return;
    }

    const nextHead = `
        <tr>
            <th class="col-po-number">PO Number</th>
            <th class="col-pr-number">PR Reference</th>
            <th class="col-supplier">Supplier</th>
            <th class="col-items-summary">Items</th>
            <th class="col-money">PO Total</th>
            <th class="col-delivery">ETA</th>
            <th class="col-terms">Payment Mode</th>
            <th class="col-status">Status</th>
            <th class="col-actions">Action</th>
        </tr>
    `;
    if (currentRenderedTableHead !== nextHead) {
        head.innerHTML = nextHead;
        currentRenderedTableHead = nextHead;
    }
}

function tableEmpty(colspan, message) {
    return `<tr><td colspan="${colspan}" class="po-empty">${escapeHtml(message)}</td></tr>`;
}

function commitPurchaseOrderTable(view, bodyHtml) {
    const tableBody = document.querySelector('#table-purchase-orders tbody');
    if (!tableBody) return;

    tableBody.classList.add('po-table-body-updating');
    renderTableHead(view);
    tableBody.innerHTML = bodyHtml;
    window.setTimeout(() => {
        tableBody.classList.remove('po-table-body-updating');
        window.dispatchEvent(new CustomEvent('drp:tables-updated'));
    }, 120);
}

function renderActivePurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable('active', tableEmpty(9, 'No active purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = order.item_names || [];
        return `
        <tr>
            <td class="po-number-cell">${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
            <td class="po-reference-cell"><strong>${escapeHtml(order.pr_number || 'Historical / Manual')}</strong>${order.pr_number ? '<span>Automatic PO</span>' : '<span>Manual record</span>'}</td>
            <td class="po-supplier-cell">${escapeHtml(order.supplier_name)}</td>
            <td class="po-items-summary-cell">${purchaseOrderItemsSummary(items, itemNames)}</td>
            <td class="po-price-cell"><span class="po-money">${peso(order.total_amount)}</span></td>
            <td class="po-delivery-cell">${formatDate(order.expected_delivery_date)}</td>
            <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
            <td class="po-status-cell">${purchaseOrderStatusStack(order)}</td>
            <td class="po-actions-cell">
                <div class="po-actions">
                    <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number)}" title="View PO">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-dark print-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Print ${escapeHtml(order.po_number)}" title="Print PO">
                        <i class="fa-solid fa-print"></i>
                    </button>
                    ${order.status === 'Delivered' && !isPurchaseOrderPaid(order.payment_status, order.remaining_balance ?? order.final_payment) ? `<button class="btn btn-sm btn-purple manage-payment-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Manage Payment for ${escapeHtml(order.po_number || '')}" title="Manage Payment"><i class="fa-solid fa-wallet"></i></button>` : ''}
                    ${statusActionButton(order)}
                </div>
            </td>
        </tr>
    `;
    }).join('');

    commitPurchaseOrderTable('active', bodyHtml);
}

function renderArrivedPurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable('arrived', tableEmpty(12, 'No arrived purchase orders ready for receiving.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = order.item_names || [];
        const quantities = order.quantities || (order.items || []).map((item) => item.quantity);

        return `
            <tr>
                <td>${formatDate(order.order_date)}</td>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td class="po-brand-cell">${brandTableCellList(items)}</td>
                <td class="po-product-cell">${productTableCellList(items, itemNames)}</td>
                <td class="po-spec-cell">${specificationTableCellList(items)}</td>
                <td class="po-qty-cell">${numberedList(quantities, { plain: true })}</td>
                <td class="po-price-cell"><span class="po-money">${peso(order.total_amount)}</span></td>
                <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
                <td class="po-delivery-cell">${formatDate(order.expected_delivery_date)}</td>
                <td class="po-status-cell">${statusBadge(order.status || 'Arrived')}${order.inspection_in_progress ? '<span class="badge bg-info text-dark d-block mt-1">Inspection in Progress</span>' : ''}</td>
                <td class="po-actions-cell">
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number || '')}" title="View PO"><i class="fa-regular fa-eye"></i></button>
                        <button class="btn btn-sm btn-outline-dark print-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Print ${escapeHtml(order.po_number || '')}" title="Print PO"><i class="fa-solid fa-print"></i></button>
                        ${statusActionButton(order)}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    commitPurchaseOrderTable('arrived', bodyHtml);
}

function renderDeliveredPurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable('delivered', tableEmpty(14, 'No delivered purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemDescriptions = items.length ? items.map((item) => [productTableBrand(item), productTableProductName(item), productSpecification(item)].filter(Boolean).join(' · ')) : (order.item_names || []);
        const receivedQuantities = items.map((item) => Number(item.received_quantity || 0));
        const returnedQuantities = items.map((item) => Number(item.returned_quantity || 0));
        const damagedQuantities = items.map((item) => Number(item.damaged_quantity || 0));
        const inventoryAdded = items.map((item) => {
            const addedQty = Math.max(0, Number(item.inventory_added ?? (Number(item.received_quantity || 0) - Number(item.damaged_quantity || 0))));
            return quantityWithInventoryUnit(item, addedQty);
        });
        const deliveryDate = order.delivery_date || order.received_date || order.expected_delivery_date || order.order_date;

        return `
            <tr>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td class="po-spec-cell" title="${escapeHtml(itemDescriptions.join(' | '))}">${numberedList(itemDescriptions)}</td>
                <td class="po-qty-cell">${numberedList(receivedQuantities, { plain: true })}</td>
                <td class="po-qty-cell">${numberedList(returnedQuantities, { plain: true })}</td>
                <td class="po-qty-cell">${numberedList(damagedQuantities, { plain: true })}</td>
                <td class="po-qty-cell">${numberedList(inventoryAdded, { plain: true })}</td>
                <td class="po-price-cell"><span class="po-money">${peso(order.total_amount)}</span></td>
                <td class="po-price-cell"><span class="po-money">${peso(order.final_payment)}</span></td>
                <td class="po-price-cell"><span class="po-money">${peso(order.total_paid || 0)}</span></td>
                <td class="po-price-cell"><span class="po-money">${peso(order.remaining_balance ?? order.final_payment)}</span></td>
                <td>${paymentStatusBadge(order.payment_status || 'Unpaid')}</td>
                <td>${formatDate(deliveryDate)}</td>
                <td class="po-actions-cell">
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number || '')}" title="View PO"><i class="fa-regular fa-eye"></i></button>
                        <button class="btn btn-sm btn-outline-dark print-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Print ${escapeHtml(order.po_number || '')}" title="Print PO"><i class="fa-solid fa-print"></i></button>
                        ${!isPurchaseOrderPaid(order.payment_status, order.remaining_balance ?? order.final_payment) ? `<button class="btn btn-sm btn-purple manage-payment-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Manage Payment for ${escapeHtml(order.po_number || '')}" title="Manage Payment"><i class="fa-solid fa-wallet"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    commitPurchaseOrderTable('delivered', bodyHtml);
}

async function loadPurchaseOrders(options = {}) {
    const { updateSummary = false } = options;
    const loadToken = ++purchaseOrdersLoadToken;
    const viewAtRequest = currentPoView;

    try {
        const statusFilter = document.getElementById('po-status-filter')?.value || '';
        const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '?scope=all';
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_orders.php${query}`);

        if (loadToken !== purchaseOrdersLoadToken || viewAtRequest !== currentPoView) return;

        let orders = data.purchase_orders || [];
        if (updateSummary) renderStatusSummary(data.status_counts || {}, data.open_claims_count || 0);
        renderActivePurchaseOrders(orders);
    } catch (err) {
        if (loadToken !== purchaseOrdersLoadToken || viewAtRequest !== currentPoView) return;

        if (updateSummary) renderStatusSummary({});
        renderActivePurchaseOrders([]);
        PharmaUtils.toast.error(err.message);
    }
}

function setPurchaseOrderView(view, options = {}) {
    const nextView = ['active', 'arrived', 'delivered', 'archived'].includes(view) ? view : 'active';
    const shouldUpdateUrl = options.updateUrl !== false;
    if (shouldUpdateUrl) {
        history.replaceState(null, '', `purchase_orders.html?tab=${nextView}`);
    }
    if (currentPoView === nextView) {
        document.querySelectorAll('.po-view-btn').forEach((button) => {
            button.classList.toggle('active', button.dataset.poView === nextView);
        });
        return;
    }

    currentPoView = nextView;
    document.querySelectorAll('.po-view-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.poView === nextView);
    });

    const filter = document.getElementById('po-status-filter');
    if (filter) {
        filter.disabled = nextView !== 'active';
        if (nextView !== 'active') filter.value = '';
    }

    loadPurchaseOrders({ updateSummary: Boolean(options.updateSummary) });
}

function purchaseOrderViewFromUrl() {
    return 'active';
}

function renderDraftItems(items, tableSelector, removeClass) {
    const tableBody = document.querySelector(`${tableSelector} tbody`);
    if (!tableBody) {
        if (tableSelector === '#table-po-items') updateCreateSummary();
        return;
    }

    if (items.length === 0) {
        const emptyColspan = tableSelector === '#table-edit-po-items' ? 9 : 10;
        tableBody.innerHTML = `<tr><td colspan="${emptyColspan}" class="text-center text-muted py-4">No items added yet.</td></tr>`;
        if (tableSelector === '#table-po-items') updateCreateSummary();
        if (tableSelector === '#table-edit-po-items') renderEditSummary();
        return;
    }

    const isEditTable = tableSelector === '#table-edit-po-items';
    if (isEditTable) {
        tableBody.innerHTML = items.map((item) => {
            const itemKey = editItemKey(item);
            const selected = itemKey === editingPoItemKey;
            const purchaseUnit = purchaseUnitInfo(item);
            const shelfStock = Number(item.shelf_stock || 0);
            const storageStock = Number(item.storage_stock || 0);
            const onHand = shelfStock + storageStock;
            const orderQuantity = Number(item.purchase_qty || 0);
            const unitsPerPurchaseUnit = Number(item.units_per_purchase_unit || item.purchase_unit_qty || 1);
            const stockToReceive = orderQuantity * unitsPerPurchaseUnit;
            const productName = productTableProductName(item);
            const brandName = poBrandName(item);
            const fullProductName = brandName && !productName.toLowerCase().startsWith(brandName.toLowerCase())
                ? `${brandName} ${productName}`
                : productName;
            const productType = cleanText(item.type_name);
            const removeLabel = `Remove ${[poBrandName(item), productName].filter(Boolean).join(' ')} from purchase order`;

            return `
                <tr data-item-key="${escapeHtml(itemKey)}" class="${selected ? 'is-selected' : ''}" tabindex="${editMajorFieldsLocked ? '-1' : '0'}" aria-selected="${selected ? 'true' : 'false'}" aria-label="Edit ${escapeHtml(productName)}">
                    <td>
                        <span class="po-edit-product-name">${escapeHtml(fullProductName)}</span>
                        <span class="po-edit-product-spec">${escapeHtml(productSpecification(item) || '-')}</span>
                        ${productType ? `<span class="po-edit-product-type">${escapeHtml(productType)}</span>` : ''}
                        ${inactivePoProductWarning(item)}
                    </td>
                    <td>${escapeHtml(orderQuantity)}</td>
                    <td>${escapeHtml(purchaseUnit.purchaseUnit || '-')}</td>
                    <td>${escapeHtml(unitsPerPurchaseUnit)}</td>
                    <td>${escapeHtml(stockToReceive)}</td>
                    <td class="po-price-cell">${peso(item.price)}</td>
                    <td class="po-price-cell po-edit-line-total">${peso(productLineTotal(item))}</td>
                    <td>
                        <div class="po-edit-inventory-stock" aria-label="Shelf ${shelfStock}, Storage ${storageStock}, On Hand ${onHand}">
                            <span class="po-stock-chip"><small>Shelf</small><b>${escapeHtml(shelfStock)}</b></span>
                            <span class="po-stock-chip"><small>Storage</small><b>${escapeHtml(storageStock)}</b></span>
                            <span class="po-stock-chip po-stock-chip-on-hand"><small>On Hand</small><b>${escapeHtml(onHand)}</b></span>
                        </div>
                    </td>
                    <td class="po-actions-cell">
                        <div class="po-actions">
                            ${!editMajorFieldsLocked ? `<button class="btn btn-sm btn-outline-danger ${removeClass}" type="button" data-item-key="${escapeHtml(itemKey)}" aria-label="${escapeHtml(removeLabel)}" title="${escapeHtml(removeLabel)}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        renderEditSummary();
        return;
    }

    tableBody.innerHTML = items.map((item, index) => {
        const purchaseUnit = purchaseUnitInfo(item);
        const packaging = item.packaging || purchaseUnit.packaging || '';

        return `
        <tr>
            <td>${escapeHtml(poBrandName(item))}</td>
            <td class="po-product-cell">${escapeHtml(productCoreName(item))}</td>
            <td>${escapeHtml(cleanText(item.type_name) || '-')}</td>
            <td>${escapeHtml(productNetWeightLabel(item))}</td>
            <td>${escapeHtml(packaging || '-')}</td>
            <td>${escapeHtml(purchaseUnit.purchaseUnit || '-')}</td>
            <td class="po-qty-cell">${escapeHtml(quantityWithInventoryUnit(item, inventoryQtyForItem(item)))}</td>
            <td class="po-price-cell">${peso(item.price)}</td>
            <td class="po-price-cell">${peso(productLineTotal(item))}</td>
            <td class="po-actions-cell">
                <div class="po-actions">
                    <button class="btn btn-sm btn-outline-danger ${removeClass}" type="button" data-index="${index}" aria-label="Remove item"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
    if (tableSelector === '#table-po-items') updateCreateSummary();
}

function renderArchivedPurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable('archived', tableEmpty(12, 'No cancelled or archived purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = items.length ? items.map((item) => productTableProductName(item)) : (order.item_names || []);
        const quantities = items.length ? items.map((item) => item.purchase_qty || 0) : (order.quantities || []);
        const archivedDate = order.approval_reason_at || order.order_date;
        const archivedBy = cleanText(order.approval_reason_by) || '-';
        const reason = cleanText(order.approval_reason) || '-';

        return `
            <tr>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td class="po-brand-cell">${brandTableCellList(items)}</td>
                <td class="po-product-cell">${productTableCellList(items, itemNames)}</td>
                <td class="po-spec-cell">${specificationTableCellList(items)}</td>
                <td class="po-qty-cell">${numberedList(quantities, { plain: true })}</td>
                <td class="po-price-cell"><span class="po-money">${peso(order.total_amount)}</span></td>
                <td>${formatDate(archivedDate)}</td>
                <td class="po-supplier-cell">${escapeHtml(archivedBy)}</td>
                <td class="po-spec-cell">${escapeHtml(reason)}</td>
                <td class="po-status-cell">${statusBadge(order.status || 'Cancelled')}</td>
                <td class="po-actions-cell">
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number || '')}" title="View PO">
                            <i class="fa-regular fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    commitPurchaseOrderTable('archived', bodyHtml);
}

function addDraftItem({ items, productSelectId, quantityInputId, tableSelector, removeClass }) {
    const productSelect = document.getElementById(productSelectId);
    const quantityInput = document.getElementById(quantityInputId);
    const option = productSelect?.options[productSelect.selectedIndex];
    const quantity = Number(quantityInput?.value);
    const isCreateTable = productSelectId === 'po-product-select';
    const overrides = isCreateTable ? readPurchaseUnitOverrides('po') : {};

    if (!productSelect?.value || !option || !Number.isSafeInteger(quantity) || quantity <= 0) {
        PharmaUtils.toast.error('Select a product and enter a whole-number quantity of 1 or more.');
        return;
    }

    const incomingItem = draftItemFromOption(option, quantity, overrides);
    const incomingLineKey = draftLineKey(incomingItem);
    const existing = items.find((item) => draftLineKey(item) === incomingLineKey);
    if (existing) {
        const existingIndex = items.indexOf(existing);
        existing.purchase_qty = quantity;
        existing.quantity = existing.purchase_qty;
        applyPurchaseItemCalculation(existing);
        existing.product_details = createProductDetailSnapshot(existing);
        if (isCreateTable) selectedCreateDraftIndex = existingIndex;
    } else {
        const draftItem = incomingItem;
        applyPurchaseItemCalculation(draftItem);
        draftItem.product_details = createProductDetailSnapshot(draftItem);
        items.push(draftItem);
        if (isCreateTable) selectedCreateDraftIndex = items.length - 1;
    }

    quantityInput.value = String(quantity);
    renderDraftItems(items, tableSelector, removeClass);
    if (productSelectId === 'po-product-select') renderSelectedProductPanel();
}

function removeCreateDraftItem(index) {
    if (!Number.isInteger(index) || index < 0 || index >= createDraftItems.length) return;
    createDraftItems.splice(index, 1);
    if (selectedCreateDraftIndex === index) {
        selectedCreateDraftIndex = createDraftItems.length ? Math.min(index, createDraftItems.length - 1) : null;
    } else if (Number.isInteger(selectedCreateDraftIndex) && selectedCreateDraftIndex > index) {
        selectedCreateDraftIndex -= 1;
    }
    renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
    renderSelectedProductPanel();
}


function resetCreateDraft() {
    createDraftItems.length = 0;
    selectedCreateDraftIndex = null;
    renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');

    const supplierSelect = document.getElementById('po-supplier-select');
    const productSelect = document.getElementById('po-product-select');
    if (supplierSelect) supplierSelect.selectedIndex = 0;
    if (productSelect) {
        productSelect.disabled = true;
        productSelect.innerHTML = '<option value="" disabled selected>Select product...</option>';
    }
    document.getElementById('po-quantity').value = '1';
    setSelectValue('po-purchase-unit', 'Box');
    setValue('po-units-per-purchase-unit', '1');
    document.getElementById('po-payment-terms').value = '';
    document.getElementById('po-expected-delivery').value = '';
    renderSelectedProductPanel();
    updateCreateSummary();
}

function purchaseOrderPayload(prefix, items, poId = null) {
    const supplierId = document.getElementById(`${prefix}-supplier-select`)?.value || '';
    const paymentTerms = document.getElementById(`${prefix}-payment-terms`)?.value || '';
    const expectedDeliveryDate = document.getElementById(`${prefix}-expected-delivery`)?.value || '';

    if (!supplierId || !paymentTerms || !expectedDeliveryDate || items.length === 0) {
        throw new Error('Select a supplier, payment terms, delivery date, and at least one product.');
    }

    const calculatedItems = items.map((item) => ({ item, calculation: applyPurchaseItemCalculation(item) }));
    const subtotal = calculatedItems.reduce((sum, entry) => sum + entry.calculation.lineTotal, 0);
    const payload = {
        supplier_id: supplierId,
        payment_terms: paymentTerms,
        expected_delivery_date: expectedDeliveryDate,
        total_items: items.length,
        subtotal,
        grand_total: subtotal,
        items: calculatedItems.map(({ item, calculation }) => ({
            po_item_id: item.po_item_id || null,
            product_id: item.product_id,
            product_name: productCoreName(item),
            brand_name: poBrandName(item),
            category_name: item.category_name || '',
            type_name: item.type_name || '',
            generic_name: item.generic_name || '',
            variant_flavor: item.variant_flavor || '',
            strength: item.strength || '',
            strength_value: item.strength_value || '',
            strength_unit: item.strength_unit || '',
            net_content_value: item.net_content_value || item.volume_value || '',
            net_content_unit: item.net_content_unit || item.volume_unit || '',
            volume_value: item.volume_value || '',
            volume_unit: item.volume_unit || '',
            size_value: item.size_value || '',
            weight_volume_value: item.weight_volume_value || '',
            weight_volume_unit: item.weight_volume_unit || '',
            unit: item.unit || unitDisplayFromDetails(item),
            packaging: item.packaging || '',
            price: Number(item.price || 0),
            purchase_unit: item.purchase_unit || purchaseUnitInfo(item).purchaseUnit || '',
            units_per_purchase_unit: Number(item.units_per_purchase_unit || item.purchase_unit_qty || 1),
            purchase_qty: Number(item.purchase_qty || item.quantity || 0),
            inventory_qty_ordered: calculation.totalBaseUnits,
            quantity: calculation.totalBaseUnits,
            line_total: calculation.lineTotal
        }))
    };

    if (poId) {
        payload.po_id = poId;
    } else {
        payload.pr_id = new URLSearchParams(window.location.search).get('pr_id') || '';
    }

    return payload;
}

async function submitPurchaseOrder() {
    try {
        const payload = purchaseOrderPayload('po', createDraftItems);
        PharmaUtils.modal.loading('Saving Purchase Order...');
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/create_po.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        PharmaUtils.modal.close();
        hideModal('createPurchaseOrderModal');
        await PharmaUtils.modal.success('Purchase Order Saved', `Purchase order ${data.po_number} was created successfully.`);
        resetCreateDraft();
        await loadPurchaseOrders({ updateSummary: true });
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to create purchase order', err.message);
    }
}

async function getPurchaseOrder(poId) {
    const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_order.php?po_id=${encodeURIComponent(poId)}`);
    return data.purchase_order;
}

function editDraftItemFromOrderItem(item) {
    const shelfStock = Number(item.shelf_stock ?? item.shelf_qty ?? 0);
    const storageStock = Number(item.storage_stock ?? item.storage_qty ?? 0);
    const draftItem = ensureEditItemIdentity({
        po_item_id: item.po_item_id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_display_name: productTableName(item),
        brand_name: item.brand_name,
        brand_display_name: productTableBrand(item),
        unit: item.unit,
        category_name: item.category_name,
        type_name: item.type_name,
        generic_name: item.generic_name,
        strength: item.strength,
        strength_value: item.strength_value,
        strength_unit: item.strength_unit,
        net_content_value: item.net_content_value || item.volume_value,
        net_content_unit: item.net_content_unit || item.volume_unit,
        volume_value: item.volume_value,
        volume_unit: item.volume_unit,
        variant_flavor: item.variant_flavor,
        size_value: item.size_value,
        weight_volume_value: item.weight_volume_value,
        weight_volume_unit: item.weight_volume_unit,
        packaging: item.packaging,
        purchase_unit: item.purchase_unit,
        units_per_purchase_unit: Number(item.units_per_purchase_unit || 1),
        purchase_unit_qty: Number(item.units_per_purchase_unit || 1),
        purchase_qty: Number(item.purchase_qty || item.quantity || 0),
        inventory_qty_ordered: Number(item.inventory_qty_ordered || item.quantity || 0),
        price: Number(item.price || 0),
        selling_price: Number(item.selling_price || 0),
        shelf_stock: shelfStock,
        storage_stock: storageStock,
        stock: shelfStock + storageStock,
        reorder_level: Number(item.reorder_level || item.reorder_qty || 10),
        quantity: Number(item.purchase_qty || item.quantity || 0)
    });
    draftItem.product_details = createProductDetailSnapshot(draftItem);
    return draftItem;
}

async function populateEditPurchaseOrder(order) {
    activeEditOrder = order;
    editMajorFieldsLocked = !canEditMajorFields(order);
    document.getElementById('edit-po-id').value = order.po_id;
    document.getElementById('editPoNumber').textContent = order.po_number;
    renderSupplierOptions(document.getElementById('edit-po-supplier-select'), order.supplier_id);
    await loadSupplierProducts(order.supplier_id, 'edit-po-product-select');
    document.getElementById('edit-po-payment-terms').value = order.payment_terms || 'Cash';
    document.getElementById('edit-po-expected-delivery').value = order.expected_delivery_date || '';
    editDraftItems.length = 0;
    order.items.forEach((item) => editDraftItems.push(editDraftItemFromOrderItem(item)));
    clearEditProductEditor();
    renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
    applyEditLocks(order);
}

function applyEditLocks(order) {
    const lockedTitle = isOperationallyLocked(order)
        ? `Items cannot be changed while this purchase order is ${order.status}.`
        : 'Item changes are locked after an approved PR is converted to a purchase order.';
    const lockMajor = !canEditMajorFields(order);
    const lockAll = isOperationallyLocked(order);
    editMajorFieldsLocked = lockMajor || lockAll;
    const supplierLocked = editDraftItems.length > 0 || editMajorFieldsLocked;

    [
        'edit-po-product-select',
        'edit-po-quantity',
        'edit-po-editor-quantity',
        'edit-po-editor-purchase-unit',
        'edit-po-editor-contains'
    ].forEach((id) => {
        const field = document.getElementById(id);
        if (!field) return;
        field.disabled = editMajorFieldsLocked;
        field.title = editMajorFieldsLocked ? lockedTitle : '';
    });
    const supplierField = document.getElementById('edit-po-supplier-select');
    if (supplierField) {
        supplierField.disabled = supplierLocked;
        supplierField.title = supplierLocked && editDraftItems.length > 0
            ? 'Supplier is locked because this purchase order already contains supplier-linked items.'
            : (editMajorFieldsLocked ? lockedTitle : '');
    }

    const lockNotice = document.getElementById('edit-po-lock-notice');
    if (lockNotice) {
        const message = editMajorFieldsLocked
            ? lockedTitle
            : (editDraftItems.length > 0 ? 'Supplier is locked while items are on this order. Remove all items before selecting another supplier.' : '');
        lockNotice.textContent = message;
        lockNotice.classList.toggle('d-none', !message);
    }

    const addButton = document.getElementById('btnEditAddPoItem');
    if (addButton) {
        addButton.disabled = editMajorFieldsLocked;
        addButton.title = editMajorFieldsLocked ? lockedTitle : '';
    }

    const saveButton = document.getElementById('btnUpdatePo');
    if (saveButton) {
        saveButton.disabled = lockAll || editDraftItems.length === 0;
        saveButton.title = lockAll ? 'This purchase order is locked after processing.' : (editDraftItems.length === 0 ? 'Add at least one item before saving.' : '');
        saveButton.textContent = order.approval_status === 'Revision Requested'
            ? 'Resubmit for Approval'
            : 'Save Changes';
    }
}

async function openViewPurchaseOrder(poId) {
    try {
        const order = await getPurchaseOrder(poId);
        activeViewOrder = order;
        document.getElementById('viewPoNumber').textContent = order.po_number;
        const generatedDocument = document.getElementById('generatedPoDocument');
        const generatedFrame = document.getElementById('generatedPoFrame');
        generatedDocument.hidden = false;
        generatedFrame.style.height = '1123px';
        generatedFrame.src = `purchase_order_print.html?po_id=${encodeURIComponent(order.po_id)}&embed=1`;
        const modalBody = document.querySelector('#viewPurchaseOrderModal .modal-body');
        if (modalBody) modalBody.scrollTop = 0;
        showModal('viewPurchaseOrderModal');
        window.requestAnimationFrame(() => { if (modalBody) modalBody.scrollTop = 0; });
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

window.addEventListener('message', (event) => {
    const frame = document.getElementById('generatedPoFrame');
    if (event.origin !== window.location.origin || event.source !== frame?.contentWindow || event.data?.type !== 'drp:purchase-order-preview-ready') return;
    frame.style.height = `${Math.max(1123, Number(event.data.height || 1123))}px`;
    const modalBody = document.querySelector('#viewPurchaseOrderModal .modal-body');
    if (modalBody) modalBody.scrollTop = 0;
});

function printPurchaseOrder(order) {
    if (!order) throw new Error('Open a purchase order before printing.');
    const printWindow = window.open('', '_blank');
    if (!printWindow) throw new Error('Allow pop-ups to print this purchase order.');
    const token = sessionStorage.getItem('pharma_tab_token');
    if (token) printWindow.sessionStorage.setItem('pharma_tab_token', token);
    printWindow.opener = null;
    printWindow.location.replace(`purchase_order_print.html?po_id=${encodeURIComponent(order.po_id)}&print=1`);
}

async function updatePurchaseOrderStatusFromTable(poId) {
    try {
        if (!poId) return;
        const order = await getPurchaseOrder(poId);
        const options = validNextStatuses(order);
        if (!options.length) {
            PharmaUtils.toast.info('No status changes are available for this purchase order.');
            return;
        }

        let nextStatus = '';
        let reason = '';
        if (window.Swal) {
            const result = await Swal.fire({
                title: 'Change PO Status',
                input: 'select',
                inputOptions: options.reduce((map, status) => ({ ...map, [status]: status }), {}),
                inputPlaceholder: 'Select next status',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Continue',
                confirmButtonColor: '#7c3aed',
                inputValidator: (value) => {
                    if (!value) return 'Select a valid next status.';
                    return null;
                }
            });

            if (!result.isConfirmed) return;
            nextStatus = result.value;
        } else {
            nextStatus = prompt(`Next status (${options.join(', ')}):`) || '';
            if (!options.includes(nextStatus)) {
                PharmaUtils.toast.error('Select a valid next status.');
                return;
            }
        }

        if (nextStatus === 'Cancelled') {
            reason = await requestControlledReason({
                title: 'Cancel Purchase Order',
                label: 'Cancellation Reason',
                confirmButtonText: 'Cancel PO',
                confirmColor: '#dc2626',
                options: CANCEL_REASON_OPTIONS,
                errorMessage: 'A cancellation reason is required.'
            });
            if (!reason) return;
        }

        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/update_purchase_order_status.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ po_id: poId, status: nextStatus, reason })
        });

        PharmaUtils.toast.success(data.message);
        await loadPurchaseOrders({ updateSummary: true });
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

const RECEIVE_ISSUE_TYPES = ['Damaged Product', 'Broken Package', 'Expired', 'Wrong Item', 'Short Quantity', 'Other'];
const RECEIVE_DISPOSITIONS = [
    ['return_to_supplier', 'Return to Supplier'],
    ['hold_quarantine', 'Hold / Quarantine'],
    ['dispose', 'Dispose']
];
const RECEIVE_RESOLUTIONS = [
    ['replacement', 'Replacement'],
    ['supplier_credit', 'Supplier Credit'],
    ['next_po_credit', 'Credit on Next PO'],
    ['no_compensation', 'No Supplier Compensation']
];
let receiveSubmitting = false;
let receiveValidationAttempted = false;

function receiveDraftItem(item) {
    const draftItems = activeReceiveOrder?.inspection_draft?.items || [];
    return draftItems.find((draft) => String(draft.po_item_id) === String(item.po_item_id)) || {};
}

function receiveBatchRow(batch = {}, requiresExpiry = false, autoAllocate = false) {
    const noExpiry = !requiresExpiry && (batch.no_expiry === true || (!batch.expiry_date && batch.no_expiry !== false));
    return `
        <div class="receive-batch-row" data-auto-allocation="${autoAllocate ? '1' : '0'}">
            <div class="receive-field"><label>Batch Identifier <span class="text-muted">(optional)</span></label><input class="form-control form-control-sm receive-batch-id" maxlength="50" value="${escapeHtml(batch.batch_identifier || '')}" placeholder="Supplier batch or auto-generated"></div>
            <div class="receive-field"><label>Batch Quantity</label><input class="form-control form-control-sm receive-batch-qty" type="number" min="1" step="1" value="${escapeHtml(batch.quantity ?? '')}"></div>
            <div class="receive-field"><label>Expiry Date${requiresExpiry ? ' *' : ''}</label><input class="form-control form-control-sm receive-batch-expiry" type="date" value="${escapeHtml(batch.expiry_date || '')}" ${noExpiry ? 'disabled' : ''}></div>
            <div>
                ${requiresExpiry ? '' : `<label class="receive-no-expiry"><input class="form-check-input receive-batch-no-expiry" type="checkbox" ${noExpiry ? 'checked' : ''}> No Expiry</label>`}
                <button class="btn btn-sm btn-outline-danger receive-remove-batch" type="button" title="Remove batch" aria-label="Remove batch"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
}

function receiveQuantityModel(orderItem = {}, values = {}) {
    const conversion = purchasingConversion({
        purchase_unit: orderItem.purchase_unit,
        inventory_unit: orderItem.unit || 'unit',
        units_per_purchase_unit: orderItem.units_per_purchase_unit || 1
    });
    const ordered = Number(orderItem.inventory_qty_ordered || orderItem.quantity || 0);
    const orderedPurchase = Number(orderItem.purchase_qty || (ordered / conversion.baseQtyPerPurchaseUnit) || 0);
    const hasPurchaseValue = Object.prototype.hasOwnProperty.call(values, 'delivered_purchase_quantity');
    const hasLegacyValue = Object.prototype.hasOwnProperty.call(values, 'delivered_quantity') || Object.prototype.hasOwnProperty.call(values, 'received_quantity');
    const deliveredPurchase = Number(hasPurchaseValue
        ? values.delivered_purchase_quantity
        : (hasLegacyValue ? Number(values.delivered_quantity ?? values.received_quantity ?? 0) / conversion.baseQtyPerPurchaseUnit : orderedPurchase));
    const delivered = inventoryQuantityFromPurchase(deliveredPurchase, conversion);
    const damaged = Math.max(0, Number(values.damaged_base_quantity ?? values.damaged_quantity ?? 0));
    const action = Math.max(0, Number(values.action_base_quantity ?? values.action_quantity ?? damaged));
    const missing = Math.max(0, ordered - delivered);
    const affected = Math.max(action, damaged) + missing;
    const legacyResolution = values.resolution || 'none';
    const resolution = ({ return_for_replacement: 'replacement', return_for_credit: 'supplier_credit', keep_with_discount: 'supplier_credit', reject_without_replacement: 'no_compensation', keep_damaged: 'no_compensation' })[legacyResolution] || legacyResolution;
    const legacyDisposition = values.disposition || values.damage_action || '';
    const disposition = ({ return: 'return_to_supplier', keep: 'hold_quarantine' })[legacyDisposition] || legacyDisposition;
    const returned = disposition === 'return_to_supplier' ? action : 0;
    const disposed = disposition === 'dispose' ? action : 0;
    const quarantined = disposition === 'hold_quarantine' ? action : 0;
    const accepted = Math.max(0, delivered - action);
    const resolved = affected > 0 && resolution !== 'none' ? affected : 0;
    const unitPrice = Number(orderItem.price || 0);
    return { ordered, orderedPurchase, deliveredPurchase, delivered, damaged, action, missing, accepted, affected, disposition, resolution, returned, disposed, quarantined, resolved, unitPrice, conversion };
}

function receiveConversionOptions(conversions, selectedId, inventoryUnit) {
    const rows = Array.isArray(conversions) && conversions.length
        ? conversions
        : [{ conversion_id: '', unit_name: inventoryUnit, base_quantity: 1 }];
    return rows.map((entry) => {
        const factor = Number(entry.base_quantity || 1);
        const label = `${entry.unit_name} — ${factor} ${inventoryUnit}`;
        return `<option value="${escapeHtml(entry.conversion_id)}" data-base-quantity="${factor}" data-unit-name="${escapeHtml(entry.unit_name)}" ${String(entry.conversion_id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
}

function receiveUnitCountLabel(quantity, unitName) {
    const count = Number(quantity || 0);
    const unit = String(unitName || 'unit');
    if (count === 1 || /^pc(s)?$/i.test(unit)) return `${count} ${unit}`;
    if (/[^aeiou]y$/i.test(unit)) return `${count} ${unit.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/i.test(unit)) return `${count} ${unit}es`;
    return `${count} ${unit}s`;
}

function receiveBaseQuantityBreakdown(quantity, conversions, inventoryUnit) {
    let remaining = Math.max(0, Math.trunc(Number(quantity || 0)));
    const rows = (Array.isArray(conversions) ? [...conversions] : [])
        .filter((entry) => Number(entry.base_quantity || 0) > 0)
        .sort((left, right) => Number(right.base_quantity) - Number(left.base_quantity));
    const parts = [];
    rows.forEach((entry) => {
        const factor = Number(entry.base_quantity);
        const count = Math.floor(remaining / factor);
        if (count <= 0) return;
        parts.push(receiveUnitCountLabel(count, entry.unit_name));
        remaining -= count * factor;
    });
    if (remaining > 0 || !parts.length) parts.push(receiveUnitCountLabel(remaining, inventoryUnit));
    return parts.join(' + ');
}

function receiveReceivedHierarchy(purchaseQuantity, conversion, conversions) {
    const receivedBase = inventoryQuantityFromPurchase(Number(purchaseQuantity || 0), conversion);
    const parts = (Array.isArray(conversions) ? [...conversions] : [])
        .filter((entry) => Number(entry.base_quantity || 0) > 0 && receivedBase % Number(entry.base_quantity) === 0)
        .sort((left, right) => Number(right.base_quantity) - Number(left.base_quantity))
        .map((entry) => receiveUnitCountLabel(receivedBase / Number(entry.base_quantity), entry.unit_name));
    const receivedLabel = receiveUnitCountLabel(purchaseQuantity, conversion.purchaseUnit);
    const remainder = parts.filter((part) => part !== receivedLabel);
    return `${receivedLabel} received${remainder.length ? ` = ${remainder.join(' = ')}` : ''}`;
}

function receiveDamageLineRow(line, conversions, inventoryUnit) {
    const rows = Array.isArray(conversions) && conversions.length ? conversions : [{ conversion_id: '', unit_name: inventoryUnit, base_quantity: 1 }];
    const base = rows.find((entry) => Number(entry.base_quantity) === 1) || rows[rows.length - 1];
    const packages = rows.filter((entry) => Number(entry.base_quantity) > 1);
    const affectedOptions = packages.length ? packages : rows;
    const defaultAffected = [...affectedOptions].sort((left, right) => Number(left.base_quantity) - Number(right.base_quantity))[0];
    const selectedAffected = affectedOptions.find((entry) => String(entry.conversion_id) === String(line?.affected_unit_conversion_id)) || defaultAffected;
    return `<div class="receive-damage-line" data-affected-sequence="0">
        <strong class="receive-damage-line-label">${escapeHtml(selectedAffected?.unit_name || 'Unit')}</strong>
        <div class="receive-field"><label>Affected Unit</label><select class="form-select damage-affected-unit">${affectedOptions.map((entry) => `<option value="${escapeHtml(entry.conversion_id)}" data-base-quantity="${Number(entry.base_quantity || 1)}" data-unit-name="${escapeHtml(entry.unit_name)}" ${String(entry.conversion_id) === String(selectedAffected?.conversion_id) ? 'selected' : ''}>${escapeHtml(`${entry.unit_name} — ${Number(entry.base_quantity || 1)} ${inventoryUnit}`)}</option>`).join('')}</select></div>
        <div class="receive-field"><label>Damaged Pieces</label><div class="receive-damage-piece-control"><input class="form-control damage-line-qty" type="number" min="1" step="1" value="${escapeHtml(line?.damaged_quantity ?? '')}" placeholder="Qty"><span>${escapeHtml(base?.unit_name || inventoryUnit)}</span></div><small class="receive-field-error damage-line-error"></small></div>
        <button class="btn btn-sm btn-outline-danger receive-remove-damage-line" type="button" title="Remove affected package" aria-label="Remove affected package"><i class="fa-solid fa-trash"></i></button>
        <input class="damage-unit-conversion" type="hidden" value="${escapeHtml(base?.conversion_id || '')}">
    </div>`;
}

function receiveQuantityValuesWithConversions(orderItem, values = {}) {
    const conversions = Array.isArray(orderItem?.package_conversions) ? orderItem.package_conversions : [];
    const factorFor = (conversionId) => Number(conversions.find((entry) => String(entry.conversion_id) === String(conversionId))?.base_quantity || 1);
    if (!Object.prototype.hasOwnProperty.call(values, 'action_quantity') && !values.damaged_unit_conversion_id) return values;
    return {
        ...values,
        damaged_base_quantity: Number(values.damaged_quantity || 0) * factorFor(values.damaged_unit_conversion_id),
        action_base_quantity: Number(values.action_quantity || 0) * factorFor(values.action_unit_conversion_id)
    };
}

function renderReceiveItems(order) {
    const container = document.getElementById('receiveInspectionCards');
    if (!container) return;
    container.innerHTML = (order.items || []).map((item, index) => {
        const draft = receiveDraftItem(item);
        const packageConversions = Array.isArray(item.package_conversions) ? item.package_conversions : [];
        const baseConversion = packageConversions.find((entry) => Number(entry.base_quantity) === 1)
            || packageConversions[packageConversions.length - 1]
            || { conversion_id: '', unit_name: item.unit || 'unit', base_quantity: 1 };
        const actionConversion = packageConversions.find((entry) => entry.conversion_id === (draft.action_unit_conversion_id || draft.unit_conversion_id))
            || baseConversion;
        const legacySelectedQuantity = draft.affected_quantity ?? '';
        const damageLines = Array.isArray(draft.damage_lines) ? draft.damage_lines : [];
        if (!damageLines.length && Number(draft.damaged_base_quantity || draft.damaged_quantity || 0) > 0) {
            damageLines.push({ affected_unit_conversion_id: draft.damaged_unit_conversion_id || baseConversion.conversion_id, damaged_quantity: Number(draft.damaged_base_quantity || draft.damaged_quantity || 0), damaged_unit_conversion_id: baseConversion.conversion_id });
        }
        const actionInput = draft.action_quantity ?? legacySelectedQuantity;
        const damagedBase = damageLines.reduce((sum, line) => sum + Number(line.damaged_quantity || 0) * Number(packageConversions.find((entry) => String(entry.conversion_id) === String(line.damaged_unit_conversion_id))?.base_quantity || 1), 0);
        const actionBase = Number(actionInput || 0) * Number(actionConversion.base_quantity || 1);
        const quantities = receiveQuantityModel(item, { ...draft, damaged_base_quantity: damagedBase, action_base_quantity: actionBase });
        const { ordered, orderedPurchase, deliveredPurchase, delivered, damaged, accepted, conversion } = quantities;
        const requiresExpiry = isMedicineItem(item);
        const batches = Array.isArray(draft.batches) && draft.batches.length
            ? draft.batches
            : (accepted > 0 ? [{ quantity: accepted, expiry_date: '', no_expiry: !requiresExpiry, auto_allocate: true }] : []);
        const resolution = quantities.resolution;
        const disposition = quantities.disposition;
        const hasIssue = draft.has_issue === true || draft.has_issue === 1 || draft.has_issue === '1' || quantities.affected > 0;
        const storedIssueType = String(draft.issue_type || '');
        const draftIssueType = storedIssueType.startsWith('Other:') ? 'Other' : storedIssueType;
        const draftIssueDetail = String(draft.issue_detail || (storedIssueType.startsWith('Other:') ? storedIssueType.slice(6).trim() : ''));
        const productName = productTableProductName(item);
        const brandName = productTableBrand(item);
        const subtitle = [productSpecification(item), productSizeValue(item), unitDisplayFromDetails(item), productPackagingValue(item)].filter(Boolean).join(' · ');
        return `
        <article class="receive-item-card" data-product-index="${index}" data-po-item-id="${escapeHtml(item.po_item_id)}" data-requires-expiry="${requiresExpiry ? '1' : '0'}" data-has-draft="${Object.keys(draft).length ? '1' : '0'}" ${index === 0 ? '' : 'hidden'}>
            <button class="receive-card-toggle" type="button" aria-expanded="${index === 0 ? 'true' : 'false'}">
                <span class="receive-item-index">${index + 1}</span>
                <span class="receive-card-title"><strong>${escapeHtml([brandName, productName].filter(Boolean).join(' — '))}</strong><small>${escapeHtml(subtitle || quantityWithInventoryUnit(item, ordered))}</small></span>
                <span class="receive-item-result">
                    <span>Ordered<b class="receive-header-ordered">${orderedPurchase} ${escapeHtml(conversion.purchaseUnit)}</b></span>
                    <span>Accepted<b class="receive-header-accepted">${accepted} ${escapeHtml(conversion.inventoryUnit)}</b></span>
                    <span>Unavailable<b class="receive-header-affected">${quantities.affected} ${escapeHtml(conversion.inventoryUnit)}</b></span>
                </span>
                <span class="receive-status-stack"><span class="receive-inspection-badge">Waiting</span><span class="receive-issue-flag d-none">Issue Found</span></span>
            </button>
            ${inactivePoProductWarning(item)}
            <div class="receive-card-body ${index === 0 ? '' : 'd-none'}">
                <div class="receive-product-facts">
                    <div><span>Brand</span><strong>${escapeHtml(brandName || '-')}</strong></div>
                    <div><span>Product</span><strong>${escapeHtml(productName || '-')}</strong></div>
                    <div><span>Specification</span><strong>${escapeHtml(productSpecification(item) || '-')}</strong></div>
                    <div><span>Purchase Unit</span><strong>${escapeHtml(conversion.purchaseUnit)}</strong></div>
                    <div><span>Inventory Equivalent</span><strong>${ordered} ${escapeHtml(conversion.inventoryUnit)}</strong></div>
                </div>
                <div class="receive-form-grid">
                    <section class="receive-process-card receiving-inspection-card receive-scroll-target">
                        <div class="section-card-heading"><span class="section-card-icon inspection"><i class="fa-solid fa-clipboard-check"></i></span><div><span class="section-eyebrow">Step 1</span><h3>Inspect Product</h3></div></div>
                        <div class="receive-quantity-grid receive-arrival-grid">
                            <div class="receive-field receive-quantity-anchor"><label>Received ${escapeHtml(conversion.purchaseUnit)} Qty</label><div class="receive-actual-control"><input class="form-control receive-qty-input" type="number" min="0" max="${escapeHtml(orderedPurchase)}" step="1" value="${escapeHtml(deliveredPurchase)}"><span>${escapeHtml(conversion.purchaseUnit)}</span></div><small class="receive-inventory-equivalent">${escapeHtml(receiveReceivedHierarchy(deliveredPurchase, conversion, packageConversions))}</small><small class="receive-field-error receive-qty-error"></small></div>
                            <div class="receive-field receive-any-issue-field"><label>Any Issue?</label><select class="form-select receive-issue-toggle" aria-label="Any Issue"><option value="0" ${hasIssue ? '' : 'selected'}>No</option><option value="1" ${hasIssue ? 'selected' : ''}>Yes</option></select><small class="receive-shortage-note">${quantities.missing > 0 ? `Short by ${quantities.missing} ${escapeHtml(conversion.inventoryUnit)}` : 'No shortage detected.'}</small></div>
                        </div>
                    </section>
                    <div class="receive-field receive-inspection-action receive-scroll-target">
                        <label>Inspection Status</label>
                        <div class="receive-inspection-control">
                            <span class="receive-readiness-text">Complete the required checks below.</span>
                            <button class="btn btn-sm btn-primary receive-complete-inspection" type="button" disabled><i class="fa-solid fa-clipboard-check me-1"></i>Complete Product Inspection</button>
                            <span class="receive-completed-action d-none"><i class="fa-solid fa-circle-check me-1"></i>Inspection Complete</span>
                            <button class="btn btn-sm btn-outline-secondary receive-reopen-inspection d-none" type="button"><i class="fa-solid fa-pen me-1"></i>Reopen Inspection</button>
                            <input class="receive-inspected-input" type="hidden" value="${draft.inspection_complete ? '1' : '0'}">
                        </div>
                    </div>
                    <section class="receive-issue-panel receive-process-card receive-scroll-target ${hasIssue ? '' : 'd-none'}">
                        <div class="section-card-heading"><span class="section-card-icon issue"><i class="fa-solid fa-triangle-exclamation"></i></span><div><span class="section-eyebrow">Issue</span><h3>Issue Details</h3></div></div>
                        <div class="receive-damage-breakdown receive-damage-anchor">
                            <div class="receive-damage-breakdown-head"><div><strong>Damage Breakdown</strong><small>Record each affected package separately.</small></div><button class="btn btn-sm btn-outline-primary receive-add-damage-line" type="button"><i class="fa-solid fa-plus me-1"></i>Add Affected Pack</button></div>
                            <div class="receive-damage-lines">${damageLines.map((line) => receiveDamageLineRow(line, packageConversions, conversion.inventoryUnit)).join('')}</div>
                            <div class="receive-damage-totals"><span>Affected Packs: <strong class="receive-affected-package-count">${damageLines.length}</strong></span><span>Physically Damaged: <strong class="damaged-base-equivalent">${damagedBase} ${escapeHtml(conversion.inventoryUnit)}</strong></span></div>
                            <small class="receive-field-error receive-damaged-error"></small>
                        </div>
                        <div class="receive-field receive-issue-type-field"><label>Issue Type *</label><select class="form-select receive-issue-type"><option value="">Select issue...</option>${RECEIVE_ISSUE_TYPES.map((value) => `<option value="${value}" ${draftIssueType === value ? 'selected' : ''}>${value}</option>`).join('')}</select><small class="receive-field-error receive-issue-type-error"></small></div>
                        <div class="receive-field receive-disposition-field"><label>Affected Goods Action *</label><select class="form-select receive-disposition"><option value="">Select action...</option>${RECEIVE_DISPOSITIONS.map(([value, label]) => `<option value="${value}" ${disposition === value ? 'selected' : ''}>${label}</option>`).join('')}<option value="not_applicable" ${disposition === 'not_applicable' ? 'selected' : ''}>Not Applicable</option></select><small class="receive-field-error receive-disposition-error"></small></div>
                        <div class="receive-field receive-action-quantity-field ${disposition && disposition !== 'not_applicable' ? '' : 'd-none'}"><label>Action Qty *</label><div class="receive-affected-control"><input class="form-control action-qty-input" type="number" min="0" step="1" value="${escapeHtml(actionInput)}" placeholder="Qty"><select class="form-select action-unit-conversion">${receiveConversionOptions(packageConversions, actionConversion.conversion_id, conversion.inventoryUnit)}</select></div><small class="action-base-equivalent">${escapeHtml(receiveUnitCountLabel(actionInput, actionConversion.unit_name))} = ${actionBase} ${escapeHtml(conversion.inventoryUnit)} removed</small><small class="receive-field-error receive-action-error"></small></div>
                        <div class="receive-field receive-resolution-field"><label>Supplier Resolution *</label><select class="form-select receive-resolution"><option value="none">Select resolution...</option>${RECEIVE_RESOLUTIONS.map(([value, label]) => `<option value="${value}" ${resolution === value ? 'selected' : ''}>${label}</option>`).join('')}</select><small class="receive-field-error receive-resolution-error"></small></div>
                        <div class="receive-field receive-other-issue-field ${draftIssueType === 'Other' ? '' : 'd-none'}"><label>Specify Issue *</label><input class="form-control receive-issue-other" maxlength="70" value="${escapeHtml(draftIssueDetail)}" placeholder="Describe the issue"><small class="receive-field-error receive-other-error"></small></div>
                        <div class="receive-field receive-item-remarks-field"><label>Item Remarks</label><textarea class="form-control receive-remarks-input" rows="3" placeholder="Optional details about the discrepancy or supplier agreement...">${escapeHtml(draft.remarks || '')}</textarea></div>
                    </section>
                    <section class="receive-accepted-panel accepted-field">
                        <label>Accepted to Inventory</label><div class="receive-calculated receive-accepted-qty">${accepted} ${escapeHtml(conversion.inventoryUnit)} total</div><small class="receive-accepted-source">${actionBase > 0 ? `${delivered} ${escapeHtml(conversion.inventoryUnit)} received − ${actionBase} ${escapeHtml(conversion.inventoryUnit)} unavailable` : `Equivalent remaining: ${escapeHtml(receiveBaseQuantityBreakdown(accepted, packageConversions, conversion.inventoryUnit))}`}</small><small class="receive-accepted-equivalent ${actionBase > 0 ? '' : 'd-none'}">Equivalent remaining: ${escapeHtml(receiveBaseQuantityBreakdown(accepted, packageConversions, conversion.inventoryUnit))}</small>
                    </section>
                    <section class="receive-batches receive-process-card receive-scroll-target">
                        <div class="receive-batches-head"><div class="section-card-heading"><span class="section-card-icon inventory"><i class="fa-solid fa-boxes-stacked"></i></span><div><span class="section-eyebrow">Step 2</span><h3>Batch &amp; Expiry</h3></div></div><button class="btn btn-sm btn-outline-primary receive-add-batch" type="button"><i class="fa-solid fa-plus me-1"></i>Add Batch</button></div>
                        <div class="receive-allocation-summary"><strong class="receive-allocation-state">Allocated 0 / ${accepted}</strong><span class="receive-allocation-badge">Incomplete</span></div><div class="receive-allocation-reason">${accepted} units remaining.</div>
                        <div class="receive-batch-list">${batches.map((batch) => receiveBatchRow(batch, requiresExpiry, batch.auto_allocate === true || (batches.length === 1 && batch.auto_allocate !== false))).join('')}</div>
                    </section>
                </div>
            </div>
        </article>`;
    }).join('');
    const navigator = document.getElementById('receiveProductNavigator');
    if (navigator) {
        navigator.innerHTML = (order.items || []).map((item, index) => {
            const draft = receiveDraftItem(item);
            const name = [productTableBrand(item), productTableProductName(item)].filter(Boolean).join(' — ');
            return `<button class="product-nav-item${index === 0 ? ' is-active' : ''}" type="button" data-product-index="${index}"><span class="product-nav-index">${index + 1}</span><span class="product-nav-copy"><strong>${escapeHtml(name || `Product ${index + 1}`)}</strong><small>${draft.inspection_complete ? 'Inspection Complete' : (Object.keys(draft).length ? 'Inspection in Progress' : 'Not Started')}</small></span><i class="fa-solid ${draft.inspection_complete ? 'fa-circle-check' : 'fa-circle'} product-nav-state"></i></button>`;
        }).join('');
    }
    activeInspectionProductIndex = 0;
    showReceiveProduct(0, false);
}

function orderTotal(order) {
    return (order?.items || []).reduce((total, item) => total + productLineTotal(item), 0);
}

function setReceiveCardLocked(card, locked) {
    card.classList.toggle('is-locked', locked);
    card.querySelectorAll('.receiving-inspection-card input, .receive-issue-panel input, .receive-issue-panel select, .receive-issue-panel textarea').forEach((control) => {
        if (locked) {
            control.disabled = true;
            return;
        }
        control.disabled = false;
    });
}

function receiveFormState(strict = true) {
    const state = {
        ordered: 0,
        received: 0,
        accepted: 0,
        affected: 0,
        remaining: 0,
        errors: [],
        hardErrors: [],
        items: [],
        taskTotal: 0,
        taskCompleted: 0,
        checks: { inspection: true, batches: true, confirmation: true },
        applicable: { inspection: true, batches: true, confirmation: true }
    };

    document.querySelectorAll('#receiveInspectionCards .receive-item-card').forEach((card, cardIndex) => {
        const orderItem = activeReceiveOrder?.items.find((item) => String(item.po_item_id) === String(card.dataset.poItemId));
        const deliveredPurchase = Number(card.querySelector('.receive-qty-input')?.value || 0);
        const damageLines = [];
        let damaged = 0;
        let affectedPackageCapacity = 0;
        let damageLinesValid = true;
        const affectedSequences = new Map();
        [...card.querySelectorAll('.receive-damage-line')].forEach((row, lineIndex) => {
            const affectedUnit = row.querySelector('.damage-affected-unit');
            const affectedUnitConversionId = affectedUnit?.value || '';
            const affectedUnitBaseQuantity = Number(affectedUnit?.selectedOptions?.[0]?.dataset.baseQuantity || 1);
            const affectedUnitName = affectedUnit?.selectedOptions?.[0]?.dataset.unitName || 'Unit';
            const damagedQuantity = Number(row.querySelector('.damage-line-qty')?.value || 0);
            const damagedUnitConversionId = row.querySelector('.damage-unit-conversion')?.value || '';
            const damagedUnitBaseQuantity = Number((orderItem?.package_conversions || []).find((entry) => String(entry.conversion_id) === String(damagedUnitConversionId))?.base_quantity || 1);
            const damagedBaseQuantity = damagedQuantity * damagedUnitBaseQuantity;
            const sequence = (affectedSequences.get(affectedUnitName) || 0) + 1;
            affectedSequences.set(affectedUnitName, sequence);
            const label = row.querySelector('.receive-damage-line-label');
            if (label) label.textContent = `${affectedUnitName} ${sequence}`;
            const rowValid = Number.isInteger(damagedQuantity) && damagedQuantity > 0 && damagedBaseQuantity <= affectedUnitBaseQuantity;
            damageLinesValid = damageLinesValid && rowValid;
            damaged += Math.max(0, damagedBaseQuantity);
            affectedPackageCapacity += affectedUnitBaseQuantity;
            const rowError = row.querySelector('.damage-line-error');
            if (rowError) rowError.textContent = damagedBaseQuantity > affectedUnitBaseQuantity
                ? `Damage cannot exceed ${affectedUnitBaseQuantity} ${orderItem?.unit || 'units'} in one ${affectedUnitName}.`
                : (receiveValidationAttempted && !rowValid ? 'Enter a positive damaged quantity.' : '');
            row.querySelector('.damage-line-qty')?.classList.toggle('is-invalid', damagedBaseQuantity > affectedUnitBaseQuantity);
            const lineQuantityInput = row.querySelector('.damage-line-qty');
            if (lineQuantityInput) lineQuantityInput.max = String(Math.floor(affectedUnitBaseQuantity / Math.max(1, damagedUnitBaseQuantity)));
            damageLines.push({ sequence_no: lineIndex + 1, affected_unit_conversion_id: affectedUnitConversionId, damaged_quantity: damagedQuantity, damaged_unit_conversion_id: damagedUnitConversionId });
        });
        const baseConversion = (orderItem?.package_conversions || []).find((entry) => Number(entry.base_quantity) === 1) || (orderItem?.package_conversions || []).slice(-1)[0] || {};
        const damagedQuantity = damaged;
        const damagedUnitConversionId = baseConversion.conversion_id || '';
        const actionQuantity = Number(card.querySelector('.action-qty-input')?.value || 0);
        const actionUnit = card.querySelector('.action-unit-conversion');
        const actionUnitConversionId = actionUnit?.value || '';
        const actionUnitBaseQuantity = Number(actionUnit?.selectedOptions?.[0]?.dataset.baseQuantity || 1);
        let issueSelected = card.querySelector('.receive-issue-toggle')?.value === '1';
        if (!issueSelected) damaged = 0;
        let action = issueSelected ? actionQuantity * actionUnitBaseQuantity : 0;
        const inspectionInput = card.querySelector('.receive-inspected-input');
        let inspected = inspectionInput?.value === '1';
        const issueType = card.querySelector('.receive-issue-type')?.value || '';
        const issueDetail = card.querySelector('.receive-issue-other')?.value.trim() || '';
        let disposition = card.querySelector('.receive-disposition')?.value || '';
        const resolution = card.querySelector('.receive-resolution')?.value || 'none';
        if (disposition === 'not_applicable') action = 0;
        let quantities = receiveQuantityModel(orderItem, { delivered_purchase_quantity: deliveredPurchase, damaged_base_quantity: damaged, action_base_quantity: action, disposition, resolution });
        if (quantities.missing > 0) {
            issueSelected = true;
            const issueControl = card.querySelector('.receive-issue-toggle');
            if (issueControl) issueControl.value = '1';
            if (!disposition && damaged === 0) disposition = 'not_applicable';
            const dispositionControl = card.querySelector('.receive-disposition');
            if (dispositionControl && !dispositionControl.value && damaged === 0) dispositionControl.value = 'not_applicable';
            quantities = receiveQuantityModel(orderItem, { delivered_purchase_quantity: deliveredPurchase, damaged_base_quantity: damaged, action_base_quantity: action, disposition, resolution });
        }
        const { ordered, orderedPurchase, delivered, missing, accepted, affected, returned, disposed, quarantined } = quantities;
        const packageConversions = Array.isArray(orderItem?.package_conversions) ? orderItem.package_conversions : [];
        const itemRemarks = card.querySelector('.receive-remarks-input')?.value.trim() || '';
        const physicalAction = ['return_to_supplier', 'hold_quarantine', 'dispose'].includes(disposition);
        const quantitiesComplete = Number.isInteger(deliveredPurchase) && deliveredPurchase >= 0 && deliveredPurchase <= orderedPurchase
            && damageLinesValid && affectedPackageCapacity <= delivered && damaged <= delivered
            && Number.isInteger(actionQuantity) && actionQuantity >= 0 && action <= delivered;
        const itemErrors = [];

        if (!Number.isInteger(deliveredPurchase) || deliveredPurchase < 0) itemErrors.push('Delivered Purchase Unit quantity must be a non-negative whole number.');
        if (!damageLinesValid) itemErrors.push('Complete each damage breakdown row with a valid quantity.');
        if (affectedPackageCapacity > delivered) itemErrors.push('Affected package rows exceed the quantity physically received.');
        if (!Number.isInteger(actionQuantity) || actionQuantity < 0) itemErrors.push('Action quantity must be a non-negative whole number.');
        if (deliveredPurchase > orderedPurchase) { itemErrors.push('Delivered quantity exceeds the ordered PO quantity. Resolve the excess before confirming.'); state.hardErrors.push(`Product ${cardIndex + 1}: Delivered quantity exceeds the ordered quantity.`); }
        if (damaged > delivered) { itemErrors.push('Damaged quantity exceeds the received quantity.'); state.hardErrors.push(`Product ${cardIndex + 1}: Damaged quantity exceeds the received quantity.`); }
        if (action > delivered) { itemErrors.push('Action quantity exceeds the received quantity.'); state.hardErrors.push(`Product ${cardIndex + 1}: Action quantity exceeds the received quantity.`); }
        if (physicalAction && action < damaged) itemErrors.push('Action quantity cannot be less than the physically damaged quantity.');
        if (issueSelected && missing === 0 && damaged === 0 && action === 0) itemErrors.push('Enter a damaged or action quantity.');
        if (strict && issueSelected && !issueType) itemErrors.push('Select an issue type.');
        if (strict && issueSelected && issueType === 'Other' && !issueDetail) itemErrors.push('Specify the issue.');
        if (strict && issueSelected && !disposition) itemErrors.push('Select a disposition.');
        if (strict && physicalAction && action <= 0) itemErrors.push('Enter the action quantity.');
        if (strict && damaged > 0 && disposition === 'not_applicable') itemErrors.push('Select what will physically happen to the damaged goods.');
        if (strict && missing > 0 && damaged === 0 && action === 0 && disposition !== 'not_applicable') itemErrors.push('Use Not Applicable for a short delivery with no goods to remove.');
        if (strict && issueSelected && resolution === 'none') itemErrors.push('Select a requested resolution.');

        let batchRows = [...card.querySelectorAll('.receive-batch-row')];
        if (accepted > 0 && batchRows.length === 0) {
            card.querySelector('.receive-batch-list')?.insertAdjacentHTML('beforeend', receiveBatchRow({ quantity: accepted, expiry_date: '', no_expiry: card.dataset.requiresExpiry !== '1' }, card.dataset.requiresExpiry === '1', true));
            batchRows = [...card.querySelectorAll('.receive-batch-row')];
        }
        const autoRow = batchRows.find((row) => row.dataset.autoAllocation === '1') || null;
        const hasOtherFilledBatch = batchRows.some((row) => row !== autoRow && String(row.querySelector('.receive-batch-qty')?.value || '').trim() !== '');
        if (autoRow && accepted === 0) {
            autoRow.remove();
            batchRows = batchRows.filter((row) => row !== autoRow);
        } else if (autoRow && !hasOtherFilledBatch) {
            autoRow.querySelector('.receive-batch-qty').value = String(accepted);
        }
        const batches = [];
        let allocated = 0;
        batchRows.forEach((row) => {
            const rawQuantity = String(row.querySelector('.receive-batch-qty')?.value || '').trim();
            if (rawQuantity === '') return;
            const quantity = Number(rawQuantity);
            const noExpiry = row.querySelector('.receive-batch-no-expiry')?.checked === true;
            const expiryDate = row.querySelector('.receive-batch-expiry')?.value || '';
            if (strict && (!Number.isInteger(quantity) || quantity <= 0)) itemErrors.push('Every batch needs a positive whole quantity.');
            if (strict && accepted > 0 && card.dataset.requiresExpiry === '1' && !expiryDate) itemErrors.push('An expiry date is required for every medicine batch.');
            allocated += Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
            batches.push({ batch_identifier: row.querySelector('.receive-batch-id')?.value.trim() || '', quantity, expiry_date: expiryDate, no_expiry: noExpiry, auto_allocate: row.dataset.autoAllocation === '1' });
        });

        const batchRowsValid = batches.every((batch) => Number.isInteger(batch.quantity) && batch.quantity > 0);
        const batchesComplete = batchRowsValid && allocated === accepted && (accepted === 0 || batches.length > 0);
        const expiryComplete = accepted === 0 || card.dataset.requiresExpiry !== '1' || (batches.length > 0 && batches.every((batch) => Boolean(batch.expiry_date)));
        const issueComplete = !issueSelected || (Boolean(issueType) && (issueType !== 'Other' || Boolean(issueDetail)) && Boolean(disposition) && resolution !== 'none'
            && (!physicalAction || (action > 0 && action >= damaged))
            && !(damaged > 0 && disposition === 'not_applicable')
            && !(missing > 0 && damaged === 0 && action === 0 && disposition !== 'not_applicable'));
        const readyForInspection = quantitiesComplete && issueComplete;

        if (strict && allocated > accepted) itemErrors.push(`Allocated inventory exceeds accepted inventory by ${allocated - accepted} unit${allocated - accepted === 1 ? '' : 's'}.`);
        if (strict && allocated < accepted) itemErrors.push(`${accepted - allocated} unit${accepted - allocated === 1 ? '' : 's'} remain to be allocated to inventory batches.`);
        if (strict && accepted > 0 && batches.length === 0) itemErrors.push('Add at least one accepted batch.');
        if (strict && accepted === 0 && allocated !== 0) itemErrors.push('No batch stock can be allocated when accepted quantity is zero.');
        if (inspected && !readyForInspection) {
            inspected = false;
            if (inspectionInput) inspectionInput.value = '0';
        }
        if (strict && !inspected) itemErrors.push(readyForInspection ? 'Complete this product inspection.' : 'Finish the required product details.');

        state.ordered += ordered;
        state.received += delivered;
        state.accepted += accepted;
        state.affected += affected;
        if (!inspected) state.remaining += 1;
        state.taskTotal += 3;
        state.taskCompleted += [inspected, batchesComplete && expiryComplete, inspected && batchesComplete && expiryComplete].filter(Boolean).length;
        state.checks.inspection = state.checks.inspection && inspected;
        state.checks.batches = state.checks.batches && batchesComplete && expiryComplete;
        state.checks.confirmation = state.checks.confirmation && inspected && batchesComplete && expiryComplete;
        state.errors.push(...itemErrors.map((error) => `Product ${cardIndex + 1}: ${error}`));
        state.items.push({ po_item_id: card.dataset.poItemId, delivered_purchase_quantity: deliveredPurchase, delivered_quantity: delivered, received_quantity: delivered, has_issue: issueSelected, damage_lines: issueSelected ? damageLines : [], damaged_quantity: issueSelected ? damagedQuantity : 0, damaged_unit_conversion_id: damagedUnitConversionId, damaged_base_quantity: damaged, action_quantity: issueSelected && physicalAction ? actionQuantity : 0, action_unit_conversion_id: actionUnitConversionId, action_base_quantity: action, affected_quantity: issueSelected ? (physicalAction ? actionQuantity : damagedQuantity) : 0, unit_conversion_id: physicalAction ? actionUnitConversionId : damagedUnitConversionId, returned_quantity: returned, quarantined_quantity: quarantined, disposed_quantity: disposed, disposition: issueSelected ? disposition : '', issue_type: issueSelected ? issueType : '', issue_detail: issueSelected && issueType === 'Other' ? issueDetail : '', resolution: issueSelected ? resolution : 'none', batches, remarks: issueSelected ? itemRemarks : '', inspection_complete: inspected, accepted_quantity: accepted, missing_quantity: missing });

        card.dataset.ready = readyForInspection ? '1' : '0';
        card.dataset.checkQuantities = quantitiesComplete ? '1' : '0';
        card.dataset.checkBatches = batchesComplete ? '1' : '0';
        card.dataset.checkExpiry = expiryComplete ? '1' : '0';
        card.dataset.checkResolution = issueComplete ? '1' : '0';
        card.dataset.checkRemarks = issueComplete ? '1' : '0';
        card.dataset.checkFinalInspection = inspected ? '1' : '0';
        card.classList.toggle('has-error', deliveredPurchase > orderedPurchase || damaged > delivered || affectedPackageCapacity > delivered || action > delivered || (physicalAction && action < damaged));
        const missingQuantity = card.querySelector('.receive-missing-qty');
        if (missingQuantity) missingQuantity.textContent = String(missing);
        const missingPurchase = card.querySelector('.receive-missing-purchase');
        if (missingPurchase) missingPurchase.textContent = `Remaining: ${Math.max(0, orderedPurchase - deliveredPurchase)} ${quantities.conversion.purchaseUnit}`;
        card.querySelector('.receive-accepted-qty').textContent = `${accepted} ${quantities.conversion.inventoryUnit} total`;
        const acceptedSource = card.querySelector('.receive-accepted-source');
        const acceptedEquivalent = card.querySelector('.receive-accepted-equivalent');
        const acceptedBreakdown = receiveBaseQuantityBreakdown(accepted, packageConversions, quantities.conversion.inventoryUnit);
        if (acceptedSource) acceptedSource.textContent = action > 0
            ? `${delivered} ${quantities.conversion.inventoryUnit} received − ${action} ${quantities.conversion.inventoryUnit} unavailable`
            : `Equivalent remaining: ${acceptedBreakdown}`;
        if (acceptedEquivalent) {
            acceptedEquivalent.textContent = `Equivalent remaining: ${acceptedBreakdown}`;
            acceptedEquivalent.classList.toggle('d-none', action <= 0);
        }
        const damagedEquivalent = card.querySelector('.damaged-base-equivalent');
        if (damagedEquivalent) damagedEquivalent.textContent = `${damaged} ${quantities.conversion.inventoryUnit} total`;
        const affectedCount = card.querySelector('.receive-affected-package-count');
        if (affectedCount) affectedCount.textContent = String(damageLines.length);
        const actionEquivalent = card.querySelector('.action-base-equivalent');
        if (actionEquivalent) {
            const actionUnitName = actionUnit?.selectedOptions?.[0]?.dataset.unitName || quantities.conversion.inventoryUnit;
            actionEquivalent.textContent = `${receiveUnitCountLabel(actionQuantity, actionUnitName)} = ${action} ${quantities.conversion.inventoryUnit} removed`;
        }
        const receivedEquivalent = card.querySelector('.receive-inventory-equivalent');
        if (receivedEquivalent) receivedEquivalent.textContent = receiveReceivedHierarchy(deliveredPurchase, quantities.conversion, packageConversions);
        const actionInput = card.querySelector('.action-qty-input');
        if (actionInput) actionInput.max = String(Math.floor(delivered / Math.max(1, actionUnitBaseQuantity)));
        card.querySelector('.receive-issue-panel').classList.toggle('d-none', !issueSelected);
        card.querySelector('.receive-other-issue-field')?.classList.toggle('d-none', issueType !== 'Other');
        const shortOnly = issueType === 'Short Quantity' && missing > 0 && damaged === 0;
        const dispositionControl = card.querySelector('.receive-disposition');
        if (shortOnly && dispositionControl) dispositionControl.value = 'not_applicable';
        dispositionControl?.querySelectorAll('option').forEach((option) => {
            if (option.value === 'not_applicable') option.hidden = false;
            else if (option.value) option.hidden = shortOnly;
        });
        card.querySelector('.receive-action-quantity-field')?.classList.toggle('d-none', !physicalAction);

        const showFieldErrors = strict && receiveValidationAttempted;
        const fieldErrors = [
            ['.receive-qty-error', !Number.isInteger(deliveredPurchase) || deliveredPurchase < 0 || deliveredPurchase > orderedPurchase, 'Enter a valid received quantity.'],
            ['.receive-damaged-error', issueSelected && (!damageLinesValid || affectedPackageCapacity > delivered || damaged > delivered), affectedPackageCapacity > delivered ? `Cannot add affected packages beyond ${receiveUnitCountLabel(deliveredPurchase, quantities.conversion.purchaseUnit)} received.` : 'Complete the damage breakdown.'],
            ['.receive-action-error', issueSelected && physicalAction && (!Number.isInteger(actionQuantity) || action <= 0 || action > delivered || action < damaged), action < damaged ? 'Action Qty must cover all damaged units.' : 'Enter a valid action quantity.'],
            ['.receive-issue-type-error', issueSelected && !issueType, 'Select an issue type.'],
            ['.receive-other-error', issueSelected && issueType === 'Other' && !issueDetail, 'Specify the issue.'],
            ['.receive-disposition-error', issueSelected && !disposition, 'Select an affected goods action.'],
            ['.receive-resolution-error', issueSelected && resolution === 'none', 'Select a supplier resolution.']
        ];
        fieldErrors.forEach(([selector, invalid, message]) => {
            const error = card.querySelector(selector);
            const showImmediately = selector === '.receive-damaged-error' && affectedPackageCapacity > delivered;
            if (error) error.textContent = (showImmediately || (showFieldErrors && invalid)) ? message : '';
        });
        const addDamage = card.querySelector('.receive-add-damage-line');
        const defaultAffectedFactor = Math.min(...packageConversions.filter((entry) => Number(entry.base_quantity) > 1).map((entry) => Number(entry.base_quantity)), delivered || 1);
        if (addDamage) addDamage.disabled = affectedPackageCapacity + defaultAffectedFactor > delivered;
        const shortageNote = card.querySelector('.receive-shortage-note');
        if (shortageNote) shortageNote.textContent = missing > 0 ? `Short by ${missing} ${quantities.conversion.inventoryUnit}` : 'No shortage detected.';
        const allocationDifference = accepted - allocated;
        const allocationState = card.querySelector('.receive-allocation-state');
        const allocationBadge = card.querySelector('.receive-allocation-badge');
        const allocationReason = card.querySelector('.receive-allocation-reason');
        const allocationSummary = card.querySelector('.receive-allocation-summary');
        if (allocationState) allocationState.textContent = `Allocated ${allocated} / ${accepted}`;
        const allocationComplete = allocated === accepted && (accepted === 0 || batches.length > 0) && batchRowsValid;
        if (allocationBadge) allocationBadge.textContent = allocationComplete ? '✓ Complete' : (allocationDifference < 0 ? '✕ Allocation error' : 'Incomplete');
        if (allocationReason) allocationReason.textContent = allocationComplete ? 'Accepted inventory is fully allocated.' : (allocationDifference > 0 ? `${allocationDifference} unit${allocationDifference === 1 ? '' : 's'} remaining.` : (allocationDifference < 0 ? `Over allocated by ${Math.abs(allocationDifference)} unit${Math.abs(allocationDifference) === 1 ? '' : 's'}.` : 'Complete the remaining batch details.'));
        allocationSummary?.classList.toggle('is-complete', allocationComplete);
        allocationSummary?.classList.toggle('has-error', !allocationComplete);
        card.querySelector('.receive-header-ordered').textContent = `${orderedPurchase} ${quantities.conversion.purchaseUnit}`;
        card.querySelector('.receive-header-accepted').textContent = `${accepted} ${quantities.conversion.inventoryUnit}`;
        card.querySelector('.receive-header-affected').textContent = `${affected} ${quantities.conversion.inventoryUnit}`;

        let status = 'Waiting';
        if (inspected && affected > 0) status = 'Has Issue';
        else if (inspected) status = 'Complete';
        else if (!quantitiesComplete) status = 'Waiting for Quantity Verification';
        else if (!issueComplete) status = 'Complete Issue Details';
        else if (readyForInspection) status = 'Ready to Complete';

        const badge = card.querySelector('.receive-inspection-badge');
        badge.textContent = status;
        badge.classList.toggle('complete', inspected);
        badge.classList.toggle('ready', readyForInspection && !inspected);
        badge.classList.toggle('issue', affected > 0);
        card.querySelector('.receive-issue-flag')?.classList.toggle('d-none', affected <= 0);
        card.classList.remove('state-waiting', 'state-active', 'state-complete', 'state-issue');
        card.classList.add(inspected ? 'state-complete' : (affected > 0 ? 'state-issue' : ((readyForInspection || card.dataset.touched === '1') ? 'state-active' : 'state-waiting')));

        const completeButton = card.querySelector('.receive-complete-inspection');
        const completedAction = card.querySelector('.receive-completed-action');
        const reopenButton = card.querySelector('.receive-reopen-inspection');
        if (completeButton) {
            completeButton.disabled = !readyForInspection || inspected;
            completeButton.classList.toggle('d-none', inspected);
        }
        completedAction?.classList.toggle('d-none', !inspected);
        reopenButton?.classList.toggle('d-none', !inspected);
        const readinessText = card.querySelector('.receive-readiness-text');
        let readinessMessage = 'Complete the product details.';
        if (inspected) readinessMessage = 'Product inspection complete. Allocate accepted stock below.';
        else if (!quantitiesComplete) readinessMessage = 'Complete quantity verification first.';
        else if (!issueComplete) readinessMessage = 'Complete the issue details first.';
        else if (readyForInspection) readinessMessage = 'Ready to complete.';
        if (readinessText) readinessText.textContent = readinessMessage;
        setReceiveCardLocked(card, inspected);
    });

    state.errors = [...new Set(state.errors)];
    state.hardErrors = [...new Set(state.hardErrors)];
    state.valid = state.errors.length === 0;
    return state;
}

function receivePaymentSummary() { return receiveFormState(true); }

function renderReceivePaymentSummary() {
    const summary = receiveFormState(true);
    const summaryList = document.getElementById('receiveSummaryItems');
    if (summaryList) summaryList.innerHTML = summary.items.map((item, index) => {
        const orderItem = activeReceiveOrder?.items.find((candidate) => String(candidate.po_item_id) === String(item.po_item_id)) || {};
        const conversion = purchasingConversion({ purchase_unit: orderItem.purchase_unit, inventory_unit: orderItem.unit || 'unit', units_per_purchase_unit: orderItem.units_per_purchase_unit || 1 });
        const damagedConversion = (orderItem.package_conversions || []).find((entry) => String(entry.conversion_id) === String(item.damaged_unit_conversion_id));
        const actionConversion = (orderItem.package_conversions || []).find((entry) => String(entry.conversion_id) === String(item.action_unit_conversion_id));
        const dispositionLabel = RECEIVE_DISPOSITIONS.find(([value]) => value === item.disposition)?.[1] || (item.disposition === 'not_applicable' ? 'Not Applicable — Short Delivery' : '-');
        const resolutionLabel = RECEIVE_RESOLUTIONS.find(([value]) => value === item.resolution)?.[1] || 'No issue';
        const damagedLabel = item.has_issue
            ? `${Number(item.damaged_quantity || 0)} ${damagedConversion?.unit_name || conversion.inventoryUnit}${Number(item.damaged_base_quantity || 0) !== Number(item.damaged_quantity || 0) ? ` / ${Number(item.damaged_base_quantity || 0)} ${conversion.inventoryUnit}` : ''}`
            : `0 ${conversion.inventoryUnit}`;
        const actionVerb = ({ return_to_supplier: 'Returned / Removed', hold_quarantine: 'Held / Removed', dispose: 'Disposed / Removed' })[item.disposition] || 'Returned / Removed';
        const actionLabel = item.disposition === 'not_applicable'
            ? 'Not Applicable'
            : `${Number(item.action_quantity || 0)} ${actionConversion?.unit_name || conversion.inventoryUnit}${Number(item.action_base_quantity || 0) !== Number(item.action_quantity || 0) ? ` / ${Number(item.action_base_quantity || 0)} ${conversion.inventoryUnit}` : ''}`;
        const damageBreakdown = (item.damage_lines || []).map((line, lineIndex) => {
            const affectedUnit = (orderItem.package_conversions || []).find((entry) => String(entry.conversion_id) === String(line.affected_unit_conversion_id));
            const damagedUnit = (orderItem.package_conversions || []).find((entry) => String(entry.conversion_id) === String(line.damaged_unit_conversion_id));
            return `<li>${escapeHtml(`${affectedUnit?.unit_name || 'Package'} ${lineIndex + 1}`)} → ${Number(line.damaged_quantity || 0)} ${escapeHtml(damagedUnit?.unit_name || conversion.inventoryUnit)} damaged</li>`;
        }).join('');
        const issueReview = item.has_issue ? `<span class="receiving-issue-state">Issue recorded</span>` : `<span class="receiving-no-issues">No issues</span>`;
        return `<article class="receiving-summary-item"><header><strong>${escapeHtml([productTableBrand(orderItem), productTableProductName(orderItem)].filter(Boolean).join(' — ') || `Product ${index + 1}`)}</strong>${issueReview}</header>${damageBreakdown ? `<div class="receiving-damage-breakdown"><span>Damage Breakdown</span><ul>${damageBreakdown}</ul></div>` : ''}<dl>
            <div><dt>PO Ordered</dt><dd>${Number(orderItem.purchase_qty || 0)} ${escapeHtml(conversion.purchaseUnit)} / ${Number(orderItem.inventory_qty_ordered || orderItem.quantity || 0)} ${escapeHtml(conversion.inventoryUnit)}</dd></div>
            <div><dt>Actual Received</dt><dd>${Number(item.delivered_purchase_quantity || 0)} ${escapeHtml(conversion.purchaseUnit)} / ${Number(item.received_quantity || 0)} ${escapeHtml(conversion.inventoryUnit)}</dd></div>
            <div><dt>Physically Damaged</dt><dd>${escapeHtml(damagedLabel)}</dd></div>
            <div><dt>${escapeHtml(actionVerb)}</dt><dd>${escapeHtml(actionLabel)}</dd></div>
            <div><dt>Accepted to Inventory</dt><dd>${Number(item.accepted_quantity || 0)} ${escapeHtml(conversion.inventoryUnit)} total</dd></div>
            <div><dt>Issue</dt><dd>${escapeHtml(item.issue_type || 'No issue')}</dd></div>
            <div><dt>Affected Goods Action</dt><dd>${escapeHtml(dispositionLabel)}</dd></div>
            <div><dt>Supplier Resolution</dt><dd>${escapeHtml(resolutionLabel)}</dd></div>
        </dl></article>`;
    }).join('');
    const steps = [...document.querySelectorAll('.receive-simple-step')];
    const inspectionComplete = summary.checks.inspection;
    const batchesComplete = summary.checks.batches;
    steps.forEach((step, index) => {
        const complete = index === 0 ? inspectionComplete : (index === 1 ? inspectionComplete && batchesComplete : summary.valid);
        const active = index === 0 ? !inspectionComplete : (index === 1 ? inspectionComplete && !batchesComplete : inspectionComplete && batchesComplete);
        step.classList.toggle('is-complete', complete);
        step.classList.toggle('is-active', active);
    });
    const validation = document.getElementById('receiveValidationSummary');
    const showValidation = receiveValidationAttempted && summary.errors.length > 0;
    validation.classList.toggle('d-none', !showValidation);
    validation.innerHTML = showValidation ? '<strong>Please correct the highlighted fields before confirming.</strong>' : '';
    const confirmButton = document.getElementById('btnConfirmReceivePo');
    if (confirmButton) confirmButton.disabled = !summary.valid || receiveSubmitting;
    const footer = document.getElementById('receiveFooterStatus');
    if (footer) footer.textContent = summary.valid ? 'Ready to confirm receiving.' : (receiveValidationAttempted ? 'Please correct the highlighted fields before confirming.' : 'Complete each product inspection and batch allocation.');
    const cards = [...document.querySelectorAll('#receiveInspectionCards .receive-item-card')];
    const inspectedProducts = cards.filter((card) => card.querySelector('.receive-inspected-input')?.value === '1').length;
    const overallProducts = document.getElementById('receiveOverallProductProgress');
    if (overallProducts) overallProducts.textContent = `${inspectedProducts} of ${cards.length} products inspected`;
    cards.forEach((card, index) => {
        const navItem = document.querySelector(`#receiveProductNavigator .product-nav-item[data-product-index="${index}"]`);
        if (!navItem) return;
        const complete = card.querySelector('.receive-inspected-input')?.value === '1';
        const issue = !card.querySelector('.receive-issue-flag')?.classList.contains('d-none');
        navItem.classList.toggle('is-complete', complete);
        navItem.classList.toggle('has-issue', issue);
        const status = card.querySelector('.receive-inspection-badge')?.textContent || 'Waiting';
        const copy = navItem.querySelector('small');
        if (copy) copy.textContent = status;
        const icon = navItem.querySelector('.product-nav-state');
        if (icon) icon.className = `fa-solid ${complete ? 'fa-circle-check' : (issue ? 'fa-triangle-exclamation' : 'fa-circle')} product-nav-state`;
    });
    updateCurrentProductProgress();
}

function updateCurrentProductProgress() {
    const card = document.querySelector(`#receiveInspectionCards .receive-item-card[data-product-index="${activeInspectionProductIndex}"]`);
    const target = document.getElementById('receiveCurrentProductProgress');
    if (!card || !target) return;
    const cards = [...document.querySelectorAll('#receiveInspectionCards .receive-item-card')];
    target.textContent = `Product ${activeInspectionProductIndex + 1} of ${cards.length}`;
}

function showReceiveProduct(index, scroll = true) {
    const cards = [...document.querySelectorAll('#receiveInspectionCards .receive-item-card')];
    if (!cards.length) return;
    const nextIndex = Math.max(0, Math.min(Number(index) || 0, cards.length - 1));
    activeInspectionProductIndex = nextIndex;
    cards.forEach((card, cardIndex) => {
        card.hidden = cardIndex !== nextIndex;
        card.querySelector('.receive-card-body')?.classList.toggle('d-none', cardIndex !== nextIndex);
        card.querySelector('.receive-card-toggle')?.setAttribute('aria-expanded', cardIndex === nextIndex ? 'true' : 'false');
    });
    document.querySelectorAll('#receiveProductNavigator .product-nav-item').forEach((button) => button.classList.toggle('is-active', Number(button.dataset.productIndex) === nextIndex));
    const previous = document.getElementById('btnPreviousInspectionProduct');
    const next = document.getElementById('btnNextInspectionProduct');
    if (previous) previous.disabled = nextIndex === 0;
    if (next) next.disabled = nextIndex === cards.length - 1;
    updateCurrentProductProgress();
    if (scroll) document.getElementById('receiveInspectionCards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function expandReceiveInspectionCard(card) {
    if (!card) return;
    showReceiveProduct(Number(card.dataset.productIndex || 0), false);
}

function scrollReceiveModalTo(target, focusTarget = null) {
    if (!target) return;
    const topbar = document.querySelector('.topbar')?.getBoundingClientRect().height || 70;
    const nextTop = Math.max(0, window.scrollY + target.getBoundingClientRect().top - topbar - 18);
    window.scrollTo({ top: nextTop, behavior: 'smooth' });

    const pulseTarget = target.closest('.receive-field, .receive-batches, .receive-issue-panel, .receive-overall-remarks') || target;
    pulseTarget.classList.remove('receive-target-pulse');
    void pulseTarget.offsetWidth;
    pulseTarget.classList.add('receive-target-pulse');
    window.setTimeout(() => pulseTarget.classList.remove('receive-target-pulse'), 1400);
    if (focusTarget && !focusTarget.disabled) {
        window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 450);
    }
}

function navigateReceiveChecklistStep(checkKey) {
    const datasetKey = {
        quantities: 'checkQuantities',
        damage: 'checkDamage',
        returns: 'checkReturns',
        batches: 'checkBatches',
        expiry: 'checkExpiry',
        resolution: 'checkResolution',
        remarks: 'checkRemarks',
        finalInspection: 'checkFinalInspection'
    }[checkKey];
    const cards = [...document.querySelectorAll('#receiveInspectionCards .receive-item-card')];
    let card = cards.find((candidate) => datasetKey && candidate.dataset[datasetKey] === '0') || cards[0] || null;
    let target = null;
    let focusTarget = null;

    if (checkKey === 'remarks' && !cards.some((candidate) => candidate.dataset.checkRemarks === '0')) {
        target = document.querySelector('.receive-overall-remarks');
        focusTarget = document.getElementById('receivePoRemarks');
    } else if (card) {
        expandReceiveInspectionCard(card);
        if (checkKey === 'quantities') {
            target = card.querySelector('.receive-quantity-anchor');
            focusTarget = card.querySelector('.receive-qty-input');
        } else if (checkKey === 'damage') {
            target = card.querySelector('.receive-damage-anchor');
            focusTarget = card.querySelector('.damage-line-qty, .receive-add-damage-line');
        } else if (checkKey === 'returns') {
            target = card.querySelector('.receive-return-anchor');
        } else if (checkKey === 'batches') {
            target = card.querySelector('.receive-batches');
            const quantityFields = [...card.querySelectorAll('.receive-batch-qty:not(:disabled)')];
            focusTarget = quantityFields.find((input) => !Number.isInteger(Number(input.value)) || Number(input.value) <= 0) || quantityFields[0] || card.querySelector('.receive-add-batch');
        } else if (checkKey === 'expiry') {
            focusTarget = [...card.querySelectorAll('.receive-batch-expiry:not(:disabled)')].find((input) => !input.value) || null;
            target = focusTarget?.closest('.receive-field') || card.querySelector('.receive-batches');
        } else if (checkKey === 'resolution') {
            const issuePanel = card.querySelector('.receive-issue-panel:not(.d-none)');
            target = issuePanel || card.querySelector('.receive-card-toggle');
            const issueType = card.querySelector('.receive-issue-type');
            const resolution = card.querySelector('.receive-resolution');
            focusTarget = issuePanel ? (!issueType?.value ? issueType : (resolution?.value === 'none' ? resolution : issueType)) : null;
        } else if (checkKey === 'remarks') {
            target = card.querySelector('.receive-item-remarks-field') || card.querySelector('.receive-issue-panel');
            focusTarget = card.querySelector('.receive-remarks-input');
        } else if (checkKey === 'finalInspection') {
            target = card.querySelector('.receive-inspection-action');
            focusTarget = card.querySelector('.receive-complete-inspection:not(:disabled), .receive-reopen-inspection:not(.d-none)');
        }
    }

    window.requestAnimationFrame(() => window.requestAnimationFrame(() => scrollReceiveModalTo(target, focusTarget)));
}

async function openReceivePurchaseOrder(poId) {
    if (document.body.dataset.page !== 'inspect-deliveries') {
        window.location.href = `inspect_deliveries.html?po=${encodeURIComponent(poId)}`;
        return;
    }
    try {
        receiveValidationAttempted = false;
        activeReceiveOrder = await getPurchaseOrder(poId);
        if (activeReceiveOrder.status !== 'Arrived') throw new Error('This purchase order is no longer available for active inspection.');
        document.getElementById('receivePoNumber').textContent = activeReceiveOrder.po_number || '-';
        document.getElementById('receiveSupplierName').textContent = activeReceiveOrder.supplier_name || '-';
        document.getElementById('receiveArrivalDate').textContent = formatDate(activeReceiveOrder.received_date || activeReceiveOrder.expected_delivery_date || activeReceiveOrder.order_date);
        const headerItems = activeReceiveOrder.items || [];
        const firstHeaderItem = headerItems[0] || {};
        const firstProductName = [productTableBrand(firstHeaderItem), productTableProductName(firstHeaderItem)].filter(Boolean).join(' — ') || '-';
        document.getElementById('receiveProductCount').textContent = headerItems.length > 1 ? `${firstProductName} + ${headerItems.length - 1} more` : firstProductName;
        document.getElementById('receiveHeaderOrderedQty').textContent = headerItems.length === 1
            ? receiveUnitCountLabel(Number(firstHeaderItem.purchase_qty || 0), purchasingConversion({ purchase_unit: firstHeaderItem.purchase_unit, inventory_unit: firstHeaderItem.unit || 'unit', units_per_purchase_unit: firstHeaderItem.units_per_purchase_unit || 1 }).purchaseUnit)
            : 'See item details';
        document.getElementById('receivePoStatus').textContent = activeReceiveOrder.status || 'Arrived';
        document.getElementById('receivePoRemarks').value = activeReceiveOrder.inspection_draft?.remarks || '';
        document.getElementById('inspectionBreadcrumbPo').textContent = activeReceiveOrder.po_number || 'Purchase Order';
        document.getElementById('inspectionWorkspaceTitle').textContent = `Inspect ${activeReceiveOrder.po_number || 'Delivery'}`;
        document.getElementById('receiveDraftBadge')?.classList.toggle('d-none', !activeReceiveOrder.inspection_in_progress);
        renderReceiveItems(activeReceiveOrder);
        renderReceivePaymentSummary();
        document.getElementById('inspectionQueueView')?.classList.add('d-none');
        document.getElementById('inspectionWorkspaceView')?.classList.remove('d-none');
        window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err) {
        PharmaUtils.toast.error(err.message);
        showInspectionQueue({ replaceHistory: true });
    }
}

function receivePayload(strict = true) {
    if (!activeReceiveOrder) throw new Error('No purchase order selected.');
    const summary = receiveFormState(strict);
    if (strict && !summary.valid) {
        throw new Error(summary.errors[0] || 'Please review the receiving quantities.');
    }
    return {
        po_id: activeReceiveOrder.po_id,
        remarks: document.getElementById('receivePoRemarks')?.value || '',
        items: summary.items
    };
}

function receiveReceiptRows(payload) {
    return payload.items.map((payloadItem) => {
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(payloadItem.po_item_id)) || {};
        const receivedQty = Number(payloadItem.received_quantity || 0);
        const damagedQty = Number(payloadItem.damaged_base_quantity || payloadItem.damaged_quantity || 0);
        const goodQty = Number(payloadItem.accepted_quantity ?? Math.max(0, receivedQty - Number(payloadItem.action_base_quantity || damagedQty)));
        const unitCost = Number(orderItem.price || 0);
        const affectedQty = damagedQty + Math.max(0, Number(orderItem.inventory_qty_ordered || orderItem.quantity || 0) - receivedQty);
        const supplierCredit = ['return_for_credit', 'reject_without_replacement'].includes(payloadItem.resolution) ? affectedQty * unitCost : 0;
        const actionLabel = RECEIVE_RESOLUTIONS.find(([value]) => value === payloadItem.resolution)?.[1] || 'No issue';
        return `
            <tr>
                <td>${escapeHtml(orderItem.product_name)}</td>
                <td>${escapeHtml(orderItem.brand_name)}</td>
                <td>${escapeHtml(orderItem.inventory_qty_ordered || orderItem.quantity || 0)}</td>
                <td>${receivedQty}</td>
                <td>${goodQty}</td>
                <td>${damagedQty}</td>
                <td>${escapeHtml(actionLabel)}</td>
                <td>${peso(unitCost)}</td>
                <td>${peso(supplierCredit)}</td>
                <td>${escapeHtml((payloadItem.batches || []).map((batch) => batch.expiry_date || 'No Expiry').join(', ') || 'Not set')}</td>
                <td>${escapeHtml(payloadItem.remarks || '')}</td>
            </tr>
        `;
    }).join('');
}

function receiptReportFromReceiving(details) {
    return {
        pharmacyName: details.pharmacy?.name || 'Dr. R Pharmacy',
        pharmacyAddress: details.pharmacy?.address || '',
        contact: details.pharmacy?.contact_number || '',
        grnNo: details.grn_number,
        poNo: details.po_number,
        supplier: details.supplier_name,
        supplierAddress: details.supplier_address || '',
        deliveryReference: details.delivery_reference || '',
        receivedBy: details.grn_settings?.received_by_name || '',
        checkedBy: '',
        approvedBy: details.grn_settings?.approved_by_name || '',
        receivedDate: details.received_date,
        status: details.receiving_result,
        paymentTerms: details.payment_terms || 'Not set',
        remarks: details.receiving_remarks || '',
        originalTotal: Number(details.total_amount || 0),
        returnedRejectedValue: Number(details.totals?.returned_rejected_value || 0),
        supplierCredit: Number(details.totals?.supplier_credit || 0),
        supplierDiscount: Number(details.totals?.supplier_discount || 0),
        adjustedPayable: Number(details.payment?.adjusted_payable || 0),
        totalPaid: Number(details.payment?.total_paid || 0),
        remainingBalance: Number(details.payment?.remaining_balance || 0),
        paymentStatus: details.payment?.payment_status || 'Unpaid',
        items: (details.items || []).map((item) => ({
            productCode: item.product_code || item.sku || '',
            category: item.category_name || '',
            product: item.product_name,
            brand: item.brand_name,
            specification: [item.generic_or_variant, item.strength, item.size_value, item.packaging].filter(Boolean).join(' - '),
            orderedQty: Number(item.ordered_quantity || 0),
            receivedQty: Number(item.delivered_quantity || 0),
            acceptedQty: Number(item.accepted_quantity || 0),
            goodQty: Number(item.accepted_quantity || 0),
            damagedQty: Number(item.damaged_quantity || 0),
            damageBreakdown: item.damage_breakdown || [],
            returnedQty: Number(item.returned_quantity || 0),
            missingQty: Number(item.missing_quantity || 0),
            replacementPendingQty: Number(item.replacement_pending_quantity || 0),
            inventoryAdded: Number(item.inventory_added || 0),
            resolution: item.resolution || 'none',
            resolutionLabel: receivingResolutionLabel(item.resolution),
            issueType: item.issue_type || '',
            unitLabel: item.unit || 'pcs',
            unitCost: Number(item.unit_price || 0),
            batches: item.batches || [],
            expiryDate: (item.batches || []).map((batch) => batch.expiry_date ? formatDate(batch.expiry_date) : 'No expiry').join(', ') || 'Not set',
            remarks: item.item_remarks || ''
        }))
    };
}

function receiptDisplayDate(value) {
    if (!value) return new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const parsed = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function receiptTotals(report) {
    return {
        ordered: report.items.reduce((sum, item) => sum + item.orderedQty, 0),
        received: report.items.reduce((sum, item) => sum + item.receivedQty, 0),
        accepted: report.items.reduce((sum, item) => sum + Number(item.acceptedQty ?? item.goodQty ?? 0), 0),
        damaged: report.items.reduce((sum, item) => sum + item.damagedQty, 0),
        returned: report.items.reduce((sum, item) => sum + item.returnedQty, 0),
        inventoryAdded: report.items.reduce((sum, item) => sum + Number(item.inventoryAdded ?? item.goodQty ?? 0), 0)
    };
}

function grnInformationRows(rows) {
    return rows
        .filter(([label, value]) => label === 'Received By' || String(value ?? '').trim() !== '')
        .map(([label, value]) => `<div class="grn-info-row${['PO Number', 'GRN Number'].includes(label) ? ' grn-number-row' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
        .join('');
}

function grnGroupedItems(items) {
    const groups = [];
    const groupIndex = new Map();
    items.forEach((item, index) => {
        const category = String(item.category || '').trim();
        const key = category.toLowerCase();
        if (!groupIndex.has(key)) {
            groupIndex.set(key, groups.length);
            groups.push({ category, items: [] });
        }
        groups[groupIndex.get(key)].items.push({ item, index });
    });
    return groups;
}

function grnProductRows(report) {
    return grnGroupedItems(report.items).map((group) => `
        ${group.category ? `<tr class="grn-category-row"><th colspan="13">${escapeHtml(group.category.toUpperCase())}</th></tr>` : ''}
        ${group.items.map(({ item, index }) => {
            const lineTotal = Number(item.orderedQty || 0) * Number(item.unitCost || 0);
            return `
                <tr>
                    <td class="center">${index + 1}</td>
                    <td>${escapeHtml(item.brand || '')}</td>
                    <td>${escapeHtml(item.product || '')}</td>
                    <td>${escapeHtml(item.specification || '')}</td>
                    <td class="center">${escapeHtml(item.unitLabel || '')}</td>
                    <td class="number">${item.orderedQty}</td>
                    <td class="number">${item.receivedQty}</td>
                    <td class="number">${item.acceptedQty ?? item.goodQty}</td>
                    <td class="number">${item.damagedQty}</td>
                    <td class="number">${item.returnedQty || 0}</td>
                    <td class="center">${escapeHtml(item.expiryDate || '')}</td>
                    <td class="money">${peso(item.unitCost)}</td>
                    <td class="money">${peso(lineTotal)}</td>
                </tr>
            `;
        }).join('')}
    `).join('');
}

function openReceiptPreview(report, options = {}) {
    const receiptWindow = options.targetWindow || window.open('', '_blank', 'width=1200,height=850');
    if (!receiptWindow) return;
    const totals = receiptTotals(report);
    receiptWindow.document.write(`
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Goods Received Note</title>
            <style>
                * { box-sizing: border-box; }
                @page { size: A4 portrait; margin: 10mm; }
                body { margin: 0; color: #111; background: #e5e7eb; font-family: Arial, Helvetica, sans-serif; }
                .actions { display: flex; gap: 8px; justify-content: center; padding: 12px; }
                ${options.embedded ? '.actions { display: none; } body { padding: 18px 0; }' : ''}
                button { padding: 8px 14px; border: 1px solid #111; border-radius: 3px; background: #fff; color: #111; font: 600 13px Arial, sans-serif; cursor: pointer; }
                .grn-document { display: flex; flex-direction: column; width: 210mm; min-height: 297mm; margin: 0 auto 24px; padding: 10mm; background: #fff; box-shadow: 0 8px 28px rgba(0,0,0,.16); font-size: 8pt; line-height: 1.25; }
                .grn-header { padding-bottom: 2.5mm; text-align: center; border-bottom: 1.5px solid #111; }
                .grn-pharmacy { font-size: 15pt; font-weight: 800; letter-spacing: .2px; }
                .grn-address, .grn-contact { margin-top: .6mm; font-size: 7.5pt; line-height: 1.2; }
                .grn-title { margin-top: 2mm; font-size: 11.5pt; font-weight: 800; letter-spacing: 1.1px; }
                .grn-info-grid { display: grid; grid-template-columns: minmax(0,.95fr) minmax(0,1.25fr) minmax(0,.8fr); gap: 3mm; padding: 2.5mm 0; border-bottom: 1px solid #444; }
                .grn-info-column { min-width: 0; }
                .grn-info-row { display: grid; grid-template-columns: 22mm minmax(0,1fr); gap: 1.5mm; margin: .8mm 0; align-items: start; }
                .grn-info-row span { font-size: 6pt; line-height: 1.25; font-weight: 700; color: #444; text-transform: uppercase; }
                .grn-info-row strong { min-width: 0; font-size: 7.2pt; line-height: 1.25; font-weight: 700; overflow-wrap: break-word; word-break: normal; }
                .grn-number-row { grid-template-columns: 22mm minmax(0,1fr); }
                .grn-number-row strong { white-space: nowrap; font-size: 7pt; }
                .grn-table { width: 100%; margin-top: 2.5mm; border-collapse: collapse; table-layout: fixed; }
                .grn-table col:nth-child(1) { width: 3%; }
                .grn-table col:nth-child(2) { width: 8%; }
                .grn-table col:nth-child(3) { width: 11%; }
                .grn-table col:nth-child(4) { width: 17%; }
                .grn-table col:nth-child(5) { width: 6%; }
                .grn-table col:nth-child(n+6):nth-child(-n+10) { width: 4.5%; }
                .grn-table col:nth-child(11) { width: 9%; }
                .grn-table col:nth-child(12) { width: 8%; }
                .grn-table col:nth-child(13) { width: 9.5%; }
                .grn-table th, .grn-table td { padding: 1.25mm .7mm; border: .35mm solid #555; vertical-align: top; overflow-wrap: anywhere; }
                .grn-table thead { display: table-header-group; }
                .grn-table thead th { background: #e8e8e8; font-size: 5.4pt; line-height: 1.1; text-align: center; text-transform: uppercase; overflow-wrap: normal; word-break: normal; }
                .grn-table tbody td { font-size: 6.2pt; }
                .grn-table tr { break-inside: avoid; page-break-inside: avoid; }
                .grn-category-row th { padding: 1.2mm; background: #d5d5d5; font-size: 6.5pt; text-align: left; letter-spacing: .5px; }
                .center { text-align: center; }
                .number { text-align: center; font-variant-numeric: tabular-nums; }
                .money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
                .grn-lower { display: grid; grid-template-columns: minmax(0,1fr) 78mm; gap: 6mm; margin-top: 3mm; break-inside: avoid; page-break-inside: avoid; }
                .grn-section-title { margin-bottom: 2mm; padding-bottom: 1mm; border-bottom: 1px solid #333; font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
                .grn-remarks-box { min-height: 24mm; padding: 2.5mm; border: .35mm solid #555; white-space: pre-wrap; }
                .grn-summary { width: 100%; border-collapse: collapse; }
                .grn-summary td { padding: 1.1mm 1.5mm; border-bottom: .25mm solid #aaa; font-size: 7pt; }
                .grn-summary td:last-child { text-align: right; font-weight: 700; }
                .grn-summary .grn-payable td { padding-top: 2mm; border-top: .5mm solid #222; border-bottom: .5mm double #222; font-size: 8pt; }
                .grn-footer-spacer { flex: 1 0 4mm; min-height: 4mm; }
                .grn-signatures { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12mm; break-inside: avoid; page-break-inside: avoid; }
                .grn-signature { text-align: center; }
                .grn-signature-line { min-height: 10mm; padding: 4.5mm 1mm 1mm; border-bottom: .35mm solid #222; font-weight: 700; overflow-wrap: break-word; }
                .grn-signature-label { margin-top: 1.5mm; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; }
                @media print {
                    body { background: #fff; }
                    .actions { display: none; }
                    .grn-document { width: 190mm; min-height: 277mm; margin: 0; padding: 0; box-shadow: none; }
                    .grn-table thead { display: table-header-group; }
                    .grn-table tbody tr, .grn-lower, .grn-signatures { break-inside: avoid; page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="actions">
                <button onclick="window.print()">Print / Save PDF</button>
                <button onclick="window.close()">Close</button>
            </div>
            <main class="grn-document">
                <header class="grn-header">
                    <div class="grn-pharmacy">${escapeHtml(report.pharmacyName)}</div>
                    ${report.pharmacyAddress ? `<div class="grn-address">${escapeHtml(report.pharmacyAddress)}</div>` : ''}
                    ${report.contact ? `<div class="grn-contact">Contact Number: ${escapeHtml(report.contact)}</div>` : ''}
                    <div class="grn-title">GOODS RECEIVED NOTE</div>
                </header>
                <section class="grn-info-grid">
                    <div class="grn-info-column">${grnInformationRows([
                        ['Supplier', report.supplier],
                        ['Supplier Address', report.supplierAddress],
                        ['Received By', report.receivedBy]
                    ])}</div>
                    <div class="grn-info-column">${grnInformationRows([
                        ['PO Number', report.poNo],
                        ['GRN Number', report.grnNo],
                        ['Received Date', receiptDisplayDate(report.receivedDate)]
                    ])}</div>
                    <div class="grn-info-column">${grnInformationRows([
                        ['Receiving Status', report.status],
                        ['Payment Status', report.paymentStatus],
                        ['Delivery Reference', report.deliveryReference]
                    ])}</div>
                </section>
                <table class="grn-table">
                    <colgroup>${'<col>'.repeat(13)}</colgroup>
                    <thead><tr>
                        <th>#</th><th>Brand</th><th>Product Name</th><th>Specification</th><th>Unit</th>
                        <th>Ord.<br>Qty</th><th>Rcvd.<br>Qty</th><th>Accept.<br>Qty</th><th>Damage<br>Qty</th><th>Return<br>Qty</th>
                        <th>Expiry Date</th><th>Unit Cost</th><th>Line Total</th>
                    </tr></thead>
                    <tbody>${grnProductRows(report)}</tbody>
                </table>
                <section class="grn-lower">
                    <div>
                        <div class="grn-section-title">Remarks</div>
                        <div class="grn-remarks-box">${escapeHtml(report.remarks || '')}</div>
                    </div>
                    <div>
                        <div class="grn-section-title">Receiving Summary</div>
                        <table class="grn-summary">
                            <tr><td>Total Ordered Qty</td><td>${totals.ordered}</td></tr>
                            <tr><td>Total Received Qty</td><td>${totals.received}</td></tr>
                            <tr><td>Total Accepted Qty</td><td>${totals.accepted}</td></tr>
                            <tr><td>Total Damaged Qty</td><td>${totals.damaged}</td></tr>
                            <tr><td>Total Returned Qty</td><td>${totals.returned}</td></tr>
                            <tr><td>Inventory Added</td><td>${totals.inventoryAdded}</td></tr>
                        </table>
                    </div>
                </section>
                <div class="grn-footer-spacer" aria-hidden="true"></div>
                <section class="grn-signatures">
                    <div class="grn-signature"><div class="grn-signature-line">${escapeHtml(report.receivedBy || '')}</div><div class="grn-signature-label">Received By</div></div>
                    <div class="grn-signature"><div class="grn-signature-line">${escapeHtml(report.checkedBy || '')}</div><div class="grn-signature-label">Checked By</div></div>
                    <div class="grn-signature"><div class="grn-signature-line">${escapeHtml(report.approvedBy || '')}</div><div class="grn-signature-label">Approved By</div></div>
                </section>
            </main>
            <script>
                function positionGrnSignatureFooter() {
                    const documentNode = document.querySelector('.grn-document');
                    const signatureNode = document.querySelector('.grn-signatures');
                    const spacerNode = document.querySelector('.grn-footer-spacer');
                    if (!documentNode || !signatureNode || !spacerNode) return;
                    spacerNode.style.flex = '0 0 auto';
                    spacerNode.style.height = '0px';
                    const ruler = document.createElement('div');
                    ruler.style.cssText = 'position:absolute;visibility:hidden;height:277mm;width:1px;';
                    document.body.appendChild(ruler);
                    const pageHeight = ruler.getBoundingClientRect().height;
                    ruler.remove();
                    const documentTop = documentNode.getBoundingClientRect().top + parseFloat(getComputedStyle(documentNode).paddingTop || 0);
                    const signatureTop = signatureNode.getBoundingClientRect().top - documentTop;
                    const signatureHeight = signatureNode.getBoundingClientRect().height;
                    const pageOffset = ((signatureTop % pageHeight) + pageHeight) % pageHeight;
                    let gap = pageHeight - pageOffset - signatureHeight;
                    if (gap < 0) gap += pageHeight;
                    spacerNode.style.height = Math.max(0, gap) + 'px';
                }
                window.addEventListener('load', positionGrnSignatureFooter);
                window.addEventListener('beforeprint', positionGrnSignatureFooter);
                window.addEventListener('resize', positionGrnSignatureFooter);
                ${options.embedded ? `function fitEmbeddedGrn(){ document.body.style.zoom = Math.min(1, Math.max(.42, (window.innerWidth - 28) / 794)); } window.addEventListener('load', fitEmbeddedGrn); window.addEventListener('resize', fitEmbeddedGrn);` : ''}
            <\/script>
        </body>
        </html>
    `);
    receiptWindow.document.close();
}

async function submitReceivePurchaseOrder() {
    if (receiveSubmitting) return;
    try {
        receiveValidationAttempted = true;
        renderReceivePaymentSummary();
        const payload = receivePayload();
        receiveSubmitting = true;
        const button = document.getElementById('btnConfirmReceivePo');
        if (button) { button.disabled = true; button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Confirming...'; }
        PharmaUtils.modal.loading('Receiving Purchase Order...');
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/receive_purchase_order.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        try { sessionStorage.removeItem('productMasterFileCache:v1'); } catch {}

        PharmaUtils.modal.close();
        const confirmedPoId = activeReceiveOrder.po_id;
        receivingDetailsCache.delete(String(confirmedPoId));
        const persistedReceiving = await fetchReceivingDetails(confirmedPoId, true);
        openReceiptPreview(receiptReportFromReceiving(persistedReceiving));
        PharmaUtils.toast.success(data.message || 'Purchase order received successfully.');
        activeReceiveOrder = null;
        await loadInspectionQueue();
        const url = new URL(window.location.href);
        url.searchParams.delete('po');
        url.searchParams.delete('view');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        showInspectionQueue({ reload: false });
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to receive purchase order', err.message);
    } finally {
        receiveSubmitting = false;
        const button = document.getElementById('btnConfirmReceivePo');
        if (button) button.innerHTML = '<i class="fa-solid fa-check me-1"></i>Confirm Receiving';
        if (document.body.dataset.page === 'inspect-deliveries') renderReceivePaymentSummary();
    }
}

async function saveReceiveInspectionDraft() {
    if (receiveSubmitting || !activeReceiveOrder) return;
    const button = document.getElementById('btnSaveReceiveDraft');
    try {
        receiveSubmitting = true;
        if (button) { button.disabled = true; button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...'; }
        const payload = { ...receivePayload(false), mode: 'draft' };
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/receive_purchase_order.php`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        document.getElementById('receiveDraftBadge')?.classList.remove('d-none');
        PharmaUtils.toast.success(data.message);
        const queueOrder = inspectionQueueOrders.find((order) => String(order.po_id) === String(activeReceiveOrder.po_id));
        if (queueOrder) queueOrder.inspection_in_progress = true;
    } catch (err) {
        PharmaUtils.modal.error('Failed to save inspection draft', err.message);
    } finally {
        receiveSubmitting = false;
        if (button) { button.disabled = false; button.innerHTML = '<i class="fa-regular fa-floppy-disk me-1"></i>Save Inspection Draft'; }
        renderReceivePaymentSummary();
    }
}

function openNextUninspectedCard() {
    const cards = [...document.querySelectorAll('#receiveInspectionCards .receive-item-card')];
    const card = [...cards.slice(activeInspectionProductIndex + 1), ...cards.slice(0, activeInspectionProductIndex + 1)]
        .find((candidate) => candidate.querySelector('.receive-inspected-input')?.value !== '1');
    if (!card) return;
    showReceiveProduct(Number(card.dataset.productIndex || 0));
    card.querySelector('.receive-qty-input')?.focus();
}

const receivingDetailsCache = new Map();
let activeReceivingDetails = null;
let receivingUiScrollY = 0;
let supplierPaymentSubmitting = false;
let supplierPaymentSubmissionKey = '';
let supplierPaymentPendingState = null;
let supplierPaymentReturnFocus = null;
let supplierPaymentResultContext = null;

function receivingResolutionLabel(resolution = 'none') {
    return ({
        none: 'No issue',
        replacement: 'Replacement',
        supplier_credit: 'Supplier Credit',
        next_po_credit: 'Credit on Next PO',
        no_compensation: 'No Supplier Compensation',
        return_for_credit: 'Return for Supplier Credit',
        return_for_replacement: 'Return for Replacement',
        keep_with_discount: 'Keep with Supplier Discount',
        keep_damaged: 'Keep as Non-sellable / Quarantined',
        reject_without_replacement: 'Reject without Replacement'
    })[resolution] || String(resolution || 'No issue').replaceAll('_', ' ');
}

function paymentMethodLabel(method = '') {
    return ({ cash: 'Cash', bank_transfer: 'Bank Transfer', check: 'Check', gcash: 'E-wallet', card: 'Card', other: 'Other', legacy_snapshot: 'Not recorded' })[method] || String(method || 'Not recorded').replaceAll('_', ' ');
}

function ensureReceivingUi() {
    if (document.getElementById('receivingUiBackdrop')) return;
    const inspectPage = document.body.dataset.page === 'inspect-deliveries';
    const purchaseOrdersPage = document.body.dataset.page === 'purchase-orders';
    const receivingReviewUi = inspectPage ? `
        <section class="grn-modal" id="grnModal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="grnPreviewTitle" data-mode="preview" hidden>
            <div class="grn-preview-shell">
                <div class="grn-preview-view" id="grnPreviewView">
                    <header class="grn-preview-toolbar">
                        <div class="grn-toolbar-left"><strong id="grnPreviewTitle">Goods Received Note</strong><div class="grn-revision-meta"><span><b>Last Edited:</b> <span id="grnLastEdited">Not edited yet</span></span><span id="grnEditedByRow" class="d-none"><b>Edited By:</b> <span id="grnEditedBy"></span></span><span id="grnEditReasonRow" class="d-none"><b>Reason:</b> <span id="grnEditReason"></span></span></div></div>
                        <div class="grn-preview-actions"><button class="btn btn-primary" id="btnGrnPreviewPrint" type="button"><i class="fa-solid fa-print me-1"></i>Print GRN</button><button class="btn btn-light border" type="button" data-close-receiving-ui>Close</button></div>
                    </header>
                    <div class="grn-preview-scroll"><iframe id="grnPreviewFrame" title="Goods Received Note A4 preview"></iframe></div>
                </div>
                <div class="grn-edit-view" id="grnEditView" hidden>
                    <header><div><h2 id="grnEditTitle">Edit Goods Received Note</h2><p>Correct confirmed receiving values. Original PO identity and ordered quantities remain read-only.</p></div></header>
                    <div class="grn-edit-body" id="grnEditBody"></div>
                    <footer><button class="btn btn-light border" id="btnCancelGrnEdit" type="button">Cancel</button><button class="btn btn-purple" id="btnSaveGrnEdit" type="button" disabled><i class="fa-solid fa-floppy-disk me-1"></i>Save Changes</button></footer>
                </div>
            </div>
        </section>` : purchaseOrdersPage ? '' : `
        <aside class="receiving-drawer" id="receivingDetailsDrawer" aria-hidden="true" aria-labelledby="receivingDetailsTitle">
            <header class="receiving-drawer-header"><div class="receiving-drawer-title"><h2 id="receivingDetailsTitle">Receiving Details</h2><p id="receivingDetailsSubtitle">Posted receiving record</p></div><button class="receiving-drawer-close" type="button" data-close-receiving-ui aria-label="Close receiving details"><i class="fa-solid fa-xmark"></i></button></header>
            <div class="receiving-drawer-body" id="receivingDetailsBody"><div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading receiving details...</div></div>
            <footer class="receiving-drawer-footer"><button class="btn btn-light border" type="button" data-close-receiving-ui>Close</button><button class="btn btn-outline-primary" id="btnDrawerPrintGrn" type="button"><i class="fa-solid fa-print me-1"></i>Print GRN</button><button class="btn btn-purple" id="btnDrawerManagePayment" type="button"><i class="fa-solid fa-wallet me-1"></i>Record Payment</button></footer>
        </aside>`;
    document.body.insertAdjacentHTML('beforeend', `
        <div class="receiving-ui-backdrop" id="receivingUiBackdrop"></div>
        ${receivingReviewUi}
        <section class="supplier-payment-dialog" id="supplierPaymentDrawer" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="supplierPaymentTitle">
            <div class="supplier-payment-dialog-card supplier-payment-entry-card">
                <header class="receiving-drawer-header"><div class="receiving-drawer-title"><h2 id="supplierPaymentTitle">PO Payment</h2><p id="supplierPaymentSubtitle">Cash purchase order payment</p></div><button class="receiving-drawer-close" type="button" data-close-receiving-ui aria-label="Close supplier payment"><i class="fa-solid fa-xmark"></i></button></header>
                <div class="receiving-drawer-body" id="supplierPaymentBody"><div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading payment details...</div></div>
                <footer class="receiving-drawer-footer"><button class="btn btn-light border" type="button" data-close-receiving-ui>Close</button><button class="btn btn-purple" id="btnSaveSupplierPayment" type="button"><i class="fa-solid fa-money-check-dollar me-1"></i>Record Payment</button></footer>
            </div>
        </section>
        <section class="supplier-payment-dialog" id="supplierPaymentConfirmDialog" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="supplierPaymentConfirmTitle" aria-describedby="supplierPaymentConfirmMessage">
            <div class="supplier-payment-dialog-card">
                <header class="supplier-payment-dialog-header"><span class="supplier-payment-dialog-icon information"><i class="fa-solid fa-circle-info"></i></span><div><h2 id="supplierPaymentConfirmTitle">Confirm Supplier Payment</h2><p>Review the financial details before posting.</p></div></header>
                <div class="supplier-payment-dialog-body"><div class="supplier-payment-confirm-summary" id="supplierPaymentConfirmSummary"></div><p class="supplier-payment-context" id="supplierPaymentConfirmMessage"></p><p class="supplier-payment-readonly-warning">Posted supplier payments are read-only and cannot be directly edited or deleted.</p></div>
                <footer class="supplier-payment-dialog-footer"><button class="btn btn-light border" id="btnCancelSupplierPaymentConfirm" type="button">Cancel</button><button class="btn btn-purple" id="btnConfirmSupplierPayment" type="button"><i class="fa-solid fa-check me-1"></i>Confirm Payment</button></footer>
            </div>
        </section>
        <section class="supplier-payment-dialog" id="supplierPaymentResultDialog" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="supplierPaymentResultTitle" aria-describedby="supplierPaymentResultMessage">
            <div class="supplier-payment-dialog-card supplier-payment-result-card">
                <header class="supplier-payment-dialog-header"><span class="supplier-payment-dialog-icon" id="supplierPaymentResultIcon"><i class="fa-solid fa-circle-check"></i></span><div><h2 id="supplierPaymentResultTitle">Payment Recorded</h2><p id="supplierPaymentResultSubtitle">Supplier payment result</p></div></header>
                <div class="supplier-payment-dialog-body"><p class="supplier-payment-result-message" id="supplierPaymentResultMessage"></p></div>
                <footer class="supplier-payment-dialog-footer"><button class="btn btn-light border" id="btnSupplierPaymentResultSecondary" type="button">Done</button><button class="btn btn-purple" id="btnSupplierPaymentResultPrimary" type="button">View Payment Details</button></footer>
            </div>
        </section>`);
    document.querySelectorAll('[data-close-receiving-ui]').forEach((button) => button.addEventListener('click', closeReceivingUi));
    document.getElementById('receivingUiBackdrop')?.addEventListener('click', () => {
        if (document.querySelector('.supplier-payment-dialog.is-open') || document.getElementById('grnModal')?.dataset.mode === 'edit') return;
        closeReceivingUi();
    });
    document.getElementById('btnDrawerPrintGrn')?.addEventListener('click', () => activeReceivingDetails && openReceiptPreview(receiptReportFromReceiving(activeReceivingDetails)));
    document.getElementById('btnDrawerManagePayment')?.addEventListener('click', () => activeReceivingDetails && openSupplierPayment(activeReceivingDetails.po_id));
    document.getElementById('btnGrnPreviewPrint')?.addEventListener('click', () => activeReceivingDetails && openReceiptPreview(receiptReportFromReceiving(activeReceivingDetails)));
    document.getElementById('btnCancelGrnEdit')?.addEventListener('click', closeGrnEditForm);
    document.getElementById('btnSaveGrnEdit')?.addEventListener('click', saveGrnEdit);
    document.getElementById('btnSaveSupplierPayment')?.addEventListener('click', submitSupplierPayment);
    document.getElementById('supplierPaymentBody')?.addEventListener('click', (event) => {
        const option = event.target.closest('.payment-basis-option');
        if (option) selectSupplierPaymentBasis(option.dataset.paymentBasis || '');
    });
    document.getElementById('btnCancelSupplierPaymentConfirm')?.addEventListener('click', cancelSupplierPaymentConfirmation);
    document.getElementById('btnConfirmSupplierPayment')?.addEventListener('click', confirmSupplierPayment);
    document.getElementById('btnSupplierPaymentResultSecondary')?.addEventListener('click', handleSupplierPaymentResultSecondary);
    document.getElementById('btnSupplierPaymentResultPrimary')?.addEventListener('click', handleSupplierPaymentResultPrimary);
    document.getElementById('supplierPaymentConfirmDialog')?.addEventListener('keydown', (event) => trapSupplierPaymentDialogFocus(event, cancelSupplierPaymentConfirmation));
    document.getElementById('supplierPaymentResultDialog')?.addEventListener('keydown', (event) => trapSupplierPaymentDialogFocus(event, handleSupplierPaymentResultSecondary));
}

function closeReceivingUi() {
    document.querySelectorAll('.receiving-drawer').forEach((drawer) => { drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); drawer.setAttribute('inert', ''); });
    document.querySelectorAll('.supplier-payment-dialog').forEach((dialog) => { dialog.classList.remove('is-open'); dialog.setAttribute('aria-hidden', 'true'); dialog.setAttribute('inert', ''); });
    document.querySelectorAll('.grn-modal').forEach((dialog) => { dialog.classList.remove('is-open'); dialog.hidden = true; dialog.setAttribute('aria-hidden', 'true'); dialog.setAttribute('inert', ''); });
    document.getElementById('receivingUiBackdrop')?.classList.remove('is-open');
    document.body.style.overflow = '';
    window.scrollTo(0, receivingUiScrollY);
}

function showReceivingDrawer(drawerId) {
    ensureReceivingUi();
    if (!document.getElementById('receivingUiBackdrop')?.classList.contains('is-open')) receivingUiScrollY = window.scrollY;
    document.querySelectorAll('.supplier-payment-dialog').forEach((dialog) => { const active = dialog.id === drawerId; dialog.classList.toggle('is-open', active); dialog.setAttribute('aria-hidden', active ? 'false' : 'true'); dialog.toggleAttribute('inert', !active); });
    document.querySelectorAll('.receiving-drawer').forEach((drawer) => { const active = drawer.id === drawerId; drawer.classList.toggle('is-open', active); drawer.setAttribute('aria-hidden', active ? 'false' : 'true'); drawer.toggleAttribute('inert', !active); });
    document.querySelectorAll('.grn-modal').forEach((dialog) => { const active = dialog.id === drawerId; dialog.hidden = !active; dialog.classList.toggle('is-open', active); dialog.setAttribute('aria-hidden', active ? 'false' : 'true'); dialog.toggleAttribute('inert', !active); });
    document.getElementById('receivingUiBackdrop')?.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

function setGrnModalMode(mode = 'preview') {
    const modal = document.getElementById('grnModal');
    const preview = document.getElementById('grnPreviewView');
    const edit = document.getElementById('grnEditView');
    if (!modal || !preview || !edit) return;
    const editing = mode === 'edit';
    modal.dataset.mode = editing ? 'edit' : 'preview';
    preview.hidden = editing;
    edit.hidden = !editing;
    modal.setAttribute('aria-labelledby', editing ? 'grnEditTitle' : 'grnPreviewTitle');
}

async function fetchReceivingDetails(poId, fresh = false) {
    if (!fresh && receivingDetailsCache.has(String(poId))) return receivingDetailsCache.get(String(poId));
    const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_receiving_details.php?po_id=${encodeURIComponent(poId)}&t=${Date.now()}`);
    receivingDetailsCache.set(String(poId), data.receiving);
    return data.receiving;
}

function receivingItemDisplayName(item) {
    return [item.brand_name, item.product_name, item.generic_or_variant, item.strength, item.size_value, item.unit, item.packaging].filter((value) => String(value || '').trim()).join(' · ');
}

function receivingQuantityLabel(value, unit = 'Pc') {
    return `${Number(value || 0)} ${String(unit || 'Pc')}`;
}

function receivingReturnedLabel(item) {
    const baseQuantity = Number(item.returned_quantity || 0);
    const selectedQuantity = Number(item.action_selected_quantity || 0);
    const selectedUnit = String(item.action_unit_name || '').trim();
    const base = receivingQuantityLabel(baseQuantity, item.unit || 'Pc');
    return selectedQuantity > 0 && selectedUnit && (selectedQuantity !== baseQuantity || selectedUnit !== item.unit)
        ? `${selectedQuantity} ${selectedUnit} / ${base}`
        : base;
}

function receivingSupplierResolution(details) {
    const labels = [...new Set((details.items || [])
        .filter((item) => item.resolution && item.resolution !== 'none')
        .map((item) => receivingResolutionLabel(item.resolution)))];
    return labels.length ? labels.join(', ') : 'No supplier claim';
}

function renderPaymentHistory(payments = []) {
    if (!payments.length) return '<div class="payment-history-card"><div class="text-muted small">No supplier payments recorded.</div></div>';
    return `<div class="payment-history-card"><table class="payment-history-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded By</th><th>Remarks</th></tr></thead><tbody>${payments.map((payment) => {
        const method = payment.display_method || paymentMethodLabel(payment.payment_method);
        const reference = payment.display_reference || payment.reference_number || '—';
        const remarks = payment.display_remarks || payment.remarks || '—';
        const dateNote = payment.date_note || `Entered ${receiptDisplayDate(payment.created_at)}`;
        return `<tr><td>${escapeHtml(formatDate(payment.payment_date))}<span class="payment-date-note" title="${escapeHtml(receiptDisplayDate(payment.created_at))}">${escapeHtml(dateNote)}</span></td><td><strong>${peso(payment.amount)}</strong></td><td>${escapeHtml(method)}</td><td>${escapeHtml(reference)}</td><td>${escapeHtml(payment.recorded_by_name || 'System')}</td><td><span class="payment-remarks" title="${escapeHtml(remarks)}">${escapeHtml(remarks)}</span></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function renderReceivingDetails(details) {
    const payment = details.payment || {};
    const items = details.items || [];
    const supplierCredit = Number(details.totals?.supplier_credit || 0);
    const supplierDiscount = Number(details.totals?.supplier_discount || 0);
    return `
        <div class="receiving-section-title"><i class="fa-solid fa-clipboard-check"></i>Receiving Summary</div>
        <div class="receiving-info-grid">
            <div class="receiving-info-box"><span>GRN Number</span><strong>${escapeHtml(details.grn_number)}</strong></div>
            <div class="receiving-info-box"><span>PO Number</span><strong>${escapeHtml(details.po_number)}</strong></div>
            <div class="receiving-info-box"><span>Supplier</span><strong>${escapeHtml(details.supplier_name)}</strong></div>
            <div class="receiving-info-box"><span>Arrival Date</span><strong>${escapeHtml(formatDate(details.expected_delivery_date))}</strong></div>
            <div class="receiving-info-box"><span>Received Date</span><strong>${escapeHtml(receiptDisplayDate(details.received_date))}</strong></div>
            <div class="receiving-info-box"><span>Received By</span><strong>${escapeHtml(details.received_by || 'System')}</strong></div>
            <div class="receiving-info-box"><span>PO Business Status</span><strong>${escapeHtml(details.status || 'Delivered')}</strong></div>
            <div class="receiving-info-box"><span>Receiving Status</span><strong><span class="receiving-result-badge">Receiving Completed</span></strong></div>
            <div class="receiving-info-box"><span>Payment Status</span><strong>${paymentStatusBadge(payment.payment_status)}</strong></div>
        </div>
        <div class="receiving-section-title"><i class="fa-solid fa-magnifying-glass"></i>Product Inspection Results</div>
        ${items.map((item, index) => `
            <article class="receiving-item-detail"><div class="receiving-item-head"><div class="receiving-product-name"><strong>${index + 1}. ${escapeHtml(item.product_name || 'Product')}</strong>${item.brand_name ? `<span>${escapeHtml(item.brand_name)}</span>` : ''}</div><span class="receiving-result-badge">${escapeHtml(receivingResolutionLabel(item.resolution))}</span></div>
                <div class="receiving-qty-grid">
                    ${[
                        ['Ordered', receivingQuantityLabel(item.ordered_quantity, item.unit)],
                        ['Delivered', receivingQuantityLabel(item.delivered_quantity, item.unit)],
                        ['Accepted', receivingQuantityLabel(item.accepted_quantity, item.unit)],
                        ['Physically Damaged', receivingQuantityLabel(item.damaged_quantity, item.unit)],
                        ['Returned', receivingReturnedLabel(item)],
                        ['Missing', receivingQuantityLabel(item.missing_quantity, item.unit)],
                        ['Replacement Pending', receivingQuantityLabel(item.replacement_pending_quantity, item.unit)],
                        ['Inventory Added', receivingQuantityLabel(item.inventory_added, item.unit)]
                    ].map(([label,value]) => `<div class="receiving-qty"><span>${label}</span><b>${escapeHtml(value)}</b></div>`).join('')}
                </div>
                ${(item.damage_breakdown || []).length ? `<section class="receiving-damage-details"><h4>Damage Breakdown</h4>${item.damage_breakdown.map((line) => `<div class="receiving-damage-row"><span>${escapeHtml(line.affected_unit_name || 'Package')} ${Number(line.sequence_no || 0)}</span><strong>${Number(line.damaged_base_quantity || 0)} ${escapeHtml(item.unit || line.damaged_unit_name || 'Pc')} damaged</strong></div>`).join('')}<div class="receiving-damage-total"><span>Total Physically Damaged</span><strong>${receivingQuantityLabel(item.damaged_quantity, item.unit)} damaged</strong></div></section>` : ''}
                ${item.resolution !== 'none' ? `<dl class="receiving-claim-summary"><div><dt>Issue</dt><dd>${escapeHtml(item.issue_type || 'Issue')}</dd></div><div><dt>Affected Goods Action</dt><dd>${escapeHtml(item.affected_goods_action || 'Not Applicable')}</dd></div><div><dt>Supplier Resolution</dt><dd>${escapeHtml(receivingResolutionLabel(item.resolution))}</dd></div><div><dt>Claim Status</dt><dd>${escapeHtml(item.return_status || 'Pending')}</dd></div>${String(item.item_remarks || '').trim() ? `<div class="wide"><dt>Item Remarks</dt><dd>${escapeHtml(item.item_remarks)}</dd></div>` : ''}</dl>` : ''}
            </article>`).join('')}
        <div class="receiving-section-title"><i class="fa-solid fa-boxes-stacked"></i>Batch and Expiry Allocation</div>
        ${items.map((item, index) => `<article class="receiving-item-detail"><div class="receiving-item-head"><strong>${index + 1}. ${escapeHtml(receivingItemDisplayName(item))}</strong><span>${Number(item.inventory_added || 0)} added</span></div><table class="receiving-batch-table"><thead><tr><th>Batch Identifier</th><th>Batch Qty</th><th>Inventory Qty</th><th>Damaged</th><th>Returned</th><th>Expiry</th></tr></thead><tbody>${(item.batches || []).length ? item.batches.map((batch) => `<tr><td>${escapeHtml(batch.batch_identifier)}</td><td>${batch.batch_quantity}</td><td>${batch.inventory_quantity}</td><td>${batch.damaged_qty}</td><td>${batch.returned_qty}</td><td>${escapeHtml(batch.expiry_date ? formatDate(batch.expiry_date) : 'No expiry')}</td></tr>`).join('') : '<tr><td colspan="6">No inventory batch was posted.</td></tr>'}</tbody></table></article>`).join('')}
        <div class="receiving-section-title"><i class="fa-solid fa-file-invoice-dollar"></i>Financial Summary</div>
        <div class="receiving-financial-card">
            <div class="receiving-money-line"><span>Original PO Total</span><strong>${peso(details.total_amount)}</strong></div>
            ${supplierCredit > 0 || supplierDiscount > 0 ? `<details class="payment-adjustments"><summary>Adjustment breakdown</summary>${supplierCredit > 0 ? `<div class="receiving-money-line"><span>Supplier Credit</span><strong>-${peso(supplierCredit)}</strong></div>` : ''}${supplierDiscount > 0 ? `<div class="receiving-money-line"><span>Supplier Discount</span><strong>-${peso(supplierDiscount)}</strong></div>` : ''}</details>` : ''}
            <div class="receiving-money-line"><span>Credits Applied</span><strong>-${peso(payment.supplier_credit_applied || 0)}</strong></div>
            <div class="receiving-money-line"><span>Adjusted Payable</span><strong>${peso(payment.adjusted_payable)}</strong></div>
            <div class="receiving-money-line"><span>Total Paid</span><strong>${peso(payment.total_paid)}</strong></div>
            <div class="receiving-money-line emphasis"><span>Remaining Balance</span><strong>${peso(payment.remaining_balance)}</strong></div>
            <div class="payment-summary-status"><span>Payment Status</span>${paymentStatusBadge(payment.payment_status)}</div>
        </div>
        <div class="receiving-section-title"><i class="fa-solid fa-money-check-dollar"></i>Payment History</div>
        ${renderPaymentHistory(payment.payments || [])}
        <div class="receiving-section-title"><i class="fa-regular fa-note-sticky"></i>Receiving Remarks</div>
        <div class="receiving-info-box">${escapeHtml(details.receiving_remarks || 'No receiving remarks.')}</div>`;
}

async function openReceivingDetails(poId) {
    if (document.body.dataset.page === 'inspect-deliveries') {
        await openGrnPreview(poId);
        return;
    }
    showReceivingDrawer('receivingDetailsDrawer');
    const body = document.getElementById('receivingDetailsBody');
    if (body) body.innerHTML = '<div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading receiving details...</div>';
    try {
        const details = await fetchReceivingDetails(poId, true);
        activeReceivingDetails = details;
        document.getElementById('receivingDetailsTitle').textContent = 'Receiving Details';
        document.getElementById('receivingDetailsSubtitle').textContent = `${details.grn_number} · ${details.po_number} · ${details.supplier_name}`;
        if (body) body.innerHTML = renderReceivingDetails(details);
        const manage = document.getElementById('btnDrawerManagePayment');
        if (manage) {
            const canManage = !isPurchaseOrderPaid(details.payment?.payment_status, details.payment?.remaining_balance);
            manage.classList.toggle('d-none', !canManage);
            manage.innerHTML = '<i class="fa-solid fa-wallet me-1"></i>Record Payment';
        }
    } catch (error) {
        if (body) body.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
    }
}

function updateGrnRevisionToolbar(details) {
    const revision = details.latest_revision || null;
    const lastEdited = document.getElementById('grnLastEdited');
    const editedByRow = document.getElementById('grnEditedByRow');
    const reasonRow = document.getElementById('grnEditReasonRow');
    if (lastEdited) lastEdited.textContent = revision ? receiptDisplayDate(revision.edited_at) : 'Not edited yet';
    if (editedByRow) editedByRow.classList.toggle('d-none', !revision);
    if (reasonRow) reasonRow.classList.toggle('d-none', !revision);
    if (revision) {
        const editedBy = document.getElementById('grnEditedBy');
        const reason = document.getElementById('grnEditReason');
        if (editedBy) editedBy.textContent = revision.edited_by_name || 'System';
        if (reason) reason.textContent = revision.edit_reason || '';
    }
}

function renderGrnPreviewDocument(details) {
    const frame = document.getElementById('grnPreviewFrame');
    if (!frame?.contentWindow) return;
    openReceiptPreview(receiptReportFromReceiving(details), { targetWindow: frame.contentWindow, embedded: true });
}

async function openGrnPreview(poId) {
    ensureReceivingUi();
    setGrnModalMode('preview');
    showReceivingDrawer('grnModal');
    const frame = document.getElementById('grnPreviewFrame');
    if (frame) frame.srcdoc = '<!doctype html><html><body style="font-family:Arial;padding:40px;text-align:center;color:#667085">Loading Goods Received Note...</body></html>';
    try {
        const details = await fetchReceivingDetails(poId, true);
        activeReceivingDetails = details;
        updateGrnRevisionToolbar(details);
        renderGrnPreviewDocument(details);
    } catch (error) {
        if (frame) frame.srcdoc = `<!doctype html><html><body style="font-family:Arial;padding:40px;color:#b42318">${escapeHtml(error.message)}</body></html>`;
    }
}

function grnConversionOptions(item, selectedId) {
    return (item.package_conversions || []).map((conversion) => `<option value="${escapeHtml(conversion.conversion_id)}" ${String(conversion.conversion_id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(conversion.unit_name)} — ${Number(conversion.base_quantity)} ${escapeHtml(item.unit || 'Pc')}</option>`).join('');
}

function grnDispositionValue(value) {
    return ({ 'Return to Supplier':'return_to_supplier', 'Hold/Quarantine':'hold_quarantine', Dispose:'dispose', 'Not Applicable':'not_applicable' })[value] || 'not_applicable';
}

function grnEditDamageRow(item, line = {}, index = 0) {
    const defaultConversion = item.package_conversions?.find((conversion) => Number(conversion.base_quantity) === 1)?.conversion_id || item.package_conversions?.[0]?.conversion_id || '';
    return `<div class="grn-edit-damage-row" data-damage-row><span class="grn-damage-number">Package ${index + 1}</span><select data-field="affected_conversion">${grnConversionOptions(item, line.affected_unit_conversion_id || item.package_conversions?.[0]?.conversion_id)}</select><input data-field="damaged_quantity" type="number" min="1" step="1" value="${Number(line.damaged_quantity || 1)}"><select data-field="damaged_conversion">${grnConversionOptions(item, line.damaged_unit_conversion_id || defaultConversion)}</select><button class="btn btn-sm btn-outline-danger" type="button" data-remove-grn-damage aria-label="Remove damage row"><i class="fa-solid fa-trash"></i></button></div>`;
}

function grnEditSelectOptions(options, selected) {
    return options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function renderGrnEditForm(details) {
    const paid = Number(details.payment?.total_paid || 0);
    return `
        <section class="grn-edit-identity"><div><span>PO Number</span><strong>${escapeHtml(details.po_number)}</strong></div><div><span>Supplier</span><strong>${escapeHtml(details.supplier_name)}</strong></div><div><span>GRN Number</span><strong>${escapeHtml(details.grn_number)}</strong></div></section>
        <div class="grn-edit-notice"><i class="fa-solid fa-shield-halved"></i><span>Only quantity differences are posted. Existing inventory and payments are never reinserted or silently replaced.</span></div>
        ${(details.items || []).map((item, index) => `
            <article class="grn-edit-item" data-po-item-id="${escapeHtml(item.po_item_id)}">
                <header><div><span>Item ${index + 1}</span><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.brand_name || '')}</small></div><div class="grn-readonly-ordered"><span>Original Ordered</span><strong>${receivingQuantityLabel(item.ordered_quantity, item.unit)}</strong></div></header>
                <div class="grn-edit-grid">
                    <label><span>Received Quantity</span><input data-field="received_quantity" type="number" min="0" max="${Number(item.ordered_quantity)}" step="1" value="${Number(item.delivered_quantity || 0)}"></label>
                    <label><span>Physically Damaged</span><div class="grn-inline-fields"><input data-field="damaged_quantity" type="number" min="0" step="1" value="${Number(item.damaged_selected_quantity || item.damaged_quantity || 0)}"><select data-field="damaged_conversion">${grnConversionOptions(item, item.damaged_unit_conversion_id)}</select></div></label>
                    <label><span>Affected Goods Quantity</span><div class="grn-inline-fields"><input data-field="action_quantity" type="number" min="0" step="1" value="${Number(item.action_selected_quantity || 0)}"><select data-field="action_conversion">${grnConversionOptions(item, item.action_unit_conversion_id)}</select></div></label>
                    <label><span>Issue</span><select data-field="issue_type"><option value="">No issue</option>${grnEditSelectOptions(['Damaged Product','Broken Package','Expired','Wrong Item','Short Quantity','Other'].map((value) => [value,value]), item.issue_type)}</select></label>
                    <label><span>Affected Goods Action</span><select data-field="disposition">${grnEditSelectOptions([['not_applicable','Not Applicable'],['return_to_supplier','Return to Supplier'],['hold_quarantine','Hold / Quarantine'],['dispose','Dispose']], grnDispositionValue(item.affected_goods_action))}</select></label>
                    <label><span>Supplier Resolution</span><select data-field="resolution">${grnEditSelectOptions([['none','No issue'],['replacement','Replacement'],['supplier_credit','Supplier Credit'],['next_po_credit','Credit on Next PO'],['no_compensation','No Supplier Compensation']], item.resolution || 'none')}</select></label>
                </div>
                <section class="grn-edit-damage"><div class="grn-edit-subhead"><strong>Damage Breakdown</strong><button class="btn btn-sm btn-outline-primary" type="button" data-add-grn-damage><i class="fa-solid fa-plus me-1"></i>Add Package</button></div><div data-damage-list>${(item.damage_breakdown || []).map((line, lineIndex) => grnEditDamageRow(item, line, lineIndex)).join('')}</div></section>
                <section class="grn-edit-batches"><strong>Batch &amp; Expiry</strong>${(item.batches || []).map((batch) => `<div class="grn-edit-batch" data-batch-id="${escapeHtml(batch.batch_id)}"><span>${escapeHtml(batch.batch_identifier)}</span><label>Quantity<input data-field="batch_quantity" type="number" min="1" step="1" value="${Number(batch.batch_quantity || 0)}"></label><label>Expiry Date<input data-field="batch_expiry" type="date" value="${escapeHtml(batch.expiry_date || '')}"></label></div>`).join('')}</section>
                <label class="grn-edit-remarks"><span>Item Remarks</span><textarea data-field="item_remarks" rows="2">${escapeHtml(item.item_remarks || '')}</textarea></label>
            </article>`).join('')}
        <label class="grn-edit-remarks"><span>Receiving Remarks</span><textarea id="grnEditReceivingRemarks" rows="3">${escapeHtml(details.receiving_remarks || '')}</textarea></label>
        ${paid > 0 ? `<label class="grn-financial-warning"><input id="grnAcknowledgeFinancial" type="checkbox"><span><strong>Payment history exists (${peso(paid)} paid).</strong> I understand corrected financial quantities may change the outstanding balance; historical payments will remain unchanged.</span></label>` : ''}
        <label class="grn-edit-reason"><span>Reason for Edit <b>*</b></span><textarea id="grnEditReasonInput" maxlength="500" rows="3" placeholder="Explain why this confirmed receiving record must be corrected."></textarea><small>This reason and the complete before/after values will be saved in the GRN revision history.</small></label>`;
}

function updateGrnEditSaveState() {
    const reasonPresent = Boolean(document.getElementById('grnEditReasonInput')?.value.trim());
    const acknowledgement = document.getElementById('grnAcknowledgeFinancial');
    const save = document.getElementById('btnSaveGrnEdit');
    if (save) save.disabled = !reasonPresent || (acknowledgement && !acknowledgement.checked);
}

function refreshGrnDamageNumbers(itemNode) {
    itemNode.querySelectorAll('[data-damage-row]').forEach((row, index) => { const label = row.querySelector('.grn-damage-number'); if (label) label.textContent = `Package ${index + 1}`; });
}

function openGrnEditForm() {
    if (!activeReceivingDetails) return;
    setGrnModalMode('edit');
    showReceivingDrawer('grnModal');
    const body = document.getElementById('grnEditBody');
    if (!body) return;
    body.innerHTML = renderGrnEditForm(activeReceivingDetails);
    body.onclick = (event) => {
        const itemNode = event.target.closest('.grn-edit-item');
        if (!itemNode) return;
        if (event.target.closest('[data-remove-grn-damage]')) { event.target.closest('[data-damage-row]')?.remove(); refreshGrnDamageNumbers(itemNode); }
        const add = event.target.closest('[data-add-grn-damage]');
        if (add) {
            const item = activeReceivingDetails.items.find((candidate) => String(candidate.po_item_id) === String(itemNode.dataset.poItemId));
            const list = itemNode.querySelector('[data-damage-list]');
            if (item && list) { list.insertAdjacentHTML('beforeend', grnEditDamageRow(item, {}, list.querySelectorAll('[data-damage-row]').length)); }
        }
    };
    document.getElementById('grnEditReasonInput')?.addEventListener('input', updateGrnEditSaveState);
    document.getElementById('grnAcknowledgeFinancial')?.addEventListener('change', updateGrnEditSaveState);
    updateGrnEditSaveState();
}

async function openGrnEditor(poId) {
    ensureReceivingUi();
    setGrnModalMode('edit');
    showReceivingDrawer('grnModal');
    const body = document.getElementById('grnEditBody');
    if (body) body.innerHTML = '<div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading Goods Received Note...</div>';
    try {
        activeReceivingDetails = await fetchReceivingDetails(poId, true);
        openGrnEditForm();
    } catch (error) {
        closeReceivingUi();
        PharmaUtils.modal.error('GRN could not be loaded', error.message);
    }
}

function closeGrnEditForm() {
    closeReceivingUi();
}

function grnEditPayload() {
    return {
        receiving_id: activeReceivingDetails.receiving_id,
        edit_reason: document.getElementById('grnEditReasonInput')?.value.trim() || '',
        receiving_remarks: document.getElementById('grnEditReceivingRemarks')?.value.trim() || '',
        acknowledge_financial_impact: Boolean(document.getElementById('grnAcknowledgeFinancial')?.checked),
        items: [...document.querySelectorAll('.grn-edit-item')].map((itemNode) => ({
            po_item_id: itemNode.dataset.poItemId,
            received_quantity: Number(itemNode.querySelector('[data-field="received_quantity"]')?.value || 0),
            damaged_quantity: Number(itemNode.querySelector('[data-field="damaged_quantity"]')?.value || 0),
            damaged_unit_conversion_id: itemNode.querySelector('[data-field="damaged_conversion"]')?.value || '',
            action_quantity: Number(itemNode.querySelector('[data-field="action_quantity"]')?.value || 0),
            action_unit_conversion_id: itemNode.querySelector('[data-field="action_conversion"]')?.value || '',
            issue_type: itemNode.querySelector('[data-field="issue_type"]')?.value || '',
            disposition: itemNode.querySelector('[data-field="disposition"]')?.value || 'not_applicable',
            resolution: itemNode.querySelector('[data-field="resolution"]')?.value || 'none',
            remarks: itemNode.querySelector('[data-field="item_remarks"]')?.value.trim() || '',
            damage_lines: [...itemNode.querySelectorAll('[data-damage-row]')].map((row) => ({ affected_unit_conversion_id:row.querySelector('[data-field="affected_conversion"]')?.value || '', damaged_quantity:Number(row.querySelector('[data-field="damaged_quantity"]')?.value || 0), damaged_unit_conversion_id:row.querySelector('[data-field="damaged_conversion"]')?.value || '' })),
            batches: [...itemNode.querySelectorAll('.grn-edit-batch')].map((batch) => ({ batch_id:batch.dataset.batchId, quantity:Number(batch.querySelector('[data-field="batch_quantity"]')?.value || 0), expiry_date:batch.querySelector('[data-field="batch_expiry"]')?.value || '' }))
        }))
    };
}

async function saveGrnEdit() {
    if (!activeReceivingDetails || !document.getElementById('grnEditReasonInput')?.value.trim()) return;
    const button = document.getElementById('btnSaveGrnEdit');
    try {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/update_receiving_grn.php`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(grnEditPayload()) });
        receivingDetailsCache.delete(String(activeReceivingDetails.po_id));
        await loadInspectionQueue();
        closeReceivingUi();
        PharmaUtils.toast.success(data.message || 'Goods Received Note updated.');
    } catch (error) {
        PharmaUtils.modal.error('GRN was not updated', error.message);
        updateGrnEditSaveState();
    } finally {
        if (button) button.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i>Save Changes';
    }
}

function renderSupplierPayment(details) {
    const payment = details.payment || {};
    const originalTotal = Number(details.total_amount || 0);
    const previousPayments = Number(payment.total_paid || 0);
    const confirmedCredit = Number(payment.supplier_credit_applied || 0);
    const remainingBalance = Math.max(originalTotal - previousPayments - confirmedCredit, 0);
    const fullyPaid = isPurchaseOrderPaid(payment.payment_status, remainingBalance);
    const acceptedGoodsValue = Number(details.totals?.accepted_goods_value || 0);
    const acceptedQuantity = Number(details.totals?.accepted_units || 0);
    const replacementQuantity = (details.items || []).reduce((sum, item) => sum + Number(item.replacement_pending_quantity || 0), 0);
    const replacementReferenceValue = (details.items || []).reduce((sum, item) => sum + (Number(item.replacement_pending_quantity || 0) * Number(item.unit_price || 0)), 0);
    const unitLabels = [...new Set((details.items || []).map((item) => cleanText(item.unit)).filter(Boolean))];
    const quantityUnit = unitLabels.length === 1 ? unitLabels[0] : 'units';
    const claimStatuses = [...new Set((details.items || []).map((item) => cleanText(item.return_status)).filter(Boolean))];
    const claimStatus = claimStatuses.length ? claimStatuses.join(', ') : 'No open claim';
    const payments = Array.isArray(payment.payments) ? payment.payments : [];
    return `
        <div class="po-payment-section-heading"><i class="fa-solid fa-receipt"></i><span>PO Payment</span></div>
        <div class="po-payment-summary-grid">
            <div><span>Original PO Total</span><strong>${peso(originalTotal)}</strong></div>
            <div><span>Previous Payments</span><strong>${peso(previousPayments)}</strong></div>
            <div><span>Received / Accepted</span><strong>${escapeHtml(receivingQuantityLabel(acceptedQuantity, quantityUnit))}</strong></div>
            <div><span>Replacement Pending</span><strong>${escapeHtml(receivingQuantityLabel(replacementQuantity, quantityUnit))}</strong>${replacementQuantity > 0 ? `<small>Reference value: ${peso(replacementReferenceValue)}</small>` : ''}</div>
            <div><span>Supplier Resolution</span><strong>${escapeHtml(receivingSupplierResolution(details))}</strong></div>
            <div><span>Claim Status</span><strong>${escapeHtml(claimStatus)}</strong></div>
            <div><span>Confirmed Supplier Credit</span><strong>${peso(confirmedCredit)}</strong></div>
            <div><span>Payment Status</span>${paymentStatusBadge(payment.payment_status)}</div>
        </div>
        ${fullyPaid ? '<div class="alert alert-success mt-3 mb-0"><i class="fa-solid fa-circle-check me-2"></i>This purchase order is fully paid. Additional payments are not allowed.</div>' : `
        <div class="po-payment-section-heading"><i class="fa-solid fa-sliders"></i><span>Payment Basis</span></div>
        <div class="payment-basis-options" role="radiogroup" aria-label="Payment Basis">
            <button class="payment-basis-option" type="button" role="radio" aria-checked="false" data-payment-basis="full">Full PO</button>
            <button class="payment-basis-option" type="button" role="radio" aria-checked="false" data-payment-basis="accepted">Accepted Goods Only</button>
            <button class="payment-basis-option" type="button" role="radio" aria-checked="false" data-payment-basis="custom">Custom Amount</button>
        </div>
        <div class="po-payment-section-heading"><i class="fa-solid fa-money-bill-wave"></i><span>Payment</span></div>
        <form class="supplier-payment-form" id="supplierPaymentForm" novalidate>
            <div class="form-field full"><label for="supplierPaymentAmount">Amount to Pay Now</label><div class="payment-amount-control"><span class="payment-currency-prefix">₱</span><input id="supplierPaymentAmount" type="number" min="0.01" step="0.01" max="${remainingBalance}" value="" inputmode="decimal" autocomplete="off" aria-describedby="supplierPaymentValidation" disabled></div><p class="payment-mode-note">Payment Mode: <strong>Cash</strong></p><div class="payment-validation" id="supplierPaymentValidation" aria-live="polite">Select a payment basis.</div></div>
            <div class="payment-calculation-card full">
                <div><span>Previous Payments</span><strong>${peso(previousPayments)}</strong></div>
                <div><span>Confirmed Current-PO Credits</span><strong>${peso(confirmedCredit)}</strong></div>
                <div><span>Amount to Pay Now</span><strong id="supplierPaymentAmountSummary">${peso(0)}</strong></div>
                <div class="balance"><span>Balance After Payment</span><strong id="supplierPaymentBalanceAfter">${peso(remainingBalance)}</strong></div>
            </div>
            <input type="hidden" id="supplierPaymentOriginalTotal" value="${originalTotal}">
            <input type="hidden" id="supplierPaymentAcceptedValue" value="${acceptedGoodsValue}">
        </form>`}
        ${payments.length ? `<div class="po-payment-section-heading"><i class="fa-solid fa-clock-rotate-left"></i><span>Payment History</span></div>${renderPaymentHistory(payments)}` : ''}`;
}

function supplierPaymentReferenceMeta(method = '') {
    return ({
        cash: ['Acknowledgment Number', 'Optional receipt or acknowledgment number'],
        bank_transfer: ['Transaction Reference', 'Enter bank transaction reference'],
        check: ['Check Number', 'Enter check number'],
        gcash: ['Transaction Reference', 'Enter e-wallet transaction reference'],
        other: ['Reference Number', 'Optional payment reference']
    })[method] || ['Reference Number', 'Optional payment reference'];
}

function updateSupplierPaymentReferenceUi() {
    const method = document.getElementById('supplierPaymentMethod')?.value || '';
    const [label, placeholder] = supplierPaymentReferenceMeta(method);
    const labelNode = document.getElementById('supplierPaymentReferenceLabel');
    const input = document.getElementById('supplierPaymentReference');
    if (labelNode) labelNode.textContent = label;
    if (input) placeholder ? input.setAttribute('placeholder', placeholder) : input.removeAttribute('placeholder');
}

function supplierPaymentLongDate(value) {
    if (!value) return 'Not set';
    const [year, month, day] = String(value).split('-').map(Number);
    const date = new Date(year, Math.max(0, month - 1), day || 1);
    return Number.isNaN(date.getTime()) ? formatDate(value) : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function supplierPaymentCalculationValues() {
    const payment = activeReceivingDetails?.payment || {};
    const originalTotal = Number(activeReceivingDetails?.total_amount || 0);
    const previouslyPaid = Number(payment.total_paid || 0);
    const confirmedCredit = Number(payment.supplier_credit_applied || 0);
    const acceptedValue = Number(activeReceivingDetails?.totals?.accepted_goods_value || 0);
    const remainingBalance = Math.max(0, originalTotal - previouslyPaid - confirmedCredit);
    return {
        originalTotal,
        previouslyPaid,
        confirmedCredit,
        acceptedValue,
        remainingBalance,
        acceptedPayment: Math.max(0, Math.min(remainingBalance, acceptedValue - previouslyPaid - confirmedCredit))
    };
}

function selectSupplierPaymentBasis(basis, customAmount = '') {
    const input = document.getElementById('supplierPaymentAmount');
    if (!input) return;
    const values = supplierPaymentCalculationValues();
    document.querySelectorAll('.payment-basis-option').forEach((option) => {
        option.setAttribute('aria-checked', option.dataset.paymentBasis === basis ? 'true' : 'false');
    });
    input.disabled = !basis;
    input.readOnly = basis !== 'custom';
    input.classList.toggle('is-readonly', basis !== 'custom' && Boolean(basis));
    if (basis === 'full') input.value = values.remainingBalance.toFixed(2);
    else if (basis === 'accepted') input.value = values.acceptedPayment.toFixed(2);
    else if (basis === 'custom') input.value = customAmount;
    else input.value = '';
    updateSupplierPaymentValidation();
    if (basis === 'custom') requestAnimationFrame(() => input.focus());
}

function captureSupplierPaymentState() {
    const values = supplierPaymentCalculationValues();
    const amount = Number(document.getElementById('supplierPaymentAmount')?.value || 0);
    const paymentBasis = document.querySelector('.payment-basis-option[aria-checked="true"]')?.dataset.paymentBasis || '';
    return {
        poId: activeReceivingDetails?.po_id || '',
        poNumber: activeReceivingDetails?.po_number || '',
        supplier: activeReceivingDetails?.supplier_name || '',
        paymentBasis,
        amount: Math.round(amount * 100) / 100,
        amountInput: document.getElementById('supplierPaymentAmount')?.value || '',
        paymentMethod: 'cash',
        paymentDate: new Date().toISOString().slice(0, 10),
        referenceNumber: '',
        remarks: '',
        adjustedPayable: values.originalTotal - values.confirmedCredit,
        previouslyPaid: values.previouslyPaid,
        remainingBalance: values.remainingBalance,
        balanceAfter: Math.max(0, Math.round((values.remainingBalance - amount) * 100) / 100),
        resultingStatus: amount >= values.remainingBalance - 0.005 ? 'Paid' : 'Partially Paid',
        idempotencyKey: supplierPaymentSubmissionKey
    };
}

function restoreSupplierPaymentState(state) {
    if (!state) return;
    selectSupplierPaymentBasis(state.paymentBasis || 'custom', state.amountInput || '');
    supplierPaymentSubmissionKey = state.idempotencyKey;
    updateSupplierPaymentValidation();
}

function trapSupplierPaymentDialogFocus(event, escapeAction) {
    const dialog = event.currentTarget;
    if (event.key === 'Escape') {
        if (!supplierPaymentSubmitting) { event.preventDefault(); escapeAction(); }
        return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((control) => control.offsetParent !== null);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function setSupplierPaymentDialogOpen(dialogId, open) {
    const dialog = document.getElementById(dialogId);
    if (!dialog) return;
    dialog.classList.toggle('is-open', open);
    dialog.setAttribute('aria-hidden', open ? 'false' : 'true');
    dialog.toggleAttribute('inert', !open);
}

function waitForSupplierPaymentDrawerHidden() {
    const drawer = document.getElementById('supplierPaymentDrawer');
    if (!drawer) return Promise.resolve();
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => { if (settled) return; settled = true; drawer.removeEventListener('transitionend', finish); resolve(); };
        drawer.addEventListener('transitionend', finish, { once: true });
        window.setTimeout(finish, 320);
    });
}

function renderSupplierPaymentConfirmation(state) {
    const referenceRow = state.referenceNumber.trim()
        ? `<div><span>${escapeHtml(supplierPaymentReferenceMeta(state.paymentMethod)[0])}</span><strong>${escapeHtml(state.referenceNumber.trim())}</strong></div>`
        : '';
    const summary = document.getElementById('supplierPaymentConfirmSummary');
    if (summary) summary.innerHTML = `
        <div><span>Supplier</span><strong>${escapeHtml(state.supplier)}</strong></div>
        <div><span>Purchase Order</span><strong>${escapeHtml(state.poNumber)}</strong></div>
        <div class="primary-value"><span>Payment Amount</span><strong>${peso(state.amount)}</strong></div>
        <div><span>Payment Method</span><strong>${escapeHtml(paymentMethodLabel(state.paymentMethod))}</strong></div>
        <div><span>Payment Date</span><strong>${escapeHtml(supplierPaymentLongDate(state.paymentDate))}</strong></div>
        ${referenceRow}
        <div><span>Balance Before Payment</span><strong>${peso(state.remainingBalance)}</strong></div>
        <div class="result-value"><span>Balance After Payment</span><strong>${peso(state.balanceAfter)}</strong></div>
        <div><span>Resulting Payment Status</span>${paymentStatusBadge(state.resultingStatus)}</div>`;
    const message = document.getElementById('supplierPaymentConfirmMessage');
    if (message) message.textContent = state.resultingStatus === 'Paid'
        ? 'This payment will settle the remaining balance and mark this purchase order as Paid.'
        : `This payment will be recorded as a partial supplier payment. A remaining balance of ${peso(state.balanceAfter)} will remain.`;
}

async function openSupplierPaymentConfirmation(state) {
    supplierPaymentPendingState = state;
    supplierPaymentReturnFocus = document.activeElement;
    await waitForSupplierPaymentDrawerHidden();
    renderSupplierPaymentConfirmation(state);
    setSupplierPaymentDialogOpen('supplierPaymentResultDialog', false);
    setSupplierPaymentDialogOpen('supplierPaymentConfirmDialog', true);
    document.getElementById('btnCancelSupplierPaymentConfirm')?.focus();
}

function cancelSupplierPaymentConfirmation() {
    if (supplierPaymentSubmitting || !supplierPaymentPendingState) return;
    setSupplierPaymentDialogOpen('supplierPaymentConfirmDialog', false);
    showReceivingDrawer('supplierPaymentDrawer');
    restoreSupplierPaymentState(supplierPaymentPendingState);
    const amount = document.getElementById('supplierPaymentAmount');
    requestAnimationFrame(() => (amount || supplierPaymentReturnFocus || document.getElementById('btnSaveSupplierPayment'))?.focus());
}

function showSupplierPaymentResult(context) {
    supplierPaymentResultContext = context;
    setSupplierPaymentDialogOpen('supplierPaymentConfirmDialog', false);
    const icon = document.getElementById('supplierPaymentResultIcon');
    if (icon) { icon.className = `supplier-payment-dialog-icon ${context.type}`; icon.innerHTML = `<i class="fa-solid ${context.type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>`; }
    const title = document.getElementById('supplierPaymentResultTitle');
    const subtitle = document.getElementById('supplierPaymentResultSubtitle');
    const message = document.getElementById('supplierPaymentResultMessage');
    if (title) title.textContent = context.title;
    if (subtitle) subtitle.textContent = context.type === 'success' ? 'Supplier payment posted' : 'Supplier payment was not posted';
    if (message) message.textContent = context.message;
    const secondary = document.getElementById('btnSupplierPaymentResultSecondary');
    const primary = document.getElementById('btnSupplierPaymentResultPrimary');
    if (secondary) secondary.textContent = context.type === 'success' ? 'Done' : 'Cancel';
    if (primary) primary.textContent = context.type === 'success' ? 'View Payment Details' : 'Return to Payment Form';
    setSupplierPaymentDialogOpen('supplierPaymentResultDialog', true);
    secondary?.focus();
}

function handleSupplierPaymentResultSecondary() {
    if (supplierPaymentSubmitting) return;
    setSupplierPaymentDialogOpen('supplierPaymentResultDialog', false);
    document.getElementById('receivingUiBackdrop')?.classList.remove('is-open');
    document.body.style.overflow = '';
}

async function handleSupplierPaymentResultPrimary() {
    if (supplierPaymentSubmitting || !supplierPaymentResultContext) return;
    const context = supplierPaymentResultContext;
    setSupplierPaymentDialogOpen('supplierPaymentResultDialog', false);
    if (context.type === 'success') {
        if (document.body.dataset.page === 'purchase-orders') await openSupplierPayment(context.poId);
        else await openReceivingDetails(context.poId);
        return;
    }
    if (context.refreshOnReturn) {
        await openSupplierPayment(context.poId, { preservedState: context.state, reuseKey: true });
        return;
    }
    showReceivingDrawer('supplierPaymentDrawer');
    restoreSupplierPaymentState(context.state);
    requestAnimationFrame(() => document.getElementById('supplierPaymentAmount')?.focus());
}

function updateSupplierPaymentValidation() {
    if (!activeReceivingDetails) return false;
    const values = supplierPaymentCalculationValues();
    const remaining = values.remainingBalance;
    const basis = document.querySelector('.payment-basis-option[aria-checked="true"]')?.dataset.paymentBasis || '';
    const amount = Number(document.getElementById('supplierPaymentAmount')?.value || 0);
    let message = 'Ready to record payment.';
    let valid = true;
    if (!basis) { valid = false; message = 'Select a payment basis.'; }
    else if (!Number.isFinite(amount) || amount <= 0) { valid = false; message = 'Payment amount must be greater than zero.'; }
    else if (amount > remaining) { valid = false; message = `Payment amount exceeds the remaining balance by ${peso(amount - remaining)}.`; }
    const validation = document.getElementById('supplierPaymentValidation');
    if (validation) validation.textContent = valid ? '' : message;
    const amountInput = document.getElementById('supplierPaymentAmount');
    const amountInvalid = amount > remaining || !Number.isFinite(amount) || amount <= 0;
    if (amountInput) { amountInput.classList.toggle('is-invalid', amountInvalid); amountInput.setAttribute('aria-invalid', amountInvalid ? 'true' : 'false'); }
    const after = document.getElementById('supplierPaymentBalanceAfter');
    if (after) after.textContent = peso(Math.max(remaining - (Number.isFinite(amount) ? amount : 0), 0));
    const amountSummary = document.getElementById('supplierPaymentAmountSummary');
    if (amountSummary) amountSummary.textContent = peso(Number.isFinite(amount) ? Math.max(0, amount) : 0);
    after?.closest('.payment-calculation-card')?.classList.toggle('is-invalid', amount > remaining || amount < 0);
    const button = document.getElementById('btnSaveSupplierPayment');
    if (button) {
        button.disabled = !valid || supplierPaymentSubmitting;
        button.classList.toggle('btn-purple', valid && !supplierPaymentSubmitting);
        button.classList.toggle('btn-outline-secondary', !valid || supplierPaymentSubmitting);
    }
    return valid;
}

async function openSupplierPayment(poId, options = {}) {
    showReceivingDrawer('supplierPaymentDrawer');
    const body = document.getElementById('supplierPaymentBody');
    if (body) body.innerHTML = '<div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading payment details...</div>';
    try {
        const details = await fetchReceivingDetails(poId, true);
        activeReceivingDetails = details;
        if (!options.reuseKey) supplierPaymentSubmissionKey = globalThis.crypto?.randomUUID?.() || `po-payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        document.getElementById('supplierPaymentSubtitle').textContent = `${details.po_number} · ${details.supplier_name}`;
        if (body) body.innerHTML = renderSupplierPayment(details);
        const save = document.getElementById('btnSaveSupplierPayment');
        if (save) save.classList.toggle('d-none', isPurchaseOrderPaid(details.payment?.payment_status, details.payment?.remaining_balance));
        document.getElementById('supplierPaymentAmount')?.addEventListener('input', updateSupplierPaymentValidation);
        const amountInput = document.getElementById('supplierPaymentAmount');
        amountInput?.addEventListener('change', () => {
            const value = Number(amountInput.value);
            if (Number.isFinite(value)) amountInput.value = value.toFixed(2);
            updateSupplierPaymentValidation();
        });
        if (options.preservedState) restoreSupplierPaymentState(options.preservedState);
        updateSupplierPaymentValidation();
        requestAnimationFrame(() => body?.querySelector('input[name="supplierPaymentBasis"]')?.focus());
    } catch (error) {
        if (body) body.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
        document.getElementById('btnSaveSupplierPayment')?.classList.add('d-none');
    }
}

async function submitSupplierPayment() {
    if (supplierPaymentSubmitting || !activeReceivingDetails || !updateSupplierPaymentValidation()) return;
    await openSupplierPaymentConfirmation(captureSupplierPaymentState());
}

async function confirmSupplierPayment() {
    if (supplierPaymentSubmitting || !supplierPaymentPendingState) return;
    const state = supplierPaymentPendingState;
    const button = document.getElementById('btnConfirmSupplierPayment');
    try {
        supplierPaymentSubmitting = true;
        if (button) { button.disabled = true; button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing Payment...'; }
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/record_purchase_order_payment.php`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                po_id: state.poId,
                amount: state.amount,
                payment_method: state.paymentMethod,
                payment_date: state.paymentDate,
                reference_number: state.referenceNumber.trim(),
                remarks: state.remarks.trim(),
                payment_request_key: state.idempotencyKey,
                expected_remaining_balance: state.remainingBalance
            })
        });
        receivingDetailsCache.delete(String(state.poId));
        activeReceivingDetails = await fetchReceivingDetails(state.poId, true);
        if (document.body.dataset.page === 'inspect-deliveries') await loadInspectionQueue();
        else await loadPurchaseOrders();
        supplierPaymentSubmissionKey = globalThis.crypto?.randomUUID?.() || `po-payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        supplierPaymentPendingState = null;
        const fullyPaid = isPurchaseOrderPaid(data.payment_status, data.remaining_balance);
        showSupplierPaymentResult({
            type: 'success',
            title: 'Payment Recorded',
            poId: state.poId,
            message: fullyPaid
                ? `Supplier payment of ${peso(data.payment_recorded)} was recorded successfully. This purchase order is now Paid.`
                : `Supplier payment of ${peso(data.payment_recorded)} was recorded successfully. Remaining balance: ${peso(data.remaining_balance)}.`
        });
    } catch (error) {
        const stale = /outstanding balance changed/i.test(error.message || '');
        showSupplierPaymentResult({ type: 'error', title: 'Payment Not Recorded', poId: state.poId, message: error.message || 'Unable to record supplier payment.', state, refreshOnReturn: stale });
    } finally {
        supplierPaymentSubmitting = false;
        if (button) { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-check me-1"></i>Confirm Payment'; }
    }
}

async function openDeliveredReceipt(poId) {
    try {
        const details = await fetchReceivingDetails(poId, true);
        openReceiptPreview(receiptReportFromReceiving(details));
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function renderReturnItems(order) {
    const body = document.querySelector('#table-return-items tbody');
    if (!body) return;

    const hasReceivingRecord = order.items.some((item) => Number(item.received_quantity || 0) > 0 || Number(item.damaged_quantity || 0) > 0);

    body.innerHTML = order.items.map((item) => {
        const damagedQuantity = Number(item.damaged_quantity || 0);
        const maxReturnQuantity = hasReceivingRecord ? damagedQuantity : Number(item.inventory_qty_ordered || item.quantity || 0);

        return `
        <tr data-po-item-id="${escapeHtml(item.po_item_id)}">
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.brand_name)}</td>
            <td>${escapeHtml(item.inventory_qty_ordered || item.quantity)}</td>
            <td>${escapeHtml(item.received_quantity || 0)}</td>
            <td>${escapeHtml(item.damaged_quantity || 0)}</td>
            <td><input class="form-control form-control-sm return-qty-input" type="number" min="0" max="${escapeHtml(maxReturnQuantity)}" value="${escapeHtml(damagedQuantity)}"></td>
            <td>
                <select class="form-select form-select-sm damage-reason-select">
                    <option value="" disabled selected>Select reason...</option>
                    <option value="Expired">Expired</option>
                    <option value="Broken package">Broken package</option>
                    <option value="Wrong item delivered">Wrong item delivered</option>
                    <option value="Incorrect quantity">Incorrect quantity</option>
                    <option value="Damaged during delivery">Damaged during delivery</option>
                    <option value="Other">Other</option>
                </select>
            </td>
            <td><textarea class="form-control form-control-sm return-remarks-input" rows="1"></textarea></td>
        </tr>
    `;
    }).join('');
}

async function openReturnDamageModal(poId) {
    try {
        activeReturnOrder = await getPurchaseOrder(poId);
        document.getElementById('returnPoNumber').textContent = activeReturnOrder.po_number;
        document.getElementById('returnSupplierName').textContent = activeReturnOrder.supplier_name;
        document.getElementById('returnPoDetails').innerHTML = `
            <div class="po-detail-box"><span>PO Number</span><strong>${escapeHtml(activeReturnOrder.po_number)}</strong></div>
            <div class="po-detail-box"><span>Supplier Name</span><strong>${escapeHtml(activeReturnOrder.supplier_name)}</strong></div>
            <div class="po-detail-box"><span>Status</span><strong>${escapeHtml(activeReturnOrder.status)}</strong></div>
            <div class="po-detail-box"><span>Order Date</span><strong>${formatDate(activeReturnOrder.order_date)}</strong></div>
        `;
        renderReturnItems(activeReturnOrder);
        showModal('returnDamageModal');
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

function returnPayload() {
    if (!activeReturnOrder) throw new Error('No purchase order selected.');

    const returns = [];
    const hasReceivingRecord = activeReturnOrder.items.some((item) => Number(item.received_quantity || 0) > 0 || Number(item.damaged_quantity || 0) > 0);
    document.querySelectorAll('#table-return-items tbody tr').forEach((row) => {
        const orderItem = activeReturnOrder.items.find((item) => String(item.po_item_id) === String(row.dataset.poItemId));
        const returnQuantity = Number(row.querySelector('.return-qty-input')?.value || 0);
        const damageReason = row.querySelector('.damage-reason-select')?.value || '';
        const remarks = row.querySelector('.return-remarks-input')?.value || '';
        const damagedQuantity = Number(orderItem?.damaged_quantity || 0);
        const maxReturnQuantity = hasReceivingRecord ? damagedQuantity : Number(orderItem?.inventory_qty_ordered || orderItem?.quantity || 0);

        if (returnQuantity > 0) {
            if (returnQuantity > maxReturnQuantity) {
                throw new Error('Return quantity cannot exceed the damaged quantity recorded for the item.');
            }

            if (!damageReason) {
                throw new Error('Select a damage reason for every returned item.');
            }

            returns.push({
                po_item_id: row.dataset.poItemId,
                return_quantity: returnQuantity,
                damage_reason: damageReason,
                remarks
            });
        }
    });

    if (returns.length === 0) {
        throw new Error('Enter at least one return quantity.');
    }

    return {
        po_id: activeReturnOrder.po_id,
        returns
    };
}

async function submitReturnDamage() {
    try {
        const payload = returnPayload();
        PharmaUtils.modal.loading('Saving Return/Damage...');
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/save_purchase_order_return.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        PharmaUtils.modal.close();
        hideModal('returnDamageModal');
        await loadPurchaseOrders({ updateSummary: true });
        PharmaUtils.toast.success(data.message);
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to save return/damage', err.message);
    }
}

function inspectionQueueSnapshot(order) {
    const draft = order.inspection_draft;
    if (!draft || !Array.isArray(draft.items)) {
        return { completed: 0, total: Math.max(1, (order.items || []).length * 6), percent: 0, hasIssues: false, ready: false, key: 'awaiting', status: 'Awaiting Inspection' };
    }
    let completed = 0;
    let hasIssues = false;
    let allReady = true;
    (order.items || []).forEach((orderItem) => {
        const item = draft.items.find((candidate) => String(candidate.po_item_id) === String(orderItem.po_item_id)) || {};
        const quantity = receiveQuantityModel(orderItem, receiveQuantityValuesWithConversions(orderItem, item));
        const batches = Array.isArray(item.batches) ? item.batches : [];
        const allocated = batches.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantity || 0)), 0);
        const quantitiesComplete = Number.isInteger(quantity.delivered) && quantity.delivered >= 0 && quantity.delivered <= quantity.ordered
            && Number.isInteger(quantity.damaged) && quantity.damaged >= 0 && quantity.damaged <= quantity.delivered
            && Number.isInteger(quantity.action) && quantity.action >= 0 && quantity.action <= quantity.delivered;
        const batchesComplete = allocated === quantity.accepted && (quantity.accepted === 0 || batches.length > 0) && batches.every((batch) => Number.isInteger(Number(batch.quantity)) && Number(batch.quantity) > 0);
        const expiryComplete = quantity.accepted === 0 || !isMedicineItem(orderItem) || (batches.length > 0 && batches.every((batch) => Boolean(batch.expiry_date)));
        const physicalAction = ['return_to_supplier', 'hold_quarantine', 'dispose'].includes(quantity.disposition);
        const dispositionComplete = quantity.action > 0 || quantity.damaged > 0
            ? physicalAction && quantity.action >= quantity.damaged
            : (quantity.missing > 0 ? quantity.disposition === 'not_applicable' : true);
        const issueDetailComplete = item.issue_type !== 'Other' || Boolean(String(item.issue_detail || '').trim());
        const resolutionComplete = quantity.affected === 0
            ? quantity.resolution === 'none'
            : Boolean(item.issue_type) && issueDetailComplete && dispositionComplete && quantity.resolution !== 'none';
        const remarksComplete = true;
        const inspected = item.inspection_complete === true || item.inspection_complete === 1 || item.inspection_complete === '1';
        completed += [quantitiesComplete, batchesComplete, expiryComplete, resolutionComplete, remarksComplete, inspected].filter(Boolean).length;
        hasIssues = hasIssues || quantity.affected > 0;
        allReady = allReady && quantitiesComplete && batchesComplete && expiryComplete && resolutionComplete && remarksComplete && inspected;
    });
    const total = Math.max(1, (order.items || []).length * 6);
    const percent = Math.round((completed / total) * 100);
    const ready = allReady && (order.items || []).length > 0;
    const key = ready ? 'ready' : (hasIssues ? 'issue-found' : 'in-progress');
    const status = ready ? 'Ready to Confirm' : (hasIssues ? 'With Issues' : 'Inspection in Progress');
    return { completed, total, percent, hasIssues, ready, key, status };
}

function inspectionActiveTotals(order) {
    const draftItems = Array.isArray(order.inspection_draft?.items) ? order.inspection_draft.items : [];
    if (!draftItems.length) {
        return {
            ordered: (order.items || []).reduce((sum, item) => sum + Number(item.inventory_qty_ordered || item.quantity || 0), 0),
            accepted: 0,
            affected: 0
        };
    }
    return (order.items || []).reduce((totals, item) => {
        const draftItem = draftItems.find((candidate) => String(candidate.po_item_id) === String(item.po_item_id)) || {};
        const quantity = receiveQuantityModel(item, receiveQuantityValuesWithConversions(item, draftItem));
        totals.ordered += Number(quantity.ordered || 0);
        totals.accepted += Number(quantity.accepted || 0);
        totals.affected += Number(quantity.affected || 0);
        return totals;
    }, { ordered: 0, accepted: 0, affected: 0 });
}

function inspectionQueueProductSummary(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const first = items[0] || order;
    const count = order.receiving_completed === true ? Number(order.products || 0) : items.length;
    const product = first.product_name_snapshot || first.product_name || 'Product';
    const brand = first.brand_name_snapshot || first.brand_name || '';
    const more = Math.max(0, count - 1);
    const secondary = [brand, more > 0 ? `+${more} more` : ''].filter(Boolean).join(' • ');
    return `<div class="queue-product-summary"><strong>${escapeHtml(product)}</strong>${secondary ? `<span>${escapeHtml(secondary)}</span>` : ''}</div>`;
}

function renderInspectionQueue() {
    const search = String(document.getElementById('inspectionSearch')?.value || '').trim().toLowerCase();
    const from = document.getElementById('inspectionDateFrom')?.value || '';
    const to = document.getElementById('inspectionDateTo')?.value || '';
    const inspectionStatus = document.getElementById('inspectionStatusFilter')?.value || '';
    const filtered = inspectionQueueOrders.filter((order) => {
        const snapshot = order.receiving_completed === true ? { key: 'completed', status: 'Receiving Completed', hasIssues: Number(order.affected_units || 0) > 0 } : (order.inspection_snapshot || inspectionQueueSnapshot(order));
        const firstItem = Array.isArray(order.items) ? (order.items[0] || {}) : order;
        const haystack = `${order.po_number || ''} ${order.grn_number || ''} ${order.supplier_name || ''} ${firstItem.product_name_snapshot || firstItem.product_name || ''} ${firstItem.brand_name_snapshot || firstItem.brand_name || ''}`.toLowerCase();
        const arrival = String(order.received_date || order.arrival_date || order.expected_delivery_date || order.order_date || '').slice(0, 10);
        return (!search || haystack.includes(search))
            && (!from || arrival >= from)
            && (!to || arrival <= to)
            && (!inspectionStatus || snapshot.key === inspectionStatus);
    });
    const rows = document.getElementById('inspectionQueueRows');
    if (!rows) return;
    if (!filtered.length) {
        rows.innerHTML = '<tr><td colspan="9" class="empty-state">No arrived purchase orders match the selected filters.</td></tr>';
        return;
    }
    rows.innerHTML = filtered.map((order) => {
        const completed = order.receiving_completed === true;
        const snapshot = completed ? { key: 'completed', status: 'Receiving Completed', hasIssues: Number(order.affected_units || 0) > 0 } : (order.inspection_snapshot || inspectionQueueSnapshot(order));
        const totals = completed ? { ordered: Number(order.ordered_units || 0), accepted: Number(order.accepted_units || 0), affected: Number(order.affected_units || 0) } : inspectionActiveTotals(order);
        const statusClass = snapshot.key === 'completed' ? 'status-complete' : (snapshot.ready ? 'status-ready' : (snapshot.hasIssues ? 'status-warning' : (snapshot.key === 'in-progress' ? 'status-active' : 'status-neutral')));
        const arrivalDate = order.arrival_date || order.expected_delivery_date || order.order_date;
        const receivedDate = order.received_date;
        const actionLabel = snapshot.key === 'awaiting' ? 'Start Inspection' : 'Continue Inspection';
        const actions = completed
            ? `<button class="btn btn-sm btn-outline-primary queue-action-icon queue-view-receiving" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View Goods Received Note" aria-label="View Goods Received Note for ${escapeHtml(order.po_number || '')}"><i class="fa-regular fa-eye"></i></button><button class="btn btn-sm btn-outline-primary queue-action-icon queue-edit-receiving" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Edit Goods Received Note" aria-label="Edit Goods Received Note for ${escapeHtml(order.po_number || '')}"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-secondary queue-action-icon queue-print-grn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Print Goods Received Note" aria-label="Print Goods Received Note for ${escapeHtml(order.po_number || '')}"><i class="fa-solid fa-print"></i></button>`
            : `<button class="btn btn-sm ${snapshot.key === 'awaiting' ? 'btn-outline-primary' : 'btn-primary'} queue-action-icon inspect-queue-action" type="button" data-po-id="${escapeHtml(order.po_id)}" title="${actionLabel}" aria-label="${actionLabel} for ${escapeHtml(order.po_number || '')}"><i class="fa-solid fa-clipboard-check"></i></button>`;
        return `<tr class="queue-row" data-po-id="${escapeHtml(order.po_id)}">
            <td><span class="queue-po" title="${escapeHtml(order.po_number || '-')}">${escapeHtml(order.po_number || '-')}</span><span class="queue-secondary" title="${escapeHtml(completed ? order.grn_number : 'No GRN yet')}">${escapeHtml(completed ? order.grn_number : 'No GRN yet')}</span></td>
            <td title="${escapeHtml(order.supplier_name || '-')}">${escapeHtml(order.supplier_name || '-')}</td>
            <td><strong>${escapeHtml(formatDate(arrivalDate))}</strong>${completed ? `<span class="queue-secondary">Received ${escapeHtml(formatDate(receivedDate))}</span>` : ''}</td>
            <td>${inspectionQueueProductSummary(order)}</td><td>${totals.ordered}</td><td>${totals.accepted}</td><td>${totals.affected}</td>
            <td><span class="queue-status-badge ${statusClass}">${escapeHtml(snapshot.status)}</span></td>
            <td><div class="queue-row-actions">${actions}</div></td>
        </tr>`;
    }).join('');
}

function updateInspectionQueueSummary() {
    const snapshots = inspectionQueueOrders.filter((order) => order.receiving_completed !== true).map((order) => order.inspection_snapshot || inspectionQueueSnapshot(order));
    const values = {
        inspectionCountAwaiting: snapshots.filter((snapshot) => snapshot.key === 'awaiting').length,
        inspectionCountProgress: snapshots.filter((snapshot) => snapshot.key === 'in-progress').length,
        inspectionCountIssues: snapshots.filter((snapshot) => snapshot.hasIssues).length,
        inspectionCountReady: snapshots.filter((snapshot) => snapshot.ready).length
    };
    Object.entries(values).forEach(([id, value]) => { const node = document.getElementById(id); if (node) node.textContent = String(value); });
}

async function loadInspectionQueue() {
    const rows = document.getElementById('inspectionQueueRows');
    if (rows) rows.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading arrived purchase orders...</td></tr>';
    try {
        const [activeData, completedData] = await Promise.all([
            fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_orders.php?status=Arrived&t=${Date.now()}`),
            fetchJson(`${API_BASE_URL}/purchase_orders/get_receiving_history.php?t=${Date.now()}`)
        ]);
        const activeOrders = Array.isArray(activeData.purchase_orders) ? activeData.purchase_orders : [];
        const activeDetails = await Promise.all(activeOrders.map(async (order) => {
            try {
                const detail = await getPurchaseOrder(order.po_id);
                detail.inspection_snapshot = inspectionQueueSnapshot(detail);
                return detail;
            } catch (error) {
                order.inspection_snapshot = inspectionQueueSnapshot(order);
                return order;
            }
        }));
        const completedOrders = (Array.isArray(completedData.history) ? completedData.history : []).map((record) => ({ ...record, receiving_completed: true }));
        const completedIds = new Set(completedOrders.map((order) => String(order.po_id)));
        inspectionQueueOrders = [...activeDetails.filter((order) => !completedIds.has(String(order.po_id))), ...completedOrders]
            .sort((left, right) => String(right.received_date || right.expected_delivery_date || right.order_date || '').localeCompare(String(left.received_date || left.expected_delivery_date || left.order_date || '')));
        updateInspectionQueueSummary();
        renderInspectionQueue();
    } catch (error) {
        if (rows) rows.innerHTML = `<tr><td colspan="10" class="empty-state text-danger">${escapeHtml(error.message || 'Unable to load arrived purchase orders.')}</td></tr>`;
    }
}

function updateInspectionDateSummary() {
    const from = document.getElementById('inspectionDateFrom')?.value || '';
    const to = document.getElementById('inspectionDateTo')?.value || '';
    const label = document.getElementById('inspectionDateSummary');
    if (!label) return;
    label.textContent = from && to ? `${formatDate(from)} – ${formatDate(to)}` : (from ? `From ${formatDate(from)}` : (to ? `Through ${formatDate(to)}` : 'All arrival dates'));
}

function showInspectionQueue(options = {}) {
    activeReceiveOrder = null;
    document.getElementById('inspectionWorkspaceView')?.classList.add('d-none');
    document.getElementById('inspectionQueueView')?.classList.remove('d-none');
    if (options.replaceHistory || options.pushHistory) {
        const url = new URL(window.location.href);
        url.searchParams.delete('po');
        url.searchParams.delete('received');
        url.searchParams.delete('view');
        window.history[options.pushHistory ? 'pushState' : 'replaceState']({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (options.reload !== false) loadInspectionQueue();
}

function openInspectionWorkspace(poId, options = {}) {
    if (!poId) return;
    if (options.pushHistory) {
        const url = new URL(window.location.href);
        url.searchParams.set('po', poId);
        url.searchParams.delete('received');
        window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    openReceivePurchaseOrder(poId);
}

function bindReceiveWorkspaceEvents() {
    document.getElementById('btnConfirmReceivePo')?.addEventListener('click', submitReceivePurchaseOrder);
    document.getElementById('btnSaveReceiveDraft')?.addEventListener('click', saveReceiveInspectionDraft);
    document.getElementById('btnOpenNextInspection')?.addEventListener('click', openNextUninspectedCard);
    document.getElementById('btnPreviousInspectionProduct')?.addEventListener('click', () => showReceiveProduct(activeInspectionProductIndex - 1));
    document.getElementById('btnNextInspectionProduct')?.addEventListener('click', () => showReceiveProduct(activeInspectionProductIndex + 1));
    document.getElementById('receiveProductNavigator')?.addEventListener('click', (event) => {
        const button = event.target.closest('.product-nav-item');
        if (button) showReceiveProduct(Number(button.dataset.productIndex || 0));
    });
    document.getElementById('receiveAdditionalAmount')?.addEventListener('input', (event) => {
        if (Number(event.target.value || 0) < 0) event.target.value = '0';
        renderReceivePaymentSummary();
    });
    document.getElementById('receivePaymentStatus')?.addEventListener('change', renderReceivePaymentSummary);
    document.getElementById('receiveAmountPaid')?.addEventListener('input', (event) => {
        if (Number(event.target.value || 0) < 0) event.target.value = '0';
        renderReceivePaymentSummary();
    });
    document.getElementById('receiveChecklistItems')?.addEventListener('click', (event) => {
        const step = event.target.closest('.receive-check-step');
        if (step) navigateReceiveChecklistStep(step.dataset.checkKey || '');
    });
    const cards = document.getElementById('receiveInspectionCards');
    cards?.addEventListener('input', (event) => {
        if (event.target.matches('input[type="number"]') && Number(event.target.value || 0) < 0) event.target.value = '0';
        if (event.target.matches('.receive-batch-qty')) event.target.closest('.receive-batch-row').dataset.autoAllocation = '0';
        const card = event.target.closest('.receive-item-card');
        if (card) card.dataset.touched = '1';
        renderReceivePaymentSummary();
    });
    cards?.addEventListener('change', (event) => {
        const card = event.target.closest('.receive-item-card');
        if (card) card.dataset.touched = '1';
        if (event.target.matches('.receive-issue-type') && event.target.value === 'Short Quantity') {
            const action = card?.querySelector('.receive-disposition');
            if (action) action.value = 'not_applicable';
        }
        if (event.target.matches('.receive-batch-no-expiry')) {
            const expiry = event.target.closest('.receive-batch-row')?.querySelector('.receive-batch-expiry');
            if (expiry) { expiry.disabled = event.target.checked; if (event.target.checked) expiry.value = ''; }
        }
        renderReceivePaymentSummary();
    });
    cards?.addEventListener('click', (event) => {
        const addDamage = event.target.closest('.receive-add-damage-line');
        if (addDamage) {
            const card = addDamage.closest('.receive-item-card');
            const orderItem = activeReceiveOrder?.items.find((item) => String(item.po_item_id) === String(card?.dataset.poItemId));
            const conversions = Array.isArray(orderItem?.package_conversions) ? orderItem.package_conversions : [];
            card?.querySelector('.receive-damage-lines')?.insertAdjacentHTML('beforeend', receiveDamageLineRow({}, conversions, orderItem?.unit || 'unit'));
            renderReceivePaymentSummary();
            card?.querySelector('.receive-damage-line:last-child .damage-line-qty')?.focus();
            return;
        }
        const removeDamage = event.target.closest('.receive-remove-damage-line');
        if (removeDamage) {
            removeDamage.closest('.receive-damage-line')?.remove();
            renderReceivePaymentSummary();
            return;
        }
        const complete = event.target.closest('.receive-complete-inspection');
        if (complete) {
            const card = complete.closest('.receive-item-card');
            if (!card || card.dataset.ready !== '1') return;
            const input = card.querySelector('.receive-inspected-input');
            if (input) input.value = '1';
            renderReceivePaymentSummary();
            openNextUninspectedCard();
            return;
        }
        const reopen = event.target.closest('.receive-reopen-inspection');
        if (reopen) {
            const card = reopen.closest('.receive-item-card');
            const input = card?.querySelector('.receive-inspected-input');
            if (input) input.value = '0';
            if (card) setReceiveCardLocked(card, false);
            renderReceivePaymentSummary();
            return;
        }
        const add = event.target.closest('.receive-add-batch');
        if (add) {
            const card = add.closest('.receive-item-card');
            card?.querySelector('.receive-batch-list')?.insertAdjacentHTML('beforeend', receiveBatchRow({}, card?.dataset.requiresExpiry === '1'));
            renderReceivePaymentSummary();
            return;
        }
        const remove = event.target.closest('.receive-remove-batch');
        if (remove) {
            remove.closest('.receive-batch-row')?.remove();
            renderReceivePaymentSummary();
        }
    });
}

function initInspectDeliveries() {
    setTheme(localStorage.getItem('drpTheme') || 'light');
    document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
    bindReceiveWorkspaceEvents();
    ensureReceivingUi();
    document.querySelectorAll('[data-inspection-back]').forEach((button) => button.addEventListener('click', () => showInspectionQueue({ pushHistory: true })));
    document.getElementById('btnRefreshInspectionQueue')?.addEventListener('click', loadInspectionQueue);
    ['inspectionSearch', 'inspectionStatusFilter'].forEach((id) => document.getElementById(id)?.addEventListener(id === 'inspectionSearch' ? 'input' : 'change', renderInspectionQueue));
    ['inspectionDateFrom', 'inspectionDateTo'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => { updateInspectionDateSummary(); renderInspectionQueue(); }));
    document.getElementById('btnClearInspectionFilters')?.addEventListener('click', () => {
        ['inspectionSearch', 'inspectionDateFrom', 'inspectionDateTo', 'inspectionStatusFilter'].forEach((id) => { const control = document.getElementById(id); if (control) control.value = ''; });
        updateInspectionDateSummary();
        renderInspectionQueue();
    });
    document.getElementById('inspectionQueueRows')?.addEventListener('click', (event) => {
        const inspect = event.target.closest('.inspect-queue-action');
        const view = event.target.closest('.queue-view-receiving');
        const edit = event.target.closest('.queue-edit-receiving');
        const print = event.target.closest('.queue-print-grn');
        if (inspect) openInspectionWorkspace(inspect.dataset.poId, { pushHistory: true });
        else if (view) openReceivingDetails(view.dataset.poId);
        else if (edit) openGrnEditor(edit.dataset.poId);
        else if (print) openDeliveredReceipt(print.dataset.poId);
    });
    window.addEventListener('popstate', () => {
        const nextParams = new URLSearchParams(window.location.search);
        const poId = nextParams.get('po');
        if (poId) openInspectionWorkspace(poId); else showInspectionQueue({ reload: false });
    });
    const success = sessionStorage.getItem('inspectDeliveriesSuccess');
    if (success) { sessionStorage.removeItem('inspectDeliveriesSuccess'); PharmaUtils.toast.success(success); }
    const params = new URLSearchParams(window.location.search);
    const poId = params.get('po');
    loadInspectionQueue();
    if (poId) openInspectionWorkspace(poId);
}

function initPurchaseOrders() {
    if (purchaseOrdersInitialized) return;
    purchaseOrdersInitialized = true;
    ensureReceivingUi();

    setTheme(localStorage.getItem('drpTheme') || 'light');
    initEditPoModalLayoutControls();
    initViewPoModalLayoutControls();

    document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
    document.querySelectorAll('[data-bs-dismiss="modal"]').forEach((button) => {
        button.addEventListener('click', () => hideModal(button.closest('.modal')?.id));
    });
    document.getElementById('po-supplier-select')?.addEventListener('change', (event) => {
        createDraftItems.length = 0;
        selectedCreateDraftIndex = null;
        renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
        renderSelectedProductPanel();
        loadSupplierProducts(event.target.value, 'po-product-select');
    });
    document.getElementById('po-product-select')?.addEventListener('change', syncPurchaseUnitFieldsFromSelectedProduct);
    document.getElementById('po-quantity')?.addEventListener('input', syncSelectedCreateDraftItemFromInputs);
    document.getElementById('po-payment-terms')?.addEventListener('change', updateCreatePoSubmitState);
    document.getElementById('po-expected-delivery')?.addEventListener('input', updateCreatePoSubmitState);
    document.getElementById('edit-po-supplier-select')?.addEventListener('change', (event) => {
        editDraftItems.length = 0;
        clearEditProductEditor();
        renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
        loadSupplierProducts(event.target.value, 'edit-po-product-select');
    });
    document.getElementById('edit-po-product-select')?.addEventListener('change', (event) => {
        const option = event.target.options[event.target.selectedIndex];
        const selectedProduct = draftItemFromOption(option, document.getElementById('edit-po-quantity')?.value || 1);
        const existingItem = editDraftItemByKey(editingPoItemKey);
        const item = existingItem ? {
            ...selectedProduct,
            po_item_id: existingItem.po_item_id || null,
            client_item_id: existingItem.client_item_id || null
        } : selectedProduct;
        showEditProductEditor(item, editingPoItemKey);
    });
    document.getElementById('edit-po-quantity')?.addEventListener('input', (event) => {
        const editorQuantity = document.getElementById('edit-po-editor-quantity');
        if (editorQuantity && !document.getElementById('edit-po-product-editor')?.classList.contains('d-none')) {
            editorQuantity.value = event.target.value;
            updateEditStockToReceive();
        }
    });
    document.getElementById('edit-po-editor-quantity')?.addEventListener('input', (event) => {
        setValue('edit-po-quantity', event.target.value);
        updateEditStockToReceive();
    });
    document.getElementById('edit-po-editor-contains')?.addEventListener('input', updateEditStockToReceive);
    document.getElementById('edit-po-editor-purchase-unit')?.addEventListener('change', updateEditStockToReceive);
    document.getElementById('btnAddPoItem')?.addEventListener('click', () => addDraftItem({
        items: createDraftItems,
        productSelectId: 'po-product-select',
        quantityInputId: 'po-quantity',
        tableSelector: '#table-po-items',
        removeClass: 'remove-po-item'
    }));
    document.getElementById('btnEditAddPoItem')?.addEventListener('click', addOrUpdateEditDraftItem);
    document.getElementById('btnCancelEditPoItem')?.addEventListener('click', () => clearEditProductEditor({ focusProduct: true }));
    document.getElementById('btnConfirmReceivePo')?.addEventListener('click', submitReceivePurchaseOrder);
    document.getElementById('btnSaveReceiveDraft')?.addEventListener('click', saveReceiveInspectionDraft);
    document.getElementById('btnOpenNextInspection')?.addEventListener('click', openNextUninspectedCard);
    document.getElementById('btnSaveReturnDamage')?.addEventListener('click', submitReturnDamage);
    const statusFilter = document.getElementById('po-status-filter');
    const params = new URLSearchParams(window.location.search);
    const initialPoView = purchaseOrderViewFromUrl();
    const linkedPoId = params.get('po_id') || '';
    const queryStatus = initialPoView === 'active' ? (params.get('status') || '') : '';
    if (params.get('action') === 'create') {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('action');
        window.history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        PharmaUtils.toast.info('Purchase orders are generated automatically after final CEO approval.');
    }
    if (statusFilter && queryStatus && STATUS_META[queryStatus]) {
        if (![...statusFilter.options].some(option => option.value === queryStatus)) {
            statusFilter.add(new Option(queryStatus, queryStatus));
        }
        statusFilter.value = queryStatus;
    }
    statusFilter?.addEventListener('change', loadPurchaseOrders);
    document.querySelectorAll('.po-view-btn').forEach((button) => {
        button.addEventListener('click', () => setPurchaseOrderView(button.dataset.poView || 'active'));
    });
    document.getElementById('receiveAdditionalAmount')?.addEventListener('input', (event) => {
        if (Number(event.target.value || 0) < 0) event.target.value = '0';
        renderReceivePaymentSummary();
    });
    document.getElementById('receiveChecklistItems')?.addEventListener('click', (event) => {
        const step = event.target.closest('.receive-check-step');
        if (!step) return;
        navigateReceiveChecklistStep(step.dataset.checkKey || '');
    });
    const receivingCards = document.getElementById('receiveInspectionCards');
    receivingCards?.addEventListener('input', (event) => {
        if (event.target.matches('input[type="number"]') && Number(event.target.value || 0) < 0) event.target.value = '0';
        const card = event.target.closest('.receive-item-card');
        if (card) card.dataset.touched = '1';
        renderReceivePaymentSummary();
    });
    receivingCards?.addEventListener('change', (event) => {
        const card = event.target.closest('.receive-item-card');
        if (card) card.dataset.touched = '1';
        if (event.target.matches('.receive-batch-no-expiry')) {
            const expiry = event.target.closest('.receive-batch-row')?.querySelector('.receive-batch-expiry');
            if (expiry) { expiry.disabled = event.target.checked; if (event.target.checked) expiry.value = ''; }
        }
        renderReceivePaymentSummary();
    });
    receivingCards?.addEventListener('click', (event) => {
        const toggle = event.target.closest('.receive-card-toggle');
        if (toggle) {
            const body = toggle.closest('.receive-item-card')?.querySelector('.receive-card-body');
            const willOpen = body?.classList.contains('d-none');
            body?.classList.toggle('d-none', !willOpen);
            toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            return;
        }
        const completeInspectionButton = event.target.closest('.receive-complete-inspection');
        if (completeInspectionButton) {
            const card = completeInspectionButton.closest('.receive-item-card');
            if (!card || card.dataset.ready !== '1') return;
            const inspectionInput = card.querySelector('.receive-inspected-input');
            if (inspectionInput) inspectionInput.value = '1';
            card.dataset.touched = '1';
            renderReceivePaymentSummary();
            return;
        }
        const reopenInspectionButton = event.target.closest('.receive-reopen-inspection');
        if (reopenInspectionButton) {
            const card = reopenInspectionButton.closest('.receive-item-card');
            const inspectionInput = card?.querySelector('.receive-inspected-input');
            if (inspectionInput) inspectionInput.value = '0';
            if (card) {
                card.dataset.touched = '1';
                setReceiveCardLocked(card, false);
            }
            renderReceivePaymentSummary();
            return;
        }
        const addButton = event.target.closest('.receive-add-batch');
        if (addButton) {
            const card = addButton.closest('.receive-item-card');
            if (card) card.dataset.touched = '1';
            card?.querySelector('.receive-batch-list')?.insertAdjacentHTML('beforeend', receiveBatchRow({}, card?.dataset.requiresExpiry === '1'));
            renderReceivePaymentSummary();
            return;
        }
        const removeButton = event.target.closest('.receive-remove-batch');
        if (removeButton) {
            const card = removeButton.closest('.receive-item-card');
            if (card) card.dataset.touched = '1';
            removeButton.closest('.receive-batch-row')?.remove();
            renderReceivePaymentSummary();
        }
    });
    document.getElementById('createPurchaseOrderModal')?.addEventListener('hidden.bs.modal', resetCreateDraft);
    document.getElementById('viewPurchaseOrderModal')?.addEventListener('hidden.bs.modal', () => { activeViewOrder = null; });
    document.getElementById('printPurchaseOrderButton')?.addEventListener('click', () => {
        try { printPurchaseOrder(activeViewOrder); } catch (error) { PharmaUtils.toast.error(error.message); }
    });
    document.getElementById('editPurchaseOrderModal')?.addEventListener('hidden.bs.modal', () => {
        clearEditProductEditor();
        activeEditOrder = null;
        editDraftItems.length = 0;
    });
    document.getElementById('po-selected-product-panel')?.addEventListener('click', (event) => {
        const removeButton = event.target.closest('.po-summary-remove-item');
        const decreaseButton = event.target.closest('.po-quantity-decrease');
        const increaseButton = event.target.closest('.po-quantity-increase');

        if (removeButton) {
            const item = createDraftItemByKey(removeButton.dataset.lineKey || '');
            if (item) removeCreateDraftItem(createDraftItems.indexOf(item));
            return;
        }

        const stepButton = decreaseButton || increaseButton;
        if (stepButton) {
            const itemKey = stepButton.dataset.lineKey || '';
            const item = createDraftItemByKey(itemKey);
            if (!item) return;
            const currentQuantity = Number(item.purchase_qty || item.quantity || 1);
            const nextQuantity = decreaseButton ? Math.max(1, currentQuantity - 1) : currentQuantity + 1;
            updateDraftItemQuantity(itemKey, nextQuantity, decreaseButton ? '.po-quantity-decrease' : '.po-quantity-increase');
        }
    });
    document.getElementById('po-selected-product-panel')?.addEventListener('input', (event) => {
        const input = event.target.closest('.po-quantity-input');
        if (!input) return;
        const itemKey = input.dataset.lineKey || '';
        const item = createDraftItemByKey(itemKey);
        if (!item) return;
        const value = String(input.value || '').trim();
        if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
            input.value = String(item.purchase_qty || item.quantity || 1);
            renderQuantityValidation(input, 'Enter a whole number of 1 or more.');
            return;
        }
        updateDraftItemQuantity(itemKey, value, '.po-quantity-input');
    });
    document.getElementById('po-selected-product-panel')?.addEventListener('keydown', (event) => {
        const input = event.target.closest('.po-quantity-input');
        if (!input) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            input.blur();
            return;
        }
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const itemKey = input.dataset.lineKey || '';
        const item = createDraftItemByKey(itemKey);
        if (!item) return;
        const currentQuantity = Number(item.purchase_qty || item.quantity || 1);
        const nextQuantity = event.key === 'ArrowUp' ? currentQuantity + 1 : Math.max(1, currentQuantity - 1);
        updateDraftItemQuantity(itemKey, nextQuantity, '.po-quantity-input');
    });
    document.getElementById('table-edit-po-items')?.addEventListener('click', async (event) => {
        const removeButton = event.target.closest('.remove-edit-po-item');

        if (removeButton) {
            event.stopPropagation();
            const itemKey = removeButton.dataset.itemKey || '';
            const item = editDraftItemByKey(itemKey);
            if (!item) return;
            const productLabel = [poBrandName(item), productTableProductName(item)].filter(Boolean).join(' ');
            let confirmed = false;
            if (window.Swal) {
                const result = await Swal.fire({
                    title: 'Remove PO item?',
                    text: `${productLabel} will be removed when you save changes.`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Remove Item',
                    confirmButtonColor: '#dc2626',
                    focusCancel: true
                });
                confirmed = result.isConfirmed;
            } else {
                confirmed = window.confirm(`Remove ${productLabel} from this purchase order?`);
            }
            if (!confirmed) return;
            const remainingItems = editDraftItems.filter((candidate) => editItemKey(candidate) !== itemKey);
            editDraftItems.length = 0;
            editDraftItems.push(...remainingItems);
            if (editingPoItemKey === itemKey) clearEditProductEditor();
            renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
            if (activeEditOrder) applyEditLocks(activeEditOrder);
            return;
        }

        const row = event.target.closest('tr[data-item-key]');
        if (row && !editMajorFieldsLocked) {
            const item = editDraftItemByKey(row.dataset.itemKey || '');
            if (item) showEditProductEditor(item, row.dataset.itemKey || '');
        }
    });
    document.getElementById('table-edit-po-items')?.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key) || editMajorFieldsLocked || event.target.closest('button')) return;
        const row = event.target.closest('tr[data-item-key]');
        if (!row) return;
        event.preventDefault();
        const item = editDraftItemByKey(row.dataset.itemKey || '');
        if (item) showEditProductEditor(item, row.dataset.itemKey || '');
    });
    document.getElementById('table-purchase-orders')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('.view-po-btn');
        const printButton = event.target.closest('.print-po-btn');
        const statusButton = event.target.closest('.status-po-btn');
        const managePaymentButton = event.target.closest('.manage-payment-btn, .view-payment-history-btn');
        if (viewButton) openViewPurchaseOrder(viewButton.dataset.poId);
        if (printButton) printPurchaseOrder({ po_id:printButton.dataset.poId });
        if (statusButton) updatePurchaseOrderStatusFromTable(statusButton.dataset.poId);
        if (managePaymentButton) openSupplierPayment(managePaymentButton.dataset.poId);
    });

    renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
    renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
    loadPOSuppliers();
    if (initialPoView === 'active') {
        const initialLoad = loadPurchaseOrders({ updateSummary: true });
        if (linkedPoId) initialLoad.then(() => openViewPurchaseOrder(linkedPoId)).catch(error => showError(error.message));
    } else {
        setPurchaseOrderView(initialPoView, { updateSummary: true });
    }
}

if (document.body.dataset.page === 'inspect-deliveries') initInspectDeliveries();
else initPurchaseOrders();

export { initPurchaseOrders, initInspectDeliveries, loadPOSuppliers, loadSupplierProducts, loadPurchaseOrders };
