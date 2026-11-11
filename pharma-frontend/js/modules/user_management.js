import API_BASE_URL from '../config/config.js?v=2';

const state = { users: [], editingUser: null, actorRole: '', assignableRoles: [], pendingStatus: null };
const roleLabels = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    supervisor: 'Inventory Manager',
    cashier: 'Cashier',
    salesclerk: 'Sales Clerk'
};
const creatableRoles = ['cashier', 'salesclerk', 'supervisor'];

const els = {
    total: document.getElementById('totalUsersCard'),
    active: document.getElementById('activeUsersCard'),
    inactive: document.getElementById('inactiveUsersCard'),
    search: document.getElementById('userSearchInput'),
    role: document.getElementById('userRoleFilter'),
    status: document.getElementById('userStatusFilter'),
    add: document.getElementById('addUserBtn'),
    body: document.getElementById('usersTableBody'),
    form: document.getElementById('userForm'),
    formTitle: document.getElementById('userFormTitle'),
    error: document.getElementById('userFormError'),
    userId: document.getElementById('userIdInput'),
    fullName: document.getElementById('fullNameInput'),
    username: document.getElementById('usernameInput'),
    password: document.getElementById('tempPasswordInput'),
    confirm: document.getElementById('confirmPasswordInput'),
    roleInput: document.getElementById('roleInput'),
    statusInput: document.getElementById('statusInput'),
    email: document.getElementById('emailInput'),
    contact: document.getElementById('contactNumberInput'),
    detailsBody: document.getElementById('userDetailsBody'),
    statusTitle: document.getElementById('userStatusTitle'),
    statusMessage: document.getElementById('userStatusMessage'),
    statusConfirm: document.getElementById('userStatusConfirm')
};

const modals = {
    form: document.getElementById('userFormModal') && window.bootstrap ? new bootstrap.Modal(document.getElementById('userFormModal')) : null,
    details: document.getElementById('userDetailsModal') && window.bootstrap ? new bootstrap.Modal(document.getElementById('userDetailsModal')) : null,
    status: document.getElementById('userStatusModal') && window.bootstrap ? new bootstrap.Modal(document.getElementById('userStatusModal')) : null
};

if (window.toastr) {
    toastr.options = {
        closeButton: true,
        progressBar: true,
        positionClass: 'toast-bottom-right',
        timeOut: '2600'
    };
}

function announceUserListChange() {
    try { localStorage.setItem('pharmacy-user-list-updated', String(Date.now())); } catch (error) {}
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function formatDate(value) {
    if (!value) return 'Never';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime())
        ? String(value)
        : date.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function setError(target, message = '') {
    if (!target) return;
    target.textContent = message;
    target.classList.toggle('is-visible', Boolean(message));
}

function renderRoleSelect(user = null) {
    const roles = [];
    if (user && ['admin', 'super_admin'].includes(user.role)) roles.push(user.role);
    const assignable = state.assignableRoles.length ? state.assignableRoles : creatableRoles;
    assignable.forEach(role => {
        if (creatableRoles.includes(role) && !roles.includes(role)) roles.push(role);
    });
    const roleOptions = ['<option value="">Select role</option>']
        .concat(roles.map(role => `<option value="${escapeHtml(role)}">${escapeHtml(roleLabels[role] || role)}</option>`));
    if (els.roleInput) els.roleInput.innerHTML = roleOptions.join('');
}

function configureRoleOptions(permissions = {}) {
    state.actorRole = permissions.actor_role || '';
    state.assignableRoles = Array.isArray(permissions.assignable_roles)
        ? permissions.assignable_roles.filter(role => creatableRoles.includes(role))
        : creatableRoles.slice();
    if (!state.editingUser) renderRoleSelect();
}

async function userRequest(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}/users/${path}`, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Tab-Token': sessionStorage.getItem('pharma_tab_token') || '',
            ...(options.headers || {})
        },
        ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Unable to process user request.');
    }
    return data;
}

function isProtectedAdmin(user) {
    return user?.role === 'admin';
}

function filteredUsers() {
    const q = (els.search?.value || '').trim().toLowerCase();
    const role = els.role?.value || '';
    const status = els.status?.value || '';
    return state.users.filter(user => {
        const text = `${user.full_name || ''} ${user.username || ''} ${roleLabels[user.role] || user.role || ''}`.toLowerCase();
        return (!q || text.includes(q))
            && (!role || user.role === role)
            && (!status || user.status === status);
    }).sort((left, right) => Number(isProtectedAdmin(right)) - Number(isProtectedAdmin(left)));
}

function syncAdminStatusLock() {
    const statusSelect = els.statusInput;
    if (!statusSelect) return;
    const existingUser = findUser(els.userId?.value);
    const adminSelected = els.roleInput?.value === 'admin' || isProtectedAdmin(existingUser);
    const inactiveOption = statusSelect.querySelector('option[value="Inactive"]');
    if (inactiveOption) inactiveOption.disabled = adminSelected;
    if (adminSelected) statusSelect.value = 'Active';
}

function renderUsers() {
    const users = filteredUsers();
    if (!els.body) return;
    if (!users.length) {
        els.body.innerHTML = '<tr><td class="empty-row" colspan="7">No users found.</td></tr>';
        return;
    }
    els.body.innerHTML = users.map(user => {
        const statusClass = String(user.status || '').toLowerCase();
        const nextStatus = user.status === 'Active' ? 'Inactive' : 'Active';
        const nextLabel = nextStatus === 'Active' ? 'Activate' : 'Deactivate';
        const roleClass = String(user.role || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
        const actionClass = nextStatus === 'Active' ? 'btn-outline-success' : 'btn-outline-danger';
        const statusButton = isProtectedAdmin(user) && nextStatus === 'Inactive'
            ? ''
            : `<button class="btn ${actionClass}" type="button" data-user-action="toggle" data-user-id="${escapeHtml(user.user_id)}" data-next-status="${nextStatus}">${nextLabel}</button>`;
        return `
            <tr>
                <td data-label="Full Name"><strong>${escapeHtml(user.full_name || '-')}</strong></td>
                <td data-label="Username">${escapeHtml(user.username || '-')}</td>
                <td data-label="Role"><span class="user-role-badge role-${roleClass}">${escapeHtml(roleLabels[user.role] || user.role || '-')}</span></td>
                <td data-label="Status"><span class="user-status-badge ${statusClass}">${escapeHtml(user.status || '-')}</span></td>
                <td data-label="Last Login">${escapeHtml(formatDate(user.last_login))}</td>
                <td data-label="Created Date">${escapeHtml(formatDate(user.created_at))}</td>
                <td data-label="Actions">
                    <div class="user-actions">
                        <button class="btn btn-light" type="button" data-user-action="view" data-user-id="${escapeHtml(user.user_id)}">View</button>
                        <button class="btn btn-light" type="button" data-user-action="edit" data-user-id="${escapeHtml(user.user_id)}">Edit</button>
                        ${statusButton}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadUsers() {
    try {
        const data = await userRequest('fetch_users.php');
        state.users = data.data?.users || [];
        configureRoleOptions(data.data?.permissions || {});
        const summary = data.data?.summary || {};
        if (els.total) els.total.textContent = summary.total_users ?? state.users.length;
        if (els.active) els.active.textContent = summary.active_users ?? state.users.filter(user => user.status === 'Active').length;
        if (els.inactive) els.inactive.textContent = summary.inactive_users ?? state.users.filter(user => user.status === 'Inactive').length;
        renderUsers();
    } catch (error) {
        if (els.body) els.body.innerHTML = `<tr><td class="empty-row" colspan="7">${escapeHtml(error.message || 'Unable to load users.')}</td></tr>`;
    }
}

function findUser(userId) {
    return state.users.find(user => user.user_id === userId);
}

function openUserForm(user = null) {
    state.editingUser = user;
    setError(els.error);
    els.form?.reset();
    renderRoleSelect(user);
    els.userId.value = user?.user_id || '';
    els.fullName.value = user?.full_name || '';
    els.username.value = user?.username || '';
    els.roleInput.value = user?.role || '';
    els.statusInput.value = user?.status || 'Active';
    els.email.value = user?.email || '';
    els.contact.value = user?.contact_number || '';
    const activeSupervisor = state.users.find(candidate => candidate.role === 'supervisor' && candidate.status === 'Active' && candidate.user_id !== user?.user_id);
    const supervisorOption = els.roleInput?.querySelector('option[value="supervisor"]');
    if (supervisorOption) {
        supervisorOption.disabled = Boolean(activeSupervisor);
        supervisorOption.textContent = activeSupervisor ? 'Inventory Manager (active account already exists)' : 'Inventory Manager';
    }
    document.querySelectorAll('.password-field').forEach(field => field.classList.toggle('d-none', Boolean(user)));
    syncAdminStatusLock();
    if (els.formTitle) els.formTitle.textContent = user ? 'Edit User' : 'Add User';
    modals.form?.show();
}

function openDetails(user) {
    if (!user || !els.detailsBody) return;
    const rows = [
        ['Full Name', user.full_name],
        ['Username', user.username],
        ['Role', roleLabels[user.role] || user.role],
        ['Status', user.status],
        ['Email', user.email || 'Not provided'],
        ['Contact Number', user.contact_number || 'Not provided'],
        ['Last Login', formatDate(user.last_login)],
        ['Created Date', formatDate(user.created_at)]
    ];
    els.detailsBody.innerHTML = rows.map(([label, value]) => `
        <div class="user-detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '-')}</strong></div>
    `).join('');
    modals.details?.show();
}

function openStatusConfirm(user, nextStatus) {
    if (!user || (isProtectedAdmin(user) && nextStatus === 'Inactive')) return;
    state.pendingStatus = { userId: user.user_id, nextStatus };
    const activating = nextStatus === 'Active';
    const name = user.full_name || user.username || 'this user';
    if (els.statusTitle) els.statusTitle.textContent = activating ? 'Activate account' : 'Deactivate account';
    if (els.statusMessage) {
        els.statusMessage.textContent = activating
            ? `Activate ${name}? This account will be able to sign in again.`
            : `Deactivate ${name}? This account will stay on file and will not be able to sign in until it is activated again.`;
    }
    if (els.statusConfirm) {
        els.statusConfirm.textContent = activating ? 'Activate' : 'Deactivate';
        els.statusConfirm.classList.toggle('btn-success', activating);
        els.statusConfirm.classList.toggle('btn-danger', !activating);
        els.statusConfirm.disabled = false;
    }
    modals.status?.show();
}

els.roleInput?.addEventListener('change', syncAdminStatusLock);
els.add?.addEventListener('click', () => openUserForm());
[els.search, els.role, els.status].forEach(control => {
    control?.addEventListener('input', renderUsers);
    control?.addEventListener('change', renderUsers);
});
els.body?.addEventListener('click', event => {
    const button = event.target.closest('[data-user-action]');
    if (!button) return;
    const user = findUser(button.dataset.userId);
    if (!user) return;
    if (button.dataset.userAction === 'view') openDetails(user);
    if (button.dataset.userAction === 'edit') openUserForm(user);
    if (button.dataset.userAction === 'toggle') openStatusConfirm(user, button.dataset.nextStatus);
});
els.statusConfirm?.addEventListener('click', async () => {
    const pending = state.pendingStatus;
    if (!pending || !els.statusConfirm) return;
    els.statusConfirm.disabled = true;
    try {
        await userRequest('toggle_user_status.php', {
            method: 'POST',
            body: JSON.stringify({ user_id: pending.userId, status: pending.nextStatus })
        });
        announceUserListChange();
        toastr.success(pending.nextStatus === 'Active' ? 'User activated.' : 'User deactivated.');
        state.pendingStatus = null;
        modals.status?.hide();
        await loadUsers();
    } catch (error) {
        toastr.error(error.message || 'Unable to update status.');
        els.statusConfirm.disabled = false;
    }
});
els.form?.addEventListener('submit', async event => {
    event.preventDefault();
    setError(els.error);
    const isEdit = Boolean(els.userId.value);
    const payload = {
        user_id: els.userId.value,
        full_name: els.fullName.value.trim(),
        username: els.username.value.trim(),
        password: els.password.value,
        confirm_password: els.confirm.value,
        role: els.roleInput.value,
        status: els.statusInput.value,
        email: els.email.value.trim(),
        contact_number: els.contact.value.trim()
    };
    if (!payload.full_name) return setError(els.error, 'Full Name is required.');
    if (!payload.username) return setError(els.error, 'Username is required.');
    if (!payload.role) return setError(els.error, 'Role is required.');
    const anotherActiveSupervisor = state.users.some(user => user.role === 'supervisor' && user.status === 'Active' && user.user_id !== payload.user_id);
    if (payload.role === 'supervisor' && payload.status === 'Active' && anotherActiveSupervisor) {
        return setError(els.error, 'Only one active Inventory Manager account is allowed.');
    }
    const anotherSuperAdmin = state.users.some(user => user.role === 'super_admin' && user.user_id !== payload.user_id);
    if (payload.role === 'super_admin' && anotherSuperAdmin) {
        return setError(els.error, 'Only one Super Admin account is allowed.');
    }
    if (!isEdit && !creatableRoles.includes(payload.role)) {
        return setError(els.error, 'Select Cashier, Sales Clerk, or Inventory Manager.');
    }
    const existingUser = findUser(payload.user_id);
    if (payload.status === 'Inactive' && (payload.role === 'admin' || isProtectedAdmin(existingUser))) {
        return setError(els.error, 'Admin accounts cannot be deactivated.');
    }
    if (!isEdit && payload.password !== payload.confirm_password) return setError(els.error, 'Password and Confirm Password must match.');
    try {
        await userRequest(isEdit ? 'update_user.php' : 'add_user.php', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        announceUserListChange();
        toastr.success(isEdit ? 'User updated.' : 'User created.');
        modals.form?.hide();
        await loadUsers();
    } catch (error) {
        setError(els.error, error.message || 'Unable to save user.');
    }
});

function handleUserManagementUrlAction() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add') {
        window.setTimeout(() => openUserForm(), 250);
    }
}

loadUsers().then(handleUserManagementUrlAction);
