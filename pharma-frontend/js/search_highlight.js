(function initializeSearchResultHighlighting() {
    'use strict';

    if (window.PharmacySearchHighlight) return;

    const MARK_SELECTOR = 'mark.search-match-highlight[data-search-match-highlight]';
    const INPUT_SELECTOR = [
        'input[type="search"]',
        'input[data-search-highlight-target]',
        'input.customizer-search'
    ].join(',');
    const EXCLUDED_ANCESTOR_SELECTOR = [
        'input',
        'textarea',
        'select',
        'option',
        'script',
        'style',
        'noscript',
        'template',
        'svg',
        '[data-search-highlight-ignore]',
        '.pagination',
        '.table-pagination',
        '.pagination-controls',
        '.pager',
        '.record-count'
    ].join(',');

    const pageTargets = Object.freeze({
        'admin_settings.html': { userSearchInput: '#usersTableBody' },
        'cancelled_sales.html': { cashierSearch: '#reportRows' },
        'cashier_pos.html': { cashierSearch: '#cashierOrderList' },
        'cashier_queue.html': { cashierSearch: '#queueRows' },
        'cashier_transaction_history.html': { cashierSearch: '#reportRows' },
        'completed_sales.html': { cashierSearch: '#reportRows' },
        'dashboard.html': {
            moduleSearchInput: '#moduleSearchResults',
            alertDetailSearch: '#alertDetailContent'
        },
        'inspect_deliveries.html': { inspectionSearch: '#inspectionQueueRows' },
        'inventory.html': {
            inventorySearch: '#table-inventory tbody',
            historySearch: '#stockHistoryResults'
        },
        'pos.html': { productSearch: '#cartTableBody' },
        'products.html': {
            productSearchInput: '#table-products tbody',
            selectedPricingSearch: '#selectedPricingPreviewBody'
        },
        'purchase_requests.html': {
            prSearch: '#requestRows',
            productSelectorSearch: '#productSelectorRows'
        },
        'receipt_history.html': { cashierSearch: '#reportRows' },
        'reports.html': { reportSearch: '#reportTableBody' },
        'return_damage.html': { returnSearch: '#table-return-damage tbody' },
        'sales_clerk_orders.html': { orderSearch: '#ordersTableBody' },
        'sales_clerk_pos.html': { productSearch: '#productsGrid' },
        'sales_history.html': { historySearch: '#historyBody' },
        'shelf_inventory.html': { shelfSearch: '#shelfInventoryTable tbody' },
        'supervisor_approval.html': { requestSearch: '#requestRows' },
        'supplier.html': {
            supplierProductSearch: '#table-supplier-products tbody',
            assignmentProductSearch: '#assignmentProductList'
        }
    });

    const bindings = new Map();
    let discoveryObserver = null;

    function currentPage() {
        return window.location.pathname.split('/').pop() || '';
    }

    function selectorFromReference(reference) {
        const value = String(reference || '').trim();
        if (!value) return '';
        if (/^[A-Za-z][\w:-]*$/.test(value)) return `#${CSS.escape(value)}`;
        return value;
    }

    function configuredTargetSelector(input) {
        const explicit = selectorFromReference(input.dataset.searchHighlightTarget);
        if (explicit) return explicit;

        const configured = input.id && pageTargets[currentPage()]?.[input.id];
        if (configured) return configured;

        const existingTarget = selectorFromReference(input.dataset.target);
        if (existingTarget) return existingTarget;

        return selectorFromReference(input.getAttribute('aria-controls'));
    }

    function fallbackTarget(input) {
        const context = input.closest('.modal, section, .panel, .card, main') || document.body;
        const candidates = [
            '[data-search-results]',
            '[role="listbox"]',
            '.search-results',
            '.results-list',
            '.product-grid',
            '.card-grid',
            'tbody'
        ];
        for (const selector of candidates) {
            const target = context.querySelector(selector);
            if (target && !target.contains(input)) return target;
        }
        return null;
    }

    function resolveTarget(input) {
        const selector = configuredTargetSelector(input);
        if (selector) {
            try {
                const target = document.querySelector(selector);
                if (target) return target;
            } catch (error) {
                console.warn('Ignored invalid search highlight target:', selector);
            }
        }
        return fallbackTarget(input);
    }

    function clear(container) {
        if (!container) return;
        const parents = new Set();
        container.querySelectorAll(MARK_SELECTOR).forEach((mark) => {
            const parent = mark.parentNode;
            if (!parent) return;
            parents.add(parent);
            parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        });
        parents.forEach((parent) => parent.normalize());
    }

    function isActionCell(element) {
        const cell = element.closest('td');
        const table = cell?.closest('table');
        if (!cell || !table) return false;
        const rowCells = Array.from(cell.parentElement?.children || []);
        const index = rowCells.indexOf(cell);
        if (index < 0) return false;
        const heading = table.tHead?.rows?.[table.tHead.rows.length - 1]?.cells?.[index];
        return /^(action|actions)$/i.test(String(heading?.textContent || '').trim());
    }

    function isHidden(element, boundary) {
        let current = element;
        while (current && current !== boundary.parentElement) {
            if (current.hidden
                || current.getAttribute?.('aria-hidden') === 'true'
                || current.classList?.contains('d-none')
                || current.style?.display === 'none'
                || current.style?.visibility === 'hidden') return true;
            if (current === boundary) break;
            current = current.parentElement;
        }
        return false;
    }

    function textNodes(container) {
        const nodes = [];
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                const button = parent?.closest('button');
                if (!parent
                    || parent.closest(MARK_SELECTOR)
                    || parent.closest(EXCLUDED_ANCESTOR_SELECTOR)
                    || (button && !button.matches('[role="option"], [data-module-result], [data-search-result]'))
                    || isActionCell(parent)
                    || isHidden(parent, container)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        while (walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
    }

    function highlightNode(node, query) {
        const source = node.nodeValue || '';
        const sourceLower = source.toLocaleLowerCase();
        const queryLower = query.toLocaleLowerCase();
        let cursor = 0;
        let matchIndex = sourceLower.indexOf(queryLower, cursor);
        if (matchIndex < 0) return;

        const fragment = document.createDocumentFragment();
        while (matchIndex >= 0) {
            if (matchIndex > cursor) fragment.appendChild(document.createTextNode(source.slice(cursor, matchIndex)));
            const mark = document.createElement('mark');
            mark.className = 'search-match-highlight';
            mark.dataset.searchMatchHighlight = 'true';
            mark.textContent = source.slice(matchIndex, matchIndex + query.length);
            fragment.appendChild(mark);
            cursor = matchIndex + query.length;
            matchIndex = sourceLower.indexOf(queryLower, cursor);
        }
        if (cursor < source.length) fragment.appendChild(document.createTextNode(source.slice(cursor)));
        node.parentNode?.replaceChild(fragment, node);
    }

    function apply(container, searchTerm) {
        if (!container) return;
        clear(container);
        const query = String(searchTerm || '').trim();
        if (!query) return;
        textNodes(container).forEach((node) => highlightNode(node, query));
    }

    function observeTarget(binding, target) {
        if (binding.target === target && binding.targetObserver) return;
        binding.targetObserver?.disconnect();
        binding.target = target;
        binding.targetObserver = new MutationObserver(() => schedule(binding));
        binding.targetObserver.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
        });
    }

    function render(binding) {
        binding.frame = 0;
        if (!binding.input.isConnected) return;
        const target = resolveTarget(binding.input);
        if (!target) return;
        observeTarget(binding, target);
        binding.targetObserver.disconnect();
        apply(target, binding.input.value);
        binding.targetObserver.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
        });
    }

    function schedule(binding) {
        if (binding.frame) cancelAnimationFrame(binding.frame);
        binding.frame = requestAnimationFrame(() => render(binding));
    }

    function bind(input) {
        if (!(input instanceof HTMLInputElement)) return null;
        if (bindings.has(input)) return bindings.get(input);
        const binding = { input, target: null, targetObserver: null, frame: 0 };
        bindings.set(input, binding);
        input.addEventListener('input', () => schedule(binding));
        input.addEventListener('search', () => schedule(binding));
        schedule(binding);
        return binding;
    }

    function scan(root = document) {
        if (root instanceof HTMLInputElement && root.matches(INPUT_SELECTOR)) bind(root);
        root.querySelectorAll?.(INPUT_SELECTOR).forEach(bind);
    }

    function refresh(input) {
        if (input) {
            const binding = bind(input);
            if (binding) schedule(binding);
            return;
        }
        bindings.forEach(schedule);
    }

    function start() {
        scan();
        discoveryObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) scan(node);
            }));
        });
        discoveryObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    window.PharmacySearchHighlight = Object.freeze({ apply, bind, clear, refresh, scan });
    window.dispatchEvent(new CustomEvent('pharmacy-search-highlight-ready'));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
