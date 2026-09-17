<?php
require_once __DIR__ . '/../pharma-api/v1/sales/sales_financials.php';
require_once __DIR__ . '/../pharma-api/v1/sales/sales_pos_helpers.php';
require_once __DIR__ . '/../pharma-api/v1/cashier/cashier_helpers.php';

function assertMoney(float $expected, float $actual, string $label): void
{
    if (abs($expected - $actual) > 0.001) {
        throw new RuntimeException(sprintf('%s: expected %.2f, received %.2f', $label, $expected, $actual));
    }
}

$ten = salesVatInclusiveBreakdown(10, 0);
assertMoney(8.93, $ten['vatable_sales'], 'PHP 10 VATable Sales');
assertMoney(1.07, $ten['vat'], 'PHP 10 VAT');
assertMoney(10.00, $ten['total_amount'], 'PHP 10 total');

$oneEighty = salesVatInclusiveBreakdown(180, 0);
assertMoney(160.71, $oneEighty['vatable_sales'], 'PHP 180 VATable Sales');
assertMoney(19.29, $oneEighty['vat'], 'PHP 180 VAT');
assertMoney(180.00, $oneEighty['total_amount'], 'PHP 180 total');
assertMoney(320.00, salesFinancialMoney(500 - $oneEighty['total_amount']), 'PHP 500 change');

$discounted = salesVatInclusiveBreakdown(100, 10);
assertMoney(80.36, $discounted['vatable_sales'], 'PHP 90 VATable Sales');
assertMoney(9.64, $discounted['vat'], 'PHP 90 VAT');
assertMoney(90.00, $discounted['total_amount'], 'PHP 90 total');

$serverAuthoritative = salesOrderTotalsFromPayload(
    ['discount' => 0, 'vat' => 999, 'total_amount' => 999],
    100
);
assertMoney(10.71, $serverAuthoritative['vat'], 'Server-authoritative VAT');
assertMoney(100.00, $serverAuthoritative['total_amount'], 'Server-authoritative total');

$cashier = cashierPaymentTotals(100, 'none', 0, 10);
assertMoney(10.00, $cashier['total_discount'], 'Combined discount');
assertMoney(80.36, $cashier['vatable_sales'], 'Cashier VATable Sales');
assertMoney(9.64, $cashier['vat'], 'Cashier VAT');
assertMoney(90.00, $cashier['final_amount'], 'Cashier final amount');

echo "VAT-inclusive calculation tests passed.\n";
