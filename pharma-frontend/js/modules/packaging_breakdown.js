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

/** Shared assignment editor; quantities belong to adjacent unit levels. */
export function createPackagingEditor(host, { units, purchaseUnit, baseUnit, levels = [], onChange = () => {} }) {
    let currentPurchase = purchaseUnit;
    let rows = levels.length ? levels.map(level => ({...level})) : [{unit:baseUnit,quantity:''}];
    let manual = key(purchaseUnit) !== key(baseUnit) || rows.length > 1;
    const same = () => !manual && key(currentPurchase) === key(baseUnit);
    const read = () => same() ? [{unit:baseUnit,quantity:1}] : rows.map(level => ({unit:level.unit,quantity:level.quantity}));
    const error = () => validatePackaging(currentPurchase, baseUnit, read(), units);
    const options = selected => '<option value="">Select packaging unit…</option>' + packagingUnits(units).map(unit => `<option value="${esc(unit.unit_name)}" ${key(unit.unit_name)===key(selected)?'selected':''}>${esc(unit.unit_name)}</option>`).join('');
    function preview() {
        const visible = read();
        host.querySelectorAll('[data-parent-label]').forEach((label,index) => {
            const parent = index ? (visible[index - 1]?.unit || 'packaging unit') : (currentPurchase || 'Purchase Unit');
            label.textContent = `1 ${parent} contains`;
        });
        const message = error();
        const previewNode = host.querySelector('[data-packaging-preview]');
        if (previewNode) {
            previewNode.textContent = message || purchasingConversion({purchase_unit:currentPurchase,inventory_unit:baseUnit,hierarchy_levels:read()}).summary.replaceAll(' = ', ' → ');
            previewNode.classList.toggle('text-danger', Boolean(message));
        }
        onChange();
    }
    function render() {
        const visible = read();
        host.innerHTML = `<h6>Packaging Breakdown</h6>${visible.map((level,index) => `<div class="packaging-level" data-packaging-row="${index}">
            <label data-parent-label></label>
            <div class="packaging-level-controls">
                <input class="form-control" type="number" min="1" max="2147483647" step="1" data-level-qty value="${esc(level.quantity)}" aria-label="Quantity at packaging level ${index+1}" ${same()?'disabled':''}>
                ${index===visible.length-1 ? `<input class="form-control" value="${esc(baseUnit)}" readonly aria-label="Product Base Unit">` : `<select class="form-select" data-level-unit aria-label="Unit at packaging level ${index+1}">${options(level.unit)}</select>`}
                ${index<visible.length-1 ? '<button type="button" class="btn btn-outline-danger" data-remove-level aria-label="Remove packaging level">×</button>':''}
            </div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary" type="button" data-add-level>+ Add Packaging Level</button>
        <p class="small text-muted">Product Base Unit: ${esc(baseUnit)} · Defined in Product Master</p>
        <div class="assignment-preview" data-packaging-preview role="status" aria-live="polite"></div>`;
        preview();
    }
    host.oninput = event => {
        const row = event.target.closest('[data-packaging-row]');
        if (!row || same()) return;
        const index = Number(row.dataset.packagingRow);
        if (!rows[index]) return;
        if (event.target.matches('[data-level-qty]')) rows[index].quantity = event.target.value;
        if (event.target.matches('[data-level-unit]')) rows[index].unit = event.target.value;
        preview();
    };
    host.onchange = host.oninput;
    host.onclick = event => {
        if (event.target.closest('[data-add-level]')) {
            event.preventDefault();
            const current = read().map(level => ({...level}));
            current.splice(Math.max(current.length - 1, 0), 0, {unit:'', quantity:''});
            rows = current;
            manual = true;
            render();
            return;
        }
        if (event.target.closest('[data-remove-level]')) {
            event.preventDefault();
            const current = read().map(level => ({...level}));
            current.splice(Number(event.target.closest('[data-packaging-row]').dataset.packagingRow), 1);
            rows = current.length ? current : [{unit:baseUnit, quantity:1}];
            manual = !(rows.length === 1 && key(currentPurchase) === key(baseUnit));
            render();
        }
    };
    render();
    return {
        read,
        error,
        setPurchaseUnit(value) {
            currentPurchase = value;
            if (key(value) === key(baseUnit)) {
                manual = false;
                rows = [{unit:baseUnit, quantity:1}];
            } else if (!manual) {
                rows = [{unit:baseUnit, quantity:''}];
            }
            render();
        }
    };
}
