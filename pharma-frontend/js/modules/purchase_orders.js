import PharmaUtils from "../utils.js";
import { formatProductIdentity, formatProductSpecification } from "./product_specification.js?v=8";
import {
    purchasingConversion,
    inventoryQuantityFromPurchase,
} from "./purchasing_conversion.js?v=1";

const PURCHASE_ORDER_RUNTIME_VERSION = "77-po-receiving-documents";
document.documentElement.dataset.purchaseOrderRuntime = PURCHASE_ORDER_RUNTIME_VERSION;

const API_BASE_URL = window.location.port
    ? "http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1"
    : "../pharma-api/v1";

const STATUS_META = {
    Draft: "#64748b",
    Pending: "#f59e0b",
    Arrived: "#8b5cf6",
    Delivered: "#16a34a",
};
const STATUS_LABELS = {};

const createDraftItems = [];
const editDraftItems = [];
let activeReceiveOrder = null;
let activeReturnOrder = null;
let supplierCache = [];
let currentPoView = "active";
let purchaseOrdersInitialized = false;
let purchaseOrdersLoadToken = 0;
let lastStatusSummaryHtml = "";
let currentRenderedTableHead = "";
let selectedCreateDraftIndex = null;
let activeEditOrder = null;
let activeViewOrder = null;
let editMajorFieldsLocked = false;
let editingPoItemId = null;
let editingPoItemKey = null;
let editDraftClientSequence = 0;
let editItemActionBusy = false;
let inspectionQueueOrders = [];
let activeInspectionProductIndex = 0;
const purchaseOrderViewRequests = new Map();
const purchaseOrderPaymentRequests = new Map();
let lastPurchaseOrderError = { message: "", shownAt: 0 };
window.__purchaseOrderPreviewCache = window.__purchaseOrderPreviewCache || new Map();

function localTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function setPoEtaMinimums() {
    ["po-expected-delivery", "edit-po-expected-delivery"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.min = localTodayDateString();
    });
}

function isPastLocalDate(value) {
    return Boolean(value) && value < localTodayDateString();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function fetchJson(url, options = {}) {
    return PharmaUtils.safeFetch(url, { credentials: "include", ...options });
}

function setPurchaseOrderActionBusy(selector, poId, busy) {
    document.querySelectorAll(selector).forEach((button) => {
        if (String(button.dataset.poId || "") !== String(poId || "")) return;
        button.disabled = busy;
        button.classList.toggle("is-loading", busy);
        button.setAttribute("aria-busy", busy ? "true" : "false");
    });
}

function showPurchaseOrderActionError(message, fallback) {
    const normalized = String(message || fallback || "Unable to complete this action.").trim();
    const displayMessage =
        normalized === "Unable to load purchase order details."
            ? "Unable to load purchase order details. Please try again."
            : normalized;
    const now = Date.now();
    if (
        lastPurchaseOrderError.message === displayMessage &&
        now - lastPurchaseOrderError.shownAt < 3500
    )
        return;
    lastPurchaseOrderError = { message: displayMessage, shownAt: now };
    PharmaUtils.toast.error(displayMessage);
}

function setTheme(theme) {
    const isDark = theme === "dark";
    document.body.classList.toggle("dark-mode", isDark);
    document.documentElement.setAttribute("data-bs-theme", theme);
    const toggle = document.getElementById("themeToggle");
    if (toggle)
        toggle.innerHTML = isDark
            ? '<i class="fa-solid fa-sun"></i>'
            : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem("drpTheme", theme);
}

function formatDate(value) {
    if (!value) return "Not set";
    const text = String(value);
    const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnlyMatch
        ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
        : new Date(text.replace(" ", "T"));
    return Number.isNaN(date.getTime())
        ? escapeHtml(value)
        : date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function money(value) {
    return Number(value || 0).toFixed(2);
}

function peso(value) {
    const numericValue = Number(value || 0);
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
    }).format(Math.abs(numericValue) < 0.005 ? 0 : numericValue);
}

function getPoPaymentStatus(order = {}) {
    const apiState = String(order.payment_state || "")
        .trim()
        .toLowerCase();
    const total = Number(order.total_amount ?? order.invoice_total ?? order.final_payment);
    if (!Number.isFinite(total) || total <= 0) return "awaiting_invoice";
    const hasRemainingBalance =
        order.remaining_balance !== null &&
        order.remaining_balance !== undefined &&
        order.remaining_balance !== "";
    const remaining = hasRemainingBalance ? Number(order.remaining_balance) : NaN;
    if (Number.isFinite(remaining)) {
        if (remaining <= 0.005) return "paid";
        return Number(order.total_paid || 0) > 0 ? "partially_paid" : "unpaid";
    }
    if (["awaiting_invoice", "unpaid", "partially_paid", "paid"].includes(apiState))
        return apiState;
    const paid = Number(order.total_paid || 0);
    if (Number.isFinite(paid) && paid + 0.005 >= total) return "paid";
    return Number.isFinite(paid) && paid > 0 ? "partially_paid" : "unpaid";
}

function purchaseOrderTotalDisplay(order = {}) {
    const paymentState = getPoPaymentStatus(order);
    if (paymentState !== "awaiting_invoice") {
        const paymentLabel =
            paymentState === "paid"
                ? "Paid"
                : paymentState === "partially_paid"
                  ? "Partially paid"
                  : "Unpaid";
        const creditUsed = Number(order.supplier_credit_applied || 0) > 0;
        return `<span class="po-total-with-payment"><strong class="po-money">${peso(order.total_amount)}</strong><small class="po-payment-state po-payment-${paymentState}">${paymentLabel}${creditUsed ? " · credit used" : ""}</small></span>`;
    }
    return '<span class="po-total-pending"><strong>—</strong><small>Awaiting invoice</small></span>';
}

function purchaseOrderEtaDisplay(value, status) {
    if (!value) return '<span class="po-eta-date">Not set</span>';
    const text = String(value);
    const dateParts = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const eta = dateParts
        ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
        : new Date(text.replace(" ", "T"));
    if (Number.isNaN(eta.getTime())) return `<span class="po-eta-date">${escapeHtml(value)}</span>`;

    const dateLabel = eta.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
    if (status !== "Pending") return `<span class="po-eta-date">${dateLabel}</span>`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    eta.setHours(0, 0, 0, 0);
    const daysUntilEta = Math.round((eta.getTime() - today.getTime()) / 86400000);
    const relativeDate =
        daysUntilEta === 0
            ? "Today"
            : daysUntilEta === 1
              ? "Tomorrow"
              : daysUntilEta > 1
                ? `In ${daysUntilEta} days`
                : `${Math.abs(daysUntilEta)}d overdue`;
    return `<span class="po-eta-date">${dateLabel}</span><small class="po-eta-relative${daysUntilEta < 0 ? " is-overdue" : ""}">${relativeDate}</small>`;
}

const REASON_OPTIONS = [
    "Wrong supplier",
    "Wrong item",
    "Wrong quantity",
    "Price too high",
    "Duplicate PO",
    "Budget issue",
    "Need revision",
    "Other",
];

const CANCEL_REASON_OPTIONS = [
    "Ordered by mistake",
    "Wrong supplier",
    "Wrong item",
    "Wrong quantity",
    "Price issue",
    "Duplicate PO",
    "Supplier unavailable",
    "Other",
];

function wordCount(value) {
    return cleanText(value).split(/\s+/).filter(Boolean).length;
}

async function requestControlledReason({
    title,
    label,
    confirmButtonText,
    errorMessage,
    confirmColor = "#7c3aed",
    options = REASON_OPTIONS,
}) {
    if (!window.Swal) {
        const fallback = prompt(label || title) || "";
        if (!fallback.trim()) {
            PharmaUtils.toast.error(errorMessage);
            return "";
        }
        return fallback.trim();
    }

    const selectOptions = options
        .map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`)
        .join("");
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
        confirmButtonColor: confirmColor,
        didOpen: () => {
            const select = document.getElementById("poReasonSelect");
            const wrap = document.getElementById("poReasonOtherWrap");
            const textarea = document.getElementById("poReasonOther");
            const counter = document.getElementById("poReasonWordCount");
            const update = () => {
                wrap?.classList.toggle("d-none", select?.value !== "Other");
                if (counter && textarea) counter.textContent = String(wordCount(textarea.value));
            };
            select?.addEventListener("change", update);
            textarea?.addEventListener("input", update);
            update();
        },
        preConfirm: () => {
            const selected = document.getElementById("poReasonSelect")?.value || "";
            const manual = cleanText(document.getElementById("poReasonOther")?.value || "");
            if (!selected) {
                Swal.showValidationMessage("Select a reason.");
                return false;
            }
            if (selected === "Other") {
                const count = wordCount(manual);
                if (!manual) {
                    Swal.showValidationMessage("Enter the manual reason.");
                    return false;
                }
                if (count > 20) {
                    Swal.showValidationMessage("Manual reason must be 20 words or fewer.");
                    return false;
                }
                return manual;
            }
            return selected;
        },
    });

    return result.isConfirmed ? cleanText(result.value) : "";
}

function cleanText(value) {
    const text = String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    return ["N/A", "NA", "NULL", "NONE"].includes(text.toUpperCase()) ? "" : text;
}

function displayText(value) {
    const text = cleanText(value);
    return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function displayDetailText(value) {
    const text = cleanText(value);
    return /^[a-z]/.test(text) ? displayText(text) : text;
}

function compactMeasurement(value) {
    return displayDetailText(value)
        .replace(/(\d)\s+([a-zA-Z%]+)/g, "$1$2")
        .replace(/\s+/g, " ")
        .trim();
}

function attributeNumber(value) {
    const text = cleanText(value);
    if (!text || !/^-?\d+(?:\.0+)?$|^-?\d+\.\d+$/.test(text)) return text;
    return String(Number(text));
}

function measurementWithUnit(value, unit) {
    const amount = attributeNumber(value);
    const unitText = cleanText(unit);
    if (!amount) return "";
    if (!unitText || /[a-zA-Z%]+/.test(amount)) return amount;
    return `${amount} ${unitText}`;
}

function groceryNetWeightDisplay(item, fallback = "") {
    return (
        measurementWithUnit(
            item.weight_volume_value || item.net_weight,
            item.weight_volume_unit || item.grocery_unit,
        ) || fallback
    );
}

function medicineStrengthDisplay(item) {
    const strength = measurementWithUnit(item.strength_value, item.strength_unit);
    if (strength) return strength;
    return cleanText(item.strength_size_display || item.strength_size_value || item.strength) || "";
}

function medicineNetContentDisplay(item) {
    return measurementWithUnit(
        item.net_content_value || item.volume_value,
        item.net_content_unit || item.volume_unit,
    );
}

function removePrefix(value, prefix) {
    const text = cleanText(value).replace(/^[\s-]+|[\s-]+$/g, "");
    const label = cleanText(prefix);

    if (!text || !label) return text;
    if (text.toLowerCase() === label.toLowerCase()) return text;

    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
        text
            .replace(new RegExp(`^${escapedLabel}\\s*[-:]\\s*`, "i"), "")
            .replace(new RegExp(`^${escapedLabel}\\s+`, "i"), "")
            .trim() || text
    );
}

function removeBrandPrefix(productName, brandName) {
    const product = cleanText(productName).replace(/^[\s-]+|[\s-]+$/g, "");
    const brand = cleanText(brandName);

    if (!product || !brand) return product;
    if (product.toLowerCase() === brand.toLowerCase()) return product;

    const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
        product
            .replace(new RegExp(`^${escapedBrand}\\s*[-:]\\s*`, "i"), "")
            .replace(new RegExp(`^${escapedBrand}\\s+`, "i"), "")
            .trim() || product
    );
}

function productDisplayParts(item) {
    const brand = cleanText(item.brand_name);
    const productName = cleanText(item.product_name);
    const rawVariant = cleanText(item.variant_flavor);
    const category = cleanText(item.category_name).toLowerCase();
    const variant = category === "grocery" && rawVariant.length <= 24 ? rawVariant : "";
    const productLooksLikeBrand =
        productName &&
        brand &&
        !productName.toLowerCase().includes(brand.toLowerCase()) &&
        !brand.toLowerCase().includes(productName.toLowerCase()) &&
        !productName.includes(" ") &&
        brand.includes(" ");
    const productWithoutBrand = removeBrandPrefix(productName, brand);
    const displayBrand = variant ? productName : productLooksLikeBrand ? productName : brand;
    const baseProduct =
        variant || (productLooksLikeBrand ? brand : productWithoutBrand) || productName;
    const strength = medicineStrengthDisplay(item);
    const netWeight = groceryNetWeightDisplay(item);
    const size = displayDetailText(item.size_display || item.size_value);
    const identifier =
        category === "medicine" ? strength : category === "grocery" ? netWeight || size : "";
    const displayProduct =
        identifier && !baseProduct.toLowerCase().includes(identifier.toLowerCase())
            ? `${baseProduct} ${identifier}`
            : baseProduct;

    return {
        brand: displayBrand || brand,
        product: removePrefix(displayProduct, displayBrand),
        rawProduct: productName,
    };
}

function productDropdownLabel(product) {
    const identity = formatProductIdentity(product);
    const specification = formatProductSpecification(product, "");
    return [identity, specification].filter(Boolean).join(" \u2022 ");
}

function productOptionDetail(product) {
    return formatProductSpecification(product, "");
}

function productCoreName(item) {
    const brand = cleanText(item.brand_name);
    const productName = cleanText(item.product_name);
    const rawVariant = cleanText(item.variant_flavor);
    const tableName = cleanText(item.product_display_name);
    const size = productSizeOnlyValue(item) || productSizeValue(item);
    const packaging = productPackagingValue(item);
    const swappedBrand =
        productName &&
        brand &&
        !productName.toLowerCase().includes(brand.toLowerCase()) &&
        !brand.toLowerCase().includes(productName.toLowerCase()) &&
        !productName.includes(" ") &&
        brand.includes(" ");
    const rawProduct = swappedBrand ? brand : removeBrandPrefix(productName, brand);
    let name = rawProduct;

    if (!name) name = tableName || rawProduct || cleanText(item.product_name);
    [rawVariant, size, packaging].filter(Boolean).forEach((part) => {
        const escapedPart = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        name = name.replace(new RegExp(`\\s*[-:]?\\s*${escapedPart}\\s*$`, "i"), "").trim() || name;
    });

    return name || tableName || cleanText(item.product_name);
}

function poBrandName(item) {
    return cleanText(item.brand_name) || cleanText(item.brand_display_name);
}

function productSizeValue(item) {
    const category = cleanText(item.category_name).toLowerCase();
    if (category === "grocery") {
        return (
            groceryNetWeightDisplay(item) ||
            compactMeasurement(item.size_display || item.size_value)
        );
    }
    if (category === "medicine") {
        return medicineStrengthDisplay(item);
    }

    return compactMeasurement(item.size_display || item.size_value || sizeDisplayFromDetails(item));
}

function productStrengthValue(item) {
    const category = cleanText(item.category_name).toLowerCase();
    if (category !== "medicine") return "";

    return medicineStrengthDisplay(item);
}

function productSizeOnlyValue(item) {
    const category = cleanText(item.category_name).toLowerCase();
    if (category === "medicine") return "";
    if (category === "grocery") {
        return (
            groceryNetWeightDisplay(item) ||
            compactMeasurement(item.size_display || item.size_value || sizeDisplayFromDetails(item))
        );
    }

    return compactMeasurement(
        item.weight_volume_value ||
            item.size_display ||
            item.size_value ||
            sizeDisplayFromDetails(item),
    );
}

function productPackagingValue(item) {
    return displayDetailText(item.packaging || item.package_type);
}

function sameText(left, right) {
    return cleanText(left).toLowerCase() === cleanText(right).toLowerCase();
}

function pluralizeUnit(unit, quantity = 2) {
    const raw = cleanText(unit || "pcs");
    const lower = raw.toLowerCase();
    const fixedUnits = {
        pcs: "pcs",
        pc: "pcs",
        mg: "mg",
        mcg: "mcg",
        g: "g",
        kg: "kg",
        ml: "mL",
        l: "L",
    };
    const text = fixedUnits[lower] || displayDetailText(raw);
    if (Number(quantity) === 1) return text;
    if (/s$/i.test(text)) return text;
    if (/y$/i.test(text)) return text.replace(/y$/i, "ies");
    if (/(x|z|ch|sh)$/i.test(text)) return `${text}es`;
    return `${text}s`;
}

function pluralizeStockUnit(unit, quantity = 2) {
    const raw = cleanText(unit || "pcs");
    const lower = raw.toLowerCase();
    const fixedUnits = {
        pcs: "pcs",
        pc: "pcs",
        piece: "pcs",
        pieces: "pcs",
        can: "cans",
        cans: "cans",
        bottle: "bottles",
        bottles: "bottles",
        pack: "packs",
        packs: "packs",
        sachet: "sachets",
        sachets: "sachets",
        "blister pack": "pcs",
        blister: "pcs",
    };
    const text = fixedUnits[lower] || displayDetailText(raw);
    if (Number(quantity) === 1) {
        if (["cans", "bottles", "packs", "sachets"].includes(text.toLowerCase())) {
            return text.replace(/s$/i, "");
        }
        return text;
    }
    if (/s$/i.test(text)) return text;
    if (/y$/i.test(text)) return text.replace(/y$/i, "ies");
    return `${text}s`;
}

function stockCountUnit(item, quantity = 2) {
    const packaging = cleanText(productPackagingValue(item)).toLowerCase();
    const unit = cleanText(item.unit || unitDisplayFromDetails(item)).toLowerCase();
    const packageMap = {
        can: "can",
        cans: "can",
        bottle: "bottle",
        bottles: "bottle",
        pack: "pack",
        packs: "pack",
        sachet: "sachet",
        sachets: "sachet",
    };

    if (packageMap[packaging]) return pluralizeStockUnit(packageMap[packaging], quantity);
    if (packaging === "blister pack") return "pcs";
    if (["g", "gram", "grams", "kg", "mg", "mcg", "ml", "l"].includes(unit)) {
        return "pcs";
    }
    return pluralizeStockUnit(unit || "pcs", quantity);
}

function packageContentUnitText(unit) {
    const text = cleanText(unit || "pcs");
    const lower = text.toLowerCase();
    if (["pc", "pcs", "piece", "pieces"].includes(lower)) return "pc";
    return displayDetailText(text);
}

function inventoryQuantityLabel(quantity, unit) {
    const count = Number(quantity || 0);
    const unitLabel = packageContentUnitText(unit);
    if (count === 1) return `1 ${unitLabel}`;
    if (unitLabel.toLowerCase() === "pc") return `${count} pcs`;
    return `${count} ${displayDetailText(pluralizeStockUnit(unitLabel, count))}`;
}

function quantityWithInventoryUnit(item, quantity) {
    const count = Number(quantity || 0);
    return inventoryQuantityLabel(count, stockCountUnit(item, count));
}

function purchaseUnitQuantityLabel(item) {
    const quantity = Number(item.purchase_qty || item.quantity || 0);
    const purchaseUnit = purchaseUnitInfo(item).purchaseUnit || "Package";
    const unit = pluralizeUnit(purchaseUnit, quantity);
    return `${quantity} ${unit}`;
}

function unitPriceLabel(unit) {
    const text = cleanText(unit || "pc");
    return text.toLowerCase() === "pcs" ? "pc" : text;
}

function normalizePurchaseUnit(unit) {
    const text = cleanText(unit)
        .replace(/^by\s+/i, "")
        .trim();
    const lower = text.toLowerCase();
    if (["pc", "piece", "pieces"].includes(lower)) return "pcs";
    return text;
}

function parsePackContent(value) {
    const text = cleanText(value);
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (!match) {
        return { quantity: 1, unit: "", label: text };
    }

    const quantity = Number(match[1]);
    const unit = cleanText(match[2]);
    return {
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit,
        label: [match[1], unit].filter(Boolean).join(" "),
    };
}

function purchaseUnitInfo(item) {
    const suppliedUnit = normalizePurchaseUnit(item.purchase_unit);
    const suppliedQty = Number(item.units_per_purchase_unit || item.purchase_unit_qty || 0);
    const packaging = productPackagingValue(item) || "Unit";
    const supplierPackage = suppliedUnit || "Box";
    const quantity = suppliedQty > 0 ? suppliedQty : 1;
    const containerText = stockCountUnit(item, quantity);
    const singleContainerText = stockCountUnit(item, 1);
    const packageText = displayText(supplierPackage);
    const unitLabel = quantity > 1 ? `${packageText} (${quantity} ${containerText})` : packageText;
    const displayContainerText = packageContentUnitText(containerText);
    const displaySingleContainerText = packageContentUnitText(singleContainerText);
    const packageContentsLabel = inventoryQuantityLabel(
        quantity,
        quantity === 1 ? displaySingleContainerText : displayContainerText,
    );
    const conversion = `1 ${packageText} = ${packageContentsLabel}`;

    return {
        label: unitLabel || "Unit",
        conversion,
        purchaseUnit: packageText,
        quantity,
        stockUnit: displayContainerText,
        singleStockUnit: displaySingleContainerText,
        packaging: displayText(packaging),
        containsLabel: packageContentsLabel,
        packageContentsLabel,
        unitContainsLabel: packageContentsLabel,
        conversionNote: conversion,
    };
}

function supplierCostUnitLabel(item) {
    const purchaseUnit = purchaseUnitInfo(item);
    return item.cost_basis === "purchase_unit"
        ? purchaseUnit.purchaseUnit || "purchase unit"
        : unitPriceLabel(purchaseUnit.singleStockUnit);
}

function productTableName(item) {
    return (
        cleanText(item.product_display_name) ||
        productDisplayParts(item).product ||
        cleanText(item.product_name)
    );
}

function inactivePoProductWarning(item) {
    return String(item?.product_status || "Active").toLowerCase() === "inactive"
        ? '<span class="small text-danger fw-bold d-block mt-1"><i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>Product is inactive. Review this item before receiving.</span>'
        : "";
}

function productTableBrand(item) {
    return (
        cleanText(item.brand_name) ||
        cleanText(item.brand_display_name) ||
        productDisplayParts(item).brand
    );
}

function productTableProductName(item) {
    const brand = cleanText(item.brand_name);
    const productName = cleanText(item.product_name);
    const productLabel = cleanText(item.product_display_name);
    const rawVariant = cleanText(item.variant_flavor);
    const size = productSizeOnlyValue(item) || productSizeValue(item);
    const packaging = productPackagingValue(item);
    let baseName = removeBrandPrefix(productName, brand);

    [rawVariant, size, packaging].filter(Boolean).forEach((part) => {
        const escapedPart = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        baseName = baseName.replace(new RegExp(`\\s*[-:]?\\s*${escapedPart}\\s*$`, "i"), "").trim();
    });

    if (!baseName || sameText(baseName, brand)) {
        baseName =
            removeBrandPrefix(productLabel, brand) ||
            productDisplayParts(item).product ||
            productCoreName(item);
    }

    if (sameText(baseName, brand)) {
        baseName = rawVariant || productLabel || productName;
    }

    return baseName || productTableName(item) || "Unnamed product";
}

function productSpecification(item) {
    const category = cleanText(item.category_name).toLowerCase();
    const variant = cleanText(item.variant_flavor);
    const generic = cleanText(item.generic_name);
    const strength = productStrengthValue(item);
    const netWeight =
        category === "medicine"
            ? ""
            : groceryNetWeightDisplay(item) ||
              compactMeasurement(item.size_value || item.size_display);
    const volume = category === "medicine" ? medicineNetContentDisplay(item) : "";
    const form = cleanText(item.dosage_form || item.type_name);
    const packaging = productPackagingValue(item);
    const parts =
        category === "medicine"
            ? [generic, strength, volume, form || packaging]
            : [variant, netWeight, packaging];
    parts.push(...cleanText(item.specification).split(/\s*[•·]\s*/));
    const seen = new Set();

    return parts
        .map((part) => displayDetailText(part))
        .filter((part) => {
            if (!part || ["medicine", "grocery"].includes(part.toLowerCase())) return false;
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(" \u2022 ");
}

function productDisplayWithSpecification(item) {
    const productName = productCoreName(item) || cleanText(item.product_name) || "Unnamed product";
    const specification = productSpecification(item);
    return [productName, specification].filter(Boolean).join(" \u2014 ");
}

function productNetWeightLabel(item) {
    return productSizeOnlyValue(item) || productSizeValue(item) || "-";
}

function productTableValueList(items, valueGetter, fallbackNames = [], options = {}) {
    const sourceItems = Array.isArray(items) && items.length ? items : [];
    const className = options.className ? ` ${options.className}` : "";

    if (!sourceItems.length) {
        return numberedList(fallbackNames);
    }

    return `
        <ol class="po-line-list${className}">
            ${sourceItems
                .map((item, index) => {
                    const value = cleanText(valueGetter(item)) || "-";
                    return `
                    <li>
                        <span class="line-index">${index + 1}.</span>
                        <span class="line-text">${escapeHtml(value)}</span>
                    </li>
                `;
                })
                .join("")}
        </ol>
    `;
}

function productTableCellList(items, fallbackNames = []) {
    const sourceItems =
        Array.isArray(items) && items.length
            ? items
            : fallbackNames.map((name) => ({ product_name: name }));
    if (!sourceItems.length) return numberedList(fallbackNames);
    return `
        <ol class="po-line-list po-product-lines">
            ${sourceItems
                .map((item, index) => {
                    const brand = productTableBrand(item);
                    const product = cleanText(item.generic_name) || productTableProductName(item);
                    return `
                    <li>
                        <span class="line-index">${index + 1}.</span>
                        <span class="line-text"><strong class="po-item-brand">${escapeHtml(brand || product || "-")}</strong>${product && !sameText(product, brand) ? `<small class="po-item-product">${escapeHtml(product)}</small>` : ""}</span>
                    </li>
                `;
                })
                .join("")}
        </ol>
    `;
}

function brandTableCellList(items) {
    return productTableValueList(items, productTableBrand, [], { className: "po-brand-lines" });
}

function specificationTableCellList(items) {
    return productTableValueList(items, productSpecification, [], { className: "po-spec-lines" });
}

function purchaseOrderItemsSummary(items = [], fallbackNames = []) {
    if (!items.length && !fallbackNames.length)
        return '<div class="po-items-summary"><strong>No products</strong></div>';
    const sourceItems =
        Array.isArray(items) && items.length
            ? items
            : fallbackNames.map((name) => ({ product_name: name }));
    const previewItems = sourceItems.slice(0, 2);
    const remainingCount = sourceItems.length - previewItems.length;
    return `
        <div class="po-items-summary">
            <ul class="po-items-preview">
                ${previewItems
                    .map((item) => {
                        const brand = productTableBrand(item);
                        const product = cleanText(item.generic_name) || productTableProductName(item);
                        return `<li><strong>${escapeHtml(brand || product || "-")}</strong>${product && !sameText(product, brand) ? `<span>${escapeHtml(product)}</span>` : ""}</li>`;
                    })
                    .join("")}
            </ul>
            ${remainingCount > 0 ? `<small class="po-items-more">+${remainingCount} more items</small>` : ""}
        </div>
    `;
}

function purchaseOrderQuantitySummary(items = []) {
    if (!items.length) return '<span class="text-muted">-</span>';
    const previewItems = items.slice(0, 2);
    const remainingCount = items.length - previewItems.length;
    return `
        <div class="po-quantity-summary">
            ${productTableValueList(previewItems, purchaseUnitQuantityLabel, [], {
                className: "po-order-qty-lines",
            })}
            ${remainingCount > 0 ? `<small class="po-items-more">+${remainingCount} more items</small>` : ""}
        </div>
    `;
}

function unitDisplayFromDetails(item) {
    const category = cleanText(item.category_name).toLowerCase();
    const dosageForm = cleanText(item.dosage_form);
    const productUnit = cleanText(item.product_unit || item.unit || item.measurement_unit_name);
    const pack = parsePackContent(item.pack_content || item.pack_content_unit || "");
    const weightUnit =
        cleanText(item.weight_volume_unit) ||
        cleanText(item.weight_volume_value).match(/[a-zA-Z%]+$/)?.[0] ||
        "";
    const volumeUnit =
        cleanText(item.volume_unit) || cleanText(item.volume_value).match(/[a-zA-Z%]+$/)?.[0] || "";
    const strengthUnit =
        cleanText(item.strength_unit) ||
        cleanText(item.strength_value).match(/[a-zA-Z%]+$/)?.[0] ||
        "";

    if (category === "medicine" && /^(tablet|capsule|caplet)$/i.test(dosageForm)) {
        return "pcs";
    }

    if (
        category === "medicine" &&
        /\b(liquid|syrup|solution|suspension|drops)\b/i.test(dosageForm)
    ) {
        return volumeUnit || "mL";
    }

    if (category === "grocery") {
        return pack.unit || weightUnit || volumeUnit || productUnit || "pcs";
    }

    return displayText(productUnit || volumeUnit || strengthUnit || pack.unit || "pcs");
}

function sizeDisplayFromDetails(item) {
    const weight = groceryNetWeightDisplay(item);
    const volume = [cleanText(item.volume_value), cleanText(item.volume_unit)]
        .filter(Boolean)
        .join(" ");
    return weight || volume || cleanText(item.size_value);
}

function statusBadge(status) {
    const color = STATUS_META[status] || "#64748b";
    return `<span class="badge status-badge text-white" style="background:${color}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function purchaseOrderStatusStack(order) {
    const claimBadge = cleanText(order.open_claim_badge);
    const status = String(order.status || "Draft");
    const statusClass = status.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    return `<div class="po-status-stack"><span class="po-status-pill po-status-${escapeHtml(statusClass)}"><span class="po-status-dot" aria-hidden="true"></span>${escapeHtml(STATUS_LABELS[status] || status)}</span>${claimBadge ? `<span class="po-claim-badge">${escapeHtml(claimBadge)}</span>` : ""}</div>`;
}

function paymentStatusBadge(status = "Unpaid") {
    const state = String(status || "")
        .trim()
        .toLowerCase()
        .replaceAll("_", " ");
    const current =
        state === "paid"
            ? "Paid"
            : state === "unpaid"
              ? "Unpaid"
              : state === "partially paid"
                ? "Partially paid"
                : state === "awaiting invoice"
                  ? "Awaiting Invoice"
                  : status === "Fully Paid"
                    ? "Paid"
                    : status;
    const normalized = ["Awaiting Invoice", "Unpaid", "Partially paid", "Paid"].includes(current)
        ? current
        : "Unpaid";
    const className = normalized === "Partially paid" ? "partially-paid" : normalized.toLowerCase().replaceAll(" ", "-");
    return `<span class="po-payment-badge ${className}">${escapeHtml(normalized)}</span>`;
}

function isPurchaseOrderPaid(status, remainingBalance) {
    if (
        remainingBalance !== null &&
        remainingBalance !== undefined &&
        remainingBalance !== "" &&
        Number.isFinite(Number(remainingBalance))
    ) {
        return Number(remainingBalance) <= 0.005;
    }
    return ["Paid", "Fully Paid"].includes(String(status || ""));
}

function validNextStatuses(order) {
    const status = order.status || "Draft";
    const approved = order.approval_status === "Approved";
    if (status === "Draft") return approved ? ["Pending"] : [];
    if (status === "Pending") return ["Arrived"];
    return [];
}

function isOperationallyLocked(order) {
    return ["Pending", "Arrived", "Delivered", "Cancelled", "Rejected"].includes(
        order.status || "",
    );
}

function canEditMajorFields(order) {
    const approval = order.approval_status || "Pending";
    return !isOperationallyLocked(order) && ["Pending", "Revision Requested"].includes(approval);
}

function isSupervisorPoViewer() {
    const role = String(
        document.body.dataset.sessionRole ||
            window.__drpSession?.access_role ||
            window.__drpSession?.role ||
            "",
    )
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    return role === "supervisor" || role === "ro_supervisor";
}

function activeMoreActionsButton(order) {
    if (isSupervisorPoViewer()) return "";
    const nextStatus = validNextStatuses(order)[0] || "";
    const canRecordInvoice = ["Draft", "Pending", "Arrived", "Delivered"].includes(
        order.status || "",
    );
    const canManagePayment =
        ["Pending", "Arrived", "Delivered"].includes(order.status || "") &&
        order.invoice_recorded &&
        order.payment_available !== false &&
        Number(order.invoice_total ?? order.total_amount ?? 0) > 0;
    const paid = getPoPaymentStatus(order) === "paid";
    return `
        <button class="btn btn-sm btn-outline-secondary status-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" data-next-status="${escapeHtml(nextStatus)}" data-can-invoice="${canRecordInvoice}" data-has-invoice="${Boolean(order.invoice_recorded)}" data-can-payment="${canManagePayment}" data-payment-paid="${paid}" title="More actions" aria-label="More actions for ${escapeHtml(order.po_number || "")}" aria-haspopup="menu" aria-expanded="false">
            <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
    `;
}

function statusActionButton(order) {
    if (isSupervisorPoViewer()) return "";
    const nextStatuses = validNextStatuses(order);
    if (!nextStatuses.length) return "";
    const nextStatus = nextStatuses[0];
    return `
        <button class="btn btn-sm btn-outline-secondary status-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" data-next-status="${escapeHtml(nextStatus)}" title="More actions" aria-label="More actions for ${escapeHtml(order.po_number || "")}" aria-haspopup="menu" aria-expanded="false">
            <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
    `;
}

function activePurchaseOrderPrimaryAction(order) {
    const status = order.status || "Draft";
    const poId = escapeHtml(order.po_id || "");
    const poNumber = escapeHtml(order.po_number || "");
    const nextStatus = validNextStatuses(order)[0];

    if (status === "Draft" && nextStatus === "Pending") {
        return `<button class="btn btn-sm btn-outline-primary po-primary-action po-primary-status-btn" type="button" data-po-id="${poId}" aria-label="Submit ${poNumber}"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>Submit</span></button>`;
    }
    if (status === "Pending" && nextStatus === "Arrived") {
        return `<button class="btn btn-sm btn-outline-primary po-primary-action po-primary-status-btn" type="button" data-po-id="${poId}" aria-label="Receive ${poNumber}"><i class="fa-solid fa-box" aria-hidden="true"></i><span>Receive</span></button>`;
    }
    if (status === "Arrived") {
        return `<button class="btn btn-sm btn-outline-primary po-primary-action po-receive-btn" type="button" data-po-id="${poId}" aria-label="Receive ${poNumber}"><i class="fa-solid fa-box" aria-hidden="true"></i><span>Receive</span></button>`;
    }
    if (status === "Delivered" && getPoPaymentStatus(order) !== "paid") {
        if (!order.invoice_recorded) {
            return `<button class="btn btn-sm btn-outline-primary po-primary-action record-invoice-btn" type="button" data-po-id="${poId}" aria-label="Record invoice for ${poNumber}"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i><span>Record invoice</span></button>`;
        }
        if (
            order.payment_available !== false &&
            Number(order.invoice_total ?? order.total_amount ?? 0) > 0
        ) {
            return `<button class="btn btn-sm btn-outline-primary po-primary-action manage-payment-btn" type="button" data-po-id="${poId}" aria-label="Record payment for ${poNumber}"><i class="fa-regular fa-credit-card" aria-hidden="true"></i><span>Record payment</span></button>`;
        }
    }
    return "";
}

let activeStatusActionMenu = null;

function closeStatusActionMenu() {
    if (!activeStatusActionMenu) return;
    activeStatusActionMenu.toggle.setAttribute("aria-expanded", "false");
    activeStatusActionMenu.menu.remove();
    activeStatusActionMenu = null;
}

function positionStatusActionMenu() {
    if (!activeStatusActionMenu) return;
    const { toggle, menu } = activeStatusActionMenu;
    if (!toggle.isConnected) {
        closeStatusActionMenu();
        return;
    }
    const triggerRect = toggle.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const safeGap = 12;
    const left = Math.min(
        window.innerWidth - menuRect.width - safeGap,
        Math.max(safeGap, triggerRect.right - menuRect.width),
    );
    const opensUp =
        triggerRect.bottom + menuRect.height + 8 > window.innerHeight &&
        triggerRect.top - menuRect.height - 8 >= safeGap;
    const top = opensUp
        ? triggerRect.top - menuRect.height - 6
        : Math.min(window.innerHeight - menuRect.height - safeGap, triggerRect.bottom + 6);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(Math.max(safeGap, top))}px`;
}

function toggleStatusActionMenu(toggle) {
    if (activeStatusActionMenu?.toggle === toggle) {
        closeStatusActionMenu();
        return;
    }
    closeStatusActionMenu();
    const nextStatus = toggle.dataset.nextStatus || "";
    if (!toggle.hasAttribute("data-can-invoice")) {
        const label = nextStatus === "Arrived" ? "Mark PO as Arrived" : "Mark PO as Pending";
        const menu = document.createElement("div");
        menu.className = "po-action-popover";
        menu.setAttribute("role", "menu");
        menu.innerHTML = `<button class="po-action-popover-item status-po-menu-item" type="button" role="menuitem" data-po-id="${escapeHtml(toggle.dataset.poId || "")}"><i class="fa-solid ${nextStatus === "Arrived" ? "fa-truck-ramp-box" : "fa-paper-plane"}" aria-hidden="true"></i><span>${escapeHtml(label)}</span></button>`;
        document.body.appendChild(menu);
        toggle.setAttribute("aria-expanded", "true");
        activeStatusActionMenu = { toggle, menu };
        positionStatusActionMenu();
        menu.querySelector(".status-po-menu-item")?.focus({ preventScroll: true });
        return;
    }
    const actions = [];
    if (toggle.dataset.canInvoice === "true") {
        actions.push(
            `<button class="po-action-popover-item po-action-popover-invoice" type="button" role="menuitem" data-po-id="${escapeHtml(toggle.dataset.poId || "")}"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i><span>${toggle.dataset.hasInvoice === "true" ? "View supplier invoice" : "Record supplier invoice"}</span></button>`,
        );
    }
    if (toggle.dataset.canPayment === "true") {
        actions.push(
            `<button class="po-action-popover-item po-action-popover-payment" type="button" role="menuitem" data-po-id="${escapeHtml(toggle.dataset.poId || "")}"><i class="fa-regular fa-credit-card" aria-hidden="true"></i><span>${toggle.dataset.paymentPaid === "true" ? "View payment history" : "Record payment"}</span></button>`,
        );
    }
    if (nextStatus) {
        const label = nextStatus === "Arrived" ? "Mark PO as Arrived" : "Mark PO as Pending";
        actions.push(
            `<button class="po-action-popover-item status-po-menu-item" type="button" role="menuitem" data-po-id="${escapeHtml(toggle.dataset.poId || "")}"><i class="fa-solid ${nextStatus === "Arrived" ? "fa-truck-ramp-box" : "fa-paper-plane"}" aria-hidden="true"></i><span>${escapeHtml(label)}</span></button>`,
        );
    }
    const menu = document.createElement("div");
    menu.className = "po-action-popover";
    menu.setAttribute("role", "menu");
    menu.innerHTML = actions.join("");
    document.body.appendChild(menu);
    toggle.setAttribute("aria-expanded", "true");
    activeStatusActionMenu = { toggle, menu };
    positionStatusActionMenu();
    menu.querySelector(".po-action-popover-item")?.focus({ preventScroll: true });
}

function invoiceActionButton(order) {
    const status = order.status || "";
    if (!["Draft", "Pending", "Arrived", "Delivered"].includes(status)) return "";
    const poId = escapeHtml(order.po_id);
    const poNumber = escapeHtml(order.po_number || "");
    if (!order.invoice_recorded) {
        return `<button class="btn btn-sm btn-outline-success record-invoice-btn record-invoice-compact" type="button" data-po-id="${poId}" title="Record Supplier Invoice" aria-label="Record Supplier Invoice for ${poNumber}"><span>RSI</span><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i></button>`;
    }
    return `<button class="btn btn-sm btn-outline-success record-invoice-btn record-invoice-compact" type="button" data-po-id="${poId}" title="View Supplier Invoice" aria-label="View Supplier Invoice for ${poNumber}"><span>RSI</span><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i></button>`;
}

function paymentActionButton(order = {}) {
    if (!["Pending", "Arrived", "Delivered"].includes(order.status || "")) return "";
    const poId = escapeHtml(order.po_id || "");
    const poNumber = escapeHtml(order.po_number || "");
    if (!order.invoice_recorded) {
        return `<button class="btn btn-sm btn-outline-secondary po-labeled-action po-payment-action" type="button" disabled title="Record Payment — supplier invoice required" aria-label="Record Supplier Invoice first for ${poNumber}"><i class="fa-solid fa-wallet"></i><span>Payment</span></button>`;
    }
    if (
        order.payment_available === false ||
        Number(order.invoice_total ?? order.total_amount ?? 0) <= 0
    ) {
        return `<button class="btn btn-sm btn-outline-secondary po-labeled-action po-payment-action" type="button" disabled title="Record Payment — valid supplier invoice amount required" aria-label="Valid Supplier Invoice amount required for ${poNumber}"><i class="fa-solid fa-wallet"></i><span>Payment</span></button>`;
    }
    if (isPurchaseOrderPaid(order.payment_status, order.remaining_balance ?? order.final_payment)) {
        return `<button class="btn btn-sm btn-outline-primary view-payment-history-btn po-labeled-action po-payment-action" type="button" data-po-id="${poId}" aria-label="View payment history for ${poNumber}" title="View Payment"><i class="fa-solid fa-wallet"></i><span>Paid</span></button>`;
    }
    return `<button class="btn btn-sm btn-purple manage-payment-btn po-labeled-action po-payment-action" type="button" data-po-id="${poId}" aria-label="Payment for ${poNumber}" title="Record Payment"><i class="fa-solid fa-wallet"></i><span>Payment</span></button>`;
}

function numberedList(values, options = {}) {
    const list = Array.isArray(values) ? values : [];
    const plain = options.plain ? " po-line-list-plain" : "";

    if (list.length === 0) return '<span class="text-muted">None</span>';

    return `
        <ol class="po-line-list${plain}">
            ${list
                .map(
                    (value, index) => `
                <li>
                    ${options.plain ? "" : `<span class="line-index">${index + 1}.</span>`}
                    <span class="line-text">${escapeHtml(value)}</span>
                </li>
            `,
                )
                .join("")}
        </ol>
    `;
}

function productDetailValue(item, field) {
    const isMedicine = item.category_name === "Medicine";
    const medicineText =
        `${item.product_name || ""} ${item.brand_name || ""} ${item.type_name || ""}`.toLowerCase();
    const isLiquid = /\b(liquid|syrup|solution|suspension|drops|betadine|povidone)\b/.test(
        medicineText,
    );

    if (field === "genericVariant") {
        return isMedicine ? cleanText(item.generic_name) : cleanText(item.variant_flavor);
    }

    if (field === "strengthSize") {
        if (isMedicine) {
            return medicineStrengthDisplay(item) || cleanText(item.strength);
        }

        return item.weight_volume_value
            ? groceryNetWeightDisplay(item, "Not set")
            : cleanText(item.size_value);
    }

    if (field === "packaging") {
        return cleanText(item.packaging);
    }

    return "";
}

function calculatePurchaseItem(item) {
    const orderQty = Number(item.purchase_qty ?? item.quantity ?? 0);
    const unitsPerPurchaseUnit = Number(
        item.units_per_purchase_unit ?? item.purchase_unit_qty ?? 1,
    );
    const supplierUnitCost = Number(item.price ?? 0);

    if (!Number.isSafeInteger(orderQty) || orderQty < 1) {
        throw new Error("Order quantity must be a positive whole number.");
    }
    if (!Number.isSafeInteger(unitsPerPurchaseUnit) || unitsPerPurchaseUnit < 1) {
        throw new Error("Units per Purchase Unit must be a positive whole number.");
    }
    if (!Number.isFinite(supplierUnitCost) || supplierUnitCost < 0) {
        throw new Error("Supplier cost must be zero or greater.");
    }

    const totalBaseUnits = orderQty * unitsPerPurchaseUnit;
    const supplierUnitCostCents = Math.round((supplierUnitCost + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(totalBaseUnits) || !Number.isSafeInteger(supplierUnitCostCents)) {
        throw new Error("The purchase quantity or supplier cost is too large.");
    }

    const costQuantity = item.cost_basis === "purchase_unit" ? orderQty : totalBaseUnits;
    const lineTotalCents = costQuantity * supplierUnitCostCents;
    if (!Number.isSafeInteger(lineTotalCents)) {
        throw new Error("The purchase-order line total is too large.");
    }

    return {
        orderQty,
        unitsPerPurchaseUnit,
        supplierUnitCost: supplierUnitCostCents / 100,
        totalBaseUnits,
        lineTotal: lineTotalCents / 100,
    };
}

function applyPurchaseItemCalculation(item) {
    const calculation = calculatePurchaseItem(item);
    item.inventory_qty_ordered = calculation.totalBaseUnits;
    item.supplier_unit_cost = calculation.supplierUnitCost;
    item.line_total = calculation.lineTotal;
    return calculation;
}

function productLineTotal(item) {
    return calculatePurchaseItem(item).lineTotal;
}

function inventoryQtyForItem(item) {
    return calculatePurchaseItem(item).totalBaseUnits;
}

function updateCreateSummary() {
    renderSelectedProductPanel();
}

function readPurchaseUnitOverrides(prefix = "po") {
    const purchaseUnit = cleanText(document.getElementById(`${prefix}-purchase-unit`)?.value);
    const unitsPerPurchaseUnit = Math.max(
        1,
        Number(document.getElementById(`${prefix}-units-per-purchase-unit`)?.value || 1),
    );
    return { purchaseUnit, unitsPerPurchaseUnit };
}

function setCreatePurchaseUnitFields(item) {
    if (!item) {
        setSelectValue("po-purchase-unit", "Box");
        setValue("po-units-per-purchase-unit", "1");
        return;
    }
    const purchaseUnit = purchaseUnitInfo(item);
    setSelectValue("po-purchase-unit", purchaseUnit.purchaseUnit || "Box");
    setValue("po-units-per-purchase-unit", purchaseUnit.quantity || 1);
}

function syncPurchaseUnitFieldsFromSelectedProduct() {
    selectedCreateDraftIndex = null;
    const productSelect = document.getElementById("po-product-select");
    const selectedOption = productSelect?.options[productSelect.selectedIndex];
    if (productSelect)
        productSelect.title = selectedOption?.title || selectedOption?.textContent || "";
    const item = selectedOptionItem("po-product-select", false);
    setCreatePurchaseUnitFields(item);
    const selectedItem = selectedOptionItem("po-product-select");
    const existingItem = selectedItem ? createDraftItemByKey(draftLineKey(selectedItem)) : null;
    if (existingItem) {
        selectedCreateDraftIndex = createDraftItems.indexOf(existingItem);
        setValue("po-quantity", calculatePurchaseItem(existingItem).orderQty);
    } else {
        setValue("po-quantity", 1);
    }
    renderSelectedProductPanel();
}

function selectedOptionItem(selectId = "po-product-select", useOverrides = true) {
    const productSelect = document.getElementById(selectId);
    const option = productSelect?.options[productSelect.selectedIndex];
    return productSelect?.value && option
        ? draftItemFromOption(
              option,
              1,
              selectId === "po-product-select" && useOverrides
                  ? readPurchaseUnitOverrides("po")
                  : {},
          )
        : null;
}

function infoMetric(label, value) {
    const cleanValue = cleanText(value);
    if (!cleanValue) return "";
    return `<div class="po-info-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(cleanValue)}</strong></div>`;
}

function detailMetric(label, value) {
    const cleanValue = cleanText(value) || "-";
    return `<div class="po-info-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(cleanValue)}</strong></div>`;
}

function createProductDetailSnapshot(item = {}) {
    const purchaseUnit = purchaseUnitInfo(item);
    const inventoryQty = Number(item.inventory_qty_ordered || inventoryQtyForItem(item) || 0);
    return {
        brand_name: poBrandName(item),
        product_name: productCoreName(item),
        specification: productSpecification(item),
        category_name: item.category_name,
        type_name: item.type_name,
        generic_name: item.generic_name,
        strength: productStrengthValue(item),
        net_content: medicineNetContentDisplay(item),
        net_weight: productNetWeightLabel(item),
        unit: item.unit || unitDisplayFromDetails(item),
        packaging: item.packaging || productPackagingValue(item),
        shelf_stock: Number(item.shelf_stock || 0),
        storage_stock: Number(item.storage_stock || 0),
        stock: Number(item.stock || 0),
        reorder_level: Number(item.reorder_level || 10),
        supplier_cost: Number(item.price || 0),
        selling_price: Number(item.selling_price || 0),
        purchase_conversion: purchaseUnit.conversionNote || "",
        stock_to_receive: inventoryQty ? quantityWithInventoryUnit(item, inventoryQty) : "",
    };
}

function productDetailsForPreview(item = {}) {
    const details = item.product_details || createProductDetailSnapshot(item);
    const metrics = [
        detailMetric("Brand", details.brand_name),
        detailMetric("Product", details.product_name),
        detailMetric("Specification", details.specification),
        detailMetric("Product Type", details.type_name),
        detailMetric("Shelf Stock", Number(details.shelf_stock || 0)),
        detailMetric("Storage Stock", Number(details.storage_stock || 0)),
        detailMetric("On Hand", Number(details.stock || 0)),
    ];

    return metrics.filter(Boolean).join("");
}

function receiptRow(label, value, options = {}) {
    const cleanValue = cleanText(value) || "-";
    const totalClass = options.strong ? " po-receipt-row-total" : "";
    const highlightClass = options.highlight ? " po-receipt-row-highlight" : "";
    return `
        <div class="po-receipt-row${totalClass}${highlightClass}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(cleanValue)}</strong>
        </div>
    `;
}

function selectedSupplierName(prefix = "po") {
    const select = document.getElementById(`${prefix}-supplier-select`);
    const option = select?.options[select.selectedIndex];
    return cleanText(option?.textContent || "") || "Not selected";
}

function quantityGroupSummary(items, valueGetter, unitGetter, emptyLabel) {
    const groups = new Map();

    items.forEach((item) => {
        const value = Number(valueGetter(item) || 0);
        if (value <= 0) return;
        const unit = cleanText(unitGetter(item, value) || emptyLabel);
        groups.set(unit, (groups.get(unit) || 0) + value);
    });

    if (groups.size === 0) return `0 ${emptyLabel}`;

    return [...groups.entries()].map(([unit, value]) => `${value} ${unit}`).join(", ");
}

function draftPackageSummary(items) {
    return quantityGroupSummary(
        items,
        (item) => Number(item.purchase_qty || item.quantity || 0),
        (item, value) => pluralizeUnit(purchaseUnitInfo(item).purchaseUnit || "package", value),
        "packages",
    );
}

function draftStockSummary(items) {
    return quantityGroupSummary(
        items,
        (item) => inventoryQtyForItem(item),
        (item, value) => packageContentUnitText(stockCountUnit(item, value)),
        "pcs",
    );
}

function updateCreatePoSubmitState() {
    const button = document.getElementById("btnSubmitPo");
    if (!button) return;
    const ready = Boolean(
        document.getElementById("po-supplier-select")?.value &&
        document.getElementById("po-payment-terms")?.value &&
        document.getElementById("po-expected-delivery")?.value &&
        !isPastLocalDate(document.getElementById("po-expected-delivery")?.value) &&
        createDraftItems.length,
    );
    button.disabled = !ready;
    button.setAttribute("aria-disabled", ready ? "false" : "true");
    button.title = ready
        ? ""
        : "Complete the purchase order information and add at least one item.";
}

function totalPurchaseUnits(items) {
    return items.reduce(
        (total, item) => total + Number(item.purchase_qty || item.quantity || 0),
        0,
    );
}

function supplierVatRate() {
    // Supplier, supplier-product, and PO records do not expose a tax basis.
    // The backend stores total_amount as the sum of line totals, without adding VAT.
    return 0;
}

function draftLineKey(item) {
    const supplierProductId = cleanText(item.supplier_product_id);
    const supplierId = cleanText(item.supplier_id);
    const productId = cleanText(item.product_id);
    const purchaseUnit = normalizePurchaseUnit(
        item.purchase_unit || purchaseUnitInfo(item).purchaseUnit,
    ).toLowerCase();
    const unitsPerPurchaseUnit = Number(
        item.units_per_purchase_unit || item.purchase_unit_qty || 1,
    );
    const supplierMappingKey = supplierProductId || [supplierId, productId].join(":");
    return [supplierMappingKey, productId, purchaseUnit, unitsPerPurchaseUnit].join("::");
}

function createDraftItemByKey(itemKey) {
    return createDraftItems.find((item) => draftLineKey(item) === itemKey) || null;
}

function renderQuantityValidation(input, message = "") {
    const validation = input?.closest(".po-summary-fact")?.querySelector(".po-quantity-validation");
    if (validation) validation.textContent = message;
}

function updateDraftItemQuantity(itemKey, nextQuantity, focusControl = "") {
    const item = createDraftItemByKey(itemKey);
    const quantityText = String(nextQuantity ?? "").trim();
    if (!item || !/^[1-9]\d*$/.test(quantityText)) return false;

    const quantity = Number(quantityText);
    if (!Number.isSafeInteger(quantity) || quantity < 1) return false;

    item.purchase_qty = quantity;
    item.quantity = quantity;
    applyPurchaseItemCalculation(item);
    item.product_details = createProductDetailSnapshot(item);
    selectedCreateDraftIndex = createDraftItems.indexOf(item);
    const selectedOption = selectedOptionItem("po-product-select");
    if (selectedOption && draftLineKey(selectedOption) === itemKey) {
        setValue("po-quantity", quantity);
    }
    renderSelectedProductPanel({ focusLineKey: itemKey, focusControl });
    return true;
}

function syncSelectedCreateDraftItemFromInputs() {
    const quantityText = getValue("po-quantity");
    if (!/^[1-9]\d*$/.test(quantityText) || !Number.isSafeInteger(Number(quantityText))) return;
    const selectedItem = selectedOptionItem("po-product-select");
    if (!selectedItem) return;
    const itemKey = draftLineKey(selectedItem);
    if (createDraftItemByKey(itemKey)) updateDraftItemQuantity(itemKey, quantityText);
}

function purchaseSummaryItemHtml(item, index) {
    const purchaseUnit = purchaseUnitInfo(item);
    const orderQty = Number(item.purchase_qty || item.quantity || 0);
    const packageLabel = pluralizeUnit(purchaseUnit.purchaseUnit || "package", orderQty);
    const lineKey = draftLineKey(item);
    const specification = productSpecification(item);
    const inventoryQuantity = inventoryQtyForItem(item);
    const stockToReceiveLabel = inventoryQuantityLabel(
        inventoryQuantity,
        packageContentUnitText(stockCountUnit(item, inventoryQuantity)),
    );

    return `
        <article class="po-summary-item" data-line-key="${escapeHtml(lineKey)}">
            <div class="po-summary-item-header">
                <span class="po-summary-line-number" aria-label="Line ${index + 1}">${index + 1}</span>
                <div class="po-summary-product" title="${escapeHtml(productDisplayWithSpecification(item))}">
                    <span class="po-summary-product-name">${escapeHtml(productCoreName(item) || item.product_name || "Unnamed product")}</span>
                    ${specification ? `<span class="po-summary-product-spec">${escapeHtml(specification)}</span>` : ""}
                </div>
                <button class="btn btn-sm btn-outline-danger po-summary-remove-item" type="button" data-line-key="${escapeHtml(lineKey)}" aria-label="Remove ${escapeHtml(productDisplayWithSpecification(item))}">
                    <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                    <span>Remove</span>
                </button>
            </div>
            <div class="po-summary-facts">
                <div class="po-summary-fact">
                    <span>Purchase Unit</span>
                    <strong>${escapeHtml(purchaseUnit.purchaseUnit || "Package")}</strong>
                </div>
                <div class="po-summary-fact">
                    <span>Order Quantity</span>
                    <div class="po-quantity-stepper">
                        <button class="po-quantity-decrease" type="button" data-line-key="${escapeHtml(lineKey)}" aria-label="Decrease order quantity" ${orderQty <= 1 ? 'disabled aria-disabled="true" title="Minimum quantity is 1"' : ""}>&minus;</button>
                        <input class="po-quantity-input" type="number" min="1" step="1" inputmode="numeric" value="${orderQty}" data-line-key="${escapeHtml(lineKey)}" aria-label="Order quantity" aria-describedby="po-quantity-error-${createDraftItems.indexOf(item)}">
                        <button class="po-quantity-increase" type="button" data-line-key="${escapeHtml(lineKey)}" aria-label="Increase order quantity">+</button>
                    </div>
                    <strong class="po-quantity-unit-label">${escapeHtml(`${orderQty} ${packageLabel}`)}</strong>
                    <div id="po-quantity-error-${createDraftItems.indexOf(item)}" class="po-quantity-validation" aria-live="polite"></div>
                </div>
                <div class="po-summary-fact">
                    <span>Units per Purchase Unit</span>
                    <strong>${purchaseUnit.quantity}</strong>
                </div>
            </div>
            <div class="po-summary-line-totals">
                <div class="po-line-total"><span>Stock to Receive</span><strong>${escapeHtml(stockToReceiveLabel)}</strong></div>
                <div class="po-line-total"><span>Supplier Unit Cost</span><strong>${peso(item.price)} / ${escapeHtml(unitPriceLabel(purchaseUnit.singleStockUnit))}</strong></div>
                <div class="po-line-total"><span>Line Total</span><strong>${peso(productLineTotal(item))}</strong></div>
            </div>
        </article>
    `;
}

function renderPurchaseItemsSummary(items) {
    if (items.length === 0) {
        return '<div class="po-summary-empty"><strong>No purchase items added yet.</strong>Select a product above and click Add Item.</div>';
    }

    return items.map((item, index) => purchaseSummaryItemHtml(item, index)).join("");
}

function currentStockHtml(item) {
    if (!item) return "";
    const details = item.product_details || createProductDetailSnapshot(item);
    const shelfStock = Number(details.shelf_stock || 0);
    const storageStock = Number(details.storage_stock || 0);
    const onHand = Number.isFinite(Number(details.stock))
        ? Number(details.stock)
        : shelfStock + storageStock;

    return `
        <div class="po-current-stock-strip" role="status" aria-live="polite">
            <strong>Current Stock</strong>
            <div class="po-current-stock-values">
                <span>Shelf: <b>${shelfStock}</b></span>
                <span>Storage: <b>${storageStock}</b></span>
                <span>On Hand: <b>${onHand}</b></span>
            </div>
        </div>
    `;
}

function renderSelectedProductPanel(options = {}) {
    const panel = document.getElementById("po-selected-product-panel");
    if (!panel) return;

    const selectedDraftItem = Number.isInteger(selectedCreateDraftIndex)
        ? createDraftItems[selectedCreateDraftIndex]
        : null;
    const item = selectedDraftItem || selectedOptionItem("po-product-select");

    const calculationSnapshot = createDraftItems.map((draftItem) => {
        const calculation = applyPurchaseItemCalculation(draftItem);
        return {
            supplier_product_id: draftItem.supplier_product_id || "",
            product_id: draftItem.product_id,
            purchase_qty: calculation.orderQty,
            purchase_unit: draftItem.purchase_unit || purchaseUnitInfo(draftItem).purchaseUnit,
            units_per_purchase_unit: calculation.unitsPerPurchaseUnit,
            inventory_qty_ordered: calculation.totalBaseUnits,
            supplier_unit_cost: calculation.supplierUnitCost,
            line_total: calculation.lineTotal,
        };
    });
    document.documentElement.dataset.purchaseOrderCalculation = JSON.stringify(calculationSnapshot);
    const subtotal = calculationSnapshot.reduce(
        (total, draftItem) => total + draftItem.line_total,
        0,
    );
    const vatRate = supplierVatRate();
    const vat = subtotal * vatRate;
    const grandTotal = subtotal + vat;
    const financialDetails = [
        receiptRow("Purchase Items", String(createDraftItems.length)),
        receiptRow("Total Purchase Units", String(totalPurchaseUnits(createDraftItems))),
        receiptRow("Stock Expected", draftStockSummary(createDraftItems)),
        '<div class="po-receipt-divider"></div>',
        receiptRow("Supplier", selectedSupplierName("po")),
        '<div class="po-receipt-divider"></div>',
        receiptRow("Subtotal", peso(subtotal)),
        ...(vatRate > 0 ? [receiptRow(`VAT (${Math.round(vatRate * 100)}%)`, peso(vat))] : []),
        '<div class="po-receipt-divider"></div>',
        receiptRow("GRAND TOTAL", peso(grandTotal), { strong: true, highlight: true }),
    ].join("");
    panel.innerHTML = `
        ${currentStockHtml(item)}
        <div class="po-create-workspace">
            <section class="po-workspace-card po-purchase-items-card" aria-labelledby="po-purchase-items-heading">
                <div class="po-workspace-card-header">
                    <h4 id="po-purchase-items-heading">Purchase Items</h4>
                    <span class="po-line-count" aria-label="${createDraftItems.length} unique purchase lines">${createDraftItems.length}</span>
                </div>
                <div class="po-summary-items">${renderPurchaseItemsSummary(createDraftItems)}</div>
            </section>
            <aside class="po-workspace-card po-order-summary-card" aria-labelledby="po-order-summary-heading">
                <div class="po-workspace-card-header">
                    <h4 id="po-order-summary-heading">Order Summary</h4>
                </div>
                <div class="po-receipt-summary">${financialDetails}</div>
                <div class="po-summary-tax-note">VAT is not applied to this order.</div>
        </div>
    `;
    panel.classList.add("is-visible");
    updateCreatePoSubmitState();
    if (options.focusLineKey && options.focusControl) {
        const line = [...panel.querySelectorAll(".po-summary-item")].find(
            (element) => element.dataset.lineKey === options.focusLineKey,
        );
        const control = line?.querySelector(options.focusControl);
        control?.focus({ preventScroll: true });
        if (control?.classList.contains("po-quantity-input")) {
            const caret = String(control.value).length;
            try {
                control.setSelectionRange(caret, caret);
            } catch (error) {
                /* Number inputs may not expose text selection. */
            }
        }
    }
}

function isMedicineItem(item) {
    return (
        String(item?.category_name || "")
            .trim()
            .toLowerCase() === "medicine"
    );
}

function draftItemFromOption(option, quantity = 1, overrides = {}) {
    if (!option) return null;
    const unitsPerPurchaseUnit = Math.max(
        1,
        Number(
            overrides.unitsPerPurchaseUnit ||
                option.dataset.unitsPerPurchaseUnit ||
                option.dataset.purchaseUnitQty ||
                1,
        ),
    );
    const purchaseUnit = normalizePurchaseUnit(
        overrides.purchaseUnit || option.dataset.purchaseUnit || "",
    );
    const purchaseQty = Math.max(1, Number(quantity || 1));

    return {
        po_item_id: null,
        supplier_product_id: option.dataset.supplierProductId || "",
        supplier_id: option.dataset.supplierId || "",
        product_id: option.value,
        product_name: option.dataset.productName || option.textContent || "",
        product_display_name: option.dataset.productDisplayName || "",
        brand_name: option.dataset.brand || "",
        brand_display_name: option.dataset.brandDisplayName || "",
        unit: option.dataset.unit || "",
        category_name: option.dataset.categoryName || "",
        type_name: option.dataset.typeName || "",
        generic_name: option.dataset.genericName || "",
        dosage_form: option.dataset.dosageForm || "",
        package_type: option.dataset.packageType || "",
        strength: option.dataset.strength || "",
        strength_value: option.dataset.strengthValue || "",
        strength_unit: option.dataset.strengthUnit || "",
        net_content_value: option.dataset.netContentValue || option.dataset.volumeValue || "",
        net_content_unit: option.dataset.netContentUnit || option.dataset.volumeUnit || "",
        volume_value: option.dataset.volumeValue || "",
        volume_unit: option.dataset.volumeUnit || "",
        variant_flavor: option.dataset.variantFlavor || "",
        size_value: option.dataset.sizeValue || "",
        weight_volume_value: option.dataset.weightVolumeValue || "",
        weight_volume_unit: option.dataset.weightVolumeUnit || "",
        size_display: option.dataset.sizeDisplay || "",
        packaging: option.dataset.packaging || "",
        purchase_unit: purchaseUnit,
        units_per_purchase_unit: unitsPerPurchaseUnit,
        purchase_unit_conversion: option.dataset.purchaseUnitConversion || "",
        purchase_unit_qty: unitsPerPurchaseUnit,
        pack_content: option.dataset.packContent || "",
        shelf_stock: Number(option.dataset.shelfStock || 0),
        storage_stock: Number(option.dataset.storageStock || 0),
        selling_price: Number(option.dataset.sellingPrice || option.dataset.price || 0),
        reorder_level: Number(option.dataset.reorderLevel || 10),
        stock: option.dataset.stock || "",
        price: Number(option.dataset.price || 0),
        purchase_qty: purchaseQty,
        inventory_qty_ordered: purchaseQty * unitsPerPurchaseUnit,
        supplier_unit_cost: Number(option.dataset.price || 0),
        line_total: purchaseQty * unitsPerPurchaseUnit * Number(option.dataset.price || 0),
        quantity: purchaseQty,
    };
}

function setValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value ?? "";
}

function setSelectValue(id, value) {
    const select = document.getElementById(id);
    if (!select) return;
    const cleanValue = cleanText(value);
    if (cleanValue && ![...select.options].some((option) => sameText(option.value, cleanValue))) {
        select.add(new Option(cleanValue, cleanValue));
    }
    select.value = cleanValue;
}

function getValue(id) {
    return document.getElementById(id)?.value?.trim() || "";
}

function nextEditDraftClientId() {
    editDraftClientSequence += 1;
    return `draft-${Date.now()}-${editDraftClientSequence}`;
}

function ensureEditItemIdentity(item) {
    if (item && !item.po_item_id && !item.client_item_id)
        item.client_item_id = nextEditDraftClientId();
    return item;
}

function editItemKey(item) {
    if (!item) return "";
    if (item.po_item_id) return `po:${String(item.po_item_id)}`;
    ensureEditItemIdentity(item);
    return `draft:${String(item.client_item_id)}`;
}

function editDraftItemByKey(itemKey) {
    return editDraftItems.find((item) => editItemKey(item) === itemKey) || null;
}

function clearEditValidation() {
    [
        "edit-po-product-select",
        "edit-po-quantity",
        "edit-po-editor-purchase-unit",
        "edit-po-editor-contains",
        "edit-po-editor-price",
    ].forEach((id) => document.getElementById(id)?.classList.remove("is-invalid"));
    [
        "edit-po-product-error",
        "edit-po-quantity-error",
        "edit-po-purchase-unit-error",
        "edit-po-contains-error",
        "edit-po-price-error",
    ].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = "";
    });
}

function showEditFieldError(fieldId, errorId, message) {
    document.getElementById(fieldId)?.classList.add("is-invalid");
    const error = document.getElementById(errorId);
    if (error) error.textContent = message;
}

function clearEditProductEditor({ focusProduct = false } = {}) {
    editingPoItemId = null;
    editingPoItemKey = null;
    const editor = document.getElementById("edit-po-product-editor");
    if (editor) editor.classList.add("d-none");
    clearEditValidation();
    setValue("edit-po-editor-index", "");
    setValue("edit-po-editor-product-id", "");
    [
        "edit-po-editor-product-name",
        "edit-po-editor-brand-name",
        "edit-po-editor-category-name",
        "edit-po-editor-type-name",
        "edit-po-editor-generic-variant",
        "edit-po-editor-strength-size",
        "edit-po-editor-unit",
        "edit-po-editor-packaging",
        "edit-po-editor-price",
        "edit-po-editor-quantity",
        "edit-po-editor-contains",
        "edit-po-editor-conversion",
        "edit-po-editor-stock-receive",
        "edit-po-editor-selling-price",
        "edit-po-editor-shelf-stock",
        "edit-po-editor-storage-stock",
        "edit-po-editor-on-hand",
        "edit-po-editor-reorder-level",
    ].forEach((id) => setValue(id, ""));
    setSelectValue("edit-po-editor-purchase-unit", "Box");
    setValue("edit-po-quantity", "1");
    const productSelect = document.getElementById("edit-po-product-select");
    if (productSelect) productSelect.value = "";
    const button = document.getElementById("btnEditAddPoItem");
    if (button) button.textContent = "Add Item";
    document.getElementById("btnCancelEditPoItem")?.classList.add("d-none");
    const modeLabel = document.getElementById("edit-po-mode-label");
    if (modeLabel) {
        modeLabel.textContent = "Add mode";
        modeLabel.classList.remove("is-editing");
    }
    document.querySelectorAll("#table-edit-po-items tbody tr.is-selected").forEach((row) => {
        row.classList.remove("is-selected");
        row.setAttribute("aria-selected", "false");
    });
    renderEditSummary();
    if (focusProduct && !productSelect?.disabled) productSelect?.focus({ preventScroll: true });
}

function updateEditStockToReceive() {
    const quantity = Math.max(
        0,
        Number(
            getValue("edit-po-editor-quantity") ||
                document.getElementById("edit-po-quantity")?.value ||
                0,
        ),
    );
    const contains = Math.max(1, Number(getValue("edit-po-editor-contains") || 1));
    const selectedOption =
        document.getElementById("edit-po-product-select")?.selectedOptions?.[0] || null;
    const optionItem = selectedOption ? draftItemFromOption(selectedOption, quantity || 1) : null;
    const existingItem = editDraftItemByKey(editingPoItemKey);
    const item = {
        ...(optionItem || existingItem || {}),
        unit: getValue("edit-po-editor-unit") || optionItem?.unit || existingItem?.unit,
        packaging:
            getValue("edit-po-editor-packaging") ||
            optionItem?.packaging ||
            existingItem?.packaging,
        purchase_unit:
            getValue("edit-po-editor-purchase-unit") ||
            optionItem?.purchase_unit ||
            existingItem?.purchase_unit,
        units_per_purchase_unit: contains,
        purchase_unit_qty: contains,
    };
    const purchaseUnit = purchaseUnitInfo(item);
    setValue("edit-po-editor-stock-receive", quantityWithInventoryUnit(item, quantity * contains));
    setValue("edit-po-editor-conversion", purchaseUnit.conversionNote || "");
}

function showEditProductEditor(item, itemKey = null) {
    const editor = document.getElementById("edit-po-product-editor");
    if (!editor || !item) return;

    const medicine = isMedicineItem(item);
    const purchaseUnit = purchaseUnitInfo(item);
    const orderQty = Number(item.purchase_qty || item.quantity || 1);
    const onHand = Number(item.shelf_stock || 0) + Number(item.storage_stock || 0);
    const reorderLevel = Number(item.reorder_level || 10);
    editingPoItemKey = itemKey || null;
    editingPoItemId = itemKey ? item.po_item_id || item.client_item_id : null;
    editor.classList.remove("d-none");
    clearEditValidation();

    setValue("edit-po-editor-index", editingPoItemKey || "");
    setValue("edit-po-editor-product-id", item.product_id);
    setValue("edit-po-editor-product-name", item.product_name);
    setValue("edit-po-editor-brand-name", item.brand_name);
    setValue("edit-po-editor-category-name", item.category_name);
    setValue("edit-po-editor-type-name", item.type_name);
    setValue("edit-po-editor-generic-variant", medicine ? item.generic_name : item.variant_flavor);
    setValue(
        "edit-po-editor-strength-size",
        medicine ? productStrengthValue(item) : productSizeOnlyValue(item),
    );
    setValue("edit-po-editor-unit", item.unit);
    setValue("edit-po-editor-packaging", item.packaging);
    setValue("edit-po-editor-price", money(item.price));
    setSelectValue("edit-po-editor-purchase-unit", purchaseUnit.purchaseUnit || "Box");
    setValue("edit-po-editor-contains", purchaseUnit.quantity || 1);
    setValue("edit-po-editor-quantity", orderQty);
    setValue("edit-po-quantity", orderQty);
    setValue("edit-po-editor-selling-price", peso(item.selling_price || item.price || 0));
    setValue("edit-po-editor-shelf-stock", Number(item.shelf_stock || 0));
    setValue("edit-po-editor-storage-stock", Number(item.storage_stock || 0));
    setValue("edit-po-editor-on-hand", onHand);
    setValue("edit-po-editor-reorder-level", reorderLevel);
    updateEditStockToReceive();

    const productSelect = document.getElementById("edit-po-product-select");
    if (productSelect && item.product_id) productSelect.value = item.product_id;

    const button = document.getElementById("btnEditAddPoItem");
    if (button) button.textContent = editingPoItemId === null ? "Add Item" : "Update Selected Item";
    document
        .getElementById("btnCancelEditPoItem")
        ?.classList.toggle("d-none", editingPoItemId === null);
    const modeLabel = document.getElementById("edit-po-mode-label");
    if (modeLabel) {
        modeLabel.textContent = editingPoItemId === null ? "Add mode" : "Editing selected item";
        modeLabel.classList.toggle("is-editing", editingPoItemId !== null);
    }

    renderDraftItems(editDraftItems, "#table-edit-po-items", "remove-edit-po-item");
    if (activeEditOrder) applyEditLocks(activeEditOrder);
}

function readEditProductEditor() {
    const productId =
        getValue("edit-po-editor-product-id") ||
        document.getElementById("edit-po-product-select")?.value ||
        "";
    const quantity = Number(
        getValue("edit-po-editor-quantity") ||
            document.getElementById("edit-po-quantity")?.value ||
            0,
    );
    const price = Number(getValue("edit-po-editor-price") || 0);
    const purchaseUnit =
        cleanText(document.getElementById("edit-po-editor-purchase-unit")?.value) || "pcs";
    const unitsPerPurchaseUnit = Math.max(1, Number(getValue("edit-po-editor-contains") || 1));
    const categoryName = getValue("edit-po-editor-category-name");
    const medicine = categoryName.trim().toLowerCase() === "medicine";
    const genericOrVariant = getValue("edit-po-editor-generic-variant");
    const strengthOrSize = getValue("edit-po-editor-strength-size");
    const packaging = getValue("edit-po-editor-packaging");

    clearEditValidation();
    let invalid = false;
    if (!productId) {
        showEditFieldError("edit-po-product-select", "edit-po-product-error", "Select a product.");
        invalid = true;
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        showEditFieldError(
            "edit-po-quantity",
            "edit-po-quantity-error",
            "Enter a positive whole number.",
        );
        invalid = true;
    }
    if (!purchaseUnit) {
        showEditFieldError(
            "edit-po-editor-purchase-unit",
            "edit-po-purchase-unit-error",
            "Select a purchase unit.",
        );
        invalid = true;
    }
    if (!Number.isSafeInteger(unitsPerPurchaseUnit) || unitsPerPurchaseUnit <= 0) {
        showEditFieldError(
            "edit-po-editor-contains",
            "edit-po-contains-error",
            "Enter a positive whole number.",
        );
        invalid = true;
    }
    if (!Number.isFinite(price) || price < 0) {
        showEditFieldError(
            "edit-po-editor-price",
            "edit-po-price-error",
            "Enter a valid unit cost.",
        );
        invalid = true;
    }
    if (invalid) throw new Error("Check the highlighted item fields.");
    const existingItem = editDraftItemByKey(editingPoItemKey);
    const selectedOption =
        document.getElementById("edit-po-product-select")?.selectedOptions?.[0] || null;
    const optionItem = selectedOption ? draftItemFromOption(selectedOption, quantity) : null;
    const masterItem = optionItem || existingItem || {};

    return {
        po_item_id: existingItem?.po_item_id || null,
        client_item_id: existingItem?.client_item_id || null,
        product_id: productId,
        product_name: masterItem.product_name || getValue("edit-po-editor-product-name"),
        product_display_name: masterItem.product_display_name || "",
        brand_name: masterItem.brand_name || getValue("edit-po-editor-brand-name"),
        brand_display_name: masterItem.brand_display_name || "",
        category_name: masterItem.category_name || categoryName,
        type_name: masterItem.type_name || getValue("edit-po-editor-type-name"),
        generic_name: medicine ? masterItem.generic_name || genericOrVariant : "",
        variant_flavor: medicine ? "" : masterItem.variant_flavor || genericOrVariant,
        strength: medicine ? masterItem.strength || strengthOrSize : "",
        strength_value: medicine ? masterItem.strength_value || strengthOrSize : "",
        strength_unit: masterItem.strength_unit || "",
        net_content_value: masterItem.net_content_value || masterItem.volume_value || "",
        net_content_unit: masterItem.net_content_unit || masterItem.volume_unit || "",
        volume_value: masterItem.volume_value || "",
        volume_unit: masterItem.volume_unit || "",
        size_value: medicine ? "" : masterItem.size_value || strengthOrSize,
        weight_volume_value: medicine ? "" : masterItem.weight_volume_value || strengthOrSize,
        weight_volume_unit: masterItem.weight_volume_unit || "",
        unit: masterItem.unit || getValue("edit-po-editor-unit"),
        packaging: masterItem.packaging || packaging,
        purchase_unit:
            purchaseUnit || existingItem?.purchase_unit || optionItem?.purchase_unit || "pcs",
        units_per_purchase_unit: unitsPerPurchaseUnit,
        purchase_unit_qty: unitsPerPurchaseUnit,
        selling_price: masterItem.selling_price || 0,
        shelf_stock: masterItem.shelf_stock || 0,
        storage_stock: masterItem.storage_stock || 0,
        stock: masterItem.stock || 0,
        reorder_level: masterItem.reorder_level || 10,
        price,
        purchase_qty: quantity,
        inventory_qty_ordered: quantity * unitsPerPurchaseUnit,
        quantity,
    };
}

function addOrUpdateEditDraftItem() {
    if (editItemActionBusy || editMajorFieldsLocked) return;
    const button = document.getElementById("btnEditAddPoItem");
    try {
        editItemActionBusy = true;
        if (button) button.disabled = true;
        const productSelect = document.getElementById("edit-po-product-select");
        const option = productSelect?.options[productSelect.selectedIndex];
        const editor = document.getElementById("edit-po-product-editor");

        if (editor?.classList.contains("d-none")) {
            const fromOption = draftItemFromOption(
                option,
                document.getElementById("edit-po-quantity")?.value || 1,
            );
            if (!fromOption) throw new Error("Select a product first.");
            showEditProductEditor(fromOption);
        }

        const item = ensureEditItemIdentity(readEditProductEditor());
        const duplicate = editDraftItems.find(
            (candidate) =>
                editItemKey(candidate) !== editingPoItemKey &&
                String(candidate.product_id) === String(item.product_id) &&
                normalizePurchaseUnit(candidate.purchase_unit).toLowerCase() ===
                    normalizePurchaseUnit(item.purchase_unit).toLowerCase(),
        );
        if (duplicate) {
            throw new Error(
                "This product is already in the purchase order. Select its row to update the quantity.",
            );
        }

        if (editingPoItemId === null) {
            editDraftItems.push(item);
        } else {
            const existingItem = editDraftItemByKey(editingPoItemKey);
            if (!existingItem)
                throw new Error("The selected purchase-order item is no longer available.");
            Object.assign(existingItem, item);
        }
        item.product_details = createProductDetailSnapshot(item);

        renderDraftItems(editDraftItems, "#table-edit-po-items", "remove-edit-po-item");
        clearEditProductEditor({ focusProduct: true });
        if (activeEditOrder) applyEditLocks(activeEditOrder);
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    } finally {
        editItemActionBusy = false;
        if (button) button.disabled = editMajorFieldsLocked;
    }
}

function renderEditSummary() {
    const summary = document.getElementById("edit-po-summary");
    if (!summary) return;

    const totalItems = editDraftItems.length;
    const totalOrderQty = editDraftItems.reduce(
        (total, item) => total + Number(item.purchase_qty || item.quantity || 0),
        0,
    );
    const totalStock = editDraftItems.reduce(
        (total, item) =>
            total + Number(item.inventory_qty_ordered || inventoryQtyForItem(item) || 0),
        0,
    );
    const estimatedCost = editDraftItems.reduce((total, item) => total + productLineTotal(item), 0);
    summary.innerHTML = [
        detailMetric("Total Items", totalItems),
        detailMetric("Total Order Qty", totalOrderQty),
        detailMetric("Total Stock to Receive", totalStock),
        detailMetric("Estimated Cost", peso(estimatedCost)),
    ].join("");
    const count = document.getElementById("edit-po-item-count");
    if (count) {
        count.textContent = String(totalItems);
        count.setAttribute(
            "aria-label",
            `${totalItems} purchase-order item${totalItems === 1 ? "" : "s"}`,
        );
    }
    const saveButton = document.getElementById("btnUpdatePo");
    if (saveButton && saveButton.dataset.saving !== "true") {
        saveButton.disabled =
            totalItems === 0 || Boolean(activeEditOrder && isOperationallyLocked(activeEditOrder));
        if (totalItems === 0) saveButton.title = "Add at least one item before saving.";
    }
}

function showModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    if (window.bootstrap?.Modal) {
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
        return;
    }

    modal.classList.add("show");
    modal.style.display = "block";
    modal.removeAttribute("aria-hidden");
    modal.setAttribute("aria-modal", "true");
    document.body.classList.add("modal-open");
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    if (window.bootstrap?.Modal) {
        window.bootstrap.Modal.getInstance(modal)?.hide();
        return;
    }

    modal.classList.remove("show");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    modal.removeAttribute("aria-modal");
    document.body.classList.remove("modal-open");
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function constrainPoModalRect(rect, gap = 12) {
    return window.DrpModalWorkspace.constrain(rect, gap);
}

function centerPoModalRect(rect, gap = 12) {
    return window.DrpModalWorkspace.center(rect, gap);
}

function poModalParts(modalId) {
    const modal = document.getElementById(modalId);
    const dialog = modal?.querySelector(".modal-dialog") || null;
    const content = modal?.querySelector(".modal-content") || null;
    return { modal, dialog, content };
}

function setPoFloatingModalRect(config, nextRect = {}) {
    const { modal, dialog } = poModalParts(config.modalId);
    if (!modal || !dialog) return;

    const current = dialog.getBoundingClientRect();
    const workspace = window.DrpModalWorkspace.bounds();
    const minWidth = Math.min(config.minWidth || 720, workspace.width);
    const minHeight = Math.min(config.minHeight || 520, workspace.height);
    const maxWidth = Math.max(minWidth, workspace.width);
    const maxHeight = Math.max(minHeight, workspace.height);
    const width = clampNumber(nextRect.width ?? current.width, minWidth, maxWidth);
    const height = clampNumber(nextRect.height ?? current.height, minHeight, maxHeight);
    const constrained = constrainPoModalRect({
        left: nextRect.left ?? current.left,
        top: nextRect.top ?? current.top,
        width,
        height,
    });
    const { left, top } = constrained;

    modal.classList.add("po-modal-positioned");
    modal.style.setProperty(`--${config.varPrefix}-left`, `${left}px`);
    modal.style.setProperty(`--${config.varPrefix}-top`, `${top}px`);
    modal.style.setProperty(`--${config.varPrefix}-width`, `${width}px`);
    modal.style.setProperty(`--${config.varPrefix}-height`, `${height}px`);
    config.onRectChange?.();
}

function centerPoFloatingModal(config) {
    const { modal, dialog } = poModalParts(config.modalId);
    if (!modal || !dialog) return;

    const rect = dialog.getBoundingClientRect();
    const minWidth = config.minWidth || 720;
    const minHeight = config.minHeight || 520;
    const workspace = window.DrpModalWorkspace.bounds();
    const width = Math.min(Math.max(rect.width, minWidth), workspace.width);
    const height = Math.min(Math.max(rect.height, minHeight), workspace.height);
    setPoFloatingModalRect(config, centerPoModalRect({ width, height }));
}

function initPoFloatingModalControls(config) {
    const { modal, dialog, content } = poModalParts(config.modalId);
    if (!modal || !dialog || !content || modal.dataset.floatingControlsReady === "true") return;
    modal.dataset.floatingControlsReady = "true";
    modal.dataset.drpManagedSize = "true";

    const header = modal.querySelector(".modal-header");
    const corner = document.getElementById(config.cornerId);

    modal.addEventListener("shown.bs.modal", () => {
        if (!modal.classList.contains("po-modal-positioned")) {
            centerPoFloatingModal(config);
        } else {
            setPoFloatingModalRect(config);
        }
    });
    modal.addEventListener("hidden.bs.modal", () => modal.classList.remove("po-modal-positioned"));

    header?.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button, a, input, select, textarea"))
            return;
        event.preventDefault();
        header.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setPoFloatingModalRect(config, {
                left: start.left + moveEvent.clientX - startX,
                top: start.top + moveEvent.clientY - startY,
                width: start.width,
                height: start.height,
            });
        };
        const stop = () => {
            header.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
    });

    corner?.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        corner.classList.add("is-dragging");
        corner.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setPoFloatingModalRect(config, {
                left: start.left,
                top: start.top,
                width: start.width + moveEvent.clientX - startX,
                height: start.height + moveEvent.clientY - startY,
            });
        };
        const stop = () => {
            corner.classList.remove("is-dragging");
            corner.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
    });

    window.addEventListener("resize", () => {
        if (modal.classList.contains("show")) setPoFloatingModalRect(config);
    });
}

function createPoModalParts() {
    const modal = document.getElementById("createPurchaseOrderModal");
    const dialog = modal?.querySelector(".modal-dialog") || null;
    const content = modal?.querySelector(".modal-content") || null;
    return { modal, dialog, content };
}

function setCreatePoModalRect(nextRect = {}, options = {}) {
    const { modal, dialog } = createPoModalParts();
    if (!modal || !dialog) return;

    const current = dialog.getBoundingClientRect();
    const preferredWidth = Number.parseFloat(modal.dataset.poPreferredWidth || "");
    const preferredHeight = Number.parseFloat(modal.dataset.poPreferredHeight || "");
    const workspace = window.DrpModalWorkspace.bounds();
    const minWidth = Math.min(900, workspace.width);
    const minHeight = Math.min(540, workspace.height);
    const maxWidth = Math.max(minWidth, workspace.width);
    const maxHeight = Math.max(minHeight, workspace.height);
    const width = clampNumber(
        nextRect.width ?? (Number.isFinite(preferredWidth) ? preferredWidth : current.width),
        minWidth,
        maxWidth,
    );
    const height = clampNumber(
        nextRect.height ?? (Number.isFinite(preferredHeight) ? preferredHeight : current.height),
        minHeight,
        maxHeight,
    );
    const constrained = constrainPoModalRect({
        left: nextRect.left ?? current.left,
        top: nextRect.top ?? current.top,
        width,
        height,
    });
    const { left, top } = constrained;

    if (!Number.isFinite(preferredWidth) || options.rememberUserSize) {
        modal.dataset.poPreferredWidth = String(width);
    }
    if (!Number.isFinite(preferredHeight) || options.rememberUserSize) {
        modal.dataset.poPreferredHeight = String(height);
    }
    modal.classList.add("po-modal-positioned");
    modal.style.setProperty("--po-modal-left", `${left}px`);
    modal.style.setProperty("--po-modal-top", `${top}px`);
    modal.style.setProperty("--po-modal-width", `${width}px`);
    modal.style.setProperty("--po-modal-height", `${height}px`);
    applyCreatePoFormExpansion();
}

function centerCreatePoModal() {
    const { modal, dialog } = createPoModalParts();
    if (!modal || !dialog) return;

    const rect = dialog.getBoundingClientRect();
    const workspace = window.DrpModalWorkspace.bounds();
    const width = Math.min(Math.max(rect.width, Math.min(900, workspace.width)), workspace.width);
    const height = Math.min(
        Math.max(rect.height, Math.min(540, workspace.height)),
        workspace.height,
    );
    setCreatePoModalRect(centerPoModalRect({ width, height }));
}

function createPoFormHeights() {
    const modal = document.getElementById("createPurchaseOrderModal");
    const body = modal?.querySelector(".modal-body");
    const form = modal?.querySelector(".po-create-form");
    const primary = modal?.querySelector(".po-form-primary-row");
    const item = modal?.querySelector(".po-form-item-row");
    const divider = document.getElementById("po-create-resize-divider");
    if (!modal || !body || !form || !primary || !item || !divider) return null;

    const previousHeight = primary.style.height;
    primary.style.height = "auto";
    const expandedPrimary = Math.ceil(primary.scrollHeight);
    primary.style.height = previousHeight;

    const itemHeight = Math.ceil(item.getBoundingClientRect().height);
    const collapsed = 0;
    return {
        modal,
        body,
        form,
        primary,
        item,
        divider,
        itemHeight,
        collapsed,
        expanded: Math.max(expandedPrimary, collapsed),
    };
}

function applyCreatePoFormExpansion(nextHeight = null, options = {}) {
    const parts = createPoFormHeights();
    if (!parts) return;
    const { modal, body, itemHeight, divider, collapsed, expanded } = parts;
    const userHeight = Number.parseFloat(modal.dataset.poFormUserPrimaryHeight || "");
    const lowerMinHeight = 220;
    const maxHeightForViewport = Math.max(
        collapsed,
        body.clientHeight - itemHeight - divider.offsetHeight - lowerMinHeight - 24,
    );
    const allowedExpanded = clampNumber(
        Math.min(expanded, maxHeightForViewport),
        collapsed,
        expanded,
    );
    const shouldForceCollapsed = allowedExpanded <= collapsed + 2;
    const target = shouldForceCollapsed
        ? collapsed
        : (nextHeight ?? (Number.isFinite(userHeight) ? userHeight : allowedExpanded));
    const height = clampNumber(target, collapsed, allowedExpanded);
    const range = Math.max(1, expanded - collapsed);
    const opacity = clampNumber((height - collapsed) / range, 0, 1);

    modal.dataset.poFormPrimaryHeight = String(height);
    if (options.rememberUserHeight) {
        modal.dataset.poFormUserPrimaryHeight = String(height);
    }
    modal.classList.toggle("po-form-collapsed", height <= collapsed + 2);
    modal.style.setProperty("--po-form-primary-height", `${height}px`);
    modal.style.setProperty("--po-form-primary-opacity", opacity.toFixed(3));
    modal.style.setProperty("--po-form-primary-gap", `${Math.round(10 * opacity)}px`);
    updateCreatePoLowerHeight();
}

function updateCreatePoLowerHeight() {
    const modal = document.getElementById("createPurchaseOrderModal");
    const body = modal?.querySelector(".modal-body");
    const form = modal?.querySelector(".po-create-form");
    const divider = document.getElementById("po-create-resize-divider");
    if (!modal || !body || !form || !divider) return;

    const available = Math.max(
        220,
        body.clientHeight - form.offsetHeight - divider.offsetHeight - 14,
    );
    modal.style.setProperty("--po-create-lower-height", `${available}px`);
}

function initCreatePoModalLayoutControls() {
    const { modal, dialog, content } = createPoModalParts();
    if (!modal || !dialog || !content || modal.dataset.layoutControlsReady === "true") return;
    modal.dataset.layoutControlsReady = "true";
    modal.dataset.drpManagedSize = "true";

    const header = modal.querySelector(".modal-header");
    const divider = document.getElementById("po-create-resize-divider");
    const corner = document.getElementById("po-modal-corner-resize");
    const lower = document.getElementById("po-create-lower");

    modal.addEventListener("shown.bs.modal", () => {
        if (!modal.classList.contains("po-modal-positioned")) {
            centerCreatePoModal();
        } else {
            setCreatePoModalRect();
        }
        applyCreatePoFormExpansion();
    });
    modal.addEventListener("hidden.bs.modal", () => modal.classList.remove("po-modal-positioned"));

    header?.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button, a, input, select, textarea"))
            return;
        event.preventDefault();
        header.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setCreatePoModalRect({
                left: start.left + moveEvent.clientX - startX,
                top: start.top + moveEvent.clientY - startY,
                width: start.width,
                height: start.height,
            });
        };
        const stop = () => {
            header.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
    });

    divider?.addEventListener("pointerdown", (event) => {
        const heights = createPoFormHeights();
        if (event.button !== 0 || !heights) return;
        event.preventDefault();
        divider.classList.add("is-dragging");
        divider.setPointerCapture?.(event.pointerId);
        const startY = event.clientY;
        const startHeight =
            Number.parseFloat(modal.dataset.poFormPrimaryHeight || "") || heights.expanded;

        const move = (moveEvent) =>
            applyCreatePoFormExpansion(startHeight + moveEvent.clientY - startY, {
                rememberUserHeight: true,
            });
        const stop = () => {
            divider.classList.remove("is-dragging");
            divider.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
    });

    corner?.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        corner.classList.add("is-dragging");
        corner.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setCreatePoModalRect(
                {
                    left: start.left,
                    top: start.top,
                    width: start.width + moveEvent.clientX - startX,
                    height: start.height + moveEvent.clientY - startY,
                },
                { rememberUserSize: true },
            );
        };
        const stop = () => {
            corner.classList.remove("is-dragging");
            corner.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
    });

    window.addEventListener("resize", () => {
        if (modal.classList.contains("show")) setCreatePoModalRect();
    });
}

function editPoModalParts() {
    const modal = document.getElementById("editPurchaseOrderModal");
    const dialog = modal?.querySelector(".modal-dialog") || null;
    const content = modal?.querySelector(".modal-content") || null;
    return { modal, dialog, content };
}

function setEditPoModalRect(nextRect = {}) {
    const { modal, dialog } = editPoModalParts();
    if (!modal || !dialog) return;

    const current = dialog.getBoundingClientRect();
    const workspace = window.DrpModalWorkspace.bounds();
    const minWidth = Math.min(720, workspace.width);
    const minHeight = Math.min(540, workspace.height);
    const maxWidth = Math.max(minWidth, workspace.width);
    const maxHeight = Math.max(minHeight, workspace.height);
    const width = clampNumber(nextRect.width ?? current.width, minWidth, maxWidth);
    const height = clampNumber(nextRect.height ?? current.height, minHeight, maxHeight);
    const constrained = constrainPoModalRect({
        left: nextRect.left ?? current.left,
        top: nextRect.top ?? current.top,
        width,
        height,
    });
    const { left, top } = constrained;

    modal.classList.add("po-modal-positioned");
    modal.style.setProperty("--po-edit-modal-left", `${left}px`);
    modal.style.setProperty("--po-edit-modal-top", `${top}px`);
    modal.style.setProperty("--po-edit-modal-width", `${width}px`);
    modal.style.setProperty("--po-edit-modal-height", `${height}px`);
    applyEditPoFormExpansion();
}

function centerEditPoModal() {
    const { modal, dialog } = editPoModalParts();
    if (!modal || !dialog) return;

    const rect = dialog.getBoundingClientRect();
    const workspace = window.DrpModalWorkspace.bounds();
    const width = Math.min(Math.max(rect.width, Math.min(720, workspace.width)), workspace.width);
    const height = Math.min(
        Math.max(rect.height, Math.min(540, workspace.height)),
        workspace.height,
    );
    setEditPoModalRect(centerPoModalRect({ width, height }));
}

function editPoFormHeights() {
    const modal = document.getElementById("editPurchaseOrderModal");
    const body = modal?.querySelector(".modal-body");
    const form = modal?.querySelector(".po-edit-form");
    const primary = modal?.querySelector(".po-edit-primary-row");
    const item = modal?.querySelector(".po-edit-item-row");
    const divider = document.getElementById("edit-po-resize-divider");
    if (!modal || !body || !form || !primary || !item || !divider) return null;

    const previousHeight = primary.style.height;
    primary.style.height = "auto";
    const expandedPrimary = Math.ceil(primary.scrollHeight);
    primary.style.height = previousHeight;

    return {
        modal,
        body,
        form,
        primary,
        itemHeight: Math.ceil(item.getBoundingClientRect().height),
        divider,
        collapsed: 0,
        expanded: Math.max(expandedPrimary, 0),
    };
}

function applyEditPoFormExpansion(nextHeight = null) {
    const parts = editPoFormHeights();
    if (!parts) return;
    const { modal, body, itemHeight, divider, collapsed, expanded } = parts;
    const current = Number.parseFloat(modal.dataset.poEditFormPrimaryHeight || "");
    const lowerMinHeight = 220;
    const maxHeightForViewport = Math.max(
        collapsed,
        body.clientHeight - itemHeight - divider.offsetHeight - lowerMinHeight - 24,
    );
    const allowedExpanded = clampNumber(
        Math.min(expanded, maxHeightForViewport),
        collapsed,
        expanded,
    );
    const shouldForceCollapsed = allowedExpanded <= collapsed + 2;
    const target = shouldForceCollapsed
        ? collapsed
        : (nextHeight ?? (Number.isFinite(current) ? current : allowedExpanded));
    const height = clampNumber(target, collapsed, allowedExpanded);
    const range = Math.max(1, expanded - collapsed);
    const opacity = clampNumber((height - collapsed) / range, 0, 1);

    modal.dataset.poEditFormPrimaryHeight = String(height);
    modal.classList.toggle("po-form-collapsed", height <= collapsed + 2);
    modal.style.setProperty("--po-edit-form-primary-height", `${height}px`);
    modal.style.setProperty("--po-edit-form-primary-opacity", opacity.toFixed(3));
    modal.style.setProperty("--po-edit-form-primary-gap", `${Math.round(10 * opacity)}px`);
    updateEditPoLowerHeight();
}

function updateEditPoLowerHeight() {
    const modal = document.getElementById("editPurchaseOrderModal");
    const body = modal?.querySelector(".modal-body");
    const form = modal?.querySelector(".po-edit-form");
    const divider = document.getElementById("edit-po-resize-divider");
    if (!modal || !body || !form || !divider) return;

    const available = Math.max(
        220,
        body.clientHeight - form.offsetHeight - divider.offsetHeight - 14,
    );
    modal.style.setProperty("--po-edit-lower-height", `${available}px`);
}

function initEditPoModalLayoutControls() {
    const { modal, dialog, content } = editPoModalParts();
    if (!modal || !dialog || !content || modal.dataset.layoutControlsReady === "true") return;
    modal.dataset.layoutControlsReady = "true";
    modal.dataset.drpManagedSize = "true";

    const header = modal.querySelector(".modal-header");
    const divider = document.getElementById("edit-po-resize-divider");
    const corner = document.getElementById("edit-po-modal-corner-resize");

    modal.addEventListener("shown.bs.modal", () => {
        if (!modal.classList.contains("po-modal-positioned")) {
            centerEditPoModal();
        } else {
            setEditPoModalRect();
        }
        applyEditPoFormExpansion();
    });
    modal.addEventListener("hidden.bs.modal", () => modal.classList.remove("po-modal-positioned"));

    header?.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button, a, input, select, textarea"))
            return;
        event.preventDefault();
        header.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setEditPoModalRect({
                left: start.left + moveEvent.clientX - startX,
                top: start.top + moveEvent.clientY - startY,
                width: start.width,
                height: start.height,
            });
        };
        const stop = () => {
            header.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
    });

    divider?.addEventListener("pointerdown", (event) => {
        const heights = editPoFormHeights();
        if (event.button !== 0 || !heights) return;
        event.preventDefault();
        divider.classList.add("is-dragging");
        divider.setPointerCapture?.(event.pointerId);
        const startY = event.clientY;
        const startHeight =
            Number.parseFloat(modal.dataset.poEditFormPrimaryHeight || "") || heights.expanded;

        const move = (moveEvent) =>
            applyEditPoFormExpansion(startHeight + moveEvent.clientY - startY);
        const stop = () => {
            divider.classList.remove("is-dragging");
            divider.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
    });

    corner?.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        corner.classList.add("is-dragging");
        corner.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const start = dialog.getBoundingClientRect();

        const move = (moveEvent) => {
            setEditPoModalRect({
                left: start.left,
                top: start.top,
                width: start.width + moveEvent.clientX - startX,
                height: start.height + moveEvent.clientY - startY,
            });
        };
        const stop = () => {
            corner.classList.remove("is-dragging");
            corner.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
    });

    window.addEventListener("resize", () => {
        if (modal.classList.contains("show")) setEditPoModalRect();
    });
}

function initViewPoModalLayoutControls() {
    initPoFloatingModalControls({
        modalId: "viewPurchaseOrderModal",
        cornerId: "view-po-modal-corner-resize",
        varPrefix: "po-view-modal",
        minWidth: 720,
        minHeight: 520,
    });
}

function renderSupplierOptions(select, selectedId = "") {
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>Select Supplier...</option>';
    supplierCache.forEach((supplier) => {
        const option = document.createElement("option");
        option.value = supplier.supplier_id;
        option.textContent = supplier.supplier_name;
        if (String(supplier.supplier_id) === String(selectedId)) option.selected = true;
        select.appendChild(option);
    });
}

async function loadPOSuppliers() {
    try {
        const data = await fetchJson(`${API_BASE_URL}/suppliers/get_suppliers.php`);
        supplierCache = data.suppliers || [];
        renderSupplierOptions(document.getElementById("po-supplier-select"));
        renderSupplierOptions(document.getElementById("edit-po-supplier-select"));
    } catch (err) {
        const supplierSelect = document.getElementById("po-supplier-select");
        if (supplierSelect)
            supplierSelect.innerHTML = '<option value="" disabled selected>Unable to load</option>';
        PharmaUtils.toast.error(err.message);
    }
}

async function loadSupplierProducts(supplierId, productSelectId = "po-product-select") {
    const productSelect = document.getElementById(productSelectId);
    if (!productSelect) return;

    productSelect.disabled = true;
    productSelect.innerHTML = '<option value="" disabled selected>Loading products...</option>';

    try {
        const data = await fetchJson(
            `${API_BASE_URL}/suppliers/get_supplier_products.php?supplier_id=${encodeURIComponent(supplierId)}`,
        );
        const products = data.products || [];
        productSelect.innerHTML = '<option value="" disabled selected>Select product...</option>';

        products.forEach((product) => {
            const option = document.createElement("option");
            const unitDisplay = unitDisplayFromDetails(product);
            const sizeDisplay = sizeDisplayFromDetails(product);
            const optionLabel = productDropdownLabel(product);
            const optionDetail = productOptionDetail(product);
            const purchaseUnit = purchaseUnitInfo(product);
            const optionParts = [optionLabel];
            option.value = product.product_id;
            option.textContent = optionParts.join(" \u2022 ");
            option.title = [optionLabel, optionDetail].filter(Boolean).join("\n");
            option.dataset.productName = cleanText(product.product_name);
            option.dataset.supplierProductId = cleanText(product.supplier_product_id);
            option.dataset.supplierId = cleanText(supplierId);
            option.dataset.productDisplayName = productCoreName(product);
            option.dataset.brand = cleanText(product.brand_name);
            option.dataset.brandDisplayName = poBrandName(product);
            option.dataset.unit = unitDisplay;
            option.dataset.price = product.price || "0";
            option.dataset.supplierPriceBasis = product.supplier_price_basis || "base_unit";
            option.dataset.sellingPrice = product.selling_price || product.price || "0";
            option.dataset.categoryName = cleanText(product.category_name);
            option.dataset.typeName = cleanText(product.type_name);
            option.dataset.genericName = cleanText(product.generic_name);
            option.dataset.dosageForm = cleanText(product.dosage_form);
            option.dataset.packageType = displayText(product.package_type);
            option.dataset.strength = cleanText(
                product.strength_size_display ||
                    product.strength_size_value ||
                    product.strength_value,
            );
            option.dataset.strengthValue = cleanText(product.strength_value);
            option.dataset.strengthUnit = cleanText(product.strength_unit);
            option.dataset.netContentValue = cleanText(
                product.net_content_value || product.volume_value,
            );
            option.dataset.netContentUnit = cleanText(
                product.net_content_unit || product.volume_unit,
            );
            option.dataset.volumeValue = cleanText(product.volume_value);
            option.dataset.volumeUnit = cleanText(product.volume_unit);
            option.dataset.variantFlavor = cleanText(product.variant_flavor);
            option.dataset.sizeValue = cleanText(product.size_value);
            option.dataset.weightVolumeValue = cleanText(product.weight_volume_value);
            option.dataset.weightVolumeUnit = cleanText(product.weight_volume_unit);
            option.dataset.sizeDisplay = sizeDisplay;
            option.dataset.packaging = cleanText(product.package_type || product.packaging);
            option.dataset.stock = String(Number(product.stock || 0));
            option.dataset.shelfStock = String(Number(product.shelf_stock || 0));
            option.dataset.storageStock = String(Number(product.storage_stock || 0));
            option.dataset.reorderLevel = String(
                Number(product.reorder_level || product.reorder_qty || 10),
            );
            option.dataset.packContent = cleanText(product.pack_content);
            option.dataset.purchaseUnit = purchaseUnit.purchaseUnit;
            option.dataset.purchaseUnitConversion = purchaseUnit.conversion;
            option.dataset.purchaseUnitQty = String(purchaseUnit.quantity);
            option.dataset.unitsPerPurchaseUnit = String(purchaseUnit.quantity);
            option.dataset.optionDetail = optionDetail;
            productSelect.appendChild(option);
        });

        productSelect.disabled = products.length === 0;
        if (productSelectId === "po-product-select") syncPurchaseUnitFieldsFromSelectedProduct();
        return products;
    } catch (err) {
        productSelect.innerHTML =
            '<option value="" disabled selected>Unable to load products</option>';
        PharmaUtils.toast.error(err.message);
        return [];
    }
}

async function prefillApprovedPurchaseRequest() {
    const prId = new URLSearchParams(window.location.search).get("pr_id");
    if (!prId) return;

    try {
        const data = await fetchJson(`${API_BASE_URL}/purchase_requests/get_purchase_requests.php`);
        const request = (data.requests || data.data?.requests || []).find(
            (entry) => String(entry.pr_id) === String(prId),
        );
        const remainingItems = (request?.items || []).filter(
            (item) => Number(item.remaining_qty || 0) > 0,
        );
        if (!request || request.status !== "Approved" || !remainingItems.length) {
            throw new Error("This purchase request is not available for PO conversion.");
        }

        let matchedSupplier = null;
        let matchedProductIds = new Set();
        for (const supplier of supplierCache) {
            const products = await loadSupplierProducts(supplier.supplier_id, "po-product-select");
            const productIds = new Set(products.map((product) => String(product.product_id)));
            const coveredIds = new Set(
                remainingItems
                    .map((item) => String(item.product_id))
                    .filter((productId) => productIds.has(productId)),
            );
            if (coveredIds.size > matchedProductIds.size) {
                matchedSupplier = supplier;
                matchedProductIds = coveredIds;
            }
        }
        if (!matchedSupplier) {
            throw new Error(
                "No active supplier is assigned to the remaining products in this approved request.",
            );
        }

        const supplierSelect = document.getElementById("po-supplier-select");
        supplierSelect.value = matchedSupplier.supplier_id;
        await loadSupplierProducts(matchedSupplier.supplier_id, "po-product-select");
        const productSelect = document.getElementById("po-product-select");
        createDraftItems.length = 0;
        for (const requestItem of remainingItems.filter((item) =>
            matchedProductIds.has(String(item.product_id)),
        )) {
            const option = [...productSelect.options].find(
                (entry) => String(entry.value) === String(requestItem.product_id),
            );
            const units = Math.max(1, Number(option?.dataset.unitsPerPurchaseUnit || 1));
            const requestedQty = Number(requestItem.remaining_qty || 0);
            if (!option || requestedQty <= 0 || requestedQty % units !== 0) {
                throw new Error(
                    `${requestItem.product_name || "A requested product"} cannot be ordered in exactly ${requestedQty} base units with its supplier packaging.`,
                );
            }
            createDraftItems.push(draftItemFromOption(option, requestedQty / units));
        }

        renderDraftItems(createDraftItems, "#table-po-items", "remove-po-item");
        renderSelectedProductPanel();
        updateCreateSummary();
        const badge = document.getElementById("po-conversion-source");
        if (badge) {
            badge.classList.remove("d-none");
            const remainingSupplierCount = remainingItems.length - createDraftItems.length;
            badge.querySelector("strong").textContent =
                `${request.pr_number} · ${request.requested_by_name}${remainingSupplierCount > 0 ? ` · ${remainingSupplierCount} item(s) remain for another PO` : ""}`;
        }
        showModal("createPurchaseOrderModal");
    } catch (error) {
        PharmaUtils.modal.error("Cannot convert purchase request", error.message);
    }
}

function renderStatusSummary(counts = {}) {
    const container = document.getElementById("po-status-summary");
    if (!container) return;

    const lifecycleCards = Object.entries(STATUS_META)
        .map(
            ([status, color]) => `
        <div class="status-card${status === "Arrived" ? " status-card-link" : ""}" style="--status-color:${color}" ${status === "Arrived" ? 'role="link" tabindex="0" data-route="inspect-deliveries" aria-label="Open Inspect Deliveries"' : ""}>
            <strong>${Number(counts[status] || 0)}</strong>
            <p>${escapeHtml(STATUS_LABELS[status] || status)}</p>
        </div>
    `,
        )
        .join("");
    const nextHtml = lifecycleCards;

    if (nextHtml === lastStatusSummaryHtml) return;

    lastStatusSummaryHtml = nextHtml;
    container.innerHTML = nextHtml;
}

function renderTableHead(view = currentPoView) {
    const head = document.getElementById("purchase-orders-head");
    if (!head) return;
    const table = document.getElementById("table-purchase-orders");
    if (table) {
        table.dataset.poView = view;
        table.dataset.poSupervisorView = String(isSupervisorPoViewer());
        table.closest(".po-table-scroll")?.classList.toggle("po-active-fit", view === "active");
        table.closest(".po-table-scroll")?.classList.toggle("po-supervisor-view", isSupervisorPoViewer());
        const minWidth =
            view === "delivered"
                ? "1810px"
                : view === "arrived"
                  ? "1740px"
                  : view === "archived"
                    ? "1880px"
                    : "0px";
        table.style.setProperty("min-width", minWidth, "important");

        const activeColumnWidths = [
            ["col-po-number", "12%"],
            ["col-pr-number", "12%"],
            ["col-supplier", "11%"],
            ["col-items-summary", "20%"],
            ["col-order-qty", "10%"],
            ["col-delivery", "9%"],
            ["col-money", "8%"],
            ["col-status", "8%"],
            ...(!isSupervisorPoViewer() ? [["col-actions", "10%"]] : []),
        ];
        const columnLayouts = {
            active: activeColumnWidths.map(([columnClass]) => columnClass),
            arrived: [
                "col-date",
                "col-po-number",
                "col-supplier",
                "col-brand",
                "col-items",
                "col-specification",
                "col-qty",
                "col-money",
                "col-terms",
                "col-delivery",
                "col-status",
                ...(!isSupervisorPoViewer() ? ["col-actions"] : []),
            ],
            delivered: [
                "col-po-number",
                "col-supplier",
                "col-specification",
                "col-received",
                "col-received",
                "col-received",
                "col-inventory-qty",
                "col-money",
                "col-money",
                "col-money",
                "col-money",
                "col-payment-status",
                "col-date",
                ...(!isSupervisorPoViewer() ? ["col-actions"] : []),
            ],
            archived: [
                "col-po-number",
                "col-supplier",
                "col-brand",
                "col-items",
                "col-specification",
                "col-qty",
                "col-money",
                "col-date",
                "col-supplier",
                "col-reason",
                "col-status",
                ...(!isSupervisorPoViewer() ? ["col-actions"] : []),
            ],
        };
        const colgroup = document.getElementById("purchase-orders-colgroup");
        if (colgroup) {
            colgroup.innerHTML =
                view === "active"
                    ? activeColumnWidths
                          .map(
                              ([columnClass, width]) =>
                                  `<col class="${columnClass}" style="width:${width}">`,
                          )
                          .join("")
                    : (columnLayouts[view] || columnLayouts.active)
                          .map((columnClass) => `<col class="${columnClass}">`)
                          .join("");
        }
    }

    if (view === "arrived") {
        const nextHead = `
            <tr>
                <th class="col-date">Order Date</th>
                <th class="col-po-number">PO Number</th>
                <th class="col-supplier">Supplier</th>
                <th class="col-brand">Brand</th>
                <th class="col-items">Product</th>
                <th class="col-specification">Specification</th>
                <th class="col-qty">Order Qty</th>
                <th class="col-money">PO Total</th>
                <th class="col-terms">Payment Mode</th>
                <th class="col-delivery">ETA</th>
                <th class="col-status">Status</th>
                ${isSupervisorPoViewer() ? "" : '<th class="col-actions">Actions</th>'}
            </tr>
        `;
        if (currentRenderedTableHead !== nextHead) {
            head.innerHTML = nextHead;
            currentRenderedTableHead = nextHead;
        }
        return;
    }

    if (view === "delivered") {
        const nextHead = `
            <tr>
                <th class="col-po-number">PO Number</th>
                <th class="col-supplier">Supplier</th>
                <th class="col-specification">Product / Specification</th>
                <th class="col-received">Received Qty</th>
                <th class="col-received">Returned Qty</th>
                <th class="col-received">Damaged Qty</th>
                <th class="col-inventory-qty">Inventory Added</th>
                <th class="col-money">PO Total</th>
                <th class="col-money">Adjusted Payable</th>
                <th class="col-money">Amount Paid</th>
                <th class="col-money">Balance</th>
                <th class="col-payment-status">Payment Status</th>
                <th class="col-date">Received Date</th>
                ${isSupervisorPoViewer() ? "" : '<th class="col-actions">Actions</th>'}
            </tr>
        `;
        if (currentRenderedTableHead !== nextHead) {
            head.innerHTML = nextHead;
            currentRenderedTableHead = nextHead;
        }
        return;
    }

    if (view === "archived") {
        const nextHead = `
            <tr>
                <th class="col-po-number">PO Number</th>
                <th class="col-supplier">Supplier</th>
                <th class="col-brand">Brand</th>
                <th class="col-items">Product</th>
                <th class="col-specification">Specification</th>
                <th class="col-qty">Order Qty</th>
                <th class="col-money">PO Total</th>
                <th class="col-date">Cancelled Date</th>
                <th class="col-supplier">Cancelled By</th>
                <th class="col-reason">Cancel Reason</th>
                <th class="col-status">Status</th>
                ${isSupervisorPoViewer() ? "" : '<th class="col-actions">Actions</th>'}
            </tr>
        `;
        if (currentRenderedTableHead !== nextHead) {
            head.innerHTML = nextHead;
            currentRenderedTableHead = nextHead;
        }
        return;
    }

    const nextHead = `
        <tr>
            <th class="col-po-number">PO Number</th>
            <th class="col-pr-number">PR Reference</th>
            <th class="col-supplier">Supplier</th>
            <th class="col-items-summary">Items</th>
            <th class="col-order-qty">Order Qty</th>
            <th class="col-delivery">ETA</th>
            <th class="col-money">Total</th>
            <th class="col-status">Status</th>
            ${isSupervisorPoViewer() ? "" : '<th class="col-actions">Actions</th>'}
        </tr>
    `;
    if (currentRenderedTableHead !== nextHead) {
        head.innerHTML = nextHead;
        currentRenderedTableHead = nextHead;
    }
}

function tableEmpty(colspan, message) {
    return `<tr><td colspan="${colspan}" class="po-empty">${escapeHtml(message)}</td></tr>`;
}

function commitPurchaseOrderTable(view, bodyHtml) {
    const tableBody = document.querySelector("#table-purchase-orders tbody");
    if (!tableBody) return;

    closeStatusActionMenu();
    tableBody.classList.add("po-table-body-updating");
    renderTableHead(view);
    tableBody.innerHTML = bodyHtml;
    window.setTimeout(() => {
        tableBody.classList.remove("po-table-body-updating");
        window.dispatchEvent(new CustomEvent("drp:tables-updated"));
    }, 120);
}

function renderActivePurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable("active", tableEmpty(isSupervisorPoViewer() ? 8 : 9, "No visible purchase orders found."));
        return;
    }

    const bodyHtml = orders.map(activePurchaseOrderRow).join("");

    commitPurchaseOrderTable("active", bodyHtml);
}

function activePurchaseOrderRow(order) {
    const items = order.items || [];
    const itemNames = order.item_names || [];
    return `
        <tr class="po-clickable-row" data-po-id="${escapeHtml(order.po_id)}" tabindex="0" aria-label="Open purchase order ${escapeHtml(order.po_number || `PO-${order.po_id}`)}">
            <td class="po-number-cell"><strong class="po-number-text">${escapeHtml(order.po_number || `PO-${order.po_id}`)}</strong></td>
            <td class="po-reference-cell"><strong>${escapeHtml(order.pr_number || "—")}</strong></td>
            <td class="po-supplier-cell">${escapeHtml(order.supplier_name)}</td>
            <td class="po-items-summary-cell">${purchaseOrderItemsSummary(items, itemNames)}</td>
            <td class="po-order-qty-cell">${purchaseOrderQuantitySummary(items)}</td>
            <td class="po-delivery-cell">${purchaseOrderEtaDisplay(order.expected_delivery_date, order.status)}</td>
            <td class="po-price-cell">${purchaseOrderTotalDisplay(order)}</td>
            <td class="po-status-cell">${purchaseOrderStatusStack(order)}</td>
            ${isSupervisorPoViewer() ? "" : `<td class="po-actions-cell">
                <div class="po-actions">
                    ${activePurchaseOrderPrimaryAction(order)}
                    ${activeMoreActionsButton(order)}
                </div>
            </td>`}
        </tr>
    `;
}

async function refreshPurchaseOrderRow(poId) {
    const currentRow = document
        .querySelector(`.record-invoice-btn[data-po-id="${CSS.escape(String(poId))}"]`)
        ?.closest("tr");
    if (!currentRow) return;
    const order = await getPurchaseOrder(poId, { force: true });
    currentRow.outerHTML = activePurchaseOrderRow(order);
    window.dispatchEvent(new CustomEvent("drp:tables-updated"));
}

function renderArrivedPurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable(
            "arrived",
            tableEmpty(isSupervisorPoViewer() ? 11 : 12, "No arrived purchase orders ready for receiving."),
        );
        return;
    }

    const bodyHtml = orders
        .map((order) => {
            const items = order.items || [];
            const itemNames = order.item_names || [];
            const quantities = order.quantities || (order.items || []).map((item) => item.quantity);

            return `
            <tr>
                <td>${formatDate(order.order_date)}</td>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || "N/A")}</td>
                <td class="po-brand-cell">${brandTableCellList(items)}</td>
                <td class="po-product-cell">${productTableCellList(items, itemNames)}</td>
                <td class="po-spec-cell">${specificationTableCellList(items)}</td>
                <td class="po-qty-cell">${numberedList(quantities, { plain: true })}</td>
                <td class="po-price-cell"><span class="po-money">${peso(order.total_amount)}</span></td>
                <td>${escapeHtml(order.payment_terms || "Not set")}</td>
                <td class="po-delivery-cell">${formatDate(order.expected_delivery_date)}</td>
                <td class="po-status-cell">${statusBadge(order.status || "Arrived")}${order.inspection_in_progress ? '<span class="badge bg-info text-dark d-block mt-1">Inspection in Progress</span>' : ""}</td>
                ${isSupervisorPoViewer() ? "" : `<td class="po-actions-cell">
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number || "")}" title="View PO"><i class="fa-regular fa-eye"></i></button>
                        ${invoiceActionButton(order)}
                        ${paymentActionButton(order)}
                        ${statusActionButton(order)}
                    </div>
                </td>`}
            </tr>
        `;
        })
        .join("");

    commitPurchaseOrderTable("arrived", bodyHtml);
}

function renderDeliveredPurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable(
            "delivered",
            tableEmpty(isSupervisorPoViewer() ? 13 : 14, "No delivered purchase orders found."),
        );
        return;
    }

    const bodyHtml = orders
        .map((order) => {
            const items = order.items || [];
            const itemDescriptions = items.length
                ? items.map((item) =>
                      [
                          productTableBrand(item),
                          productTableProductName(item),
                          productSpecification(item),
                      ]
                          .filter(Boolean)
                          .join(" · "),
                  )
                : order.item_names || [];
            const receivedQuantities = items.map((item) => Number(item.received_quantity || 0));
            const returnedQuantities = items.map((item) => Number(item.returned_quantity || 0));
            const damagedQuantities = items.map((item) => Number(item.damaged_quantity || 0));
            const inventoryAdded = items.map((item) => {
                const addedQty = Math.max(
                    0,
                    Number(
                        item.inventory_added ??
                            Number(item.received_quantity || 0) -
                                Number(item.damaged_quantity || 0),
                    ),
                );
                return quantityWithInventoryUnit(item, addedQty);
            });
            const deliveryDate =
                order.delivery_date ||
                order.received_date ||
                order.expected_delivery_date ||
                order.order_date;

            return `
            <tr>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || "N/A")}</td>
                <td class="po-spec-cell" title="${escapeHtml(itemDescriptions.join(" | "))}">${numberedList(itemDescriptions)}</td>
                <td class="po-qty-cell">${numberedList(receivedQuantities, { plain: true })}</td>
                <td class="po-qty-cell">${numberedList(returnedQuantities, { plain: true })}</td>
                <td class="po-qty-cell">${numberedList(damagedQuantities, { plain: true })}</td>
                <td class="po-qty-cell">${numberedList(inventoryAdded, { plain: true })}</td>
                <td class="po-price-cell"><span class="po-money">${peso(order.total_amount)}</span></td>
                <td class="po-price-cell"><span class="po-money">${peso(order.final_payment)}</span></td>
                <td class="po-price-cell"><span class="po-money">${peso(order.total_paid || 0)}</span></td>
                <td class="po-price-cell"><span class="po-money">${peso(order.remaining_balance ?? order.final_payment)}</span></td>
                <td>${paymentStatusBadge(order.payment_status || "Unpaid")}</td>
                <td>${formatDate(deliveryDate)}</td>
                ${isSupervisorPoViewer() ? "" : `<td class="po-actions-cell">
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number || "")}" title="View PO"><i class="fa-regular fa-eye"></i></button>
                        ${invoiceActionButton(order)}
                        ${paymentActionButton(order)}
                    </div>
                </td>`}
            </tr>
        `;
        })
        .join("");

    commitPurchaseOrderTable("delivered", bodyHtml);
}

async function loadPurchaseOrders(options = {}) {
    const { updateSummary = false } = options;
    let loadToken = 0;
    let viewAtRequest = currentPoView;

    try {
        if (window.__drpSessionReadyPromise) await window.__drpSessionReadyPromise;
        loadToken = ++purchaseOrdersLoadToken;
        viewAtRequest = currentPoView;
        const statusFilter = document.getElementById("po-status-filter")?.value || "";
        const paymentStatusFilter =
            document.getElementById("po-payment-status-filter")?.value || "";
        const query = new URLSearchParams();
        if (statusFilter) query.set("status", statusFilter);
        if (paymentStatusFilter) query.set("payment_status", paymentStatusFilter);
        const queryString = query.toString();
        const data = await fetchJson(
            `${API_BASE_URL}/purchase_orders/get_purchase_orders.php${queryString ? `?${queryString}` : ""}`,
        );

        if (loadToken !== purchaseOrdersLoadToken || viewAtRequest !== currentPoView) return;

        let orders = data.purchase_orders || [];
        if (updateSummary) renderStatusSummary(data.status_counts || {});
        renderActivePurchaseOrders(orders);
    } catch (err) {
        if (loadToken !== purchaseOrdersLoadToken || viewAtRequest !== currentPoView) return;

        if (updateSummary) renderStatusSummary({});
        renderActivePurchaseOrders([]);
        PharmaUtils.toast.error(err.message);
    }
}

function setPurchaseOrderView(view, options = {}) {
    const nextView = ["active", "arrived", "delivered", "archived"].includes(view)
        ? view
        : "active";
    const shouldUpdateUrl = options.updateUrl !== false;
    if (shouldUpdateUrl) {
        history.replaceState(null, "", `purchase_orders.html?tab=${nextView}`);
    }
    if (currentPoView === nextView) {
        document.querySelectorAll(".po-view-btn").forEach((button) => {
            button.classList.toggle("active", button.dataset.poView === nextView);
        });
        return;
    }

    currentPoView = nextView;
    document.querySelectorAll(".po-view-btn").forEach((button) => {
        button.classList.toggle("active", button.dataset.poView === nextView);
    });

    const filter = document.getElementById("po-status-filter");
    const paymentFilter = document.getElementById("po-payment-status-filter");
    [filter, paymentFilter].forEach((control) => {
        if (!control) return;
        control.disabled = nextView !== "active";
        if (nextView !== "active") control.value = "";
    });

    loadPurchaseOrders({ updateSummary: Boolean(options.updateSummary) });
}

function purchaseOrderViewFromUrl() {
    return "active";
}

function renderDraftItems(items, tableSelector, removeClass) {
    const tableBody = document.querySelector(`${tableSelector} tbody`);
    if (!tableBody) {
        if (tableSelector === "#table-po-items") updateCreateSummary();
        return;
    }

    if (items.length === 0) {
        const emptyColspan = tableSelector === "#table-edit-po-items" ? 9 : 10;
        tableBody.innerHTML = `<tr><td colspan="${emptyColspan}" class="text-center text-muted py-4">No items added yet.</td></tr>`;
        if (tableSelector === "#table-po-items") updateCreateSummary();
        if (tableSelector === "#table-edit-po-items") renderEditSummary();
        return;
    }

    const isEditTable = tableSelector === "#table-edit-po-items";
    if (isEditTable) {
        tableBody.innerHTML = items
            .map((item) => {
                const itemKey = editItemKey(item);
                const selected = itemKey === editingPoItemKey;
                const purchaseUnit = purchaseUnitInfo(item);
                const shelfStock = Number(item.shelf_stock || 0);
                const storageStock = Number(item.storage_stock || 0);
                const onHand = shelfStock + storageStock;
                const orderQuantity = Number(item.purchase_qty || 0);
                const unitsPerPurchaseUnit = Number(
                    item.units_per_purchase_unit || item.purchase_unit_qty || 1,
                );
                const stockToReceive = orderQuantity * unitsPerPurchaseUnit;
                const productName = productTableProductName(item);
                const brandName = poBrandName(item);
                const fullProductName =
                    brandName && !productName.toLowerCase().startsWith(brandName.toLowerCase())
                        ? `${brandName} ${productName}`
                        : productName;
                const productType = cleanText(item.type_name);
                const removeLabel = `Remove ${[poBrandName(item), productName].filter(Boolean).join(" ")} from purchase order`;

                return `
                <tr data-item-key="${escapeHtml(itemKey)}" class="${selected ? "is-selected" : ""}" tabindex="${editMajorFieldsLocked ? "-1" : "0"}" aria-selected="${selected ? "true" : "false"}" aria-label="Edit ${escapeHtml(productName)}">
                    <td>
                        <span class="po-edit-product-name">${escapeHtml(fullProductName)}</span>
                        <span class="po-edit-product-spec">${escapeHtml(productSpecification(item) || "-")}</span>
                        ${productType ? `<span class="po-edit-product-type">${escapeHtml(productType)}</span>` : ""}
                        ${inactivePoProductWarning(item)}
                    </td>
                    <td>${escapeHtml(orderQuantity)}</td>
                    <td>${escapeHtml(purchaseUnit.purchaseUnit || "-")}</td>
                    <td>${escapeHtml(unitsPerPurchaseUnit)}</td>
                    <td>${escapeHtml(stockToReceive)}</td>
                    <td class="po-price-cell">${peso(item.price)}</td>
                    <td class="po-price-cell po-edit-line-total">${peso(productLineTotal(item))}</td>
                    <td>
                        <div class="po-edit-inventory-stock" aria-label="Shelf ${shelfStock}, Storage ${storageStock}, On Hand ${onHand}">
                            <span class="po-stock-chip"><small>Shelf</small><b>${escapeHtml(shelfStock)}</b></span>
                            <span class="po-stock-chip"><small>Storage</small><b>${escapeHtml(storageStock)}</b></span>
                            <span class="po-stock-chip po-stock-chip-on-hand"><small>On Hand</small><b>${escapeHtml(onHand)}</b></span>
                        </div>
                    </td>
                    <td class="po-actions-cell">
                        <div class="po-actions">
                            ${!editMajorFieldsLocked ? `<button class="btn btn-sm btn-outline-danger ${removeClass}" type="button" data-item-key="${escapeHtml(itemKey)}" aria-label="${escapeHtml(removeLabel)}" title="${escapeHtml(removeLabel)}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>` : ""}
                        </div>
                    </td>
                </tr>
            `;
            })
            .join("");
        renderEditSummary();
        return;
    }

    tableBody.innerHTML = items
        .map((item, index) => {
            const purchaseUnit = purchaseUnitInfo(item);
            const packaging = item.packaging || purchaseUnit.packaging || "";

            return `
        <tr>
            <td>${escapeHtml(poBrandName(item))}</td>
            <td class="po-product-cell">${escapeHtml(productCoreName(item))}</td>
            <td>${escapeHtml(cleanText(item.type_name) || "-")}</td>
            <td>${escapeHtml(productNetWeightLabel(item))}</td>
            <td>${escapeHtml(packaging || "-")}</td>
            <td>${escapeHtml(purchaseUnit.purchaseUnit || "-")}</td>
            <td class="po-qty-cell">${escapeHtml(quantityWithInventoryUnit(item, inventoryQtyForItem(item)))}</td>
            <td class="po-price-cell">${peso(item.price)}</td>
            <td class="po-price-cell">${peso(productLineTotal(item))}</td>
            <td class="po-actions-cell">
                <div class="po-actions">
                    <button class="btn btn-sm btn-outline-danger ${removeClass}" type="button" data-index="${index}" aria-label="Remove item"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        </tr>
    `;
        })
        .join("");
    if (tableSelector === "#table-po-items") updateCreateSummary();
}

function renderArchivedPurchaseOrders(orders) {
    if (orders.length === 0) {
        commitPurchaseOrderTable(
            "archived",
            tableEmpty(isSupervisorPoViewer() ? 11 : 12, "No cancelled or archived purchase orders found."),
        );
        return;
    }

    const bodyHtml = orders
        .map((order) => {
            const items = order.items || [];
            const itemNames = items.length
                ? items.map((item) => productTableProductName(item))
                : order.item_names || [];
            const quantities = items.length
                ? items.map((item) => item.purchase_qty || 0)
                : order.quantities || [];
            const archivedDate = order.approval_reason_at || order.order_date;
            const archivedBy = cleanText(order.approval_reason_by) || "-";
            const reason = cleanText(order.approval_reason) || "-";

            return `
            <tr>
                <td>${escapeHtml(order.po_number || `PO-${order.po_id}`)}</td>
                <td>${escapeHtml(order.supplier_name || "N/A")}</td>
                <td class="po-brand-cell">${brandTableCellList(items)}</td>
                <td class="po-product-cell">${productTableCellList(items, itemNames)}</td>
                <td class="po-spec-cell">${specificationTableCellList(items)}</td>
                <td class="po-qty-cell">${numberedList(quantities, { plain: true })}</td>
                <td class="po-price-cell"><span class="po-money">${peso(order.total_amount)}</span></td>
                <td>${formatDate(archivedDate)}</td>
                <td class="po-supplier-cell">${escapeHtml(archivedBy)}</td>
                <td class="po-spec-cell">${escapeHtml(reason)}</td>
                <td class="po-status-cell">${statusBadge(order.status || "Cancelled")}</td>
                ${isSupervisorPoViewer() ? "" : `<td class="po-actions-cell">
                    <div class="po-actions">
                        <button class="btn btn-sm btn-outline-primary view-po-btn" type="button" data-po-id="${escapeHtml(order.po_id)}" aria-label="View ${escapeHtml(order.po_number || "")}" title="View PO">
                            <i class="fa-regular fa-eye"></i>
                        </button>
                    </div>
                </td>`}
            </tr>
        `;
        })
        .join("");

    commitPurchaseOrderTable("archived", bodyHtml);
}

function addDraftItem({ items, productSelectId, quantityInputId, tableSelector, removeClass }) {
    const productSelect = document.getElementById(productSelectId);
    const quantityInput = document.getElementById(quantityInputId);
    const option = productSelect?.options[productSelect.selectedIndex];
    const quantity = Number(quantityInput?.value);
    const isCreateTable = productSelectId === "po-product-select";
    const overrides = isCreateTable ? readPurchaseUnitOverrides("po") : {};

    if (!productSelect?.value || !option || !Number.isSafeInteger(quantity) || quantity <= 0) {
        PharmaUtils.toast.error("Select a product and enter a whole-number quantity of 1 or more.");
        return;
    }

    const incomingItem = draftItemFromOption(option, quantity, overrides);
    const incomingLineKey = draftLineKey(incomingItem);
    const existing = items.find((item) => draftLineKey(item) === incomingLineKey);
    if (existing) {
        const existingIndex = items.indexOf(existing);
        existing.purchase_qty = quantity;
        existing.quantity = existing.purchase_qty;
        applyPurchaseItemCalculation(existing);
        existing.product_details = createProductDetailSnapshot(existing);
        if (isCreateTable) selectedCreateDraftIndex = existingIndex;
    } else {
        const draftItem = incomingItem;
        applyPurchaseItemCalculation(draftItem);
        draftItem.product_details = createProductDetailSnapshot(draftItem);
        items.push(draftItem);
        if (isCreateTable) selectedCreateDraftIndex = items.length - 1;
    }

    quantityInput.value = String(quantity);
    renderDraftItems(items, tableSelector, removeClass);
    if (productSelectId === "po-product-select") renderSelectedProductPanel();
}

function removeCreateDraftItem(index) {
    if (!Number.isInteger(index) || index < 0 || index >= createDraftItems.length) return;
    createDraftItems.splice(index, 1);
    if (selectedCreateDraftIndex === index) {
        selectedCreateDraftIndex = createDraftItems.length
            ? Math.min(index, createDraftItems.length - 1)
            : null;
    } else if (Number.isInteger(selectedCreateDraftIndex) && selectedCreateDraftIndex > index) {
        selectedCreateDraftIndex -= 1;
    }
    renderDraftItems(createDraftItems, "#table-po-items", "remove-po-item");
    renderSelectedProductPanel();
}

function resetCreateDraft() {
    createDraftItems.length = 0;
    selectedCreateDraftIndex = null;
    renderDraftItems(createDraftItems, "#table-po-items", "remove-po-item");

    const supplierSelect = document.getElementById("po-supplier-select");
    const productSelect = document.getElementById("po-product-select");
    if (supplierSelect) supplierSelect.selectedIndex = 0;
    if (productSelect) {
        productSelect.disabled = true;
        productSelect.innerHTML = '<option value="" disabled selected>Select product...</option>';
    }
    document.getElementById("po-quantity").value = "1";
    setSelectValue("po-purchase-unit", "Box");
    setValue("po-units-per-purchase-unit", "1");
    document.getElementById("po-payment-terms").value = "";
    document.getElementById("po-expected-delivery").value = "";
    renderSelectedProductPanel();
    updateCreateSummary();
}

function purchaseOrderPayload(prefix, items, poId = null) {
    const supplierId = document.getElementById(`${prefix}-supplier-select`)?.value || "";
    const paymentTerms = document.getElementById(`${prefix}-payment-terms`)?.value || "";
    const expectedDeliveryDate =
        document.getElementById(`${prefix}-expected-delivery`)?.value || "";

    if (!supplierId || !paymentTerms || !expectedDeliveryDate || items.length === 0) {
        throw new Error(
            "Select a supplier, payment terms, delivery date, and at least one product.",
        );
    }
    if (isPastLocalDate(expectedDeliveryDate)) {
        throw new Error("ETA cannot be earlier than today.");
    }

    const calculatedItems = items.map((item) => ({
        item,
        calculation: applyPurchaseItemCalculation(item),
    }));
    const subtotal = calculatedItems.reduce((sum, entry) => sum + entry.calculation.lineTotal, 0);
    const payload = {
        supplier_id: supplierId,
        payment_terms: paymentTerms,
        expected_delivery_date: expectedDeliveryDate,
        total_items: items.length,
        subtotal,
        grand_total: subtotal,
        items: calculatedItems.map(({ item, calculation }) => ({
            po_item_id: item.po_item_id || null,
            product_id: item.product_id,
            product_name: productCoreName(item),
            brand_name: poBrandName(item),
            category_name: item.category_name || "",
            type_name: item.type_name || "",
            generic_name: item.generic_name || "",
            variant_flavor: item.variant_flavor || "",
            strength: item.strength || "",
            strength_value: item.strength_value || "",
            strength_unit: item.strength_unit || "",
            net_content_value: item.net_content_value || item.volume_value || "",
            net_content_unit: item.net_content_unit || item.volume_unit || "",
            volume_value: item.volume_value || "",
            volume_unit: item.volume_unit || "",
            size_value: item.size_value || "",
            weight_volume_value: item.weight_volume_value || "",
            weight_volume_unit: item.weight_volume_unit || "",
            unit: item.unit || unitDisplayFromDetails(item),
            packaging: item.packaging || "",
            price: Number(item.price || 0),
            purchase_unit: item.purchase_unit || purchaseUnitInfo(item).purchaseUnit || "",
            units_per_purchase_unit: Number(
                item.units_per_purchase_unit || item.purchase_unit_qty || 1,
            ),
            purchase_qty: Number(item.purchase_qty || item.quantity || 0),
            inventory_qty_ordered: calculation.totalBaseUnits,
            quantity: calculation.totalBaseUnits,
            line_total: calculation.lineTotal,
        })),
    };

    if (poId) {
        payload.po_id = poId;
    } else {
        payload.pr_id = new URLSearchParams(window.location.search).get("pr_id") || "";
    }

    return payload;
}

async function submitPurchaseOrder() {
    try {
        const payload = purchaseOrderPayload("po", createDraftItems);
        PharmaUtils.modal.loading("Saving Purchase Order...");
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/create_po.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        PharmaUtils.modal.close();
        hideModal("createPurchaseOrderModal");
        await PharmaUtils.modal.success(
            "Purchase Order Saved",
            `Purchase order ${data.po_number} was created successfully.`,
        );
        resetCreateDraft();
        await loadPurchaseOrders({ updateSummary: true });
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error("Failed to create purchase order", err.message);
    }
}

async function getPurchaseOrder(poId) {
    const data = await fetchJson(
        `${API_BASE_URL}/purchase_orders/get_purchase_order.php?po_id=${encodeURIComponent(poId)}`,
        { retryGet: false },
    );
    return data.purchase_order;
}

function editDraftItemFromOrderItem(item) {
    const shelfStock = Number(item.shelf_stock ?? item.shelf_qty ?? 0);
    const storageStock = Number(item.storage_stock ?? item.storage_qty ?? 0);
    const draftItem = ensureEditItemIdentity({
        po_item_id: item.po_item_id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_display_name: productTableName(item),
        brand_name: item.brand_name,
        brand_display_name: productTableBrand(item),
        unit: item.unit,
        category_name: item.category_name,
        type_name: item.type_name,
        generic_name: item.generic_name,
        strength: item.strength,
        strength_value: item.strength_value,
        strength_unit: item.strength_unit,
        net_content_value: item.net_content_value || item.volume_value,
        net_content_unit: item.net_content_unit || item.volume_unit,
        volume_value: item.volume_value,
        volume_unit: item.volume_unit,
        variant_flavor: item.variant_flavor,
        size_value: item.size_value,
        weight_volume_value: item.weight_volume_value,
        weight_volume_unit: item.weight_volume_unit,
        packaging: item.packaging,
        purchase_unit: item.purchase_unit,
        units_per_purchase_unit: Number(item.units_per_purchase_unit || 1),
        purchase_unit_qty: Number(item.units_per_purchase_unit || 1),
        purchase_qty: Number(item.purchase_qty || item.quantity || 0),
        inventory_qty_ordered: Number(item.inventory_qty_ordered || item.quantity || 0),
        price: Number(item.price || 0),
        selling_price: Number(item.selling_price || 0),
        shelf_stock: shelfStock,
        storage_stock: storageStock,
        stock: shelfStock + storageStock,
        reorder_level: Number(item.reorder_level || item.reorder_qty || 10),
        quantity: Number(item.purchase_qty || item.quantity || 0),
    });
    draftItem.product_details = createProductDetailSnapshot(draftItem);
    return draftItem;
}

async function populateEditPurchaseOrder(order) {
    activeEditOrder = order;
    editMajorFieldsLocked = !canEditMajorFields(order);
    document.getElementById("edit-po-id").value = order.po_id;
    document.getElementById("editPoNumber").textContent = order.po_number;
    renderSupplierOptions(document.getElementById("edit-po-supplier-select"), order.supplier_id);
    await loadSupplierProducts(order.supplier_id, "edit-po-product-select");
    document.getElementById("edit-po-payment-terms").value = order.payment_terms || "Cash";
    document.getElementById("edit-po-expected-delivery").value = order.expected_delivery_date || "";
    editDraftItems.length = 0;
    order.items.forEach((item) => editDraftItems.push(editDraftItemFromOrderItem(item)));
    clearEditProductEditor();
    renderDraftItems(editDraftItems, "#table-edit-po-items", "remove-edit-po-item");
    applyEditLocks(order);
}

function applyEditLocks(order) {
    const lockedTitle = isOperationallyLocked(order)
        ? `Items cannot be changed while this purchase order is ${order.status}.`
        : "Item changes are locked after an approved PR is converted to a purchase order.";
    const lockMajor = !canEditMajorFields(order);
    const lockAll = isOperationallyLocked(order);
    editMajorFieldsLocked = lockMajor || lockAll;
    const supplierLocked = editDraftItems.length > 0 || editMajorFieldsLocked;

    [
        "edit-po-product-select",
        "edit-po-quantity",
        "edit-po-editor-quantity",
        "edit-po-editor-purchase-unit",
        "edit-po-editor-contains",
    ].forEach((id) => {
        const field = document.getElementById(id);
        if (!field) return;
        field.disabled = editMajorFieldsLocked;
        field.title = editMajorFieldsLocked ? lockedTitle : "";
    });
    const supplierField = document.getElementById("edit-po-supplier-select");
    if (supplierField) {
        supplierField.disabled = supplierLocked;
        supplierField.title =
            supplierLocked && editDraftItems.length > 0
                ? "Supplier is locked because this purchase order already contains supplier-linked items."
                : editMajorFieldsLocked
                  ? lockedTitle
                  : "";
    }

    const lockNotice = document.getElementById("edit-po-lock-notice");
    if (lockNotice) {
        const message = editMajorFieldsLocked
            ? lockedTitle
            : editDraftItems.length > 0
              ? "Supplier is locked while items are on this order. Remove all items before selecting another supplier."
              : "";
        lockNotice.textContent = message;
        lockNotice.classList.toggle("d-none", !message);
    }

    const addButton = document.getElementById("btnEditAddPoItem");
    if (addButton) {
        addButton.disabled = editMajorFieldsLocked;
        addButton.title = editMajorFieldsLocked ? lockedTitle : "";
    }

    const saveButton = document.getElementById("btnUpdatePo");
    if (saveButton) {
        saveButton.disabled = lockAll || editDraftItems.length === 0;
        saveButton.title = lockAll
            ? "This purchase order is locked after processing."
            : editDraftItems.length === 0
              ? "Add at least one item before saving."
              : "";
        saveButton.textContent =
            order.approval_status === "Revision Requested"
                ? "Resubmit for Approval"
                : "Save Changes";
    }
}

function renderPoOrderSummary(order) {
    const section = document.getElementById("poOrderSummary");
    const content = document.getElementById("poOrderSummaryContent");
    if (!section || !content || !order) return;
    section.hidden = false;
    const items = Array.isArray(order.items) ? order.items : [];
    const rows = items
        .map((item) => {
            const brand = productTableBrand(item);
            const product = cleanText(item.generic_name) || productTableProductName(item);
            const title = product || brand || "Product";
            const specification = productSpecification(item);
            const unitsPerPurchaseUnit = Math.max(
                1,
                Number(item.units_per_purchase_unit || item.units_per_purchase_unit_snapshot || 1),
            );
            const receivedBaseQuantity = Number(item.received_quantity || 0);
            const receivedPurchaseQuantity = receivedBaseQuantity / unitsPerPurchaseUnit;
            const orderedQuantity = Number(item.purchase_qty || item.quantity || 0);
            const unitCost =
                Number(item.line_total) > 0 && orderedQuantity > 0
                    ? Number(item.line_total) / orderedQuantity
                    : Number(item.price || 0) * unitsPerPurchaseUnit;
            return `<tr data-po-item-id="${escapeHtml(item.po_item_id || "")}">
                <td><strong>${escapeHtml(title)}</strong>${brand && !sameText(brand, title) ? `<small>${escapeHtml(brand)}</small>` : ""}</td>
                <td>${escapeHtml(specification || "—")}</td>
                <td class="po-view-number">${escapeHtml(purchaseUnitQuantityLabel(item))}</td>
                <td class="po-view-number" data-po-invoiced-qty>—</td>
                <td class="po-view-number">${receivedBaseQuantity > 0 ? `${escapeHtml(formatPoViewNumber(receivedPurchaseQuantity))} ${escapeHtml(item.purchase_unit || "pcs")}` : "—"}</td>
                <td class="po-view-money">${unitCost > 0 ? peso(unitCost) : "—"}</td>
                <td class="po-view-money">${Number(item.line_total) > 0 ? peso(item.line_total) : "—"}</td>
            </tr>`;
        })
        .join("");
    section.hidden = false;
    content.innerHTML = `
        <div class="po-view-progress" id="poViewProgress" aria-label="Purchase order progress"></div>
        <div class="po-view-layout">
            <section class="po-view-items-panel" aria-labelledby="poViewItemsTitle">
                <header class="po-view-panel-heading"><h3 id="poViewItemsTitle">Items</h3><span>${items.length} ${items.length === 1 ? "product" : "products"} · ${items.reduce((sum, item) => sum + Number(item.purchase_qty || item.quantity || 0), 0)} units</span></header>
                <div class="po-view-record-table-wrap">
                    <table class="po-view-record-table po-view-items-table" id="poViewItemsTable">
                        <thead><tr><th>Product</th><th>Specification</th><th>Ordered</th><th>Invoiced</th><th>Received</th><th>Unit cost</th><th>Line total</th></tr></thead>
                        <tbody>${rows || '<tr><td colspan="7" class="po-view-empty-cell">No original purchase-order items are available.</td></tr>'}</tbody>
                    </table>
                </div>
                <details class="po-view-disclosure"><summary>Supplier invoice details</summary><div id="poViewInvoiceDetails" class="po-view-disclosure-content"></div></details>
                <details class="po-view-disclosure"><summary>Receiving records and documents</summary><div id="poViewReceivingDetails" class="po-view-disclosure-content"></div></details>
            </section>
            <aside class="po-view-sidebar">
                <section class="po-view-sidebar-section" aria-labelledby="poViewPaymentTitle">
                    <div class="po-view-sidebar-heading"><h3 id="poViewPaymentTitle">Payment</h3><strong id="poViewPaymentStatus"></strong></div>
                    <div id="poViewPaymentSummary"><div class="po-view-sidebar-loading">Loading payment details...</div></div>
                </section>
                <section class="po-view-sidebar-section po-view-details-section" aria-labelledby="poViewDetailsTitle">
                    <h3 id="poViewDetailsTitle">Details</h3>
                    <dl class="po-view-details-list">
                        <div><dt>PO number</dt><dd>${escapeHtml(order.po_number || "—")}</dd></div>
                        <div><dt>Purchase request</dt><dd title="${escapeHtml(order.pr_number || "—")}">${escapeHtml(order.pr_number || "—")}</dd></div>
                        <div><dt>Order date</dt><dd>${escapeHtml(poViewDate(order.order_date || order.created_at))}</dd></div>
                        <div id="poViewInvoiceMeta"><dt>Supplier invoice</dt><dd>Not recorded</dd></div>
                    </dl>
                </section>
            </aside>
        </div>`;
    document.getElementById("poViewProgress").innerHTML = purchaseOrderProgressMarkup(order);
    const title = document.getElementById("viewPurchaseOrderModalLabel");
    if (title) {
        title.innerHTML = `Purchase order ${escapeHtml(order.po_number || "—")} ${statusBadge(order.status || "Draft")}`;
    }
    const supplier = document.getElementById("viewPoNumber");
    if (supplier) supplier.textContent = order.supplier_name || "—";
}

function formatPoViewNumber(value) {
    return Number(value || 0).toLocaleString("en-US", {
        maximumFractionDigits: 2,
    });
}

function poViewDate(value) {
    if (!value) return "—";
    const text = String(value);
    const dateParts = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = dateParts
        ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
        : new Date(text.replace(" ", "T"));
    return Number.isNaN(date.getTime())
        ? escapeHtml(value)
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function purchaseOrderProgressMarkup(order, invoice = null, payment = null, receivedDate = "") {
    const paid = payment
        ? isPurchaseOrderPaid(payment.payment_status, payment.remaining_balance)
        : getPoPaymentStatus(order) === "paid";
    const received =
        order.status === "Delivered" ||
        Boolean(order.received_date || receivedDate) ||
        (order.items || []).some((item) => Number(item.received_quantity || 0) > 0);
    const stages = [
        { label: "Ordered", complete: true, date: order.order_date || order.created_at },
        {
            label: "Invoiced",
            complete: Boolean(invoice?.invoice_id || order.invoice_recorded),
            date: invoice?.invoice_date || order.view_invoice_date,
        },
        {
            label: "Received",
            complete: received,
            date: receivedDate || order.view_received_date || order.received_date,
        },
        {
            label: "Paid",
            complete: paid || order.view_payment_details?.payment_status === "Paid",
            date:
                payment?.payments?.[0]?.payment_date ||
                order.view_payment_details?.payments?.[0]?.payment_date,
        },
    ];
    return stages
        .map(
            (stage, index) => `
            <div class="po-view-progress-step${stage.complete ? " is-complete" : ""}${index === stages.length - 1 ? " is-last" : ""}">
                <span class="po-view-progress-marker">${stage.complete ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : ""}</span>
                <strong>${stage.label}</strong>
                <small>${stage.complete ? escapeHtml(poViewDate(stage.date)) : "Pending"}</small>
            </div>`,
        )
        .join("");
}

async function renderPoPaymentSummary(order) {
    const section = document.getElementById("poPaymentSummary");
    const content = document.getElementById("poPaymentSummaryContent");
    const summary = document.getElementById("poViewPaymentSummary");
    const status = document.getElementById("poViewPaymentStatus");
    const poId = String(order?.po_id || "");
    if (!section || !content || !summary || !status || !poId) return;
    section.hidden = true;
    if (!order.invoice_recorded || Number(order.invoice_total ?? order.total_amount ?? 0) <= 0) {
        content.innerHTML =
            '<div class="po-record-empty"><span>Awaiting Supplier Invoice. Payment is unavailable until a valid supplier invoice is recorded.</span></div>';
        status.textContent = "Awaiting invoice";
        summary.innerHTML =
            '<strong class="po-view-payment-amount">—</strong><small>Payment details appear after the supplier invoice is recorded.</small>';
        const progress = document.getElementById("poViewProgress");
        if (progress) progress.innerHTML = purchaseOrderProgressMarkup(order);
        return;
    }
    if (order.status === "Draft") {
        status.textContent = "Available after submission";
        summary.innerHTML = `
            <strong class="po-view-payment-amount">${peso(order.invoice_total ?? order.total_amount)}</strong>
            <small>Invoice total · payment tracking becomes available after this draft is submitted.</small>
            <button class="po-view-link-action po-view-invoice-link" type="button" data-po-payment-action="invoice" data-po-id="${escapeHtml(poId)}">View supplier invoice</button>`;
        content.innerHTML =
            '<div class="po-record-empty"><span>Payment history and balance are available after this purchase order is submitted.</span></div>';
        const progress = document.getElementById("poViewProgress");
        if (progress) progress.innerHTML = purchaseOrderProgressMarkup(order);
        return;
    }
    summary.innerHTML = '<div class="po-view-sidebar-loading">Loading payment details...</div>';
    content.innerHTML =
        '<div class="po-receiving-documents-loading"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Loading payment summary...</span></div>';
    try {
        const details = await fetchPurchaseOrderPaymentDetails(poId);
        if (String(activeViewOrder?.po_id || "") !== poId) return;
        const payment = details.payment || {};
        order.view_payment_details = payment;
        const invoiceTotal = Number(details.total_amount || 0);
        const currentDiscount = Number(payment.current_po_discount || 0);
        const creditApplied = Number(
            payment.supplier_credit_applied ?? payment.future_supplier_credit_applied ?? 0,
        );
        const netAmountDue = Number(
            payment.adjusted_payable ?? Math.max(0, invoiceTotal - currentDiscount - creditApplied),
        );
        const previousPayments = Number(payment.total_paid || 0);
        const remainingBalance = Number(
            payment.remaining_balance ?? Math.max(0, netAmountDue - previousPayments),
        );
        const fullyPaid = isPurchaseOrderPaid(payment.payment_status, remainingBalance);
        const paymentState = fullyPaid
            ? "Paid"
            : previousPayments > 0
              ? "Partially paid"
              : "Unpaid";
        const latestPayment = payment.payments?.[0];
        status.textContent = paymentState;
        summary.innerHTML = `
            <strong class="po-view-payment-amount">${peso(fullyPaid ? previousPayments : remainingBalance)}</strong>
            <small>${fullyPaid ? "total paid" : `remaining of ${peso(netAmountDue)} net due`}</small>
            <div class="po-view-payment-breakdown">
                <div><span>Invoice total</span><strong>${peso(invoiceTotal)}</strong></div>
                ${creditApplied > 0 ? `<div><span>Supplier credit</span><strong>−${peso(creditApplied)}</strong></div>` : ""}
                <div><span>Paid</span><strong>−${peso(previousPayments)}</strong></div>
            </div>
            ${latestPayment ? `<div class="po-view-latest-payment"><span>${escapeHtml(poViewDate(latestPayment.payment_date))} · ${escapeHtml(paymentMethodLabel(latestPayment.payment_method))}${latestPayment.reference_number ? ` · ${escapeHtml(latestPayment.reference_number)}` : ""}</span><strong>${peso(latestPayment.amount)}</strong></div>` : ""}
            <button class="po-view-link-action po-view-payment-link" type="button" data-po-payment-action="payment" data-po-id="${escapeHtml(poId)}">${fullyPaid ? "View payments" : "Record payment"}</button>
            <button class="po-view-link-action po-view-invoice-link" type="button" data-po-payment-action="invoice" data-po-id="${escapeHtml(poId)}">View supplier invoice</button>
            ${payment.payments?.length ? `<details class="po-view-nested-disclosure"><summary>Payment history (${payment.payments.length})</summary>${renderPaymentHistory(payment.payments)}</details>` : ""}`;
        content.innerHTML = `
            <div class="po-view-payment-reference">
                <div><span>Supplier Invoice</span><strong>#${escapeHtml(details.invoice_number || "—")}</strong></div>
                <div class="po-view-payment-reference-actions">
                    ${paymentStatusBadge(paymentState)}
                    <button class="po-view-invoice-action" type="button" data-po-payment-action="invoice" data-po-id="${escapeHtml(poId)}"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i><span>View Supplier Invoice</span></button>
                    <button class="po-view-invoice-action" type="button" data-po-payment-action="payment" data-po-id="${escapeHtml(poId)}"><i class="fa-solid fa-wallet" aria-hidden="true"></i><span>${fullyPaid ? "View Payments" : "Record Payment"}</span></button>
                </div>
            </div>
            <div class="po-view-payment-grid">
                <div><span>Invoice Total</span><strong>${peso(invoiceTotal)}</strong></div>
                <div><span>Credit Applied</span><strong>-${peso(creditApplied)}</strong></div>
                <div class="net"><span>Net Amount Due${currentDiscount > 0 ? `<small class="po-view-payment-note">Includes approved current-invoice discount of ${peso(currentDiscount)}</small>` : ""}</span><strong>${peso(netAmountDue)}</strong></div>
                <div><span>Previous Payments</span><strong>${peso(previousPayments)}</strong></div>
                <div class="balance"><span>Remaining Balance</span><strong>${peso(remainingBalance)}</strong></div>
            </div>`;
        const progress = document.getElementById("poViewProgress");
        if (progress) progress.innerHTML = purchaseOrderProgressMarkup(order, null, payment);
    } catch (error) {
        if (String(activeViewOrder?.po_id || "") !== poId) return;
        content.innerHTML = `<div class="po-receiving-documents-loading po-receiving-documents-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>${escapeHtml(error.message || "Unable to load payment details.")}</span></div>`;
        status.textContent = "Unavailable";
        summary.innerHTML = `<div class="po-view-inline-error">${escapeHtml(error.message || "Unable to load payment details.")}</div>`;
    }
}

async function openViewPurchaseOrder(poId) {
    const requestKey = String(poId || "").trim();
    if (!requestKey) return;
    if (purchaseOrderViewRequests.has(requestKey)) return purchaseOrderViewRequests.get(requestKey);

    const request = (async () => {
        const orderSummary = document.getElementById("poOrderSummary");
        const orderSummaryContent = document.getElementById("poOrderSummaryContent");
        const supplierInvoice = document.getElementById("poSupplierInvoice");
        const supplierInvoiceContent = document.getElementById("poSupplierInvoiceContent");
        const paymentSummary = document.getElementById("poPaymentSummary");
        const paymentSummaryContent = document.getElementById("poPaymentSummaryContent");
        const receivingSummary = document.getElementById("poReceivingSummary");
        const receivingSummaryContent = document.getElementById("poReceivingSummaryContent");
        const receivingDocuments = document.getElementById("poReceivingDocuments");
        const receivingDocumentsList = document.getElementById("poReceivingDocumentsList");
        setPurchaseOrderActionBusy(".view-po-btn", requestKey, true);
        document.getElementById("viewPoNumber").textContent = "Loading purchase order...";
        if (orderSummary) orderSummary.hidden = false;
        if (orderSummaryContent)
            orderSummaryContent.innerHTML =
                '<div class="po-receiving-documents-loading"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Loading purchase order...</span></div>';
        if (supplierInvoice) supplierInvoice.hidden = true;
        if (supplierInvoiceContent) supplierInvoiceContent.innerHTML = "";
        if (paymentSummary) paymentSummary.hidden = true;
        if (paymentSummaryContent) paymentSummaryContent.innerHTML = "";
        if (receivingSummary) receivingSummary.hidden = true;
        if (receivingSummaryContent) receivingSummaryContent.innerHTML = "";
        if (receivingDocuments) receivingDocuments.hidden = true;
        if (receivingDocumentsList) receivingDocumentsList.innerHTML = "";
        showModal("viewPurchaseOrderModal");

        try {
            const order = await getPurchaseOrder(poId);
            activeViewOrder = order;
            document.getElementById("viewPoNumber").textContent = order.po_number;
            window.__purchaseOrderPreviewCache.set(String(order.po_id), order);
            renderPoOrderSummary(order);
            renderPoSupplierInvoice(order);
            renderPoPaymentSummary(order);
            renderPoReceivingDocuments(order.po_id);
            const modalBody = document.querySelector("#viewPurchaseOrderModal .modal-body");
            if (modalBody) modalBody.scrollTop = 0;
            window.requestAnimationFrame(() => {
                if (modalBody) modalBody.scrollTop = 0;
            });
        } catch (err) {
            if (orderSummaryContent)
                orderSummaryContent.innerHTML =
                    '<div class="po-receiving-documents-loading po-receiving-documents-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Unable to load this purchase order.</span></div>';
            showPurchaseOrderActionError(
                err.message,
                "Unable to load purchase order details. Please try again.",
            );
        } finally {
            setPurchaseOrderActionBusy(".view-po-btn", requestKey, false);
        }
    })();

    purchaseOrderViewRequests.set(requestKey, request);
    try {
        return await request;
    } finally {
        purchaseOrderViewRequests.delete(requestKey);
    }
}

function printPurchaseOrder(order) {
    if (!order) throw new Error("Open a purchase order before printing.");
    const printWindow = window.open("", "_blank");
    if (!printWindow) throw new Error("Allow pop-ups to print this purchase order.");
    const token = sessionStorage.getItem("pharma_tab_token");
    if (token) printWindow.sessionStorage.setItem("pharma_tab_token", token);
    printWindow.opener = null;
    printWindow.location.replace(
        `purchase_order_print.html?po_id=${encodeURIComponent(order.po_id)}&print=1`,
    );
}

async function updatePurchaseOrderStatusFromTable(poId) {
    try {
        if (!poId) return;
        const order = await getPurchaseOrder(poId);
        const nextStatus = validNextStatuses(order)[0] || "";
        if (!nextStatus) {
            PharmaUtils.toast.info("No status changes are available for this purchase order.");
            return;
        }

        if (window.Swal) {
            const isArrival = nextStatus === "Arrived";
            const result = await Swal.fire(
                isArrival
                    ? {
                          title: "Mark PO as Arrived?",
                          text: "This records physical arrival and sends the PO to Inspect Deliveries. Invoice and payment remain separate.",
                          icon: "question",
                          showCancelButton: true,
                          confirmButtonText: "Confirm Arrival",
                          confirmButtonColor: "#7c3aed",
                      }
                    : {
                          title: "Mark this PO as Pending?",
                          text: "This indicates that the order has been placed with the supplier.",
                          icon: "question",
                          showCancelButton: true,
                          confirmButtonText: "Mark Pending",
                          confirmButtonColor: "#7c3aed",
                      },
            );
            if (!result.isConfirmed) return;
        } else {
            if (
                nextStatus === "Pending" &&
                !window.confirm(
                    "Mark this PO as Pending? This indicates that the order has been placed with the supplier.",
                )
            )
                return;
            if (
                nextStatus === "Arrived" &&
                !window.confirm("Mark this PO as Arrived and send it to Inspect Deliveries?")
            )
                return;
        }

        const data = await fetchJson(
            `${API_BASE_URL}/purchase_orders/update_purchase_order_status.php`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ po_id: poId, status: nextStatus }),
            },
        );

        PharmaUtils.toast.success(data.message);
        await loadPurchaseOrders({ updateSummary: true });
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

const RECEIVE_ISSUE_TYPES = [
    "Damaged Product",
    "Broken Package",
    "Expired",
    "Wrong Item",
    "Short Quantity",
    "Other",
];
const RECEIVE_DISPOSITIONS = [
    ["return_to_supplier", "Return to Supplier"],
    ["hold_quarantine", "Hold / Quarantine"],
    ["dispose", "Dispose"],
];
const RECEIVE_RESOLUTIONS = [
    ["replacement", "Replacement Later"],
    ["supplier_credit", "Discount Current PO"],
    ["next_po_credit", "Credit Next PO"],
    ["refund", "Refund Due"],
    ["no_compensation", "No Supplier Compensation"],
];
let receiveSubmitting = false;
let receiveValidationAttempted = false;

function receiveDraftItem(item) {
    const draftItems = activeReceiveOrder?.inspection_draft?.items || [];
    return draftItems.find((draft) => String(draft.po_item_id) === String(item.po_item_id)) || {};
}

function supplierInvoiceItemsMarkup(items = [], options = {}) {
    const compact = options.compact === true;
    const productHeading = options.productHeading || "Product";
    const quantityHeading = options.quantityHeading || "Invoiced Qty";
    if (!items.length)
        return '<div class="supplier-invoice-items-empty">No supplier invoice items were recorded.</div>';
    return `<div class="supplier-invoice-items-table-wrap${compact ? " compact" : ""}">
        <table class="supplier-invoice-items-table">
            <thead><tr><th>${escapeHtml(productHeading)}</th><th>Purchase Unit</th><th>${escapeHtml(quantityHeading)}</th><th>Supplier Unit Cost</th><th>Line Total</th></tr></thead>
            <tbody>${items
                .map(
                    (item) => `<tr>
                <td><strong>${escapeHtml(item.generic_name || item.product_name || "Product")}</strong><span class="supplier-invoice-item-brand">${escapeHtml(item.brand_name || "No brand")}</span>${invoiceSpecificationText(item) ? `<span class="supplier-invoice-item-spec">${escapeHtml(invoiceSpecificationText(item))}</span>` : ""}</td>
                <td>${escapeHtml(item.purchase_unit || "pcs")}</td>
                <td class="number">${options.quantityWithUnit ? escapeHtml(supplierInvoiceQuantityLabel(item)) : Number(item.invoice_qty ?? item.order_qty ?? 0)}</td>
                <td class="money">${peso(item.unit_cost || 0)}</td>
                <td class="money"><strong>${peso(item.line_total || 0)}</strong></td>
            </tr>`,
                )
                .join("")}</tbody>
        </table>
    </div>`;
}

function invoiceSpecificationText(item = {}) {
    const specification = String(item.specification || "").trim();
    const product = String(item.generic_name || item.product_name || "").trim();
    if (!specification || !product) return specification;
    const prefix = new RegExp(`^${product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*•\\s*`, "i");
    return specification.replace(prefix, "").trim();
}

function supplierInvoiceQuantityLabel(item = {}) {
    const quantity = Number(item.invoice_qty ?? item.order_qty ?? 0);
    const unit = String(item.purchase_unit || "pcs").trim();
    if (quantity === 1 || /s$/i.test(unit) || /^pcs$/i.test(unit)) return `${quantity} ${unit}`;
    if (/box$/i.test(unit)) return `${quantity} ${unit.replace(/box$/i, "Boxes")}`;
    if (/[^aeiou]y$/i.test(unit)) return `${quantity} ${unit.slice(0, -1)}ies`;
    return `${quantity} ${unit}s`;
}

function supplierInvoicePaymentSummaryMarkup(poId, invoice = {}, payment = {}) {
    const invoiceTotal = Number(invoice.supplier_invoice_total || 0);
    const amountPaid = Number(payment.total_paid || 0);
    const balanceDue = Number(payment.remaining_balance ?? Math.max(0, invoiceTotal - amountPaid));
    const status = payment.payment_status || (balanceDue <= 0 && invoiceTotal > 0 ? "Paid" : "Unpaid");
    const paid = isPurchaseOrderPaid(status, balanceDue);
    return `
        <div class="supplier-invoice-payment-summary">
            <h3 class="supplier-invoice-section-title">Invoice Summary</h3>
            <div class="po-payment-financial-summary">
                <div><span>Invoice Total</span><strong>${peso(invoiceTotal)}</strong></div>
                <div><span>Amount Paid</span><strong>${peso(amountPaid)}</strong></div>
                <div class="balance"><span>Balance Due</span><strong>${peso(balanceDue)}</strong></div>
                <div><span>Payment Status</span>${paymentStatusBadge(status)}</div>
            </div>
            <div class="po-view-invoice-actions">
                <button class="po-view-invoice-action" type="button" data-po-invoice-action="close"><span>Close</span></button>
                <button class="po-view-invoice-action" type="button" data-po-invoice-action="payment" data-po-id="${escapeHtml(poId)}"><i class="fa-solid fa-wallet" aria-hidden="true"></i><span>${paid ? "View Payment" : "Record Payment"}</span></button>
            </div>
        </div>`;
}

async function openSupplierInvoice(poId, options = {}) {
    try {
        const [order, invoicePayload] = await Promise.all([
            getPurchaseOrder(poId),
            fetchJson(
                `${API_BASE_URL}/purchase_orders/get_purchase_order_invoice.php?po_id=${encodeURIComponent(poId)}`,
            ),
        ]);
        const invoice = invoicePayload.invoice || {};
        if (invoice.invoice_id && !options.edit) {
            let paymentSummary = {};
            try {
                const paymentPayload = await fetchJson(
                    `${API_BASE_URL}/purchase_orders/get_purchase_order_payment_details.php?po_id=${encodeURIComponent(poId)}`,
                );
                paymentSummary = paymentPayload.payment_details?.payment || {};
            } catch (_) {
                paymentSummary = {};
            }
            const result = await Swal.fire({
                title: "Supplier Invoice",
                html: `<div class="supplier-invoice-view">
                    <div class="supplier-invoice-summary">
                        <div><div class="supplier-invoice-po">${escapeHtml(order.po_number || "")}</div><div class="supplier-invoice-supplier">${escapeHtml(order.supplier_name || "")}</div></div>
                        ${paymentStatusBadge(order.payment_status || "Unpaid")}
                    </div>
                    <div class="supplier-invoice-view-meta">
                        <div><span>Invoice Number</span><strong>${escapeHtml(invoice.invoice_number || "—")}</strong></div>
                        <div><span>Invoice Date</span><strong>${escapeHtml(formatDate(invoice.invoice_date))}</strong></div>
                    </div>
                    <h3 class="supplier-invoice-section-title">Supplier Invoice Items</h3>
                    ${supplierInvoiceItemsMarkup(invoice.items || [])}
                    <div class="supplier-invoice-view-total"><span>Supplier Invoice Total</span><strong>${peso(invoice.supplier_invoice_total || 0)}</strong></div>
                    ${supplierInvoicePaymentSummaryMarkup(poId, invoice, paymentSummary)}
                </div>`,
                showCloseButton: true,
                showConfirmButton: false,
                showDenyButton:
                    ["Pending", "Arrived"].includes(order.status || "") &&
                    getPoPaymentStatus(order) !== "paid",
                denyButtonText: "Edit Supplier Invoice",
                denyButtonColor: "#64748b",
                width: 1080,
                customClass: {
                    popup: "supplier-invoice-modal supplier-invoice-view-modal",
                    htmlContainer: "supplier-invoice-modal-body",
                },
                didOpen: () => {
                    document
                        .querySelector(".supplier-invoice-view")
                        ?.addEventListener("click", (event) => {
                            const button = event.target.closest("[data-po-invoice-action]");
                            if (!button) return;
                            const action = button.dataset.poInvoiceAction;
                            if (action === "close") Swal.close();
                            if (action === "payment") Swal.clickConfirm();
                        });
                },
                preConfirm: () => "payment",
            });
            if (result.isConfirmed && result.value === "payment") await openSupplierPayment(poId);
            if (result.isDenied) await openSupplierInvoice(poId, { edit: true });
            return;
        }
        const savedByItem = new Map(
            (invoice.items || []).map((item) => [String(item.po_item_id), item]),
        );
        const today = new Date().toISOString().slice(0, 10);
        const rows = (order.items || [])
            .map((item) => {
                const saved = savedByItem.get(String(item.po_item_id)) || {};
                const qty = Number(item.purchase_qty || 1);
                const unit = String(item.purchase_unit || "pcs").trim();
                const unitCost = saved.unit_cost ?? "";
                return `
                <tr data-po-item-id="${escapeHtml(item.po_item_id)}" data-order-qty="${qty}">
                    <td><div class="supplier-invoice-product">${escapeHtml(item.generic_name || item.product_name || "Product")}</div></td>
                    <td class="supplier-invoice-spec">${escapeHtml(productSpecification({ ...item, generic_name: "" }) || "—")}</td>
                    <td class="supplier-invoice-brand">${escapeHtml(item.brand_name || "No brand")}</td>
                    <td class="supplier-invoice-unit">${escapeHtml(unit)}</td>
                    <td class="supplier-invoice-ordered">${escapeHtml(supplierInvoiceQuantityLabel({ order_qty: qty, purchase_unit: unit }))}</td>
                    <td><input class="form-control invoice-qty invoice-financial-input" type="number" min="0" max="99999999.9999" step="0.0001" value="${escapeHtml(saved.invoice_qty ?? qty)}" aria-label="Invoice quantity for ${escapeHtml(item.product_name || "product")}" required></td>
                    <td>
                        <div class="supplier-invoice-cost-group">
                            <span>₱</span>
                            <input class="invoice-unit-cost invoice-financial-input" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(unitCost)}" placeholder="0.00" aria-label="Supplier unit cost for ${escapeHtml(item.product_name || "product")}">
                            <span>/ ${escapeHtml(unit)}</span>
                        </div>
                        <small class="supplier-invoice-cost-error" hidden>Enter a valid supplier unit cost greater than ₱0.00.</small>
                    </td>
                    <td class="text-end supplier-invoice-line-total">${peso(qty * Number(unitCost || 0))}</td>
                </tr>`;
            })
            .join("");
        const html = `
            <div class="supplier-invoice-form">
                <section class="supplier-invoice-section">
                    <h3 class="supplier-invoice-section-title">PO / Supplier Summary</h3>
                    <div class="supplier-invoice-summary">
                        <div><div class="supplier-invoice-po">${escapeHtml(order.po_number || "")}</div><div class="supplier-invoice-supplier">${escapeHtml(order.supplier_name || "")}</div></div>
                        <span class="supplier-invoice-status">${escapeHtml(order.status || "Pending")}</span>
                    </div>
                </section>
                <section class="supplier-invoice-section">
                    <h3 class="supplier-invoice-section-title">Supplier Invoice Information</h3>
                    <div class="supplier-invoice-info-grid">
                        <div><label for="supplierInvoiceNumber">Invoice Number <span class="supplier-invoice-required" aria-hidden="true">*</span></label><input id="supplierInvoiceNumber" class="form-control" maxlength="100" value="${escapeHtml(invoice.invoice_number || "")}" aria-describedby="supplierInvoiceNumberError" required><small id="supplierInvoiceNumberError" class="supplier-invoice-field-error" hidden>Invoice number is required.</small></div>
                        <div><label for="supplierInvoiceDate">Invoice Date <span class="supplier-invoice-required" aria-hidden="true">*</span></label><input id="supplierInvoiceDate" class="form-control" type="date" value="${escapeHtml(invoice.invoice_date || today)}" aria-describedby="supplierInvoiceDateError" required><small id="supplierInvoiceDateError" class="supplier-invoice-field-error" hidden>A valid invoice date is required.</small></div>
                    </div>
                </section>
                <section class="supplier-invoice-section">
                    <h3 class="supplier-invoice-section-title">Invoice Line Breakdown</h3>
                    <div class="supplier-invoice-lines-wrap">
                        <table class="supplier-invoice-lines">
                            <thead><tr><th>Product</th><th>Specification</th><th>Brand</th><th>Purchase Unit</th><th>Ordered Qty</th><th>Invoice Qty</th><th>Cost / Purchase Unit</th><th class="text-end">Line Total</th></tr></thead>
                            <tbody id="supplierInvoiceLines">${rows}</tbody>
                        </table>
                    </div>
                    <div class="supplier-invoice-totals-wrap">
                        <div class="supplier-invoice-totals">
                            <h3 class="supplier-invoice-section-title">Totals &amp; Validation</h3>
                            <div class="supplier-invoice-total-row"><span>Subtotal</span><strong id="supplierInvoiceSubtotal">${peso(0)}</strong></div>
                            <div class="supplier-invoice-total-row"><span>Discount</span><div class="supplier-invoice-total-input"><span>₱</span><input id="supplierInvoiceDiscount" class="form-control invoice-financial-input" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(invoice.discount ?? 0)}"></div></div>
                            <div class="supplier-invoice-total-row"><span>Other Charges</span><div class="supplier-invoice-total-input"><span>₱</span><input id="supplierInvoiceCharges" class="form-control invoice-financial-input" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(invoice.other_charges ?? 0)}"></div></div>
                            <div class="supplier-invoice-total-row emphasis"><span>Final Invoice Total</span><strong id="supplierInvoiceCalculated">${peso(0)}</strong></div>
                            <div id="supplierInvoiceValidation" class="supplier-invoice-validation neutral" role="status" aria-live="polite"><strong>Complete the required invoice information.</strong></div>
                        </div>
                    </div>
                </section>
            </div>`;

        const parseInvoiceAmount = (value, blankAsZero = false) => {
            const normalized = String(value ?? "")
                .replace(/[₱,\s]/g, "")
                .trim();
            if (normalized === "") return blankAsZero ? 0 : Number.NaN;
            if (!/^\d+(?:\.\d*)?$/.test(normalized)) return Number.NaN;
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? parsed : Number.NaN;
        };

        const blockedFinancialKeys = new Set(["-", "+", "*", "e", "E"]);
        const sanitizeFinancialInput = (input) => {
            const raw = String(input?.value ?? "");
            if (/[+\-*eE]/.test(raw) || Number(raw) < 0) input.value = "";
        };

        const readFormState = () => {
            const invoiceNumber =
                document.getElementById("supplierInvoiceNumber")?.value.trim() || "";
            const invoiceDateInput = document.getElementById("supplierInvoiceDate");
            const discount = parseInvoiceAmount(
                document.getElementById("supplierInvoiceDiscount")?.value,
                true,
            );
            const charges = parseInvoiceAmount(
                document.getElementById("supplierInvoiceCharges")?.value,
                true,
            );
            const invoiceItems = Array.from(
                document.querySelectorAll("#supplierInvoiceLines tr"),
            ).map((row) => ({
                po_item_id: row.dataset.poItemId,
                order_qty: parseInvoiceAmount(row.dataset.orderQty),
                invoice_qty: parseInvoiceAmount(row.querySelector(".invoice-qty")?.value),
                unit_cost: parseInvoiceAmount(row.querySelector(".invoice-unit-cost")?.value),
                row,
            }));
            return {
                invoiceNumber,
                invoiceDate: invoiceDateInput?.value || "",
                validDate: Boolean(invoiceDateInput?.value && invoiceDateInput.checkValidity()),
                discount,
                charges,
                invoiceItems,
            };
        };

        const updateInvoiceState = () => {
            const state = readFormState();
            let subtotal = 0;
            state.invoiceItems.forEach((item) => {
                const quantityValid =
                    Number.isFinite(item.invoice_qty) &&
                    item.invoice_qty >= 0 &&
                    item.row.querySelector(".invoice-qty").checkValidity();
                const lineValid =
                    quantityValid && Number.isFinite(item.unit_cost) && item.unit_cost > 0;
                item.row
                    .querySelector(".invoice-qty")
                    .classList.toggle("is-invalid", !quantityValid);
                const lineTotal = lineValid
                    ? Math.round(item.invoice_qty * item.unit_cost * 100) / 100
                    : 0;
                subtotal += lineTotal;
                item.row.querySelector(".supplier-invoice-line-total").textContent =
                    peso(lineTotal);
                item.row
                    .querySelector(".invoice-unit-cost")
                    ?.classList.toggle("is-invalid", !lineValid);
                const costError = item.row.querySelector(".supplier-invoice-cost-error");
                if (costError) costError.hidden = lineValid;
            });
            subtotal = Math.round(subtotal * 100) / 100;
            const rawCalculated =
                Math.round((subtotal - state.discount + state.charges) * 100) / 100;
            const calculated = Number.isFinite(rawCalculated) ? Math.max(0, rawCalculated) : 0;
            document.getElementById("supplierInvoiceSubtotal").textContent = peso(subtotal);
            document.getElementById("supplierInvoiceCalculated").textContent = peso(calculated);

            const formValid =
                Boolean(state.invoiceNumber && state.validDate) &&
                state.invoiceItems.length > 0 &&
                state.invoiceItems.every(
                    (item) => Number.isFinite(item.order_qty) && item.order_qty > 0,
                ) &&
                state.invoiceItems.every(
                    (item) =>
                        Number.isFinite(item.invoice_qty) &&
                        item.invoice_qty >= 0 &&
                        item.row.querySelector(".invoice-qty").checkValidity(),
                ) &&
                state.invoiceItems.every(
                    (item) => Number.isFinite(item.unit_cost) && item.unit_cost > 0,
                ) &&
                Number.isFinite(state.discount) &&
                state.discount >= 0 &&
                Number.isFinite(state.charges) &&
                state.charges >= 0 &&
                Number.isFinite(rawCalculated) &&
                rawCalculated > 0;
            const numberInput = document.getElementById("supplierInvoiceNumber");
            const numberError = document.getElementById("supplierInvoiceNumberError");
            const dateInput = document.getElementById("supplierInvoiceDate");
            const dateError = document.getElementById("supplierInvoiceDateError");
            numberInput?.classList.toggle("is-invalid", !state.invoiceNumber);
            if (numberError) numberError.hidden = Boolean(state.invoiceNumber);
            dateInput?.classList.toggle("is-invalid", !state.validDate);
            if (dateError) dateError.hidden = state.validDate;

            const validation = document.getElementById("supplierInvoiceValidation");
            const firstError = !state.invoiceNumber
                ? "Enter the required invoice number."
                : !state.validDate
                  ? "Enter a valid invoice date."
                  : !state.invoiceItems.length
                    ? "This purchase order has no invoice lines."
                    : !state.invoiceItems.every(
                            (item) =>
                                Number.isFinite(item.invoice_qty) &&
                                item.invoice_qty >= 0 &&
                                item.row.querySelector(".invoice-qty").checkValidity(),
                        )
                      ? "Enter valid invoice quantities of zero or greater."
                      : !state.invoiceItems.every(
                              (item) => Number.isFinite(item.unit_cost) && item.unit_cost > 0,
                          )
                        ? "Enter a supplier unit cost greater than zero for every line."
                        : !Number.isFinite(state.discount) || state.discount < 0
                          ? "Discount must be zero or greater."
                          : !Number.isFinite(state.charges) || state.charges < 0
                            ? "Other charges must be zero or greater."
                            : !Number.isFinite(rawCalculated) || rawCalculated <= 0
                              ? "Final invoice total must be greater than zero."
                              : "";
            validation.className = `supplier-invoice-validation ${formValid ? "match" : "neutral"}`;
            validation.innerHTML = formValid
                ? `<strong>✓ Ready to save</strong><span>Final invoice total: ${peso(calculated)}</span>`
                : `<strong>${escapeHtml(firstError || "Complete the required invoice information.")}</strong>`;
            const confirmButton = Swal.getConfirmButton();
            if (confirmButton) confirmButton.disabled = !formValid;
            return { ...state, calculated, formValid };
        };

        const result = await Swal.fire({
            title: `${invoice.invoice_id ? "Edit" : "Record"} Supplier Invoice`,
            html,
            showCloseButton: true,
            showCancelButton: true,
            reverseButtons: true,
            confirmButtonText: "Save Supplier Invoice",
            cancelButtonText: "Cancel",
            confirmButtonColor: "#4f46e5",
            width: 1050,
            customClass: {
                popup: "supplier-invoice-modal",
                htmlContainer: "supplier-invoice-modal-body",
                actions: "supplier-invoice-footer",
                confirmButton: "supplier-invoice-save-button",
            },
            didOpen: () => {
                const form = document.querySelector(".supplier-invoice-form");
                form?.addEventListener("keydown", (event) => {
                    if (
                        event.target.matches(".invoice-financial-input") &&
                        blockedFinancialKeys.has(event.key)
                    )
                        event.preventDefault();
                });
                form?.addEventListener("input", (event) => {
                    if (event.target.matches(".invoice-financial-input"))
                        sanitizeFinancialInput(event.target);
                });
                form?.addEventListener("input", updateInvoiceState);
                form?.addEventListener("change", updateInvoiceState);
                updateInvoiceState();
            },
            preConfirm: () => {
                const state = updateInvoiceState();
                if (!state.formValid) {
                    Swal.showValidationMessage(
                        "Complete the invoice number, date, every supplier unit cost, and a supplier invoice total greater than zero.",
                    );
                    return false;
                }
                return {
                    po_id: poId,
                    invoice_number: state.invoiceNumber,
                    invoice_date: state.invoiceDate,
                    discount: state.discount,
                    other_charges: state.charges,
                    supplier_invoice_total: state.calculated,
                    items: state.invoiceItems.map((item) => ({
                        po_item_id: item.po_item_id,
                        unit_cost: item.unit_cost,
                        invoice_qty: item.invoice_qty,
                    })),
                };
            },
        });
        if (!result.isConfirmed) return;
        const saved = await fetchJson(
            `${API_BASE_URL}/purchase_orders/save_purchase_order_invoice.php`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(result.value),
            },
        );
        PharmaUtils.toast.success(saved.message);
        await refreshPurchaseOrderRow(poId);
        const refreshedOrder = await getPurchaseOrder(poId);
        if (String(activeViewOrder?.po_id || "") === String(poId)) {
            activeViewOrder = refreshedOrder;
            window.__purchaseOrderPreviewCache.set(String(poId), refreshedOrder);
            renderPoOrderSummary(refreshedOrder);
            await Promise.all([
                renderPoSupplierInvoice(refreshedOrder),
                renderPoPaymentSummary(refreshedOrder),
            ]);
        } else {
            await fetchJson(
                `${API_BASE_URL}/purchase_orders/get_purchase_order_invoice.php?po_id=${encodeURIComponent(poId)}`,
            );
        }
    } catch (error) {
        PharmaUtils.toast.error(error.message);
    }
}

function receiveBatchRow(batch = {}, requiresExpiry = false, autoAllocate = false) {
    const noExpiry = batch.no_expiry === true;
    return `
        <div class="receive-batch-row" data-auto-allocation="${autoAllocate ? "1" : "0"}">
            <div class="receive-field"><label>Batch Identifier <span class="text-muted">(optional)</span></label><input class="form-control form-control-sm receive-batch-id" maxlength="50" value="${escapeHtml(batch.batch_identifier || "")}" placeholder="Supplier batch or auto-generated"></div>
            <div class="receive-field"><label>Batch Quantity</label><input class="form-control form-control-sm receive-batch-qty" type="number" min="1" step="1" value="${escapeHtml(batch.quantity ?? "")}"></div>
            <div class="receive-field receive-expiry-field"><label>Expiry Date <span class="text-muted">(optional)</span></label><input class="form-control form-control-sm receive-batch-expiry" type="date" min="${localTodayDateString()}" value="${escapeHtml(batch.expiry_date || "")}" ${noExpiry ? "disabled" : ""}><span class="receive-no-expiry-display" ${noExpiry ? "" : "hidden"}>N/A — No Expiry</span></div>
            <div>
                <label class="receive-no-expiry"><input class="form-check-input receive-batch-no-expiry" type="checkbox" ${noExpiry ? "checked" : ""}> No Expiry Date</label>
                <button class="btn btn-sm btn-outline-danger receive-remove-batch" type="button" title="Remove batch" aria-label="Remove batch"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
}

function receiveQuantityModel(orderItem = {}, values = {}) {
    const conversion = purchasingConversion({
        purchase_unit: orderItem.purchase_unit,
        inventory_unit: orderItem.unit || "unit",
        units_per_purchase_unit: orderItem.units_per_purchase_unit || 1,
    });
    const ordered = Number(orderItem.inventory_qty_ordered || orderItem.quantity || 0);
    const orderedPurchase = Number(
        orderItem.purchase_qty || ordered / conversion.baseQtyPerPurchaseUnit || 0,
    );
    const hasPurchaseValue = Object.prototype.hasOwnProperty.call(
        values,
        "delivered_purchase_quantity",
    );
    const hasLegacyValue =
        Object.prototype.hasOwnProperty.call(values, "delivered_quantity") ||
        Object.prototype.hasOwnProperty.call(values, "received_quantity");
    const deliveredPurchase = Number(
        hasPurchaseValue
            ? values.delivered_purchase_quantity
            : hasLegacyValue
              ? Number(values.delivered_quantity ?? values.received_quantity ?? 0) /
                conversion.baseQtyPerPurchaseUnit
              : orderedPurchase,
    );
    const delivered = inventoryQuantityFromPurchase(deliveredPurchase, conversion);
    const damaged = Math.max(
        0,
        Number(values.damaged_base_quantity ?? values.damaged_quantity ?? 0),
    );
    const action = Math.max(
        0,
        Number(values.action_base_quantity ?? values.action_quantity ?? damaged),
    );
    const missing = Math.max(0, ordered - delivered);
    const affected = Math.max(action, damaged) + missing;
    const legacyResolution = values.resolution || "none";
    const resolution =
        {
            return_for_replacement: "replacement",
            return_for_credit: "supplier_credit",
            keep_with_discount: "supplier_credit",
            reject_without_replacement: "no_compensation",
            keep_damaged: "no_compensation",
        }[legacyResolution] || legacyResolution;
    const legacyDisposition = values.disposition || values.damage_action || "";
    const disposition =
        { return: "return_to_supplier", keep: "hold_quarantine" }[legacyDisposition] ||
        legacyDisposition;
    const returned = disposition === "return_to_supplier" ? action : 0;
    const disposed = disposition === "dispose" ? action : 0;
    const quarantined = disposition === "hold_quarantine" ? action : 0;
    const accepted = Math.max(0, delivered - action);
    const resolved = affected > 0 && resolution !== "none" ? affected : 0;
    const unitPrice = Number(orderItem.price || 0);
    return {
        ordered,
        orderedPurchase,
        deliveredPurchase,
        delivered,
        damaged,
        action,
        missing,
        accepted,
        affected,
        disposition,
        resolution,
        returned,
        disposed,
        quarantined,
        resolved,
        unitPrice,
        conversion,
    };
}

function receiveConversionOptions(conversions, selectedId, inventoryUnit) {
    const rows =
        Array.isArray(conversions) && conversions.length
            ? conversions
            : [{ conversion_id: "", unit_name: inventoryUnit, base_quantity: 1 }];
    return rows
        .map((entry) => {
            const factor = Number(entry.base_quantity || 1);
            const label = `${entry.unit_name} — ${factor} ${inventoryUnit}`;
            return `<option value="${escapeHtml(entry.conversion_id)}" data-base-quantity="${factor}" data-unit-name="${escapeHtml(entry.unit_name)}" ${String(entry.conversion_id) === String(selectedId) ? "selected" : ""}>${escapeHtml(label)}</option>`;
        })
        .join("");
}

function receiveUnitCountLabel(quantity, unitName) {
    const count = Number(quantity || 0);
    const unit = String(unitName || "unit");
    if (count === 1 || /^pc(s)?$/i.test(unit)) return `${count} ${unit}`;
    if (/[^aeiou]y$/i.test(unit)) return `${count} ${unit.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/i.test(unit)) return `${count} ${unit}es`;
    return `${count} ${unit}s`;
}

function receiveBaseQuantityBreakdown(quantity, conversions, inventoryUnit) {
    let remaining = Math.max(0, Math.trunc(Number(quantity || 0)));
    const rows = (Array.isArray(conversions) ? [...conversions] : [])
        .filter((entry) => Number(entry.base_quantity || 0) > 0)
        .sort((left, right) => Number(right.base_quantity) - Number(left.base_quantity));
    const parts = [];
    rows.forEach((entry) => {
        const factor = Number(entry.base_quantity);
        const count = Math.floor(remaining / factor);
        if (count <= 0) return;
        parts.push(receiveUnitCountLabel(count, entry.unit_name));
        remaining -= count * factor;
    });
    if (remaining > 0 || !parts.length) parts.push(receiveUnitCountLabel(remaining, inventoryUnit));
    return parts.join(" + ");
}

function receiveReceivedHierarchy(purchaseQuantity, conversion, conversions) {
    const receivedBase = inventoryQuantityFromPurchase(Number(purchaseQuantity || 0), conversion);
    const parts = (Array.isArray(conversions) ? [...conversions] : [])
        .filter(
            (entry) =>
                Number(entry.base_quantity || 0) > 0 &&
                receivedBase % Number(entry.base_quantity) === 0,
        )
        .sort((left, right) => Number(right.base_quantity) - Number(left.base_quantity))
        .map((entry) =>
            receiveUnitCountLabel(receivedBase / Number(entry.base_quantity), entry.unit_name),
        );
    const receivedLabel = receiveUnitCountLabel(purchaseQuantity, conversion.purchaseUnit);
    const remainder = parts.filter((part) => part !== receivedLabel);
    return `${receivedLabel} received${remainder.length ? ` = ${remainder.join(" = ")}` : ""}`;
}

function receiveDamageBatchOptions(batches = [], selectedIndex = "") {
    if (!batches.length) return '<option value="">Assign during Batch &amp; Expiry</option>';
    const placeholder =
        batches.length > 1
            ? `<option value="" ${selectedIndex === "" || selectedIndex === null ? "selected" : ""}>Select batch/lot...</option>`
            : "";
    return (
        placeholder +
        batches
            .map((batch, index) => {
                const identifier = String(batch?.batch_identifier || "").trim();
                const label =
                    identifier ||
                    (batches.length === 1
                        ? "Assign during Batch & Expiry"
                        : `Batch ${index + 1} — assign in Step 2`);
                const selected =
                    String(selectedIndex) === String(index) ||
                    (selectedIndex === "" && batches.length === 1);
                return `<option value="${index}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
            })
            .join("")
    );
}

function receivePackageSequenceOptions(
    receivedPurchaseQuantity,
    purchaseUnit,
    selectedSequence = "",
) {
    const total = Math.max(0, Math.trunc(Number(receivedPurchaseQuantity || 0)));
    const unit = String(purchaseUnit || "Package");
    let options = `<option value="" ${selectedSequence === "" || selectedSequence === null ? "selected" : ""}>Select ${escapeHtml(unit)}...</option>`;
    for (let sequence = 1; sequence <= total; sequence += 1) {
        options += `<option value="${sequence}" ${Number(selectedSequence) === sequence ? "selected" : ""}>${escapeHtml(`${unit} ${sequence} of ${total}`)}</option>`;
    }
    return options;
}

function receiveDamageLineRow(
    line,
    conversions,
    inventoryUnit,
    purchaseUnit = "",
    receivedPurchaseQuantity = 0,
    batches = [],
) {
    const rows =
        Array.isArray(conversions) && conversions.length
            ? conversions
            : [{ conversion_id: "", unit_name: inventoryUnit, base_quantity: 1 }];
    const base = rows.find((entry) => Number(entry.base_quantity) === 1) || rows[rows.length - 1];
    const purchaseConversion =
        rows.find(
            (entry) => String(entry.unit_name).toLowerCase() === String(purchaseUnit).toLowerCase(),
        ) ||
        [...rows].sort(
            (left, right) => Number(right.base_quantity) - Number(left.base_quantity),
        )[0];
    const innerUnits = rows.filter(
        (entry) => Number(entry.base_quantity) < Number(purchaseConversion?.base_quantity || 1),
    );
    const defaultDamaged =
        [...innerUnits].sort(
            (left, right) => Number(right.base_quantity) - Number(left.base_quantity),
        )[0] || base;
    const selectedDamaged =
        rows.find(
            (entry) => String(entry.conversion_id) === String(line?.damaged_unit_conversion_id),
        ) || defaultDamaged;
    const packageSequence = line?.package_sequence ?? line?.sequence_no ?? "";
    return `<div class="receive-damage-line">
        <div class="receive-field"><label>Affected Package</label><select class="form-select damage-package-sequence" aria-label="Affected physical package">${receivePackageSequenceOptions(receivedPurchaseQuantity, purchaseUnit, packageSequence)}</select></div>
        <div class="receive-field"><label>Damaged Quantity</label><div class="receive-damage-pair"><input class="form-control damage-line-qty" type="number" min="1" step="1" value="${escapeHtml(line?.damaged_quantity ?? "")}" placeholder="Qty" aria-label="Damaged product quantity"><select class="form-select damage-unit-conversion" aria-label="Damaged product unit">${rows.map((entry) => `<option value="${escapeHtml(entry.conversion_id)}" data-base-quantity="${Number(entry.base_quantity || 1)}" data-unit-name="${escapeHtml(entry.unit_name)}" ${String(entry.conversion_id) === String(selectedDamaged?.conversion_id) ? "selected" : ""}>${escapeHtml(entry.unit_name)}</option>`).join("")}</select></div><small class="receive-field-error damage-line-error"></small></div>
        <div class="receive-field"><label>Batch/Lot</label><select class="form-select damage-batch-index">${receiveDamageBatchOptions(batches, line?.batch_index ?? "")}</select></div>
        <button class="btn btn-sm btn-outline-danger receive-remove-damage-line" type="button" title="Remove affected package" aria-label="Remove affected package"><i class="fa-solid fa-trash"></i></button>
    </div>`;
}

function syncReceivePackageSequenceSelectors(card) {
    const orderItem = activeReceiveOrder?.items.find(
        (item) => String(item.po_item_id) === String(card.dataset.poItemId),
    );
    const purchaseUnit = purchasingConversion(orderItem || {}).purchaseUnit;
    const receivedPurchaseQuantity = Number(card.querySelector(".receive-qty-input")?.value || 0);
    const selects = [...card.querySelectorAll(".damage-package-sequence")];
    const selected = selects.map((select) => select.value).filter(Boolean);
    selects.forEach((select) => {
        const current = select.value;
        select.innerHTML = receivePackageSequenceOptions(
            receivedPurchaseQuantity,
            purchaseUnit,
            current,
        );
        select.querySelectorAll("option[value]").forEach((option) => {
            if (!option.value || option.value === current) return;
            option.disabled = selected.includes(option.value);
        });
    });
}

function syncReceiveDamageBatchSelectors(card) {
    const batches = [...card.querySelectorAll(".receive-batch-row")].map((row) => ({
        batch_identifier: row.querySelector(".receive-batch-id")?.value || "",
    }));
    card.querySelectorAll(".damage-batch-index").forEach((select) => {
        const selected = select.value;
        select.innerHTML = receiveDamageBatchOptions(batches, selected);
    });
}

function receiveQuantityValuesWithConversions(orderItem, values = {}) {
    const conversions = Array.isArray(orderItem?.package_conversions)
        ? orderItem.package_conversions
        : [];
    const factorFor = (conversionId) =>
        Number(
            conversions.find((entry) => String(entry.conversion_id) === String(conversionId))
                ?.base_quantity || 1,
        );
    if (
        !Object.prototype.hasOwnProperty.call(values, "action_quantity") &&
        !values.damaged_unit_conversion_id
    )
        return values;
    return {
        ...values,
        damaged_base_quantity:
            Number(values.damaged_quantity || 0) * factorFor(values.damaged_unit_conversion_id),
        action_base_quantity:
            Number(values.action_quantity || 0) * factorFor(values.action_unit_conversion_id),
    };
}

function renderReceiveItems(order) {
    const container = document.getElementById("receiveInspectionCards");
    if (!container) return;
    container.innerHTML = (order.items || [])
        .map((item, index) => {
            const draft = receiveDraftItem(item);
            const packageConversions = Array.isArray(item.package_conversions)
                ? item.package_conversions
                : [];
            const baseConversion = packageConversions.find(
                (entry) => Number(entry.base_quantity) === 1,
            ) ||
                packageConversions[packageConversions.length - 1] || {
                    conversion_id: "",
                    unit_name: item.unit || "unit",
                    base_quantity: 1,
                };
            const actionConversion =
                packageConversions.find(
                    (entry) =>
                        entry.conversion_id ===
                        (draft.action_unit_conversion_id || draft.unit_conversion_id),
                ) || baseConversion;
            const legacySelectedQuantity = draft.affected_quantity ?? "";
            const damageLines = Array.isArray(draft.damage_lines) ? draft.damage_lines : [];
            if (
                !damageLines.length &&
                Number(draft.damaged_base_quantity || draft.damaged_quantity || 0) > 0
            ) {
                damageLines.push({
                    affected_unit_conversion_id:
                        draft.damaged_unit_conversion_id || baseConversion.conversion_id,
                    damaged_quantity: Number(
                        draft.damaged_base_quantity || draft.damaged_quantity || 0,
                    ),
                    damaged_unit_conversion_id: baseConversion.conversion_id,
                });
            }
            const actionInput = draft.action_quantity ?? legacySelectedQuantity;
            const damagedBase = damageLines.reduce(
                (sum, line) =>
                    sum +
                    Number(line.damaged_quantity || 0) *
                        Number(
                            packageConversions.find(
                                (entry) =>
                                    String(entry.conversion_id) ===
                                    String(line.damaged_unit_conversion_id),
                            )?.base_quantity || 1,
                        ),
                0,
            );
            const actionBase =
                Number(actionInput || 0) * Number(actionConversion.base_quantity || 1);
            const quantities = receiveQuantityModel(item, {
                ...draft,
                damaged_base_quantity: damagedBase,
                action_base_quantity: actionBase,
            });
            const {
                ordered,
                orderedPurchase,
                deliveredPurchase,
                delivered,
                damaged,
                accepted,
                conversion,
            } = quantities;
            const requiresExpiry = isMedicineItem(item);
            const batches =
                Array.isArray(draft.batches) && draft.batches.length
                    ? draft.batches
                    : accepted > 0
                      ? [
                            {
                                quantity: accepted,
                                expiry_date: "",
                                no_expiry: false,
                                auto_allocate: true,
                            },
                        ]
                      : [];
            const resolution = quantities.resolution;
            const disposition = quantities.disposition;
            const hasIssue =
                draft.has_issue === true ||
                draft.has_issue === 1 ||
                draft.has_issue === "1" ||
                quantities.affected > 0;
            if (hasIssue && !damageLines.length) damageLines.push({});
            const storedIssueType = String(draft.issue_type || "");
            const draftIssueType = storedIssueType.startsWith("Other:") ? "Other" : storedIssueType;
            const draftIssueDetail = String(
                draft.issue_detail ||
                    (storedIssueType.startsWith("Other:") ? storedIssueType.slice(6).trim() : ""),
            );
            const productName = productTableProductName(item);
            const brandName = productTableBrand(item);
            const subtitle = [
                productSpecification(item),
                productSizeValue(item),
                unitDisplayFromDetails(item),
                productPackagingValue(item),
            ]
                .filter(Boolean)
                .join(" · ");
            return `
        <article class="receive-item-card" data-product-index="${index}" data-po-item-id="${escapeHtml(item.po_item_id)}" data-requires-expiry="${requiresExpiry ? "1" : "0"}" data-has-draft="${Object.keys(draft).length ? "1" : "0"}" ${index === 0 ? "" : "hidden"}>
            <button class="receive-card-toggle" type="button" aria-expanded="${index === 0 ? "true" : "false"}">
                <span class="receive-item-index">${index + 1}</span>
                <span class="receive-card-title"><strong>${escapeHtml([brandName, productName].filter(Boolean).join(" — "))}</strong><small>${escapeHtml(subtitle || quantityWithInventoryUnit(item, ordered))}</small></span>
                <span class="receive-item-result">
                    <span>Ordered<b class="receive-header-ordered">${orderedPurchase} ${escapeHtml(conversion.purchaseUnit)}</b></span>
                    <span>Accepted<b class="receive-header-accepted">${accepted} ${escapeHtml(conversion.inventoryUnit)}</b></span>
                    <span>Unavailable<b class="receive-header-affected">${quantities.affected} ${escapeHtml(conversion.inventoryUnit)}</b></span>
                </span>
                <span class="receive-status-stack"><span class="receive-inspection-badge">Waiting</span><span class="receive-issue-flag d-none">Issue Found</span></span>
            </button>
            ${inactivePoProductWarning(item)}
            <div class="receive-card-body ${index === 0 ? "" : "d-none"}">
                <div class="receive-product-facts">
                    <div><span>Brand</span><strong>${escapeHtml(brandName || "-")}</strong></div>
                    <div><span>Product</span><strong>${escapeHtml(productName || "-")}</strong></div>
                    <div><span>Specification</span><strong>${escapeHtml(productSpecification(item) || "-")}</strong></div>
                    <div><span>Purchase Unit</span><strong>${escapeHtml(conversion.purchaseUnit)}</strong></div>
                    <div><span>Inventory Equivalent</span><strong>${ordered} ${escapeHtml(conversion.inventoryUnit)}</strong></div>
                </div>
                <div class="receive-form-grid">
                    <section class="receive-process-card receiving-inspection-card receive-scroll-target">
                        <div class="section-card-heading"><span class="section-card-icon inspection"><i class="fa-solid fa-clipboard-check"></i></span><div><span class="section-eyebrow">Step 1</span><h3>Inspect Product</h3></div></div>
                        <div class="receive-quantity-grid receive-arrival-grid">
                            <div class="receive-field receive-quantity-anchor"><label>Received ${escapeHtml(conversion.purchaseUnit)} Qty</label><div class="receive-actual-control"><input class="form-control receive-qty-input" type="number" min="0" max="${escapeHtml(orderedPurchase)}" step="1" value="${escapeHtml(deliveredPurchase)}"><span>${escapeHtml(conversion.purchaseUnit)}</span></div><small class="receive-inventory-equivalent">${escapeHtml(receiveReceivedHierarchy(deliveredPurchase, conversion, packageConversions))}</small><small class="receive-field-error receive-qty-error"></small></div>
                            <div class="receive-field receive-any-issue-field"><label>Any Issue?</label><select class="form-select receive-issue-toggle" aria-label="Any Issue"><option value="0" ${hasIssue ? "" : "selected"}>No</option><option value="1" ${hasIssue ? "selected" : ""}>Yes</option></select><small class="receive-shortage-note">${quantities.missing > 0 ? `Short by ${quantities.missing} ${escapeHtml(conversion.inventoryUnit)}` : "No shortage detected."}</small></div>
                        </div>
                    </section>
                    <div class="receive-field receive-inspection-action receive-scroll-target">
                        <label>Inspection Status</label>
                        <div class="receive-inspection-control">
                            <span class="receive-readiness-text">Complete the required checks below.</span>
                            <button class="btn btn-sm btn-primary receive-complete-inspection" type="button" disabled><i class="fa-solid fa-clipboard-check me-1"></i>Complete Product Inspection</button>
                            <span class="receive-completed-action d-none"><i class="fa-solid fa-circle-check me-1"></i>Inspection Complete</span>
                            <button class="btn btn-sm btn-outline-secondary receive-reopen-inspection d-none" type="button"><i class="fa-solid fa-pen me-1"></i>Reopen Inspection</button>
                            <input class="receive-inspected-input" type="hidden" value="${draft.inspection_complete ? "1" : "0"}">
                        </div>
                    </div>
                    <section class="receive-issue-panel receive-process-card receive-scroll-target ${hasIssue ? "" : "d-none"}">
                        <div class="section-card-heading"><span class="section-card-icon issue"><i class="fa-solid fa-triangle-exclamation"></i></span><div><span class="section-eyebrow">Issue</span><h3>Issue Details</h3></div></div>
                        <div class="receive-damage-breakdown receive-damage-anchor">
                            <div class="receive-damage-breakdown-head"><div><strong>Affected Goods Breakdown</strong><small>Record affected packaging separately from unavailable contents.</small></div><button class="btn btn-sm btn-outline-primary receive-add-damage-line" type="button"><i class="fa-solid fa-plus me-1"></i>Add Another Affected Package</button></div>
                            <div class="receive-damage-lines">${damageLines.map((line) => receiveDamageLineRow(line, packageConversions, conversion.inventoryUnit, conversion.purchaseUnit, deliveredPurchase, batches)).join("")}</div>
                            <div class="receive-damage-totals"><span>Affected Package: <strong class="receive-affected-package-count">None</strong></span><span>Damaged: <strong class="damaged-base-equivalent">${damagedBase} ${escapeHtml(conversion.inventoryUnit)}</strong></span><span>Unavailable from Inventory: <strong class="receive-unavailable-equivalent">${damagedBase} ${escapeHtml(conversion.inventoryUnit)}</strong></span><span>Accepted to Inventory: <strong class="receive-damage-accepted">${accepted} ${escapeHtml(conversion.inventoryUnit)}</strong></span></div>
                            <small class="receive-field-error receive-damaged-error"></small>
                        </div>
                        <div class="receive-field receive-issue-type-field"><label>Issue Type *</label><select class="form-select receive-issue-type"><option value="">Select issue...</option>${RECEIVE_ISSUE_TYPES.map((value) => `<option value="${value}" ${draftIssueType === value ? "selected" : ""}>${value}</option>`).join("")}</select><small class="receive-field-error receive-issue-type-error"></small></div>
                        <div class="receive-field receive-disposition-field"><label>Affected Goods Action *</label><select class="form-select receive-disposition"><option value="">Select action...</option>${RECEIVE_DISPOSITIONS.map(([value, label]) => `<option value="${value}" ${disposition === value ? "selected" : ""}>${label}</option>`).join("")}<option value="not_applicable" ${disposition === "not_applicable" ? "selected" : ""}>Not Applicable</option></select><small class="receive-field-error receive-disposition-error"></small></div>
                        <div class="receive-field receive-action-quantity-field ${disposition && disposition !== "not_applicable" ? "" : "d-none"}"><label>Unavailable Qty</label><div class="receive-actual-control"><input class="form-control action-qty-input" type="number" min="0" step="1" value="${escapeHtml(actionInput)}" readonly aria-label="Unavailable inventory quantity calculated from damaged contents"><span>${escapeHtml(conversion.inventoryUnit)}</span></div><small class="action-base-equivalent">Calculated from damaged contents.</small><small class="receive-field-error receive-action-error"></small></div>
                        <div class="receive-field receive-resolution-field"><label>Supplier Resolution *</label><select class="form-select receive-resolution"><option value="none">Select resolution...</option>${RECEIVE_RESOLUTIONS.map(([value, label]) => `<option value="${value}" ${resolution === value ? "selected" : ""}>${label}</option>`).join("")}</select><small class="receive-field-error receive-resolution-error"></small></div>
                        <div class="receive-field receive-confirmed-adjustment-field ${["supplier_credit", "next_po_credit", "refund"].includes(resolution) ? "" : "d-none"}"><label class="receive-confirmed-adjustment-label">${resolution === "next_po_credit" ? "Confirmed Future Supplier Credit" : resolution === "refund" ? "Confirmed Refund Due" : "Confirmed Current Discount"} *</label><div class="input-group"><span class="input-group-text">₱</span><input class="form-control receive-confirmed-adjustment" type="number" min="0.01" step="0.01" value="${escapeHtml(draft.confirmed_adjustment || "")}" placeholder="0.00"></div><small>Enter the amount confirmed by the supplier. It is not calculated from damaged quantity.</small><small class="receive-field-error receive-adjustment-error"></small></div>
                        <div class="receive-field receive-other-issue-field ${draftIssueType === "Other" ? "" : "d-none"}"><label>Specify Issue *</label><input class="form-control receive-issue-other" maxlength="70" value="${escapeHtml(draftIssueDetail)}" placeholder="Describe the issue"><small class="receive-field-error receive-other-error"></small></div>
                        <div class="receive-field receive-item-remarks-field"><label>Item Remarks</label><textarea class="form-control receive-remarks-input" rows="3" placeholder="Optional details about the discrepancy or supplier agreement...">${escapeHtml(draft.remarks || "")}</textarea></div>
                    </section>
                    <section class="receive-accepted-panel accepted-field">
                        <label>Accepted to Inventory</label><div class="receive-calculated receive-accepted-qty">${accepted} ${escapeHtml(conversion.inventoryUnit)} total</div><small class="receive-accepted-source">${actionBase > 0 ? `${delivered} ${escapeHtml(conversion.inventoryUnit)} received − ${actionBase} ${escapeHtml(conversion.inventoryUnit)} unavailable` : `Equivalent remaining: ${escapeHtml(receiveBaseQuantityBreakdown(accepted, packageConversions, conversion.inventoryUnit))}`}</small><small class="receive-accepted-equivalent ${actionBase > 0 ? "" : "d-none"}">Equivalent remaining: ${escapeHtml(receiveBaseQuantityBreakdown(accepted, packageConversions, conversion.inventoryUnit))}</small>
                    </section>
                    <section class="receive-batches receive-process-card receive-scroll-target">
                        <div class="receive-batches-head"><div class="section-card-heading"><span class="section-card-icon inventory"><i class="fa-solid fa-boxes-stacked"></i></span><div><span class="section-eyebrow">Step 2</span><h3>Batch &amp; Expiry</h3></div></div><button class="btn btn-sm btn-outline-primary receive-add-batch" type="button"><i class="fa-solid fa-plus me-1"></i>Add Batch</button></div>
                        <div class="receive-allocation-summary"><strong class="receive-allocation-state">Allocated 0 / ${accepted}</strong><span class="receive-allocation-badge">Incomplete</span></div><div class="receive-allocation-reason">${accepted} units remaining.</div>
                        <div class="receive-batch-list">${batches.map((batch) => receiveBatchRow(batch, requiresExpiry, batch.auto_allocate === true || (batches.length === 1 && batch.auto_allocate !== false))).join("")}</div>
                    </section>
                </div>
            </div>
        </article>`;
        })
        .join("");
    const navigator = document.getElementById("receiveProductNavigator");
    if (navigator) {
        navigator.innerHTML = (order.items || [])
            .map((item, index) => {
                const draft = receiveDraftItem(item);
                const name = [productTableBrand(item), productTableProductName(item)]
                    .filter(Boolean)
                    .join(" — ");
                return `<button class="product-nav-item${index === 0 ? " is-active" : ""}" type="button" data-product-index="${index}"><span class="product-nav-index">${index + 1}</span><span class="product-nav-copy"><strong>${escapeHtml(name || `Product ${index + 1}`)}</strong><small>${draft.inspection_complete ? "Inspection Complete" : Object.keys(draft).length ? "Inspection in Progress" : "Not Started"}</small></span><i class="fa-solid ${draft.inspection_complete ? "fa-circle-check" : "fa-circle"} product-nav-state"></i></button>`;
            })
            .join("");
    }
    activeInspectionProductIndex = 0;
    showReceiveProduct(0, false);
}

function orderTotal(order) {
    return (order?.items || []).reduce((total, item) => total + productLineTotal(item), 0);
}

function setReceiveCardLocked(card, locked) {
    card.classList.toggle("is-locked", locked);
    card.querySelectorAll(
        ".receiving-inspection-card input, .receive-issue-panel input, .receive-issue-panel select, .receive-issue-panel textarea",
    ).forEach((control) => {
        if (locked) {
            control.disabled = true;
            return;
        }
        control.disabled = false;
    });
}

function setReceiveControlValidation(control, invalid, message = "") {
    if (!control) return;
    control.classList.toggle("receive-invalid-control", invalid);
    control.setAttribute("aria-invalid", invalid ? "true" : "false");
    const field = control.closest(".receive-field");
    if (!field) return;
    let helper = field.querySelector(":scope > .receive-required-message");
    if (!helper) {
        helper = document.createElement("small");
        helper.className = "receive-required-message";
        field.appendChild(helper);
    }
    helper.textContent = invalid ? message : "";
}

function receiveFormState(strict = true) {
    const state = {
        ordered: 0,
        received: 0,
        accepted: 0,
        affected: 0,
        remaining: 0,
        errors: [],
        hardErrors: [],
        items: [],
        taskTotal: 0,
        taskCompleted: 0,
        checks: { inspection: true, batches: true, confirmation: true },
        applicable: { inspection: true, batches: true, confirmation: true },
    };

    const deliveredByControl = document.getElementById("receiveDeliveredByName");
    const receiptControl = document.getElementById("receiveDeliveryReceiptNo");
    const showDeliveryErrors = strict && receiveValidationAttempted;
    const driverMissing = showDeliveryErrors && !String(deliveredByControl?.value || "").trim();
    const receiptMissing = showDeliveryErrors && !String(receiptControl?.value || "").trim();
    setReceiveControlValidation(deliveredByControl, driverMissing, "Driver name is required.");
    setReceiveControlValidation(
        receiptControl,
        receiptMissing,
        "Supplier delivery receipt no. is required.",
    );
    if (driverMissing) state.errors.push("Delivery Information: Driver name is missing.");
    if (receiptMissing)
        state.errors.push("Delivery Information: Supplier Delivery Receipt No. is missing.");
    document
        .querySelectorAll("#receiveInspectionCards .receive-item-card")
        .forEach((card, cardIndex) => {
            const productValidationAttempted =
                receiveValidationAttempted || card.dataset.validationAttempted === "1";
            const orderItem = activeReceiveOrder?.items.find(
                (item) => String(item.po_item_id) === String(card.dataset.poItemId),
            );
            syncReceiveDamageBatchSelectors(card);
            syncReceivePackageSequenceSelectors(card);
            const deliveredQuantityControl = card.querySelector(".receive-qty-input");
            const deliveredQuantityRaw = String(deliveredQuantityControl?.value ?? "").trim();
            const deliveredPurchase = Number(deliveredQuantityRaw || 0);
            const purchaseSetup = purchasingConversion(orderItem || {});
            const purchaseConversion =
                (orderItem?.package_conversions || []).find(
                    (entry) =>
                        String(entry.unit_name).toLowerCase() ===
                        String(purchaseSetup.purchaseUnit).toLowerCase(),
                ) ||
                [...(orderItem?.package_conversions || [])].sort(
                    (left, right) => Number(right.base_quantity) - Number(left.base_quantity),
                )[0] ||
                {};
            const affectedUnitBaseQuantity = Number(
                purchaseConversion.base_quantity || purchaseSetup.baseQtyPerPurchaseUnit || 1,
            );
            const damageLines = [];
            let damaged = 0;
            let damageLinesValid = true;
            const affectedPackages = [];
            const seenPackageSequences = new Set();
            [...card.querySelectorAll(".receive-damage-line")].forEach((row) => {
                const packageSequence = Number(
                    row.querySelector(".damage-package-sequence")?.value || 0,
                );
                const damagedQuantity = Number(row.querySelector(".damage-line-qty")?.value || 0);
                const damagedUnit = row.querySelector(".damage-unit-conversion");
                const damagedUnitConversionId = damagedUnit?.value || "";
                const damagedUnitBaseQuantity = Number(
                    damagedUnit?.selectedOptions?.[0]?.dataset.baseQuantity || 1,
                );
                const damagedBaseQuantity = damagedQuantity * damagedUnitBaseQuantity;
                const duplicatePackage =
                    packageSequence > 0 && seenPackageSequences.has(packageSequence);
                if (packageSequence > 0) seenPackageSequences.add(packageSequence);
                const rowValid =
                    Boolean(purchaseConversion.conversion_id && damagedUnitConversionId) &&
                    Number.isInteger(packageSequence) &&
                    packageSequence >= 1 &&
                    packageSequence <= deliveredPurchase &&
                    !duplicatePackage &&
                    Number.isInteger(damagedQuantity) &&
                    damagedQuantity > 0 &&
                    damagedBaseQuantity <= affectedUnitBaseQuantity;
                damageLinesValid = damageLinesValid && rowValid;
                damaged += Math.max(0, damagedBaseQuantity);
                if (packageSequence > 0)
                    affectedPackages.push(
                        `${purchaseSetup.purchaseUnit} ${packageSequence} of ${deliveredPurchase}`,
                    );
                const rowError = row.querySelector(".damage-line-error");
                if (rowError)
                    rowError.textContent = duplicatePackage
                        ? `${purchaseSetup.purchaseUnit} ${packageSequence} is already selected.`
                        : damagedBaseQuantity > affectedUnitBaseQuantity
                          ? `Damage cannot exceed ${affectedUnitBaseQuantity} ${orderItem?.unit || "units"} in one ${purchaseSetup.purchaseUnit}.`
                          : productValidationAttempted && !rowValid
                            ? "Select a physical package and enter a positive damaged quantity using a configured unit."
                            : "";
                row.querySelector(".damage-package-sequence")?.classList.toggle(
                    "is-invalid",
                    productValidationAttempted &&
                        (!Number.isInteger(packageSequence) ||
                            packageSequence < 1 ||
                            packageSequence > deliveredPurchase ||
                            duplicatePackage),
                );
                row.querySelector(".damage-line-qty")?.classList.toggle(
                    "is-invalid",
                    productValidationAttempted &&
                        (!Number.isInteger(damagedQuantity) ||
                            damagedQuantity <= 0 ||
                            damagedBaseQuantity > affectedUnitBaseQuantity),
                );
                setReceiveControlValidation(
                    row.querySelector(".damage-package-sequence"),
                    strict &&
                        productValidationAttempted &&
                        (!Number.isInteger(packageSequence) ||
                            packageSequence < 1 ||
                            packageSequence > deliveredPurchase ||
                            duplicatePackage),
                    "Select a valid affected package.",
                );
                setReceiveControlValidation(
                    row.querySelector(".damage-line-qty"),
                    strict &&
                        productValidationAttempted &&
                        (!Number.isInteger(damagedQuantity) ||
                            damagedQuantity <= 0 ||
                            damagedBaseQuantity > affectedUnitBaseQuantity),
                    "Enter a valid damaged quantity.",
                );
                const lineQuantityInput = row.querySelector(".damage-line-qty");
                if (lineQuantityInput)
                    lineQuantityInput.max = String(
                        Math.floor(affectedUnitBaseQuantity / Math.max(1, damagedUnitBaseQuantity)),
                    );
                const batchIndexValue = row.querySelector(".damage-batch-index")?.value ?? "";
                damageLines.push({
                    package_sequence: packageSequence,
                    sequence_no: packageSequence,
                    affected_quantity: 1,
                    affected_unit_conversion_id: purchaseConversion.conversion_id || "",
                    damaged_quantity: damagedQuantity,
                    damaged_unit_conversion_id: damagedUnitConversionId,
                    batch_index: batchIndexValue === "" ? null : Number(batchIndexValue),
                });
            });
            const baseConversion =
                (orderItem?.package_conversions || []).find(
                    (entry) => Number(entry.base_quantity) === 1,
                ) ||
                (orderItem?.package_conversions || []).slice(-1)[0] ||
                {};
            const damagedQuantity = damaged;
            const damagedUnitConversionId = baseConversion.conversion_id || "";
            let actionQuantity = Number(card.querySelector(".action-qty-input")?.value || 0);
            const actionUnit = card.querySelector(".action-unit-conversion");
            let actionUnitConversionId = actionUnit?.value || "";
            let actionUnitBaseQuantity = Number(
                actionUnit?.selectedOptions?.[0]?.dataset.baseQuantity || 1,
            );
            let issueSelected = card.querySelector(".receive-issue-toggle")?.value === "1";
            if (!issueSelected) damaged = 0;
            let action = issueSelected ? actionQuantity * actionUnitBaseQuantity : 0;
            const inspectionInput = card.querySelector(".receive-inspected-input");
            let inspected = inspectionInput?.value === "1";
            const issueType = card.querySelector(".receive-issue-type")?.value || "";
            const issueDetail = card.querySelector(".receive-issue-other")?.value.trim() || "";
            let disposition = card.querySelector(".receive-disposition")?.value || "";
            const resolution = card.querySelector(".receive-resolution")?.value || "none";
            const confirmedAdjustment = Number(
                card.querySelector(".receive-confirmed-adjustment")?.value || 0,
            );
            const physicalAction = ["return_to_supplier", "hold_quarantine", "dispose"].includes(
                disposition,
            );
            if (issueSelected && damaged > 0) {
                actionQuantity = damaged;
                actionUnitConversionId = baseConversion.conversion_id || actionUnitConversionId;
                actionUnitBaseQuantity = 1;
                action = damaged;
                const actionInput = card.querySelector(".action-qty-input");
                if (actionInput) actionInput.value = String(damaged);
                if (actionUnit && actionUnitConversionId) actionUnit.value = actionUnitConversionId;
            } else {
                actionQuantity = 0;
                action = 0;
            }
            let quantities = receiveQuantityModel(orderItem, {
                delivered_purchase_quantity: deliveredPurchase,
                damaged_base_quantity: damaged,
                action_base_quantity: action,
                disposition,
                resolution,
            });
            if (quantities.missing > 0) {
                issueSelected = true;
                const issueControl = card.querySelector(".receive-issue-toggle");
                if (issueControl) issueControl.value = "1";
                if (!disposition && damaged === 0) disposition = "not_applicable";
                const dispositionControl = card.querySelector(".receive-disposition");
                if (dispositionControl && !dispositionControl.value && damaged === 0)
                    dispositionControl.value = "not_applicable";
                quantities = receiveQuantityModel(orderItem, {
                    delivered_purchase_quantity: deliveredPurchase,
                    damaged_base_quantity: damaged,
                    action_base_quantity: action,
                    disposition,
                    resolution,
                });
            }
            const {
                ordered,
                orderedPurchase,
                delivered,
                missing,
                accepted,
                affected,
                returned,
                disposed,
                quarantined,
            } = quantities;
            const packageConversions = Array.isArray(orderItem?.package_conversions)
                ? orderItem.package_conversions
                : [];
            const itemRemarks = card.querySelector(".receive-remarks-input")?.value.trim() || "";
            const quantitiesComplete =
                deliveredQuantityRaw !== "" &&
                Number.isInteger(deliveredPurchase) &&
                deliveredPurchase >= 0 &&
                deliveredPurchase <= orderedPurchase &&
                damageLinesValid &&
                damaged <= delivered &&
                Number.isInteger(actionQuantity) &&
                actionQuantity >= 0 &&
                action <= delivered;
            const itemErrors = [];

            if (deliveredQuantityRaw === "") itemErrors.push("Received quantity is required.");
            else if (!Number.isInteger(deliveredPurchase) || deliveredPurchase < 0)
                itemErrors.push(
                    "Delivered Purchase Unit quantity must be a non-negative whole number.",
                );
            if (issueSelected && damageLines.length === 0)
                itemErrors.push("Add at least one affected goods row.");
            if (!damageLinesValid)
                itemErrors.push(
                    "Complete each affected goods row with valid quantities and units.",
                );
            if (!Number.isInteger(actionQuantity) || actionQuantity < 0)
                itemErrors.push("Action quantity must be a non-negative whole number.");
            if (deliveredPurchase > orderedPurchase) {
                itemErrors.push(
                    "Delivered quantity exceeds the ordered PO quantity. Resolve the excess before confirming.",
                );
                state.hardErrors.push(
                    `Product ${cardIndex + 1}: Delivered quantity exceeds the ordered quantity.`,
                );
            }
            if (damaged > delivered) {
                itemErrors.push("Damaged quantity exceeds the received quantity.");
                state.hardErrors.push(
                    `Product ${cardIndex + 1}: Damaged quantity exceeds the received quantity.`,
                );
            }
            if (action > delivered) {
                itemErrors.push("Action quantity exceeds the received quantity.");
                state.hardErrors.push(
                    `Product ${cardIndex + 1}: Action quantity exceeds the received quantity.`,
                );
            }
            if (physicalAction && action < damaged)
                itemErrors.push(
                    "Action quantity cannot be less than the physically damaged quantity.",
                );
            if (strict && issueSelected && !issueType) itemErrors.push("Select an issue type.");
            if (strict && issueSelected && issueType === "Other" && !issueDetail)
                itemErrors.push("Specify the issue.");
            if (strict && issueSelected && !disposition) itemErrors.push("Select a disposition.");
            if (strict && physicalAction && action <= 0)
                itemErrors.push("Enter the action quantity.");
            if (strict && damaged > 0 && disposition === "not_applicable")
                itemErrors.push("Select what will physically happen to the damaged goods.");
            if (
                strict &&
                missing > 0 &&
                damaged === 0 &&
                action === 0 &&
                disposition !== "not_applicable"
            )
                itemErrors.push("Use Not Applicable for a short delivery with no goods to remove.");
            if (strict && issueSelected && resolution === "none")
                itemErrors.push("Select a requested resolution.");
            if (
                strict &&
                issueSelected &&
                ["supplier_credit", "next_po_credit", "refund"].includes(resolution) &&
                (!Number.isFinite(confirmedAdjustment) || confirmedAdjustment <= 0)
            )
                itemErrors.push("Enter the supplier-confirmed monetary amount.");

            let batchRows = [...card.querySelectorAll(".receive-batch-row")];
            if (accepted > 0 && batchRows.length === 0) {
                card.querySelector(".receive-batch-list")?.insertAdjacentHTML(
                    "beforeend",
                    receiveBatchRow(
                        {
                            quantity: accepted,
                            expiry_date: "",
                            no_expiry: card.dataset.requiresExpiry !== "1",
                        },
                        card.dataset.requiresExpiry === "1",
                        true,
                    ),
                );
                batchRows = [...card.querySelectorAll(".receive-batch-row")];
            }
            const autoRow = batchRows.find((row) => row.dataset.autoAllocation === "1") || null;
            const hasOtherFilledBatch = batchRows.some(
                (row) =>
                    row !== autoRow &&
                    String(row.querySelector(".receive-batch-qty")?.value || "").trim() !== "",
            );
            if (autoRow && accepted === 0) {
                autoRow.remove();
                batchRows = batchRows.filter((row) => row !== autoRow);
            } else if (autoRow && !hasOtherFilledBatch) {
                autoRow.querySelector(".receive-batch-qty").value = String(accepted);
            }
            const batches = [];
            let allocated = 0;
            batchRows.forEach((row) => {
                const rawQuantity = String(
                    row.querySelector(".receive-batch-qty")?.value || "",
                ).trim();
                if (rawQuantity === "") return;
                const quantity = Number(rawQuantity);
                const noExpiry = row.querySelector(".receive-batch-no-expiry")?.checked === true;
                const expiryDate = row.querySelector(".receive-batch-expiry")?.value || "";
                if (strict && (!Number.isInteger(quantity) || quantity <= 0))
                    itemErrors.push("Every batch needs a positive whole quantity.");
                if (strict && !noExpiry && isPastLocalDate(expiryDate))
                    itemErrors.push(
                        `Batch ${batchRows.indexOf(row) + 1}: Expiry date cannot be earlier than today.`,
                    );
                allocated += Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
                batches.push({
                    batch_identifier: row.querySelector(".receive-batch-id")?.value.trim() || "",
                    quantity,
                    expiry_date: expiryDate,
                    no_expiry: noExpiry,
                    auto_allocate: row.dataset.autoAllocation === "1",
                });
            });

            const batchRowsValid = batches.every(
                (batch) => Number.isInteger(batch.quantity) && batch.quantity > 0,
            );
            const batchesComplete =
                batchRowsValid && allocated === accepted && (accepted === 0 || batches.length > 0);
            const expiryComplete = accepted === 0 || batches.length > 0;
            batchRows.forEach((row) => {
                const quantityControl = row.querySelector(".receive-batch-qty");
                const quantity = Number(quantityControl?.value || 0);
                setReceiveControlValidation(
                    quantityControl,
                    strict &&
                        productValidationAttempted &&
                        accepted > 0 &&
                        (!Number.isInteger(quantity) || quantity <= 0),
                    "A positive whole batch quantity is required.",
                );
                const expiryControl = row.querySelector(".receive-batch-expiry");
                const noExpirySelected =
                    row.querySelector(".receive-batch-no-expiry")?.checked === true;
                expiryControl?.toggleAttribute("disabled", noExpirySelected);
                if (expiryControl) expiryControl.min = localTodayDateString();
                setReceiveControlValidation(
                    expiryControl,
                    strict &&
                        productValidationAttempted &&
                        accepted > 0 &&
                        !noExpirySelected &&
                        Boolean(expiryControl?.value) &&
                        isPastLocalDate(expiryControl.value),
                    "Expiry date cannot be earlier than today.",
                );
                const noExpiryDisplay = row.querySelector(".receive-no-expiry-display");
                if (noExpiryDisplay) noExpiryDisplay.hidden = !noExpirySelected;
            });
            const damageBatchesComplete = damageLines.every(
                (line) =>
                    batches.length <= 1 ||
                    (Number.isInteger(line.batch_index) &&
                        line.batch_index >= 0 &&
                        line.batch_index < batches.length),
            );
            if (strict && issueSelected && !damageBatchesComplete)
                itemErrors.push("Select a batch/lot for every affected goods row.");
            const issueComplete =
                !issueSelected ||
                ((damageLines.length > 0 || missing > 0) &&
                    damageLinesValid &&
                    damageBatchesComplete &&
                    Boolean(issueType) &&
                    (issueType !== "Other" || Boolean(issueDetail)) &&
                    Boolean(disposition) &&
                    resolution !== "none" &&
                    (!["supplier_credit", "next_po_credit", "refund"].includes(resolution) ||
                        (Number.isFinite(confirmedAdjustment) && confirmedAdjustment > 0)) &&
                    (!physicalAction || (action > 0 && action >= damaged)) &&
                    !(damaged > 0 && disposition === "not_applicable") &&
                    !(
                        missing > 0 &&
                        damaged === 0 &&
                        action === 0 &&
                        disposition !== "not_applicable"
                    ));
            const readyForInspection = quantitiesComplete && issueComplete;

            if (strict && allocated > accepted)
                itemErrors.push(
                    `Allocated inventory exceeds accepted inventory by ${allocated - accepted} unit${allocated - accepted === 1 ? "" : "s"}.`,
                );
            if (strict && allocated < accepted)
                itemErrors.push(
                    `${accepted - allocated} unit${accepted - allocated === 1 ? "" : "s"} remain to be allocated to inventory batches.`,
                );
            if (strict && accepted > 0 && batches.length === 0)
                itemErrors.push("Add at least one accepted batch.");
            if (strict && accepted === 0 && allocated !== 0)
                itemErrors.push("No batch stock can be allocated when accepted quantity is zero.");
            if (inspected && !readyForInspection) {
                inspected = false;
                if (inspectionInput) inspectionInput.value = "0";
            }
            if (strict && !inspected)
                itemErrors.push(
                    readyForInspection
                        ? "Complete this product inspection."
                        : "Finish the required product details.",
                );

            state.ordered += ordered;
            state.received += delivered;
            state.accepted += accepted;
            state.affected += affected;
            if (!inspected) state.remaining += 1;
            state.taskTotal += 3;
            state.taskCompleted += [
                inspected,
                batchesComplete && expiryComplete,
                inspected && batchesComplete && expiryComplete,
            ].filter(Boolean).length;
            state.checks.inspection = state.checks.inspection && inspected;
            state.checks.batches = state.checks.batches && batchesComplete && expiryComplete;
            state.checks.confirmation =
                state.checks.confirmation && inspected && batchesComplete && expiryComplete;
            const productName =
                [productTableBrand(orderItem || {}), productTableProductName(orderItem || {})]
                    .filter(Boolean)
                    .join(" — ") || `Product ${cardIndex + 1}`;
            state.errors.push(...itemErrors.map((error) => `${productName}: ${error}`));
            state.items.push({
                po_item_id: card.dataset.poItemId,
                delivered_purchase_quantity: deliveredPurchase,
                delivered_quantity: delivered,
                received_quantity: delivered,
                has_issue: issueSelected,
                damage_lines: issueSelected ? damageLines : [],
                damaged_quantity: issueSelected ? damagedQuantity : 0,
                damaged_unit_conversion_id: damagedUnitConversionId,
                damaged_base_quantity: damaged,
                action_quantity: issueSelected && physicalAction ? actionQuantity : 0,
                action_unit_conversion_id: actionUnitConversionId,
                action_base_quantity: action,
                affected_quantity: issueSelected
                    ? physicalAction
                        ? actionQuantity
                        : damagedQuantity
                    : 0,
                unit_conversion_id: physicalAction
                    ? actionUnitConversionId
                    : damagedUnitConversionId,
                returned_quantity: returned,
                quarantined_quantity: quarantined,
                disposed_quantity: disposed,
                disposition: issueSelected ? disposition : "",
                issue_type: issueSelected ? issueType : "",
                issue_detail: issueSelected && issueType === "Other" ? issueDetail : "",
                resolution: issueSelected ? resolution : "none",
                confirmed_adjustment:
                    issueSelected &&
                    ["supplier_credit", "next_po_credit", "refund"].includes(resolution)
                        ? confirmedAdjustment
                        : 0,
                batches,
                remarks: issueSelected ? itemRemarks : "",
                inspection_complete: inspected,
                accepted_quantity: accepted,
                missing_quantity: missing,
            });

            card.dataset.ready = readyForInspection ? "1" : "0";
            card.dataset.checkQuantities = quantitiesComplete ? "1" : "0";
            card.dataset.checkBatches = batchesComplete ? "1" : "0";
            card.dataset.checkExpiry = expiryComplete ? "1" : "0";
            card.dataset.checkResolution = issueComplete ? "1" : "0";
            card.dataset.checkRemarks = issueComplete ? "1" : "0";
            card.dataset.checkFinalInspection = inspected ? "1" : "0";
            card.dataset.validationState = productValidationAttempted
                ? !expiryComplete
                    ? "Missing Expiry Date"
                    : !batchesComplete
                      ? "Missing Batch Info"
                      : issueSelected && !issueComplete
                        ? "Incomplete"
                        : inspected && issueSelected
                          ? "Has Issue"
                          : inspected
                            ? "Complete"
                            : "Incomplete"
                : inspected
                  ? issueSelected
                      ? "Has Issue"
                      : "Complete"
                  : card.dataset.touched === "1"
                    ? "In Progress"
                    : "Not Started";
            setReceiveControlValidation(
                deliveredQuantityControl,
                strict && productValidationAttempted && !quantitiesComplete,
                deliveredQuantityRaw === ""
                    ? "Received quantity is required."
                    : "Enter a valid received quantity.",
            );
            card.classList.toggle(
                "has-error",
                productValidationAttempted &&
                    (deliveredPurchase > orderedPurchase ||
                        damaged > delivered ||
                        action > delivered ||
                        (physicalAction && action < damaged)),
            );
            const missingQuantity = card.querySelector(".receive-missing-qty");
            if (missingQuantity) missingQuantity.textContent = String(missing);
            const missingPurchase = card.querySelector(".receive-missing-purchase");
            if (missingPurchase)
                missingPurchase.textContent = `Remaining: ${Math.max(0, orderedPurchase - deliveredPurchase)} ${quantities.conversion.purchaseUnit}`;
            card.querySelector(".receive-accepted-qty").textContent =
                `${accepted} ${quantities.conversion.inventoryUnit} total`;
            const acceptedSource = card.querySelector(".receive-accepted-source");
            const acceptedEquivalent = card.querySelector(".receive-accepted-equivalent");
            const acceptedBreakdown = receiveBaseQuantityBreakdown(
                accepted,
                packageConversions,
                quantities.conversion.inventoryUnit,
            );
            if (acceptedSource)
                acceptedSource.textContent =
                    action > 0
                        ? `${delivered} ${quantities.conversion.inventoryUnit} received − ${action} ${quantities.conversion.inventoryUnit} unavailable`
                        : `Equivalent remaining: ${acceptedBreakdown}`;
            if (acceptedEquivalent) {
                acceptedEquivalent.textContent = `Equivalent remaining: ${acceptedBreakdown}`;
                acceptedEquivalent.classList.toggle("d-none", action <= 0);
            }
            const damagedEquivalent = card.querySelector(".damaged-base-equivalent");
            if (damagedEquivalent)
                damagedEquivalent.textContent = `${damaged} ${quantities.conversion.inventoryUnit} total`;
            const affectedCount = card.querySelector(".receive-affected-package-count");
            if (affectedCount) affectedCount.textContent = affectedPackages.join(", ") || "None";
            const unavailableQuantity = card.querySelector(".receive-unavailable-equivalent");
            if (unavailableQuantity)
                unavailableQuantity.textContent = `${action} ${quantities.conversion.inventoryUnit}`;
            const damageAccepted = card.querySelector(".receive-damage-accepted");
            if (damageAccepted)
                damageAccepted.textContent = `${accepted} ${quantities.conversion.inventoryUnit}`;
            const actionEquivalent = card.querySelector(".action-base-equivalent");
            if (actionEquivalent) {
                const actionUnitName =
                    actionUnit?.selectedOptions?.[0]?.dataset.unitName ||
                    quantities.conversion.inventoryUnit;
                actionEquivalent.textContent = `${receiveUnitCountLabel(actionQuantity, actionUnitName)} = ${action} ${quantities.conversion.inventoryUnit} removed`;
            }
            const receivedEquivalent = card.querySelector(".receive-inventory-equivalent");
            if (receivedEquivalent)
                receivedEquivalent.textContent = receiveReceivedHierarchy(
                    deliveredPurchase,
                    quantities.conversion,
                    packageConversions,
                );
            const actionInput = card.querySelector(".action-qty-input");
            if (actionInput)
                actionInput.max = String(
                    Math.floor(delivered / Math.max(1, actionUnitBaseQuantity)),
                );
            card.querySelector(".receive-issue-panel").classList.toggle("d-none", !issueSelected);
            card.querySelector(".receive-other-issue-field")?.classList.toggle(
                "d-none",
                issueType !== "Other",
            );
            const shortOnly = issueType === "Short Quantity" && missing > 0 && damaged === 0;
            const dispositionControl = card.querySelector(".receive-disposition");
            if (shortOnly && dispositionControl) dispositionControl.value = "not_applicable";
            dispositionControl?.querySelectorAll("option").forEach((option) => {
                if (option.value === "not_applicable") option.hidden = false;
                else if (option.value) option.hidden = shortOnly;
            });
            card.querySelector(".receive-action-quantity-field")?.classList.toggle(
                "d-none",
                !physicalAction,
            );
            const adjustmentField = card.querySelector(".receive-confirmed-adjustment-field");
            adjustmentField?.classList.toggle(
                "d-none",
                !["supplier_credit", "next_po_credit", "refund"].includes(resolution),
            );
            const adjustmentLabel = card.querySelector(".receive-confirmed-adjustment-label");
            if (adjustmentLabel)
                adjustmentLabel.textContent =
                    resolution === "next_po_credit"
                        ? "Confirmed Future Supplier Credit *"
                        : resolution === "refund"
                          ? "Confirmed Refund Due *"
                          : "Confirmed Current Discount *";

            const showFieldErrors = strict && productValidationAttempted;
            const fieldErrors = [
                [
                    ".receive-qty-error",
                    !Number.isInteger(deliveredPurchase) ||
                        deliveredPurchase < 0 ||
                        deliveredPurchase > orderedPurchase,
                    "Enter a valid received quantity.",
                ],
                [
                    ".receive-damaged-error",
                    issueSelected && (!damageLinesValid || damaged > delivered),
                    "Complete the affected-goods breakdown.",
                ],
                [
                    ".receive-action-error",
                    issueSelected &&
                        physicalAction &&
                        (!Number.isInteger(actionQuantity) ||
                            action <= 0 ||
                            action > delivered ||
                            action < damaged),
                    action < damaged
                        ? "Action Qty must cover all damaged units."
                        : "Enter a valid action quantity.",
                ],
                [".receive-issue-type-error", issueSelected && !issueType, "Select an issue type."],
                [
                    ".receive-other-error",
                    issueSelected && issueType === "Other" && !issueDetail,
                    "Specify the issue.",
                ],
                [
                    ".receive-disposition-error",
                    issueSelected && !disposition,
                    "Select an affected goods action.",
                ],
                [
                    ".receive-resolution-error",
                    issueSelected && resolution === "none",
                    "Select a supplier resolution.",
                ],
                [
                    ".receive-adjustment-error",
                    issueSelected &&
                        ["supplier_credit", "next_po_credit", "refund"].includes(resolution) &&
                        (!Number.isFinite(confirmedAdjustment) || confirmedAdjustment <= 0),
                    "Enter the confirmed amount.",
                ],
            ];
            fieldErrors.forEach(([selector, invalid, message]) => {
                const error = card.querySelector(selector);
                if (error) error.textContent = showFieldErrors && invalid ? message : "";
            });
            [
                [".receive-issue-type", issueSelected && !issueType, "Issue type is required."],
                [
                    ".receive-issue-other",
                    issueSelected && issueType === "Other" && !issueDetail,
                    "Issue details are required.",
                ],
                [
                    ".receive-disposition",
                    issueSelected && !disposition,
                    "Affected goods action is required.",
                ],
                [
                    ".receive-resolution",
                    issueSelected && resolution === "none",
                    "Supplier resolution is required.",
                ],
                [
                    ".receive-confirmed-adjustment",
                    issueSelected &&
                        ["supplier_credit", "next_po_credit", "refund"].includes(resolution) &&
                        (!Number.isFinite(confirmedAdjustment) || confirmedAdjustment <= 0),
                    "Confirmed adjustment amount is required.",
                ],
            ].forEach(([selector, invalid, message]) =>
                setReceiveControlValidation(
                    card.querySelector(selector),
                    strict && productValidationAttempted && invalid,
                    message,
                ),
            );
            const addDamage = card.querySelector(".receive-add-damage-line");
            if (addDamage) addDamage.disabled = damageLines.length >= deliveredPurchase;
            const shortageNote = card.querySelector(".receive-shortage-note");
            if (shortageNote)
                shortageNote.textContent =
                    missing > 0
                        ? `Short by ${missing} ${quantities.conversion.inventoryUnit}`
                        : "No shortage detected.";
            const allocationDifference = accepted - allocated;
            const allocationState = card.querySelector(".receive-allocation-state");
            const allocationBadge = card.querySelector(".receive-allocation-badge");
            const allocationReason = card.querySelector(".receive-allocation-reason");
            const allocationSummary = card.querySelector(".receive-allocation-summary");
            if (allocationState)
                allocationState.textContent = `Allocated ${allocated} / ${accepted}`;
            const allocationComplete =
                allocated === accepted && (accepted === 0 || batches.length > 0) && batchRowsValid;
            if (allocationBadge)
                allocationBadge.textContent = allocationComplete
                    ? "✓ Complete"
                    : allocationDifference < 0
                      ? "✕ Allocation error"
                      : "Incomplete";
            if (allocationReason)
                allocationReason.textContent = allocationComplete
                    ? "Accepted inventory is fully allocated."
                    : allocationDifference > 0
                      ? `${allocationDifference} unit${allocationDifference === 1 ? "" : "s"} remaining.`
                      : allocationDifference < 0
                        ? `Over allocated by ${Math.abs(allocationDifference)} unit${Math.abs(allocationDifference) === 1 ? "" : "s"}.`
                        : "Complete the remaining batch details.";
            allocationSummary?.classList.toggle("is-complete", allocationComplete);
            allocationSummary?.classList.toggle(
                "has-error",
                productValidationAttempted && !allocationComplete,
            );
            card.querySelector(".receive-header-ordered").textContent =
                `${orderedPurchase} ${quantities.conversion.purchaseUnit}`;
            card.querySelector(".receive-header-accepted").textContent =
                `${accepted} ${quantities.conversion.inventoryUnit}`;
            card.querySelector(".receive-header-affected").textContent =
                `${affected} ${quantities.conversion.inventoryUnit}`;

            let status = "Waiting";
            if (inspected && affected > 0) status = "Has Issue";
            else if (inspected) status = "Complete";
            else if (!quantitiesComplete) status = "Waiting for Quantity Verification";
            else if (!issueComplete) status = "Complete Issue Details";
            else if (readyForInspection) status = "Ready to Complete";

            const badge = card.querySelector(".receive-inspection-badge");
            badge.textContent = status;
            badge.classList.toggle("complete", inspected);
            badge.classList.toggle("ready", readyForInspection && !inspected);
            badge.classList.toggle("issue", affected > 0);
            card.querySelector(".receive-issue-flag")?.classList.toggle("d-none", affected <= 0);
            card.classList.remove("state-waiting", "state-active", "state-complete", "state-issue");
            card.classList.add(
                inspected
                    ? "state-complete"
                    : affected > 0 && productValidationAttempted
                      ? "state-issue"
                      : readyForInspection || card.dataset.touched === "1"
                        ? "state-active"
                        : "state-waiting",
            );

            const completeButton = card.querySelector(".receive-complete-inspection");
            const completedAction = card.querySelector(".receive-completed-action");
            const reopenButton = card.querySelector(".receive-reopen-inspection");
            if (completeButton) {
                completeButton.disabled = inspected;
                completeButton.classList.toggle("d-none", inspected);
            }
            completedAction?.classList.toggle("d-none", !inspected);
            reopenButton?.classList.toggle("d-none", !inspected);
            const readinessText = card.querySelector(".receive-readiness-text");
            let readinessMessage = "Complete the product details.";
            if (inspected)
                readinessMessage = "Product inspection complete. Allocate accepted stock below.";
            else if (!quantitiesComplete)
                readinessMessage = "Complete quantity verification first.";
            else if (!issueComplete) readinessMessage = "Complete the issue details first.";
            else if (readyForInspection) readinessMessage = "Ready to complete.";
            if (readinessText) readinessText.textContent = readinessMessage;
            setReceiveCardLocked(card, inspected);
        });

    state.errors = [...new Set(state.errors)];
    state.hardErrors = [...new Set(state.hardErrors)];
    state.valid = state.errors.length === 0;
    return state;
}

function receivePaymentSummary() {
    return receiveFormState(true);
}

function renderReceivePaymentSummary() {
    const summary = receiveFormState(true);
    const summaryList = document.getElementById("receiveSummaryItems");
    if (summaryList)
        summaryList.innerHTML = summary.items
            .map((item, index) => {
                const orderItem =
                    activeReceiveOrder?.items.find(
                        (candidate) => String(candidate.po_item_id) === String(item.po_item_id),
                    ) || {};
                const conversion = purchasingConversion({
                    purchase_unit: orderItem.purchase_unit,
                    inventory_unit: orderItem.unit || "unit",
                    units_per_purchase_unit: orderItem.units_per_purchase_unit || 1,
                });
                const damagedConversion = (orderItem.package_conversions || []).find(
                    (entry) =>
                        String(entry.conversion_id) === String(item.damaged_unit_conversion_id),
                );
                const actionConversion = (orderItem.package_conversions || []).find(
                    (entry) =>
                        String(entry.conversion_id) === String(item.action_unit_conversion_id),
                );
                const dispositionLabel =
                    RECEIVE_DISPOSITIONS.find(([value]) => value === item.disposition)?.[1] ||
                    (item.disposition === "not_applicable"
                        ? "Not Applicable — Short Delivery"
                        : "-");
                const resolutionLabel =
                    RECEIVE_RESOLUTIONS.find(([value]) => value === item.resolution)?.[1] ||
                    "No issue";
                const damagedLabel = item.has_issue
                    ? `${Number(item.damaged_quantity || 0)} ${damagedConversion?.unit_name || conversion.inventoryUnit}${Number(item.damaged_base_quantity || 0) !== Number(item.damaged_quantity || 0) ? ` / ${Number(item.damaged_base_quantity || 0)} ${conversion.inventoryUnit}` : ""}`
                    : `0 ${conversion.inventoryUnit}`;
                const actionVerb =
                    {
                        return_to_supplier: "Returned / Removed",
                        hold_quarantine: "Held / Removed",
                        dispose: "Disposed / Removed",
                    }[item.disposition] || "Returned / Removed";
                const actionLabel =
                    item.disposition === "not_applicable"
                        ? "Not Applicable"
                        : `${Number(item.action_quantity || 0)} ${actionConversion?.unit_name || conversion.inventoryUnit}${Number(item.action_base_quantity || 0) !== Number(item.action_quantity || 0) ? ` / ${Number(item.action_base_quantity || 0)} ${conversion.inventoryUnit}` : ""}`;
                const damageBreakdown = (item.damage_lines || [])
                    .map((line) => {
                        const damagedUnit = (orderItem.package_conversions || []).find(
                            (entry) =>
                                String(entry.conversion_id) ===
                                String(line.damaged_unit_conversion_id),
                        );
                        const batchLabel = line.batch_identifier
                            ? ` · Batch ${line.batch_identifier}`
                            : "";
                        const packageSequence = Number(
                            line.package_sequence || line.sequence_no || 0,
                        );
                        const packageLabel = `${conversion.purchaseUnit} ${packageSequence} of ${Number(item.delivered_purchase_quantity || 0)}`;
                        return `<li>${escapeHtml(packageLabel)} → ${Number(line.damaged_quantity || 0)} ${escapeHtml(damagedUnit?.unit_name || conversion.inventoryUnit)} damaged${escapeHtml(batchLabel)}</li>`;
                    })
                    .join("");
                const issueReview = item.has_issue
                    ? `<span class="receiving-issue-state">Issue recorded</span>`
                    : `<span class="receiving-no-issues">No issues</span>`;
                const batchExpiryReview = (item.batches || [])
                    .map(
                        (batch, batchIndex) =>
                            `Batch ${batchIndex + 1}: ${batch.no_expiry ? "No Expiry" : batch.expiry_date || "Missing"}`,
                    )
                    .join(" · ");
                return `<article class="receiving-summary-item"><header><strong>${escapeHtml([productTableBrand(orderItem), productTableProductName(orderItem)].filter(Boolean).join(" — ") || `Product ${index + 1}`)}</strong>${issueReview}</header>${damageBreakdown ? `<div class="receiving-damage-breakdown"><span>Affected Goods Breakdown</span><ul>${damageBreakdown}</ul></div>` : ""}<dl>
            <div><dt>PO Ordered</dt><dd>${Number(orderItem.purchase_qty || 0)} ${escapeHtml(conversion.purchaseUnit)} / ${Number(orderItem.inventory_qty_ordered || orderItem.quantity || 0)} ${escapeHtml(conversion.inventoryUnit)}</dd></div>
            <div><dt>Actual Received</dt><dd>${Number(item.delivered_purchase_quantity || 0)} ${escapeHtml(conversion.purchaseUnit)} / ${Number(item.received_quantity || 0)} ${escapeHtml(conversion.inventoryUnit)}</dd></div>
            <div><dt>Physically Damaged</dt><dd>${escapeHtml(damagedLabel)}</dd></div>
            <div><dt>${escapeHtml(actionVerb)}</dt><dd>${escapeHtml(actionLabel)}</dd></div>
            <div><dt>Accepted to Inventory</dt><dd>${Number(item.accepted_quantity || 0)} ${escapeHtml(conversion.inventoryUnit)} total</dd></div>
            <div><dt>Batch &amp; Expiry</dt><dd>${escapeHtml(batchExpiryReview || "Not set")}</dd></div>
            <div><dt>Issue</dt><dd>${escapeHtml(item.issue_type || "No issue")}</dd></div>
            <div><dt>Affected Goods Action</dt><dd>${escapeHtml(dispositionLabel)}</dd></div>
            <div><dt>Supplier Resolution</dt><dd>${escapeHtml(resolutionLabel)}</dd></div>
        </dl></article>`;
            })
            .join("");
    const steps = [...document.querySelectorAll(".receive-simple-step")];
    const inspectionComplete = summary.checks.inspection;
    const batchesComplete = summary.checks.batches;
    steps.forEach((step, index) => {
        const complete =
            index === 0
                ? inspectionComplete
                : index === 1
                  ? inspectionComplete && batchesComplete
                  : summary.valid;
        const active =
            index === 0
                ? !inspectionComplete
                : index === 1
                  ? inspectionComplete && !batchesComplete
                  : inspectionComplete && batchesComplete;
        step.classList.toggle("is-complete", complete);
        step.classList.toggle("is-active", active);
    });
    const validation = document.getElementById("receiveValidationSummary");
    const showValidationSummary =
        receiveValidationAttempted ||
        (summary.errors.length > 0 &&
            Boolean(
                document.querySelector(
                    '#receiveInspectionCards .receive-item-card[data-validation-attempted="1"]',
                ),
            ));
    validation.classList.toggle("d-none", !showValidationSummary);
    validation.classList.toggle("is-complete", showValidationSummary && summary.valid);
    validation.innerHTML = !showValidationSummary
        ? ""
        : summary.valid
          ? '<strong><i class="fa-solid fa-circle-check me-1" aria-hidden="true"></i>All required receiving details are complete. You can now confirm receiving.</strong>'
          : `<strong><i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>Please complete ${summary.errors.length} required field${summary.errors.length === 1 ? "" : "s"} before confirming receiving:</strong><ul>${summary.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`;
    const confirmButton = document.getElementById("btnConfirmReceivePo");
    if (confirmButton) confirmButton.disabled = receiveSubmitting;
    const footer = document.getElementById("receiveFooterStatus");
    if (footer)
        footer.textContent = summary.valid
            ? "Ready to confirm receiving."
            : receiveValidationAttempted
              ? "Please correct the highlighted fields before confirming."
              : "Complete each product inspection and batch allocation.";
    const cards = [...document.querySelectorAll("#receiveInspectionCards .receive-item-card")];
    const inspectedProducts = cards.filter(
        (card) => card.querySelector(".receive-inspected-input")?.value === "1",
    ).length;
    const overallProducts = document.getElementById("receiveOverallProductProgress");
    if (overallProducts)
        overallProducts.textContent = `${inspectedProducts} of ${cards.length} products inspected`;
    cards.forEach((card, index) => {
        const navItem = document.querySelector(
            `#receiveProductNavigator .product-nav-item[data-product-index="${index}"]`,
        );
        if (!navItem) return;
        const complete = card.querySelector(".receive-inspected-input")?.value === "1";
        const attempted = receiveValidationAttempted || card.dataset.validationAttempted === "1";
        const issue =
            attempted && !card.querySelector(".receive-issue-flag")?.classList.contains("d-none");
        navItem.classList.toggle("is-complete", complete);
        navItem.classList.toggle("has-issue", issue);
        navItem.classList.toggle("is-incomplete", attempted && !complete);
        const status = card.dataset.validationState || "Incomplete";
        const copy = navItem.querySelector("small");
        if (copy) copy.textContent = status;
        const icon = navItem.querySelector(".product-nav-state");
        if (icon)
            icon.className = `fa-solid ${complete ? "fa-circle-check" : issue ? "fa-triangle-exclamation" : "fa-circle"} product-nav-state`;
    });
    updateCurrentProductProgress();
}

function updateCurrentProductProgress() {
    const card = document.querySelector(
        `#receiveInspectionCards .receive-item-card[data-product-index="${activeInspectionProductIndex}"]`,
    );
    const target = document.getElementById("receiveCurrentProductProgress");
    if (!card || !target) return;
    const cards = [...document.querySelectorAll("#receiveInspectionCards .receive-item-card")];
    target.textContent = `Product ${activeInspectionProductIndex + 1} of ${cards.length}`;
}

function showReceiveProduct(index, scroll = true) {
    const cards = [...document.querySelectorAll("#receiveInspectionCards .receive-item-card")];
    if (!cards.length) return;
    const nextIndex = Math.max(0, Math.min(Number(index) || 0, cards.length - 1));
    activeInspectionProductIndex = nextIndex;
    cards.forEach((card, cardIndex) => {
        card.hidden = cardIndex !== nextIndex;
        card.querySelector(".receive-card-body")?.classList.toggle(
            "d-none",
            cardIndex !== nextIndex,
        );
        card.querySelector(".receive-card-toggle")?.setAttribute(
            "aria-expanded",
            cardIndex === nextIndex ? "true" : "false",
        );
    });
    document
        .querySelectorAll("#receiveProductNavigator .product-nav-item")
        .forEach((button) =>
            button.classList.toggle("is-active", Number(button.dataset.productIndex) === nextIndex),
        );
    const previous = document.getElementById("btnPreviousInspectionProduct");
    const next = document.getElementById("btnNextInspectionProduct");
    if (previous) previous.disabled = nextIndex === 0;
    if (next) next.disabled = nextIndex === cards.length - 1;
    updateCurrentProductProgress();
    if (scroll)
        document
            .getElementById("receiveInspectionCards")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function expandReceiveInspectionCard(card) {
    if (!card) return;
    showReceiveProduct(Number(card.dataset.productIndex || 0), false);
}

function scrollReceiveModalTo(target, focusTarget = null) {
    if (!target) return;
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect().height || 70;
    const nextTop = Math.max(0, window.scrollY + target.getBoundingClientRect().top - topbar - 18);
    window.scrollTo({ top: nextTop, behavior: "smooth" });

    const pulseTarget =
        target.closest(
            ".receive-field, .receive-batches, .receive-issue-panel, .receive-overall-remarks",
        ) || target;
    pulseTarget.classList.remove("receive-target-pulse");
    void pulseTarget.offsetWidth;
    pulseTarget.classList.add("receive-target-pulse");
    window.setTimeout(() => pulseTarget.classList.remove("receive-target-pulse"), 1400);
    if (focusTarget && !focusTarget.disabled) {
        window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 450);
    }
}

function scrollToFirstInvalidReceivingField() {
    let control = document.querySelector(".receive-invalid-control");
    const hiddenCard = control?.closest(".receive-item-card[hidden]");
    if (hiddenCard) {
        showReceiveProduct(Number(hiddenCard.dataset.productIndex || 0), false);
        control = hiddenCard.querySelector(".receive-invalid-control") || control;
    }
    const target =
        control ||
        document.querySelector(
            "#receiveInspectionCards .receive-item-card:not(.state-complete) .receive-complete-inspection",
        ) ||
        document.querySelector(".receive-delivery-information");
    window.requestAnimationFrame(() => scrollReceiveModalTo(target, control));
}

function navigateReceiveChecklistStep(checkKey) {
    const datasetKey = {
        quantities: "checkQuantities",
        damage: "checkDamage",
        returns: "checkReturns",
        batches: "checkBatches",
        expiry: "checkExpiry",
        resolution: "checkResolution",
        remarks: "checkRemarks",
        finalInspection: "checkFinalInspection",
    }[checkKey];
    const cards = [...document.querySelectorAll("#receiveInspectionCards .receive-item-card")];
    let card =
        cards.find((candidate) => datasetKey && candidate.dataset[datasetKey] === "0") ||
        cards[0] ||
        null;
    let target = null;
    let focusTarget = null;

    if (
        checkKey === "remarks" &&
        !cards.some((candidate) => candidate.dataset.checkRemarks === "0")
    ) {
        target = document.querySelector(".receive-overall-remarks");
        focusTarget = document.getElementById("receivePoRemarks");
    } else if (card) {
        expandReceiveInspectionCard(card);
        if (checkKey === "quantities") {
            target = card.querySelector(".receive-quantity-anchor");
            focusTarget = card.querySelector(".receive-qty-input");
        } else if (checkKey === "damage") {
            target = card.querySelector(".receive-damage-anchor");
            focusTarget = card.querySelector(".damage-line-qty, .receive-add-damage-line");
        } else if (checkKey === "returns") {
            target = card.querySelector(".receive-return-anchor");
        } else if (checkKey === "batches") {
            target = card.querySelector(".receive-batches");
            const quantityFields = [...card.querySelectorAll(".receive-batch-qty:not(:disabled)")];
            focusTarget =
                quantityFields.find(
                    (input) => !Number.isInteger(Number(input.value)) || Number(input.value) <= 0,
                ) ||
                quantityFields[0] ||
                card.querySelector(".receive-add-batch");
        } else if (checkKey === "expiry") {
            focusTarget =
                [...card.querySelectorAll(".receive-batch-expiry:not(:disabled)")].find(
                    (input) => !input.value,
                ) || null;
            target =
                focusTarget?.closest(".receive-field") || card.querySelector(".receive-batches");
        } else if (checkKey === "resolution") {
            const issuePanel = card.querySelector(".receive-issue-panel:not(.d-none)");
            target = issuePanel || card.querySelector(".receive-card-toggle");
            const issueType = card.querySelector(".receive-issue-type");
            const resolution = card.querySelector(".receive-resolution");
            focusTarget = issuePanel
                ? !issueType?.value
                    ? issueType
                    : resolution?.value === "none"
                      ? resolution
                      : issueType
                : null;
        } else if (checkKey === "remarks") {
            target =
                card.querySelector(".receive-item-remarks-field") ||
                card.querySelector(".receive-issue-panel");
            focusTarget = card.querySelector(".receive-remarks-input");
        } else if (checkKey === "finalInspection") {
            target = card.querySelector(".receive-inspection-action");
            focusTarget = card.querySelector(
                ".receive-complete-inspection:not(:disabled), .receive-reopen-inspection:not(.d-none)",
            );
        }
    }

    window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => scrollReceiveModalTo(target, focusTarget)),
    );
}

async function openReceivePurchaseOrder(poId) {
    if (document.body.dataset.page !== "inspect-deliveries") {
        window.location.href = `inspect_deliveries.html?po=${encodeURIComponent(poId)}`;
        return;
    }
    try {
        receiveValidationAttempted = false;
        activeReceiveOrder = await getPurchaseOrder(poId);
        if (activeReceiveOrder.status !== "Arrived")
            throw new Error("This purchase order is no longer available for active inspection.");
        document.getElementById("receivePoNumber").textContent =
            activeReceiveOrder.po_number || "-";
        document.getElementById("receiveSupplierName").textContent =
            activeReceiveOrder.supplier_name || "-";
        document.getElementById("receiveArrivalDate").textContent = formatDate(
            activeReceiveOrder.received_date ||
                activeReceiveOrder.expected_delivery_date ||
                activeReceiveOrder.order_date,
        );
        const headerItems = activeReceiveOrder.items || [];
        const firstHeaderItem = headerItems[0] || {};
        const firstProductName =
            [productTableBrand(firstHeaderItem), productTableProductName(firstHeaderItem)]
                .filter(Boolean)
                .join(" — ") || "-";
        document.getElementById("receiveProductCount").textContent =
            headerItems.length > 1
                ? `${firstProductName} + ${headerItems.length - 1} more`
                : firstProductName;
        document.getElementById("receiveHeaderOrderedQty").textContent =
            headerItems.length === 1
                ? receiveUnitCountLabel(
                      Number(firstHeaderItem.purchase_qty || 0),
                      purchasingConversion({
                          purchase_unit: firstHeaderItem.purchase_unit,
                          inventory_unit: firstHeaderItem.unit || "unit",
                          units_per_purchase_unit: firstHeaderItem.units_per_purchase_unit || 1,
                      }).purchaseUnit,
                  )
                : "See item details";
        document.getElementById("receivePoStatus").textContent =
            activeReceiveOrder.status || "Arrived";
        document.getElementById("receivePoRemarks").value =
            activeReceiveOrder.inspection_draft?.remarks || "";
        document.getElementById("receiveDeliveredByName").value =
            activeReceiveOrder.inspection_draft?.delivered_by_name || "";
        document.getElementById("receiveDeliveryReceiptNo").value =
            activeReceiveOrder.inspection_draft?.delivery_receipt_no || "";
        document.getElementById("receiveReceivedDateTime").value = receiptDisplayDate(
            activeReceiveOrder.received_date ||
                activeReceiveOrder.inspection_draft?.updated_at ||
                new Date().toISOString(),
        );
        document.getElementById("inspectionBreadcrumbPo").textContent =
            activeReceiveOrder.po_number || "Purchase Order";
        document.getElementById("inspectionWorkspaceTitle").textContent =
            `Inspect ${activeReceiveOrder.po_number || "Delivery"}`;
        document
            .getElementById("receiveDraftBadge")
            ?.classList.toggle("d-none", !activeReceiveOrder.inspection_in_progress);
        renderReceiveItems(activeReceiveOrder);
        renderReceivePaymentSummary();
        document.getElementById("inspectionQueueView")?.classList.add("d-none");
        document.getElementById("inspectionWorkspaceView")?.classList.remove("d-none");
        window.scrollTo({ top: 0, behavior: "auto" });
    } catch (err) {
        PharmaUtils.toast.error(err.message);
        showInspectionQueue({ replaceHistory: true });
    }
}

function receivePayload(strict = true) {
    if (!activeReceiveOrder) throw new Error("No purchase order selected.");
    const summary = receiveFormState(strict);
    const deliveredByName = document.getElementById("receiveDeliveredByName")?.value.trim() || "";
    const deliveryReceiptNo =
        document.getElementById("receiveDeliveryReceiptNo")?.value.trim() || "";
    if (strict && !deliveredByName)
        throw new Error("Enter the supplier representative or driver name.");
    if (strict && !deliveryReceiptNo)
        throw new Error("Enter the supplier delivery receipt number.");
    if (strict && !summary.valid) {
        throw new Error(summary.errors[0] || "Please review the receiving quantities.");
    }
    return {
        po_id: activeReceiveOrder.po_id,
        delivered_by_name: deliveredByName,
        delivery_receipt_no: deliveryReceiptNo,
        remarks: document.getElementById("receivePoRemarks")?.value || "",
        items: summary.items,
    };
}

function receiveReceiptRows(payload) {
    return payload.items
        .map((payloadItem) => {
            const orderItem =
                activeReceiveOrder.items.find(
                    (item) => String(item.po_item_id) === String(payloadItem.po_item_id),
                ) || {};
            const receivedQty = Number(payloadItem.received_quantity || 0);
            const damagedQty = Number(
                payloadItem.damaged_base_quantity || payloadItem.damaged_quantity || 0,
            );
            const goodQty = Number(
                payloadItem.accepted_quantity ??
                    Math.max(
                        0,
                        receivedQty - Number(payloadItem.action_base_quantity || damagedQty),
                    ),
            );
            const unitCost = Number(orderItem.price || 0);
            const affectedQty =
                damagedQty +
                Math.max(
                    0,
                    Number(orderItem.inventory_qty_ordered || orderItem.quantity || 0) -
                        receivedQty,
                );
            const supplierCredit = ["supplier_credit", "next_po_credit"].includes(
                payloadItem.resolution,
            )
                ? Number(payloadItem.confirmed_adjustment || 0)
                : 0;
            const actionLabel =
                RECEIVE_RESOLUTIONS.find(([value]) => value === payloadItem.resolution)?.[1] ||
                "No issue";
            return `
            <tr>
                <td>${escapeHtml(orderItem.product_name)}</td>
                <td>${escapeHtml(orderItem.brand_name)}</td>
                <td>${escapeHtml(orderItem.inventory_qty_ordered || orderItem.quantity || 0)}</td>
                <td>${receivedQty}</td>
                <td>${goodQty}</td>
                <td>${damagedQty}</td>
                <td>${escapeHtml(actionLabel)}</td>
                <td>${peso(unitCost)}</td>
                <td>${peso(supplierCredit)}</td>
                <td>${escapeHtml((payloadItem.batches || []).map((batch) => batch.expiry_date || "No Expiry").join(", ") || "Not set")}</td>
                <td>${escapeHtml(payloadItem.remarks || "")}</td>
            </tr>
        `;
        })
        .join("");
}

function receiptReportFromReceiving(details) {
    return {
        pharmacyName: details.pharmacy?.name || "Dr. R Pharmacy",
        pharmacyAddress: details.pharmacy?.address || "",
        contact: details.pharmacy?.contact_number || "",
        grnNo: details.grn_number,
        poNo: details.po_number,
        supplier: details.supplier_name,
        supplierAddress: details.supplier_address || "",
        deliveryReference: details.delivery_receipt_no || details.delivery_reference || "",
        deliveredBy: details.delivered_by_name || "",
        inspectedBy: details.inspected_by_name || details.received_by || "",
        receivedBy: details.grn_settings?.received_by_name || "",
        checkedBy: "",
        approvedBy: details.grn_settings?.approved_by_name || "",
        receivedDate: details.received_date,
        status: details.receiving_result,
        paymentTerms: details.payment_terms || "Not set",
        remarks: details.receiving_remarks || "",
        originalTotal: Number(details.total_amount || 0),
        returnedRejectedValue: Number(details.totals?.returned_rejected_value || 0),
        supplierCredit: Number(details.totals?.supplier_credit || 0),
        supplierDiscount: Number(details.totals?.supplier_discount || 0),
        adjustedPayable: Number(details.payment?.adjusted_payable || 0),
        totalPaid: Number(details.payment?.total_paid || 0),
        remainingBalance: Number(details.payment?.remaining_balance || 0),
        paymentStatus: details.payment?.payment_status || "Unpaid",
        items: (details.items || []).map((item) => ({
            productCode: item.product_code || item.sku || "",
            category: item.category_name || "",
            product: productTableProductName(item),
            brand: item.brand_name,
            specification:
                item.specification ||
                [item.generic_or_variant, item.strength, item.size_value, item.packaging]
                    .filter(Boolean)
                    .join(" • "),
            orderedQty: Number(item.ordered_quantity || 0),
            receivedQty: Number(item.delivered_quantity || 0),
            acceptedQty: Number(item.accepted_quantity || 0),
            goodQty: Number(item.accepted_quantity || 0),
            damagedQty: Number(item.damaged_quantity || 0),
            damageBreakdown: item.damage_breakdown || [],
            returnedQty: Number(item.returned_quantity || 0),
            missingQty: Number(item.missing_quantity || 0),
            replacementPendingQty: Number(item.replacement_pending_quantity || 0),
            replacementReceivedQty: Number(item.replacement_received_quantity || 0),
            replacementExpectedQty: Number(item.replacement_expected_quantity || 0),
            inventoryAdded: Number(item.inventory_added || 0),
            resolution: item.resolution || "none",
            resolutionLabel: receivingResolutionLabel(item.resolution),
            claimStatus: item.return_status || "",
            claimResolvedAt: item.claim_resolved_at || null,
            disposition: item.affected_goods_action || "",
            creditId: item.credit_id || null,
            creditAmount: Number(item.credit_amount || 0),
            creditStatus: item.credit_status || "",
            creditAppliedAmount: Number(item.credit_applied_amount || 0),
            issueType: item.issue_type || "",
            unitLabel: item.unit || "pcs",
            unitCost: Number(item.unit_price || 0),
            batches: item.batches || [],
            expiryDate:
                (item.batches || [])
                    .map((batch) =>
                        batch.expiry_date ? formatDate(batch.expiry_date) : "No expiry",
                    )
                    .join(", ") || "Not set",
            remarks: item.item_remarks || "",
        })),
    };
}

function receiptDisplayDate(value) {
    if (!value)
        return new Date().toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    const parsed = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
          });
}

function receiptTotals(report) {
    return {
        ordered: report.items.reduce((sum, item) => sum + item.orderedQty, 0),
        received: report.items.reduce((sum, item) => sum + item.receivedQty, 0),
        accepted: report.items.reduce(
            (sum, item) => sum + Number(item.acceptedQty ?? item.goodQty ?? 0),
            0,
        ),
        damaged: report.items.reduce((sum, item) => sum + item.damagedQty, 0),
        returned: report.items.reduce((sum, item) => sum + item.returnedQty, 0),
        inventoryAdded: report.items.reduce(
            (sum, item) => sum + Number(item.inventoryAdded ?? item.goodQty ?? 0),
            0,
        ),
    };
}

function grnInformationRows(rows) {
    return rows
        .filter(([label, value]) => label === "Received By" || String(value ?? "").trim() !== "")
        .map(
            ([label, value]) =>
                `<div class="grn-info-row${["PO Number", "GRN Number"].includes(label) ? " grn-number-row" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
        )
        .join("");
}

function grnGroupedItems(items) {
    const groups = [];
    const groupIndex = new Map();
    items.forEach((item, index) => {
        const category = String(item.category || "").trim();
        const key = category.toLowerCase();
        if (!groupIndex.has(key)) {
            groupIndex.set(key, groups.length);
            groups.push({ category, items: [] });
        }
        groups[groupIndex.get(key)].items.push({ item, index });
    });
    return groups;
}

function grnProductRows(report) {
    return grnGroupedItems(report.items)
        .map(
            (group) => `
        ${group.category ? `<tr class="grn-category-row"><th colspan="9">${escapeHtml(group.category.toUpperCase())}</th></tr>` : ""}
        ${group.items
            .map(({ item, index }) => {
                return `
                <tr>
                    <td class="center">${index + 1}</td>
                    <td>${escapeHtml(item.brand || "")}</td>
                    <td><strong>${escapeHtml(item.product || "")}</strong>${item.specification ? `<span class="grn-product-spec">${escapeHtml(item.specification)}</span>` : ""}</td>
                    <td class="center">${escapeHtml(item.unitLabel || "")}</td>
                    <td class="number">${item.orderedQty}</td>
                    <td class="number">${item.receivedQty}</td>
                    <td class="number">${item.acceptedQty ?? item.goodQty}</td>
                    <td class="number">${item.damagedQty}</td>
                    <td class="number">${item.returnedQty || 0}</td>
                </tr>
            `;
            })
            .join("")}
    `,
        )
        .join("");
}

function openReceiptPreview(report, options = {}) {
    const receiptWindow =
        options.targetWindow || window.open("", "_blank", "width=1200,height=850");
    if (!receiptWindow) return;
    const totals = receiptTotals(report);
    receiptWindow.document.write(`
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Goods Received Note</title>
            <style>
                * { box-sizing: border-box; }
                @page { size: A4 portrait; margin: 10mm; }
                body { margin: 0; color: #111; background: #e5e7eb; font-family: Arial, Helvetica, sans-serif; }
                .actions { display: flex; gap: 8px; justify-content: center; padding: 12px; }
                ${options.embedded ? ".actions { display: none; } body { padding: 18px 0; }" : ""}
                button { padding: 8px 14px; border: 1px solid #111; border-radius: 3px; background: #fff; color: #111; font: 600 13px Arial, sans-serif; cursor: pointer; }
                .grn-document { display: flex; flex-direction: column; width: 210mm; min-height: 297mm; margin: 0 auto 24px; padding: 10mm; background: #fff; box-shadow: 0 8px 28px rgba(0,0,0,.16); font-size: 8pt; line-height: 1.25; }
                .grn-header { padding-bottom: 2.5mm; text-align: center; border-bottom: 1.5px solid #111; }
                .grn-pharmacy { font-size: 15pt; font-weight: 800; letter-spacing: .2px; }
                .grn-address, .grn-contact { margin-top: .6mm; font-size: 7.5pt; line-height: 1.2; }
                .grn-title { margin-top: 2mm; font-size: 11.5pt; font-weight: 800; letter-spacing: 1.1px; }
                .grn-info-grid { display: grid; grid-template-columns: minmax(0,.95fr) minmax(0,1.25fr) minmax(0,.8fr); gap: 3mm; padding: 2.5mm 0; border-bottom: 1px solid #444; }
                .grn-info-column { min-width: 0; }
                .grn-info-row { display: grid; grid-template-columns: 22mm minmax(0,1fr); gap: 1.5mm; margin: .8mm 0; align-items: start; }
                .grn-info-row span { font-size: 6pt; line-height: 1.25; font-weight: 700; color: #444; text-transform: uppercase; }
                .grn-info-row strong { min-width: 0; font-size: 7.2pt; line-height: 1.25; font-weight: 700; overflow-wrap: break-word; word-break: normal; }
                .grn-number-row { grid-template-columns: 22mm minmax(0,1fr); }
                .grn-number-row strong { white-space: nowrap; font-size: 7pt; }
                .grn-table { width: 100%; margin-top: 2.5mm; border-collapse: collapse; table-layout: fixed; }
                .grn-table col:nth-child(1) { width: 4%; }
                .grn-table col:nth-child(2) { width: 12%; }
                .grn-table col:nth-child(3) { width: 32%; }
                .grn-table col:nth-child(4) { width: 8%; }
                .grn-table col:nth-child(n+5) { width: 8.8%; }
                .grn-table th, .grn-table td { padding: 1.25mm .7mm; border: .35mm solid #555; vertical-align: top; overflow-wrap: anywhere; }
                .grn-table thead { display: table-header-group; }
                .grn-table thead th { background: #e8e8e8; font-size: 5.4pt; line-height: 1.1; text-align: center; text-transform: uppercase; overflow-wrap: normal; word-break: normal; }
                .grn-table tbody td { font-size: 6.2pt; }
                .grn-product-spec { display: block; margin-top: .7mm; color: #555; font-size: 5.7pt; line-height: 1.2; }
                .grn-table tr { break-inside: avoid; page-break-inside: avoid; }
                .grn-category-row th { padding: 1.2mm; background: #d5d5d5; font-size: 6.5pt; text-align: left; letter-spacing: .5px; }
                .center { text-align: center; }
                .number { text-align: center; font-variant-numeric: tabular-nums; }
                .money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
                .grn-lower { display: grid; grid-template-columns: minmax(0,1fr) 78mm; gap: 6mm; margin-top: 3mm; break-inside: avoid; page-break-inside: avoid; }
                .grn-section-title { margin-bottom: 2mm; padding-bottom: 1mm; border-bottom: 1px solid #333; font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
                .grn-remarks-box { min-height: 24mm; padding: 2.5mm; border: .35mm solid #555; white-space: pre-wrap; }
                .grn-summary { width: 100%; border-collapse: collapse; }
                .grn-summary td { padding: 1.1mm 1.5mm; border-bottom: .25mm solid #aaa; font-size: 7pt; }
                .grn-summary td:last-child { text-align: right; font-weight: 700; }
                .grn-summary .grn-payable td { padding-top: 2mm; border-top: .5mm solid #222; border-bottom: .5mm double #222; font-size: 8pt; }
                .grn-footer-spacer { flex: 1 0 4mm; min-height: 4mm; }
                .grn-signatures { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12mm; break-inside: avoid; page-break-inside: avoid; }
                .grn-signature { text-align: center; }
                .grn-signature-line { min-height: 10mm; padding: 4.5mm 1mm 1mm; border-bottom: .35mm solid #222; font-weight: 700; overflow-wrap: break-word; }
                .grn-signature-label { margin-top: 1.5mm; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; }
                @media print {
                    body { background: #fff; }
                    .actions { display: none; }
                    .grn-document { width: 190mm; min-height: 277mm; margin: 0; padding: 0; box-shadow: none; }
                    .grn-table thead { display: table-header-group; }
                    .grn-table tbody tr, .grn-lower, .grn-signatures { break-inside: avoid; page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="actions">
                <button onclick="window.print()">Print / Save PDF</button>
                <button onclick="window.close()">Close</button>
            </div>
            <main class="grn-document">
                <header class="grn-header">
                    <div class="grn-pharmacy">${escapeHtml(report.pharmacyName)}</div>
                    ${report.pharmacyAddress ? `<div class="grn-address">${escapeHtml(report.pharmacyAddress)}</div>` : ""}
                    ${report.contact ? `<div class="grn-contact">Contact Number: ${escapeHtml(report.contact)}</div>` : ""}
                    <div class="grn-title">GOODS RECEIVED NOTE</div>
                </header>
                <section class="grn-info-grid">
                    <div class="grn-info-column">${grnInformationRows([
                        ["Supplier", report.supplier],
                        ["Supplier Address", report.supplierAddress],
                        ["Received By", report.receivedBy],
                        ["Delivered By", report.deliveredBy],
                    ])}</div>
                    <div class="grn-info-column">${grnInformationRows([
                        ["PO Number", report.poNo],
                        ["GRN Number", report.grnNo],
                        ["Received Date", receiptDisplayDate(report.receivedDate)],
                    ])}</div>
                    <div class="grn-info-column">${grnInformationRows([
                        ["Receiving Status", report.status],
                        ["Payment Status", report.paymentStatus],
                        ["Delivery Receipt", report.deliveryReference],
                    ])}</div>
                </section>
                <table class="grn-table">
                    <colgroup>${"<col>".repeat(9)}</colgroup>
                    <thead><tr>
                        <th>#</th><th>Brand</th><th>Product / Specification</th><th>Unit</th>
                        <th>Ordered</th><th>Received</th><th>Accepted</th><th>Damaged</th><th>Returned</th>
                    </tr></thead>
                    <tbody>${grnProductRows(report)}</tbody>
                </table>
                <section class="grn-lower">
                    <div>
                        <div class="grn-section-title">Remarks</div>
                        <div class="grn-remarks-box">${escapeHtml(report.remarks || "")}</div>
                    </div>
                    <div>
                        <div class="grn-section-title">Receiving Summary</div>
                        <table class="grn-summary">
                            <tr><td>Total Ordered Qty</td><td>${totals.ordered}</td></tr>
                            <tr><td>Total Received Qty</td><td>${totals.received}</td></tr>
                            <tr><td>Total Accepted Qty</td><td>${totals.accepted}</td></tr>
                            <tr><td>Total Damaged Qty</td><td>${totals.damaged}</td></tr>
                            <tr><td>Total Returned Qty</td><td>${totals.returned}</td></tr>
                            <tr><td>Inventory Added</td><td>${totals.inventoryAdded}</td></tr>
                        </table>
                    </div>
                </section>
                <div class="grn-footer-spacer" aria-hidden="true"></div>
                <section class="grn-signatures">
                    <div class="grn-signature"><div class="grn-signature-line">${escapeHtml(report.receivedBy || "")}</div><div class="grn-signature-label">Received By</div></div>
                    <div class="grn-signature"><div class="grn-signature-line">${escapeHtml(report.checkedBy || "")}</div><div class="grn-signature-label">Checked By</div></div>
                    <div class="grn-signature"><div class="grn-signature-line">${escapeHtml(report.approvedBy || "")}</div><div class="grn-signature-label">Approved By</div></div>
                </section>
            </main>
            <script>
                function positionGrnSignatureFooter() {
                    const documentNode = document.querySelector('.grn-document');
                    const signatureNode = document.querySelector('.grn-signatures');
                    const spacerNode = document.querySelector('.grn-footer-spacer');
                    if (!documentNode || !signatureNode || !spacerNode) return;
                    spacerNode.style.flex = '0 0 auto';
                    spacerNode.style.height = '0px';
                    const ruler = document.createElement('div');
                    ruler.style.cssText = 'position:absolute;visibility:hidden;height:277mm;width:1px;';
                    document.body.appendChild(ruler);
                    const pageHeight = ruler.getBoundingClientRect().height;
                    ruler.remove();
                    const documentTop = documentNode.getBoundingClientRect().top + parseFloat(getComputedStyle(documentNode).paddingTop || 0);
                    const signatureTop = signatureNode.getBoundingClientRect().top - documentTop;
                    const signatureHeight = signatureNode.getBoundingClientRect().height;
                    const pageOffset = ((signatureTop % pageHeight) + pageHeight) % pageHeight;
                    let gap = pageHeight - pageOffset - signatureHeight;
                    if (gap < 0) gap += pageHeight;
                    spacerNode.style.height = Math.max(0, gap) + 'px';
                }
                window.addEventListener('load', positionGrnSignatureFooter);
                window.addEventListener('beforeprint', positionGrnSignatureFooter);
                window.addEventListener('resize', positionGrnSignatureFooter);
                ${options.autoPrint ? `window.addEventListener('load', () => setTimeout(() => window.print(), 150));` : ""}
                ${options.embedded ? `function fitEmbeddedGrn(){ document.body.style.zoom = Math.min(1, Math.max(.42, (window.innerWidth - 28) / 794)); } window.addEventListener('load', fitEmbeddedGrn); window.addEventListener('resize', fitEmbeddedGrn);` : ""}
            <\/script>
        </body>
        </html>
    `);
    receiptWindow.document.close();
}

function receivingHasDiscrepancy(report) {
    return (report.items || []).some(
        (item) =>
            item.damagedQty > 0 ||
            item.missingQty > 0 ||
            item.returnedQty > 0 ||
            item.replacementExpectedQty > 0 ||
            (item.resolution && item.resolution !== "none"),
    );
}

function supplierDiscrepancyAffectedQuantity(item) {
    return Math.max(item.damagedQty || 0, item.returnedQty || 0) + Number(item.missingQty || 0);
}

function supplierDiscrepancyQuantityLabel(quantity, unit = "Unit") {
    const numeric = Number(quantity || 0);
    const cleanUnit = String(unit || "Unit").trim();
    const label = numeric === 1 || /s$/i.test(cleanUnit) ? cleanUnit : `${cleanUnit}s`;
    return `${numeric} ${label}`;
}

function supplierDiscrepancyIsReplacement(item) {
    return (
        item.replacementExpectedQty > 0 ||
        ["replacement", "return_for_replacement"].includes(item.resolution)
    );
}

function supplierDiscrepancyIsCredit(item) {
    return [
        "supplier_credit",
        "next_po_credit",
        "return_for_credit",
        "keep_with_discount",
    ].includes(item.resolution);
}

function supplierDiscrepancyCreditApplied(item) {
    const amount = Number(item.creditAmount || 0);
    const applied = Number(item.creditAppliedAmount || 0);
    return (
        amount > 0 &&
        (applied + 0.005 >= amount || String(item.creditStatus || "").toLowerCase() === "applied")
    );
}

function supplierDiscrepancyIsReturn(item) {
    return (
        !supplierDiscrepancyIsReplacement(item) &&
        !supplierDiscrepancyIsCredit(item) &&
        (String(item.disposition || "")
            .toLowerCase()
            .includes("return") ||
            item.resolution === "return_to_supplier")
    );
}

function supplierDiscrepancyReturnCompleted(item) {
    const status = String(item.claimStatus || "").toLowerCase();
    return (
        Boolean(item.claimResolvedAt) &&
        (status.includes("resolved") || status.includes("completed") || status.includes("returned"))
    );
}

function supplierDiscrepancyResolution(item) {
    const unit = item.unitLabel || "Unit";
    const affected = Math.max(
        item.replacementExpectedQty || 0,
        supplierDiscrepancyAffectedQuantity(item),
    );
    const quantity = supplierDiscrepancyQuantityLabel(affected, unit);
    if (supplierDiscrepancyIsReplacement(item)) {
        const outstanding = Math.max(
            Number(item.replacementPendingQty || 0),
            affected - Number(item.replacementReceivedQty || 0),
            0,
        );
        if (item.replacementReceivedQty > 0 && outstanding > 0)
            return `${quantity} — Replacement Partially Received (${supplierDiscrepancyQuantityLabel(outstanding, unit)} outstanding)`;
        if (affected > 0 && outstanding <= 0) return `${quantity} — Replacement Completed`;
        return `${quantity} — Replacement Required`;
    }
    if (supplierDiscrepancyIsCredit(item)) {
        return `${quantity} — ${supplierDiscrepancyCreditApplied(item) ? "Credit Applied" : "Supplier Credit Requested"}`;
    }
    if (supplierDiscrepancyIsReturn(item))
        return `${quantity} — ${supplierDiscrepancyReturnCompleted(item) ? "Return Completed" : "Return to Supplier"}`;
    if (item.resolution === "refund") return `${quantity} — Refund Requested`;
    return `${quantity} — ${item.resolutionLabel || "Supplier Action Pending"}`;
}

function supplierDiscrepancyStatus(items, summary) {
    const replacementItems = items.filter(supplierDiscrepancyIsReplacement);
    if (replacementItems.length) {
        if (summary.replacementOutstanding > 0 && summary.replacementReceived > 0)
            return "REPLACEMENT PARTIALLY RECEIVED";
        if (summary.replacementOutstanding > 0) return "REPLACEMENT PENDING";
        if (
            summary.replacementRequired > 0 &&
            summary.replacementReceived >= summary.replacementRequired
        )
            return "REPLACEMENT COMPLETED";
    }

    const creditItems = items.filter(supplierDiscrepancyIsCredit);
    if (creditItems.length) {
        return creditItems.every(supplierDiscrepancyCreditApplied)
            ? "CREDIT APPLIED"
            : "SUPPLIER CREDIT PENDING";
    }

    const returnItems = items.filter(supplierDiscrepancyIsReturn);
    if (returnItems.length)
        return returnItems.every(supplierDiscrepancyReturnCompleted)
            ? "RETURN COMPLETED"
            : "RETURN PENDING";

    const refundItems = items.filter((item) => item.resolution === "refund");
    if (refundItems.length) {
        const refundStatuses = refundItems.map((item) =>
            String(item.claimStatus || "")
                .trim()
                .toLowerCase(),
        );
        return refundStatuses.some(
            (status) => status.includes("resolved") || status.includes("received"),
        )
            ? "REFUND RECEIVED"
            : "REFUND PENDING";
    }
    return "CLAIM PENDING";
}

function supplierDiscrepancyContext(report) {
    const items = (report.items || []).filter(
        (item) =>
            item.damagedQty > 0 ||
            item.missingQty > 0 ||
            item.returnedQty > 0 ||
            item.replacementExpectedQty > 0 ||
            item.resolution !== "none",
    );
    const summary = items.reduce(
        (total, item) => {
            total.damaged += item.damagedQty;
            total.shortage += item.missingQty;
            if (supplierDiscrepancyIsReplacement(item)) {
                const required = Math.max(
                    Number(item.replacementExpectedQty || 0),
                    supplierDiscrepancyAffectedQuantity(item),
                );
                const received = Math.min(required, Number(item.replacementReceivedQty || 0));
                total.replacementRequired += required;
                total.replacementReceived += received;
                total.replacementOutstanding += Math.max(
                    Number(item.replacementPendingQty || 0),
                    required - received,
                    0,
                );
            }
            return total;
        },
        {
            damaged: 0,
            shortage: 0,
            replacementRequired: 0,
            replacementReceived: 0,
            replacementOutstanding: 0,
        },
    );
    return { items, summary, status: supplierDiscrepancyStatus(items, summary) };
}

function supplierDiscrepancySummaryRows(items, summary, summaryUnit, documentStatus) {
    const rows = [
        `<tr><td>Total Damaged</td><td>${escapeHtml(supplierDiscrepancyQuantityLabel(summary.damaged, summaryUnit))}</td></tr>`,
    ];
    if (summary.shortage > 0)
        rows.push(
            `<tr><td>Total Shortage</td><td>${escapeHtml(supplierDiscrepancyQuantityLabel(summary.shortage, summaryUnit))}</td></tr>`,
        );
    const replacementItems = items.filter(supplierDiscrepancyIsReplacement);
    if (replacementItems.length) {
        rows.push(
            `<tr><td>Replacement Required</td><td>${escapeHtml(supplierDiscrepancyQuantityLabel(summary.replacementRequired, summaryUnit))}</td></tr>`,
        );
        rows.push(
            `<tr><td>Replacement Received</td><td>${escapeHtml(supplierDiscrepancyQuantityLabel(summary.replacementReceived, summaryUnit))}</td></tr>`,
        );
        rows.push(
            `<tr><td>Replacement Outstanding</td><td>${escapeHtml(supplierDiscrepancyQuantityLabel(summary.replacementOutstanding, summaryUnit))}</td></tr>`,
        );
    }
    const creditItems = items.filter(supplierDiscrepancyIsCredit);
    if (creditItems.length) {
        const creditQuantity = creditItems.reduce(
            (total, item) => total + supplierDiscrepancyAffectedQuantity(item),
            0,
        );
        const creditAmount = creditItems.reduce(
            (total, item) => total + Number(item.creditAmount || 0),
            0,
        );
        rows.push(
            `<tr><td>Credit Quantity</td><td>${escapeHtml(supplierDiscrepancyQuantityLabel(creditQuantity, summaryUnit))}</td></tr>`,
        );
        if (creditAmount > 0)
            rows.push(`<tr><td>Confirmed Credit</td><td>${peso(creditAmount)}</td></tr>`);
        rows.push(
            `<tr><td>Credit Status</td><td>${creditItems.every(supplierDiscrepancyCreditApplied) ? "Credit Applied" : "Supplier Credit Pending"}</td></tr>`,
        );
    }
    const returnItems = items.filter(supplierDiscrepancyIsReturn);
    if (returnItems.length) {
        const required = returnItems.reduce(
            (total, item) => total + supplierDiscrepancyAffectedQuantity(item),
            0,
        );
        const completed = returnItems.reduce(
            (total, item) =>
                total +
                (supplierDiscrepancyReturnCompleted(item)
                    ? supplierDiscrepancyAffectedQuantity(item)
                    : 0),
            0,
        );
        rows.push(
            `<tr><td>Return Required</td><td>${escapeHtml(supplierDiscrepancyQuantityLabel(required, summaryUnit))}</td></tr>`,
        );
        rows.push(
            `<tr><td>Return Completed</td><td>${escapeHtml(supplierDiscrepancyQuantityLabel(completed, summaryUnit))}</td></tr>`,
        );
        rows.push(
            `<tr><td>Return Outstanding</td><td>${escapeHtml(supplierDiscrepancyQuantityLabel(Math.max(0, required - completed), summaryUnit))}</td></tr>`,
        );
    }
    rows.push(`<tr><td>Claim Status</td><td>${escapeHtml(documentStatus)}</td></tr>`);
    return rows.join("");
}

function supplierDiscrepancyRows(report) {
    return report.items
        .filter(
            (item) =>
                item.damagedQty > 0 ||
                item.missingQty > 0 ||
                item.returnedQty > 0 ||
                item.replacementExpectedQty > 0 ||
                item.resolution !== "none",
        )
        .map(
            (item, index) => `
        <tr>
            <td class="center">${index + 1}</td>
            <td>${escapeHtml(item.brand || "")}</td>
            <td><strong>${escapeHtml(item.product || "")}</strong>${item.specification ? `<span class="product-spec">${escapeHtml(item.specification)}</span>` : ""}${item.issueType ? `<span class="issue-note">Issue: ${escapeHtml(item.issueType)}</span>` : ""}</td>
            <td class="center">${escapeHtml(item.unitLabel || "")}</td>
            <td class="number">${item.orderedQty}</td><td class="number">${item.receivedQty}</td><td class="number">${item.acceptedQty}</td><td class="number">${item.damagedQty}</td>
            <td>${escapeHtml(supplierDiscrepancyResolution(item))}</td>
        </tr>`,
        )
        .join("");
}

function openSupplierDiscrepancyPreview(report, options = {}) {
    if (!receivingHasDiscrepancy(report)) {
        options.targetWindow?.close?.();
        PharmaUtils.toast.info("This receiving has no supplier discrepancy document.");
        return;
    }
    const previewWindow =
        options.targetWindow || window.open("", "_blank", "width=1200,height=850");
    if (!previewWindow) return;
    const {
        items: discrepancyItems,
        summary,
        status: documentStatus,
    } = supplierDiscrepancyContext(report);
    const unitLabels = [
        ...new Set(discrepancyItems.map((item) => String(item.unitLabel || "Unit"))),
    ];
    const summaryUnit = unitLabels.length === 1 ? unitLabels[0] : "Units";
    previewWindow.document
        .write(`<!doctype html><html><head><meta charset="utf-8"><title>Delivery Discrepancy & Replacement Acknowledgement</title><style>
        *{box-sizing:border-box}@page{size:A4 portrait;margin:10mm}body{margin:0;background:#e5e7eb;color:#111;font-family:Arial,Helvetica,sans-serif}.actions{display:flex;justify-content:center;gap:8px;padding:12px}button{padding:8px 14px;border:1px solid #111;background:#fff;border-radius:3px;font-weight:700;cursor:pointer}.document{display:flex;flex-direction:column;width:210mm;min-height:297mm;margin:0 auto 24px;padding:10mm;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.16);font-size:8pt;line-height:1.3}.header{text-align:center;border-bottom:1.5px solid #111;padding-bottom:3mm}.pharmacy{font-size:15pt;font-weight:800}.address,.contact{font-size:7.5pt;margin-top:.7mm}.title{font-size:10pt;font-weight:800;letter-spacing:.7px;margin-top:2.5mm}.info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1mm 8mm;padding:3mm 0;border-bottom:1px solid #444}.info-row{display:grid;grid-template-columns:30mm 1fr;gap:2mm}.info-row.full{grid-column:1/-1}.info-row>span{font-size:6pt;font-weight:700;text-transform:uppercase;color:#444}.info-row strong{font-size:7pt;overflow-wrap:anywhere}.status{display:inline-block;padding:1mm 2mm;border:1px solid #555;border-radius:10mm}.items{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:3mm}.items col:nth-child(1){width:4%}.items col:nth-child(2){width:10%}.items col:nth-child(3){width:25%}.items col:nth-child(4){width:7%}.items col:nth-child(n+5):nth-child(-n+8){width:7%}.items col:nth-child(9){width:26%}.items th,.items td{border:.3mm solid #555;padding:1.4mm .8mm;vertical-align:top;overflow-wrap:anywhere}.items th{background:#e8e8e8;font-size:5.5pt;text-transform:uppercase;text-align:center}.items td{font-size:6.3pt}.center,.number{text-align:center}.product-spec,.issue-note{display:block;margin-top:.6mm;color:#555;font-size:5.7pt}.issue-note{font-weight:700;color:#7a2e0e}.lower{display:grid;grid-template-columns:1fr 75mm;gap:7mm;margin-top:4mm}.section-title{font-size:7pt;font-weight:800;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:1mm;margin-bottom:2mm}.remarks{min-height:24mm;border:.3mm solid #555;padding:2mm;white-space:pre-wrap}.summary{width:100%;border-collapse:collapse}.summary td{padding:1.2mm;border-bottom:.25mm solid #aaa}.summary td:last-child{text-align:right;font-weight:700}.signatures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30mm;margin-top:auto;padding-top:18mm;page-break-inside:avoid}.signature{text-align:center}.signature-line{min-height:9mm;border-bottom:.35mm solid #222}.signature-label{font-size:6pt;font-weight:700;text-transform:uppercase;margin-top:1.5mm}@media print{body{background:#fff}.actions{display:none}.document{width:190mm;min-height:277mm;margin:0;padding:0;box-shadow:none}.items tr,.lower,.signatures{break-inside:avoid;page-break-inside:avoid}}
    </style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button></div><main class="document">
        <header class="header"><div class="pharmacy">${escapeHtml(report.pharmacyName)}</div>${report.pharmacyAddress ? `<div class="address">${escapeHtml(report.pharmacyAddress)}</div>` : ""}${report.contact ? `<div class="contact">Contact Number: ${escapeHtml(report.contact)}</div>` : ""}<div class="title">DELIVERY DISCREPANCY &amp; REPLACEMENT ACKNOWLEDGEMENT</div></header>
        <section class="info">${[
            ["Supplier", report.supplier],
            ["PO Number", report.poNo],
            ["GRN Number", report.grnNo],
            ["Delivery Receipt No.", report.deliveryReference],
            ["Received Date", receiptDisplayDate(report.receivedDate)],
            ["Receiving Status", report.status],
            ["Claim Status", documentStatus, true],
        ]
            .map(
                ([label, value, full]) =>
                    `<div class="info-row${full ? " full" : ""}"><span>${escapeHtml(label)}</span><strong>${label === "Claim Status" ? `<span class="status">${escapeHtml(value)}</span>` : escapeHtml(value || "—")}</strong></div>`,
            )
            .join("")}</section>
        <table class="items"><colgroup>${"<col>".repeat(9)}</colgroup><thead><tr><th>#</th><th>Brand</th><th>Product / Specification</th><th>Unit</th><th>Ordered</th><th>Received</th><th>Accepted</th><th>Damaged</th><th>Supplier Resolution</th></tr></thead><tbody>${supplierDiscrepancyRows(report)}</tbody></table>
        <section class="lower"><div><div class="section-title">Remarks / Supplier Agreement</div><div class="remarks">${escapeHtml(report.remarks || "")}</div></div><div><div class="section-title">Delivery Discrepancy Summary</div><table class="summary">${supplierDiscrepancySummaryRows(discrepancyItems, summary, summaryUnit, documentStatus)}</table></div></section>
        <section class="signatures"><div class="signature"><div class="signature-line"></div><div class="signature-label">Receiving / Inspection Staff</div></div><div class="signature"><div class="signature-line"></div><div class="signature-label">Supplier Representative / Driver</div></div></section>
    </main><script>${options.autoPrint ? `window.addEventListener('load',()=>setTimeout(()=>window.print(),150));` : ""}<\/script></body></html>`);
    previewWindow.document.close();
}

async function submitReceivePurchaseOrder() {
    if (receiveSubmitting) return;
    try {
        receiveValidationAttempted = true;
        renderReceivePaymentSummary();
        const validation = receiveFormState(true);
        if (!validation.valid) {
            renderReceivePaymentSummary();
            scrollToFirstInvalidReceivingField();
            PharmaUtils.toast.error(
                "Please complete the highlighted required fields before confirming receiving.",
            );
            return;
        }
        const payload = receivePayload();
        receiveSubmitting = true;
        const button = document.getElementById("btnConfirmReceivePo");
        if (button) {
            button.disabled = true;
            button.innerHTML =
                '<span class="spinner-border spinner-border-sm me-1"></span>Confirming...';
        }
        PharmaUtils.modal.loading("Receiving Purchase Order...");
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/receive_purchase_order.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        try {
            sessionStorage.removeItem("productMasterFileCache:v1");
        } catch {}

        PharmaUtils.modal.close();
        const confirmedPoId = activeReceiveOrder.po_id;
        receivingDetailsCache.delete(String(confirmedPoId));
        const persistedReceiving = await fetchReceivingDetails(confirmedPoId, true);
        openReceiptPreview(receiptReportFromReceiving(persistedReceiving));
        PharmaUtils.toast.success(data.message || "Purchase order received successfully.");
        activeReceiveOrder = null;
        await loadInspectionQueue();
        const url = new URL(window.location.href);
        url.searchParams.delete("po");
        url.searchParams.delete("view");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        showInspectionQueue({ reload: false });
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error("Failed to receive purchase order", err.message);
    } finally {
        receiveSubmitting = false;
        const button = document.getElementById("btnConfirmReceivePo");
        if (button) button.innerHTML = '<i class="fa-solid fa-check me-1"></i>Confirm Receiving';
        if (document.body.dataset.page === "inspect-deliveries") renderReceivePaymentSummary();
    }
}

async function saveReceiveInspectionDraft() {
    if (receiveSubmitting || !activeReceiveOrder) return;
    const button = document.getElementById("btnSaveReceiveDraft");
    try {
        receiveSubmitting = true;
        if (button) {
            button.disabled = true;
            button.innerHTML =
                '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
        }
        const payload = { ...receivePayload(false), mode: "draft" };
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/receive_purchase_order.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        document.getElementById("receiveDraftBadge")?.classList.remove("d-none");
        PharmaUtils.toast.success(data.message);
        const queueOrder = inspectionQueueOrders.find(
            (order) => String(order.po_id) === String(activeReceiveOrder.po_id),
        );
        if (queueOrder) queueOrder.inspection_in_progress = true;
    } catch (err) {
        PharmaUtils.modal.error("Failed to save inspection draft", err.message);
    } finally {
        receiveSubmitting = false;
        if (button) {
            button.disabled = false;
            button.innerHTML =
                '<i class="fa-regular fa-floppy-disk me-1"></i>Save Inspection Draft';
        }
        renderReceivePaymentSummary();
    }
}

function openNextUninspectedCard() {
    const cards = [...document.querySelectorAll("#receiveInspectionCards .receive-item-card")];
    const card = [
        ...cards.slice(activeInspectionProductIndex + 1),
        ...cards.slice(0, activeInspectionProductIndex + 1),
    ].find((candidate) => candidate.querySelector(".receive-inspected-input")?.value !== "1");
    if (!card) return;
    showReceiveProduct(Number(card.dataset.productIndex || 0));
    card.querySelector(".receive-qty-input")?.focus();
}

const receivingDetailsCache = new Map();
let activeReceivingDetails = null;
let receivingUiScrollY = 0;
let supplierPaymentSubmitting = false;
let supplierPaymentSubmissionKey = "";
let activeSupplierCredits = [];
let supplierPaymentPendingState = null;
let supplierPaymentReturnFocus = null;
let supplierPaymentResultContext = null;

function receivingResolutionLabel(resolution = "none") {
    return (
        {
            none: "No issue",
            replacement: "Replacement",
            supplier_credit: "Supplier Credit",
            next_po_credit: "Credit on Next PO",
            refund: "Refund Due",
            no_compensation: "No Supplier Compensation",
            return_for_credit: "Return for Supplier Credit",
            return_for_replacement: "Return for Replacement",
            keep_with_discount: "Keep with Supplier Discount",
            keep_damaged: "Keep as Non-sellable / Quarantined",
            reject_without_replacement: "Reject without Replacement",
        }[resolution] || String(resolution || "No issue").replaceAll("_", " ")
    );
}

function paymentMethodLabel(method = "") {
    return (
        {
            cash: "Cash",
            bank_transfer: "Bank Transfer",
            check: "Check",
            gcash: "E-wallet",
            card: "Card",
            other: "Other",
            legacy_snapshot: "Not recorded",
        }[method] || String(method || "Not recorded").replaceAll("_", " ")
    );
}

function ensureReceivingUi() {
    if (document.getElementById("receivingUiBackdrop")) return;
    const inspectPage = document.body.dataset.page === "inspect-deliveries";
    const purchaseOrdersPage = document.body.dataset.page === "purchase-orders";
    const receivingReviewUi = inspectPage
        ? `
        <section class="grn-modal" id="grnModal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="grnPreviewTitle" data-mode="preview" hidden>
            <div class="grn-preview-shell">
                <div class="grn-preview-view" id="grnPreviewView">
                    <header class="grn-preview-toolbar">
                        <div class="grn-toolbar-left"><strong id="grnPreviewTitle">Goods Received Note</strong><div class="grn-revision-meta"><span><b>Last Edited:</b> <span id="grnLastEdited">Not edited yet</span></span><span id="grnEditedByRow" class="d-none"><b>Edited By:</b> <span id="grnEditedBy"></span></span><span id="grnEditReasonRow" class="d-none"><b>Reason:</b> <span id="grnEditReason"></span></span></div></div>
                        <div class="grn-preview-actions"><button class="btn btn-outline-primary d-none" id="btnGrnPreviewSupplier" type="button"><i class="fa-regular fa-eye me-1"></i>View Supplier Discrepancy</button><button class="btn btn-outline-primary d-none" id="btnGrnPreviewPrintSupplier" type="button"><i class="fa-solid fa-print me-1"></i>Print Supplier Discrepancy</button><button class="btn btn-primary" id="btnGrnPreviewPrint" type="button"><i class="fa-solid fa-print me-1"></i>Print GRN</button><button class="btn btn-light border" type="button" data-close-receiving-ui>Close</button></div>
                    </header>
                    <div class="grn-preview-scroll"><iframe id="grnPreviewFrame" title="Goods Received Note A4 preview"></iframe></div>
                </div>
                <div class="grn-edit-view" id="grnEditView" hidden>
                    <header><div><h2 id="grnEditTitle">Edit Goods Received Note</h2><p>Correct confirmed receiving values. Original PO identity and ordered quantities remain read-only.</p></div></header>
                    <div class="grn-edit-body" id="grnEditBody"></div>
                    <footer><button class="btn btn-light border" id="btnCancelGrnEdit" type="button">Cancel</button><button class="btn btn-purple" id="btnSaveGrnEdit" type="button" disabled><i class="fa-solid fa-floppy-disk me-1"></i>Save Changes</button></footer>
                </div>
            </div>
        </section>`
        : purchaseOrdersPage
          ? ""
          : `
        <aside class="receiving-drawer" id="receivingDetailsDrawer" aria-hidden="true" aria-labelledby="receivingDetailsTitle">
            <header class="receiving-drawer-header"><div class="receiving-drawer-title"><h2 id="receivingDetailsTitle">Receiving Details</h2><p id="receivingDetailsSubtitle">Posted receiving record</p></div><button class="receiving-drawer-close" type="button" data-close-receiving-ui aria-label="Close receiving details"><i class="fa-solid fa-xmark"></i></button></header>
            <div class="receiving-drawer-body" id="receivingDetailsBody"><div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading receiving details...</div></div>
            <footer class="receiving-drawer-footer"><button class="btn btn-light border" type="button" data-close-receiving-ui>Close</button><button class="btn btn-outline-primary d-none" id="btnDrawerSupplierDiscrepancy" type="button"><i class="fa-regular fa-eye me-1"></i>Supplier Discrepancy</button><button class="btn btn-outline-primary" id="btnDrawerPrintGrn" type="button"><i class="fa-solid fa-print me-1"></i>Print GRN</button><button class="btn btn-purple" id="btnDrawerManagePayment" type="button"><i class="fa-solid fa-wallet me-1"></i>Record Payment</button></footer>
        </aside>`;
    document.body.insertAdjacentHTML(
        "beforeend",
        `
        <div class="receiving-ui-backdrop" id="receivingUiBackdrop"></div>
        ${receivingReviewUi}
        <section class="supplier-payment-dialog" id="supplierPaymentDrawer" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="supplierPaymentTitle">
            <div class="supplier-payment-dialog-card supplier-payment-entry-card">
                <header class="receiving-drawer-header"><div class="receiving-drawer-title"><h2 id="supplierPaymentTitle">Supplier Payment</h2><p id="supplierPaymentSubtitle">Supplier invoice payment</p></div><button class="receiving-drawer-close" type="button" data-close-receiving-ui aria-label="Close supplier payment"><i class="fa-solid fa-xmark"></i></button></header>
                <div class="receiving-drawer-body" id="supplierPaymentBody"><div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading payment details...</div></div>
                <footer class="receiving-drawer-footer"><button class="btn btn-light border" type="button" data-close-receiving-ui>Cancel</button><button class="btn btn-purple" id="btnSaveSupplierPayment" type="button"><i class="fa-solid fa-money-check-dollar me-1"></i>Record Payment</button></footer>
            </div>
        </section>
        <section class="supplier-payment-dialog" id="supplierPaymentConfirmDialog" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="supplierPaymentConfirmTitle" aria-describedby="supplierPaymentConfirmMessage">
            <div class="supplier-payment-dialog-card">
                <header class="supplier-payment-dialog-header"><span class="supplier-payment-dialog-icon information"><i class="fa-solid fa-circle-info"></i></span><div><h2 id="supplierPaymentConfirmTitle">Confirm Supplier Payment</h2><p>Review the financial details before posting.</p></div></header>
                <div class="supplier-payment-dialog-body"><div class="supplier-payment-confirm-summary" id="supplierPaymentConfirmSummary"></div><p class="supplier-payment-context" id="supplierPaymentConfirmMessage"></p><p class="supplier-payment-readonly-warning">Posted supplier payments are read-only and cannot be directly edited or deleted.</p></div>
                <footer class="supplier-payment-dialog-footer"><button class="btn btn-light border" id="btnCancelSupplierPaymentConfirm" type="button">Cancel</button><button class="btn btn-purple" id="btnConfirmSupplierPayment" type="button"><i class="fa-solid fa-check me-1"></i>Confirm Payment</button></footer>
            </div>
        </section>
        <section class="supplier-payment-dialog" id="supplierPaymentResultDialog" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="supplierPaymentResultTitle" aria-describedby="supplierPaymentResultMessage">
            <div class="supplier-payment-dialog-card supplier-payment-result-card">
                <header class="supplier-payment-dialog-header"><span class="supplier-payment-dialog-icon" id="supplierPaymentResultIcon"><i class="fa-solid fa-circle-check"></i></span><div><h2 id="supplierPaymentResultTitle">Payment Recorded</h2><p id="supplierPaymentResultSubtitle">Supplier payment result</p></div></header>
                <div class="supplier-payment-dialog-body"><p class="supplier-payment-result-message" id="supplierPaymentResultMessage"></p></div>
                <footer class="supplier-payment-dialog-footer"><button class="btn btn-light border" id="btnSupplierPaymentResultSecondary" type="button">Done</button><button class="btn btn-purple" id="btnSupplierPaymentResultPrimary" type="button">View Payment Details</button></footer>
            </div>
        </section>`,
    );
    document
        .querySelectorAll("[data-close-receiving-ui]")
        .forEach((button) => button.addEventListener("click", closeReceivingUi));
    document.getElementById("receivingUiBackdrop")?.addEventListener("click", () => {
        if (
            document.querySelector(".supplier-payment-dialog.is-open") ||
            document.getElementById("grnModal")?.dataset.mode === "edit"
        )
            return;
        closeReceivingUi();
    });
    document.getElementById("btnDrawerPrintGrn")?.addEventListener(
        "click",
        () =>
            activeReceivingDetails &&
            openReceiptPreview(receiptReportFromReceiving(activeReceivingDetails), {
                autoPrint: true,
            }),
    );
    document
        .getElementById("btnDrawerSupplierDiscrepancy")
        ?.addEventListener(
            "click",
            () =>
                activeReceivingDetails &&
                openSupplierDiscrepancyPreview(receiptReportFromReceiving(activeReceivingDetails)),
        );
    document
        .getElementById("btnDrawerManagePayment")
        ?.addEventListener(
            "click",
            () => activeReceivingDetails && openSupplierPayment(activeReceivingDetails.po_id),
        );
    document.getElementById("btnGrnPreviewPrint")?.addEventListener(
        "click",
        () =>
            activeReceivingDetails &&
            openReceiptPreview(receiptReportFromReceiving(activeReceivingDetails), {
                autoPrint: true,
            }),
    );
    document
        .getElementById("btnGrnPreviewSupplier")
        ?.addEventListener(
            "click",
            () =>
                activeReceivingDetails &&
                openSupplierDiscrepancyPreview(receiptReportFromReceiving(activeReceivingDetails)),
        );
    document.getElementById("btnGrnPreviewPrintSupplier")?.addEventListener(
        "click",
        () =>
            activeReceivingDetails &&
            openSupplierDiscrepancyPreview(receiptReportFromReceiving(activeReceivingDetails), {
                autoPrint: true,
            }),
    );
    document.getElementById("btnCancelGrnEdit")?.addEventListener("click", closeGrnEditForm);
    document.getElementById("btnSaveGrnEdit")?.addEventListener("click", saveGrnEdit);
    document
        .getElementById("btnSaveSupplierPayment")
        ?.addEventListener("click", submitSupplierPayment);
    document.getElementById("supplierPaymentBody")?.addEventListener("click", (event) => {
        const invoiceButton = event.target.closest("[data-payment-view-invoice]");
        if (invoiceButton) {
            openSupplierInvoice(invoiceButton.dataset.poId || "");
            return;
        }
        const creditButton = event.target.closest(".apply-supplier-credit-btn");
        if (creditButton) applySupplierCreditFromPayment(creditButton);
    });
    document
        .getElementById("btnCancelSupplierPaymentConfirm")
        ?.addEventListener("click", cancelSupplierPaymentConfirmation);
    document
        .getElementById("btnConfirmSupplierPayment")
        ?.addEventListener("click", confirmSupplierPayment);
    document
        .getElementById("btnSupplierPaymentResultSecondary")
        ?.addEventListener("click", handleSupplierPaymentResultSecondary);
    document
        .getElementById("btnSupplierPaymentResultPrimary")
        ?.addEventListener("click", handleSupplierPaymentResultPrimary);
    document
        .getElementById("supplierPaymentConfirmDialog")
        ?.addEventListener("keydown", (event) =>
            trapSupplierPaymentDialogFocus(event, cancelSupplierPaymentConfirmation),
        );
    document
        .getElementById("supplierPaymentResultDialog")
        ?.addEventListener("keydown", (event) =>
            trapSupplierPaymentDialogFocus(event, handleSupplierPaymentResultSecondary),
        );
}

function closeReceivingUi() {
    document.querySelectorAll(".receiving-drawer").forEach((drawer) => {
        drawer.classList.remove("is-open");
        drawer.setAttribute("aria-hidden", "true");
        drawer.setAttribute("inert", "");
    });
    document.querySelectorAll(".supplier-payment-dialog").forEach((dialog) => {
        dialog.classList.remove("is-open");
        dialog.setAttribute("aria-hidden", "true");
        dialog.setAttribute("inert", "");
    });
    document.querySelectorAll(".grn-modal").forEach((dialog) => {
        dialog.classList.remove("is-open");
        dialog.hidden = true;
        dialog.setAttribute("aria-hidden", "true");
        dialog.setAttribute("inert", "");
    });
    document.getElementById("receivingUiBackdrop")?.classList.remove("is-open");
    document.body.style.overflow = "";
    window.scrollTo(0, receivingUiScrollY);
}

function showReceivingDrawer(drawerId) {
    ensureReceivingUi();
    if (!document.getElementById("receivingUiBackdrop")?.classList.contains("is-open"))
        receivingUiScrollY = window.scrollY;
    document.querySelectorAll(".supplier-payment-dialog").forEach((dialog) => {
        const active = dialog.id === drawerId;
        dialog.classList.toggle("is-open", active);
        dialog.setAttribute("aria-hidden", active ? "false" : "true");
        dialog.toggleAttribute("inert", !active);
    });
    document.querySelectorAll(".receiving-drawer").forEach((drawer) => {
        const active = drawer.id === drawerId;
        drawer.classList.toggle("is-open", active);
        drawer.setAttribute("aria-hidden", active ? "false" : "true");
        drawer.toggleAttribute("inert", !active);
    });
    document.querySelectorAll(".grn-modal").forEach((dialog) => {
        const active = dialog.id === drawerId;
        dialog.hidden = !active;
        dialog.classList.toggle("is-open", active);
        dialog.setAttribute("aria-hidden", active ? "false" : "true");
        dialog.toggleAttribute("inert", !active);
    });
    document.getElementById("receivingUiBackdrop")?.classList.add("is-open");
    document.body.style.overflow = "hidden";
}

function setGrnModalMode(mode = "preview") {
    const modal = document.getElementById("grnModal");
    const preview = document.getElementById("grnPreviewView");
    const edit = document.getElementById("grnEditView");
    if (!modal || !preview || !edit) return;
    const editing = mode === "edit";
    modal.dataset.mode = editing ? "edit" : "preview";
    preview.hidden = editing;
    edit.hidden = !editing;
    modal.setAttribute("aria-labelledby", editing ? "grnEditTitle" : "grnPreviewTitle");
}

async function fetchReceivingDetails(poId, fresh = false, receivingId = "") {
    const normalizedReceivingId = String(receivingId || "").trim();
    const cacheKey = normalizedReceivingId ? `${poId}:${normalizedReceivingId}` : String(poId);
    if (!fresh && receivingDetailsCache.has(cacheKey)) return receivingDetailsCache.get(cacheKey);
    const parameters = new URLSearchParams({ po_id: poId, t: String(Date.now()) });
    if (normalizedReceivingId) parameters.set("receiving_id", normalizedReceivingId);
    const data = await fetchJson(
        `${API_BASE_URL}/purchase_orders/get_receiving_details.php?${parameters.toString()}`,
        { retryGet: false },
    );
    receivingDetailsCache.set(cacheKey, data.receiving);
    return data.receiving;
}

async function fetchReceivingHistory(poId) {
    const parameters = new URLSearchParams({ po_id: poId, t: String(Date.now()) });
    const data = await fetchJson(
        `${API_BASE_URL}/purchase_orders/get_receiving_history.php?${parameters.toString()}`,
        { retryGet: false },
    );
    return Array.isArray(data.history) ? data.history : [];
}

async function renderPoSupplierInvoice(order) {
    const section = document.getElementById("poSupplierInvoice");
    const content = document.getElementById("poSupplierInvoiceContent");
    const invoiceSummary = document.getElementById("poViewInvoiceDetails");
    const poId = String(order?.po_id || "");
    if (!section || !content || !invoiceSummary || !poId) return;
    section.hidden = true;
    invoiceSummary.innerHTML =
        '<div class="po-view-sidebar-loading">Loading supplier invoice...</div>';
    content.innerHTML =
        '<div class="po-receiving-documents-loading"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Loading supplier invoice...</span></div>';
    try {
        const payload = await fetchJson(
            `${API_BASE_URL}/purchase_orders/get_purchase_order_invoice.php?po_id=${encodeURIComponent(poId)}&t=${Date.now()}`,
            { retryGet: false },
        );
        if (String(activeViewOrder?.po_id || "") !== poId) return;
        const invoice = payload.invoice;
        if (!invoice?.invoice_id) {
            const canRecord = ["Draft", "Pending", "Arrived", "Delivered"].includes(
                order.status || "",
            );
            content.innerHTML = `<div class="po-view-invoice-empty"><p><strong>Awaiting Supplier Invoice</strong><br><span>No supplier invoice has been recorded for this purchase order.</span></p>${canRecord ? `<button class="po-view-invoice-action" type="button" data-po-invoice-action="record" data-po-id="${escapeHtml(poId)}"><i class="fa-solid fa-file-circle-plus" aria-hidden="true"></i><span>Record Supplier Invoice</span></button>` : ""}</div>`;
            invoiceSummary.innerHTML = `<div class="po-view-invoice-summary"><span>Not recorded</span>${canRecord ? `<button class="po-view-link-action" type="button" data-po-invoice-action="record" data-po-id="${escapeHtml(poId)}">Record invoice</button>` : ""}</div>`;
            const invoiceMeta = document.getElementById("poViewInvoiceMeta");
            if (invoiceMeta) invoiceMeta.innerHTML = "<dt>Supplier invoice</dt><dd>Not recorded</dd>";
            const progress = document.getElementById("poViewProgress");
            if (progress) progress.innerHTML = purchaseOrderProgressMarkup(order);
            return;
        }
        order.view_invoice_date = invoice.invoice_date;
        let paymentSummary = {};
        try {
            const paymentPayload = await fetchJson(
                `${API_BASE_URL}/purchase_orders/get_purchase_order_payment_details.php?po_id=${encodeURIComponent(poId)}&t=${Date.now()}`,
                { retryGet: false },
            );
            paymentSummary = paymentPayload.payment_details?.payment || {};
        } catch (_) {
            paymentSummary = {};
        }
        content.innerHTML = `
            <div class="po-view-invoice-meta">
                <div><span>Invoice Number</span><strong>${escapeHtml(invoice.invoice_number || "—")}</strong></div>
                <div><span>Invoice Date</span><strong>${escapeHtml(formatDate(invoice.invoice_date))}</strong></div>
                <div><span>Supplier</span><strong>${escapeHtml(invoice.supplier_name || order.supplier_name || "—")}</strong></div>
                <div><span>Payment Status</span>${paymentStatusBadge(order.payment_status || "Unpaid")}</div>
                <div><span>Invoice Total</span><strong>${peso(invoice.supplier_invoice_total)}</strong></div>
            </div>
            ${supplierInvoiceItemsMarkup(invoice.items || [], { compact: true, productHeading: "Product / Specification", quantityHeading: "Invoiced Qty", quantityWithUnit: true })}
            <div class="po-view-invoice-totals">
                <div><span>Subtotal</span><strong>${peso(invoice.subtotal)}</strong></div>
                <div><span>Discount</span><strong>-${peso(invoice.discount)}</strong></div>
                <div><span>Other Charges</span><strong>${peso(invoice.other_charges)}</strong></div>
                <div class="final"><span>Final Invoice Total</span><strong>${peso(invoice.supplier_invoice_total)}</strong></div>
            </div>
            ${supplierInvoicePaymentSummaryMarkup(poId, invoice, paymentSummary)}
            <div class="po-view-invoice-actions"><span class="supplier-invoice-status">Recorded</span><button class="po-view-invoice-action" type="button" data-po-invoice-action="print" data-po-id="${escapeHtml(poId)}"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i><span>View / Print Supplier Invoice</span></button>${getPoPaymentStatus({ ...order, payment_status: paymentSummary.payment_status || order.payment_status }) === "paid" ? "" : `<button class="po-view-invoice-action" type="button" data-po-invoice-action="edit" data-po-id="${escapeHtml(poId)}">Edit Invoice</button>`}</div>`;
        const invoiceByItem = new Map(
            (invoice.items || []).map((item) => [String(item.po_item_id), item]),
        );
        document.querySelectorAll("#poViewItemsTable tbody tr[data-po-item-id]").forEach((row) => {
            const invoiceItem = invoiceByItem.get(String(row.dataset.poItemId));
            const cells = row.querySelectorAll("td");
            if (!invoiceItem || cells.length < 6) return;
            cells[2].textContent =
                `${formatPoViewNumber(invoiceItem.invoice_qty)} ${invoiceItem.purchase_unit || "pcs"}`;
            cells[4].textContent = peso(invoiceItem.unit_cost);
            cells[5].textContent = peso(invoiceItem.line_total);
        });
        const invoiceMeta = document.getElementById("poViewInvoiceMeta");
        if (invoiceMeta) {
            invoiceMeta.innerHTML = `<dt>Supplier invoice</dt><dd>${escapeHtml(invoice.invoice_number || "—")} · ${escapeHtml(poViewDate(invoice.invoice_date))}</dd>`;
        }
        invoiceSummary.innerHTML = `
            <div class="po-view-invoice-summary">
                <span>#${escapeHtml(invoice.invoice_number || "—")} · ${escapeHtml(poViewDate(invoice.invoice_date))}</span>
                <button class="po-view-link-action" type="button" data-po-invoice-action="print" data-po-id="${escapeHtml(poId)}">View invoice</button>
            </div>
            <details class="po-view-nested-disclosure"><summary>Full invoice breakdown</summary>${content.innerHTML}</details>`;
        const progress = document.getElementById("poViewProgress");
        if (progress) progress.innerHTML = purchaseOrderProgressMarkup(order, invoice);
    } catch (error) {
        if (String(activeViewOrder?.po_id || "") !== poId) return;
        content.innerHTML = `<div class="po-receiving-documents-loading po-receiving-documents-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>${escapeHtml(error.message || "Unable to load the supplier invoice.")}</span></div>`;
        invoiceSummary.innerHTML = `<div class="po-view-inline-error">${escapeHtml(error.message || "Unable to load the supplier invoice.")}</div>`;
    }
}

async function openSupplierInvoiceDocument(poId) {
    const targetWindow = window.open("", "_blank", "width=1200,height=850");
    if (!targetWindow) return;
    try {
        const [order, payload] = await Promise.all([
            getPurchaseOrder(poId),
            fetchJson(
                `${API_BASE_URL}/purchase_orders/get_purchase_order_invoice.php?po_id=${encodeURIComponent(poId)}&t=${Date.now()}`,
                { retryGet: false },
            ),
        ]);
        const invoice = payload.invoice;
        if (!invoice?.invoice_id)
            throw new Error("No supplier invoice is recorded for this purchase order.");
        const rows = (invoice.items || [])
            .map(
                (item, index) =>
                    `<tr><td class="center">${index + 1}</td><td><strong>${escapeHtml(item.product_name || "")}</strong>${item.brand_name ? `<span>${escapeHtml(item.brand_name)}</span>` : ""}${item.specification ? `<span>${escapeHtml(item.specification)}</span>` : ""}</td><td class="center">${escapeHtml(item.purchase_unit || "pcs")}</td><td class="center">${escapeHtml(supplierInvoiceQuantityLabel(item))}</td><td class="money">${peso(item.unit_cost)}</td><td class="money">${peso(item.line_total)}</td></tr>`,
            )
            .join("");
        targetWindow.document.write(
            `<!doctype html><html><head><meta charset="utf-8"><title>Supplier Invoice - ${escapeHtml(invoice.invoice_number || order.po_number || "")}</title><style>*{box-sizing:border-box}@page{size:A4 portrait;margin:12mm}body{margin:0;background:#e5e7eb;color:#111;font-family:Arial,Helvetica,sans-serif}.actions{display:flex;justify-content:center;gap:8px;padding:12px}.actions button{padding:8px 14px;border:1px solid #111;border-radius:4px;background:#fff;font-weight:700;cursor:pointer}.document{width:210mm;min-height:297mm;margin:0 auto 24px;padding:12mm;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.16);font-size:9pt}.header{text-align:center;padding-bottom:4mm;border-bottom:1.5px solid #111}.header h1{margin:0;font-size:18pt}.header h2{margin:2mm 0 0;font-size:12pt;letter-spacing:1px}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2mm 8mm;padding:4mm 0}.meta div{display:grid;grid-template-columns:32mm 1fr;gap:2mm}.meta span,.totals span{font-size:7pt;font-weight:700;text-transform:uppercase;color:#444}.items{width:100%;border-collapse:collapse;table-layout:fixed}.items th,.items td{padding:2mm 1.2mm;border:.3mm solid #555;vertical-align:top}.items th{background:#eee;font-size:6pt;text-transform:uppercase}.items th:nth-child(1){width:5%}.items th:nth-child(2){width:37%}.items th:nth-child(3){width:13%}.items th:nth-child(4){width:17%}.items th:nth-child(5),.items th:nth-child(6){width:14%}.items td span{display:block;margin-top:1mm;color:#555;font-size:7pt}.center{text-align:center}.money{text-align:right;white-space:nowrap}.totals{width:78mm;margin:5mm 0 0 auto}.totals div{display:flex;justify-content:space-between;gap:8mm;padding:1.7mm 0;border-bottom:.25mm solid #aaa}.totals .final{padding-top:2.5mm;border-top:.5mm solid #111;border-bottom:0;font-size:10pt;font-weight:800}@media print{body{background:#fff}.actions{display:none}.document{width:186mm;min-height:273mm;margin:0;padding:0;box-shadow:none}}</style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button></div><main class="document"><header class="header"><h1>${escapeHtml(invoice.supplier_name || order.supplier_name || "Supplier")}</h1><h2>SUPPLIER INVOICE</h2></header><section class="meta"><div><span>Invoice Number</span><strong>${escapeHtml(invoice.invoice_number || "—")}</strong></div><div><span>Invoice Date</span><strong>${escapeHtml(formatDate(invoice.invoice_date))}</strong></div><div><span>PO Number</span><strong>${escapeHtml(order.po_number || "—")}</strong></div><div><span>Payment Status</span><strong>${escapeHtml(order.payment_status || "Unpaid")}</strong></div></section><table class="items"><thead><tr><th>#</th><th>Product / Specification</th><th>Purchase Unit</th><th>Invoiced Qty</th><th>Unit Cost</th><th>Line Total</th></tr></thead><tbody>${rows}</tbody></table><section class="totals"><div><span>Subtotal</span><strong>${peso(invoice.subtotal)}</strong></div><div><span>Discount</span><strong>-${peso(invoice.discount)}</strong></div><div><span>Other Charges</span><strong>${peso(invoice.other_charges)}</strong></div><div class="final"><span>Final Invoice Total</span><strong>${peso(invoice.supplier_invoice_total)}</strong></div></section></main></body></html>`,
        );
        targetWindow.document.close();
    } catch (error) {
        targetWindow.close();
        PharmaUtils.toast.error(error.message);
    }
}

function receivingDocumentStatusLabel(status) {
    return String(status || "")
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function renderPoReceivingDocuments(poId) {
    const summarySection = document.getElementById("poReceivingSummary");
    const summaryContent = document.getElementById("poReceivingSummaryContent");
    const section = document.getElementById("poReceivingDocuments");
    const list = document.getElementById("poReceivingDocumentsList");
    const receivingDetails = document.getElementById("poViewReceivingDetails");
    if (!summarySection || !summaryContent || !section || !list || !receivingDetails) return;
    summarySection.hidden = true;
    section.hidden = true;
    summaryContent.innerHTML =
        '<div class="po-receiving-documents-loading"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Loading receiving summary...</span></div>';
    list.innerHTML =
        '<div class="po-receiving-documents-loading"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Loading receiving documents...</span></div>';
    receivingDetails.innerHTML = '<div class="po-view-sidebar-loading">Loading receiving records...</div>';
    try {
        const history = await fetchReceivingHistory(poId);
        if (String(activeViewOrder?.po_id || "") !== String(poId)) return;
        if (!history.length) {
            summaryContent.innerHTML =
                '<div class="po-record-empty"><span>No completed receiving or inspection record yet.</span></div>';
            list.innerHTML =
                '<div class="po-record-empty"><span>No receiving documents are available yet.</span></div>';
            receivingDetails.innerHTML = '<div class="po-view-inline-empty">No receiving records yet.</div>';
            const progress = document.getElementById("poViewProgress");
            if (progress) progress.innerHTML = purchaseOrderProgressMarkup(activeViewOrder);
            return;
        }
        const eventDetails = (
            await Promise.all(
                history.map(async (event) => {
                    try {
                        return await fetchReceivingDetails(poId, false, event.receiving_id);
                    } catch {
                        return null;
                    }
                }),
            )
        ).filter(Boolean);
        if (String(activeViewOrder?.po_id || "") !== String(poId)) return;
        if (!eventDetails.length) {
            summaryContent.innerHTML =
                '<div class="po-record-empty"><span>No completed receiving or inspection record yet.</span></div>';
            list.innerHTML =
                '<div class="po-record-empty"><span>No receiving documents are available yet.</span></div>';
            receivingDetails.innerHTML = '<div class="po-view-inline-empty">No receiving records yet.</div>';
            return;
        }
        summaryContent.innerHTML = eventDetails
            .map((details) => {
                const report = receiptReportFromReceiving(details);
                const eventMeta = [
                    details.grn_number || "Goods Received Note",
                    `Received ${receiptDisplayDate(details.received_date)}`,
                ]
                    .filter(Boolean)
                    .join(" · ");
                const rows = (report.items || [])
                    .map((item) => {
                        const affected = Math.max(
                            supplierDiscrepancyAffectedQuantity(item),
                            Number(item.replacementExpectedQty || 0),
                        );
                        const itemHasIssue =
                            affected > 0 || (item.resolution && item.resolution !== "none");
                        const resolution = itemHasIssue
                            ? receivingDocumentStatusLabel(
                                  supplierDiscrepancyContext({ items: [item] }).status,
                              )
                            : "No issue";
                        return `<tr>
                    <td><strong>${escapeHtml(item.product || "Product")}</strong><small>${escapeHtml([item.brand, item.specification].filter(Boolean).join(" · "))}</small></td>
                    <td>${Number(item.orderedQty || 0)}</td>
                    <td>${Number(item.receivedQty || 0)}</td>
                    <td>${Number(item.acceptedQty ?? item.goodQty ?? 0)}</td>
                    <td>${affected}</td>
                    <td class="${itemHasIssue ? "po-view-resolution" : ""}">${escapeHtml(resolution)}</td>
                </tr>`;
                    })
                    .join("");
                return `<article class="po-view-receiving-event">
                <div class="po-view-receiving-event-header"><div><strong>${escapeHtml(eventMeta)}</strong><span>Receiving Status: ${escapeHtml(details.inspection_status || "Completed")}</span></div>${details.delivery_receipt_no ? `<span>Delivery Receipt ${escapeHtml(details.delivery_receipt_no)}</span>` : ""}</div>
                <div class="po-view-record-table-wrap"><table class="po-view-record-table po-view-receiving-table"><thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Accepted</th><th>Affected</th><th>Resolution</th></tr></thead><tbody>${rows}</tbody></table></div>
            </article>`;
            })
            .join("");
        list.innerHTML = eventDetails
            .map((details) => {
                const report = receiptReportFromReceiving(details);
                const hasDiscrepancy = receivingHasDiscrepancy(report);
                const discrepancy = hasDiscrepancy ? supplierDiscrepancyContext(report) : null;
                const discrepancyStatus = discrepancy
                    ? receivingDocumentStatusLabel(discrepancy.status)
                    : "";
                const affectedQuantity = discrepancy
                    ? discrepancy.items.reduce(
                          (total, item) => total + supplierDiscrepancyAffectedQuantity(item),
                          0,
                      )
                    : 0;
                const eventMeta = [
                    `Received ${receiptDisplayDate(details.received_date)}`,
                    details.delivery_receipt_no
                        ? `Delivery Receipt ${details.delivery_receipt_no}`
                        : "",
                ]
                    .filter(Boolean)
                    .join(" · ");
                return `<article class="po-receiving-document-event">
                <div>
                    <div class="po-receiving-event-title"><strong>${escapeHtml(details.grn_number || "Goods Received Note")}</strong></div>
                    <span class="po-receiving-event-meta">${escapeHtml(eventMeta)}</span>
                </div>
                <span class="po-receiving-event-status">${escapeHtml(details.inspection_status || "Completed")}</span>
                <div class="po-receiving-document-actions">
                    <button class="po-receiving-document-action" type="button" data-receiving-document="grn" data-po-id="${escapeHtml(poId)}" data-receiving-id="${escapeHtml(details.receiving_id)}" title="View and print this Goods Received Note">
                        <i class="fa-regular fa-file-lines" aria-hidden="true"></i><span>View / Print GRN</span>
                    </button>
                </div>
                ${
                    hasDiscrepancy
                        ? `<section class="po-receiving-discrepancy" aria-label="Delivery discrepancy document">
                    <div class="po-receiving-discrepancy-heading">
                        <strong>Delivery Discrepancy &amp; Replacement Acknowledgement</strong>
                        <span>${affectedQuantity} affected ${affectedQuantity === 1 ? "unit" : "units"}</span>
                    </div>
                    <span class="po-receiving-claim-status">Resolution: ${escapeHtml(discrepancyStatus)}</span>
                    <button class="po-receiving-document-action is-discrepancy" type="button" data-receiving-document="discrepancy" data-po-id="${escapeHtml(poId)}" data-receiving-id="${escapeHtml(details.receiving_id)}" title="View and print the discrepancy and supplier resolution for this receiving event">
                        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>View / Print Discrepancy</span>
                    </button>
                </section>`
                        : ""
                }
            </article>`;
            })
            .join("");
        const latestReceivingDate = eventDetails[0]?.received_date || "";
        if (activeViewOrder) activeViewOrder.view_received_date = latestReceivingDate;
        receivingDetails.innerHTML = `
            <details class="po-view-nested-disclosure">
                <summary>Receiving summary (${eventDetails.length} ${eventDetails.length === 1 ? "event" : "events"})</summary>
                ${summaryContent.innerHTML}
            </details>
            <div class="po-view-receiving-documents-list">${list.innerHTML}</div>`;
        const progress = document.getElementById("poViewProgress");
        if (progress) {
            progress.innerHTML = purchaseOrderProgressMarkup(
                activeViewOrder,
                null,
                null,
                latestReceivingDate,
            );
        }
    } catch (error) {
        summarySection.hidden = true;
        section.hidden = true;
        summaryContent.innerHTML = `<div class="po-receiving-documents-loading po-receiving-documents-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>${escapeHtml(error.message || "Unable to load the receiving summary.")}</span></div>`;
        list.innerHTML = `<div class="po-receiving-documents-loading po-receiving-documents-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>${escapeHtml(error.message || "Unable to load receiving documents.")}</span></div>`;
        receivingDetails.innerHTML = `<div class="po-view-inline-error">${escapeHtml(error.message || "Unable to load receiving records.")}</div>`;
    }
}

async function fetchPurchaseOrderPaymentDetails(poId) {
    const data = await fetchJson(
        `${API_BASE_URL}/purchase_orders/get_purchase_order_payment_details.php?po_id=${encodeURIComponent(poId)}&t=${Date.now()}`,
        { retryGet: false },
    );
    return data.payment_details;
}

function receivingItemDisplayName(item) {
    const mainName = String(item.generic_name || item.product_name || "Product").trim();
    const parts = [
        mainName,
        item.brand_name,
        item.generic_or_variant,
        item.strength,
        item.size_value,
        item.unit,
        item.packaging,
    ]
        .filter((value) => String(value || "").trim())
        .filter((value, index, values) => {
            const normalized = String(value).trim().toLowerCase();
            return values.findIndex((candidate) => String(candidate).trim().toLowerCase() === normalized) === index;
        });
    return parts
        .join(" · ");
}

function receivingQuantityLabel(value, unit = "Pc") {
    return `${Number(value || 0)} ${String(unit || "Pc")}`;
}

function receivingReturnedLabel(item) {
    const baseQuantity = Number(item.returned_quantity || 0);
    const selectedQuantity = Number(item.action_selected_quantity || 0);
    const selectedUnit = String(item.action_unit_name || "").trim();
    const base = receivingQuantityLabel(baseQuantity, item.unit || "Pc");
    return selectedQuantity > 0 &&
        selectedUnit &&
        (selectedQuantity !== baseQuantity || selectedUnit !== item.unit)
        ? `${selectedQuantity} ${selectedUnit} / ${base}`
        : base;
}

function receivingSupplierResolution(details) {
    const labels = [
        ...new Set(
            (details.items || [])
                .filter((item) => item.resolution && item.resolution !== "none")
                .map((item) => receivingResolutionLabel(item.resolution)),
        ),
    ];
    return labels.length ? labels.join(", ") : "No supplier claim";
}

function renderPaymentHistory(payments = []) {
    if (!payments.length)
        return '<div class="payment-history-card"><div class="text-muted small">No supplier payments recorded.</div></div>';
    return `<div class="payment-history-card"><table class="payment-history-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Payment Type</th><th>Reference</th><th>Recorded By</th><th>Remarks</th></tr></thead><tbody>${payments
        .map((payment) => {
            const method = payment.display_method || paymentMethodLabel(payment.payment_method);
            const reference = payment.display_reference || payment.reference_number || "—";
            const remarks = payment.display_remarks || payment.remarks || "—";
            const dateNote =
                payment.date_note || `Entered ${receiptDisplayDate(payment.created_at)}`;
            return `<tr><td>${escapeHtml(formatDate(payment.payment_date))}<span class="payment-date-note" title="${escapeHtml(receiptDisplayDate(payment.created_at))}">${escapeHtml(dateNote)}</span></td><td><strong>${peso(payment.amount)}</strong></td><td>${escapeHtml(method)}</td><td>${escapeHtml(payment.payment_type || "Advance Payment")}</td><td>${escapeHtml(reference)}</td><td>${escapeHtml(payment.recorded_by_name || "System")}</td><td><span class="payment-remarks" title="${escapeHtml(remarks)}">${escapeHtml(remarks)}</span></td></tr>`;
        })
        .join("")}</tbody></table></div>`;
}

function renderReceivingDetails(details) {
    const payment = details.payment || {};
    const items = details.items || [];
    const supplierCredit = Number(details.totals?.supplier_credit || 0);
    const supplierDiscount = Number(details.totals?.supplier_discount || 0);
    return `
        <div class="receiving-section-title"><i class="fa-solid fa-clipboard-check"></i>Receiving Summary</div>
        <div class="receiving-info-grid">
            <div class="receiving-info-box"><span>GRN Number</span><strong>${escapeHtml(details.grn_number)}</strong></div>
            <div class="receiving-info-box"><span>PO Number</span><strong>${escapeHtml(details.po_number)}</strong></div>
            <div class="receiving-info-box"><span>Supplier</span><strong>${escapeHtml(details.supplier_name)}</strong></div>
            <div class="receiving-info-box"><span>Arrival Date</span><strong>${escapeHtml(formatDate(details.expected_delivery_date))}</strong></div>
            <div class="receiving-info-box"><span>Received Date</span><strong>${escapeHtml(receiptDisplayDate(details.received_date))}</strong></div>
            <div class="receiving-info-box"><span>Received By</span><strong>${escapeHtml(details.received_by || "System")}</strong></div>
            <div class="receiving-info-box"><span>Delivered By / Driver</span><strong>${escapeHtml(details.delivered_by_name || "—")}</strong></div>
            <div class="receiving-info-box"><span>Supplier Delivery Receipt No.</span><strong>${escapeHtml(details.delivery_receipt_no || "—")}</strong></div>
            <div class="receiving-info-box"><span>PO Business Status</span><strong>${escapeHtml(details.status || "Delivered")}</strong></div>
            <div class="receiving-info-box"><span>Receiving Status</span><strong><span class="receiving-result-badge">Receiving Completed</span></strong></div>
            <div class="receiving-info-box"><span>Payment Status</span><strong>${paymentStatusBadge(payment.payment_status)}</strong></div>
        </div>
        <div class="receiving-section-title"><i class="fa-solid fa-magnifying-glass"></i>Product Inspection Results</div>
        ${items
            .map(
                (item, index) => `
                    <article class="receiving-item-detail"><div class="receiving-item-head"><div class="receiving-product-name"><strong>${index + 1}. ${escapeHtml(item.generic_name || item.product_name || "Product")}</strong>${item.brand_name && String(item.brand_name).trim().toLowerCase() !== String(item.generic_name || item.product_name || "").trim().toLowerCase() ? `<span>${escapeHtml(item.brand_name)}</span>` : ""}</div><span class="receiving-result-badge">${escapeHtml(receivingResolutionLabel(item.resolution))}</span></div>
                <div class="receiving-qty-grid">
                    ${[
                        ["Ordered", receivingQuantityLabel(item.ordered_quantity, item.unit)],
                        ["Delivered", receivingQuantityLabel(item.delivered_quantity, item.unit)],
                        ["Accepted", receivingQuantityLabel(item.accepted_quantity, item.unit)],
                        [
                            "Physically Damaged",
                            receivingQuantityLabel(item.damaged_quantity, item.unit),
                        ],
                        ["Returned", receivingReturnedLabel(item)],
                        ["Missing", receivingQuantityLabel(item.missing_quantity, item.unit)],
                        [
                            "Replacement Pending",
                            receivingQuantityLabel(item.replacement_pending_quantity, item.unit),
                        ],
                        [
                            "Inventory Added",
                            receivingQuantityLabel(item.inventory_added, item.unit),
                        ],
                    ]
                        .map(
                            ([label, value]) =>
                                `<div class="receiving-qty"><span>${label}</span><b>${escapeHtml(value)}</b></div>`,
                        )
                        .join("")}
                </div>
                ${(item.damage_breakdown || []).length ? `<section class="receiving-damage-details"><h4>Affected Goods Breakdown</h4>${item.damage_breakdown.map((line) => `<div class="receiving-damage-row"><span>${escapeHtml(`${item.purchase_unit || line.affected_unit_name || "Package"} ${Number(line.package_sequence || line.sequence_no || 0)} of ${Number(item.delivered_purchase_quantity || 0)}`)}${line.batch_identifier ? ` · ${escapeHtml(line.batch_identifier)}` : ""}</span><strong>${Number(line.damaged_base_quantity || 0)} ${escapeHtml(item.unit || line.damaged_unit_name || "Pc")} damaged</strong></div>`).join("")}<div class="receiving-damage-total"><span>Total Physically Damaged</span><strong>${receivingQuantityLabel(item.damaged_quantity, item.unit)} damaged</strong></div></section>` : ""}
                ${item.resolution !== "none" ? `<dl class="receiving-claim-summary"><div><dt>Issue</dt><dd>${escapeHtml(item.issue_type || "Issue")}</dd></div><div><dt>Affected Goods Action</dt><dd>${escapeHtml(item.affected_goods_action || "Not Applicable")}</dd></div><div><dt>Supplier Resolution</dt><dd>${escapeHtml(receivingResolutionLabel(item.resolution))}</dd></div><div><dt>Claim Status</dt><dd>${escapeHtml(item.return_status || "Pending")}</dd></div>${String(item.item_remarks || "").trim() ? `<div class="wide"><dt>Item Remarks</dt><dd>${escapeHtml(item.item_remarks)}</dd></div>` : ""}</dl>` : ""}
            </article>`,
            )
            .join("")}
        <div class="receiving-section-title"><i class="fa-solid fa-boxes-stacked"></i>Batch and Expiry Allocation</div>
        ${items.map((item, index) => `<article class="receiving-item-detail"><div class="receiving-item-head"><strong>${index + 1}. ${escapeHtml(receivingItemDisplayName(item))}</strong><span>${Number(item.inventory_added || 0)} added</span></div><table class="receiving-batch-table"><thead><tr><th>Batch Identifier</th><th>Batch Qty</th><th>Inventory Qty</th><th>Damaged</th><th>Returned</th><th>Expiry</th></tr></thead><tbody>${(item.batches || []).length ? item.batches.map((batch) => `<tr><td>${escapeHtml(batch.batch_identifier)}</td><td>${batch.batch_quantity}</td><td>${batch.inventory_quantity}</td><td>${batch.damaged_qty}</td><td>${batch.returned_qty}</td><td>${escapeHtml(batch.expiry_date ? formatDate(batch.expiry_date) : "No expiry")}</td></tr>`).join("") : '<tr><td colspan="6">No inventory batch was posted.</td></tr>'}</tbody></table></article>`).join("")}
        <div class="receiving-section-title"><i class="fa-solid fa-file-invoice-dollar"></i>Financial Summary</div>
        <div class="receiving-financial-card">
            <div class="receiving-money-line"><span>Original PO Total</span><strong>${peso(details.total_amount)}</strong></div>
            ${supplierCredit > 0 || supplierDiscount > 0 ? `<details class="payment-adjustments"><summary>Adjustment breakdown</summary>${supplierCredit > 0 ? `<div class="receiving-money-line"><span>Supplier Credit</span><strong>-${peso(supplierCredit)}</strong></div>` : ""}${supplierDiscount > 0 ? `<div class="receiving-money-line"><span>Supplier Discount</span><strong>-${peso(supplierDiscount)}</strong></div>` : ""}</details>` : ""}
            <div class="receiving-money-line"><span>Credits Applied</span><strong>-${peso(payment.supplier_credit_applied || 0)}</strong></div>
            <div class="receiving-money-line"><span>Adjusted Payable</span><strong>${peso(payment.adjusted_payable)}</strong></div>
            <div class="receiving-money-line"><span>Total Paid</span><strong>${peso(payment.total_paid)}</strong></div>
            <div class="receiving-money-line emphasis"><span>Remaining Balance</span><strong>${peso(payment.remaining_balance)}</strong></div>
            <div class="payment-summary-status"><span>Payment Status</span>${paymentStatusBadge(payment.payment_status)}</div>
        </div>
        <div class="receiving-section-title"><i class="fa-solid fa-money-check-dollar"></i>Payment History</div>
        ${renderPaymentHistory(payment.payments || [])}
        <div class="receiving-section-title"><i class="fa-regular fa-note-sticky"></i>Receiving Remarks</div>
        <div class="receiving-info-box">${escapeHtml(details.receiving_remarks || "No receiving remarks.")}</div>`;
}

async function openReceivingDetails(poId) {
    if (document.body.dataset.page === "inspect-deliveries") {
        await openGrnPreview(poId);
        return;
    }
    showReceivingDrawer("receivingDetailsDrawer");
    const body = document.getElementById("receivingDetailsBody");
    if (body)
        body.innerHTML =
            '<div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading receiving details...</div>';
    try {
        const details = await fetchReceivingDetails(poId, true);
        activeReceivingDetails = details;
        document.getElementById("receivingDetailsTitle").textContent = "Receiving Details";
        document.getElementById("receivingDetailsSubtitle").textContent =
            `${details.grn_number} · ${details.po_number} · ${details.supplier_name}`;
        if (body) body.innerHTML = renderReceivingDetails(details);
        document
            .getElementById("btnDrawerSupplierDiscrepancy")
            ?.classList.toggle(
                "d-none",
                !receivingHasDiscrepancy(receiptReportFromReceiving(details)),
            );
        const manage = document.getElementById("btnDrawerManagePayment");
        if (manage) {
            const canManage = !isPurchaseOrderPaid(
                details.payment?.payment_status,
                details.payment?.remaining_balance,
            );
            manage.classList.toggle("d-none", !canManage);
            manage.innerHTML = '<i class="fa-solid fa-wallet me-1"></i>Record Payment';
        }
    } catch (error) {
        if (body)
            body.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
    }
}

function updateGrnRevisionToolbar(details) {
    const revision = details.latest_revision || null;
    const lastEdited = document.getElementById("grnLastEdited");
    const editedByRow = document.getElementById("grnEditedByRow");
    const reasonRow = document.getElementById("grnEditReasonRow");
    if (lastEdited)
        lastEdited.textContent = revision
            ? receiptDisplayDate(revision.edited_at)
            : "Not edited yet";
    if (editedByRow) editedByRow.classList.toggle("d-none", !revision);
    if (reasonRow) reasonRow.classList.toggle("d-none", !revision);
    if (revision) {
        const editedBy = document.getElementById("grnEditedBy");
        const reason = document.getElementById("grnEditReason");
        if (editedBy) editedBy.textContent = revision.edited_by_name || "System";
        if (reason) reason.textContent = revision.edit_reason || "";
    }
}

function renderGrnPreviewDocument(details) {
    const frame = document.getElementById("grnPreviewFrame");
    if (!frame?.contentWindow) return;
    openReceiptPreview(receiptReportFromReceiving(details), {
        targetWindow: frame.contentWindow,
        embedded: true,
    });
}

async function openGrnPreview(poId) {
    ensureReceivingUi();
    setGrnModalMode("preview");
    showReceivingDrawer("grnModal");
    const frame = document.getElementById("grnPreviewFrame");
    if (frame)
        frame.srcdoc =
            '<!doctype html><html><body style="font-family:Arial;padding:40px;text-align:center;color:#667085">Loading Goods Received Note...</body></html>';
    try {
        const details = await fetchReceivingDetails(poId, true);
        activeReceivingDetails = details;
        updateGrnRevisionToolbar(details);
        const hasDiscrepancy = receivingHasDiscrepancy(receiptReportFromReceiving(details));
        document
            .getElementById("btnGrnPreviewSupplier")
            ?.classList.toggle("d-none", !hasDiscrepancy);
        document
            .getElementById("btnGrnPreviewPrintSupplier")
            ?.classList.toggle("d-none", !hasDiscrepancy);
        renderGrnPreviewDocument(details);
    } catch (error) {
        if (frame)
            frame.srcdoc = `<!doctype html><html><body style="font-family:Arial;padding:40px;color:#b42318">${escapeHtml(error.message)}</body></html>`;
    }
}

function grnConversionOptions(item, selectedId) {
    return (item.package_conversions || [])
        .map(
            (conversion) =>
                `<option value="${escapeHtml(conversion.conversion_id)}" ${String(conversion.conversion_id) === String(selectedId) ? "selected" : ""}>${escapeHtml(conversion.unit_name)} — ${Number(conversion.base_quantity)} ${escapeHtml(item.unit || "Pc")}</option>`,
        )
        .join("");
}

function grnDispositionValue(value) {
    return (
        {
            "Return to Supplier": "return_to_supplier",
            "Hold/Quarantine": "hold_quarantine",
            Dispose: "dispose",
            "Not Applicable": "not_applicable",
        }[value] || "not_applicable"
    );
}

function grnResolutionValue(value) {
    return (
        {
            return_for_replacement: "replacement",
            return_for_credit: "supplier_credit",
            keep_with_discount: "supplier_credit",
            reject_without_replacement: "no_compensation",
            keep_damaged: "no_compensation",
        }[value] ||
        value ||
        "none"
    );
}

function grnEditDamageRow(item, line = {}, index = 0) {
    const defaultConversion =
        item.package_conversions?.find((conversion) => Number(conversion.base_quantity) === 1)
            ?.conversion_id ||
        item.package_conversions?.[0]?.conversion_id ||
        "";
    const batchOptions = (item.batches || [])
        .map(
            (batch) =>
                `<option value="${escapeHtml(batch.batch_id)}" ${String(batch.batch_id) === String(line.inventory_batch_id) ? "selected" : ""}>${escapeHtml(batch.batch_identifier || "Receiving batch")}</option>`,
        )
        .join("");
    const packageOptions = receivePackageSequenceOptions(
        item.delivered_purchase_quantity || 0,
        item.purchase_unit || "Package",
        line.package_sequence ?? line.sequence_no ?? "",
    );
    return `<div class="grn-edit-damage-row" data-damage-row><span class="grn-damage-number">Affected Package</span><select data-field="package_sequence" aria-label="Affected physical package">${packageOptions}</select><input data-field="damaged_quantity" aria-label="Damaged product quantity" type="number" min="1" step="1" value="${Number(line.damaged_quantity || 1)}"><select data-field="damaged_conversion">${grnConversionOptions(item, line.damaged_unit_conversion_id || defaultConversion)}</select><select data-field="inventory_batch_id" aria-label="Affected batch/lot">${batchOptions || '<option value="">No receiving batch</option>'}</select><button class="btn btn-sm btn-outline-danger" type="button" data-remove-grn-damage aria-label="Remove affected goods row"><i class="fa-solid fa-trash"></i></button></div>`;
}

function grnEditSelectOptions(options, selected) {
    return options
        .map(
            ([value, label]) =>
                `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`,
        )
        .join("");
}

function renderGrnEditForm(details) {
    const paid = Number(details.payment?.total_paid || 0);
    return `
        <section class="grn-edit-identity"><div><span>PO Number</span><strong>${escapeHtml(details.po_number)}</strong></div><div><span>Supplier</span><strong>${escapeHtml(details.supplier_name)}</strong></div><div><span>GRN Number</span><strong>${escapeHtml(details.grn_number)}</strong></div></section>
        <div class="grn-edit-notice"><i class="fa-solid fa-shield-halved"></i><span>Only quantity differences are posted. Existing inventory and payments are never reinserted or silently replaced.</span></div>
        ${(details.items || [])
            .map(
                (item, index) => `
            <article class="grn-edit-item" data-po-item-id="${escapeHtml(item.po_item_id)}">
                <header><div><span>Item ${index + 1}</span><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.brand_name || "")}</small></div><div class="grn-readonly-ordered"><span>Original Ordered</span><strong>${receivingQuantityLabel(item.ordered_quantity, item.unit)}</strong></div></header>
                <div class="grn-edit-grid">
                    <label><span>Received Quantity</span><input data-field="received_quantity" type="number" min="0" max="${Number(item.ordered_quantity)}" step="1" value="${Number(item.delivered_quantity || 0)}"></label>
                    <label><span>Physically Damaged</span><div class="grn-inline-fields"><input data-field="damaged_quantity" type="number" min="0" step="1" value="${Number(item.damaged_selected_quantity || item.damaged_quantity || 0)}"><select data-field="damaged_conversion">${grnConversionOptions(item, item.damaged_unit_conversion_id)}</select></div></label>
                    <label><span>Affected Goods Quantity</span><div class="grn-inline-fields"><input data-field="action_quantity" type="number" min="0" step="1" value="${Number(item.action_selected_quantity || 0)}"><select data-field="action_conversion">${grnConversionOptions(item, item.action_unit_conversion_id)}</select></div></label>
                    <label><span>Issue</span><select data-field="issue_type"><option value="">No issue</option>${grnEditSelectOptions(
                        [
                            "Damaged Product",
                            "Broken Package",
                            "Expired",
                            "Wrong Item",
                            "Short Quantity",
                            "Other",
                        ].map((value) => [value, value]),
                        item.issue_type,
                    )}</select></label>
                    <label><span>Affected Goods Action</span><select data-field="disposition">${grnEditSelectOptions(
                        [
                            ["not_applicable", "Not Applicable"],
                            ["return_to_supplier", "Return to Supplier"],
                            ["hold_quarantine", "Hold / Quarantine"],
                            ["dispose", "Dispose"],
                        ],
                        grnDispositionValue(item.affected_goods_action),
                    )}</select></label>
                    <label><span>Supplier Resolution</span><select data-field="resolution">${grnEditSelectOptions(
                        [
                            ["none", "No issue"],
                            ["replacement", "Replacement"],
                            ["supplier_credit", "Supplier Credit"],
                            ["next_po_credit", "Credit on Next PO"],
                            ["refund", "Refund Due"],
                            ["no_compensation", "No Supplier Compensation"],
                        ],
                        grnResolutionValue(item.resolution),
                    )}</select></label>
                    <label data-grn-confirmed-adjustment-wrap class="${["supplier_credit", "next_po_credit", "refund"].includes(grnResolutionValue(item.resolution)) ? "" : "d-none"}"><span>Supplier-Confirmed Amount</span><input data-field="confirmed_adjustment" type="number" min="0.01" step="0.01" value="${Number(item.supplier_adjustment || 0) > 0 ? Number(item.supplier_adjustment).toFixed(2) : ""}" placeholder="0.00"><small>Entered explicitly; never calculated from damaged quantity.</small></label>
                </div>
                <section class="grn-edit-damage"><div class="grn-edit-subhead"><strong>Affected Goods Breakdown</strong><button class="btn btn-sm btn-outline-primary" type="button" data-add-grn-damage><i class="fa-solid fa-plus me-1"></i>Add Another Affected Package</button></div><div data-damage-list>${(item.damage_breakdown || []).map((line, lineIndex) => grnEditDamageRow(item, line, lineIndex)).join("")}</div></section>
                <section class="grn-edit-batches"><strong>Batch &amp; Expiry</strong>${(item.batches || []).map((batch) => `<div class="grn-edit-batch" data-batch-id="${escapeHtml(batch.batch_id)}"><span>${escapeHtml(batch.batch_identifier)}</span><label>Quantity<input data-field="batch_quantity" type="number" min="1" step="1" value="${Number(batch.batch_quantity || 0)}"></label><label>Expiry Date<input data-field="batch_expiry" type="date" min="${localTodayDateString()}" value="${escapeHtml(batch.expiry_date || "")}"></label></div>`).join("")}</section>
                <label class="grn-edit-remarks"><span>Item Remarks</span><textarea data-field="item_remarks" rows="2">${escapeHtml(item.item_remarks || "")}</textarea></label>
            </article>`,
            )
            .join("")}
        <label class="grn-edit-remarks"><span>Receiving Remarks</span><textarea id="grnEditReceivingRemarks" rows="3">${escapeHtml(details.receiving_remarks || "")}</textarea></label>
        ${paid > 0 ? `<label class="grn-financial-warning"><input id="grnAcknowledgeFinancial" type="checkbox"><span><strong>Payment history exists (${peso(paid)} paid).</strong> I understand corrected financial quantities may change the outstanding balance; historical payments will remain unchanged.</span></label>` : ""}
        <label class="grn-edit-reason"><span>Reason for Edit <b>*</b></span><textarea id="grnEditReasonInput" maxlength="500" rows="3" placeholder="Explain why this confirmed receiving record must be corrected."></textarea><small>This reason and the complete before/after values will be saved in the GRN revision history.</small></label>`;
}

function updateGrnEditSaveState() {
    const reasonPresent = Boolean(document.getElementById("grnEditReasonInput")?.value.trim());
    const acknowledgement = document.getElementById("grnAcknowledgeFinancial");
    const save = document.getElementById("btnSaveGrnEdit");
    if (save) save.disabled = !reasonPresent || (acknowledgement && !acknowledgement.checked);
}

function refreshGrnDamageNumbers(itemNode) {
    const selects = [...itemNode.querySelectorAll('[data-field="package_sequence"]')];
    const selected = selects.map((select) => select.value).filter(Boolean);
    selects.forEach((select) =>
        select.querySelectorAll("option[value]").forEach((option) => {
            option.disabled = Boolean(
                option.value && option.value !== select.value && selected.includes(option.value),
            );
        }),
    );
    itemNode.querySelectorAll("[data-damage-row]").forEach((row) => {
        const label = row.querySelector(".grn-damage-number");
        if (label) label.textContent = "Affected Package";
    });
}

function openGrnEditForm() {
    if (!activeReceivingDetails) return;
    setGrnModalMode("edit");
    showReceivingDrawer("grnModal");
    const body = document.getElementById("grnEditBody");
    if (!body) return;
    body.innerHTML = renderGrnEditForm(activeReceivingDetails);
    body.querySelectorAll(".grn-edit-item").forEach(refreshGrnDamageNumbers);
    body.onclick = (event) => {
        const itemNode = event.target.closest(".grn-edit-item");
        if (!itemNode) return;
        if (event.target.closest("[data-remove-grn-damage]")) {
            event.target.closest("[data-damage-row]")?.remove();
            refreshGrnDamageNumbers(itemNode);
        }
        const add = event.target.closest("[data-add-grn-damage]");
        if (add) {
            const item = activeReceivingDetails.items.find(
                (candidate) => String(candidate.po_item_id) === String(itemNode.dataset.poItemId),
            );
            const list = itemNode.querySelector("[data-damage-list]");
            if (item && list) {
                list.insertAdjacentHTML(
                    "beforeend",
                    grnEditDamageRow(item, {}, list.querySelectorAll("[data-damage-row]").length),
                );
            }
        }
    };
    body.onchange = (event) => {
        if (event.target.matches('[data-field="package_sequence"]'))
            refreshGrnDamageNumbers(event.target.closest(".grn-edit-item"));
        if (event.target.matches('[data-field="resolution"]')) {
            const itemNode = event.target.closest(".grn-edit-item");
            itemNode
                ?.querySelector("[data-grn-confirmed-adjustment-wrap]")
                ?.classList.toggle(
                    "d-none",
                    !["supplier_credit", "next_po_credit", "refund"].includes(event.target.value),
                );
        }
    };
    document
        .getElementById("grnEditReasonInput")
        ?.addEventListener("input", updateGrnEditSaveState);
    document
        .getElementById("grnAcknowledgeFinancial")
        ?.addEventListener("change", updateGrnEditSaveState);
    updateGrnEditSaveState();
}

async function openGrnEditor(poId) {
    ensureReceivingUi();
    setGrnModalMode("edit");
    showReceivingDrawer("grnModal");
    const body = document.getElementById("grnEditBody");
    if (body)
        body.innerHTML =
            '<div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading Goods Received Note...</div>';
    try {
        activeReceivingDetails = await fetchReceivingDetails(poId, true);
        openGrnEditForm();
    } catch (error) {
        closeReceivingUi();
        PharmaUtils.modal.error("GRN could not be loaded", error.message);
    }
}

function closeGrnEditForm() {
    closeReceivingUi();
}

function grnEditPayload() {
    const pastExpiry = [...document.querySelectorAll('.grn-edit-batch [data-field="batch_expiry"]')]
        .find((input) => {
            input.min = localTodayDateString();
            return isPastLocalDate(input.value);
        });
    if (pastExpiry) throw new Error("Expiry date cannot be earlier than today.");
    return {
        receiving_id: activeReceivingDetails.receiving_id,
        edit_reason: document.getElementById("grnEditReasonInput")?.value.trim() || "",
        receiving_remarks: document.getElementById("grnEditReceivingRemarks")?.value.trim() || "",
        acknowledge_financial_impact: Boolean(
            document.getElementById("grnAcknowledgeFinancial")?.checked,
        ),
        items: [...document.querySelectorAll(".grn-edit-item")].map((itemNode) => ({
            po_item_id: itemNode.dataset.poItemId,
            received_quantity: Number(
                itemNode.querySelector('[data-field="received_quantity"]')?.value || 0,
            ),
            damaged_quantity: Number(
                itemNode.querySelector('[data-field="damaged_quantity"]')?.value || 0,
            ),
            damaged_unit_conversion_id:
                itemNode.querySelector('[data-field="damaged_conversion"]')?.value || "",
            action_quantity: Number(
                itemNode.querySelector('[data-field="action_quantity"]')?.value || 0,
            ),
            action_unit_conversion_id:
                itemNode.querySelector('[data-field="action_conversion"]')?.value || "",
            issue_type: itemNode.querySelector('[data-field="issue_type"]')?.value || "",
            disposition:
                itemNode.querySelector('[data-field="disposition"]')?.value || "not_applicable",
            resolution: itemNode.querySelector('[data-field="resolution"]')?.value || "none",
            confirmed_adjustment: Number(
                itemNode.querySelector('[data-field="confirmed_adjustment"]')?.value || 0,
            ),
            remarks: itemNode.querySelector('[data-field="item_remarks"]')?.value.trim() || "",
            damage_lines: [...itemNode.querySelectorAll("[data-damage-row]")].map((row) => ({
                package_sequence: Number(
                    row.querySelector('[data-field="package_sequence"]')?.value || 0,
                ),
                damaged_quantity: Number(
                    row.querySelector('[data-field="damaged_quantity"]')?.value || 0,
                ),
                damaged_unit_conversion_id:
                    row.querySelector('[data-field="damaged_conversion"]')?.value || "",
                inventory_batch_id:
                    row.querySelector('[data-field="inventory_batch_id"]')?.value || "",
            })),
            batches: [...itemNode.querySelectorAll(".grn-edit-batch")].map((batch) => ({
                batch_id: batch.dataset.batchId,
                quantity: Number(batch.querySelector('[data-field="batch_quantity"]')?.value || 0),
                expiry_date: batch.querySelector('[data-field="batch_expiry"]')?.value || "",
            })),
        })),
    };
}

async function saveGrnEdit() {
    if (!activeReceivingDetails || !document.getElementById("grnEditReasonInput")?.value.trim())
        return;
    const button = document.getElementById("btnSaveGrnEdit");
    try {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/update_receiving_grn.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(grnEditPayload()),
        });
        receivingDetailsCache.delete(String(activeReceivingDetails.po_id));
        await loadInspectionQueue();
        closeReceivingUi();
        PharmaUtils.toast.success(data.message || "Goods Received Note updated.");
    } catch (error) {
        PharmaUtils.modal.error("GRN was not updated", error.message);
        updateGrnEditSaveState();
    } finally {
        if (button) button.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i>Save Changes';
    }
}

function renderSupplierPayment(details) {
    const payment = details.payment || {};
    const originalTotal = Number(details.total_amount || 0);
    const previousPayments = Number(payment.total_paid || 0);
    const currentDiscount = Number(payment.current_po_discount || 0);
    const futureCreditApplied = Number(payment.future_supplier_credit_applied || 0);
    const netAmountDue = Number(
        payment.adjusted_payable ??
            Math.max(0, originalTotal - currentDiscount - futureCreditApplied),
    );
    const remainingBalance = Number(
        payment.remaining_balance ?? Math.max(netAmountDue - previousPayments, 0),
    );
    const receiving = details.receiving || {};
    const paymentType = details.payment_type || "Advance Payment";
    const fullyPaid = isPurchaseOrderPaid(payment.payment_status, remainingBalance);
    const replacementQuantity = Number(details.claim_summary?.replacement_pending_quantity || 0);
    const quantityUnit = "units";
    const futureCreditCreated = Number(details.claim_summary?.future_supplier_credit || 0);
    const payments = Array.isArray(payment.payments) ? payment.payments : [];
    const availableCreditRows = activeSupplierCredits
        .map(
            (credit) =>
                `<div class="supplier-credit-apply-row"><div><strong>${peso(credit.available_amount)}</strong><span>From ${escapeHtml(credit.source_po_number || "previous supplier claim")}</span></div><div class="input-group input-group-sm"><span class="input-group-text">₱</span><input class="form-control supplier-credit-apply-amount" type="number" min="0.01" step="0.01" max="${Number(credit.available_amount)}" value="${Number(Math.min(credit.available_amount, remainingBalance)).toFixed(2)}"></div><button class="btn btn-outline-primary apply-supplier-credit-btn" type="button" data-credit-id="${escapeHtml(credit.credit_id)}">Apply Credit</button></div>`,
        )
        .join("");
    const adjustmentRows = [
        currentDiscount > 0
            ? `<div class="payment-summary-credit"><span>Supplier Discount / Current PO Credit</span><strong>-${peso(currentDiscount)}</strong></div>`
            : "",
        futureCreditApplied > 0
            ? `<div class="payment-summary-credit"><span>Previous Supplier Credit Applied</span><strong>-${peso(futureCreditApplied)}</strong></div>`
            : "",
        currentDiscount + futureCreditApplied > 0
            ? `<div><span>Net Amount Due</span><strong>${peso(netAmountDue)}</strong></div>`
            : "",
    ].join("");
    return `
        <div class="supplier-payment-status-strip">
            <span>PO Status: <strong>${escapeHtml(details.status || "Pending")}</strong></span>
            <span>Payment Status: <strong>${escapeHtml(payment.payment_status || "Unpaid")}</strong></span>
        </div>
        <div class="po-payment-section-heading"><i class="fa-solid fa-receipt"></i><span>Payment Summary</span></div>
        <div class="po-payment-financial-summary">
            <div><span>PO Number</span><strong>${escapeHtml(details.po_number || "—")}</strong></div>
            <div><span>Supplier</span><strong>${escapeHtml(details.supplier_name || "—")}</strong></div>
            <div><span>Invoice Number</span><strong>${escapeHtml(details.invoice_number || "—")}</strong></div>
            <div><span>Invoice Total</span><strong>${peso(originalTotal)}</strong></div>
            ${adjustmentRows}
            <div><span>Amount Paid</span><strong>${peso(previousPayments)}</strong></div>
            <div class="balance"><span>Balance Due</span><strong>${peso(remainingBalance)}</strong></div>
        </div>
        ${currentDiscount + futureCreditApplied > 0 ? `<div class="payment-mode-note">Balance due reflects supplier credits or approved invoice adjustments already applied to this PO.</div>` : ""}
        ${replacementQuantity > 0 ? `<div class="alert alert-warning mt-3 mb-0"><strong>Replacement Pending — ${escapeHtml(receivingQuantityLabel(replacementQuantity, quantityUnit))}</strong><div>This claim does not reduce the current PO amount due.</div></div>` : ""}
        ${futureCreditCreated > 0 ? `<div class="alert alert-info mt-3 mb-0"><strong>Future Supplier Credit: ${peso(futureCreditCreated)}</strong><div>Available for a future PO from this supplier.</div></div>` : ""}
        ${availableCreditRows && remainingBalance > 0 ? `<div class="po-payment-section-heading"><i class="fa-solid fa-ticket"></i><span>Available Supplier Credit</span></div><p class="payment-mode-note">Confirm how much credit from previous supplier claims should be applied to this PO.</p><div class="supplier-credit-apply-list">${availableCreditRows}</div>` : ""}
        ${
            fullyPaid
                ? '<div class="alert alert-success mt-3 mb-0"><i class="fa-solid fa-circle-check me-2"></i>This purchase order is fully paid. Additional payments are not allowed.</div>'
                : `
        <div class="po-payment-section-heading"><i class="fa-solid fa-money-bill-wave"></i><span>Payment Details</span></div>
        <form class="supplier-payment-form" id="supplierPaymentForm" novalidate>
            <div class="form-field"><label for="supplierPaymentDate">Payment Date</label><input class="form-control" id="supplierPaymentDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
            <div class="form-field"><label for="supplierPaymentMode">Payment Method</label><input class="form-control" id="supplierPaymentMode" type="text" value="Cash" readonly></div>
            <div class="form-field full"><label for="supplierPaymentAmount">Amount to Pay</label><div class="payment-amount-control"><span class="payment-currency-prefix">₱</span><input id="supplierPaymentAmount" type="number" min="0.01" step="0.01" max="${remainingBalance}" value="${remainingBalance.toFixed(2)}" inputmode="decimal" autocomplete="off" aria-describedby="supplierPaymentValidation"></div><div class="payment-validation" id="supplierPaymentValidation" aria-live="polite"></div></div>
            <div class="form-field full"><label for="supplierPaymentReference">Payment Reference / Receipt No. <span class="text-muted">(optional)</span></label><input class="form-control" id="supplierPaymentReference" maxlength="100" placeholder="Receipt or acknowledgment number"></div>
            <div class="form-field full"><label for="supplierPaymentRemarks">Remarks <span class="text-muted">(optional)</span></label><textarea class="form-control" id="supplierPaymentRemarks" maxlength="500" placeholder="Payment notes"></textarea></div>
            <div class="payment-calculation-card full">
                <div><span>Amount to Pay Now</span><strong id="supplierPaymentAmountSummary">${peso(0)}</strong></div>
                <div class="balance"><span>Balance After Payment</span><strong id="supplierPaymentBalanceAfter">${peso(remainingBalance)}</strong></div>
            </div>
            <input type="hidden" id="supplierPaymentOriginalTotal" value="${originalTotal}">
        </form>`
        }
        ${payments.length ? `<div class="po-payment-section-heading"><i class="fa-solid fa-clock-rotate-left"></i><span>Payment History</span></div>${renderPaymentHistory(payments)}` : ""}`;
}

function supplierPaymentReferenceMeta(method = "") {
    return (
        {
            cash: ["Acknowledgment Number", "Optional receipt or acknowledgment number"],
            bank_transfer: ["Transaction Reference", "Enter bank transaction reference"],
            check: ["Check Number", "Enter check number"],
            gcash: ["Transaction Reference", "Enter e-wallet transaction reference"],
            other: ["Reference Number", "Optional payment reference"],
        }[method] || ["Reference Number", "Optional payment reference"]
    );
}

function updateSupplierPaymentReferenceUi() {
    const method = document.getElementById("supplierPaymentMethod")?.value || "";
    const [label, placeholder] = supplierPaymentReferenceMeta(method);
    const labelNode = document.getElementById("supplierPaymentReferenceLabel");
    const input = document.getElementById("supplierPaymentReference");
    if (labelNode) labelNode.textContent = label;
    if (input)
        placeholder
            ? input.setAttribute("placeholder", placeholder)
            : input.removeAttribute("placeholder");
}

function supplierPaymentLongDate(value) {
    if (!value) return "Not set";
    const [year, month, day] = String(value).split("-").map(Number);
    const date = new Date(year, Math.max(0, month - 1), day || 1);
    return Number.isNaN(date.getTime())
        ? formatDate(value)
        : date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function supplierPaymentCalculationValues() {
    const payment = activeReceivingDetails?.payment || {};
    const originalTotal = Number(activeReceivingDetails?.total_amount || 0);
    const previouslyPaid = Number(payment.total_paid || 0);
    const currentDiscount = Number(payment.current_po_discount || 0);
    const futureCreditApplied = Number(payment.future_supplier_credit_applied || 0);
    const netAmountDue = Number(
        payment.adjusted_payable ??
            Math.max(0, originalTotal - currentDiscount - futureCreditApplied),
    );
    const remainingBalance = Number(
        payment.remaining_balance ?? Math.max(0, netAmountDue - previouslyPaid),
    );
    return {
        originalTotal,
        previouslyPaid,
        currentDiscount,
        futureCreditApplied,
        netAmountDue,
        remainingBalance,
    };
}

function captureSupplierPaymentState() {
    const values = supplierPaymentCalculationValues();
    const amount = Number(document.getElementById("supplierPaymentAmount")?.value || 0);
    return {
        poId: activeReceivingDetails?.po_id || "",
        poNumber: activeReceivingDetails?.po_number || "",
        poStatus: activeReceivingDetails?.status || "Pending",
        supplier: activeReceivingDetails?.supplier_name || "",
        invoiceNumber: activeReceivingDetails?.invoice_number || "",
        paymentType: activeReceivingDetails?.payment_type || "Advance Payment",
        amount: Math.round(amount * 100) / 100,
        amountInput: document.getElementById("supplierPaymentAmount")?.value || "",
        paymentMethod: "cash",
        paymentDate:
            document.getElementById("supplierPaymentDate")?.value ||
            new Date().toISOString().slice(0, 10),
        referenceNumber: document.getElementById("supplierPaymentReference")?.value || "",
        remarks: document.getElementById("supplierPaymentRemarks")?.value || "",
        adjustedPayable: values.netAmountDue,
        previouslyPaid: values.previouslyPaid,
        remainingBalance: values.remainingBalance,
        balanceAfter: Math.max(0, Math.round((values.remainingBalance - amount) * 100) / 100),
        resultingStatus: amount >= values.remainingBalance - 0.005 ? "Paid" : "Unpaid",
        idempotencyKey: supplierPaymentSubmissionKey,
    };
}

function restoreSupplierPaymentState(state) {
    if (!state) return;
    const input = document.getElementById("supplierPaymentAmount");
    if (input) input.value = state.amountInput || state.remainingBalance?.toFixed?.(2) || "";
    const paymentDate = document.getElementById("supplierPaymentDate");
    if (paymentDate) paymentDate.value = state.paymentDate || new Date().toISOString().slice(0, 10);
    const reference = document.getElementById("supplierPaymentReference");
    if (reference) reference.value = state.referenceNumber || "";
    const remarks = document.getElementById("supplierPaymentRemarks");
    if (remarks) remarks.value = state.remarks || "";
    supplierPaymentSubmissionKey = state.idempotencyKey;
    updateSupplierPaymentValidation();
}

function trapSupplierPaymentDialogFocus(event, escapeAction) {
    const dialog = event.currentTarget;
    if (event.key === "Escape") {
        if (!supplierPaymentSubmitting) {
            event.preventDefault();
            escapeAction();
        }
        return;
    }
    if (event.key !== "Tab") return;
    const controls = [
        ...dialog.querySelectorAll(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
    ].filter((control) => control.offsetParent !== null);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function setSupplierPaymentDialogOpen(dialogId, open) {
    const dialog = document.getElementById(dialogId);
    if (!dialog) return;
    dialog.classList.toggle("is-open", open);
    dialog.setAttribute("aria-hidden", open ? "false" : "true");
    dialog.toggleAttribute("inert", !open);
}

function waitForSupplierPaymentDrawerHidden() {
    const drawer = document.getElementById("supplierPaymentDrawer");
    if (!drawer) return Promise.resolve();
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            drawer.removeEventListener("transitionend", finish);
            resolve();
        };
        drawer.addEventListener("transitionend", finish, { once: true });
        window.setTimeout(finish, 320);
    });
}

function renderSupplierPaymentConfirmation(state) {
    const referenceRow = state.referenceNumber.trim()
        ? `<div><span>${escapeHtml(supplierPaymentReferenceMeta(state.paymentMethod)[0])}</span><strong>${escapeHtml(state.referenceNumber.trim())}</strong></div>`
        : "";
    const remarksRow = state.remarks.trim()
        ? `<div><span>Remarks</span><strong>${escapeHtml(state.remarks.trim())}</strong></div>`
        : "";
    const summary = document.getElementById("supplierPaymentConfirmSummary");
    if (summary)
        summary.innerHTML = `
        <div><span>Supplier</span><strong>${escapeHtml(state.supplier)}</strong></div>
        <div><span>Purchase Order</span><strong>${escapeHtml(state.poNumber)}</strong></div>
        <div><span>Supplier Invoice Number</span><strong>${escapeHtml(state.invoiceNumber || "—")}</strong></div>
        <div class="primary-value"><span>Payment Amount</span><strong>${peso(state.amount)}</strong></div>
        <div><span>Payment Method</span><strong>${escapeHtml(paymentMethodLabel(state.paymentMethod))}</strong></div>
        <div><span>Payment Type</span><strong>${escapeHtml(state.paymentType)}</strong></div>
        <div><span>Payment Date</span><strong>${escapeHtml(supplierPaymentLongDate(state.paymentDate))}</strong></div>
        ${referenceRow}
        ${remarksRow}
        <div><span>Balance Before Payment</span><strong>${peso(state.remainingBalance)}</strong></div>
        <div class="result-value"><span>Balance After Payment</span><strong>${peso(state.balanceAfter)}</strong></div>
        <div><span>Resulting Payment Status</span>${paymentStatusBadge(state.resultingStatus)}</div>`;
    const message = document.getElementById("supplierPaymentConfirmMessage");
    if (message)
        message.textContent =
            state.paymentType === "Advance Payment"
                ? state.poStatus === "Pending"
                    ? "This payment will be applied to the supplier invoice, but the purchase order will remain Pending until the delivery is received."
                    : `This payment will be applied to the supplier invoice, but the purchase order will remain ${state.poStatus} until inspection is completed.`
                : state.resultingStatus === "Paid"
                  ? "This payment will settle the remaining payable balance after receiving and inspection."
                  : `This post-inspection payment will leave a remaining balance of ${peso(state.balanceAfter)}.`;
}

async function openSupplierPaymentConfirmation(state) {
    supplierPaymentPendingState = state;
    supplierPaymentReturnFocus = document.activeElement;
    await waitForSupplierPaymentDrawerHidden();
    renderSupplierPaymentConfirmation(state);
    setSupplierPaymentDialogOpen("supplierPaymentResultDialog", false);
    setSupplierPaymentDialogOpen("supplierPaymentConfirmDialog", true);
    document.getElementById("btnCancelSupplierPaymentConfirm")?.focus();
}

function cancelSupplierPaymentConfirmation() {
    if (supplierPaymentSubmitting || !supplierPaymentPendingState) return;
    setSupplierPaymentDialogOpen("supplierPaymentConfirmDialog", false);
    showReceivingDrawer("supplierPaymentDrawer");
    restoreSupplierPaymentState(supplierPaymentPendingState);
    const amount = document.getElementById("supplierPaymentAmount");
    requestAnimationFrame(() =>
        (
            amount ||
            supplierPaymentReturnFocus ||
            document.getElementById("btnSaveSupplierPayment")
        )?.focus(),
    );
}

function showSupplierPaymentResult(context) {
    supplierPaymentResultContext = context;
    setSupplierPaymentDialogOpen("supplierPaymentConfirmDialog", false);
    const icon = document.getElementById("supplierPaymentResultIcon");
    if (icon) {
        icon.className = `supplier-payment-dialog-icon ${context.type}`;
        icon.innerHTML = `<i class="fa-solid ${context.type === "success" ? "fa-circle-check" : "fa-triangle-exclamation"}"></i>`;
    }
    const title = document.getElementById("supplierPaymentResultTitle");
    const subtitle = document.getElementById("supplierPaymentResultSubtitle");
    const message = document.getElementById("supplierPaymentResultMessage");
    if (title) title.textContent = context.title;
    if (subtitle)
        subtitle.textContent =
            context.type === "success"
                ? "Supplier payment posted"
                : "Supplier payment was not posted";
    if (message) message.textContent = context.message;
    const secondary = document.getElementById("btnSupplierPaymentResultSecondary");
    const primary = document.getElementById("btnSupplierPaymentResultPrimary");
    if (secondary) secondary.textContent = context.type === "success" ? "Done" : "Cancel";
    if (primary)
        primary.textContent =
            context.type === "success" ? "View Payment Details" : "Return to Payment Form";
    setSupplierPaymentDialogOpen("supplierPaymentResultDialog", true);
    secondary?.focus();
}

function handleSupplierPaymentResultSecondary() {
    if (supplierPaymentSubmitting) return;
    setSupplierPaymentDialogOpen("supplierPaymentResultDialog", false);
    document.getElementById("receivingUiBackdrop")?.classList.remove("is-open");
    document.body.style.overflow = "";
}

async function handleSupplierPaymentResultPrimary() {
    if (supplierPaymentSubmitting || !supplierPaymentResultContext) return;
    const context = supplierPaymentResultContext;
    setSupplierPaymentDialogOpen("supplierPaymentResultDialog", false);
    if (context.type === "success") {
        if (document.body.dataset.page === "purchase-orders")
            await openSupplierPayment(context.poId);
        else await openReceivingDetails(context.poId);
        return;
    }
    if (context.refreshOnReturn) {
        await openSupplierPayment(context.poId, { preservedState: context.state, reuseKey: true });
        return;
    }
    showReceivingDrawer("supplierPaymentDrawer");
    restoreSupplierPaymentState(context.state);
    requestAnimationFrame(() => document.getElementById("supplierPaymentAmount")?.focus());
}

function updateSupplierPaymentValidation() {
    if (!activeReceivingDetails) return false;
    const values = supplierPaymentCalculationValues();
    const remaining = values.remainingBalance;
    const amount = Number(document.getElementById("supplierPaymentAmount")?.value || 0);
    const paymentDate = document.getElementById("supplierPaymentDate")?.value || "";
    let message = "Ready to record payment.";
    let valid = true;
    if (!Number.isFinite(amount) || amount <= 0) {
        valid = false;
        message = "Payment amount must be greater than zero.";
    } else if (amount > remaining) {
        valid = false;
        message = `Payment amount exceeds the remaining balance by ${peso(amount - remaining)}.`;
    } else if (!paymentDate) {
        valid = false;
        message = "Payment date is required.";
    }
    const validation = document.getElementById("supplierPaymentValidation");
    if (validation) validation.textContent = valid ? "" : message;
    const amountInput = document.getElementById("supplierPaymentAmount");
    const amountInvalid = amount > remaining || !Number.isFinite(amount) || amount <= 0;
    if (amountInput) {
        amountInput.classList.toggle("is-invalid", amountInvalid);
        amountInput.setAttribute("aria-invalid", amountInvalid ? "true" : "false");
    }
    const after = document.getElementById("supplierPaymentBalanceAfter");
    if (after)
        after.textContent = peso(Math.max(remaining - (Number.isFinite(amount) ? amount : 0), 0));
    const amountSummary = document.getElementById("supplierPaymentAmountSummary");
    if (amountSummary)
        amountSummary.textContent = peso(Number.isFinite(amount) ? Math.max(0, amount) : 0);
    after
        ?.closest(".payment-calculation-card")
        ?.classList.toggle("is-invalid", amount > remaining || amount < 0);
    const button = document.getElementById("btnSaveSupplierPayment");
    if (button) {
        button.disabled = !valid || supplierPaymentSubmitting;
        button.classList.toggle("btn-purple", valid && !supplierPaymentSubmitting);
        button.classList.toggle("btn-outline-secondary", !valid || supplierPaymentSubmitting);
    }
    return valid;
}

async function openSupplierPayment(poId, options = {}) {
    const requestKey = String(poId || "").trim();
    if (!requestKey) return;
    if (purchaseOrderPaymentRequests.has(requestKey))
        return purchaseOrderPaymentRequests.get(requestKey);

    const request = (async () => {
        setPurchaseOrderActionBusy(
            ".manage-payment-btn, .view-payment-history-btn",
            requestKey,
            true,
        );
        showReceivingDrawer("supplierPaymentDrawer");
        const body = document.getElementById("supplierPaymentBody");
        if (body)
            body.innerHTML =
                '<div class="receiving-loading"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading payment details...</div>';
        try {
            const details = await fetchPurchaseOrderPaymentDetails(poId);
            activeSupplierCredits = [];
            try {
                const creditData = await fetchJson(
                    `${API_BASE_URL}/purchase_orders/get_supplier_credits.php?po_id=${encodeURIComponent(poId)}`,
                );
                activeSupplierCredits = Array.isArray(creditData.credits) ? creditData.credits : [];
            } catch (_) {
                activeSupplierCredits = [];
            }
            activeReceivingDetails = details;
            if (!options.reuseKey)
                supplierPaymentSubmissionKey =
                    globalThis.crypto?.randomUUID?.() ||
                    `po-payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            document.getElementById("supplierPaymentSubtitle").textContent =
                `${details.po_number} · ${details.supplier_name}`;
            if (body) body.innerHTML = renderSupplierPayment(details);
            const save = document.getElementById("btnSaveSupplierPayment");
            if (save)
                save.classList.toggle(
                    "d-none",
                    isPurchaseOrderPaid(
                        details.payment?.payment_status,
                        details.payment?.remaining_balance,
                    ),
                );
            if (save && !save.classList.contains("d-none")) {
                save.innerHTML = '<i class="fa-solid fa-money-check-dollar me-1"></i>Record Payment';
            }
            document
                .getElementById("supplierPaymentAmount")
                ?.addEventListener("input", updateSupplierPaymentValidation);
            document
                .getElementById("supplierPaymentDate")
                ?.addEventListener("change", updateSupplierPaymentValidation);
            const amountInput = document.getElementById("supplierPaymentAmount");
            amountInput?.addEventListener("change", () => {
                const value = Number(amountInput.value);
                if (Number.isFinite(value)) amountInput.value = value.toFixed(2);
                updateSupplierPaymentValidation();
            });
            if (options.preservedState) restoreSupplierPaymentState(options.preservedState);
            updateSupplierPaymentValidation();
            requestAnimationFrame(() => document.getElementById("supplierPaymentAmount")?.focus());
        } catch (error) {
            if (body)
                body.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
            document.getElementById("btnSaveSupplierPayment")?.classList.add("d-none");
        } finally {
            setPurchaseOrderActionBusy(
                ".manage-payment-btn, .view-payment-history-btn",
                requestKey,
                false,
            );
        }
    })();

    purchaseOrderPaymentRequests.set(requestKey, request);
    try {
        return await request;
    } finally {
        purchaseOrderPaymentRequests.delete(requestKey);
    }
}

async function applySupplierCreditFromPayment(button) {
    if (!activeReceivingDetails || !button) return;
    const row = button.closest(".supplier-credit-apply-row");
    const amount = Number(row?.querySelector(".supplier-credit-apply-amount")?.value || 0);
    const creditId = button.dataset.creditId || "";
    if (!creditId || !Number.isFinite(amount) || amount <= 0)
        return PharmaUtils.toast.error("Enter a positive supplier credit amount.");
    try {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Applying...';
        const poId = activeReceivingDetails.po_id;
        const data = await fetchJson(`${API_BASE_URL}/purchase_orders/apply_supplier_credit.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ po_id: poId, credit_id: creditId, amount_applied: amount }),
        });
        receivingDetailsCache.delete(String(poId));
        PharmaUtils.toast.success(data.message || "Supplier credit applied.");
        await openSupplierPayment(poId, { reuseKey: true });
        if (document.body.dataset.page === "purchase-orders") await loadPurchaseOrders();
    } catch (error) {
        PharmaUtils.toast.error(error.message);
        button.disabled = false;
        button.textContent = "Apply Credit";
    }
}

async function submitSupplierPayment() {
    if (supplierPaymentSubmitting || !activeReceivingDetails || !updateSupplierPaymentValidation())
        return;
    await openSupplierPaymentConfirmation(captureSupplierPaymentState());
}

async function confirmSupplierPayment() {
    if (supplierPaymentSubmitting || !supplierPaymentPendingState) return;
    const state = supplierPaymentPendingState;
    const button = document.getElementById("btnConfirmSupplierPayment");
    try {
        supplierPaymentSubmitting = true;
        if (button) {
            button.disabled = true;
            button.innerHTML =
                '<span class="spinner-border spinner-border-sm me-1"></span>Processing Payment...';
        }
        const data = await fetchJson(
            `${API_BASE_URL}/purchase_orders/record_purchase_order_payment.php`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    po_id: state.poId,
                    amount: state.amount,
                    payment_method: state.paymentMethod,
                    payment_date: state.paymentDate,
                    reference_number: state.referenceNumber.trim(),
                    remarks: state.remarks.trim(),
                    payment_request_key: state.idempotencyKey,
                    expected_remaining_balance: state.remainingBalance,
                }),
            },
        );
        receivingDetailsCache.delete(String(state.poId));
        activeReceivingDetails = await fetchPurchaseOrderPaymentDetails(state.poId);
        if (document.body.dataset.page === "inspect-deliveries") await loadInspectionQueue();
        else {
            await loadPurchaseOrders();
            if (String(activeViewOrder?.po_id || "") === String(state.poId)) {
                activeViewOrder = await getPurchaseOrder(state.poId, { force: true });
                await renderPoPaymentSummary(activeViewOrder);
            }
        }
        supplierPaymentSubmissionKey =
            globalThis.crypto?.randomUUID?.() ||
            `po-payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        supplierPaymentPendingState = null;
        const fullyPaid = isPurchaseOrderPaid(data.payment_status, data.remaining_balance);
        showSupplierPaymentResult({
            type: "success",
            title: "Payment Recorded",
            poId: state.poId,
            message: fullyPaid
                ? `Supplier payment of ${peso(data.payment_recorded)} was recorded successfully. Payment status is now Paid; the PO remains ${activeReceivingDetails?.status || "unchanged"}.`
                : `Supplier payment of ${peso(data.payment_recorded)} was recorded successfully. Remaining balance: ${peso(data.remaining_balance)}.`,
        });
    } catch (error) {
        const stale = /outstanding balance changed/i.test(error.message || "");
        showSupplierPaymentResult({
            type: "error",
            title: "Payment Not Recorded",
            poId: state.poId,
            message: error.message || "Unable to record supplier payment.",
            state,
            refreshOnReturn: stale,
        });
    } finally {
        supplierPaymentSubmitting = false;
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-check me-1"></i>Confirm Payment';
        }
    }
}

async function openDeliveredReceipt(poId, autoPrint = false, receivingId = "") {
    const targetWindow = window.open("", "_blank", "width=1200,height=850");
    if (!targetWindow) return;
    try {
        const details = await fetchReceivingDetails(poId, true, receivingId);
        openReceiptPreview(receiptReportFromReceiving(details), { targetWindow, autoPrint });
    } catch (error) {
        targetWindow.close();
        PharmaUtils.toast.error(error.message);
    }
}

async function openSupplierDiscrepancyForPo(poId, autoPrint = false, receivingId = "") {
    const targetWindow = window.open("", "_blank", "width=1200,height=850");
    if (!targetWindow) return;
    try {
        const details = await fetchReceivingDetails(poId, true, receivingId);
        openSupplierDiscrepancyPreview(receiptReportFromReceiving(details), {
            targetWindow,
            autoPrint,
        });
    } catch (error) {
        targetWindow.close();
        PharmaUtils.toast.error(error.message);
    }
}

function renderReturnItems(order) {
    const body = document.querySelector("#table-return-items tbody");
    if (!body) return;

    const hasReceivingRecord = order.items.some(
        (item) => Number(item.received_quantity || 0) > 0 || Number(item.damaged_quantity || 0) > 0,
    );

    body.innerHTML = order.items
        .map((item) => {
            const damagedQuantity = Number(item.damaged_quantity || 0);
            const maxReturnQuantity = hasReceivingRecord
                ? damagedQuantity
                : Number(item.inventory_qty_ordered || item.quantity || 0);

            return `
        <tr data-po-item-id="${escapeHtml(item.po_item_id)}">
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.brand_name)}</td>
            <td>${escapeHtml(item.inventory_qty_ordered || item.quantity)}</td>
            <td>${escapeHtml(item.received_quantity || 0)}</td>
            <td>${escapeHtml(item.damaged_quantity || 0)}</td>
            <td><input class="form-control form-control-sm return-qty-input" type="number" min="0" max="${escapeHtml(maxReturnQuantity)}" value="${escapeHtml(damagedQuantity)}"></td>
            <td>
                <select class="form-select form-select-sm damage-reason-select">
                    <option value="" disabled selected>Select reason...</option>
                    <option value="Expired">Expired</option>
                    <option value="Broken package">Broken package</option>
                    <option value="Wrong item delivered">Wrong item delivered</option>
                    <option value="Incorrect quantity">Incorrect quantity</option>
                    <option value="Damaged during delivery">Damaged during delivery</option>
                    <option value="Other">Other</option>
                </select>
            </td>
            <td><textarea class="form-control form-control-sm return-remarks-input" rows="1"></textarea></td>
        </tr>
    `;
        })
        .join("");
}

async function openReturnDamageModal(poId) {
    try {
        activeReturnOrder = await getPurchaseOrder(poId);
        document.getElementById("returnPoNumber").textContent = activeReturnOrder.po_number;
        document.getElementById("returnSupplierName").textContent = activeReturnOrder.supplier_name;
        document.getElementById("returnPoDetails").innerHTML = `
            <div class="po-detail-box"><span>PO Number</span><strong>${escapeHtml(activeReturnOrder.po_number)}</strong></div>
            <div class="po-detail-box"><span>Supplier Name</span><strong>${escapeHtml(activeReturnOrder.supplier_name)}</strong></div>
            <div class="po-detail-box"><span>Status</span><strong>${escapeHtml(activeReturnOrder.status)}</strong></div>
            <div class="po-detail-box"><span>Order Date</span><strong>${formatDate(activeReturnOrder.order_date)}</strong></div>
        `;
        renderReturnItems(activeReturnOrder);
        showModal("returnDamageModal");
    } catch (err) {
        PharmaUtils.toast.error(err.message);
    }
}

function returnPayload() {
    if (!activeReturnOrder) throw new Error("No purchase order selected.");

    const returns = [];
    const hasReceivingRecord = activeReturnOrder.items.some(
        (item) => Number(item.received_quantity || 0) > 0 || Number(item.damaged_quantity || 0) > 0,
    );
    document.querySelectorAll("#table-return-items tbody tr").forEach((row) => {
        const orderItem = activeReturnOrder.items.find(
            (item) => String(item.po_item_id) === String(row.dataset.poItemId),
        );
        const returnQuantity = Number(row.querySelector(".return-qty-input")?.value || 0);
        const damageReason = row.querySelector(".damage-reason-select")?.value || "";
        const remarks = row.querySelector(".return-remarks-input")?.value || "";
        const damagedQuantity = Number(orderItem?.damaged_quantity || 0);
        const maxReturnQuantity = hasReceivingRecord
            ? damagedQuantity
            : Number(orderItem?.inventory_qty_ordered || orderItem?.quantity || 0);

        if (returnQuantity > 0) {
            if (returnQuantity > maxReturnQuantity) {
                throw new Error(
                    "Return quantity cannot exceed the damaged quantity recorded for the item.",
                );
            }

            if (!damageReason) {
                throw new Error("Select a damage reason for every returned item.");
            }

            returns.push({
                po_item_id: row.dataset.poItemId,
                return_quantity: returnQuantity,
                damage_reason: damageReason,
                remarks,
            });
        }
    });

    if (returns.length === 0) {
        throw new Error("Enter at least one return quantity.");
    }

    return {
        po_id: activeReturnOrder.po_id,
        returns,
    };
}

async function submitReturnDamage() {
    try {
        const payload = returnPayload();
        PharmaUtils.modal.loading("Saving Return/Damage...");
        const data = await fetchJson(
            `${API_BASE_URL}/purchase_orders/save_purchase_order_return.php`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            },
        );

        PharmaUtils.modal.close();
        hideModal("returnDamageModal");
        await loadPurchaseOrders({ updateSummary: true });
        PharmaUtils.toast.success(data.message);
    } catch (err) {
        PharmaUtils.modal.close();
        PharmaUtils.modal.error("Failed to save return/damage", err.message);
    }
}

function inspectionQueueSnapshot(order) {
    const draft = order.inspection_draft;
    if (!draft || !Array.isArray(draft.items)) {
        return {
            completed: 0,
            total: Math.max(1, (order.items || []).length * 6),
            percent: 0,
            hasIssues: false,
            ready: false,
            key: "awaiting",
            status: "Awaiting Inspection",
        };
    }
    let completed = 0;
    let hasIssues = false;
    let allReady = true;
    (order.items || []).forEach((orderItem) => {
        const item =
            draft.items.find(
                (candidate) => String(candidate.po_item_id) === String(orderItem.po_item_id),
            ) || {};
        const quantity = receiveQuantityModel(
            orderItem,
            receiveQuantityValuesWithConversions(orderItem, item),
        );
        const batches = Array.isArray(item.batches) ? item.batches : [];
        const allocated = batches.reduce(
            (sum, batch) => sum + Math.max(0, Number(batch.quantity || 0)),
            0,
        );
        const quantitiesComplete =
            Number.isInteger(quantity.delivered) &&
            quantity.delivered >= 0 &&
            quantity.delivered <= quantity.ordered &&
            Number.isInteger(quantity.damaged) &&
            quantity.damaged >= 0 &&
            quantity.damaged <= quantity.delivered &&
            Number.isInteger(quantity.action) &&
            quantity.action >= 0 &&
            quantity.action <= quantity.delivered;
        const batchesComplete =
            allocated === quantity.accepted &&
            (quantity.accepted === 0 || batches.length > 0) &&
            batches.every(
                (batch) => Number.isInteger(Number(batch.quantity)) && Number(batch.quantity) > 0,
            );
        const expiryComplete = quantity.accepted === 0 || batches.length > 0;
        const physicalAction = ["return_to_supplier", "hold_quarantine", "dispose"].includes(
            quantity.disposition,
        );
        const dispositionComplete =
            quantity.action > 0 || quantity.damaged > 0
                ? physicalAction && quantity.action >= quantity.damaged
                : quantity.missing > 0
                  ? quantity.disposition === "not_applicable"
                  : true;
        const issueDetailComplete =
            item.issue_type !== "Other" || Boolean(String(item.issue_detail || "").trim());
        const resolutionComplete =
            quantity.affected === 0
                ? quantity.resolution === "none"
                : Boolean(item.issue_type) &&
                  issueDetailComplete &&
                  dispositionComplete &&
                  quantity.resolution !== "none";
        const remarksComplete = true;
        const inspected =
            item.inspection_complete === true ||
            item.inspection_complete === 1 ||
            item.inspection_complete === "1";
        completed += [
            quantitiesComplete,
            batchesComplete,
            expiryComplete,
            resolutionComplete,
            remarksComplete,
            inspected,
        ].filter(Boolean).length;
        hasIssues = hasIssues || quantity.affected > 0;
        allReady =
            allReady &&
            quantitiesComplete &&
            batchesComplete &&
            expiryComplete &&
            resolutionComplete &&
            remarksComplete &&
            inspected;
    });
    const total = Math.max(1, (order.items || []).length * 6);
    const percent = Math.round((completed / total) * 100);
    const ready = allReady && (order.items || []).length > 0;
    const key = ready ? "ready" : hasIssues ? "issue-found" : "in-progress";
    const status = ready
        ? "Ready to Confirm"
        : hasIssues
          ? "With Issues"
          : "Inspection in Progress";
    return { completed, total, percent, hasIssues, ready, key, status };
}

function inspectionActiveTotals(order) {
    const draftItems = Array.isArray(order.inspection_draft?.items)
        ? order.inspection_draft.items
        : [];
    if (!draftItems.length) {
        return {
            ordered: (order.items || []).reduce(
                (sum, item) => sum + Number(item.inventory_qty_ordered || item.quantity || 0),
                0,
            ),
            accepted: 0,
            affected: 0,
        };
    }
    return (order.items || []).reduce(
        (totals, item) => {
            const draftItem =
                draftItems.find(
                    (candidate) => String(candidate.po_item_id) === String(item.po_item_id),
                ) || {};
            const quantity = receiveQuantityModel(
                item,
                receiveQuantityValuesWithConversions(item, draftItem),
            );
            totals.ordered += Number(quantity.ordered || 0);
            totals.accepted += Number(quantity.accepted || 0);
            totals.affected += Number(quantity.affected || 0);
            return totals;
        },
        { ordered: 0, accepted: 0, affected: 0 },
    );
}

function inspectionQueueProductSummary(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const first = items[0] || order;
    const count = order.receiving_completed === true ? Number(order.products || 0) : items.length;
    const product = first.generic_name || first.generic_name_snapshot || first.product_name || first.product_name_snapshot || "Product";
    const brand = first.brand_name_snapshot || first.brand_name || "";
    const more = Math.max(0, count - 1);
    const secondary = [
        brand && brand.trim().toLowerCase() !== product.trim().toLowerCase() ? brand : "",
        more > 0 ? `+${more} more` : "",
    ].filter(Boolean).join(" • ");
    return `<div class="queue-product-summary"><strong>${escapeHtml(product)}</strong>${secondary ? `<span>${escapeHtml(secondary)}</span>` : ""}</div>`;
}

function renderInspectionQueue() {
    const search = String(document.getElementById("inspectionSearch")?.value || "")
        .trim()
        .toLowerCase();
    const from = document.getElementById("inspectionDateFrom")?.value || "";
    const to = document.getElementById("inspectionDateTo")?.value || "";
    if (from && from < localTodayDateString()) {
        PharmaUtils.toast.error("ETA cannot be earlier than today.");
        return;
    }
    if (to && to < localTodayDateString()) {
        PharmaUtils.toast.error("ETA cannot be earlier than today.");
        return;
    }
    if (from && to && from > to) {
        PharmaUtils.toast.error("From Date cannot be later than To Date.");
        return;
    }
    const inspectionStatus = document.getElementById("inspectionStatusFilter")?.value || "";
    const filtered = inspectionQueueOrders.filter((order) => {
        const snapshot =
            order.receiving_completed === true
                ? {
                      key: "completed",
                      status: "Receiving Completed",
                      hasIssues: Number(order.affected_units || 0) > 0,
                  }
                : order.inspection_snapshot || inspectionQueueSnapshot(order);
        const firstItem = Array.isArray(order.items) ? order.items[0] || {} : order;
        const haystack =
            `${order.po_number || ""} ${order.grn_number || ""} ${order.supplier_name || ""} ${firstItem.generic_name || firstItem.generic_name_snapshot || firstItem.product_name_snapshot || firstItem.product_name || ""} ${firstItem.brand_name_snapshot || firstItem.brand_name || ""}`.toLowerCase();
        const arrival = String(
            order.received_date ||
                order.arrival_date ||
                order.expected_delivery_date ||
                order.order_date ||
                "",
        ).slice(0, 10);
        return (
            (!search || haystack.includes(search)) &&
            (!from || arrival >= from) &&
            (!to || arrival <= to) &&
            (!inspectionStatus || snapshot.key === inspectionStatus)
        );
    });
    const rows = document.getElementById("inspectionQueueRows");
    if (!rows) return;
    if (!filtered.length) {
        rows.innerHTML =
            '<tr><td colspan="9" class="empty-state">No arrived purchase orders match the selected filters.</td></tr>';
        return;
    }
    rows.innerHTML = filtered
        .map((order) => {
            const completed = order.receiving_completed === true;
            const snapshot = completed
                ? {
                      key: "completed",
                      status: "Receiving Completed",
                      hasIssues: Number(order.affected_units || 0) > 0,
                  }
                : order.inspection_snapshot || inspectionQueueSnapshot(order);
            const totals = completed
                ? {
                      ordered: Number(order.ordered_units || 0),
                      accepted: Number(order.accepted_units || 0),
                      affected: Number(order.affected_units || 0),
                  }
                : inspectionActiveTotals(order);
            const statusClass =
                snapshot.key === "completed"
                    ? "status-complete"
                    : snapshot.ready
                      ? "status-ready"
                      : snapshot.hasIssues
                        ? "status-warning"
                        : snapshot.key === "in-progress"
                          ? "status-active"
                          : "status-neutral";
            const arrivalDate =
                order.arrival_date || order.expected_delivery_date || order.order_date;
            const receivedDate = order.received_date;
            const actionLabel =
                snapshot.key === "awaiting" ? "Start Inspection" : "Continue Inspection";
            const actions = completed
                ? `<button class="btn btn-sm btn-outline-primary queue-action-icon queue-view-receiving" type="button" data-po-id="${escapeHtml(order.po_id)}" title="View Goods Received Note" aria-label="View Goods Received Note for ${escapeHtml(order.po_number || "")}"><i class="fa-regular fa-eye"></i></button><button class="btn btn-sm btn-outline-primary queue-action-icon queue-edit-receiving" type="button" data-po-id="${escapeHtml(order.po_id)}" title="Edit Goods Received Note" aria-label="Edit Goods Received Note for ${escapeHtml(order.po_number || "")}"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-secondary queue-document-button queue-print-grn" type="button" data-po-id="${escapeHtml(order.po_id)}" data-receiving-id="${escapeHtml(order.receiving_id || "")}" title="Goods Received Note" aria-label="Open Goods Received Note for ${escapeHtml(order.po_number || "")}">GRN</button>${order.has_discrepancy || Number(order.affected_units || 0) > 0 ? `<button class="btn btn-sm btn-outline-secondary queue-document-button queue-discrepancy" type="button" data-po-id="${escapeHtml(order.po_id)}" data-receiving-id="${escapeHtml(order.receiving_id || "")}" title="Delivery Discrepancy & Replacement Acknowledgement" aria-label="Open Delivery Discrepancy & Replacement Acknowledgement for ${escapeHtml(order.po_number || "")}">Discrepancy</button>` : ""}`
                : `<button class="btn btn-sm ${snapshot.key === "awaiting" ? "btn-outline-primary" : "btn-primary"} queue-action-icon inspect-queue-action" type="button" data-po-id="${escapeHtml(order.po_id)}" title="${actionLabel}" aria-label="${actionLabel} for ${escapeHtml(order.po_number || "")}"><i class="fa-solid fa-clipboard-check"></i></button>`;
            return `<tr class="queue-row" data-po-id="${escapeHtml(order.po_id)}">
            <td><span class="queue-po" title="${escapeHtml(order.po_number || "-")}">${escapeHtml(order.po_number || "-")}</span><span class="queue-secondary" title="${escapeHtml(completed ? order.grn_number : "No GRN yet")}">${escapeHtml(completed ? order.grn_number : "No GRN yet")}</span></td>
            <td title="${escapeHtml(order.supplier_name || "-")}">${escapeHtml(order.supplier_name || "-")}</td>
            <td><strong>${escapeHtml(formatDate(arrivalDate))}</strong>${completed ? `<span class="queue-secondary">Received ${escapeHtml(formatDate(receivedDate))}</span>` : ""}</td>
            <td>${inspectionQueueProductSummary(order)}</td><td>${totals.ordered}</td><td>${totals.accepted}</td><td>${totals.affected}</td>
            <td><span class="queue-status-badge ${statusClass}">${escapeHtml(snapshot.status)}</span></td>
            <td><div class="queue-row-actions">${actions}</div></td>
        </tr>`;
        })
        .join("");
}

function updateInspectionQueueSummary() {
    const snapshots = inspectionQueueOrders
        .filter((order) => order.receiving_completed !== true)
        .map((order) => order.inspection_snapshot || inspectionQueueSnapshot(order));
    const values = {
        inspectionCountAwaiting: snapshots.filter((snapshot) => snapshot.key === "awaiting").length,
        inspectionCountProgress: snapshots.filter((snapshot) => snapshot.key === "in-progress")
            .length,
        inspectionCountIssues: snapshots.filter((snapshot) => snapshot.hasIssues).length,
        inspectionCountReady: snapshots.filter((snapshot) => snapshot.ready).length,
    };
    Object.entries(values).forEach(([id, value]) => {
        const node = document.getElementById(id);
        if (node) node.textContent = String(value);
    });
}

async function loadInspectionQueue() {
    const rows = document.getElementById("inspectionQueueRows");
    if (rows)
        rows.innerHTML =
            '<tr><td colspan="9" class="empty-state"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading arrived purchase orders...</td></tr>';
    try {
        const [activeData, completedData] = await Promise.all([
            fetchJson(
                `${API_BASE_URL}/purchase_orders/get_purchase_orders.php?status=Arrived&t=${Date.now()}`,
            ),
            fetchJson(`${API_BASE_URL}/purchase_orders/get_receiving_history.php?t=${Date.now()}`),
        ]);
        const activeOrders = Array.isArray(activeData.purchase_orders)
            ? activeData.purchase_orders
            : [];
        const activeDetails = await Promise.all(
            activeOrders.map(async (order) => {
                try {
                    const detail = await getPurchaseOrder(order.po_id);
                    detail.inspection_snapshot = inspectionQueueSnapshot(detail);
                    return detail;
                } catch (error) {
                    order.inspection_snapshot = inspectionQueueSnapshot(order);
                    return order;
                }
            }),
        );
        const completedOrders = (
            Array.isArray(completedData.history) ? completedData.history : []
        ).map((record) => ({ ...record, receiving_completed: true }));
        const completedIds = new Set(completedOrders.map((order) => String(order.po_id)));
        inspectionQueueOrders = [
            ...activeDetails.filter((order) => !completedIds.has(String(order.po_id))),
            ...completedOrders,
        ].sort((left, right) =>
            String(
                right.received_date || right.expected_delivery_date || right.order_date || "",
            ).localeCompare(
                String(left.received_date || left.expected_delivery_date || left.order_date || ""),
            ),
        );
        updateInspectionQueueSummary();
        renderInspectionQueue();
    } catch (error) {
        if (rows)
            rows.innerHTML = `<tr><td colspan="10" class="empty-state text-danger">${escapeHtml(error.message || "Unable to load arrived purchase orders.")}</td></tr>`;
    }
}

function updateInspectionDateSummary() {
    const from = document.getElementById("inspectionDateFrom")?.value || "";
    const to = document.getElementById("inspectionDateTo")?.value || "";
    const label = document.getElementById("inspectionDateSummary");
    if (!label) return;
    label.textContent =
        from && to
            ? `${formatDate(from)} – ${formatDate(to)}`
            : from
              ? `From ${formatDate(from)}`
              : to
                ? `Through ${formatDate(to)}`
                : "All arrival dates";
}

function setInspectionDateMinimums() {
    ["inspectionDateFrom", "inspectionDateTo"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.min = localTodayDateString();
    });
}

function showInspectionQueue(options = {}) {
    activeReceiveOrder = null;
    document.getElementById("inspectionWorkspaceView")?.classList.add("d-none");
    document.getElementById("inspectionQueueView")?.classList.remove("d-none");
    if (options.replaceHistory || options.pushHistory) {
        const url = new URL(window.location.href);
        url.searchParams.delete("po");
        url.searchParams.delete("received");
        url.searchParams.delete("view");
        window.history[options.pushHistory ? "pushState" : "replaceState"](
            {},
            "",
            `${url.pathname}${url.search}${url.hash}`,
        );
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    if (options.reload !== false) loadInspectionQueue();
}

function openInspectionWorkspace(poId, options = {}) {
    if (!poId) return;
    if (options.pushHistory) {
        const url = new URL(window.location.href);
        url.searchParams.set("po", poId);
        url.searchParams.delete("received");
        window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    openReceivePurchaseOrder(poId);
}

function bindReceiveWorkspaceEvents() {
    document
        .getElementById("btnConfirmReceivePo")
        ?.addEventListener("click", submitReceivePurchaseOrder);
    document
        .getElementById("btnSaveReceiveDraft")
        ?.addEventListener("click", saveReceiveInspectionDraft);
    document
        .getElementById("btnOpenNextInspection")
        ?.addEventListener("click", openNextUninspectedCard);
    document
        .getElementById("btnPreviousInspectionProduct")
        ?.addEventListener("click", () => showReceiveProduct(activeInspectionProductIndex - 1));
    document
        .getElementById("btnNextInspectionProduct")
        ?.addEventListener("click", () => showReceiveProduct(activeInspectionProductIndex + 1));
    document.getElementById("receiveProductNavigator")?.addEventListener("click", (event) => {
        const button = event.target.closest(".product-nav-item");
        if (button) showReceiveProduct(Number(button.dataset.productIndex || 0));
    });
    document.getElementById("receiveAdditionalAmount")?.addEventListener("input", (event) => {
        if (Number(event.target.value || 0) < 0) event.target.value = "0";
        renderReceivePaymentSummary();
    });
    document
        .getElementById("receivePaymentStatus")
        ?.addEventListener("change", renderReceivePaymentSummary);
    document.getElementById("receiveAmountPaid")?.addEventListener("input", (event) => {
        if (Number(event.target.value || 0) < 0) event.target.value = "0";
        renderReceivePaymentSummary();
    });
    document.getElementById("receiveChecklistItems")?.addEventListener("click", (event) => {
        const step = event.target.closest(".receive-check-step");
        if (step) navigateReceiveChecklistStep(step.dataset.checkKey || "");
    });
    const cards = document.getElementById("receiveInspectionCards");
    cards?.addEventListener("input", (event) => {
        if (event.target.matches('input[type="number"]') && Number(event.target.value || 0) < 0)
            event.target.value = "0";
        if (event.target.matches(".receive-batch-qty"))
            event.target.closest(".receive-batch-row").dataset.autoAllocation = "0";
        const card = event.target.closest(".receive-item-card");
        if (card) card.dataset.touched = "1";
        renderReceivePaymentSummary();
    });
    cards?.addEventListener("change", (event) => {
        const card = event.target.closest(".receive-item-card");
        if (card) card.dataset.touched = "1";
        if (event.target.matches(".receive-issue-toggle") && card) {
            const damageList = card.querySelector(".receive-damage-lines");
            if (
                event.target.value === "1" &&
                damageList &&
                !damageList.querySelector(".receive-damage-line")
            ) {
                const orderItem = activeReceiveOrder?.items.find(
                    (item) => String(item.po_item_id) === String(card.dataset.poItemId),
                );
                const conversions = Array.isArray(orderItem?.package_conversions)
                    ? orderItem.package_conversions
                    : [];
                const purchaseUnit = purchasingConversion(orderItem || {}).purchaseUnit;
                const batches = [...card.querySelectorAll(".receive-batch-row")].map((row) => ({
                    batch_identifier: row.querySelector(".receive-batch-id")?.value || "",
                }));
                const receivedPurchaseQuantity = Number(
                    card.querySelector(".receive-qty-input")?.value || 0,
                );
                damageList.insertAdjacentHTML(
                    "beforeend",
                    receiveDamageLineRow(
                        {},
                        conversions,
                        orderItem?.unit || "unit",
                        purchaseUnit,
                        receivedPurchaseQuantity,
                        batches,
                    ),
                );
                syncReceivePackageSequenceSelectors(card);
            }
            if (event.target.value === "0") {
                if (damageList) damageList.innerHTML = "";
                const actionQuantity = card.querySelector(".action-qty-input");
                if (actionQuantity) actionQuantity.value = "0";
            }
        }
        if (
            event.target.matches(".receive-issue-type") &&
            event.target.value === "Short Quantity"
        ) {
            const action = card?.querySelector(".receive-disposition");
            if (action) action.value = "not_applicable";
        }
        if (event.target.matches(".receive-batch-no-expiry")) {
            const expiry = event.target
                .closest(".receive-batch-row")
                ?.querySelector(".receive-batch-expiry");
            if (expiry) {
                expiry.disabled = event.target.checked;
                if (event.target.checked) expiry.value = "";
            }
        }
        renderReceivePaymentSummary();
    });
    cards?.addEventListener("click", (event) => {
        const addDamage = event.target.closest(".receive-add-damage-line");
        if (addDamage) {
            const card = addDamage.closest(".receive-item-card");
            const orderItem = activeReceiveOrder?.items.find(
                (item) => String(item.po_item_id) === String(card?.dataset.poItemId),
            );
            const conversions = Array.isArray(orderItem?.package_conversions)
                ? orderItem.package_conversions
                : [];
            const purchaseUnit = purchasingConversion(orderItem || {}).purchaseUnit;
            const batches = [...(card?.querySelectorAll(".receive-batch-row") || [])].map(
                (row) => ({
                    batch_identifier: row.querySelector(".receive-batch-id")?.value || "",
                }),
            );
            const receivedPurchaseQuantity = Number(
                card?.querySelector(".receive-qty-input")?.value || 0,
            );
            card?.querySelector(".receive-damage-lines")?.insertAdjacentHTML(
                "beforeend",
                receiveDamageLineRow(
                    {},
                    conversions,
                    orderItem?.unit || "unit",
                    purchaseUnit,
                    receivedPurchaseQuantity,
                    batches,
                ),
            );
            if (card) syncReceivePackageSequenceSelectors(card);
            renderReceivePaymentSummary();
            card?.querySelector(
                ".receive-damage-line:last-child .damage-package-sequence",
            )?.focus();
            return;
        }
        const removeDamage = event.target.closest(".receive-remove-damage-line");
        if (removeDamage) {
            removeDamage.closest(".receive-damage-line")?.remove();
            renderReceivePaymentSummary();
            return;
        }
        const complete = event.target.closest(".receive-complete-inspection");
        if (complete) {
            const card = complete.closest(".receive-item-card");
            if (!card) return;
            card.dataset.validationAttempted = "1";
            renderReceivePaymentSummary();
            if (card.dataset.ready !== "1") {
                const invalid = card.querySelector(".receive-invalid-control");
                if (invalid) scrollReceiveModalTo(invalid, invalid);
                return;
            }
            const input = card.querySelector(".receive-inspected-input");
            if (input) input.value = "1";
            renderReceivePaymentSummary();
            openNextUninspectedCard();
            return;
        }
        const reopen = event.target.closest(".receive-reopen-inspection");
        if (reopen) {
            const card = reopen.closest(".receive-item-card");
            const input = card?.querySelector(".receive-inspected-input");
            if (input) input.value = "0";
            if (card) setReceiveCardLocked(card, false);
            renderReceivePaymentSummary();
            return;
        }
        const add = event.target.closest(".receive-add-batch");
        if (add) {
            const card = add.closest(".receive-item-card");
            card?.querySelector(".receive-batch-list")?.insertAdjacentHTML(
                "beforeend",
                receiveBatchRow({}, card?.dataset.requiresExpiry === "1"),
            );
            renderReceivePaymentSummary();
            return;
        }
        const remove = event.target.closest(".receive-remove-batch");
        if (remove) {
            remove.closest(".receive-batch-row")?.remove();
            renderReceivePaymentSummary();
        }
    });
}

function initInspectDeliveries() {
    setTheme(localStorage.getItem("drpTheme") || "light");
    document
        .getElementById("themeToggle")
        ?.addEventListener("click", () =>
            setTheme(document.body.classList.contains("dark-mode") ? "light" : "dark"),
        );
    bindReceiveWorkspaceEvents();
    ensureReceivingUi();
    setInspectionDateMinimums();
    document
        .querySelectorAll("[data-inspection-back]")
        .forEach((button) =>
            button.addEventListener("click", () => showInspectionQueue({ pushHistory: true })),
        );
    document
        .getElementById("btnRefreshInspectionQueue")
        ?.addEventListener("click", loadInspectionQueue);
    ["inspectionSearch", "inspectionStatusFilter"].forEach((id) =>
        document
            .getElementById(id)
            ?.addEventListener(
                id === "inspectionSearch" ? "input" : "change",
                renderInspectionQueue,
            ),
    );
    ["inspectionDateFrom", "inspectionDateTo"].forEach((id) =>
        document.getElementById(id)?.addEventListener("change", () => {
            updateInspectionDateSummary();
            renderInspectionQueue();
        }),
    );
    document.getElementById("btnClearInspectionFilters")?.addEventListener("click", () => {
        [
            "inspectionSearch",
            "inspectionDateFrom",
            "inspectionDateTo",
            "inspectionStatusFilter",
        ].forEach((id) => {
            const control = document.getElementById(id);
            if (control) control.value = "";
        });
        updateInspectionDateSummary();
        renderInspectionQueue();
    });
    document.getElementById("inspectionQueueRows")?.addEventListener("click", (event) => {
        const inspect = event.target.closest(".inspect-queue-action");
        const view = event.target.closest(".queue-view-receiving");
        const edit = event.target.closest(".queue-edit-receiving");
        const print = event.target.closest(".queue-print-grn");
        const discrepancy = event.target.closest(".queue-discrepancy");
        if (inspect) openInspectionWorkspace(inspect.dataset.poId, { pushHistory: true });
        else if (view) openReceivingDetails(view.dataset.poId);
        else if (edit) openGrnEditor(edit.dataset.poId);
        else if (print) openDeliveredReceipt(print.dataset.poId, false, print.dataset.receivingId || "");
        else if (discrepancy)
            openSupplierDiscrepancyForPo(
                discrepancy.dataset.poId,
                false,
                discrepancy.dataset.receivingId || "",
            );
    });
    window.addEventListener("popstate", () => {
        const nextParams = new URLSearchParams(window.location.search);
        const poId = nextParams.get("po");
        if (poId) openInspectionWorkspace(poId);
        else showInspectionQueue({ reload: false });
    });
    const success = sessionStorage.getItem("inspectDeliveriesSuccess");
    if (success) {
        sessionStorage.removeItem("inspectDeliveriesSuccess");
        PharmaUtils.toast.success(success);
    }
    const params = new URLSearchParams(window.location.search);
    const poId = params.get("po");
    loadInspectionQueue();
    if (poId) openInspectionWorkspace(poId);
}

function initPurchaseOrders() {
    if (purchaseOrdersInitialized) return;
    purchaseOrdersInitialized = true;
    ensureReceivingUi();
    setPoEtaMinimums();

    setTheme(localStorage.getItem("drpTheme") || "light");
    initEditPoModalLayoutControls();
    initViewPoModalLayoutControls();

    document
        .getElementById("themeToggle")
        ?.addEventListener("click", () =>
            setTheme(document.body.classList.contains("dark-mode") ? "light" : "dark"),
        );
    document.querySelectorAll('[data-bs-dismiss="modal"]').forEach((button) => {
        button.addEventListener("click", () => hideModal(button.closest(".modal")?.id));
    });
    document.getElementById("po-supplier-select")?.addEventListener("change", (event) => {
        createDraftItems.length = 0;
        selectedCreateDraftIndex = null;
        renderDraftItems(createDraftItems, "#table-po-items", "remove-po-item");
        renderSelectedProductPanel();
        loadSupplierProducts(event.target.value, "po-product-select");
    });
    document
        .getElementById("po-product-select")
        ?.addEventListener("change", syncPurchaseUnitFieldsFromSelectedProduct);
    document
        .getElementById("po-quantity")
        ?.addEventListener("input", syncSelectedCreateDraftItemFromInputs);
    document
        .getElementById("po-payment-terms")
        ?.addEventListener("change", updateCreatePoSubmitState);
    document
        .getElementById("po-expected-delivery")
        ?.addEventListener("input", updateCreatePoSubmitState);
    document.getElementById("edit-po-supplier-select")?.addEventListener("change", (event) => {
        editDraftItems.length = 0;
        clearEditProductEditor();
        renderDraftItems(editDraftItems, "#table-edit-po-items", "remove-edit-po-item");
        loadSupplierProducts(event.target.value, "edit-po-product-select");
    });
    document.getElementById("edit-po-product-select")?.addEventListener("change", (event) => {
        const option = event.target.options[event.target.selectedIndex];
        const selectedProduct = draftItemFromOption(
            option,
            document.getElementById("edit-po-quantity")?.value || 1,
        );
        const existingItem = editDraftItemByKey(editingPoItemKey);
        const item = existingItem
            ? {
                  ...selectedProduct,
                  po_item_id: existingItem.po_item_id || null,
                  client_item_id: existingItem.client_item_id || null,
              }
            : selectedProduct;
        showEditProductEditor(item, editingPoItemKey);
    });
    document.getElementById("edit-po-quantity")?.addEventListener("input", (event) => {
        const editorQuantity = document.getElementById("edit-po-editor-quantity");
        if (
            editorQuantity &&
            !document.getElementById("edit-po-product-editor")?.classList.contains("d-none")
        ) {
            editorQuantity.value = event.target.value;
            updateEditStockToReceive();
        }
    });
    document.getElementById("edit-po-editor-quantity")?.addEventListener("input", (event) => {
        setValue("edit-po-quantity", event.target.value);
        updateEditStockToReceive();
    });
    document
        .getElementById("edit-po-editor-contains")
        ?.addEventListener("input", updateEditStockToReceive);
    document
        .getElementById("edit-po-editor-purchase-unit")
        ?.addEventListener("change", updateEditStockToReceive);
    document.getElementById("btnAddPoItem")?.addEventListener("click", () =>
        addDraftItem({
            items: createDraftItems,
            productSelectId: "po-product-select",
            quantityInputId: "po-quantity",
            tableSelector: "#table-po-items",
            removeClass: "remove-po-item",
        }),
    );
    document
        .getElementById("btnEditAddPoItem")
        ?.addEventListener("click", addOrUpdateEditDraftItem);
    document
        .getElementById("btnCancelEditPoItem")
        ?.addEventListener("click", () => clearEditProductEditor({ focusProduct: true }));
    document
        .getElementById("btnConfirmReceivePo")
        ?.addEventListener("click", submitReceivePurchaseOrder);
    document
        .getElementById("btnSaveReceiveDraft")
        ?.addEventListener("click", saveReceiveInspectionDraft);
    document
        .getElementById("btnOpenNextInspection")
        ?.addEventListener("click", openNextUninspectedCard);
    document.getElementById("btnSaveReturnDamage")?.addEventListener("click", submitReturnDamage);
    const statusFilter = document.getElementById("po-status-filter");
    const paymentStatusFilter = document.getElementById("po-payment-status-filter");
    const params = new URLSearchParams(window.location.search);
    const initialPoView = purchaseOrderViewFromUrl();
    const linkedPoId = params.get("po_id") || "";
    const queryStatus = initialPoView === "active" ? params.get("status") || "" : "";
    if (params.get("action") === "create") {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("action");
        window.history.replaceState(
            null,
            "",
            `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`,
        );
        PharmaUtils.toast.info(
            "Purchase orders are generated automatically after final CEO approval.",
        );
    }
    if (statusFilter && queryStatus && STATUS_META[queryStatus]) {
        if (![...statusFilter.options].some((option) => option.value === queryStatus)) {
            statusFilter.add(new Option(queryStatus, queryStatus));
        }
        statusFilter.value = queryStatus;
    }
    statusFilter?.addEventListener("change", loadPurchaseOrders);
    paymentStatusFilter?.addEventListener("change", loadPurchaseOrders);
    document.querySelectorAll(".po-view-btn").forEach((button) => {
        button.addEventListener("click", () =>
            setPurchaseOrderView(button.dataset.poView || "active"),
        );
    });
    document.getElementById("receiveAdditionalAmount")?.addEventListener("input", (event) => {
        if (Number(event.target.value || 0) < 0) event.target.value = "0";
        renderReceivePaymentSummary();
    });
    document.getElementById("receiveChecklistItems")?.addEventListener("click", (event) => {
        const step = event.target.closest(".receive-check-step");
        if (!step) return;
        navigateReceiveChecklistStep(step.dataset.checkKey || "");
    });
    const receivingCards = document.getElementById("receiveInspectionCards");
    receivingCards?.addEventListener("input", (event) => {
        if (event.target.matches('input[type="number"]') && Number(event.target.value || 0) < 0)
            event.target.value = "0";
        const card = event.target.closest(".receive-item-card");
        if (card) card.dataset.touched = "1";
        renderReceivePaymentSummary();
    });
    receivingCards?.addEventListener("change", (event) => {
        const card = event.target.closest(".receive-item-card");
        if (card) card.dataset.touched = "1";
        if (event.target.matches(".receive-batch-no-expiry")) {
            const expiry = event.target
                .closest(".receive-batch-row")
                ?.querySelector(".receive-batch-expiry");
            if (expiry) {
                expiry.disabled = event.target.checked;
                if (event.target.checked) expiry.value = "";
            }
        }
        renderReceivePaymentSummary();
    });
    receivingCards?.addEventListener("click", (event) => {
        const toggle = event.target.closest(".receive-card-toggle");
        if (toggle) {
            const body = toggle.closest(".receive-item-card")?.querySelector(".receive-card-body");
            const willOpen = body?.classList.contains("d-none");
            body?.classList.toggle("d-none", !willOpen);
            toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
            return;
        }
        const completeInspectionButton = event.target.closest(".receive-complete-inspection");
        if (completeInspectionButton) {
            const card = completeInspectionButton.closest(".receive-item-card");
            if (!card || card.dataset.ready !== "1") return;
            const inspectionInput = card.querySelector(".receive-inspected-input");
            if (inspectionInput) inspectionInput.value = "1";
            card.dataset.touched = "1";
            renderReceivePaymentSummary();
            return;
        }
        const reopenInspectionButton = event.target.closest(".receive-reopen-inspection");
        if (reopenInspectionButton) {
            const card = reopenInspectionButton.closest(".receive-item-card");
            const inspectionInput = card?.querySelector(".receive-inspected-input");
            if (inspectionInput) inspectionInput.value = "0";
            if (card) {
                card.dataset.touched = "1";
                setReceiveCardLocked(card, false);
            }
            renderReceivePaymentSummary();
            return;
        }
        const addButton = event.target.closest(".receive-add-batch");
        if (addButton) {
            const card = addButton.closest(".receive-item-card");
            if (card) card.dataset.touched = "1";
            card?.querySelector(".receive-batch-list")?.insertAdjacentHTML(
                "beforeend",
                receiveBatchRow({}, card?.dataset.requiresExpiry === "1"),
            );
            renderReceivePaymentSummary();
            return;
        }
        const removeButton = event.target.closest(".receive-remove-batch");
        if (removeButton) {
            const card = removeButton.closest(".receive-item-card");
            if (card) card.dataset.touched = "1";
            removeButton.closest(".receive-batch-row")?.remove();
            renderReceivePaymentSummary();
        }
    });
    document
        .getElementById("createPurchaseOrderModal")
        ?.addEventListener("hidden.bs.modal", resetCreateDraft);
    ["createPurchaseOrderModal", "editPurchaseOrderModal"].forEach((id) =>
        document.getElementById(id)?.addEventListener("shown.bs.modal", setPoEtaMinimums),
    );
    document.getElementById("viewPurchaseOrderModal")?.addEventListener("hidden.bs.modal", () => {
        activeViewOrder = null;
    });
    document.getElementById("viewPurchaseOrderModal")?.addEventListener("click", async (event) => {
        const invoiceButton = event.target.closest("[data-po-invoice-action]");
        if (invoiceButton) {
            const poId = invoiceButton.dataset.poId || "";
            const action = invoiceButton.dataset.poInvoiceAction;
            if (action === "print") openSupplierInvoiceDocument(poId);
            else if (action === "payment") await openSupplierPayment(poId);
            else if (["record", "edit"].includes(action)) {
                await openSupplierInvoice(poId, { edit: action === "edit" });
            }
            return;
        }
        const paymentButton = event.target.closest("[data-po-payment-action]");
        if (paymentButton) {
            const poId = paymentButton.dataset.poId || "";
            if (paymentButton.dataset.poPaymentAction === "invoice")
                openSupplierInvoiceDocument(poId);
            else if (paymentButton.dataset.poPaymentAction === "payment")
                openSupplierPayment(poId);
            return;
        }
        const receivingButton = event.target.closest("[data-receiving-document]");
        if (receivingButton) {
            const poId = receivingButton.dataset.poId || "";
            const receivingId = receivingButton.dataset.receivingId || "";
            if (receivingButton.dataset.receivingDocument === "grn")
                openDeliveredReceipt(poId, false, receivingId);
            else if (receivingButton.dataset.receivingDocument === "discrepancy")
                openSupplierDiscrepancyForPo(poId, false, receivingId);
        }
    });
    document.getElementById("printPurchaseOrderButton")?.addEventListener("click", () => {
        try {
            printPurchaseOrder(activeViewOrder);
        } catch (error) {
            PharmaUtils.toast.error(error.message);
        }
    });
    document
        .getElementById("poSupplierInvoiceContent")
        ?.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-po-invoice-action]");
            if (!button) return;
            const poId = button.dataset.poId || "";
            if (button.dataset.poInvoiceAction === "print") {
                openSupplierInvoiceDocument(poId);
                return;
            }
            if (button.dataset.poInvoiceAction === "payment") {
                await openSupplierPayment(poId);
                return;
            }
            if (button.dataset.poInvoiceAction === "close") {
                document.querySelector("[data-close-po-view]")?.click();
                return;
            }
            if (["record", "edit"].includes(button.dataset.poInvoiceAction)) {
                await openSupplierInvoice(poId, {
                    edit: button.dataset.poInvoiceAction === "edit",
                });
            }
        });
    document.getElementById("poPaymentSummaryContent")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-po-payment-action]");
        if (!button) return;
        const poId = button.dataset.poId || "";
        if (button.dataset.poPaymentAction === "invoice") openSupplierInvoiceDocument(poId);
        if (button.dataset.poPaymentAction === "payment") openSupplierPayment(poId);
    });
    document.getElementById("poReceivingDocumentsList")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-receiving-document]");
        if (!button) return;
        const poId = button.dataset.poId || "";
        const receivingId = button.dataset.receivingId || "";
        if (button.dataset.receivingDocument === "grn")
            openDeliveredReceipt(poId, false, receivingId);
        if (button.dataset.receivingDocument === "discrepancy")
            openSupplierDiscrepancyForPo(poId, false, receivingId);
    });
    document.getElementById("editPurchaseOrderModal")?.addEventListener("hidden.bs.modal", () => {
        clearEditProductEditor();
        activeEditOrder = null;
        editDraftItems.length = 0;
    });
    document.getElementById("po-selected-product-panel")?.addEventListener("click", (event) => {
        const removeButton = event.target.closest(".po-summary-remove-item");
        const decreaseButton = event.target.closest(".po-quantity-decrease");
        const increaseButton = event.target.closest(".po-quantity-increase");

        if (removeButton) {
            const item = createDraftItemByKey(removeButton.dataset.lineKey || "");
            if (item) removeCreateDraftItem(createDraftItems.indexOf(item));
            return;
        }

        const stepButton = decreaseButton || increaseButton;
        if (stepButton) {
            const itemKey = stepButton.dataset.lineKey || "";
            const item = createDraftItemByKey(itemKey);
            if (!item) return;
            const currentQuantity = Number(item.purchase_qty || item.quantity || 1);
            const nextQuantity = decreaseButton
                ? Math.max(1, currentQuantity - 1)
                : currentQuantity + 1;
            updateDraftItemQuantity(
                itemKey,
                nextQuantity,
                decreaseButton ? ".po-quantity-decrease" : ".po-quantity-increase",
            );
        }
    });
    document.getElementById("po-selected-product-panel")?.addEventListener("input", (event) => {
        const input = event.target.closest(".po-quantity-input");
        if (!input) return;
        const itemKey = input.dataset.lineKey || "";
        const item = createDraftItemByKey(itemKey);
        if (!item) return;
        const value = String(input.value || "").trim();
        if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
            input.value = String(item.purchase_qty || item.quantity || 1);
            renderQuantityValidation(input, "Enter a whole number of 1 or more.");
            return;
        }
        updateDraftItemQuantity(itemKey, value, ".po-quantity-input");
    });
    document.getElementById("po-selected-product-panel")?.addEventListener("keydown", (event) => {
        const input = event.target.closest(".po-quantity-input");
        if (!input) return;
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            input.blur();
            return;
        }
        if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const itemKey = input.dataset.lineKey || "";
        const item = createDraftItemByKey(itemKey);
        if (!item) return;
        const currentQuantity = Number(item.purchase_qty || item.quantity || 1);
        const nextQuantity =
            event.key === "ArrowUp" ? currentQuantity + 1 : Math.max(1, currentQuantity - 1);
        updateDraftItemQuantity(itemKey, nextQuantity, ".po-quantity-input");
    });
    document.getElementById("table-edit-po-items")?.addEventListener("click", async (event) => {
        const removeButton = event.target.closest(".remove-edit-po-item");

        if (removeButton) {
            event.stopPropagation();
            const itemKey = removeButton.dataset.itemKey || "";
            const item = editDraftItemByKey(itemKey);
            if (!item) return;
            const productLabel = [poBrandName(item), productTableProductName(item)]
                .filter(Boolean)
                .join(" ");
            let confirmed = false;
            if (window.Swal) {
                const result = await Swal.fire({
                    title: "Remove PO item?",
                    text: `${productLabel} will be removed when you save changes.`,
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonText: "Remove Item",
                    confirmButtonColor: "#dc2626",
                    focusCancel: true,
                });
                confirmed = result.isConfirmed;
            } else {
                confirmed = window.confirm(`Remove ${productLabel} from this purchase order?`);
            }
            if (!confirmed) return;
            const remainingItems = editDraftItems.filter(
                (candidate) => editItemKey(candidate) !== itemKey,
            );
            editDraftItems.length = 0;
            editDraftItems.push(...remainingItems);
            if (editingPoItemKey === itemKey) clearEditProductEditor();
            renderDraftItems(editDraftItems, "#table-edit-po-items", "remove-edit-po-item");
            if (activeEditOrder) applyEditLocks(activeEditOrder);
            return;
        }

        const row = event.target.closest("tr[data-item-key]");
        if (row && !editMajorFieldsLocked) {
            const item = editDraftItemByKey(row.dataset.itemKey || "");
            if (item) showEditProductEditor(item, row.dataset.itemKey || "");
        }
    });
    document.getElementById("table-edit-po-items")?.addEventListener("keydown", (event) => {
        if (
            !["Enter", " "].includes(event.key) ||
            editMajorFieldsLocked ||
            event.target.closest("button")
        )
            return;
        const row = event.target.closest("tr[data-item-key]");
        if (!row) return;
        event.preventDefault();
        const item = editDraftItemByKey(row.dataset.itemKey || "");
        if (item) showEditProductEditor(item, row.dataset.itemKey || "");
    });
    document.getElementById("table-purchase-orders")?.addEventListener("click", (event) => {
        const row = event.target.closest("tr.po-clickable-row");
        const viewButton = event.target.closest(".view-po-btn");
        const statusButton = event.target.closest(".status-po-btn");
        const primaryStatusButton = event.target.closest(".po-primary-status-btn");
        const receiveButton = event.target.closest(".po-receive-btn");
        const managePaymentButton = event.target.closest(
            ".manage-payment-btn, .view-payment-history-btn",
        );
        const invoiceButton = event.target.closest(".record-invoice-btn");
        if (primaryStatusButton) updatePurchaseOrderStatusFromTable(primaryStatusButton.dataset.poId);
        else if (receiveButton) openReceivePurchaseOrder(receiveButton.dataset.poId);
        else if (viewButton) openViewPurchaseOrder(viewButton.dataset.poId);
        else if (statusButton) toggleStatusActionMenu(statusButton);
        else if (invoiceButton) openSupplierInvoice(invoiceButton.dataset.poId);
        else if (managePaymentButton) openSupplierPayment(managePaymentButton.dataset.poId);
        else if (row && !event.target.closest("button, a, input, select, textarea, [role='menuitem']"))
            openViewPurchaseOrder(row.dataset.poId);
    });
    document.getElementById("table-purchase-orders")?.addEventListener("keydown", (event) => {
        const row = event.target.closest("tr.po-clickable-row");
        if (
            !row ||
            !["Enter", " "].includes(event.key) ||
            event.target !== row ||
            event.target.closest("button, a, input, select, textarea, [role='menuitem']")
        )
            return;
        event.preventDefault();
        openViewPurchaseOrder(row.dataset.poId);
    });
    document.addEventListener("click", (event) => {
        const menuItem = event.target.closest(".status-po-menu-item");
        const invoiceItem = event.target.closest(".po-action-popover-invoice");
        const paymentItem = event.target.closest(".po-action-popover-payment");
        if (menuItem) {
            const poId = menuItem.dataset.poId;
            closeStatusActionMenu();
            updatePurchaseOrderStatusFromTable(poId);
            return;
        }
        if (invoiceItem || paymentItem) {
            const poId = (invoiceItem || paymentItem).dataset.poId;
            closeStatusActionMenu();
            if (invoiceItem) openSupplierInvoice(poId);
            else openSupplierPayment(poId);
            return;
        }
        if (!event.target.closest(".status-po-btn, .po-action-popover")) closeStatusActionMenu();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeStatusActionMenu();
    });
    window.addEventListener("resize", positionStatusActionMenu);
    window.addEventListener("scroll", positionStatusActionMenu, true);
    document.getElementById("po-status-summary")?.addEventListener("click", (event) => {
        if (event.target.closest('[data-route="inspect-deliveries"]'))
            window.location.href = "inspect_deliveries.html";
    });
    document.getElementById("po-status-summary")?.addEventListener("keydown", (event) => {
        if (
            ["Enter", " "].includes(event.key) &&
            event.target.closest('[data-route="inspect-deliveries"]')
        ) {
            event.preventDefault();
            window.location.href = "inspect_deliveries.html";
        }
    });

    renderDraftItems(createDraftItems, "#table-po-items", "remove-po-item");
    renderDraftItems(editDraftItems, "#table-edit-po-items", "remove-edit-po-item");
    loadPOSuppliers();
    if (initialPoView === "active") {
        const initialLoad = loadPurchaseOrders({ updateSummary: true });
        if (linkedPoId)
            initialLoad
                .then(() => openViewPurchaseOrder(linkedPoId))
                .catch((error) => showError(error.message));
    } else {
        setPurchaseOrderView(initialPoView, { updateSummary: true });
    }
}

if (document.body.dataset.page === "inspect-deliveries") initInspectDeliveries();
else initPurchaseOrders();

export {
    initPurchaseOrders,
    initInspectDeliveries,
    loadPOSuppliers,
    loadSupplierProducts,
    loadPurchaseOrders,
};
