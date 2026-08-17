import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const products = await readFile(new URL('../pharma-frontend/js/modules/products.js', import.meta.url), 'utf8');
const suppliers = await readFile(new URL('../pharma-frontend/js/modules/suppliers.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../pharma-frontend/js/modules/measurement_units.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../pharma-frontend/products.html', import.meta.url), 'utf8');

assert.match(loader, /get_measurement_units\.php/);
assert.match(loader, /measurementUnitsForContext/);
assert.match(loader, /context = ''/);
assert.match(loader, /ACTIVE_SNAPSHOT_MAX_AGE_MS = 5000/);
assert.match(products, /loadMeasurementUnits/);
assert.doesNotMatch(products, /const refreshedUnits = await loadMeasurementUnits\(\{ forceRefresh: true \}\)/);
assert.match(products, /measurementUnitOptionList\('Volume'/);
assert.match(products, /measurementUnitOptionList\('Weight'/);
assert.doesNotMatch(products, /measurementUnitOptionList\(variation\.net_content_unit/);
assert.match(suppliers, /loadSharedMeasurementUnits/);
assert.doesNotMatch(products, /\['Weight', 'Volume', 'Strength', 'Count', 'Length', 'General Size'\]/);
assert.match(products, /Number\(unit\.is_active \?\? 1\) === 1/);
assert.match(products, /— archived/);
assert.match(products, /historicalUnitMatchesGroup/);
assert.match(products, /delete_measurement_unit\.php/);
assert.match(products, /delete-measurement-unit-option/);
assert.match(products, /measurementUnitSelectAll/);
assert.match(products, /btnDeleteSelectedMeasurementUnits/);
assert.match(products, /measurement_unit_ids/);
assert.match(products, /Number\(unit\.is_system \?\? 1\) === 0/);
assert.match(page, /#addMeasurementUnitModal \.modal-dialog \{ width:min\(800px,calc\(100vw - 24px\)\); height:min\(80vh,760px\); \}/);
assert.match(page, /#addMeasurementUnitModal \.customizer-list \{ flex:1 1 300px; min-height:220px; max-height:none; overflow:auto; \}/);
assert.match(page, /Delete Selected/);

console.log('Measurement unit UI integration tests passed.');
