<?php
// Keep legacy callers subject to the same reason and lifecycle checks.
$forcedPurchaseOrderStatus = 'Cancelled';
require __DIR__ . '/update_purchase_order_status.php';
