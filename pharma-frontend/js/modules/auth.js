import API_BASE_URL from '../config/config.js';
import PharmaUtils from '../utils.js';
import { clearTabToken, ensurePageTabSession, redirectToLogin } from './auth_guard.js?v=27';

let currentSessionUser = null;

function mapSessionUser(user) {
    currentSessionUser = { ...user };
    const displayName = dbValue(user.full_name, user.username || 'Current User');
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'U';
    const accountType = dbValue(formatValue(user.account_type, ''), 'Not configured');
    const tenantName = dbValue(user.tenant_name, 'Not configured');
    const email = dbValue(user.email, 'Not configured');
    const firstName = dbValue(user.first_name, 'Not configured');
    const lastName = dbValue(user.last_name, 'Not configured');
    const userStatus = dbValue(user.user_status, 'Not configured');
    const roles = Array.isArray(user.roles) && user.roles.length
        ? user.roles.join(', ')
        : dbValue(user.role, 'Not configured');
    const sessionSummary = user.account_id
        ? `Active ${accountType.toLowerCase()} session. Permissions come from this account.`
        : 'No account context is linked to this session.';

    const profileTargets = [
        document.getElementById('dashboardProfileName'),
        document.getElementById('profileName'),
        document.querySelector('.dashboard-profile-name')
    ];

    profileTargets.forEach((target) => {
        if (target) {
            target.textContent = displayName;
        }
    });
    window.__drpNavbarProfileDisplay?.render(document.getElementById('navbar-container'), user, { cache: true });

    setText('userSettingsInitials', initials);
    setDbText('userSettingsName', displayName, hasDbValue(user.full_name) || hasDbValue(user.username));
    setDbText('userSettingsRole', roles, hasDbValue(user.roles) || hasDbValue(user.role));
    setDbText('userSettingsUsername', dbValue(user.username, 'Not configured'), hasDbValue(user.username));
    setDbText('userSettingsTenant', tenantName, hasDbValue(user.tenant_name));
    setDbText('settingsIdentityName', displayName, hasDbValue(user.full_name) || hasDbValue(user.username));
    setDbText('settingsIdentityUsername', dbValue(user.username, 'Not configured'), hasDbValue(user.username));
    setDbText('settingsIdentityEmail', email, hasDbValue(user.email));
    setDbText('settingsIdentityStatus', userStatus, hasDbValue(user.user_status));
    setDbText('settingsAccountType', accountType, hasDbValue(user.account_type));
    setDbText('settingsAccountRoles', roles, hasDbValue(user.roles) || hasDbValue(user.role));
    setDbText('settingsTenantName', tenantName, hasDbValue(user.tenant_name));
    setText('settingsJoinedDate', user.created_at ? `Joined ${formatDateValue(user.created_at)}` : 'Joined date unavailable');
    setText('userSettingsStatusBadge', user.user_status || 'Active');
    const profileFields = {
        profileSettingsFullName: user.full_name || '',
        profileSettingsUsername: user.username || '',
        profileSettingsEmail: user.email || '',
        profileSettingsContact: user.contact_number || '',
    };
    Object.entries(profileFields).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (!field || document.activeElement === field) return;
        if ('value' in field) field.value = value;
        else field.textContent = value || 'Not configured';
    });
    setText('passwordResetEmail', email);
    setText('settingsJoinedDateDetail', user.created_at ? formatDateValue(user.created_at) : 'Joined date unavailable');
    setDbText('settingsSessionSummary', sessionSummary, hasDbValue(user.account_id) || hasDbValue(user.auth_session_id));
    setText('profileSessionSummary', `${displayName} • ${user.auth_session_created_at ? `Signed in ${formatDateValue(user.auth_session_created_at)}` : 'Login time unavailable'} • ${user.auth_session_is_revoked ? 'Revoked' : 'Active'}`);
    setText('tenantSettingsName', tenantName);
    setText('tenantSettingsNameInline', tenantName);
    setText('tenantSettingsInitials', initialsFromName(tenantName, 'TN'));
    setText('tenantIdentitySummary', `Edit business profile details for ${tenantName}.`);
    setText('tenantOverviewName', tenantName);
    setText('tenantOverviewSlug', user.tenant_slug || 'Not configured');
    setText('tenantOverviewBillingEmailInline', user.billing_email || 'Not configured');
    setText('tenantOverviewWebsiteInline', user.website_url || 'Not configured');
    setText('tenantActivityActor', displayName);
    setText('billingTenantName', tenantName);
    setText('billingOwnerName', displayName);
    setText('billingAccountContext', roles);
    setText('billingSubscriptionTenant', tenantName);
    setDbText('profileIdentityName', displayName, hasDbValue(user.full_name) || hasDbValue(user.username));
    setDbText('profileIdentityUsername', dbValue(user.username, 'Not configured'), hasDbValue(user.username));
    setDbText('profileIdentityEmail', email, hasDbValue(user.email));
    setDbText('profileFirstName', firstName, hasDbValue(user.first_name));
    setDbText('profileLastName', lastName, hasDbValue(user.last_name));
    setDbText('profileUserId', dbValue(user.user_id, 'Not configured'), hasDbValue(user.user_id));
    setDbText('profileAccountType', accountType, hasDbValue(user.account_type));
    setDbText('profileAccountRoles', roles, hasDbValue(user.roles) || hasDbValue(user.role));
    setDbText('profileTenantName', tenantName, hasDbValue(user.tenant_name));
    setDbText('profileSummaryName', displayName, hasDbValue(user.full_name) || hasDbValue(user.username));
    setText('profileSummaryText', `Active ${accountType.toLowerCase()} account for ${tenantName}.`);

    if (typeof window.applyTenantSettingsDraft === 'function') {
        window.applyTenantSettingsDraft();
    }
}

function initProfileIdentityEdit(user) {
    const editButton = document.getElementById('editProfileIdentityBtn');
    if (document.getElementById('profileSettingsForm')) return;
    if (!editButton || editButton.dataset.profileEditBound === 'true') {
        return;
    }

    editButton.dataset.profileEditBound = 'true';
    editButton.addEventListener('click', async () => {
        const result = await Swal.fire({
            title: 'Edit profile identity',
            html: buildProfileIdentityForm(currentSessionUser || user),
            showCancelButton: true,
            confirmButtonText: 'Save',
            confirmButtonColor: '#7c3aed',
            focusConfirm: false,
            preConfirm: () => {
                const popup = Swal.getPopup();
                const data = {
                    username: popup.querySelector('#profileEditUsername')?.value.trim() || '',
                    email: popup.querySelector('#profileEditEmail')?.value.trim() || '',
                    full_name: popup.querySelector('#profileEditFullName')?.value.trim() || '',
                    first_name: popup.querySelector('#profileEditFirstName')?.value.trim() || '',
                    last_name: popup.querySelector('#profileEditLastName')?.value.trim() || ''
                };

                if (!data.username) {
                    Swal.showValidationMessage('Username is required.');
                    return false;
                }
                if (!/^[A-Za-z0-9._-]+$/.test(data.username)) {
                    Swal.showValidationMessage('Username can only include letters, numbers, dots, underscores, and hyphens.');
                    return false;
                }
                if (data.username.length > 50) {
                    Swal.showValidationMessage('Username must be 50 characters or fewer.');
                    return false;
                }
                if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
                    Swal.showValidationMessage('Enter a valid email address.');
                    return false;
                }
                if (!data.full_name) {
                    Swal.showValidationMessage('Full name is required.');
                    return false;
                }
                if (data.full_name.length > 100 || data.first_name.length > 100 || data.last_name.length > 100) {
                    Swal.showValidationMessage('Names must be 100 characters or fewer.');
                    return false;
                }

                return data;
            }
        });

        if (!result.isConfirmed) {
            return;
        }

        try {
            const updatedUser = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/update_profile.php`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(result.value)
            });

            mapSessionUser(updatedUser);
            PharmaUtils.toast.success('Profile identity updated.');
        } catch (error) {
            PharmaUtils.modal.error('Unable to update profile', error.message);
        }
    });
}

function initPasswordUpdate() {
    const updateButton = document.getElementById('updatePasswordBtn');
    if (document.getElementById('profilePasswordForm')) return;
    if (!updateButton || updateButton.dataset.passwordUpdateBound === 'true') {
        return;
    }

    updateButton.dataset.passwordUpdateBound = 'true';
    updateButton.addEventListener('click', async () => {
        const result = await Swal.fire({
            title: 'Update password',
            html: buildPasswordUpdateForm(),
            showCancelButton: true,
            confirmButtonText: 'Update',
            confirmButtonColor: '#7c3aed',
            focusConfirm: false,
            preConfirm: () => {
                const popup = Swal.getPopup();
                const data = {
                    current_password: popup.querySelector('#passwordCurrent')?.value || '',
                    new_password: popup.querySelector('#passwordNew')?.value || '',
                    confirm_password: popup.querySelector('#passwordConfirm')?.value || ''
                };

                if (!data.current_password || !data.new_password || !data.confirm_password) {
                    Swal.showValidationMessage('All password fields are required.');
                    return false;
                }
                if (data.new_password.length < 8 || data.new_password.length > 72) {
                    Swal.showValidationMessage('New password must be between 8 and 72 characters.');
                    return false;
                }
                if (data.new_password !== data.confirm_password) {
                    Swal.showValidationMessage('New password and confirmation do not match.');
                    return false;
                }
                if (data.current_password === data.new_password) {
                    Swal.showValidationMessage('New password must be different from the current password.');
                    return false;
                }

                return data;
            }
        });

        if (!result.isConfirmed) {
            return;
        }

        try {
            const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/update_password.php`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(result.value)
            });

            PharmaUtils.toast.success(response.message || 'Password updated.');
        } catch (error) {
            PharmaUtils.modal.error('Unable to update password', error.message);
        }
    });
}

function formatDateValue(value) {
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function settingsMessage(id, message = '', type = 'error') {
    const target = document.getElementById(id);
    if (!target) return;
    target.textContent = message;
    target.className = `settings-form-message ${type}`;
    target.hidden = !message;
}

function initProfileSettings() {
    const profileForm = document.getElementById('profileSettingsForm');
    if (!profileForm || profileForm.dataset.bound === 'true') return;
    profileForm.dataset.bound = 'true';

    document.querySelectorAll('[data-settings-tab]').forEach((button) => button.addEventListener('click', () => {
        const tab = button.dataset.settingsTab;
        document.querySelectorAll('[data-settings-tab]').forEach((item) => item.classList.toggle('active', item === button));
        document.querySelectorAll('[data-settings-panel]').forEach((panel) => { panel.hidden = panel.dataset.settingsPanel !== tab; });
    }));
    document.getElementById('editProfileIdentityBtn')?.addEventListener('click', () => {
        profileForm.classList.remove('is-readonly');
        profileForm.querySelectorAll('input').forEach((input) => { input.readOnly = false; });
        profileForm.querySelector('.profile-settings-actions').hidden = false;
        document.getElementById('editProfileIdentityBtn').hidden = true;
    });
    document.getElementById('profileSettingsCancel')?.addEventListener('click', () => {
        mapSessionUser(currentSessionUser || {});
        profileForm.classList.add('is-readonly');
        profileForm.querySelectorAll('input').forEach((input) => { input.readOnly = true; });
        profileForm.querySelector('.profile-settings-actions').hidden = true;
        document.getElementById('editProfileIdentityBtn').hidden = false;
    });

    profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        settingsMessage('profileSettingsError');
        const data = Object.fromEntries(new FormData(profileForm).entries());
        if (!data.full_name || !data.username || !data.email) return settingsMessage('profileSettingsError', 'Full name, username, and email are required.');
        if (!/^[A-Za-z0-9._-]+$/.test(data.username)) return settingsMessage('profileSettingsError', 'Username can only include letters, numbers, dots, underscores, and hyphens.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return settingsMessage('profileSettingsError', 'Enter a valid email address.');
        try {
            const updatedUser = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/update_profile.php`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            mapSessionUser(updatedUser);
            profileForm.classList.add('is-readonly');
            profileForm.querySelectorAll('input').forEach((input) => { input.readOnly = true; });
            profileForm.querySelector('.profile-settings-actions').hidden = true;
            document.getElementById('editProfileIdentityBtn').hidden = false;
            settingsMessage('profileSettingsError');
            PharmaUtils.toast.success('Profile settings saved.');
        } catch (error) { settingsMessage('profileSettingsError', error.message || 'Unable to save profile settings.'); }
    });
    document.querySelectorAll('.password-toggle').forEach((button) => button.addEventListener('click', () => {
        const input = button.closest('.password-field')?.querySelector('input');
        if (!input) return;
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
        button.innerHTML = `<i class="fa-regular fa-eye${visible ? '' : '-slash'}"></i>`;
    }));
    document.querySelectorAll('[data-notification-key]').forEach((input) => {
        const storageKey = `drp_notification_${currentSessionUser?.user_id || 'current'}_${input.dataset.notificationKey}`;
        input.checked = localStorage.getItem(storageKey) !== '0';
        input.addEventListener('change', () => localStorage.setItem(storageKey, input.checked ? '1' : '0'));
    });

    const passwordForm = document.getElementById('profilePasswordForm');
    passwordForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        settingsMessage('profilePasswordError'); settingsMessage('profilePasswordSuccess');
        const data = Object.fromEntries(new FormData(passwordForm).entries());
        if (!data.current_password || !data.new_password || !data.confirm_password) return settingsMessage('profilePasswordError', 'All password fields are required.');
        if (data.new_password.length < 8 || data.new_password.length > 72) return settingsMessage('profilePasswordError', 'New password must be between 8 and 72 characters.');
        if (data.new_password !== data.confirm_password) return settingsMessage('profilePasswordError', 'New password and confirmation do not match.');
        try {
            const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/update_password.php`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            passwordForm.reset(); settingsMessage('profilePasswordSuccess', response.message || 'Password updated.', 'success');
        } catch (error) { settingsMessage('profilePasswordError', error.message || 'Unable to update password.'); }
    });
    document.getElementById('requestPasswordResetBtn')?.addEventListener('click', async () => {
        const email = document.getElementById('passwordResetEmail')?.textContent.trim() || '';
        settingsMessage('passwordResetMessage');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return settingsMessage('passwordResetMessage', 'No registered email address is available for this account.');
        try {
            const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/request_password_reset.php`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
            settingsMessage('passwordResetMessage', response.message || 'If the email is registered, a reset link has been sent.', 'success');
        } catch (error) { settingsMessage('passwordResetMessage', error.message || 'Unable to request a reset link.'); }
    });
}

function initSessionReview() {
    const reviewButton = document.getElementById('reviewCurrentSessionBtn');
    if (!reviewButton || reviewButton.dataset.sessionReviewBound === 'true') {
        return;
    }

    reviewButton.dataset.sessionReviewBound = 'true';
    reviewButton.addEventListener('click', () => {
        Swal.fire({
            title: 'Current session',
            html: buildSessionReview(currentSessionUser || {}),
            confirmButtonText: 'Close',
            confirmButtonColor: '#7c3aed'
        });
    });
}

function buildProfileIdentityForm(user) {
    const displayName = user.full_name || '';
    const username = user.username || '';
    const email = user.email || '';
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    const role = Array.isArray(user.roles) && user.roles.length ? user.roles.join(', ') : (user.role || 'Assigned role');
    const status = user.user_status || 'Active';
    const accountType = formatValue(user.account_type, 'Account');
    const tenantName = user.tenant_name || 'Current workspace';

    return `
        <div class="text-start">
            <div class="row g-2">
                <div class="col-12 col-md-6">
                    <label class="form-label fw-semibold" for="profileEditUsername">Username</label>
                    <input class="form-control" id="profileEditUsername" maxlength="50" value="${escapeHtml(username)}">
                </div>
                <div class="col-12 col-md-6">
                    <label class="form-label fw-semibold" for="profileEditEmail">Email</label>
                    <input class="form-control" id="profileEditEmail" type="email" maxlength="255" value="${escapeHtml(email)}">
                </div>
                <div class="col-12">
                    <label class="form-label fw-semibold" for="profileEditFullName">Full name</label>
                    <input class="form-control" id="profileEditFullName" maxlength="100" value="${escapeHtml(displayName)}">
                </div>
                <div class="col-12 col-md-6">
                    <label class="form-label fw-semibold" for="profileEditFirstName">First name</label>
                    <input class="form-control" id="profileEditFirstName" maxlength="100" value="${escapeHtml(firstName)}">
                </div>
                <div class="col-12 col-md-6">
                    <label class="form-label fw-semibold" for="profileEditLastName">Last name</label>
                    <input class="form-control" id="profileEditLastName" maxlength="100" value="${escapeHtml(lastName)}">
                </div>
            </div>
            <div class="mt-3 p-3 border rounded-2 bg-light">
                <div class="small fw-bold text-uppercase text-muted mb-2">Read-only access context</div>
                <div class="row g-2 small">
                    <div class="col-6"><strong>Role:</strong> ${escapeHtml(role)}</div>
                    <div class="col-6"><strong>Status:</strong> ${escapeHtml(status)}</div>
                    <div class="col-6"><strong>Account:</strong> ${escapeHtml(accountType)}</div>
                    <div class="col-6"><strong>Tenant:</strong> ${escapeHtml(tenantName)}</div>
                </div>
            </div>
        </div>
    `;
}

function buildPasswordUpdateForm() {
    return `
        <div class="text-start">
            <div class="mb-3">
                <label class="form-label fw-semibold" for="passwordCurrent">Current password</label>
                <input class="form-control" id="passwordCurrent" type="password" autocomplete="current-password">
            </div>
            <div class="mb-3">
                <label class="form-label fw-semibold" for="passwordNew">New password</label>
                <input class="form-control" id="passwordNew" type="password" autocomplete="new-password" minlength="8" maxlength="72">
            </div>
            <div>
                <label class="form-label fw-semibold" for="passwordConfirm">Confirm new password</label>
                <input class="form-control" id="passwordConfirm" type="password" autocomplete="new-password" minlength="8" maxlength="72">
            </div>
            <p class="small text-muted mt-3 mb-0">Changing your password revokes other active sessions for this user.</p>
        </div>
    `;
}

function buildSessionReview(user) {
    const roles = Array.isArray(user.roles) && user.roles.length ? user.roles.join(', ') : (user.role || 'Assigned role');
    const roleIds = Array.isArray(user.role_identifiers) && user.role_identifiers.length ? user.role_identifiers.join(', ') : 'Not provided';
    const accountType = formatValue(user.account_type, 'Account');

    return `
        <div class="text-start">
            <dl class="context-list">
                ${sessionReviewRow('User ID', user.user_id || 'Not provided')}
                ${sessionReviewRow('Username', user.username || 'Not provided')}
                ${sessionReviewRow('User status', user.user_status || 'Active')}
                ${sessionReviewRow('Account ID', user.account_id || 'Legacy session')}
                ${sessionReviewRow('Account type', accountType)}
                ${sessionReviewRow('Roles', roles)}
                ${sessionReviewRow('Role identifiers', roleIds)}
                ${sessionReviewRow('Tenant ID', user.tenant_id || 'Not provided')}
                ${sessionReviewRow('Tenant name', user.tenant_name || 'Current workspace')}
                ${sessionReviewRow('Tenant slug', user.tenant_slug || 'Not provided')}
                ${sessionReviewRow('Primary domain', user.primary_domain || 'Not configured')}
                ${sessionReviewRow('Auth session ID', user.auth_session_id || 'Not provided')}
                ${sessionReviewRow('Session created', user.auth_session_created_at || 'Not provided')}
                ${sessionReviewRow('Session expires', user.auth_session_expires_at || 'Not provided')}
                ${sessionReviewRow('Session revoked', user.auth_session_is_revoked === true ? 'Yes' : 'No')}
            </dl>
        </div>
    `;
}

function sessionReviewRow(label, value) {
    return `
        <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
        </div>
    `;
}

function formatValue(value, fallback) {
    if (!value) {
        return fallback;
    }

    return String(value)
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function initialsFromName(value, fallback) {
    return String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || fallback;
}

function setText(id, value) {
    const target = document.getElementById(id);
    if (target) {
        target.textContent = value;
    }
}

function setDbText(id, value, isDbBacked) {
    const target = document.getElementById(id);
    if (!target) {
        return;
    }

    target.textContent = value;
    target.classList.toggle('db-backed-value', Boolean(isDbBacked));
    target.classList.toggle('missing-value', !isDbBacked);
}

function dbValue(value, fallback) {
    return hasDbValue(value) ? String(value).trim() : fallback;
}

function hasDbValue(value) {
    if (Array.isArray(value)) {
        return value.some((item) => hasDbValue(item));
    }

    return value !== null && value !== undefined && String(value).trim() !== '';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function initLogoutLinks() {
    document.querySelectorAll('a[href="logout.php"], [data-auth-action="logout"]').forEach((link) => {
        if (link.dataset.logoutBound === 'true') {
            return;
        }

        link.dataset.logoutBound = 'true';
        link.addEventListener('click', async (event) => {
            event.preventDefault();

            try {
                await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/logout.php`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: 'logout' })
                });
            } finally {
                clearTabToken();
                window.location.replace('login.html');
            }
        });
    });
}

async function verifySession() {
    const sessionResult = await ensurePageTabSession();
    if (!sessionResult) {
        return null;
    }

    try {
        const user = typeof sessionResult === 'object'
            ? sessionResult
            : await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/check_session.php`, {
                method: 'GET',
                credentials: 'include'
            });

        mapSessionUser(user);
        initProfileSettings();
        initProfileIdentityEdit(user);
        initPasswordUpdate();
        initSessionReview();
        initLogoutLinks();
        return user;
    } catch (err) {
        if (err?.status === 401) {
            redirectToLogin();
        }
        return null;
    }
}

export { initLogoutLinks, verifySession };
export default verifySession;
