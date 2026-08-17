export function purchasingConversion(setup = {}) {
    const purchaseUnit = String(setup.purchase_unit || 'Unit').trim() || 'Unit';
    const inventoryUnit = String(setup.inventory_unit || 'unit').trim() || 'unit';
    const innerUnit = String(setup.inner_unit || '').trim();
    const submittedLevels = Array.isArray(setup.hierarchy_levels) ? setup.hierarchy_levels : [];
    if (submittedLevels.length) {
        if (purchaseUnit.toLowerCase() === inventoryUnit.toLowerCase()) {
            return { purchaseUnit, contains: 1, innerUnit: '', unitsPerInner: 1, inventoryUnit, baseQtyPerPurchaseUnit: 1, hierarchyLevels: [{ unit: inventoryUnit, quantity: 1, cumulativeQuantity: 1 }], summary: `1 ${purchaseUnit} = 1 ${inventoryUnit}` };
        }
        let running = 1;
        const levels = submittedLevels.map(level => {
            const quantity = Math.max(1, Number(level.quantity || 1));
            running *= quantity;
            return { unit: String(level.unit || '').trim(), quantity, cumulativeQuantity: running };
        });
        const first = levels[0] || { unit: inventoryUnit, quantity: running };
        const quantityUnit = (unit, quantity) => quantity === 1 || !unit || /s$/i.test(unit) ? unit : (/(?:s|x|z|ch|sh)$/i.test(unit) ? `${unit}es` : `${unit}s`);
        const displayQuantity = quantity => Number(quantity).toLocaleString('en-US', { maximumFractionDigits: 0 });
        return {
            purchaseUnit, contains: first.quantity, innerUnit: levels.length > 1 ? first.unit : '',
            unitsPerInner: levels.length > 1 ? running / first.quantity : 1,
            inventoryUnit, baseQtyPerPurchaseUnit: running, hierarchyLevels: levels,
            summary: [`1 ${purchaseUnit}`, ...levels.map(level => `${displayQuantity(level.cumulativeQuantity)} ${quantityUnit(level.unit, level.cumulativeQuantity)}`)].join(' = ')
        };
    }
    const legacyTotal = Math.max(1, Number(setup.units_per_purchase_unit || 1));
    const hasExplicitContains = Number(setup.purchase_unit_contains) > 0;
    const contains = hasExplicitContains ? Math.max(1, Number(setup.purchase_unit_contains)) : legacyTotal;
    const unitsPerInner = innerUnit ? Math.max(1, Number(setup.units_per_inner_unit || 1)) : 1;
    const baseQtyPerPurchaseUnit = hasExplicitContains ? contains * unitsPerInner : legacyTotal;
    const quantityUnit = (unit, quantity) => quantity === 1 || !unit || /s$/i.test(unit) ? unit : (/(?:s|x|z|ch|sh)$/i.test(unit) ? `${unit}es` : `${unit}s`);
    return {
        purchaseUnit, contains, innerUnit, unitsPerInner, inventoryUnit, baseQtyPerPurchaseUnit,
        summary: innerUnit
            ? `1 ${purchaseUnit} = ${contains} ${quantityUnit(innerUnit, contains)} = ${baseQtyPerPurchaseUnit} ${quantityUnit(inventoryUnit, baseQtyPerPurchaseUnit)}`
            : `1 ${purchaseUnit} = ${baseQtyPerPurchaseUnit} ${quantityUnit(inventoryUnit, baseQtyPerPurchaseUnit)}`
    };
}

export function purchasingCost(setup = {}, conversion = purchasingConversion(setup)) {
    let basis = String(setup.supplier_cost_basis || 'inventory').trim().toLowerCase();
    if (!['purchase', 'inner', 'inventory'].includes(basis) || (basis === 'inner' && !conversion.innerUnit)) basis = 'inventory';
    const input = Math.max(0, Number(setup.supplier_cost_input ?? setup.supplier_cost_price ?? 0));
    const baseCost = basis === 'purchase' ? input / conversion.baseQtyPerPurchaseUnit : (basis === 'inner' ? input / conversion.unitsPerInner : input);
    return { basis, input, baseCost, purchaseCost: baseCost * conversion.baseQtyPerPurchaseUnit };
}

export function inventoryQuantityFromPurchase(purchaseQuantity, setup = {}) {
    const multiplier = Number(setup.baseQtyPerPurchaseUnit || purchasingConversion(setup).baseQtyPerPurchaseUnit);
    return Number(purchaseQuantity || 0) * multiplier;
}
