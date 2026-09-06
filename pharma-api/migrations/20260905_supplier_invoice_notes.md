# Supplier invoice extension

Schema inspected: live `pharma_db` and existing PO, invoice, payment, pricing,
supplier conversion, inventory and selling-option implementations/migrations.

Reused `purchase_order_invoices`, `purchase_order_invoice_items`, their indexed
foreign keys and one-invoice-per-PO constraint. Reused header discount, other
charges and `supplier_invoice_total` as the existing authoritative financial
total consumed by PO and payment queries. No supplier/product master data is
copied into invoice records. Only `invoice_qty` was missing; the SQL migration
backfills historical lines from the quantity previously used to calculate them.
Run `20260905_supplier_invoice_quantity.sql` before deploying the PHP changes.

The existing save endpoint accepts each line's `invoice_qty` (nonnegative,
four decimal places), `po_item_id` and positive `unit_cost`. It saves all lines
atomically and recomputes the existing header total. The browser refreshes PO,
invoice and payment details after success. Invoice and delivery statuses remain
independent, and pending orders support prepayment.

`GET products/get_product_details.php?product_id=...` now adds
`data.supplier_invoice_pricing`. Product specifications remain available in
the same response's existing `data.specifications`. Suggestions contain the
latest invoice reference, purchase cost, selling unit, converted unit cost,
current price, markup and suggested selling price, with `requires_approval=true`.
The latest positive-quantity invoice line is selected by invoice date, recorded
time and stable IDs, excluding cancelled/draft orders. Conversion uses the PO's
existing snapshot of the supplier hierarchy; changing current supplier packaging
does not revalue earlier purchases. Current POS rules sell the Product Master
base unit. No additional conversion or price storage was introduced.

Suggestions use gross line cost before header discount/charges because those
amounts have no existing per-line allocation rule. No selling price is updated
by recording an invoice. Existing delivery pricing behavior is unchanged; the
new invoice suggestion field is preparation for a later Manage Prices approval UI.

Verification: `php tests/supplier_invoice_workflow_test.php` uses isolated,
cleaned-up fixtures for API save/edit, quantity and cost validation, invoice
totals, prepayment, payment retention, conversion, history and unchanged prices.
