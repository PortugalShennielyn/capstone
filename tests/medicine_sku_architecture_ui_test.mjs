import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'pharma-frontend/js/modules/products.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'pharma-frontend/products.html'), 'utf8');
const addApi = fs.readFileSync(path.join(root, 'pharma-api/v1/products/add_product.php'), 'utf8');
const updateApi = fs.readFileSync(path.join(root, 'pharma-api/v1/products/update_product.php'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'pharma-api/v1/products/product_customization_schema.php'), 'utf8');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

assert(html.includes('id="productTypeField"') && html.includes('id="editProductTypeField"'), 'The shared Product Type controls cannot be conditionally hidden for Medicine.');
assert(source.includes("class=\"form-select medicine-sku-type\"") && source.includes('Dosage Form'), 'Medicine SKU cards do not own their Dosage Form selector.');
assert(source.includes('medicine-sku-classification'), 'Medicine Classification is not SKU-specific.');
assert(source.includes("type_id: entry.querySelector('.medicine-sku-type')?.value"), 'The selected SKU dosage-form identifier is not submitted.');
assert(source.includes('variationConfiguration(variation, mode)'), 'SKU fields are not rendered from each SKU dosage-form configuration.');
assert(source.includes("const denominatorControls = concentration ?") && source.includes("is-concentration-strength' : 'is-simple-strength"), 'Simple and ratio Strength layouts are not rendered conditionally.');
assert(!source.includes('isConcentrationDosageForm'), 'Strength mode still depends on a hard-coded dosage-form name list.');
assert(addApi.includes("$skuTypeId = cleanId($variation['type_id'] ?? $typeId)"), 'Add Product does not validate each SKU against its own Product Type.');
assert(updateApi.includes("$typeId = cleanId($variation['type_id'] ?? $typeId)"), 'Edit Product does not preserve the SKU-specific Product Type.');
assert(schema.includes('$configuredSpecifications') && !schema.includes("preg_match('/(?:suspension|solution|syrup"), 'Concentration validation is not driven by Product Type specifications.');

console.log('Medicine SKU architecture UI/API tests passed.');
