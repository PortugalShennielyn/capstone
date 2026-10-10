import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const nodes = new Map();
const node = id => { if (!nodes.has(id)) nodes.set(id, {innerHTML:'',value:'',dataset:{}}); return nodes.get(id); };
const context = vm.createContext({console, document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[]},productSpecification:()=> 'Paracetamol 500 mg', URLSearchParams});
const source=fs.readFileSync('pharma-frontend/js/modules/purchase_requests.js','utf8').replace(/^import .*;\r?\n/gm,'').split('document.getElementById("createRequestButton")?.addEventListener')[0];
vm.runInContext(source,context);
vm.runInContext(`
const levels=[{unit:'Tablet',base_quantity:1},{unit:'Blister Pack',base_quantity:10},{unit:'Box',base_quantity:100},{unit:'Carton',base_quantity:500}];
const fixture={product_id:'medicine',product_name:'Biogesic',base_inventory_unit:'Tablet',has_active_supplier_assignment:1,packaging_units:levels,supplier_options:[{supplier_product_id:'supplier',purchase_unit:'Carton',inventory_unit:'Tablet',base_qty_per_purchase_unit:500,absolute_levels:levels,summary:'1 Carton = 5 Boxes = 500 Tablets'}]};
products=[fixture]; productById.set('medicine',fixture);
selectedItems.set('medicine',{product_id:'medicine',requested_qty:5,unit:'Box'});
renderProductCatalog(); renderFinalizeItems(); updateActionState();
`,context);
assert.match(node('productSelectorRows').innerHTML,/Configured purchase unit">Box<\/span>/);
assert.match(node('productSelectorRows').innerHTML,/500 Tablet/);
assert.match(node('finalizeRequestItems').innerHTML,/Configured purchase unit">Box<\/span>/);
assert.equal(node('submitRequestButton').disabled,false);
assert.equal(vm.runInContext('formPayload(true).items[0].requested_qty',context),5);
assert.equal(vm.runInContext('formPayload(true).items[0].unit',context),'Box');
vm.runInContext("setRequestedQuantity('medicine',7)",context);
assert.equal(node('submitRequestButton').disabled,true);
assert.match(node('requestConflictSummary').innerHTML,/7 Box cannot be ordered/);
vm.runInContext(`const approvedItem={pr_item_id:'item',product_name:'Biogesic',brand_name:'Biogesic',generic_name:'Paracetamol',category_name:'Medicine',strength:'500 mg',dosage_form:'Tablet',approved_qty:5,unit:'Box',supplier_options:fixture.supplier_options};procurementSelections.item={supplier_product_id:'supplier'};`,context);
assert.equal(vm.runInContext('procurementCalculation(approvedItem).orderQty',context),1);
vm.runInContext('renderManagerPurchasingSetup({items:[approvedItem]})',context);
assert.match(node('managerProcurementAssignments').innerHTML,/<strong>Paracetamol<\/strong>/);
assert.match(node('managerProcurementAssignments').innerHTML,/<span>Biogesic<\/span>/);
assert.match(node('managerProcurementAssignments').innerHTML,/500 mg • Tablet/);
vm.runInContext('approvedItem.approved_qty=4',context);
assert.ok(vm.runInContext('procurementErrors({items:[approvedItem]}).length',context)>0);
vm.runInContext(`
selectedItems.clear();
requests=[{pr_id:'submitted-pr',pr_number:'PR-20261003-001',status:'Pending Supervisor Approval',items:[{product_id:'medicine'}]}];
renderProductCatalog();
`,context);
assert.match(node('productSelectorRows').innerHTML,/catalog-pending-badge/);
assert.match(node('productSelectorRows').innerHTML,/>Pending<small>PR-20261003-001<\/small>/);
assert.doesNotMatch(node('productSelectorRows').innerHTML,/data-product-select="medicine"/);
vm.runInContext(`
requests=[{pr_id:'approved-pr',pr_number:'PR-20260921-083624-25A7',status:'Approved',created_at:'2026-09-20T23:36:24',items:[{product_id:'medicine',remaining_qty:1}]}];
renderProductCatalog();
`,context);
assert.doesNotMatch(node('productSelectorRows').innerHTML,/PR-20260921-083624-25A7/);
assert.doesNotMatch(node('productSelectorRows').innerHTML,/data-product-select="medicine"/);
assert.match(node('productSelectorRows').innerHTML,/No eligible replenishment items match these filters/);
vm.runInContext(`
requests=[{pr_id:'rejected-pr',pr_number:'PR-20260910-104257-25BD',status:' Rejected ',items:[{product_id:'medicine'}]}];
renderProductCatalog();
`,context);
assert.doesNotMatch(node('productSelectorRows').innerHTML,/catalog-pending-badge/);
assert.match(node('productSelectorRows').innerHTML,/data-product-select="medicine"/);
vm.runInContext(`
requests=[
    {pr_id:'older-pending-pr',pr_number:'PR-20260910-104257-25BD',status:'Pending Supervisor Approval',created_at:'2026-09-10T01:42:00',items:[{product_id:'medicine'}]},
    {pr_id:'newer-rejected-pr',pr_number:'PR-20261003-144159-81E2',status:'Rejected',created_at:'2026-10-03T14:41:59',items:[{product_id:'medicine'}]}
];
renderProductCatalog();
`,context);
assert.doesNotMatch(node('productSelectorRows').innerHTML,/catalog-pending-badge/);
assert.match(node('productSelectorRows').innerHTML,/data-product-select="medicine"/);
const printContext=vm.createContext({formatProductSpecification:()=>'',formatProductPacking:()=>'', container:{}, request:{items:[{product_id:'medicine',product_name:'Biogesic',base_inventory_unit:'Tablet',unit:'Box',requested_qty:5,approved_qty:4,requested_base_qty:500}]}});
const printSource=fs.readFileSync('pharma-frontend/js/modules/pr_document_renderer.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
vm.runInContext(printSource+'\nrenderPurchaseRequestDocument(container,request);',printContext);
assert.match(printContext.container.innerHTML,/5 Box/);assert.match(printContext.container.innerHTML,/4 Box/);assert.match(printContext.container.innerHTML,/500 Tablet/);
console.log('PASS: package UI, preserved payload, live validation, exact PO preview, PR print quantities.');
