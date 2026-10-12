import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../pharma-frontend/products.html', import.meta.url), 'utf8');
const products = await readFile(new URL('../pharma-frontend/js/modules/products.js', import.meta.url), 'utf8');

assert.doesNotMatch(page, /id="(?:editProduct|product)MedicineClassification"/);
assert.match(products, /class="form-select medicine-sku-classification" required/);
assert.match(products, /medicine_classification: firstVariation\.medicine_classification \|\| ''/);
assert.match(products, /const savedPrice = data\.price \?\?/);
