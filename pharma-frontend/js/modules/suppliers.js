import PharmaUtils from '../utils.js';
import {
    datalist,
    getVariationRule,
    optionList as ruleOptionList
} from './variation_rules.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const endpoint = (path) => `${API_BASE_URL}/${path}`;
let supplierProductRows = [];

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

function sameText(left, right) {
    return cleanText(left).toLowerCase() === cleanText(right).toLowerCase();
}

function compactMeasure(value, unit = '') {
    const cleanValue = cleanText(value);
    const cleanUnit = cleanText(unit);
    if (!cleanValue) return '';
    return cleanUnit ? `${cleanValue}${cleanUnit}` : cleanValue;
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

function pluralizeStockUnit(unit, quantity = 2) {
    const raw = cleanText(unit || 'pcs');
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
        sachets: 'sachets',
        'blister pack': 'pcs',
        blister: 'pcs'
    };
    const text = fixed[lower] || displayText(raw);
    if (Number(quantity) === 1 && ['cans', 'bottles', 'packs', 'sachets'].includes(text.toLowerCase())) {
        return text.replace(/s$/i, '');
    }
    if (Number(quantity) === 1 || /s$/i.test(text)) return text;
    if (/y$/i.test(text)) return text.replace(/y$/i, 'ies');
    return `${text}s`;
}

function singularStockUnit(unit) {
    return pluralizeStockUnit(unit, 1);
}

function supplierStockUnit(product, quantity = 2) {
    const packaging = cleanText(product.package_type || product.packaging).toLowerCase();
    const unit = cleanText(product.product_unit || product.measurement_unit_name || '').toLowerCase();
    const packageMap = { can: 'can', cans: 'can', bottle: 'bottle', bottles: 'bottle', pack: 'pack', packs: 'pack', sachet: 'sachet', sachets: 'sachet' };

    if (packageMap[packaging]) return pluralizeStockUnit(packageMap[packaging], quantity);
    if (packaging === 'blister pack') return 'pcs';
    if (['g', 'gram', 'grams', 'kg', 'mg', 'mcg', 'ml', 'l'].includes(unit)) return 'pcs';
    return pluralizeStockUnit(unit || 'pcs', quantity);
}

function packageContentUnitText(unit) {
    const text = cleanText(unit || 'pcs');
    return text.toLowerCase() === 'pcs' ? 'pcs' : displayText(text);
}

function supplierContainsLabel(product) {
    const contains = Math.max(1, Number(product.units_per_purchase_unit || 1));
    return `${contains} ${packageContentUnitText(supplierStockUnit(product, contains))}`;
}

function supplierConversionPreview(product) {
    const contains = Math.max(1, Number(product.units_per_purchase_unit || 1));
    const purchaseUnit = displayText(product.purchase_unit || 'Box');
    const packaging = product.package_type || product.packaging;
    const contents = `${contains} ${packageContentUnitText(supplierStockUnit(product, contains))}`;
    if (sameText(purchaseUnit, packaging)) {
        return `1 ${purchaseUnit} = ${contents}`;
    }
    return `1 ${purchaseUnit} = ${contents}`;
}

function supplierPreviewDetails(product) {
    const contains = Math.max(1, Number(product.units_per_purchase_unit || 1));
    const purchaseUnit = displayText(product.purchase_unit || 'Box') || 'Box';
    const stockUnit = supplierStockUnit(product, contains);
    const packaging = product.package_type || product.packaging;
    const isWarning = sameText(purchaseUnit, packaging) && contains > 1;
    const line = `${contains} ${packageContentUnitText(stockUnit)}`;

    return { purchaseUnit, containsLine: line, inventoryLine: line, isWarning };
}

function removeBrandPrefix(productName, brandName) {
    const product = cleanText(productName);
    const brand = cleanText(brandName);
    if (!product || !brand) return product;
    const pattern = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
    return product.replace(pattern, '').trim() || product;
}

function productDisplayName(product) {
    const brand = cleanText(product.brand_name);
    const name = removeBrandPrefix(product.product_name, brand);
    const base = [brand, name].filter(Boolean).join(' ');
    return base || cleanText(product.product_name) || 'Unnamed product';
}

function variantStrengthSize(product) {
    const category = cleanText(product.category_name).toLowerCase();
    if (category === 'medicine') {
        return cleanText(product.strength_size_display || product.strength_size_value || product.strength_value || product.generic_name) || '-';
    }

    return [
        cleanText(product.variant_flavor || product.variant),
        compactMeasure(product.weight_volume_value || product.net_weight || product.size_value || product.display_size, product.weight_volume_unit),
        cleanText(product.package_type || product.packaging)
    ].filter(Boolean).join(' \u2022 ') || '-';
}

const selectedAddCategoryName = () => document.getElementById('supplierProductCategory')?.selectedOptions?.[0]?.dataset.categoryName || '';
const selectedAddTypeName = () => document.getElementById('supplierProductType')?.selectedOptions?.[0]?.textContent?.trim() || '';

function supplierProductPackaging(product) {
    return displayText(product.package_type || product.packaging) || '-';
}

function rowSearchText(product) {
    return [
        product.supplier_name,
        product.brand_name,
        product.product_name,
        product.category_name,
        product.type_name,
        product.variant_flavor,
        product.variant,
        product.strength_size_display,
        product.strength_size_value,
        product.strength_value,
        product.size_value,
        product.display_size,
        product.weight_volume_value,
        product.weight_volume_unit,
        product.product_unit,
        product.measurement_unit_name,
        product.package_type,
        product.packaging,
        product.purchase_unit,
        productDisplayName(product),
        variantStrengthSize(product)
    ].map(cleanText).join(' ').toLowerCase();
}

function populateSupplierProductFilters(rows) {
    const configs = [
        ['supplierProductFilterSupplier', (row) => row.supplier_name],
        ['supplierProductFilterCategory', (row) => row.category_name],
        ['supplierProductFilterType', (row) => row.type_name],
        ['supplierProductFilterPackage', (row) => row.purchase_unit]
    ];

    configs.forEach(([id, getter]) => {
        const select = document.getElementById(id);
        if (!select) return;
        const current = select.value;
        const firstLabel = select.options[0]?.textContent || 'All';
        const values = Array.from(new Set(rows.map(getter).map(displayText).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        select.innerHTML = `<option value="">${esc(firstLabel)}</option>`;
        values.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        select.value = values.includes(current) ? current : '';
    });
}

function filteredSupplierProducts() {
    const search = cleanText(document.getElementById('supplierProductSearch')?.value).toLowerCase();
    const supplier = cleanText(document.getElementById('supplierProductFilterSupplier')?.value).toLowerCase();
    const category = cleanText(document.getElementById('supplierProductFilterCategory')?.value).toLowerCase();
    const type = cleanText(document.getElementById('supplierProductFilterType')?.value).toLowerCase();
    const packageFilter = cleanText(document.getElementById('supplierProductFilterPackage')?.value).toLowerCase();

    return supplierProductRows.filter((row) => {
        if (search && !rowSearchText(row).includes(search)) return false;
        if (supplier && displayText(row.supplier_name).toLowerCase() !== supplier) return false;
        if (category && displayText(row.category_name).toLowerCase() !== category) return false;
        if (type && displayText(row.type_name).toLowerCase() !== type) return false;
        if (packageFilter && displayText(row.purchase_unit).toLowerCase() !== packageFilter) return false;
        return true;
    });
}

function refreshSupplierProductTable() {
    renderSupplierProducts(filteredSupplierProducts());
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
    const netWeight = product.weight_volume_value || product.net_weight || '';
    const packContent = product.pack_content || product.pack_content_unit || '';

    if (isMedicine) {
        return {
            generic: esc(product.generic_name || ''),
            strength: esc(product.strength_value || product.strength_size_value || ''),
            variant: '',
            size: '',
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
    }

    localStorage.setItem('drpTheme', theme);
}

function renderSuppliers(rows) {
    const body = document.querySelector('#table-suppliers tbody');
    if (!body) return;

    body.innerHTML = rows.length
        ? rows.map((supplier) => `
            <tr>
                <td>${esc(supplier.supplier_name)}</td>
                <td>${esc(supplier.phone)}</td>
                <td>${esc(supplier.email)}</td>
                <td>${esc(supplier.address)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary edit-supplier-btn"
                            data-id="${esc(supplier.supplier_id)}"
                            data-name="${esc(supplier.supplier_name)}"
                            data-phone="${esc(supplier.phone)}"
                            data-email="${esc(supplier.email)}"
                            data-address="${esc(supplier.address)}"
                            title="Edit supplier">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-outline-danger archive-supplier-btn"
                            data-id="${esc(supplier.supplier_id)}"
                            title="Archive supplier">
                            <i class="fa-solid fa-box-archive"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('')
        : '<tr><td colspan="5" class="text-center text-muted py-4">No suppliers found.</td></tr>';
}

function renderSupplierProducts(rows) {
    const body = document.querySelector('#table-supplier-products tbody');
    if (!body) return;
    document.getElementById('table-supplier-products')?.classList.add('supplier-product-table');

    body.innerHTML = rows.length
        ? rows.map((product) => `
            <tr>
                <td class="col-supplier">${esc(displayText(product.supplier_name) || '-')}</td>
                <td class="col-product">
                    <div class="supplier-product-name">
                        <strong>${esc(productDisplayName(product))}</strong>
                    </div>
                </td>
                <td>${esc(product.category_name)}</td>
                <td>${esc(product.type_name)}</td>
                <td class="col-variant">${esc(variantStrengthSize(product))}</td>
                <td class="col-price">${peso(product.price)}</td>
                <td class="col-price">${peso(product.supplier_cost_price)}</td>
                <td class="col-package">${esc(supplierProductPackaging(product))}</td>
                <td class="col-package">${esc(displayText(product.purchase_unit) || 'Not set')}</td>
                <td class="col-contains">${esc(supplierContainsLabel(product))}</td>
                <td>
                    <div class="supplier-product-actions">
                        <button class="btn btn-sm btn-outline-primary edit-supplier-product-btn" type="button" data-supplier-product-id="${esc(product.supplier_product_id)}" title="Edit supplier purchasing setup">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-supplier-product-btn" type="button" data-supplier-product-id="${esc(product.supplier_product_id)}" data-product-id="${esc(product.product_id)}" title="Remove product">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('')
        : '<tr><td colspan="11" class="text-center text-muted py-4">No supplier products found.</td></tr>';
}

function updateSupplierProductConversionPreview() {
    const supplierProductId = document.getElementById('editSupplierProductLinkId')?.value || '';
    const product = supplierProductRows.find((row) => String(row.supplier_product_id) === String(supplierProductId)) || {};
    const purchaseUnit = document.getElementById('editSupplierProductPurchaseUnit')?.value || product.purchase_unit || 'Box';
    const contains = Math.max(1, Number(document.getElementById('editSupplierProductUnitsPerPurchaseUnit')?.value || 1));
    const packaging = document.getElementById('editSupplierProductPackaging')?.value || product.package_type || product.packaging;
    const unit = document.getElementById('editSupplierProductUnit')?.value || product.product_unit || product.measurement_unit_name;
    const preview = supplierPreviewDetails({
        ...product,
        purchase_unit: purchaseUnit,
        units_per_purchase_unit: contains,
        package_type: packaging,
        packaging,
        product_unit: unit,
        measurement_unit_name: unit
    });

    document.getElementById('editPreviewPurchaseUnit').textContent = preview.purchaseUnit;
    document.getElementById('editPreviewContains').textContent = preview.containsLine;
    document.getElementById('editPreviewInventoryReceived').textContent = preview.inventoryLine;
    document.getElementById('editSupplierProductConversionPreview')?.classList.toggle('is-warning', preview.isWarning);
}

async function loadSupplierProducts() {
    try {
        const data = await fetchJson(endpoint('suppliers/get_supplier_product_list.php'));
        supplierProductRows = data.products || [];
        populateSupplierProductFilters(supplierProductRows);
        refreshSupplierProductTable();
    } catch (error) {
        supplierProductRows = [];
        populateSupplierProductFilters([]);
        renderSupplierProducts([]);
        PharmaUtils.toast.error(error.message);
    }
}

async function loadSuppliers() {
    const supplierSelect = document.getElementById('supplierProductSupplier');

    try {
        const data = await fetchJson(endpoint('suppliers/get_suppliers.php'));
        const suppliers = data.suppliers || [];

        renderSuppliers(suppliers);

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
        categorySelect.appendChild(option);
    });
    categorySelect.value = selectedCategoryId ? String(selectedCategoryId) : '';
}

async function loadProductTypes(categoryId = '', selectedTypeId = '') {
    const typeSelect = document.getElementById('supplierProductType');
    if (!typeSelect) return;

    typeSelect.disabled = true;
    typeSelect.innerHTML = '<option value="" disabled selected>Select supplier and category first...</option>';

    if (!categoryId) return;

    try {
        const data = await fetchJson(endpoint(`products/get_product_types.php?category_id=${encodeURIComponent(categoryId)}`));
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

    typeSelect.disabled = true;
    typeSelect.innerHTML = '<option value="" disabled selected>Select category first...</option>';

    if (!categoryId) return;

    const data = await fetchJson(endpoint(`products/get_product_types.php?category_id=${encodeURIComponent(categoryId)}`));
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
        const data = await fetchJson(endpoint('products/get_measurement_units.php'));
        unitSelect.innerHTML = '<option value="" disabled selected>Select measurement unit...</option>';

        (data.units || []).forEach((unit) => {
            const option = document.createElement('option');
            option.value = unit.measurement_unit_id;
            option.textContent = unit.unit_name;
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

    const data = await fetchJson(endpoint('products/get_measurement_units.php'));
    unitSelect.innerHTML = '<option value="" disabled selected>Select measurement unit...</option>';
    (data.units || []).forEach((unit) => {
        const option = document.createElement('option');
        option.value = unit.measurement_unit_id;
        option.textContent = unit.unit_name;
        unitSelect.appendChild(option);
    });
    unitSelect.value = selectedUnitId ? String(selectedUnitId) : '';
}

async function loadEditProductUnitOptions(selectedUnitName = '') {
    const unitSelect = document.getElementById('editSupplierProductUnit');
    if (!unitSelect) return;
    const selected = cleanText(selectedUnitName);
    const fallbackUnits = ['pcs', 'tablet', 'capsule', 'bottle', 'box', 'pack', 'can', 'sachet', 'tube', 'vial', 'ampule', 'blister', 'pouch', 'jar', 'roll', 'Solution', 'Syrup', 'Drops', 'Suspension'];

    unitSelect.innerHTML = '<option value="">N/A</option>';
    try {
        const data = await fetchJson(endpoint('products/get_measurement_units.php'));
        const lookupUnits = (data.units || []).map((unit) => cleanText(unit.unit_name)).filter(Boolean);
        Array.from(new Set([...lookupUnits, ...fallbackUnits])).forEach((unitName) => {
            const option = document.createElement('option');
            option.value = unitName;
            option.textContent = unitName;
            unitSelect.appendChild(option);
        });
    } catch (error) {
        fallbackUnits.forEach((unitName) => {
            const option = document.createElement('option');
            option.value = unitName;
            option.textContent = unitName;
            unitSelect.appendChild(option);
        });
    }
    setSelectValue('editSupplierProductUnit', selected);
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

        bootstrap.Modal.getInstance(document.getElementById('addSupplierModal'))?.hide();
        resetSupplier();
        await loadSuppliers();
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function archiveSupplier(id) {
    if (!confirm('Archive this supplier?')) return;

    try {
        const data = await fetchJson(endpoint('suppliers/archive_supplier.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supplier_id: id })
        });

        await loadSuppliers();
        PharmaUtils.toast.success(data.message);
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function toggleFields() {
    const categorySelect = document.getElementById('supplierProductCategory');
    const categoryName = categorySelect?.selectedOptions?.[0]?.dataset.categoryName || '';
    document.getElementById('supplierProductMedicineFields')?.classList.toggle('d-none', categoryName !== 'Medicine');
    document.getElementById('supplierProductGroceryFields')?.classList.toggle('d-none', categoryName !== 'Grocery');
    const basePrice = document.getElementById('supplierProductBasePrice');
    const basePriceColumn = basePrice?.closest('.col-md-6');

    const strengthInput = document.getElementById('supplierProductStrengthValue');
    const genericInput = document.getElementById('supplierProductGenericName');
    const sizeInput = document.getElementById('supplierProductSizeValue');

    if (strengthInput) {
        strengthInput.required = false;
    }
    if (genericInput) genericInput.required = categoryName === 'Medicine';
    if (sizeInput) sizeInput.required = categoryName === 'Grocery';
    if (basePrice) basePrice.required = categoryName !== 'Grocery';
    basePriceColumn?.classList.toggle('d-none', categoryName === 'Grocery');
    applyAddProductTypeRules();
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
    const typeName = selectedAddTypeName();
    if (!categoryName || !typeName) return;

    const rule = getVariationRule(categoryName, typeName);
    const show = (field) => rule.fields.includes(field);

    if (categoryName === 'Grocery') {
        const list = document.getElementById('groceryVariationList');
        if (list) list.innerHTML = groceryVariationTemplate(false);
        return;
    }

    toggleControlWrap('supplierProductStrengthValue', show('strength') || show('weight'));
    toggleControlWrap('supplierProductStrengthUnit', show('strength') || show('weight'));
    toggleControlWrap('supplierProductVolumeValue', show('volume'));
    toggleControlWrap('supplierProductVolumeUnit', show('volume'));
    toggleControlWrap('supplierProductMedicineFlavor', show('variant'));
    toggleControlWrap('supplierProductMedicineUnit', show('form'));
    toggleControlWrap('supplierProductMedicinePackaging', show('packaging'));
    toggleControlWrap('supplierProductMedicinePackContentQty', show('packContent'));
    toggleControlWrap('supplierProductMedicinePackContentUnit', show('packContent'));

    relabelControl('supplierProductStrengthValue', show('weight') ? 'Net Weight' : 'Strength Value');
    relabelControl('supplierProductStrengthUnit', show('weight') ? 'Weight Unit' : 'Strength Unit');
    relabelControl('supplierProductMedicineUnit', 'Form');
    relabelControl('supplierProductMedicinePackaging', 'Package Type');
    setOptions(document.getElementById('supplierProductStrengthUnit'), show('weight') ? rule.weightUnits : rule.strengthUnits);
    setOptions(document.getElementById('supplierProductVolumeUnit'), rule.volumeUnits);
    setOptions(document.getElementById('supplierProductMedicinePackaging'), rule.packagingOptions);
    setOptions(document.getElementById('supplierProductMedicinePackContentUnit'), rule.packContentUnits);
    setDatalistOptions('supplierProductMedicineFlavorList', rule.variantOptions);

    const form = document.getElementById('supplierProductMedicineUnit');
    if (form) {
        form.innerHTML = ruleOptionList([rule.formValue || typeName], rule.formValue || typeName);
    }
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

function groceryVariationTemplate(canRemove = true) {
    const rule = getVariationRule(selectedAddCategoryName(), selectedAddTypeName());
    const show = (field) => rule.fields.includes(field);
    const rowId = `supplier-variation-${Math.random().toString(36).slice(2)}`;

    return `
        <div class="grocery-variation-entry">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold small text-muted">Variation</span>
                ${canRemove ? '<button class="btn btn-sm btn-outline-danger btn-remove-grocery-variation" type="button" title="Remove variation"><i class="fa-solid fa-trash-can"></i></button>' : ''}
            </div>
            <div class="row g-3">
                <div class="col-md-4 ${show('variant') ? '' : 'd-none'}"><label class="form-label">${esc(rule.variantLabel)}</label><input class="form-control supplier-product-variant-flavor" list="${rowId}-variant" placeholder="Select or type">${datalist(`${rowId}-variant`, rule.variantOptions)}</div>
                <div class="col-md-4 ${show('size') ? '' : 'd-none'}"><label class="form-label">${esc(rule.sizeLabel)}</label><select class="form-select supplier-product-size-value">${ruleOptionList(rule.sizeOptions)}</select></div>
                <div class="col-md-4 ${show('weight') ? '' : 'd-none'}"><label class="form-label">Net Weight</label><div class="variation-pair"><input class="form-control supplier-product-weight-value" list="${rowId}-weight" type="number" min="0" step="any" placeholder="155"><select class="form-select supplier-product-weight-unit">${ruleOptionList(rule.weightUnits)}</select></div>${datalist(`${rowId}-weight`, rule.weightValues)}</div>
                <div class="col-md-4 ${show('volume') ? '' : 'd-none'}"><label class="form-label">Volume</label><div class="variation-pair"><input class="form-control supplier-product-volume-value" list="${rowId}-volume" type="number" min="0" step="any" placeholder="60"><select class="form-select supplier-product-volume-unit">${ruleOptionList(rule.volumeUnits)}</select></div>${datalist(`${rowId}-volume`, rule.volumeValues)}</div>
                <div class="col-md-4 d-none"><label class="form-label">Form</label><input class="form-control supplier-product-unit" value=""></div>
                <div class="col-md-4 ${show('packaging') ? '' : 'd-none'}"><label class="form-label">Package Type</label><select class="form-select supplier-product-packaging">${ruleOptionList(rule.packagingOptions)}</select></div>
                <div class="col-md-4 ${show('packContent') ? '' : 'd-none'}"><label class="form-label">Pack Content</label><div class="variation-pair"><input class="form-control supplier-product-pack-content-qty" list="${rowId}-pack-content" type="number" min="0" step="1" placeholder="12"><select class="form-select supplier-product-pack-content-unit">${ruleOptionList(rule.packContentUnits)}</select></div>${datalist(`${rowId}-pack-content`, rule.packContentValues)}</div>
                <div class="col-md-4"><label class="form-label">Selling Price</label><input class="form-control supplier-product-price" type="number" min="0" step=".01" required></div>
                <div class="col-md-4"><label class="form-label">Barcode</label><input class="form-control supplier-product-barcode" placeholder="Auto/manual"></div>
                <div class="col-md-4"><label class="form-label">SKU</label><input class="form-control supplier-product-sku" placeholder="Optional"></div>
                <div class="col-md-4"><label class="form-label">Stock</label><input class="form-control supplier-product-stock" type="number" min="0" step="1" value="0"></div>
            </div>
        </div>
    `;
}

function addGroceryVariationEntry() {
    const list = document.getElementById('groceryVariationList');
    if (!list) return;
    list.insertAdjacentHTML('beforeend', groceryVariationTemplate(true));
}

function resetGroceryVariations() {
    const list = document.getElementById('groceryVariationList');
    if (!list) return;
    const first = list.querySelector('.grocery-variation-entry');
    list.innerHTML = '';
    if (first) {
        first.querySelectorAll('input').forEach(input => {
            input.value = input.type === 'number' && input.classList.contains('supplier-product-stock') ? '0' : '';
        });
        first.querySelectorAll('select').forEach(select => { select.selectedIndex = 0; });
        list.appendChild(first);
    } else {
        list.innerHTML = groceryVariationTemplate(false);
    }
}

function collectGroceryVariations() {
    const entries = Array.from(document.querySelectorAll('#groceryVariationList .grocery-variation-entry'));
    if (!entries.length) {
        return [{
            variant_flavor: document.getElementById('supplierProductVariantFlavor')?.value.trim() || '',
            size_value: document.getElementById('supplierProductSizeValue')?.value.trim() || '',
            weight_volume_value: document.getElementById('supplierProductWeightVolumeValue')?.value.trim() || '',
            weight_volume_unit: document.getElementById('supplierProductWeightVolumeUnit')?.value || '',
            volume_value: document.getElementById('supplierProductGroceryVolumeValue')?.value.trim() || '',
            volume_unit: document.getElementById('supplierProductGroceryVolumeUnit')?.value || '',
            unit: document.getElementById('supplierProductVariationUnit')?.value || '',
            packaging: document.getElementById('supplierProductPackaging')?.value.trim() || '',
            pack_content_qty: document.getElementById('supplierProductPackContentQty')?.value || '',
            pack_content_unit: document.getElementById('supplierProductPackContentUnit')?.value || '',
            price: document.getElementById('supplierProductPrice')?.value || '0',
            barcode: '',
            sku: '',
            stock: 0
        }];
    }

    return entries.map((entry) => ({
        variant_flavor: entry.querySelector('.supplier-product-variant-flavor')?.value.trim() || '',
        size_value: entry.querySelector('.supplier-product-size-value')?.value.trim() || '',
        display_size: entry.querySelector('.supplier-product-size-value')?.value.trim() || '',
        weight_volume_value: entry.querySelector('.supplier-product-weight-value')?.value.trim() || '',
        weight_volume_unit: entry.querySelector('.supplier-product-weight-unit')?.value || '',
        volume_value: entry.querySelector('.supplier-product-volume-value')?.value.trim() || '',
        volume_unit: entry.querySelector('.supplier-product-volume-unit')?.value || '',
        unit: entry.querySelector('.supplier-product-unit')?.value || '',
        packaging: entry.querySelector('.supplier-product-packaging')?.value.trim() || '',
        pack_content_qty: entry.querySelector('.supplier-product-pack-content-qty')?.value || '',
        pack_content_unit: entry.querySelector('.supplier-product-pack-content-unit')?.value || '',
        price: entry.querySelector('.supplier-product-price')?.value || '0',
        barcode: entry.querySelector('.supplier-product-barcode')?.value.trim() || '',
        sku: entry.querySelector('.supplier-product-sku')?.value.trim() || '',
        stock: entry.querySelector('.supplier-product-stock')?.value || '0'
    })).filter((variation) => variation.variant_flavor || variation.size_value || variation.weight_volume_value || variation.price);
}

async function submitProduct(event) {
    event.preventDefault();

    const categorySelect = document.getElementById('supplierProductCategory');
    const selectedCategory = categorySelect?.selectedOptions?.[0];
    const categoryName = selectedCategory?.dataset.categoryName || '';
    const rule = getVariationRule(categoryName, selectedAddTypeName());
    const uses = (field) => rule.fields.includes(field);

    const payload = {
        supplier_id: document.getElementById('supplierProductSupplier').value,
        brand_name: document.getElementById('supplierProductBrand').value.trim(),
        product_name: document.getElementById('supplierProductName').value.trim(),
        type_id: document.getElementById('supplierProductType').value,
        measurement_unit_id: document.getElementById('supplierProductMeasurementUnit').value,
        product_unit: document.getElementById('supplierProductMeasurementUnit')?.selectedOptions?.[0]?.textContent?.trim() || '',
        strength_size_value: uses('strength') ? (document.getElementById('supplierProductStrengthValue')?.value.trim() || '') : '',
        strength_value: uses('strength') ? (document.getElementById('supplierProductStrengthValue')?.value.trim() || '') : '',
        strength_unit: uses('strength') ? (document.getElementById('supplierProductStrengthUnit')?.value || '') : '',
        volume_value: uses('volume') ? (document.getElementById('supplierProductVolumeValue')?.value.trim() || '') : '',
        volume_unit: uses('volume') ? (document.getElementById('supplierProductVolumeUnit')?.value || '') : '',
        display_size: categoryName === 'Grocery' ? (document.getElementById('supplierProductSizeValue')?.value || '') : '',
        weight_volume_value: '',
        weight_volume_unit: '',
        price: document.getElementById('supplierProductBasePrice')?.value || document.getElementById('supplierProductPrice')?.value || '0',
        image_url: document.getElementById('supplierProductImageUrl')?.value.trim() || '',
        category_id: selectedCategory?.value || ''
    };

    if (categoryName === 'Medicine') {
        payload.generic_name = document.getElementById('supplierProductGenericName').value.trim();
        payload.variant_flavor = uses('variant') ? (document.getElementById('supplierProductMedicineFlavor')?.value.trim() || '') : '';
        payload.size_value = '';
        payload.weight_volume_value = uses('weight') ? (document.getElementById('supplierProductStrengthValue')?.value.trim() || '') : '';
        payload.weight_volume_unit = uses('weight') ? (document.getElementById('supplierProductStrengthUnit')?.value || '') : '';
        payload.packaging = uses('packaging') ? (document.getElementById('supplierProductMedicinePackaging')?.value || '') : '';
        payload.product_unit = uses('form') ? (document.getElementById('supplierProductMedicineUnit')?.value || payload.product_unit) : '';
        payload.pack_content_qty = uses('packContent') ? (document.getElementById('supplierProductMedicinePackContentQty')?.value || '') : '';
        payload.pack_content_unit = uses('packContent') ? (document.getElementById('supplierProductMedicinePackContentUnit')?.value || '') : '';
    }

    if (categoryName === 'Grocery') {
        const variations = collectGroceryVariations();
        if (!variations.length) {
            PharmaUtils.toast.error('Please add at least one grocery variation.');
            return;
        }

        const firstVariation = variations[0];
        payload.variant_flavor = firstVariation.variant_flavor;
        payload.size_value = firstVariation.size_value;
        payload.display_size = firstVariation.display_size || firstVariation.size_value;
        payload.weight_volume_value = firstVariation.weight_volume_value;
        payload.weight_volume_unit = firstVariation.weight_volume_unit;
        payload.volume_value = firstVariation.volume_value;
        payload.volume_unit = firstVariation.volume_unit;
        payload.product_unit = firstVariation.unit || payload.product_unit;
        payload.packaging = firstVariation.packaging;
        payload.pack_content_qty = firstVariation.pack_content_qty;
        payload.pack_content_unit = firstVariation.pack_content_unit;
        payload.price = firstVariation.price;
        payload.barcode = firstVariation.barcode;
        payload.variations = variations;
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
    const product = supplierProductRows.find((row) => String(row.supplier_product_id) === String(supplierProductId));
    if (!product) return;
    const packContent = splitLeadingNumber(product.pack_content || product.pack_content_unit);

    document.getElementById('editSupplierProductLinkId').value = product.supplier_product_id || '';
    document.getElementById('editSupplierProductId').value = product.product_id || '';
    document.getElementById('editSupplierProductSupplierId').value = product.supplier_id || '';
    document.getElementById('editSupplierProductCurrentPrice').value = product.price || '0';
    document.getElementById('editSupplierProductSupplierName').value = product.supplier_name || '';
    document.getElementById('editSupplierProductBrand').value = product.brand_name || '';
    document.getElementById('editSupplierProductName').value = removeBrandPrefix(product.product_name, product.brand_name) || product.product_name || '';
    await loadEditProductCategories(product.category_id || '');
    await loadEditProductTypes(product.category_id || '', product.type_id || '');
    document.getElementById('editSupplierProductVariant').value = cleanText(product.variant_flavor || product.variant);
    document.getElementById('editSupplierProductStrength').value = cleanText(product.strength_size_display || product.strength_size_value || product.strength_value);
    document.getElementById('editSupplierProductSize').value = cleanText(product.size_value || product.display_size || product.weight_volume_value || product.net_weight);
    await loadEditProductUnitOptions(cleanText(product.product_unit || product.measurement_unit_name || packContent.unit || 'pcs'));
    setSelectValue('editSupplierProductPackaging', cleanText(product.package_type || product.packaging));
    document.getElementById('editSupplierProductSellingPriceText').textContent = peso(product.price);
    document.getElementById('editSupplierProductSupplierCost').value = product.supplier_cost_price || '0';
    setSelectValue('editSupplierProductPurchaseUnit', product.purchase_unit || 'Box');
    document.getElementById('editSupplierProductUnitsPerPurchaseUnit').value = Math.max(1, Number(product.units_per_purchase_unit || 1));
    updateSupplierProductConversionPreview();

    bootstrap.Modal.getOrCreateInstance(document.getElementById('editSupplierProductModal')).show();
}

async function submitEditSupplierProduct(event) {
    event.preventDefault();
    const product = supplierProductRows.find((row) => String(row.supplier_product_id) === String(document.getElementById('editSupplierProductLinkId').value)) || {};
    const packContent = splitLeadingNumber(product.pack_content || product.pack_content_unit);

    const payload = {
        supplier_product_id: document.getElementById('editSupplierProductLinkId').value,
        supplier_id: document.getElementById('editSupplierProductSupplierId').value,
        product_id: document.getElementById('editSupplierProductId').value,
        brand_name: document.getElementById('editSupplierProductBrand').value.trim(),
        product_name: document.getElementById('editSupplierProductName').value.trim(),
        category_id: document.getElementById('editSupplierProductCategory').value,
        type_id: document.getElementById('editSupplierProductType').value,
        variant_flavor: document.getElementById('editSupplierProductVariant').value.trim(),
        strength_value: document.getElementById('editSupplierProductStrength').value.trim(),
        size_value: document.getElementById('editSupplierProductSize').value.trim(),
        unit: document.getElementById('editSupplierProductUnit').value,
        packaging: document.getElementById('editSupplierProductPackaging').value,
        pack_content_qty: packContent.quantity || '',
        supplier_cost_price: document.getElementById('editSupplierProductSupplierCost').value,
        purchase_unit: document.getElementById('editSupplierProductPurchaseUnit').value,
        units_per_purchase_unit: document.getElementById('editSupplierProductUnitsPerPurchaseUnit').value
    };

    if (!payload.supplier_id || !payload.product_id || !payload.category_id || !payload.type_id || !payload.brand_name || !payload.product_name || Number(payload.supplier_cost_price) < 0 || Number(payload.units_per_purchase_unit) <= 0) {
        PharmaUtils.toast.error('Enter valid product details, supplier cost, package, and contains value.');
        return;
    }

    try {
        const data = await fetchJson(endpoint('suppliers/update_supplier_product.php'), {
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
    const product = supplierProductRows.find((row) => String(row.product_id) === String(button.dataset.productId));
    const confirmed = confirm(`Remove ${product?.product_name || 'this product'} from this supplier?`);
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
            body: JSON.stringify({ unit_name: unitName })
        });
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
document.getElementById('addSupplierForm')?.addEventListener('submit', submitSupplier);
document.getElementById('supplierProductSupplier')?.addEventListener('change', updateDependentProductSelectors);
document.getElementById('supplierProductCategory')?.addEventListener('change', updateDependentProductSelectors);
document.getElementById('supplierProductType')?.addEventListener('change', applyAddProductTypeRules);
document.getElementById('addSupplierProductForm')?.addEventListener('submit', submitProduct);
document.getElementById('btnAddGroceryVariation')?.addEventListener('click', addGroceryVariationEntry);
document.getElementById('groceryVariationList')?.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.btn-remove-grocery-variation');
    if (!removeButton) return;
    const entries = document.querySelectorAll('#groceryVariationList .grocery-variation-entry');
    if (entries.length > 1) removeButton.closest('.grocery-variation-entry')?.remove();
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
document.getElementById('editSupplierProductPurchaseUnit')?.addEventListener('change', updateSupplierProductConversionPreview);
document.getElementById('editSupplierProductUnitsPerPurchaseUnit')?.addEventListener('input', updateSupplierProductConversionPreview);
document.getElementById('editSupplierProductUnit')?.addEventListener('change', updateSupplierProductConversionPreview);
document.getElementById('editSupplierProductPackaging')?.addEventListener('change', updateSupplierProductConversionPreview);
document.getElementById('supplierProductSearch')?.addEventListener('input', refreshSupplierProductTable);
document.getElementById('supplierProductFilterSupplier')?.addEventListener('change', refreshSupplierProductTable);
document.getElementById('supplierProductFilterCategory')?.addEventListener('change', refreshSupplierProductTable);
document.getElementById('supplierProductFilterType')?.addEventListener('change', refreshSupplierProductTable);
document.getElementById('supplierProductFilterPackage')?.addEventListener('change', refreshSupplierProductTable);
document.getElementById('editSupplierProductCategory')?.addEventListener('change', async (event) => {
    await loadEditProductTypes(event.target.value, '');
    updateSupplierProductConversionPreview();
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
    const editButton = event.target.closest('.edit-supplier-btn');
    const archiveButton = event.target.closest('.archive-supplier-btn');

    if (editButton) editSupplier(editButton);
    if (archiveButton) archiveSupplier(archiveButton.dataset.id);
});
document.getElementById('table-supplier-products')?.addEventListener('click', (event) => {
    const editButton = event.target.closest('.edit-supplier-product-btn');
    const deleteButton = event.target.closest('.delete-supplier-product-btn');

    if (editButton) openEditSupplierProduct(editButton.dataset.supplierProductId);
    if (deleteButton) deleteSupplierProduct(deleteButton);
});

loadSuppliers();
loadProductCategories();
updateDependentProductSelectors();
loadSupplierProducts();
