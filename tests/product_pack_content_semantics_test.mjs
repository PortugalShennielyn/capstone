import assert from 'node:assert/strict';
import { formatProductSpecification } from '../pharma-frontend/js/modules/product_specification.js';
import { inventoryQuantityFromPurchase, purchasingConversion } from '../pharma-frontend/js/modules/purchasing_conversion.js';

const newborn = {
    inventory_unit_name: 'Pack',
    inventory_unit_symbol: 'pack',
    specifications: [
        { specification_name: 'Variant', value_text: 'New Born' },
        { specification_name: 'Pack Content', value_number: '44.0000', unit_name: 'pcs', unit_symbol: 'pcs' }
    ]
};
assert.equal(formatProductSpecification(newborn), 'New Born • 44 pcs/pack');

const loosePieces = {
    inventory_unit_name: 'pcs',
    inventory_unit_symbol: 'pcs',
    specifications: [
        { specification_name: 'Variant', value_text: 'Small' },
        { specification_name: 'Pack Content', value_number: '4', unit_symbol: 'pcs' }
    ]
};
assert.equal(formatProductSpecification(loosePieces), 'Small • 4 pcs');

const weightedPack = {
    inventory_unit_name: 'Pack',
    specifications: [
        { specification_name: 'Variant', value_text: 'Family' },
        { specification_name: 'Net Weight', value_number: '250', unit_symbol: 'g' }
    ]
};
assert.equal(formatProductSpecification(weightedPack), 'Family • 250 g');

const boxOfPacks = purchasingConversion({
    purchase_unit: 'Box',
    purchase_unit_contains: 12,
    inventory_unit: 'Pack'
});
assert.equal(boxOfPacks.summary, '1 Box = 12 Packs');
assert.equal(inventoryQuantityFromPurchase(2, boxOfPacks), 24);

console.log('Product Pack Content and Selling / Inventory Unit semantics test passed.');
