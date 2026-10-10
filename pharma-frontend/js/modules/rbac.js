const ACCESS_DENIED_MESSAGE = 'Access denied. Your account does not have permission to open this module.';

const ROLE_PAGE_ACCESS = Object.freeze({
    manager: new Set([
        'profile.html',
        'dashboard.html',
        'products.html',
        'inventory.html',
        'shelf_inventory.html',
        'supplier.html',
        'purchase_orders.html',
        'purchase_requests.html',
        'purchase_order_print.html',
        'purchase_request_print.html',
        'inspect_deliveries.html',
        'arrived_orders.html',
        'return_damage.html',
        'expiry_monitoring.html',
        'expiry_monitoring_advanced.html',
        'returns_disposals.html',
        'reports.html',
        'admin_settings.html',
        'sales_history.html',
        'cashier_shift_summary.html'
    ]),
    supervisor: new Set([
        'profile.html',
        'supervisor_dashboard.html',
        'products.html',
        'inventory.html',
        'shelf_inventory.html',
        'supplier.html',
        'purchase_orders.html',
        'purchase_requests.html',
        'purchase_order_print.html',
        'purchase_request_print.html',
        'return_damage.html',
        'expiry_monitoring.html',
        'expiry_monitoring_advanced.html',
        'returns_disposals.html',
        'reports.html',
        'supervisor_approval.html'
    ]),
    cashier: new Set([
        'profile.html',
        'cashier_dashboard.html',
        'cashier.html',
        'cashier_pos.html',
        'cashier_queue.html',
        'completed_sales.html',
        'cashier_transaction_history.html',
        'cancelled_sales.html',
        'receipt_history.html',
        'cashier_shift_summary.html',
        'cashier_profile.html',
        'reports.html'
    ]),
    salesclerk: new Set([
        'profile.html',
        'clerk.html',
        'sales_clerk_dashboard.html',
        'sales_clerk_pos.html',
        'sales_clerk_scan_pos.html',
        'sales_clerk_orders.html',
        'sales_clerk_reports.html',
        'inventory.html',
        'shelf_inventory.html'
    ])
});

const ROLE_NAV_ACCESS = Object.freeze({
    manager: new Set([
        'dashboard',
        'products',
        'inventory',
        'shelf-inventory',
        'supplier',
        'purchase-orders',
        'purchase-requests',
        'inspect-deliveries',
        'return-damage',
        'expiry-monitoring',
        'returns-disposals',
        'reports',
        'settings',
        'sales-history',
        'cashier-shift',
        'user-settings'
    ]),
    supervisor: new Set([
        'dashboard',
        'products',
        'inventory',
        'shelf-inventory',
        'supplier',
        'purchase-orders',
        'expiry-monitoring',
        'returns-disposals',
        'reports',
        'supervisor-approval',
        'user-settings'
    ]),
    cashier: new Set([
        'cashier-pos',
        'cashier-history',
        'cashier-shift',
        'cashier-profile',
        'reports',
        'user-settings'
    ]),
    salesclerk: new Set([
        'dashboard',
        'sales-clerk-pos',
        'sales-clerk-orders',
        'inventory',
        'shelf-inventory',
        'reports',
        'user-settings'
    ])
});

function normalizeRole(role) {
    return String(role || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
        .replace('sales_clerk', 'salesclerk')
        .replace(/^(manager[/_]owner|owner[/_]manager|manager_\/_owner)$/, 'manager');
}

function sessionRoleSet(session) {
    const roles = [
        session?.role,
        ...(Array.isArray(session?.roles) ? session.roles : []),
        ...(Array.isArray(session?.role_identifiers) ? session.role_identifiers : [])
    ];
    return new Set(roles.map(normalizeRole).filter(Boolean));
}

function primaryAccessRole(session) {
    // session.role is hydrated from users.role, assigned by Admin. Do not let
    // stale linked-role metadata override that canonical assignment.
    const assignedRole = normalizeRole(session?.role);
    if (['super_admin', 'admin', 'manager', 'supervisor', 'cashier', 'salesclerk'].includes(assignedRole)) {
        return assignedRole;
    }
    const roles = sessionRoleSet(session);
    if (roles.has('super_admin') || roles.has('ro_super_admin')) return 'super_admin';
    if (roles.has('admin') || roles.has('ro_admin')) return 'admin';
    if (roles.has('manager') || roles.has('ro_manager')) return 'manager';
    if (roles.has('supervisor') || roles.has('ro_supervisor')) return 'supervisor';
    if (roles.has('cashier') || roles.has('ro_cashier')) return 'cashier';
    if (roles.has('salesclerk') || roles.has('ro_sales_clerk')) return 'salesclerk';
    return '';
}

function dashboardPathForRole(session) {
    return {
        super_admin: 'dashboard.html',
        admin: 'dashboard.html',
        manager: 'dashboard.html',
        supervisor: 'supervisor_dashboard.html',
        cashier: 'cashier_dashboard.html',
        salesclerk: 'sales_clerk_dashboard.html'
    }[primaryAccessRole(session)] || '';
}

function roleLabel(session) {
    return {
        super_admin: 'Super Admin',
        admin: 'Admin',
        manager: 'Manager',
        supervisor: 'CEO',
        cashier: 'Cashier',
        salesclerk: 'Sales Clerk'
    }[primaryAccessRole(session)] || 'Account';
}

function isPageAllowed(session, filename) {
    const role = primaryAccessRole(session);
    if (filename === 'sales_clerk_dashboard.html' || filename === 'sales_clerk_reports.html') {
        return role === 'salesclerk';
    }
    if (filename === 'purchase_request_print.html' || filename === 'purchase_order_print.html') return Boolean(role);
    if (filename === 'supervisor_approval.html') return role === 'supervisor';
    if (role === 'super_admin' || role === 'admin') return true;
    return ROLE_PAGE_ACCESS[role]?.has(filename) || false;
}

function allowedNavigationPages(session) {
    const role = primaryAccessRole(session);
    if (role === 'super_admin' || role === 'admin') return '*';
    return ROLE_NAV_ACCESS[role] || new Set();
}

export {
    ACCESS_DENIED_MESSAGE,
    dashboardPathForRole,
    ROLE_NAV_ACCESS,
    ROLE_PAGE_ACCESS,
    allowedNavigationPages,
    isPageAllowed,
    normalizeRole,
    primaryAccessRole,
    roleLabel,
    sessionRoleSet
};
