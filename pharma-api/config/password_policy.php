<?php

function resetPasswordRequirements(string $password): array
{
    if (function_exists('mb_strlen')) {
        $length = mb_strlen($password, 'UTF-8');
    } else {
        $length = preg_match_all('/./us', $password, $characters);
        $length = $length === false ? 0 : $length;
    }

    return [
        'length' => $length >= 12 && $length <= 16,
        'uppercase' => preg_match('/[A-Z]/', $password) === 1,
        'lowercase' => preg_match('/[a-z]/', $password) === 1,
        'number' => preg_match('/[0-9]/', $password) === 1,
        'special' => preg_match('/[^A-Za-z0-9\s]/u', $password) === 1,
    ];
}

function resetPasswordMeetsRequirements(string $password): bool
{
    return !in_array(false, resetPasswordRequirements($password), true);
}
