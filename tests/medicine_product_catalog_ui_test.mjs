import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    formatMedicineSpecificationLines,
    formatProductCatalogSpecificationLines,
    formatProductContainer,
    formatProductSpecification,
    medicineCatalogSpecificationParts
} from '../pharma-frontend/js/modules/product_specification.js';

const products = await readFile(new URL('../pharma-frontend/js/modules/products.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../pharma-frontend/products.html', import.meta.url), 'utf8');
const tableHeader = page.slice(page.indexOf('<table id="table-products"'), page.indexOf('</thead>', page.indexOf('<table id="table-products"')));
const searchFunction = products.slice(products.indexOf('function productSearchText(product)'), products.indexOf('function productCardDetailRows(product)'));

assert.match(tableHeader, /<th>Brand<\/th>\s*<th class="product-column">Product<\/th>\s*<th>Specification<\/th>\s*<th>Pack \/ Container<\/th>\s*<th>Selling Price<\/th>\s*<th>Status<\/th>\s*<th>Actions<\/th>/);
assert.doesNotMatch(tableHeader, /<th>(?:Generic Name|Prescription|OTC|Barcode|Product Type)<\/th>/i);
assert.match(products, /const value = isMedicine\(product\) \? product\.generic_name : product\.product_name/);
assert.match(products, /medicine_classification[^\n]+toLowerCase\(\) === 'prescription \(rx\)'/);
assert.match(products, /medicine-rx-badge[^>]*[^]*?>Rx<\/span>/);
assert.doesNotMatch(products, /medicine-generic-badge|medicineProductTags/);
assert.doesNotMatch(products, />OTC<\/span>/);
assert.match(products, /productNameField\?\.classList\.toggle\('d-none', medicine\)/);
assert.match(products, /productName\.disabled = medicine/);
assert.match(products, /brand\.required = !medicine/);
assert.match(products, /categoryName === 'Medicine' \? \(brandName \|\| genericName\) : getValue\('productName'\)/);
assert.match(searchFunction, /product\.brand_name/);
assert.match(searchFunction, /product\.generic_name/);
assert.match(searchFunction, /formatProductSpecification\(product, ''\)/);
assert.match(searchFunction, /product\.barcode/);
assert.match(page, />Generic Name <span class="text-danger">\*<\/span>/);
assert.doesNotMatch(page, /Generic Name \/ Active Ingredient|Brand \/ Trade Name/);
assert.match(products, /brandLabel\.textContent = 'Brand Name'/);

const tableRenderer = products.slice(products.indexOf('function renderProductCards()'), products.indexOf('function productPriceBadge'));
assert.match(tableRenderer, /productCatalogSpecification\(product\)/);
assert.doesNotMatch(tableRenderer, /product-barcode-toggle|fa-barcode/);
assert.match(page, /\.catalog-specification \{[^}]*font-size:12px;[^}]*line-height:1\.3;[^}]*white-space:normal/);
assert.match(page, /\.products-table th:nth-child\(3\), \.products-table td:nth-child\(3\) \{[^}]*text-align:center/);
assert.match(page, /\.products-table \{[^}]*min-width:0/);
assert.match(page, /\.products-table th:nth-child\(5\), \.products-table td:nth-child\(5\) \{[^}]*min-width:145px/);
assert.match(page, /\.products-table th:nth-child\(5\) \{ white-space:nowrap; \}/);

const addSubmitFlow = products.slice(products.indexOf("addProductForm.addEventListener('submit'"), products.indexOf('async function loadProductsTable'));
assert.match(addSubmitFlow, /if \(addProductSubmissionActive\) return/);
assert.match(addSubmitFlow, /saveButton\.disabled = true/);
assert.match(addSubmitFlow, /await PharmaUtils\.safeFetch\(`\$\{API_BASE_URL\}\/products\/add_product\.php`/);
assert.match(addSubmitFlow, /invalidateProductListCache\(\)[\s\S]*await loadProductsTable\(\{ skipCache: true, throwOnError: true \}\)/);
assert.ok(addSubmitFlow.indexOf("await loadProductsTable({ skipCache: true, throwOnError: true })") < addSubmitFlow.indexOf("new CustomEvent('products:created'"));
assert.doesNotMatch(addSubmitFlow, /commitLocalProductChanges\(/);

const prescription = {
    category_name: 'Medicine',
    type_name: 'Powder for Suspension',
    specifications: [
        { specification_name: 'Strength', value_number: '250', unit_symbol: 'mg' },
        { specification_name: 'Strength Denominator', value_number: '5', unit_symbol: 'mL' },
        { specification_name: 'Volume', value_number: '60', unit_symbol: 'mL' },
        { specification_name: 'Package Type', value_text: 'Bottle' },
        { specification_name: 'Medicine Classification', value_text: 'Prescription (Rx)' },
    ],
};
assert.equal(formatProductSpecification(prescription), '250 mg/5 mL • Powder for Suspension • 60 mL');
assert.deepEqual(formatMedicineSpecificationLines({
    ...prescription,
    package_type: 'Bottle',
    specifications: [
        ...prescription.specifications,
        { specification_name: 'Flavor', value_text: 'strawberry' }
    ]
}), ['Powder for Suspension', '250 mg / 5 mL', '60 mL • Strawberry']);
assert.deepEqual(medicineCatalogSpecificationParts({
    ...prescription,
    specifications: [...prescription.specifications, { specification_name: 'Flavor', value_text: 'strawberry' }]
}), {
    dosageForm: 'Powder for Suspension',
    strength: '250 mg / 5 mL',
    details: '60 mL • Strawberry',
    detailCount: 2,
    hasConcentration: true
});
assert.equal(formatProductContainer({ ...prescription, package_type: 'Bottle' }), 'Bottle');

const otcTablet = {
    category_name: 'Medicine',
    type_name: 'Tablet',
    specifications: [
        { specification_name: 'Strength', value_number: '500', unit_symbol: 'mg' },
        { specification_name: 'Package Type', value_text: 'Box' },
        { specification_name: 'Medicine Classification', value_text: 'OTC' },
    ],
};
assert.equal(formatProductSpecification(otcTablet), '500 mg • Tablet');
assert.deepEqual(formatMedicineSpecificationLines({
    ...otcTablet,
    specifications: [
        ...otcTablet.specifications,
        { specification_name: 'Pack Content', value_number: '10', unit_symbol: 'tablet' }
    ]
}), ['Tablet • 500 mg • 10 tablets']);
assert.equal(formatProductContainer(otcTablet), 'Box');

assert.deepEqual(formatMedicineSpecificationLines({
    category_name: 'Medicine',
    type_name: 'Tablet',
    specifications: [
        { specification_name: 'Strength', value_number: '10', unit_symbol: 'mg' },
        { specification_name: 'Pack Content', value_number: '100', unit_symbol: 'tablet' },
        { specification_name: 'Package Type', value_text: 'Blister Pack' }
    ]
}), ['Tablet • 10 mg • 100 tablets']);
assert.equal(medicineCatalogSpecificationParts({
    category_name: 'Medicine',
    type_name: 'Tablet',
    specifications: [{ specification_name: 'Pack Content', value_number: '100', unit_symbol: 'tablet' }]
}).details, '100 tablets');

assert.deepEqual(formatMedicineSpecificationLines({
    category_name: 'Medicine',
    type_name: 'Cream',
    specifications: [
        { specification_name: 'Strength', value_number: '1', unit_symbol: '%' },
        { specification_name: 'Volume', value_number: '15', unit_symbol: 'g' },
        { specification_name: 'Package Type', value_text: 'Tube' },
        { specification_name: 'Flavor', value_text: null }
    ]
}), ['Cream • 1% • 15 g']);

assert.deepEqual(formatMedicineSpecificationLines({
    category_name: 'Medicine',
    type_name: 'Capsule',
    specifications: [
        { specification_name: 'Strength', value_number: '500', unit_symbol: 'mg' },
        { specification_name: 'Pack Content', value_number: '20', unit_symbol: 'capsule' },
        { specification_name: 'Package Type', value_text: 'Blister Pack' }
    ]
}), ['Capsule • 500 mg • 20 capsules']);

const grocery = {
    category_name: 'Grocery',
    type_name: 'Powder Drink',
    package_type: 'sachet',
    specifications: [
        { specification_name: 'Variant', value_text: 'Activ-Go' },
        { specification_name: 'Net Weight', value_number: '400', unit_symbol: 'g' },
        { specification_name: 'Package Type', value_text: 'Sachet' }
    ]
};
assert.deepEqual(formatProductCatalogSpecificationLines(grocery), ['Activ-Go • 400 g']);
assert.equal(formatProductContainer(grocery), 'Sachet');

const medicalSupply = {
    category_name: 'Medical Supplies',
    package_type: 'Box',
    specifications: [
        { specification_name: 'Variant', value_text: '3-Ply' },
        { specification_name: 'Pack Content', value_number: '50', unit_symbol: 'pcs' },
        { specification_name: 'Package Type', value_text: 'Box' }
    ]
};
assert.deepEqual(formatProductCatalogSpecificationLines(medicalSupply), ['3-Ply • 50 pcs']);
assert.equal(formatProductContainer(medicalSupply), 'Box');

console.log('Medicine Product Catalog UI tests passed.');
