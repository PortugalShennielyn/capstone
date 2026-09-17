import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeProductSpecificationValues, formatMeasurement, formatProductSpecification } from '../pharma-frontend/js/modules/product_specification.js';
import { purchasingConversion, purchasingCost, inventoryQuantityFromPurchase } from '../pharma-frontend/js/modules/purchasing_conversion.js';

const units = [
    { measurement_unit_id: 'ml', unit_name: 'Milliliter', unit_symbol: 'mL', measurement_group: 'Volume', is_active: 1 },
    { measurement_unit_id: 'g', unit_name: 'Gram', unit_symbol: 'g', measurement_group: 'Weight', is_active: 1 }
];
const netContent = normalizeProductSpecificationValues(
    [{ specification_id: 'net', specification_name: 'Net Content', field_style: 'Number with Unit', measurement_group: 'Volume' }],
    [{ specification_id: 'net', value_number: '250', measurement_unit_id: 'ml', unit_symbol: 'mL' }],
    units
)[0];
assert.equal(`${netContent.value_number} ${units.find(unit => unit.measurement_unit_id === netContent.measurement_unit_id).unit_symbol}`, '250 mL');

const weight = normalizeProductSpecificationValues(
    [{ specification_id: 'weight', specification_name: 'Net Weight', field_style: 'Number with Unit', measurement_group: 'Weight' }],
    [{ specification_id: 'weight', value_number: '350', measurement_unit_id: 'g', unit_symbol: 'g' }],
    units
)[0];
assert.equal(formatMeasurement(weight.value_number, weight.unit_symbol), '350 g');

assert.equal(formatProductSpecification({
    category_name: 'Medicine',
    type_name: 'Powder for Suspension',
    specifications: [
        { specification_name: 'Strength', value_number: '250.0000', unit_symbol: 'mg' },
        { specification_name: 'Strength Denominator', value_number: '5.0000', unit_symbol: 'mL' },
        { specification_name: 'Volume', value_number: '60.0000', unit_symbol: 'mL' },
        { specification_name: 'Package Type', value_text: 'Bottle' },
    ],
}), '250 mg/5 mL • Powder for Suspension • 60 mL');

const carton = purchasingConversion({ purchase_unit: 'Carton', purchase_unit_contains: 24, inventory_unit: 'Bottles' });
assert.equal(carton.summary, '1 Carton = 24 Bottles');

const stab = purchasingConversion({ purchase_unit: 'Box', purchase_unit_contains: 10, inventory_unit: 'Stabs' });
assert.equal(stab.summary, '1 Box = 10 Stabs');

const tablet = purchasingConversion({ purchase_unit: 'Box', purchase_unit_contains: 10, inner_unit: 'Stabs', units_per_inner_unit: 10, inventory_unit: 'Tablets' });
assert.equal(tablet.summary, '1 Box = 10 Stabs = 100 Tablets');
assert.equal(inventoryQuantityFromPurchase(3, tablet), 300);

assert.equal(purchasingCost({ supplier_cost_input: 500, supplier_cost_basis: 'purchase' }, tablet).purchaseCost, 500);
assert.equal(purchasingCost({ supplier_cost_input: 50, supplier_cost_basis: 'inner' }, tablet).purchaseCost, 500);
assert.equal(purchasingCost({ supplier_cost_input: 5, supplier_cost_basis: 'inventory' }, tablet).purchaseCost, 500);

const boxPackStab = purchasingConversion({ purchase_unit: 'Box', purchase_unit_contains: 10, inner_unit: 'Pack', units_per_inner_unit: 10, inventory_unit: 'Stab' });
assert.equal(boxPackStab.summary, '1 Box = 10 Packs = 100 Stabs');
const boxPurchaseCost = purchasingCost({ supplier_cost_input: 500, supplier_cost_basis: 'purchase' }, boxPackStab);
assert.equal(boxPurchaseCost.purchaseCost, 500);
assert.equal(500 / boxPackStab.contains, 50);
assert.equal(boxPurchaseCost.baseCost, 5);
assert.equal(inventoryQuantityFromPurchase(3, boxPackStab), 300);

const supplierSource = await readFile(new URL('../pharma-frontend/js/modules/suppliers.js', import.meta.url), 'utf8');
const assignmentSource = await readFile(new URL('../pharma-frontend/js/modules/supplier_product_assignment.js', import.meta.url), 'utf8');
const loaderSource = await readFile(new URL('../pharma-frontend/js/modules/measurement_units.js', import.meta.url), 'utf8');
assert.match(supplierSource, /numericSaved/);
assert.match(supplierSource, /select\.value = numericSaved \? ''/);
assert.match(supplierSource, /supplier_cost_basis: 'purchase'/);
assert.match(supplierSource, /updateSupplierHierarchyLabels/);
assert.match(loaderSource, /new Set\(\['count','packaging'\]\)/);
assert.doesNotMatch(loaderSource, /const .*UNIT.*=.*\[/);
assert.match(assignmentSource, /measurementUnitsForContext/);
assert.doesNotMatch(assignmentSource, /const PURCHASE_UNITS/);
assert.doesNotMatch(assignmentSource, /supplierInventoryUnitOptions/);

console.log('Final Product Master and supplier unit model tests passed.');
