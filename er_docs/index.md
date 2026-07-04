# ER Docs Index

This index tracks target table names, acronyms, and short descriptions. It is intentionally a quick overview and does not dive into table-level specifics.

Naming rules:

- Table names are plural resources.
- Table names and attributes use snake_case.
- Acronyms are 10 characters or fewer.
- Detailed table docs live in `domains/`.
- This folder describes the target schema foundation and is not a live database dump.

## Tables

```text
Name: products
Acronym: PRD
Description: Stores the core identity of a sellable or trackable product. This table must not store dimensions, units, prices, supplier ownership, or stock quantities.

Name: product_categories
Acronym: PRDCAT
Description: Stores broad product classification labels. Categories are reusable lookup records and must not contain product-specific attributes.

Name: product_types
Acronym: PRDTYP
Description: Stores product type labels scoped to a category. Type records describe classification only and must not store dimensions or pricing.

Name: product_variations
Acronym: PRDVAR
Description: Stores sellable variations of a product. Variation identity, barcode, sku, and sale status belong here; dimensions and measurements belong in entity_dimensions.

Name: entity_dimensions
Acronym: ENTDIM
Description: Stores polymorphic dimensional and measurement attributes for any entity. Product sizes, strengths, weights, volumes, package contents, and physical dimensions belong here instead of products or product_variations.

Name: measurement_units
Acronym: MEASUNIT
Description: Stores reusable measurement unit labels such as piece, gram, milliliter, box, and pack. Units are not scoped to products only.

Name: suppliers
Acronym: SUP
Description: Stores supplier identity and contact information. Supplier-product relationships belong in supplier_products.

Name: supplier_products
Acronym: SUPPRD
Description: Stores product assignments to suppliers. This is a relationship table and should not duplicate product attributes or supplier attributes.

Name: inventory_batches
Acronym: INVBATCH
Description: Stores inbound inventory batches for any product variation. Batch quantity, expiry, and receiving source belong here instead of products.

Name: selling_stocks
Acronym: SELLSTK
Description: Stores quantities moved from inventory batches into a sellable stock location. This table tracks availability, not product identity.

Name: lookup_values
Acronym: LKPVAL
Description: Stores reusable lookup options. Application-specific labels should be rows here rather than hard-coded enum columns where flexibility is needed.

Name: purchase_orders
Acronym: PO
Description: Stores purchase order headers. Supplier, status, payment, and expected delivery metadata live here; product lines live in purchase_order_items.

Name: purchase_order_items
Acronym: POITEM
Description: Stores purchase order line items. Snapshot fields preserve what was ordered without duplicating active product attributes.

Name: purchase_order_receivings
Acronym: PORCV
Description: Stores receiving events for purchase orders. Item quantities belong in purchase_order_receiving_items.

Name: purchase_order_receiving_items
Acronym: PORCVITM
Description: Stores received and damaged quantities for each purchase order item. This table is the source for inventory batch creation.

Name: purchase_order_returns
Acronym: PORET
Description: Stores return or damage records linked to purchase order items. Reason labels should reference lookup values by code when possible.

Name: notes
Acronym: NTE
Description: Stores polymorphic notes that can be attached to any supported entity without assuming where that entity is used.

Name: users
Acronym: USR
Description: Stores user identities, credentials, roles, and account status.

```
