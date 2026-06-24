import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const STATUS_META = {
    'Pending': '#f59e0b',
    'Approved by the owner': '#2563eb',
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
    const strength = compactMeasurement(item.strength_size_display || item.strength_size_value || item.strength || item.strength_value);
    const netWeight = compactMeasurement(item.weight_volume_value);
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

    return [brand, productLabel].filter(Boolean).join(' - ') || rawProduct || 'Unnamed product';
}

function productOptionDetail(product) {
    const size = productSizeValue(product);
    const packaging = productPackagingValue(product);
    return [size, packaging].filter(Boolean).join(' \u2022 ');
}

function productCoreName(item) {
    const brand = cleanText(item.brand_name);
    const productName = cleanText(item.product_name);
    const rawVariant = cleanText(item.variant_flavor);
    const variant = rawVariant.length <= 24 ? rawVariant : '';
    const tableName = cleanText(item.product_display_name);
    const size = productSizeValue(item);
    const swappedBrand = productName && brand && !productName.toLowerCase().includes(brand.toLowerCase()) && !brand.toLowerCase().includes(productName.toLowerCase()) && !productName.includes(' ') && brand.includes(' ');
    const rawProduct = swappedBrand ? brand : removeBrandPrefix(productName, brand);
    let name = rawProduct;

    if (variant && !name.toLowerCase().includes(variant.toLowerCase())) {
        name = [name, variant].filter(Boolean).join(' ');
    }

    if (!name) name = tableName || rawProduct || cleanText(item.product_name);
    if (size) {
        const escapedSize = size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        name = name.replace(new RegExp(`\\s*${escapedSize}\\s*$`, 'i'), '').trim();
    }

    return name || tableName || cleanText(item.product_name);
}

function poBrandName(item) {
    const brand = cleanText(item.brand_display_name || item.brand_name);
    const productName = cleanText(item.product_name);
    const swappedBrand = productName && brand && !productName.toLowerCase().includes(brand.toLowerCase()) && !brand.toLowerCase().includes(productName.toLowerCase()) && !productName.includes(' ') && brand.includes(' ');
    return swappedBrand ? productName : brand;
}

function productSizeValue(item) {
    const category = cleanText(item.category_name).toLowerCase();
    if (category === 'grocery') {
        return compactMeasurement(item.weight_volume_value || item.size_display || item.size_value);
    }

    return compactMeasurement(
        item.strength_size_display
        || item.strength_size_value
        || item.strength_value
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
    const supplierPackage = suppliedUnit || packaging || unitDisplayFromDetails(item) || 'Unit';
    const pack = parsePackContent(item.pack_content || item.pack_content_unit || '');
    const quantity = suppliedQty > 0 ? suppliedQty : (pack.quantity || 1);
    const inventoryUnit = cleanText(item.unit) || unitDisplayFromDetails(item) || pack.unit || 'pcs';
    const containerText = pluralizeUnit(inventoryUnit, quantity);
    const packageText = displayText(supplierPackage);
    const unitLabel = quantity > 1 ? `${packageText} (${quantity} ${containerText})` : packageText;
    const conversion = `1 ${packageText} contains ${quantity} ${containerText}`;

    return {
        label: unitLabel || 'Unit',
        conversion,
        purchaseUnit: packageText,
        quantity,
        stockUnit: containerText,
        packaging: displayText(packaging),
        containsLabel: `${quantity} ${containerText}`
    };
}

function productTableName(item) {
    return cleanText(item.product_display_name) || productDisplayParts(item).product || cleanText(item.product_name);
}

function productTableBrand(item) {
    return cleanText(item.brand_display_name) || productDisplayParts(item).brand || cleanText(item.brand_name);
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
    const weight = [cleanText(item.weight_volume_value), cleanText(item.weight_volume_unit)].filter(Boolean).join(' ');
    const volume = [cleanText(item.volume_value), cleanText(item.volume_unit)].filter(Boolean).join(' ');
    return weight || volume || cleanText(item.size_value);
}

function statusBadge(status) {
    const color = STATUS_META[status] || '#64748b';
    return `<span class="badge status-badge text-white" style="background:${color}">${escapeHtml(status)}</span>`;
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
            if (isLiquid) {
                return cleanText([item.volume_value, item.volume_unit].filter(Boolean).join(' ') || item.strength);
            }

            return cleanText([item.strength_value, item.strength_unit].filter(Boolean).join(' ') || item.strength);
        }

        return item.weight_volume_value
            ? cleanText([item.weight_volume_value, item.weight_volume_unit].filter(Boolean).join(' '))
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
    const totalInventoryQty = createDraftItems.reduce((total, item) => total + inventoryQtyForItem(item), 0);
    const estimatedCost = createDraftItems.reduce((total, item) => total + productLineTotal(item), 0);

    summary.innerHTML = `
        <div><span>Total Items</span><strong>${totalItems}</strong></div>
        <div><span>Total Purchase Units</span><strong>${totalPurchaseUnits}</strong></div>
        <div><span>Total Inventory Quantity</span><strong>${totalInventoryQty} pcs</strong></div>
        <div><span>Estimated Purchase Cost</span><strong>${peso(estimatedCost)}</strong></div>
    `;
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

function renderSelectedProductPanel() {
    const panel = document.getElementById('po-selected-product-panel');
    if (!panel) return;

    const item = selectedOptionItem('po-product-select');
    if (!item) {
        panel.classList.remove('is-visible');
        panel.innerHTML = '';
        return;
    }

    const onHand = Number(item.stock || 0);
    const reorderLevel = 10;
    const suggestedOrder = Math.max(0, reorderLevel - onHand);
    const overrides = readPurchaseUnitOverrides('po');
    const purchaseUnit = purchaseUnitInfo({
        ...item,
        purchase_unit: overrides.purchaseUnit || item.purchase_unit,
        units_per_purchase_unit: overrides.unitsPerPurchaseUnit || item.units_per_purchase_unit,
        purchase_unit_qty: overrides.unitsPerPurchaseUnit || item.purchase_unit_qty
    });
    const orderQty = Math.max(1, Number(document.getElementById('po-quantity')?.value || 1));
    const inventoryQtyOrdered = orderQty * purchaseUnit.quantity;
    const unit = item.unit || unitDisplayFromDetails(item);
    const packaging = item.packaging || purchaseUnit.packaging || '';
    const packageSameAsUnit = sameText(unit, packaging);
    const supplierSameAsPackaging = sameText(purchaseUnit.purchaseUnit, packaging);
    const supplierSameAsUnit = sameText(purchaseUnit.purchaseUnit, unit);
    const showUnit = unit && !(packageSameAsUnit && supplierSameAsUnit);
    const showPackaging = packaging && !(packageSameAsUnit && supplierSameAsPackaging);
    const productMetrics = [
        infoMetric('Brand', poBrandName(item)),
        infoMetric('Product', productCoreName(item)),
        infoMetric('Size', productSizeValue(item)),
        showUnit ? infoMetric('Unit', unit) : '',
        showPackaging ? infoMetric('Packaging', packaging) : ''
    ].filter(Boolean).join('');

    panel.innerHTML = `
        <div class="po-selected-product-grid">
            ${productMetrics}
        </div>
        <div class="po-selected-product-grid">
            <div class="po-info-metric"><span>Shelf Stock</span><strong>${Number(item.shelf_stock || 0)}</strong></div>
            <div class="po-info-metric"><span>Storage Stock</span><strong>${Number(item.storage_stock || 0)}</strong></div>
            <div class="po-info-metric"><span>On Hand</span><strong>${onHand}</strong></div>
            <div class="po-info-metric"><span>Purchase Cost</span><strong>${peso(item.price)}</strong></div>
            <div class="po-info-metric"><span>Selling Price</span><strong>${peso(item.selling_price || item.price)}</strong></div>
        </div>
        <div class="po-selected-product-grid">
            <div class="po-info-metric"><span>Supplier Package</span><strong>${escapeHtml(purchaseUnit.purchaseUnit || 'pcs')}</strong></div>
            <div class="po-info-metric"><span>Contains</span><strong>${escapeHtml(purchaseUnit.containsLabel)}</strong></div>
            <div class="po-info-metric"><span>Qty Ordered</span><strong>${orderQty} ${escapeHtml(pluralizeUnit(purchaseUnit.purchaseUnit, orderQty))}</strong></div>
            <div class="po-info-metric"><span>Inventory Qty</span><strong>${inventoryQtyOrdered} ${escapeHtml(purchaseUnit.stockUnit || 'pcs')}</strong></div>
            <div class="po-info-metric"><span>Reorder Level</span><strong>${reorderLevel}</strong></div>
            <div class="po-info-metric"><span>Suggested Order</span><strong>${suggestedOrder}</strong></div>
        </div>
        <div class="po-reorder-note">${escapeHtml(purchaseUnit.conversion)}</div>
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
    const editor = document.getElementById('edit-po-product-editor');
    if (editor) editor.classList.add('d-none');
    setValue('edit-po-editor-index', '');
    setValue('edit-po-editor-product-id', '');
    const button = document.getElementById('btnEditAddPoItem');
    if (button) button.textContent = 'Add Item';
}

function showEditProductEditor(item, index = null) {
    const editor = document.getElementById('edit-po-product-editor');
    if (!editor || !item) return;

    const medicine = isMedicineItem(item);
    editDraftItemIndex = Number.isInteger(index) ? index : null;
    editor.classList.remove('d-none');

    document.getElementById('edit-po-product-editor-title').textContent = editDraftItemIndex === null
        ? `Selected Product: ${item.product_name || 'New item'}`
        : `Editing Item: ${item.product_name || 'PO item'}`;
    document.getElementById('edit-po-editor-generic-variant-label').textContent = medicine ? 'Generic Name' : 'Variant / Flavor';
    document.getElementById('edit-po-editor-strength-size-label').textContent = medicine ? 'Strength' : 'Size';
    document.getElementById('edit-po-editor-packaging-label').textContent = medicine ? 'Size / Packaging' : 'Packaging';

    setValue('edit-po-editor-index', editDraftItemIndex === null ? '' : String(editDraftItemIndex));
    setValue('edit-po-editor-product-id', item.product_id);
    setValue('edit-po-editor-product-name', item.product_name);
    setValue('edit-po-editor-brand-name', item.brand_name);
    setValue('edit-po-editor-category-name', item.category_name);
    setValue('edit-po-editor-type-name', item.type_name);
    setValue('edit-po-editor-generic-variant', medicine ? item.generic_name : item.variant_flavor);
    setValue('edit-po-editor-strength-size', medicine ? item.strength : item.size_value);
    setValue('edit-po-editor-unit', item.unit);
    setValue('edit-po-editor-packaging', medicine ? (item.size_value || item.packaging) : item.packaging);
    setValue('edit-po-editor-price', money(item.price));
    setValue('edit-po-editor-quantity', item.quantity || 1);
    setValue('edit-po-quantity', item.quantity || 1);

    const productSelect = document.getElementById('edit-po-product-select');
    if (productSelect && item.product_id) productSelect.value = item.product_id;

    const button = document.getElementById('btnEditAddPoItem');
    if (button) button.textContent = editDraftItemIndex === null ? 'Add Item' : 'Update Item';
}

function readEditProductEditor() {
    const productId = getValue('edit-po-editor-product-id') || document.getElementById('edit-po-product-select')?.value || '';
    const quantity = Number(getValue('edit-po-editor-quantity') || document.getElementById('edit-po-quantity')?.value || 0);
    const price = Number(getValue('edit-po-editor-price') || 0);
    const categoryName = getValue('edit-po-editor-category-name');
    const medicine = categoryName.trim().toLowerCase() === 'medicine';
    const genericOrVariant = getValue('edit-po-editor-generic-variant');
    const strengthOrSize = getValue('edit-po-editor-strength-size');
    const packaging = getValue('edit-po-editor-packaging');

    if (!productId || quantity <= 0 || price < 0) {
        throw new Error('Select a product and enter a valid quantity and price.');
    }
    const existingItem = editDraftItemIndex === null ? null : editDraftItems[editDraftItemIndex];
    const selectedOption = document.getElementById('edit-po-product-select')?.selectedOptions?.[0] || null;
    const optionItem = selectedOption ? draftItemFromOption(selectedOption, quantity) : null;
    const unitsPerPurchaseUnit = Number(existingItem?.units_per_purchase_unit || optionItem?.units_per_purchase_unit || 1);

    return {
        po_item_id: editDraftItemIndex === null ? null : (editDraftItems[editDraftItemIndex]?.po_item_id || null),
        product_id: productId,
        product_name: getValue('edit-po-editor-product-name'),
        brand_name: getValue('edit-po-editor-brand-name'),
        category_name: categoryName,
        type_name: getValue('edit-po-editor-type-name'),
        generic_name: medicine ? genericOrVariant : '',
        variant_flavor: medicine ? '' : genericOrVariant,
        strength: medicine ? strengthOrSize : '',
        strength_value: medicine ? strengthOrSize : '',
        strength_unit: '',
        volume_value: '',
        volume_unit: '',
        size_value: medicine ? packaging : strengthOrSize,
        weight_volume_value: medicine ? '' : strengthOrSize,
        weight_volume_unit: '',
        unit: getValue('edit-po-editor-unit'),
        packaging,
        purchase_unit: existingItem?.purchase_unit || optionItem?.purchase_unit || getValue('edit-po-editor-unit') || 'pcs',
        units_per_purchase_unit: unitsPerPurchaseUnit,
        purchase_unit_qty: unitsPerPurchaseUnit,
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
        } else {
            editDraftItems[editDraftItemIndex] = item;
        }

        clearEditProductEditor();
        setValue('edit-po-quantity', '1');
        renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
    } catch (err) {
        PharmaUtils.toast.error(err.message);
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
        table.style.minWidth = view === 'delivered' ? '1660px' : (view === 'arrived' ? '1320px' : '2020px');
    }

    if (view === 'arrived') {
        const nextHead = `
            <tr>
                <th class="col-date">Order Date</th>
                <th class="col-po-number">PO Number</th>
                <th class="col-supplier">Supplier</th>
                <th class="col-brand">Brand</th>
                <th class="col-items">Product</th>
                <th class="col-qty">Qty Ordered</th>
                <th class="col-terms">Payment Terms</th>
                <th class="col-delivery">Expected Delivery Date</th>
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
                <th class="col-date">Delivery Date</th>
                <th class="col-po-number">PO Number</th>
                <th class="col-supplier">Supplier</th>
                <th class="col-brand">Brand</th>
                <th class="col-items">Product</th>
                <th class="col-qty">Qty Ordered</th>
                <th class="col-received">Received Qty</th>
                <th class="col-money">Total Amount</th>
                <th class="col-money">Final Payment</th>
                <th class="col-payment-status">Payment Status</th>
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
            <th class="col-date">Order Date</th>
            <th class="col-supplier">Supplier</th>
            <th class="col-brand">Brand</th>
            <th class="col-items">Product</th>
            <th class="col-category">Category</th>
            <th class="col-type">Product Type</th>
            <th class="col-qty">Qty Ordered</th>
            <th class="col-purchase-unit">Purchase Unit</th>
            <th class="col-inventory-qty">Inventory Qty</th>
            <th class="col-terms">Payment Terms</th>
            <th class="col-delivery">Expected Delivery Date</th>
            <th class="col-money">Total Amount</th>
            <th class="col-money">Final Payment</th>
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
        commitPurchaseOrderTable('active', tableEmpty(15, 'No active purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = items.length ? items.map((item) => productTableName(item)) : (order.item_names || []);
        const brandNames = items.length ? items.map((item) => productTableBrand(item)) : (order.brand_names || []);
        const categories = items.map((item) => cleanText(item.category_name) || '-');
        const types = items.map((item) => cleanText(item.type_name) || '-');
        const quantities = items.length ? items.map((item) => Number(item.purchase_qty || item.quantity || 0)) : (order.quantities || []);
        const purchaseUnits = items.map((item) => purchaseUnitInfo(item).label);
        const inventoryQuantities = items.map((item) => {
            const purchaseUnit = purchaseUnitInfo(item);
            return `${Number(item.inventory_qty_ordered || inventoryQtyForItem(item) || 0)} ${purchaseUnit.stockUnit || 'pcs'}`;
        });

        return `
        <tr>
            <td>${formatDate(order.order_date)}</td>
            <td>${escapeHtml(order.supplier_name)}</td>
            <td>${numberedList(brandNames)}</td>
            <td>${numberedList(itemNames)}</td>
            <td>${numberedList(categories)}</td>
            <td>${numberedList(types)}</td>
            <td>${numberedList(quantities, { plain: true })}</td>
            <td>${numberedList(purchaseUnits)}</td>
            <td>${numberedList(inventoryQuantities, { plain: true })}</td>
            <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
            <td>${formatDate(order.expected_delivery_date)}</td>
            <td><span class="po-money">${peso(order.total_amount)}</span></td>
            <td><span class="po-money">${peso(order.final_payment)}</span></td>
            <td>${statusBadge(order.status)}</td>
            <td>
                <div class="po-actions">
                    <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number)}">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary edit-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Edit ${escapeHtml(order.po_number)}">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');

    commitPurchaseOrderTable('active', bodyHtml);
}

function renderArrivedPurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable('arrived', tableEmpty(10, 'No arrived purchase orders ready for receiving.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = items.length ? items.map((item) => productTableName(item)) : (order.item_names || []);
        const brandNames = items.length ? items.map((item) => productTableBrand(item)) : (order.brand_names || []);
        const quantities = order.quantities || (order.items || []).map((item) => item.quantity);

        return `
            <tr>
                <td>${formatDate(order.order_date)}</td>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td>${numberedList(brandNames)}</td>
                <td>${numberedList(itemNames)}</td>
                <td>${numberedList(quantities, { plain: true })}</td>
                <td>${escapeHtml(order.payment_terms || 'Not set')}</td>
                <td>${formatDate(order.expected_delivery_date)}</td>
                <td>${statusBadge(order.status || 'Arrived')}</td>
                <td>
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number || '')}">
                            <i class="fa-regular fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-success receive-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="Receive ${escapeHtml(order.po_number || '')}">
                            <i class="fa-solid fa-boxes-packing"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    commitPurchaseOrderTable('arrived', bodyHtml);
}

function renderDeliveredPurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable('delivered', tableEmpty(12, 'No delivered purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const items = order.items || [];
        const itemNames = items.length ? items.map((item) => productTableName(item)) : (order.item_names || []);
        const brandNames = items.length ? items.map((item) => productTableBrand(item)) : (order.brand_names || []);
        const orderedQuantities = order.quantities || items.map((item) => item.quantity);
        const receivedQuantities = items.map((item) => Number(item.received_quantity || 0));
        const deliveryDate = order.delivery_date || order.received_date || order.expected_delivery_date || order.order_date;

        return `
            <tr>
                <td>${formatDate(deliveryDate)}</td>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td>${numberedList(brandNames)}</td>
                <td>${numberedList(itemNames)}</td>
                <td>${numberedList(orderedQuantities, { plain: true })}</td>
                <td>${numberedList(receivedQuantities, { plain: true })}</td>
                <td><span class="po-money">${peso(order.total_amount)}</span></td>
                <td><span class="po-money">${peso(order.final_payment)}</span></td>
                <td>${escapeHtml(order.payment_state || order.payment_status || 'Unpaid')}</td>
                <td>${statusBadge('Delivered')}</td>
                <td>
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number || '')}">
                            <i class="fa-regular fa-eye"></i>
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
                : (statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''));
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_orders.php${query}`);

        if (loadToken !== purchaseOrdersLoadToken || viewAtRequest !== currentPoView) return;

        let orders = data.purchase_orders || [];
        if (viewAtRequest === 'active' && !statusFilter && orders.length === 0) {
            const activeCount = ['Pending', 'Approved by the owner', 'In transit', 'Arrived']
                .reduce((total, status) => total + Number(data.status_counts?.[status] || 0), 0);

            if (activeCount > 0) {
                const fallback = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_orders.php?scope=all&t=${Date.now()}`);
                if (loadToken !== purchaseOrdersLoadToken || viewAtRequest !== currentPoView) return;
                orders = (fallback.purchase_orders || []).filter((order) =>
                    ['Pending', 'Approved by the owner', 'In transit', 'Arrived'].includes(order.status)
                );
                data.status_counts = fallback.status_counts || data.status_counts;
            }
        }

        if (updateSummary) renderStatusSummary(data.status_counts || {});
        if (viewAtRequest === 'arrived') {
            renderArrivedPurchaseOrders(orders);
        } else if (viewAtRequest === 'delivered') {
            renderDeliveredPurchaseOrders(orders);
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
        else renderActivePurchaseOrders([]);
        PharmaUtils.toast.error(err.message);
    }
}

function setPurchaseOrderView(view) {
    const nextView = ['active', 'arrived', 'delivered'].includes(view) ? view : 'active';
    if (currentPoView === nextView) return;

    currentPoView = nextView;
    document.querySelectorAll('.po-view-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.poView === nextView);
    });

    const filter = document.getElementById('po-status-filter');
    if (filter) {
        filter.disabled = nextView !== 'active';
        if (nextView !== 'active') filter.value = '';
    }

    loadPurchaseOrders({ updateSummary: false });
}

function renderDraftItems(items, tableSelector, removeClass) {
    const tableBody = document.querySelector(`${tableSelector} tbody`);
    if (!tableBody) return;

    if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="14" class="text-center text-muted py-4">No items added yet.</td></tr>';
        if (tableSelector === '#table-po-items') updateCreateSummary();
        return;
    }

    const isEditTable = tableSelector === '#table-edit-po-items';
    tableBody.innerHTML = items.map((item, index) => {
        const purchaseUnit = purchaseUnitInfo(item);
        const unit = item.unit || unitDisplayFromDetails(item);
        const packaging = item.packaging || purchaseUnit.packaging || '';
        const supplierPackage = purchaseUnit.purchaseUnit || '';
        const unitCell = sameText(unit, packaging) && sameText(unit, supplierPackage) ? '' : unit;

        return `
        <tr>
            <td>${escapeHtml(poBrandName(item))}</td>
            <td>${escapeHtml(productCoreName(item))}</td>
            <td>${escapeHtml(cleanText(item.category_name) || '-')}</td>
            <td>${escapeHtml(cleanText(item.type_name) || '-')}</td>
            <td>${escapeHtml(productSizeValue(item) || '-')}</td>
            <td>${escapeHtml(unitCell || '-')}</td>
            <td>${escapeHtml(packaging || '-')}</td>
            <td>${escapeHtml(purchaseUnit.label)}</td>
            <td>${escapeHtml(item.purchase_qty || item.quantity)}</td>
            <td>${escapeHtml(`${purchaseUnit.quantity} ${pluralizeUnit(purchaseUnit.stockUnit, purchaseUnit.quantity)}`)}</td>
            <td>${escapeHtml(`${inventoryQtyForItem(item)} ${purchaseUnit.stockUnit}`)}</td>
            <td>${peso(item.price)}</td>
            <td>${peso(productLineTotal(item))}</td>
            <td>
                <div class="po-actions">
                    ${isEditTable ? `<button class="btn btn-sm btn-outline-secondary edit-po-item" type="button" data-index="${index}" aria-label="Edit item"><i class="fa-solid fa-pen"></i></button>` : ''}
                    <button class="btn btn-sm btn-outline-danger ${removeClass}" type="button" data-index="${index}" aria-label="Remove item"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
    if (tableSelector === '#table-po-items') updateCreateSummary();
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
        existing.purchase_qty = Number(existing.purchase_qty || existing.quantity || 0) + quantity;
        if (overrides.purchaseUnit) existing.purchase_unit = overrides.purchaseUnit;
        if (overrides.unitsPerPurchaseUnit) {
            existing.units_per_purchase_unit = overrides.unitsPerPurchaseUnit;
            existing.purchase_unit_qty = overrides.unitsPerPurchaseUnit;
        }
        existing.quantity = existing.purchase_qty;
        existing.inventory_qty_ordered = inventoryQtyForItem(existing);
    } else {
        items.push(draftItemFromOption(option, quantity, overrides));
    }

    quantityInput.value = '1';
    renderDraftItems(items, tableSelector, removeClass);
    if (productSelectId === 'po-product-select') renderSelectedProductPanel();
}

function resetCreateDraft() {
    createDraftItems.length = 0;
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
        payload.status = document.getElementById('edit-po-status')?.value || 'Pending';
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

async function openViewPurchaseOrder(poId) {
    try {
        const order = await getPurchaseOrder(poId);
        document.getElementById('viewPoNumber').textContent = order.po_number;
        document.getElementById('viewPoDetails').innerHTML = `
            <div class="po-detail-box"><span>Supplier</span><strong>${escapeHtml(order.supplier_name)}</strong></div>
            <div class="po-detail-box"><span>Order Date</span><strong>${formatDate(order.order_date)}</strong></div>
            <div class="po-detail-box"><span>Payment Terms</span><strong>${escapeHtml(order.payment_terms)}</strong></div>
            <div class="po-detail-box"><span>Expected Delivery</span><strong>${formatDate(order.expected_delivery_date)}</strong></div>
            <div class="po-detail-box"><span>Total Amount</span><strong>${peso(order.total_amount)}</strong></div>
            <div class="po-detail-box"><span>Final Payment</span><strong>${peso(order.final_payment)}</strong></div>
            <div class="po-detail-box"><span>Payment State</span><strong>${escapeHtml(order.payment_state || 'Unpaid')}</strong></div>
            <div class="po-detail-box"><span>Status</span><strong>${escapeHtml(order.status)}</strong></div>
        `;
        document.getElementById('viewPoItems').innerHTML = order.items.map((item) => `
            <tr>
                <td>${escapeHtml(item.product_name)}</td>
                <td>${escapeHtml(item.brand_name)}</td>
                <td>${escapeHtml(cleanText(item.category_name) || '-')}</td>
                <td>${escapeHtml(cleanText(item.type_name) || '-')}</td>
                <td>${escapeHtml(productDetailValue(item, 'genericVariant') || '-')}</td>
                <td>${escapeHtml(productDetailValue(item, 'strengthSize') || '-')}</td>
                <td>${escapeHtml(cleanText(item.unit) || '-')}</td>
                <td>${escapeHtml(productDetailValue(item, 'packaging') || '-')}</td>
                <td>${money(item.price)}</td>
                <td>${escapeHtml(item.inventory_qty_ordered || item.quantity)}</td>
                <td>${escapeHtml(item.received_quantity || 0)}</td>
                <td>
                    ${escapeHtml(item.damaged_quantity || 0)}
                    ${Number(item.returned_quantity || 0) > 0 ? `
                        <div class="small text-danger fw-bold mt-1" title="${escapeHtml(item.return_reasons || '')}">
                            Returned: ${escapeHtml(item.returned_quantity)} damaged
                        </div>
                        <div class="small text-muted">${escapeHtml(item.return_reasons || 'No reason')}</div>
                    ` : ''}
                </td>
                <td>${peso(item.returned_amount)}</td>
                <td>${peso(productLineTotal(item))}</td>
            </tr>
        `).join('');
        showModal('viewPurchaseOrderModal');
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

async function openEditPurchaseOrder(poId) {
    try {
        const order = await getPurchaseOrder(poId);
        document.getElementById('edit-po-id').value = order.po_id;
        document.getElementById('editPoNumber').textContent = order.po_number;
        renderSupplierOptions(document.getElementById('edit-po-supplier-select'), order.supplier_id);
        await loadSupplierProducts(order.supplier_id, 'edit-po-product-select');
        document.getElementById('edit-po-payment-terms').value = order.payment_terms || 'Cash';
        document.getElementById('edit-po-expected-delivery').value = order.expected_delivery_date || '';
        document.getElementById('edit-po-status').value = order.status || 'Pending';
        editDraftItems.length = 0;
        order.items.forEach((item) => editDraftItems.push({
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
            quantity: Number(item.purchase_qty || item.quantity || 0)
        }));
        clearEditProductEditor();
        renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
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
        PharmaUtils.modal.close();
        hideModal('editPurchaseOrderModal');
        await PharmaUtils.modal.success('Purchase Order Updated', 'The purchase order was updated successfully.');
        await loadPurchaseOrders({ updateSummary: true });
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to update purchase order', err.message);
    }
}

async function updatePurchaseOrderStatusFromTable(poId, nextStatus) {
    try {
        if (!poId || !nextStatus) return;

        const confirmText = nextStatus === 'In transit'
            ? 'Move this approved order to In transit?'
            : 'Mark this purchase order as Arrived?';

        if (window.Swal) {
            const result = await Swal.fire({
                title: confirmText,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Yes, update it',
                confirmButtonColor: '#7c3aed'
            });

            if (!result.isConfirmed) return;
        } else if (!confirm(confirmText)) {
            return;
        }

        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/update_purchase_order_status.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ po_id: poId, status: nextStatus })
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

    body.innerHTML = order.items.map((item) => `
        <tr data-po-item-id="${escapeHtml(item.po_item_id)}">
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.brand_name)}</td>
            <td>${escapeHtml(item.inventory_qty_ordered || item.quantity)}</td>
            <td><input class="form-control form-control-sm receive-qty-input" type="number" min="0" max="${escapeHtml(item.inventory_qty_ordered || item.quantity)}" value="${escapeHtml(item.inventory_qty_ordered || item.quantity)}"></td>
            <td><input class="form-control form-control-sm damaged-qty-input" type="number" min="0" max="${escapeHtml(item.inventory_qty_ordered || item.quantity)}" value="${escapeHtml(item.damaged_quantity || 0)}"></td>
            <td><input class="form-control form-control-sm receive-remarks-input" type="text" value=""></td>
        </tr>
    `).join('');
}

function orderTotal(order) {
    if (Number(order?.total_amount || 0) > 0) {
        return Number(order.total_amount);
    }

    return (order?.items || []).reduce((total, item) => total + productLineTotal(item), 0);
}

function receivePaymentSummary() {
    const originalTotal = (activeReceiveOrder?.items || []).reduce((total, item) => total + productLineTotal(item), 0);
    const additionalAmount = Number(document.getElementById('receiveAdditionalAmount')?.value || 0);
    let damageDeduction = 0;
    let hasDamage = false;

    document.querySelectorAll('#table-receive-items tbody tr').forEach((row) => {
        const poItemId = row.dataset.poItemId;
        const orderItem = activeReceiveOrder?.items.find((item) => String(item.po_item_id) === String(poItemId));
        const damagedQuantity = Number(row.querySelector('.damaged-qty-input')?.value || 0);
        const unitPrice = Number(orderItem?.price || 0);

        if (damagedQuantity > 0) hasDamage = true;
        damageDeduction += Math.max(0, damagedQuantity) * unitPrice;
    });

    const subtotalPayable = Math.max(0, originalTotal - damageDeduction);
    const finalAmount = subtotalPayable + Math.max(0, additionalAmount);

    return {
        originalTotal,
        damageDeduction,
        additionalAmount,
        finalAmount,
        hasDamage
    };
}

function renderReceivePaymentSummary() {
    const summary = receivePaymentSummary();
    const original = document.getElementById('receiveOriginalTotal');
    const deduction = document.getElementById('receiveDamageDeduction');
    const finalAmount = document.getElementById('receiveFinalAmount');

    if (original) original.textContent = peso(summary.originalTotal);
    if (deduction) deduction.textContent = peso(summary.damageDeduction);
    if (finalAmount) finalAmount.textContent = peso(summary.finalAmount);
}

async function openReceivePurchaseOrder(poId) {
    try {
        activeReceiveOrder = await getPurchaseOrder(poId);
        document.getElementById('receivePoNumber').textContent = activeReceiveOrder.po_number;
        document.getElementById('receiveSupplierName').textContent = activeReceiveOrder.supplier_name;
        document.getElementById('receivePoRemarks').value = '';
        const additionalAmount = document.getElementById('receiveAdditionalAmount');
        const adjustmentReason = document.getElementById('receiveAdjustmentReason');
        if (additionalAmount) additionalAmount.value = '0';
        if (adjustmentReason) adjustmentReason.value = '';
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

    if (summary.additionalAmount < 0) {
        throw new Error('Additional amount cannot be negative.');
    }

    document.querySelectorAll('#table-receive-items tbody tr').forEach((row) => {
        const poItemId = row.dataset.poItemId;
        const orderItem = activeReceiveOrder.items.find((item) => String(item.po_item_id) === String(poItemId));
        const receivedQuantity = Number(row.querySelector('.receive-qty-input')?.value || 0);
        const damagedQuantity = Number(row.querySelector('.damaged-qty-input')?.value || 0);
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

        items.push({
            po_item_id: poItemId,
            received_quantity: receivedQuantity,
            damaged_quantity: damagedQuantity,
            remarks
        });
    });

    return {
        po_id: activeReceiveOrder.po_id,
        remarks: document.getElementById('receivePoRemarks')?.value || '',
        amount_paid: summary.finalAmount,
        additional_amount: summary.additionalAmount,
        adjustment_reason: document.getElementById('receiveAdjustmentReason')?.value || '',
        items
    };
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
        await loadPurchaseOrders({ updateSummary: true });
        PharmaUtils.toast.success(data.message);
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error('Failed to receive purchase order', err.message);
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

    document.getElementById('themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
    document.querySelector('[data-bs-target="#createPurchaseOrderModal"]')?.addEventListener('click', () => showModal('createPurchaseOrderModal'));
    document.querySelectorAll('[data-bs-dismiss="modal"]').forEach((button) => {
        button.addEventListener('click', () => hideModal(button.closest('.modal')?.id));
    });
    document.getElementById('po-supplier-select')?.addEventListener('change', (event) => {
        createDraftItems.length = 0;
        renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
        renderSelectedProductPanel();
        loadSupplierProducts(event.target.value, 'po-product-select');
    });
    document.getElementById('po-product-select')?.addEventListener('change', syncPurchaseUnitFieldsFromSelectedProduct);
    document.getElementById('po-quantity')?.addEventListener('input', renderSelectedProductPanel);
    document.getElementById('po-purchase-unit')?.addEventListener('change', renderSelectedProductPanel);
    document.getElementById('po-units-per-purchase-unit')?.addEventListener('input', renderSelectedProductPanel);
    document.getElementById('edit-po-supplier-select')?.addEventListener('change', (event) => {
        editDraftItems.length = 0;
        clearEditProductEditor();
        renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
        loadSupplierProducts(event.target.value, 'edit-po-product-select');
    });
    document.getElementById('edit-po-product-select')?.addEventListener('change', (event) => {
        const option = event.target.options[event.target.selectedIndex];
        const item = draftItemFromOption(option, document.getElementById('edit-po-quantity')?.value || 1);
        showEditProductEditor(item);
    });
    document.getElementById('edit-po-quantity')?.addEventListener('input', (event) => {
        const editorQuantity = document.getElementById('edit-po-editor-quantity');
        if (editorQuantity && !document.getElementById('edit-po-product-editor')?.classList.contains('d-none')) {
            editorQuantity.value = event.target.value;
        }
    });
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
    const queryStatus = new URLSearchParams(window.location.search).get('status') || '';
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
    document.getElementById('receiveAdditionalAmount')?.addEventListener('input', renderReceivePaymentSummary);
    document.getElementById('table-receive-items')?.addEventListener('input', (event) => {
        if (event.target.closest('.receive-qty-input, .damaged-qty-input')) {
            renderReceivePaymentSummary();
        }
    });
    document.getElementById('createPurchaseOrderModal')?.addEventListener('hidden.bs.modal', resetCreateDraft);
    document.getElementById('table-po-items')?.addEventListener('click', (event) => {
        const button = event.target.closest('.remove-po-item');
        if (!button) return;
        createDraftItems.splice(Number(button.dataset.index), 1);
        renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
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
            editDraftItems.splice(Number(removeButton.dataset.index), 1);
            clearEditProductEditor();
            renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
        }
    });
    document.getElementById('table-purchase-orders')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('.view-po-btn');
        const editButton = event.target.closest('.edit-po-btn');
        const receiveButton = event.target.closest('.receive-po-btn');
        if (viewButton) openViewPurchaseOrder(viewButton.dataset.poId);
        if (editButton) openEditPurchaseOrder(editButton.dataset.poId);
        if (receiveButton) openReceivePurchaseOrder(receiveButton.dataset.poId);
    });

    renderDraftItems(createDraftItems, '#table-po-items', 'remove-po-item');
    renderDraftItems(editDraftItems, '#table-edit-po-items', 'remove-edit-po-item');
    loadPOSuppliers();
    loadPurchaseOrders({ updateSummary: true });
}

initPurchaseOrders();

export { initPurchaseOrders, loadPOSuppliers, loadSupplierProducts, loadPurchaseOrders };
