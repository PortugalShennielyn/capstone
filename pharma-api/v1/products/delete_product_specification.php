<?php

$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_customization_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);

try {
    if (!is_array($payload)) throw new InvalidArgumentException('Invalid JSON payload.');
    ensureProductCustomizationSchema($pdo);
    $specificationId = cleanId($payload['specification_id'] ?? null);
    if ($specificationId === '') throw new InvalidArgumentException('Specification is required.');

    $pdo->beginTransaction();
    $definitionStatement = $pdo->prepare(
        "SELECT ps.specification_name,
                (SELECT COUNT(*) FROM product_specification_values psv WHERE psv.specification_id = ps.specification_id) AS value_count
         FROM product_specifications ps
         WHERE ps.specification_id = :specification_id
         LIMIT 1 FOR UPDATE"
    );
    $definitionStatement->execute([':specification_id' => $specificationId]);
    $definition = $definitionStatement->fetch(PDO::FETCH_ASSOC);
    if (!$definition) throw new InvalidArgumentException('Specification not found.');
    if (strcasecmp(trim((string) $definition['specification_name']), 'Inventory Unit') === 0) {
        throw new InvalidArgumentException('Selling / Inventory Unit is a permanent SKU field and cannot be deleted.');
    }
    if ((int) $definition['value_count'] > 0) {
        throw new DomainException('This specification is currently used by existing products and cannot be deleted.');
    }

    $delete = $pdo->prepare('DELETE FROM product_specifications WHERE specification_id = :specification_id');
    $delete->execute([':specification_id' => $specificationId]);
    if ($delete->rowCount() !== 1) throw new RuntimeException('Specification could not be deleted.');
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Specification deleted.',
        'deleted_specification_id' => $specificationId,
    ]);
} catch (DomainException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(409);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to delete specification.']);
}

