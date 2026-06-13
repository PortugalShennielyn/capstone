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
    const response = await fetch(url, { credentials: 'include', ...options });
    const data = await response.json();

    if (!response.ok || data.status === 'error') {
        throw new Error(data.message || 'Request failed.');
    }

    return data;
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
    const date = new Date(String(value).replace(' ', 'T'));
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
        return isMedicine ? (item.generic_name || 'N/A') : (item.variant_flavor || 'N/A');
    }

    if (field === 'strengthSize') {
        if (isMedicine) {
            if (isLiquid) {
                return [item.volume_value, item.volume_unit].filter(Boolean).join(' ') || item.strength || 'N/A';
            }

            return [item.strength_value, item.strength_unit].filter(Boolean).join(' ') || item.strength || 'N/A';
        }

        return item.weight_volume_value
            ? [item.weight_volume_value, item.weight_volume_unit].filter(Boolean).join(' ')
            : (item.size_value || 'N/A');
    }

    if (field === 'packaging') {
        return item.packaging || 'N/A';
    }

    return 'N/A';
}

function productLineTotal(item) {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.price || 0);
    return quantity * unitPrice;
}

function isMedicineItem(item) {
    return String(item?.category_name || '').trim().toLowerCase() === 'medicine';
}

function draftItemFromOption(option, quantity = 1) {
    if (!option) return null;

    return {
        po_item_id: null,
        product_id: option.value,
        variation_id: option.dataset.variationId || '',
        product_name: option.textContent || '',
        brand_name: option.dataset.brand || '',
        unit: option.dataset.unit || '',
        category_name: option.dataset.categoryName || '',
        type_name: option.dataset.typeName || '',
        generic_name: option.dataset.genericName || '',
        strength: option.dataset.strength || '',
        strength_value: option.dataset.strengthValue || '',
        strength_unit: option.dataset.strengthUnit || '',
        volume_value: option.dataset.volumeValue || '',
        volume_unit: option.dataset.volumeUnit || '',
        variant_flavor: option.dataset.variantFlavor || '',
        size_value: option.dataset.sizeValue || '',
        weight_volume_value: option.dataset.weightVolumeValue || '',
        weight_volume_unit: option.dataset.weightVolumeUnit || '',
        packaging: option.dataset.packaging || '',
        price: Number(option.dataset.price || 0),
        quantity: Number(quantity || 1)
    };
}

function setValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value ?? '';
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
        price,
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
            option.value = product.product_id;
            const variationLabel = [
                product.variant_flavor,
                [product.strength_value, product.strength_unit].filter(Boolean).join(' '),
                [product.volume_value, product.volume_unit].filter(Boolean).join(' '),
                [product.weight_volume_value, product.weight_volume_unit].filter(Boolean).join(' '),
                product.size_value,
                product.unit,
                product.packaging
            ].filter(Boolean).join(' | ');
            option.textContent = variationLabel ? `${product.product_name} - ${variationLabel}` : product.product_name;
            option.dataset.variationId = product.variation_id || '';
            option.dataset.brand = product.brand_name || '';
            option.dataset.unit = product.unit || product.measurement_unit_name || '';
            option.dataset.price = product.price || '0';
            option.dataset.categoryName = product.category_name || '';
            option.dataset.typeName = product.type_name || '';
            option.dataset.genericName = product.generic_name || '';
            option.dataset.strength = product.strength_size_value || '';
            option.dataset.strengthValue = product.strength_value || '';
            option.dataset.strengthUnit = product.strength_unit || '';
            option.dataset.volumeValue = product.volume_value || '';
            option.dataset.volumeUnit = product.volume_unit || '';
            option.dataset.variantFlavor = product.variant_flavor || '';
            option.dataset.sizeValue = product.size_value || '';
            option.dataset.weightVolumeValue = product.weight_volume_value || '';
            option.dataset.weightVolumeUnit = product.weight_volume_unit || '';
            option.dataset.packaging = product.packaging || '';
            productSelect.appendChild(option);
        });

        productSelect.disabled = products.length === 0;
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
        table.style.minWidth = view === 'delivered' ? '1660px' : (view === 'arrived' ? '1320px' : '1540px');
    }

    if (view === 'arrived') {
        const nextHead = `
            <tr>
                <th class="col-date">Order Date</th>
                <th class="col-po-number">PO Number</th>
                <th class="col-supplier">Supplier Name</th>
                <th class="col-items">Items</th>
                <th class="col-brand">Brand Name</th>
                <th class="col-qty">Ordered Quantity</th>
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
                <th class="col-supplier">Supplier Name</th>
                <th class="col-items">Items</th>
                <th class="col-brand">Brand Name</th>
                <th class="col-qty">Ordered Quantity</th>
                <th class="col-received">Received Quantity</th>
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
            <th class="col-supplier">Supplier Name</th>
            <th class="col-items">Items</th>
            <th class="col-brand">Brand Name</th>
            <th class="col-qty">Quantity</th>
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

    requestAnimationFrame(() => {
        renderTableHead(view);
        tableBody.innerHTML = bodyHtml;
        tableBody.classList.remove('po-table-body-updating');
        window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('drp:tables-updated')));
    });
}

function renderActivePurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable('active', tableEmpty(11, 'No active purchase orders found.'));
        return;
    }

    const bodyHtml = orders.map((order) => {
        const itemNames = (order.items || []).length ? order.items.map((item) => item.product_name) : (order.item_names || []);
        const brandNames = Array.isArray(order.brand_names)
            ? order.brand_names
            : (order.items || []).map((item) => item.brand_name);
        const quantities = order.quantities || (order.items || []).map((item) => item.quantity);

        return `
        <tr>
            <td>${formatDate(order.order_date)}</td>
            <td>${escapeHtml(order.supplier_name)}</td>
            <td>${numberedList(itemNames)}</td>
            <td>${numberedList(brandNames)}</td>
            <td>${numberedList(quantities, { plain: true })}</td>
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
        const itemNames = (order.items || []).length ? order.items.map((item) => item.product_name) : (order.item_names || []);
        const brandNames = Array.isArray(order.brand_names)
            ? order.brand_names
            : (order.items || []).map((item) => item.brand_name);
        const quantities = order.quantities || (order.items || []).map((item) => item.quantity);

        return `
            <tr>
                <td>${formatDate(order.order_date)}</td>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td>${numberedList(itemNames)}</td>
                <td>${numberedList(brandNames)}</td>
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
        const itemNames = items.length ? items.map((item) => item.product_name) : (order.item_names || []);
        const brandNames = Array.isArray(order.brand_names) ? order.brand_names : items.map((item) => item.brand_name);
        const orderedQuantities = order.quantities || items.map((item) => item.quantity);
        const receivedQuantities = items.map((item) => Number(item.received_quantity || 0));
        const deliveryDate = order.delivery_date || order.received_date || order.expected_delivery_date || order.order_date;

        return `
            <tr>
                <td>${formatDate(deliveryDate)}</td>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
                <td>${numberedList(itemNames)}</td>
                <td>${numberedList(brandNames)}</td>
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

        if (updateSummary) renderStatusSummary(data.status_counts || {});
        if (viewAtRequest === 'arrived') {
            renderArrivedPurchaseOrders(data.purchase_orders || []);
        } else if (viewAtRequest === 'delivered') {
            renderDeliveredPurchaseOrders(data.purchase_orders || []);
        } else {
            renderActivePurchaseOrders(data.purchase_orders || []);
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
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No items added yet.</td></tr>';
        return;
    }

    const isEditTable = tableSelector === '#table-edit-po-items';
    tableBody.innerHTML = items.map((item, index) => `
        <tr>
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.brand_name)}</td>
            <td>${escapeHtml(item.unit)}</td>
            <td>${money(item.price)}</td>
            <td>${escapeHtml(item.quantity)}</td>
            <td>
                <div class="po-actions">
                    ${isEditTable ? `<button class="btn btn-sm btn-outline-secondary edit-po-item" type="button" data-index="${index}" aria-label="Edit item"><i class="fa-solid fa-pen"></i></button>` : ''}
                    <button class="btn btn-sm btn-outline-danger ${removeClass}" type="button" data-index="${index}" aria-label="Remove item"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function addDraftItem({ items, productSelectId, quantityInputId, tableSelector, removeClass }) {
    const productSelect = document.getElementById(productSelectId);
    const quantityInput = document.getElementById(quantityInputId);
    const option = productSelect?.options[productSelect.selectedIndex];
    const quantity = Number(quantityInput?.value);

    if (!productSelect?.value || !option || quantity <= 0) {
        PharmaUtils.toast.error('Select a product and enter a valid quantity.');
        return;
    }

    const existing = items.find((item) => String(item.product_id) === String(productSelect.value) && String(item.variation_id || '') === String(option.dataset.variationId || ''));
    if (existing) {
        existing.quantity += quantity;
    } else {
        items.push(draftItemFromOption(option, quantity));
    }

    quantityInput.value = '1';
    renderDraftItems(items, tableSelector, removeClass);
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
    document.getElementById('po-payment-terms').value = '';
    document.getElementById('po-expected-delivery').value = '';
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
            variation_id: item.variation_id || null,
            product_name: item.product_name || '',
            brand_name: item.brand_name || '',
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
            unit: item.unit || '',
            packaging: item.packaging || '',
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 0)
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
                <td>${escapeHtml(item.category_name || 'N/A')}</td>
                <td>${escapeHtml(item.type_name || 'N/A')}</td>
                <td>${escapeHtml(productDetailValue(item, 'genericVariant'))}</td>
                <td>${escapeHtml(productDetailValue(item, 'strengthSize'))}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(productDetailValue(item, 'packaging'))}</td>
                <td>${money(item.price)}</td>
                <td>${escapeHtml(item.quantity)}</td>
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
            brand_name: item.brand_name,
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
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 0)
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
            <td>${escapeHtml(item.quantity)}</td>
            <td><input class="form-control form-control-sm receive-qty-input" type="number" min="0" max="${escapeHtml(item.quantity)}" value="${escapeHtml(item.quantity)}"></td>
            <td><input class="form-control form-control-sm damaged-qty-input" type="number" min="0" max="${escapeHtml(item.quantity)}" value="${escapeHtml(item.damaged_quantity || 0)}"></td>
            <td><input class="form-control form-control-sm receive-remarks-input" type="text" value=""></td>
        </tr>
    `).join('');
}

function orderTotal(order) {
    if (Number(order?.total_amount || 0) > 0) {
        return Number(order.total_amount);
    }

    return (order?.items || []).reduce((total, item) => {
        return total + (Number(item.quantity || 0) * Number(item.price || 0));
    }, 0);
}

function receivePaymentSummary() {
    const originalTotal = (activeReceiveOrder?.items || []).reduce((total, item) => {
        return total + (Number(item.quantity || 0) * Number(item.price || 0));
    }, 0);
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
        const orderedQuantity = Number(orderItem?.quantity || 0);

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
        const maxReturnQuantity = hasReceivingRecord ? damagedQuantity : Number(item.quantity || 0);

        return `
        <tr data-po-item-id="${escapeHtml(item.po_item_id)}">
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.brand_name)}</td>
            <td>${escapeHtml(item.quantity)}</td>
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
        const maxReturnQuantity = hasReceivingRecord ? damagedQuantity : Number(orderItem?.quantity || 0);

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
    document.getElementById('po-supplier-select')?.addEventListener('change', (event) => loadSupplierProducts(event.target.value, 'po-product-select'));
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
    document.getElementById('po-status-filter')?.addEventListener('change', loadPurchaseOrders);
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
