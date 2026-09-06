(function bootstrapNavbarShell() {
    if (window.__drpNavbarBootstrap) return;

    if (!document.querySelector('script[data-search-highlight-loader]')) {
        const searchHighlightScript = document.createElement('script');
        searchHighlightScript.src = './js/search_highlight.js?v=3';
        searchHighlightScript.dataset.searchHighlightLoader = 'true';
        document.head.appendChild(searchHighlightScript);
    }

    const cacheKey = "drpNavbarHtml:v47";
    const expandedGroupsKey = "drpNavbarExpandedGroups";
    const supervisorNavigation = Object.freeze([
        ["supervisor_dashboard.html", "dashboard", "fa-gauge-high", "Dashboard"],
        ["supervisor_approval.html", "supervisor-approval", "fa-clipboard-check", "PR Approvals"],
        ["purchase_orders.html", "purchase-orders", "fa-file-invoice-dollar", "Purchase Orders"],
        ["products.html", "products", "fa-capsules", "Product Master File"],
        ["inventory.html", "inventory", "fa-warehouse", "Storage Inventory"],
        ["shelf_inventory.html", "shelf-inventory", "fa-store", "Shelf Inventory"],
        ["supplier.html", "supplier", "fa-truck-field", "Suppliers"],
        ["reports.html", "reports", "fa-chart-column", "Reports"]
    ]);
    const supervisorNavigationVersion = "supervisor-v2";
    const pageAliases = {
        "cashier_dashboard.html": "dashboard.html",
        "completed_sales.html": "cashier_transaction_history.html"
    };

    function readStorage(storage, key, fallback = "") {
        try {
            return storage.getItem(key) || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function applyVisualState() {
        const collapsed = true;
        const dark = readStorage(localStorage, "drpTheme") === "dark";
        document.documentElement.classList.toggle("sidebar-collapsed", collapsed);
        document.documentElement.classList.toggle("sidebar-expanded", !collapsed);
        document.documentElement.setAttribute("data-bs-theme", dark ? "dark" : "light");

        if (document.body) {
            document.body.classList.toggle("navbar-sidebar-collapsed", collapsed);
            document.body.classList.toggle("sidebar-open", !collapsed);
            document.body.classList.toggle("dark-mode", dark);
        }
    }

    function expandedGroupIds() {
        try {
            const value = JSON.parse(readStorage(localStorage, expandedGroupsKey, "[]"));
            return Array.isArray(value) ? value.filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    }

    function currentFilename() {
        const filename = window.location.pathname.split("/").pop() || "dashboard.html";
        return pageAliases[filename] || filename;
    }

    function applyCachedProfile(container) {
        const profileDisplay = window.__drpNavbarProfileDisplay;
        if (!profileDisplay) return;
        profileDisplay.render(container, profileDisplay.read(), { cache: false });
    }

    function renderSupervisorNavigation(container) {
        if (!container) return false;
        container.querySelector(".sidebar-brand")?.setAttribute("href", "supervisor_dashboard.html");
        const navigation = container.querySelector(".sidebar-nav");
        if (!navigation || navigation.dataset.roleNavigation === supervisorNavigationVersion) return false;

        navigation.innerHTML = supervisorNavigation.map(([href, page, icon, label]) => `
            <a href="${href}" class="nav-link-item" data-nav-page="${page}" title="${label}">
                <i class="fa-solid ${icon}"></i><span class="nav-label">${label}</span>
            </a>`).join("");
        navigation.dataset.roleNavigation = supervisorNavigationVersion;
        return true;
    }

    function applyCachedRoleState(container) {
        const profile = window.__drpNavbarProfileDisplay?.read();
        const allowedPages = profile?.allowedPages;
        if (allowedPages !== "*" && !Array.isArray(allowedPages)) return;

        const allowedPageSet = allowedPages === "*" ? null : new Set(allowedPages);
        container.querySelectorAll("[data-nav-page]").forEach(link => {
            const page = link.dataset.navPage || "";
            const isAllowed = page === "supervisor-approval"
                ? profile.role === "supervisor"
                : allowedPageSet === null || allowedPageSet.has(page);
            link.classList.toggle("d-none", !isAllowed);
            link.setAttribute("aria-hidden", isAllowed ? "false" : "true");
        });
        container.querySelectorAll("[data-bs-toggle='collapse']").forEach(trigger => {
            const selector = trigger.getAttribute("href") || "";
            const group = selector.startsWith("#") ? container.querySelector(selector) : null;
            const hasVisibleChild = Boolean(group?.querySelector("[data-nav-page]:not(.d-none)"));
            trigger.classList.toggle("d-none", !hasVisibleChild);
            trigger.setAttribute("aria-hidden", hasVisibleChild ? "false" : "true");
        });
        if (profile.role === "supervisor") {
            renderSupervisorNavigation(container);
        }
        document.documentElement.classList.add("navbar-role-ready");
    }

    function applyImmediateState(container) {
        if (!container) return;
        applyVisualState();
        applyCachedProfile(container);
        applyCachedRoleState(container);

        const collapsed = document.documentElement.classList.contains("sidebar-collapsed");
        const sidebar = container.querySelector("#sidebar");
        sidebar?.classList.toggle("collapsed", collapsed);
        sidebar?.classList.toggle("is-expanded", !collapsed);

        const filename = currentFilename();
        let activeLink = null;
        container.querySelector(".sidebar-brand")?.classList.remove("active");
        container.querySelectorAll(".sidebar-nav a[href]").forEach(link => {
            link.classList.remove("active");
            const href = (link.getAttribute("href") || "").trim();
            if (!href || href.startsWith("#") || link.matches("[data-bs-toggle='collapse']")) return;
            let targetFilename = "";
            try {
                targetFilename = new URL(href, window.location.href).pathname.split("/").pop();
            } catch (error) {}
            if (!activeLink && targetFilename === filename) activeLink = link;
        });

        activeLink?.classList.add("active");
        const activeGroup = activeLink?.closest(".collapse");
        const expandedIds = new Set(expandedGroupIds());
        if (activeGroup?.id) expandedIds.add(activeGroup.id);

        expandedIds.forEach(id => {
            const group = container.querySelector(`#${CSS.escape(id)}`);
            if (!group) return;
            group.classList.add("show");
            const trigger = container.querySelector(`[href="#${CSS.escape(id)}"]`);
            trigger?.setAttribute("aria-expanded", "true");
        });
    }

    function restorePreparedScroll(container) {
        const scrollContainer = container?.querySelector(".sidebar-nav");
        if (!scrollContainer) return;
        const collapsed = container.querySelector("#sidebar")?.classList.contains("collapsed");
        const storageKey = collapsed
            ? "pharmacyNavbarScrollTopCollapsed"
            : "pharmacyNavbarScrollTopExpanded";
        const storedValue = Number(readStorage(sessionStorage, storageKey, ""));
        if (Number.isFinite(storedValue)) {
            const maximumScroll = Math.max(scrollContainer.scrollHeight - scrollContainer.clientHeight, 0);
            scrollContainer.scrollTop = Math.min(Math.max(storedValue, 0), maximumScroll);
        }

        const activeItem = scrollContainer.querySelector(".nav-link-item.active");
        if (!activeItem) return;
        const containerRect = scrollContainer.getBoundingClientRect();
        const activeRect = activeItem.getBoundingClientRect();
        if (activeRect.top < containerRect.top + 12) {
            scrollContainer.scrollTop -= containerRect.top + 12 - activeRect.top;
        } else if (activeRect.bottom > containerRect.bottom - 12) {
            scrollContainer.scrollTop += activeRect.bottom - (containerRect.bottom - 12);
        }
    }

    function revealPreparedNavbar(container) {
        if (!container) return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                restorePreparedScroll(container);
                container.classList.remove("navbar-preparing");
            });
        });
    }

    function skeletonMarkup() {
        return `
            <aside class="navbar-shell-skeleton" aria-label="Loading navigation">
                <div class="navbar-skeleton-brand"><span></span></div>
                <div class="navbar-skeleton-menu">
                    <span></span><span></span><span></span><span></span><span></span><span></span>
                </div>
                <div class="navbar-skeleton-profile"><span></span><i></i></div>
            </aside>`;
    }

    function mount() {
        const container = document.getElementById("navbar-container");
        if (!container || container.dataset.navbarBootstrapMounted === "true") return Boolean(container);

        const cachedMarkup = readStorage(sessionStorage, cacheKey);
        container.classList.add("navbar-preparing");
        container.innerHTML = cachedMarkup || skeletonMarkup();
        container.dataset.navbarBootstrapMounted = "true";
        container.dataset.navbarInitialSource = cachedMarkup ? "cache" : "skeleton";
        container.dataset.navbarSource = cachedMarkup ? "cache" : "skeleton";
        container.classList.toggle("navbar-ready", Boolean(cachedMarkup));
        container.classList.toggle("navbar-skeleton-ready", !cachedMarkup);
        if (cachedMarkup) {
            applyImmediateState(container);
            revealPreparedNavbar(container);
        }
        return true;
    }

    applyVisualState();
    window.__drpNavbarMarkupCacheKey = cacheKey;
    window.__drpNavbarExpandedGroupsKey = expandedGroupsKey;
    window.__drpNavbarBootstrap = {
        applyCachedRoleState,
        applyImmediateState,
        applyVisualState,
        cacheKey,
        mount,
        renderSupervisorNavigation,
        revealPreparedNavbar,
        restorePreparedScroll,
        supervisorNavigation
    };

    if (!mount()) {
        const observer = new MutationObserver(() => {
            applyVisualState();
            if (!mount()) return;
            observer.disconnect();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
})();
