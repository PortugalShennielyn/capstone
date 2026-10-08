<?php
$allowedRoles = ['super_admin', 'admin', 'Admin', 'ro-super-admin', 'ro-admin'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_selling_options.php';

function sellingOptionWholeNumber($value, string $label): int
{
    if (!is_numeric($value) || (int) $value < 1 || (float) $value !== (float) (int) $value) {
        throw new InvalidArgumentException("{$label} must be a positive whole number.");
    }
    return (int) $value;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        throw new InvalidArgumentException('Only POST requests are allowed.');
    }
    $payload = json_decode(file_get_contents('php://input'), true);
    if (!is_array($payload)) throw new InvalidArgumentException('Invalid JSON payload.');
    $productId = trim((string) ($payload['product_id'] ?? ''));
    $submitted = $payload['options'] ?? null;
    if ($productId === '' || !is_array($submitted) || !$submitted) {
        throw new InvalidArgumentException('At least one Selling Option is required.');
    }
    $baseUnit = productSellingBaseUnit($pdo, $productId);
    $barcodeColumn = productSellingOptionBarcodeColumn($pdo);
    $candidateUnits = [];
    foreach (productSellableUnitCandidates($pdo, $productId) as $candidate) {
        $candidateUnits[mb_strtolower((string) $candidate['unit'])] = (int) $candidate['base_quantity'];
    }
    $normalized = [];
    $seenUnits = [];
    $seenBarcodes = [];
    $defaultCount = 0;
    foreach ($submitted as $index => $option) {
        if (!is_array($option)) throw new InvalidArgumentException('Invalid Selling Option.');
        $unit = trim((string) ($option['unit'] ?? ''));
        if ($unit === '' || mb_strlen($unit) > 50) throw new InvalidArgumentException('Selling Unit is required and must be 50 characters or fewer.');
        $unitKey = mb_strtolower($unit);
        if (isset($seenUnits[$unitKey])) throw new InvalidArgumentException("Duplicate Selling Unit: {$unit}");
        $seenUnits[$unitKey] = true;
        $baseQuantity = sellingOptionWholeNumber($option['base_quantity'] ?? null, 'Base Quantity');
        if (!isset($candidateUnits[$unitKey]) || $candidateUnits[$unitKey] !== $baseQuantity) {
            throw new InvalidArgumentException("{$unit} is not a configured selling unit for this product.");
        }
        $price = $option['selling_price'] ?? null;
        if (is_string($price) && !preg_match('/^\d+(?:\.\d{1,2})?$/D', trim($price))) {
            throw new InvalidArgumentException("Selling Price for {$unit} must be a non-negative number with no more than two decimal places.");
        }
        if (!is_numeric($price) || !is_finite((float) $price) || (float) $price < 0) {
            throw new InvalidArgumentException("Selling Price for {$unit} must be a valid non-negative number.");
        }
        if (abs((float) $price - round((float) $price, 2)) > 0.0000001) {
            throw new InvalidArgumentException("Selling Price for {$unit} can have no more than two decimal places.");
        }
        if ($barcodeColumn !== null && !array_key_exists('barcode', $option)) {
            throw new InvalidArgumentException('Refresh Shelf Inventory before saving sellable units and barcodes.');
        }
        $barcode = trim((string) ($option['barcode'] ?? ''));
        if (strlen($barcode) > 100 || preg_match('/[\x00-\x1F\x7F]/', $barcode)) {
            throw new InvalidArgumentException("Barcode for {$unit} must be at most 100 printable characters.");
        }
        if ($barcode !== '' && $barcodeColumn === null) {
            throw new InvalidArgumentException('Unit barcodes require the selling-option barcode migration.');
        }
        $barcodeKey = mb_strtolower($barcode);
        if ($barcode !== '' && isset($seenBarcodes[$barcodeKey])) {
            throw new InvalidArgumentException('Each sellable unit needs a different barcode.');
        }
        if ($barcode !== '') $seenBarcodes[$barcodeKey] = true;
        $active = !empty($option['is_active']);
        $posEnabled = $active && !empty($option['pos_enabled']);
        if ($posEnabled && (float) $price <= 0) {
            throw new InvalidArgumentException("Set a Selling Price above zero for {$unit} before enabling it in POS.");
        }
        $isDefault = $active && $posEnabled && !empty($option['is_default']);
        if ($isDefault) $defaultCount++;
        $normalized[] = [
            'selling_option_id' => trim((string) ($option['selling_option_id'] ?? '')),
            'unit' => $unit,
            'base_quantity' => $baseQuantity,
            'selling_price' => round((float) $price, 2),
            'barcode' => $barcode,
            'is_active' => $active ? 1 : 0,
            'pos_enabled' => $posEnabled ? 1 : 0,
            'is_default' => $isDefault ? 1 : 0,
        ];
    }
    if ($defaultCount !== 1) throw new InvalidArgumentException('Select exactly one active POS option as the default Selling Option.');

    $pdo->beginTransaction();
    $lock = $pdo->prepare('SELECT product_id FROM product WHERE product_id = :product_id FOR UPDATE');
    $lock->execute([':product_id' => $productId]);
    if (!$lock->fetchColumn()) throw new InvalidArgumentException('Product not found.');
    if ($barcodeColumn !== null) {
        $otherProduct = $pdo->prepare('SELECT product_id FROM product WHERE LOWER(TRIM(barcode))=LOWER(:barcode) AND product_id<>:product_id LIMIT 1');
        $otherUnit = $pdo->prepare("SELECT product_id FROM product_selling_options WHERE LOWER(TRIM(`{$barcodeColumn}`))=LOWER(:barcode) AND product_id<>:product_id LIMIT 1");
        foreach ($normalized as $option) {
            if ($option['barcode'] === '') continue;
            $params = [':barcode' => $option['barcode'], ':product_id' => $productId];
            $otherProduct->execute($params);
            $otherUnit->execute($params);
            if ($otherProduct->fetchColumn() || $otherUnit->fetchColumn()) {
                throw new InvalidArgumentException("Barcode for {$option['unit']} already belongs to another product or selling unit.");
            }
        }
        // Clear this product's old assignments first so a barcode can move to another unit in one save.
        $pdo->prepare("UPDATE product_selling_options SET `{$barcodeColumn}`=NULL WHERE product_id=:product_id")
            ->execute([':product_id' => $productId]);
    }
    $pdo->prepare('UPDATE product_selling_options SET is_default = 0 WHERE product_id = :product_id')->execute([':product_id' => $productId]);
    $savedIds = [];
    foreach ($normalized as $option) {
        $optionId = $option['selling_option_id'];
        $params = [
            ':unit'=>$option['unit'],
            ':base_quantity'=>$option['base_quantity'],
            ':selling_price'=>$option['selling_price'],
            ':pos_enabled'=>$option['pos_enabled'],
            ':is_active'=>$option['is_active'],
            ':is_default'=>$option['is_default'],
            ':product_id'=>$productId,
        ];
        if ($barcodeColumn !== null) $params[':barcode'] = $option['barcode'] !== '' ? $option['barcode'] : null;
        if ($optionId !== '') {
            $barcodeUpdate = $barcodeColumn !== null ? ",`{$barcodeColumn}`=:barcode" : '';
            $statement = $pdo->prepare(
                'UPDATE product_selling_options
                 SET unit_name=:unit,base_quantity=:base_quantity,selling_price=:selling_price' . $barcodeUpdate . ',
                     pos_enabled=:pos_enabled,is_active=:is_active,is_default=:is_default
                 WHERE selling_option_id=:option_id AND product_id=:product_id'
            );
            $statement->execute($params + [':option_id' => $optionId]);
            if ($statement->rowCount() === 0) {
                $exists = $pdo->prepare('SELECT 1 FROM product_selling_options WHERE selling_option_id=:id AND product_id=:product_id');
                $exists->execute([':id'=>$optionId,':product_id'=>$productId]);
                if (!$exists->fetchColumn()) throw new InvalidArgumentException('Selling Option not found.');
            }
        } else {
            $optionId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
            $barcodeField = $barcodeColumn !== null ? ",`{$barcodeColumn}`" : '';
            $barcodeValue = $barcodeColumn !== null ? ',:barcode' : '';
            $statement = $pdo->prepare(
                'INSERT INTO product_selling_options
                 (selling_option_id,product_id,unit_name,base_quantity,selling_price' . $barcodeField . ',pos_enabled,is_active,is_default)
                 VALUES (:option_id,:product_id,:unit,:base_quantity,:selling_price' . $barcodeValue . ',:pos_enabled,:is_active,:is_default)'
            );
            $statement->execute($params + [':option_id' => $optionId]);
        }
        $savedIds[] = $optionId;
    }
    $placeholders = implode(',', array_fill(0, count($savedIds), '?'));
    $deactivate = $pdo->prepare("UPDATE product_selling_options SET is_active=0,pos_enabled=0,is_default=0 WHERE product_id=? AND selling_option_id NOT IN ({$placeholders})");
    $deactivate->execute(array_merge([$productId], $savedIds));
    $default = array_values(array_filter($normalized, static fn(array $option): bool => $option['is_default'] === 1))[0];
    $pdo->commit();
    echo json_encode([
        'status'=>'success',
        'message'=>'Sellable units and prices saved.',
        'base_unit'=>$baseUnit,
        'options'=>productSellingOptions($pdo,$productId),
        'default_selling_price'=>$default['selling_price'],
    ]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (http_response_code() < 400) http_response_code(422);
    echo json_encode(['status'=>'error','message'=>$error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status'=>'error','message'=>'Unable to save Selling Setup.']);
}
