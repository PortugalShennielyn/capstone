import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../pharma-frontend/products.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../pharma-frontend/js/modules/products.js', import.meta.url), 'utf8');
const modal = page.slice(page.indexOf('id="addProductTypeModal"'), page.indexOf('id="customizeSpecificationsModal"'));

assert.match(page, /#addProductTypeModal \.modal-dialog \{[^}]*max-height:calc\(100vh - 32px\); margin:16px auto;/, 'The Manage Dosage Forms dialog is not bounded to the viewport.');
assert.match(page, /#addProductTypeModal \.modal-content \{[^}]*max-height:calc\(100vh - 32px\);[^}]*overflow:hidden;/, 'The child modal content can exceed its viewport boundary.');
assert.match(page, /#addProductTypeModal form \{[^}]*display:flex;[^}]*flex:1 1 auto;[^}]*flex-direction:column;[^}]*min-height:0;[^}]*overflow:hidden;/, 'The child form is not a bounded flex column.');
assert.match(page, /#addProductTypeModal \.modal-body \{[^}]*flex:1 1 auto;[^}]*min-height:0;[^}]*overflow-x:hidden; overflow-y:auto;/, 'The child body lacks its short-screen scroll fallback.');
assert.match(page, /#addProductTypeModal \.customizer-list \{[^}]*max-height:min\(260px,32vh\);[^}]*overflow-y:auto; overflow-x:hidden;/, 'The dosage-form list is not independently height-limited and scrollable.');
assert.match(page, /#addProductTypeModal \.modal-footer \{[^}]*flex:0 0 auto;[^}]*background:/, 'The footer can shrink or disappear below the child body.');
assert.match(page, /has-product-customizer-open \.modal-body[^}]*overflow:hidden!important/, 'The parent Product modal is not locked behind the child modal.');
assert.match(source, /function showNestedModal\(id, parentModalId = ''\)/, 'Nested modal handling does not accept its parent modal.');
assert.match(source, /classList\.add\('has-product-customizer-open'\)/, 'Opening Manage Dosage Forms does not lock the parent.');
assert.match(source, /classList\.remove\('has-product-customizer-open'\)/, 'Closing Manage Dosage Forms does not unlock the parent.');
assert.match(source, /parentModal\?\.classList\.contains\('show'\)[\s\S]*document\.body\.classList\.add\('modal-open'\)/, 'Closing the child can incorrectly unlock page scrolling while the parent modal remains open.');
assert.match(source, /showNestedModal\('addProductTypeModal', mode === 'edit' \? 'editProductModal' : 'addProductModal'\)/, 'Add and Edit do not use the same nested-modal sizing behavior.');

for (const requiredControl of ['productTypeCustomizerSearch', 'productTypeCustomizerList', 'newProductTypeName', 'dosageFormSpecificationPattern', 'btnCancelProductTypeEdit', 'btnSaveProductType']) {
    assert(modal.includes(`id="${requiredControl}"`), `${requiredControl} was removed from Manage Dosage Forms.`);
}

assert.doesNotMatch(page, /#addProductTypeModal[^}]*transform:\s*scale/i, 'A browser-zoom-specific scaling workaround was introduced.');

console.log('Manage Dosage Forms responsive modal tests passed for viewport-based 1366x768, 1536x864, and 1920x1080 layouts.');
