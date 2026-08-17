import API_BASE_URL from '../config/config.js';
import { ensurePageTabSession, tabToken } from './auth_guard.js?v=27';
import { primaryAccessRole } from './rbac.js';
import { formatProductSpecification as productSpecification } from './product_specification.js?v=2';

let products = [];
let requests = [];
let inventoryRows = [];
let actorRole = '';
let sessionUser = null;
let dataReady = false;
let inventoryShortcutHandled = false;
let requestInFlight = false;
let editingRequest = null;
let generatingRequest = null;
let poGenerationStep = 1;
let procurementSelections = {};
let supplierEtas = {};
let generationInFlight = false;
let relatedPurchaseOrders = [];
let relatedPoReturnToList = false;
let activeRelatedPurchaseOrder = null;
const selectedItems = new Map();
const inventoryByProduct = new Map();
const productById = new Map();
const activeRequestStatuses = new Set(['Draft', 'Pending Supervisor Approval', 'Approved', 'Revision Requested', 'Partially Ordered']);
const creatorRoles = new Set(['super_admin', 'admin', 'manager']);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const peso = value => Number(value || 0).toLocaleString('en-PH', { style:'currency', currency:'PHP' });

function canCreatePurchaseRequests() {
    return creatorRoles.has(actorRole);
}

function isRequestOwner(request) {
    return String(request?.requested_by || '') === String(sessionUser?.user_id || '');
}

async function json(url, options = {}) {
    const response = await fetch(url, { credentials:'include', cache:'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status === 'error' || data.success === false) throw new Error(data.message || 'Request failed.');
    return data;
}

function roleFromSession(session) {
    return String(session?.access_role || primaryAccessRole(session) || session?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function applyRoleUi(session) {
    sessionUser = session || null;
    actorRole = roleFromSession(session);
    const createButton = document.getElementById('createRequestButton');
    const canCreate = canCreatePurchaseRequests();
    createButton?.classList.toggle('d-none', !canCreate);
    createButton?.setAttribute('aria-hidden', canCreate ? 'false' : 'true');
    renderTable();
    maybeOpenInventoryShortcut();
}

function inventoryContext(productId) {
    const inventory = inventoryByProduct.get(String(productId));
    const onHand = Number(inventory?.total_quantity ?? (Number(inventory?.storage_quantity || 0) + Number(inventory?.shelf_quantity || 0)));
    return {
        inventory,
        storage: Number(inventory?.storage_quantity || 0),
        shelf: Number(inventory?.shelf_quantity || 0),
        onHand,
        stockStatus: inventory ? inventory.stock_status : 'New Product',
        reorderLevel: Number(inventory?.reorder_level || 30),
    };
}

function stockStatusClass(status) {
    if (status === 'New Product') return 'is-na';
    if (status === 'Low Stock') return 'is-low';
    if (status === 'Out of Stock') return 'is-out';
    if (status === 'In Stock') return 'is-in';
    return 'is-na';
}

function replenishmentType(productId) {
    const context = inventoryContext(productId);
    if (!context.inventory || context.stockStatus === 'New Product') return 'new';
    if (context.stockStatus === 'Out of Stock') return 'out';
    if (context.stockStatus === 'Low Stock') return 'low';
    return '';
}

function activeConflict(productId, excludePrId = '') {
    return requests.find(request => {
        if (String(request.pr_id) === String(excludePrId) || !activeRequestStatuses.has(request.status)) return false;
        const item = (request.items || []).find(candidate => String(candidate.product_id) === String(productId));
        return Boolean(item) && (request.status !== 'Approved' || Number(item.remaining_qty || 0) > 0);
    }) || null;
}

function currentRequestId() {
    return String(editingRequest?.pr_id || '');
}

function defaultRequestedQuantity(productId) {
    const context = inventoryContext(productId);
    return Math.max(1, Math.ceil(Math.max(1, context.reorderLevel - context.onHand)));
}

function hasActiveSupplierAssignment(product) {
    return Number(product?.has_active_supplier_assignment || 0) === 1;
}

function baseInventoryUnit(product) {
    return String(product?.base_inventory_unit || '').trim();
}

function baseUnitAllowsDecimal(product) {
    return Number(product?.base_unit_allows_decimal || 0) === 1 || product?.base_unit_allows_decimal === true;
}

function validRequestedQuantity(product, value) {
    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity > 0 && (baseUnitAllowsDecimal(product) || Number.isInteger(quantity));
}

function hasConfiguredBaseUnit(product) {
    return baseInventoryUnit(product) !== '';
}

function selectProduct(productId, requestedQty = null) {
    const key = String(productId || '');
    const product = productById.get(key);
    if (!key || selectedItems.has(key) || !hasActiveSupplierAssignment(product) || !hasConfiguredBaseUnit(product) || activeConflict(key, currentRequestId())) return;
    const quantity = Number(requestedQty ?? defaultRequestedQuantity(key));
    selectedItems.set(key, { product_id:key, requested_qty:validRequestedQuantity(product, quantity) ? quantity : 1 });
    renderSelectionState();
}

function removeProduct(productId) {
    selectedItems.delete(String(productId || ''));
    renderSelectionState();
}

function setRequestedQuantity(productId, value) {
    const item = selectedItems.get(String(productId || ''));
    if (!item) return;
    item.requested_qty = Number(value);
    renderSelectedCount();
    renderConflictSummary();
    updateActionState();
}

function selectedConflictMessages() {
    const messages = [];
    selectedItems.forEach(item => {
        const conflict = activeConflict(item.product_id, currentRequestId());
        if (!conflict) return;
        const product = productById.get(item.product_id) || {};
        const conflictItem = (conflict.items || []).find(row => String(row.product_id) === item.product_id);
        messages.push(`${product.product_name || 'This product'} already has ${Number(conflictItem?.requested_qty || 0)} units requested in ${conflict.pr_number}.`);
    });
    return [...new Set(messages)];
}

function selectedSupplierAssignmentMessages() {
    const messages = [];
    selectedItems.forEach(item => {
        const product = productById.get(item.product_id);
        if (hasActiveSupplierAssignment(product)) return;
        messages.push(`${product?.product_name || 'This product'} cannot be requested because no supplier is assigned.`);
    });
    return [...new Set(messages)];
}

function selectedBaseUnitMessages() {
    const messages = [];
    selectedItems.forEach(item => {
        const product = productById.get(item.product_id);
        if (hasConfiguredBaseUnit(product)) return;
        messages.push(`${product?.product_name || 'This product'} cannot be requested because its base inventory unit is not configured. Fix the Product Master configuration first.`);
    });
    return [...new Set(messages)];
}

function selectionIsValid() {
    if (!selectedItems.size || selectedConflictMessages().length || selectedSupplierAssignmentMessages().length || selectedBaseUnitMessages().length) return false;
    return [...selectedItems.values()].every(item => validRequestedQuantity(productById.get(item.product_id), item.requested_qty));
}

function renderSelectedCount() {
    const target = document.getElementById('selectedProductCount');
    if (target) target.textContent = String(selectedItems.size);
}

function visibleEligibleProducts(requiredType = '') {
    const query = String(document.getElementById('productSelectorSearch')?.value || '').trim().toLowerCase();
    const filter = document.getElementById('replenishmentFilter')?.value || 'all';
    const rank = { 'Out of Stock':0, 'Low Stock':1, 'New Product':2 };
    return products
        .filter(product => String(product.status || product.product_status || 'Active').toLowerCase() === 'active')
        .filter(hasActiveSupplierAssignment)
        .filter(product => {
            const type = replenishmentType(product.product_id);
            return Boolean(type) && (filter === 'all' || type === filter) && (!requiredType || type === requiredType);
        })
        .filter(product => !query || [product.product_name, product.brand_name, productSpecification(product), product.barcode].join(' ').toLowerCase().includes(query))
        .sort((a, b) => (rank[inventoryContext(a.product_id).stockStatus] ?? 3) - (rank[inventoryContext(b.product_id).stockStatus] ?? 3)
            || String(a.brand_name || '').localeCompare(String(b.brand_name || ''))
            || String(a.product_name || '').localeCompare(String(b.product_name || '')));
}

function syncVisibleSelectionCheckbox() {
    const master = document.getElementById('selectAllVisibleProducts');
    if (!master) return;
    const visibleIds = visibleEligibleProducts()
        .filter(product => hasConfiguredBaseUnit(product) && !activeConflict(product.product_id, currentRequestId()))
        .map(product => String(product.product_id));
    const selectedCount = visibleIds.filter(productId => selectedItems.has(productId)).length;
    master.disabled = visibleIds.length === 0;
    master.checked = visibleIds.length > 0 && selectedCount === visibleIds.length;
    master.indeterminate = selectedCount > 0 && selectedCount < visibleIds.length;
}

function renderProductCatalog() {
    const body = document.getElementById('productSelectorRows');
    if (!body) return;
    const rows = visibleEligibleProducts();
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="9" class="product-selector-empty">No eligible replenishment items match these filters.</td></tr>';
        syncVisibleSelectionCheckbox();
        return;
    }
    body.innerHTML = rows.map(product => {
        const productId = String(product.product_id);
        const context = inventoryContext(productId);
        const selected = selectedItems.get(productId);
        const conflict = activeConflict(productId, currentRequestId());
        const missingBaseUnit = !hasConfiguredBaseUnit(product);
        const disabled = missingBaseUnit || (conflict && !selected);
        const disabledReason = missingBaseUnit
            ? `${product.product_name || 'This product'} cannot be requested because its base inventory unit is not configured. Fix the Product Master configuration first.`
            : (conflict ? `Already requested in ${conflict.pr_number}` : '');
        const unit = baseInventoryUnit(product);
        const step = baseUnitAllowsDecimal(product) ? '0.01' : '1';
        const checkbox = `<input class="catalog-checkbox" type="checkbox" data-product-select="${esc(productId)}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="Select ${esc(product.product_name || 'product')}" title="${esc(disabledReason || 'Select product')}">`;
        const quantityInput = `<input class="form-control catalog-qty" type="number" min="${step}" step="${step}" inputmode="decimal" value="${selected ? esc(selected.requested_qty) : ''}" data-selected-qty="${esc(productId)}" ${selected ? '' : 'disabled'} aria-label="Requested quantity for ${esc(product.product_name || 'product')}">`;
        return `<tr class="${selected ? 'is-selected' : ''} ${disabled ? 'is-unselectable' : ''}" ${disabled ? '' : `data-product-row="${esc(productId)}"`}><td>${checkbox}</td><td class="catalog-product"><strong>${esc(product.product_name || '-')}</strong><span>${esc(product.brand_name || 'No brand')}</span></td><td class="catalog-specification">${esc(productSpecification(product))}</td><td class="catalog-base-unit"><strong>${esc(unit || 'Unit not configured')}</strong>${missingBaseUnit ? '<small>Fix in Product Master</small>' : ''}</td><td class="catalog-stock">${esc(context.shelf)}</td><td class="catalog-stock">${esc(context.storage)}</td><td class="catalog-stock"><strong>${esc(context.onHand)}${unit ? ` ${esc(unit)}` : ''}</strong></td><td><span class="request-stock-status ${stockStatusClass(context.stockStatus)}">${esc(context.stockStatus)}</span></td><td><div class="catalog-action">${quantityInput}<strong>${esc(unit || 'Unit not configured')}</strong></div></td></tr>`;
    }).join('');
    syncVisibleSelectionCheckbox();
}

function bulkSelectProducts(type = '') {
    visibleEligibleProducts(type).forEach(product => {
        if (hasConfiguredBaseUnit(product) && !activeConflict(product.product_id, currentRequestId())) {
            const key = String(product.product_id);
            if (!selectedItems.has(key)) selectedItems.set(key, { product_id:key, requested_qty:defaultRequestedQuantity(key) });
        }
    });
    renderSelectionState();
}

function setVisibleProductsSelected(selected) {
    visibleEligibleProducts()
        .filter(product => hasConfiguredBaseUnit(product) && !activeConflict(product.product_id, currentRequestId()))
        .forEach(product => {
        const key = String(product.product_id);
        if (selected) {
            if (!selectedItems.has(key)) {
                selectedItems.set(key, { product_id:key, requested_qty:defaultRequestedQuantity(key) });
            }
        } else {
            selectedItems.delete(key);
        }
    });
    renderSelectionState();
}

function renderFinalizeItems() {
    const body = document.getElementById('finalizeRequestItems');
    if (!body) return;
    body.innerHTML = [...selectedItems.values()].map((item, index) => {
        const product = productById.get(item.product_id) || inventoryByProduct.get(item.product_id) || {};
        const context = inventoryContext(item.product_id);
        const unit = baseInventoryUnit(product);
        const step = baseUnitAllowsDecimal(product) ? '0.01' : '1';
        return `<tr data-finalize-product-id="${esc(item.product_id)}"><td>${index + 1}</td><td class="finalize-product-description"><strong>${esc(product.brand_name || '-')}</strong><span>${esc(product.product_name || 'Product')}</span><small>${esc(productSpecification(product))}</small></td><td>${esc(unit || 'Unit not configured')}</td><td>${esc(context.shelf)}</td><td>${esc(context.storage)}</td><td><strong>${esc(context.onHand)} ${esc(unit)}</strong></td><td><div class="catalog-action"><input class="form-control finalize-qty" type="number" min="${step}" step="${step}" inputmode="decimal" value="${esc(item.requested_qty)}" data-finalize-qty="${esc(item.product_id)}" aria-label="Requested quantity for ${esc(product.product_name || 'product')}"><strong>${esc(unit || 'Unit not configured')}</strong></div></td><td><button class="btn btn-sm btn-outline-danger remove-finalize-product" type="button" data-product-id="${esc(item.product_id)}" aria-label="Remove ${esc(product.product_name || 'product')}"><i class="fa-solid fa-xmark"></i></button></td></tr>`;
    }).join('');
}

function renderConflictSummary() {
    const summary = document.getElementById('requestConflictSummary');
    if (!summary) return;
    const warnings = [...selectedConflictMessages(), ...selectedSupplierAssignmentMessages(), ...selectedBaseUnitMessages()];
    summary.hidden = warnings.length === 0;
    summary.innerHTML = warnings.length ? `<strong>Purchase Request needs attention</strong><br>${warnings.map(esc).join('<br>')}` : '';
}

function updateActionState() {
    const valid = selectionIsValid();
    const reviewButton = document.getElementById('reviewRequestButton');
    const draftButton = document.getElementById('saveDraftButton');
    const submitButton = document.getElementById('submitRequestButton');
    const previewButton = document.getElementById('previewRequestButton');
    if (reviewButton) reviewButton.disabled = !valid || requestInFlight;
    if (draftButton) draftButton.disabled = !valid || requestInFlight;
    if (submitButton) submitButton.disabled = !valid || requestInFlight;
    if (previewButton) previewButton.disabled = !valid || requestInFlight;
}

function renderSelectionState() {
    renderSelectedCount();
    renderProductCatalog();
    renderFinalizeItems();
    renderConflictSummary();
    updateActionState();
}

function switchModal(fromId, toId) {
    const from = document.getElementById(fromId);
    const to = document.getElementById(toId);
    if (!from || !to) return;
    const showTarget = () => bootstrap.Modal.getOrCreateInstance(to).show();
    if (!from.classList.contains('show')) {
        showTarget();
        return;
    }
    from.addEventListener('hidden.bs.modal', showTarget, { once:true });
    bootstrap.Modal.getOrCreateInstance(from).hide();
}

function statusClass(status) {
    return { Draft:'is-draft', 'Pending Supervisor Approval':'is-pending', Approved:'is-approved', 'Partially Ordered':'is-pending', Ordered:'is-approved', 'Revision Requested':'is-revision', Rejected:'is-rejected' }[status] || 'is-draft';
}

function visiblePrStatus(status) {
    return status;
}

function formatSubmittedDate(value = '') {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleString('en-PH', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}

function renderSummary() {
    const count = status => requests.filter(request => request.status === status).length;
    document.getElementById('draftPrCount').textContent = count('Draft');
    document.getElementById('pendingPrCount').textContent = count('Pending Supervisor Approval');
    document.getElementById('approvedPrCount').textContent = count('Approved');
    document.getElementById('revisionPrCount').textContent = count('Revision Requested');
    document.getElementById('rejectedPrCount').textContent = count('Rejected');
}

function filteredRequests() {
    const search = String(document.getElementById('prSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('prStatusFilter')?.value || '';
    const start = document.getElementById('prStartDate')?.value || '';
    const end = document.getElementById('prEndDate')?.value || '';
    return requests.filter(request => {
        const haystack = [request.pr_number, request.requested_by_name, ...(request.items || []).flatMap(item => [item.product_name, item.brand_name])].join(' ').toLowerCase();
        return (!search || haystack.includes(search)) && (!status || request.status === status) && (!start || request.request_date >= start) && (!end || request.request_date <= end);
    });
}

function printHref(request, autoPrint = true) {
    const params = new URLSearchParams({ pr_id:String(request.pr_id) });
    if (autoPrint) params.set('print', '1');
    return `purchase_request_print.html?${params}`;
}

function prNumberMarkup(value) {
    const parts = String(value || '').split('-');
    if (parts.length < 4) return esc(value || '-');
    return `${esc(parts[0])}&#8209;${esc(parts[1])}&#8209;<wbr>${parts.slice(2).map(esc).join('&#8209;')}`;
}

function openPurchaseRequestPrint(prId) {
    const request = requests.find(item => String(item.pr_id) === String(prId));
    if (!request?.pr_id) throw new Error('The selected Purchase Request is unavailable.');

    const printWindow = window.open('', '_blank');
    if (!printWindow) throw new Error('Allow pop-ups for this site to print the Purchase Request.');

    const token = tabToken();
    if (token) printWindow.sessionStorage.setItem('pharma_tab_token', token);
    printWindow.opener = null;
    printWindow.location.replace(printHref(request));
}

function openPurchaseOrderPrint(poId) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) throw new Error('Allow pop-ups for this site to print the Purchase Order.');
    const token = tabToken();
    if (token) printWindow.sessionStorage.setItem('pharma_tab_token', token);
    printWindow.opener = null;
    printWindow.location.replace(`purchase_order_print.html?po_id=${encodeURIComponent(poId)}`);
}

function poStatusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (/cancel|reject/.test(normalized)) return 'is-rejected';
    if (/deliver|complete|approve|paid/.test(normalized)) return 'is-approved';
    if (/revision|return|damage/.test(normalized)) return 'is-revision';
    return 'is-pending';
}

function renderRelatedPurchaseOrders(orders) {
    const body = document.getElementById('relatedPurchaseOrderRows');
    const empty = document.getElementById('relatedPurchaseOrdersEmpty');
    const table = document.getElementById('relatedPurchaseOrdersTable');
    if (!body || !empty || !table) return;
    if (!orders.length) {
        body.innerHTML = '';
        table.hidden = true;
        empty.hidden = false;
        return;
    }
    empty.hidden = true;
    table.hidden = false;
    body.innerHTML = orders.map(order => {
        const count = Number(order.product_count || 0);
        return `<tr>
            <td><strong class="related-po-number">${esc(order.po_number || '-')}</strong></td>
            <td><span class="related-po-supplier">${esc(order.supplier_name || 'Unknown supplier')}</span></td>
            <td><div class="related-po-items"><strong>${count} ${count === 1 ? 'product' : 'products'}</strong><span title="${esc(order.item_names || '')}">${esc(order.item_names || 'No products')}</span></div></td>
            <td class="text-end fw-bold">${peso(order.total_amount)}</td>
            <td>${order.expected_delivery_date ? esc(formatRequestDate(order.expected_delivery_date)) : '-'}</td>
            <td><span class="pr-status ${poStatusClass(order.status)}">${esc(order.status || 'Pending')}</span></td>
            <td class="related-po-action"><button type="button" class="btn btn-sm btn-outline-secondary" data-related-po-view="${esc(order.po_id)}" title="View ${esc(order.po_number)}" aria-label="View ${esc(order.po_number)}"><i class="fa-regular fa-eye"></i><span>View</span></button></td>
        </tr>`;
    }).join('');
}

async function showRelatedPurchaseOrders(prId) {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('relatedPurchaseOrdersModal'));
    document.getElementById('relatedPurchaseOrdersPrNumber').textContent = '';
    document.getElementById('relatedPurchaseOrderRows').innerHTML = '<tr><td colspan="7" class="related-po-loading">Loading related purchase orders...</td></tr>';
    document.getElementById('relatedPurchaseOrdersTable').hidden = false;
    document.getElementById('relatedPurchaseOrdersEmpty').hidden = true;
    modal.show();
    try {
        const payload = await json(`${API_BASE_URL}/purchase_requests/get_related_purchase_orders.php?pr_id=${encodeURIComponent(prId)}`);
        relatedPurchaseOrders = payload.data?.purchase_orders || [];
        document.getElementById('relatedPurchaseOrdersPrNumber').textContent = payload.data?.pr_number || '';
        renderRelatedPurchaseOrders(relatedPurchaseOrders);
    } catch (error) {
        bootstrap.Modal.getInstance(document.getElementById('relatedPurchaseOrdersModal'))?.hide();
        throw error;
    }
}

function openRelatedPurchaseOrderDocument(poId) {
    const order = relatedPurchaseOrders.find(item => String(item.po_id) === String(poId));
    if (!order) throw new Error('The selected Purchase Order is unavailable.');
    activeRelatedPurchaseOrder = order;
    relatedPoReturnToList = true;
    const listElement = document.getElementById('relatedPurchaseOrdersModal');
    const showDocument = () => {
        document.getElementById('relatedPoDocumentNumber').textContent = order.po_number || '';
        document.getElementById('relatedPoDocumentFrame').src = `purchase_order_print.html?po_id=${encodeURIComponent(order.po_id)}&embed=1`;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('relatedPoDocumentModal')).show();
    };
    if (listElement.classList.contains('show')) {
        listElement.addEventListener('hidden.bs.modal', showDocument, { once:true });
        bootstrap.Modal.getInstance(listElement)?.hide();
    } else {
        showDocument();
    }
}

function purchaseUnitLabel(unit, count) {
    const clean = String(unit || 'purchase unit').trim();
    if (Number(count) === 1) return clean;
    if (/[^aeiou]y$/i.test(clean)) return `${clean.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/i.test(clean)) return `${clean}es`;
    return `${clean}s`;
}

function selectedProcurementOption(item) {
    const selectedId = procurementSelections[item.pr_item_id]?.supplier_product_id || '';
    return (item.supplier_options || []).find(option => String(option.supplier_product_id) === String(selectedId)) || null;
}

function procurementCalculation(item) {
    const option = selectedProcurementOption(item);
    const conversion = Number(option?.base_qty_per_purchase_unit || option?.units_per_purchase_unit || 0);
    const orderQty = Number(procurementSelections[item.pr_item_id]?.order_qty || 0);
    const minimum = conversion > 0 ? Math.ceil(Number(item.requested_qty || 0) / conversion) : 0;
    const expected = orderQty * conversion;
    const purchaseUnitCost = Number(option?.estimated_purchase_unit_cost || 0);
    const baseCost = Number(option?.supplier_cost_per_inventory_unit || 0);
    return { option, conversion, orderQty, minimum, expected, excess:expected - Number(item.requested_qty || 0), purchaseUnitCost, baseCost, total:orderQty * purchaseUnitCost };
}

function initializePoGeneration(request) {
    procurementSelections = {};
    supplierEtas = {};
    (request.items || []).forEach(item => {
        const options = item.supplier_options || [];
        const initial = options.length === 1 ? options[0] : null;
        const conversion = Number(initial?.base_qty_per_purchase_unit || initial?.units_per_purchase_unit || 0);
        procurementSelections[item.pr_item_id] = {
            supplier_product_id:initial?.supplier_product_id || '',
            order_qty:initial && conversion > 0 ? Math.ceil(Number(item.requested_qty || 0) / conversion) : 0,
        };
    });
}

function procurementErrors(request) {
    const errors = [];
    (request.items || []).forEach(item => {
        const calc = procurementCalculation(item);
        if (!(item.supplier_options || []).length) errors.push(`Cannot generate PO for ${item.product_name} because no active supplier purchasing setup is assigned.`);
        else if (!calc.option) errors.push(`${item.product_name}: select a supplier purchasing setup.`);
        else if (!calc.option.purchase_unit || !calc.option.inventory_unit || calc.conversion <= 0 || calc.purchaseUnitCost <= 0) errors.push(`${item.product_name}: the selected supplier setup needs a valid purchase unit, conversion, and supplier cost.`);
        else if (!Number.isInteger(calc.orderQty) || calc.orderQty < calc.minimum) errors.push(`${item.product_name}: order at least ${calc.minimum} ${purchaseUnitLabel(calc.option.purchase_unit, calc.minimum)}.`);
    });
    return errors;
}

function renderManagerPurchasingSetup(request) {
    document.getElementById('managerProcurementAssignments').innerHTML = (request.items || []).map(item => {
        const calc = procurementCalculation(item);
        const options = item.supplier_options || [];
        const optionMarkup = options.map(option => {
            const purchaseCost = Number(option.estimated_purchase_unit_cost || 0);
            const summary = option.summary || `${option.units_per_purchase_unit || 0} ${option.inventory_unit || 'units'} per ${option.purchase_unit || 'Unit'}`;
            return `<option value="${esc(option.supplier_product_id)}" ${String(option.supplier_product_id) === String(calc.option?.supplier_product_id) ? 'selected' : ''}>${esc(option.supplier_name)} — ${esc(option.purchase_unit || 'Unit')} — ${esc(summary)} — ${peso(purchaseCost)}</option>`;
        }).join('');
        return `<tr data-manager-pr-item="${esc(item.pr_item_id)}"><td class="setup-product"><strong>${esc(item.product_name || '-')}</strong><span>${esc(poProductSpecification(item))}</span></td><td><strong>${Number(item.requested_qty || 0).toLocaleString()} ${esc(item.unit || 'units')}</strong></td><td><select class="form-select form-select-sm" data-manager-supplier ${options.length ? '' : 'disabled'}><option value="">${options.length ? 'Select supplier' : 'No active supplier setup'}</option>${optionMarkup}</select></td><td><strong>${esc(calc.option?.purchase_unit || '-')}</strong></td><td>${calc.option ? esc(calc.option.summary || `${calc.conversion} ${calc.option.inventory_unit} per ${calc.option.purchase_unit}`) : '-'}</td><td class="setup-cost"><strong>${calc.option ? `${peso(calc.purchaseUnitCost)} / ${esc(calc.option.purchase_unit)}` : '-'}</strong><small>${calc.option ? `Equivalent: ${peso(calc.baseCost)} / ${esc(calc.option.inventory_unit)}` : ''}</small></td><td><div class="order-qty-control"><input class="form-control form-control-sm setup-qty" data-manager-order-qty type="number" min="1" step="1" value="${calc.orderQty || ''}" ${calc.option ? '' : 'disabled'}><strong>${calc.option ? esc(purchaseUnitLabel(calc.option.purchase_unit, calc.orderQty)) : ''}</strong></div><small>${calc.option ? `Recommended: ${calc.minimum}` : ''}</small></td><td class="expected-qty"><strong>${calc.option ? `${calc.expected.toLocaleString()} ${esc(calc.option.inventory_unit)}` : '-'}</strong><small>${calc.option ? `Packaging excess: ${Math.max(0, calc.excess).toLocaleString()} ${esc(calc.option.inventory_unit)}` : ''}</small></td><td class="setup-total"><strong>${calc.option ? peso(calc.total) : '-'}</strong></td></tr>`;
    }).join('');
    const errors = procurementErrors(request);
    const box = document.getElementById('managerSetupValidation');
    box.className = `setup-validation ${errors.length ? 'has-errors' : 'is-ready'}`;
    box.innerHTML = errors.length ? `<i class="fa-solid fa-circle-exclamation"></i><div><strong>Complete purchasing setup</strong><span>${esc(errors[0])}${errors.length > 1 ? ` +${errors.length - 1} more` : ''}</span></div>` : '<i class="fa-solid fa-circle-check"></i><div><strong>Purchasing setup is complete</strong><span>Continue to preview the supplier purchase orders.</span></div>';
}

function managerSupplierGroups(request) {
    const groups = new Map();
    (request.items || []).forEach(item => {
        const calc = procurementCalculation(item);
        if (!calc.option) return;
        const id = String(calc.option.supplier_id);
        if (!groups.has(id)) groups.set(id, {
            id,
            name:calc.option.supplier_name,
            address:calc.option.supplier_address || '',
            phone:calc.option.supplier_phone || '',
            email:calc.option.supplier_email || '',
            items:[],
            total:0,
        });
        const group = groups.get(id);
        group.items.push({ item, ...calc });
        group.total += calc.total;
    });
    return [...groups.values()];
}

function poProductSpecification(item) {
    if (String(item.category_name || '').trim().toLowerCase() === 'medicine') {
        const medicine = [item.generic_name, item.strength].filter(value => String(value || '').trim()).join(' ');
        return [medicine, item.dosage_form].filter(value => String(value || '').trim()).join(' • ') || 'No specification';
    }
    return productSpecification(item, 'No specification');
}

function pluralPackagingUnit(unit, quantity) {
    const value = String(unit || '').trim().toLowerCase();
    if (!value || Number(quantity) === 1) return value;
    const irregular = { pc:'pcs', pcs:'pcs', piece:'pieces', box:'boxes' };
    return irregular[value] || (value.endsWith('s') ? value : `${value}s`);
}

function supplierPackagingDescription(option) {
    const purchaseUnit = String(option.purchase_unit || '').trim();
    const inventoryUnit = String(option.inventory_unit || '').trim();
    const innerUnit = String(option.inner_unit || '').trim();
    const outerCount = Number(option.purchase_unit_contains || 0);
    const innerCount = Number(option.units_per_inner_unit || 0);
    const totalCount = Number(option.units_per_purchase_unit || 0);
    if (!purchaseUnit || !inventoryUnit) return '';
    const perPurchaseUnit = `per ${pluralPackagingUnit(purchaseUnit, 1)}`;
    if (innerUnit && outerCount > 0 && innerCount > 0) {
        return `${outerCount.toLocaleString()} ${pluralPackagingUnit(innerUnit, outerCount)} × ${innerCount.toLocaleString()} ${pluralPackagingUnit(inventoryUnit, innerCount)} ${perPurchaseUnit}`;
    }
    if (totalCount > 1) {
        return `${totalCount.toLocaleString()} ${pluralPackagingUnit(inventoryUnit, totalCount)} ${perPurchaseUnit}`;
    }
    return '';
}

function supplierContactMarkup(group) {
    const contact = [group.phone, group.email].filter(value => String(value || '').trim());
    return `${group.address ? `<address>${esc(group.address)}</address>` : ''}${contact.length ? `<p>${contact.map(esc).join('<span aria-hidden="true">•</span>')}</p>` : ''}`;
}

function previewErrors(request) {
    const errors = [];
    managerSupplierGroups(request).forEach(group => {
        if (!supplierEtas[group.id]) errors.push(`${group.name}: enter the expected delivery date.`);
    });
    return errors;
}

function renderManagerPoPreview(request) {
    const groups = managerSupplierGroups(request);
    document.getElementById('managerPoPreviewCount').textContent = `${groups.length} ${groups.length === 1 ? 'PO' : 'POs'} to generate`;
    document.getElementById('managerPoPreviewSummary').innerHTML = `<div><span>Suppliers</span><strong>${groups.length}</strong></div><div><span>Products</span><strong>${(request.items || []).length}</strong></div><div><span>Estimated Total</span><strong>${peso(groups.reduce((sum, group) => sum + group.total, 0))}</strong></div>`;
    document.getElementById('managerSupplierPoPreview').innerHTML = groups.map((group, index) => `<article class="supplier-po-card"><header><div class="supplier-po-order"><span>Purchase Order ${index + 1}</span></div><div class="supplier-po-identity"><h4>${esc(group.name)}</h4>${supplierContactMarkup(group)}</div><div class="supplier-po-fields"><label><span>ETA</span><input class="form-control form-control-sm" type="date" data-manager-eta="${esc(group.id)}" value="${esc(supplierEtas[group.id] || '')}"></label></div></header><div class="supplier-po-table-wrap"><table><thead><tr><th>Product / Description</th><th>Purchase Unit</th><th>Order Qty</th><th>Supplier Cost</th><th>Line Total</th></tr></thead><tbody>${group.items.map(row => { const packaging = supplierPackagingDescription(row.option); return `<tr><td><strong>${esc(row.item.product_name)}</strong><span>${esc(poProductSpecification(row.item))}</span>${packaging ? `<small>Packaging: ${esc(packaging)}</small>` : ''}</td><td>${esc(row.option.purchase_unit)}</td><td>${row.orderQty.toLocaleString()}</td><td>${peso(row.purchaseUnitCost)}</td><td><strong>${peso(row.total)}</strong></td></tr>`; }).join('')}</tbody><tfoot><tr><td colspan="4">Supplier Total</td><td>${peso(group.total)}</td></tr></tfoot></table></div></article>`).join('');
    const errors = previewErrors(request);
    const box = document.getElementById('managerPoPreviewValidation');
    box.className = `setup-validation ${errors.length ? 'has-errors' : 'is-ready'}`;
    box.innerHTML = errors.length ? `<i class="fa-solid fa-circle-exclamation"></i><div><strong>Complete every supplier PO</strong><span>${esc(errors[0])}${errors.length > 1 ? ` +${errors.length - 1} more` : ''}</span></div>` : '<i class="fa-solid fa-circle-check"></i><div><strong>Purchase orders are ready</strong><span>ETA is set for every supplier.</span></div>';
}

function renderGenerationActions() {
    if (!generatingRequest) return;
    if (poGenerationStep === 1) {
        document.getElementById('generatePoActions').innerHTML = `<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-purple ms-auto" type="button" data-generation-next="2" ${procurementErrors(generatingRequest).length ? 'disabled' : ''}>Preview Purchase Orders <i class="fa-solid fa-arrow-right"></i></button>`;
    } else {
        const count = managerSupplierGroups(generatingRequest).length;
        document.getElementById('generatePoActions').innerHTML = `<button class="btn btn-light" type="button" data-generation-next="1"><i class="fa-solid fa-arrow-left"></i> Back</button><button class="btn btn-success ms-auto" type="button" data-generate-orders ${previewErrors(generatingRequest).length || generationInFlight ? 'disabled' : ''}><i class="fa-solid fa-file-circle-plus"></i> Generate ${count} Purchase Order${count === 1 ? '' : 's'}</button>`;
    }
}

function setPoGenerationStep(step) {
    if (!generatingRequest) return;
    poGenerationStep = Math.max(1, Math.min(2, Number(step)));
    document.querySelectorAll('[data-po-step-panel]').forEach(panel => { panel.hidden = Number(panel.dataset.poStepPanel) !== poGenerationStep; });
    document.querySelectorAll('[data-po-step-target]').forEach(button => {
        const number = Number(button.dataset.poStepTarget);
        button.classList.toggle('is-active', number === poGenerationStep);
        button.classList.toggle('is-complete', number < poGenerationStep);
    });
    if (poGenerationStep === 2) renderManagerPoPreview(generatingRequest);
    renderGenerationActions();
}

function openPoGeneration(request) {
    if (!canCreatePurchaseRequests() || request.status !== 'Approved' || Number(request.po_generated_count || 0) > 0) return;
    generatingRequest = request;
    generationInFlight = false;
    initializePoGeneration(request);
    document.getElementById('generatePoNumber').textContent = request.pr_number;
    renderManagerPurchasingSetup(request);
    setPoGenerationStep(1);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('generatePoModal')).show();
}

async function generatePurchaseOrders() {
    if (!generatingRequest || generationInFlight) return;
    const errors = [...procurementErrors(generatingRequest), ...previewErrors(generatingRequest)];
    if (errors.length) throw new Error(errors[0]);
    const count = managerSupplierGroups(generatingRequest).length;
    const confirmation = await Swal.fire({ title:`Generate ${count} Purchase Order${count === 1 ? '' : 's'}?`, text:'The purchase orders will go directly to the Purchase Orders module and will not require another approval.', icon:'question', showCancelButton:true, confirmButtonColor:'#16a34a', confirmButtonText:`Generate ${count} Purchase Order${count === 1 ? '' : 's'}` });
    if (!confirmation.isConfirmed) return;
    generationInFlight = true;
    renderGenerationActions();
    try {
        const payload = {
            pr_id:generatingRequest.pr_id,
            items:(generatingRequest.items || []).map(item => ({ pr_item_id:item.pr_item_id, supplier_product_id:selectedProcurementOption(item).supplier_product_id, order_qty:Number(procurementSelections[item.pr_item_id].order_qty) })),
            supplier_etas:supplierEtas,
        };
        const result = await json(`${API_BASE_URL}/purchase_requests/generate_purchase_orders.php`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        bootstrap.Modal.getInstance(document.getElementById('generatePoModal'))?.hide();
        await load();
        toastr.success(result.data?.idempotent ? 'Related purchase orders already exist.' : `${result.data?.purchase_orders?.length || count} purchase order(s) generated.`);
    } finally {
        generationInFlight = false;
        renderGenerationActions();
    }
}

function actionButtons(request) {
    const buttons = [`<button type="button" class="btn btn-outline-secondary pr-view-btn" data-pr-action="view" data-pr-id="${esc(request.pr_id)}" title="View" aria-label="View ${esc(request.pr_number)}"><i class="fa-regular fa-eye"></i></button>`];
    if (request.status === 'Approved') buttons.push(`<button type="button" class="btn btn-outline-dark pr-print-btn" data-pr-action="print" data-pr-id="${esc(request.pr_id)}" title="Print" aria-label="Print ${esc(request.pr_number)}"><i class="fa-solid fa-print"></i></button>`);
    buttons.push(`<button type="button" class="btn btn-outline-primary" data-pr-action="related-pos" data-pr-id="${esc(request.pr_id)}" title="View Related POs" aria-label="View related Purchase Orders for ${esc(request.pr_number)}"><i class="fa-solid fa-file-invoice"></i></button>`);
    if (canCreatePurchaseRequests() && isRequestOwner(request) && ['Draft', 'Revision Requested'].includes(request.status)) {
        buttons.push(`<button class="btn btn-outline-primary" data-pr-action="edit" data-pr-id="${esc(request.pr_id)}" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>`);
    }
    if (canCreatePurchaseRequests() && isRequestOwner(request) && request.status === 'Draft') {
        buttons.push(`<button class="btn btn-outline-success" data-pr-action="submit" data-pr-id="${esc(request.pr_id)}" title="Submit for Approval"><i class="fa-solid fa-paper-plane"></i></button>`);
    }
    if (canCreatePurchaseRequests() && request.status === 'Approved') {
        if (Number(request.po_generated_count || 0) === 0) buttons.push(`<button class="btn btn-success pr-labeled-action" data-pr-action="generate-po" data-pr-id="${esc(request.pr_id)}" title="Generate PO"><i class="fa-solid fa-file-circle-plus"></i> Generate PO</button>`);
    }
    return `<div class="pr-actions">${buttons.join('')}</div>`;
}

function renderTable() {
    const body = document.getElementById('requestRows');
    if (!body) return;
    const rows = filteredRequests();
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="7" class="pr-empty">No purchase requests yet.</td></tr>';
        return;
    }
    body.innerHTML = rows.map(request => {
        const items = request.items || [];
        const names = items.slice(0, 2).map(item => item.product_name).join(', ');
        const overflow = items.length > 2 ? ` +${items.length - 2} more` : '';
        const poCount = Math.max(0, Number(request.po_generated_count || 0));
        const poCountMarkup = poCount > 0
            ? `<button type="button" class="pr-po-generated" data-pr-action="related-pos" data-pr-id="${esc(request.pr_id)}" title="View ${poCount} related Purchase Order${poCount === 1 ? '' : 's'}" aria-label="View ${poCount} related Purchase Order${poCount === 1 ? '' : 's'} for ${esc(request.pr_number)}">${poCount}</button>`
            : '<span class="pr-po-generated-zero">0</span>';
        return `<tr><td><strong class="pr-number-value">${prNumberMarkup(request.pr_number)}</strong></td><td><span class="requested-by-value">${esc(request.requested_by_name || 'Unknown')}</span></td><td>${esc(formatSubmittedDate(request.submitted_at || request.created_at || request.request_date))}</td><td><div class="pr-item-summary"><strong>${items.length} ${items.length === 1 ? 'item' : 'items'}</strong><span title="${esc(names + overflow)}">${esc(names + overflow || 'No items')}</span></div></td><td>${poCountMarkup}</td><td><span class="pr-status ${statusClass(request.status)}">${esc(visiblePrStatus(request.status))}</span></td><td>${actionButtons(request)}</td></tr>`;
    }).join('');
}

function formatRequestDate(value = '') {
    const raw = String(value || '').slice(0, 10);
    const date = raw ? new Date(`${raw}T00:00:00`) : new Date();
    return Number.isNaN(date.getTime()) ? (raw || 'Not set') : date.toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' });
}

function prepareRequestMetadata(request = null) {
    document.getElementById('requestFormNumber').textContent = request?.pr_number || 'DRAFT / Auto-generated on submission';
    document.getElementById('requestFormRequester').textContent = request?.requested_by_name || sessionUser?.full_name || sessionUser?.name || 'Current authorized user';
    document.getElementById('requestFormDate').textContent = formatRequestDate(request?.request_date);
    document.getElementById('requestFormStatus').textContent = visiblePrStatus(request?.workflow_status || request?.status || 'Draft');
}

function openForm(request = null, selectedProductIds = []) {
    if (!canCreatePurchaseRequests()) return;
    editingRequest = request;
    selectedItems.clear();
    document.getElementById('requestId').value = request?.pr_id || '';
    document.getElementById('productSelectorSearch').value = '';
    prepareRequestMetadata(request);
    const initialItems = request?.items || selectedProductIds.map(productId => ({ product_id:productId }));
    initialItems.forEach(item => {
        const quantity = Number(item.requested_qty || defaultRequestedQuantity(item.product_id));
        if (request) {
            const key = String(item.product_id || '');
            const product = productById.get(key);
            if (key && hasConfiguredBaseUnit(product)) selectedItems.set(key, { product_id:key, requested_qty:validRequestedQuantity(product, quantity) ? quantity : 1 });
        } else {
            selectProduct(item.product_id, quantity);
        }
    });
    renderSelectionState();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('createRequestModal')).show();
}

function storePrintPreview(payload) {
    const now = Date.now();
    Object.keys(localStorage).filter(key => key.startsWith('drpPrPreview:')).forEach(key => {
        try {
            const cached = JSON.parse(localStorage.getItem(key) || '{}');
            if (!cached.created_at || now - Number(cached.created_at) > 10 * 60 * 1000) localStorage.removeItem(key);
        } catch { localStorage.removeItem(key); }
    });
    const token = `${now}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(`drpPrPreview:${token}`, JSON.stringify({ ...payload, created_at:now }));
    return token;
}

function hasDetailValue(value) {
    const normalized = String(value || '').trim();
    return Boolean(normalized && normalized !== '-');
}

function showDetails(request) {
    document.getElementById('detailsPrNumber').textContent = request.pr_number;
    document.getElementById('detailsPrintButton').dataset.prId = request.pr_id;
    document.getElementById('detailsPrStatus').innerHTML = `<span class="pr-status ${statusClass(request.status)}">${esc(visiblePrStatus(request.status))}</span>`;
    const frame = document.getElementById('requestPreviewFrame');
    frame.dataset.contentHeight = '1123';
    frame.src = `purchase_request_print.html?pr_id=${encodeURIComponent(request.pr_id)}&embed=1&ui=final2`;
    const purchaseOrders = request.purchase_orders || [];
    document.getElementById('generatedPoSection').hidden = purchaseOrders.length === 0;
    document.getElementById('generatedPoList').innerHTML = purchaseOrders.map(po => `<article class="generated-po-card"><div><strong>${esc(po.po_number)}</strong><span>${esc(po.supplier_name || 'Supplier')} · ETA: ${esc(formatRequestDate(po.expected_delivery_date))} · Mode: ${esc(po.payment_terms || 'Not set')} · ${peso(po.total_amount)}</span></div><div class="generated-po-actions"><a class="btn btn-sm btn-outline-primary" href="purchase_orders.html?tab=active&po_id=${encodeURIComponent(po.po_id)}">View</a><a class="btn btn-sm btn-outline-dark" href="purchase_order_print.html?po_id=${encodeURIComponent(po.po_id)}" data-po-print-id="${esc(po.po_id)}">Print</a></div></article>`).join('');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('requestDetailsModal')).show();
}

function resizeRequestPreview(contentHeight = null) {
    const stage = document.getElementById('requestPreviewStage');
    const frame = document.getElementById('requestPreviewFrame');
    if (!stage || !frame || !stage.clientWidth) return;
    const baseWidth = 794;
    const height = Math.max(1123, Number(contentHeight || frame.dataset.contentHeight || 1123));
    const scale = Math.min(1, stage.clientWidth / baseWidth);
    frame.dataset.contentHeight = String(height);
    frame.style.width = `${baseWidth}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${scale})`;
    stage.style.height = `${Math.ceil(height * scale)}px`;
}

function formPayload(submit) {
    return {
        pr_id:currentRequestId(),
        items:[...selectedItems.values()].map(item => ({ product_id:item.product_id, requested_qty:item.requested_qty })),
        submit,
    };
}

function previewPayload() {
    return {
        created_at:Date.now(),
        request:{
            pr_number:editingRequest?.pr_number || 'DRAFT / Auto-generated on submission',
            request_date:editingRequest?.request_date || new Date().toLocaleDateString('en-CA'),
            requested_by_name:editingRequest?.requested_by_name || sessionUser?.full_name || sessionUser?.name || 'Current authorized user',
            status:editingRequest?.workflow_status || editingRequest?.status || 'Draft',
            items:[...selectedItems.values()].map(item => ({
                product_id:item.product_id,
                requested_qty:item.requested_qty,
                unit:baseInventoryUnit(productById.get(String(item.product_id)))
            })),
        },
    };
}

function openPrintPreview() {
    const payload = formPayload(false);
    validatePayload(payload);
    const token = storePrintPreview(previewPayload());
    window.open(`purchase_request_print.html?preview=${encodeURIComponent(token)}`, '_blank');
}

function validatePayload(payload) {
    const uniqueProducts = new Set(payload.items.map(item => item.product_id));
    if (!payload.items.length) throw new Error('Select at least one product.');
    if (uniqueProducts.size !== payload.items.length || payload.items.some(item => !item.product_id || !validRequestedQuantity(productById.get(String(item.product_id)), item.requested_qty))) {
        throw new Error('Every selected product must be unique and have a valid requested quantity in its base inventory unit.');
    }
    if (selectedConflictMessages().length) throw new Error('Remove products that already have an active replenishment request before continuing.');
    const supplierErrors = selectedSupplierAssignmentMessages();
    if (supplierErrors.length) throw new Error(supplierErrors[0]);
    const baseUnitErrors = selectedBaseUnitMessages();
    if (baseUnitErrors.length) throw new Error(baseUnitErrors[0]);
}

async function saveForm(submit) {
    if (requestInFlight) return;
    const payload = formPayload(submit);
    validatePayload(payload);
    const endpoint = payload.pr_id ? 'save_purchase_request.php' : 'create_purchase_request.php';
    requestInFlight = true;
    updateActionState();
    try {
        const result = await json(`${API_BASE_URL}/purchase_requests/${endpoint}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        bootstrap.Modal.getInstance(document.getElementById('finalizeRequestModal'))?.hide();
        toastr.success(submit ? 'Purchase Request submitted for Supervisor approval.' : 'Purchase Request saved as Draft.');
        await refreshUntilStatus(result.data?.pr_id || payload.pr_id, submit ? 'Pending Supervisor Approval' : 'Draft');
        selectedItems.clear();
        editingRequest = null;
    } finally {
        requestInFlight = false;
        updateActionState();
    }
}

async function submitExisting(request) {
    if (requestInFlight) return;
    const payload = { pr_id:request.pr_id, items:(request.items || []).map(item => ({ product_id:item.product_id, requested_qty:Number(item.requested_qty) })), submit:true };
    requestInFlight = true;
    try {
        await json(`${API_BASE_URL}/purchase_requests/save_purchase_request.php`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        toastr.success('Purchase Request submitted for Supervisor approval.');
        await refreshUntilStatus(request.pr_id, 'Pending Supervisor Approval');
    } finally {
        requestInFlight = false;
    }
}

async function refreshUntilStatus(prId, expectedStatus) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        await load();
        if (requests.some(request => String(request.pr_id) === String(prId) && request.status === expectedStatus)) return;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
}

function inventoryShortcutProductIds() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') !== '1' || params.get('source') !== 'inventory') return [];
    return String(params.get('product_ids') || '').split(',').map(value => value.trim()).filter(Boolean);
}

function maybeOpenInventoryShortcut() {
    if (inventoryShortcutHandled || !dataReady || !canCreatePurchaseRequests()) return;
    const requestedIds = inventoryShortcutProductIds();
    if (!requestedIds.length) return;
    inventoryShortcutHandled = true;
    const eligibleIds = [...new Set(requestedIds)].filter(productId => {
        const row = inventoryByProduct.get(String(productId));
        return row && hasActiveSupplierAssignment(row) && String(row.product_status || 'Active').toLowerCase() !== 'inactive' && ['Low Stock', 'Out of Stock'].includes(row.stock_status);
    });
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('create');
    cleanUrl.searchParams.delete('source');
    cleanUrl.searchParams.delete('product_ids');
    window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    if (!eligibleIds.length) {
        toastr.warning('No selected products currently qualify as Low Stock or Out of Stock.');
        return;
    }
    openForm(null, eligibleIds);
}

async function load() {
    try {
        const [prData, candidateData] = await Promise.all([
            json(`${API_BASE_URL}/purchase_requests/get_purchase_requests.php?t=${Date.now()}`),
            json(`${API_BASE_URL}/purchase_requests/get_pr_candidates.php?t=${Date.now()}`),
        ]);
        products = candidateData.data || [];
        requests = prData.data?.requests || [];
        inventoryRows = products;
        productById.clear();
        inventoryByProduct.clear();
        products.forEach(product => productById.set(String(product.product_id), product));
        inventoryRows.forEach(row => inventoryByProduct.set(String(row.product_id), row));
        dataReady = true;
        renderSummary();
        renderTable();
        maybeOpenInventoryShortcut();
    } catch (error) {
        document.getElementById('requestRows').innerHTML = `<tr><td colspan="7" class="pr-empty text-danger">${esc(error.message)}</td></tr>`;
        toastr.error(error.message);
    }
}

document.getElementById('createRequestButton')?.addEventListener('click', () => openForm());
document.getElementById('productSelectorSearch')?.addEventListener('input', renderProductCatalog);
document.getElementById('replenishmentFilter')?.addEventListener('change', renderProductCatalog);
document.getElementById('productBulkSelect')?.addEventListener('change', event => {
    const action = event.target.value;
    if (action === 'clear') {
        selectedItems.clear();
        renderSelectionState();
    } else if (action === 'visible') {
        bulkSelectProducts('');
    } else if (['out', 'low', 'new'].includes(action)) {
        bulkSelectProducts(action);
    }
    event.target.value = '';
});
document.getElementById('productSelectorRows')?.addEventListener('change', event => {
    if (event.target.matches('[data-product-select]')) {
        if (event.target.checked) selectProduct(event.target.dataset.productSelect);
        else removeProduct(event.target.dataset.productSelect);
    }
});
document.getElementById('productSelectorRows')?.addEventListener('click', event => {
    if (event.target.closest('input,select,button,a,label')) return;
    const row = event.target.closest('[data-product-row]');
    if (!row) return;
    const productId = row.dataset.productRow;
    if (selectedItems.has(productId)) removeProduct(productId);
    else selectProduct(productId);
});
document.getElementById('selectAllVisibleProducts')?.addEventListener('change', event => {
    setVisibleProductsSelected(event.target.checked);
});
document.getElementById('productSelectorRows')?.addEventListener('input', event => {
    if (event.target.matches('[data-selected-qty]')) setRequestedQuantity(event.target.dataset.selectedQty, event.target.value);
});
document.getElementById('reviewRequestButton')?.addEventListener('click', () => {
    try {
        validatePayload(formPayload(false));
        renderFinalizeItems();
        renderConflictSummary();
        switchModal('createRequestModal', 'finalizeRequestModal');
    } catch (error) {
        toastr.error(error.message);
    }
});
document.getElementById('backToProductsButton')?.addEventListener('click', () => switchModal('finalizeRequestModal', 'createRequestModal'));
document.getElementById('finalizeRequestItems')?.addEventListener('click', event => {
    const removeButton = event.target.closest('.remove-finalize-product');
    if (!removeButton) return;
    removeProduct(removeButton.dataset.productId);
    if (!selectedItems.size) switchModal('finalizeRequestModal', 'createRequestModal');
});
document.getElementById('finalizeRequestItems')?.addEventListener('input', event => {
    if (event.target.matches('[data-finalize-qty]')) setRequestedQuantity(event.target.dataset.finalizeQty, event.target.value);
});
document.getElementById('saveDraftButton')?.addEventListener('click', () => saveForm(false).catch(error => toastr.error(error.message)));
document.getElementById('submitRequestButton')?.addEventListener('click', () => saveForm(true).catch(error => toastr.error(error.message)));
document.getElementById('previewRequestButton')?.addEventListener('click', () => {
    try { openPrintPreview(); } catch (error) { toastr.error(error.message); }
});
document.getElementById('detailsPrintButton')?.addEventListener('click', event => {
    event.preventDefault();
    try { openPurchaseRequestPrint(event.currentTarget.dataset.prId); } catch (error) { toastr.error(error.message); }
});
document.getElementById('generatedPoList')?.addEventListener('click', event => {
    const link = event.target.closest('[data-po-print-id]');
    if (!link) return;
    event.preventDefault();
    try { openPurchaseOrderPrint(link.dataset.poPrintId); } catch (error) { toastr.error(error.message); }
});
document.getElementById('relatedPurchaseOrderRows')?.addEventListener('click', event => {
    const button = event.target.closest('[data-related-po-view]');
    if (!button) return;
    event.preventDefault();
    try { openRelatedPurchaseOrderDocument(button.dataset.relatedPoView); } catch (error) { toastr.error(error.message); }
});
document.getElementById('relatedPoPrintButton')?.addEventListener('click', () => {
    try { openPurchaseOrderPrint(activeRelatedPurchaseOrder?.po_id); } catch (error) { toastr.error(error.message); }
});
document.getElementById('relatedPoDocumentModal')?.addEventListener('hidden.bs.modal', () => {
    document.getElementById('relatedPoDocumentFrame').src = 'about:blank';
    activeRelatedPurchaseOrder = null;
    if (!relatedPoReturnToList) return;
    relatedPoReturnToList = false;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('relatedPurchaseOrdersModal')).show();
});
window.addEventListener('message', event => {
    const frame = document.getElementById('relatedPoDocumentFrame');
    if (event.origin !== window.location.origin || event.source !== frame?.contentWindow || event.data?.type !== 'drp:purchase-order-preview-ready') return;
    frame.style.height = `${Math.max(1123, Number(event.data.height || 1123))}px`;
});
document.getElementById('managerProcurementAssignments')?.addEventListener('change', event => {
    if (!generatingRequest) return;
    const row = event.target.closest('[data-manager-pr-item]');
    const item = (generatingRequest.items || []).find(candidate => String(candidate.pr_item_id) === String(row?.dataset.managerPrItem));
    if (!item) return;
    if (event.target.matches('[data-manager-supplier]')) {
        const option = (item.supplier_options || []).find(candidate => String(candidate.supplier_product_id) === String(event.target.value));
        const conversion = Number(option?.base_qty_per_purchase_unit || option?.units_per_purchase_unit || 0);
        procurementSelections[item.pr_item_id] = { supplier_product_id:event.target.value, order_qty:option && conversion > 0 ? Math.ceil(Number(item.requested_qty || 0) / conversion) : 0 };
    } else if (event.target.matches('[data-manager-order-qty]')) {
        procurementSelections[item.pr_item_id].order_qty = Number(event.target.value || 0);
    }
    renderManagerPurchasingSetup(generatingRequest);
    renderGenerationActions();
});
document.getElementById('managerProcurementAssignments')?.addEventListener('input', event => {
    if (!event.target.matches('[data-manager-order-qty]') || !generatingRequest) return;
    const row = event.target.closest('[data-manager-pr-item]');
    procurementSelections[row.dataset.managerPrItem].order_qty = Number(event.target.value || 0);
    const calc = procurementCalculation((generatingRequest.items || []).find(item => String(item.pr_item_id) === String(row.dataset.managerPrItem)));
    row.querySelector('.expected-qty').innerHTML = `<strong>${calc.expected.toLocaleString()} ${esc(calc.option?.inventory_unit || 'units')}</strong><small>Packaging excess: ${Math.max(0, calc.excess).toLocaleString()} ${esc(calc.option?.inventory_unit || 'units')}</small>`;
    row.querySelector('.setup-total').innerHTML = `<strong>${peso(calc.total)}</strong>`;
    renderGenerationActions();
});
document.getElementById('managerSupplierPoPreview')?.addEventListener('change', event => {
    if (event.target.matches('[data-manager-eta]')) supplierEtas[event.target.dataset.managerEta] = event.target.value;
    renderManagerPoPreview(generatingRequest);
    renderGenerationActions();
});
document.getElementById('poGenerationStepper')?.addEventListener('click', event => {
    const button = event.target.closest('[data-po-step-target]');
    if (!button || (Number(button.dataset.poStepTarget) === 2 && procurementErrors(generatingRequest).length)) return;
    setPoGenerationStep(button.dataset.poStepTarget);
});
document.getElementById('generatePoActions')?.addEventListener('click', event => {
    const next = event.target.closest('[data-generation-next]');
    if (next) setPoGenerationStep(next.dataset.generationNext);
    if (event.target.closest('[data-generate-orders]')) generatePurchaseOrders().catch(error => toastr.error(error.message));
});
document.getElementById('requestDetailsModal')?.addEventListener('shown.bs.modal', () => resizeRequestPreview());
window.addEventListener('resize', () => resizeRequestPreview());
window.addEventListener('message', event => {
    const frame = document.getElementById('requestPreviewFrame');
    const message = event.data || {};
    if (event.origin !== window.location.origin || event.source !== frame?.contentWindow || message.type !== 'drp:purchase-request-preview-ready') return;
    resizeRequestPreview(message.height);
});
document.getElementById('requestRows')?.addEventListener('click', event => {
    const control = event.target.closest('[data-pr-action]');
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    const request = requests.find(item => item.pr_id === control.dataset.prId);
    if (!request) return;
    if (control.dataset.prAction === 'view') showDetails(request);
    if (control.dataset.prAction === 'print') {
        try { openPurchaseRequestPrint(request.pr_id); } catch (error) { toastr.error(error.message); }
    }
    if (control.dataset.prAction === 'edit') openForm(request);
    if (control.dataset.prAction === 'submit') submitExisting(request).catch(error => toastr.error(error.message));
    if (control.dataset.prAction === 'generate-po') openPoGeneration(request);
    if (control.dataset.prAction === 'related-pos') showRelatedPurchaseOrders(request.pr_id).catch(error => toastr.error(error.message));
});
['prSearch','prStatusFilter','prStartDate','prEndDate'].forEach(id => { document.getElementById(id)?.addEventListener(id === 'prSearch' ? 'input' : 'change', renderTable); });
document.getElementById('clearPrFilters')?.addEventListener('click', () => { ['prSearch','prStatusFilter','prStartDate','prEndDate'].forEach(id => { const field=document.getElementById(id); if(field) field.value=''; }); renderTable(); });
window.addEventListener('pharma:session-ready', event => applyRoleUi(event.detail));
const initialSession = window.__drpSession || await ensurePageTabSession();
applyRoleUi(window.__drpSession || initialSession);
await load();
