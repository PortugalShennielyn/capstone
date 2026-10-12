<?php

function pharmacyMailConfig(): array
{
    $envValues = [];
    $envPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envPath) && is_readable($envPath)) {
        $parsedValues = parse_ini_file($envPath, false, INI_SCANNER_RAW);
        if (is_array($parsedValues)) {
            $envValues = $parsedValues;
        }
    }

    $readValue = static function (string $name, string $fallback = '') use ($envValues): string {
        $environmentValue = getenv($name);
        if ($environmentValue !== false && $environmentValue !== '') {
            return trim((string) $environmentValue);
        }
        return trim((string) ($envValues[$name] ?? $fallback));
    };

    $username = $readValue('PHARMA_MAIL_USERNAME');
    return [
        'host' => $readValue('PHARMA_MAIL_HOST', 'smtp.gmail.com'),
        'port' => (int) $readValue('PHARMA_MAIL_PORT', '587'),
        'username' => $username,
        'password' => $readValue('PHARMA_MAIL_PASSWORD'),
        'encryption' => strtolower($readValue('PHARMA_MAIL_ENCRYPTION', 'tls')),
        'from_email' => $readValue('PHARMA_MAIL_FROM_EMAIL', $username),
        'from_name' => $readValue('PHARMA_MAIL_FROM_NAME', 'Dr. R Pharmacy'),
    ];
}