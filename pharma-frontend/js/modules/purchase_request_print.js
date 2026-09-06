import API_BASE_URL from "../config/config.js";
import { renderPurchaseRequestDocument } from "./pr_document_renderer.js?v=10";

const pageParams = new URLSearchParams(window.location.search);
const embeddedPreview = pageParams.get("embed") === "1";
document.body.classList.toggle("is-embedded", embeddedPreview);

async function json(url) {
    const token = sessionStorage.getItem("pharma_tab_token") || "";
    const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        headers: token ? { "X-Tab-Token": token } : {},
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === "error" || payload.success === false)
        throw new Error(payload.message || "Unable to load the purchase request.");
    return payload;
}

function renderDocument(request, productById, inventoryById) {
    renderPurchaseRequestDocument(document.getElementById("purchaseRequestDocument"), request, {
        productById,
        inventoryById,
    });

    document.getElementById("printLoading").hidden = true;
    document.getElementById("purchaseRequestDocument").hidden = false;
    document.title = `${request.pr_number || "Purchase Request"} | Doc R Pharmacy`;
    if (embeddedPreview && window.parent !== window) {
        window.requestAnimationFrame(() => {
            const height = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
            );
            window.parent.postMessage(
                { type: "drp:purchase-request-preview-ready", height },
                window.location.origin,
            );
        });
    }
}

function loadPreviewPayload(token) {
    const cached = JSON.parse(localStorage.getItem(`drpPrPreview:${token}`) || "null");
    if (!cached?.request || Date.now() - Number(cached.created_at || 0) > 10 * 60 * 1000)
        throw new Error(
            "This draft preview has expired. Return to Purchase Requests and open Print Preview again.",
        );
    return cached;
}

async function loadPurchaseRequest() {
    const prId = String(pageParams.get("pr_id") || "").trim();
    const previewToken = String(pageParams.get("preview") || "").trim();
    if (!prId && !previewToken) throw new Error("A purchase request reference is required.");
    const previewPayload = previewToken ? loadPreviewPayload(previewToken) : null;
    let request = previewPayload?.request || null;
    const [prPayload, productPayload, inventoryPayload, settingsPayload] = await Promise.all([
        prId
            ? json(
                  `${API_BASE_URL}/purchase_requests/get_purchase_requests.php?pr_id=${encodeURIComponent(prId)}&t=${Date.now()}`,
              )
            : Promise.resolve(null),
        previewPayload?.products
            ? Promise.resolve({ data: previewPayload.products })
            : json(`${API_BASE_URL}/products/get_products.php?t=${Date.now()}`),
        previewPayload?.inventory
            ? Promise.resolve({ data: previewPayload.inventory })
            : json(`${API_BASE_URL}/inventory/get_inventory.php?t=${Date.now()}`),
        previewPayload
            ? json(`${API_BASE_URL}/settings/get_admin_settings.php?t=${Date.now()}`)
            : Promise.resolve(null),
    ]);
    if (prId) request = (prPayload.data?.requests || []).find((row) => String(row.pr_id) === prId);
    if (!request) throw new Error("The requested Purchase Request was not found.");
    request.print_roles =
        settingsPayload?.procurementDocumentSettings ||
        prPayload?.data?.procurementDocumentSettings ||
        {};
    const productById = new Map(
        (productPayload.data || []).map((product) => [String(product.product_id), product]),
    );
    const inventoryById = new Map(
        (inventoryPayload.data || []).map((row) => [String(row.product_id), row]),
    );
    renderDocument(request, productById, inventoryById);
    if (pageParams.get("print") === "1") window.setTimeout(() => window.print(), 250);
}

document.getElementById("printPurchaseRequest")?.addEventListener("click", () => window.print());
loadPurchaseRequest().catch((error) => {
    const loading = document.getElementById("printLoading");
    loading.className = "error";
    loading.textContent = error.message || "Unable to load the purchase request.";
});
