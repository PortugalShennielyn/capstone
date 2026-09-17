import API_BASE_URL from '../config/config.js';
import PharmaUtils from '../utils.js';

const form = document.getElementById('resetPasswordForm');
const message = document.getElementById('resetMessage');
const token = new URLSearchParams(window.location.search).get('token') || '';

function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `message ${type}`;
    message.hidden = !text;
}

if (!token) {
    form.hidden = true;
    showMessage('This reset link is missing or invalid. Request a new link from Profile Settings.');
}

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.password.length < 8 || data.password.length > 72) return showMessage('Password must be between 8 and 72 characters.');
    if (data.password !== data.confirm_password) return showMessage('Password and confirmation do not match.');
    try {
        const response = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/reset_password.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, token }) });
        showMessage(response.message || 'Password reset successfully.', 'success');
        form.reset();
        window.setTimeout(() => { window.location.href = 'login.html'; }, 1800);
    } catch (error) { showMessage(error.message || 'Unable to reset password.'); }
});
