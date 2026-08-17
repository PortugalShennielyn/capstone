<?php

const SALES_VAT_RATE = 0.12;
const SALES_VAT_DIVISOR = 1.12;

function salesFinancialMoney($value): float
{
    return round((float) ($value ?? 0), 2);
}

function salesTransactionDiscount(string $discountType, float $customAmount, float $baseAmount): float
{
    $baseAmount = salesFinancialMoney(max(0, $baseAmount));
    $discountType = strtolower(trim($discountType));

    if ($discountType === 'senior' || $discountType === 'pwd') {
        return salesFinancialMoney($baseAmount * 0.20);
    }
    if ($discountType === 'promo') {
        return salesFinancialMoney($baseAmount * 0.10);
    }
    if ($discountType === 'custom') {
        return salesFinancialMoney(min(max($customAmount, 0), $baseAmount));
    }

    return 0.0;
}

function salesVatInclusiveBreakdown(float $subtotal, float $discountAmount = 0): array
{
    $subtotal = salesFinancialMoney(max(0, $subtotal));
    $discountAmount = salesFinancialMoney(min(max($discountAmount, 0), $subtotal));
    $totalAmount = salesFinancialMoney(max(0, $subtotal - $discountAmount));
    $vatableSales = salesFinancialMoney($totalAmount / SALES_VAT_DIVISOR);
    $vatAmount = salesFinancialMoney($totalAmount - $vatableSales);

    return [
        'subtotal' => $subtotal,
        'discount_amount' => $discountAmount,
        'vatable_sales' => $vatableSales,
        'vat' => $vatAmount,
        'total_amount' => $totalAmount,
    ];
}

function salesVatInclusivePaymentTotals(
    float $subtotal,
    float $salesClerkDiscount,
    string $cashierDiscountType,
    float $cashierCustomAmount
): array {
    $subtotal = salesFinancialMoney(max(0, $subtotal));
    $salesClerkDiscount = salesFinancialMoney(min(max($salesClerkDiscount, 0), $subtotal));
    $remainingAfterClerkDiscount = salesFinancialMoney(max(0, $subtotal - $salesClerkDiscount));
    $cashierDiscount = salesTransactionDiscount(
        $cashierDiscountType,
        $cashierCustomAmount,
        $remainingAfterClerkDiscount
    );
    $totalDiscount = salesFinancialMoney(min($subtotal, $salesClerkDiscount + $cashierDiscount));
    $breakdown = salesVatInclusiveBreakdown($subtotal, $totalDiscount);

    return array_merge($breakdown, [
        'sales_clerk_discount' => $salesClerkDiscount,
        'cashier_discount_type' => $cashierDiscountType,
        'cashier_discount_amount' => $cashierDiscount,
    ]);
}

