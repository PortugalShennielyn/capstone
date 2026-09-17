import API_BASE_URL from "../config/config.js";

let requests = [];
let activeRequest = null;
let openActionRequestId = null;
let openActionToggle = null;
const modalElement = document.getElementById("requestModal");
const modal = modalElement && window.bootstrap ? new bootstrap.Modal(modalElement) : null;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
const peso = (value) =>
    Number(value || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
const formatDateTime = (value) =>
    value
        ? new Date(String(value).replace(" ", "T")).toLocaleString("en-PH", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
          })
        : "-";
const formatDate = (value) =>
    value
        ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", {
              year: "numeric",
              month: "short",
              day: "numeric",
          })
        : "-";
const quantityStep = (unit) =>
    /^(kg|g|l|ml|kilogram|gram|liter|litre|milliliter|millilitre)s?$/i.test(
        String(unit || "").trim(),
    )
        ? "0.01"
        : "1";

async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}/purchase_requests/${path}`, {
        credentials: "include",
        cache: "no-store",
        ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || "Request failed.");
    return data;
}

function statusClass(status) {
    return (
        {
            Approved: "status-approved",
            Rejected: "status-rejected",
            "Revision Requested": "status-revision",
        }[status] || "status-pending"
    );
}

function stockRisk(request) {
    if (request.stock_risk) return request.stock_risk;
    const conditions = [
        ...new Set((request.items || []).map((item) => item.stock_condition).filter(Boolean)),
    ];
    return conditions.length > 1 ? "Mixed" : conditions[0] || "Normal";
}

function filteredRequests() {
    const search = $("#requestSearch").value.trim().toLowerCase();
    const start = $("#startDate").value;
    const end = $("#endDate").value;
    const status = $("#statusFilter").value;
    return requests.filter((request) => {
        const date = String(request.submitted_at || request.request_date || "").slice(0, 10);
        const haystack = [
            request.pr_number,
            request.requested_by_name,
            ...(request.items || []).flatMap((item) => [
                item.product_name,
                item.brand_name,
                item.specification,
            ]),
        ]
            .join(" ")
            .toLowerCase();
        return (
            (!status || request.status === status) &&
            (!start || date >= start) &&
            (!end || date <= end) &&
            (!search || haystack.includes(search))
        );
    });
}

function renderSummary() {
    const count = (status) => requests.filter((request) => request.status === status).length;
    $("#pendingCount").textContent = count("Pending Supervisor Approval");
    $("#approvedCount").textContent = count("Approved");
    $("#revisionCount").textContent = count("Revision Requested");
    $("#rejectedCount").textContent = count("Rejected");
}

function renderTable() {
    closeActionMenu();
    const rows = filteredRequests();
    $("#resultCount").textContent = `${rows.length} ${rows.length === 1 ? "request" : "requests"}`;
    $("#queueDescription").textContent = $("#statusFilter").value
        ? "Purchase requests matching the selected filters."
        : "All purchase requests and recorded decision history.";
    if (!rows.length) {
        $("#requestRows").innerHTML =
            '<tr class="empty-row"><td colspan="7">No purchase requests match the selected filters.</td></tr>';
        return;
    }
    $("#requestRows").innerHTML = rows
        .map((request) => {
            const risk = stockRisk(request);
            const names = (request.items || [])
                .slice(0, 2)
                .map((item) => item.product_name)
                .join(", ");
            const overflow =
                (request.items || []).length > 2 ? ` +${request.items.length - 2} more` : "";
            const pending = request.status === "Pending Supervisor Approval";
            const actions = `<div class="approval-action-group${pending ? "" : " view-only"}"><button class="review-btn" type="button" data-review-id="${escapeHtml(request.pr_id)}"><i class="fa-regular fa-eye"></i> View</button>${pending ? `<button class="quick-action-toggle" type="button" data-action-toggle-id="${escapeHtml(request.pr_id)}" aria-label="Open PR decision actions" aria-expanded="false"><i class="fa-solid fa-caret-down"></i></button>` : ""}</div>`;
            return `<tr><td class="primary-cell"><strong>${escapeHtml(request.pr_number)}</strong></td><td>${escapeHtml(request.requested_by_name || "Unknown")}</td><td>${escapeHtml(formatDateTime(request.submitted_at || request.request_date))}</td><td class="primary-cell"><strong>${Number(request.item_count || (request.items || []).length)}</strong><span>${escapeHtml(names + overflow || "No items")}</span></td><td><span class="risk-badge risk-${risk.toLowerCase().replaceAll(" ", "-")}">${escapeHtml(risk)}</span></td><td><span class="status-badge ${statusClass(request.status)}">${escapeHtml(request.status)}</span></td><td>${actions}</td></tr>`;
        })
        .join("");
}

function actionMenu() {
    let menu = $("#quickActionMenu");
    if (menu) return menu;
    menu = document.createElement("div");
    menu.id = "quickActionMenu";
    menu.className = "quick-action-menu";
    menu.hidden = true;
    menu.innerHTML =
        '<button class="approve" type="button" data-quick-decision="approve"><i class="fa-solid fa-check"></i> Review & Approve</button><button class="reject" type="button" data-quick-decision="reject"><i class="fa-solid fa-xmark"></i> Reject</button>';
    document.body.appendChild(menu);
    return menu;
}

function closeActionMenu() {
    const menu = $("#quickActionMenu");
    if (menu) menu.hidden = true;
    openActionToggle?.setAttribute("aria-expanded", "false");
    openActionRequestId = null;
    openActionToggle = null;
}

function toggleActionMenu(toggle) {
    const requestId = toggle.dataset.actionToggleId;
    if (openActionRequestId === requestId) {
        closeActionMenu();
        return;
    }
    closeActionMenu();
    openActionRequestId = requestId;
    openActionToggle = toggle;
    toggle.setAttribute("aria-expanded", "true");
    const menu = actionMenu();
    menu.hidden = false;
    const rect = toggle.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, rect.right - menu.offsetWidth))}px`;
    menu.style.top = `${window.innerHeight - rect.bottom < menu.offsetHeight + 8 ? rect.top - menu.offsetHeight - 5 : rect.bottom + 5}px`;
}

function renderReview(request) {
    $("#reviewSummary").innerHTML = [
        ["PR Number", request.pr_number],
        ["Requested By", request.requested_by_name],
        ["Request Date", formatDate(request.request_date)],
        ["Status", request.status],
    ]
        .map(
            ([label, value]) =>
                `<div class="meta-box"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`,
        )
        .join("");
    const pending = request.status === "Pending Supervisor Approval";
    $("#quantityApprovalRows").innerHTML = (request.items || [])
        .map((item) => {
            const requested = Number(item.requested_qty || 0);
            const approved = item.approved_qty == null ? requested : Number(item.approved_qty);
            const unit = item.unit || "units";
            const delta = approved - requested;
            return `<tr data-approval-item="${escapeHtml(item.pr_item_id)}" data-requested-qty="${escapeHtml(requested)}"><td><strong>${escapeHtml(item.product_name || "Product")}</strong><span>${escapeHtml(item.brand_name || "")}</span></td><td><strong>${requested.toLocaleString()} ${escapeHtml(unit)}</strong><small>${item.requested_base_qty == null ? "Conversion unavailable" : `= ${Number(item.requested_base_qty).toLocaleString()} ${escapeHtml(item.base_inventory_unit)}`}</small></td><td><div class="approved-qty-control"><input class="form-control form-control-sm" type="number" min="${quantityStep(unit)}" step="${quantityStep(unit)}" value="${escapeHtml(approved)}" data-approved-qty ${pending ? "" : "disabled"} aria-label="Approved quantity for ${escapeHtml(item.product_name || "product")}"><span>${escapeHtml(unit)}</span></div></td><td><span class="quantity-delta ${delta < 0 ? "is-reduced" : delta > 0 ? "is-increased" : "is-unchanged"}" data-quantity-delta>${delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta.toLocaleString()} ${escapeHtml(unit)}`}</span></td></tr>`;
        })
        .join("");
    const frame = $("#ceoRequestPreviewFrame");
    frame.dataset.contentHeight = "1123";
    frame.src = `purchase_request_print.html?pr_id=${encodeURIComponent(request.pr_id)}&embed=1&ui=final2`;
    const decided = request.status !== "Pending Supervisor Approval";
    $("#decisionHistory").hidden = !decided;
    $("#decisionHistory").innerHTML = decided
        ? `<h3>Decision Information</h3><div class="history-grid"><div><span>Decision</span><strong>${escapeHtml(request.status)}</strong></div><div><span>Reviewed By</span><strong>${escapeHtml(request.supervisor_name || "Supervisor")}</strong></div><div><span>Decision Date</span><strong>${escapeHtml(formatDateTime(request.decided_at))}</strong></div></div>`
        : "";
    const purchaseOrders = request.purchase_orders || [];
    $("#ceoGeneratedPoSection").hidden = purchaseOrders.length === 0;
    $("#ceoGeneratedPoList").innerHTML = purchaseOrders
        .map(
            (po) =>
                `<article><div><strong>${escapeHtml(po.po_number)}</strong><span>${escapeHtml(po.supplier_name || "Supplier")} · ETA: ${escapeHtml(formatDate(po.expected_delivery_date))} · Mode: ${escapeHtml(po.payment_terms || "Not set")} · ${peso(po.total_amount)}</span></div><div><a class="btn btn-sm btn-outline-primary" href="purchase_orders.html?tab=active&po_id=${encodeURIComponent(po.po_id)}">View PO</a></div></article>`,
        )
        .join("");
    $("#modalActions").innerHTML = pending
        ? '<button class="btn btn-outline-danger" type="button" data-modal-decision="reject">Reject</button><button class="btn btn-success ms-auto" type="button" data-modal-decision="approve"><i class="fa-solid fa-check"></i> Approve Quantities & PR</button>'
        : '<button class="btn btn-light ms-auto" data-bs-dismiss="modal">Close</button>';
}

function resizePreview(contentHeight = null) {
    const stage = $("#ceoRequestPreviewStage");
    const frame = $("#ceoRequestPreviewFrame");
    if (!stage || !frame || !stage.clientWidth) return;
    const height = Math.max(1123, Number(contentHeight || frame.dataset.contentHeight || 1123));
    const scale = Math.min(1, stage.clientWidth / 794);
    frame.dataset.contentHeight = String(height);
    frame.style.width = "794px";
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${scale})`;
    stage.style.height = `${Math.ceil(height * scale)}px`;
}

function showRequest(request) {
    activeRequest = request;
    $("#modalNumber").textContent = request.pr_number;
    renderReview(request);
    modal?.show();
}

function openPurchaseRequestPrint(request) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) throw new Error("Allow pop-ups to print this purchase request.");
    const token = sessionStorage.getItem("pharma_tab_token");
    if (token) printWindow.sessionStorage.setItem("pharma_tab_token", token);
    printWindow.opener = null;
    printWindow.location.replace(
        `purchase_request_print.html?pr_id=${encodeURIComponent(request.pr_id)}&print=1`,
    );
}

async function decide(request, decision, { openReview = false } = {}) {
    if (request.status !== "Pending Supervisor Approval")
        throw new Error("This purchase request has already been processed.");
    if (openReview) {
        showRequest(request);
        return;
    }
    const approvedQuantities =
        decision === "approve"
            ? [...document.querySelectorAll("[data-approval-item]")].map((row) => ({
                  pr_item_id: row.dataset.approvalItem,
                  approved_qty: Number(row.querySelector("[data-approved-qty]")?.value),
              }))
            : [];
    if (
        decision === "approve" &&
        approvedQuantities.some(
            (item) => !Number.isFinite(item.approved_qty) || item.approved_qty <= 0,
        )
    )
        throw new Error("Enter a positive approved quantity for every product.");
    const title = { approve: "Approve Purchase Request?", reject: "Reject Purchase Request" }[
        decision
    ];
    const result = await Swal.fire({
        title,
        text:
            decision === "approve"
                ? "Save these approved quantities and approve the request? The quantities are locked after approval."
                : undefined,
        icon: decision === "approve" ? "question" : "warning",
        showCancelButton: true,
        confirmButtonColor: { approve: "#16a34a", reject: "#dc2626" }[decision],
        confirmButtonText: { approve: "Approve Quantities & PR", reject: "Reject" }[decision],
    });
    if (!result.isConfirmed) return;
    const response = await requestJson("decide_purchase_request.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            pr_id: request.pr_id,
            decision,
            approved_quantities: approvedQuantities,
        }),
    });
    await loadRequests(false);
    closeActionMenu();
    modal?.hide();
    toastr.success(
        response.message || `Purchase request marked ${response.data?.status || "complete"}.`,
    );
}

async function loadRequests(openLinked = true) {
    try {
        const data = await requestJson(`get_purchase_requests.php?t=${Date.now()}`);
        requests = data.data?.requests || [];
        renderSummary();
        renderTable();
        if (openLinked) {
            const linkedId = new URLSearchParams(location.search).get("pr_id");
            const linked = requests.find((request) => request.pr_id === linkedId);
            if (linked) showRequest(linked);
        }
    } catch (error) {
        $("#requestRows").innerHTML =
            `<tr class="empty-row"><td colspan="7" class="text-danger">${escapeHtml(error.message)}</td></tr>`;
        toastr.error(error.message);
    }
}

$("#approvalFilters").addEventListener("submit", (event) => {
    event.preventDefault();
    if ($("#startDate").value && $("#endDate").value && $("#startDate").value > $("#endDate").value)
        return toastr.error("Start date cannot be after end date.");
    renderTable();
});
$("#resetFilters").addEventListener("click", () => {
    $("#requestSearch").value = "";
    $("#startDate").value = "";
    $("#endDate").value = "";
    $("#statusFilter").value = "";
    renderTable();
});
$("#statusFilter").addEventListener("change", renderTable);
$("#requestSearch").addEventListener("input", renderTable);
$("#refreshRequests").addEventListener("click", () => loadRequests(false));
$("#requestRows").addEventListener("click", (event) => {
    const review = event.target.closest("[data-review-id]");
    const toggle = event.target.closest("[data-action-toggle-id]");
    if (review) {
        const request = requests.find((row) => row.pr_id === review.dataset.reviewId);
        if (request) showRequest(request);
    }
    if (toggle) {
        event.stopPropagation();
        toggleActionMenu(toggle);
    }
});
$("#modalActions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-modal-decision]");
    if (button && activeRequest)
        decide(activeRequest, button.dataset.modalDecision).catch((error) =>
            toastr.error(error.message),
        );
});
$("#quantityApprovalRows").addEventListener("input", (event) => {
    if (!event.target.matches("[data-approved-qty]")) return;
    const row = event.target.closest("[data-approval-item]");
    const deltaElement = row.querySelector("[data-quantity-delta]");
    const delta = Number(event.target.value || 0) - Number(row.dataset.requestedQty || 0);
    const unit = event.target.parentElement.querySelector("span")?.textContent || "units";
    deltaElement.className = `quantity-delta ${delta < 0 ? "is-reduced" : delta > 0 ? "is-increased" : "is-unchanged"}`;
    deltaElement.textContent =
        delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta.toLocaleString()} ${unit}`;
});
$("#printRequest").addEventListener("click", () => {
    try {
        if (activeRequest) openPurchaseRequestPrint(activeRequest);
    } catch (error) {
        toastr.error(error.message);
    }
});
document.addEventListener("click", (event) => {
    const decisionButton = event.target.closest("[data-quick-decision]");
    if (decisionButton) {
        const request = requests.find((row) => row.pr_id === openActionRequestId);
        closeActionMenu();
        if (request)
            decide(request, decisionButton.dataset.quickDecision, {
                openReview: decisionButton.dataset.quickDecision === "approve",
            }).catch((error) => toastr.error(error.message));
        return;
    }
    if (!event.target.closest("#quickActionMenu,[data-action-toggle-id]")) closeActionMenu();
});
modalElement?.addEventListener("shown.bs.modal", () => resizePreview());
window.addEventListener("message", (event) => {
    const frame = $("#ceoRequestPreviewFrame");
    const message = event.data || {};
    if (
        event.origin === window.location.origin &&
        event.source === frame?.contentWindow &&
        message.type === "drp:purchase-request-preview-ready"
    )
        resizePreview(message.height);
});
window.addEventListener("resize", () => {
    closeActionMenu();
    resizePreview();
});
window.addEventListener("scroll", closeActionMenu, true);
$("#themeToggle")?.addEventListener("click", () => {
    const dark = document.body.classList.toggle("dark-mode");
    document.documentElement.dataset.bsTheme = dark ? "dark" : "light";
    localStorage.setItem("drpTheme", dark ? "dark" : "light");
});

await loadRequests();
