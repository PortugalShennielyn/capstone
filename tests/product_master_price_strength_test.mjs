import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { medicineCatalogSpecificationParts } from '../pharma-frontend/js/modules/product_specification.js';

const parts = medicineCatalogSpecificationParts({
    category_name: 'Medicine',
    type_name: 'Tablet',
    specifications: [
        { specification_name: 'Strength', value_number: '50', unit_symbol: 'mg' },
        { specification_name: 'Strength Denominator Weight', value_number: '5', unit_symbol: 'g' }
    ]
});
assert.equal(parts.strength, '50 mg / 5 g');
assert.equal(parts.details, '');

const page = await readFile(new URL('../pharma-frontend/products.html', import.meta.url), 'utf8');
assert.match(page, /#table-products \.selling-price-stack \{ align-items:flex-start; width:100%; \}/);
assert.match(page, /#table-products \.selling-price-cell \{ text-align:left!important; \}/);
