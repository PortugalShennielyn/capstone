import PharmaUtils from '../utils.js';

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
let editDraftItemIndex = null;
let selectedCreateDraftIndex = null;
let selectedEditDraftIndex = null;
let activeEditOrder = null;
let editMajorFieldsLocked = false;

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
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(Number(value || 0));
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
    const { rawProduct } = productDisplayParts(product);
    const brand = poBrandName(product);
    const productLabel = productCoreName(product);
    const spec = productSpecification(product);

    return [brand, productLabel, spec].filter(Boolean).join(' - ') || rawProduct || 'Unnamed product';
}

function productOptionDetail(product) {
    return productSpecification(product);
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
    return `${count} ${pluralizeStockUnit(unitLabel, count)}`;
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

function productLineTotal(item) {
    const quantity = Number(item.inventory_qty_ordered || inventoryQtyForItem(item));
    const unitPrice = Number(item.price || 0);
    return quantity * unitPrice;
}

function inventoryQtyForItem(item) {
    const purchaseQty = Number(item.purchase_qty || item.quantity || 0);
    const unitsPerPurchaseUnit = Number(item.units_per_purchase_unit || item.purchase_unit_qty || 1);
    return purchaseQty * Math.max(1, unitsPerPurchaseUnit);
}

function updateCreateSummary() {
    const summary = document.getElementById('po-create-summary');
    if (!summary) return;

    const totalItems = createDraftItems.length;
    const totalPurchaseUnits = createDraftItems.reduce((total, item) => total + Number(item.purchase_qty || item.quantity || 0), 0);
    const estimatedCost = createDraftItems.reduce((total, item) => total + productLineTotal(item), 0);

    summary.innerHTML = `
        <div><span>Total Items</span><strong>${totalItems}</strong></div>
        <div><span>Total Order Qty</span><strong>${totalPurchaseUnits}</strong></div>
        <div><span>Stock to Receive</span><strong>${escapeHtml(draftStockSummary(createDraftItems))}</strong></div>
        <div><span>Estimated Cost</span><strong>${peso(estimatedCost)}</strong></div>
    `;
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
    const item = selectedOptionItem('po-product-select', false);
    setCreatePurchaseUnitFields(item);
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

function totalPurchaseUnits(items) {
    return items.reduce((total, item) => total + Number(item.purchase_qty || item.quantity || 0), 0);
}

function supplierVatRate() {
    const select = document.getElementById('po-supplier-select');
    const option = select?.options[select.selectedIndex];
    const vatApplicable = cleanText(option?.dataset?.vatApplicable);
    if (vatApplicable && ['0', 'false', 'no'].includes(vatApplicable.toLowerCase())) {
        return 0;
    }

    return 0.12;
}

function purchaseSummaryItemHtml(item, index) {
    const purchaseUnit = purchaseUnitInfo(item);
    const orderQty = Number(item.purchase_qty || item.quantity || 0);
    const packageLabel = pluralizeUnit(purchaseUnit.purchaseUnit || 'package', orderQty);
    const activeClass = index === selectedCreateDraftIndex ? ' is-selected' : '';

    return `
        <div class="po-summary-item${activeClass}" role="button" tabindex="0" data-index="${index}" aria-pressed="${index === selectedCreateDraftIndex ? 'true' : 'false'}">
            <div class="po-summary-item-main">
                <span class="po-summary-check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
                <div>
                    <strong>${escapeHtml(productCoreName(item) || item.product_name || 'Unnamed product')}</strong>
                    <span>${escapeHtml(`${orderQty} ${packageLabel}`)}</span>
                </div>
            </div>
            <div class="po-summary-item-actions">
                <button class="btn btn-sm btn-outline-secondary po-summary-edit-item" type="button" data-index="${index}">
                    <i class="fa-solid fa-pen" aria-hidden="true"></i>
                    <span>Edit</span>
                </button>
                <button class="btn btn-sm btn-outline-danger po-summary-remove-item" type="button" data-index="${index}">
                    <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                    <span>Remove</span>
                </button>
            </div>
        </div>
    `;
}

function renderPurchaseItemsSummary(items) {
    if (items.length === 0) {
        return '<div class="po-summary-empty">No purchase items added yet.</div>';
    }

    return items.map((item, index) => purchaseSummaryItemHtml(item, index)).join('');
}

function renderSelectedProductPanel() {
    const panel = document.getElementById('po-selected-product-panel');
    if (!panel) return;

    const selectedDraftItem = Number.isInteger(selectedCreateDraftIndex) ? createDraftItems[selectedCreateDraftIndex] : null;
    const item = selectedDraftItem || selectedOptionItem('po-product-select');
    if (!item && createDraftItems.length === 0) {
        panel.classList.remove('is-visible');
        panel.innerHTML = '';
        return;
    }

    const productDetails = item
        ? productDetailsForPreview(item)
        : '<div class="po-preview-empty">Select a product to preview its details.</div>';
    const subtotal = createDraftItems.reduce((total, draftItem) => total + productLineTotal(draftItem), 0);
    const vat = subtotal * supplierVatRate();
    const grandTotal = subtotal + vat;
    const financialDetails = [
        receiptRow('Purchase Items', String(createDraftItems.length)),
        receiptRow('Total Purchase Units', String(totalPurchaseUnits(createDraftItems))),
        receiptRow('Total Stock to Receive', draftStockSummary(createDraftItems)),
        '<div class="po-receipt-divider"></div>',
        receiptRow('Supplier', selectedSupplierName('po')),
        '<div class="po-receipt-divider"></div>',
        receiptRow('Subtotal', peso(subtotal)),
        receiptRow('VAT (12%)', peso(vat)),
        '<div class="po-receipt-divider"></div>',
        receiptRow('GRAND TOTAL', peso(grandTotal), { strong: true, highlight: true })
    ].join('');
    const orderQty = 0;
    const orderPackageLabel = '';
    const inventoryQtyOrdered = 0;
    const purchaseUnit = { unitContainsLabel: '', stockUnit: 'pcs', conversionNote: '' };

    panel.innerHTML = `
        <div class="po-selected-card po-product-details-card">
            <h4>Product Details</h4>
            <div class="po-selected-product-grid">${productDetails}</div>
        </div>
        <div class="po-selected-card po-order-summary-card">
            <h4>Purchase Order Summary</h4>
            <div class="po-summary-section">
                <p class="po-summary-section-title">Purchase Items</p>
                <div class="po-summary-items">${renderPurchaseItemsSummary(createDraftItems)}</div>
            </div>
            <div class="po-summary-section">
                <p class="po-summary-section-title">Financial Summary</p>
                <div class="po-receipt-summary">${financialDetails}</div>
            </div>
            <div class="po-order-cards d-none">
                <div class="po-calc-card po-calc-card-blue">
                    <span>Order Calculation</span>
                    <strong>${orderQty} ${escapeHtml(orderPackageLabel)} × ${escapeHtml(purchaseUnit.unitContainsLabel)}</strong>
                </div>
                <div class="po-calc-card po-calc-card-green">
                    <span>Stock to Receive</span>
                    <strong>${inventoryQtyOrdered} ${escapeHtml(purchaseUnit.stockUnit || 'pcs')}</strong>
                </div>
                <div class="po-calc-card po-calc-card-orange">
                    <span>Purchase Conversion</span>
                    <strong>${escapeHtml(purchaseUnit.conversionNote)}</strong>
                </div>
            </div>
        </div>
    `;
    panel.classList.add('is-visible');
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

function clearEditProductEditor() {
    editDraftItemIndex = null;
    selectedEditDraftIndex = null;
    const editor = document.getElementById('edit-po-product-editor');
    if (editor) editor.classList.add('d-none');
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
    const button = document.getElementById('btnEditAddPoItem');
    if (button) button.textContent = 'Update Item';
    renderEditSelectedProductDetails(null);
    renderEditSummary();
}

function updateEditStockToReceive() {
    const quantity = Math.max(0, Number(getValue('edit-po-editor-quantity') || document.getElementById('edit-po-quantity')?.value || 0));
    const contains = Math.max(1, Number(getValue('edit-po-editor-contains') || 1));
    const selectedOption = document.getElementById('edit-po-product-select')?.selectedOptions?.[0] || null;
    const optionItem = selectedOption ? draftItemFromOption(selectedOption, quantity || 1) : null;
    const existingItem = Number.isInteger(editDraftItemIndex) ? editDraftItems[editDraftItemIndex] : null;
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
    const activeItem = Number.isInteger(editDraftItemIndex) ? editDraftItems[editDraftItemIndex] : item;
    if (activeItem) {
        renderEditSelectedProductDetails({
            ...activeItem,
            purchase_qty: quantity,
            quantity,
            purchase_unit: getValue('edit-po-editor-purchase-unit') || activeItem.purchase_unit,
            units_per_purchase_unit: contains,
            purchase_unit_qty: contains,
            inventory_qty_ordered: quantity * contains
        });
    }
}

function showEditProductEditor(item, index = null) {
    const editor = document.getElementById('edit-po-product-editor');
    if (!editor || !item) return;

    const medicine = isMedicineItem(item);
    const purchaseUnit = purchaseUnitInfo(item);
    const orderQty = Number(item.purchase_qty || item.quantity || 1);
    const onHand = Number(item.stock || 0);
    const reorderLevel = Number(item.reorder_level || 10);
    editDraftItemIndex = Number.isInteger(index) ? index : null;
    selectedEditDraftIndex = Number.isInteger(index) ? index : null;
    editor.classList.remove('d-none');

    const editorTitle = document.getElementById('edit-po-product-editor-title');
    if (editorTitle) {
        editorTitle.textContent = editDraftItemIndex === null
            ? `Selected Product: ${item.product_name || 'New item'}`
            : `Editing Item: ${item.product_name || 'PO item'}`;
    }

    setValue('edit-po-editor-index', editDraftItemIndex === null ? '' : String(editDraftItemIndex));
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
    if (button) button.textContent = 'Update Item';

    renderEditSelectedProductDetails(item);
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

    if (!productId || quantity <= 0 || price < 0 || unitsPerPurchaseUnit <= 0) {
        throw new Error('Select a product and enter a valid order quantity, supplier conversion, and price.');
    }
    const existingItem = editDraftItemIndex === null ? null : editDraftItems[editDraftItemIndex];
    const selectedOption = document.getElementById('edit-po-product-select')?.selectedOptions?.[0] || null;
    const optionItem = selectedOption ? draftItemFromOption(selectedOption, quantity) : null;
    const masterItem = optionItem || existingItem || {};

    return {
        po_item_id: editDraftItemIndex === null ? null : (editDraftItems[editDraftItemIndex]?.po_item_id || null),
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
    try {
        const productSelect = document.getElementById('edit-po-product-select');
        const option = productSelect?.options[productSelect.selectedIndex];
        const editor = document.getElementById('edit-po-product-editor');

        if (editor?.classList.contains('d-none')) {
            const fromOption = draftItemFromOption(option, document.getElementById('edit-po-quantity')?.value || 1);
            if (!fromOption) throw new Error('Select a product first.');
            showEditProductEditor(fromOption);
        }

        const item = readEditProductEditor();
        if (editDraftItemIndex === null) {
            editDraftItems.push(item);
            editDraftItemIndex = editDraftItems.length - 1;
            selectedEditDraftIndex = editDraftItemIndex;
        } else {
            editDraftItems[editDraftItemIndex] = item;
            selectedEditDraftIndex = editDraftItemIndex;
        }
        item.product_details = createProductDetailSnapshot(item);

        renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
        showEditProductEditor(editDraftItems[selectedEditDraftIndex], selectedEditDraftIndex);
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

function renderEditSelectedProductDetails(item) {
    const grid = document.getElementById('edit-po-product-details-grid');
    if (!grid) return;

    if (!item) {
        grid.innerHTML = '<div class="po-preview-empty">Select or click a PO item to view product details.</div>';
        return;
    }

    const detailItem = {
        ...item,
        product_details: {
            ...createProductDetailSnapshot(item),
            ...(item.product_details || {}),
            purchase_conversion: getValue('edit-po-editor-conversion') || item.product_details?.purchase_conversion || createProductDetailSnapshot(item).purchase_conversion,
            stock_to_receive: getValue('edit-po-editor-stock-receive') || item.product_details?.stock_to_receive || createProductDetailSnapshot(item).stock_to_receive
        }
    };
    grid.innerHTML = productDetailsForPreview(detailItem);
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
            const optionParts = [optionLabel, productSizeValue(product), productPackagingValue(product)].filter(Boolean);
            option.value = product.product_id;
            option.textContent = optionParts.join(' \u2022 ');
            option.title = [optionLabel, optionDetail].filter(Boolean).join('\n');
            option.dataset.productName = cleanText(product.product_name);
            option.dataset.productDisplayName = productCoreName(product);
            option.dataset.brand = cleanText(product.brand_name);
            option.dataset.brandDisplayName = poBrandName(product);
            option.dataset.unit = unitDisplay;
            option.dataset.price = product.price || '0';
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
        const minWidth = view === 'delivered' ? '1840px' : (view === 'arrived' ? '1660px' : (view === 'archived' ? '1930px' : '1680px'));
        table.style.setProperty('min-width', minWidth, 'important');
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
                <th class="col-brand">Brand</th>
                <th class="col-items">Product</th>
                <th class="col-specification">Specification</th>
                <th class="col-received">Received Qty</th>
                <th class="col-received">Returned Qty</th>
                <th class="col-received">Damaged Qty</th>
                <th class="col-inventory-qty">Inventory Added</th>
                <th class="col-money">Final Payment</th>
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
                <th class="col-money">Total Amount</th>
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
        commitPurchaseOrderTable('active', tableEmpty(11, 'No active purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = order.item_names || [];
        const quantities = items.length ? items.map((item) => item.quantity || item.purchase_qty || 0) : (order.quantities || []);
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
            <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
            <td>${formatDate(order.expected_delivery_date)}</td>
            <td class="po-status-cell">${statusBadge(order.status)}</td>
            <td class="po-actions-cell">
                <div class="po-actions">
                    <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number)}">
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
        commitPurchaseOrderTable('arrived', tableEmpty(11, 'No arrived purchase orders ready for receiving.'));
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
                <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
                <td>${formatDate(order.expected_delivery_date)}</td>
                <td class="po-status-cell">${statusBadge(order.status || 'Arrived')}</td>
                <td class="po-actions-cell">
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-success receive-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Receive PO ${escapeHtml(order.po_number || '')}" title="Receive PO">
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
        commitPurchaseOrderTable('delivered', tableEmpty(13, 'No delivered purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = items.length ? items.map((item) => productTableProductName(item)) : (order.item_names || []);
        const receivedQuantities = items.map((item) => Number(item.received_quantity || 0));
        const returnedQuantities = items.map((item) => Number(item.returned_quantity || 0));
        const damagedQuantities = items.map((item) => Number(item.damaged_quantity || 0));
        const inventoryAdded = items.map((item) => {
            const addedQty = Math.max(
                0,
                Number(item.received_quantity || 0)
                - Number(item.damaged_quantity || 0)
            );
            return quantityWithInventoryUnit(item, addedQty);
        });
        const deliveryDate = order.delivery_date || order.received_date || order.expected_delivery_date || order.order_date;

        return `
            <tr>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td class="po-brand-cell">${brandTableCellList(items)}</td>
                <td class="po-product-cell">${numberedList(itemNames)}</td>
                <td class="po-spec-cell">${specificationTableCellList(items)}</td>
                <td class="po-qty-cell">${numberedList(receivedQuantities, { plain: true })}</td>
                <td class="po-qty-cell">${numberedList(returnedQuantities, { plain: true })}</td>
                <td class="po-qty-cell">${numberedList(damagedQuantities, { plain: true })}</td>
                <td class="po-qty-cell">${numberedList(inventoryAdded, { plain: true })}</td>
                <td class="po-price-cell"><span class="po-money">${peso(order.final_payment)}</span></td>
                <td>${escapeHtml(order.payment_state || order.payment_status || 'Unpaid')}</td>
                <td>${formatDate(deliveryDate)}</td>
                <td class="po-actions-cell">
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number || '')}">
                            <i class="fa-regular fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-dark receipt-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View Receiving Receipt ${escapeHtml(order.po_number || '')}" title="View Receiving Receipt">
                            <i class="fa-solid fa-receipt"></i>
                        </button>
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
    if (!tableBody) return;

    if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">No items added yet.</td></tr>';
        if (tableSelector === '#table-po-items') updateCreateSummary();
        if (tableSelector === '#table-edit-po-items') renderEditSummary();
        return;
    }

    const isEditTable = tableSelector === '#table-edit-po-items';
    tableBody.innerHTML = items.map((item, index) => {
        const purchaseUnit = purchaseUnitInfo(item);
        const packaging = item.packaging || purchaseUnit.packaging || '';

        const selectedClass = isEditTable && index === selectedEditDraftIndex ? ' class="is-selected"' : '';
        const rowAttrs = isEditTable ? ` data-index="${index}"${selectedClass}` : '';

        return `
        <tr${rowAttrs}>
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
                    ${isEditTable && !editMajorFieldsLocked ? `<button class="btn btn-sm btn-outline-secondary edit-po-item" type="button" data-index="${index}" aria-label="Edit item"><i class="fa-solid fa-pen"></i></button>` : ''}
                    ${!isEditTable || !editMajorFieldsLocked ? `<button class="btn btn-sm btn-outline-danger ${removeClass}" type="button" data-index="${index}" aria-label="Remove item"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                </div>
            </td>
        </tr>
    `;
    }).join('');
    if (tableSelector === '#table-po-items') updateCreateSummary();
    if (isEditTable) renderEditSummary();
}

function renderArchivedPurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable('archived', tableEmpty(12, 'No cancelled or archived purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = items.length ? items.map((item) => productTableProductName(item)) : (order.item_names || []);
        const quantities = items.length ? items.map((item) => item.quantity || item.purchase_qty || 0) : (order.quantities || []);
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

    if (!productSelect?.value || !option || quantity <= 0) {
        PharmaUtils.toast.error('Select a product and enter a valid quantity.');
        return;
    }

    const existing = items.find((item) => String(item.product_id) === String(productSelect.value));
    if (existing) {
        const existingIndex = items.indexOf(existing);
        existing.purchase_qty = Number(existing.purchase_qty || existing.quantity || 0) + quantity;
        if (overrides.purchaseUnit) existing.purchase_unit = overrides.purchaseUnit;
        if (overrides.unitsPerPurchaseUnit) {
            existing.units_per_purchase_unit = overrides.unitsPerPurchaseUnit;
            existing.purchase_unit_qty = overrides.unitsPerPurchaseUnit;
        }
        existing.quantity = existing.purchase_qty;
        existing.inventory_qty_ordered = inventoryQtyForItem(existing);
        existing.product_details = createProductDetailSnapshot(existing);
        if (isCreateTable) selectedCreateDraftIndex = existingIndex;
    } else {
        const draftItem = draftItemFromOption(option, quantity, overrides);
        draftItem.product_details = createProductDetailSnapshot(draftItem);
        items.push(draftItem);
        if (isCreateTable) selectedCreateDraftIndex = items.length - 1;
    }

    quantityInput.value = '1';
    renderDraftItems(items, tableSelector, removeClass);
    if (productSelectId === 'po-product-select') renderSelectedProductPanel();
}

function syncSelectedCreateDraftItemFromInputs() {
    const productSelect = document.getElementById('po-product-select');
    const productId = productSelect?.value || '';
    if (!productId) {
        renderSelectedProductPanel();
        return;
    }

    const existing = createDraftItems.find((item) => String(item.product_id) === String(productId));
    if (!existing) {
        renderSelectedProductPanel();
        return;
    }

    const quantity = Math.max(1, Number(document.getElementById('po-quantity')?.value || existing.purchase_qty || existing.quantity || 1));
    const overrides = readPurchaseUnitOverrides('po');
    existing.purchase_qty = quantity;
    existing.quantity = quantity;
    if (overrides.purchaseUnit) existing.purchase_unit = overrides.purchaseUnit;
    if (overrides.unitsPerPurchaseUnit) {
        existing.units_per_purchase_unit = overrides.unitsPerPurchaseUnit;
        existing.purchase_unit_qty = overrides.unitsPerPurchaseUnit;
    }
    existing.inventory_qty_ordered = inventoryQtyForItem(existing);
    existing.product_details = createProductDetailSnapshot(existing);
    selectedCreateDraftIndex = createDraftItems.indexOf(existing);
    renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
    renderSelectedProductPanel();
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

async function editCreateDraftItemFromSummary(index) {
    const item = createDraftItems[index];
    if (!item) return;

    const purchaseUnit = purchaseUnitInfo(item);
    const initialPackage = purchaseUnit.purchaseUnit || 'Box';
    const initialContains = Number(item.units_per_purchase_unit || item.purchase_unit_qty || 1);
    const initialQty = Number(item.purchase_qty || item.quantity || 1);
    const initialCost = Number(item.price || 0);
    const html = `
        <div class="po-summary-edit-form">
            <label>Purchase Unit<input id="po-summary-edit-package" class="form-control" value="${escapeHtml(initialPackage)}" readonly></label>
            <label>Units per Purchase Unit<input id="po-summary-edit-contains" class="form-control" type="number" min="1" value="${escapeHtml(initialContains)}" readonly></label>
            <label>Order Quantity<input id="po-summary-edit-qty" class="form-control" type="number" min="1" value="${escapeHtml(initialQty)}"></label>
            <label>Supplier Cost<input id="po-summary-edit-cost" class="form-control" type="number" min="0" step="0.01" value="${escapeHtml(money(initialCost))}"></label>
            <label>Estimated Cost<input id="po-summary-edit-estimated" class="form-control" type="number" min="0" step="0.01" value="${escapeHtml(money(productLineTotal(item)))}"></label>
        </div>
    `;

    if (!window.Swal) {
        const quantity = Number(prompt('Order Quantity', String(initialQty)) || initialQty);
        if (quantity > 0) {
            item.purchase_qty = quantity;
            item.quantity = quantity;
            item.inventory_qty_ordered = inventoryQtyForItem(item);
            item.product_details = createProductDetailSnapshot(item);
            selectedCreateDraftIndex = index;
            renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
            renderSelectedProductPanel();
        }
        return;
    }

    const result = await Swal.fire({
        title: `Edit ${productCoreName(item) || item.product_name || 'Purchase Item'}`,
        html,
        width: 520,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Save Item',
        confirmButtonColor: '#7c3aed',
        didOpen: () => {
            const qtyInput = document.getElementById('po-summary-edit-qty');
            const containsInput = document.getElementById('po-summary-edit-contains');
            const costInput = document.getElementById('po-summary-edit-cost');
            const estimatedInput = document.getElementById('po-summary-edit-estimated');
            const updateEstimated = () => {
                const qty = Math.max(1, Number(qtyInput?.value || 1));
                const contains = Math.max(1, Number(containsInput?.value || 1));
                const cost = Math.max(0, Number(costInput?.value || 0));
                if (estimatedInput) estimatedInput.value = money(qty * contains * cost);
            };
            const updateCostFromEstimated = () => {
                const qty = Math.max(1, Number(qtyInput?.value || 1));
                const contains = Math.max(1, Number(containsInput?.value || 1));
                const estimated = Math.max(0, Number(estimatedInput?.value || 0));
                if (costInput) costInput.value = money(estimated / (qty * contains));
            };
            [qtyInput, costInput].forEach((input) => input?.addEventListener('input', updateEstimated));
            estimatedInput?.addEventListener('input', updateCostFromEstimated);
            updateEstimated();
        },
        preConfirm: () => {
            const packageValue = cleanText(document.getElementById('po-summary-edit-package')?.value);
            const contains = Math.max(1, Number(document.getElementById('po-summary-edit-contains')?.value || 1));
            const quantity = Math.max(1, Number(document.getElementById('po-summary-edit-qty')?.value || 1));
            const cost = Math.max(0, Number(document.getElementById('po-summary-edit-cost')?.value || 0));

            if (!packageValue || contains <= 0 || quantity <= 0 || cost < 0) {
                Swal.showValidationMessage('Enter a valid order quantity and supplier cost.');
                return false;
            }

            return { packageValue, contains, quantity, cost };
        }
    });

    if (!result.isConfirmed || !result.value) return;

    const costChanged = Number(result.value.cost) !== Number(initialCost);
    if (costChanged && window.Swal) {
        const defaultResult = await Swal.fire({
            title: 'Update this supplier’s default cost for future POs?',
            icon: 'question',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: 'Update Default Cost',
            denyButtonText: 'This PO Only',
            confirmButtonColor: '#7c3aed',
            denyButtonColor: '#64748b'
        });

        if (defaultResult.isDismissed) return;

        if (defaultResult.isConfirmed) {
            try {
                await fetchJson(`${API_BASE_URL}/suppliers/assign_product.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        supplier_id: document.getElementById('po-supplier-select')?.value || '',
                        product_id: item.product_id,
                        supplier_cost_price: result.value.cost,
                        purchase_unit: result.value.packageValue,
                        units_per_purchase_unit: result.value.contains
                    })
                });
                PharmaUtils.toast.success('Supplier default cost updated for future POs.');
            } catch (error) {
                PharmaUtils.toast.error(error.message);
                return;
            }
        }
    }

    item.purchase_unit = result.value.packageValue;
    item.units_per_purchase_unit = result.value.contains;
    item.purchase_unit_qty = result.value.contains;
    item.purchase_qty = result.value.quantity;
    item.quantity = result.value.quantity;
    item.price = result.value.cost;
    item.inventory_qty_ordered = inventoryQtyForItem(item);
    item.product_details = createProductDetailSnapshot(item);
    selectedCreateDraftIndex = index;
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

    const payload = {
        supplier_id: supplierId,
        payment_terms: paymentTerms,
        expected_delivery_date: expectedDeliveryDate,
        total_items: items.length,
        items: items.map((item) => ({
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
            inventory_qty_ordered: inventoryQtyForItem(item),
            quantity: inventoryQtyForItem(item)
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
    const draftItem = {
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
        shelf_stock: Number(item.shelf_stock || 0),
        storage_stock: Number(item.storage_stock || 0),
        stock: Number(item.stock || 0),
        reorder_level: Number(item.reorder_level || item.reorder_qty || 10),
        quantity: Number(item.purchase_qty || item.quantity || 0)
    };
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
    if (editDraftItems.length > 0) {
        showEditProductEditor(editDraftItems[0], 0);
    }
    applyEditLocks(order);
}

function applyEditLocks(order) {
    const lockedTitle = 'Locked after owner approval.';
    const lockMajor = !canEditMajorFields(order);
    const lockAll = isOperationallyLocked(order);
    editMajorFieldsLocked = lockMajor || lockAll;

    [
        'edit-po-supplier-select',
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

    const addButton = document.getElementById('btnEditAddPoItem');
    if (addButton) {
        addButton.disabled = editMajorFieldsLocked;
        addButton.title = editMajorFieldsLocked ? lockedTitle : '';
    }

    const saveButton = document.getElementById('btnUpdatePo');
    if (saveButton) {
        saveButton.disabled = lockAll;
        saveButton.title = lockAll ? 'This purchase order is locked after processing.' : '';
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
            <div class="po-detail-box"><span>Final Payment</span><strong>${peso(order.final_payment)}</strong></div>
            <div class="po-detail-box"><span>Payment State</span><strong>${escapeHtml(order.payment_state || 'Unpaid')}</strong></div>
            <div class="po-detail-box"><span>Status</span><strong>${escapeHtml(order.status)}</strong></div>
        `;
        document.getElementById('viewPoItems').innerHTML = order.items.map((item) => {
            const purchaseUnit = purchaseUnitInfo(item);
            const stockToReceive = quantityWithInventoryUnit(item, Number(item.inventory_qty_ordered || inventoryQtyForItem(item) || 0));

            return `
                <tr>
                    <td>${escapeHtml(productTableBrand(item) || '-')}</td>
                    <td>${escapeHtml(productTableProductName(item))}</td>
                    <td>${escapeHtml(productSpecification(item) || '-')}</td>
                    <td>${peso(item.price)}</td>
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
    try {
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

function renderReceiveItems(order) {
    const body = document.querySelector('#table-receive-items tbody');
    if (!body) return;

    body.innerHTML = order.items.map((item) => {
        const maxStockToReceive = Number(item.inventory_qty_ordered || item.quantity || 0);
        const stockLabel = quantityWithInventoryUnit(item, maxStockToReceive);

        return `
            <tr data-po-item-id="${escapeHtml(item.po_item_id)}">
                <td>${escapeHtml(productTableBrand(item))}</td>
                <td>${escapeHtml(productTableProductName(item))}</td>
                <td>${escapeHtml(productSpecification(item) || '-')}</td>
                <td>${escapeHtml(stockLabel)}</td>
                <td><input class="form-control form-control-sm receive-qty-input" type="number" min="0" max="${escapeHtml(maxStockToReceive)}" step="1" value="${escapeHtml(maxStockToReceive)}"></td>
                <td><input class="form-control form-control-sm damaged-qty-input" type="number" min="0" max="${escapeHtml(maxStockToReceive)}" step="1" value="${escapeHtml(item.damaged_quantity || 0)}"></td>
                <td>
                    <select class="form-select form-select-sm damage-action-input" ${Number(item.damaged_quantity || 0) > 0 ? '' : 'disabled'}>
                        <option value="none">None</option>
                        <option value="return" ${Number(item.returned_quantity || 0) > 0 ? 'selected' : ''}>Return to Supplier</option>
                        <option value="keep" ${Number(item.damaged_quantity || 0) > 0 && Number(item.returned_quantity || 0) <= 0 ? 'selected' : ''}>Keep as Damaged</option>
                    </select>
                </td>
                <td><input class="form-control form-control-sm expiry-date-input" type="date" value=""></td>
                <td><input class="form-control form-control-sm receive-remarks-input" type="text" value=""></td>
            </tr>
        `;
    }).join('');
}

function orderTotal(order) {
    if (Number(order?.total_amount || 0) > 0) {
        return Number(order.total_amount);
    }

    return (order?.items || []).reduce((total, item) => total + productLineTotal(item), 0);
}

function receivePaymentSummary() {
    const originalTotal = (activeReceiveOrder?.items || []).reduce((total, item) => total + productLineTotal(item), 0);
    const supplierDiscountRaw = document.getElementById('receiveAdditionalAmount')?.value ?? '0';
    const supplierDiscount = supplierDiscountRaw === '' ? 0 : Number(supplierDiscountRaw);
    let supplierCredit = 0;
    let rejectedQty = 0;
    let hasRejected = false;
    const errors = [];

    if (!Number.isFinite(supplierDiscount)) {
        errors.push('Supplier discount must be a valid amount.');
    } else if (supplierDiscount < 0) {
        errors.push('Supplier discount cannot be negative.');
    }

    document.querySelectorAll('#table-receive-items tbody tr').forEach((row) => {
        const poItemId = row.dataset.poItemId;
        const orderItem = activeReceiveOrder?.items.find((item) => String(item.po_item_id) === String(poItemId));
        const receivedQuantity = Number(row.querySelector('.receive-qty-input')?.value || 0);
        const damagedQuantity = Number(row.querySelector('.damaged-qty-input')?.value || 0);
        const actionInput = row.querySelector('.damage-action-input');
        const damageAction = actionInput?.value || 'none';
        const unitPrice = Number(orderItem?.price || 0);
        const rejectedQuantity = damagedQuantity;

        if (rejectedQuantity > 0) hasRejected = true;
        supplierCredit += damageAction === 'return' ? Math.max(0, rejectedQuantity) * unitPrice : 0;
        rejectedQty += Math.max(0, rejectedQuantity);

        if (damagedQuantity <= 0 && actionInput) {
            actionInput.value = 'none';
            actionInput.disabled = true;
        } else if (actionInput) {
            actionInput.disabled = false;
            if (damageAction === 'none') {
                errors.push('Select a damage action when damaged quantity is greater than zero.');
            }
        }

        if (damagedQuantity > receivedQuantity) {
            errors.push('Damaged quantity cannot exceed received quantity.');
        }
    });

    const finalAmount = originalTotal - supplierCredit - (Number.isFinite(supplierDiscount) ? Math.max(0, supplierDiscount) : 0);

    return {
        originalTotal,
        damageDeduction: supplierCredit,
        additionalAmount: Number.isFinite(supplierDiscount) ? Math.max(0, supplierDiscount) : 0,
        finalAmount,
        hasDamage: hasRejected,
        rejectedQty,
        valid: errors.length === 0,
        errors: [...new Set(errors)]
    };
}

function renderReceivePaymentSummary() {
    const summary = receivePaymentSummary();
    const original = document.getElementById('receiveOriginalTotal');
    const deduction = document.getElementById('receiveDamageDeduction');
    const rejected = document.getElementById('receiveRejectedQty');
    const finalAmount = document.getElementById('receiveFinalAmount');

    if (original) original.textContent = peso(summary.originalTotal);
    if (rejected) rejected.textContent = `${summary.rejectedQty} items`;
    if (deduction) deduction.textContent = `-${peso(summary.damageDeduction)}`;
    if (finalAmount) finalAmount.textContent = peso(summary.finalAmount);
}

async function openReceivePurchaseOrder(poId) {
    try {
        activeReceiveOrder = await getPurchaseOrder(poId);
        document.getElementById('receivePoNumber').textContent = activeReceiveOrder.po_number;
        document.getElementById('receiveSupplierName').textContent = activeReceiveOrder.supplier_name;
        document.getElementById('receivePoRemarks').value = '';
        const additionalAmount = document.getElementById('receiveAdditionalAmount');
        if (additionalAmount) additionalAmount.value = '0';
        renderReceiveItems(activeReceiveOrder);
        renderReceivePaymentSummary();
        showModal('receivePurchaseOrderModal');
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

function receivePayload() {
    if (!activeReceiveOrder) throw new Error('No purchase order selected.');

    const items = [];
    const summary = receivePaymentSummary();

    if (!summary.valid) {
        throw new Error(summary.errors[0] || 'Please review the receiving quantities.');
    }

    document.querySelectorAll('#table-receive-items tbody tr').forEach((row) => {
        const poItemId = row.dataset.poItemId;
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(poItemId));
        const receivedQuantity = Number(row.querySelector('.receive-qty-input')?.value || 0);
        const damagedQuantity = Number(row.querySelector('.damaged-qty-input')?.value || 0);
        const damageAction = row.querySelector('.damage-action-input')?.value || 'none';
        const expiryDate = row.querySelector('.expiry-date-input')?.value || '';
        const remarks = row.querySelector('.receive-remarks-input')?.value || '';
        const orderedQuantity = Number(orderItem?.inventory_qty_ordered || orderItem?.quantity || 0);

        if (receivedQuantity < 0 || damagedQuantity < 0) {
            throw new Error('Received and damaged quantities cannot be negative.');
        }

        if (receivedQuantity > orderedQuantity) {
            throw new Error('Received quantity cannot exceed ordered quantity.');
        }

        if (damagedQuantity > receivedQuantity) {
            throw new Error('Damaged quantity cannot be greater than received quantity.');
        }

        if (damagedQuantity > 0 && damageAction === 'none') {
            throw new Error('Select a damage action when damaged quantity is greater than zero.');
        }

        items.push({
            po_item_id: poItemId,
            received_quantity: receivedQuantity,
            damaged_quantity: damagedQuantity,
            damage_action: damageAction,
            returned_quantity: damageAction === 'return' ? damagedQuantity : 0,
            expiry_date: expiryDate,
            remarks
        });
    });

    return {
        po_id: activeReceiveOrder.po_id,
        remarks: document.getElementById('receivePoRemarks')?.value || '',
        amount_paid: summary.finalAmount,
        supplier_discount: summary.additionalAmount,
        additional_amount: summary.additionalAmount,
        items
    };
}

function receiveReceiptRows(payload) {
    return payload.items.map((payloadItem) => {
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(payloadItem.po_item_id)) || {};
        const receivedQty = Number(payloadItem.received_quantity || 0);
        const damagedQty = Number(payloadItem.damaged_quantity || 0);
        const goodQty = Math.max(0, receivedQty - damagedQty);
        const unitCost = Number(orderItem.price || 0);
        const supplierCredit = payloadItem.damage_action === 'return' ? damagedQty * unitCost : 0;
        const actionLabel = payloadItem.damage_action === 'return'
            ? 'Return to Supplier'
            : (payloadItem.damage_action === 'keep' ? 'Keep as Damaged' : 'None');
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
                <td>${escapeHtml(payloadItem.expiry_date || 'Not set')}</td>
                <td>${escapeHtml(payloadItem.remarks || '')}</td>
            </tr>
        `;
    }).join('');
}

let currentReceiptReport = null;

function grnNumber(poNumber) {
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `GRN-${stamp}-${String(poNumber || '0001').replace(/[^A-Za-z0-9]+/g, '').slice(-4).padStart(4, '0')}`;
}

function receiptReportFromPayload(payload, response) {
    const summary = receivePaymentSummary();
    const now = new Date();
    const receivedBy = document.querySelector('.profile-name, #navbarUserName, [data-user-name]')?.textContent?.trim() || 'Dr. ADMIN';
    const items = payload.items.map((payloadItem) => {
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(payloadItem.po_item_id)) || {};
        const receivedQty = Number(payloadItem.received_quantity || 0);
        const damagedQty = Number(payloadItem.damaged_quantity || 0);
        const goodQty = Math.max(0, receivedQty - damagedQty);
        const unitCost = Number(orderItem.price || 0);
        const supplierCredit = payloadItem.damage_action === 'return' ? damagedQty * unitCost : 0;
        return {
            product: productTableProductName(orderItem),
            brand: productTableBrand(orderItem),
            specification: productSpecification(orderItem),
            orderedQty: Number(orderItem.inventory_qty_ordered || orderItem.quantity || 0),
            unitLabel: orderItem.purchase_unit || orderItem.unit || 'packs',
            receivedQty,
            goodQty,
            damagedQty,
            damageAction: payloadItem.damage_action === 'return' ? 'Return to Supplier' : (payloadItem.damage_action === 'keep' ? 'Keep as Damaged' : 'None'),
            unitCost,
            supplierCredit,
            expiryDate: payloadItem.expiry_date || 'Not set',
            remarks: payloadItem.remarks || ''
        };
    });
    return {
        pharmacyName: 'DR. R PHARMACY',
        pharmacyAddress: 'Pharmacy address not configured',
        contact: 'Contact number not configured',
        grnNo: grnNumber(activeReceiveOrder.po_number),
        poNo: activeReceiveOrder.po_number,
        supplier: activeReceiveOrder.supplier_name,
        receivedBy,
        receivedDate: now.toISOString(),
        status: response.po_status || activeReceiveOrder.status || '',
        paymentTerms: activeReceiveOrder.payment_terms || 'Not set',
        remarks: payload.remarks || '',
        supplierCredit: summary.damageDeduction,
        supplierDiscount: summary.additionalAmount,
        finalPayment: summary.finalAmount,
        items
    };
}

function receiptReportFromOrder(order) {
    const items = (order.items || []).map((item) => {
        const receivedQty = Number(item.received_quantity || 0);
        const damagedQty = Number(item.damaged_quantity || 0);
        const creditQty = Number(item.supplier_credit_quantity || 0);
        const unitCost = Number(item.price || 0);
        return {
            product: productTableProductName(item),
            brand: productTableBrand(item),
            specification: productSpecification(item),
            orderedQty: Number(item.inventory_qty_ordered || item.quantity || 0),
            unitLabel: item.purchase_unit || item.unit || 'packs',
            receivedQty,
            goodQty: Math.max(0, receivedQty - damagedQty),
            damagedQty,
            damageAction: creditQty > 0 ? 'Return to Supplier' : (damagedQty > 0 ? 'Keep as Damaged' : 'None'),
            unitCost,
            supplierCredit: creditQty * unitCost,
            expiryDate: item.received_expiry_date || 'Not set',
            remarks: item.return_remarks || ''
        };
    });
    const supplierCredit = items.reduce((total, item) => total + item.supplierCredit, 0);
    const totalAmount = Number(order.total_amount || 0);
    const finalPayment = Number(order.final_payment || 0);
    const supplierDiscount = Math.max(0, totalAmount - supplierCredit - finalPayment);
    return {
        pharmacyName: 'DR. R PHARMACY',
        pharmacyAddress: 'Pharmacy address not configured',
        contact: 'Contact number not configured',
        grnNo: grnNumber(order.po_number),
        poNo: order.po_number,
        supplier: order.supplier_name,
        receivedBy: 'Dr. ADMIN',
        receivedDate: order.received_date || order.delivery_date || order.order_date || new Date().toLocaleString('en-PH'),
        status: order.status || '',
        paymentTerms: order.payment_terms || 'Not set',
        remarks: order.receiving_remarks || '',
        supplierCredit,
        supplierDiscount,
        finalPayment,
        items
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

function receiptDamageLabel(item) {
    if (!item.damagedQty) return 'None';
    return item.damageAction === 'Return to Supplier' ? 'Returned' : 'Kept';
}

function receiptTotals(report) {
    return {
        ordered: report.items.reduce((sum, item) => sum + item.orderedQty, 0),
        accepted: report.items.reduce((sum, item) => sum + item.goodQty, 0),
        damaged: report.items.reduce((sum, item) => sum + item.damagedQty, 0)
    };
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
                    &nbsp;&nbsp;Accepted: ${item.goodQty}<br>
                    &nbsp;&nbsp;Damaged: ${item.damagedQty} (${escapeHtml(receiptDamageLabel(item))})<br>
                    &nbsp;&nbsp;Unit Cost: ${peso(item.unitCost)}<br>
                    &nbsp;&nbsp;Supplier Credit: -${peso(item.supplierCredit)}<br>
                    &nbsp;&nbsp;Expiry: ${escapeHtml(item.expiryDate)}<br>
                    &nbsp;&nbsp;Remarks: ${escapeHtml(item.remarks || 'None')}
                </div>
                <div class="dash"></div>
            `).join('')}
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
                    &nbsp;&nbsp;Accepted: ${item.goodQty}<br>
                    &nbsp;&nbsp;Damaged: ${item.damagedQty} (${escapeHtml(receiptDamageLabel(item))})
                </div>
                <div class="dash"></div>
            `).join('')}
            <div class="title">SUMMARY</div>
            <div class="line"><span>Items Ordered</span><span>${totals.ordered}</span></div>
            <div class="line"><span>Items Accepted</span><span>${totals.accepted}</span></div>
            <div class="line"><span>Damaged</span><span>${totals.damaged}</span></div>
            <br>
            <div class="line"><span>Supplier Credit:</span><span>-${peso(report.supplierCredit)}</span></div>
            <div class="line"><span>Supplier Discount:</span><span>-${peso(report.supplierDiscount)}</span></div>
            <div class="final center">FINAL PAYMENT<br><strong>${peso(report.finalPayment)}</strong></div>
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
    const height = Math.max(180, 112 + (report.items.length * 26));
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
        add(`   Accepted: ${item.goodQty}`);
        add(`   Damaged: ${item.damagedQty} (${receiptDamageLabel(item)})`, { gap: 3 });
        dash();
    });
    add('SUMMARY', { center: true, bold: true, size: 10 });
    pair('Items Ordered', totals.ordered);
    pair('Items Accepted', totals.accepted);
    pair('Damaged', totals.damaged);
    y += 2;
    pair('Supplier Credit', `-${peso(report.supplierCredit)}`);
    pair('Supplier Discount', `-${peso(report.supplierDiscount)}`, { gap: 6 });
    add('FINAL PAYMENT', { center: true, bold: true, size: 11, gap: 1 });
    add(peso(report.finalPayment), { center: true, bold: true, size: 14, gap: 4 });
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
    try {
        const payload = receivePayload();
        PharmaUtils.modal.loading('Receiving Purchase Order...');
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/receive_purchase_order.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        PharmaUtils.modal.close();
        hideModal('receivePurchaseOrderModal');
        openReceiptPreview(receiptReportFromPayload(payload, data));
        await loadPurchaseOrders({ updateSummary: true });
        PharmaUtils.toast.success(data.message);
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to receive purchase order', err.message);
    }
}

async function openDeliveredReceipt(poId) {
    try {
        const order = await getPurchaseOrder(poId);
        openReceiptPreview(receiptReportFromOrder(order));
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

function initPurchaseOrders() {
    if (purchaseOrdersInitialized) return;
    purchaseOrdersInitialized = true;

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
    document.getElementById('po-purchase-unit')?.addEventListener('change', syncSelectedCreateDraftItemFromInputs);
    document.getElementById('po-units-per-purchase-unit')?.addEventListener('input', syncSelectedCreateDraftItemFromInputs);
    document.getElementById('edit-po-supplier-select')?.addEventListener('change', (event) => {
        editDraftItems.length = 0;
        selectedEditDraftIndex = null;
        clearEditProductEditor();
        renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
        loadSupplierProducts(event.target.value, 'edit-po-product-select');
    });
    document.getElementById('edit-po-product-select')?.addEventListener('change', (event) => {
        const option = event.target.options[event.target.selectedIndex];
        const item = draftItemFromOption(option, document.getElementById('edit-po-quantity')?.value || 1);
        const selectedIndex = Number.isInteger(selectedEditDraftIndex) ? selectedEditDraftIndex : editDraftItemIndex;
        showEditProductEditor(item, selectedIndex);
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
    document.getElementById('btnSubmitPo')?.addEventListener('click', submitPurchaseOrder);
    document.getElementById('btnUpdatePo')?.addEventListener('click', updatePurchaseOrder);
    document.getElementById('btnConfirmReceivePo')?.addEventListener('click', submitReceivePurchaseOrder);
    document.getElementById('btnSaveReturnDamage')?.addEventListener('click', submitReturnDamage);
    const statusFilter = document.getElementById('po-status-filter');
    const params = new URLSearchParams(window.location.search);
    const initialPoView = purchaseOrderViewFromUrl();
    const queryStatus = initialPoView === 'active' ? (params.get('status') || '') : '';
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
    document.getElementById('table-receive-items')?.addEventListener('input', (event) => {
        if (event.target.closest('.receive-qty-input, .damaged-qty-input')) {
            if (Number(event.target.value || 0) < 0) event.target.value = '0';
            renderReceivePaymentSummary();
        }
    });
    document.getElementById('table-receive-items')?.addEventListener('change', (event) => {
        if (event.target.closest('.damage-action-input')) renderReceivePaymentSummary();
    });
    document.getElementById('createPurchaseOrderModal')?.addEventListener('hidden.bs.modal', resetCreateDraft);
    document.getElementById('table-po-items')?.addEventListener('click', (event) => {
        const button = event.target.closest('.remove-po-item');
        if (!button) return;
        removeCreateDraftItem(Number(button.dataset.index));
    });
    document.getElementById('po-selected-product-panel')?.addEventListener('click', (event) => {
        const editButton = event.target.closest('.po-summary-edit-item');
        const removeButton = event.target.closest('.po-summary-remove-item');
        const summaryItem = event.target.closest('.po-summary-item[data-index]');

        if (editButton) {
            editCreateDraftItemFromSummary(Number(editButton.dataset.index));
            return;
        }

        if (removeButton) {
            removeCreateDraftItem(Number(removeButton.dataset.index));
            return;
        }

        if (summaryItem) {
            selectedCreateDraftIndex = Number(summaryItem.dataset.index);
            renderSelectedProductPanel();
        }
    });
    document.getElementById('po-selected-product-panel')?.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        const summaryItem = event.target.closest('.po-summary-item[data-index]');
        if (!summaryItem) return;
        event.preventDefault();
        selectedCreateDraftIndex = Number(summaryItem.dataset.index);
        renderSelectedProductPanel();
    });
    document.getElementById('table-edit-po-items')?.addEventListener('click', (event) => {
        const editButton = event.target.closest('.edit-po-item');
        const removeButton = event.target.closest('.remove-edit-po-item');

        if (editButton) {
            const index = Number(editButton.dataset.index);
            showEditProductEditor(editDraftItems[index], index);
            return;
        }

        if (removeButton) {
            const index = Number(removeButton.dataset.index);
            editDraftItems.splice(index, 1);
            if (selectedEditDraftIndex === index) {
                selectedEditDraftIndex = editDraftItems.length ? Math.min(index, editDraftItems.length - 1) : null;
            } else if (Number.isInteger(selectedEditDraftIndex) && selectedEditDraftIndex > index) {
                selectedEditDraftIndex -= 1;
            }
            if (Number.isInteger(selectedEditDraftIndex)) {
                showEditProductEditor(editDraftItems[selectedEditDraftIndex], selectedEditDraftIndex);
            } else {
                clearEditProductEditor();
            }
            renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
            return;
        }

        const row = event.target.closest('tr[data-index]');
        if (row) {
            const index = Number(row.dataset.index);
            showEditProductEditor(editDraftItems[index], index);
        }
    });
    document.getElementById('table-purchase-orders')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('.view-po-btn');
        const editButton = event.target.closest('.edit-po-btn');
        const statusButton = event.target.closest('.status-po-btn');
        const receiveButton = event.target.closest('.receive-po-btn');
        const receiptButton = event.target.closest('.receipt-po-btn');
        if (viewButton) openViewPurchaseOrder(viewButton.dataset.poId);
        if (editButton) openEditPurchaseOrder(editButton.dataset.poId);
        if (statusButton) updatePurchaseOrderStatusFromTable(statusButton.dataset.poId);
        if (receiveButton) openReceivePurchaseOrder(receiveButton.dataset.poId);
        if (receiptButton) openDeliveredReceipt(receiptButton.dataset.poId);
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

initPurchaseOrders();

export { initPurchaseOrders, loadPOSuppliers, loadSupplierProducts, loadPurchaseOrders };
