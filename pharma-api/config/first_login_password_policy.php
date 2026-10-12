<?php

function firstLoginPasswordRules(string $password): array
{
    $length = function_exists('mb_strlen')
        ? mb_strlen($password, 'UTF-8')
        : preg_match_all('/./us', $password, $characters);
    $length = $length === false ? 0 : $length;

    return [
        'length' => $length >= 12 && $length <= 16,
        'uppercase' => preg_match('/[A-Z]/', $password) === 1,
        'lowercase' => preg_match('/[a-z]/', $password) === 1,
        'number' => preg_match('/[0-9]/', $password) === 1,
        'special' => preg_match('/[^A-Za-z0-9\s]/u', $password) === 1,
    ];
}

function firstLoginPasswordMeetsRequirements(string $password): bool
{
    return !in_array(false, firstLoginPasswordRules($password), true);
}
