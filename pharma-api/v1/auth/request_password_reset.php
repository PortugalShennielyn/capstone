<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once '../../lib/PHPMailer/src/Exception.php';
require_once '../../lib/PHPMailer/src/PHPMailer.php';
require_once '../../lib/PHPMailer/src/SMTP.php';

// Prevent accidental HTML/warnings from breaking JSON responses
ob_start();
header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    ob_end_clean();
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$email = strtolower(trim((string) ($payload['email'] ?? '')));
$generic = 'reset link has been sent.';

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    ob_end_clean();
    echo json_encode(['status' => 'success', 'message' => $generic]);
    exit();
}

try {
    $stmt = $pdo->prepare('SELECT user_id FROM users WHERE LOWER(email) = :email AND status = "Active" AND COALESCE(is_deleted, 0) = 0 LIMIT 1');
    $stmt->execute([':email' => $email]);
    $userId = $stmt->fetchColumn();

    if ($userId) {
        $pdo->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = :user_id AND used_at IS NULL')->execute([':user_id' => $userId]);
        $rawToken = bin2hex(random_bytes(32));
        $insert = $pdo->prepare('INSERT INTO password_reset_tokens (password_reset_token_id, user_id, token_hash, expires_at) VALUES (:id, :user_id, :hash, DATE_ADD(NOW(), INTERVAL 30 MINUTE))');
        $insert->execute([':id' => newUuid($pdo), ':user_id' => $userId, ':hash' => hash('sha256', $rawToken)]);
        // Build a reliable frontend base URL from the current request host and scheme.
        $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        // Extract the base path from the API URL to ensure the frontend path is correct
        $requestUri = $_SERVER['REQUEST_URI'] ?? '/capstone-main/pharma-api/v1/auth/request_password_reset.php';
        $basePath = preg_replace('#/pharma-api/.*#', '', $requestUri) ?: '/capstone-main';
        $frontend = rtrim(sprintf('%s://%s%s/pharma-frontend', $scheme, $host, $basePath), '/');
        $resetUrl = $frontend . '/reset_password.html?token=' . urlencode($rawToken);
        $subject = 'Dr. R Pharmacy password reset';
        $body = "Someone requested a password reset for your account.\n\nReset your password within 30 minutes:\n{$resetUrl}\n\nIf you did not request this, you can ignore this email.";

        $mailConfigPath = 'C:/xampp/secure/pharma_mail_config.php';
        if (!is_file($mailConfigPath)) {
            throw new RuntimeException('SMTP configuration file is missing.');
        }
        $mailConfig = require $mailConfigPath;
        $mailer = new PHPMailer\PHPMailer\PHPMailer(true);
        $mailer->isSMTP();
        $mailer->Host = $mailConfig['host'];
        $mailer->Port = (int) $mailConfig['port'];
        $mailer->SMTPAuth = true;
        $mailer->Username = $mailConfig['username'];
        $mailer->Password = str_replace(' ', '', $mailConfig['password']);
        $mailer->SMTPSecure = $mailConfig['encryption'] === 'ssl'
            ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mailer->CharSet = 'UTF-8';
        $mailer->setFrom($mailConfig['from_email'], $mailConfig['from_name']);
        $mailer->addAddress($email);
        $mailer->Subject = $subject;
        $mailer->Body = $body;
        $mailer->send();
        error_log("[AUTH] Password reset email sent to {$email}");

    }

    // Final response: keep the API generic and do not expose reset URLs or debug details.
    ob_end_clean();
    echo json_encode(['status' => 'success', 'message' => $generic]);
} catch (Throwable $error) {
    error_log('[AUTH] Password reset failed: ' . $error->getMessage());
    http_response_code(500);
    ob_end_clean();
    echo json_encode(['status' => 'error', 'message' => 'Unable to process the password reset request.']);
}
