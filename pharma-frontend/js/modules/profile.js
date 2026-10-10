import API_BASE_URL from '../config/config.js';
import PharmaUtils from '../utils.js';
import { cacheAuthenticatedProfile, ensurePageTabSession } from './auth_guard.js?v=27';
import { roleLabel } from './rbac.js?v=7';

const byId = (id) => document.getElementById(id);
const themes = { navy:'#1b356d', purple:'#6846cf', teal:'#116653', orange:'#b75a29', berry:'#a22853', slate:'#252c3a' };
let currentUser = null;
let storagePrefix = '';

function showMessage(id, message = '', success = false) {
    const node = byId(id);
    node.textContent = message;
    node.className = `profile-message ${success ? 'is-success' : 'is-error'}`;
    node.hidden = !message;
}

function initials(name) {
    return String(name || 'U').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
}

function renderUser(user) {
    currentUser = user;
    const name = user.full_name || user.username || 'User';
    const role = roleLabel(user);
    byId('profileName').textContent = name;
    byId('profileInitials').textContent = initials(name);
    byId('profileHandle').textContent = `@${user.username || 'username'}`;
    byId('profileRoleText').textContent = role;
    byId('profileRoleBadge').textContent = role;
    byId('profileFullName').value = user.full_name || '';
    byId('profileUsername').value = user.username || '';
    byId('profileRole').value = role;
    byId('profileEmail').value = user.email || '';
    byId('profileContact').value = user.contact_number || '';
    cacheAuthenticatedProfile(user);
}

function applyTheme(theme, persist = false) {
    const selected = themes[theme] ? theme : 'purple';
    document.documentElement.style.setProperty('--profile-accent', themes[selected]);
    document.querySelectorAll('[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === selected)));
    if (persist) {
        try { localStorage.setItem(`${storagePrefix}:theme`, selected); } catch (_) { showMessage('accountMessage', 'This browser could not save your color preference.'); }
    }
}

function applyPhoto(dataUrl) {
    const avatar = byId('profileAvatar');
    avatar.classList.toggle('has-photo', Boolean(dataUrl));
    avatar.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : '';
    byId('removePhotoButton').hidden = !dataUrl;
}

async function selectedPhoto(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        showMessage('accountMessage', 'Choose a JPG, PNG, or WEBP image smaller than 5 MB.');
        return;
    }
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const dataUrl = canvas.toDataURL('image/jpeg', .82);
        localStorage.setItem(`${storagePrefix}:photo`, dataUrl);
        applyPhoto(dataUrl);
        showMessage('accountMessage', 'Profile photo saved in this browser.', true);
    } catch (_) {
        showMessage('accountMessage', 'This browser could not save your profile photo.');
    }
}

async function updateAccount(event) {
    event.preventDefault();
    const fullName = byId('profileFullName').value.trim();
    const email = byId('profileEmail').value.trim();
    const contactNumber = byId('profileContact').value.trim();
    if (!fullName) return showMessage('accountMessage', 'Full name is required.');
    if (email && !byId('profileEmail').checkValidity()) return showMessage('accountMessage', 'Enter a valid email address.');
    const buttons = document.querySelectorAll('[form="accountForm"], #accountForm button[type="submit"]');
    buttons.forEach(button => button.disabled = true);
    showMessage('accountMessage');
    try {
        const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/update_profile.php`, {
            method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ full_name:fullName, email, contact_number:contactNumber })
        });
        if (response.success === false) throw new Error(response.message || 'Unable to save account information.');
        renderUser(response.session || { ...currentUser, full_name:fullName, email, contact_number:contactNumber });
        showMessage('accountMessage', response.message || 'Account information saved.', true);
    } catch (error) {
        showMessage('accountMessage', error.message || 'Unable to save account information.');
    } finally {
        buttons.forEach(button => button.disabled = false);
    }
}

async function updatePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.current_password || !data.new_password || !data.confirm_password) return showMessage('passwordMessage', 'Complete all password fields.');
    if (data.new_password.length < 8 || data.new_password.length > 72) return showMessage('passwordMessage', 'New password must contain 8 to 72 characters.');
    if (data.new_password !== data.confirm_password) return showMessage('passwordMessage', 'New passwords do not match.');
    if (data.new_password === data.current_password) return showMessage('passwordMessage', 'Choose a password different from your current one.');
    const buttons = document.querySelectorAll('[form="passwordForm"], #passwordForm button[type="submit"]');
    buttons.forEach(button => button.disabled = true);
    showMessage('passwordMessage');
    try {
        const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/update_password.php`, {
            method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
        });
        form.reset();
        showMessage('passwordMessage', response.message || 'Password updated.', true);
    } catch (error) {
        showMessage('passwordMessage', error.message || 'Unable to update password.');
    } finally {
        buttons.forEach(button => button.disabled = false);
    }
}

async function requestReset() {
    const email = currentUser?.email || '';
    if (!email) return showMessage('resetMessage', 'Add an email address to your account first.');
    const button = byId('requestResetButton');
    button.disabled = true;
    showMessage('resetMessage');
    try {
        const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/request_password_reset.php`, {
            method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email })
        });
        showMessage('resetMessage', response.message || 'If this email is registered, a reset link has been sent.', true);
    } catch (error) {
        showMessage('resetMessage', error.message || 'Unable to send the reset link.');
    } finally {
        button.disabled = false;
    }
}

function bindEvents() {
    document.querySelectorAll('[data-profile-tab]').forEach(button => button.addEventListener('click', () => {
        const selected = button.dataset.profileTab;
        document.querySelectorAll('[data-profile-tab]').forEach(tab => {
            const active = tab === button;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('[data-profile-panel]').forEach(panel => panel.hidden = panel.dataset.profilePanel !== selected);
        const saveButton = byId('saveProfileButton');
        saveButton.setAttribute('form', selected === 'security' ? 'passwordForm' : 'accountForm');
        saveButton.innerHTML = selected === 'security'
            ? '<i class="fa-solid fa-key"></i> Update Password'
            : '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
    }));
    byId('accountForm').addEventListener('submit', updateAccount);
    byId('passwordForm').addEventListener('submit', updatePassword);
    byId('requestResetButton').addEventListener('click', requestReset);
    document.querySelectorAll('.profile-password-toggle').forEach(button => button.addEventListener('click', () => {
        const input = button.parentElement.querySelector('input');
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} password`);
        button.querySelector('i').className = visible ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    }));
    byId('changePhotoButton').addEventListener('click', () => byId('profilePhotoInput').click());
    byId('choosePhotoButton').addEventListener('click', () => byId('profilePhotoInput').click());
    byId('avatarCameraButton').addEventListener('click', () => byId('profilePhotoInput').click());
    byId('profilePhotoInput').addEventListener('change', event => selectedPhoto(event.target.files?.[0]));
    byId('removePhotoButton').addEventListener('click', () => {
        try { localStorage.removeItem(`${storagePrefix}:photo`); } catch (_) {}
        applyPhoto('');
        showMessage('accountMessage', 'Profile photo removed from this browser.', true);
    });
    document.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => applyTheme(button.dataset.theme, true)));
}

async function initialize() {
    bindEvents();
    const session = await ensurePageTabSession();
    if (!session || typeof session !== 'object') return;
    storagePrefix = `drp-profile:${session.user_id}`;
    renderUser(session);
    try {
        applyTheme(localStorage.getItem(`${storagePrefix}:theme`) || 'purple');
        applyPhoto(localStorage.getItem(`${storagePrefix}:photo`) || '');
    } catch (_) { applyTheme('purple'); }
}

initialize();
