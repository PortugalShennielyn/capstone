<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_selling_options.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        throw new InvalidArgumentException('Only POST requests are allowed.');
    }
    $payload = json_decode(file_get_contents('php://input'), true);
    $productId = trim((string) ($payload['product_id'] ?? ''));
    $submitted = $payload['units'] ?? null;
    if ($productId === '' || !is_array($submitted) || !$submitted || count($submitted) > 30) {
        throw new InvalidArgumentException('Provide between 1 and 30 selling units.');
    }

    $base = productSellingBaseUnit($pdo, $productId);
    $baseName = trim((string) ($base['unit_symbol'] ?: $base['unit_name']));
    $normalized = [];
    foreach ($submitted as $unit) {
        if (!is_array($unit)) throw new InvalidArgumentException('Invalid selling unit.');
        $name = trim((string) ($unit['unit'] ?? ''));
        $factor = $unit['base_quantity'] ?? null;
        if ($name === '' || mb_strlen($name) > 50 || !preg_match('/^[\p{L}\p{N}][\p{L}\p{N} ._()\/\-]*$/u', $name)) {
            throw new InvalidArgumentException('Selling unit names must be 1–50 letters, numbers, spaces, or common packaging punctuation.');
        }
        if (!filter_var($factor, FILTER_VALIDATE_INT) || (int) $factor < 1) {
            throw new InvalidArgumentException('Conversion quantity must be a positive whole number.');
        }
        $key = mb_strtolower($name);
        if (isset($normalized[$key])) throw new InvalidArgumentException('Selling unit names must be unique.');
        if ($key === mb_strtolower($baseName) && (int) $factor !== 1) {
            throw new InvalidArgumentException('The Inventory Base Unit must equal exactly one base unit.');
        }
        $normalized[$key] = ['unit' => $name, 'base_quantity' => (int) $factor, 'is_active' => !empty($unit['is_active']) ? 1 : 0];
    }
    if (!isset($normalized[mb_strtolower($baseName)]) || !$normalized[mb_strtolower($baseName)]['is_active']) {
        throw new InvalidArgumentException('Keep the Inventory Base Unit active.');
    }

    $pdo->beginTransaction();
    $lock = $pdo->prepare('SELECT product_id FROM product WHERE product_id=:id FOR UPDATE');
    $lock->execute([':id' => $productId]);
    if (!$lock->fetchColumn()) throw new InvalidArgumentException('Product not found.');
    ensureProductDefaultSellingOption($pdo, $productId);
    $existing = $pdo->prepare('SELECT selling_option_id,unit_name,base_quantity,selling_price,is_default FROM product_selling_options WHERE product_id=:id FOR UPDATE');
    $existing->execute([':id' => $productId]);
    $byName = [];
    foreach ($existing->fetchAll(PDO::FETCH_ASSOC) as $row) $byName[mb_strtolower($row['unit_name'])] = $row;
    foreach ($normalized as $key => $unit) {
        if (isset($byName[$key])) {
            $row = $byName[$key];
            $statement = $pdo->prepare('UPDATE product_selling_options SET base_quantity=:factor,is_active=:active,pos_enabled=CASE WHEN :enabled=0 THEN 0 ELSE pos_enabled END,is_default=CASE WHEN :default_enabled=0 THEN 0 ELSE is_default END WHERE selling_option_id=:id');
            $statement->execute([':factor'=>$unit['base_quantity'], ':active'=>$unit['is_active'], ':enabled'=>$unit['is_active'], ':default_enabled'=>$unit['is_active'], ':id'=>$row['selling_option_id']]);
        } else {
            // A newly defined unit needs its own explicit Shelf Selling Price.
            $statement = $pdo->prepare('INSERT INTO product_selling_options (selling_option_id,product_id,unit_name,base_quantity,selling_price,pos_enabled,is_active,is_default) VALUES (UUID(),:product,:unit,:factor,0,0,:active,0)');
            $statement->execute([':product'=>$productId, ':unit'=>$unit['unit'], ':factor'=>$unit['base_quantity'], ':active'=>$unit['is_active']]);
        }
    }
    foreach ($byName as $key => $row) {
        if (isset($normalized[$key])) continue;
        $pdo->prepare('UPDATE product_selling_options SET is_active=0,pos_enabled=0,is_default=0 WHERE selling_option_id=:id')->execute([':id'=>$row['selling_option_id']]);
    }
    $pdo->commit();
    echo json_encode(['status'=>'success', 'message'=>'Selling units saved. Set their retail prices in Shelf Selling Prices.', 'units'=>productSellingOptions($pdo,$productId)]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (http_response_code() < 400) http_response_code(422);
    echo json_encode(['status'=>'error','message'=>$error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status'=>'error','message'=>'Unable to save selling units.']);
}
