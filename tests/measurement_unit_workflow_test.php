<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/config/id_helpers.php';

function unitAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function unitApi(string $method, string $path, array $session, ?array $payload = null): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . ltrim($path, '/'));
    $headers = ['Accept: application/json', 'X-Tab-Token: ' . $session['tabToken']];
    if ($payload !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_COOKIE => 'PHPSESSID=' . $session['phpSessionId'],
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $payload === null ? null : json_encode($payload, JSON_THROW_ON_ERROR),
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $elapsed = (float) curl_getinfo($curl, CURLINFO_TOTAL_TIME);
    $error = curl_error($curl);
    curl_close($curl);
    unitAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: [], 'elapsed' => $elapsed];
}

$user = $pdo->query("SELECT user_id, username, full_name, role, status FROM users WHERE role = 'admin' AND status = 'Active' AND is_deleted = 0 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
unitAssert((bool) $user, 'An active admin account is required.');

$phpSessionId = 'codexunit' . bin2hex(random_bytes(10));
$tabToken = bin2hex(random_bytes(32));
$authSessionId = newUuid($pdo);
$createdUnitId = '';
$createdVolumeUnitId = '';
$bulkUnitIds = [];
$borrowedValue = null;
$legacyReferenceId = '';
$measuredSaveSeconds = null;
$passed = false;

if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
session_id($phpSessionId);
session_start();
$_SESSION = [
    'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
    'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-admin'],
    'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
    'tab_token_hash' => hash('sha256', $tabToken),
];
session_write_close();

$pdo->prepare('INSERT INTO auth_sessions (auth_session_id, php_session_id, user_id, session_token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), ?, ?)')
    ->execute([$authSessionId, $phpSessionId, $user['user_id'], hash('sha256', $tabToken), '127.0.0.1', 'Codex measurement unit workflow test']);

try {
    $invalidDelete = unitApi('POST', 'products/delete_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
        'measurement_unit_id' => 'not-a-valid-id',
    ]);
    unitAssert($invalidDelete['status'] === 422, 'An invalid measurement-unit ID was accepted.');
    unitAssert(($invalidDelete['body']['success'] ?? true) === false, 'Invalid-ID deletion did not report success=false.');
    unitAssert(($invalidDelete['body']['code'] ?? '') === 'INVALID_MEASUREMENT_UNIT_ID', 'Invalid-ID deletion did not return a clear error code.');

    $existingGramRow = $pdo->query("SELECT measurement_unit_id, unit_name, unit_symbol, measurement_group FROM product_measurement_units WHERE measurement_group = 'Weight' AND (LOWER(TRIM(unit_name)) IN ('g', 'gram', 'grams') OR LOWER(TRIM(COALESCE(unit_symbol, ''))) = 'g') LIMIT 1")->fetch(PDO::FETCH_ASSOC) ?: null;
    $existingGram = $existingGramRow['measurement_unit_id'] ?? null;
    if ($existingGram) {
        $gramDuplicate = unitApi('POST', 'products/add_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
            'unit_name' => 'grams', 'unit_symbol' => 'g', 'measurement_group' => 'Weight',
        ]);
        unitAssert($gramDuplicate['status'] === 400, 'The existing Weight g/grams equivalent was duplicated.');

        $systemEdit = unitApi('POST', 'products/add_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
            'measurement_unit_id' => $existingGram,
            'unit_name' => $existingGramRow['unit_name'],
            'unit_symbol' => 'changed-symbol',
            'measurement_group' => 'Volume',
        ]);
        unitAssert($systemEdit['status'] === 200, 'Editing a system unit display name failed.');
        unitAssert(($systemEdit['body']['unit']['unit_symbol'] ?? null) === $existingGramRow['unit_symbol'], 'A system unit symbol was changed.');
        unitAssert(($systemEdit['body']['unit']['measurement_group'] ?? null) === $existingGramRow['measurement_group'], 'A system unit group was changed.');
    }

    $suffix = strtoupper(bin2hex(random_bytes(3)));
    $name = 'Workflow Unit ' . $suffix;
    $symbol = 'wu' . strtolower($suffix);
    $created = unitApi('POST', 'products/add_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
        'unit_name' => $name, 'unit_symbol' => $symbol, 'measurement_group' => 'Weight',
    ]);
    $measuredSaveSeconds = $created['elapsed'];
    unitAssert($created['status'] === 200, "Creating {$name} ({$symbol}) failed: " . json_encode($created));
    $createdUnitId = (string) ($created['body']['unit']['measurement_unit_id'] ?? '');
    unitAssert($createdUnitId !== '', 'The create response did not return the new unit id.');
    unitAssert((int) ($created['body']['unit']['is_system'] ?? 1) === 0, 'A custom unit was incorrectly marked as a system unit.');

    foreach (['products/get_measurement_units.php', 'products/get_product_configuration.php'] as $path) {
        $loaded = unitApi('GET', $path, compact('phpSessionId', 'tabToken'));
        unitAssert($loaded['status'] === 200, "{$path} failed.");
        $ids = array_column($loaded['body']['units'] ?? [], 'measurement_unit_id');
        unitAssert(in_array($createdUnitId, $ids, true), "The newly created unit was missing from {$path}.");
    }

    $crossGroupDefinition = $pdo->query("SELECT pts.type_id, ps.specification_id FROM product_type_specifications pts INNER JOIN product_specifications ps ON ps.specification_id = pts.specification_id WHERE ps.field_style = 'Number with Unit' AND ps.measurement_group = 'Volume' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    $weightUnitId = $pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group = 'Weight' AND is_active = 1 LIMIT 1")->fetchColumn();
    if ($crossGroupDefinition && $weightUnitId) {
        require_once __DIR__ . '/../pharma-api/v1/products/product_customization_schema.php';
        $rejected = false;
        try {
            validateAndNormalizeSpecificationValues($pdo, (string) $crossGroupDefinition['type_id'], [[
                'specification_id' => $crossGroupDefinition['specification_id'],
                'value_number' => '1',
                'measurement_unit_id' => $weightUnitId,
            ]]);
        } catch (InvalidArgumentException $error) {
            $rejected = true;
        }
        unitAssert($rejected, 'A unit from the wrong measurement group was accepted.');
    }

    $duplicate = unitApi('POST', 'products/add_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
        'unit_name' => $name . ' Duplicate', 'unit_symbol' => $symbol, 'measurement_group' => 'Weight',
    ]);
    unitAssert($duplicate['status'] === 400, 'A duplicate unit symbol was not rejected.');

    $updatedName = 'Updated ' . $name;
    $updated = unitApi('POST', 'products/add_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
        'measurement_unit_id' => $createdUnitId,
        'unit_name' => $updatedName,
        'unit_symbol' => $symbol,
        'measurement_group' => 'Weight',
    ]);
    unitAssert($updated['status'] === 200, 'Updating a custom unit by measurement_unit_id failed.');
    unitAssert(($updated['body']['unit']['measurement_unit_id'] ?? '') === $createdUnitId, 'Editing created a duplicate measurement-unit row.');
    unitAssert(($updated['body']['unit']['unit_name'] ?? '') === $updatedName, 'The edited unit name was not persisted.');
    unitAssert(($updated['body']['message'] ?? '') === 'Measurement unit updated successfully.', 'The edit API did not report an update.');

    $borrowedValue = $pdo->query("SELECT psv.product_id, psv.specification_id, psv.measurement_unit_id, pts.type_id, psv.value_number FROM product_specification_values psv INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id INNER JOIN product_type_specifications pts ON pts.specification_id = psv.specification_id INNER JOIN product p ON p.product_id = psv.product_id AND p.type_id = pts.type_id WHERE ps.field_style = 'Number with Unit' AND ps.measurement_group = 'Weight' LIMIT 1")->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($borrowedValue) {
        $pdo->prepare('UPDATE product_specification_values SET measurement_unit_id = ? WHERE product_id = ? AND specification_id = ?')
            ->execute([$createdUnitId, $borrowedValue['product_id'], $borrowedValue['specification_id']]);
    } else {
        $legacyReferenceId = newUuid($pdo);
        $pdo->prepare("INSERT INTO entity_dimensions (dimension_id, entity_type, entity_id, dimension_type, numeric_value, unit) VALUES (?, 'CodexMeasurementUnitTest', ?, 'unit_reference', 1, ?)")
            ->execute([$legacyReferenceId, newUuid($pdo), $symbol]);
    }

    $deleteAttempt = unitApi('POST', 'products/delete_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
        'measurement_unit_id' => $createdUnitId,
    ]);
    if ($borrowedValue || $legacyReferenceId !== '') {
        unitAssert($deleteAttempt['status'] === 400, 'A referenced custom unit was incorrectly deleted.');
        unitAssert(($deleteAttempt['body']['success'] ?? true) === false, 'Referenced-unit deletion did not report success=false.');
        unitAssert(($deleteAttempt['body']['code'] ?? '') === 'UNIT_IN_USE', 'Referenced-unit deletion did not return UNIT_IN_USE.');
        unitAssert((string) ($deleteAttempt['body']['message'] ?? '') === 'This measurement unit cannot be deleted because it is currently being used.', 'Referenced-unit deletion did not return the required message.');
        if ($borrowedValue) {
            $pdo->prepare('UPDATE product_specification_values SET measurement_unit_id = ? WHERE product_id = ? AND specification_id = ?')
                ->execute([$borrowedValue['measurement_unit_id'], $borrowedValue['product_id'], $borrowedValue['specification_id']]);
            $borrowedValue = null;
        }
        if ($legacyReferenceId !== '') {
            $pdo->prepare('DELETE FROM entity_dimensions WHERE dimension_id = ?')->execute([$legacyReferenceId]);
            $legacyReferenceId = '';
        }
        $deleteAttempt = unitApi('POST', 'products/delete_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
            'measurement_unit_id' => $createdUnitId,
        ]);
    }
    unitAssert($deleteAttempt['status'] === 200, 'Deleting an unreferenced custom unit failed.');
    unitAssert(($deleteAttempt['body']['success'] ?? false) === true, 'Successful deletion did not report success=true.');
    unitAssert((int) ($deleteAttempt['body']['unit']['is_active'] ?? 1) === 0, 'The custom unit was not archived after deletion.');

    $activeUnits = unitApi('GET', 'products/get_measurement_units.php', compact('phpSessionId', 'tabToken'));
    unitAssert(!in_array($createdUnitId, array_column($activeUnits['body']['units'] ?? [], 'measurement_unit_id'), true), 'A deleted unit remained in the normal unit list.');
    $allUnits = unitApi('GET', 'products/get_measurement_units.php?include_inactive=1', compact('phpSessionId', 'tabToken'));
    unitAssert(in_array($createdUnitId, array_column($allUnits['body']['units'] ?? [], 'measurement_unit_id'), true), 'A deleted unit could not be resolved in audit data.');

    $reactivated = unitApi('POST', 'products/add_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
        'unit_name' => $name, 'unit_symbol' => $symbol, 'measurement_group' => 'Weight',
    ]);
    unitAssert($reactivated['status'] === 200, 'Reactivating an archived custom unit failed.');
    unitAssert(($reactivated['body']['unit']['measurement_unit_id'] ?? '') === $createdUnitId, 'Reactivation created a duplicate unit.');

    if ($existingGram) {
        $systemDelete = unitApi('POST', 'products/delete_measurement_unit.php', compact('phpSessionId', 'tabToken'), ['measurement_unit_id' => $existingGram]);
        unitAssert($systemDelete['status'] === 400, 'A protected system measurement unit could be removed.');
        unitAssert(($systemDelete['body']['code'] ?? '') === 'SYSTEM_UNIT', 'Protected-unit deletion did not return SYSTEM_UNIT.');
        unitAssert(($systemDelete['body']['message'] ?? '') === 'Built-in measurement unit cannot be deleted.', 'Protected-unit deletion did not explain why it is disabled.');
    }

    foreach (['Weight' => 'g', 'Volume' => 'L'] as $group => $expectedSymbol) {
        $statement = $pdo->prepare("SELECT COUNT(*) FROM product_measurement_units WHERE measurement_group = ? AND LOWER(unit_symbol) = LOWER(?) AND is_active = 1");
        $statement->execute([$group, $expectedSymbol]);
        unitAssert((int) $statement->fetchColumn() >= 1, "The expected {$group} unit {$expectedSymbol} is missing.");
    }
    $expectedVolumeSymbols = ['µL', 'mL', 'cL', 'dL', 'L', 'cc', 'fl oz', 'tsp', 'tbsp', 'cup', 'pt', 'qt', 'gal'];
    $volumeSymbols = $pdo->query("SELECT unit_symbol FROM product_measurement_units WHERE measurement_group = 'Volume' AND is_active = 1")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($expectedVolumeSymbols as $expectedSymbol) {
        unitAssert(in_array(strtolower($expectedSymbol), array_map('strtolower', $volumeSymbols), true), "The central Volume catalog is missing {$expectedSymbol}.");
    }
    $microliter = $pdo->query("SELECT unit_name, unit_symbol, measurement_group FROM product_measurement_units WHERE unit_symbol='µL' AND is_active=1 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    unitAssert(($microliter['unit_name'] ?? '') === 'Microliter' && ($microliter['measurement_group'] ?? '') === 'Volume', 'The UTF-8 Microliter master record is not normalized.');

    $volumeSuffix = strtolower(bin2hex(random_bytes(3)));
    $volumeCreated = unitApi('POST', 'products/add_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
        'unit_name' => 'Test Volume Unit ' . strtoupper($volumeSuffix),
        'unit_symbol' => 'tvu' . $volumeSuffix,
        'measurement_group' => 'Volume',
    ]);
    unitAssert($volumeCreated['status'] === 200, 'Creating a custom Volume unit failed.');
    $createdVolumeUnitId = (string) ($volumeCreated['body']['unit']['measurement_unit_id'] ?? '');
    foreach (['products/get_measurement_units.php', 'products/get_product_configuration.php'] as $path) {
        $loaded = unitApi('GET', $path, compact('phpSessionId', 'tabToken'));
        $volumeRows = array_values(array_filter($loaded['body']['units'] ?? [], static fn(array $unit): bool =>
            ($unit['measurement_group'] ?? '') === 'Volume' && (int) ($unit['is_active'] ?? 1) === 1
        ));
        unitAssert(in_array($createdVolumeUnitId, array_column($volumeRows, 'measurement_unit_id'), true), "The custom Volume unit was missing from {$path}.");
    }
    $archivedVolume = unitApi('POST', 'products/delete_measurement_unit.php', compact('phpSessionId', 'tabToken'), ['measurement_unit_id' => $createdVolumeUnitId]);
    unitAssert($archivedVolume['status'] === 200, 'Archiving the custom Volume unit failed.');
    unitAssert(($archivedVolume['body']['message'] ?? '') === 'Measurement unit deleted successfully.', 'Custom Volume deletion did not return the required success message.');
    $activeAfterArchive = unitApi('GET', 'products/get_measurement_units.php', compact('phpSessionId', 'tabToken'));
    unitAssert(!in_array($createdVolumeUnitId, array_column($activeAfterArchive['body']['units'] ?? [], 'measurement_unit_id'), true), 'Archived Volume unit remained available for new selections.');

    foreach (['First', 'Second'] as $position) {
        $bulkCreated = unitApi('POST', 'products/add_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
            'unit_name' => "Bulk {$position} {$suffix}",
            'unit_symbol' => strtolower("b{$position}{$suffix}"),
            'measurement_group' => 'Count',
        ]);
        unitAssert($bulkCreated['status'] === 200, "Creating the {$position} bulk-removal unit failed.");
        $bulkUnitIds[] = (string) ($bulkCreated['body']['unit']['measurement_unit_id'] ?? '');
    }
    $bulkRemoved = unitApi('POST', 'products/delete_measurement_unit.php', compact('phpSessionId', 'tabToken'), [
        'measurement_unit_ids' => $bulkUnitIds,
    ]);
    unitAssert($bulkRemoved['status'] === 200, 'Bulk removal failed.');
    unitAssert(count($bulkRemoved['body']['units'] ?? []) === 2, 'Bulk removal did not return every removed unit.');
    $bulkStatus = $pdo->prepare('SELECT COUNT(*) FROM product_measurement_units WHERE measurement_unit_id IN (?, ?) AND is_active = 0');
    $bulkStatus->execute($bulkUnitIds);
    unitAssert((int) $bulkStatus->fetchColumn() === 2, 'Bulk removal did not archive every selected custom unit.');

    $passed = true;
} finally {
    if ($borrowedValue) {
        $pdo->prepare('UPDATE product_specification_values SET measurement_unit_id = ? WHERE product_id = ? AND specification_id = ?')
            ->execute([$borrowedValue['measurement_unit_id'], $borrowedValue['product_id'], $borrowedValue['specification_id']]);
    }
    if ($legacyReferenceId !== '') {
        $pdo->prepare('DELETE FROM entity_dimensions WHERE dimension_id = ?')->execute([$legacyReferenceId]);
    }
    if ($createdUnitId !== '') {
        $pdo->prepare('DELETE FROM product_measurement_units WHERE measurement_unit_id = ?')->execute([$createdUnitId]);
    }
    if ($createdVolumeUnitId !== '') {
        $pdo->prepare('DELETE FROM product_measurement_units WHERE measurement_unit_id = ?')->execute([$createdVolumeUnitId]);
    }
    if ($bulkUnitIds) {
        $placeholders = implode(',', array_fill(0, count($bulkUnitIds), '?'));
        $pdo->prepare("DELETE FROM product_measurement_units WHERE measurement_unit_id IN ({$placeholders})")->execute($bulkUnitIds);
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id = ?')->execute([$authSessionId]);
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($phpSessionId);
    session_start();
    $_SESSION = [];
    session_destroy();
}

if ($passed) echo 'Measurement unit workflow test passed (measured create request: ' . number_format((float) $measuredSaveSeconds * 1000, 1) . " ms).\n";
