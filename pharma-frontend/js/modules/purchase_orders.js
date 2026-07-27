import PharmaUtils from '../utils.js';
import { formatProductIdentity, formatProductSpecification } from './product_specification.js';

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
    'Return/Damage': '#ef4444',
    'Cancelled': '#64748b'
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
    return `<span class="badge status-badge text-white" style="background:${color}">${escapeHtml(status)}</span>`;
}

function paymentStatusBadge(status = 'Unpaid') {
    const normalized = ['Unpaid', 'Partially Paid', 'Fully Paid'].includes(status) ? status : 'Unpaid';
    return `<span class="po-payment-badge ${normalized.toLowerCase().replaceAll(' ', '-')}">${escapeHtml(normalized)}</span>`;
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
    return ['In transit', 'Arrived', 'Delivered', 'Delivered with Return/Damage', 'Cancelled', 'Rejected'].includes(order.status || '');
}

function canOpenEditModal(order) {
    if (isOperationallyLocked(order)) return false;
    return ['Pending', 'Approved', 'Revision Requested'].includes(order.approval_status || 'Pending');
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
        throw new Error('Supplier cost per base unit must be zero or greater.');
    }

    const totalBaseUnits = orderQty * unitsPerPurchaseUnit;
    const supplierUnitCostCents = Math.round((supplierUnitCost + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(totalBaseUnits) || !Number.isSafeInteger(supplierUnitCostCents)) {
        throw new Error('The purchase quantity or supplier cost is too large.');
    }

    const lineTotalCents = totalBaseUnits * supplierUnitCostCents;
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

function setCreatePoModalRect(nextRect = {}) {
    const { modal, dialog } = createPoModalParts();
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
    const width = Math.min(Math.max(rect.width, 720), window.innerWidth - 16);
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

function applyCreatePoFormExpansion(nextHeight = null) {
    const parts = createPoFormHeights();
    if (!parts) return;
    const { modal, body, itemHeight, divider, collapsed, expanded } = parts;
    const current = Number.parseFloat(modal.dataset.poFormPrimaryHeight || '');
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

    modal.dataset.poFormPrimaryHeight = String(height);
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

        const move = (moveEvent) => applyCreatePoFormExpansion(startHeight + moveEvent.clientY - startY);
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
            setCreatePoModalRect({
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
    } catch (err) {
        productSelect.innerHTML = '<option value="" disabled selected>Unable to load products</option>';
        PharmaUtils.toast.error(err.message);
    }
}

function renderStatusSummary(counts = {}) {
    const container = document.getElementById('po-status-summary');
    if (!container) return;

    const nextHtml = Object.entries(STATUS_META).map(([status, color]) => `
        <div class="status-card" style="--status-color:${color}">
            <strong>${Number(status === 'Return/Damage' ? (counts['Return/Damage'] || counts['Delivered with Return/Damage'] || 0) : (counts[status] || 0))}</strong>
            <p>${escapeHtml(status)}</p>
        </div>
    `).join('');

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
        const minWidth = view === 'delivered' ? '1810px' : (view === 'arrived' ? '1740px' : (view === 'archived' ? '1880px' : '1690px'));
        table.style.setProperty('min-width', minWidth, 'important');

        const columnLayouts = {
            active: ['col-supplier', 'col-brand', 'col-items', 'col-specification', 'col-qty', 'col-purchase-unit', 'col-inventory-qty', 'col-money', 'col-terms', 'col-delivery', 'col-status', 'col-actions'],
            arrived: ['col-date', 'col-po-number', 'col-supplier', 'col-brand', 'col-items', 'col-specification', 'col-qty', 'col-money', 'col-terms', 'col-delivery', 'col-status', 'col-actions'],
            delivered: ['col-po-number', 'col-supplier', 'col-specification', 'col-received', 'col-received', 'col-received', 'col-inventory-qty', 'col-money', 'col-money', 'col-money', 'col-money', 'col-payment-status', 'col-date', 'col-actions'],
            archived: ['col-po-number', 'col-supplier', 'col-brand', 'col-items', 'col-specification', 'col-qty', 'col-money', 'col-date', 'col-supplier', 'col-reason', 'col-status', 'col-actions']
        };
        const colgroup = document.getElementById('purchase-orders-colgroup');
        if (colgroup) {
            colgroup.innerHTML = (columnLayouts[view] || columnLayouts.active)
                .map((columnClass) => `<col class="${columnClass}">`)
                .join('');
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
                <th class="col-terms">Payment Terms</th>
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
            <th class="col-supplier">Supplier</th>
            <th class="col-brand">Brand</th>
            <th class="col-items">Product</th>
            <th class="col-specification">Specification</th>
            <th class="col-qty">Order Qty</th>
            <th class="col-purchase-unit">Purchase Unit</th>
            <th class="col-inventory-qty">Stock to Receive</th>
            <th class="col-money">PO Total</th>
            <th class="col-terms">Payment</th>
            <th class="col-delivery">ETA</th>
            <th class="col-status">Status</th>
            <th class="col-actions">Actions</th>
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
        commitPurchaseOrderTable('active', tableEmpty(12, 'No active purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = order.item_names || [];
        const quantities = items.length ? items.map((item) => item.purchase_qty || 0) : (order.quantities || []);
        const purchaseUnits = items.map((item) => purchaseUnitInfo(item).purchaseUnit || '-');
        const inventoryQuantities = items.map((item) => {
            return quantityWithInventoryUnit(item, Number(item.inventory_qty_ordered || inventoryQtyForItem(item) || 0));
        });
        const editButton = canOpenEditModal(order)
            ? `
                <button class="btn btn-sm btn-outline-secondary edit-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Edit ${escapeHtml(order.po_number)}" title="Edit PO">
                    <i class="fa-solid fa-pen"></i>
                </button>
            `
            : '';

        return `
        <tr>
            <td class="po-supplier-cell">${escapeHtml(order.supplier_name)}</td>
            <td class="po-brand-cell">${brandTableCellList(items)}</td>
            <td class="po-product-cell">${productTableCellList(items, itemNames)}</td>
            <td class="po-spec-cell">${specificationTableCellList(items)}</td>
            <td class="po-qty-cell">${numberedList(quantities, { plain: true })}</td>
            <td>${numberedList(purchaseUnits)}</td>
            <td class="po-qty-cell">${numberedList(inventoryQuantities, { plain: true })}</td>
            <td class="po-price-cell"><span class="po-money">${peso(order.total_amount)}</span></td>
            <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
            <td class="po-delivery-cell">${formatDate(order.expected_delivery_date)}</td>
            <td class="po-status-cell">${statusBadge(order.status)}</td>
            <td class="po-actions-cell">
                <div class="po-actions">
                    <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number)}" title="View PO">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    ${editButton}
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
                        <button class="btn btn-sm btn-outline-primary receive-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Inspect PO ${escapeHtml(order.po_number || '')}" title="Inspect delivery">
                            <i class="fa-solid fa-clipboard-check"></i>
                        </button>
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
                    <div class="po-payment-actions">
                        <button class="btn btn-sm btn-outline-primary view-receiving-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View Receiving for ${escapeHtml(order.po_number || '')}" title="View Receiving"><i class="fa-regular fa-eye"></i></button>
                        <button class="btn btn-sm btn-outline-secondary print-delivered-grn-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Print GRN for ${escapeHtml(order.po_number || '')}" title="Print GRN"><i class="fa-solid fa-print"></i></button>
                        ${String(order.payment_status) !== 'Fully Paid' && Number(order.remaining_balance ?? order.final_payment) > 0 ? `<button class="btn btn-sm btn-purple manage-payment-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Manage Payment for ${escapeHtml(order.po_number || '')}" title="Manage Payment"><i class="fa-solid fa-wallet"></i></button>` : ''}
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
        const statusFilter = viewAtRequest === 'active' ? (document.getElementById('po-status-filter')?.value || '') : '';
        const query = viewAtRequest === 'delivered'
            ? '?scope=complete'
            : (viewAtRequest === 'arrived'
                ? '?status=Arrived'
                : (viewAtRequest === 'archived'
                    ? '?status=Cancelled'
                    : (statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '')));
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_orders.php${query}`);

        if (loadToken !== purchaseOrdersLoadToken || viewAtRequest !== currentPoView) return;

        let orders = data.purchase_orders || [];
        if (viewAtRequest === 'active' && !statusFilter && orders.length === 0) {
            const activeCount = ['Pending', 'In transit']
                .reduce((total, status) => total + Number(data.status_counts?.[status] || 0), 0);

            if (activeCount > 0) {
                const fallback = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_orders.php?scope=all&t=${Date.now()}`);
                if (loadToken !== purchaseOrdersLoadToken || viewAtRequest !== currentPoView) return;
                orders = (fallback.purchase_orders || []).filter((order) =>
                    ['Pending', 'In transit'].includes(order.status) && order.approval_status !== 'Rejected'
                );
                data.status_counts = fallback.status_counts || data.status_counts;
            }
        }

        if (updateSummary) renderStatusSummary(data.status_counts || {});
        if (viewAtRequest === 'arrived') {
            renderArrivedPurchaseOrders(orders);
        } else if (viewAtRequest === 'delivered') {
            renderDeliveredPurchaseOrders(orders);
        } else if (viewAtRequest === 'archived') {
            renderArchivedPurchaseOrders(orders);
        } else {
            renderActivePurchaseOrders(orders);
            window.setTimeout(() => {
                if (
                    loadToken === purchaseOrdersLoadToken
                    && currentPoView === 'active'
                    && orders.length > 0
                    && !document.querySelector('#table-purchase-orders tbody')?.textContent.trim()
                ) {
                    renderActivePurchaseOrders(orders);
                }
            }, 250);
        }
    } catch (err) {
        if (loadToken !== purchaseOrdersLoadToken || viewAtRequest !== currentPoView) return;

        if (updateSummary) renderStatusSummary({});
        if (viewAtRequest === 'arrived') renderArrivedPurchaseOrders([]);
        else if (viewAtRequest === 'delivered') renderDeliveredPurchaseOrders([]);
        else if (viewAtRequest === 'archived') renderArchivedPurchaseOrders([]);
        else renderActivePurchaseOrders([]);
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
    const params = new URLSearchParams(window.location.search);
    const tab = String(params.get('tab') || '').trim().toLowerCase();
    const viewMap = {
        active: 'active',
        arrived: 'arrived',
        delivered: 'delivered',
        archived: 'archived'
    };
    return viewMap[tab] || 'active';
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
        : 'Item changes are locked after owner approval.';
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
        document.getElementById('viewPoNumber').textContent = order.po_number;
        document.getElementById('viewPoDetails').innerHTML = `
            <div class="po-detail-box"><span>Supplier</span><strong>${escapeHtml(order.supplier_name)}</strong></div>
            <div class="po-detail-box"><span>Order Date</span><strong>${formatDate(order.order_date)}</strong></div>
            <div class="po-detail-box"><span>Payment</span><strong>${escapeHtml(order.payment_terms)}</strong></div>
            <div class="po-detail-box"><span>ETA</span><strong>${formatDate(order.expected_delivery_date)}</strong></div>
            <div class="po-detail-box"><span>Total Amount</span><strong>${peso(order.total_amount)}</strong></div>
            <div class="po-detail-box"><span>Adjusted Payable</span><strong>${peso(order.final_payment)}</strong></div>
            <div class="po-detail-box"><span>Payment State</span><strong>${escapeHtml(order.payment_state || 'Unpaid')}</strong></div>
            <div class="po-detail-box"><span>Status</span><strong>${escapeHtml(order.status)}</strong></div>
        `;
        document.getElementById('viewPoItems').innerHTML = order.items.map((item) => {
            const purchaseUnit = purchaseUnitInfo(item);
            const stockToReceive = quantityWithInventoryUnit(item, Number(item.inventory_qty_ordered || inventoryQtyForItem(item) || 0));

            return `
                <tr>
                    <td>${escapeHtml(productTableBrand(item) || '-')}</td>
                    <td>${escapeHtml(productTableProductName(item))}${inactivePoProductWarning(item)}</td>
                    <td>${escapeHtml(productSpecification(item) || '-')}</td>
                    <td>${peso(item.price)} / ${escapeHtml(unitPriceLabel(purchaseUnit.singleStockUnit))}</td>
                    <td>${escapeHtml(purchaseUnitQuantityLabel(item))}</td>
                    <td>${escapeHtml(purchaseUnit.conversionNote || '-')}</td>
                    <td>${escapeHtml(stockToReceive)}</td>
                    <td>${escapeHtml(item.received_quantity || 0)}</td>
                    <td>
                        ${escapeHtml(item.damaged_quantity || 0)}
                        ${Number(item.returned_quantity || 0) > 0 ? `
                            <div class="small text-danger fw-bold mt-1" title="${escapeHtml(item.return_reasons || '')}">
                                Returned Qty: ${escapeHtml(item.returned_quantity)}
                            </div>
                            <div class="small text-muted">${escapeHtml(item.return_reasons || 'No reason')}</div>
                        ` : ''}
                    </td>
                    <td>${peso(item.returned_amount)}</td>
                    <td>${peso(productLineTotal(item))}</td>
                </tr>
            `;
        }).join('');
        showModal('viewPurchaseOrderModal');
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

async function openEditPurchaseOrder(poId) {
    try {
        const order = await getPurchaseOrder(poId);
        if (!canOpenEditModal(order)) {
            PharmaUtils.toast.info('This purchase order is locked after processing.');
            await openViewPurchaseOrder(poId);
            return;
        }
        await populateEditPurchaseOrder(order);
        showModal('editPurchaseOrderModal');
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

async function updatePurchaseOrder() {
    const saveButton = document.getElementById('btnUpdatePo');
    if (saveButton?.dataset.saving === 'true') return;
    try {
        if (saveButton) {
            saveButton.dataset.saving = 'true';
            saveButton.disabled = true;
            saveButton.textContent = 'Saving...';
        }
        const poId = document.getElementById('edit-po-id')?.value;
        const payload = purchaseOrderPayload('edit-po', editDraftItems, poId);
        PharmaUtils.modal.loading('Updating Purchase Order...');
        await fetchJson(`${API_BASE_URL}/purchase_orders/update_po.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const refreshedOrder = await getPurchaseOrder(poId);
        await populateEditPurchaseOrder(refreshedOrder);
        PharmaUtils.modal.close();
        hideModal('editPurchaseOrderModal');
        await loadPurchaseOrders({ updateSummary: true });
        await PharmaUtils.modal.success('Purchase Order Updated', 'The purchase order was updated successfully.');
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to update purchase order', err.message);
    } finally {
        if (saveButton) {
            saveButton.dataset.saving = 'false';
            saveButton.textContent = activeEditOrder?.approval_status === 'Revision Requested' ? 'Resubmit for Approval' : 'Save Changes';
            saveButton.disabled = editDraftItems.length === 0 || Boolean(activeEditOrder && isOperationallyLocked(activeEditOrder));
        }
    }
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

const RECEIVE_ISSUE_TYPES = ['Expired', 'Broken package', 'Wrong item delivered', 'Incorrect quantity', 'Damaged during delivery', 'Other'];
const RECEIVE_RESOLUTIONS = [
    ['return_for_credit', 'Return for supplier credit'],
    ['return_for_replacement', 'Return for replacement'],
    ['keep_with_discount', 'Keep with supplier discount'],
    ['keep_damaged', 'Keep as damaged stock'],
    ['reject_without_replacement', 'Reject without replacement']
];
let receiveSubmitting = false;

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
    const ordered = Number(orderItem.inventory_qty_ordered || orderItem.quantity || 0);
    const delivered = Number(values.delivered_quantity ?? values.received_quantity ?? ordered);
    const damaged = Number(values.damaged_quantity ?? 0);
    const missing = Math.max(0, ordered - delivered);
    const affected = Math.max(0, damaged) + missing;
    const resolution = values.resolution || (values.damage_action === 'return' ? 'return_for_credit' : (values.damage_action === 'keep' ? 'keep_damaged' : 'none'));
    const returned = ['return_for_credit', 'return_for_replacement'].includes(resolution) ? Math.max(0, damaged) : 0;
    const disposed = resolution === 'reject_without_replacement' ? Math.max(0, damaged) : 0;
    const accepted = Math.max(0, delivered - returned - disposed);
    const resolved = affected > 0 && resolution !== 'none' ? affected : 0;
    const unitPrice = Number(orderItem.price || 0);
    const supplierCredit = ['return_for_credit', 'reject_without_replacement'].includes(resolution) ? affected * unitPrice : 0;
    const replacementPending = resolution === 'return_for_replacement' ? affected * unitPrice : 0;
    return { ordered, delivered, damaged, missing, accepted, affected, resolution, returned, disposed, resolved, unitPrice, supplierCredit, replacementPending };
}

function renderReceiveItems(order) {
    const container = document.getElementById('receiveInspectionCards');
    if (!container) return;
    container.innerHTML = (order.items || []).map((item, index) => {
        const draft = receiveDraftItem(item);
        const quantities = receiveQuantityModel(item, draft);
        const { ordered, delivered, damaged, accepted } = quantities;
        const requiresExpiry = isMedicineItem(item);
        const batches = Array.isArray(draft.batches) && draft.batches.length
            ? draft.batches
            : (accepted > 0 ? [{ quantity: accepted, expiry_date: '', no_expiry: !requiresExpiry, auto_allocate: true }] : []);
        const resolution = quantities.resolution;
        const productName = productTableProductName(item);
        const brandName = productTableBrand(item);
        const subtitle = [productSpecification(item), productSizeValue(item), unitDisplayFromDetails(item), productPackagingValue(item)].filter(Boolean).join(' · ');
        return `
        <article class="receive-item-card" data-product-index="${index}" data-po-item-id="${escapeHtml(item.po_item_id)}" data-requires-expiry="${requiresExpiry ? '1' : '0'}" data-has-draft="${Object.keys(draft).length ? '1' : '0'}" ${index === 0 ? '' : 'hidden'}>
            <button class="receive-card-toggle" type="button" aria-expanded="${index === 0 ? 'true' : 'false'}">
                <span class="receive-item-index">${index + 1}</span>
                <span class="receive-card-title"><strong>${escapeHtml([brandName, productName].filter(Boolean).join(' — '))}</strong><small>${escapeHtml(subtitle || quantityWithInventoryUnit(item, ordered))}</small></span>
                <span class="receive-item-result">
                    <span>Ordered<b class="receive-header-ordered">${ordered}</b></span>
                    <span>Accepted<b class="receive-header-accepted">${accepted}</b></span>
                    <span>Damaged<b class="receive-header-damaged">${Number(damaged)}</b></span>
                    <span>Returned<b class="receive-header-returned">${quantities.returned}</b></span>
                </span>
                <span class="receive-status-stack"><span class="receive-inspection-badge">Waiting</span><span class="receive-issue-flag d-none">Issue Found</span></span>
            </button>
            ${inactivePoProductWarning(item)}
            <div class="receive-card-body ${index === 0 ? '' : 'd-none'}">
                <div class="receive-product-facts">
                    <div><span>Brand</span><strong>${escapeHtml(brandName || '-')}</strong></div>
                    <div><span>Generic</span><strong>${escapeHtml(item.generic_name || item.variant_flavor || '-')}</strong></div>
                    <div><span>Specification</span><strong>${escapeHtml(productSpecification(item) || '-')}</strong></div>
                    <div><span>Strength</span><strong>${escapeHtml(item.strength || productSizeValue(item) || '-')}</strong></div>
                    <div><span>Packaging</span><strong>${escapeHtml([unitDisplayFromDetails(item), productPackagingValue(item)].filter(Boolean).join(' · ') || '-')}</strong></div>
                    <div class="receive-financial-fact"><span>Unit Price</span><strong>${peso(item.price || 0)}</strong></div>
                    <div class="receive-financial-fact"><span>Original Line Total</span><strong>${peso(productLineTotal(item))}</strong></div>
                </div>
                <div class="receive-form-grid">
                    <section class="receive-process-card receiving-inspection-card receive-scroll-target">
                        <div class="section-card-heading"><span class="section-card-icon inspection"><i class="fa-solid fa-clipboard-check"></i></span><div><span class="section-eyebrow">Section 1</span><h3>Receiving Inspection</h3></div></div>
                        <div class="receive-quantity-grid">
                            <div class="receive-field receive-quantity-anchor"><label>Ordered Qty</label><div class="receive-calculated receive-ordered-qty">${ordered}</div></div>
                            <div class="receive-field"><label>Received Qty</label><input class="form-control receive-qty-input" type="number" min="0" step="1" value="${escapeHtml(delivered)}"></div>
                            <div class="receive-field receive-damage-anchor"><label>Damaged Qty</label><input class="form-control damaged-qty-input" type="number" min="0" step="1" value="${escapeHtml(damaged)}"></div>
                            <div class="receive-field returned-field"><label>Returned Qty</label><div class="receive-calculated receive-returned-qty">${quantities.returned}</div></div>
                            <div class="receive-field disposed-field"><label>Disposed Qty</label><div class="receive-calculated receive-disposed-qty">${quantities.disposed}</div></div>
                            <div class="receive-field"><label>Missing Qty</label><div class="receive-calculated receive-missing-qty">${Math.max(0, ordered - Number(delivered))}</div></div>
                            <div class="receive-field accepted-field"><label>Accepted Qty</label><div class="receive-calculated receive-accepted-qty">${accepted}</div><small>Calculated automatically from the selected resolution.</small></div>
                        </div>
                    </section>
                    <div class="receive-field receive-inspection-action receive-scroll-target">
                        <label>Inspection Status</label>
                        <div class="receive-inspection-control">
                            <span class="receive-readiness-text">Complete the required checks below.</span>
                            <button class="btn btn-sm btn-primary receive-complete-inspection" type="button" disabled><i class="fa-solid fa-clipboard-check me-1"></i>Complete Inspection</button>
                            <span class="receive-completed-action d-none"><i class="fa-solid fa-circle-check me-1"></i>Inspection Complete</span>
                            <button class="btn btn-sm btn-outline-secondary receive-reopen-inspection d-none" type="button"><i class="fa-solid fa-pen me-1"></i>Reopen Inspection</button>
                            <input class="receive-inspected-input" type="hidden" value="${draft.inspection_complete ? '1' : '0'}">
                        </div>
                    </div>
                    <section class="receive-issue-panel receive-process-card receive-scroll-target d-none">
                        <div class="section-card-heading"><span class="section-card-icon issue"><i class="fa-solid fa-triangle-exclamation"></i></span><div><span class="section-eyebrow">Section 2</span><h3>Issue Resolution</h3></div></div>
                        <div class="receive-field receive-issue-type-field"><label>Issue Type *</label><select class="form-select receive-issue-type"><option value="">Select issue...</option>${RECEIVE_ISSUE_TYPES.map((value) => `<option value="${value}" ${draft.issue_type === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
                        <div class="receive-field receive-resolution-field"><label>Resolution *</label><select class="form-select receive-resolution"><option value="none">Select resolution...</option>${RECEIVE_RESOLUTIONS.map(([value, label]) => `<option value="${value}" ${resolution === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
                        <div class="receive-field receive-item-adjustment-wrap d-none"><label>Supplier Adjustment *</label><div class="input-group"><span class="input-group-text">₱</span><input class="form-control receive-item-adjustment" type="number" min="0" step="0.01" value="${escapeHtml(draft.supplier_adjustment || 0)}"></div></div>
                        <div class="receive-field receive-item-remarks-field"><label>Item Remarks *</label><textarea class="form-control receive-remarks-input" rows="2" placeholder="Describe the discrepancy and agreement...">${escapeHtml(draft.remarks || '')}</textarea></div>
                    </section>
                    <section class="receive-batches receive-process-card receive-scroll-target">
                        <div class="receive-batches-head"><div class="section-card-heading"><span class="section-card-icon inventory"><i class="fa-solid fa-boxes-stacked"></i></span><div><span class="section-eyebrow">Section 3</span><h3>Inventory Batch Allocation</h3></div></div><button class="btn btn-sm btn-outline-primary receive-add-batch" type="button"><i class="fa-solid fa-plus me-1"></i>Add Batch</button></div>
                        <div class="receive-allocation-summary"><strong class="receive-allocation-state">Allocated 0 / ${accepted}</strong><span class="receive-allocation-badge">Incomplete</span></div><div class="receive-allocation-reason">${accepted} units remaining.</div>
                        <div class="receive-batch-list">${batches.map((batch) => receiveBatchRow(batch, requiresExpiry, batch.auto_allocate === true || (batches.length === 1 && Number(batch.quantity) !== accepted))).join('')}</div>
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
    card.querySelectorAll('input:not(.receive-inspected-input), select, textarea, .receive-add-batch, .receive-remove-batch').forEach((control) => {
        if (locked) {
            control.disabled = true;
            return;
        }
        if (control.matches('.receive-batch-expiry')) {
            control.disabled = control.closest('.receive-batch-row')?.querySelector('.receive-batch-no-expiry')?.checked === true;
            return;
        }
        control.disabled = false;
    });
}

function receiveFormState(strict = true) {
    const originalTotal = (activeReceiveOrder?.items || []).reduce((total, item) => total + productLineTotal(item), 0);
    const supplierDiscount = Number(document.getElementById('receiveAdditionalAmount')?.value || 0);
    const state = {
        originalTotal,
        supplierCredit: 0,
        replacementPending: 0,
        acceptedGoodsValue: 0,
        returnedGoodsValue: 0,
        supplierDiscount: Number.isFinite(supplierDiscount) ? Math.max(0, supplierDiscount) : 0,
        ordered: 0,
        accepted: 0,
        affected: 0,
        remaining: 0,
        errors: [],
        hardErrors: [],
        items: [],
        taskTotal: 0,
        taskCompleted: 0,
        checks: { quantities: true, damage: true, returns: true, batches: true, expiry: true, resolution: true, remarks: true, finalInspection: true },
        applicable: { quantities: true, damage: true, returns: true, batches: true, expiry: false, resolution: false, remarks: false, finalInspection: true }
    };
    if (!Number.isFinite(supplierDiscount) || supplierDiscount < 0) {
        state.errors.push('Supplier discount must be a non-negative amount.');
        state.hardErrors.push('Supplier discount must be a non-negative amount.');
    }

    document.querySelectorAll('#receiveInspectionCards .receive-item-card').forEach((card, cardIndex) => {
        const orderItem = activeReceiveOrder?.items.find((item) => String(item.po_item_id) === String(card.dataset.poItemId));
        const delivered = Number(card.querySelector('.receive-qty-input')?.value || 0);
        const damaged = Number(card.querySelector('.damaged-qty-input')?.value || 0);
        const inspectionInput = card.querySelector('.receive-inspected-input');
        let inspected = inspectionInput?.value === '1';
        const issueType = card.querySelector('.receive-issue-type')?.value || '';
        const resolution = card.querySelector('.receive-resolution')?.value || 'none';
        const quantities = receiveQuantityModel(orderItem, { delivered_quantity: delivered, damaged_quantity: damaged, resolution });
        const { ordered, missing, accepted, affected, returned, disposed } = quantities;
        const itemRemarks = card.querySelector('.receive-remarks-input')?.value.trim() || '';
        const itemAdjustment = Number(card.querySelector('.receive-item-adjustment')?.value || 0);
        const quantitiesComplete = Number.isInteger(delivered) && delivered >= 0 && delivered <= ordered && Number.isInteger(damaged) && damaged >= 0 && damaged <= delivered;
        const damageRecorded = Number.isInteger(damaged) && damaged >= 0 && damaged <= delivered;
        const itemErrors = [];

        if (!Number.isInteger(delivered) || delivered < 0) itemErrors.push('Delivered quantity must be a non-negative whole number.');
        if (!Number.isInteger(damaged) || damaged < 0) itemErrors.push('Damaged quantity must be a non-negative whole number.');
        if (delivered > ordered) { itemErrors.push('Delivered quantity exceeds the ordered quantity. Resolve the excess before confirming.'); state.hardErrors.push(`Product ${cardIndex + 1}: Delivered quantity exceeds the ordered quantity.`); }
        if (damaged > delivered) { itemErrors.push('Damaged quantity exceeds delivered quantity.'); state.hardErrors.push(`Product ${cardIndex + 1}: Damaged quantity exceeds delivered quantity.`); }
        if (strict && affected > 0 && !issueType) itemErrors.push('Select an issue type.');
        if (strict && affected > 0 && resolution === 'none') itemErrors.push('Select a resolution.');
        if (strict && affected > 0 && !itemRemarks) itemErrors.push('Enter item remarks.');
        if (missing > 0 && ['keep_with_discount', 'keep_damaged'].includes(resolution)) itemErrors.push('Keep is not valid while units are missing; select a supplier return, replacement, or rejection resolution.');
        if (resolution === 'keep_with_discount' && (!Number.isFinite(itemAdjustment) || itemAdjustment <= 0)) itemErrors.push('Enter the agreed supplier adjustment.');
        if (resolution !== 'keep_with_discount' && itemAdjustment > 0) { itemErrors.push('Item adjustment is only valid for Keep with supplier discount.'); state.hardErrors.push(`Product ${cardIndex + 1}: Remove the supplier adjustment or choose the matching resolution.`); }

        let batchRows = [...card.querySelectorAll('.receive-batch-row')];
        if (accepted > 0 && batchRows.length === 0) {
            card.querySelector('.receive-batch-list')?.insertAdjacentHTML('beforeend', receiveBatchRow({ quantity: accepted, expiry_date: '', no_expiry: card.dataset.requiresExpiry !== '1' }, card.dataset.requiresExpiry === '1', true));
            batchRows = [...card.querySelectorAll('.receive-batch-row')];
        }
        const autoRow = batchRows.length === 1 && batchRows[0].dataset.autoAllocation === '1' ? batchRows[0] : null;
        if (autoRow && accepted === 0) {
            autoRow.remove();
            batchRows = [];
        } else if (autoRow) {
            autoRow.querySelector('.receive-batch-qty').value = String(accepted);
        }
        const batches = [];
        let allocated = 0;
        batchRows.forEach((row) => {
            const quantity = Number(row.querySelector('.receive-batch-qty')?.value || 0);
            const noExpiry = row.querySelector('.receive-batch-no-expiry')?.checked === true;
            const expiryDate = row.querySelector('.receive-batch-expiry')?.value || '';
            if (strict && (!Number.isInteger(quantity) || quantity <= 0)) itemErrors.push('Every batch needs a positive whole quantity.');
            if (strict && accepted > 0 && card.dataset.requiresExpiry === '1' && !expiryDate) itemErrors.push('An expiry date is required for every medicine batch.');
            allocated += Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
            batches.push({ batch_identifier: row.querySelector('.receive-batch-id')?.value.trim() || '', quantity, expiry_date: expiryDate, no_expiry: noExpiry });
        });

        const batchRowsValid = batches.every((batch) => Number.isInteger(batch.quantity) && batch.quantity > 0);
        const batchesComplete = batchRowsValid && allocated === accepted && (accepted === 0 || batches.length > 0);
        const expiryComplete = accepted === 0 || card.dataset.requiresExpiry !== '1' || (batches.length > 0 && batches.every((batch) => Boolean(batch.expiry_date)));
        const adjustmentComplete = resolution === 'keep_with_discount'
            ? Number.isFinite(itemAdjustment) && itemAdjustment > 0
            : Number.isFinite(itemAdjustment) && itemAdjustment === 0;
        const resolutionComplete = affected === 0 ? adjustmentComplete : (Boolean(issueType) && resolution !== 'none' && adjustmentComplete);
        const remarksComplete = affected === 0 || itemRemarks !== '';
        const returnRecorded = affected === 0 || resolutionComplete;
        const readyForInspection = quantitiesComplete && batchesComplete && expiryComplete && resolutionComplete && remarksComplete;

        if (strict && allocated > accepted) itemErrors.push(`Allocated inventory exceeds accepted inventory by ${allocated - accepted} unit${allocated - accepted === 1 ? '' : 's'}.`);
        if (strict && allocated < accepted) itemErrors.push(`${accepted - allocated} unit${accepted - allocated === 1 ? '' : 's'} remain to be allocated to inventory batches.`);
        if (strict && accepted > 0 && batches.length === 0) itemErrors.push('Add at least one accepted batch.');
        if (strict && accepted === 0 && allocated !== 0) itemErrors.push('No batch stock can be allocated when accepted quantity is zero.');
        if (inspected && !readyForInspection) {
            inspected = false;
            if (inspectionInput) inspectionInput.value = '0';
        }
        if (strict && !inspected) itemErrors.push(readyForInspection ? 'Complete this product inspection.' : 'Finish the required inspection checks.');

        state.supplierCredit += quantities.supplierCredit;
        state.replacementPending += quantities.replacementPending;
        state.acceptedGoodsValue += accepted * quantities.unitPrice;
        state.returnedGoodsValue += (returned + disposed) * quantities.unitPrice;
        if (resolution === 'keep_with_discount' && Number.isFinite(itemAdjustment)) state.supplierDiscount += Math.max(0, itemAdjustment);
        state.ordered += ordered;
        state.accepted += accepted;
        state.affected += affected;
        if (!inspected) state.remaining += 1;
        state.taskTotal += 6;
        state.taskCompleted += [quantitiesComplete, batchesComplete, expiryComplete, resolutionComplete, remarksComplete, inspected].filter(Boolean).length;
        state.checks.quantities = state.checks.quantities && quantitiesComplete;
        state.checks.damage = state.checks.damage && damageRecorded;
        state.checks.returns = state.checks.returns && returnRecorded;
        state.checks.batches = state.checks.batches && batchesComplete;
        state.checks.expiry = state.checks.expiry && expiryComplete;
        state.checks.resolution = state.checks.resolution && resolutionComplete;
        state.checks.remarks = state.checks.remarks && remarksComplete;
        state.checks.finalInspection = state.checks.finalInspection && inspected;
        state.applicable.expiry = state.applicable.expiry || (accepted > 0 && card.dataset.requiresExpiry === '1');
        state.applicable.resolution = state.applicable.resolution || affected > 0;
        state.applicable.remarks = state.applicable.remarks || affected > 0;
        state.errors.push(...itemErrors.map((error) => `Product ${cardIndex + 1}: ${error}`));
        state.items.push({ po_item_id: card.dataset.poItemId, delivered_quantity: delivered, received_quantity: delivered, damaged_quantity: damaged, returned_quantity: returned, disposed_quantity: disposed, issue_type: issueType, resolution, damage_action: resolution === 'return_for_credit' ? 'return' : (['keep_with_discount', 'keep_damaged'].includes(resolution) ? 'keep' : 'none'), supplier_adjustment: Number.isFinite(itemAdjustment) ? Math.max(0, itemAdjustment) : 0, batches, remarks: itemRemarks, inspection_complete: inspected, accepted_quantity: accepted, missing_quantity: missing });

        card.dataset.ready = readyForInspection ? '1' : '0';
        card.dataset.checkQuantities = quantitiesComplete ? '1' : '0';
        card.dataset.checkDamage = damageRecorded ? '1' : '0';
        card.dataset.checkReturns = returnRecorded ? '1' : '0';
        card.dataset.checkBatches = batchesComplete ? '1' : '0';
        card.dataset.checkExpiry = expiryComplete ? '1' : '0';
        card.dataset.checkResolution = resolutionComplete ? '1' : '0';
        card.dataset.checkRemarks = remarksComplete ? '1' : '0';
        card.dataset.checkFinalInspection = inspected ? '1' : '0';
        card.classList.toggle('has-error', delivered > ordered || damaged > delivered || (resolution !== 'keep_with_discount' && itemAdjustment > 0));
        card.querySelector('.receive-missing-qty').textContent = String(missing);
        card.querySelector('.receive-accepted-qty').textContent = String(accepted);
        card.querySelector('.receive-returned-qty').textContent = String(returned);
        card.querySelector('.receive-disposed-qty').textContent = String(disposed);
        card.querySelector('.receive-issue-panel').classList.toggle('d-none', affected <= 0);
        card.querySelector('.receive-item-adjustment-wrap').classList.toggle('d-none', resolution !== 'keep_with_discount');
        const allocationDifference = accepted - allocated;
        const allocationState = card.querySelector('.receive-allocation-state');
        const allocationBadge = card.querySelector('.receive-allocation-badge');
        const allocationReason = card.querySelector('.receive-allocation-reason');
        const allocationSummary = card.querySelector('.receive-allocation-summary');
        if (allocationState) allocationState.textContent = `Allocated ${allocated} / ${accepted}`;
        const allocationComplete = allocated === accepted && (accepted === 0 || batches.length > 0) && batchRowsValid;
        if (allocationBadge) allocationBadge.textContent = allocationComplete ? '✓ Complete' : '✕ Allocation error';
        if (allocationReason) allocationReason.textContent = allocationComplete ? 'Accepted inventory is fully allocated.' : (allocationDifference > 0 ? `${allocationDifference} unit${allocationDifference === 1 ? '' : 's'} remaining.` : `Over allocated by ${Math.abs(allocationDifference)} unit${Math.abs(allocationDifference) === 1 ? '' : 's'}.`);
        allocationSummary?.classList.toggle('is-complete', allocationComplete);
        allocationSummary?.classList.toggle('has-error', !allocationComplete);
        card.querySelector('.receive-header-ordered').textContent = String(ordered);
        card.querySelector('.receive-header-accepted').textContent = String(accepted);
        card.querySelector('.receive-header-damaged').textContent = String(damaged);
        card.querySelector('.receive-header-returned').textContent = String(returned);

        let status = 'Waiting';
        if (inspected) status = 'Inspection Complete';
        else if (!quantitiesComplete) status = 'Waiting for Quantity Verification';
        else if (!batchesComplete) status = 'Waiting for Batch Allocation';
        else if (!expiryComplete) status = 'Waiting for Expiry Date';
        else if (!resolutionComplete) status = 'Waiting for Issue Resolution';
        else if (!remarksComplete) status = 'Waiting for Remarks';
        else if (readyForInspection) status = 'Ready for Inspection';

        const badge = card.querySelector('.receive-inspection-badge');
        badge.textContent = status;
        badge.classList.toggle('complete', inspected);
        badge.classList.toggle('ready', readyForInspection && !inspected);
        badge.classList.toggle('issue', affected > 0 && !inspected && !readyForInspection);
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
        let readinessMessage = 'Complete the required inspection checks.';
        if (inspected) readinessMessage = 'Inspection completed. Reopen to make changes.';
        else if (!quantitiesComplete) readinessMessage = 'Complete quantity verification first.';
        else if (!batchesComplete) readinessMessage = allocated < accepted ? `Allocate ${accepted - allocated} remaining unit${accepted - allocated === 1 ? '' : 's'} to batches.` : `Remove ${allocated - accepted} over-allocated unit${allocated - accepted === 1 ? '' : 's'} from batches.`;
        else if (!expiryComplete) readinessMessage = 'Enter the required expiry date first.';
        else if (!resolutionComplete) readinessMessage = 'Complete issue type and resolution first.';
        else if (!remarksComplete) readinessMessage = 'Enter the required item remarks first.';
        else if (readyForInspection) readinessMessage = 'Ready to complete.';
        if (readinessText) readinessText.textContent = readinessMessage;
        setReceiveCardLocked(card, inspected);
    });

    state.finalAmount = state.originalTotal - state.supplierCredit - state.replacementPending - state.supplierDiscount;
    const paymentStatus = document.getElementById('receivePaymentStatus')?.value || 'Unpaid';
    const enteredAmountPaid = Number(document.getElementById('receiveAmountPaid')?.value || 0);
    state.paymentStatus = paymentStatus;
    state.amountPaid = paymentStatus === 'Fully Paid' ? Math.max(0, state.finalAmount) : (paymentStatus === 'Unpaid' ? 0 : enteredAmountPaid);
    state.remainingBalance = Math.max(0, state.finalAmount - (Number.isFinite(state.amountPaid) ? state.amountPaid : 0));
    if (!['Unpaid', 'Partially Paid', 'Fully Paid'].includes(paymentStatus)) state.errors.push('Select a valid payment status.');
    if (paymentStatus === 'Partially Paid' && (!Number.isFinite(enteredAmountPaid) || enteredAmountPaid <= 0 || enteredAmountPaid >= state.finalAmount)) state.errors.push('Amount paid must be greater than zero and less than the final amount payable for a partially paid order.');
    if (state.finalAmount < 0) { state.errors.push('Payment adjustments exceed the original PO total.'); state.hardErrors.push('Payment adjustments exceed the original PO total.'); }
    state.errors = [...new Set(state.errors)];
    state.hardErrors = [...new Set(state.hardErrors)];
    state.valid = state.errors.length === 0;
    return state;
}

function receivePaymentSummary() { return receiveFormState(true); }

function renderReceivePaymentSummary() {
    const summary = receiveFormState(true);
    const original = document.getElementById('receiveOriginalTotal');
    const deduction = document.getElementById('receiveDamageDeduction');
    const acceptedValue = document.getElementById('receiveAcceptedGoodsValue');
    const returnedValue = document.getElementById('receiveReturnedGoodsValue');
    const finalAmount = document.getElementById('receiveFinalAmount');
    if (original) original.textContent = peso(summary.originalTotal);
    if (deduction) deduction.textContent = summary.supplierCredit > 0 ? `-${peso(summary.supplierCredit)}` : peso(0);
    if (acceptedValue) acceptedValue.textContent = peso(summary.acceptedGoodsValue);
    if (returnedValue) returnedValue.textContent = peso(summary.returnedGoodsValue);
    if (finalAmount) finalAmount.textContent = peso(summary.finalAmount);
    const paymentStatus = document.getElementById('receivePaymentStatus')?.value || 'Unpaid';
    document.getElementById('receiveAmountPaidWrap')?.classList.toggle('d-none', paymentStatus !== 'Partially Paid');
    const amountPaid = document.getElementById('receiveAmountPaid');
    if (amountPaid && paymentStatus === 'Fully Paid') amountPaid.value = summary.finalAmount.toFixed(2);
    if (amountPaid && paymentStatus === 'Unpaid') amountPaid.value = '0';
    const remainingBalance = document.getElementById('receiveRemainingBalance');
    if (remainingBalance) remainingBalance.textContent = peso(summary.remainingBalance);
    document.getElementById('receiveMetricProducts').textContent = String(summary.items.length);
    document.getElementById('receiveMetricOrdered').textContent = String(summary.ordered);
    document.getElementById('receiveMetricAccepted').textContent = String(summary.accepted);
    document.getElementById('receiveMetricAffected').textContent = String(summary.affected);
    document.getElementById('receiveMetricRemaining').textContent = String(summary.remaining);
    const percent = summary.taskTotal ? Math.round((summary.taskCompleted / summary.taskTotal) * 100) : 0;
    const progressText = document.getElementById('receiveProgressText');
    if (progressText) progressText.textContent = `${summary.taskCompleted} of ${summary.taskTotal} inspection checks complete · ${percent}%`;
    const progressBar = document.getElementById('receiveProgressBar');
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
        progressBar.closest('.progress')?.setAttribute('aria-valuenow', String(percent));
    }
    const checklist = document.getElementById('receiveChecklistItems');
    if (checklist) {
        const checklistItems = [
            ['quantities', 'Quantities', 'Verify delivered, accepted, damaged, returned, and missing quantities.'],
            ['damage', 'Damage', 'Record the damaged quantity.'],
            ['returns', 'Returns', 'Complete the return decision when an issue exists.'],
            ['batches', 'Batches', 'Allocate accepted units exactly across batches.'],
            ['expiry', 'Expiry', 'Enter every required batch expiry date.'],
            ['resolution', 'Resolution', 'Select the issue type and resolution.'],
            ['remarks', 'Remarks', 'Enter the required receiving remarks.'],
            ['finalInspection', 'Finalize', 'Complete the final product inspection.']
        ];
        const currentIndex = checklistItems.findIndex(([key]) => summary.applicable[key] !== false && !summary.checks[key]);
        checklist.innerHTML = checklistItems.map(([key, label, help], index) => {
            const applicable = summary.applicable[key] !== false;
            const complete = summary.checks[key];
            const current = index === currentIndex;
            const itemClass = !applicable ? 'check-na' : (complete ? 'check-complete' : `check-warning${current ? ' check-current' : ''}`);
            const icon = !applicable ? 'fa-minus' : (complete ? 'fa-check' : 'fa-triangle-exclamation');
            const stateText = !applicable ? 'Not applicable' : (complete ? 'Complete' : (current ? 'Current required step' : 'Incomplete'));
            return `<li class="${itemClass}"><button class="receive-check-step" type="button" data-check-key="${key}" title="${escapeHtml(`${help} ${stateText}.`)}" aria-label="${escapeHtml(`${label}: ${stateText}`)}"><span class="receive-check-node"><i class="fa-solid ${icon}"></i></span><span class="receive-check-label">${escapeHtml(label)}</span></button></li>`;
        }).join('');
    }
    const validation = document.getElementById('receiveValidationSummary');
    validation.classList.toggle('d-none', summary.errors.length === 0);
    validation.innerHTML = summary.errors.length ? `<strong>Cannot confirm receiving</strong><ul>${summary.errors.slice(0, 6).map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>` : '';
    const confirmButton = document.getElementById('btnConfirmReceivePo');
    if (confirmButton) confirmButton.disabled = !summary.valid || receiveSubmitting;
    const footer = document.getElementById('receiveFooterStatus');
    if (footer) footer.textContent = summary.valid ? 'Ready to confirm receiving.' : `Cannot confirm because ${String(summary.errors[0] || 'required receiving checks are incomplete').replace(/^Product \d+: /, '').replace(/\.$/, '').toLowerCase()}.`;
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
        navItem.classList.toggle('has-issue', issue && !complete);
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
    const keys = ['Quantities', 'Damage', 'Returns', 'Batches', 'Expiry', 'Resolution', 'Remarks', 'FinalInspection'];
    const complete = keys.filter((key) => card.dataset[`check${key}`] === '1').length;
    target.textContent = `Current product: ${complete} of 8 checks`;
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
            focusTarget = card.querySelector('.damaged-qty-input');
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
        activeReceiveOrder = await getPurchaseOrder(poId);
        if (activeReceiveOrder.status !== 'Arrived') throw new Error('This purchase order is no longer available for active inspection.');
        document.getElementById('receivePoNumber').textContent = activeReceiveOrder.po_number || '-';
        document.getElementById('receiveSupplierName').textContent = activeReceiveOrder.supplier_name || '-';
        document.getElementById('receiveArrivalDate').textContent = formatDate(activeReceiveOrder.received_date || activeReceiveOrder.expected_delivery_date || activeReceiveOrder.order_date);
        document.getElementById('receiveProductCount').textContent = String(activeReceiveOrder.items?.length || 0);
        document.getElementById('receiveHeaderOrderedQty').textContent = String((activeReceiveOrder.items || []).reduce((sum, item) => sum + Number(item.inventory_qty_ordered || item.quantity || 0), 0));
        document.getElementById('receivePoRemarks').value = activeReceiveOrder.inspection_draft?.remarks || '';
        document.getElementById('inspectionBreadcrumbPo').textContent = activeReceiveOrder.po_number || 'Purchase Order';
        document.getElementById('inspectionWorkspaceTitle').textContent = `Inspect ${activeReceiveOrder.po_number || 'Delivery'}`;
        const additionalAmount = document.getElementById('receiveAdditionalAmount');
        if (additionalAmount) additionalAmount.value = activeReceiveOrder.inspection_draft?.supplier_discount || '0';
        const paymentStatus = document.getElementById('receivePaymentStatus');
        if (paymentStatus) paymentStatus.value = activeReceiveOrder.inspection_draft?.payment_status || activeReceiveOrder.payment_status || 'Unpaid';
        const amountPaid = document.getElementById('receiveAmountPaid');
        if (amountPaid) amountPaid.value = activeReceiveOrder.inspection_draft?.amount_paid || '0';
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
        supplier_discount: Number(document.getElementById('receiveAdditionalAmount')?.value || 0),
        additional_amount: Number(document.getElementById('receiveAdditionalAmount')?.value || 0),
        items: summary.items
    };
}

function receiveReceiptRows(payload) {
    return payload.items.map((payloadItem) => {
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(payloadItem.po_item_id)) || {};
        const receivedQty = Number(payloadItem.received_quantity || 0);
        const damagedQty = Number(payloadItem.damaged_quantity || 0);
        const goodQty = Math.max(0, receivedQty - damagedQty);
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

let currentReceiptReport = null;

function receiptReportFromReceiving(details) {
    return {
        pharmacyName: details.pharmacy?.name || 'Pharmacy',
        pharmacyAddress: details.pharmacy?.address || 'Address not configured',
        contact: details.pharmacy?.contact_number || 'Contact number not configured',
        grnNo: details.grn_number,
        poNo: details.po_number,
        supplier: details.supplier_name,
        receivedBy: details.received_by || 'System',
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
            product: item.product_name,
            brand: item.brand_name,
            specification: [item.generic_or_variant, item.strength, item.size_value, item.unit, item.packaging].filter(Boolean).join(' · '),
            orderedQty: Number(item.ordered_quantity || 0),
            receivedQty: Number(item.delivered_quantity || 0),
            acceptedQty: Number(item.accepted_quantity || 0),
            goodQty: Number(item.accepted_quantity || 0),
            damagedQty: Number(item.damaged_quantity || 0),
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

function receiptItemName(item) {
    const product = String(item.product || '').trim();
    const brand = String(item.brand || '').trim();
    const specification = String(item.specification || '').trim();
    const base = !brand || product.toLowerCase().includes(brand.toLowerCase())
        ? (product || brand || 'Item')
        : `${brand} ${product}`.trim();
    return [base, specification].filter(Boolean).join(' ');
}

function receiptTotals(report) {
    return {
        ordered: report.items.reduce((sum, item) => sum + item.orderedQty, 0),
        accepted: report.items.reduce((sum, item) => sum + Number(item.acceptedQty ?? item.goodQty ?? 0), 0),
        damaged: report.items.reduce((sum, item) => sum + item.damagedQty, 0),
        inventoryAdded: report.items.reduce((sum, item) => sum + Number(item.inventoryAdded ?? item.goodQty ?? 0), 0)
    };
}

function receiptResolutionLines(item) {
    if (item.resolution === 'return_for_replacement') return `&nbsp;&nbsp;Returned for Replacement: ${item.returnedQty}<br>&nbsp;&nbsp;Replacement Pending: ${item.replacementPendingQty}<br>`;
    if (item.resolution === 'return_for_credit') return `&nbsp;&nbsp;Returned for Credit: ${item.returnedQty}<br>`;
    if (item.resolution === 'reject_without_replacement') return `&nbsp;&nbsp;Rejected: ${item.damagedQty}<br>`;
    if (['keep_damaged', 'keep_with_discount'].includes(item.resolution)) return `&nbsp;&nbsp;Kept and Accepted: ${item.damagedQty}<br>`;
    return '';
}

function receiptDetailHtml(report) {
    return `
        <div class="receipt full-report">
            <div class="center"><strong>${escapeHtml(report.pharmacyName)}</strong></div>
            <div class="title">FULL RECEIVING REPORT</div>
            <div class="dash"></div>
            ${report.items.map((item, index) => `
                <div class="item">
                    <strong>${index + 1}. ${escapeHtml(receiptItemName(item))}</strong><br>
                    &nbsp;&nbsp;Ordered: ${item.orderedQty} ${escapeHtml(item.unitLabel)}<br>
                    &nbsp;&nbsp;Received: ${item.receivedQty}<br>
                    &nbsp;&nbsp;Accepted into Inventory: ${item.acceptedQty ?? item.goodQty}<br>
                    &nbsp;&nbsp;Damaged: ${item.damagedQty}<br>
                    &nbsp;&nbsp;Returned: ${item.returnedQty || 0}<br>
                    &nbsp;&nbsp;Missing: ${item.missingQty || 0}<br>
                    ${receiptResolutionLines(item)}
                    &nbsp;&nbsp;Resolution: ${escapeHtml(item.resolutionLabel || item.damageAction || 'No issue')}<br>
                    &nbsp;&nbsp;Inventory Added: ${item.inventoryAdded ?? item.goodQty}<br>
                    &nbsp;&nbsp;Unit Cost: ${peso(item.unitCost)}<br>
                    &nbsp;&nbsp;Batch / Expiry: ${escapeHtml((item.batches || []).map((batch) => `${batch.batch_identifier} (${batch.batch_quantity}) · ${batch.expiry_date ? formatDate(batch.expiry_date) : 'No expiry'}`).join('; ') || item.expiryDate)}<br>
                    &nbsp;&nbsp;Remarks: ${escapeHtml(item.remarks || 'None')}
                </div>
                <div class="dash"></div>
            `).join('')}
            </aside>
        </div>
    `;
}

function receiptHtml(report) {
    const totals = receiptTotals(report);
    return `
        <div class="receipt">
            <div class="center receipt-head"><strong>${escapeHtml(report.pharmacyName)}</strong><br>${escapeHtml(report.pharmacyAddress)}<br>${escapeHtml(report.contact)}</div>
            <div class="title">GOODS RECEIVED NOTE</div>
            <div class="line"><span>PO No:</span><span>${escapeHtml(report.poNo)}</span></div>
            <div class="line"><span>GRN No:</span><span>${escapeHtml(report.grnNo)}</span></div>
            <div class="line"><span>Supplier:</span><span>${escapeHtml(report.supplier)}</span></div>
            <div class="line"><span>Received:</span><span>${escapeHtml(receiptDisplayDate(report.receivedDate))}</span></div>
            <div class="line"><span>Received By:</span><span>${escapeHtml(report.receivedBy)}</span></div>
            <div class="line"><span>Status:</span><span>${escapeHtml(report.status)}</span></div>
            <div class="dash"></div>
            <div class="title">ITEMS</div>
            ${report.items.map((item, index) => `
                <div class="item">
                    <strong>${index + 1}. ${escapeHtml(receiptItemName(item))}</strong><br>
                    &nbsp;&nbsp;${item.orderedQty} ${escapeHtml(item.unitLabel)} x ${peso(item.unitCost)}<br>
                    &nbsp;&nbsp;Delivered: ${item.receivedQty}<br>
                    &nbsp;&nbsp;Accepted into Inventory: ${item.acceptedQty ?? item.goodQty}<br>
                    &nbsp;&nbsp;Damaged: ${item.damagedQty}<br>
                    ${receiptResolutionLines(item)}
                    &nbsp;&nbsp;Resolution: ${escapeHtml(item.resolutionLabel || item.damageAction || 'No issue')}<br>
                    &nbsp;&nbsp;Inventory Added: ${item.inventoryAdded ?? item.goodQty}
                </div>
                <div class="dash"></div>
            `).join('')}
            <div class="title">SUMMARY</div>
            <div class="line"><span>Items Ordered</span><span>${totals.ordered}</span></div>
            <div class="line"><span>Items Accepted</span><span>${totals.accepted}</span></div>
            <div class="line"><span>Damaged</span><span>${totals.damaged}</span></div>
            <div class="line"><span>Inventory Added</span><span>${totals.inventoryAdded}</span></div>
            <br>
            <div class="line"><span>Original PO Total:</span><span>${peso(report.originalTotal || 0)}</span></div>
            <div class="line"><span>Returned / Rejected Value:</span><span>${peso(report.returnedRejectedValue || 0)}</span></div>
            <div class="line"><span>Supplier Credit:</span><span>-${peso(report.supplierCredit)}</span></div>
            <div class="line"><span>Supplier Discount:</span><span>-${peso(report.supplierDiscount)}</span></div>
            <div class="line"><span>Total Paid:</span><span>${peso(report.totalPaid || 0)}</span></div>
            <div class="line"><span>Remaining Balance:</span><span>${peso(report.remainingBalance || 0)}</span></div>
            <div class="line"><span>Payment Status:</span><span>${escapeHtml(report.paymentStatus || 'Unpaid')}</span></div>
            <div class="final center">ADJUSTED PAYABLE<br><strong>${peso(report.adjustedPayable ?? report.finalPayment)}</strong></div>
            <div class="dash"></div>
            <strong>Remarks:</strong><br>${escapeHtml(report.remarks || 'None')}
            <div class="signature">Received By:</div>
            <div class="sign-line"></div>
            <div class="signature">Checked By:</div>
            <div class="sign-line"></div>
            <div class="dash"></div>
            <div class="center">Thank you.</div>
        </div>
    `;
}

function downloadReceiptPdf(report = currentReceiptReport) {
    if (!report) return;
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) return;
    const height = Math.max(220, 145 + (report.items.length * 40));
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, height] });
    const margin = 5;
    let y = 7;
    const add = (text, options = {}) => {
        doc.setFont('courier', options.bold ? 'bold' : 'normal');
        doc.setFontSize(options.size || 9);
        const lines = doc.splitTextToSize(String(text ?? ''), 70);
        doc.text(lines, options.center ? 40 : margin, y, { align: options.center ? 'center' : 'left' });
        y += lines.length * ((options.size || 9) * 0.42) + (options.gap ?? 1.5);
    };
    const dash = () => { doc.line(margin, y, 75, y); y += 3.5; };
    const pair = (label, value, options = {}) => {
        doc.setFont('courier', options.bold ? 'bold' : 'normal');
        doc.setFontSize(options.size || 9);
        doc.text(String(label), margin, y);
        doc.text(String(value), 75, y, { align: 'right' });
        y += options.gap ?? 4;
    };
    const totals = receiptTotals(report);
    add(report.pharmacyName, { center: true, bold: true, size: 12 });
    add(report.pharmacyAddress, { center: true, size: 8 });
    add(report.contact, { center: true, size: 8, gap: 3 });
    add('GOODS RECEIVED NOTE', { center: true, bold: true, size: 10, gap: 3 });
    add(`PO No: ${report.poNo}`);
    add(`GRN No: ${report.grnNo}`);
    add(`Supplier: ${report.supplier}`);
    add(`Received: ${receiptDisplayDate(report.receivedDate)}`);
    add(`Received By: ${report.receivedBy}`);
    add(`Status: ${report.status}`);
    dash();
    add('ITEMS', { center: true, bold: true, size: 10 });
    report.items.forEach((item, index) => {
        add(`${index + 1}. ${receiptItemName(item)}`, { bold: true });
        add(`   ${item.orderedQty} ${item.unitLabel} x ${peso(item.unitCost)}`);
        add(`   Delivered: ${item.receivedQty}`);
        add(`   Accepted into Inventory: ${item.acceptedQty ?? item.goodQty}`);
        add(`   Damaged: ${item.damagedQty}`);
        if (item.returnedQty) add(`   Returned: ${item.returnedQty}`);
        if (item.missingQty) add(`   Missing: ${item.missingQty}`);
        if (item.replacementPendingQty) add(`   Replacement Pending: ${item.replacementPendingQty}`);
        add(`   Resolution: ${item.resolutionLabel || item.damageAction || 'No issue'}`);
        add(`   Inventory Added: ${item.inventoryAdded ?? item.goodQty}`, { gap: 3 });
        dash();
    });
    add('SUMMARY', { center: true, bold: true, size: 10 });
    pair('Items Ordered', totals.ordered);
    pair('Items Accepted', totals.accepted);
    pair('Damaged', totals.damaged);
    pair('Inventory Added', totals.inventoryAdded);
    y += 2;
    pair('Original PO Total', peso(report.originalTotal || 0));
    pair('Returned / Rejected', peso(report.returnedRejectedValue || 0));
    pair('Supplier Credit', `-${peso(report.supplierCredit)}`);
    pair('Supplier Discount', `-${peso(report.supplierDiscount)}`);
    pair('Total Paid', peso(report.totalPaid || 0));
    pair('Remaining Balance', peso(report.remainingBalance || 0));
    pair('Payment Status', report.paymentStatus || 'Unpaid', { gap: 6 });
    add('ADJUSTED PAYABLE', { center: true, bold: true, size: 11, gap: 1 });
    add(peso(report.adjustedPayable ?? report.finalPayment), { center: true, bold: true, size: 14, gap: 4 });
    dash();
    add('Remarks:', { bold: true });
    add(report.remarks || 'None', { gap: 5 });
    add('Received By:', { gap: 7 });
    dash();
    add('Checked By:', { gap: 7 });
    dash();
    add('Thank you.', { center: true });
    doc.save(`${report.grnNo}.pdf`);
}

window.__drpDownloadPoReceiptPdf = () => downloadReceiptPdf();

function openReceiptPreview(report) {
    currentReceiptReport = report;
    const receiptWindow = window.open('', '_blank', 'width=420,height=720');
    if (!receiptWindow) return;
    receiptWindow.document.write(`
        <!doctype html>
        <html>
        <head>
            <title>Goods Received Note</title>
            <style>
                body { margin: 0; color: #000; background: #f3f4f6; font-family: "Courier New", monospace; }
                .actions { display: flex; gap: 8px; justify-content: center; padding: 14px; }
                button { padding: 8px 12px; border: 1px solid #000; background: #fff; color:#000; cursor: pointer; }
                .receipt { width: 80mm; margin: 0 auto 24px; padding: 10px 12px; background: #fff; box-sizing: border-box; font-size: 12px; line-height: 1.35; overflow-wrap: break-word; word-break: normal; hyphens: none; }
                .center { text-align: center; }
                .receipt-head strong { font-size: 14px; }
                .title { margin: 10px 0 8px; text-align: center; font-weight: 800; }
                .line { display: flex; justify-content: space-between; gap: 8px; }
                .line span:last-child { text-align: right; overflow-wrap: break-word; word-break: normal; hyphens: none; }
                .dash { margin: 9px 0; border-top: 1px dashed #000; }
                .item { margin-top: 7px; overflow-wrap: break-word; word-break: normal; hyphens: none; }
                .final { margin-top: 10px; font-weight: 900; font-size: 13px; }
                .final strong { display: block; margin-top: 3px; font-size: 18px; }
                .signature { margin-top: 16px; }
                .sign-line { margin-top: 14px; border-top: 1px solid #000; }
                .full-report { display: none; }
                body.show-full .receipt-summary { display: none; }
                body.show-full .full-report { display: block; }
                @media print { body { background: #fff; } .actions { display: none; } .receipt { margin: 0; width: 80mm; } }
            </style>
        </head>
        <body>
            <div class="actions">
                <button onclick="window.opener.__drpDownloadPoReceiptPdf && window.opener.__drpDownloadPoReceiptPdf()">Print / Download PDF</button>
                <button onclick="document.body.classList.toggle('show-full')">Full Report</button>
                <button onclick="window.close()">Close</button>
            </div>
            <div class="receipt-summary">${receiptHtml(report)}</div>
            ${receiptDetailHtml(report)}
        </body>
        </html>
    `);
    receiptWindow.document.close();
}

async function submitReceivePurchaseOrder() {
    if (receiveSubmitting) return;
    try {
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
let supplierPaymentSubmitting = false;
let supplierPaymentSubmissionKey = '';
let supplierPaymentPendingState = null;
let supplierPaymentReturnFocus = null;
let supplierPaymentResultContext = null;

function receivingResolutionLabel(resolution = 'none') {
    return ({
        none: 'No issue',
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
    document.body.insertAdjacentHTML('beforeend', `
        <div class="receiving-ui-backdrop" id="receivingUiBackdrop"></div>
        <aside class="receiving-drawer" id="receivingDetailsDrawer" aria-hidden="true" aria-labelledby="receivingDetailsTitle">
            <header class="receiving-drawer-header"><div class="receiving-drawer-title"><h2 id="receivingDetailsTitle">Receiving Details</h2><p id="receivingDetailsSubtitle">Posted receiving record</p></div><button class="receiving-drawer-close" type="button" data-close-receiving-ui aria-label="Close receiving details"><i class="fa-solid fa-xmark"></i></button></header>
            <div class="receiving-drawer-body" id="receivingDetailsBody"><div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading receiving details...</div></div>
            <footer class="receiving-drawer-footer"><button class="btn btn-light border" type="button" data-close-receiving-ui>Close</button><button class="btn btn-outline-primary" id="btnDrawerPrintGrn" type="button"><i class="fa-solid fa-print me-1"></i>Print GRN</button><button class="btn btn-purple" id="btnDrawerManagePayment" type="button"><i class="fa-solid fa-wallet me-1"></i>Manage Payment</button></footer>
        </aside>
        <aside class="receiving-drawer" id="supplierPaymentDrawer" aria-hidden="true" aria-labelledby="supplierPaymentTitle">
            <header class="receiving-drawer-header"><div class="receiving-drawer-title"><h2 id="supplierPaymentTitle">Supplier Payment</h2><p id="supplierPaymentSubtitle">Purchase order payment</p></div><button class="receiving-drawer-close" type="button" data-close-receiving-ui aria-label="Close supplier payment"><i class="fa-solid fa-xmark"></i></button></header>
            <div class="receiving-drawer-body" id="supplierPaymentBody"><div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading payment details...</div></div>
            <footer class="receiving-drawer-footer"><button class="btn btn-light border" type="button" data-close-receiving-ui>Close</button><button class="btn btn-purple" id="btnSaveSupplierPayment" type="button"><i class="fa-solid fa-money-check-dollar me-1"></i>Record Payment</button></footer>
        </aside>
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
        if (document.querySelector('.supplier-payment-dialog.is-open')) return;
        closeReceivingUi();
    });
    document.getElementById('btnDrawerPrintGrn')?.addEventListener('click', () => activeReceivingDetails && openReceiptPreview(receiptReportFromReceiving(activeReceivingDetails)));
    document.getElementById('btnDrawerManagePayment')?.addEventListener('click', () => activeReceivingDetails && openSupplierPayment(activeReceivingDetails.po_id));
    document.getElementById('btnSaveSupplierPayment')?.addEventListener('click', submitSupplierPayment);
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
    document.getElementById('receivingUiBackdrop')?.classList.remove('is-open');
    document.body.style.overflow = '';
}

function showReceivingDrawer(drawerId) {
    ensureReceivingUi();
    document.querySelectorAll('.supplier-payment-dialog').forEach((dialog) => { dialog.classList.remove('is-open'); dialog.setAttribute('aria-hidden', 'true'); dialog.setAttribute('inert', ''); });
    document.querySelectorAll('.receiving-drawer').forEach((drawer) => { const active = drawer.id === drawerId; drawer.classList.toggle('is-open', active); drawer.setAttribute('aria-hidden', active ? 'false' : 'true'); drawer.toggleAttribute('inert', !active); });
    document.getElementById('receivingUiBackdrop')?.classList.add('is-open');
    document.body.style.overflow = 'hidden';
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
            <article class="receiving-item-detail"><div class="receiving-item-head"><strong>${index + 1}. ${escapeHtml(receivingItemDisplayName(item))}</strong><span class="receiving-result-badge">${escapeHtml(receivingResolutionLabel(item.resolution))}</span></div>
                <div class="receiving-qty-grid">
                    ${[['Ordered',item.ordered_quantity],['Delivered',item.delivered_quantity],['Accepted',item.accepted_quantity],['Damaged',item.damaged_quantity],['Returned',item.returned_quantity],['Missing',item.missing_quantity],['Replacement Pending',item.replacement_pending_quantity],['Inventory Added',item.inventory_added]].map(([label,value]) => `<div class="receiving-qty"><span>${label}</span><b>${Number(value || 0)}</b></div>`).join('')}
                </div>
                ${item.resolution !== 'none' ? `<div class="receiving-issue-copy"><strong>${escapeHtml(item.issue_type || 'Issue')}</strong> · ${escapeHtml(receivingResolutionLabel(item.resolution))}${item.return_status ? ` · ${escapeHtml(item.return_status)}` : ''}<br>${escapeHtml(item.item_remarks || 'No item remarks.')}</div>` : ''}
            </article>`).join('')}
        <div class="receiving-section-title"><i class="fa-solid fa-boxes-stacked"></i>Batch and Expiry Allocation</div>
        ${items.map((item, index) => `<article class="receiving-item-detail"><div class="receiving-item-head"><strong>${index + 1}. ${escapeHtml(receivingItemDisplayName(item))}</strong><span>${Number(item.inventory_added || 0)} added</span></div><table class="receiving-batch-table"><thead><tr><th>Batch Identifier</th><th>Batch Qty</th><th>Inventory Qty</th><th>Damaged</th><th>Returned</th><th>Expiry</th></tr></thead><tbody>${(item.batches || []).length ? item.batches.map((batch) => `<tr><td>${escapeHtml(batch.batch_identifier)}</td><td>${batch.batch_quantity}</td><td>${batch.inventory_quantity}</td><td>${batch.damaged_qty}</td><td>${batch.returned_qty}</td><td>${escapeHtml(batch.expiry_date ? formatDate(batch.expiry_date) : 'No expiry')}</td></tr>`).join('') : '<tr><td colspan="6">No inventory batch was posted.</td></tr>'}</tbody></table></article>`).join('')}
        <div class="receiving-section-title"><i class="fa-solid fa-file-invoice-dollar"></i>Financial Summary</div>
        <div class="receiving-financial-card">
            <div class="receiving-money-line"><span>Original PO Total</span><strong>${peso(details.total_amount)}</strong></div>
            <div class="receiving-money-line"><span>Returned or Rejected Value</span><strong>${peso(details.totals?.returned_rejected_value || 0)}</strong></div>
            ${supplierCredit > 0 || supplierDiscount > 0 ? `<details class="payment-adjustments"><summary>Adjustment breakdown</summary>${supplierCredit > 0 ? `<div class="receiving-money-line"><span>Supplier Credit</span><strong>-${peso(supplierCredit)}</strong></div>` : ''}${supplierDiscount > 0 ? `<div class="receiving-money-line"><span>Supplier Discount</span><strong>-${peso(supplierDiscount)}</strong></div>` : ''}</details>` : ''}
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
            const canManage = details.payment?.payment_status !== 'Fully Paid' && Number(details.payment?.remaining_balance || 0) > 0;
            manage.classList.toggle('d-none', !canManage);
            manage.innerHTML = '<i class="fa-solid fa-wallet me-1"></i>Manage Payment';
        }
    } catch (error) {
        if (body) body.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
    }
}

function renderSupplierPayment(details) {
    const payment = details.payment || {};
    const fullyPaid = payment.payment_status === 'Fully Paid' || Number(payment.remaining_balance || 0) <= 0;
    const remainingBalance = Math.max(Number(payment.adjusted_payable || 0) - Number(payment.total_paid || 0), 0);
    const supplierCredit = Number(details.totals?.supplier_credit || 0);
    const supplierDiscount = Number(details.totals?.supplier_discount || 0);
    return `
        <div class="receiving-section-title"><i class="fa-solid fa-chart-pie"></i>Payment Summary</div>
        <div class="receiving-financial-card">
            <div class="receiving-money-line"><span>Original PO Total</span><strong>${peso(details.total_amount)}</strong></div>
            <div class="receiving-money-line"><span>Returned or Rejected Value</span><strong>${peso(details.totals?.returned_rejected_value || 0)}</strong></div>
            ${supplierCredit > 0 || supplierDiscount > 0 ? `<details class="payment-adjustments"><summary>Adjustment breakdown</summary>${supplierCredit > 0 ? `<div class="receiving-money-line"><span>Supplier Credit</span><strong>-${peso(supplierCredit)}</strong></div>` : ''}${supplierDiscount > 0 ? `<div class="receiving-money-line"><span>Supplier Discount</span><strong>-${peso(supplierDiscount)}</strong></div>` : ''}</details>` : ''}
            <div class="receiving-money-line"><span>Adjusted Payable</span><strong>${peso(payment.adjusted_payable)}</strong></div>
            <div class="receiving-money-line"><span>Previously Paid</span><strong>${peso(payment.total_paid)}</strong></div>
            <div class="receiving-money-line emphasis"><span>Remaining Balance</span><strong>${peso(remainingBalance)}</strong></div>
            <div class="payment-summary-status"><span>Payment Status</span>${paymentStatusBadge(payment.payment_status)}</div>
        </div>
        ${fullyPaid ? '<div class="alert alert-success mt-3 mb-0"><i class="fa-solid fa-circle-check me-2"></i>This purchase order is fully paid. Additional payments are not allowed.</div>' : `
        <div class="receiving-section-title"><i class="fa-solid fa-money-check-dollar"></i>Record Supplier Payment</div>
        <form class="supplier-payment-form" id="supplierPaymentForm" novalidate>
            <div class="form-field"><div class="payment-amount-heading"><label for="supplierPaymentAmount">Payment Amount</label><button class="payment-full-balance" id="btnPayFullBalance" type="button">Pay Full Balance</button></div><div class="payment-amount-control"><span class="payment-currency-prefix">₱</span><input id="supplierPaymentAmount" type="number" min="0.01" step="0.01" max="${remainingBalance}" value="${remainingBalance.toFixed(2)}" inputmode="decimal" autocomplete="off" aria-describedby="supplierPaymentValidation"></div><div class="payment-live-balance"><span>Balance After Payment</span><strong id="supplierPaymentBalanceAfter">${peso(0)}</strong></div><div class="payment-validation" id="supplierPaymentValidation" aria-live="polite"></div></div>
            <div class="form-field"><label for="supplierPaymentMethod">Payment Method</label><select id="supplierPaymentMethod"><option value="">Select method...</option><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="check">Check</option><option value="gcash">E-wallet</option><option value="other">Other</option></select></div>
            <div class="form-field"><label for="supplierPaymentDate">Payment Date</label><input id="supplierPaymentDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
            <div class="form-field"><label id="supplierPaymentReferenceLabel" for="supplierPaymentReference">Reference Number</label><input id="supplierPaymentReference" maxlength="100" placeholder="Optional payment reference"></div>
            <div class="form-field full"><label for="supplierPaymentRemarks">Payment Remarks</label><textarea id="supplierPaymentRemarks" placeholder="Optional payment notes"></textarea></div>
        </form>`}
        <div class="receiving-section-title"><i class="fa-solid fa-clock-rotate-left"></i>Payment History</div><p class="receiving-section-kicker">Posted supplier payments are read-only.</p>${renderPaymentHistory(payment.payments || [])}`;
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

function captureSupplierPaymentState() {
    const payment = activeReceivingDetails?.payment || {};
    const amount = Number(document.getElementById('supplierPaymentAmount')?.value || 0);
    const remainingBalance = Number(payment.remaining_balance || 0);
    return {
        poId: activeReceivingDetails?.po_id || '',
        poNumber: activeReceivingDetails?.po_number || '',
        supplier: activeReceivingDetails?.supplier_name || '',
        amount: Math.round(amount * 100) / 100,
        amountInput: document.getElementById('supplierPaymentAmount')?.value || '',
        paymentMethod: document.getElementById('supplierPaymentMethod')?.value || '',
        paymentDate: document.getElementById('supplierPaymentDate')?.value || '',
        referenceNumber: document.getElementById('supplierPaymentReference')?.value || '',
        remarks: document.getElementById('supplierPaymentRemarks')?.value || '',
        adjustedPayable: Number(payment.adjusted_payable || 0),
        previouslyPaid: Number(payment.total_paid || 0),
        remainingBalance,
        balanceAfter: Math.max(0, Math.round((remainingBalance - amount) * 100) / 100),
        resultingStatus: amount >= remainingBalance - 0.005 ? 'Fully Paid' : 'Partially Paid',
        idempotencyKey: supplierPaymentSubmissionKey
    };
}

function restoreSupplierPaymentState(state) {
    if (!state) return;
    const values = {
        supplierPaymentAmount: state.amountInput,
        supplierPaymentMethod: state.paymentMethod,
        supplierPaymentDate: state.paymentDate,
        supplierPaymentReference: state.referenceNumber,
        supplierPaymentRemarks: state.remarks
    };
    Object.entries(values).forEach(([id, value]) => { const control = document.getElementById(id); if (control) control.value = value ?? ''; });
    supplierPaymentSubmissionKey = state.idempotencyKey;
    updateSupplierPaymentReferenceUi();
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
    if (message) message.textContent = state.resultingStatus === 'Fully Paid'
        ? 'This payment will settle the remaining balance and mark this purchase order as Fully Paid.'
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
        await openReceivingDetails(context.poId);
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
    const remaining = Number(activeReceivingDetails.payment?.remaining_balance || 0);
    const amount = Number(document.getElementById('supplierPaymentAmount')?.value || 0);
    const method = document.getElementById('supplierPaymentMethod')?.value || '';
    const date = document.getElementById('supplierPaymentDate')?.value || '';
    let message = 'Ready to record payment.';
    let valid = true;
    if (!Number.isFinite(amount) || amount <= 0) { valid = false; message = 'Payment amount must be greater than zero.'; }
    else if (amount > remaining) { valid = false; message = `Payment amount exceeds the remaining balance by ${peso(amount - remaining)}.`; }
    else if (!method) { valid = false; message = 'Select a payment method.'; }
    else if (!date) { valid = false; message = 'Select the payment date.'; }
    const validation = document.getElementById('supplierPaymentValidation');
    if (validation) validation.textContent = valid ? '' : message;
    const amountInput = document.getElementById('supplierPaymentAmount');
    const amountInvalid = amount > remaining || !Number.isFinite(amount) || amount <= 0;
    if (amountInput) { amountInput.classList.toggle('is-invalid', amountInvalid); amountInput.setAttribute('aria-invalid', amountInvalid ? 'true' : 'false'); }
    const after = document.getElementById('supplierPaymentBalanceAfter');
    if (after) after.textContent = peso(Math.max(remaining - (Number.isFinite(amount) ? amount : 0), 0));
    after?.closest('.payment-live-balance')?.classList.toggle('is-invalid', amount > remaining || amount < 0);
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
        if (save) save.classList.toggle('d-none', details.payment?.payment_status === 'Fully Paid');
        ['supplierPaymentAmount', 'supplierPaymentDate'].forEach((id) => document.getElementById(id)?.addEventListener('input', updateSupplierPaymentValidation));
        document.getElementById('supplierPaymentMethod')?.addEventListener('change', () => { updateSupplierPaymentReferenceUi(); updateSupplierPaymentValidation(); });
        document.getElementById('btnPayFullBalance')?.addEventListener('click', () => {
            const input = document.getElementById('supplierPaymentAmount');
            if (!input) return;
            input.value = Math.max(Number(details.payment?.adjusted_payable || 0) - Number(details.payment?.total_paid || 0), 0).toFixed(2);
            updateSupplierPaymentValidation();
            input.focus();
            input.select();
        });
        const amountInput = document.getElementById('supplierPaymentAmount');
        amountInput?.addEventListener('change', () => {
            const value = Number(amountInput.value);
            if (Number.isFinite(value)) amountInput.value = value.toFixed(2);
            updateSupplierPaymentValidation();
        });
        if (options.preservedState) restoreSupplierPaymentState(options.preservedState);
        else updateSupplierPaymentReferenceUi();
        updateSupplierPaymentValidation();
        requestAnimationFrame(() => { amountInput?.focus(); amountInput?.select(); });
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
                idempotency_key: state.idempotencyKey,
                expected_remaining_balance: state.remainingBalance
            })
        });
        receivingDetailsCache.delete(String(state.poId));
        activeReceivingDetails = await fetchReceivingDetails(state.poId, true);
        if (document.body.dataset.page === 'inspect-deliveries') await loadInspectionQueue();
        else await loadPurchaseOrders();
        supplierPaymentSubmissionKey = globalThis.crypto?.randomUUID?.() || `po-payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        supplierPaymentPendingState = null;
        const fullyPaid = data.payment_status === 'Fully Paid' || Number(data.remaining_balance || 0) <= 0;
        showSupplierPaymentResult({
            type: 'success',
            title: 'Payment Recorded',
            poId: state.poId,
            message: fullyPaid
                ? `Supplier payment of ${peso(data.payment_recorded)} was recorded successfully. This purchase order is now Fully Paid.`
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
        const quantity = receiveQuantityModel(orderItem, item);
        const batches = Array.isArray(item.batches) ? item.batches : [];
        const allocated = batches.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantity || 0)), 0);
        const quantitiesComplete = Number.isInteger(quantity.delivered) && quantity.delivered >= 0 && quantity.delivered <= quantity.ordered && Number.isInteger(quantity.damaged) && quantity.damaged >= 0 && quantity.damaged <= quantity.delivered;
        const batchesComplete = allocated === quantity.accepted && (quantity.accepted === 0 || batches.length > 0) && batches.every((batch) => Number.isInteger(Number(batch.quantity)) && Number(batch.quantity) > 0);
        const expiryComplete = quantity.accepted === 0 || !isMedicineItem(orderItem) || (batches.length > 0 && batches.every((batch) => Boolean(batch.expiry_date)));
        const adjustment = Number(item.supplier_adjustment || 0);
        const resolutionComplete = quantity.affected === 0
            ? quantity.resolution === 'none' && adjustment === 0
            : Boolean(item.issue_type) && quantity.resolution !== 'none' && (quantity.resolution === 'keep_with_discount' ? adjustment > 0 : adjustment === 0);
        const remarksComplete = quantity.affected === 0 || Boolean(String(item.remarks || '').trim());
        const inspected = item.inspection_complete === true || item.inspection_complete === 1 || item.inspection_complete === '1';
        completed += [quantitiesComplete, batchesComplete, expiryComplete, resolutionComplete, remarksComplete, inspected].filter(Boolean).length;
        hasIssues = hasIssues || quantity.affected > 0;
        allReady = allReady && quantitiesComplete && batchesComplete && expiryComplete && resolutionComplete && remarksComplete && inspected;
    });
    const total = Math.max(1, (order.items || []).length * 6);
    const percent = Math.round((completed / total) * 100);
    const ready = allReady && (order.items || []).length > 0;
    const key = ready ? 'ready' : (hasIssues ? 'issue-found' : 'in-progress');
    const status = ready ? 'Ready to Confirm' : (hasIssues ? 'Issue Found' : 'Inspection in Progress');
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
        const quantity = receiveQuantityModel(item, draftItem);
        totals.ordered += Number(quantity.ordered || 0);
        totals.accepted += Number(quantity.accepted || 0);
        totals.affected += Number(quantity.affected || 0);
        return totals;
    }, { ordered: 0, accepted: 0, affected: 0 });
}

function renderInspectionQueue() {
    const search = String(document.getElementById('inspectionSearch')?.value || '').trim().toLowerCase();
    const from = document.getElementById('inspectionDateFrom')?.value || '';
    const to = document.getElementById('inspectionDateTo')?.value || '';
    const inspectionStatus = document.getElementById('inspectionStatusFilter')?.value || '';
    const paymentStatus = document.getElementById('inspectionPaymentFilter')?.value || '';
    const filtered = inspectionQueueOrders.filter((order) => {
        const snapshot = order.receiving_completed === true ? { key: 'completed', status: 'Receiving Completed', hasIssues: Number(order.affected_units || 0) > 0 } : (order.inspection_snapshot || inspectionQueueSnapshot(order));
        const haystack = `${order.po_number || ''} ${order.grn_number || ''} ${order.supplier_name || ''}`.toLowerCase();
        const arrival = String(order.received_date || order.arrival_date || order.expected_delivery_date || order.order_date || '').slice(0, 10);
        return (!search || haystack.includes(search))
            && (!from || arrival >= from)
            && (!to || arrival <= to)
            && (!inspectionStatus || snapshot.key === inspectionStatus)
            && (!paymentStatus || String(order.payment_status || 'Unpaid') === paymentStatus);
    });
    const rows = document.getElementById('inspectionQueueRows');
    if (!rows) return;
    if (!filtered.length) {
        rows.innerHTML = '<tr><td colspan="10" class="empty-state">No arrived purchase orders match the selected filters.</td></tr>';
        return;
    }
    rows.innerHTML = filtered.map((order) => {
        const completed = order.receiving_completed === true;
        const snapshot = completed ? { key: 'completed', status: 'Receiving Completed', hasIssues: Number(order.affected_units || 0) > 0 } : (order.inspection_snapshot || inspectionQueueSnapshot(order));
        const totals = completed ? { ordered: Number(order.ordered_units || 0), accepted: Number(order.accepted_units || 0), affected: Number(order.affected_units || 0) } : inspectionActiveTotals(order);
        const productCount = completed ? Number(order.products || 0) : (Array.isArray(order.items) ? order.items.length : 0);
        const statusClass = snapshot.key === 'completed' ? 'status-complete' : (snapshot.ready ? 'status-ready' : (snapshot.hasIssues ? 'status-warning' : (snapshot.key === 'in-progress' ? 'status-active' : 'status-neutral')));
        const arrivalDate = order.arrival_date || order.expected_delivery_date || order.order_date;
        const receivedDate = order.received_date;
        const actionLabel = snapshot.key === 'awaiting' ? 'Start Inspection' : 'Continue Inspection';
        const actions = completed
            ? `<button class="btn btn-sm btn-outline-primary queue-action-icon queue-view-receiving" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View Receiving" aria-label="View Receiving for ${escapeHtml(order.po_number || '')}"><i class="fa-regular fa-eye"></i></button><button class="btn btn-sm btn-outline-secondary queue-action-icon queue-print-grn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Print GRN" aria-label="Print GRN for ${escapeHtml(order.po_number || '')}"><i class="fa-solid fa-print"></i></button>${String(order.payment_status) !== 'Fully Paid' && Number(order.remaining_balance || 0) > 0 ? `<button class="btn btn-sm btn-purple queue-action-icon queue-manage-payment" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Manage Payment" aria-label="Manage Payment for ${escapeHtml(order.po_number || '')}"><i class="fa-solid fa-wallet"></i></button>` : ''}`
            : `<button class="btn btn-sm ${snapshot.key === 'awaiting' ? 'btn-outline-primary' : 'btn-primary'} queue-action-icon inspect-queue-action" type="button" data-po-id="${escapeHtml(order.po_id)}" title="${actionLabel}" aria-label="${actionLabel} for ${escapeHtml(order.po_number || '')}"><i class="fa-solid fa-clipboard-check"></i></button>`;
        return `<tr class="queue-row" data-po-id="${escapeHtml(order.po_id)}">
            <td><span class="queue-po" title="${escapeHtml(order.po_number || '-')}">${escapeHtml(order.po_number || '-')}</span><span class="queue-secondary" title="${escapeHtml(completed ? order.grn_number : 'No GRN yet')}">${escapeHtml(completed ? order.grn_number : 'No GRN yet')}</span></td>
            <td title="${escapeHtml(order.supplier_name || '-')}">${escapeHtml(order.supplier_name || '-')}</td>
            <td>${completed ? `<strong>${escapeHtml(formatDate(receivedDate))}</strong><span class="queue-secondary">Arrived ${escapeHtml(formatDate(arrivalDate))}</span>` : `<strong>${escapeHtml(formatDate(arrivalDate))}</strong><span class="queue-secondary">Awaiting receiving</span>`}</td>
            <td>${productCount}</td><td>${totals.ordered}</td><td>${totals.accepted}</td><td>${totals.affected}</td>
            <td><span class="queue-status-badge ${statusClass}">${escapeHtml(snapshot.status)}</span></td>
            <td>${paymentStatusBadge(order.payment_status || 'Unpaid')}</td>
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
    if (rows) rows.innerHTML = '<tr><td colspan="10" class="empty-state"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading arrived purchase orders...</td></tr>';
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
        if (event.target.matches('.receive-batch-no-expiry')) {
            const expiry = event.target.closest('.receive-batch-row')?.querySelector('.receive-batch-expiry');
            if (expiry) { expiry.disabled = event.target.checked; if (event.target.checked) expiry.value = ''; }
        }
        renderReceivePaymentSummary();
    });
    cards?.addEventListener('click', (event) => {
        const complete = event.target.closest('.receive-complete-inspection');
        if (complete) {
            const card = complete.closest('.receive-item-card');
            if (!card || card.dataset.ready !== '1') return;
            const input = card.querySelector('.receive-inspected-input');
            if (input) input.value = '1';
            renderReceivePaymentSummary();
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
    ['inspectionSearch', 'inspectionStatusFilter', 'inspectionPaymentFilter'].forEach((id) => document.getElementById(id)?.addEventListener(id === 'inspectionSearch' ? 'input' : 'change', renderInspectionQueue));
    ['inspectionDateFrom', 'inspectionDateTo'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => { updateInspectionDateSummary(); renderInspectionQueue(); }));
    document.getElementById('btnClearInspectionFilters')?.addEventListener('click', () => {
        ['inspectionSearch', 'inspectionDateFrom', 'inspectionDateTo', 'inspectionStatusFilter', 'inspectionPaymentFilter'].forEach((id) => { const control = document.getElementById(id); if (control) control.value = ''; });
        updateInspectionDateSummary();
        renderInspectionQueue();
    });
    document.getElementById('inspectionQueueRows')?.addEventListener('click', (event) => {
        const inspect = event.target.closest('.inspect-queue-action');
        const view = event.target.closest('.queue-view-receiving');
        const print = event.target.closest('.queue-print-grn');
        const payment = event.target.closest('.queue-manage-payment');
        if (inspect) openInspectionWorkspace(inspect.dataset.poId, { pushHistory: true });
        else if (view) openReceivingDetails(view.dataset.poId);
        else if (print) openDeliveredReceipt(print.dataset.poId);
        else if (payment) openSupplierPayment(payment.dataset.poId);
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
    initCreatePoModalLayoutControls();
    initEditPoModalLayoutControls();
    initViewPoModalLayoutControls();

    document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
    document.querySelector('[data-bs-target="#createPurchaseOrderModal"]')?.addEventListener('click', () => showModal('createPurchaseOrderModal'));
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
    document.getElementById('btnSubmitPo')?.addEventListener('click', submitPurchaseOrder);
    document.getElementById('btnUpdatePo')?.addEventListener('click', updatePurchaseOrder);
    document.getElementById('btnConfirmReceivePo')?.addEventListener('click', submitReceivePurchaseOrder);
    document.getElementById('btnSaveReceiveDraft')?.addEventListener('click', saveReceiveInspectionDraft);
    document.getElementById('btnOpenNextInspection')?.addEventListener('click', openNextUninspectedCard);
    document.getElementById('btnSaveReturnDamage')?.addEventListener('click', submitReturnDamage);
    const statusFilter = document.getElementById('po-status-filter');
    const params = new URLSearchParams(window.location.search);
    const initialPoView = purchaseOrderViewFromUrl();
    const queryStatus = initialPoView === 'active' ? (params.get('status') || '') : '';
    if (params.get('action') === 'create') {
        window.setTimeout(() => {
            showModal('createPurchaseOrderModal');
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('action');
            window.history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        }, 0);
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
        const editButton = event.target.closest('.edit-po-btn');
        const statusButton = event.target.closest('.status-po-btn');
        const receiveButton = event.target.closest('.receive-po-btn');
        const receiptButton = event.target.closest('.receipt-po-btn');
        const receivingButton = event.target.closest('.view-receiving-btn');
        const printGrnButton = event.target.closest('.print-delivered-grn-btn');
        const managePaymentButton = event.target.closest('.manage-payment-btn, .view-payment-history-btn');
        if (viewButton) openViewPurchaseOrder(viewButton.dataset.poId);
        if (editButton) openEditPurchaseOrder(editButton.dataset.poId);
        if (statusButton) updatePurchaseOrderStatusFromTable(statusButton.dataset.poId);
        if (receiveButton) window.location.href = `inspect_deliveries.html?po=${encodeURIComponent(receiveButton.dataset.poId)}`;
        if (receiptButton) openDeliveredReceipt(receiptButton.dataset.poId);
        if (receivingButton) openReceivingDetails(receivingButton.dataset.poId);
        if (printGrnButton) openDeliveredReceipt(printGrnButton.dataset.poId);
        if (managePaymentButton) openSupplierPayment(managePaymentButton.dataset.poId);
    });

    renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
    renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
    loadPOSuppliers();
    if (initialPoView === 'active') {
        loadPurchaseOrders({ updateSummary: true });
    } else {
        setPurchaseOrderView(initialPoView, { updateSummary: true });
    }
}

if (document.body.dataset.page === 'inspect-deliveries') initInspectDeliveries();
else initPurchaseOrders();

export { initPurchaseOrders, initInspectDeliveries, loadPOSuppliers, loadSupplierProducts, loadPurchaseOrders };
