import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const nodes = new Map();
const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
        value: '', innerHTML: '', textContent: '', disabled: false, listeners: {},
        addEventListener(type, listener) { this.listeners[type] = listener; },
    });
    return nodes.get(id);
};
node('replenishmentFilter').value = 'all';
const document = { getElementById: node, querySelector: () => null, querySelectorAll: () => [] };
const context = vm.createContext({ document, console, URLSearchParams, productSpecification: product => product.specification || '' });
const source = fs.readFileSync('pharma-frontend/js/modules/purchase_requests.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .split('document.getElementById("productSelectorRows")?.addEventListener("change"')[0];
vm.runInContext(source, context);

const levels = [{ unit: 'box', base_quantity: 10 }, { unit: 'tablet', base_quantity: 1 }];
const product = (id, status, extra = {}) => ({
    product_id: id, product_name: `${id} product`, master_product_name: `${id} catalog name`, brand_name: `${id} brand`,
    generic_name: `${id} generic`, specification: `${id} specification`, barcode: `${id}barcode`,
    category_name: 'Medicine', medicine_classification: '',
    product_status: 'Active', stock_status: status, total_quantity: status === 'In Stock' ? 80 : 0,
    reorder_level: 30, base_inventory_unit: 'tablet', purchase_unit: 'box',
    has_active_supplier_assignment: 1, packaging_units: levels,
    supplier_options: [{ purchase_unit: 'box', base_qty_per_purchase_unit: 10, absolute_levels: levels, summary: '1 box = 10 tablets' }],
    ...extra,
});
vm.runInContext('products = []; inventoryByProduct.clear(); productById.clear(); selectedItems.clear();', context);
const fixtures = [
    product('low', 'Low Stock', { medicine_classification: 'OTC' }),
    product('out', 'Out of Stock', { medicine_classification: 'Prescription (Rx)' }),
    product('new', 'New Product'), product('healthy', 'In Stock'),
    product('unassigned', 'In Stock', { has_active_supplier_assignment: 0 }),
    product('inactive', 'Low Stock', { product_status: 'Inactive' }),
];
context.fixtures = fixtures;
vm.runInContext('products = fixtures; products.forEach(p => { productById.set(p.product_id, p); inventoryByProduct.set(p.product_id, p); }); renderProductCatalog();', context);
const rows = () => node('productSelectorRows').innerHTML;
assert.match(rows(), /low brand/);
assert.match(rows(), /out brand/);
assert.match(rows(), /out brand<\/strong><span class="pr-rx-badge"[^>]*>Rx<\/span>/);
assert.doesNotMatch(rows(), /low brand<\/strong><span class="pr-rx-badge"/);
assert.match(rows(), /new brand/);
assert.doesNotMatch(rows(), /healthy brand/);
assert.doesNotMatch(rows(), /inactive brand/);
node('productSelectorSearch').value = 'no matching search';
node('replenishmentFilter').value = 'low';
node('productBulkSelect').value = 'out';
node('productBulkSelect').listeners.change({ target: node('productBulkSelect') });
assert.equal(vm.runInContext('selectedItems.size', context), 1);
assert.equal(vm.runInContext('selectedItems.get("out").requested_qty', context), 3);
assert.equal(node('replenishmentFilter').value, 'out');
assert.equal(node('productSelectorSearch').value, '');
assert.equal(node('productBulkSelect').value, '');
assert.match(rows(), /data-product-select="out" checked/);
vm.runInContext('renderFinalizeItems()', context);
assert.match(node('finalizeRequestItems').innerHTML, /out brand<\/strong><span class="pr-rx-badge"[^>]*>Rx<\/span>/);
for (const [action, expectedCount] of [['low', 2], ['new', 3]]) {
    node('productBulkSelect').value = action;
    node('productBulkSelect').listeners.change({ target: node('productBulkSelect') });
    assert.equal(vm.runInContext('selectedItems.size', context), expectedCount);
    assert.equal(node('replenishmentFilter').value, action);
}
node('productBulkSelect').value = 'clear';
node('productBulkSelect').listeners.change({ target: node('productBulkSelect') });
assert.equal(vm.runInContext('selectedItems.size', context), 0);
node('replenishmentFilter').value = 'all';

for (const term of ['healthy brand', 'healthy product', 'healthy catalog name', 'healthy generic', 'healthy specification', 'healthybarcode']) {
    node('productSelectorSearch').value = term;
    vm.runInContext('renderProductCatalog()', context);
    assert.match(rows(), /healthy brand/, `Healthy product should match ${term}`);
    assert.match(rows(), /Healthy Stock/);
    assert.match(rows(), /data-product-select="healthy"/);
}
vm.runInContext(`requests = [{ pr_id: 'pending', pr_number: 'PR-PENDING', status: 'Pending Supervisor Approval', items: [{ product_id: 'healthy' }] }]; renderProductCatalog();`, context);
assert.match(rows(), /PR-PENDING/);
assert.doesNotMatch(rows(), /data-product-select="healthy"/);
vm.runInContext(`requests = [{ pr_id: 'approved', pr_number: 'PR-APPROVED', status: 'Approved', items: [{ product_id: 'healthy', remaining_qty: 1 }] }]; renderProductCatalog();`, context);
assert.match(rows(), /PR-APPROVED/);
assert.doesNotMatch(rows(), /data-product-select="healthy"/);
vm.runInContext('requests = []; renderProductCatalog();', context);
node('productSelectorSearch').value = 'unassigned';
vm.runInContext('renderProductCatalog()', context);
assert.match(rows(), /unassigned brand/);
assert.match(rows(), /data-product-select="unassigned"[^>]*disabled/);
assert.doesNotMatch(rows(), /data-product-row="unassigned"/);

node('productSelectorSearch').value = 'healthy';
vm.runInContext("selectProduct('healthy'); setRequestedQuantity('healthy', 2);", context);
assert.equal(vm.runInContext('suggestedRequestQuantity(productById.get("healthy"))', context), 0);
assert.equal(vm.runInContext('formPayload(true).items[0].requested_qty', context), 2);
assert.equal(vm.runInContext('selectionIsValid()', context), true);
vm.runInContext('validatePayload(formPayload(true))', context);
vm.runInContext("selectProduct('healthy')", context);
assert.equal(vm.runInContext('selectedItems.size', context), 1);

node('productSelectorSearch').value = 'out';
vm.runInContext("selectProduct('out'); setRequestedQuantity('out', 1);", context);
node('productSelectorSearch').value = '';
vm.runInContext('renderProductCatalog()', context);
assert.doesNotMatch(rows(), /healthy brand/);
assert.match(rows(), /out brand/);
assert.equal(vm.runInContext('selectedItems.size', context), 2);
assert.equal(vm.runInContext('selectedItems.get("healthy").requested_qty', context), 2);
assert.equal(vm.runInContext('formPayload(true).items.length', context), 2);
vm.runInContext('validatePayload(formPayload(true))', context);

node('replenishmentFilter').value = 'healthy';
vm.runInContext('renderProductCatalog()', context);
assert.match(rows(), /healthy brand/);
assert.doesNotMatch(rows(), /low brand/);
node('replenishmentFilter').value = 'all';
node('productSelectorSearch').value = 'no such product';
vm.runInContext('renderProductCatalog()', context);
assert.match(rows(), /No matching products found/);
assert.equal(vm.runInContext('selectedItems.size', context), 2);

const api = fs.readFileSync('pharma-api/v1/purchase_requests/get_pr_candidates.php', 'utf8');
assert.match(api, /WHERE p\.status = 'Active'/);
assert.doesNotMatch(api, /AND \(\s*COALESCE\(received\.has_received, 0\) = 0\s*OR COALESCE\(stock\.total_quantity/);
assert.match(api, /AS has_active_supplier_assignment/);
assert.match(api, /AS medicine_classification/);
context.API_BASE_URL = '/api';
context.bootstrap = { Modal: { getInstance: () => ({ hide() {} }) } };
context.toastr = { success() {} };
vm.runInContext(`
    let submittedRequest = null;
    json = async (url, options) => {
        submittedRequest = { url, method: options.method, payload: JSON.parse(options.body) };
        return { data: { pr_id: 'submitted-pr' } };
    };
    refreshUntilStatus = async () => {};
`, context);
await vm.runInContext('saveForm(true)', context);
assert.match(vm.runInContext('submittedRequest.url', context), /purchase_requests\/create_purchase_request\.php$/);
assert.equal(vm.runInContext('submittedRequest.method', context), 'POST');
assert.equal(vm.runInContext('submittedRequest.payload.submit', context), true);
assert.equal(vm.runInContext('submittedRequest.payload.items.length', context), 2);
assert.equal(vm.runInContext('submittedRequest.payload.items.find(item => item.product_id === "healthy").requested_qty', context), 2);
const moxylorLevels = [{ unit: 'Bottle', base_quantity: 1 }, { unit: 'Box', base_quantity: 12 }];
const buldakLevels = [{ unit: 'pcs', base_quantity: 1 }, { unit: 'Pack', base_quantity: 5 }];
const moxylor = product('Moxylor', 'Out of Stock', {
    base_inventory_unit: 'Bottle', purchase_unit: 'Box', packaging_units: moxylorLevels,
    supplier_options: [{ purchase_unit: 'Box', base_qty_per_purchase_unit: 12, absolute_levels: moxylorLevels }],
});
const buldak = product('Buldak', 'New Product', {
    base_inventory_unit: 'pcs', purchase_unit: 'Pack', packaging_units: buldakLevels,
    supplier_options: [{ purchase_unit: 'Pack', base_qty_per_purchase_unit: 5, absolute_levels: buldakLevels }],
});
const ambiguous = product('ambiguous', 'Out of Stock', {
    supplier_options: [
        { purchase_unit: 'box', base_qty_per_purchase_unit: 10, absolute_levels: levels },
        { purchase_unit: 'box', base_qty_per_purchase_unit: 12, absolute_levels: moxylorLevels },
    ],
});
context.extraProducts = [moxylor, buldak, ambiguous];
node('productSelectorSearch').value = '';
vm.runInContext(`products = extraProducts; selectedItems.clear(); products.forEach(p => { productById.set(p.product_id, p); inventoryByProduct.set(p.product_id, p); }); renderProductCatalog();`, context);
assert.match(rows(), /data-selected-qty="Moxylor"[^>]*><span class="requested-unit-label">Box<\/span>/);
assert.match(rows(), /Suggested: 3 Boxes/);
assert.match(rows(), /data-selected-qty="Buldak"[^>]*><span class="requested-unit-label">Pack<\/span>/);
assert.match(rows(), /Supplier purchase unit not configured/);
assert.doesNotMatch(rows(), /data-product-row="ambiguous"/);
assert.doesNotMatch(rows(), /request-unit-select/);
vm.runInContext(`selectProduct('Moxylor', 3); selectProduct('Buldak', 2);`, context);
assert.equal(vm.runInContext('totalEquivalent(productById.get("Moxylor"), selectedItems.get("Moxylor"))', context), '36 Bottles');
assert.equal(vm.runInContext('totalEquivalent(productById.get("Buldak"), selectedItems.get("Buldak"))', context), '10 pcs');
console.log('PASS: default statuses, all-field healthy search, selection retention, quantity and submission payload validation.');
