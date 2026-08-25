<?php
declare(strict_types=1);

function procurementUiAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$html = file_get_contents(__DIR__ . '/../pharma-frontend/admin_settings.html');
procurementUiAssert(is_string($html) && $html !== '', 'Admin Settings HTML could not be read.');

foreach (['Documents &amp; Signatures', 'Receiving &amp; GRN'] as $label) {
    procurementUiAssert(str_contains($html, $label), "Missing Procurement sub-tab: {$label}");
}
foreach (['documents', 'receiving'] as $tab) {
    procurementUiAssert(substr_count($html, 'data-procurement-tab="' . $tab . '"') === 1, "Procurement tab {$tab} must occur once.");
    procurementUiAssert(substr_count($html, 'data-procurement-panel="' . $tab . '"') === 1, "Procurement panel {$tab} must occur once.");
}
procurementUiAssert(!str_contains($html, 'data-procurement-tab="workflow"') && !str_contains($html, 'data-procurement-panel="workflow"'), 'Workflow & Controls must not remain as a Procurement tab or panel.');
procurementUiAssert(str_contains($html, 'activate(sessionStorage.getItem(\'drpProcurementSettingsTab\') || \'documents\')'), 'Documents & Signatures must be the default Procurement tab.');

procurementUiAssert(str_contains($html, '<span>Procurement</span>'), 'Main Purchase Orders tab was not renamed to Procurement.');
procurementUiAssert(str_contains($html, '<span>POS Receipt</span>'), 'Main Receipt tab was not renamed to POS Receipt.');
procurementUiAssert(!str_contains($html, 'Allow PO Edit Before Approval'), 'Outdated PO edit-before-approval wording remains.');
procurementUiAssert(!str_contains($html, 'Allow PO Cancellation Before Approval'), 'Outdated PO cancellation-before-approval wording remains.');
procurementUiAssert(!str_contains($html, 'CEO PR Approval Required'), 'Outdated CEO approval label remains in Procurement settings.');
foreach (['Supervisor PR Approval Required', 'Auto Generate PO Number', 'Allow Editing While Draft', 'Allow Cancellation Before Arrival', 'Default Payment Terms', 'Require Receiving Inspection', 'Require Expiry Date on Receiving', 'Require Batch Number on Receiving', 'Save Workflow Settings'] as $removedLabel) {
    procurementUiAssert(!str_contains($html, $removedLabel), "Fixed system rule remains configurable: {$removedLabel}");
}
procurementUiAssert(!preg_match('/In\s+Transit/i', $html), 'In Transit must not appear in Admin Settings.');

foreach (['prPreparedNameInput','prPreparedRoleInput','prReviewedNameInput','prReviewedRoleInput','poPreparedNameInput','poPreparedRoleInput','poApprovedNameInput','poApprovedRoleInput','grnReceivedByNameInput','grnApprovedByNameInput'] as $id) {
    procurementUiAssert(substr_count($html, 'id="' . $id . '"') === 1, "Expected exactly one {$id} field.");
}
procurementUiAssert(str_contains($html, 'drpAdminSettingsSection') && str_contains($html, 'drpProcurementSettingsTab'), 'Selected Admin and Procurement tabs are not session-persistent.');
foreach (['editProcurementSignatoriesBtn', 'cancelProcurementSignatoriesBtn', 'saveProcurementSignatoriesBtn'] as $buttonId) {
    procurementUiAssert(substr_count($html, 'id="' . $buttonId . '"') === 1, "Expected exactly one {$buttonId} button.");
}
procurementUiAssert(str_contains($html, 'setProcurementDocumentEditMode') && str_contains($html, 'cancelProcurementDocumentEdit'), 'Document View/Edit and Cancel behavior is missing.');
procurementUiAssert(str_contains($html, 'data-procurement-value="prPreparedRole"') && str_contains($html, 'fa-lock'), 'Read-only role summaries must show their protected state.');
procurementUiAssert(str_contains($html, "toastr.success('Document settings saved.')"), 'Document save success feedback is missing.');
procurementUiAssert(str_contains($html, '<h3>POS Receipt Settings</h3>') && str_contains($html, 'Receipt Header') && str_contains($html, 'Receipt Footer'), 'POS Receipt settings were not preserved.');

echo "Admin Settings Procurement UI organization tests passed.\n";
