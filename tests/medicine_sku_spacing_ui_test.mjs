import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'pharma-frontend/products.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'pharma-frontend/js/modules/products.js'), 'utf8');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

assert(html.includes('.is-medicine-variation .measurement-select-trigger { height:38px; min-height:38px;'), 'Medicine SKU controls are not consistently compact.');
assert(html.includes('grid-template-columns:minmax(80px,110px) minmax(86px,104px) 14px minmax(80px,110px) minmax(86px,104px)'), 'Strength/concentration controls do not use bounded compact widths.');
assert(html.includes('.sku-net-content-field .input-group > .form-control { width:40%; min-width:0; flex:0 1 40%;'), 'Net Content value is not constrained inside its column.');
assert(html.includes('.sku-net-content-field .measurement-select { width:60%; min-width:0; flex:1 1 60%;'), 'Net Content unit is not constrained inside its column.');
assert(html.includes('column-gap:18px; row-gap:12px;'), 'Medicine SKU columns do not have a safe visible gap.');
assert(html.includes('.sku-medicine-identity-grid,#editProductModal .is-medicine-variation .sku-medicine-identity-grid { display:contents;'), 'Dosage Form and Classification cannot participate in the shared compact grid.');
assert(html.includes('grid-template-columns:minmax(210px,1.2fr) minmax(190px,1fr) minmax(180px,1fr) minmax(210px,1.1fr); grid-auto-flow:row dense;'), 'Medicine SKU fields do not use the shared four-group desktop grid.');
assert(html.includes('.sku-strength-field.is-simple-strength') && html.includes('grid-template-columns:minmax(100px,115px) minmax(100px,115px)'), 'Simple Strength does not collapse to a compact value/unit pair.');
assert(html.includes('.medicine-product-mode .modal-dialog') && html.includes('height:auto; max-height:92vh;'), 'Medicine modals still reserve a fixed empty height.');
assert(source.includes("'package type': 10") && source.includes("'strength': 30"), 'Configured Medicine fields are not ordered into compact dosage-form rows.');
assert(source.includes('<div class="dynamic-specification-grid">${skuIdentity}${fields}${skuTail}</div>'), 'Medicine identity and SKU fields do not share one reflowing layout.');
assert(!source.includes('No specifications have been configured for this Product Type.'), 'The normal SKU form still renders the large empty specification warning.');
assert(!source.includes('Describes what is physically inside one Selling / Inventory Unit'), 'Pack Content still renders the long helper block.');
assert(source.includes('Base unit for stock and sales.'), 'Selling-unit guidance was not reduced to a compact helper.');
assert(html.includes('-webkit-appearance:inner-spin-button; opacity:1;'), 'Number spinners are not preserved inside compact number inputs.');
assert(html.includes('#editProductModal .medicine-strength-composer { grid-template-columns:minmax(0,1fr)'), 'The Edit Product strength composer lacks narrow-screen wrapping protection.');

console.log('Medicine SKU compact spacing tests passed.');
