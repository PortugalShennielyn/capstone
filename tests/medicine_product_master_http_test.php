<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_customization_schema.php';

function medicineAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function medicineRequest(string $path, string $method, array $payload, string $sessionId, string $tabToken): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/products/' . $path);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json', 'X-Tab-Token: ' . $tabToken],
        CURLOPT_TIMEOUT => 30,
    ];
    if ($method === 'POST') {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    curl_setopt_array($curl, $options);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    medicineAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: ['raw' => (string) $body]];
}

ensureProductCustomizationSchema($pdo);
$user = $pdo->query("SELECT user_id, username, full_name, role, status FROM users WHERE role='admin' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
medicineAssert((bool) $user, 'An active admin account is required.');
$medicine = $pdo->query("SELECT category_id FROM product_categories WHERE category_name='Medicine' LIMIT 1")->fetchColumn();
$types = $pdo->query("SELECT type_name,type_id FROM product_types WHERE category_id=" . $pdo->quote($medicine) . " AND type_name IN ('Capsule','Tablet','Syrup','Powder for Suspension','Drops','Cream','Injection','Inhaler')")->fetchAll(PDO::FETCH_KEY_PAIR);
$strengthSpec = $pdo->query("SELECT specification_id FROM product_specifications WHERE specification_name='Strength' LIMIT 1")->fetchColumn();
$strengthDenominatorSpec = $pdo->query("SELECT specification_id FROM product_specifications WHERE specification_name='Strength Denominator' LIMIT 1")->fetchColumn();
$volumeSpec = $pdo->query("SELECT specification_id FROM product_specifications WHERE specification_name='Volume' LIMIT 1")->fetchColumn();
$packageSpec = $pdo->query("SELECT specification_id FROM product_specifications WHERE specification_name='Package Type' LIMIT 1")->fetchColumn();
$mgUnit = $pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group='Weight' AND LOWER(unit_symbol)='mg' AND is_active=1 LIMIT 1")->fetchColumn();
$mlUnit = $pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group='Volume' AND LOWER(unit_symbol)='ml' AND is_active=1 LIMIT 1")->fetchColumn();
$units = $pdo->query("SELECT LOWER(unit_name),measurement_unit_id FROM product_measurement_units WHERE measurement_group='Count' AND is_active=1")->fetchAll(PDO::FETCH_KEY_PAIR);
medicineAssert($medicine && isset($types['Capsule'], $types['Tablet'], $types['Syrup']) && $strengthSpec && $strengthDenominatorSpec && $volumeSpec && $packageSpec && $mgUnit && $mlUnit, 'Required normalized Medicine configuration is unavailable.');
foreach (['Capsule','Tablet','Syrup','Powder for Suspension','Drops','Cream','Injection','Inhaler'] as $configuredDosageForm) {
    medicineAssert(isset($types[$configuredDosageForm]), "{$configuredDosageForm} is missing from the Medicine dosage-form master.");
    $configuredNames = array_column(getTypeSpecificationConfiguration($pdo, $types[$configuredDosageForm]), 'specification_name');
    medicineAssert(in_array('Strength', $configuredNames, true), "{$configuredDosageForm} is missing its configured Strength field.");
}

if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
$sessionId = 'codexmedicine' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));
$authSessionId = newUuid($pdo);
session_id($sessionId);
session_start();
$_SESSION = [
    'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
    'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-admin'],
    'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
    'tab_token_hash' => hash('sha256', $tabToken),
];
session_write_close();
$pdo->prepare("INSERT INTO auth_sessions (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent) VALUES (:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex medicine Product Master test')")
    ->execute([':id' => $authSessionId, ':php' => $sessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

$created = [];
$suffix = strtoupper(bin2hex(random_bytes(3)));
$build = static function (string $typeId, string $unitId, string $brand, string $product, string $generic, string $classification, string $strength) use ($medicine, $strengthSpec, $packageSpec, $mgUnit): array {
    return [
        'category_id' => $medicine,
        'type_id' => $typeId,
        'brand_name' => $brand,
        'product_name' => $product,
        'generic_name' => $generic,
        'medicine_classification' => $classification,
        'status' => 'Active',
        'pricing_method' => 'manual',
        'variations' => [[
            'price' => '12.50',
            'inventory_unit_id' => $unitId,
            'specifications' => [[
                'specification_id' => $strengthSpec,
                'value_number' => $strength,
                'value_text' => null,
                'measurement_unit_id' => $mgUnit,
            ], [
                'specification_id' => $packageSpec,
                'value_number' => null,
                'value_text' => 'Box',
                'measurement_unit_id' => null,
            ]],
        ]],
    ];
};

try {
    $configuration = medicineRequest('get_product_configuration.php?type_id=' . rawurlencode($types['Capsule']), 'GET', [], $sessionId, $tabToken);
    $configurationNames = array_column($configuration['body']['specifications'] ?? [], 'specification_name');
    medicineAssert(in_array('Strength', $configurationNames, true) && in_array('Package Type', $configurationNames, true), 'Medicine SKU configuration is missing Strength or Package / Container.');

    $missingGeneric = $build($types['Capsule'], $units['capsule'], "Validation RX {$suffix}", "Validation RX {$suffix}", '', 'Prescription (Rx)', '500');
    $rejected = medicineRequest('add_product.php', 'POST', $missingGeneric, $sessionId, $tabToken);
    medicineAssert($rejected['status'] === 400, 'Medicine without a real generic name was not rejected.');
    $missingClassification = $build($types['Capsule'], $units['capsule'], "Validation RX {$suffix}", "Validation RX {$suffix}", 'Amoxicillin', '', '500');
    $rejected = medicineRequest('add_product.php', 'POST', $missingClassification, $sessionId, $tabToken);
    medicineAssert($rejected['status'] === 400, 'Medicine without a dispensing classification was not rejected.');
    foreach (['OTC', 'Rx', 'Prescription (Rx)'] as $invalidGenericName) {
        $invalidGeneric = $build($types['Capsule'], $units['capsule'], "Validation Generic {$suffix}", '', $invalidGenericName, 'OTC', '500');
        $rejected = medicineRequest('add_product.php', 'POST', $invalidGeneric, $sessionId, $tabToken);
        medicineAssert($rejected['status'] === 400, "{$invalidGenericName} was incorrectly accepted as a Medicine generic name.");
    }

    $rxPayload = $build($types['Capsule'], $units['capsule'], '', '', 'Amoxicillin', 'Prescription (Rx)', '500');
    $otcPayload = $build($types['Tablet'], $units['tablet'], "Validation OTC {$suffix}", "Bisacodyl Validation {$suffix}", 'Bisacodyl', 'OTC', '5');
    foreach ([$rxPayload, $otcPayload] as $payload) {
        $response = medicineRequest('add_product.php', 'POST', $payload, $sessionId, $tabToken);
        $created[] = (string) ($response['body']['product_id'] ?? $response['body']['product_ids'][0] ?? '');
        medicineAssert(in_array($response['status'], [200, 201], true) && ($response['body']['status'] ?? '') === 'success', 'Medicine creation failed: ' . json_encode($response));
    }
    medicineAssert(count(array_filter($created)) === 2, 'Both test products were not created.');

    $detail = $pdo->prepare("SELECT p.product_id,md.generic_name,psv.value_text AS classification FROM product p JOIN medicine_details md ON md.product_id=p.product_id JOIN product_specification_values psv ON psv.product_id=p.product_id JOIN product_specifications ps ON ps.specification_id=psv.specification_id AND ps.specification_name='Medicine Classification' WHERE p.product_id IN (?,?) ORDER BY md.generic_name");
    $detail->execute($created);
    $stored = $detail->fetchAll(PDO::FETCH_ASSOC);
    medicineAssert(count($stored) === 2, 'Medicine details or classification values were not stored.');
    medicineAssert($stored[0]['generic_name'] === 'Amoxicillin' && $stored[0]['classification'] === 'Prescription (Rx)', 'RX medicine identity was stored incorrectly.');
    medicineAssert($stored[1]['generic_name'] === 'Bisacodyl' && $stored[1]['classification'] === 'OTC', 'OTC generic name or classification was stored incorrectly.');

    $list = medicineRequest('get_products.php?t=' . time(), 'GET', [], $sessionId, $tabToken);
    medicineAssert($list['status'] === 200, 'Product reload failed.');
    $listed = array_values(array_filter($list['body']['data'] ?? [], static fn(array $row): bool => in_array((string) ($row['product_id'] ?? ''), $created, true)));
    medicineAssert(count($listed) === 2, 'Created medicines were not returned after reload.');
    medicineAssert(count(array_filter($listed, static fn(array $row): bool => stripos((string) ($row['generic_name'] ?? ''), 'amoxicillin') !== false)) === 1, 'Generic-name search data was not returned.');
    medicineAssert(count(array_filter($listed, static fn(array $row): bool => ($row['medicine_classification'] ?? '') === 'Prescription (Rx)')) === 1, 'RX filter data was not returned.');
    medicineAssert(count(array_filter($listed, static fn(array $row): bool => ($row['medicine_classification'] ?? '') === 'OTC')) === 1, 'OTC filter data was not returned.');
    $listedRx = array_values(array_filter($listed, static fn(array $row): bool => ($row['medicine_classification'] ?? '') === 'Prescription (Rx)'))[0];
    $listedOtc = array_values(array_filter($listed, static fn(array $row): bool => ($row['medicine_classification'] ?? '') === 'OTC'))[0];
    medicineAssert(($listedRx['medicine_classification_badge'] ?? null) === 'Rx', 'Prescription medicine did not receive the Rx presentation marker.');
    medicineAssert(($listedOtc['medicine_classification_badge'] ?? null) === null, 'OTC medicine incorrectly received a catalog badge marker.');
    medicineAssert(($listedRx['product_name'] ?? '') === ($listedRx['generic_name'] ?? ''), 'The hidden compatibility Product Name was not derived safely for Medicine.');
    medicineAssert(($listedRx['brand_name'] ?? null) === '', 'An unbranded Medicine was not preserved with an empty trade name.');

    foreach ($listed as $row) {
        $spec = $pdo->prepare('SELECT specification_id,value_text,value_number,measurement_unit_id FROM product_specification_values WHERE product_id=:id');
        $spec->execute([':id' => $row['product_id']]);
        $payload = [
            'product_id' => $row['product_id'], 'category_id' => $medicine, 'type_id' => $row['type_id'],
            'brand_name' => $row['brand_name'], 'product_name' => 'Ignored duplicate Medicine name',
            'generic_name' => $row['generic_name'] . ' Updated', 'medicine_classification' => $row['medicine_classification'],
            'status' => 'Active', 'pricing_method' => 'manual', 'manual_selling_price' => $row['price'],
            'variations' => [[
                'price' => $row['price'], 'barcode' => $row['barcode'], 'inventory_unit_id' => $row['inventory_unit_id'],
                'specifications' => $spec->fetchAll(PDO::FETCH_ASSOC),
            ]],
        ];
        $updated = medicineRequest('update_product.php', 'POST', $payload, $sessionId, $tabToken);
        medicineAssert($updated['status'] === 200 && ($updated['body']['status'] ?? '') === 'success', 'Medicine update failed: ' . json_encode($updated));
    }

    $reload = medicineRequest('get_products.php?t=' . (time() + 1), 'GET', [], $sessionId, $tabToken);
    $reloaded = array_values(array_filter($reload['body']['data'] ?? [], static fn(array $row): bool => in_array((string) ($row['product_id'] ?? ''), $created, true)));
    medicineAssert(count($reloaded) === 2 && count(array_filter($reloaded, static fn(array $row): bool => str_ends_with((string) $row['generic_name'], ' Updated'))) === 2, 'Edited Medicine Generic Names did not persist after reload.');
    medicineAssert(count(array_filter($reloaded, static fn(array $row): bool => ($row['product_name'] ?? '') === 'Ignored duplicate Medicine name')) === 0, 'Medicine editing trusted the redundant Product Name payload.');

    $concentrationPayload = $build($types['Syrup'], $units['bottle'], "Moxylor {$suffix}", "Moxylor Suspension {$suffix}", 'Amoxicillin', 'Prescription (Rx)', '250');
    $concentrationPayload['variations'][0]['specifications'][] = [
        'specification_id' => $strengthDenominatorSpec,
        'value_number' => '5',
        'value_text' => null,
        'measurement_unit_id' => $mlUnit,
    ];
    $concentrationPayload['variations'][0]['specifications'][] = [
        'specification_id' => $volumeSpec,
        'value_number' => '60',
        'value_text' => null,
        'measurement_unit_id' => $mlUnit,
    ];
    $concentrationPayload['variations'][0]['specifications'][1]['value_text'] = 'Bottle';
    $concentration = medicineRequest('add_product.php', 'POST', $concentrationPayload, $sessionId, $tabToken);
    $concentrationId = (string) ($concentration['body']['product_id'] ?? $concentration['body']['product_ids'][0] ?? '');
    $created[] = $concentrationId;
    medicineAssert(in_array($concentration['status'], [200, 201], true) && $concentrationId !== '', 'Concentration Medicine creation failed: ' . json_encode($concentration));
    $storedConcentration = $pdo->prepare("SELECT md.strength,md.net_content_value,md.net_content_unit,psv.value_number,pmu.unit_symbol FROM medicine_details md JOIN product_specification_values psv ON psv.product_id=md.product_id JOIN product_specifications ps ON ps.specification_id=psv.specification_id AND ps.specification_name='Strength Denominator' JOIN product_measurement_units pmu ON pmu.measurement_unit_id=psv.measurement_unit_id WHERE md.product_id=?");
    $storedConcentration->execute([$concentrationId]);
    $concentrationRow = $storedConcentration->fetch(PDO::FETCH_ASSOC);
    medicineAssert($concentrationRow && $concentrationRow['strength'] === '250 mg / 5 mL', 'Formatted concentration was not preserved for downstream displays.');
    medicineAssert((float) $concentrationRow['value_number'] === 5.0 && $concentrationRow['unit_symbol'] === 'mL', 'Concentration denominator was not stored as normalized numeric and unit components.');
    medicineAssert((float) $concentrationRow['net_content_value'] === 60.0 && $concentrationRow['net_content_unit'] === 'mL', 'Net Content was not kept separate from Strength.');

    $multiSku = $build($types['Capsule'], $units['capsule'], "Multi SKU {$suffix}", '', 'Test Ingredient', 'OTC', '125');
    $secondSku = $concentrationPayload['variations'][0];
    $secondSku['type_id'] = $types['Syrup'];
    $secondSku['barcode'] = '';
    $secondSku['medicine_classification'] = 'Prescription (Rx)';
    $multiSku['variations'][0]['type_id'] = $types['Capsule'];
    $multiSku['variations'][0]['medicine_classification'] = 'OTC';
    $multiSku['variations'][] = $secondSku;
    $multiResponse = medicineRequest('add_product.php', 'POST', $multiSku, $sessionId, $tabToken);
    $multiIds = array_values(array_filter($multiResponse['body']['product_ids'] ?? []));
    array_push($created, ...$multiIds);
    medicineAssert($multiResponse['status'] === 201 && count($multiIds) === 2, 'A multi-dosage-form Medicine submission did not create two independent SKUs: ' . json_encode($multiResponse));
    $multiTypes = $pdo->prepare('SELECT type_id FROM product WHERE product_id IN (?,?) ORDER BY type_id');
    $multiTypes->execute($multiIds);
    $storedMultiTypes = $multiTypes->fetchAll(PDO::FETCH_COLUMN);
    $expectedMultiTypes = [$types['Capsule'], $types['Syrup']];
    sort($storedMultiTypes);
    sort($expectedMultiTypes);
    medicineAssert($storedMultiTypes === $expectedMultiTypes, 'Each created SKU did not preserve its own dosage-form type.');
    $view = medicineRequest('get_product_details.php?product_id=' . rawurlencode($concentrationId), 'GET', [], $sessionId, $tabToken);
    $viewProduct = $view['body']['data']['product'] ?? [];
    medicineAssert($view['status'] === 200, 'Medicine View Product API failed.');
    medicineAssert(($viewProduct['generic_name'] ?? '') === 'Amoxicillin', 'View Product did not retrieve Generic Name from medicine_details.');
    medicineAssert(($viewProduct['medicine_classification'] ?? '') === 'Prescription (Rx)', 'View Product did not retrieve the saved Medicine Classification.');
    medicineAssert(($viewProduct['strength'] ?? '') === '250 mg / 5 mL', 'View Product did not return Strength / Concentration.');
    medicineAssert(($viewProduct['dosage_form'] ?? '') === 'Syrup', 'View Product did not return the configured Dosage Form.');
    medicineAssert((float) ($viewProduct['net_content_value'] ?? 0) === 60.0 && ($viewProduct['net_content_unit'] ?? '') === 'mL', 'View Product did not return Net Content.');

    $compoundUnit = medicineRequest('add_measurement_unit.php', 'POST', [
        'unit_name' => '250 mg / 5 mL', 'unit_symbol' => '250 mg / 5 mL', 'measurement_group' => 'Strength'
    ], $sessionId, $tabToken);
    medicineAssert($compoundUnit['status'] === 400, 'A compound concentration was incorrectly accepted as one measurement unit.');
    echo "medicine Product Master HTTP workflow test passed\n";
} finally {
    foreach ($created as $productId) {
        foreach (['product_selling_stock', 'product_selling_options', 'product_specification_values', 'medicine_details'] as $table) {
            $statement = $pdo->prepare("DELETE FROM {$table} WHERE product_id=:id");
            $statement->execute([':id' => $productId]);
        }
        $pdo->prepare('DELETE FROM product WHERE product_id=:id')->execute([':id' => $productId]);
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
}
