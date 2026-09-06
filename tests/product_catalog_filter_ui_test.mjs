import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const products = await readFile(new URL('../pharma-frontend/js/modules/products.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../pharma-frontend/products.html', import.meta.url), 'utf8');
const toolbar = page.slice(page.indexOf('<div class="product-toolbar"'), page.indexOf('<div class="product-master-container">'));
const filtering = products.slice(products.indexOf('function getFilteredProducts()'), products.indexOf('function productCatalogName'));
const classificationMapping = products.slice(products.indexOf('function medicineClassificationFilterValue'), products.indexOf('function medicineRxBadge'));
const visibility = products.slice(products.indexOf('function updateMedicineClassificationFilter'), products.indexOf('async function loadMeasurementUnitCache'));

assert.doesNotMatch(toolbar, /Sort By|productSortSelect|Name A-Z|Price Low to High|Stock High to Low/);
assert.match(toolbar, /<label class="form-label" for="medicineClassificationFilter">Medicine Type<\/label>/);
assert.match(toolbar, /class="product-toolbar-field product-medicine-filter" id="medicineClassificationFilterWrap"/);
assert.doesNotMatch(toolbar, /product-medicine-filter d-none/);
assert.match(toolbar, /<option value="all" selected>All Medicines<\/option>/);
assert.match(toolbar, /<option value="prescription">Prescription<\/option>/);
assert.match(toolbar, /<option value="non-prescription">Non-Prescription<\/option>/);
assert.doesNotMatch(toolbar, /id="medicineClassificationFilter" disabled/);
assert.match(filtering, /medicineFilterActive = medicineClassValue !== 'all' && \(!categoryValue \|\| categoryName === 'medicine'\)/);
assert.match(filtering, /matchesSearch && matchesCategory && matchesMedicineClass && matchesStatus/);
assert.match(filtering, /return nameA\.localeCompare\(nameB\)/);
assert.doesNotMatch(filtering, /productSortSelect|price-asc|stock-desc/);
assert.match(classificationMapping, /classification === 'prescription \(rx\)'[^]*return 'prescription'/);
assert.match(classificationMapping, /classification === 'otc'[^]*return 'non-prescription'/);
assert.doesNotMatch(visibility, /classList\.toggle\('d-none'/);
assert.match(visibility, /supportsMedicineFilter = isAllCategories \|\| isMedicineCategory/);
assert.match(visibility, /classList\.toggle\('is-disabled', !supportsMedicineFilter\)/);
assert.match(visibility, /select\.disabled = !supportsMedicineFilter/);
assert.match(visibility, /aria-disabled/);
assert.match(visibility, /select\.value = 'all'/);

console.log('Product Catalog medicine filter UI tests passed.');
