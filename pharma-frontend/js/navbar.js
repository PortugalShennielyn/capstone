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
            const cacheKey = "drpNavbarHtml:v12";
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

        function getActivePage() {
            const hash = window.location.hash.replace("#", "");
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
                "pos.html": "pos",
                "clerk.html": "clerk"
            };
            return pageMap[filename] || "";
        }

        function setSidebarState(isCollapsed) {
            sidebar?.classList.toggle("collapsed", isCollapsed);
            mainWrapper?.classList.toggle("collapsed", isCollapsed);
            document.body.classList.toggle("navbar-sidebar-collapsed", isCollapsed);
            localStorage.setItem("drpSidebarCollapsed", String(isCollapsed));
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

            const targetUrl = new URL(link.href, window.location.href);
            const isSamePath = targetUrl.pathname === window.location.pathname;
            const isSameHash = targetUrl.hash === window.location.hash || (!targetUrl.hash && !window.location.hash);
            const isActiveModule = link.dataset.navPage && link.dataset.navPage === getActivePage();

            if ((isSamePath && isSameHash) || isActiveModule) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            sessionStorage.setItem("drpLastNavigationTarget", link.dataset.navPage || targetUrl.pathname);
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
        container.addEventListener("click", handleSidebarNavigation);
        document.addEventListener("pointerdown", closeSidebarFromOutside);
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

        window.dispatchEvent(new CustomEvent("navbar:ready", { detail: { activePage: getActivePage() } }));
    } catch (error) {
        document.body.classList.remove("navbar-state-booting");
        console.error("Unable to load the shared navbar:", error);
    }
})();

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
            overflow-y: hidden !important;
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
            min-width: 1540px !important;
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
        .table-responsive > table.po-list-table td:nth-child(2) { width: 120px !important; }
        .table-responsive > table.po-list-table .col-items,
        .table-responsive > table.po-list-table td:nth-child(3) { width: 210px !important; }
        .table-responsive > table.po-list-table .col-brand,
        .table-responsive > table.po-list-table td:nth-child(4) { width: 155px !important; }
        .table-responsive > table.po-list-table .col-qty,
        .table-responsive > table.po-list-table td:nth-child(5) { width: 90px !important; }
        .table-responsive > table.po-list-table .col-terms,
        .table-responsive > table.po-list-table td:nth-child(6) { width: 105px !important; }
        .table-responsive > table.po-list-table .col-delivery,
        .table-responsive > table.po-list-table td:nth-child(7) { width: 130px !important; }
        .table-responsive > table.po-list-table .col-money,
        .table-responsive > table.po-list-table td:nth-child(8),
        .table-responsive > table.po-list-table td:nth-child(9) { width: 130px !important; }
        .table-responsive > table.po-list-table .col-status,
        .table-responsive > table.po-list-table td:nth-child(10) { width: 105px !important; }
        .table-responsive > table.po-list-table .col-actions,
        .table-responsive > table.po-list-table td:nth-child(11) { width: 95px !important; }

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
            overflow-y: hidden !important;
            border-radius: 10px !important;
            -webkit-overflow-scrolling: touch !important;
        }

        .table-responsive > table.table,
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
        table.data-table-enhanced [data-table-column="actions"] {
            width: 120px !important;
            min-width: 120px !important;
            white-space: nowrap !important;
            overflow: visible !important;
            overflow-wrap: normal !important;
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
    `;
    document.head.appendChild(style);
}
