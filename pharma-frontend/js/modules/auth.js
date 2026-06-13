import API_BASE_URL from '../config/config.js';
import PharmaUtils from '../utils.js';

function mapSessionUser(user) {
    const profileTargets = [
        document.getElementById('dashboardProfileName'),
        document.getElementById('profileName'),
        document.querySelector('.dashboard-profile-name'),
        document.querySelector('.profile-name')
    ];

    profileTargets.forEach((target) => {
        if (target) {
            target.textContent = user.full_name;
        }
    });
}

function initLogoutLinks() {
    document.querySelectorAll('a[href="logout.php"]').forEach((link) => {
        if (link.dataset.logoutBound === 'true') {
            return;
        }

        link.dataset.logoutBound = 'true';
        link.addEventListener('click', async (event) => {
            event.preventDefault();

            try {
                await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/logout.php`, {
                    method: 'POST',
                    credentials: 'include'
                });
            } finally {
                window.location.href = 'login.html';
            }
        });
    });
}

async function verifySession() {
    try {
        const user = await PharmaUtils.safeFetch(`${API_BASE_URL}/auth/check_session.php`, {
            method: 'GET',
            credentials: 'include'
        });

        mapSessionUser(user);
        initLogoutLinks();
        return user;
    } catch (err) {
        window.location.href = 'login.html';
        return null;
    }
}

export { initLogoutLinks, verifySession };
export default verifySession;
