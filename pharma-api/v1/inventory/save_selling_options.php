<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'Admin'];
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
    $normalized = [];
    $seenUnits = [];
    $defaultCount = 0;
    foreach ($submitted as $index => $option) {
        if (!is_array($option)) throw new InvalidArgumentException('Invalid Selling Option.');
        $unit = trim((string) ($option['unit'] ?? ''));
        if ($unit === '' || mb_strlen($unit) > 50) throw new InvalidArgumentException('Selling Unit is required and must be 50 characters or fewer.');
        $unitKey = mb_strtolower($unit);
        if (isset($seenUnits[$unitKey])) throw new InvalidArgumentException("Duplicate Selling Unit: {$unit}");
        $seenUnits[$unitKey] = true;
        $baseQuantity = sellingOptionWholeNumber($option['base_quantity'] ?? null, 'Base Quantity');
        $price = $option['selling_price'] ?? null;
        if (!is_numeric($price) || (float) $price < 0) throw new InvalidArgumentException("Selling Price for {$unit} must be zero or greater.");
        $active = !empty($option['is_active']);
        $posEnabled = $active && !empty($option['pos_enabled']);
        $isDefault = $active && $posEnabled && !empty($option['is_default']);
        if ($isDefault) $defaultCount++;
        $normalized[] = [
            'selling_option_id' => trim((string) ($option['selling_option_id'] ?? '')),
            'unit' => $unit,
            'base_quantity' => $baseQuantity,
            'selling_price' => round((float) $price, 2),
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
        if ($optionId !== '') {
            $statement = $pdo->prepare(
                'UPDATE product_selling_options
                 SET unit_name=:unit,base_quantity=:base_quantity,selling_price=:selling_price,
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
            $statement = $pdo->prepare(
                'INSERT INTO product_selling_options
                 (selling_option_id,product_id,unit_name,base_quantity,selling_price,pos_enabled,is_active,is_default)
                 VALUES (:option_id,:product_id,:unit,:base_quantity,:selling_price,:pos_enabled,:is_active,:is_default)'
            );
            $statement->execute($params + [':option_id' => $optionId]);
        }
        $savedIds[] = $optionId;
    }
    $placeholders = implode(',', array_fill(0, count($savedIds), '?'));
    $deactivate = $pdo->prepare("UPDATE product_selling_options SET is_active=0,pos_enabled=0,is_default=0 WHERE product_id=? AND selling_option_id NOT IN ({$placeholders})");
    $deactivate->execute(array_merge([$productId], $savedIds));
    $default = array_values(array_filter($normalized, static fn(array $option): bool => $option['is_default'] === 1))[0];
    $updatePrice = $pdo->prepare('UPDATE product SET price=:price WHERE product_id=:product_id');
    $updatePrice->execute([':price'=>$default['selling_price'],':product_id'=>$productId]);
    $pdo->commit();
    echo json_encode([
        'status'=>'success',
        'message'=>'Selling Setup saved successfully.',
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
