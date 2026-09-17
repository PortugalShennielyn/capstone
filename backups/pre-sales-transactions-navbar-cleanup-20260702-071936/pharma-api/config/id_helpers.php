<?php

function cleanId($value): string
{
    return trim((string) ($value ?? ''));
}

function nullableId($value): ?string
{
    $id = cleanId($value);
    return $id === '' ? null : $id;
}

function idIsMissing($value): bool
{
    return cleanId($value) === '';
}

function newUuid(PDO $pdo): string
{
    return (string) $pdo->query('SELECT UUID()')->fetchColumn();
}

?>
