import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pharma-frontend/js/modules/products.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../pharma-frontend/products.html', import.meta.url), 'utf8');

assert.doesNotMatch(source, /btn-add-dosage-form/, 'The external Add Dosage Form button is still rendered or handled.');
assert.match(source, /'\.medicine-sku-type'/, 'Dosage Form does not reuse the portal-based custom select component.');
assert.match(source, /data-action="add-dosage-form"/, 'The dropdown does not contain its internal Add New action.');
assert.match(source, /Add New Dosage Form\.\.\./, 'The internal dosage-form action label is missing.');
assert.match(source, /if \(optionButton\.dataset\.action === 'add-dosage-form'\)/, 'The internal action is not separated from selectable dosage-form values.');
assert.match(source, /closeMeasurementSelectMenu\(\);\s*void openProductTypeCustomizer\(\{ mode, sourceButton: select \}\)/, 'The dropdown does not close before opening the existing dosage-form modal.');
assert.match(source, /document\.body\.appendChild\(portal\)/, 'The custom dropdown is not portaled outside the scrolling modal.');
assert.match(source, /const spaceBelow = Math\.max\(0, viewportHeight - rect\.bottom - viewportMargin - triggerGap\)/, 'Available viewport space below is not calculated.');
assert.match(source, /const spaceAbove = Math\.max\(0, rect\.top - viewportMargin - triggerGap\)/, 'Available viewport space above is not calculated.');
assert.match(source, /const openUpward = spaceBelow < desiredHeight && spaceAbove > spaceBelow/, 'Upward/downward positioning does not use the actual desired menu height.');
assert.match(source, /const maxHeight = Math\.max\(0, Math\.min\(preferredMaxHeight, availableSpace\)\)/, 'Maximum height is not constrained to the chosen viewport space.');
assert.match(html, /\.measurement-select-menu \{[^}]*position:fixed;[^}]*z-index:1105;[^}]*overflow-y:auto;/, 'The portal menu is not fixed, scrollable, and above modal content.');
assert.match(html, /\.measurement-select-option\.is-add-dosage-form \{[^}]*position:sticky;[^}]*z-index:2;[^}]*bottom:0;/, 'The Add New action is not sticky at the bottom.');
assert.match(html, /\.dosage-form-control \{ width:100%; min-width:0; \}/, 'Dosage Form did not return to normal field width.');

const placementStart = source.indexOf('function calculateSelectMenuPlacement(');
const placementEnd = source.indexOf('\n}\n\nfunction openMeasurementSelectMenu', placementStart) + 2;
assert(placementStart >= 0 && placementEnd > placementStart, 'The menu-placement helper could not be inspected.');
const calculatePlacement = (0, eval)(`(${source.slice(placementStart, placementEnd)})`);
const trigger = { left: 262, width: 176, top: 490, bottom: 528 };
for (const [width, height, expectedDirection] of [[1366, 768, 'top'], [1536, 864, 'bottom'], [1920, 1080, 'bottom']]) {
    const placement = calculatePlacement(trigger, 700, width, height, true);
    assert.equal(placement.openUpward ? 'top' : 'bottom', expectedDirection, `${width}x${height} chose the wrong opening direction.`);
    assert(placement.maxHeight <= 280, `${width}x${height} exceeded the preferred maximum height.`);
    assert(placement.top >= 12 && placement.top + placement.maxHeight <= height - 12, `${width}x${height} allowed the menu outside the viewport.`);
    assert.equal(placement.width, trigger.width, `${width}x${height} did not retain the Dosage Form field width.`);
}

console.log('Dosage Form custom dropdown UI tests passed.');
