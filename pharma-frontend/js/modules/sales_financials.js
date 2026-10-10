export const VAT_RATE = 0.12;
export const VAT_DIVISOR = 1.12;

export function moneyRound(value) {
    const number = Math.max(0, Number(value || 0));
    return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function transactionDiscount(type, customAmount, baseAmount) {
    const base = moneyRound(baseAmount);
    if (type === 'senior' || type === 'pwd') return moneyRound(base * 0.20);
    if (type === 'promo') return moneyRound(base * 0.10);
    if (type === 'custom') return moneyRound(Math.min(base, Math.max(0, Number(customAmount || 0))));
    return 0;
}

export function vatInclusiveBreakdown(subtotalValue, discountValue = 0) {
    const subtotal = moneyRound(subtotalValue);
    const discount = moneyRound(Math.min(subtotal, Math.max(0, Number(discountValue || 0))));
    const totalAmount = moneyRound(subtotal - discount);
    const vatableSales = moneyRound(totalAmount / VAT_DIVISOR);
    const vat = moneyRound(totalAmount - vatableSales);
    return { subtotal, discount, vatableSales, vat, totalAmount };
}

export function vatInclusivePaymentTotals(order, discountType = 'none', customAmount = 0) {
    const subtotal = moneyRound(order?.subtotal);
    const salesClerkDiscount = moneyRound(Math.min(subtotal, Number(order?.sales_clerk_discount ?? order?.discount ?? 0)));
    if (discountType === 'senior' || discountType === 'pwd') {
        const eligibleGross = moneyRound(Math.min(subtotal, (order?.items || []).reduce(
            (sum, item) => sum + (item.discount_eligible ? Number(item.line_total || 0) : 0), 0
        )));
        const vatExemptSales = moneyRound(eligibleGross / VAT_DIVISOR);
        const vatExemption = moneyRound(eligibleGross - vatExemptSales);
        const cashierDiscount = moneyRound(vatExemptSales * 0.20);
        const taxableGross = moneyRound(subtotal - eligibleGross);
        const vatableSales = moneyRound(taxableGross / VAT_DIVISOR);
        return {
            subtotal, salesClerkDiscount: 0, cashierDiscount, discountType,
            discount: moneyRound(cashierDiscount + vatExemption),
            vatExemptSales, vatExemption, vatableSales,
            vat: moneyRound(taxableGross - vatableSales),
            totalAmount: moneyRound(taxableGross + vatExemptSales - cashierDiscount),
        };
    }
    const remaining = moneyRound(subtotal - salesClerkDiscount);
    const cashierDiscount = transactionDiscount(discountType, customAmount, remaining);
    const totalDiscount = moneyRound(Math.min(subtotal, salesClerkDiscount + cashierDiscount));
    return {
        ...vatInclusiveBreakdown(subtotal, totalDiscount),
        salesClerkDiscount,
        cashierDiscount,
        discountType,
        vatExemptSales: 0,
        vatExemption: 0,
    };
}

function hasSavedValue(value) {
    return value !== null && value !== undefined && value !== '';
}

export function savedTransactionTotals(order = {}) {
    const subtotal = moneyRound(order.subtotal);
    const salesClerkDiscount = moneyRound(order.sales_clerk_discount ?? order.discount ?? 0);
    const cashierDiscount = moneyRound(order.cashier_discount_amount ?? 0);
    const vatExemption = moneyRound(order.vat_exemption_amount ?? 0);
    const vatExemptSales = moneyRound(order.vat_exempt_sales ?? 0);
    const discount = moneyRound(Math.min(subtotal, salesClerkDiscount + cashierDiscount + vatExemption));
    const fallback = vatInclusiveBreakdown(subtotal, discount);
    const finalAmount = moneyRound(
        hasSavedValue(order.final_amount)
            ? order.final_amount
            : (hasSavedValue(order.total_amount) ? order.total_amount : fallback.totalAmount)
    );
    const vat = moneyRound(hasSavedValue(order.vat) ? order.vat : (finalAmount - (finalAmount / VAT_DIVISOR)));
    const vatableSales = moneyRound(
        hasSavedValue(order.vatable_sales)
            ? order.vatable_sales
            : Math.max(0, finalAmount - vat - vatExemptSales + cashierDiscount)
    );
    const cashReceived = moneyRound(order.amount_paid ?? order.cash_received ?? 0);
    const change = moneyRound(
        hasSavedValue(order.change_amount)
            ? order.change_amount
            : Math.max(0, cashReceived - finalAmount)
    );

    return {
        subtotal,
        salesClerkDiscount,
        cashierDiscount,
        vatExemptSales,
        vatExemption,
        discount,
        vatableSales,
        vat,
        finalAmount,
        cashReceived,
        change,
    };
}

