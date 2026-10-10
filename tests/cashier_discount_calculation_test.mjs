import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../pharma-frontend/js/modules/sales_financials.js', import.meta.url), 'utf8');
const { vatInclusivePaymentTotals, savedTransactionTotals } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

const medicine = { line_total: 112, discount_eligible: true };
const grocery = { line_total: 100, discount_eligible: false };
const senior = vatInclusivePaymentTotals({ subtotal: 112, sales_clerk_discount: 5, items: [medicine] }, 'senior');
assert.equal(senior.totalAmount, 80);
assert.equal(senior.cashierDiscount, 20);
assert.equal(senior.vatExemption, 12);
assert.equal(senior.salesClerkDiscount, 0);

const pwd = vatInclusivePaymentTotals({ subtotal: 212, items: [medicine, grocery] }, 'pwd');
assert.equal(pwd.totalAmount, 180);
assert.equal(pwd.vatableSales, 89.29);
assert.equal(pwd.vat, 10.71);
assert.equal(pwd.vatExemptSales, 100);

const receipt = savedTransactionTotals({
    subtotal: 112, final_amount: 80, vat: 0, cashier_discount_amount: 20,
    vat_exempt_sales: 100, vat_exemption_amount: 12,
});
assert.equal(receipt.discount, 32);
assert.equal(receipt.vatableSales, 0);
console.log('Cashier discount preview and receipt calculations passed.');
