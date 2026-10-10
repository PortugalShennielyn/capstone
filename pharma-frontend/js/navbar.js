(function initNavigationRuntime() {
    if (window.__drpNavigationRuntime) {
        window.__drpNavigationRuntime.clear();
        return;
    }

    if (!document.getElementById('drp-ui-system-styles')) {
        const uiStyles = document.createElement('link');
        uiStyles.id = 'drp-ui-system-styles';
        uiStyles.rel = 'stylesheet';
        uiStyles.href = './css/ui-system.css?v=3';
        document.head.appendChild(uiStyles);
    }

    const prefetchedUrls = new Set(
        Array.from(document.querySelectorAll('link[rel="prefetch"]')).map(link => link.href)
    );
    let resetTimer = 0;
    let removalTimer = 0;

    function applySavedTheme() {
        try {
            const theme = localStorage.getItem("drpTheme") === "dark" ? "dark" : "light";
            document.documentElement.setAttribute("data-bs-theme", theme);
            document.body?.classList.toggle("dark-mode", theme === "dark");
        } catch (error) {}
    }

    function removeLegacyNavbarQueryParameter() {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("_navbar")) return;
        url.searchParams.delete("_navbar");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    function ensureOverlay() {
        let overlay = document.getElementById("drpNavigationOverlay");
        if (overlay) return overlay;

        overlay = document.createElement("div");
        overlay.id = "drpNavigationOverlay";
        overlay.className = "drp-navigation-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = '<span class="drp-navigation-progress"></span>';
        document.body.appendChild(overlay);
        return overlay;
    }

    function clear() {
        window.__drpNavigationInProgress = false;
        window.clearTimeout(resetTimer);
        window.clearTimeout(removalTimer);
        const overlay = document.getElementById("drpNavigationOverlay");
        if (!overlay) return;
        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");
        removalTimer = window.setTimeout(() => overlay.remove(), 180);
    }

    function moduleUrl(link) {
        if (!link || link.hasAttribute("download") || link.dataset.authAction === "logout") return null;
        if (link.target && link.target.toLowerCase() !== "_self") return null;

        const href = (link.getAttribute("href") || "").trim();
        if (!href || href === "#" || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return null;

        let targetUrl;
        try {
            targetUrl = new URL(href, window.location.href);
        } catch (error) {
            return null;
        }

        if (targetUrl.origin !== window.location.origin) return null;
        if (!targetUrl.pathname.toLowerCase().endsWith(".html")) return null;
        return targetUrl;
    }

    function prefetch(link) {
        const targetUrl = moduleUrl(link);
        if (!targetUrl || targetUrl.pathname === window.location.pathname || prefetchedUrls.has(targetUrl.href)) return;

        const prefetchLink = document.createElement("link");
        prefetchLink.rel = "prefetch";
        prefetchLink.href = targetUrl.href;
        prefetchLink.as = "document";
        document.head.appendChild(prefetchLink);
        prefetchedUrls.add(targetUrl.href);
    }

    function navigate(targetUrl) {
        if (window.__drpNavigationInProgress) return false;
        window.__drpNavigationInProgress = true;
        window.clearTimeout(removalTimer);

        const overlay = ensureOverlay();
        overlay.setAttribute("aria-hidden", "false");
        requestAnimationFrame(() => {
            overlay.classList.add("is-visible");
            requestAnimationFrame(() => window.location.assign(targetUrl.href));
        });

        resetTimer = window.setTimeout(clear, 4000);
        return true;
    }

    window.__drpNavigationRuntime = { clear, moduleUrl, navigate, prefetch };
    applySavedTheme();
    removeLegacyNavbarQueryParameter();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", clear, { once: true });
    } else {
        clear();
    }
    window.addEventListener("pageshow", clear);
})();

(function startNavbarInitialization() {
    const container = document.getElementById("navbar-container");
    if (!container) return;
    if (!window.__drpNavbarInitPromise) {
        window.__drpNavbarInitPromise = initializeNavbar(container);
    }
    window.__drpNavbarInitPromise.catch(error => {
        console.error("Unable to initialize the shared navbar:", error);
    });
})();

async function initializeNavbar(container) {
    if (window.__drpNavbarLoaderStarted) {
        enhanceDataTables();
        return;
    }
    window.__drpNavbarLoaderStarted = true;

    const navbarScrollKeys = {
        expanded: "pharmacyNavbarScrollTopExpanded",
        collapsed: "pharmacyNavbarScrollTopCollapsed"
    };
    const savedCollapsed = true;
    const mainWrapperBeforeLoad = document.getElementById("mainWrapper");
    document.body.classList.add("navbar-state-booting");
    document.body.classList.add("role-loading");
    ensureNavbarRuntimeStyles();
    document.body.classList.toggle("navbar-sidebar-collapsed", savedCollapsed);
    mainWrapperBeforeLoad?.classList.toggle("collapsed", savedCollapsed);
    const revealShell = () => {
        requestAnimationFrame(() => {
            document.body.classList.remove("navbar-state-booting");
            document.body.classList.remove("role-loading");
            document.documentElement.classList.add("app-ready");
        });
    };
    const revealFailSafe = window.setTimeout(revealShell, 2500);

    try {
        const rbac = await import("./modules/rbac.js?v=8");
        const cacheKey = window.__drpNavbarMarkupCacheKey || "drpNavbarHtml:v49";
        let navbarHtml = sessionStorage.getItem(cacheKey);

        if (!navbarHtml) {
            const response = await fetch("navbar.html", { cache: "no-cache" });
            if (!response.ok) throw new Error(`Navbar request failed with status ${response.status}`);
            navbarHtml = await response.text();
            sessionStorage.setItem(cacheKey, navbarHtml);
        } else {
            fetch("navbar.html", { cache: "no-cache" })
                .then(response => response.ok ? response.text() : "")
                .then(html => {
                    if (html) sessionStorage.setItem(cacheKey, html);
                })
                .catch(() => {});
        }

        const cachedMarkupAlreadyMounted = container.dataset.navbarSource === "cache" && Boolean(container.querySelector("#sidebar"));
        if (!cachedMarkupAlreadyMounted) {
            container.classList.add("navbar-preparing");
            const existingScrollContainer = container.querySelector(".sidebar-nav");
            const existingSidebar = container.querySelector("#sidebar");
            if (existingScrollContainer) {
                const isCollapsed = existingSidebar?.classList.contains("collapsed");
                const hasMeaningfulScroll = existingScrollContainer.scrollHeight > existingScrollContainer.clientHeight + 1;
                if (!isCollapsed || hasMeaningfulScroll) {
                    sessionStorage.setItem(
                        isCollapsed ? navbarScrollKeys.collapsed : navbarScrollKeys.expanded,
                        String(existingScrollContainer.scrollTop)
                    );
                }
            }
            container.innerHTML = navbarHtml;
        }
        container.dataset.navbarSource = "runtime";
        container.classList.remove("navbar-skeleton-ready");
        container.classList.add("navbar-ready");
        const profileAction = container.querySelector(".sidebar-user-action[data-nav-page='user-settings']");
        if (profileAction) {
            profileAction.href = "profile.html";
            profileAction.removeAttribute("data-profile-action");
            const label = profileAction.querySelector("span");
            if (label) label.textContent = "Profile Settings";
        }
        window.__drpNavbarBootstrap?.applyImmediateState(container);
        window.__drpNavbarBootstrap?.revealPreparedNavbar(container);

        const sidebar = document.getElementById("sidebar");
        const mainWrapper = document.getElementById("mainWrapper");
        const sidebarToggle = container.querySelector("#sidebarToggle");
        let headerSidebarToggle = null;
        document.querySelectorAll("#sidebarToggle").forEach(toggle => {
            if (toggle !== sidebarToggle) toggle.remove();
        });
        try {
            localStorage.removeItem("drpSidebarCollapsed");
        } catch (error) {}
        document.querySelectorAll(".sidebar-backdrop").forEach(backdrop => backdrop.remove());
        const filename = window.location.pathname.split("/").pop() || "dashboard.html";
        let isRestoringNavbarScroll = false;
        let navbarScrollRestoreFrame = 0;

        const pageMap = {
            "dashboard.html": "dashboard",
            "supervisor_dashboard.html": "dashboard",
            "cashier_dashboard.html": "dashboard",
            "sales_clerk_dashboard.html": "dashboard",
            "products.html": "products",
            "inventory.html": "inventory",
            "shelf_inventory.html": "shelf-inventory",
            "supplier.html": "supplier",
            "purchase_orders.html": "purchase-orders",
            "purchase_requests.html": "purchase-requests",
            "inspect_deliveries.html": "inspect-deliveries",
            "supervisor_approval.html": "supervisor-approval",
            "pending_orders.html": "supervisor-approval",
            "arrived_orders.html": "arrived-orders",
            "complete_delivery.html": "complete-delivery",
            "return_damage.html": "return-damage",
            "expiry_monitoring.html": "expiry-monitoring",
            "expiry_monitoring_advanced.html": "expiry-monitoring",
            "returns_disposals.html": "returns-disposals",
            "reports.html": "reports",
            "sales_clerk_reports.html": "reports",
            "audit_logs.html": "audit-logs",
            "admin_settings.html": "settings",
            "pos.html": "pos",
            "clerk.html": "clerk",
            "sales_clerk_orders.html": "sales-clerk-orders",
            "sales_clerk_pos.html": "sales-clerk-pos",
            "cashier_pos.html": "cashier-pos",
            "cashier_queue.html": "cashier-queue",
            "completed_sales.html": "cashier-history",
            "cashier_transaction_history.html": "cashier-history",
            "cancelled_sales.html": "cancelled-sales",
            "receipt_history.html": "receipt-history",
            "cashier_shift_summary.html": "cashier-shift",
            "cashier_profile.html": "cashier-profile",
            "profile.html": "user-settings",
            "sales_history.html": "sales-history"
        };

        function tabToken() {
            try {
                return sessionStorage.getItem("pharma_tab_token") || "";
            } catch (error) {
                return "";
            }
        }

        function apiBaseUrl() {
            const localHost = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
            const developmentPort = localHost && !['', '80', '443'].includes(window.location.port);
            // Resolve the API beside the actual app folder. A hard-coded project
            // name breaks when this checkout is served under a different folder.
            const frontendMarker = '/pharma-frontend/';
            const pagePath = window.location.pathname;
            const frontendIndex = pagePath.toLowerCase().indexOf(frontendMarker);
            const appPath = frontendIndex >= 0 ? pagePath.slice(0, frontendIndex) : '';
            const apiOrigin = developmentPort
                ? `${window.location.protocol}//${window.location.hostname}`
                : window.location.origin;
            if (frontendIndex >= 0) {
                return `${apiOrigin}${appPath}/pharma-api/v1`;
            }
            return new URL('../pharma-api/v1', window.location.href).href.replace(/\/$/, '');
        }

        async function loadCurrentSession() {
            if (window.__drpSession) return window.__drpSession;

            return new Promise(resolve => {
                let settled = false;
                let timeoutId = 0;

                const finish = session => {
                    if (settled) return;
                    settled = true;
                    window.clearTimeout(timeoutId);
                    window.removeEventListener("pharma:session-ready", handleSessionReady);
                    resolve(session && typeof session === "object" ? session : window.__drpSession || null);
                };

                const handleSessionReady = event => finish(event.detail);
                const waitForSharedSession = () => {
                    if (settled) return;
                    const sharedSessionPromise = window.__drpSessionReadyPromise;
                    if (sharedSessionPromise && typeof sharedSessionPromise.then === "function") {
                        sharedSessionPromise.then(finish).catch(() => finish(null));
                        return;
                    }
                    window.setTimeout(waitForSharedSession, 25);
                };

                window.addEventListener("pharma:session-ready", handleSessionReady, { once: true });
                timeoutId = window.setTimeout(() => finish(null), 10000);
                waitForSharedSession();
            });
        }

        function ensureProfileModal(session) {
            if (document.getElementById("navbarProfileModal")) return;
            const modal = document.createElement("div");
            modal.className = "modal fade";
            modal.id = "navbarProfileModal";
            modal.tabIndex = -1;
            modal.setAttribute("aria-hidden", "true");
            modal.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <form id="navbarProfileForm" novalidate>
                            <div class="modal-header">
                                <h5 class="modal-title fw-bold">User Settings</h5>
                                <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <p class="navbar-profile-error" id="navbarProfileError"></p>
                                <div class="row g-3">
                                    <div class="col-12">
                                        <label class="form-label" for="navbarProfileFullName">Full Name</label>
                                        <input class="form-control" id="navbarProfileFullName" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="navbarProfileEmail">Email</label>
                                        <input class="form-control" id="navbarProfileEmail" type="email">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="navbarProfileContact">Contact Number</label>
                                        <input class="form-control" id="navbarProfileContact">
                                    </div>
                                    <div class="col-12"><hr class="my-1"></div>
                                    <div class="col-12">
                                        <label class="form-label" for="navbarCurrentPassword">Current Password</label>
                                        <input class="form-control" id="navbarCurrentPassword" type="password" autocomplete="current-password">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="navbarNewPassword">New Password</label>
                                        <input class="form-control" id="navbarNewPassword" type="password" autocomplete="new-password">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="navbarConfirmPassword">Confirm Password</label>
                                        <input class="form-control" id="navbarConfirmPassword" type="password" autocomplete="new-password">
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-light" type="button" data-bs-dismiss="modal">Cancel</button>
                                <button class="btn btn-primary" type="submit">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>`;
            document.body.appendChild(modal);

            const style = document.createElement("style");
            style.id = "navbar-profile-modal-styles";
            style.textContent = `
                .navbar-profile-error{display:none;margin:0 0 12px;padding:10px 12px;border:1px solid #fecaca;border-radius:8px;color:#991b1b;background:#fef2f2;font-size:13px;font-weight:800}
                .navbar-profile-error.is-visible{display:block}
            `;
            document.head.appendChild(style);

            const form = document.getElementById("navbarProfileForm");
            const error = document.getElementById("navbarProfileError");
            const fields = {
                fullName: document.getElementById("navbarProfileFullName"),
                email: document.getElementById("navbarProfileEmail"),
                contact: document.getElementById("navbarProfileContact"),
                currentPassword: document.getElementById("navbarCurrentPassword"),
                newPassword: document.getElementById("navbarNewPassword"),
                confirmPassword: document.getElementById("navbarConfirmPassword")
            };

            function setError(message = "") {
                error.textContent = message;
                error.classList.toggle("is-visible", Boolean(message));
            }

            window.__drpOpenNavbarProfile = function openNavbarProfile(currentSession = session) {
                setError("");
                form.reset();
                fields.fullName.value = currentSession?.full_name || "";
                fields.email.value = currentSession?.email || "";
                fields.contact.value = currentSession?.contact_number || "";
                window.bootstrap?.Modal.getOrCreateInstance(modal)?.show();
            };

            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                setError("");
                const fullName = fields.fullName.value.trim();
                const email = fields.email.value.trim();
                const contactNumber = fields.contact.value.trim();
                const currentPassword = fields.currentPassword.value;
                const newPassword = fields.newPassword.value;
                const confirmPassword = fields.confirmPassword.value;
                if (!fullName) {
                    setError("Full Name is required.");
                    return;
                }
                if ((currentPassword || newPassword || confirmPassword) && (!currentPassword || !newPassword || !confirmPassword)) {
                    setError("Current password, new password, and confirmation are required to change password.");
                    return;
                }
                if (newPassword && newPassword !== confirmPassword) {
                    setError("New password and confirmation do not match.");
                    return;
                }
                try {
                    const headers = {
                        "Content-Type": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Tab-Token": tabToken()
                    };
                    const profileResponse = await fetch(`${apiBaseUrl()}/auth/update_profile.php`, {
                        method: "POST",
                        credentials: "include",
                        headers,
                        body: JSON.stringify({ full_name: fullName, email, contact_number: contactNumber })
                    });
                    const profileData = await profileResponse.json().catch(() => ({}));
                    if (!profileResponse.ok || profileData.status === "error") {
                        throw new Error(profileData.message || "Unable to update profile.");
                    }
                    if (newPassword) {
                        const passwordResponse = await fetch(`${apiBaseUrl()}/auth/update_password.php`, {
                            method: "POST",
                            credentials: "include",
                            headers,
                            body: JSON.stringify({
                                current_password: currentPassword,
                                new_password: newPassword,
                                confirm_password: confirmPassword
                            })
                        });
                        const passwordData = await passwordResponse.json().catch(() => ({}));
                        if (!passwordResponse.ok || passwordData.status === "error") {
                            throw new Error(passwordData.message || "Unable to update password.");
                        }
                    }
                    window.__drpNavbarProfileDisplay?.render(
                        container,
                        { ...session, ...profileData, full_name: fullName, email, contact_number: contactNumber },
                        { cache: true, roleLabel: rbac.roleLabel(session) }
                    );
                    window.bootstrap?.Modal.getOrCreateInstance(modal)?.hide();
                    if (window.toastr) toastr.success("Profile updated.");
                } catch (errorMessage) {
                    setError(errorMessage.message || "Unable to update profile.");
                }
            });
        }

        function applyRoleNavigation(session) {
            const roles = rbac.sessionRoleSet(session);
            if (!session || !roles.size) {
                container.querySelectorAll("[data-nav-page]").forEach(link => {
                    link.classList.add("d-none");
                    link.setAttribute("aria-hidden", "true");
                });
                return;
            }
            const accessRole = rbac.primaryAccessRole(session);
            const currentFilename = window.location.pathname.split("/").pop() || "";
            if (!rbac.isPageAllowed(session, currentFilename)) {
                const safePage = accessRole === "salesclerk"
                    ? "sales_clerk_dashboard.html"
                    : accessRole === "cashier"
                        ? "cashier_pos.html"
                        : accessRole === "supervisor"
                            ? "supervisor_dashboard.html"
                        : "dashboard.html";
                window.location.replace(`${safePage}?access=denied`);
                return;
            }
            const allowedPages = rbac.allowedNavigationPages(session);
            const allowAll = allowedPages === "*";
            document.body.dataset.sessionRole = accessRole;
            document.documentElement.classList.add("navbar-role-ready");
            window.__drpNavbarProfileDisplay?.render(container, session, {
                accessRole,
                allowedPages: allowAll ? "*" : Array.from(allowedPages),
                cache: true,
                roleLabel: rbac.roleLabel(session)
            });
            ensureProfileModal(session);

            container.querySelectorAll("[data-nav-page]").forEach(link => {
                const page = link.dataset.navPage || "";
                const isAllowed = page === "supervisor-approval"
                    ? accessRole === "supervisor"
                    : allowAll || allowedPages.has(page);
                link.classList.toggle("d-none", !isAllowed);
                link.setAttribute("aria-hidden", isAllowed ? "false" : "true");
            });

            if (accessRole === "salesclerk") {
                const dashboardLink = container.querySelector(".sidebar-nav [data-nav-page='dashboard']");
                if (dashboardLink) dashboardLink.href = "sales_clerk_dashboard.html";
                const reportsLink = container.querySelector(".sidebar-nav [data-nav-page='reports']");
                if (reportsLink) reportsLink.href = "sales_clerk_reports.html";
            }

            if (accessRole === "manager") {
                const userManagementLink = container.querySelector("[data-nav-page='settings']");
                if (userManagementLink) {
                    userManagementLink.href = "admin_settings.html?section=users";
                    userManagementLink.title = "User Management";
                    const label = userManagementLink.querySelector(".nav-label");
                    if (label) label.textContent = "User Management";
                }
            }

            if (accessRole === "supervisor") {
                window.__drpNavbarBootstrap?.renderSupervisorNavigation(container);
                container.querySelectorAll(".sidebar-user-action:not([data-auth-action='logout'])").forEach(link => {
                    const isUserSettings = link.dataset.navPage === "user-settings";
                    link.classList.toggle("d-none", !isUserSettings);
                    link.setAttribute("aria-hidden", isUserSettings ? "false" : "true");
                });
            }

            container.querySelectorAll("[data-bs-toggle='collapse']").forEach(trigger => {
                const selector = trigger.getAttribute("href") || "";
                const group = selector.startsWith("#") ? container.querySelector(selector) : null;
                const hasVisibleChild = Boolean(group?.querySelector("[data-nav-page]:not(.d-none)"));
                trigger.classList.toggle("d-none", !hasVisibleChild);
                trigger.setAttribute("aria-hidden", hasVisibleChild ? "false" : "true");
                group?.classList.toggle("d-none", !hasVisibleChild);
            });

            if (accessRole === "cashier") {
                container.querySelector(".sidebar-brand")?.setAttribute("href", "cashier_pos.html");
                container.querySelectorAll(".sidebar-user-action:not([data-auth-action='logout'])").forEach(link => {
                    const isUserSettings = link.dataset.navPage === "user-settings";
                    link.classList.toggle("d-none", !isUserSettings);
                    link.setAttribute("aria-hidden", isUserSettings ? "false" : "true");
                    if (isUserSettings) {
                        link.href = "profile.html";
                        link.querySelector("span").textContent = "Profile Settings";
                        delete link.dataset.profileAction;
                    }
                });
                return;
            }

            if (accessRole === "salesclerk") {
                container.querySelector(".sidebar-brand")?.setAttribute("href", "sales_clerk_dashboard.html");
                container.querySelectorAll(".sidebar-user-action:not([data-auth-action='logout'])").forEach(link => {
                    const isUserSettings = link.dataset.navPage === "user-settings";
                    link.classList.toggle("d-none", !isUserSettings);
                    link.setAttribute("aria-hidden", isUserSettings ? "false" : "true");
                    if (isUserSettings) {
                        link.href = "profile.html";
                        link.querySelector("span").textContent = "Profile Settings";
                        delete link.dataset.profileAction;
                    }
                });
            }
        }

        const dashboardViewMap = {
            dashboard: "dashboard",
            "dashboard/billing": "billing",
            "dashboard/user/settings": "user-settings",
            "dashboard/products": "products",
            "dashboard/inspect-deliveries": "inspect-deliveries",
            "dashboard/inventory": "inventory",
            "dashboard/suppliers": "supplier",
            "dashboard/pos": "pos",
            "dashboard/clerk": "clerk",
            "dashboard/purchase-orders": "purchase-orders",
            "dashboard/purchase-requests": "purchase-requests",
            "dashboard/supervisor-approval": "supervisor-approval",
            "dashboard/arrived-orders": "arrived-orders",
            "dashboard/complete-delivery": "complete-delivery",
            "dashboard/cancelled-purchase-orders": "cancelled-purchase-orders",
            "dashboard/return-damage": "return-damage",
            "dashboard/expiry-monitoring": "expiry-monitoring",
            "dashboard/sales-clerk-orders": "sales-clerk-orders",
            "dashboard/sales-clerk-pos": "sales-clerk-pos",
            "dashboard/cashier-pos": "cashier-pos",
            "dashboard/cashier-queue": "cashier-queue",
            "dashboard/cashier-history": "cashier-history",
            "dashboard/completed-sales": "completed-sales",
            "dashboard/cancelled-sales": "cancelled-sales",
            "dashboard/receipt-history": "receipt-history",
            "dashboard/cashier-shift": "cashier-shift",
            "dashboard/sales-history": "sales-history"
        };

        function normalizeDashboardView(view) {
            return String(view || "")
                .replace(/^#/, "")
                .replace(/^\/+/, "")
                .replace(/\/+$/, "")
                || "dashboard";
        }

        function getDashboardView() {
            const hashView = normalizeDashboardView(window.location.hash);
            if (hashView && hashView !== "dashboard") return hashView;

            const activePage = pageMap[filename] || "dashboard";
            const activeLink = container.querySelector(`[data-nav-page="${activePage}"]`);
            return normalizeDashboardView(activeLink?.dataset.dashboardView || activePage);
        }

        function getActivePage() {
            const dashboardView = getDashboardView();
            if (dashboardViewMap[dashboardView]) return dashboardViewMap[dashboardView];

            return pageMap[filename] || "";
        }

        function setDashboardViewState() {
            const view = getDashboardView();
            document.body.dataset.dashboardView = view;
            document.body.dataset.dashboardPage = "dashboard";
            sessionStorage.setItem("drpDashboardView", view);
        }

        function setUserPopoverOpen(isOpen) {
            const footer = container.querySelector(".sidebar-profile-footer");
            const trigger = container.querySelector("#sidebarUserMenuButton");
            const popover = container.querySelector("#sidebarUserPopover");
            const isSlim = sidebar?.classList.contains("collapsed");

            if (popover && isOpen) {
                if (isSlim) {
                    container.appendChild(popover);
                    popover.classList.add("slim-popover");
                } else if (footer && popover.parentElement !== footer) {
                    const directSignout = footer.querySelector(".sidebar-signout-direct");
                    footer.insertBefore(popover, directSignout);
                    popover.classList.remove("slim-popover");
                }
            }

            footer?.classList.toggle("user-popover-open", isOpen);
            popover?.classList.toggle("is-open", isOpen);
            trigger?.setAttribute("aria-expanded", String(isOpen));
        }

        function getSlimFlyout() {
            let flyout = container.querySelector(".sidebar-slim-flyout");
            if (flyout) return flyout;

            flyout = document.createElement("div");
            flyout.className = "sidebar-slim-flyout";
            flyout.setAttribute("role", "menu");
            container.appendChild(flyout);
            return flyout;
        }

        function closeSlimFlyout() {
            const flyout = container.querySelector(".sidebar-slim-flyout");
            flyout?.classList.remove("is-open");
            container.querySelectorAll("[data-bs-toggle='collapse']").forEach(trigger => {
                trigger.classList.remove("slim-flyout-open");
                if (sidebar?.classList.contains("collapsed")) {
                    trigger.setAttribute("aria-expanded", "false");
                }
            });
        }

        function positionSlimFlyout(trigger, flyout) {
            const rect = trigger.getBoundingClientRect();
            const top = Math.max(12, Math.min(rect.top, window.innerHeight - 260));
            flyout.style.top = `${top}px`;
        }

        function openSlimFlyout(trigger) {
            const targetSelector = trigger.getAttribute("href");
            const collapse = targetSelector?.startsWith("#") ? container.querySelector(targetSelector) : null;
            if (!collapse) return;

            const flyout = getSlimFlyout();
            const title = trigger.querySelector(".nav-label")?.textContent?.trim() || trigger.getAttribute("title") || "Menu";
            const links = Array.from(collapse.querySelectorAll("a.nav-link-item[href]"));

            flyout.innerHTML = `<div class="sidebar-slim-flyout-title">${title}</div>`;
            links.forEach(link => {
                const flyoutLink = document.createElement("a");
                flyoutLink.className = "sidebar-slim-flyout-link nav-link-item";
                flyoutLink.href = link.getAttribute("href") || "#";
                flyoutLink.title = link.getAttribute("title") || link.textContent.trim();
                flyoutLink.dataset.navPage = link.dataset.navPage || "";
                flyoutLink.dataset.dashboardView = link.dataset.dashboardView || "";
                flyoutLink.setAttribute("role", "menuitem");
                flyoutLink.innerHTML = `${link.querySelector("i")?.outerHTML || ""}<span>${link.querySelector(".nav-label")?.textContent?.trim() || flyoutLink.title}</span>`;
                if (link.classList.contains("active")) {
                    flyoutLink.classList.add("active");
                }
                flyout.appendChild(flyoutLink);
            });

            container.querySelectorAll("[data-bs-toggle='collapse']").forEach(item => item.classList.remove("slim-flyout-open"));
            trigger.classList.add("slim-flyout-open");
            trigger.setAttribute("aria-expanded", "true");
            positionSlimFlyout(trigger, flyout);
            flyout.classList.add("is-open");
        }

        function handleSlimCollapseClick(event) {
            const trigger = event.target.closest("a.nav-link-item[data-bs-toggle='collapse']");
            if (!trigger || !container.contains(trigger)) return;
            if (!sidebar?.classList.contains("collapsed")) {
                closeSlimFlyout();
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const flyout = container.querySelector(".sidebar-slim-flyout");
            const isSameOpen = flyout?.classList.contains("is-open") && trigger.classList.contains("slim-flyout-open");
            if (isSameOpen) {
                closeSlimFlyout();
                return;
            }

            setUserPopoverOpen(false);
            openSlimFlyout(trigger);
        }

        function closeUserPopoverFromOutside(event) {
            const footer = container.querySelector(".sidebar-profile-footer");
            const popover = container.querySelector("#sidebarUserPopover");
            if (!footer || (!footer.classList.contains("user-popover-open") && !popover?.classList.contains("is-open"))) return;
            if (footer.contains(event.target)) return;
            if (popover?.contains(event.target)) return;
            setUserPopoverOpen(false);
        }

        function closeSlimFlyoutFromOutside(event) {
            const flyout = container.querySelector(".sidebar-slim-flyout");
            if (!flyout || !flyout.classList.contains("is-open")) return;
            if (flyout.contains(event.target)) return;
            if (event.target.closest("a.nav-link-item[data-bs-toggle='collapse']")) return;
            closeSlimFlyout();
        }

        function handleUserPopoverClick(event) {
            const trigger = event.target.closest("#sidebarUserMenuButton, .sidebar-user-menu-toggle");
            if (!trigger || !container.contains(trigger)) return;

            event.preventDefault();
            const footer = trigger.closest(".sidebar-profile-footer");
            setUserPopoverOpen(!footer?.classList.contains("user-popover-open"));
        }

        function handleNavbarKeydown(event) {
            if (event.key !== "Escape") return;
            setUserPopoverOpen(false);
            closeSlimFlyout();
            if (document.body.classList.contains("sidebar-open")) {
                saveNavbarScrollPosition(true);
                setSidebarState(true);
                scheduleNavbarScrollRestore(false);
                headerSidebarToggle?.focus({ preventScroll: true });
            }
        }

        function getActiveLabel() {
            const activePage = getActivePage();
            const pageMap = {
                "dashboard": "Dashboard",
                "products": "Products",
                "inventory": "Storage Inventory",
                "shelf-inventory": "Shelf Inventory",
                "supplier": "Suppliers",
                "settings": "Admin Settings",
                "billing": "Billing",
                "user-settings": "User Settings",
                "purchase-orders": "Purchase Orders",
                "purchase-requests": "Purchase Requests",
                "supervisor-approval": "PR Approvals",
                "arrived-orders": "Arrived Orders",
                "complete-delivery": "Complete Delivery",
                "cancelled-purchase-orders": "Cancelled Purchase Orders",
                "return-damage": "Return/Damage",
                "expiry-monitoring": "Expiry Monitoring",
                "returns-disposals": "Returns & Disposals",
                "pos": "POS",
                "clerk": "Salesclerk",
                "sales-clerk-orders": "My Orders",
                "cashier-pos": "Cashier POS",
                "cashier-queue": "Order Queue",
                "cashier-history": "Cashier Transaction History",
                "cancelled-sales": "Cancelled Sales",
                "receipt-history": "Receipt History",
                "cashier-shift": "Shift Summary",
                "cashier-profile": "Profile Settings",
                "sales-history": "Sales History"
            };
            return pageMap[activePage] || "Dashboard";
        }

        function updateSidebarToggleState(isOpen) {
            sidebarToggle?.setAttribute("aria-expanded", String(isOpen));
            sidebarToggle?.setAttribute("aria-label", "Close sidebar");
            const tooltip = sidebarToggle.querySelector(".sidebar-tooltip");
            if (tooltip) tooltip.textContent = "Close sidebar";
            headerSidebarToggle?.setAttribute("aria-expanded", String(isOpen));
            headerSidebarToggle?.setAttribute("aria-label", "Open sidebar");
            const headerTooltip = headerSidebarToggle?.querySelector(".sidebar-tooltip");
            if (headerTooltip) headerTooltip.textContent = "Open sidebar";
        }

        function openSidebar() {
            sidebar?.classList.remove("collapsed");
            sidebar?.classList.add("is-expanded");
            mainWrapper?.classList.remove("collapsed");
            document.body.classList.remove("navbar-sidebar-collapsed");
            document.body.classList.add("sidebar-open");
            document.documentElement.classList.remove("sidebar-collapsed");
            document.documentElement.classList.add("sidebar-expanded");
            updateSidebarToggleState(true);
            closeSlimFlyout();
        }

        function closeSidebar() {
            sidebar?.classList.add("collapsed");
            sidebar?.classList.remove("is-expanded");
            mainWrapper?.classList.add("collapsed");
            document.body.classList.add("navbar-sidebar-collapsed");
            document.body.classList.remove("sidebar-open");
            document.documentElement.classList.add("sidebar-collapsed");
            document.documentElement.classList.remove("sidebar-expanded");
            updateSidebarToggleState(false);
        }

        function toggleSidebar() {
            if (document.body.classList.contains("sidebar-open")) closeSidebar();
            else openSidebar();
        }

        function setSidebarState(isCollapsed) {
            if (isCollapsed) closeSidebar();
            else openSidebar();
        }

        function getNavbarScrollContainer() {
            return container.querySelector(".sidebar-nav");
        }

        function navbarScrollStorageKey() {
            return sidebar?.classList.contains("collapsed")
                ? navbarScrollKeys.collapsed
                : navbarScrollKeys.expanded;
        }

        function saveNavbarScrollPosition(force = false) {
            const scrollContainer = getNavbarScrollContainer();
            if (!scrollContainer || (isRestoringNavbarScroll && !force)) return;

            const isCollapsed = sidebar?.classList.contains("collapsed");
            const hasMeaningfulScroll = scrollContainer.scrollHeight > scrollContainer.clientHeight + 1;
            if (isCollapsed && !hasMeaningfulScroll) return;

            try {
                sessionStorage.setItem(navbarScrollStorageKey(), String(scrollContainer.scrollTop));
            } catch (error) {}
        }

        function ensureActiveNavbarItemVisible() {
            const scrollContainer = getNavbarScrollContainer();
            const activeItem = scrollContainer?.querySelector(".nav-link-item.active");
            if (!scrollContainer || !activeItem) return;

            const containerRect = scrollContainer.getBoundingClientRect();
            const activeRect = activeItem.getBoundingClientRect();
            const topPadding = 12;
            const bottomPadding = 12;

            if (activeRect.top < containerRect.top + topPadding) {
                scrollContainer.scrollTop -= containerRect.top + topPadding - activeRect.top;
            } else if (activeRect.bottom > containerRect.bottom - bottomPadding) {
                scrollContainer.scrollTop += activeRect.bottom - (containerRect.bottom - bottomPadding);
            }
        }

        function restoreNavbarScrollPosition(ensureActive = true) {
            const scrollContainer = getNavbarScrollContainer();
            if (!scrollContainer) return;

            let storedValue = null;
            try {
                storedValue = sessionStorage.getItem(navbarScrollStorageKey());
            } catch (error) {}

            isRestoringNavbarScroll = true;
            if (storedValue !== null) {
                const storedScrollTop = Number(storedValue);
                if (Number.isFinite(storedScrollTop)) {
                    const maximumScroll = Math.max(scrollContainer.scrollHeight - scrollContainer.clientHeight, 0);
                    scrollContainer.scrollTop = Math.min(Math.max(storedScrollTop, 0), maximumScroll);
                }
            }
            if (ensureActive) ensureActiveNavbarItemVisible();

            requestAnimationFrame(() => {
                isRestoringNavbarScroll = false;
            });
        }

        function scheduleNavbarScrollRestore(ensureActive = true) {
            if (navbarScrollRestoreFrame) cancelAnimationFrame(navbarScrollRestoreFrame);
            navbarScrollRestoreFrame = requestAnimationFrame(() => {
                navbarScrollRestoreFrame = requestAnimationFrame(() => {
                    navbarScrollRestoreFrame = 0;
                    restoreNavbarScrollPosition(ensureActive);
                });
            });
        }

        function setCollapseArrow(collapse) {
            const trigger = document.querySelector(`[href="#${collapse.id}"]`);
            const arrow = trigger?.querySelector(".collapse-arrow");
            if (!trigger || !arrow) return;
            const isOpen = collapse.classList.contains("show");
            trigger.setAttribute("aria-expanded", String(isOpen));
            arrow.classList.toggle("fa-angle-right", !isOpen);
            arrow.classList.toggle("fa-angle-down", isOpen);
        }

        function persistExpandedGroup(groupId, isExpanded) {
            if (!groupId) return;
            const storageKey = window.__drpNavbarExpandedGroupsKey || "drpNavbarExpandedGroups";
            try {
                const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
                const groups = new Set(Array.isArray(stored) ? stored : []);
                if (isExpanded) groups.add(groupId);
                else groups.delete(groupId);
                localStorage.setItem(storageKey, JSON.stringify(Array.from(groups)));
            } catch (error) {}
        }

        function saveExpandedGroupsState() {
            const storageKey = window.__drpNavbarExpandedGroupsKey || "drpNavbarExpandedGroups";
            const expandedGroupIds = Array.from(container.querySelectorAll(".sidebar-nav .collapse.show"))
                .map(collapse => collapse.id)
                .filter(Boolean);
            try {
                localStorage.setItem(storageKey, JSON.stringify(expandedGroupIds));
            } catch (error) {}
        }

        function restoreExpandedGroupsState() {
            const storageKey = window.__drpNavbarExpandedGroupsKey || "drpNavbarExpandedGroups";
            let expandedGroupIds = [];
            try {
                const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
                expandedGroupIds = Array.isArray(stored) ? stored : [];
            } catch (error) {}

            const expandedGroups = new Set(expandedGroupIds);
            container.querySelectorAll(".sidebar-nav .collapse").forEach(collapse => {
                if (expandedGroups.has(collapse.id)) collapse.classList.add("show");
                setCollapseArrow(collapse);
            });
        }

        let activeGroupInitialized = false;
        function applyActiveNavigation({ expandActiveGroup = false } = {}) {
            setDashboardViewState();
            container.querySelectorAll(".nav-link-item.active").forEach(link => link.classList.remove("active"));
            const activeLink = container.querySelector(`[data-nav-page="${getActivePage()}"]`);
            activeLink?.classList.add("active");
            if (expandActiveGroup && !activeGroupInitialized) {
                activeLink?.closest(".collapse")?.classList.add("show");
                activeGroupInitialized = true;
            }
            container.querySelectorAll(".collapse").forEach(setCollapseArrow);
        }

        function handleSidebarNavigation(event) {
            if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

            const link = event.target.closest("a.nav-link-item[href], a.sidebar-brand[href]");
            if (!link || !container.contains(link)) return;
            if (link.matches("[data-bs-toggle='collapse']")) return;

            const href = link.getAttribute("href") || "";
            if (href === "#") {
                event.preventDefault();
                return;
            }

            if (link.closest(".sidebar-user-popover")) {
                setUserPopoverOpen(false);
            }
            if (link.closest(".sidebar-slim-flyout")) {
                closeSlimFlyout();
            }

            const targetUrl = window.__drpNavigationRuntime.moduleUrl(link);
            if (!targetUrl) return;
            const isSamePath = targetUrl.pathname === window.location.pathname;
            const isSameHash = targetUrl.hash === window.location.hash || (!targetUrl.hash && !window.location.hash);
            const isActiveModule = link.dataset.navPage && link.dataset.navPage === getActivePage();

            if ((isSamePath && isSameHash) || isActiveModule) {
                event.preventDefault();
                event.stopPropagation();
                setSidebarState(true);
                return;
            }

            const dashboardView = normalizeDashboardView(link.dataset.dashboardView || targetUrl.hash);
            if (dashboardView) {
                sessionStorage.setItem("drpDashboardView", dashboardView);
            }
            sessionStorage.setItem("drpLastNavigationTarget", dashboardView || link.dataset.navPage || targetUrl.pathname);

            event.preventDefault();
            saveExpandedGroupsState();
            saveNavbarScrollPosition(true);
            setSidebarState(true);
            window.__drpNavigationRuntime.navigate(targetUrl);
        }

        function closeSidebarFromOutside(event) {
            if (!sidebar || sidebar.classList.contains("collapsed")) return;
            if (sidebar.contains(event.target)) return;
            if (event.target.closest("#sidebarToggle, #sidebarOpenToggle")) return;
            if (event.target.closest(".modal, .modal-backdrop, .swal2-container, .toast, .toast-container")) return;

            saveNavbarScrollPosition(true);
            setSidebarState(true);
            scheduleNavbarScrollRestore(false);
        }

        function handleNavbarCollapseClick(event) {
            const trigger = event.target.closest("a.nav-link-item[data-bs-toggle='collapse']");
            if (!trigger || !container.contains(trigger) || sidebar?.classList.contains("collapsed")) return;
            if (window.bootstrap?.Collapse) return;

            const targetId = (trigger.getAttribute("href") || "").slice(1);
            const collapse = targetId ? document.getElementById(targetId) : null;
            if (!collapse || !container.contains(collapse)) return;

            event.preventDefault();
            const isExpanded = !collapse.classList.contains("show");
            const beforeEvent = new Event(isExpanded ? "show.bs.collapse" : "hide.bs.collapse", {
                bubbles: true,
                cancelable: true
            });
            if (!collapse.dispatchEvent(beforeEvent)) return;

            collapse.classList.toggle("show", isExpanded);
            setCollapseArrow(collapse);
            persistExpandedGroup(collapse.id, isExpanded);
            collapse.dispatchEvent(new Event(isExpanded ? "shown.bs.collapse" : "hidden.bs.collapse", { bubbles: true }));
            scheduleNavbarScrollRestore(false);
        }

        function prefetchNavigationTarget(event) {
            const link = event.target.closest("a.nav-link-item[href], a.sidebar-brand[href]");
            if (!link || !container.contains(link)) return;
            window.__drpNavigationRuntime.prefetch(link);
        }

        container.addEventListener("click", (event) => {
            const profileLink = event.target.closest("[data-profile-action='open']");
            if (!profileLink || !container.contains(profileLink)) return;
            event.preventDefault();
            setUserPopoverOpen(false);
            window.__drpOpenNavbarProfile?.();
        });

        container.querySelectorAll(".collapse").forEach(collapse => {
            setCollapseArrow(collapse);
            collapse.addEventListener("show.bs.collapse", () => saveNavbarScrollPosition(true));
            collapse.addEventListener("hide.bs.collapse", () => saveNavbarScrollPosition(true));
            collapse.addEventListener("shown.bs.collapse", () => {
                setCollapseArrow(collapse);
                persistExpandedGroup(collapse.id, true);
                scheduleNavbarScrollRestore(false);
            });
            collapse.addEventListener("hidden.bs.collapse", () => {
                setCollapseArrow(collapse);
                persistExpandedGroup(collapse.id, false);
                scheduleNavbarScrollRestore(false);
            });
        });

        restoreExpandedGroupsState();
        applyActiveNavigation({ expandActiveGroup: true });
        initializeSharedTopbar({ filename, apiBaseUrl, tabToken, loadCurrentSession });
        headerSidebarToggle = document.getElementById("sidebarOpenToggle");
        enhanceDataTables();
        window.addEventListener("hashchange", () => {
            applyActiveNavigation();
            scheduleNavbarScrollRestore();
        });
        setSidebarState(savedCollapsed);
        const handleSidebarToggle = () => {
            saveNavbarScrollPosition(true);
            toggleSidebar();
            scheduleNavbarScrollRestore(false);
        };
        sidebarToggle?.addEventListener("click", handleSidebarToggle);
        headerSidebarToggle?.addEventListener("click", handleSidebarToggle);
        sidebar?.addEventListener("transitionend", event => {
            if (event.target === sidebar && event.propertyName === "width") {
                window.dispatchEvent(new Event("resize"));
            }
        });
        getNavbarScrollContainer()?.addEventListener("scroll", () => saveNavbarScrollPosition(), { passive: true });
        container.addEventListener("click", handleSlimCollapseClick, true);
        container.addEventListener("click", handleSidebarNavigation);
        container.addEventListener("click", handleNavbarCollapseClick);
        container.addEventListener("pointerover", prefetchNavigationTarget);
        container.addEventListener("focusin", prefetchNavigationTarget);
        container.addEventListener("click", handleUserPopoverClick);
        document.addEventListener("pointerdown", closeUserPopoverFromOutside);
        document.addEventListener("pointerdown", closeSlimFlyoutFromOutside);
        document.addEventListener("pointerdown", closeSidebarFromOutside);
        document.addEventListener("keydown", handleNavbarKeydown);
        window.addEventListener("resize", closeSlimFlyout);
        window.addEventListener("scroll", closeSlimFlyout, true);
        window.addEventListener("load", enhanceDataTables);
        window.addEventListener("drp:tables-updated", enhanceDataTables);
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                applyActiveNavigation();
                scheduleNavbarScrollRestore();
            }, { once: true });
        } else {
            scheduleNavbarScrollRestore();
        }
        window.addEventListener("pageshow", () => {
            applyActiveNavigation();
            scheduleNavbarScrollRestore();
        });
        window.addEventListener("pagehide", () => {
            saveExpandedGroupsState();
            saveNavbarScrollPosition(true);
        });
        loadCurrentSession()
            .then(currentSession => {
                applyRoleNavigation(currentSession);
                window.dispatchEvent(new CustomEvent("navbar:permissions-ready"));
                applyActiveNavigation();
                scheduleNavbarScrollRestore();
            })
            .catch(() => {})
            .finally(() => {
                window.clearTimeout(revealFailSafe);
                revealShell();
            });

        const tableObserver = new MutationObserver(() => {
            window.clearTimeout(window.__drpTableEnhanceTimer);
            window.__drpTableEnhanceTimer = window.setTimeout(enhanceDataTables, 90);
        });
        tableObserver.observe(document.body, { childList: true, subtree: true });

        window.dispatchEvent(new CustomEvent("navbar:ready", { detail: { activePage: getActivePage(), activeLabel: getActiveLabel(), dashboardView: getDashboardView() } }));
    } catch (error) {
        window.clearTimeout(revealFailSafe);
        document.body.classList.remove("navbar-state-booting");
        document.body.classList.remove("role-loading");
        document.documentElement.classList.add("app-ready");
        console.error("Unable to load the shared navbar:", error);
    }
}

function initializeSharedTopbar({ filename, apiBaseUrl, tabToken, loadCurrentSession }) {
    const topbar = document.querySelector(
        '#mainWrapper > .topbar, .main-wrapper > .topbar, '
        + '#mainWrapper > .cashier-topbar, .main-wrapper > .cashier-topbar, '
        + '#mainWrapper > .shift-topbar, .main-wrapper > .shift-topbar'
    );
    if (!topbar || topbar.dataset.drpSharedReady === 'true') return;
    topbar.dataset.drpSharedReady = 'true';
    topbar.classList.add('drp-shared-topbar');

    const searchPages = new Set(['dashboard.html', 'supervisor_dashboard.html', 'products.html', 'inventory.html', 'shelf_inventory.html', 'supplier.html', 'purchase_requests.html', 'supervisor_approval.html', 'admin_settings.html', 'sales_clerk_pos.html', 'sales_clerk_orders.html', 'cashier_pos.html']);
    const hasGlobalSearch = searchPages.has(filename);
    topbar.classList.toggle('has-global-search', hasGlobalSearch);

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    if (hasGlobalSearch && !document.getElementById('moduleSearchRoot')) {
        const search = document.createElement('div');
        search.className = 'topbar-search';
        search.id = 'moduleSearchRoot';
        search.innerHTML = `
            <div class="module-search-field">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input class="module-search-input" id="moduleSearchInput" type="search" placeholder="Search modules or actions..." autocomplete="off" aria-label="Search modules or actions" aria-expanded="false" aria-controls="moduleSearchPanel">
                <span class="module-search-shortcut">Ctrl K</span>
            </div>
            <div class="module-search-panel" id="moduleSearchPanel">
                <div class="module-search-results" id="moduleSearchResults" role="listbox" aria-label="Accessible modules"></div>
            </div>`;
        const left = topbar.querySelector('.topbar-left');
        left?.insertAdjacentElement('afterend', search);
    }

    function setupSearch() {
        const root = document.getElementById('moduleSearchRoot');
        const input = document.getElementById('moduleSearchInput');
        const panel = document.getElementById('moduleSearchPanel');
        const results = document.getElementById('moduleSearchResults');
        if (!root || !input || !panel || !results || root.dataset.ready === 'true') return;
        root.dataset.ready = 'true';
        let moduleIndex = [];
        let filtered = [];
        let activeIndex = 0;
        const normalize = (value) => String(value || '').trim().toLowerCase();
        const accessible = (anchor) => {
            const href = String(anchor.getAttribute('href') || '').trim();
            return Boolean(href && href !== '#' && !href.startsWith('#')
                && !anchor.matches("[data-auth-action='logout']")
                && !anchor.classList.contains('d-none')
                && !anchor.closest(".d-none,[aria-hidden='true']"));
        };
        const groupLabel = (anchor) => {
            const group = anchor.closest('.collapse');
            if (!group?.id) return anchor.classList.contains('sidebar-user-action') ? 'Account' : 'Navigation';
            return document.querySelector(`#navbar-container [href="#${CSS.escape(group.id)}"] .nav-label`)?.textContent?.trim() || 'Navigation';
        };
        const rebuild = () => {
            const seen = new Set();
            moduleIndex = Array.from(document.querySelectorAll('#navbar-container a[data-nav-page][href]'))
                .filter(accessible)
                .map((anchor) => {
                    const title = anchor.querySelector('.nav-label')?.textContent?.trim()
                        || anchor.querySelector('span')?.textContent?.trim()
                        || anchor.title || 'Module';
                    const href = anchor.getAttribute('href');
                    const group = groupLabel(anchor);
                    const iconClass = Array.from(anchor.querySelector('i')?.classList || []).filter(name => name.startsWith('fa-')).join(' ');
                    return { title, href, group, source: anchor, iconClass: iconClass || 'fa-solid fa-arrow-right', searchText: normalize(`${title} ${group} ${anchor.dataset.navPage || ''} ${href.replace(/[_.?#&=/-]+/g, ' ')}`) };
                })
                .filter(item => {
                    const key = `${item.title}|${item.href}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            if (document.activeElement === input) render();
        };
        const setOpen = (open) => {
            panel.classList.toggle('is-open', open);
            input.setAttribute('aria-expanded', String(open));
        };
        const render = () => {
            const query = normalize(input.value);
            filtered = moduleIndex.filter(item => !query || item.searchText.includes(query)).slice(0, 9);
            activeIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));
            results.innerHTML = filtered.length
                ? filtered.map((item, index) => `<button class="module-search-result${index === activeIndex ? ' is-active' : ''}" type="button" role="option" aria-selected="${index === activeIndex}" data-module-result="${index}"><span class="module-search-result-icon"><i class="${escapeHtml(item.iconClass)}"></i></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.group)}</small></span><i class="fa-solid fa-arrow-right module-search-result-arrow"></i></button>`).join('')
                : '<p class="module-search-empty">No accessible modules match your search.</p>';
            setOpen(true);
        };
        const activate = (index) => {
            const item = filtered[index];
            if (!item) return;
            setOpen(false);
            input.blur();
            item.source.click();
        };
        input.addEventListener('focus', () => { activeIndex = 0; render(); });
        input.addEventListener('input', () => { activeIndex = 0; render(); });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!filtered.length) return;
                activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
                render();
                results.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
            } else if (event.key === 'Enter') {
                event.preventDefault();
                activate(activeIndex);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                input.blur();
            }
        });
        results.addEventListener('mousemove', (event) => {
            const result = event.target.closest('[data-module-result]');
            if (!result) return;
            activeIndex = Number(result.dataset.moduleResult);
            results.querySelectorAll('.module-search-result').forEach((node, index) => {
                node.classList.toggle('is-active', index === activeIndex);
                node.setAttribute('aria-selected', String(index === activeIndex));
            });
        });
        results.addEventListener('click', (event) => {
            const result = event.target.closest('[data-module-result]');
            if (result) activate(Number(result.dataset.moduleResult));
        });
        document.addEventListener('click', (event) => { if (!root.contains(event.target)) setOpen(false); });
        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                input.focus();
            }
        });
        window.addEventListener('navbar:permissions-ready', rebuild);
        rebuild();
    }

    const titleContext = topbar.querySelector('.page-title-mini, .page-title, .title-wrap, .topbar-greeting');
    const documentModuleTitle = document.title.split('|').pop()?.trim();
    const moduleTitle = documentModuleTitle || titleContext?.querySelector('strong')?.textContent?.trim() || 'Pharmacy';
    if (titleContext) titleContext.classList.add('topbar-greeting');
    if (titleContext && !document.getElementById('sidebarOpenToggle')) {
        const openSidebarButton = document.createElement('button');
        openSidebarButton.id = 'sidebarOpenToggle';
        openSidebarButton.className = 'drp-sidebar-open-toggle';
        openSidebarButton.type = 'button';
        openSidebarButton.setAttribute('aria-expanded', 'false');
        openSidebarButton.setAttribute('aria-label', 'Open sidebar');
        openSidebarButton.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i><span class="sidebar-tooltip" role="tooltip">Open sidebar</span>';
        const moduleIcon = titleContext.previousElementSibling?.matches('.brand-tile, .page-icon')
            ? titleContext.previousElementSibling
            : titleContext;
        moduleIcon.insertAdjacentElement('beforebegin', openSidebarButton);
    }
    const renderModuleTitle = () => {
        if (!titleContext) return;
        const strong = titleContext.querySelector('strong');
        if (strong) strong.textContent = moduleTitle;
        titleContext.querySelectorAll('span').forEach((subtitle) => subtitle.remove());
        titleContext.setAttribute('aria-label', moduleTitle);
    };
    renderModuleTitle();

    let controls = topbar.querySelector('.topbar-right');
    topbar.querySelectorAll('#themeToggle, #dashboardBusinessHours, .date-pill, #currentDateTime').forEach((element) => element.remove());
    if (filename !== 'dashboard.html') {
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'topbar-right';
            const actions = topbar.querySelector('.topbar-actions');
            actions ? topbar.insertBefore(controls, actions) : topbar.appendChild(controls);
        }
        controls.classList.add('drp-topbar-controls');
        controls.querySelectorAll('button').forEach(button => {
            if (button.querySelector('.fa-bell, .fa-moon, .fa-sun')) button.remove();
        });
        const status = document.createElement('div');
        status.className = 'topbar-status';
        status.innerHTML = '<span class="command-chip" id="dashboardStoreStatus">Loading status...</span>';
        controls.insertBefore(status, controls.firstChild);
        const notifications = document.createElement('div');
        notifications.className = 'dashboard-notifications';
        notifications.innerHTML = `<button class="icon-btn notification-btn" type="button" id="dashboardNotificationButton" aria-label="Notifications" aria-expanded="false" aria-controls="dashboardNotificationMenu"><i class="fa-regular fa-bell"></i><span class="notification-badge is-hidden" id="dashboardNotificationBadge">0</span></button><div class="notification-menu drp-alert-menu" id="dashboardNotificationMenu" role="menu"><div class="notification-menu-header"><span class="notification-heading-icon"><i class="fa-solid fa-bell"></i></span><div class="notification-heading-copy"><strong>System alerts</strong><span id="dashboardNotificationSummary">Loading...</span></div><span class="notification-total" id="dashboardNotificationTotal">—</span></div><div class="notification-menu-list" id="dashboardNotificationList"><p class="notification-empty">Loading alerts...</p></div><div class="notification-menu-footer"><i class="fa-solid fa-circle-info"></i><span>Select an alert to review the related records.</span></div></div>`;
        controls.appendChild(notifications);
        const clock = document.createElement('div');
        clock.className = 'topbar-clock';
        clock.innerHTML = '<span id="dashboardTodayDate" aria-live="off"></span><strong id="dashboardCurrentTime" aria-live="off"></strong>';
        controls.appendChild(clock);
    } else {
        controls?.classList.add('drp-topbar-controls');
    }

    const readSettings = () => {
        try { return JSON.parse(localStorage.getItem('drpAdminSettings') || '{}') || {}; }
        catch (error) { return {}; }
    };
    let sharedBusinessSettings = readSettings();
    let businessHoursState = 'loading';
    const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const formatTime = (value) => {
        const [hours = '0', minutes = '00'] = String(value || '').split(':');
        const hour = Number(hours);
        if (!Number.isFinite(hour)) return '';
        return `${hour % 12 || 12}:${String(minutes).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
    };
    const configuredSchedule = (settings, now) => {
        const exception = settings.businessExceptions?.[dateKey(now)];
        if (exception && typeof exception === 'object') return exception;
        const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now);
        const dailySchedule = settings.businessSchedule?.[day];
        if (dailySchedule && typeof dailySchedule === 'object') return dailySchedule;
        if (settings.businessHours?.open && settings.businessHours?.close) {
            return { open: true, openTime: settings.businessHours.open, closeTime: settings.businessHours.close };
        }
        return null;
    };
    const renderBusinessHours = (now) => {
        const status = document.getElementById('dashboardStoreStatus');
        const hours = document.getElementById('dashboardBusinessHours');
        const schedule = configuredSchedule(sharedBusinessSettings, now);
        if (!schedule) {
            if (status) {
                status.textContent = businessHoursState === 'unavailable' ? 'Unavailable' : 'Loading...';
                status.classList.remove('open', 'closed');
            }
            if (hours) hours.textContent = businessHoursState === 'unavailable' ? 'Hours unavailable' : 'Loading hours...';
            return;
        }
        const openTime = schedule.openTime || schedule.openingTime;
        const closeTime = schedule.closeTime || schedule.closingTime;
        if (!openTime || !closeTime) {
            if (status) {
                status.textContent = schedule.open === false ? 'Closed' : 'Unavailable';
                status.classList.toggle('closed', schedule.open === false);
                status.classList.remove('open');
            }
            if (hours) hours.textContent = schedule.open === false ? 'Closed today' : 'Hours unavailable';
            return;
        }
        const [openHour, openMinute] = String(openTime).split(':').map(Number);
        const [closeHour, closeMinute] = String(closeTime).split(':').map(Number);
        const minutesNow = now.getHours() * 60 + now.getMinutes();
        const isOpen = schedule.open !== false
            && minutesNow >= openHour * 60 + openMinute
            && minutesNow < closeHour * 60 + closeMinute;
        if (status) {
            status.textContent = isOpen ? 'Open' : 'Closed';
            status.classList.toggle('open', isOpen);
            status.classList.toggle('closed', !isOpen);
        }
        if (hours) hours.textContent = schedule.open === false ? 'Closed today' : `${formatTime(openTime)} - ${formatTime(closeTime)}`;
    };
    const updateClock = () => {
        const now = new Date();
        const date = document.getElementById('dashboardTodayDate');
        const time = document.getElementById('dashboardCurrentTime');
        if (date) date.textContent = new Intl.DateTimeFormat('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).format(now);
        if (time) time.textContent = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
        renderBusinessHours(now);
    };
    updateClock();
    if (!window.__drpTopbarClockTimer) {
        window.__drpTopbarClockTimer = window.setInterval(updateClock, 1000);
    }
    if (!window.__drpTopbarSettingsListener) {
        window.__drpTopbarSettingsListener = true;
        window.addEventListener('drp:admin-settings-updated', (event) => {
            sharedBusinessSettings = event.detail && typeof event.detail === 'object' ? event.detail : readSettings();
            businessHoursState = configuredSchedule(sharedBusinessSettings, new Date()) ? 'ready' : businessHoursState;
            updateClock();
        });
    }

    const cachedSchedule = configuredSchedule(sharedBusinessSettings, new Date());
    if (cachedSchedule) businessHoursState = 'ready';
    const settingsHeaders = {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Tab-Token': tabToken()
    };
    const fetchSharedBusinessHours = () => fetch(`${apiBaseUrl()}/settings/get_business_hours.php`, { credentials: 'include', headers: settingsHeaders })
        .then(response => response.ok ? response.json() : Promise.reject(new Error(`Business-hours request failed (${response.status})`)))
        .then(data => {
            if (data.status === 'error' || !data.businessSchedule) throw new Error(data.message || 'Business-hours response was incomplete.');
            sharedBusinessSettings = {
                ...sharedBusinessSettings,
                businessSchedule: data.businessSchedule,
                businessExceptions: data.businessExceptions || {},
                nextBusinessException: data.nextBusinessException || null
            };
            businessHoursState = 'ready';
            try { localStorage.setItem('drpAdminSettings', JSON.stringify(sharedBusinessSettings)); }
            catch (error) { console.warn('Unable to cache shared business hours.', error); }
            updateClock();
        })
        .catch(error => {
            console.error('Unable to load shared business hours.', error);
            if (!configuredSchedule(sharedBusinessSettings, new Date())) businessHoursState = 'unavailable';
            updateClock();
        });
    Promise.resolve(typeof loadCurrentSession === 'function' ? loadCurrentSession() : null)
        .catch(() => null)
        .then(fetchSharedBusinessHours);

    function setupNotifications() {
        const button = document.getElementById('dashboardNotificationButton');
        const menu = document.getElementById('dashboardNotificationMenu');
        if (!button || !menu || button.dataset.ready === 'true') return;
        button.dataset.ready = 'true';
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const open = menu.classList.toggle('is-open');
            button.setAttribute('aria-expanded', String(open));
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.dashboard-notifications')) {
                menu.classList.remove('is-open');
                button.setAttribute('aria-expanded', 'false');
            }
        });
    }
    setupSearch();
    setupNotifications();

    if (filename !== 'dashboard.html') {
        const badge = document.getElementById('dashboardNotificationBadge');
        const list = document.getElementById('dashboardNotificationList');
        const summary = document.getElementById('dashboardNotificationSummary');
        const totalLabel = document.getElementById('dashboardNotificationTotal');
        const headers = { 'X-Requested-With': 'XMLHttpRequest', 'X-Tab-Token': tabToken() };
        let activeAlerts = [];
        let seenAlerts = {};
        let refreshUnreadCount = () => {};
        Promise.resolve(typeof loadCurrentSession === 'function' ? loadCurrentSession() : null)
            .then(session => {
                const sessionRoles = [
                    session?.access_role,
                    session?.role,
                    ...(Array.isArray(session?.roles) ? session.roles : []),
                    ...(Array.isArray(session?.role_identifiers) ? session.role_identifiers : [])
                ].map(role => String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_'));
                const isLimitedAlertsRole = sessionRoles.some(role =>
                    ['cashier', 'ro_cashier', 'salesclerk', 'sales_clerk', 'ro_sales_clerk', 'ro_salesclerk'].includes(role)
                );
                if (isLimitedAlertsRole) {
                    if (badge) badge.classList.add('is-hidden');
                    if (summary) summary.textContent = 'Not available for this role';
                    if (totalLabel) totalLabel.textContent = '—';
                    if (list) list.innerHTML = '<p class="notification-empty">System alerts are not available for this role.</p>';
                    return null;
                }
                const alertScope = encodeURIComponent(`${session?.account_id || session?.tenant_id || 'account'}:${session?.user_id || session?.username || session?.email || 'user'}`);
                const alertSeenKey = `drpReviewedAlerts:v1:${alertScope}`;
                try { seenAlerts = JSON.parse(localStorage.getItem(alertSeenKey) || '{}') || {}; } catch (error) {}
                refreshUnreadCount = () => {
                    const unread = activeAlerts.filter(alert => Number(seenAlerts[alert.label]) !== alert.count);
                    const unreadTotal = unread.reduce((sum, alert) => sum + alert.count, 0);
                    const openTotal = activeAlerts.reduce((sum, alert) => sum + alert.count, 0);
                    if (badge) { badge.textContent = unreadTotal > 99 ? '99+' : String(unreadTotal); badge.classList.toggle('is-hidden', unreadTotal === 0); }
                    if (summary) summary.textContent = unread.length ? `${unread.length} alert type${unread.length === 1 ? '' : 's'} not reviewed` : openTotal ? 'All current alerts reviewed' : 'No urgent items need attention';
                };
                if (list && list.dataset.readStateReady !== 'true') {
                    list.dataset.readStateReady = 'true';
                    list.addEventListener('click', event => {
                        const row = event.target.closest('a[data-alert-key]');
                        if (!row) return;
                        seenAlerts[row.dataset.alertKey] = Number(row.dataset.alertCount) || 0;
                        try { localStorage.setItem(alertSeenKey, JSON.stringify(seenAlerts)); } catch (error) {}
                        refreshUnreadCount();
                    });
                }
                return fetch(`${apiBaseUrl()}/dashboard/get_dashboard_summary.php?scope=alerts`, { credentials: 'include', headers });
            })
            .then(async response => {
                if (!response) return null;
                if (response.status === 401 || response.status === 403) throw new Error('auth');
                if (!response.ok) throw new Error(response.status >= 500 ? 'server' : `http-${response.status}`);
                let data;
                try { data = await response.json(); } catch (error) { throw new Error('invalid-response'); }
                if (data?.status === 'error') throw new Error('server');
                return data;
            })
            .then(data => {
                if (!data) return;
                const alerts = [
                    { label: 'Out of Stock', description: 'Products with no sellable units available', count: Number(data.out_of_stock || 0), href: 'inventory.html?stock_status=out_of_stock', icon: 'fa-box-open', tone: 'critical' },
                    { label: 'Low Stock', description: 'Products at or below their reorder level', count: Number(data.low_stock || 0), href: 'inventory.html?stock_status=low_stock', icon: 'fa-triangle-exclamation', tone: 'warning' },
                    { label: 'Expiring Soon', description: 'Active batches nearing their expiry date', count: Number(data.expiring_soon || 0), href: 'inventory.html?stock_status=expiring_soon', icon: 'fa-calendar-xmark', tone: 'warning' },
                    { label: 'Pending POs', description: 'Purchase orders awaiting the next step', count: Number(data.pending_po || 0), href: 'purchase_orders.html?status=Pending', icon: 'fa-file-circle-exclamation', tone: 'procurement' }
                ].filter(alert => alert.count > 0);
                activeAlerts = alerts;
                const total = alerts.reduce((sum, alert) => sum + alert.count, 0);
                refreshUnreadCount();
                if (totalLabel) totalLabel.textContent = total > 99 ? '99+ open' : `${total} open`;
                if (list) list.innerHTML = alerts.length
                    ? alerts.map(alert => `<a class="notification-menu-item tone-${alert.tone}" role="menuitem" data-alert-key="${escapeHtml(alert.label)}" data-alert-count="${alert.count}" href="${alert.href}"><span class="notification-item-icon"><i class="fa-solid ${alert.icon}"></i></span><span class="notification-item-copy"><strong>${escapeHtml(alert.label)}</strong><small>${escapeHtml(alert.description)}</small></span><span class="notification-item-count">${alert.count}</span><i class="fa-solid fa-chevron-right notification-item-arrow" aria-hidden="true"></i></a>`).join('')
                    : '<div class="notification-empty-state"><span><i class="fa-solid fa-check"></i></span><strong>You’re all caught up</strong><p>No urgent system alerts right now.</p></div>';
            })
            .catch(error => {
                const message = error?.message === 'auth'
                    ? ['Session or access issue', 'Sign in again to load system alerts.']
                    : error?.message === 'server'
                        ? ['Alert service error', 'The server could not load alerts. Please try again shortly.']
                        : error?.message === 'invalid-response'
                            ? ['Unexpected alert response', 'Refresh this page. If it continues, contact your administrator.']
                            : error?.message?.startsWith('http-')
                                ? ['Alert service unavailable', `The request failed (${error.message.slice(5)}). Refresh this page and try again.`]
                                : ['Cannot reach alert service', 'Check your connection or reload the page to retry.'];
                console.warn('System alerts could not be loaded:', error);
                if (summary) summary.textContent = message[0];
                if (totalLabel) totalLabel.textContent = '—';
                if (list) list.innerHTML = `<div class="notification-empty-state"><span><i class="fa-solid fa-triangle-exclamation"></i></span><strong>${escapeHtml(message[0])}</strong><p>${escapeHtml(message[1])}</p></div>`;
            });
    }
}

function initModalWorkspaceBounds() {
    if (window.DrpModalWorkspace) return window.DrpModalWorkspace;

    const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const sidebarWidth = () => {
        const sidebar = document.querySelector('#navbar-container .app-sidebar');
        if (sidebar) return Math.max(0, sidebar.getBoundingClientRect().width);
        const value = window.getComputedStyle(document.documentElement)
            .getPropertyValue('--sidebar-collapsed-width');
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };
    const bounds = (gap = 12) => {
        const safeGap = Math.max(0, numberOr(gap, 12));
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const left = sidebarWidth() + safeGap;
        const top = safeGap;
        const right = Math.max(left, viewportWidth - safeGap);
        const bottom = Math.max(top, viewportHeight - safeGap);
        return {
            gap: safeGap,
            left,
            top,
            right,
            bottom,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top)
        };
    };
    const constrain = (rect = {}, gap = 12) => {
        const area = bounds(gap);
        const requestedWidth = Math.max(0, numberOr(rect.width, 0));
        const requestedHeight = Math.max(0, numberOr(rect.height, 0));
        const width = Math.min(requestedWidth, area.width);
        const height = Math.min(requestedHeight, area.height);
        const maxLeft = Math.max(area.left, area.right - width);
        const maxTop = Math.max(area.top, area.bottom - height);
        return {
            left: clamp(numberOr(rect.left, area.left), area.left, maxLeft),
            top: clamp(numberOr(rect.top, area.top), area.top, maxTop),
            width,
            height,
            bounds: area
        };
    };
    const center = (rect = {}, gap = 12) => {
        const area = bounds(gap);
        const width = Math.min(Math.max(0, numberOr(rect.width, 0)), area.width);
        const height = Math.min(Math.max(0, numberOr(rect.height, 0)), area.height);
        return constrain({
            left: area.left + (area.width - width) / 2,
            top: area.top + (area.height - height) / 2,
            width,
            height
        }, gap);
    };

    window.DrpModalWorkspace = Object.freeze({ bounds, constrain, center });
    return window.DrpModalWorkspace;
}

function initGlobalModalBehavior() {
    if (window.__drpGlobalModalBehaviorInitialized) return;
    window.__drpGlobalModalBehaviorInitialized = true;

    const modalSelector = '.modal';
    const modalWorkspace = initModalWorkspaceBounds();

    function setStaticBackdrop(modal) {
        if (!modal || modal.dataset.drpStaticBackdrop === 'true') return;
        modal.dataset.drpStaticBackdrop = 'true';
        modal.setAttribute('data-bs-backdrop', 'static');
    }

    function patchBootstrapModal() {
        const Modal = window.bootstrap?.Modal;
        if (!Modal || Modal.__drpStaticBackdropPatched) return false;

        Modal.__drpStaticBackdropPatched = true;
        if (Modal.Default) {
            Modal.Default.backdrop = 'static';
        }

        const originalGetOrCreateInstance = Modal.getOrCreateInstance.bind(Modal);
        Modal.getOrCreateInstance = function patchedGetOrCreateInstance(element, config = {}) {
            if (element?.classList?.contains('modal')) {
                setStaticBackdrop(element);
            }
            return originalGetOrCreateInstance(element, { ...config, backdrop: 'static' });
        };

        const originalConstructor = Modal.prototype.constructor;
        if (originalConstructor?.Default) {
            originalConstructor.Default.backdrop = 'static';
        }
        return true;
    }

    function patchSweetAlert() {
        const Swal = window.Swal;
        if (!Swal || Swal.__drpOutsideClickPatched || typeof Swal.fire !== 'function') return false;

        const originalFire = Swal.fire.bind(Swal);
        Swal.fire = function patchedSweetAlertFire(...args) {
            if (args.length === 1 && args[0] && typeof args[0] === 'object') {
                return originalFire({ ...args[0], allowOutsideClick: false });
            }
            if (args.length >= 1) {
                return originalFire({
                    title: args[0],
                    text: args[1],
                    icon: args[2],
                    allowOutsideClick: false
                });
            }
            return originalFire({ allowOutsideClick: false });
        };
        Swal.__drpOutsideClickPatched = true;
        return true;
    }

    function makeModalDraggable(modal) {
        if (!modal?.matches(modalSelector) || modal.dataset.drpDraggable === 'true') return;
        const dialog = modal.querySelector('.modal-dialog');
        const header = modal.querySelector('.modal-header');
        if (!dialog || !header) return;

        modal.dataset.drpDraggable = 'true';
        header.classList.add('drp-modal-drag-handle');

        let startX = 0;
        let startY = 0;
        let offsetX = 0;
        let offsetY = 0;
        let dragging = false;

        const moveDrag = (event) => {
            if (!dragging) return;
            const rect = dialog.getBoundingClientRect();
            const next = modalWorkspace.constrain({
                left: offsetX + event.clientX - startX,
                top: offsetY + event.clientY - startY,
                width: rect.width,
                height: rect.height
            });
            dialog.style.left = `${next.left}px`;
            dialog.style.top = `${next.top}px`;
        };

        const stopDrag = (event) => {
            dragging = false;
            if (header.hasPointerCapture?.(event.pointerId)) {
                header.releasePointerCapture(event.pointerId);
            }
            window.removeEventListener('pointermove', moveDrag);
            window.removeEventListener('pointerup', stopDrag);
            window.removeEventListener('pointercancel', stopDrag);
        };

        const resetModalLayout = () => {
            if (modal.dataset.drpManagedSize === 'true') {
                return;
            }
            dialog.style.position = '';
            dialog.style.margin = '';
            dialog.style.left = '';
            dialog.style.top = '';
            dialog.style.transform = '';
            dialog.style.width = '';
            dialog.style.height = '';
            dialog.style.maxWidth = '';
            const content = dialog.querySelector('.modal-content');
            if (content) {
                content.style.width = '';
                content.style.height = '';
                content.style.maxWidth = '';
                content.style.maxHeight = '';
            }
            dialog.querySelector('.modal-body')?.scrollTo?.({ top: 0, left: 0 });
        };

        header.addEventListener('pointerdown', (event) => {
            if (modal.dataset.drpManagedSize === 'true') return;
            if (event.target.closest('button, input, select, textarea, a')) return;
            if (event.button !== 0 && event.pointerType === 'mouse') return;
            const rect = dialog.getBoundingClientRect();
            const constrained = modalWorkspace.constrain(rect);
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            offsetX = constrained.left;
            offsetY = constrained.top;
            dialog.style.position = 'fixed';
            dialog.style.margin = '0';
            dialog.style.left = `${constrained.left}px`;
            dialog.style.top = `${constrained.top}px`;
            dialog.style.transform = 'none';
            header.setPointerCapture?.(event.pointerId);
            window.addEventListener('pointermove', moveDrag);
            window.addEventListener('pointerup', stopDrag, { once: true });
            window.addEventListener('pointercancel', stopDrag, { once: true });
        });

        window.addEventListener('resize', () => {
            if (dialog.style.position !== 'fixed' || !modal.classList.contains('show')) return;
            const constrained = modalWorkspace.constrain(dialog.getBoundingClientRect());
            dialog.style.left = `${constrained.left}px`;
            dialog.style.top = `${constrained.top}px`;
        });

        modal.addEventListener('show.bs.modal', resetModalLayout);
        modal.addEventListener('hidden.bs.modal', resetModalLayout);
    }

    function enhanceModals(root = document) {
        root.querySelectorAll?.('.modal').forEach((modal) => {
            setStaticBackdrop(modal);
            makeModalDraggable(modal);
        });
    }

    enhanceModals();
    document.addEventListener('show.bs.modal', (event) => {
        setStaticBackdrop(event.target);
        makeModalDraggable(event.target);
    }, true);

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                if (node.matches?.('.modal')) {
                    setStaticBackdrop(node);
                    makeModalDraggable(node);
                }
                enhanceModals(node);
            });
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    patchSweetAlert();

    if (!patchBootstrapModal()) {
        const timer = window.setInterval(() => {
            if (patchBootstrapModal()) {
                window.clearInterval(timer);
                enhanceModals();
            }
        }, 50);
        window.setTimeout(() => window.clearInterval(timer), 5000);
    }

    if (!window.Swal?.__drpOutsideClickPatched) {
        const swalTimer = window.setInterval(() => {
            if (patchSweetAlert()) {
                window.clearInterval(swalTimer);
            }
        }, 50);
        window.setTimeout(() => window.clearInterval(swalTimer), 5000);
    }
}

initGlobalModalBehavior();

function getDataTableColumnType(label) {
    const text = String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');

    if (!text) return '';
    if (text.includes('action')) return 'actions';
    if (text === 'status' || text.endsWith(' status')) return text.includes('payment') ? 'payment-status' : 'status';
    if (text.includes('payment status')) return 'payment-status';
    if (text.includes('date')) return 'date';
    if (text.includes('po number') || text.includes('batch')) return 'po-number';
    if (text.includes('amount') || text.includes('payment') && !text.includes('terms') || text.includes('price')) return 'amount';
    if (text.includes('supplier')) return 'supplier';
    if (text.includes('item') || text.includes('product name')) return 'items';
    if (text.includes('brand')) return 'brand';
    if (text.includes('quantity') || text.includes('qty') || text.includes('days until')) return 'number';
    return '';
}

function enhanceDataTables() {
    document.querySelectorAll('table.table').forEach(table => {
        if (table.dataset.tableEnhance === 'false') return;

        let wrapper = table.closest('.table-responsive, .data-table-wrapper');

        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'data-table-wrapper';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }

        wrapper.classList.add('data-table-wrapper');
        table.classList.add('data-table-enhanced');

        const headers = Array.from(table.querySelectorAll('thead th'));
        const columnTypes = headers.map(th => {
            const type = getDataTableColumnType(th.textContent);
            if (type) th.dataset.tableColumn = type;
            return type;
        });

        table.querySelectorAll('tbody tr').forEach(row => {
            Array.from(row.children).forEach((cell, index) => {
                const type = columnTypes[index];
                if (type) cell.dataset.tableColumn = type;
            });
        });
    });
}

function ensureNavbarRuntimeStyles() {
    if (document.getElementById("navbar-runtime-styles")) return;

    const style = document.createElement("style");
    style.id = "navbar-runtime-styles";
    style.textContent = `
        :root {
            --navbar-ease: cubic-bezier(.22, 1, .36, 1);
        }

        #navbar-container,
        #navbar-container * {
            backface-visibility: hidden;
        }

        body.navbar-state-booting #navbar-container .app-sidebar,
        body.navbar-state-booting #mainWrapper,
        body.navbar-state-booting .main-wrapper,
        body.navbar-state-booting .navbar-page-content {
            animation: none !important;
            transition: none !important;
        }

        #navbar-container .app-sidebar {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: var(--sidebar-width) !important;
            height: 100vh !important;
            height: 100dvh !important;
            margin: 0 !important;
            overflow: visible !important;
            transform: translateZ(0);
            will-change: width;
            z-index: 2000 !important;
            transition: width .24s var(--navbar-ease), box-shadow .24s var(--navbar-ease) !important;
        }

        #navbar-container .app-sidebar.collapsed {
            width: var(--sidebar-collapsed-width) !important;
        }

        #navbar-container .sidebar-nav {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
        }

        #navbar-container .sidebar-nav::-webkit-scrollbar,
        #navbar-container .app-sidebar::-webkit-scrollbar {
            width: 0 !important;
            height: 0 !important;
            display: none !important;
        }

        #navbar-container .nav-link-item,
        #navbar-container .sidebar-brand,
        #navbar-container .sidebar-profile-footer {
            transition: background-color .18s ease, color .18s ease, padding .24s var(--navbar-ease), justify-content .24s var(--navbar-ease) !important;
        }

        #navbar-container .nav-label,
        #navbar-container .profile-name,
        #navbar-container .signout-btn,
        #navbar-container .collapse-arrow {
            transition: opacity .16s ease, visibility .16s ease !important;
        }

        #navbar-container .app-sidebar.collapsed .nav-label,
        #navbar-container .app-sidebar.collapsed .profile-name,
        #navbar-container .app-sidebar.collapsed .signout-btn,
        #navbar-container .app-sidebar.collapsed .collapse-arrow {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }

        #mainWrapper,
        .main-wrapper,
        .navbar-page-content {
            margin-left: var(--sidebar-collapsed-width) !important;
            width: calc(100% - var(--sidebar-collapsed-width)) !important;
            animation: drpPageEnter .16s ease-out both;
            transition: margin-left .24s var(--navbar-ease), width .24s var(--navbar-ease) !important;
        }

        .app-main {
            margin-left: var(--sidebar-collapsed-width) !important;
            width: calc(100% - var(--sidebar-collapsed-width)) !important;
            transition: margin-left .24s var(--navbar-ease), width .24s var(--navbar-ease) !important;
        }

        body.navbar-sidebar-collapsed #mainWrapper,
        body.navbar-sidebar-collapsed .main-wrapper,
        body.navbar-sidebar-collapsed .navbar-page-content,
        #mainWrapper.collapsed,
        .main-wrapper.collapsed {
            margin-left: var(--sidebar-collapsed-width) !important;
            width: calc(100% - var(--sidebar-collapsed-width)) !important;
        }

        @keyframes drpPageEnter {
            from { opacity: .97; transform: translateY(2px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
            #navbar-container .app-sidebar,
            #navbar-container .nav-link-item,
            #navbar-container .sidebar-brand,
            #navbar-container .sidebar-profile-footer,
            #navbar-container .nav-label,
            #navbar-container .profile-name,
            #navbar-container .signout-btn,
            #navbar-container .collapse-arrow,
            #mainWrapper,
            .main-wrapper,
            .navbar-page-content {
                animation: none !important;
                transition: none !important;
            }
        }

        @media (max-width: 768px) {
            #navbar-container .app-sidebar {
                box-shadow: 18px 0 38px rgba(15, 23, 42, .2) !important;
            }

            body.navbar-sidebar-collapsed #mainWrapper,
            body.navbar-sidebar-collapsed .main-wrapper,
            body.navbar-sidebar-collapsed .navbar-page-content,
            #mainWrapper.collapsed,
            .main-wrapper.collapsed {
                margin-left: var(--sidebar-collapsed-width) !important;
                width: calc(100% - var(--sidebar-collapsed-width)) !important;
            }
        }

        .table-responsive {
            width: 100% !important;
            overflow-x: auto !important;
            overflow-y: auto !important;
            max-height: min(68vh, 720px) !important;
            border-radius: 10px !important;
            -webkit-overflow-scrolling: touch;
        }

        .table-responsive > table.table {
            margin-bottom: 0 !important;
            table-layout: fixed !important;
            border-collapse: separate;
            border-spacing: 0;
        }

        .table-responsive > table.table th {
            padding: 14px 10px !important;
            color: #596274 !important;
            background: #f8f9fc !important;
            font-size: 13px !important;
            font-weight: 800 !important;
            line-height: 1.18 !important;
            text-align: center !important;
            vertical-align: middle !important;
            white-space: normal !important;
            word-break: normal !important;
        }

        .table-responsive > table.table thead th {
            position: sticky !important;
            top: 0 !important;
            z-index: 10 !important;
            box-shadow: inset 0 -1px 0 #e5e9f1 !important;
        }

        .table-responsive > table.table td {
            padding: 15px 10px !important;
            color: var(--text-main, #252b37) !important;
            font-size: 13px !important;
            font-weight: 750 !important;
            line-height: 1.34 !important;
            text-align: center !important;
            vertical-align: middle !important;
            word-break: normal !important;
            overflow-wrap: break-word !important;
        }

        .table-responsive > table.sales-table th,
        .table-responsive > table.sales-table td {
            text-align: left !important;
        }

        .table-responsive > table.po-list-table {
            width: max-content !important;
            min-width: 2020px !important;
            table-layout: fixed !important;
        }

        .table-responsive > table.po-items-table {
            width: max-content !important;
            min-width: 1700px !important;
            table-layout: fixed !important;
        }

        .table-responsive > table.pending-table,
        .table-responsive > table.arrived-table,
        .table-responsive > table.complete-delivery-table {
            min-width: 1380px !important;
        }

        .table-responsive > table.return-table {
            min-width: 1480px !important;
        }

        .table-responsive > table#table-suppliers {
            min-width: 860px !important;
        }

        .table-responsive > table#table-supplier-products {
            min-width: 1120px !important;
        }

        .table-responsive > table#productsTable {
            min-width: 1480px !important;
            table-layout: auto !important;
        }

        .table-responsive > table#table-inventory,
        .table-responsive > table#inventoryTable {
            min-width: 1720px !important;
        }

        .table-responsive > table.po-list-table th,
        .table-responsive > table.po-list-table td {
            font-size: 12.5px !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
        }

        .table-responsive > table.po-items-table th,
        .table-responsive > table.po-items-table td {
            font-size: 12.5px !important;
            vertical-align: middle !important;
            overflow-wrap: normal !important;
            word-break: normal !important;
            hyphens: none !important;
        }

        .table-responsive > table.po-list-table .col-date,
        .table-responsive > table.po-list-table td:nth-child(1),
        .table-responsive > table.po-list-table .col-money,
        .table-responsive > table.po-list-table td:nth-child(8),
        .table-responsive > table.po-list-table td:nth-child(9),
        .table-responsive > table.po-list-table .col-status,
        .table-responsive > table.po-list-table td:nth-child(10),
        .table-responsive > table.po-list-table .col-actions,
        .table-responsive > table.po-list-table td:nth-child(11) {
            white-space: nowrap !important;
            overflow-wrap: normal !important;
            word-break: normal !important;
        }

        .table-responsive > table.po-list-table .col-date,
        .table-responsive > table.po-list-table td:nth-child(1) { width: 110px !important; }
        .table-responsive > table.po-list-table .col-supplier,
        .table-responsive > table.po-list-table td:nth-child(2) { width: 160px !important; min-width: 160px !important; }
        .table-responsive > table.po-list-table .col-brand,
        .table-responsive > table.po-list-table td:nth-child(3) { width: 140px !important; min-width: 140px !important; }
        .table-responsive > table.po-list-table .col-items,
        .table-responsive > table.po-list-table td:nth-child(4) { width: 180px !important; min-width: 180px !important; }
        .table-responsive > table.po-list-table .col-category,
        .table-responsive > table.po-list-table td:nth-child(5) { width: 130px !important; min-width: 130px !important; }
        .table-responsive > table.po-list-table .col-type,
        .table-responsive > table.po-list-table td:nth-child(6) { width: 130px !important; min-width: 130px !important; }
        .table-responsive > table.po-list-table .col-qty,
        .table-responsive > table.po-list-table td:nth-child(7) { width: 110px !important; min-width: 110px !important; }
        .table-responsive > table.po-list-table .col-purchase-unit,
        .table-responsive > table.po-list-table td:nth-child(8) { width: 150px !important; min-width: 150px !important; }
        .table-responsive > table.po-list-table .col-inventory-qty,
        .table-responsive > table.po-list-table td:nth-child(9) { width: 130px !important; min-width: 130px !important; }
        .table-responsive > table.po-list-table .col-terms,
        .table-responsive > table.po-list-table td:nth-child(10) { width: 120px !important; min-width: 120px !important; }
        .table-responsive > table.po-list-table .col-delivery,
        .table-responsive > table.po-list-table td:nth-child(11) { width: 160px !important; min-width: 160px !important; }
        .table-responsive > table.po-list-table .col-money,
        .table-responsive > table.po-list-table td:nth-child(12),
        .table-responsive > table.po-list-table td:nth-child(13) { width: 130px !important; min-width: 130px !important; }
        .table-responsive > table.po-list-table .col-status,
        .table-responsive > table.po-list-table td:nth-child(14) { width: 120px !important; min-width: 120px !important; }
        .table-responsive > table.po-list-table .col-actions,
        .table-responsive > table.po-list-table td:nth-child(15) { width: 100px !important; min-width: 100px !important; }

        .table-responsive > table#productsTable th:nth-child(1),
        .table-responsive > table#productsTable td:nth-child(1) { width: 150px !important; min-width: 150px !important; }
        .table-responsive > table#productsTable th:nth-child(2),
        .table-responsive > table#productsTable td:nth-child(2) { width: 120px !important; min-width: 120px !important; }
        .table-responsive > table#productsTable th:nth-child(3),
        .table-responsive > table#productsTable td:nth-child(3) { width: 190px !important; min-width: 190px !important; }
        .table-responsive > table#productsTable th:nth-child(4),
        .table-responsive > table#productsTable td:nth-child(4) { width: 115px !important; min-width: 115px !important; }
        .table-responsive > table#productsTable th:nth-child(5),
        .table-responsive > table#productsTable td:nth-child(5) { width: 150px !important; min-width: 150px !important; }
        .table-responsive > table#productsTable th:nth-child(6),
        .table-responsive > table#productsTable td:nth-child(6) { width: 170px !important; min-width: 170px !important; }
        .table-responsive > table#productsTable th:nth-child(7),
        .table-responsive > table#productsTable td:nth-child(7) { width: 150px !important; min-width: 150px !important; }
        .table-responsive > table#productsTable th:nth-child(8),
        .table-responsive > table#productsTable td:nth-child(8) { width: 110px !important; min-width: 110px !important; white-space: nowrap !important; }
        .table-responsive > table#productsTable th:nth-child(9),
        .table-responsive > table#productsTable td:nth-child(9) {
            width: 210px !important;
            min-width: 210px !important;
            max-width: 210px !important;
        }

        .table-responsive > table#productsTable td:nth-child(1),
        .table-responsive > table#productsTable td:nth-child(8) {
            white-space: nowrap !important;
        }

        .table-responsive > table#productsTable th:nth-child(9),
        .table-responsive > table#productsTable td:nth-child(9),
        .table-responsive > table.table th:last-child,
        .table-responsive > table.table td:last-child {
            overflow: visible !important;
        }

        .table-responsive > table#productsTable th:nth-child(9),
        .table-responsive > table#productsTable td:nth-child(9) {
            white-space: nowrap !important;
        }

        .table-responsive .badge,
        .table-responsive .status-badge {
            white-space: nowrap !important;
            line-height: 1.2 !important;
            font-size: 11px !important;
            padding: 6px 8px !important;
        }

        .table-responsive .po-money,
        .table-responsive .money-nowrap {
            display: inline-block !important;
            min-width: max-content !important;
            white-space: nowrap !important;
            font-weight: 800 !important;
        }

        .po-line-list,
        .table-line-list {
            display: grid !important;
            gap: 4px !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
            text-align: left !important;
        }

        .po-line-list li,
        .table-line-list li {
            display: grid !important;
            grid-template-columns: 18px minmax(0, 1fr) !important;
            gap: 5px !important;
            align-items: start !important;
            min-height: 18px !important;
        }

        .po-line-list .line-index,
        .table-line-list .line-index {
            color: #7b8494 !important;
            font-size: 12px !important;
            font-weight: 800 !important;
            line-height: 1.3 !important;
            text-align: right !important;
        }

        .po-line-list .line-text,
        .table-line-list .line-text {
            min-width: 0 !important;
            overflow-wrap: break-word !important;
            word-break: normal !important;
            hyphens: auto !important;
            line-height: 1.3 !important;
        }

        .po-line-list.po-line-list-plain,
        .table-line-list.table-line-list-plain {
            text-align: center !important;
        }

        .po-line-list.po-line-list-plain li,
        .table-line-list.table-line-list-plain li {
            grid-template-columns: 1fr !important;
            justify-items: center !important;
        }

        .po-actions,
        .arrived-actions,
        .complete-actions,
        .approval-actions,
        .return-actions,
        .table-actions,
        .table-responsive td:last-child > div {
            display: inline-flex !important;
            flex-wrap: nowrap !important;
            justify-content: center !important;
            align-items: center !important;
            gap: 6px !important;
            white-space: nowrap !important;
        }

        .po-actions .btn,
        .arrived-actions .btn,
        .complete-actions .btn,
        .approval-actions .btn,
        .return-actions .btn,
        .table-actions .btn,
        .table-responsive td:last-child .btn {
            width: 32px !important;
            height: 32px !important;
            min-width: 32px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
        }

        .table-actions.product-actions {
            width: 178px !important;
            min-width: 178px !important;
            gap: 8px !important;
        }

        .table-actions.product-actions .add-stock-btn {
            width: auto !important;
            min-width: 90px !important;
            height: 30px !important;
            padding: 0 11px !important;
            font-size: 12px !important;
            line-height: 1 !important;
            white-space: nowrap !important;
        }

        .table-actions.product-actions .btn:not(.add-stock-btn) {
            width: 30px !important;
            min-width: 30px !important;
            height: 30px !important;
            padding: 0 !important;
            white-space: nowrap !important;
        }

        .table-responsive,
        .data-table-wrapper {
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: auto !important;
            overflow-y: auto !important;
            max-height: min(68vh, 720px) !important;
            border-radius: 10px !important;
            -webkit-overflow-scrolling: touch !important;
        }

        .table-responsive > table.table:not(.po-list-table):not(.po-items-table),
        .data-table-wrapper > table.table,
        table.data-table-enhanced {
            width: 100% !important;
            min-width: 1100px !important;
            table-layout: auto !important;
            margin-bottom: 0 !important;
            border-collapse: separate !important;
            border-spacing: 0 !important;
        }

        .table-responsive > table.table th,
        .table-responsive > table.table td,
        .data-table-wrapper > table.table th,
        .data-table-wrapper > table.table td,
        table.data-table-enhanced th,
        table.data-table-enhanced td {
            padding: 14px 16px !important;
            vertical-align: middle !important;
            font-size: 13px !important;
            line-height: 1.35 !important;
            text-align: center !important;
            word-break: normal !important;
        }

        .table-responsive > table.table th,
        .data-table-wrapper > table.table th,
        table.data-table-enhanced th {
            color: #596274 !important;
            background: #f8f9fc !important;
            font-weight: 800 !important;
        }

        .table-responsive > table.table thead th,
        .data-table-wrapper > table.table thead th,
        table.data-table-enhanced thead th {
            position: sticky !important;
            top: 0 !important;
            z-index: 10 !important;
            box-shadow: inset 0 -1px 0 #e5e9f1 !important;
        }

        .table-responsive > table.table thead th[data-table-column="actions"],
        .data-table-wrapper > table.table thead th[data-table-column="actions"],
        table.data-table-enhanced thead th[data-table-column="actions"],
        .table-responsive > table.table thead th:last-child,
        .data-table-wrapper > table.table thead th:last-child,
        table.data-table-enhanced thead th:last-child {
            z-index: 12 !important;
        }

        .table-responsive > table.table td,
        .data-table-wrapper > table.table td,
        table.data-table-enhanced td {
            color: var(--text-main, #252b37) !important;
            font-weight: 750 !important;
        }

        .table-responsive > table.table [data-table-column="date"],
        .data-table-wrapper > table.table [data-table-column="date"],
        table.data-table-enhanced [data-table-column="date"] {
            min-width: 125px !important;
            white-space: nowrap !important;
            overflow-wrap: normal !important;
        }

        .table-responsive > table.table [data-table-column="po-number"],
        .data-table-wrapper > table.table [data-table-column="po-number"],
        table.data-table-enhanced [data-table-column="po-number"] {
            min-width: 220px !important;
            white-space: nowrap !important;
            overflow-wrap: normal !important;
        }

        .table-responsive > table.table [data-table-column="amount"],
        .data-table-wrapper > table.table [data-table-column="amount"],
        table.data-table-enhanced [data-table-column="amount"] {
            min-width: 145px !important;
            white-space: nowrap !important;
            overflow-wrap: normal !important;
        }

        .table-responsive > table.table [data-table-column="status"],
        .data-table-wrapper > table.table [data-table-column="status"],
        table.data-table-enhanced [data-table-column="status"] {
            min-width: 135px !important;
            white-space: nowrap !important;
            overflow-wrap: normal !important;
        }

        .table-responsive > table.table [data-table-column="payment-status"],
        .data-table-wrapper > table.table [data-table-column="payment-status"],
        table.data-table-enhanced [data-table-column="payment-status"] {
            min-width: 155px !important;
            white-space: nowrap !important;
            overflow-wrap: normal !important;
        }

        .table-responsive > table.table [data-table-column="actions"],
        .data-table-wrapper > table.table [data-table-column="actions"],
        table.data-table-enhanced [data-table-column="actions"],
        .table-responsive > table.table .actions-column,
        .table-responsive > table.table .col-actions,
        .table-responsive > table.table .actions-cell,
        .table-responsive > table.table .action-cell,
        .table-responsive > table.table .po-actions-cell,
        .table-responsive > table.table .approval-actions-cell,
        .table-responsive > table.table .complete-actions-cell,
        .data-table-wrapper > table.table .actions-column,
        .data-table-wrapper > table.table .col-actions,
        table.data-table-enhanced .actions-column,
        table.data-table-enhanced .col-actions {
            width: 120px !important;
            min-width: 120px !important;
            white-space: nowrap !important;
            overflow: visible !important;
            overflow-wrap: normal !important;
            text-align: center !important;
        }

        .table-responsive > table.table th[data-table-column="actions"],
        .table-responsive > table.table td[data-table-column="actions"],
        .data-table-wrapper > table.table th[data-table-column="actions"],
        .data-table-wrapper > table.table td[data-table-column="actions"],
        table.data-table-enhanced th[data-table-column="actions"],
        table.data-table-enhanced td[data-table-column="actions"],
        .table-responsive > table.table th.actions-column,
        .table-responsive > table.table td.actions-column,
        .table-responsive > table.table th.col-actions,
        .table-responsive > table.table td.col-actions,
        .table-responsive > table.table td.actions-cell,
        .table-responsive > table.table td.action-cell,
        .table-responsive > table.table td.po-actions-cell,
        .table-responsive > table.table td.approval-actions-cell,
        .table-responsive > table.table td.complete-actions-cell,
        .data-table-wrapper > table.table th.actions-column,
        .data-table-wrapper > table.table td.actions-column,
        .data-table-wrapper > table.table th.col-actions,
        .data-table-wrapper > table.table td.col-actions,
        table.data-table-enhanced th.actions-column,
        table.data-table-enhanced td.actions-column,
        table.data-table-enhanced th.col-actions,
        table.data-table-enhanced td.col-actions,
        .table-responsive > table.table th:last-child,
        .table-responsive > table.table td:last-child,
        .data-table-wrapper > table.table th:last-child,
        .data-table-wrapper > table.table td:last-child,
        table.data-table-enhanced th:last-child,
        table.data-table-enhanced td:last-child {
            position: sticky !important;
            right: 0 !important;
            z-index: 11 !important;
            background: var(--bs-table-bg, #fff) !important;
            background-clip: padding-box !important;
            border-left: 1px solid #e5e7eb !important;
            box-shadow: -6px 0 10px rgba(15, 23, 42, 0.06) !important;
            text-align: center !important;
        }

        .table-responsive > table.table thead th[data-table-column="actions"],
        .data-table-wrapper > table.table thead th[data-table-column="actions"],
        table.data-table-enhanced thead th[data-table-column="actions"],
        .table-responsive > table.table thead th.actions-column,
        .table-responsive > table.table thead th.col-actions,
        .data-table-wrapper > table.table thead th.actions-column,
        .data-table-wrapper > table.table thead th.col-actions,
        table.data-table-enhanced thead th.actions-column,
        table.data-table-enhanced thead th.col-actions,
        .table-responsive > table.table thead th:last-child,
        .data-table-wrapper > table.table thead th:last-child,
        table.data-table-enhanced thead th:last-child {
            z-index: 15 !important;
            background: #f8f9fc !important;
        }

        .table-responsive > table.table tbody tr:hover td[data-table-column="actions"],
        .data-table-wrapper > table.table tbody tr:hover td[data-table-column="actions"],
        table.data-table-enhanced tbody tr:hover td[data-table-column="actions"],
        .table-responsive > table.table tbody tr:hover td.actions-column,
        .table-responsive > table.table tbody tr:hover td.col-actions,
        .table-responsive > table.table tbody tr:hover td.actions-cell,
        .table-responsive > table.table tbody tr:hover td.action-cell,
        .table-responsive > table.table tbody tr:hover td.po-actions-cell,
        .table-responsive > table.table tbody tr:hover td.approval-actions-cell,
        .table-responsive > table.table tbody tr:hover td.complete-actions-cell,
        .table-responsive > table.table tbody tr:hover td:last-child,
        .data-table-wrapper > table.table tbody tr:hover td:last-child,
        table.data-table-enhanced tbody tr:hover td:last-child {
            background: var(--bs-table-hover-bg, #f8fafc) !important;
        }

        .table-responsive > table.table td[colspan],
        .data-table-wrapper > table.table td[colspan],
        table.data-table-enhanced td[colspan] {
            position: static !important;
            right: auto !important;
            z-index: auto !important;
            width: auto !important;
            min-width: 0 !important;
            border-left: 0 !important;
            box-shadow: none !important;
        }

        .table-responsive > table.table [data-table-column="supplier"],
        .data-table-wrapper > table.table [data-table-column="supplier"],
        table.data-table-enhanced [data-table-column="supplier"] {
            min-width: 170px !important;
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: anywhere !important;
        }

        .table-responsive > table.table [data-table-column="items"],
        .data-table-wrapper > table.table [data-table-column="items"],
        table.data-table-enhanced [data-table-column="items"] {
            min-width: 230px !important;
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: anywhere !important;
        }

        .table-responsive > table.table [data-table-column="brand"],
        .data-table-wrapper > table.table [data-table-column="brand"],
        table.data-table-enhanced [data-table-column="brand"] {
            min-width: 175px !important;
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: anywhere !important;
        }

        .table-responsive > table.table [data-table-column="number"],
        .data-table-wrapper > table.table [data-table-column="number"],
        table.data-table-enhanced [data-table-column="number"] {
            min-width: 120px !important;
            text-align: center !important;
        }

        .table-responsive .badge,
        .table-responsive .status-badge,
        .data-table-wrapper .badge,
        .data-table-wrapper .status-badge {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-width: fit-content !important;
            white-space: nowrap !important;
            line-height: 1.2 !important;
        }

        .table-responsive td[data-table-column="actions"] > div,
        .data-table-wrapper td[data-table-column="actions"] > div,
        table.data-table-enhanced td[data-table-column="actions"] > div,
        .table-responsive td:last-child > div,
        .data-table-wrapper td:last-child > div {
            display: inline-flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 7px !important;
            white-space: nowrap !important;
            width: max-content !important;
            max-width: none !important;
        }

        .table-responsive td[data-table-column="actions"] .btn,
        .data-table-wrapper td[data-table-column="actions"] .btn,
        table.data-table-enhanced td[data-table-column="actions"] .btn,
        .table-responsive td:last-child .btn,
        .data-table-wrapper td:last-child .btn {
            flex: 0 0 auto !important;
        }

        body.dark-mode .table-responsive > table.table th {
            background: #202b3d !important;
            color: #cbd5e1 !important;
        }

        body.dark-mode .table-responsive > table.table th[data-table-column="actions"],
        body.dark-mode .table-responsive > table.table td[data-table-column="actions"],
        body.dark-mode .data-table-wrapper > table.table th[data-table-column="actions"],
        body.dark-mode .data-table-wrapper > table.table td[data-table-column="actions"],
        body.dark-mode table.data-table-enhanced th[data-table-column="actions"],
        body.dark-mode table.data-table-enhanced td[data-table-column="actions"],
        body.dark-mode .table-responsive > table.table th.actions-column,
        body.dark-mode .table-responsive > table.table td.actions-column,
        body.dark-mode .table-responsive > table.table th.col-actions,
        body.dark-mode .table-responsive > table.table td.col-actions,
        body.dark-mode .table-responsive > table.table td.actions-cell,
        body.dark-mode .table-responsive > table.table td.action-cell,
        body.dark-mode .table-responsive > table.table td.po-actions-cell,
        body.dark-mode .table-responsive > table.table td.approval-actions-cell,
        body.dark-mode .table-responsive > table.table td.complete-actions-cell,
        body.dark-mode .table-responsive > table.table th:last-child,
        body.dark-mode .table-responsive > table.table td:last-child,
        body.dark-mode .data-table-wrapper > table.table th:last-child,
        body.dark-mode .data-table-wrapper > table.table td:last-child,
        body.dark-mode table.data-table-enhanced th:last-child,
        body.dark-mode table.data-table-enhanced td:last-child {
            background: var(--bs-table-bg, #182131) !important;
            border-left-color: #263244 !important;
        }

        body.dark-mode .table-responsive > table.table thead th[data-table-column="actions"],
        body.dark-mode .data-table-wrapper > table.table thead th[data-table-column="actions"],
        body.dark-mode table.data-table-enhanced thead th[data-table-column="actions"],
        body.dark-mode .table-responsive > table.table thead th.actions-column,
        body.dark-mode .table-responsive > table.table thead th.col-actions,
        body.dark-mode .table-responsive > table.table thead th:last-child,
        body.dark-mode .data-table-wrapper > table.table thead th:last-child,
        body.dark-mode table.data-table-enhanced thead th:last-child {
            background: #202b3d !important;
        }

        body.dark-mode .table-responsive > table.table tbody tr:hover td[data-table-column="actions"],
        body.dark-mode .data-table-wrapper > table.table tbody tr:hover td[data-table-column="actions"],
        body.dark-mode table.data-table-enhanced tbody tr:hover td[data-table-column="actions"],
        body.dark-mode .table-responsive > table.table tbody tr:hover td.actions-column,
        body.dark-mode .table-responsive > table.table tbody tr:hover td.col-actions,
        body.dark-mode .table-responsive > table.table tbody tr:hover td.actions-cell,
        body.dark-mode .table-responsive > table.table tbody tr:hover td.action-cell,
        body.dark-mode .table-responsive > table.table tbody tr:hover td.po-actions-cell,
        body.dark-mode .table-responsive > table.table tbody tr:hover td.approval-actions-cell,
        body.dark-mode .table-responsive > table.table tbody tr:hover td.complete-actions-cell,
        body.dark-mode .table-responsive > table.table tbody tr:hover td:last-child,
        body.dark-mode .data-table-wrapper > table.table tbody tr:hover td:last-child,
        body.dark-mode table.data-table-enhanced tbody tr:hover td:last-child {
            background: var(--bs-table-hover-bg, #202b3d) !important;
        }
    `;
    document.head.appendChild(style);
}
