import PharmaUtils from '../utils.js';
import { createLiveSync, publishDataUpdate } from './live_data.js?v=1';
import {
    datalist,
    getVariationRule,
    optionList as ruleOptionList
} from './variation_rules.js';
import {
    cleanProductSpecificationText,
    formatProductCatalogSpecificationLines,
    formatProductIdentityParts,
    formatProductSpecification,
    inventoryMedicineSpecificationParts,
    isPrescriptionProduct,
    normalizeProductSpecificationValues
} from './product_specification.js?v=12';
import { purchasingConversion } from './purchasing_conversion.js?v=2';
import { primaryAccessRole } from './rbac.js?v=6';
import { loadMeasurementUnits as loadSharedMeasurementUnits, measurementUnitsForContext, upsertMeasurementUnitCache } from './measurement_units.js?v=2';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const endpoint = (path) => `${API_BASE_URL}/${path}`;
let supplierProductRows = [];
let supplierCatalogPage = 1;
let supplierCatalogTotalPages = 1;
let supplierCatalogTotal = 0;
let supplierCatalogSearchTimer = null;
let supplierRows = [];
let pendingConfirmation = null;
let productTypeLoadToken = 0;
let editProductTypeLoadToken = 0;
let activeSupplierProductEdit = null;

function supplierCatalogCanModify() {
    return ['super_admin', 'admin'].includes(primaryAccessRole(window.__drpSession || {}));
}

function supplierCatalogCanViewCost() {
    return ['super_admin', 'admin', 'supervisor'].includes(primaryAccessRole(window.__drpSession || {}));
}

const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

function combineValueUnit(value, unit) {
    const cleanValue = String(value || '').trim();
    const cleanUnit = String(unit || '').trim();
    if (!cleanValue || cleanValue === 'N/A' || cleanValue === 'NULL') return '';
    return cleanUnit ? `${cleanValue} ${cleanUnit}` : cleanValue;
}

function cleanText(value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return ['N/A', 'NA', 'NULL', 'NONE'].includes(text.toUpperCase()) ? '' : text;
}

function displayText(value) {
    const text = cleanText(value);
    return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function displayOrNotSet(value) {
    return displayText(value) || 'Not set';
}

function displayUnit(value) {
    const unit = cleanText(value);
    const normalized = {
        ml: 'mL',
        l: 'L',
        mg: 'mg',
        mcg: 'mcg',
        kg: 'kg',
        g: 'g',
        iu: 'IU'
    };
    return normalized[unit.toLowerCase()] || unit;
}

function sameText(left, right) {
    return cleanText(left).toLowerCase() === cleanText(right).toLowerCase();
}

function compactMeasure(value, unit = '') {
    const cleanValue = cleanText(value);
    const cleanUnit = displayUnit(unit);
    if (!cleanValue) return '';
    return cleanUnit ? `${cleanValue}${cleanUnit}` : cleanValue;
}

function attributeNumber(value) {
    const text = cleanText(value);
    if (!text || !/^-?\d+(?:\.0+)?$|^-?\d+\.\d+$/.test(text)) return text;
    return String(Number(text));
}

function groceryNetWeightDisplay(product) {
    const weight = attributeNumber(product.weight_volume_value || product.net_weight);
    const unit = displayUnit(product.weight_volume_unit || product.grocery_unit || product.unit);
    if (!weight || !unit) return 'Not set';
    return `${weight} ${unit}`;
}

function medicineStrengthDisplay(product) {
    const value = attributeNumber(product.strength_value);
    const unit = displayUnit(product.strength_unit);
    if (value && unit) return `${value} ${unit}`;
    return cleanText(product.strength_size_display || product.strength_size_value || product.strength) || 'Not set';
}

function medicineNetContentDisplay(product) {
    const value = attributeNumber(product.net_content_value || product.volume_value);
    const unit = displayUnit(product.net_content_unit || product.volume_unit);
    if (!value || !unit) return 'Not set';
    return `${value} ${unit}`;
}

function splitLeadingNumber(value) {
    const text = cleanText(value);
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    return {
        quantity: match ? match[1] : '',
        unit: match ? cleanText(match[2]) : text
    };
}

function peso(value) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(Number(value || 0));
}

function formatDate(value) {
    const text = cleanText(value);
    if (!text) return 'Not available';
    const parsed = new Date(text.replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) return text;
    return new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(parsed);
}

function countLabel(value, singular, plural = `${singular}s`) {
    const count = Number(value || 0);
    return `${count} ${count === 1 ? singular : plural}`;
}

function pluralizeInventoryUnit(unit, quantity = 2) {
    const raw = cleanText(unit || 'unit');
    const lower = raw.toLowerCase();
    const fixed = {
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
        sachets: 'sachets'
    };
    const text = fixed[lower] || displayText(raw);
    if (Number(quantity) === 1 && text.toLowerCase() === 'pcs') return 'pc';
    if (Number(quantity) === 1 && ['cans', 'bottles', 'packs', 'sachets'].includes(text.toLowerCase())) {
        return text.replace(/s$/i, '');
    }
    if (Number(quantity) === 1 || /s$/i.test(text)) return text;
    if (/y$/i.test(text)) return text.replace(/y$/i, 'ies');
    return `${text}s`;
}

function singularInventoryUnit(unit) {
    return pluralizeInventoryUnit(unit, 1);
}

function supplierInventoryUnit(product, quantity = 2) {
    const baseUnit = cleanText(product.base_unit_name || product.inventory_unit);
    return pluralizeInventoryUnit(baseUnit || 'unit', quantity);
}

function packageContentUnitText(unit) {
    const text = cleanText(unit || 'unit');
    const lower = text.toLowerCase();
    if (['pc', 'pcs', 'piece', 'pieces'].includes(lower)) return 'pc';
    return displayText(text);
}

function inventoryQuantityLabel(quantity, unit) {
    const count = Math.max(1, Number(quantity || 1));
    const label = packageContentUnitText(unit);
    const normalized = label.toLowerCase();
    if (count === 1) return `1 ${label}`;
    if (normalized === 'pc') return `${count} pcs`;
    return `${count} ${pluralizeInventoryUnit(label, count)}`;
}

function supplierContainsLabel(product) {
    const contains = Math.max(1, Number(product.units_per_purchase_unit || 1));
    return inventoryQuantityLabel(contains, supplierInventoryUnit(product, contains));
}

function supplierConversionPreview(product) {
    return purchasingConversion({ ...product, inventory_unit: product.inventory_unit || supplierInventoryUnit(product, 1) }).summary;
}

function supplierPreviewDetails(product) {
    const conversion = purchasingConversion({ ...product, inventory_unit: product.inventory_unit || supplierInventoryUnit(product, 1) });
    const contains = conversion.baseQtyPerPurchaseUnit;
    const purchaseUnit = displayText(conversion.purchaseUnit) || 'Purchase Unit';
    const inventoryUnit = conversion.inventoryUnit;
    const packaging = product.package_type || product.packaging;
    const isWarning = sameText(purchaseUnit, packaging) && contains > 1;
    const line = inventoryQuantityLabel(contains, inventoryUnit);
    const unitLine = packageContentUnitText(inventoryUnit);

    return {
        purchaseUnit,
        containsLine: line,
        inventoryLine: line,
        inventoryUnit: unitLine,
        meaning: conversion.summary,
        conversion,
        isWarning
    };
}

function removeBrandPrefix(productName, brandName) {
    const product = cleanText(productName);
    const brand = cleanText(brandName);
    if (!product || !brand) return product;
    const pattern = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
    return product.replace(pattern, '').trim() || product;
}

function productDisplayName(product) {
    return formatProductIdentityParts(product).productName || cleanText(product.product_name) || 'Unnamed product';
}

function supplierRxBadge(product) {
    return isPrescriptionProduct(product) ? '<span class="supplier-rx-badge" title="Prescription medicine">Rx</span>' : '';
}

function variantStrengthSize(product) {
    return cleanProductSpecificationText(formatProductSpecification(product, 'Not set')) || 'Not set';
    /* Legacy branches retained below for compatibility documentation. */
    const category = cleanText(product.category_name).toLowerCase();
    if (category === 'medicine') {
        const netContent = medicineNetContentDisplay(product);
        return [
            cleanText(product.generic_name),
            medicineStrengthDisplay(product),
            cleanText(product.dosage_form),
            netContent === 'Not set' ? '' : netContent
        ].filter(Boolean).join(' • ') || 'Not set';
    }

    if (categoryGroup(product.category_name) === 'medical') {
        const savedSize = cleanText(product.size_value || product.display_size);
        const size = savedSize && /^\d+(?:\.\d+)?$/.test(savedSize)
            ? `${savedSize} (unit not set)`
            : savedSize;
        return [
            cleanText(product.variant_flavor || product.variant),
            size,
            cleanText(product.material),
            cleanText(product.sterile_status)
        ].filter(Boolean).join(' • ') || 'Not set';
    }

    const netWeight = groceryNetWeightDisplay(product);
    return [
        cleanText(product.variant_flavor || product.variant),
        cleanText(product.size_value || product.display_size),
        netWeight === 'Not set' ? '' : netWeight
    ].filter(Boolean).join(' • ') || 'Not set';
}

function supplierCatalogSpecification(product) {
    const parts = inventoryMedicineSpecificationParts(product);
    if (parts) {
        const form = parts.dosageForm.toLowerCase();
        const icon = /powder/.test(form) ? 'fa-solid fa-flask'
            : /suspension|syrup|solution|drops|liquid/.test(form) ? 'fa-solid fa-droplet'
            : /supplement|vitamin/.test(form) ? 'fa-solid fa-leaf'
            : /capsule/.test(form) ? 'fa-solid fa-capsules' : 'fa-regular fa-circle-dot';
        return `<span class="supplier-catalog-specification">
            ${parts.dosageForm ? `<span class="supplier-catalog-specification-form"><i class="${icon}" aria-hidden="true"></i>${esc(parts.dosageForm)}</span>` : ''}
            ${parts.strength ? `<strong class="supplier-catalog-specification-strength">${esc(parts.strength)}</strong>` : ''}
            ${parts.details ? `<span class="supplier-catalog-specification-details">${esc(parts.details)}</span>` : ''}
        </span>`;
    }
    const lines = formatProductCatalogSpecificationLines(product, 'Not set');
    return `<span class="supplier-catalog-specification">${lines.map(line => `<span>${esc(line)}</span>`).join('')}</span>`;
}

const selectedAddCategoryName = () => document.getElementById('supplierProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
const selectedAddTypeName = () => document.getElementById('supplierProductType')?.selectedOptions?.[0]?.textContent?.trim() || '';

function categoryGroup(categoryName) {
    const clean = cleanText(categoryName).toLowerCase();
    if (!clean) return '';
    if (clean === 'medicine') return 'medicine';
    if (clean === 'grocery') return 'grocery';
    if (clean === 'medical supply' || clean === 'medical supplies') return 'medical';
    return clean.includes('medical') || clean.includes('supply') ? 'medical' : 'grocery';
}

const ADD_UNITS = {
    medicine: ['pcs', 'mg', 'g', 'ml', 'L', 'oz', 'tablet', 'capsule', 'bottle', 'vial', 'tube', 'sachet'],
    grocery: ['g', 'kg', 'ml', 'L', 'oz', 'pcs'],
    medical: ['pcs', 'pair', 'roll', 'box', 'pack', 'g', 'ml']
};

const MEDICINE_STRENGTH_UNITS = ['mg', 'mcg', 'g', 'ml', '%', 'IU'];
const MEDICINE_NET_CONTENT_UNITS = ['tablets', 'capsules', 'pcs', 'ml', 'L', 'g', 'mg', 'bottle', 'vial', 'tube', 'sachet'];

const PACKAGING_OPTIONS = {
    medicine: ['Blister Pack', 'Bottle', 'Box', 'Tube', 'Sachet', 'Pack', 'Strip'],
    grocery: ['Can', 'Bottle', 'Pack', 'Box', 'Sachet', 'Pouch', 'Bag'],
    medical: ['Box', 'Pack', 'Roll', 'Bottle', 'Pouch', 'Bag']
};

const SUPPLIER_PACKAGES = ['Box', 'Pack', 'Bottle', 'Carton', 'Case', 'Can', 'Pouch', 'Bag'];
const STERILE_STATUS_OPTIONS = ['Sterile', 'Non-sterile'];

function replaceSelectOptions(select, values = [], selected = '', placeholder = '') {
    if (!select) return;
    const current = cleanText(selected);
    const options = placeholder ? [`<option value="">${esc(placeholder)}</option>`] : [];
    values.forEach((value) => {
        const isSelected = current && value.toLowerCase() === current.toLowerCase();
        options.push(`<option value="${esc(value)}" ${isSelected ? 'selected' : ''}>${esc(value)}</option>`);
    });
    select.innerHTML = options.join('');
    if (current) setSelectValue(select.id, current);
}

function supplierProductPackaging(product) {
    return displayOrNotSet(product.package_type || product.packaging);
}

function populateSupplierProductFilterValues(filters = {}) {
    const configs = [
        ['supplierProductFilterSupplier', filters.supplier || []],
        ['supplierProductFilterCategory', filters.category || []],
        ['supplierProductFilterType', filters.type || []],
        ['supplierProductFilterPackage', filters.purchase_unit || []]
    ];
    configs.forEach(([id, values]) => {
        const select = document.getElementById(id);
        if (!select) return;
        const current = select.value;
        const firstLabel = select.options[0]?.textContent || 'All';
        select.innerHTML = `<option value="">${esc(firstLabel)}</option>`;
        values.forEach(value => select.insertAdjacentHTML('beforeend', `<option value="${esc(value)}">${esc(value)}</option>`));
        select.value = values.includes(current) ? current : '';
    });
}

function refreshSupplierProductTable() {
    renderSupplierProducts(supplierProductRows);
    const hasFilters = [
        'supplierProductSearch',
        'supplierProductFilterSupplier',
        'supplierProductFilterCategory',
        'supplierProductFilterType',
        'supplierProductFilterPackage'
    ].some((id) => cleanText(document.getElementById(id)?.value));
    document.getElementById('clearSupplierProductFilters')?.classList.toggle('d-none', !hasFilters);
}

function renderSupplierCatalogPagination() {
    const status = document.getElementById('supplierCatalogPageStatus');
    if (status) status.textContent = `Page ${supplierCatalogPage} of ${supplierCatalogTotalPages}`;
    const previous = document.getElementById('supplierCatalogPrevious');
    const next = document.getElementById('supplierCatalogNext');
    if (previous) previous.disabled = supplierCatalogPage <= 1;
    if (next) next.disabled = supplierCatalogPage >= supplierCatalogTotalPages;
    const count = document.getElementById('supplierProductResultCount');
    if (count) count.textContent = countLabel(supplierCatalogTotal, 'product');
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

function isLiquidMedicine(product) {
    return /\b(liquid|syrup|solution|suspension|drops|betadine|povidone)\b/.test(
        `${product.product_name || ''} ${product.brand_name || ''} ${product.type_name || ''}`.toLowerCase()
    );
}

function productDetailCells(product) {
    const isMedicine = product.category_name === 'Medicine';
    const rule = getVariationRule(product.category_name, product.type_name);
    const variant = product.variant_flavor || product.variant || '';
    const size = product.display_size || product.size_value || product.size || '';
    const netWeight = groceryNetWeightDisplay(product);
    const packContent = product.pack_content || product.pack_content_unit || '';

    if (isMedicine) {
        return {
            generic: esc(product.generic_name || ''),
            strength: esc(medicineStrengthDisplay(product)),
            variant: '',
            size: esc(medicineNetContentDisplay(product)),
            netWeight: '',
            packContent: ''
        };
    }

    return {
        generic: '',
        strength: '',
        variant: esc(variant),
        size: esc(size),
        netWeight: esc(netWeight),
        packContent: esc(packContent)
    };
}

async function fetchJson(url, options = {}) {
    return PharmaUtils.safeFetch(url, { credentials: 'include', ...options });
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);

    const button = document.getElementById('themeToggle');
    if (button) {
        button.innerHTML = isDark
            ? '<i class="fa-solid fa-sun"></i>'
            : '<i class="fa-solid fa-moon"></i>';
        button.setAttribute('aria-label', isDark ? 'Use light mode' : 'Use dark mode');
    }

    localStorage.setItem('drpTheme', theme);
}

function renderSuppliers(rows) {
    const body = document.querySelector('#table-suppliers tbody');
    if (!body) return;

    body.innerHTML = rows.length
        ? rows.map((supplier) => {
            const isActive = !supplier.archived_at;
            return `
            <tr class="supplier-directory-row" data-supplier-id="${esc(supplier.supplier_id)}">
                <td><strong>${esc(displayOrNotSet(supplier.supplier_name))}</strong><div class="supplier-cell-meta">${isActive ? 'Active' : 'Inactive'}</div></td>
                <td>${esc(cleanText(supplier.phone) || 'Not set')}</td>
                <td>${esc(cleanText(supplier.email) || 'Not set')}</td>
                <td>${esc(cleanText(supplier.address) || 'Not set')}</td>
                <td>
                    <div class="supplier-directory-actions d-inline-flex gap-1">
                        <button class="btn btn-outline-secondary view-supplier-btn" type="button"
                            data-id="${esc(supplier.supplier_id)}"
                            title="View supplier details"
                            aria-label="View supplier details">
                            <i class="fa-solid fa-eye" aria-hidden="true"></i>
                        </button>
                        <button class="btn btn-outline-primary edit-supplier-btn"
                            type="button"
                            data-id="${esc(supplier.supplier_id)}"
                            data-name="${esc(supplier.supplier_name)}"
                            data-phone="${esc(supplier.phone)}"
                            data-email="${esc(supplier.email)}"
                            data-address="${esc(supplier.address)}"
                            title="Edit supplier"
                            aria-label="Edit supplier">
                            <i class="fa-solid fa-pen" aria-hidden="true"></i>
                        </button>
                        <button class="btn ${isActive ? 'btn-outline-danger archive-supplier-btn' : 'btn-outline-success activate-supplier-btn'}"
                            type="button"
                            data-id="${esc(supplier.supplier_id)}"
                            title="${isActive ? 'Deactivate' : 'Activate'} supplier"
                            aria-label="${isActive ? 'Deactivate' : 'Activate'} supplier">
                            <i class="fa-solid ${isActive ? 'fa-box-archive' : 'fa-circle-check'}" aria-hidden="true"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('')
        : '<tr><td colspan="5" class="text-center text-muted py-4">No suppliers found.</td></tr>';
}

function supplierRowsFromResponse(data) {
    if (Array.isArray(data?.suppliers)) return data.suppliers;
    if (Array.isArray(data?.data)) return data.data;
    if (data?.supplier && typeof data.supplier === 'object') return [data.supplier];
    return [];
}

function renderSupplierProducts(rows) {
    const body = document.querySelector('#table-supplier-products tbody');
    if (!body) return;
    document.getElementById('table-supplier-products')?.classList.add('supplier-product-table');
    body.innerHTML = rows.length
        ? rows.map((product) => {
            const identity = formatProductIdentityParts(product);
            return `
            <tr class="supplier-product-row" tabindex="0" data-supplier-product-id="${esc(product.supplier_product_id)}" aria-label="View details for ${esc(productDisplayName(product))}">
                <td class="col-supplier">
                    <strong>${esc(displayOrNotSet(product.supplier_name))}</strong>
                    ${Number(product.supplier_count || 0) > 1 ? `<span class="multi-supplier-badge">${esc(countLabel(product.supplier_count, 'supplier'))}</span>` : ''}
                </td>
                <td class="col-product">
                    <div class="supplier-product-name">
                        <strong><span class="supplier-product-primary">${esc(displayOrNotSet(identity.productName))}</span>${supplierRxBadge(product)}</strong>
                        ${identity.genericName ? `<small>${esc(identity.genericName)}</small>` : ''}
                    </div>
                </td>
                <td class="col-specification">${supplierCatalogSpecification(product)}</td>
                <td class="col-purchase-unit"><div class="supplier-purchase-unit-display"><strong>${esc(displayOrNotSet(product.purchase_unit))}</strong><small>${esc(supplierContainsLabel(product))}</small></div></td>
                <td class="col-actions actions-column">
                    ${supplierCatalogCanModify() ? `<div class="supplier-product-actions">
                        <button class="btn btn-sm btn-outline-primary edit-supplier-product-btn" type="button" data-supplier-product-id="${esc(product.supplier_product_id)}" title="Edit supplier product" aria-label="Edit supplier product">
                            <i class="fa-solid fa-pen" aria-hidden="true"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-supplier-product-btn" type="button" data-supplier-product-id="${esc(product.supplier_product_id)}" data-product-id="${esc(product.product_id)}" title="Remove supplier product assignment" aria-label="Remove supplier product assignment">
                            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                        </button>
                    </div>` : '<span class="text-muted small">Read only</span>'}
                </td>
            </tr>
        `;}).join('')
        : '<tr><td colspan="5" class="text-center text-muted py-4">No supplier products found.</td></tr>';
    window.PharmacySearchHighlight?.apply(body, document.getElementById('supplierProductSearch')?.value || '');
}

function setSupplierEditText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = cleanText(value) || 'Not set';
}

function setSupplierEditGroup(name, value) {
    document.querySelectorAll(`[data-edit-review="${name}"]`).forEach((element) => {
        element.textContent = cleanText(value) || 'Not set';
    });
}

function supplierSpecificationValue(specification = {}) {
    if (specification.value_number !== null && specification.value_number !== undefined && specification.value_number !== '') {
        return combineValueUnit(specification.value_number, specification.unit_symbol);
    }
    return cleanText(specification.value_text);
}

function legacySupplierProductAttributes(product = {}) {
    if (product.category_name === 'Medicine') {
        return [
            ['Generic Name', product.generic_name],
            ['Strength', product.strength || combineValueUnit(product.strength_value, product.strength_unit)],
            ['Dosage Form', product.dosage_form],
            ['Net Content', combineValueUnit(product.net_content_value || product.volume_value, product.net_content_unit || product.volume_unit)],
            ['Packaging', product.package_type || product.packaging]
        ];
    }
    if (product.category_name === 'Grocery') {
        return [
            [product.type_name === 'Beverage' ? 'Flavor' : 'Flavor / Variant', product.variant_flavor || product.variant],
            ['Size', product.size_value || product.display_size || product.size],
            ['Net Weight / Volume', combineValueUnit(product.net_weight || product.weight_volume_value, product.unit || product.weight_volume_unit)],
            ['Packaging', product.package_type || product.packaging],
            ['Pack Content', product.pack_content]
        ];
    }
    return [
        ['Variant / Description', product.variant_flavor || product.medical_variant || product.variant],
        ['Size', product.size_value || product.medical_size || product.size],
        ['Material', product.material],
        ['Sterile Status', product.sterile_status],
        ['Packaging', product.package_type || product.packaging],
        ['Pack Content', product.pack_content]
    ];
}

function renderSupplierProductMasterDetails(product, configuredSpecifications = [], savedSpecifications = [], units = []) {
    const normalizedSpecifications = normalizeProductSpecificationValues(configuredSpecifications, savedSpecifications, units);
    setSupplierEditText('editSupplierProductBrandText', product.brand_name);
    setSupplierEditText('editSupplierProductNameText', removeBrandPrefix(product.product_name, product.brand_name) || product.product_name);
    setSupplierEditText('editSupplierProductCategoryText', product.category_name);
    setSupplierEditText('editSupplierProductTypeText', product.type_name);
    setSupplierEditText('editSupplierProductStatusText', product.status || 'Active');
    setSupplierEditText('editSupplierProductBarcodeText', product.barcode);
    setSupplierEditText('editSupplierProductSkuText', product.sku);
    document.getElementById('editSupplierProductSkuField')?.classList.toggle('d-none', !cleanText(product.sku));
    setSupplierEditText('editSupplierProductPackagingText', supplierProductPackaging(product));

    setSupplierEditGroup('brand', product.brand_name);
    setSupplierEditGroup('product', removeBrandPrefix(product.product_name, product.brand_name) || product.product_name);
    setSupplierEditGroup('specification', formatProductSpecification({ ...product, specifications: normalizedSpecifications }));
    setSupplierEditGroup('category', product.category_name);
    setSupplierEditGroup('type', product.type_name);
    setSupplierEditGroup('supplier', product.supplier_name);

    const savedById = new Map(normalizedSpecifications.map((specification) => [String(specification.specification_id), specification]));
    let attributes = configuredSpecifications.map((definition) => {
        const saved = savedById.get(String(definition.specification_id)) || {};
        return [definition.display_name || definition.specification_name, supplierSpecificationValue(saved)];
    });
    if (!attributes.length && normalizedSpecifications.length) {
        attributes = normalizedSpecifications.map((specification) => [
            specification.display_name || specification.specification_name,
            supplierSpecificationValue(specification)
        ]);
    }
    if (!attributes.length) attributes = legacySupplierProductAttributes(product);

    const container = document.getElementById('editSupplierProductAttributes');
    if (container) {
        const visible = attributes.filter(([label]) => cleanText(label));
        const cells = visible.map(([label, value]) => [esc(label), esc(cleanText(value) || 'Not set')]);
        const rows = [];
        for (let index = 0; index < cells.length; index += 2) {
            const left = cells[index];
            const right = cells[index + 1];
            rows.push(`<tr><th>${left[0]}</th><td>${left[1]}</td>${right ? `<th>${right[0]}</th><td>${right[1]}</td>` : '<th></th><td></td>'}</tr>`);
        }
        container.innerHTML = rows.length
            ? rows.join('')
            : '<tr><td colspan="4" class="text-muted text-center">No attributes are configured for this Product Type.</td></tr>';
    }
}

function normalizedSupplierUnit(value) {
    return cleanText(value).toLowerCase();
}

function supplierUnitOptionLabel(unit) {
    const name = cleanText(unit.unit_name);
    const symbol = cleanText(unit.unit_symbol);
    return symbol && normalizedSupplierUnit(symbol) !== normalizedSupplierUnit(name) ? `${name} (${symbol})` : name;
}

function populateSupplierUnitSelect(selectId, units, savedValue, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const saved = cleanText(savedValue);
    const numericSaved = /^\d+(?:\.\d+)?$/.test(saved);
    const savedKey = normalizedSupplierUnit(saved);
    const matching = units.find(unit => [unit.unit_name, unit.unit_symbol].some(value => normalizedSupplierUnit(value) === savedKey));
    const selectedValue = matching ? cleanText(matching.unit_name) : saved;
    select.innerHTML = `<option value="">${numericSaved ? `Invalid legacy unit — select a valid ${placeholder.replace(/^Select |\.\.\.$/g, '')}` : placeholder}</option>`;
    select.classList.toggle('is-invalid', numericSaved);
    units.forEach(unit => {
        const option = document.createElement('option');
        option.value = cleanText(unit.unit_name);
        option.textContent = supplierUnitOptionLabel(unit);
        select.appendChild(option);
    });
    if (saved && !matching && !numericSaved) {
        const legacy = document.createElement('option');
        legacy.value = saved;
        legacy.textContent = `${saved} — saved value`;
        legacy.dataset.savedLegacy = '1';
        select.appendChild(legacy);
    }
    select.value = numericSaved ? '' : selectedValue;
}

async function loadSupplierPurchasingUnitSelectors(saved = {}) {
    const response = await loadSharedMeasurementUnits();
    const sorted = context => measurementUnitsForContext(response.units, { context })
        .sort((left, right) => supplierUnitOptionLabel(left).localeCompare(supplierUnitOptionLabel(right)));
    const purchaseUnits = sorted('purchase').filter(unit => ['box', 'carton'].includes(normalizedSupplierUnit(unit.unit_name)));
    const savedPurchaseUnit = ['box', 'carton'].includes(normalizedSupplierUnit(saved.purchaseUnit)) ? saved.purchaseUnit : '';
    populateSupplierUnitSelect('editSupplierProductPurchaseUnit', purchaseUnits, savedPurchaseUnit, 'Select Box or Carton...');
    populateSupplierUnitSelect('editSupplierProductInventoryUnitPreview', sorted('inventory'), saved.inventoryUnit, 'Select Inventory / Base Unit...');
    const inventoryUnit = document.getElementById('editSupplierProductInventoryUnitPreview');
    if (inventoryUnit) {
        inventoryUnit.disabled = true;
        const label = document.querySelector('label[for="editSupplierProductInventoryUnitPreview"]');
        if (label) label.textContent = 'Product Base Unit';
        const help = inventoryUnit.parentElement?.querySelector('small');
        if (help) help.textContent = 'Defined in Product Master; used by inventory, transfers, and POS.';
    }
}

function validSupplierUnitSelection(selectId) {
    const select = document.getElementById(selectId);
    const value = cleanText(select?.value);
    return Boolean(value && !/^\d+(?:\.\d+)?$/.test(value) && select?.selectedOptions?.[0]);
}

function pluralUnit(unit) {
    const value = cleanText(unit);
    if (!value || /s$/i.test(value)) return value;
    if (/(?:s|x|z|ch|sh)$/i.test(value)) return `${value}es`;
    return `${value}s`;
}

function quantityUnit(unit, quantity) {
    return Number(quantity) === 1 ? cleanText(unit) : pluralUnit(unit);
}

function formattedWholeQuantity(value) {
    return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function setHierarchyControlValidity(control, valid, message = '') {
    if (!control) return;
    control.classList.toggle('is-invalid', !valid);
    control.setCustomValidity(valid ? '' : message);
}

function updateSupplierProductConversionPreview() {
    const supplierProductId = document.getElementById('editSupplierProductLinkId')?.value || '';
    const product = activeSupplierProductEdit || supplierProductRows.find((row) => String(row.supplier_product_id) === String(supplierProductId)) || {};
    const purchaseUnit = document.getElementById('editSupplierProductPurchaseUnit')?.value || '';
    let contains = Math.max(1, Number(document.getElementById('editSupplierProductUnitsPerPurchaseUnit')?.value || 1));
    const inventoryUnit = document.getElementById('editSupplierProductInventoryUnitPreview')?.value || '';
    const sameUnit = normalizedSupplierUnit(purchaseUnit) === normalizedSupplierUnit(inventoryUnit);
    if (sameUnit) {
        document.getElementById('editSupplierProductUnitsPerPurchaseUnit').value = 1;
        document.getElementById('editSupplierProductUnitsPerPurchaseUnit').disabled = true;
    } else {
        document.getElementById('editSupplierProductUnitsPerPurchaseUnit').disabled = false;
    }
    contains = Math.max(1, Number(document.getElementById('editSupplierProductUnitsPerPurchaseUnit')?.value || 1));
    const purchaseLabel = document.getElementById('editSupplierDirectPurchaseUnit');
    const baseLabel = document.getElementById('editSupplierDirectBaseUnit');
    if (purchaseLabel) purchaseLabel.textContent = purchaseUnit || 'Purchase Unit';
    if (baseLabel) baseLabel.textContent = quantityUnit(inventoryUnit || 'Product Base Unit', contains);
    const purchaseUnitAllowed = ['box', 'carton'].includes(normalizedSupplierUnit(purchaseUnit));
    const quantityInput = document.getElementById('editSupplierProductUnitsPerPurchaseUnit');
    const draftValid = Number.isInteger(Number(quantityInput?.value)) && Number(quantityInput?.value) > 0;
    setHierarchyControlValidity(quantityInput, draftValid, 'Enter a positive whole-number contents quantity.');
    if (!purchaseUnitAllowed || !inventoryUnit || !draftValid) {
        const conversionMeaning = document.getElementById('editSupplierProductConversionMeaning');
        if (conversionMeaning) conversionMeaning.innerHTML = `<strong>${purchaseUnitAllowed && inventoryUnit ? 'Enter the final number of Product Base Units in one Purchase Unit.' : 'Select Box or Carton and a valid Product Base Unit.'}</strong>`;
        document.getElementById('editPreviewPurchaseUnit').textContent = purchaseUnit || 'Select Box or Carton';
        document.getElementById('editPreviewInventoryReceived').textContent = 'Complete the final contents conversion';
        return;
    }
    const preview = supplierPreviewDetails({
        ...product,
        purchase_unit: purchaseUnit,
        purchase_unit_contains: contains,
        inner_unit: '',
        units_per_inner_unit: null,
        units_per_purchase_unit: contains,
        inventory_unit: inventoryUnit,
        hierarchy_levels: []
    });

    document.getElementById('editPreviewPurchaseUnit').textContent = preview.purchaseUnit;
    document.getElementById('editPreviewInventoryReceived').textContent = preview.conversion.summary;
    const conversionMeaning = document.getElementById('editSupplierProductConversionMeaning');
    if (conversionMeaning) conversionMeaning.innerHTML = `<strong>${esc(preview.conversion.summary)}</strong>`;
    setSupplierEditGroup('inventory-unit', preview.inventoryUnit);
    setSupplierEditGroup('meaning', `Receiving 1 ${preview.purchaseUnit} adds ${formattedWholeQuantity(preview.conversion.baseQtyPerPurchaseUnit)} ${quantityUnit(preview.inventoryUnit, preview.conversion.baseQtyPerPurchaseUnit)} to Storage Inventory.`);
}

function selectedAddPackaging() {
    const group = categoryGroup(selectedAddCategoryName());
    if (group === 'medicine') return document.getElementById('supplierProductMedicinePackaging')?.value || '';
    if (group === 'medical') return document.getElementById('supplierProductMedicalPackaging')?.value || '';
    if (group === 'grocery') return document.getElementById('supplierProductPackaging')?.value || '';
    return '';
}

function selectedAddUnit() {
    const group = categoryGroup(selectedAddCategoryName());
    if (group === 'medicine') return document.getElementById('supplierProductNetContentUnit')?.value || 'pcs';
    if (group === 'medical') return document.getElementById('supplierProductMedicalUnit')?.value || 'pcs';
    if (group === 'grocery') return document.getElementById('supplierProductVariationUnit')?.value || 'pcs';
    return 'pcs';
}

function updateAddSupplierProductConversionPreview() {
    if (!document.getElementById('addSupplierProductModal')) return;
    const purchaseUnit = document.getElementById('supplierProductPurchaseUnit')?.value || 'Box';
    const contains = Math.max(1, Number(document.getElementById('supplierProductUnitsPerPurchaseUnit')?.value || 1));
    const packaging = selectedAddPackaging();
    const unit = selectedAddUnit();
    const inventoryUnit = document.getElementById('supplierProductInventoryUnitPreview')?.value || 'pc';
    const preview = supplierPreviewDetails({
        purchase_unit: purchaseUnit,
        units_per_purchase_unit: contains,
        package_type: packaging,
        packaging,
        product_unit: unit,
        measurement_unit_name: unit
        ,inventory_unit: inventoryUnit
    });

    document.getElementById('addPreviewPurchaseUnit').textContent = preview.purchaseUnit;
    document.getElementById('addPreviewContains').textContent = preview.containsLine;
    document.getElementById('addPreviewMeaning').textContent = preview.meaning;
    document.getElementById('addSupplierProductConversionPreview')?.classList.toggle('is-warning', preview.isWarning);
}

async function loadSupplierProducts({ resetPage = false } = {}) {
    if (resetPage) supplierCatalogPage = 1;
    const parameters = new URLSearchParams({ page: String(supplierCatalogPage), per_page: '50' });
    const values = {
        search: document.getElementById('supplierProductSearch')?.value || '',
        supplier: document.getElementById('supplierProductFilterSupplier')?.value || '',
        category: document.getElementById('supplierProductFilterCategory')?.value || '',
        type: document.getElementById('supplierProductFilterType')?.value || '',
        purchase_unit: document.getElementById('supplierProductFilterPackage')?.value || ''
    };
    Object.entries(values).forEach(([name, value]) => { if (cleanText(value)) parameters.set(name, cleanText(value)); });
    try {
        const data = await fetchJson(endpoint(`suppliers/get_supplier_product_list.php?${parameters}`));
        supplierProductRows = data.products || [];
        supplierCatalogPage = Number(data.pagination?.page || 1);
        supplierCatalogTotalPages = Number(data.pagination?.total_pages || 1);
        supplierCatalogTotal = Number(data.pagination?.total || supplierProductRows.length);
        populateSupplierProductFilterValues(data.filters || {});
        refreshSupplierProductTable();
        renderSupplierCatalogPagination();
    } catch (error) {
        supplierProductRows = [];
        renderSupplierProducts([]);
        supplierCatalogTotal = 0;
        renderSupplierCatalogPagination();
        PharmaUtils.toast.error(error.message);
    }
}

async function loadSuppliers() {
    const supplierSelect = document.getElementById('supplierProductSupplier');

    try {
        const statusFilter = document.getElementById('supplierStatusFilter')?.value || 'Active';
        const data = await fetchJson(endpoint(`suppliers/get_suppliers.php${statusFilter === 'Active' ? '' : '?include_inactive=1'}`));
        const suppliers = supplierRowsFromResponse(data);
        supplierRows = statusFilter === 'all' ? suppliers : suppliers.filter(row => (row.archived_at ? 'Inactive' : 'Active') === statusFilter);

        renderSuppliers(supplierRows);
        const summary = data.summary || {};
        const summaryValues = {
            summaryTotalSuppliers: summary.total_suppliers,
            summaryActiveSuppliers: summary.active_suppliers,
            summaryAssignedProducts: summary.assigned_supplier_products,
            summaryMultipleSuppliers: summary.products_with_multiple_suppliers
        };
        Object.entries(summaryValues).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = Number(value || 0).toLocaleString('en-PH');
        });
        const directoryCount = document.getElementById('supplierDirectoryCount');
        if (directoryCount) directoryCount.textContent = Number(summary.total_suppliers || suppliers.length || 0).toLocaleString('en-PH');

        if (supplierSelect) {
            supplierSelect.innerHTML = '<option value="" disabled selected>Select supplier...</option>';
            suppliers.forEach((supplier) => {
                const option = document.createElement('option');
                option.value = supplier.supplier_id;
                option.textContent = supplier.supplier_name;
                supplierSelect.appendChild(option);
            });
            updateDependentProductSelectors();
        }
    } catch (error) {
        renderSuppliers([]);
        PharmaUtils.toast.error(error.message);
    }
}

async function loadProductCategories() {
    const categorySelect = document.getElementById('supplierProductCategory');
    if (!categorySelect) return;
    const utilityCategorySelect = document.getElementById('newProductTypeCategory');

    const selectedValue = categorySelect.value;
    categorySelect.innerHTML = '<option value="" disabled selected>Select category...</option>';

    try {
        const data = await fetchJson(endpoint('products/get_categories.php'));

        if (utilityCategorySelect) {
            utilityCategorySelect.innerHTML = '<option value="" disabled selected>Select category...</option>';
        }

        (data.categories || []).forEach((category) => {
            const option = document.createElement('option');
            option.value = category.category_id;
            option.textContent = category.category_name;
            option.dataset.categoryName = category.category_name;
            categorySelect.appendChild(option);

            if (utilityCategorySelect) {
                const utilityOption = document.createElement('option');
                utilityOption.value = category.category_id;
                utilityOption.textContent = category.category_name;
                utilityCategorySelect.appendChild(utilityOption);
            }
        });

        if (selectedValue) {
            categorySelect.value = selectedValue;
        }
        updateDependentProductSelectors();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function loadEditProductCategories(selectedCategoryId = '') {
    const categorySelect = document.getElementById('editSupplierProductCategory');
    if (!categorySelect) return;

    const data = await fetchJson(endpoint('products/get_categories.php'));
    categorySelect.innerHTML = '<option value="" disabled>Select category...</option>';
    (data.categories || []).forEach((category) => {
        const option = document.createElement('option');
        option.value = category.category_id;
        option.textContent = category.category_name;
        option.dataset.categoryName = category.category_name;
        option.dataset.markup = category.default_markup_percentage ?? 0;
        option.dataset.pricingBehavior = category.pricing_behavior || 'review_required';
        categorySelect.appendChild(option);
    });
    categorySelect.value = selectedCategoryId ? String(selectedCategoryId) : '';
}

async function loadProductTypes(categoryId = '', selectedTypeId = '') {
    const typeSelect = document.getElementById('supplierProductType');
    if (!typeSelect) return;
    const loadToken = ++productTypeLoadToken;

    typeSelect.disabled = true;
    typeSelect.innerHTML = '<option value="" disabled selected>Select supplier and category first...</option>';

    if (!categoryId) return;

    try {
        const data = await fetchJson(endpoint(`products/get_product_types.php?category_id=${encodeURIComponent(categoryId)}`));
        if (loadToken !== productTypeLoadToken) return;
        typeSelect.innerHTML = '<option value="" disabled selected>Select product type...</option>';

        (data.types || []).forEach((type) => {
            const option = document.createElement('option');
            option.value = type.type_id;
            option.textContent = type.type_name;
            typeSelect.appendChild(option);
        });

        if (selectedTypeId) {
            typeSelect.value = String(selectedTypeId);
        }

        typeSelect.disabled = false;
        applyAddProductTypeRules();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function loadEditProductTypes(categoryId = '', selectedTypeId = '') {
    const typeSelect = document.getElementById('editSupplierProductType');
    if (!typeSelect) return;
    const loadToken = ++editProductTypeLoadToken;

    typeSelect.disabled = true;
    typeSelect.innerHTML = '<option value="" disabled selected>Select category first...</option>';

    if (!categoryId) return;

    const data = await fetchJson(endpoint(`products/get_product_types.php?category_id=${encodeURIComponent(categoryId)}`));
    if (loadToken !== editProductTypeLoadToken) return;
    typeSelect.innerHTML = '<option value="" disabled selected>Select product type...</option>';
    (data.types || []).forEach((type) => {
        const option = document.createElement('option');
        option.value = type.type_id;
        option.textContent = type.type_name;
        typeSelect.appendChild(option);
    });
    typeSelect.value = selectedTypeId ? String(selectedTypeId) : '';
    typeSelect.disabled = false;
}

async function loadMeasurementUnits(selectedUnitId = '') {
    const unitSelect = document.getElementById('supplierProductMeasurementUnit');
    if (!unitSelect) return;

    const selectedValue = selectedUnitId || unitSelect.value;
    unitSelect.disabled = true;
    unitSelect.innerHTML = '<option value="" disabled selected>Select supplier and category first...</option>';

    if (!canEnableProductSelectors()) return;

    try {
        const data = await loadSharedMeasurementUnits();
        unitSelect.innerHTML = '<option value="" disabled selected>Select measurement unit...</option>';

        (data.units || []).forEach((unit) => {
            const option = document.createElement('option');
            option.value = unit.measurement_unit_id;
            option.textContent = unit.unit_symbol || unit.unit_name;
            unitSelect.appendChild(option);
        });

        if (selectedValue) {
            unitSelect.value = selectedValue;
        }

        unitSelect.disabled = false;
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function loadEditMeasurementUnits(selectedUnitId = '') {
    const unitSelect = document.getElementById('editSupplierProductMeasurementUnit');
    if (!unitSelect) return;

    const data = await loadSharedMeasurementUnits({ includeInactive: Boolean(selectedUnitId) });
    unitSelect.innerHTML = '<option value="" disabled selected>Select measurement unit...</option>';
    (data.units || []).filter(unit => Number(unit.is_active ?? 1) === 1 || String(unit.measurement_unit_id) === String(selectedUnitId)).forEach((unit) => {
        const option = document.createElement('option');
        option.value = unit.measurement_unit_id;
        option.textContent = `${unit.unit_symbol || unit.unit_name}${Number(unit.is_active ?? 1) === 0 ? ' — archived' : ''}`;
        unitSelect.appendChild(option);
    });
    unitSelect.value = selectedUnitId ? String(selectedUnitId) : '';
}

async function loadEditProductUnitOptions(selectedUnitName = '') {
    const unitSelect = document.getElementById('editSupplierProductUnit');
    if (!unitSelect) return;
    const selected = cleanText(selectedUnitName);
    const categoryName = document.getElementById('editSupplierProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
    const group = categoryGroup(categoryName);
    const fallbackUnits = ADD_UNITS[group] || ADD_UNITS.grocery;

    replaceSelectOptions(unitSelect, fallbackUnits, selected);
    setSelectValue('editSupplierProductUnit', selected);
}

function loadEditMedicineUnitOptions(product = {}) {
    replaceSelectOptions(document.getElementById('editSupplierProductStrengthUnit'), MEDICINE_STRENGTH_UNITS, cleanText(product.strength_unit));
    replaceSelectOptions(document.getElementById('editSupplierProductNetContentUnit'), MEDICINE_NET_CONTENT_UNITS, cleanText(product.net_content_unit || product.volume_unit));
}

function configureEditSupplierProductFields() {
    const categoryName = document.getElementById('editSupplierProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
    const group = categoryGroup(categoryName);
    document.querySelectorAll('.edit-attribute').forEach((node) => {
        node.classList.toggle('d-none', !node.classList.contains(`edit-${group}`));
    });
    const variantLabel = document.querySelector('label[for="editSupplierProductVariant"]');
    if (variantLabel) variantLabel.textContent = group === 'medical' ? 'Variant / Type' : 'Flavor / Variant';
    replaceSelectOptions(document.getElementById('editSupplierProductSterileStatus'), STERILE_STATUS_OPTIONS, document.getElementById('editSupplierProductSterileStatus')?.value || '', 'Not set');
    replaceSelectOptions(document.getElementById('editSupplierProductPackaging'), PACKAGING_OPTIONS[group] || PACKAGING_OPTIONS.grocery, document.getElementById('editSupplierProductPackaging')?.value || '', 'Not set');
    loadEditMedicineUnitOptions({
        strength_unit: document.getElementById('editSupplierProductStrengthUnit')?.value || '',
        net_content_unit: document.getElementById('editSupplierProductNetContentUnit')?.value || ''
    });
    loadEditProductUnitOptions(document.getElementById('editSupplierProductUnit')?.value || '');
    updateSupplierProductConversionPreview();
}

function showConfirmation({ title, message, warning, actionLabel = 'Confirm' }) {
    const modalElement = document.getElementById('supplierConfirmModal');
    if (!modalElement) return Promise.resolve(false);
    document.getElementById('supplierConfirmTitle').textContent = title;
    document.getElementById('supplierConfirmMessage').textContent = message;
    document.getElementById('supplierConfirmWarning').innerHTML = warning;
    document.getElementById('supplierConfirmAction').textContent = actionLabel;
    return new Promise((resolve) => {
        pendingConfirmation?.(false);
        pendingConfirmation = resolve;
        bootstrap.Modal.getOrCreateInstance(modalElement).show();
    });
}

function openSupplierDetails(supplierId) {
    const supplier = supplierRows.find((row) => String(row.supplier_id) === String(supplierId));
    if (!supplier) return;
    const assigned = supplierProductRows.filter((row) => String(row.supplier_id) === String(supplierId));
    document.getElementById('supplierDetailsTitle').textContent = supplier.supplier_name || 'Supplier Details';
    document.getElementById('supplierDetailsBody').innerHTML = `
        <div class="supplier-details-grid">
            <section class="supplier-detail-section">
                <h6>Contact Information</h6>
                <dl class="supplier-detail-list">
                    <dt>Supplier Name</dt><dd>${esc(displayOrNotSet(supplier.supplier_name))}</dd>
                    <dt>Phone</dt><dd>${esc(cleanText(supplier.phone) || 'Not set')}</dd>
                    <dt>Email</dt><dd>${esc(cleanText(supplier.email) || 'Not set')}</dd>
                    <dt>Address</dt><dd>${esc(cleanText(supplier.address) || 'Not set')}</dd>
                </dl>
            </section>
            <section class="supplier-detail-section">
                <h6>Procurement Activity</h6>
                <dl class="supplier-detail-list">
                    <dt>Assigned Products</dt><dd>${esc(countLabel(supplier.assigned_product_count, 'product'))}</dd>
                    <dt>Active Purchase Orders</dt><dd>${esc(countLabel(supplier.active_purchase_order_count, 'order'))}</dd>
                    <dt>Historical Orders</dt><dd>${esc(countLabel(supplier.historical_purchase_order_count, 'order'))}</dd>
                    <dt>Most Recent PO</dt><dd>${esc(cleanText(supplier.latest_purchase_order_number) || 'None')}</dd>
                    <dt>PO Status</dt><dd>${esc(cleanText(supplier.latest_purchase_order_status) || 'Not available')}</dd>
                    <dt>PO Date</dt><dd>${esc(formatDate(supplier.latest_purchase_order_date))}</dd>
                    <dt>Latest Delivery</dt><dd>${esc(formatDate(supplier.latest_delivery_date))}</dd>
                </dl>
            </section>
            <section class="supplier-detail-section full-width">
                <h6>Assigned Products</h6>
                ${assigned.length ? `<div class="d-flex flex-wrap gap-2">${assigned.slice(0, 12).map((row) => `<span class="badge text-bg-light border">${esc(productDisplayName(row))}</span>`).join('')}${assigned.length > 12 ? `<span class="badge text-bg-light border">+${assigned.length - 12} more</span>` : ''}</div>` : '<p class="text-muted mb-0">No products are assigned to this supplier.</p>'}
            </section>
        </div>`;
    const assignedButton = document.getElementById('viewSupplierAssignedProducts');
    assignedButton.dataset.supplierName = displayText(supplier.supplier_name);
    assignedButton.disabled = assigned.length === 0;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('supplierDetailsModal')).show();
}

function openSupplierProductDetails(supplierProductId) {
    const product = supplierProductRows.find((row) => String(row.supplier_product_id) === String(supplierProductId));
    if (!product) return;
    const comparisons = supplierProductRows.filter((row) => String(row.product_id) === String(product.product_id));
    const contains = Math.max(1, Number(product.units_per_purchase_unit || 1));
    const sellingPrice = Math.max(0, Number(product.price || 0));
    const inventoryUnit = singularInventoryUnit(supplierInventoryUnit(product, 1));
    document.getElementById('supplierProductDetailsTitle').textContent = productDisplayName(product);
    document.getElementById('supplierProductDetailsBody').innerHTML = `
        <div class="supplier-product-detail-grid">
            <section class="supplier-detail-section">
                <h6>Product Identity</h6>
                <dl class="supplier-detail-list">
                    <dt>Supplier</dt><dd>${esc(displayOrNotSet(product.supplier_name))}</dd>
                    <dt>Brand</dt><dd>${esc(displayOrNotSet(product.brand_name))}</dd>
                    <dt>Product Name</dt><dd>${esc(displayOrNotSet(removeBrandPrefix(product.product_name, product.brand_name) || product.product_name))}</dd>
                    <dt>Category</dt><dd>${esc(displayOrNotSet(product.category_name))}</dd>
                    <dt>Product Type</dt><dd>${esc(displayOrNotSet(product.type_name))}</dd>
                    <dt>Specification</dt><dd>${esc(variantStrengthSize(product))}</dd>
                </dl>
            </section>
            <section class="supplier-detail-section">
                <h6>Inventory and Packaging</h6>
                <dl class="supplier-detail-list">
                    <dt>Inventory Unit</dt><dd>${esc(inventoryUnit)}</dd>
                    <dt>Packaging</dt><dd>${esc(supplierProductPackaging(product))}</dd>
                    <dt>Purchase Unit</dt><dd>${esc(displayOrNotSet(product.purchase_unit))}</dd>
                    <dt>Units per Purchase Unit</dt><dd>${esc(supplierContainsLabel(product))}</dd>
                </dl>
            </section>
            <section class="supplier-detail-section">
                <h6>Purchasing Information</h6>
                <dl class="supplier-detail-list">
                    <dt>Assignment Status</dt><dd>Active</dd>
                    <dt>Active Purchase Orders</dt><dd>${esc(countLabel(product.active_purchase_order_count, 'order'))}</dd>
                    <dt>Most Recent Purchase</dt><dd>${esc(cleanText(product.latest_purchase_order_number) || 'None')}</dd>
                    <dt>Purchase Status</dt><dd>${esc(cleanText(product.latest_purchase_order_status) || 'Not available')}</dd>
                    <dt>Purchase Date</dt><dd>${esc(formatDate(product.latest_purchase_date))}</dd>
                </dl>
            </section>
            <section class="supplier-detail-section full-width">
                <h6>Supplier Comparison</h6>
                ${comparisons.length > 1 ? `<div class="table-responsive"><table class="table table-sm supplier-comparison-table"><thead><tr><th>Supplier</th><th>Purchase Unit</th><th>Units per Purchase Unit</th></tr></thead><tbody>${comparisons.map((row) => `<tr><td>${esc(displayOrNotSet(row.supplier_name))}</td><td>${esc(displayOrNotSet(row.purchase_unit))}</td><td>${esc(supplierContainsLabel(row))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="text-muted mb-0">No alternative supplier assignment is currently available for this exact product record.</p>'}
            </section>
        </div>`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('supplierProductDetailsModal')).show();
}

function resetSupplier() {
    document.getElementById('addSupplierForm')?.reset();
    document.getElementById('addSupplierModalLabel').textContent = 'Add Supplier';
    document.querySelector('#btnSaveSupplier span').textContent = 'Save Supplier';
}

function editSupplier(button) {
    document.getElementById('sup_id').value = button.dataset.id || '';
    document.getElementById('sup_name').value = button.dataset.name || '';
    document.getElementById('sup_phone').value = button.dataset.phone || '';
    document.getElementById('sup_email').value = button.dataset.email || '';
    document.getElementById('sup_address').value = button.dataset.address || '';
    document.getElementById('addSupplierModalLabel').textContent = 'Edit Supplier';
    document.querySelector('#btnSaveSupplier span').textContent = 'Update Supplier';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('addSupplierModal')).show();
}

async function submitSupplier(event) {
    event.preventDefault();

    const payload = {
        supplier_id: document.getElementById('sup_id').value,
        supplier_name: document.getElementById('sup_name').value.trim(),
        phone: document.getElementById('sup_phone').value.trim(),
        email: document.getElementById('sup_email').value.trim(),
        address: document.getElementById('sup_address').value.trim()
    };

    try {
        const data = await fetchJson(
            endpoint(payload.supplier_id ? 'suppliers/update_supplier.php' : 'suppliers/add_supplier.php'),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        await loadSuppliers();
        bootstrap.Modal.getInstance(document.getElementById('addSupplierModal'))?.hide();
        resetSupplier();
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function archiveSupplier(id) {
    const supplier = supplierRows.find((row) => String(row.supplier_id) === String(id));
    if (!supplier) return;
    const confirmed = await showConfirmation({
        title: 'Deactivate Supplier',
        message: `Deactivate ${supplier.supplier_name}? The supplier will no longer appear in active purchasing lists.`,
        warning: `
            <strong>Existing history will be preserved.</strong><br>
            ${esc(countLabel(supplier.assigned_product_count, 'assigned product'))}<br>
            ${esc(countLabel(supplier.active_purchase_order_count, 'active purchase order'))}<br>
            ${esc(countLabel(supplier.historical_purchase_order_count, 'historical purchase order'))}`,
        actionLabel: 'Deactivate Supplier'
    });
    if (!confirmed) return;

    try {
        const data = await fetchJson(endpoint('suppliers/archive_supplier.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supplier_id: id })
        });

        await Promise.all([loadSuppliers(), loadSupplierProducts()]);
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function activateSupplier(id) {
    const supplier = supplierRows.find(row => String(row.supplier_id) === String(id));
    if (!supplier) return;
    const confirmed = await showConfirmation({
        title: 'Activate Supplier',
        message: `Activate ${supplier.supplier_name} for purchasing and assignment lists?`,
        warning: '<strong>Historical products and purchase orders are already preserved.</strong>',
        actionLabel: 'Activate Supplier'
    });
    if (!confirmed) return;
    try {
        const data = await fetchJson(endpoint('suppliers/activate_supplier.php'), {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ supplier_id:id })
        });
        await Promise.all([loadSuppliers(), loadSupplierProducts()]);
        PharmaUtils.toast.success(data.message);
    } catch (error) { PharmaUtils.toast.error(error.message); }
}

function toggleFields() {
    if (!document.getElementById('addSupplierProductModal')) return;
    const categorySelect = document.getElementById('supplierProductCategory');
    const categoryName = categorySelect?.selectedOptions?.[0]?.dataset.categoryName || '';
    const group = categoryGroup(categoryName);
    document.getElementById('supplierProductMedicineFields')?.classList.toggle('d-none', group !== 'medicine');
    document.getElementById('supplierProductGroceryFields')?.classList.toggle('d-none', group !== 'grocery');
    document.getElementById('supplierProductMedicalFields')?.classList.toggle('d-none', group !== 'medical');
    const basePrice = document.getElementById('supplierProductBasePrice');

    const strengthInput = document.getElementById('supplierProductStrengthValue');
    const genericInput = document.getElementById('supplierProductGenericName');
    const sizeInput = document.getElementById('supplierProductSizeValue');

    if (strengthInput) {
        strengthInput.required = false;
    }
    if (genericInput) genericInput.required = group === 'medicine';
    if (sizeInput) sizeInput.required = group === 'grocery';
    if (basePrice) basePrice.required = true;
    applyAddProductTypeRules();
    updateAddSupplierProductConversionPreview();
}

function setOptions(select, options, selected = '') {
    if (!select) return;
    select.innerHTML = ruleOptionList(options, selected);
}

function setDatalistOptions(listId, options = []) {
    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = options.map(option => `<option value="${esc(option)}"></option>`).join('');
}

function toggleControlWrap(id, visible) {
    document.getElementById(id)?.closest('[class*="col-"]')?.classList.toggle('d-none', !visible);
}

function relabelControl(id, label) {
    const wrap = document.getElementById(id)?.closest('[class*="col-"]');
    const labelNode = wrap?.querySelector('.form-label');
    if (labelNode) labelNode.textContent = label;
}

function applyAddProductTypeRules() {
    const categoryName = selectedAddCategoryName();
    if (!categoryName) return;
    const group = categoryGroup(categoryName);

    replaceSelectOptions(document.getElementById('supplierProductStrengthUnit'), MEDICINE_STRENGTH_UNITS);
    replaceSelectOptions(document.getElementById('supplierProductNetContentUnit'), MEDICINE_NET_CONTENT_UNITS);
    replaceSelectOptions(document.getElementById('supplierProductVariationUnit'), ADD_UNITS.grocery);
    replaceSelectOptions(document.getElementById('supplierProductMedicalUnit'), ADD_UNITS.medical);
    replaceSelectOptions(document.getElementById('supplierProductMedicinePackaging'), PACKAGING_OPTIONS.medicine, '', 'Not set');
    replaceSelectOptions(document.getElementById('supplierProductPackaging'), PACKAGING_OPTIONS.grocery, '', 'Not set');
    replaceSelectOptions(document.getElementById('supplierProductMedicalPackaging'), PACKAGING_OPTIONS.medical, '', 'Not set');

    document.querySelector('label[for="supplierProductVariantFlavor"]').textContent = 'Flavor / Variant';
    updateAddSupplierProductConversionPreview();
}

function toggleEditProductFields() {
    const categorySelect = document.getElementById('editSupplierProductCategory');
    const categoryName = categorySelect?.selectedOptions?.[0]?.dataset.categoryName || '';
    const medicineFields = document.getElementById('editSupplierProductMedicineFields');
    const groceryFields = document.getElementById('editSupplierProductGroceryFields');
    const genericInput = document.getElementById('editSupplierProductGeneric');
    const strengthInput = document.getElementById('editSupplierProductStrength');
    const sizeInput = document.getElementById('editSupplierProductSize');

    medicineFields?.classList.toggle('d-none', categoryName !== 'Medicine');
    groceryFields?.classList.toggle('d-none', categoryName !== 'Grocery');
    if (genericInput) genericInput.required = categoryName === 'Medicine';
    if (strengthInput) strengthInput.required = false;
    if (sizeInput) sizeInput.required = categoryName === 'Grocery';
}

function canEnableProductSelectors() {
    return Boolean(
        document.getElementById('supplierProductSupplier')?.value &&
        document.getElementById('supplierProductCategory')?.value
    );
}

function updateDependentProductSelectors() {
    const categorySelect = document.getElementById('supplierProductCategory');
    const categoryId = categorySelect?.value || '';
    const addTypeButton = document.getElementById('btnOpenAddProductType');
    const addUnitButton = document.getElementById('btnOpenAddMeasurementUnit');
    const canEnable = canEnableProductSelectors();

    toggleFields();
    if (addTypeButton) addTypeButton.disabled = !canEnable;
    if (addUnitButton) addUnitButton.disabled = !canEnable;

    if (!canEnable) {
        loadProductTypes('');
        loadMeasurementUnits();
        return;
    }

    loadProductTypes(categoryId);
    loadMeasurementUnits();
}

function resetGroceryVariations() {
    const list = document.getElementById('groceryVariationList');
    if (!list) return;
    list.innerHTML = '';
}

function collectGroceryVariations() {
    const unit = document.getElementById('supplierProductVariationUnit')?.value || '';
    return [{
        variant_flavor: document.getElementById('supplierProductVariantFlavor')?.value.trim() || '',
        size_value: document.getElementById('supplierProductSizeValue')?.value.trim() || '',
        display_size: document.getElementById('supplierProductSizeValue')?.value.trim() || '',
        weight_volume_value: document.getElementById('supplierProductNetWeight')?.value.trim() || '',
        weight_volume_unit: unit,
        net_weight: document.getElementById('supplierProductNetWeight')?.value.trim() || '',
        volume_value: '',
        volume_unit: '',
        unit,
        packaging: document.getElementById('supplierProductPackaging')?.value.trim() || '',
        pack_content: '',
        pack_content_qty: '',
        pack_content_unit: '',
        price: document.getElementById('supplierProductBasePrice')?.value || '0',
        barcode: document.getElementById('supplierProductBarcode')?.value.trim() || '',
        sku: document.getElementById('supplierProductSku')?.value.trim() || ''
    }];
}

async function submitProduct(event) {
    event.preventDefault();

    const categorySelect = document.getElementById('supplierProductCategory');
    const selectedCategory = categorySelect?.selectedOptions?.[0];
    const categoryName = selectedCategory?.dataset.categoryName || '';
    const group = categoryGroup(categoryName);

    const payload = {
        supplier_id: document.getElementById('supplierProductSupplier').value,
        brand_name: document.getElementById('supplierProductBrand').value.trim(),
        product_name: document.getElementById('supplierProductName').value.trim(),
        type_id: document.getElementById('supplierProductType').value,
        measurement_unit_id: document.getElementById('supplierProductMeasurementUnit')?.value || '',
        product_unit: selectedAddUnit(),
        strength_size_value: '',
        strength_value: '',
        strength_unit: '',
        volume_value: '',
        volume_unit: '',
        display_size: '',
        weight_volume_value: '',
        weight_volume_unit: '',
        price: document.getElementById('supplierProductBasePrice')?.value || document.getElementById('supplierProductPrice')?.value || '0',
        image_url: document.getElementById('supplierProductImageUrl')?.value.trim() || '',
        category_id: selectedCategory?.value || '',
        purchase_unit: document.getElementById('supplierProductPurchaseUnit')?.value || 'Box',
        inventory_unit: document.getElementById('supplierProductInventoryUnitPreview')?.value.trim() || 'pc',
        units_per_purchase_unit: document.getElementById('supplierProductUnitsPerPurchaseUnit')?.value || '1',
        barcode: document.getElementById('supplierProductBarcode')?.value.trim() || '',
        sku: document.getElementById('supplierProductSku')?.value.trim() || '',
        packaging: selectedAddPackaging()
    };

    if (group === 'medicine') {
        payload.generic_name = document.getElementById('supplierProductGenericName').value.trim();
        payload.variant_flavor = '';
        payload.size_value = '';
        payload.strength_size_value = document.getElementById('supplierProductStrengthValue')?.value.trim() || '';
        payload.strength_value = payload.strength_size_value;
        payload.strength_unit = document.getElementById('supplierProductStrengthUnit')?.value || '';
        payload.strength = [payload.strength_value, payload.strength_unit].filter(Boolean).join(' ');
        payload.dosage_form = document.getElementById('supplierProductDosageForm')?.value.trim() || '';
        payload.net_content_value = document.getElementById('supplierProductNetContentValue')?.value.trim() || '';
        payload.net_content_unit = document.getElementById('supplierProductNetContentUnit')?.value || '';
        payload.volume_value = payload.net_content_value;
        payload.volume_unit = payload.net_content_unit;
        payload.product_unit = payload.net_content_unit || payload.product_unit;
        payload.packaging = document.getElementById('supplierProductMedicinePackaging')?.value || '';
        payload.pack_content_qty = '';
        payload.pack_content_unit = '';
    }

    if (group === 'grocery') {
        const variations = collectGroceryVariations();
        if (!variations.length) {
            PharmaUtils.toast.error('Please enter grocery product attributes.');
            return;
        }

        const firstVariation = variations[0];
        payload.variant_flavor = firstVariation.variant_flavor;
        payload.size_value = firstVariation.size_value;
        payload.display_size = firstVariation.display_size || firstVariation.size_value;
        payload.weight_volume_value = firstVariation.weight_volume_value;
        payload.weight_volume_unit = firstVariation.weight_volume_unit;
        payload.net_weight = firstVariation.net_weight;
        payload.unit = firstVariation.unit;
        payload.volume_value = firstVariation.volume_value;
        payload.volume_unit = firstVariation.volume_unit;
        payload.product_unit = firstVariation.unit || payload.product_unit;
        payload.packaging = firstVariation.packaging;
        payload.pack_content = firstVariation.pack_content;
        payload.pack_content_qty = firstVariation.pack_content_qty;
        payload.pack_content_unit = firstVariation.pack_content_unit;
        payload.price = firstVariation.price;
        payload.barcode = firstVariation.barcode;
        payload.variations = variations;
    }

    if (group === 'medical') {
        payload.variant_flavor = document.getElementById('supplierProductMedicalVariant')?.value.trim() || '';
        payload.size_value = document.getElementById('supplierProductMedicalSize')?.value.trim() || '';
        payload.display_size = payload.size_value;
        payload.material = document.getElementById('supplierProductMedicalMaterial')?.value.trim() || '';
        payload.sterile_status = document.getElementById('supplierProductMedicalSterileStatus')?.value || '';
        payload.weight_volume_value = '';
        payload.weight_volume_unit = document.getElementById('supplierProductMedicalUnit')?.value || '';
        payload.product_unit = document.getElementById('supplierProductMedicalUnit')?.value || payload.product_unit;
        payload.packaging = document.getElementById('supplierProductMedicalPackaging')?.value || '';
        payload.pack_content = '';
        payload.pack_content_qty = '';
        payload.pack_content_unit = '';
        payload.variations = [{
            variant_flavor: payload.variant_flavor,
            size_value: payload.size_value,
            display_size: payload.display_size,
            material: payload.material,
            sterile_status: payload.sterile_status,
            weight_volume_value: '',
            weight_volume_unit: payload.weight_volume_unit,
            unit: payload.product_unit,
            packaging: payload.packaging,
            pack_content: payload.pack_content,
            pack_content_qty: payload.pack_content_qty,
            pack_content_unit: payload.pack_content_unit,
            price: payload.price,
            barcode: payload.barcode,
            sku: payload.sku
        }];
    }

    const sellingPrice = Number(payload.price);
    const unitsPerPurchaseUnit = Number(payload.units_per_purchase_unit);
    if (!payload.purchase_unit || !Number.isFinite(unitsPerPurchaseUnit) || unitsPerPurchaseUnit <= 0) {
        PharmaUtils.toast.error('Select a purchase unit and enter units per purchase unit greater than zero.');
        return;
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
        PharmaUtils.toast.error('Selling price must be a non-negative number.');
        return;
    }

    const identityCandidate = {
        ...payload,
        category_name: categoryName,
        type_name: selectedAddTypeName(),
        package_type: payload.packaging,
        size_value: payload.size_value || payload.display_size
    };
    const duplicate = supplierProductRows.find((row) =>
        String(row.supplier_id) === String(payload.supplier_id)
        && sameText(row.brand_name, payload.brand_name)
        && sameText(removeBrandPrefix(row.product_name, row.brand_name), removeBrandPrefix(payload.product_name, payload.brand_name))
        && String(row.category_id) === String(payload.category_id)
        && String(row.type_id) === String(payload.type_id)
        && sameText(variantStrengthSize(row), variantStrengthSize(identityCandidate))
    );
    if (duplicate) {
        PharmaUtils.toast.error('This exact product and specification is already assigned to the selected supplier. Edit the existing assignment instead.');
        return;
    }

    try {
        const data = await fetchJson(endpoint('products/add_product.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        bootstrap.Modal.getInstance(document.getElementById('addSupplierProductModal'))?.hide();
        event.target.reset();
        resetGroceryVariations();
        toggleFields();
        loadProductTypes('');
        loadMeasurementUnits();
        await loadSupplierProducts();
        window.dispatchEvent(new CustomEvent('products:changed'));
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function openEditSupplierProduct(supplierProductId) {
    if (!supplierCatalogCanModify()) return;
    const product = supplierProductRows.find((row) => String(row.supplier_product_id) === String(supplierProductId));
    if (!product) return;

    activeSupplierProductEdit = { ...product };
    try {
        await loadSupplierPurchasingUnitSelectors({
            purchaseUnit: product.purchase_unit || '',
            inventoryUnit: product.inventory_unit || supplierInventoryUnit(product, 1)
        });
    } catch (error) {
        PharmaUtils.toast.error(error.message || 'Unable to load purchasing units.');
        return;
    }
    document.getElementById('editSupplierProductLinkId').value = product.supplier_product_id || '';
    document.getElementById('editSupplierProductId').value = product.product_id || '';
    document.getElementById('editSupplierProductSupplierId').value = product.supplier_id || '';
    setSupplierEditText('editSupplierProductSupplierNameText', product.supplier_name);
    document.getElementById('editSupplierProductUnitsPerPurchaseUnit').value = Math.max(1, Number(product.units_per_purchase_unit || product.purchase_unit_contains || 1));
    renderSupplierProductMasterDetails(product, [], product.specifications || []);
    updateSupplierProductConversionPreview();

    const editModal = document.getElementById('editSupplierProductModal');
    const setupTab = document.getElementById('editSupplierProductSetupTab');
    if (setupTab) bootstrap.Tab.getOrCreateInstance(setupTab).show();
    editModal.querySelector('.modal-body')?.scrollTo({ top: 0 });
    bootstrap.Modal.getOrCreateInstance(editModal).show();

    const attributes = document.getElementById('editSupplierProductAttributes');
    if (attributes && !(product.specifications || []).length) {
        attributes.innerHTML = '<tr><td colspan="4" class="text-muted text-center"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading configured Product Master attributes...</td></tr>';
    }

    const detailRequest = fetchJson(endpoint(`products/get_product_details.php?product_id=${encodeURIComponent(product.product_id)}&t=${Date.now()}`), { cache: 'no-store' });
    const configurationRequest = product.type_id
        ? fetchJson(endpoint(`products/get_product_configuration.php?type_id=${encodeURIComponent(product.type_id)}`), { cache: 'no-store' })
        : Promise.resolve({ specifications: [] });
    const [detailResult, configurationResult] = await Promise.allSettled([detailRequest, configurationRequest]);
    if (document.getElementById('editSupplierProductLinkId')?.value !== String(product.supplier_product_id || '')) return;

    const details = detailResult.status === 'fulfilled' ? (detailResult.value?.data || {}) : {};
    const configuration = configurationResult.status === 'fulfilled' ? configurationResult.value : {};
    activeSupplierProductEdit = {
        ...product,
        ...(details.product || {}),
        pricing: details.pricing || product.pricing || null,
        category_markup_percentage: details.pricing?.category_markup_percentage ?? product.category_markup_percentage,
        pricing_behavior: details.pricing?.pricing_behavior ?? product.pricing_behavior
    };
    const productBaseUnit = activeSupplierProductEdit.inventory_unit_name || activeSupplierProductEdit.inventory_unit || '';
    const productBaseUnitSelect = document.getElementById('editSupplierProductInventoryUnitPreview');
    if (productBaseUnitSelect && productBaseUnit) {
        const matchingOption = Array.from(productBaseUnitSelect.options).find(option => normalizedSupplierUnit(option.value) === normalizedSupplierUnit(productBaseUnit));
        if (matchingOption) productBaseUnitSelect.value = matchingOption.value;
    }
    document.getElementById('editSupplierProductUnitsPerPurchaseUnit').value = Math.max(1, Number(product.units_per_purchase_unit || product.purchase_unit_contains || 1));
    const savedSpecifications = Array.isArray(details.specifications) && details.specifications.length
        ? details.specifications
        : (product.specifications || []);
    renderSupplierProductMasterDetails(activeSupplierProductEdit, configuration.specifications || [], savedSpecifications, configuration.units || []);
    updateSupplierProductConversionPreview();

    if (detailResult.status === 'rejected' && configurationResult.status === 'rejected') {
        console.warn('Product Master details could not be refreshed; using the supplier catalog snapshot.');
    }
}

async function submitEditSupplierProduct(event) {
    event.preventDefault();
    if (!supplierCatalogCanModify()) {
        PharmaUtils.toast.error('Supplier purchasing setup is read only for this account.');
        return;
    }
    const payload = {
        supplier_product_id: document.getElementById('editSupplierProductLinkId').value,
        purchase_unit: document.getElementById('editSupplierProductPurchaseUnit').value,
        inventory_unit: document.getElementById('editSupplierProductInventoryUnitPreview').value.trim(),
        purchase_unit_contains: document.getElementById('editSupplierProductUnitsPerPurchaseUnit').value,
        units_per_purchase_unit: document.getElementById('editSupplierProductUnitsPerPurchaseUnit').value
    };

    const unitsPerPurchaseUnit = Number(payload.purchase_unit_contains);
    if (!['box', 'carton'].includes(normalizedSupplierUnit(payload.purchase_unit))) {
        document.getElementById('editSupplierProductPurchaseUnit')?.classList.add('is-invalid');
        PharmaUtils.toast.error('Purchase Unit must be Box or Carton.');
        return;
    }
    if (!validSupplierUnitSelection('editSupplierProductPurchaseUnit')) {
        PharmaUtils.toast.error('Please select a valid Purchase Unit.');
        return;
    }
    if (!validSupplierUnitSelection('editSupplierProductInventoryUnitPreview')) {
        PharmaUtils.toast.error('Inventory/Base Unit must be selected from the available unit list.');
        return;
    }
    if (
        !payload.supplier_product_id
        || !payload.purchase_unit
        || !payload.inventory_unit
        || !Number.isInteger(unitsPerPurchaseUnit)
        || unitsPerPurchaseUnit < 1
    ) {
        PharmaUtils.toast.error('Enter a valid Purchase Unit and final contents quantity.');
        return;
    }

    try {
        const data = await fetchJson(endpoint('suppliers/update_supplier_assignment.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        bootstrap.Modal.getInstance(document.getElementById('editSupplierProductModal'))?.hide();
        await loadSupplierProducts();
        window.dispatchEvent(new CustomEvent('products:changed'));
        PharmaUtils.toast.success(data.message || 'Supplier product updated successfully.');
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function deleteSupplierProduct(button) {
    if (!supplierCatalogCanModify()) return;
    const product = supplierProductRows.find((row) => String(row.supplier_product_id) === String(button.dataset.supplierProductId));
    if (!product) return;
    const confirmed = await showConfirmation({
        title: 'Remove Supplier Product Assignment',
        message: `Remove ${productDisplayName(product)} from ${product.supplier_name}?`,
        warning: `
            <strong>Historical purchase-order snapshots will remain unchanged.</strong><br>
            ${esc(countLabel(product.active_purchase_order_count, 'active purchase order'))}<br>
            ${Number(product.historical_purchase_order_count || 0) > 0 ? `${esc(countLabel(product.historical_purchase_order_count, 'historical purchase order'))}<br>` : ''}
            This removes only the supplier-product assignment.`,
        actionLabel: 'Remove Assignment'
    });
    if (!confirmed) return;

    try {
        const data = await fetchJson(endpoint('suppliers/delete_supplier_product.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                supplier_product_id: button.dataset.supplierProductId,
                product_id: button.dataset.productId
            })
        });

        await loadSupplierProducts();
        window.dispatchEvent(new CustomEvent('products:changed'));
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function currentSupplierCategoryId() {
    return document.getElementById('supplierProductCategory')?.value || '';
}

function openUtilityModal(id) {
    const modal = document.getElementById(id);
    if (modal) bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function submitProductType(event) {
    event.preventDefault();
    const categoryId = document.getElementById('newProductTypeCategory')?.value || currentSupplierCategoryId();
    const typeName = document.getElementById('newProductTypeName')?.value.trim() || '';

    try {
        const data = await fetchJson(endpoint('products/add_product_type.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id: categoryId, type_name: typeName })
        });
        await loadProductTypes(categoryId, data.type?.type_id || '');
        bootstrap.Modal.getInstance(document.getElementById('addProductTypeModal'))?.hide();
        event.target.reset();
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function submitMeasurementUnit(event) {
    event.preventDefault();
    const unitName = document.getElementById('newMeasurementUnitName')?.value.trim() || '';

    try {
        const data = await fetchJson(endpoint('products/add_measurement_unit.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unit_name: unitName, unit_symbol: unitName, measurement_group: 'Count' })
        });
        upsertMeasurementUnitCache(data.unit);
        await loadMeasurementUnits(data.unit?.measurement_unit_id || '');
        bootstrap.Modal.getInstance(document.getElementById('addMeasurementUnitModal'))?.hide();
        event.target.reset();
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

setTheme(localStorage.getItem('drpTheme') || 'light');
document.getElementById('themeToggle')?.addEventListener('click', () => {
    setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
});
document.getElementById('btnOpenAddSupplier')?.addEventListener('click', resetSupplier);
// Product identity creation is owned by the shared Product Master form used by
// supplier_product_assignment.js. Remove the obsolete duplicate modal at runtime.
document.getElementById('addSupplierProductModal')?.remove();
document.getElementById('addSupplierForm')?.addEventListener('submit', submitSupplier);
document.getElementById('supplierProductSupplier')?.addEventListener('change', updateDependentProductSelectors);
document.getElementById('supplierProductCategory')?.addEventListener('change', updateDependentProductSelectors);
document.getElementById('supplierProductType')?.addEventListener('change', applyAddProductTypeRules);
document.getElementById('addSupplierProductForm')?.addEventListener('submit', submitProduct);
[
    'supplierProductPurchaseUnit',
    'supplierProductInventoryUnitPreview',
    'supplierProductUnitsPerPurchaseUnit',
    'supplierProductDosageForm',
    'supplierProductStrengthUnit',
    'supplierProductNetContentValue',
    'supplierProductNetContentUnit',
    'supplierProductMedicinePackaging',
    'supplierProductVariationUnit',
    'supplierProductPackaging',
    'supplierProductNetWeight',
    'supplierProductMedicalUnit',
    'supplierProductMedicalPackaging'
].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateAddSupplierProductConversionPreview);
    document.getElementById(id)?.addEventListener('change', updateAddSupplierProductConversionPreview);
});
document.getElementById('btnOpenAddProductType')?.addEventListener('click', () => {
    const categoryId = currentSupplierCategoryId();
    const categoryInput = document.getElementById('newProductTypeCategory');
    if (categoryInput) categoryInput.value = categoryId;
    openUtilityModal('addProductTypeModal');
});
document.getElementById('btnOpenAddMeasurementUnit')?.addEventListener('click', () => openUtilityModal('addMeasurementUnitModal'));
document.getElementById('addProductTypeForm')?.addEventListener('submit', submitProductType);
document.getElementById('addMeasurementUnitForm')?.addEventListener('submit', submitMeasurementUnit);
document.getElementById('editSupplierProductForm')?.addEventListener('submit', submitEditSupplierProduct);
['editSupplierProductInventoryUnitPreview'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', event => {
        event.target.classList.remove('is-invalid');
        updateSupplierProductConversionPreview();
    });
});
document.getElementById('editSupplierProductPurchaseUnit')?.addEventListener('change', event => {
    event.target.classList.remove('is-invalid');
    updateSupplierProductConversionPreview();
});
document.getElementById('editSupplierProductUnitsPerPurchaseUnit')?.addEventListener('input', updateSupplierProductConversionPreview);
document.getElementById('editSupplierProductUnit')?.addEventListener('change', updateSupplierProductConversionPreview);
document.getElementById('editSupplierProductPackaging')?.addEventListener('change', updateSupplierProductConversionPreview);
document.getElementById('supplierProductSearch')?.addEventListener('input', () => {
    window.clearTimeout(supplierCatalogSearchTimer);
    supplierCatalogSearchTimer = window.setTimeout(() => loadSupplierProducts({ resetPage: true }), 250);
});
['supplierProductFilterSupplier', 'supplierProductFilterCategory', 'supplierProductFilterType', 'supplierProductFilterPackage'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => loadSupplierProducts({ resetPage: true }));
});
document.getElementById('supplierCatalogPrevious')?.addEventListener('click', () => {
    if (supplierCatalogPage > 1) { supplierCatalogPage -= 1; loadSupplierProducts(); }
});
document.getElementById('supplierCatalogNext')?.addEventListener('click', () => {
    if (supplierCatalogPage < supplierCatalogTotalPages) { supplierCatalogPage += 1; loadSupplierProducts(); }
});
document.getElementById('clearSupplierProductFilters')?.addEventListener('click', () => {
    [
        'supplierProductSearch',
        'supplierProductFilterSupplier',
        'supplierProductFilterCategory',
        'supplierProductFilterType',
        'supplierProductFilterPackage'
    ].forEach((id) => {
        const control = document.getElementById(id);
        if (control) control.value = '';
    });
    loadSupplierProducts({ resetPage: true });
    document.getElementById('supplierProductSearch')?.focus();
});
document.getElementById('supplierConfirmAction')?.addEventListener('click', () => {
    const resolve = pendingConfirmation;
    pendingConfirmation = null;
    resolve?.(true);
    bootstrap.Modal.getInstance(document.getElementById('supplierConfirmModal'))?.hide();
});
document.getElementById('supplierConfirmModal')?.addEventListener('hidden.bs.modal', () => {
    const resolve = pendingConfirmation;
    pendingConfirmation = null;
    resolve?.(false);
});
[
    ['supplierDetailsModal', 'supplierDetailsTitle'],
    ['supplierProductDetailsModal', 'supplierProductDetailsTitle'],
    ['supplierConfirmModal', 'supplierConfirmTitle'],
    ['addSupplierModal', 'addSupplierModalLabel'],
    ['addSupplierProductModal', 'addSupplierProductModalTitle'],
    ['editSupplierProductModal', 'editSupplierProductModalTitle']
].forEach(([modalId, titleId]) => {
    document.getElementById(modalId)?.addEventListener('shown.bs.modal', () => {
        document.getElementById(titleId)?.focus();
    });
});
document.getElementById('viewSupplierAssignedProducts')?.addEventListener('click', (event) => {
    const supplierName = event.currentTarget.dataset.supplierName || '';
    bootstrap.Modal.getInstance(document.getElementById('supplierDetailsModal'))?.hide();
    const filter = document.getElementById('supplierProductFilterSupplier');
    if (filter) filter.value = supplierName;
    loadSupplierProducts({ resetPage: true });
    document.getElementById('supplierProductResultCount')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.getElementById('editSupplierProductModal')?.addEventListener('hidden.bs.modal', () => {
    activeSupplierProductEdit = null;
});
document.getElementById('addSupplierProductModal')?.addEventListener('show.bs.modal', () => {
    loadSuppliers();
    loadProductCategories();
    updateDependentProductSelectors();
});
document.getElementById('addSupplierProductModal')?.addEventListener('hidden.bs.modal', () => {
    document.getElementById('addSupplierProductForm')?.reset();
    resetGroceryVariations();
    toggleFields();
    loadProductTypes('');
    loadMeasurementUnits();
});
document.getElementById('table-suppliers')?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.view-supplier-btn');
    const editButton = event.target.closest('.edit-supplier-btn');
    const archiveButton = event.target.closest('.archive-supplier-btn');
    const activateButton = event.target.closest('.activate-supplier-btn');

    if (viewButton) openSupplierDetails(viewButton.dataset.id);
    if (editButton) editSupplier(editButton);
    if (archiveButton) archiveSupplier(archiveButton.dataset.id);
    if (activateButton) activateSupplier(activateButton.dataset.id);
});
document.getElementById('supplierStatusFilter')?.addEventListener('change', loadSuppliers);
document.getElementById('supplierDirectoryToggle')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const body = document.getElementById('supplierDirectoryBody');
    if (!body) return;
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    button.title = expanded ? 'Collapse Supplier Directory' : 'Expand Supplier Directory';
    body.hidden = !expanded;
    button.querySelector('i')?.classList.toggle('fa-chevron-down', !expanded);
    button.querySelector('i')?.classList.toggle('fa-chevron-up', expanded);
    try { sessionStorage.setItem('supplierDirectoryExpanded', expanded ? '1' : '0'); } catch (error) {}
});
document.getElementById('table-supplier-products')?.addEventListener('click', (event) => {
    const editButton = event.target.closest('.edit-supplier-product-btn');
    const deleteButton = event.target.closest('.delete-supplier-product-btn');
    const row = event.target.closest('.supplier-product-row');

    if (editButton) openEditSupplierProduct(editButton.dataset.supplierProductId);
    else if (deleteButton) deleteSupplierProduct(deleteButton);
    else if (row) openSupplierProductDetails(row.dataset.supplierProductId);
});
document.getElementById('table-supplier-products')?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
    const row = event.target.closest('.supplier-product-row');
    if (!row) return;
    event.preventDefault();
    openSupplierProductDetails(row.dataset.supplierProductId);
});

async function initializeSupplierWorkspace() {
    await Promise.resolve(window.__drpSessionReadyPromise).catch(() => null);
    const assignButton = document.getElementById('assignSupplierProductButton');
    if (assignButton) {
        assignButton.classList.toggle('d-none', !supplierCatalogCanModify());
        assignButton.setAttribute('aria-hidden', supplierCatalogCanModify() ? 'false' : 'true');
    }
    document.querySelectorAll('[data-supplier-cost]').forEach((element) => { element.hidden = !supplierCatalogCanViewCost(); });
    try {
        if (sessionStorage.getItem('supplierDirectoryExpanded') === '1') document.getElementById('supplierDirectoryToggle')?.click();
    } catch (error) {}
    loadSuppliers();
    loadProductCategories();
    updateDependentProductSelectors();
    loadSupplierProducts();
}

initializeSupplierWorkspace();
window.addEventListener('products:changed', (event) => publishDataUpdate('supplier-updated', event.detail || {}));
createLiveSync({ interval: 5000, events: ['supplier-updated', 'product-updated'], sync: () => Promise.all([loadSuppliers(), loadSupplierProducts()]) });
