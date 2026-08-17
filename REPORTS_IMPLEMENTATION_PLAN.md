# Reports and Dashboard implementation plan

## Existing sources to reuse

- Completed sales: `sales_orders`, aggregated paid `sales_payments`, `sales_order_items`, `sales_receipts`, and `users`.
- Inventory and expiry: `inventory_batches` joined to `product`, `product_categories`, `product_types`, and `suppliers`.
- Purchasing: `purchase_orders`, `purchase_order_items`, `purchase_order_receiving`, `purchase_order_receiving_items`, `purchase_order_returns`, and `purchase_order_payments`.
- Shared application behavior: `config/db_connection.php`, `config/require_auth.php`, the tab-token auth guard, shared navbar, theme variables, and existing receipt history page.

## Accuracy decisions

- A completed sale must have `sales_orders.status = 'completed'` and an aggregated `sales_payments.payment_status = 'paid'` row.
- Sale totals are aggregated once per order before any item grouping to prevent sale-detail multiplication.
- Sellable stock is active, unexpired batch shelf plus storage quantity. Damaged and returned quantities are already separate and are not added.
- Inventory value and expiry cost at risk use each batch's stored `inventory_batches.unit_cost`, the received acquisition cost.
- PO child records are aggregated before joining the PO header, preventing item, receiving, return, and payment cross-products.

## Implementation sequence

1. Add a role-aware, filter-validated reporting endpoint with paginated category responses.
2. Add the Reports page using the shared navbar/theme and the existing receipt viewer route.
3. Add Reports to Monitoring and the existing page-role guard.
4. Replace the dashboard's legacy sales-table query with the same completed-sale calculation and link operational cards to filtered reports.
5. Run PHP syntax, API/database, role, browser, responsive, empty/error, and chart-refresh checks.

No database table or column is required for this implementation.
