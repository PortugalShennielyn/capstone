import PharmaUtils from '../utils.js';

const API_BASE_URL = window.location.port
    ? 'http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1'
    : '../pharma-api/v1';

const VIEW_STATUS = {
    pending: 'Pending',
    approved: 'Approved',
    revision: 'Revision Requested',
    rejected: 'Rejected'
};

let currentApprovalView = 'pending';
let approvalOrdersCache = [];
let approvalFilters = {
    fromDate: '',
    toDate: '',
    month: '',
    year: ''
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function fetchJson(url, options = {}) {
    return PharmaUtils.safeFetch(url, { credentials: 'include', ...options });
}

function cleanText(value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return ['N/A', 'NA', 'NULL', 'NONE'].includes(text.toUpperCase()) ? '' : text;
}

function displayText(value) {
    const text = cleanText(value);
    return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function displayDetailText(value) {
    const text = cleanText(value);
    return /^[a-z]/.test(text) ? displayText(text) : text;
}

function attributeNumber(value) {
    const text = cleanText(value);
    if (!text || !/^-?\d+(?:\.0+)?$|^-?\d+\.\d+$/.test(text)) return text;
    return String(Number(text));
}

function measurementWithUnit(value, unit) {
    const amount = attributeNumber(value);
    const unitText = cleanText(unit);
    if (!amount) return '';
    if (!unitText || /[a-zA-Z%]+/.test(amount)) return amount;
    return `${amount} ${unitText}`;
}

function formatDate(value) {
    if (!value) return 'Not set';
    const text = String(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        : new Date(text.replace(' ', 'T'));
    return Number.isNaN(date.getTime())
        ? escapeHtml(value)
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(value) {
    if (!value) return 'Not set';
    const date = orderDateValue({ order_date: value });
    return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : escapeHtml(value);
}

function orderDateValue(order) {
    const raw = order.order_date || order.created_at || '';
    if (!raw) return null;
    const text = String(raw);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        : new Date(text.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
}

function peso(value) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(Number(value || 0));
}

const REASON_OPTIONS = [
    'Wrong supplier',
    'Wrong item',
    'Wrong quantity',
    'Price too high',
    'Duplicate PO',
    'Budget issue',
    'Need revision',
    'Other'
];

function wordCount(value) {
    return cleanText(value).split(/\s+/).filter(Boolean).length;
}

async function requestControlledReason({ title, label, confirmButtonText, errorMessage }) {
    if (!window.Swal) {
        const fallback = prompt(label || title) || '';
        if (!fallback.trim()) {
            PharmaUtils.toast.error(errorMessage);
            return '';
        }
        return fallback.trim();
    }

    const selectOptions = REASON_OPTIONS.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('');
    const result = await Swal.fire({
        title,
        html: `
            <div class="text-start">
                <label class="form-label fw-semibold" for="poReasonSelect">${escapeHtml(label)}</label>
                <select id="poReasonSelect" class="form-select">
                    <option value="" selected disabled>Select reason...</option>
                    ${selectOptions}
                </select>
                <div id="poReasonOtherWrap" class="mt-3 d-none">
                    <label class="form-label fw-semibold" for="poReasonOther">Manual reason</label>
                    <textarea id="poReasonOther" class="form-control" rows="3" maxlength="220" placeholder="Enter a short reason..."></textarea>
                    <div class="small text-muted mt-1"><span id="poReasonWordCount">0</span>/20 words</div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText,
        confirmButtonColor: '#7c3aed',
        didOpen: () => {
            const select = document.getElementById('poReasonSelect');
            const wrap = document.getElementById('poReasonOtherWrap');
            const textarea = document.getElementById('poReasonOther');
            const counter = document.getElementById('poReasonWordCount');
            const update = () => {
                wrap?.classList.toggle('d-none', select?.value !== 'Other');
                if (counter && textarea) counter.textContent = String(wordCount(textarea.value));
            };
            select?.addEventListener('change', update);
            textarea?.addEventListener('input', update);
            update();
        },
        preConfirm: () => {
            const selected = document.getElementById('poReasonSelect')?.value || '';
            const manual = cleanText(document.getElementById('poReasonOther')?.value || '');
            if (!selected) {
                Swal.showValidationMessage('Select a reason.');
                return false;
            }
            if (selected === 'Other') {
                const count = wordCount(manual);
                if (!manual) {
                    Swal.showValidationMessage('Enter the manual reason.');
                    return false;
                }
                if (count > 20) {
                    Swal.showValidationMessage('Manual reason must be 20 words or fewer.');
                    return false;
                }
                return manual;
            }
            return selected;
        }
    });

    return result.isConfirmed ? cleanText(result.value) : '';
}

function showReasonModal(order) {
    const reason = cleanText(order?.approval_reason);
    if (!reason) return;
    if (window.Swal) {
        Swal.fire({
            title: 'Reason',
            text: reason,
            confirmButtonColor: '#7c3aed'
        });
    } else {
        alert(reason);
    }
}

function sameText(left, right) {
    return cleanText(left).toLowerCase() === cleanText(right).toLowerCase();
}

function groceryNetWeightDisplay(item, fallback = '') {
    return measurementWithUnit(item.weight_volume_value || item.net_weight || item.size_value, item.weight_volume_unit || item.grocery_unit || item.unit) || fallback;
}

function medicineStrengthDisplay(item) {
    return measurementWithUnit(item.strength_value, item.strength_unit)
        || cleanText(item.strength_size_display || item.strength_size_value || item.strength)
        || '';
}

function medicineNetContentDisplay(item) {
    return measurementWithUnit(item.net_content_value || item.volume_value || item.size_value, item.net_content_unit || item.volume_unit || item.unit);
}

function productPackagingValue(item) {
    return displayText(item.packaging || item.package_type);
}

function productName(item) {
    const brand = cleanText(item.brand_name);
    const variant = cleanText(item.variant_flavor);
    const size = groceryNetWeightDisplay(item) || medicineStrengthDisplay(item) || medicineNetContentDisplay(item);
    let name = cleanText(item.product_name) || 'Unnamed product';

    if (brand) {
        const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        name = name.replace(new RegExp(`^${escapedBrand}\\s*[-:]?\\s*`, 'i'), '').trim() || name;
    }
    [variant, size, productPackagingValue(item)].filter(Boolean).forEach((part) => {
        const escapedPart = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        name = name.replace(new RegExp(`\\s*[-:]?\\s*${escapedPart}\\s*$`, 'i'), '').trim() || name;
    });

    return name || 'Unnamed product';
}

function brandName(item) {
    return cleanText(item.brand_name) || '-';
}

function productSpecification(item) {
    const category = cleanText(item.category_name).toLowerCase();
    const variant = cleanText(item.variant_flavor);
    const generic = cleanText(item.generic_name);
    const strength = medicineStrengthDisplay(item);
    const netWeight = groceryNetWeightDisplay(item);
    const volume = medicineNetContentDisplay(item);
    const packaging = productPackagingValue(item);
    const form = cleanText(item.dosage_form || item.type_name);
    const parts = category === 'medicine'
        ? [generic, strength, volume, form || packaging]
        : [variant, netWeight || cleanText(item.size_value), packaging];
    const seen = new Set();

    return parts
        .map((part) => displayDetailText(part))
        .filter((part) => {
            if (!part || ['medicine', 'grocery'].includes(part.toLowerCase())) return false;
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(' \u2022 ');
}

function stockCountUnit(item, quantity = 2) {
    const packaging = cleanText(productPackagingValue(item)).toLowerCase();
    const unit = cleanText(item.unit || item.weight_volume_unit || item.net_content_unit).toLowerCase();
    const packageMap = {
        can: 'can',
        cans: 'can',
        bottle: 'bottle',
        bottles: 'bottle',
        pack: 'pack',
        packs: 'pack',
        sachet: 'sachet',
        sachets: 'sachet'
    };

    if (packageMap[packaging]) return pluralizeStockUnit(packageMap[packaging], quantity);
    if (packaging === 'blister pack') return 'pcs';
    if (['g', 'gram', 'grams', 'kg', 'mg', 'mcg', 'ml', 'l'].includes(unit)) return 'pcs';
    return pluralizeStockUnit(unit || 'pcs', quantity);
}

function pluralizeStockUnit(unit, quantity = 2) {
    const raw = cleanText(unit || 'pcs');
    const lower = raw.toLowerCase();
    const fixed = {
        pc: 'pcs',
        pcs: 'pcs',
        piece: 'pcs',
        pieces: 'pcs',
        can: 'cans',
        cans: 'cans',
        bottle: 'bottles',
        bottles: 'bottles',
        pack: 'packs',
        packs: 'packs',
        sachet: 'sachets',
        sachets: 'sachets'
    };
    const text = fixed[lower] || displayText(raw);
    if (Number(quantity) === 1) {
        return ['cans', 'bottles', 'packs', 'sachets'].includes(text.toLowerCase())
            ? text.replace(/s$/i, '')
            : text;
    }
    if (/s$/i.test(text)) return text;
    if (/y$/i.test(text)) return text.replace(/y$/i, 'ies');
    return `${text}s`;
}

function inventoryQuantityLabel(quantity, unit) {
    const count = Number(quantity || 0);
    const unitText = cleanText(unit || 'pcs');
    if (count === 1) return `1 ${unitText.replace(/^pcs$/i, 'pc')}`;
    if (unitText.toLowerCase() === 'pc') return `${count} pcs`;
    return `${count} ${pluralizeStockUnit(unitText, count)}`;
}

function quantityWithInventoryUnit(item, quantity) {
    return inventoryQuantityLabel(Number(quantity || 0), stockCountUnit(item, quantity));
}

function purchaseUnitInfo(item) {
    const suppliedUnit = cleanText(item.purchase_unit).replace(/^by\s+/i, '');
    const quantity = Math.max(1, Number(item.units_per_purchase_unit || item.purchase_unit_qty || 1));
    const purchaseUnit = displayText(suppliedUnit || 'Box');
    const stockUnit = stockCountUnit(item, quantity);
    return {
        purchaseUnit,
        quantity,
        conversionNote: `1 ${purchaseUnit} = ${inventoryQuantityLabel(quantity, stockUnit)}`
    };
}

function purchaseUnitQuantityLabel(item) {
    const quantity = Number(item.purchase_qty || item.quantity || 0);
    const unit = purchaseUnitInfo(item).purchaseUnit || 'Package';
    return `${quantity} ${quantity === 1 ? unit : pluralizeStockUnit(unit, quantity)}`;
}

function inventoryQtyForItem(item) {
    const purchaseQty = Number(item.purchase_qty || item.quantity || 0);
    const unitsPerPurchaseUnit = Number(item.units_per_purchase_unit || item.purchase_unit_qty || 1);
    return purchaseQty * Math.max(1, unitsPerPurchaseUnit);
}

function productLineTotal(item) {
    return Number(item.line_total || item.stored_line_total || 0) || (Number(item.inventory_qty_ordered || inventoryQtyForItem(item)) * Number(item.price || 0));
}

function inventoryCount(value) {
    return new Intl.NumberFormat('en-US').format(Math.max(0, Number(value || 0)));
}

function inventorySnapshotCard(item) {
    const values = [
        ['Storage', item.storage_qty],
        ['Shelf', item.shelf_qty],
        ['Damaged', item.damaged_qty],
        ['Total', item.total_qty]
    ];

    return `
        <div class="approval-inventory-strip">
            <span class="approval-inventory-label">Current Inventory</span>
            ${values.map(([label, value]) => `
                <span class="approval-inventory-chip">
                    <span>${escapeHtml(label)}</span>
                    <strong>${escapeHtml(inventoryCount(value))}</strong>
                </span>
            `).join('')}
        </div>
    `;
}

function approvalStateClass(status) {
    const text = cleanText(status).toLowerCase();
    if (text === 'approved') return 'is-approved';
    if (text === 'rejected') return 'is-rejected';
    if (text.includes('revision')) return 'is-revision';
    return 'is-pending';
}

function logisticsStateClass(status) {
    const text = cleanText(status).toLowerCase();
    if (text === 'delivered' || text === 'complete') return 'is-approved';
    if (text === 'cancelled' || text === 'rejected') return 'is-rejected';
    if (text === 'arrived' || text === 'received') return 'is-revision';
    return 'is-logistics';
}

function lineList(items, valueGetter, options = {}) {
    const source = Array.isArray(items) ? items : [];
    if (!source.length) return '<span class="text-muted">None</span>';
    const plain = options.plain ? ' approval-line-list-plain' : '';
    const compact = options.compact ? ' approval-line-list-compact' : '';

    return `
        <ol class="approval-line-list${plain}${compact}">
            ${source.map((item, index) => `
                <li>
                    ${options.plain ? '' : `<span class="line-index">${index + 1}.</span>`}
                    <span class="line-text">${escapeHtml(valueGetter(item) || '-')}</span>
                </li>
            `).join('')}
        </ol>
    `;
}

function statusBadge(status) {
    const colors = {
        Pending: '#f59e0b',
        Approved: '#16a34a',
        'Revision Requested': '#7c3aed',
        Rejected: '#dc2626',
        Cancelled: '#64748b'
    };
    return `<span class="badge approval-status-badge text-white" style="background:${colors[status] || '#64748b'}">${escapeHtml(status || 'Pending')}</span>`;
}

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-bs-theme', theme);

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }

    localStorage.setItem('drpTheme', theme);
}

function tableEmpty(message) {
    return `<tr><td colspan="13" class="approval-empty">${escapeHtml(message)}</td></tr>`;
}

function periodFilteredOrders() {
    return approvalOrdersCache.filter((order) => {
        const date = orderDateValue(order);
        if (!date) return false;
        const year = String(date.getFullYear());
        const month = String(date.getMonth() + 1).padStart(2, '0');
        if (approvalFilters.year && year !== approvalFilters.year) return false;
        if (approvalFilters.month && month !== approvalFilters.month) return false;
        if (approvalFilters.fromDate) {
            const from = orderDateValue({ order_date: approvalFilters.fromDate });
            if (from && date < from) return false;
        }
        if (approvalFilters.toDate) {
            const to = orderDateValue({ order_date: approvalFilters.toDate });
            if (to && date > to) return false;
        }
        return true;
    });
}

function filteredOrders() {
    const status = VIEW_STATUS[currentApprovalView];
    return periodFilteredOrders().filter((order) => (order.approval_status || 'Pending') === status);
}

function monthName(month) {
    if (!month) return '';
    return new Date(2026, Number(month) - 1, 1).toLocaleDateString('en-US', { month: 'long' });
}

function updatePeriodLabel() {
    const label = document.querySelector('#approvalPeriodLabel strong');
    if (!label) return;

    const { fromDate, toDate, month, year } = approvalFilters;
    if (fromDate || toDate) {
        const from = fromDate ? formatShortDate(fromDate) : 'Start';
        const to = toDate ? formatShortDate(toDate) : 'Today';
        label.textContent = `${from} - ${to}`;
        return;
    }
    if (month && year) {
        label.textContent = `${monthName(month)} ${year}`;
        return;
    }
    if (month) {
        label.textContent = monthName(month);
        return;
    }
    if (year) {
        label.textContent = year;
        return;
    }
    label.textContent = 'All purchase orders';
}

function updateSummaryCards() {
    const periodOrders = periodFilteredOrders();
    const pending = periodOrders.filter((order) => (order.approval_status || 'Pending') === VIEW_STATUS.pending);
    const approved = periodOrders.filter((order) => order.approval_status === VIEW_STATUS.approved);
    const rejected = periodOrders.filter((order) => order.approval_status === VIEW_STATUS.rejected);
    const overallAmount = periodOrders.reduce((total, order) => total + Number(order.total_amount || 0), 0);

    document.getElementById('pendingApprovalCount').textContent = String(pending.length);
    document.getElementById('approvedApprovalCount').textContent = String(approved.length);
    document.getElementById('rejectedApprovalCount').textContent = String(rejected.length);
    document.getElementById('overallPoAmount').textContent = peso(overallAmount);
    updatePeriodLabel();
}

function adjustedAmount(order) {
    const finalPayment = Number(order.final_payment || 0);
    return finalPayment > 0 ? finalPayment : Number(order.total_amount || 0);
}

function renderApprovalTable() {
    const tableBody = document.querySelector('#table-pending-orders tbody');
    if (!tableBody) return;

    const orders = filteredOrders();
    if (!orders.length) {
        tableBody.innerHTML = tableEmpty(`No ${currentApprovalView} purchase orders found.`);
        return;
    }

    tableBody.innerHTML = orders.map((order) => {
        const items = order.items || [];
        const isApproved = (order.approval_status || 'Pending') === VIEW_STATUS.approved;
        const canRevoke = isApproved && (order.status || 'Pending') === 'Pending';
        const reason = cleanText(order.approval_reason);
        const revokeButton = canRevoke
            ? `
                <button class="btn btn-sm btn-outline-warning revoke-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Revoke Approval" aria-label="Revoke approval ${escapeHtml(order.po_number || '')}">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            `
            : '';
        const reasonButton = reason
            ? `
                <button class="btn btn-sm btn-outline-secondary reason-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View reason" aria-label="View reason">
                    <i class="fa-regular fa-message"></i>
                </button>
            `
            : '-';
        const actionButtons = currentApprovalView === 'pending'
            ? `
                <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View" aria-label="View ${escapeHtml(order.po_number || '')}">
                    <i class="fa-regular fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-success approve-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Approve" aria-label="Approve ${escapeHtml(order.po_number || '')}">
                    <i class="fa-solid fa-check"></i>
                </button>
                <button class="btn btn-sm btn-outline-warning revision-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Request Revision" aria-label="Request revision ${escapeHtml(order.po_number || '')}">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger reject-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Reject" aria-label="Reject ${escapeHtml(order.po_number || '')}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `
            : `
                <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View" aria-label="View ${escapeHtml(order.po_number || '')}">
                    <i class="fa-regular fa-eye"></i>
                </button>
                ${revokeButton}
            `;

        return `
            <tr>
                <td>${formatDate(order.order_date)}</td>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td class="approval-supplier-cell">${escapeHtml(order.supplier_name || '-')}</td>
                <td class="approval-items-cell">${lineList(items, brandName, { compact: true })}</td>
                <td class="approval-items-cell">${lineList(items, productName, { compact: true })}</td>
                <td class="approval-items-cell">${lineList(items, productSpecification, { compact: true })}</td>
                <td>${escapeHtml(order.total_quantity || items.reduce((sum, item) => sum + Number(item.inventory_qty_ordered || item.quantity || 0), 0))}</td>
                <td class="approval-money-cell">${peso(order.total_amount)}</td>
                <td class="approval-money-cell">${peso(adjustedAmount(order))}</td>
                <td>${formatShortDate(order.expected_delivery_date)}</td>
                <td>${statusBadge(order.approval_status || 'Pending')}</td>
                <td>${reasonButton}</td>
                <td class="approval-actions-cell"><div class="approval-actions">${actionButtons}</div></td>
            </tr>
        `;
    }).join('');
}

function setApprovalView(view) {
    currentApprovalView = VIEW_STATUS[view] ? view : 'pending';
    document.querySelectorAll('.approval-tab-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.approvalView === currentApprovalView);
    });
    updateSummaryCards();
    renderApprovalTable();
}

function populateFilterOptions() {
    const monthSelect = document.getElementById('approvalMonth');
    const yearSelect = document.getElementById('approvalYear');
    if (monthSelect && monthSelect.options.length <= 1) {
        monthSelect.insertAdjacentHTML('beforeend', Array.from({ length: 12 }, (_, index) => {
            const value = String(index + 1).padStart(2, '0');
            return `<option value="${value}">${monthName(value)}</option>`;
        }).join(''));
    }
    if (!yearSelect) return;
    const years = new Set([String(new Date().getFullYear())]);
    approvalOrdersCache.forEach((order) => {
        const date = orderDateValue(order);
        if (date) years.add(String(date.getFullYear()));
    });
    const selected = yearSelect.value;
    yearSelect.innerHTML = '<option value="">All Years</option>'
        + [...years].sort((a, b) => Number(b) - Number(a)).map((year) => `<option value="${year}">${year}</option>`).join('');
    yearSelect.value = [...years].includes(selected) ? selected : '';
}

function applyApprovalFilters() {
    approvalFilters = {
        fromDate: document.getElementById('approvalStartDate')?.value || '',
        toDate: document.getElementById('approvalEndDate')?.value || '',
        month: document.getElementById('approvalMonth')?.value || '',
        year: document.getElementById('approvalYear')?.value || ''
    };
    updateSummaryCards();
    renderApprovalTable();
}

function clearApprovalFilters() {
    ['approvalStartDate', 'approvalEndDate', 'approvalMonth', 'approvalYear'].forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.value = '';
    });
    approvalFilters = { fromDate: '', toDate: '', month: '', year: '' };
    loadApprovalOrders();
}

function currentFilterInputState() {
    return {
        fromDate: document.getElementById('approvalStartDate')?.value || '',
        toDate: document.getElementById('approvalEndDate')?.value || '',
        month: document.getElementById('approvalMonth')?.value || '',
        year: document.getElementById('approvalYear')?.value || ''
    };
}

function syncFiltersFromInputs() {
    approvalFilters = currentFilterInputState();
    updateSummaryCards();
    renderApprovalTable();
}

function resetFiltersIfInputsCleared() {
    const nextFilters = currentFilterInputState();
    const allClear = !nextFilters.fromDate && !nextFilters.toDate && !nextFilters.month && !nextFilters.year;
    if (allClear) {
        approvalFilters = { fromDate: '', toDate: '', month: '', year: '' };
        loadApprovalOrders();
    }
}

async function loadApprovalOrders() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_orders.php?scope=all&t=${Date.now()}`);
        approvalOrdersCache = data.purchase_orders || [];
        populateFilterOptions();
        updateSummaryCards();
        renderApprovalTable();
    } catch (error) {
        approvalOrdersCache = [];
        updateSummaryCards();
        renderApprovalTable();
        PharmaUtils.toast.error(error.message);
    }
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function setModalRect(nextRect = {}) {
    const modal = document.getElementById('pendingOrderViewModal');
    const dialog = modal?.querySelector('.modal-dialog');
    if (!modal || !dialog) return;

    const current = dialog.getBoundingClientRect();
    const minWidth = Math.min(720, window.innerWidth - 16);
    const minHeight = Math.min(420, window.innerHeight - 16);
    const maxWidth = Math.max(minWidth, window.innerWidth - 16);
    const maxHeight = Math.max(minHeight, window.innerHeight - 16);
    const width = clampNumber(nextRect.width ?? current.width, minWidth, maxWidth);
    const height = clampNumber(nextRect.height ?? current.height, minHeight, maxHeight);
    const left = clampNumber(nextRect.left ?? current.left, 8, Math.max(8, window.innerWidth - width - 8));
    const top = clampNumber(nextRect.top ?? current.top, 8, Math.max(8, window.innerHeight - height - 8));

    modal.classList.add('approval-modal-positioned');
    modal.style.setProperty('--approval-modal-left', `${left}px`);
    modal.style.setProperty('--approval-modal-top', `${top}px`);
    modal.style.setProperty('--approval-modal-width', `${width}px`);
    modal.style.setProperty('--approval-modal-height', `${height}px`);
}

function centerModal() {
    const modal = document.getElementById('pendingOrderViewModal');
    const dialog = modal?.querySelector('.modal-dialog');
    if (!modal || !dialog) return;

    const rect = dialog.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 720), window.innerWidth - 16);
    const height = Math.min(Math.max(rect.height, 420), window.innerHeight * 0.85);
    setModalRect({
        width,
        height,
        left: (window.innerWidth - width) / 2,
        top: Math.max(8, (window.innerHeight - height) / 2)
    });
}

function initModalControls() {
    const modal = document.getElementById('pendingOrderViewModal');
    const dialog = modal?.querySelector('.modal-dialog');
    const header = modal?.querySelector('.modal-header');
    const corner = document.getElementById('pending-modal-corner-resize');
    if (!modal || !dialog || modal.dataset.layoutControlsReady === 'true') return;
    modal.dataset.layoutControlsReady = 'true';

    modal.addEventListener('shown.bs.modal', () => {
        if (!modal.classList.contains('approval-modal-positioned')) centerModal();
        else setModalRect();
    });

    header?.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('button, a, input, select, textarea')) return;
        event.preventDefault();
        header.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setModalRect({
                left: start.left + moveEvent.clientX - startX,
                top: start.top + moveEvent.clientY - startY,
                width: start.width,
                height: start.height
            });
        };
        const stop = () => {
            header.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    corner?.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        corner.classList.add('is-dragging');
        corner.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setModalRect({
                left: start.left,
                top: start.top,
                width: start.width + moveEvent.clientX - startX,
                height: start.height + moveEvent.clientY - startY
            });
        };
        const stop = () => {
            corner.classList.remove('is-dragging');
            corner.releasePointerCapture?.(event.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
    });

    window.addEventListener('resize', () => {
        if (modal.classList.contains('show')) setModalRect();
    });
}

async function openViewPurchaseOrder(poId) {
    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/get_purchase_order.php?po_id=${encodeURIComponent(poId)}`);
        const order = data.purchase_order;
        const items = order.items || [];
        const modal = document.getElementById('pendingOrderViewModal');
        const approvalStatus = order.approval_status || 'Pending';
        const isPending = approvalStatus === 'Pending';

        document.getElementById('pendingViewPoNumber').textContent = order.po_number;
        document.getElementById('pendingViewDetails').innerHTML = `
            <div class="po-detail-chip"><span>Supplier</span><strong>${escapeHtml(order.supplier_name)}</strong></div>
            <div class="po-detail-chip"><span>Order Date</span><strong>${formatDate(order.order_date)}</strong></div>
            <div class="po-detail-chip"><span>ETA</span><strong>${formatDate(order.expected_delivery_date)}</strong></div>
            <div class="po-detail-chip"><span>Payment Terms</span><strong>${escapeHtml(order.payment_terms || 'Not set')}</strong></div>
            <div class="po-summary-strip">
                <div><span>Total Amount</span><strong>${peso(order.total_amount)}</strong></div>
                <div><span>Approval Status</span><strong class="approval-pill ${approvalStateClass(approvalStatus)}">${escapeHtml(approvalStatus)}</strong></div>
                <div><span>Logistics Status</span><strong class="approval-pill ${logisticsStateClass(order.status)}">${escapeHtml(order.status || 'Pending')}</strong></div>
            </div>
            ${cleanText(order.approval_reason) ? `<div class="po-detail-box"><span>Reason</span><strong>${escapeHtml(order.approval_reason)}</strong></div>` : ''}
        `;
        document.getElementById('pendingViewItemCount').textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
        document.getElementById('pendingViewItems').innerHTML = items.map((item, index) => {
            const purchaseUnit = purchaseUnitInfo(item);
            const stockToReceive = quantityWithInventoryUnit(item, Number(item.inventory_qty_ordered || inventoryQtyForItem(item)));
            const titleParts = [brandName(item), productName(item)].filter((value) => cleanText(value) && value !== '-');
            return `
                <article class="approval-item-card">
                    <div class="approval-item-main">
                        <div class="approval-item-index">${index + 1}</div>
                        <div class="approval-item-copy">
                            <h3>${escapeHtml(titleParts.join(' ') || 'Unnamed product')}</h3>
                            <p>${escapeHtml(cleanText(item.type_name) || 'Product type not set')}</p>
                            <span>${escapeHtml(productSpecification(item) || 'Specification not set')}</span>
                        </div>
                    </div>
                    <div class="approval-item-decision">
                        <div class="approval-item-facts">
                            <div><span>Unit</span><strong>${escapeHtml(purchaseUnit.purchaseUnit || '-')}</strong></div>
                        <div><span>Conversion</span><strong>${escapeHtml(purchaseUnit.conversionNote || '-')}</strong></div>
                            <div><span>To Receive</span><strong>${escapeHtml(stockToReceive)}</strong></div>
                            <div class="approval-item-total"><span>Line Total</span><strong>${peso(productLineTotal(item))}</strong></div>
                        </div>
                        ${inventorySnapshotCard(item)}
                    </div>
                </article>
            `;
        }).join('');
        const footerActions = document.getElementById('pendingModalApprovalActions');
        if (footerActions) {
            footerActions.classList.toggle('d-none', !isPending);
            footerActions.querySelector('.modal-reject-po-btn').dataset.poId = order.po_id;
            footerActions.querySelector('.modal-approve-po-btn').dataset.poId = order.po_id;
        }

        bootstrap.Modal.getOrCreateInstance(modal).show();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function approvePurchaseOrder(poId) {
    try {
        if (window.Swal) {
            const result = await Swal.fire({
                title: 'Approve purchase order?',
                text: 'This will mark the order as approved by the owner.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Approve',
                confirmButtonColor: '#16a34a'
            });
            if (!result.isConfirmed) return;
        } else if (!confirm('Approve this purchase order?')) {
            return;
        }

        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/approve_purchase_order.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ po_id: poId })
        });

        PharmaUtils.toast.success(data.message);
        await loadApprovalOrders();
        bootstrap.Modal.getInstance(document.getElementById('pendingOrderViewModal'))?.hide();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function rejectPurchaseOrder(poId) {
    try {
        const reason = await requestControlledReason({
            title: 'Reject Purchase Order',
            label: 'Rejection Reason',
            confirmButtonText: 'Reject',
            errorMessage: 'A rejection reason is required.'
        });
        if (!reason) return;

        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/reject_purchase_order.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ po_id: poId, reason })
        });

        PharmaUtils.toast.success(data.message);
        await loadApprovalOrders();
        bootstrap.Modal.getInstance(document.getElementById('pendingOrderViewModal'))?.hide();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function requestPurchaseOrderRevision(poId) {
    try {
        const reason = await requestControlledReason({
            title: 'Request PO Revision',
            label: 'Revision Reason',
            confirmButtonText: 'Send Revision Request',
            errorMessage: 'A revision reason is required.'
        });
        if (!reason) return;

        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/request_purchase_order_revision.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ po_id: poId, reason })
        });

        PharmaUtils.toast.success(data.message);
        await loadApprovalOrders();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

async function revokePurchaseOrderApproval(poId) {
    try {
        const reason = await requestControlledReason({
            title: 'Revoke Approval',
            label: 'Reason for revoking approval',
            confirmButtonText: 'Revoke Approval',
            errorMessage: 'A revoke reason is required.'
        });
        if (!reason) return;

        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/revoke_purchase_order_approval.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ po_id: poId, reason })
        });

        PharmaUtils.toast.success(data.message);
        await loadApprovalOrders();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function initPendingOrders() {
    setTheme(localStorage.getItem('drpTheme') || 'light');
    initModalControls();

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });

    document.getElementById('btnRefreshPendingOrders')?.addEventListener('click', loadApprovalOrders);
    document.getElementById('btnApplyApprovalFilters')?.addEventListener('click', applyApprovalFilters);
    ['approvalStartDate', 'approvalEndDate', 'approvalMonth', 'approvalYear'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', resetFiltersIfInputsCleared);
        document.getElementById(id)?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') syncFiltersFromInputs();
        });
    });
    document.querySelectorAll('.approval-tab-btn').forEach((button) => {
        button.addEventListener('click', () => setApprovalView(button.dataset.approvalView));
    });
    document.getElementById('table-pending-orders')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('.view-po-btn');
        const approveButton = event.target.closest('.approve-po-btn');
        const revisionButton = event.target.closest('.revision-po-btn');
        const rejectButton = event.target.closest('.reject-po-btn');
        const revokeButton = event.target.closest('.revoke-po-btn');
        const reasonButton = event.target.closest('.reason-po-btn');

        if (viewButton) openViewPurchaseOrder(viewButton.dataset.poId);
        if (approveButton) approvePurchaseOrder(approveButton.dataset.poId);
        if (revisionButton) requestPurchaseOrderRevision(revisionButton.dataset.poId);
        if (rejectButton) rejectPurchaseOrder(rejectButton.dataset.poId);
        if (revokeButton && !revokeButton.disabled) revokePurchaseOrderApproval(revokeButton.dataset.poId);
        if (reasonButton) {
            const order = approvalOrdersCache.find((item) => String(item.po_id) === String(reasonButton.dataset.poId));
            showReasonModal(order);
        }
    });

    document.getElementById('pendingModalApprovalActions')?.addEventListener('click', (event) => {
        const approveButton = event.target.closest('.modal-approve-po-btn');
        const rejectButton = event.target.closest('.modal-reject-po-btn');

        if (approveButton) approvePurchaseOrder(approveButton.dataset.poId);
        if (rejectButton) rejectPurchaseOrder(rejectButton.dataset.poId);
    });

    loadApprovalOrders();
}

initPendingOrders();
