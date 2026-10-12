import PharmaUtils from '../utils.js';
import {
    formatProductSpecification,
    isPrescriptionProduct,
    productSearchText
} from './product_specification.js?v=12';
import { primaryAccessRole } from './rbac.js?v=9';
import { loadMeasurementUnits, measurementUnitsForContext, upsertMeasurementUnitCache } from './measurement_units.js?v=2';
import { purchasingConversion } from './purchasing_conversion.js?v=2';
import { createPackagingEditor } from './packaging_breakdown.js?v=2';

const API = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

function compactPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '0';
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const canManageSupplierCatalog = () => ['super_admin', 'admin'].includes(primaryAccessRole(window.__drpSession || {}));

function assignmentNameParts(product = {}) {
    const brand = String(product.brand_name || '').trim();
    const productName = String(product.product_name || '').trim();
    const genericName = String(product.generic_name || '').trim();
    const medicine = String(product.category_name || '').trim().toLowerCase() === 'medicine';
    const preferredName = medicine ? (genericName || productName) : productName;
    const name = brand && preferredName.toLowerCase().startsWith(`${brand.toLowerCase()} `)
        ? preferredName.slice(brand.length).trim() : preferredName;
    const distinctName = name.toLowerCase() === brand.toLowerCase() ? '' : name;
    return {
        brand,
        name: distinctName || (!brand ? (productName || genericName) : '')
    };
}

function assignmentProductIdentity(product = {}) {
    const parts = assignmentNameParts(product);
    return [parts.brand, parts.name].filter(Boolean).join(' ') || 'Unnamed product';
}

function assignmentProductTitle(product = {}) {
    const parts = assignmentNameParts(product);
    const names = [parts.brand, parts.name].filter(Boolean).map((part) => `<strong>${esc(part)}</strong>`);
    return names.join(' ') || `<strong>${esc('Unnamed product')}</strong>`;
}

function assignmentRxBadge(product) {
    return isPrescriptionProduct(product)
        ? '<span class="supplier-rx-badge" title="Prescription medicine">Rx</span>' : '';
}

const state = {
    step: 1,
    mode: 'existing',
    products: [],
    suppliers: [],
    units: [],
    selectedIds: new Set(),
    terms: new Map(),
    packagingEditors: new Map(),
    sharedFormReady: false,
    createdProductIds: new Set()
};

function unitKey(value) {
    return String(value || '').trim().toLowerCase();
}

function assignmentUnitLabel(unit) {
    const value = String(unit.unit_name || '').trim();
    const symbol = String(unit.unit_symbol || '').trim();
    return symbol && unitKey(symbol) !== unitKey(value) ? `${value} (${symbol})` : value;
}

function assignmentPurchaseUnits(product = null) {
    const ranked = new Map();
    const add = (unit) => {
        const key = unitKey(unit?.unit_name);
        if (!key) return;
        const current = ranked.get(key);
        const nextIsCount = unitKey(unit.measurement_group) === 'count';
        const currentIsCount = current && unitKey(current.measurement_group) === 'count';
        if (!current || (nextIsCount && !currentIsCount)) ranked.set(key, unit);
    };
    measurementUnitsForContext(state.units, { context: 'purchase' }).forEach(add);
    const baseUnit = inventoryUnit(product || {});
    if (baseUnit && !ranked.has(unitKey(baseUnit))) {
        const record = state.units.find(unit => [unit.unit_name, unit.unit_symbol].some(value => unitKey(value) === unitKey(baseUnit)));
        if (record) add(record);
    }
    return [...ranked.values()].sort((left, right) => assignmentUnitLabel(left).localeCompare(assignmentUnitLabel(right)));
}

function validAssignmentPurchaseUnit(value) {
    const key = unitKey(value);
    return Boolean(key && !/^\d+(?:\.\d+)?$/.test(key) && assignmentPurchaseUnits().some(unit => [unit.unit_name, unit.unit_symbol].some(item => unitKey(item) === key)));
}

function purchaseUnitOptions(product, selected = '') {
    const selectedKey = unitKey(selected);
    return assignmentPurchaseUnits(product).map(unit => {
        const value = String(unit.unit_name || '').trim();
        const isSelected = [value, unit.unit_symbol].some(item => unitKey(item) === selectedKey);
        return `<option value="${esc(value)}" ${isSelected ? 'selected' : ''}>${esc(assignmentUnitLabel(unit))}</option>`;
    }).join('');
}

function inventoryUnit(product) {
    return String(product.inventory_unit_name || product.inventory_unit_symbol || product.inventory_unit || '').trim();
}

function markup() {
    return `
        <div class="modal fade" id="assignSupplierProductsModal" tabindex="-1"
             aria-labelledby="assignSupplierProductsTitle" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <div>
                            <h5 class="modal-title fw-bold" id="assignSupplierProductsTitle" tabindex="-1">Assign Products to Supplier</h5>
                            <p class="small text-muted mb-0">Product Master owns identity; this workflow stores supplier purchasing terms only.</p>
                        </div>
                        <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close assignment workflow"></button>
                    </div>
                    <div class="assignment-progress" aria-label="Assignment progress">
                        <div class="assignment-progress-step is-active" data-progress-step="1"><span>1</span>Product Information</div>
                        <div class="assignment-progress-step" data-progress-step="2"><span>2</span>Purchasing Setup</div>
                        <div class="assignment-progress-step" data-progress-step="3"><span>3</span>Review &amp; Save</div>
                    </div>
                    <form id="supplierAssignmentForm" novalidate>
                        <div class="modal-body" id="supplierAssignmentBody">
                            <section class="assignment-step" id="assignmentStep1"></section>
                            <section class="assignment-step d-none" id="assignmentStep2"></section>
                            <section class="assignment-step d-none" id="assignmentStep3"></section>
                        </div>
                        <div class="modal-footer" id="assignmentFooter"></div>
                    </form>
                </div>
            </div>
        </div>`;
}

function selectedSupplierId() {
    return document.getElementById('assignmentSupplier')?.value || '';
}

function selectedSupplier() {
    const supplierId = selectedSupplierId();
    return state.suppliers.find((supplier) => String(supplier.supplier_id) === String(supplierId));
}

function selectedProducts() {
    return state.products.filter((product) => state.selectedIds.has(String(product.product_id)));
}

function isAssignedToSelectedSupplier(product) {
    const supplierId = selectedSupplierId();
    if (!supplierId) return false;
    return String(product.supplier_ids || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .includes(String(supplierId));
}

function supplierOptions() {
    return [
        '<option value="">Select supplier...</option>',
        ...state.suppliers.map((supplier) =>
            `<option value="${esc(supplier.supplier_id)}">${esc(supplier.supplier_name)}</option>`)
    ].join('');
}

function renderStep1() {
    const supplierId = selectedSupplierId()
        || document.getElementById('supplierProductFilterSupplier')?.value
        || '';
    const step = document.getElementById('assignmentStep1');
    step.innerHTML = `
        <div class="assignment-section-card">
            <div class="row g-3 align-items-end">
                <div class="col-lg-5">
                    <label class="form-label" for="assignmentSupplier">Supplier <span class="text-danger">*</span></label>
                    <select class="form-select" id="assignmentSupplier">${supplierOptions()}</select>
                    <div class="assignment-field-error" id="assignmentSupplierError"></div>
                </div>
                <div class="col-lg-7">
                    <label class="form-label d-block">Workflow</label>
                    <div class="assignment-mode-toggle" role="group" aria-label="Product selection workflow">
                        <button class="btn ${state.mode === 'existing' ? 'btn-purple' : 'btn-outline-secondary'}" id="modeExisting" type="button">Select Existing Product</button>
                        <button class="btn ${state.mode === 'create' ? 'btn-purple' : 'btn-outline-secondary'}" id="modeCreate" type="button">Create New Product or Variant</button>
                    </div>
                </div>
            </div>
        </div>
        <div id="existingProductPanel" class="${state.mode === 'existing' ? '' : 'd-none'}"></div>
        <div id="createProductPanel" class="${state.mode === 'create' ? '' : 'd-none'}"></div>`;

    document.getElementById('assignmentSupplier').value = supplierId;
    renderExistingPanel();
    if (state.mode === 'create') renderCreatePanel();
}

function renderExistingPanel() {
    const panel = document.getElementById('existingProductPanel');
    if (!panel) return;
    const priorSearch = document.getElementById('assignmentProductSearch')?.value || '';
    const showInactive = document.getElementById('showInactiveAssignmentProducts')?.checked || false;

    panel.innerHTML = `
        <div class="assignment-existing-grid">
            <section class="assignment-panel">
                <div class="assignment-panel-header">
                    <h6>Product Results</h6>
                    <div class="form-check mb-0">
                        <input class="form-check-input" id="showInactiveAssignmentProducts" type="checkbox" ${showInactive ? 'checked' : ''}>
                        <label class="form-check-label small" for="showInactiveAssignmentProducts">Show inactive</label>
                    </div>
                </div>
                <div class="p-2 border-bottom">
                    <div class="input-group">
                        <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                        <input class="form-control" id="assignmentProductSearch" type="search"
                               placeholder="Search name, specification, type, or barcode" value="${esc(priorSearch)}">
                    </div>
                </div>
                <div class="assignment-product-results" id="assignmentProductList" aria-live="polite"></div>
            </section>
            <section class="assignment-panel">
                <div class="assignment-panel-header">
                    <h6>Selected Products</h6>
                    <span class="supplier-result-count" id="assignmentSelectedCount">0 selected</span>
                </div>
                <div class="assignment-selected-list" id="assignmentSelectedList"></div>
            </section>
        </div>`;
    renderProducts();
    renderSelectedProducts();
}

function renderProducts() {
    const list = document.getElementById('assignmentProductList');
    if (!list) return;
    const query = document.getElementById('assignmentProductSearch')?.value.trim().toLowerCase() || '';
    const showInactive = document.getElementById('showInactiveAssignmentProducts')?.checked || false;
    const visible = state.products.filter((product) => {
        const active = (product.status || 'Active') === 'Active';
        return (showInactive || active) && (!query || [productSearchText(product), assignmentProductIdentity(product), product.generic_name]
            .filter(Boolean).join(' ').toLowerCase().includes(query));
    });

    list.innerHTML = visible.length
        ? visible.map((product) => {
            const productId = String(product.product_id);
            const inactive = (product.status || 'Active') !== 'Active';
            const alreadyAssigned = isAssignedToSelectedSupplier(product);
            const disabled = inactive || alreadyAssigned || !selectedSupplierId();
            const badges = [
                inactive ? '<span class="badge text-bg-secondary">Inactive</span>' : '',
                alreadyAssigned ? '<span class="badge text-bg-info">Already assigned</span>' : ''
            ].filter(Boolean).join(' ');
            return `
                <label class="assignment-product-row ${disabled ? 'is-disabled' : ''}">
                    <input class="form-check-input assignment-product-check mt-1" type="checkbox"
                           value="${esc(productId)}" ${state.selectedIds.has(productId) ? 'checked' : ''}
                           ${disabled ? 'disabled' : ''}>
                    <span class="assignment-product-copy">
                        <span class="assignment-product-identity">${assignmentProductTitle(product)} ${assignmentRxBadge(product)} ${badges}</span>
                        <span class="assignment-product-meta">${esc(product.type_name || 'Uncategorized')} · ${esc(formatProductSpecification(product))}</span>
                    </span>
                </label>`;
        }).join('')
        : '<div class="assignment-empty">No matching Product Master records.</div>';
}

function renderSelectedProducts() {
    const list = document.getElementById('assignmentSelectedList');
    const count = document.getElementById('assignmentSelectedCount');
    if (!list || !count) return;
    const products = selectedProducts();
    count.textContent = `${products.length} selected`;
    list.innerHTML = products.length
        ? products.map((product) => `
            <article class="assignment-selected-card">
                <div>
                    <div class="assignment-selected-identity">${assignmentProductTitle(product)} ${assignmentRxBadge(product)}</div>
                    <div class="assignment-selected-meta">${esc(formatProductSpecification(product))}</div>
                </div>
                <button class="btn btn-sm btn-outline-danger remove-selected-product" type="button"
                        data-product-id="${esc(product.product_id)}" aria-label="Remove ${esc(assignmentProductIdentity(product))}">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </article>`).join('')
        : '<div class="assignment-empty">Select one or more active products to continue.</div>';
    renderFooter();
}

function renderCreatePanel() {
    const panel = document.getElementById('createProductPanel');
    if (!panel) return;
    panel.innerHTML = `
        <section class="assignment-section-card assignment-shared-form">
            <div class="assignment-step-heading">
                <h6>Create in Product Master</h6>
                <p>The same Product Master form, validation, attribute mapping, duplicate detection, and save API are used here.</p>
            </div>
            <div id="assignmentSharedProductHost">
                <div class="assignment-empty"><span><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading shared product form…</span></div>
            </div>
        </section>`;
    ensureSharedProductForm().catch((error) => {
        const host = document.getElementById('assignmentSharedProductHost');
        if (host) host.innerHTML = `<div class="assignment-error-summary" role="alert">${esc(error.message)}</div>`;
    });
}

async function ensureSharedProductForm() {
    if (state.sharedFormReady && document.getElementById('addProductForm')) return;
    const response = await fetch('./products.html', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('The shared Product Master form could not be loaded.');
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const source = parsed.getElementById('addProductModal');
    const sourceForm = source?.querySelector('#addProductForm');
    if (!sourceForm) throw new Error('The shared Product Master form is unavailable.');

    const wrapper = document.createElement('div');
    wrapper.id = 'addProductModal';
    wrapper.appendChild(document.importNode(sourceForm, true));
    const host = document.getElementById('assignmentSharedProductHost');
    if (!host) return;
    host.replaceChildren(wrapper);

    const module = await import('./products.js?v=35-shared');
    module.initAddProductForm();
    wrapper.dispatchEvent(new Event('show.bs.modal'));
    const saveText = wrapper.querySelector('.modal-footer .btn-purple');
    if (saveText) saveText.innerHTML = '<i class="fa-solid fa-floppy-disk me-2" aria-hidden="true"></i>Save Product &amp; Continue';
    state.sharedFormReady = true;
}

function rememberTerms() {
    document.querySelectorAll('.assignment-term-card').forEach((card) => {
        const editor = state.packagingEditors.get(String(card.dataset.productId));
        state.terms.set(String(card.dataset.productId), {
            purchaseUnit: card.querySelector('.term-unit')?.value || 'Box',
            inventoryUnit: card.querySelector('.term-inventory-unit')?.value || '',
            hierarchyLevels: editor?.read() || [],
            supplierCost: card.querySelector('.term-supplier-cost')?.value || ''
        });
    });
}

function defaultTerms(product) {
    return state.terms.get(String(product.product_id)) || {
        purchaseUnit: 'Box',
        inventoryUnit: inventoryUnit(product),
        hierarchyLevels: [{ unit: inventoryUnit(product), quantity: '' }],
        supplierCost: ''
    };
}

function renderStep2() {
    closeAssignmentUnitMenu();
    rememberTerms();
    state.packagingEditors.clear();
    const products = selectedProducts();
    document.getElementById('assignmentStep2').innerHTML = `
        <div class="assignment-step-heading">
            <h6>Supplier Purchasing Setup</h6>
            <p>Set supplier-specific purchase conversions. Product Master packaging remains unchanged.</p>
        </div>
        <div class="assignment-error-summary d-none" id="assignmentStep2Errors" role="alert"></div>
        <div class="assignment-term-list">
            ${products.map((product) => {
                const saved = defaultTerms(product);
                const unit = saved.inventoryUnit || inventoryUnit(product);
                const selectedPurchaseUnit = assignmentPurchaseUnits(product).find(item => [item.unit_name, item.unit_symbol].some(value => unitKey(value) === unitKey(saved.purchaseUnit)));
                return `
                    <article class="assignment-term-card" data-product-id="${esc(product.product_id)}">
                        <div class="assignment-term-header">
                            <div>
                                <div class="assignment-selected-identity">${assignmentProductTitle(product)} ${assignmentRxBadge(product)}</div>
                                <div class="assignment-selected-meta">${esc(formatProductSpecification(product))}</div>
                            </div>
                            <span class="badge text-bg-light term-status">Missing information</span>
                        </div>
                        <div class="assignment-term-body">
                            <section class="assignment-field">
                                <div>
                                    <strong>Purchase unit <span class="text-danger">*</span></strong>
                                    <span class="assignment-help">Type to select a unit, or add one for this supplier.</span>
                                </div>
                                <div>
                                    <div class="assignment-combo">
                                        <input class="form-control assignment-unit-search" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="assignmentPurchaseUnitMenu" autocomplete="off" placeholder="Select a unit" value="${esc(selectedPurchaseUnit ? assignmentUnitLabel(selectedPurchaseUnit) : '')}" />
                                        <select class="assignment-native-unit term-unit" tabindex="-1" aria-hidden="true">
                                            <option value="">Select a purchase unit...</option>${purchaseUnitOptions(product, saved.purchaseUnit)}
                                        </select>
                                    </div>
                                    <div class="assignment-field-error"></div>
                                </div>
                            </section>
                            <section class="assignment-field">
                                <div>
                                    <strong>Product base unit</strong>
                                    <span class="assignment-help">Defined in Product Master.</span>
                                </div>
                                <div>
                                    <input class="form-control term-inventory-unit" value="${esc(unit)}" readonly>
                                    <div class="assignment-field-error"></div>
                                </div>
                            </section>
                            <section class="assignment-field">
                                <div>
                                    <strong>Quoted cost</strong>
                                    <span class="assignment-help">Price for one purchase unit. Selling prices stay unchanged.</span>
                                </div>
                                <div>
                                    <div class="input-group assignment-cost"><span class="input-group-text">₱</span><input class="form-control term-supplier-cost" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(saved.supplierCost || '')}" placeholder="Optional"></div>
                                </div>
                            </section>
                            <div class="term-packaging-host"></div>
                            <div class="assignment-field-error term-packaging-error" role="status"></div>
                            <div class="assignment-preview term-preview"></div>
                        </div>
                    </article>`;
            }).join('')}
        </div>`;
    document.querySelectorAll('.assignment-term-card').forEach((card) => {
        const productId = String(card.dataset.productId);
        const saved = defaultTerms(state.products.find(item => String(item.product_id) === productId) || {});
        const editor = createPackagingEditor(card.querySelector('.term-packaging-host'), {
            units: state.units,
            purchaseUnit: card.querySelector('.term-unit').value,
            baseUnit: card.querySelector('.term-inventory-unit').value,
            levels: saved.hierarchyLevels || [],
            onChange: () => updateTermCard(card)
        });
        state.packagingEditors.set(productId, editor);
        updateTermCard(card);
    });
}

function updateTermCard(card) {
    const purchaseUnit = card.querySelector('.term-unit')?.value || '';
    const inventory = card.querySelector('.term-inventory-unit')?.value || '';
    const editor = state.packagingEditors.get(String(card.dataset.productId));
    if (!editor) return;
    const allowedPurchaseUnit = validAssignmentPurchaseUnit(purchaseUnit);
    const validation = !inventory ? 'Configure the Product Base Unit in Product Master first.'
        : !allowedPurchaseUnit ? 'Select a purchase unit.' : editor.error();
    const conversion = purchasingConversion({ purchase_unit: purchaseUnit || 'Purchase Unit', inventory_unit: inventory, hierarchy_levels: editor.read() });
    const complete = purchaseUnit !== '' && !validation;
    const status = card.querySelector('.term-status');
    status.textContent = complete ? 'Complete' : 'Missing information';
    status.className = `badge term-status ${complete ? 'text-bg-success' : 'text-bg-light'}`;
    status.title = complete ? 'Purchasing setup is complete.' : (validation || 'Select a Purchase Unit.');
    const packagingError = card.querySelector('.term-packaging-error');
    if (packagingError?.textContent) packagingError.textContent = validation;
    if (complete && card.classList.contains('is-invalid')) {
        card.classList.remove('is-invalid');
        card.querySelectorAll('.is-invalid').forEach(field => { field.classList.remove('is-invalid'); field.removeAttribute('aria-invalid'); });
        card.querySelectorAll('.assignment-field-error').forEach(error => { error.textContent = ''; });
        const summary = document.getElementById('assignmentStep2Errors');
        if (summary && [...document.querySelectorAll('.assignment-term-card')].every(item => item.querySelector('.term-status')?.textContent === 'Complete')) {
            summary.classList.add('d-none');
            summary.textContent = '';
        }
    }
    card.querySelector('.term-preview').innerHTML = complete
        ? `<strong>Preview:</strong> ${esc(conversion.summary)}`
        : `<strong>Preview:</strong> ${esc(validation || `Configure contents per ${purchaseUnit || 'Purchase Unit'}.`)}`;
}

function clearTermValidation() {
    document.querySelectorAll('.assignment-term-card').forEach((card) => {
        card.classList.remove('is-invalid');
        card.querySelectorAll('.form-control,.form-select,.assignment-unit-search').forEach((field) => {
            field.classList.remove('is-invalid');
            field.removeAttribute('aria-invalid');
        });
        card.querySelectorAll('.assignment-field-error').forEach((error) => {
            error.textContent = '';
        });
    });
}

function setFieldError(field, message) {
    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid', 'true');
    const search = field.classList.contains('term-unit')
        ? field.closest('.assignment-combo')?.querySelector('.assignment-unit-search')
        : null;
    if (search) {
        search.classList.add('is-invalid');
        search.setAttribute('aria-invalid', 'true');
    }
    const error = (field.closest('.assignment-field') || field.closest('div'))?.querySelector('.assignment-field-error');
    if (error?.classList.contains('assignment-field-error')) error.textContent = message;
    field.closest('.assignment-term-card')?.classList.add('is-invalid');
}

function validateStep2() {
    clearTermValidation();
    const errors = [];
    let firstInvalid = null;
    document.querySelectorAll('.assignment-term-card').forEach((card) => {
        const product = state.products.find((item) => String(item.product_id) === String(card.dataset.productId));
        const identity = assignmentProductIdentity(product || {});
        const purchaseUnit = card.querySelector('.term-unit');
        const inventoryUnit = card.querySelector('.term-inventory-unit');

        if (!validAssignmentPurchaseUnit(purchaseUnit.value)) {
            setFieldError(purchaseUnit, 'Select a purchase unit.');
            errors.push(`${identity}: select a purchase unit.`);
            firstInvalid ||= card.querySelector('.assignment-unit-search') || purchaseUnit;
        }
        if (!inventoryUnit.value) {
            setFieldError(inventoryUnit, 'Configure the Product Base Unit in Product Master first.');
            errors.push(`${identity}: Product Base Unit must be configured in Product Master.`);
            firstInvalid ||= inventoryUnit;
        }
        const packagingError = state.packagingEditors.get(String(card.dataset.productId))?.error() ?? 'Complete the packaging breakdown.';
        if (packagingError) {
            errors.push(`${identity}: ${packagingError}`);
            card.classList.add('is-invalid');
            card.querySelector('.term-packaging-error').textContent = packagingError;
            const quantityField = card.querySelector('.term-packaging-host [data-level-qty]:not(:disabled)');
            if (quantityField) {
                quantityField.classList.add('is-invalid');
                quantityField.setAttribute('aria-invalid', 'true');
            }
            firstInvalid ||= quantityField || purchaseUnit;
        }
        updateTermCard(card);
    });

    const summary = document.getElementById('assignmentStep2Errors');
    if (errors.length) {
        summary.classList.remove('d-none');
        summary.innerHTML = `<strong>Complete the highlighted purchasing setup to continue:</strong><ul class="mb-0 mt-1">${errors.map((error) => `<li>${esc(error)}</li>`).join('')}</ul>`;
    } else {
        summary.classList.add('d-none');
        summary.textContent = '';
    }

    if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => firstInvalid.focus({ preventScroll: true }), 250);
        return false;
    }
    rememberTerms();
    return true;
}

function renderStep3() {
    rememberTerms();
    const supplier = selectedSupplier();
    document.getElementById('assignmentStep3').innerHTML = `
        <div class="assignment-step-heading">
            <h6>Review and Save</h6>
            <p>Confirm the Product Master records and supplier purchasing terms before saving.</p>
        </div>
        <div class="assignment-review-supplier"><strong>Supplier:</strong> ${esc(supplier?.supplier_name || 'Not selected')}</div>
        <div class="assignment-review-list">
            ${selectedProducts().map((product) => {
                const saved = defaultTerms(product);
                const unit = saved.inventoryUnit || inventoryUnit(product);
                const conversion = purchasingConversion({ purchase_unit: saved.purchaseUnit, inventory_unit: unit, hierarchy_levels: saved.hierarchyLevels });
                return `
                    <article class="assignment-review-card">
                        <div class="assignment-selected-identity mb-1">${assignmentProductTitle(product)} ${assignmentRxBadge(product)}</div>
                        <div class="assignment-selected-meta mb-3">${esc(formatProductSpecification(product))}</div>
                        <div class="assignment-review-grid">
                            <div><span>Purchase Unit</span><strong>${esc(saved.purchaseUnit)}</strong></div>
                            <div><span>Product Base Unit</span><strong>${esc(unit)}</strong></div>
                            <div><span>Contents</span><strong>${esc(conversion.summary)}</strong></div>
                            <div><span>Supplier Price</span><strong>${saved.supplierCost === '' ? 'Not set' : `₱${esc(compactPrice(saved.supplierCost))}`}</strong></div>
                        </div>
                    </article>`;
            }).join('')}
        </div>`;
}

function renderFooter() {
    const footer = document.getElementById('assignmentFooter');
    if (!footer) return;
    if (state.step === 1) {
        footer.innerHTML = `
            <button class="btn btn-light me-auto" type="button" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-purple" id="continueToPurchasing" type="button"
                    ${state.mode !== 'existing' || !selectedSupplierId() || !state.selectedIds.size ? 'disabled' : ''}>
                Continue to Purchasing Setup <i class="fa-solid fa-arrow-right ms-2" aria-hidden="true"></i>
            </button>`;
    } else if (state.step === 2) {
        footer.innerHTML = `
            <button class="btn btn-light me-auto" id="backToProducts" type="button"><i class="fa-solid fa-arrow-left me-2" aria-hidden="true"></i>Back</button>
            <button class="btn btn-purple" id="continueToReview" type="button">Continue to Review <i class="fa-solid fa-arrow-right ms-2" aria-hidden="true"></i></button>`;
    } else {
        footer.innerHTML = `
            <button class="btn btn-light me-auto" id="backToPurchasing" type="button"><i class="fa-solid fa-arrow-left me-2" aria-hidden="true"></i>Back to Purchasing Setup</button>
            <button class="btn btn-purple" id="saveAssignments" type="button"><i class="fa-solid fa-check me-2" aria-hidden="true"></i>Assign Products</button>`;
    }
}

function setStep(step) {
    state.step = step;
    [1, 2, 3].forEach((number) => {
        document.getElementById(`assignmentStep${number}`)?.classList.toggle('d-none', number !== step);
        const progress = document.querySelector(`[data-progress-step="${number}"]`);
        progress?.classList.toggle('is-active', number === step);
        progress?.classList.toggle('is-complete', number < step);
    });
    if (step === 2) renderStep2();
    if (step === 3) renderStep3();
    renderFooter();
    const body = document.getElementById('supplierAssignmentBody');
    if (body) body.scrollTop = 0;
}

function validateStep1() {
    const supplier = document.getElementById('assignmentSupplier');
    const supplierError = document.getElementById('assignmentSupplierError');
    supplier.classList.remove('is-invalid');
    supplierError.textContent = '';
    if (!supplier.value) {
        supplier.classList.add('is-invalid');
        supplierError.textContent = 'Select a supplier before continuing.';
        supplier.focus();
        return false;
    }
    if (!state.selectedIds.size) return false;
    return true;
}

function sharedFormHasInput() {
    const form = document.getElementById('addProductForm');
    if (!form) return false;
    return [...form.elements].some((element) =>
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
        && element.type !== 'hidden'
        && String(element.value || '').trim()
        && !['Active'].includes(String(element.value)));
}

async function switchMode(mode) {
    if (mode === state.mode) return;
    const hasUnsaved = state.mode === 'existing' ? state.selectedIds.size > 0 : sharedFormHasInput();
    if (hasUnsaved) {
        const confirmed = await PharmaUtils.modal.confirm(
            'Switch workflows?',
            'Switching workflows will clear the current unsaved selection. Continue?',
            'Switch Workflow'
        );
        if (!confirmed) return;
        state.selectedIds.clear();
        state.terms.clear();
        document.getElementById('addProductForm')?.reset();
    }
    state.mode = mode;
    state.sharedFormReady = mode === 'create' && state.sharedFormReady;
    renderStep1();
    renderFooter();
}

async function loadData() {
    const [productResponse, supplierResponse, measurementResponse] = await Promise.all([
        PharmaUtils.safeFetch(`${API}/products/get_products.php`, { credentials: 'include' }),
        PharmaUtils.safeFetch(`${API}/suppliers/get_suppliers.php`, { credentials: 'include' }),
        loadMeasurementUnits()
    ]);
    state.products = productResponse.data || [];
    state.suppliers = supplierResponse.suppliers || supplierResponse.data || [];
    state.units = measurementResponse.units || [];
}

async function initializeWorkflow() {
    const priorSupplier = document.getElementById('supplierProductFilterSupplier')?.value || '';
    await loadData();
    state.step = 1;
    state.mode = 'existing';
    state.selectedIds.clear();
    state.terms.clear();
    state.createdProductIds.clear();
    renderStep1();
    if (priorSupplier) {
        document.getElementById('assignmentSupplier').value = priorSupplier;
        renderProducts();
    }
    renderFooter();
    document.getElementById('supplierAssignmentBody').scrollTop = 0;
}

async function saveAssignments() {
    if (!canManageSupplierCatalog()) {
        PharmaUtils.toast.error('Supplier product assignment is read only for this account.');
        return;
    }
    rememberTerms();
    const supplierId = selectedSupplierId();
    const products = selectedProducts();
    if (!supplierId || !products.length) return;

    const button = document.getElementById('saveAssignments');
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Assigning…';
    const succeeded = [];
    const failed = [];

    for (const product of products) {
        const saved = defaultTerms(product);
        try {
            await PharmaUtils.safeFetch(`${API}/suppliers/assign_product.php`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplier_id: supplierId,
                    product_id: product.product_id,
                    purchase_unit: saved.purchaseUnit,
                    inventory_unit: saved.inventoryUnit,
                    hierarchy_levels: saved.hierarchyLevels,
                    supplier_cost_input: saved.supplierCost === '' ? null : saved.supplierCost
                })
            });
            succeeded.push(product);
        } catch (error) {
            failed.push({ product, message: error.message });
        }
    }

    if (!failed.length) {
        bootstrap.Modal.getInstance(document.getElementById('assignSupplierProductsModal'))?.hide();
        PharmaUtils.toast.success(`${succeeded.length} product${succeeded.length === 1 ? '' : 's'} assigned successfully.`);
        window.setTimeout(() => window.location.reload(), 350);
        return;
    }

    succeeded.forEach((product) => {
        state.selectedIds.delete(String(product.product_id));
        state.terms.delete(String(product.product_id));
    });
    await loadData();
    button.disabled = false;
    button.innerHTML = '<i class="fa-solid fa-rotate me-2" aria-hidden="true"></i>Retry Failed Assignments';
    await PharmaUtils.modal.error(
        succeeded.length ? 'Some assignments need attention' : 'Assignments could not be saved',
        `${succeeded.length} succeeded. ${failed.length} failed: ${failed.map(({ product, message }) => `${assignmentProductIdentity(product)} — ${message}`).join('; ')}`
    );
    setStep(2);
}

let assignmentUnitCard = null;
let assignmentMenuIndex = -1;

function assignmentUnitMenu() {
    let menu = document.getElementById('assignmentPurchaseUnitMenu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'assignmentPurchaseUnitMenu';
    menu.className = 'sps-combo-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', (event) => {
        if (event.target.closest('input')) return;
        event.preventDefault();
    });
    menu.addEventListener('click', (event) => {
        const option = event.target.closest('[data-purchase-unit]');
        if (option && assignmentUnitCard) {
            selectAssignmentPurchaseUnit(assignmentUnitCard, option.dataset.purchaseUnit);
            return;
        }
        if (event.target.closest('[data-customize-purchase-unit]')) showAssignmentUnitCustomizer();
        if (event.target.closest('[data-save-purchase-unit]')) void saveAssignmentPurchaseUnit();
    });
    return menu;
}

function positionAssignmentUnitMenu() {
    const input = assignmentUnitCard?.querySelector('.assignment-unit-search');
    const menu = document.getElementById('assignmentPurchaseUnitMenu');
    if (!input || !menu || menu.hidden) return;
    const rect = input.getBoundingClientRect();
    const width = Math.max(rect.width, 280);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    menu.style.top = `${rect.bottom + 6}px`;
}

function closeAssignmentUnitMenu() {
    const menu = document.getElementById('assignmentPurchaseUnitMenu');
    if (menu) menu.hidden = true;
    assignmentUnitCard?.querySelector('.assignment-unit-search')?.setAttribute('aria-expanded', 'false');
}

function syncAssignmentUnitSearch(card) {
    const select = card.querySelector('.term-unit');
    const input = card.querySelector('.assignment-unit-search');
    if (!select || !input) return;
    const selected = select.selectedOptions?.[0];
    input.value = select.value ? (selected?.textContent || select.value) : '';
    input.classList.toggle('is-invalid', select.classList.contains('is-invalid'));
}

function selectAssignmentPurchaseUnit(card, value) {
    const select = card.querySelector('.term-unit');
    if (!select) return;
    const match = [...select.options].find(option => unitKey(option.value) === unitKey(value));
    if (!match) return;
    select.value = match.value;
    select.classList.remove('is-invalid');
    syncAssignmentUnitSearch(card);
    closeAssignmentUnitMenu();
    select.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderAssignmentUnitMenu(query = '') {
    const menu = assignmentUnitMenu();
    const matches = assignmentPurchaseUnits().filter(unit => {
        const needle = unitKey(query);
        if (!needle) return true;
        return [unit.unit_name, unit.unit_symbol, assignmentUnitLabel(unit)].some(value => unitKey(value).includes(needle));
    });
    const selectedValue = assignmentUnitCard?.querySelector('.term-unit')?.value || '';
    const exactIndex = matches.findIndex(unit => [unit.unit_name, unit.unit_symbol].some(value => unitKey(value) === unitKey(query || selectedValue)));
    assignmentMenuIndex = exactIndex >= 0 ? exactIndex : (unitKey(query) && matches.length ? 0 : -1);
    const options = matches.map((unit, index) => {
        const active = index === assignmentMenuIndex;
        return `<button class="sps-combo-option${active ? ' is-active' : ''}" type="button" role="option" data-purchase-unit="${esc(unit.unit_name)}" aria-selected="${active ? 'true' : 'false'}">${esc(assignmentUnitLabel(unit))}</button>`;
    }).join('');
    const empty = matches.length ? '' : '<p class="sps-combo-empty">No matching purchase unit.</p>';
    menu.innerHTML = `${options}${empty}<div class="sps-combo-create" hidden><label class="visually-hidden" for="assignmentNewPurchaseUnit">New purchase unit</label><input class="form-control assignment-new-unit" id="assignmentNewPurchaseUnit" type="text" maxlength="40" placeholder="New purchase unit" /><button class="btn btn-purple" type="button" data-save-purchase-unit>Add</button></div><button class="sps-combo-customize" type="button" data-customize-purchase-unit><i class="fa-solid fa-gear" aria-hidden="true"></i><span>Customize purchase unit</span></button>`;
    menu.hidden = false;
    assignmentUnitCard?.querySelector('.assignment-unit-search')?.setAttribute('aria-expanded', 'true');
    positionAssignmentUnitMenu();
}

function showAssignmentUnitCustomizer() {
    const menu = assignmentUnitMenu();
    const create = menu.querySelector('.sps-combo-create');
    const button = menu.querySelector('[data-customize-purchase-unit]');
    if (create) create.hidden = false;
    if (button) button.hidden = true;
    const typed = String(assignmentUnitCard?.querySelector('.assignment-unit-search')?.value || '').trim();
    const exact = assignmentPurchaseUnits().some(unit => [unit.unit_name, unit.unit_symbol].some(value => unitKey(value) === unitKey(typed)));
    const input = menu.querySelector('.assignment-new-unit');
    if (!input) return;
    input.value = exact ? '' : typed;
    input.focus();
    input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void saveAssignmentPurchaseUnit();
    });
}

function appendAssignmentPurchaseOption(unitName) {
    document.querySelectorAll('.assignment-term-card .term-unit').forEach((select) => {
        if ([...select.options].some(option => unitKey(option.value) === unitKey(unitName))) return;
        const option = document.createElement('option');
        option.value = unitName;
        option.textContent = unitName;
        select.appendChild(option);
    });
}

async function saveAssignmentPurchaseUnit() {
    const name = String(document.getElementById('assignmentNewPurchaseUnit')?.value || '').trim();
    if (!name || /^\d+(?:\.\d+)?$/.test(name)) {
        PharmaUtils.toast.error('Enter a purchase unit name.');
        return;
    }
    const existing = assignmentPurchaseUnits().find(unit => [unit.unit_name, unit.unit_symbol].some(value => unitKey(value) === unitKey(name)));
    if (existing && assignmentUnitCard) {
        selectAssignmentPurchaseUnit(assignmentUnitCard, existing.unit_name);
        return;
    }
    try {
        const data = await PharmaUtils.safeFetch(`${API}/products/add_measurement_unit.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unit_name: name, unit_symbol: name, measurement_group: 'Packaging' })
        });
        const unit = data.unit || { unit_name: name, unit_symbol: name, measurement_group: 'Packaging', is_active: 1 };
        upsertMeasurementUnitCache(unit);
        if (!state.units.some(item => unit.measurement_unit_id && String(item.measurement_unit_id) === String(unit.measurement_unit_id))) {
            state.units.push(unit);
        }
        appendAssignmentPurchaseOption(unit.unit_name || name);
        document.querySelectorAll('.assignment-term-card').forEach((card) => {
            state.packagingEditors.get(String(card.dataset.productId))?.setPurchaseUnit(card.querySelector('.term-unit')?.value || '');
        });
        if (assignmentUnitCard) selectAssignmentPurchaseUnit(assignmentUnitCard, unit.unit_name || name);
        PharmaUtils.toast.success(data.message || 'Purchase unit added.');
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

document.body.insertAdjacentHTML('beforeend', markup());
const modal = document.getElementById('assignSupplierProductsModal');

modal.addEventListener('show.bs.modal', (event) => {
    if (!canManageSupplierCatalog()) {
        event.preventDefault();
        return;
    }
    initializeWorkflow().catch((error) => PharmaUtils.modal.error('Unable to load assignment workflow', error.message));
});

modal.addEventListener('shown.bs.modal', () => {
    document.getElementById('assignSupplierProductsTitle')?.focus({ preventScroll: true });
});

modal.addEventListener('hidden.bs.modal', () => {
    closeAssignmentUnitMenu();
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
});

modal.addEventListener('focusin', (event) => {
    const input = event.target.closest?.('.assignment-unit-search');
    if (!input) return;
    assignmentUnitCard = input.closest('.assignment-term-card');
    input.select();
    renderAssignmentUnitMenu('');
});

modal.addEventListener('click', (event) => {
    const input = event.target.closest?.('.assignment-unit-search');
    if (!input) return;
    const menu = document.getElementById('assignmentPurchaseUnitMenu');
    if (menu && !menu.hidden) return;
    assignmentUnitCard = input.closest('.assignment-term-card');
    renderAssignmentUnitMenu('');
});

modal.addEventListener('input', (event) => {
    if (!event.target.matches('.assignment-unit-search')) return;
    assignmentUnitCard = event.target.closest('.assignment-term-card');
    renderAssignmentUnitMenu(event.target.value);
});

modal.addEventListener('keydown', (event) => {
    if (!event.target.matches('.assignment-unit-search') && !event.target.matches('.assignment-new-unit')) return;
    if (event.target.matches('.assignment-new-unit')) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void saveAssignmentPurchaseUnit();
        return;
    }
    const menu = document.getElementById('assignmentPurchaseUnitMenu');
    const options = [...(menu?.querySelectorAll('[data-purchase-unit]') || [])];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!options.length) return;
        if (menu?.hidden) renderAssignmentUnitMenu('');
        const next = event.key === 'ArrowDown' ? assignmentMenuIndex + 1 : assignmentMenuIndex - 1;
        assignmentMenuIndex = (next + options.length) % options.length;
        options.forEach((option, index) => {
            option.classList.toggle('is-active', index === assignmentMenuIndex);
            option.setAttribute('aria-selected', index === assignmentMenuIndex ? 'true' : 'false');
        });
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        if (menu?.hidden) return;
        const active = options[assignmentMenuIndex];
        const exact = assignmentPurchaseUnits().find(unit => [unit.unit_name, unit.unit_symbol].some(value => unitKey(value) === unitKey(event.target.value)));
        const value = active?.dataset.purchaseUnit || exact?.unit_name;
        if (value && assignmentUnitCard) selectAssignmentPurchaseUnit(assignmentUnitCard, value);
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        if (assignmentUnitCard) syncAssignmentUnitSearch(assignmentUnitCard);
        closeAssignmentUnitMenu();
    }
});

document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#assignmentPurchaseUnitMenu, .assignment-unit-search')) return;
    if (assignmentUnitCard) syncAssignmentUnitSearch(assignmentUnitCard);
    closeAssignmentUnitMenu();
});

modal.querySelector('.modal-body')?.addEventListener('scroll', () => positionAssignmentUnitMenu());
window.addEventListener('resize', () => positionAssignmentUnitMenu());

modal.addEventListener('input', (event) => {
    if (event.target.matches('#assignmentProductSearch')) renderProducts();
    if (event.target.matches('[data-level-qty],[data-level-unit]')) rememberTerms();
    if (event.target.matches('.term-unit')) {
        const card = event.target.closest('.assignment-term-card');
        state.packagingEditors.get(String(card.dataset.productId))?.setPurchaseUnit(event.target.value);
        updateTermCard(card);
        rememberTerms();
    }
});

modal.addEventListener('change', (event) => {
    if (event.target.matches('#assignmentSupplier')) {
        [...state.selectedIds].forEach((productId) => {
            const product = state.products.find((item) => String(item.product_id) === productId);
            if (!product || isAssignedToSelectedSupplier(product) || (product.status || 'Active') !== 'Active') {
                state.selectedIds.delete(productId);
                state.terms.delete(productId);
            }
        });
        renderProducts();
        renderSelectedProducts();
    }
    if (event.target.matches('#showInactiveAssignmentProducts')) renderProducts();
    if (event.target.matches('.term-unit')) {
        const card = event.target.closest('.assignment-term-card');
        state.packagingEditors.get(String(card.dataset.productId))?.setPurchaseUnit(event.target.value);
        updateTermCard(card);
        rememberTerms();
    }
    if (event.target.matches('.assignment-product-check')) {
        const productId = String(event.target.value);
        event.target.checked ? state.selectedIds.add(productId) : state.selectedIds.delete(productId);
        if (!event.target.checked) state.terms.delete(productId);
        renderSelectedProducts();
    }
});

modal.addEventListener('click', (event) => {
    const remove = event.target.closest('.remove-selected-product');
    if (remove) {
        const productId = String(remove.dataset.productId);
        state.selectedIds.delete(productId);
        state.terms.delete(productId);
        renderProducts();
        renderSelectedProducts();
        return;
    }
    if (event.target.closest('#modeExisting')) {
        switchMode('existing');
        return;
    }
    if (event.target.closest('#modeCreate')) {
        switchMode('create');
        return;
    }
    if (event.target.closest('#continueToPurchasing') && validateStep1()) {
        setStep(2);
        return;
    }
    if (event.target.closest('#backToProducts')) {
        setStep(1);
        return;
    }
    if (event.target.closest('#continueToReview') && validateStep2()) {
        setStep(3);
        return;
    }
    if (event.target.closest('#backToPurchasing')) {
        setStep(2);
        return;
    }
    if (event.target.closest('#saveAssignments')) saveAssignments();
});

window.addEventListener('products:created', async (event) => {
    const productIds = (event.detail?.productIds || []).map(String);
    await loadData();
    productIds.forEach((productId) => {
        state.selectedIds.add(productId);
        state.createdProductIds.add(productId);
    });
    state.mode = 'existing';
    setStep(2);
});
