import API_BASE_URL from '../config/config.js';
import PharmaUtils from '../utils.js';

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

function hideDynamicProductFields() {
    const medicineFields = document.getElementById('medicineFields');
    const groceryFields = document.getElementById('groceryFields');

    medicineFields?.classList.remove('is-visible');
    groceryFields?.classList.remove('is-visible');

    if (medicineFields) {
        medicineFields.style.display = 'none';
    }

    if (groceryFields) {
        groceryFields.style.display = 'none';
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

function isMedicine(product) {
    return product.category_name === 'Medicine';
}

function isGrocery(product) {
    return product.category_name === 'Grocery';
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
    return variation?.variation_name || variation?.variant_name || variation?.variant_flavor || 'Default';
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
    const variation = isGrocery(product) ? getDefaultVariation(product) : null;
    return variation ? Number(variation.stock ?? variation.current_stock ?? 0) : getProductStock(product);
}

function getActiveProductPrice(product) {
    const variation = isGrocery(product) ? getDefaultVariation(product) : null;
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
    const unit = getProductUnit(product);
    const size = getProductSize(product);
    const variation = isGrocery(product) ? getDefaultVariation(product) : null;

    if (isGrocery(product)) {
        return [
            ['Net Weight', combineValueUnit(variation?.weight_value ?? product.weight_volume_value, variation?.weight_unit ?? product.weight_volume_unit)],
            ['Size', variation?.size_value || product.display_size || size],
            ['Packaging', variation?.packaging || product.packaging || 'N/A']
        ];
    }

    if (isMedicine(product)) {
        const kind = medicineKind(product);

        if (kind === 'liquid') {
            return [
                ['Generic', product.generic_name || 'N/A'],
                ['Volume', combineValueUnit(product.volume_value || product.strength_value || strength, product.volume_unit)],
                ['Unit', product.product_unit || unit],
                ['Packaging', product.packaging || 'N/A']
            ];
        }

        if (kind === 'supply') {
            return [
                ['Generic', product.generic_name || 'N/A'],
                ['Size', product.display_size || size],
                ['Unit', product.product_unit || unit],
                ['Packaging', product.packaging || 'N/A']
            ];
        }

        return [
            ['Generic', product.generic_name || 'N/A'],
            ['Strength', combineValueUnit(product.strength_value || strength, product.strength_unit)],
            ['Unit', product.product_unit || unit],
            ['Packaging', product.packaging || 'N/A']
        ];
    }

    return [
        ['Type', product.type_name || 'N/A'],
        ['Unit', product.product_unit || unit],
        ['Size', size],
        ['Packaging', product.packaging || 'N/A']
    ];
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

function groceryVariationChips(product) {
    if (!isGrocery(product) || !Array.isArray(product.variations) || product.variations.length <= 1) {
        return '';
    }

    const activeVariation = getDefaultVariation(product);
    return `
        <div class="product-variant-tabs">
            <div class="product-variant-label">Variants</div>
            <div class="product-variant-chip-row">
                ${product.variations.map(variation => `
                    <button type="button"
                        class="product-variant-chip ${String(activeVariation?.variation_id) === String(variation.variation_id) ? 'is-active' : ''}"
                        data-product-id="${escapeHtml(product.product_id)}"
                        data-variation-id="${escapeHtml(variation.variation_id)}">
                        ${escapeHtml(getVariationName(variation))}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
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

    grid.innerHTML = products.map(product => {
        const activeVariation = getDefaultVariation(product);
        const stock = getActiveProductStock(product);
        const stockStatus = getStockStatus(stock);
        const detailRows = productCardDetailRows(product);
        const variationId = activeVariation?.variation_id || '';

        return `
            <article class="product-card">
                <div class="product-card-body">
                    <div class="product-card-head">
                        <div class="product-name-block">
                            <h3 class="product-title">${escapeHtml(product.product_name || 'Unnamed Product')}</h3>
                            <div class="product-brand">${escapeHtml(product.brand_name || 'No brand')}</div>
                        </div>
                        <div class="product-card-tools">
                            <button type="button" class="product-barcode-toggle" data-product-id="${escapeHtml(product.product_id)}" data-variation-id="${escapeHtml(variationId)}" title="Show product ID" aria-label="Show product ID">
                                <i class="fa-solid fa-barcode"></i>
                            </button>
                        </div>
                    </div>
                    <div class="product-meta">${escapeHtml(product.category_name || 'N/A')} &bull; ${escapeHtml(product.type_name || 'N/A')}</div>
                    <div class="product-detail-list">
                        ${detailRows.map(([label, value]) => `<div>${escapeHtml(label)}: ${escapeHtml(value)}</div>`).join('')}
                    </div>
                    ${groceryVariationChips(product)}
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
    }).join('');
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

        productState.types = resp?.types || [];
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

function buildProductPayload() {
    const productTypeSelect = document.getElementById('productType');
    const selectedCategory = productTypeSelect?.selectedOptions?.[0];
    const productType = getValue('productType');

    const payload = {
        barcode: getValue('productBarcode'),
        brand_name: getValue('productBrandName'),
        product_name: getValue('productName'),
        category_id: selectedCategory?.dataset.categoryId || '',
        category_name: productType,
        product_type: productType,
        unit: getValue('productUnit'),
        price: getValue('productPrice'),
        supplier_id: getValue('supplier_id') || null
    };

    if (productType === 'Medicine') {
        payload.generic_name = getValue('genericName');
        payload.strength_size = getValue('strengthSize');
    }

    if (productType === 'Grocery') {
        payload.variant_flavor = getValue('variantFlavor');
        payload.size_value = getValue('sizeValue');
        payload.packaging = getValue('packaging');
    }

    return payload;
}

async function populateCategoryDropdown(selectId = 'productType') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="" disabled selected>Select category...</option>';

    try {
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_categories.php`, {
            method: 'GET',
            credentials: 'include'
        });

        (resp?.categories || []).forEach(category => {
            const opt = document.createElement('option');
            opt.value = category.category_name;
            opt.textContent = category.category_name;
            opt.dataset.categoryId = category.category_id;
            select.appendChild(opt);
        });

        if (currentValue) {
            select.value = currentValue;
        }
    } catch (err) {
        console.warn('Failed to load product categories:', err.message || err);
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
            hideDynamicProductFields();
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
        const resp = await PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_products.php`, {
            method: 'GET',
            credentials: 'include'
        });

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
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-danger py-4">${escapeHtml(err.message)}</td>
            </tr>
        `;
    }
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
    (resp?.types || []).forEach(type => {
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
    document.getElementById('editMedicineFieldsWrap')?.classList.toggle('d-none', categoryName !== 'Medicine');
    document.getElementById('editGroceryFieldsWrap')?.classList.toggle('d-none', categoryName !== 'Grocery');
    document.getElementById('editGroceryUnitWrap')?.classList.toggle('d-none', categoryName !== 'Grocery');
    const generic = document.getElementById('editProductGeneric');
    const strength = document.getElementById('editProductStrength');
    const volume = document.getElementById('editProductVolumeValue');
    const size = document.getElementById('editProductSizeValue');
    const medicineUnit = document.getElementById('editProductMeasurementUnit');
    const groceryUnit = document.getElementById('editProductMeasurementUnitGrocery');
    if (generic) generic.required = categoryName === 'Medicine';
    if (strength) strength.required = false;
    if (volume) volume.required = false;
    if (size) size.required = categoryName === 'Grocery';
    if (medicineUnit) medicineUnit.required = categoryName !== 'Grocery';
    if (groceryUnit) groceryUnit.required = categoryName === 'Grocery';
}

async function openEditProduct(productId) {
    const product = getProductById(productId);
    const modalElement = document.getElementById('editProductModal');

    if (!product || !modalElement) return;

    document.getElementById('editProductId').value = product.product_id || '';
    document.getElementById('editProductBrand').value = product.brand_name || '';
    document.getElementById('editProductName').value = product.product_name || '';
    document.getElementById('editProductGeneric').value = product.generic_name || '';
    document.getElementById('editProductStrength').value = product.strength_value || product.strength_size_value || product.strength_size || '';
    setSelectValue('editProductStrengthUnit', product.strength_unit || '');
    document.getElementById('editProductVolumeValue').value = product.volume_value || '';
    setSelectValue('editProductVolumeUnit', product.volume_unit || '');
    setSelectValue('editProductMedicineSize', product.display_size || product.size_value || 'N/A');
    setSelectValue('editProductMedicinePackaging', product.packaging || '');
    document.getElementById('editProductVariantFlavor').value = product.variant_flavor || '';
    setSelectValue('editProductSizeValue', product.size_value || product.packaging_size || '');
    document.getElementById('editProductWeightVolumeValue').value = product.weight_volume_value || '';
    setSelectValue('editProductWeightVolumeUnit', product.weight_volume_unit || '');
    setSelectValue('editProductPackaging', product.packaging || '');
    document.getElementById('editProductPrice').value = product.price || '';
    document.getElementById('editProductImageUrl').value = product.image_url || product.image_path || '';

    await populateEditCategories(product.category_id || '');
    await populateEditTypes(product.category_id || '', product.type_id || '');
    await populateEditUnits(product.measurement_unit_id || '');
    toggleEditGenericField();

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
        measurement_unit_id: categoryName === 'Grocery' ? getValue('editProductMeasurementUnitGrocery') : getValue('editProductMeasurementUnit'),
        product_unit: categoryName === 'Grocery'
            ? document.getElementById('editProductMeasurementUnitGrocery')?.selectedOptions?.[0]?.textContent?.trim()
            : document.getElementById('editProductMeasurementUnit')?.selectedOptions?.[0]?.textContent?.trim(),
        strength_size_value: getValue('editProductStrength') || getValue('editProductVolumeValue') || getValue('editProductMedicineSize'),
        strength_value: getValue('editProductStrength'),
        strength_unit: getValue('editProductStrengthUnit'),
        volume_value: getValue('editProductVolumeValue'),
        volume_unit: getValue('editProductVolumeUnit'),
        display_size: categoryName === 'Grocery' ? getValue('editProductSizeValue') : getValue('editProductMedicineSize'),
        weight_volume_value: getValue('editProductWeightVolumeValue'),
        weight_volume_unit: getValue('editProductWeightVolumeUnit'),
        price: getValue('editProductPrice'),
        image_url: getValue('editProductImageUrl')
    };

    if (categoryName === 'Medicine') {
        payload.generic_name = getValue('editProductGeneric');
    }

    if (categoryName === 'Grocery') {
        payload.variant_flavor = getValue('editProductVariantFlavor');
        payload.size_value = getValue('editProductSizeValue');
        payload.packaging = getValue('editProductPackaging');
    } else {
        payload.size_value = getValue('editProductMedicineSize');
        payload.packaging = getValue('editProductMedicinePackaging');
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
            productState.selectedVariations[variationChip.dataset.productId] = variationChip.dataset.variationId;
            renderProductCards();
            return;
        }

        if (editButton) openEditProduct(editButton.dataset.productId);
        if (deleteButton) deleteProduct(deleteButton.dataset.productId);
    });

    document.getElementById('editProductCategory')?.addEventListener('change', async (event) => {
        await populateEditTypes(event.target.value, '');
        toggleEditGenericField();
    });
    document.getElementById('editProductMeasurementUnit')?.addEventListener('change', () => syncEditUnitSelects('editProductMeasurementUnit'));
    document.getElementById('editProductMeasurementUnitGrocery')?.addEventListener('change', () => syncEditUnitSelects('editProductMeasurementUnitGrocery'));

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
        populateCategoryDropdown();
    });
}

populateCategoryDropdown();
