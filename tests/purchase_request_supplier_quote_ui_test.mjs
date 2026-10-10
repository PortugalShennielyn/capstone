import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const nodes = new Map();
const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', className: '', textContent: '' });
    return nodes.get(id);
};
const context = vm.createContext({
    console,
    document: { getElementById: node, querySelector: () => null, querySelectorAll: () => [] },
    productSpecification: () => '500 mg · Tablet',
});
const source = fs.readFileSync('pharma-frontend/js/modules/purchase_requests.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .split('document.getElementById("createRequestButton")?.addEventListener')[0];
vm.runInContext(source, context);

vm.runInContext(`
const options = [
  {supplier_product_id:'sp-a',supplier_id:'supplier-a',supplier_name:'Supplier A',purchase_unit:'Box',inventory_unit:'Tablet',base_qty_per_purchase_unit:12,units_per_purchase_unit:12,absolute_levels:[{unit:'Box',base_quantity:12}],supplier_price_available:true,supplier_price_per_purchase_unit:85,supplier_cost_per_inventory_unit:7.0833,estimated_purchase_unit_cost:85,summary:'12 tablets per box'},
  {supplier_product_id:'sp-b',supplier_id:'supplier-b',supplier_name:'Supplier B',purchase_unit:'Box',inventory_unit:'Tablet',base_qty_per_purchase_unit:16,units_per_purchase_unit:16,absolute_levels:[{unit:'Box',base_quantity:16}],supplier_price_available:true,supplier_price_per_purchase_unit:92,supplier_cost_per_inventory_unit:5.75,estimated_purchase_unit_cost:92,summary:'16 tablets per box'},
  {supplier_product_id:'sp-c',supplier_id:'supplier-c',supplier_name:'Supplier C',purchase_unit:'Box',inventory_unit:'Tablet',base_qty_per_purchase_unit:10,units_per_purchase_unit:10,absolute_levels:[{unit:'Box',base_quantity:10}],supplier_price_available:false,supplier_price_per_purchase_unit:0,supplier_cost_per_inventory_unit:0,estimated_purchase_unit_cost:0,summary:'10 tablets per box'},
];
const first = {pr_item_id:'line-a',product_id:'product-a',product_name:'Biogesic',brand_name:'Biogesic',generic_name:'Paracetamol',category_name:'Medicine',strength:'500 mg',dosage_form:'Tablet',approved_qty:2,unit:'Box',supplier_options:options};
const second = {pr_item_id:'line-b',product_id:'product-b',product_name:'Vitamin C',brand_name:'Vitamin C',approved_qty:1,unit:'Box',supplier_options:[{...options[0],supplier_product_id:'sp-c',supplier_id:'supplier-c',supplier_name:'Supplier C'}]};
initializePoGeneration({items:[first]});
if (procurementSelections['line-a'].supplier_product_id !== '') throw new Error('Cheapest supplier was selected automatically.');
procurementSelections['line-a'] = {supplier_product_id:'sp-a'};
procurementSelections['line-b'] = {supplier_product_id:'sp-c'};
renderManagerPurchasingSetup({items:[first,second]});
`, context);

const setupHtml = node('managerProcurementAssignments').innerHTML;
assert.match(setupHtml, /<strong>Supplier A<\/strong>\s*<span[^>]*>— ₱85 \/ Box<\/span>/);
assert.match(setupHtml, /<strong>Supplier B<\/strong>\s*<span[^>]*>₱92 \/ Box<\/span>/);
assert.match(setupHtml, /<span[^>]*>Lowest price<\/span>\s*<span[^>]*>Recommended<\/span>/);
assert.match(setupHtml, /Price not set/);
assert.match(setupHtml, /₱170/);

assert.equal(vm.runInContext("procurementCalculation(first).estimatedLineTotal", context), 170);
vm.runInContext("procurementSelections['line-a']={supplier_product_id:'sp-b'}", context);
assert.equal(vm.runInContext("procurementCalculation(first).estimatedLineTotal", context), 184);
assert.equal(vm.runInContext("managerSupplierGroups({items:[first,second]}).length", context), 2);
console.log('PASS: supplier quote display, normalized cheapest recommendation, manual selection, line estimates, and supplier-specific PO grouping.');
