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
    if (!is_array($payload)) {
        throw new InvalidArgumentException('Invalid JSON payload.');
    }
    ensureProductCustomizationSchema($pdo);
    $typeId = cleanId($payload['type_id'] ?? null);
    $typeCheck = $pdo->prepare('SELECT type_id, category_id FROM product_types WHERE type_id = :type_id');
    $typeCheck->execute([':type_id' => $typeId]);
    $selectedType = $typeCheck->fetch(PDO::FETCH_ASSOC);
    if (!$selectedType) {
        throw new InvalidArgumentException('A valid Product Type is required.');
    }
    $assignments = is_array($payload['assignments'] ?? null) ? $payload['assignments'] : [];
    $newSpecification = is_array($payload['new_specification'] ?? null) ? $payload['new_specification'] : null;
    $specificationEdits = is_array($payload['specification_edits'] ?? null) ? $payload['specification_edits'] : [];
    $pdo->beginTransaction();
    $existingLabelsStatement = $pdo->prepare('SELECT specification_id, display_label FROM product_type_specifications WHERE type_id = :type_id');
    $existingLabelsStatement->execute([':type_id' => $typeId]);
    $assignmentLabels = [];
    foreach ($existingLabelsStatement->fetchAll(PDO::FETCH_ASSOC) as $labelRow) {
        $assignmentLabels[$labelRow['specification_id']] = $labelRow['display_label'];
    }
    $previousAssignmentIds = array_keys($assignmentLabels);
    $createdSpecificationId = null;
    if ($newSpecification) {
        $name = requiredProductField($newSpecification, 'specification_name');
        if (strcasecmp(trim($name), 'Inventory Unit') === 0 || strcasecmp(trim($name), 'Selling / Inventory Unit') === 0) {
            throw new InvalidArgumentException('Selling / Inventory Unit is a permanent SKU field and cannot be added as an optional specification.');
        }
        $style = trim((string) ($newSpecification['field_style'] ?? ''));
        $styles = ['Text Entry', 'Number with Unit', 'Selection List', 'Number Only'];
        if (!in_array($style, $styles, true)) {
            throw new InvalidArgumentException('Select a valid Field Style.');
        }
        $group = trim((string) ($newSpecification['measurement_group'] ?? ''));
        $groups = ['Weight', 'Volume', 'Strength', 'Count', 'Length', 'General Size'];
        if ($style === 'Number with Unit' && !in_array($group, $groups, true)) {
            throw new InvalidArgumentException('Select a valid Measurement Group.');
        }
        if ($style !== 'Number with Unit') {
            $group = null;
        }
        $existing = $pdo->prepare('SELECT specification_id, field_style, measurement_group FROM product_specifications WHERE LOWER(TRIM(specification_name)) = LOWER(TRIM(:name)) LIMIT 1');
        $existing->execute([':name' => $name]);
        $row = $existing->fetch();
        if ($row) {
            if ($row['field_style'] !== $style || (string) $row['measurement_group'] !== (string) $group) {
                throw new InvalidArgumentException('A specification with this name already exists using a different style.');
            }
            $createdSpecificationId = $row['specification_id'];
        } else {
            $createdSpecificationId = newUuid($pdo);
            $insert = $pdo->prepare('INSERT INTO product_specifications (specification_id, specification_name, field_style, measurement_group, allow_custom_value) VALUES (:id, :name, :style, :measurement_group, :allow_custom)');
            $insert->execute([':id' => $createdSpecificationId, ':name' => $name, ':style' => $style, ':measurement_group' => $group, ':allow_custom' => !empty($newSpecification['allow_custom_value']) ? 1 : 0]);
        }
        if ($style === 'Selection List') {
            $choiceInsert = $pdo->prepare('INSERT IGNORE INTO product_specification_choices (choice_id, specification_id, choice_value, sort_order) VALUES (:id, :specification_id, :choice, :sort_order)');
            $choices = normalizeSpecificationChoices($newSpecification['choices'] ?? []);
            foreach ($choices as $index => $choice) {
                $choiceInsert->execute([':id' => newUuid($pdo), ':specification_id' => $createdSpecificationId, ':choice' => $choice, ':sort_order' => $index + 1]);
            }
        }
        $assignments[] = $createdSpecificationId;
    }
    foreach ($specificationEdits as $edit) {
        if (!is_array($edit)) continue;
        $specificationId = cleanId($edit['specification_id'] ?? null);
        $displayName = trim((string) ($edit['display_name'] ?? ''));
        if ($specificationId === '' || $displayName === '') {
            throw new InvalidArgumentException('Specification display name is required.');
        }
        $definitionStatement = $pdo->prepare(
            'SELECT ps.specification_name, ps.field_style, ps.measurement_group, ps.allow_custom_value,
                    (SELECT COUNT(*) FROM product_type_specifications pts WHERE pts.specification_id = ps.specification_id) AS usage_count,
                    (SELECT COUNT(*) FROM product_specification_values psv WHERE psv.specification_id = ps.specification_id) AS value_count
             FROM product_specifications ps WHERE ps.specification_id = :specification_id LIMIT 1 FOR UPDATE'
        );
        $definitionStatement->execute([':specification_id' => $specificationId]);
        $definition = $definitionStatement->fetch(PDO::FETCH_ASSOC);
        if (!$definition) throw new InvalidArgumentException('Specification not found.');

        $usageCount = (int) $definition['usage_count'];
        $valueCount = (int) $definition['value_count'];
        $canEditStructure = $usageCount <= 1 && $valueCount === 0;
        $style = trim((string) ($edit['field_style'] ?? $definition['field_style']));
        $styles = ['Text Entry', 'Number with Unit', 'Selection List', 'Number Only'];
        if (!in_array($style, $styles, true)) throw new InvalidArgumentException('Select a valid Field Style.');
        $group = $style === 'Number with Unit' ? trim((string) ($edit['measurement_group'] ?? $definition['measurement_group'])) : null;
        $groups = ['Weight', 'Volume', 'Strength', 'Count', 'Length', 'General Size'];
        if ($style === 'Number with Unit' && !in_array($group, $groups, true)) throw new InvalidArgumentException('Select a valid Measurement Group.');
        if (!$canEditStructure && ($style !== $definition['field_style'] || (string) $group !== (string) $definition['measurement_group'])) {
            throw new InvalidArgumentException('Field Style and Measurement Group cannot change because this specification is shared or already has saved values.');
        }
        $canEditChoices = $style === 'Selection List' && ($definition['field_style'] === 'Selection List' || $canEditStructure);
        $allowCustom = !empty($edit['allow_custom_value']) ? 1 : 0;
        if (!$canEditStructure && !$canEditChoices) {
            $allowCustom = (int) $definition['allow_custom_value'];
        }

        if ($usageCount <= 1) {
            $duplicateName = $pdo->prepare('SELECT specification_id FROM product_specifications WHERE LOWER(TRIM(specification_name)) = LOWER(TRIM(:name)) AND specification_id <> :specification_id LIMIT 1');
            $duplicateName->execute([':name' => $displayName, ':specification_id' => $specificationId]);
            if ($duplicateName->fetchColumn()) throw new InvalidArgumentException('A specification with this name already exists.');
            $updateDefinition = $pdo->prepare('UPDATE product_specifications SET specification_name = :name, field_style = :field_style, measurement_group = :measurement_group, allow_custom_value = :allow_custom WHERE specification_id = :specification_id');
            $updateDefinition->execute([':name' => $displayName, ':field_style' => $style, ':measurement_group' => $group, ':allow_custom' => $allowCustom, ':specification_id' => $specificationId]);
            $assignmentLabels[$specificationId] = null;
        } else {
            $assignmentLabels[$specificationId] = $displayName === $definition['specification_name'] ? null : $displayName;
        }

        if ($canEditChoices) {
            $pdo->prepare('UPDATE product_specifications SET allow_custom_value = :allow_custom WHERE specification_id = :specification_id')->execute([':allow_custom' => $allowCustom, ':specification_id' => $specificationId]);
            $choices = normalizeSpecificationChoices($edit['choices'] ?? []);
            $usedChoices = $pdo->prepare("SELECT DISTINCT value_text FROM product_specification_values WHERE specification_id = :specification_id AND value_text IS NOT NULL AND TRIM(value_text) <> ''");
            $usedChoices->execute([':specification_id' => $specificationId]);
            $choices = normalizeSpecificationChoices(array_merge($choices, $usedChoices->fetchAll(PDO::FETCH_COLUMN)));
            $pdo->prepare('DELETE FROM product_specification_choices WHERE specification_id = :specification_id')->execute([':specification_id' => $specificationId]);
            $choiceInsert = $pdo->prepare('INSERT INTO product_specification_choices (choice_id, specification_id, choice_value, sort_order) VALUES (:id, :specification_id, :choice, :sort_order)');
            foreach ($choices as $index => $choiceValue) {
                $choiceInsert->execute([':id' => newUuid($pdo), ':specification_id' => $specificationId, ':choice' => $choiceValue, ':sort_order' => $index + 1]);
            }
        } elseif ($canEditStructure) {
            $pdo->prepare('DELETE FROM product_specification_choices WHERE specification_id = :specification_id')->execute([':specification_id' => $specificationId]);
        }
    }
    $assignments = array_values(array_unique(array_filter(array_map('cleanId', $assignments))));
    $valid = $pdo->prepare('SELECT specification_id,specification_name FROM product_specifications WHERE specification_id = :specification_id');
    foreach ($assignments as $specificationId) {
        $valid->execute([':specification_id' => $specificationId]);
        $definition = $valid->fetch(PDO::FETCH_ASSOC);
        if (!$definition) {
            throw new InvalidArgumentException('A selected specification no longer exists.');
        }
        if (strcasecmp(trim((string) $definition['specification_name']), 'Inventory Unit') === 0) {
            throw new InvalidArgumentException('Inventory Unit is a permanent Product SKU field and cannot be assigned as an optional specification.');
        }
    }
    $pdo->prepare('DELETE FROM product_type_specifications WHERE type_id = :type_id')->execute([':type_id' => $typeId]);
    $insertAssignment = $pdo->prepare('INSERT INTO product_type_specifications (type_id, specification_id, display_label, sort_order) VALUES (:type_id, :specification_id, :display_label, :sort_order)');
    foreach ($assignments as $index => $specificationId) {
        $insertAssignment->execute([':type_id' => $typeId, ':specification_id' => $specificationId, ':display_label' => $assignmentLabels[$specificationId] ?? null, ':sort_order' => $index + 1]);
    }
    $categoryDefaultIds = !empty($payload['category_default_assignments'])
        ? array_values(array_diff($assignments, $previousAssignmentIds))
        : [];
    if ($categoryDefaultIds) {
        $categoryTypes = $pdo->prepare('SELECT type_id FROM product_types WHERE category_id = :category_id AND type_id <> :type_id');
        $categoryTypes->execute([':category_id' => $selectedType['category_id'], ':type_id' => $typeId]);
        $nextOrder = $pdo->prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM product_type_specifications WHERE type_id = :type_id');
        $insertCategoryDefault = $pdo->prepare('INSERT IGNORE INTO product_type_specifications (type_id, specification_id, display_label, sort_order) VALUES (:type_id, :specification_id, NULL, :sort_order)');
        foreach ($categoryTypes->fetchAll(PDO::FETCH_COLUMN) as $categoryTypeId) {
            foreach ($categoryDefaultIds as $specificationId) {
                $nextOrder->execute([':type_id' => $categoryTypeId]);
                $insertCategoryDefault->execute([':type_id' => $categoryTypeId, ':specification_id' => $specificationId, ':sort_order' => (int) $nextOrder->fetchColumn()]);
            }
        }
    }
    $pdo->commit();
    echo json_encode(['status' => 'success', 'message' => 'Product Type specifications saved.', 'specifications' => getTypeSpecificationConfiguration($pdo, $typeId), 'created_specification_id' => $createdSpecificationId]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to save Product Type specifications.', 'error' => $error->getMessage()]);
}
?>
