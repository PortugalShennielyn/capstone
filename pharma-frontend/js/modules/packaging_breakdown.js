import { purchasingConversion } from './purchasing_conversion.js?v=2';

const key = value => String(value ?? '').trim().toLowerCase();
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

export function packagingUnits(units) {
    const unique = new Map();
    for (const unit of units || []) {
        if (Number(unit.is_active ?? 1) !== 1 || !['count','packaging'].includes(key(unit.measurement_group))) continue;
        if (!unique.has(key(unit.unit_name))) unique.set(key(unit.unit_name), unit);
    }
    return [...unique.values()];
}

export function validatePackaging(purchaseUnit, baseUnit, levels, units) {
    const available = new Set(packagingUnits(units).map(unit => key(unit.unit_name)));
    if (!available.has(key(purchaseUnit)) || !available.has(key(baseUnit))) return 'Select a Purchase Unit and configure the Product Base Unit.';
    if (!levels.length || key(levels.at(-1).unit) !== key(baseUnit)) return 'The packaging breakdown must end at the Product Base Unit.';
    if (key(purchaseUnit) === key(baseUnit)) return levels.length === 1 && Number(levels[0].quantity) === 1 ? '' : 'Buying by the Product Base Unit requires a 1-to-1 conversion.';
    const seen = new Set([key(purchaseUnit)]);
    let total = 1;
    for (const level of levels) {
        if (!available.has(key(level.unit))) return 'Select a unit for every packaging level.';
        if (seen.has(key(level.unit))) return 'Packaging units cannot repeat or form a circular chain.';
        seen.add(key(level.unit));
        const quantity = Number(level.quantity);
        if (!Number.isSafeInteger(quantity) || quantity <= 0) return 'Every packaging quantity must be a whole number greater than zero.';
        total *= quantity;
        if (total > 2147483647) return 'Converted packaging quantity exceeds the supported inventory limit.';
    }
    return '';
}

/** Shared assignment/edit editor; quantities belong to adjacent unit levels. */
export function createPackagingEditor(host, { units, purchaseUnit, baseUnit, levels = [], onChange = () => {} }) {
    let currentPurchase = purchaseUnit;
    let rows = levels.length ? levels.map(level => ({...level})) : [{unit:baseUnit,quantity:''}];
    const same = () => key(currentPurchase) === key(baseUnit);
    const read = () => same() ? [{unit:baseUnit,quantity:1}] : rows.map(level => ({unit:level.unit,quantity:level.quantity}));
    const error = () => validatePackaging(currentPurchase, baseUnit, read(), units);
    const options = selected => '<option value="">Select packaging unit…</option>' + packagingUnits(units).map(unit => `<option value="${esc(unit.unit_name)}" ${key(unit.unit_name)===key(selected)?'selected':''}>${esc(unit.unit_name)}</option>`).join('');
    function preview() {
        host.querySelectorAll('[data-parent-label]').forEach((label,index) => { label.textContent = `1 ${index ? rows[index-1].unit || 'packaging unit' : currentPurchase || 'Purchase Unit'} contains`; });
        const message = error();
        host.querySelector('[data-packaging-preview]').textContent = message || purchasingConversion({purchase_unit:currentPurchase,inventory_unit:baseUnit,hierarchy_levels:read()}).summary.replaceAll(' = ', ' → ');
        host.querySelector('[data-packaging-preview]').classList.toggle('text-danger', Boolean(message));
        onChange();
    }
    function render() {
        const visible = read();
        host.innerHTML = `<h6>Packaging Breakdown</h6>${visible.map((level,index) => `<div class="row g-2 align-items-end mb-2" data-packaging-row="${index}">
            <div class="col-12"><label data-parent-label></label></div>
            <div class="col-4"><input class="form-control" type="number" min="1" max="2147483647" step="1" data-level-qty value="${esc(level.quantity)}" aria-label="Quantity at packaging level ${index+1}" ${same()?'disabled':''}></div>
            <div class="col-6">${index===visible.length-1 ? `<input class="form-control" value="${esc(baseUnit)}" readonly aria-label="Product Base Unit">` : `<select class="form-select" data-level-unit aria-label="Unit at packaging level ${index+1}">${options(level.unit)}</select>`}</div>
            <div class="col-2">${index<visible.length-1 ? '<button type="button" class="btn btn-outline-danger" data-remove-level aria-label="Remove packaging level">×</button>':''}</div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary my-2" type="button" data-add-level ${same()?'disabled':''}>+ Add Packaging Level</button>
        <p class="small text-muted">Product Base Unit: ${esc(baseUnit)} · Defined in Product Master</p>
        <div class="assignment-preview" data-packaging-preview role="status" aria-live="polite"></div>`;
        preview();
    }
    host.oninput = event => {
        const row = event.target.closest('[data-packaging-row]');
        if (!row) return;
        const index = Number(row.dataset.packagingRow);
        if (event.target.matches('[data-level-qty]')) rows[index].quantity = event.target.value;
        if (event.target.matches('[data-level-unit]')) rows[index].unit = event.target.value;
        preview();
    };
    host.onchange = host.oninput;
    host.onclick = event => {
        if (event.target.closest('[data-add-level]')) { rows.splice(rows.length-1,0,{unit:'',quantity:''}); render(); }
        if (event.target.closest('[data-remove-level]')) { rows.splice(Number(event.target.closest('[data-packaging-row]').dataset.packagingRow),1); render(); }
    };
    render();
    return { read, error, setPurchaseUnit(value) { currentPurchase=value; render(); } };
}
