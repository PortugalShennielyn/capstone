(async function loadNavbar() {
    const container = document.getElementById("navbar-container");
    if (!container) return;
    if (window.__drpNavbarLoaderStarted) {
        enhanceDataTables();
        return;
    }
    window.__drpNavbarLoaderStarted = true;

    const savedCollapsed = localStorage.getItem("drpSidebarCollapsed") === "true";
    const mainWrapperBeforeLoad = document.getElementById("mainWrapper");
    document.body.classList.add("navbar-state-booting");
    ensureNavbarRuntimeStyles();
    document.body.classList.toggle("navbar-sidebar-collapsed", savedCollapsed);
    mainWrapperBeforeLoad?.classList.toggle("collapsed", savedCollapsed);

    try {
            const cacheKey = "drpNavbarHtml:v18";
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

        container.innerHTML = navbarHtml;
        container.classList.add("navbar-ready");

        const sidebar = document.getElementById("sidebar");
        const mainWrapper = document.getElementById("mainWrapper");
        const filename = window.location.pathname.split("/").pop() || "dashboard.html";

        const pageMap = {
            "dashboard.html": "dashboard",
            "products.html": "products",
            "inventory.html": "inventory",
            "supplier.html": "supplier",
            "purchase_orders.html": "purchase-orders",
            "pending_orders.html": "pending-orders",
            "arrived_orders.html": "arrived-orders",
            "complete_delivery.html": "complete-delivery",
            "return_damage.html": "return-damage",
            "expiry_monitoring.html": "expiry-monitoring",
            "admin_settings.html": "settings",
            "pos.html": "pos",
            "clerk.html": "clerk"
        };

        const dashboardViewMap = {
            dashboard: "dashboard",
            "dashboard/billing": "billing",
            "dashboard/user/settings": "user-settings",
            "dashboard/products": "products",
            "dashboard/inventory": "inventory",
            "dashboard/suppliers": "supplier",
            "dashboard/pos": "pos",
            "dashboard/clerk": "clerk",
            "dashboard/purchase-orders": "purchase-orders",
            "dashboard/pending-orders": "pending-orders",
            "dashboard/arrived-orders": "arrived-orders",
            "dashboard/complete-delivery": "complete-delivery",
            "dashboard/return-damage": "return-damage",
            "dashboard/expiry-monitoring": "expiry-monitoring"
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
        }

        function getActiveLabel() {
            const activePage = getActivePage();
            const pageMap = {
                "dashboard": "Dashboard",
                "products": "Products",
                "inventory": "Inventory",
                "supplier": "Suppliers",
                "settings": "Admin Settings",
                "billing": "Billing",
                "user-settings": "User Settings",
                "purchase-orders": "Purchase Orders",
                "pending-orders": "Pending Orders",
                "arrived-orders": "Arrived Orders",
                "complete-delivery": "Complete Delivery",
                "return-damage": "Return/Damage",
                "expiry-monitoring": "Expiry Monitoring",
                "pos": "POS",
                "clerk": "Salesclerk"
            };
            return pageMap[activePage] || "Dashboard";
        }

        function setSidebarState(isCollapsed) {
            sidebar?.classList.toggle("collapsed", isCollapsed);
            mainWrapper?.classList.toggle("collapsed", isCollapsed);
            document.body.classList.toggle("navbar-sidebar-collapsed", isCollapsed);
            localStorage.setItem("drpSidebarCollapsed", String(isCollapsed));
            if (!isCollapsed) {
                closeSlimFlyout();
            }
        }

        function closeSidebarFromOutside(event) {
            if (!sidebar || sidebar.classList.contains("collapsed")) return;
            if (sidebar.contains(event.target)) return;
            if (event.target.closest("#sidebarToggle")) return;
            if (event.target.closest(".modal, .modal-backdrop, .swal2-container, .toast, .toast-container")) return;

            setSidebarState(true);
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

        function applyActiveNavigation() {
            setDashboardViewState();
            container.querySelectorAll("[data-nav-page]").forEach(link => link.classList.remove("active"));
            const activeLink = container.querySelector(`[data-nav-page="${getActivePage()}"]`);
            activeLink?.classList.add("active");
            activeLink?.closest(".collapse")?.classList.add("show");
            container.querySelectorAll(".collapse").forEach(setCollapseArrow);
        }

        function handleSidebarNavigation(event) {
            const link = event.target.closest("a.nav-link-item[href]");
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

            const targetUrl = new URL(link.href, window.location.href);
            const isSamePath = targetUrl.pathname === window.location.pathname;
            const isSameHash = targetUrl.hash === window.location.hash || (!targetUrl.hash && !window.location.hash);
            const isActiveModule = link.dataset.navPage && link.dataset.navPage === getActivePage();

            if ((isSamePath && isSameHash) || isActiveModule) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            const dashboardView = normalizeDashboardView(link.dataset.dashboardView || targetUrl.hash);
            if (dashboardView) {
                sessionStorage.setItem("drpDashboardView", dashboardView);
            }
            sessionStorage.setItem("drpLastNavigationTarget", dashboardView || link.dataset.navPage || targetUrl.pathname);
        }

        function prefetchNavigationTargets() {
            const existing = new Set(Array.from(document.querySelectorAll('link[rel="prefetch"]')).map(link => link.href));

            container.querySelectorAll("a.nav-link-item[href]").forEach(link => {
                const href = link.getAttribute("href") || "";
                if (!href || href === "#" || href.startsWith("#")) return;
                const targetUrl = new URL(link.href, window.location.href);
                if (targetUrl.origin !== window.location.origin) return;
                if (targetUrl.pathname === window.location.pathname) return;
                if (existing.has(targetUrl.href)) return;

                const prefetch = document.createElement("link");
                prefetch.rel = "prefetch";
                prefetch.href = targetUrl.href;
                prefetch.as = "document";
                document.head.appendChild(prefetch);
                existing.add(targetUrl.href);
            });
        }

        container.querySelectorAll(".collapse").forEach(collapse => {
            setCollapseArrow(collapse);
            collapse.addEventListener("shown.bs.collapse", () => setCollapseArrow(collapse));
            collapse.addEventListener("hidden.bs.collapse", () => setCollapseArrow(collapse));
        });

        applyActiveNavigation();
        enhanceDataTables();
        window.addEventListener("hashchange", applyActiveNavigation);
        setSidebarState(savedCollapsed);
        requestAnimationFrame(() => document.body.classList.remove("navbar-state-booting"));
        document.getElementById("sidebarToggle")?.addEventListener("click", () => {
            setSidebarState(!sidebar.classList.contains("collapsed"));
        });
        container.addEventListener("click", handleSlimCollapseClick, true);
        container.addEventListener("click", handleSidebarNavigation);
        container.addEventListener("click", handleUserPopoverClick);
        document.addEventListener("pointerdown", closeSidebarFromOutside);
        document.addEventListener("pointerdown", closeUserPopoverFromOutside);
        document.addEventListener("pointerdown", closeSlimFlyoutFromOutside);
        document.addEventListener("keydown", handleNavbarKeydown);
        window.addEventListener("resize", closeSlimFlyout);
        window.addEventListener("scroll", closeSlimFlyout, true);
        window.addEventListener("load", enhanceDataTables);
        window.addEventListener("drp:tables-updated", enhanceDataTables);
        window.requestIdleCallback
            ? window.requestIdleCallback(prefetchNavigationTargets, { timeout: 1500 })
            : window.setTimeout(prefetchNavigationTargets, 600);

        const tableObserver = new MutationObserver(() => {
            window.clearTimeout(window.__drpTableEnhanceTimer);
            window.__drpTableEnhanceTimer = window.setTimeout(enhanceDataTables, 90);
        });
        tableObserver.observe(document.body, { childList: true, subtree: true });

        window.dispatchEvent(new CustomEvent("navbar:ready", { detail: { activePage: getActivePage(), activeLabel: getActiveLabel(), dashboardView: getDashboardView() } }));
    } catch (error) {
        document.body.classList.remove("navbar-state-booting");
        console.error("Unable to load the shared navbar:", error);
    }
})();

function initGlobalModalBehavior() {
    if (window.__drpGlobalModalBehaviorInitialized) return;
    window.__drpGlobalModalBehaviorInitialized = true;

    const modalSelector = '.modal';

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

        const resetModalLayout = () => {
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
            if (event.target.closest('button, input, select, textarea, a')) return;
            if (event.button !== 0 && event.pointerType === 'mouse') return;
            const rect = dialog.getBoundingClientRect();
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            offsetX = rect.left;
            offsetY = rect.top;
            dialog.style.position = 'fixed';
            dialog.style.margin = '0';
            dialog.style.left = `${rect.left}px`;
            dialog.style.top = `${rect.top}px`;
            dialog.style.transform = 'none';
            header.setPointerCapture?.(event.pointerId);
        });

        header.addEventListener('pointermove', (event) => {
            if (!dragging) return;
            const rect = dialog.getBoundingClientRect();
            const maxLeft = Math.max(8, window.innerWidth - Math.min(rect.width, window.innerWidth - 16) - 8);
            const maxTop = Math.max(8, window.innerHeight - 96);
            const nextLeft = Math.min(Math.max(8, offsetX + event.clientX - startX), maxLeft);
            const nextTop = Math.min(Math.max(8, offsetY + event.clientY - startY), maxTop);
            dialog.style.left = `${nextLeft}px`;
            dialog.style.top = `${nextTop}px`;
        });

        const stopDrag = (event) => {
            dragging = false;
            if (header.hasPointerCapture?.(event.pointerId)) {
                header.releasePointerCapture(event.pointerId);
            }
        };
        header.addEventListener('pointerup', stopDrag);
        header.addEventListener('pointercancel', stopDrag);

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
            --sidebar-width: 260px;
            --sidebar-collapsed-width: 70px;
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
            overflow: hidden !important;
            transform: translateZ(0);
            will-change: width;
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
            margin-left: var(--sidebar-width) !important;
            width: calc(100% - var(--sidebar-width)) !important;
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
