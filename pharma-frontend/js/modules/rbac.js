const ACCESS_DENIED_MESSAGE = 'Access denied. Your account does not have permission to open this module.';

const ROLE_PAGE_ACCESS = Object.freeze({
    manager: new Set([
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
        'reports.html',
        'admin_settings.html',
<<<<<<< HEAD
        'user_settings.html',
=======
>>>>>>> 2ed0554fe1db566e6833390b8a9bc5cd726661b2
        'sales_history.html',
        'cashier_shift_summary.html'
    ]),
    supervisor: new Set([
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
        'reports.html',
<<<<<<< HEAD
        'supervisor_approval.html',
        'user_settings.html'
=======
        'supervisor_approval.html'
>>>>>>> 2ed0554fe1db566e6833390b8a9bc5cd726661b2
    ]),
    cashier: new Set([
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
<<<<<<< HEAD
        'reports.html',
        'user_settings.html'
=======
        'reports.html'
>>>>>>> 2ed0554fe1db566e6833390b8a9bc5cd726661b2
    ]),
    salesclerk: new Set([
        'clerk.html',
        'sales_clerk_pos.html',
        'sales_clerk_orders.html',
<<<<<<< HEAD
        'reports.html',
        'user_settings.html'
=======
        'reports.html'
>>>>>>> 2ed0554fe1db566e6833390b8a9bc5cd726661b2
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
        'sales-clerk-pos',
        'sales-clerk-orders',
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
    const roles = sessionRoleSet(session);
    if (roles.has('super_admin') || roles.has('ro_super_admin')) return 'super_admin';
    if (roles.has('admin') || roles.has('ro_admin')) return 'admin';
    if (roles.has('manager') || roles.has('ro_manager')) return 'manager';
    if (roles.has('supervisor') || roles.has('ro_supervisor')) return 'supervisor';
    if (roles.has('cashier') || roles.has('ro_cashier')) return 'cashier';
    if (roles.has('salesclerk') || roles.has('ro_sales_clerk')) return 'salesclerk';
    return '';
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
    ROLE_NAV_ACCESS,
    ROLE_PAGE_ACCESS,
    allowedNavigationPages,
    isPageAllowed,
    normalizeRole,
    primaryAccessRole,
    roleLabel,
    sessionRoleSet
};
