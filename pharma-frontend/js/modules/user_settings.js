import API_BASE_URL from '../config/config.js';

export function initUserSettings() {
    const panel = document.getElementById('userSettingsPanel');
    if (!panel) return;

    const nameInput     = document.getElementById('displayNameInput');
    const usernameInput = document.getElementById('usernameInput');
    const emailInput    = document.getElementById('emailInput');
    const contactInput  = document.getElementById('contactInput');
    const avatarEl      = document.getElementById('avatarPreview');

    const saveBtn       = document.getElementById('saveProfileBtn');
    const changePassBtn = document.getElementById('changePasswordBtn');
    const passStatus    = document.getElementById('passwordStatus');

    const s = window.__drpSession || {};
    if (nameInput)     nameInput.value     = s.full_name || '';
    if (usernameInput) usernameInput.value = s.username || '';
    if (emailInput)    emailInput.value    = s.email || '';
    if (contactInput)  contactInput.value  = s.contact_number || '';
    if (avatarEl)      avatarEl.textContent = initials(s.full_name || s.username || 'U');

    /* ═══ SAVE PROFILE ═══ */
    if (saveBtn) {
        saveBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            const body = {
                full_name:      (nameInput?.value || '').trim(),
                email:          (emailInput?.value || '').trim(),
                contact_number: (contactInput?.value || '').trim(),
            };

            // ⚠️ Check required fields BEFORE hitting the server
            if (!body.full_name) {
                toast('Please enter a display name.', false);
                if (nameInput) nameInput.focus();
                return;
            }
            if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
                toast('Please enter a valid email.', false);
                if (emailInput) emailInput.focus();
                return;
            }

            saveBtn.disabled = true;
            const original = saveBtn.innerHTML;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';

            try {
                const res = await fetch(`${API_BASE_URL}/auth/update_profile.php`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });

                // ⚠️ Check if it's actually JSON
                const rawText = await res.text();
                let data;
                try {
                    data = JSON.parse(rawText);
                } catch (jsonErr) {
                    console.error('[user_settings] Non-JSON response:', rawText.substring(0, 200));
                    throw new Error('Server returned invalid response. Check Apache logs.');
                }

                if (data.success) {
                    if (avatarEl) avatarEl.textContent = initials(body.full_name);
                    toast('✅ ' + (data.message || 'Profile updated.'), true);
                    window.__drpSession = { ...(window.__drpSession || {}), ...body };
                } else {
                    toast(data.message || 'Update failed.', false);
                }
            } catch (err) {
                console.error('[user_settings] save failed:', err);
                toast(err.message || 'Network error. Check that update_profile.php exists.', false);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = original;
            }
        });
    }

    /* ═══ CHANGE PASSWORD ═══ */
    if (changePassBtn) {
        changePassBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            const current = (document.getElementById('currentPasswordInput')?.value || '');
            const newPass = (document.getElementById('newPasswordInput')?.value || '');
            const confirm = (document.getElementById('confirmPasswordInput')?.value || '');

            if (passStatus) passStatus.innerHTML = '';

            if (!current || !newPass || !confirm) {
                toast('Please fill in all password fields.', false);
                return;
            }
            if (newPass.length < 8) {
                toast('New password must be at least 8 characters.', false);
                return;
            }
            if (newPass !== confirm) {
                toast('New passwords do not match.', false);
                return;
            }
            if (current === newPass) {
                toast('New password must be different from current.', false);
                return;
            }

            changePassBtn.disabled = true;
            const original = changePassBtn.innerHTML;
            changePassBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Changing…';

            try {
                const res = await fetch(`${API_BASE_URL}/auth/change_password.php`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        current_password: current,
                        new_password: newPass,
                        confirm_password: confirm,
                    }),
                });

                const rawText = await res.text();
                let data;
                try {
                    data = JSON.parse(rawText);
                } catch (jsonErr) {
                    console.error('[user_settings] Non-JSON response:', rawText.substring(0, 200));
                    throw new Error('Server returned invalid response.');
                }

                if (data.success) {
                    if (passStatus) passStatus.innerHTML = '<span class="text-success">✅ ' + (data.message || 'Password changed.') + '</span>';
                    toast('✅ ' + (data.message || 'Password changed.'), true);
                    ['currentPasswordInput','newPasswordInput','confirmPasswordInput']
                        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
                } else {
                    if (passStatus) passStatus.innerHTML = '<span class="text-danger">' + (data.message || 'Failed.') + '</span>';
                    toast(data.message || 'Failed.', false);
                }
            } catch (err) {
                console.error('[user_settings] change password failed:', err);
                toast(err.message || 'Network error.', false);
            } finally {
                changePassBtn.disabled = false;
                changePassBtn.innerHTML = original;
            }
        });
    }
}

function initials(name) {
    return String(name || 'U').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
}

function toast(msg, ok = true) {
    const t = document.getElementById('toastMessage');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.style.background = ok ? '#1e293b' : '#b91c1c';
    t.style.display = 'block';
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
    clearTimeout(t._t);
    t._t = setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(20px)';
        setTimeout(() => { t.style.display = 'none'; }, 300);
    }, 3000);
}