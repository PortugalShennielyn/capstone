import API_BASE_URL from '../config/config.js';
import PharmaUtils from '../utils.js';

let activeSnapshot = null;
let activeRequest = null;
let activeSnapshotLoadedAt = 0;
const ACTIVE_SNAPSHOT_MAX_AGE_MS = 5000;

function normalized(value) {
    return String(value || '').trim().toLowerCase();
}

export function measurementUnitsForContext(units, { group = '', context = '' } = {}) {
    const active = (Array.isArray(units) ? units : []).filter(unit => Number(unit.is_active ?? 1) === 1);
    if (group) return active.filter(unit => normalized(unit.measurement_group) === normalized(group));
    if (!context) return active;
    const allowedGroups = context === 'inventory' ? new Set(['count']) : new Set(['count','packaging']);
    return active.filter(unit => allowedGroups.has(normalized(unit.measurement_group)));
}

function normalizeSnapshot(response = {}) {
    return {
        units: Array.isArray(response.units) ? response.units : [],
        measurement_groups: Array.isArray(response.measurement_groups) ? response.measurement_groups : []
    };
}

export async function loadMeasurementUnits({ forceRefresh = false, includeInactive = false } = {}) {
    const activeSnapshotIsFresh = activeSnapshot && (Date.now() - activeSnapshotLoadedAt) < ACTIVE_SNAPSHOT_MAX_AGE_MS;
    if (!includeInactive && !forceRefresh && activeSnapshotIsFresh) return activeSnapshot;
    if (!includeInactive && !forceRefresh && activeRequest) return activeRequest;

    const query = includeInactive ? '?include_inactive=1' : '';
    const request = PharmaUtils.safeFetch(`${API_BASE_URL}/products/get_measurement_units.php${query}`, {
        method: 'GET',
        credentials: 'include'
    }).then(normalizeSnapshot);

    if (includeInactive) return request;
    activeRequest = request;
    try {
        activeSnapshot = await request;
        activeSnapshotLoadedAt = Date.now();
        return activeSnapshot;
    } finally {
        activeRequest = null;
    }
}

export function upsertMeasurementUnitCache(unit) {
    if (!activeSnapshot || !unit) return;
    const byId = new Map(activeSnapshot.units.map(item => [String(item.measurement_unit_id), item]));
    byId.set(String(unit.measurement_unit_id), unit);
    activeSnapshot.units = [...byId.values()].filter(item => Number(item.is_active ?? 1) === 1);
    activeSnapshot.measurement_groups = [...new Set(activeSnapshot.units.map(item => item.measurement_group).filter(Boolean))].sort();
    activeSnapshotLoadedAt = Date.now();
}

export function archiveMeasurementUnitCache(unitId) {
    if (!activeSnapshot) return;
    activeSnapshot.units = activeSnapshot.units.filter(item => String(item.measurement_unit_id) !== String(unitId));
    activeSnapshot.measurement_groups = [...new Set(activeSnapshot.units.map(item => item.measurement_group).filter(Boolean))].sort();
    activeSnapshotLoadedAt = Date.now();
}

export function invalidateMeasurementUnitCache() {
    activeSnapshot = null;
    activeRequest = null;
    activeSnapshotLoadedAt = 0;
}
