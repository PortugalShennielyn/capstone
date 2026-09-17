import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleSource = await readFile(new URL('../pharma-frontend/js/modules/product_specification.js', import.meta.url), 'utf8');
const specificationModule = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
const {
    formatMeasurementValue,
    formatProductSpecification,
    normalizeProductSpecificationValues
} = specificationModule;

for (const [stored, displayed] of [
    ['300.0000', '300'],
    ['400.0000', '400'],
    ['12.0000', '12'],
    ['3.5000', '3.5'],
    ['0.5000', '0.5'],
    ['10.2500', '10.25'],
    ['300', '300'],
    ['3.5', '3.5'],
    ['10.25', '10.25'],
    ['12345678901234567890.5000', '12345678901234567890.5']
]) {
    assert.equal(formatMeasurementValue(stored), displayed, `${stored} must display as ${displayed}`);
}
assert.equal(formatMeasurementValue('Lot 10.0000'), 'Lot 10.0000', 'Non-measurement text must not be changed');

const definitions = [
    { specification_id: 'flavor', specification_name: 'Flavor', display_name: 'Flavor', field_style: 'Selection List' },
    { specification_id: 'net-content', specification_name: 'Net Content', display_name: 'Net Content', field_style: 'Number with Unit', measurement_group: 'Volume' },
    { specification_id: 'inventory-unit', specification_name: 'Inventory Unit', display_name: 'Inventory Unit', field_style: 'Selection List' },
    { specification_id: 'tablet-count', specification_name: 'Tablet Count', display_name: 'Tablet Count', field_style: 'Number with Unit', measurement_group: 'Count' },
    { specification_id: 'custom-origin', specification_name: 'Origin', display_name: 'Country of Origin', field_style: 'Text' }
];
const units = [
    { measurement_unit_id: 'unit-ml', unit_name: 'Milliliter', unit_symbol: 'mL', measurement_group: 'Volume' },
    { measurement_unit_id: 'unit-pc', unit_name: 'Piece', unit_symbol: 'pc', measurement_group: 'Count' }
];
const saved = [
    { specification_id: 'flavor', value_text: 'Orange' },
    { specification_id: 'net-content', value_number: '500', unit_symbol: 'ml' },
    { specification_name: 'Inventory Unit', value_text: 'Bottle' },
    { specification_id: 'tablet-count', value_number: 20, measurement_unit_id: 'unit-pc' },
    { display_name: 'Country of Origin', value_text: 'Philippines' }
];

const decimalRestored = normalizeProductSpecificationValues(definitions, [
    { specification_id: 'net-content', value_number: '400.0000', measurement_unit_id: 'unit-ml' },
    { specification_id: 'tablet-count', value_number: '12.0000', measurement_unit_id: 'unit-pc' }
], units);
assert.equal(decimalRestored.find(value => value.specification_id === 'net-content').value_number, '400');
assert.equal(decimalRestored.find(value => value.specification_id === 'tablet-count').value_number, '12');
assert.equal(formatProductSpecification({ specifications: decimalRestored }), '400 mL • 12 pc');

const restored = normalizeProductSpecificationValues(definitions, saved, units);
const byId = new Map(restored.map(value => [value.specification_id, value]));

assert.equal(byId.get('flavor').value_text, 'Orange', 'Beverage flavor must be restored');
assert.equal(byId.get('net-content').value_number, '500', 'Net Content number must be restored');
assert.equal(byId.get('net-content').measurement_unit_id, 'unit-ml', 'Unit symbol must resolve after unit options load');
assert.equal(byId.get('net-content').unit_symbol, 'mL', 'Resolved unit symbols must remain available to Product Master formatting after an edit');
assert.equal(byId.get('inventory-unit').value_text, 'Bottle', 'Inventory Unit must restore by stable specification name fallback');
assert.equal(byId.get('tablet-count').value_number, '20', 'Tablet/count numeric values must not be dropped');
assert.equal(byId.get('tablet-count').measurement_unit_id, 'unit-pc', 'Saved measurement unit IDs must be retained');
assert.equal(byId.get('tablet-count').unit_symbol, 'pc', 'Count unit symbols must remain available to Product Master formatting after an edit');
assert.equal(byId.get('custom-origin').value_text, 'Philippines', 'Custom text specifications must restore by display label');

const crossGroup = normalizeProductSpecificationValues(
    [definitions[1]],
    [{ specification_id: 'net-content', value_number: '1', measurement_unit_id: 'unit-ampule', unit_symbol: 'ampule', measurement_group: 'Count' }],
    [...units, { measurement_unit_id: 'unit-ampule', unit_name: 'Ampule', unit_symbol: 'ampule', measurement_group: 'Count', is_active: 1 }]
);
assert.equal(crossGroup[0].measurement_unit_id, '', 'A Count unit must never be injected into a Volume field');

const archivedSameGroup = normalizeProductSpecificationValues(
    [definitions[1]],
    [{ specification_id: 'net-content', value_number: '1', measurement_unit_id: 'archived-volume', unit_symbol: 'tvu', measurement_group: 'Volume', measurement_unit_is_active: 0 }],
    units
);
assert.equal(archivedSameGroup[0].measurement_unit_id, 'archived-volume', 'The product historical archived unit must survive when its group matches');

const roundTrip = restored.map(value => ({
    specification_id: value.specification_id,
    value_text: value.value_text,
    value_number: value.value_number,
    measurement_unit_id: value.measurement_unit_id
}));
assert.deepEqual(
    roundTrip.filter(value => ['flavor', 'net-content', 'inventory-unit', 'tablet-count', 'custom-origin'].includes(value.specification_id)),
    [
        { specification_id: 'flavor', value_text: 'Orange', value_number: '', measurement_unit_id: '' },
        { specification_id: 'net-content', value_text: '', value_number: '500', measurement_unit_id: 'unit-ml' },
        { specification_id: 'inventory-unit', value_text: 'Bottle', value_number: '', measurement_unit_id: '' },
        { specification_id: 'tablet-count', value_text: '', value_number: '20', measurement_unit_id: 'unit-pc' },
        { specification_id: 'custom-origin', value_text: 'Philippines', value_number: '', measurement_unit_id: '' }
    ],
    'Collecting the hydrated fields without edits must preserve every saved value'
);

const editedDisplayDefinitions = [
    { specification_id: 'package', specification_name: 'Package Type', field_style: 'Selection List' },
    { specification_id: 'content', specification_name: 'Pack Content', field_style: 'Number with Unit', measurement_group: 'Count' },
    { specification_id: 'weight', specification_name: 'Net Weight', field_style: 'Number with Unit', measurement_group: 'Weight' }
];
const editedDisplayUnits = [
    { measurement_unit_id: 'bottle', unit_name: 'Bottle', unit_symbol: 'bottle', measurement_group: 'Count' },
    { measurement_unit_id: 'ml-weight', unit_name: 'mililiter', unit_symbol: 'ml', measurement_group: 'Weight' }
];
const editedDisplayValues = normalizeProductSpecificationValues(editedDisplayDefinitions, [
    { specification_id: 'package', value_text: 'Box' },
    { specification_id: 'content', value_number: '1', measurement_unit_id: 'bottle' },
    { specification_id: 'weight', value_number: '5', measurement_unit_id: 'ml-weight' }
], editedDisplayUnits);
assert.equal(
    formatProductSpecification({ specifications: editedDisplayValues }),
    'Box • 1 bottle • 5 mL',
    'A just-saved Product Master row must keep measurement-unit symbols instead of showing bare numbers'
);

console.log('Product edit specification restoration tests passed.');
