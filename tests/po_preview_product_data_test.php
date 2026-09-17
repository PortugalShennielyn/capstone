<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_requests/automatic_purchase_order_helpers.php';

function poPreviewDataAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$products = $pdo->query(
    "SELECT product_id, product_name
     FROM product
     WHERE LOWER(product_name) IN ('chuckie', 'biogesic for kids')"
)->fetchAll(PDO::FETCH_ASSOC);
$idsByName = [];
foreach ($products as $product) $idsByName[strtolower((string) $product['product_name'])] = (string) $product['product_id'];

poPreviewDataAssert(isset($idsByName['chuckie'], $idsByName['biogesic for kids']), 'Chuckie and Biogesic fixtures are required.');
$details = purchaseRequestProductDetails($pdo, array_values($idsByName));

$chuckie = $details[$idsByName['chuckie']] ?? [];
$chuckieSpecs = $chuckie['specifications'] ?? [];
$chuckieValues = array_map(static function (array $specification): string {
    $text = trim((string) ($specification['value_text'] ?? ''));
    if ($text !== '') return $text;
    return trim((string) ($specification['value_number'] ?? '') . ' ' . (string) ($specification['unit_symbol'] ?? ''));
}, $chuckieSpecs);
poPreviewDataAssert(in_array('Chocolate', $chuckieValues, true), 'Chuckie flavor was not loaded from Product Master specifications.');
poPreviewDataAssert((bool) array_filter($chuckieValues, static fn(string $value): bool => str_contains($value, '250') && stripos($value, 'mL') !== false), 'Chuckie volume was not loaded from Product Master specifications.');

$biogesic = $details[$idsByName['biogesic for kids']] ?? [];
poPreviewDataAssert(strcasecmp((string) ($biogesic['generic_name'] ?? ''), 'Paracetamol') === 0, 'Biogesic generic name is missing.');
poPreviewDataAssert(str_contains((string) ($biogesic['strength'] ?? ''), '120'), 'Biogesic strength is missing.');
poPreviewDataAssert(strcasecmp((string) ($biogesic['dosage_form'] ?? ''), 'Suspension') === 0, 'Biogesic dosage form is missing.');

$snapshots = purchaseRequestProductSnapshots($pdo, array_values($idsByName));
$chuckieSnapshot = $snapshots[$idsByName['chuckie']] ?? [];
poPreviewDataAssert(strcasecmp((string) ($chuckieSnapshot['variant_flavor'] ?? ''), 'Chocolate') === 0, 'Generated Chuckie PO snapshot loses its Product Master flavor.');
poPreviewDataAssert(str_contains((string) ($chuckieSnapshot['size_value'] ?? ''), '250') && stripos((string) ($chuckieSnapshot['size_value'] ?? ''), 'mL') !== false, 'Generated Chuckie PO snapshot loses its Product Master volume.');

$options = purchaseRequestSupplierOptions($pdo, array_values($idsByName));
$chuckieOption = $options[$idsByName['chuckie']][0] ?? [];
$biogesicOption = $options[$idsByName['biogesic for kids']][0] ?? [];
poPreviewDataAssert(($chuckieOption['purchase_unit'] ?? '') === 'Box', 'Chuckie purchase unit must remain Box.');
poPreviewDataAssert((int) ($chuckieOption['purchase_unit_contains'] ?? 0) === 5 && (int) ($chuckieOption['units_per_inner_unit'] ?? 0) === 10, 'Chuckie supplier packaging must remain 5 packs by 10 pieces.');
poPreviewDataAssert(($biogesicOption['purchase_unit'] ?? '') === 'Box' && (int) ($biogesicOption['units_per_purchase_unit'] ?? 0) === 10, 'Biogesic supplier packaging must remain 10 bottles per Box.');
poPreviewDataAssert(array_key_exists('supplier_address', $chuckieOption) && array_key_exists('supplier_phone', $chuckieOption) && array_key_exists('supplier_email', $chuckieOption), 'Supplier contacts are missing from the batched supplier result.');
poPreviewDataAssert(trim((string) ($chuckieOption['supplier_address'] ?? '')) !== '' && trim((string) ($chuckieOption['supplier_phone'] ?? '')) !== '' && trim((string) ($chuckieOption['supplier_email'] ?? '')) !== '', 'Chuckie supplier contact values were not retrieved from the supplier record.');

echo "PO preview Product Master and supplier batch data tests passed.\n";
