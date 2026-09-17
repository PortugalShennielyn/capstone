(function initializeNavbarProfileDisplay() {
    if (window.__drpNavbarProfileDisplay) return;

    const keys = {
        displayName: "pharmacyAuthenticatedDisplayName",
        initials: "pharmacyAuthenticatedInitials",
        role: "pharmacyAuthenticatedRole",
        roleLabel: "pharmacyAuthenticatedRoleLabel",
        userId: "pharmacyAuthenticatedUserId",
        allowedPages: "pharmacyAuthenticatedAllowedNavPages"
    };

    function initialsFromName(value) {
        return String(value || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("");
    }

    function normalize(user = {}, options = {}) {
        const displayName = String(options.displayName || user.full_name || user.fullName || user.displayName || user.username || "").trim();
        const role = String(options.accessRole || user.access_role || user.role || user.roles?.[0] || "").trim();
        const roleLabel = String(options.roleLabel || user.roleLabel || "").trim();
        const userId = String(options.userId || user.user_id || user.id || "").trim();
        const allowedPages = options.allowedPages ?? user.allowedPages ?? null;
        return {
            displayName,
            initials: String(options.initials || user.initials || initialsFromName(displayName)).trim(),
            role,
            roleLabel,
            userId,
            allowedPages
        };
    }

    function read() {
        try {
            const allowedPagesRaw = sessionStorage.getItem(keys.allowedPages);
            return normalize({}, {
                displayName: sessionStorage.getItem(keys.displayName) || "",
                initials: sessionStorage.getItem(keys.initials) || "",
                accessRole: sessionStorage.getItem(keys.role) || "",
                roleLabel: sessionStorage.getItem(keys.roleLabel) || "",
                userId: sessionStorage.getItem(keys.userId) || "",
                allowedPages: allowedPagesRaw ? JSON.parse(allowedPagesRaw) : null
            });
        } catch (error) {
            return normalize();
        }
    }

    function cache(user, options = {}) {
        const current = read();
        const normalized = normalize(user, options);
        const profile = {
            ...normalized,
            role: normalized.role || current.role,
            roleLabel: normalized.roleLabel || current.roleLabel,
            userId: normalized.userId || current.userId,
            allowedPages: normalized.allowedPages ?? current.allowedPages
        };
        if (!profile.displayName || !profile.initials) return profile;
        try {
            sessionStorage.setItem(keys.displayName, profile.displayName);
            sessionStorage.setItem(keys.initials, profile.initials);
            sessionStorage.setItem(keys.role, profile.role);
            sessionStorage.setItem(keys.roleLabel, profile.roleLabel);
            sessionStorage.setItem(keys.userId, profile.userId);
            if (profile.allowedPages !== null) {
                sessionStorage.setItem(keys.allowedPages, JSON.stringify(profile.allowedPages));
            }
        } catch (error) {}
        return profile;
    }

    function clear() {
        try {
            Object.values(keys).forEach(key => sessionStorage.removeItem(key));
        } catch (error) {}
    }

    function render(container, user, options = {}) {
        if (!container) return normalize(user, options);
        const profile = options.cache === false ? normalize(user, options) : cache(user, options);
        container.querySelectorAll("[data-navbar-display-name]").forEach(node => {
            if (node.textContent !== profile.displayName) node.textContent = profile.displayName;
        });
        container.querySelectorAll("[data-navbar-initials]").forEach(node => {
            if (node.textContent !== profile.initials) node.textContent = profile.initials;
        });
        container.querySelectorAll("[data-navbar-role-label]").forEach(node => {
            if (node.textContent !== profile.roleLabel) node.textContent = profile.roleLabel;
        });
        container.classList.toggle("navbar-profile-resolved", Boolean(profile.displayName && profile.initials));
        return profile;
    }

    window.__drpNavbarProfileDisplay = { cache, clear, initialsFromName, keys, normalize, read, render };
})();
