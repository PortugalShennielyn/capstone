<?php

function ensurePasswordResetTokensTable(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS password_reset_tokens (
            reset_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id CHAR(36) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (reset_id),
            UNIQUE KEY uq_password_reset_token_hash (token_hash),
            KEY idx_password_reset_user (user_id),
            KEY idx_password_reset_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
}

function passwordResetAppUrl(): string
{
    return rtrim((string) (getenv('PHARMA_APP_URL') ?: 'http://localhost/PharmacySystem_for_DocR/pharma-frontend'), '/');
}

function passwordResetMailConfig(): array
{
    return [
        'host' => trim((string) getenv('MAIL_HOST')),
        'port' => (int) (getenv('MAIL_PORT') ?: 587),
        'username' => (string) getenv('MAIL_USERNAME'),
        'password' => (string) getenv('MAIL_PASSWORD'),
        'encryption' => strtolower(trim((string) (getenv('MAIL_ENCRYPTION') ?: 'tls'))),
        'from' => trim((string) getenv('PHARMA_MAIL_FROM')),
        'from_name' => trim((string) (getenv('PHARMA_MAIL_FROM_NAME') ?: 'Dr. R Pharmacy')),
    ];
}

function sendPasswordResetEmail(string $email, string $displayName, string $token): array
{
    $config = passwordResetMailConfig();
    if ($config['host'] === '' || $config['username'] === '' || $config['password'] === '' || $config['from'] === '') {
        return ['sent' => false, 'configured' => false, 'error' => 'SMTP reset email configuration is incomplete.'];
    }
    $resetUrl = passwordResetAppUrl() . '/reset_password.html?token=' . rawurlencode($token);
    $subject = 'Dr. R Pharmacy password reset';
    $body = "Hello {$displayName},\n\nA password reset was requested for your Dr. R Pharmacy account.\n\nReset your password here:\n{$resetUrl}\n\nThis link expires in 30 minutes and can be used only once. If you did not request this, you can ignore this email.\n";
    $socket = @fsockopen(($config['encryption'] === 'ssl' ? 'ssl://' : '') . $config['host'], $config['port'], $errorCode, $errorMessage, 10);
    if (!$socket) return ['sent' => false, 'configured' => true, 'error' => "SMTP connection failed ({$errorCode}): {$errorMessage}"];
    stream_set_timeout($socket, 10);
    $read = static function () use ($socket): string { $response = ''; while (($line = fgets($socket, 515)) !== false) { $response .= $line; if (strlen($line) < 4 || $line[3] === ' ') break; } return $response; };
    $send = static function (string $command) use ($socket, $read): string { fwrite($socket, $command . "\r\n"); return $read(); };
    $read();
    $send('EHLO localhost');
    if ($config['encryption'] === 'tls') { $send('STARTTLS'); if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { fclose($socket); return ['sent' => false, 'configured' => true, 'error' => 'SMTP TLS negotiation failed.']; } $send('EHLO localhost'); }
    $auth = $send('AUTH LOGIN');
    if (substr($auth, 0, 3) !== '334') { fclose($socket); return ['sent' => false, 'configured' => true, 'error' => 'SMTP authentication was rejected.']; }
    if (substr($send(base64_encode($config['username'])), 0, 3) !== '334' || substr($send(base64_encode($config['password'])), 0, 3) !== '235') { fclose($socket); return ['sent' => false, 'configured' => true, 'error' => 'SMTP credentials were rejected.']; }
    if (substr($send('MAIL FROM:<' . $config['from'] . '>'), 0, 3) !== '250' || substr($send('RCPT TO:<' . $email . '>'), 0, 3) !== '250') { fclose($socket); return ['sent' => false, 'configured' => true, 'error' => 'SMTP recipient was rejected.']; }
    if (substr($send('DATA'), 0, 3) !== '354') { fclose($socket); return ['sent' => false, 'configured' => true, 'error' => 'SMTP message was rejected.']; }
    $headers = "From: {$config['from_name']} <{$config['from']}>\r\nTo: {$email}\r\nSubject: {$subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    fwrite($socket, $headers . "\r\n" . str_replace(["\r\n", "\r", "\n"], "\r\n", $body) . "\r\n.\r\n");
    $result = $read();
    $send('QUIT'); fclose($socket);
    return ['sent' => substr($result, 0, 3) === '250', 'configured' => true, 'error' => substr($result, 0, 3) === '250' ? '' : 'SMTP server rejected the message.'];
}

function passwordResetHash(string $token): string
{
    return hash('sha256', $token);
}

?>
