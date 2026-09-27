<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['cashier', 'ro-cashier', 'ro_cashier'];
require_once '../../config/require_auth.php';
require_once '../../config/mail.php';

function cashierOtpRespond(string $status, string $message, array $data = [], int $httpStatus = 200): void
{
    http_response_code($httpStatus);
    echo json_encode(['status' => $status, 'message' => $message, 'data' => $data]);
    exit();
}

function ensureCashierOtpSchema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS cashier_password_reset_otps (
            otp_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id CHAR(36) NOT NULL,
            otp_hash VARCHAR(255) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            verified_at DATETIME NULL,
            used_at DATETIME NULL,
            attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (otp_id),
            KEY idx_cashier_password_otp_user_created (user_id, created_at),
            KEY idx_cashier_password_otp_expiry (expires_at, used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function maskedOtpEmail(string $email): string
{
    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    if ($local === '' || $domain === '') return '';
    $visible = mb_substr($local, 0, 1, 'UTF-8');
    return $visible . str_repeat('*', max(2, mb_strlen($local, 'UTF-8') - 1)) . '@' . $domain;
}

function sendCashierResetOtp(string $email, string $otp): void
{
    $config = pharmacyMailConfig();
    $missing = array_filter([
        'PHARMA_MAIL_USERNAME' => $config['username'],
        'PHARMA_MAIL_PASSWORD' => $config['password'],
    ], static fn(string $value): bool => $value === '' || str_starts_with(strtolower($value), 'your-'));
    if ($missing) {
        throw new RuntimeException('Unable to send OTP. Add PHARMA_MAIL_USERNAME and PHARMA_MAIL_PASSWORD to pharma-api/.env. Use a Gmail App Password, not your regular Gmail password.');
    }
    if (!filter_var($config['from_email'], FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Unable to send OTP. PHARMA_MAIL_FROM_EMAIL must be a valid email address.');
    }
    if (!in_array($config['encryption'], ['tls', 'ssl'], true)) {
        throw new RuntimeException('Unable to send OTP. PHARMA_MAIL_ENCRYPTION must be tls or ssl.');
    }

    $vendor = dirname(__DIR__, 2) . '/vendor/phpmailer/phpmailer/src/';
    require_once $vendor . 'Exception.php';
    require_once $vendor . 'SMTP.php';
    require_once $vendor . 'PHPMailer.php';

    $mailer = new PHPMailer\PHPMailer\PHPMailer(true);
    $mailer->isSMTP();
    $mailer->Host = $config['host'];
    $mailer->Port = $config['port'];
    $mailer->SMTPAuth = true;
    $mailer->Username = $config['username'];
    $mailer->Password = str_replace(' ', '', $config['password']);
    $mailer->SMTPSecure = $config['encryption'] === 'ssl'
        ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    $mailer->Timeout = 15;
    $mailer->CharSet = PHPMailer\PHPMailer\PHPMailer::CHARSET_UTF8;
    $mailer->setFrom($config['from_email'], $config['from_name']);
    $mailer->addAddress($email);
    $mailer->Subject = 'Cashier Password Reset OTP';
    $mailer->Body = "Your password reset OTP is: {$otp}\n\nThis OTP will expire in 5 minutes.\n\nIf you did not request a password reset, ignore this email.";
    $mailer->AltBody = $mailer->Body;

    try {
        $mailer->send();
    } catch (Throwable $error) {
        $detail = trim($mailer->ErrorInfo) ?: $error->getMessage();
        if ($config['password'] !== '') $detail = str_replace($config['password'], '[redacted]', $detail);
        if ($config['username'] !== '') $detail = str_replace($config['username'], '[mail account]', $detail);
        throw new RuntimeException('Unable to send OTP: ' . $detail, 0, $error);
    }
}

function currentCashier(PDO $pdo): array
{
    $stmt = $pdo->prepare(
        "SELECT user_id, username, email, password, password_hash
         FROM users
         WHERE user_id = :user_id
           AND role = 'cashier'
           AND status = 'Active'
           AND COALESCE(is_archived, 0) = 0
           AND COALESCE(is_deleted, 0) = 0
         LIMIT 1"
    );
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        cashierOtpRespond('error', 'The signed-in cashier account is unavailable. Please sign in again.', [], 403);
    }
    return $user;
}

function activeCashierOtp(PDO $pdo, string $userId, bool $lock = false): ?array
{
    $stmt = $pdo->prepare(
        'SELECT otp_id, otp_hash, expires_at, expires_at <= NOW() AS is_expired, verified_at, used_at, attempts
         FROM cashier_password_reset_otps
         WHERE user_id = :user_id AND used_at IS NULL
         ORDER BY otp_id DESC
         LIMIT 1' . ($lock ? ' FOR UPDATE' : '')
    );
    $stmt->execute([':user_id' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        cashierOtpRespond('error', 'Only POST requests are allowed.', [], 405);
    }
    $payload = json_decode(file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        cashierOtpRespond('error', 'Invalid OTP request payload.', [], 400);
    }

    $action = strtolower(trim((string) ($payload['action'] ?? '')));
    if (!in_array($action, ['request', 'verify', 'reset'], true)) {
        cashierOtpRespond('error', 'Unsupported OTP action.', [], 422);
    }

    ensureCashierOtpSchema($pdo);
    $user = currentCashier($pdo);
    $userId = (string) $user['user_id'];

    if ($action === 'request') {
        $identifier = trim((string) ($payload['identifier'] ?? ''));
        if ($identifier === '') {
            cashierOtpRespond('error', 'Enter your cashier username or registered email.', [], 422);
        }
        $matchesUsername = strcasecmp($identifier, (string) ($user['username'] ?? '')) === 0;
        $matchesEmail = strcasecmp($identifier, (string) ($user['email'] ?? '')) === 0;
        if (!$matchesUsername && !$matchesEmail) {
            cashierOtpRespond('error', 'Username or email does not match the signed-in cashier account.', [], 422);
        }

        $email = trim((string) ($user['email'] ?? ''));
        if ($email === '') {
            cashierOtpRespond('error', 'No email address is registered for this cashier account.', [], 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            cashierOtpRespond('error', 'The registered email address is invalid. Ask an administrator to update your account.', [], 422);
        }

        $recentStmt = $pdo->prepare(
            'SELECT COUNT(*) FROM cashier_password_reset_otps
             WHERE user_id = :user_id AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)'
        );
        $recentStmt->execute([':user_id' => $userId]);
        if ((int) $recentStmt->fetchColumn() >= 3) {
            cashierOtpRespond('error', 'Too many OTP requests. Please try again in 15 minutes.', [], 429);
        }

        $cooldownStmt = $pdo->prepare(
            'SELECT COUNT(*) FROM cashier_password_reset_otps
             WHERE user_id = :user_id AND created_at >= DATE_SUB(NOW(), INTERVAL 30 SECOND)'
        );
        $cooldownStmt->execute([':user_id' => $userId]);
        if ((int) $cooldownStmt->fetchColumn() > 0) {
            cashierOtpRespond('error', 'Please wait 30 seconds before requesting another OTP.', [], 429);
        }

        $invalidateStmt = $pdo->prepare(
            'UPDATE cashier_password_reset_otps SET used_at = NOW()
             WHERE user_id = :user_id AND used_at IS NULL'
        );
        $invalidateStmt->execute([':user_id' => $userId]);

        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $insertStmt = $pdo->prepare(
            'INSERT INTO cashier_password_reset_otps (user_id, otp_hash, expires_at)
             VALUES (:user_id, :otp_hash, DATE_ADD(NOW(), INTERVAL 5 MINUTE))'
        );
        $insertStmt->execute([
            ':user_id' => $userId,
            ':otp_hash' => password_hash($otp, PASSWORD_DEFAULT),
        ]);
        $otpId = (int) $pdo->lastInsertId();

        try {
            sendCashierResetOtp($email, $otp);
        } catch (Throwable $error) {
            $invalidateStmt = $pdo->prepare('UPDATE cashier_password_reset_otps SET used_at = NOW() WHERE otp_id = :otp_id');
            $invalidateStmt->execute([':otp_id' => $otpId]);
            error_log('[CASHIER OTP] Mail delivery failed: ' . $error->getMessage());
            cashierOtpRespond('error', $error->getMessage(), [], 503);
        }

        cashierOtpRespond('success', 'OTP sent to your registered email.', [
            'masked_email' => maskedOtpEmail($email),
            'expires_in_seconds' => 300,
        ]);
    }

    if ($action === 'verify') {
        $otp = trim((string) ($payload['otp'] ?? ''));
        if (!preg_match('/^\d{6}$/', $otp)) {
            cashierOtpRespond('error', 'Enter the 6-digit OTP sent to your registered email.', [], 422);
        }
        $pdo->beginTransaction();
        $record = activeCashierOtp($pdo, $userId, true);
        if (!$record) {
            $pdo->rollBack();
            cashierOtpRespond('error', 'No active OTP was found. Please request a new OTP.', [], 422);
        }
        if ((int) $record['is_expired'] === 1) {
            $expireStmt = $pdo->prepare('UPDATE cashier_password_reset_otps SET used_at = NOW() WHERE otp_id = :otp_id');
            $expireStmt->execute([':otp_id' => $record['otp_id']]);
            $pdo->commit();
            cashierOtpRespond('error', 'OTP has expired. Please request a new OTP.', [], 422);
        }
        if ((int) $record['attempts'] >= 5) {
            $pdo->commit();
            cashierOtpRespond('error', 'Too many incorrect OTP attempts. Please request a new OTP.', [], 429);
        }
        if (!password_verify($otp, (string) $record['otp_hash'])) {
            $attemptStmt = $pdo->prepare('UPDATE cashier_password_reset_otps SET attempts = attempts + 1 WHERE otp_id = :otp_id');
            $attemptStmt->execute([':otp_id' => $record['otp_id']]);
            $pdo->commit();
            cashierOtpRespond('error', 'Invalid OTP. Please try again.', [], 422);
        }
        $verifyStmt = $pdo->prepare('UPDATE cashier_password_reset_otps SET verified_at = COALESCE(verified_at, NOW()) WHERE otp_id = :otp_id');
        $verifyStmt->execute([':otp_id' => $record['otp_id']]);
        $pdo->commit();
        cashierOtpRespond('success', 'OTP verified. Create your new password.');
    }

    $newPassword = (string) ($payload['new_password'] ?? '');
    $confirmPassword = (string) ($payload['confirm_password'] ?? '');
    if ($newPassword === '' || $confirmPassword === '') {
        cashierOtpRespond('error', 'New password and confirmation are required.', [], 422);
    }
    if ($newPassword !== $confirmPassword) {
        cashierOtpRespond('error', 'New passwords do not match.', [], 422);
    }
    if (strlen($newPassword) < 8 || strlen($newPassword) > 72) {
        cashierOtpRespond('error', 'New password must be between 8 and 72 characters.', [], 422);
    }

    $pdo->beginTransaction();
    $record = activeCashierOtp($pdo, $userId, true);
    if (!$record || empty($record['verified_at'])) {
        $pdo->rollBack();
        cashierOtpRespond('error', 'Verify a valid OTP before resetting your password.', [], 422);
    }
    if ((int) $record['is_expired'] === 1) {
        $expireStmt = $pdo->prepare('UPDATE cashier_password_reset_otps SET used_at = NOW() WHERE otp_id = :otp_id');
        $expireStmt->execute([':otp_id' => $record['otp_id']]);
        $pdo->commit();
        cashierOtpRespond('error', 'OTP has expired. Please request a new OTP.', [], 422);
    }

    $passwordStmt = $pdo->prepare(
        'SELECT password, password_hash FROM users WHERE user_id = :user_id AND role = "cashier" FOR UPDATE'
    );
    $passwordStmt->execute([':user_id' => $userId]);
    $passwordRecord = $passwordStmt->fetch(PDO::FETCH_ASSOC);
    if (!$passwordRecord) {
        throw new RuntimeException('The signed-in cashier account is unavailable. Please sign in again.');
    }
    $currentHash = (string) ($passwordRecord['password_hash'] ?: $passwordRecord['password']);
    if ($currentHash !== '' && password_verify($newPassword, $currentHash)) {
        $pdo->rollBack();
        cashierOtpRespond('error', 'New password must be different from the current password.', [], 422);
    }

    $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
    $updateStmt = $pdo->prepare(
        'UPDATE users
         SET password = :password, password_hash = :password_hash, updated_at = NOW()
         WHERE user_id = :user_id AND role = "cashier"'
    );
    $updateStmt->execute([
        ':password' => $newHash,
        ':password_hash' => $newHash,
        ':user_id' => $userId,
    ]);
    if ($updateStmt->rowCount() !== 1) {
        throw new RuntimeException('The cashier password could not be updated.');
    }

    $usedStmt = $pdo->prepare('UPDATE cashier_password_reset_otps SET used_at = NOW() WHERE otp_id = :otp_id AND used_at IS NULL');
    $usedStmt->execute([':otp_id' => $record['otp_id']]);
    if ($usedStmt->rowCount() !== 1) {
        throw new RuntimeException('This OTP has already been used. Request a new OTP.');
    }

    if (tableExists($pdo, 'auth_sessions') && !empty($_SESSION['auth_session_id'])) {
        $sessionStmt = $pdo->prepare(
            'UPDATE auth_sessions
             SET is_revoked = 1, revoked_at = NOW(), revoked_reason = "password_change",
                 is_active = 0, updated_at = NOW()
             WHERE user_id = :user_id
               AND auth_session_id <> :auth_session_id
               AND is_revoked = 0'
        );
        $sessionStmt->execute([
            ':user_id' => $userId,
            ':auth_session_id' => $_SESSION['auth_session_id'],
        ]);
    }

    $pdo->commit();
    cashierOtpRespond('success', 'Password reset successfully. Other active sessions were revoked.');
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[CASHIER OTP] Request failed: ' . $error->getMessage());
    if (str_contains($error->getMessage(), 'vendor/phpmailer')) {
        $message = 'OTP service is unavailable because PHPMailer is not installed. Run Composer install in pharma-api.';
    } elseif ($error instanceof PDOException) {
        $message = 'OTP storage is unavailable. Check database connectivity and permissions for the cashier_password_reset_otps table.';
    } else {
        $message = 'OTP service is currently unavailable. Please retry or contact an administrator.';
    }
    cashierOtpRespond('error', $message, [], 500);
}
?>