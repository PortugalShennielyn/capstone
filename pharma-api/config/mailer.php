<?php
// pharma-api/config/mailer.php

function loadMailEnvironment(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;

    $envFile = __DIR__ . '/../.env';
    if (!is_readable($envFile)) {
        return;
    }

    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim(trim($value), "\"'");
        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

function verificationEmailConfigurationIssue(): ?string
{
    loadMailEnvironment();
    $host = trim((string) getenv('MAIL_HOST'));
    $username = trim((string) getenv('MAIL_USERNAME'));
    $password = (string) getenv('MAIL_PASSWORD');
    $from = trim((string) (getenv('PHARMA_MAIL_FROM') ?: $username));
    $encryption = strtolower(trim((string) (getenv('MAIL_ENCRYPTION') ?: 'tls')));
    $port = (int) (getenv('MAIL_PORT') ?: 587);

    if (
        $host === ''
        || $host === 'smtp.example.com'
        || $username === ''
        || str_starts_with($username, 'your-')
        || $password === ''
        || str_starts_with($password, 'your-')
        || !filter_var($from, FILTER_VALIDATE_EMAIL)
        || str_ends_with(strtolower($from), '@example.com')
    ) {
        return 'SMTP settings are missing or still contain example placeholders.';
    }
    if (!in_array($encryption, ['tls', 'ssl'], true) || $port < 1 || $port > 65535) {
        return 'SMTP encryption or port settings are invalid.';
    }

    return null;
}

function sendVerificationEmail(string $toEmail, string $code, string $displayName = 'User'): bool
{
    loadMailEnvironment();
    if (verificationEmailConfigurationIssue() !== null) {
        error_log('[MAILER] SMTP settings are missing or invalid; verification email was not sent.');
        return false;
    }

    $subject  = 'Dr. R Pharmacy – Password Reset Code';
    $bodyHtml = buildVerificationEmailBody($code, $displayName);

    $composerAutoload = __DIR__ . '/../vendor/autoload.php';
    if (file_exists($composerAutoload)) {
        require_once $composerAutoload;
    }

    if (!class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
        $manual = __DIR__ . '/../lib/PHPMailer/src/PHPMailer.php';
        if (file_exists($manual)) {
            require_once __DIR__ . '/../lib/PHPMailer/src/PHPMailer.php';
            require_once __DIR__ . '/../lib/PHPMailer/src/SMTP.php';
            require_once __DIR__ . '/../lib/PHPMailer/Exception.php';
        }
    }

    if (!class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
        error_log('[MAILER] PHPMailer is unavailable; verification email was not sent.');
        return false;
    }

    return sendViaPhpMailer($toEmail, $subject, $bodyHtml);
}

function buildVerificationEmailBody(string $code, string $displayName): string
{
    $safeName = htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8');
    $safeCode = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
    $year = date('Y');
    return <<<HTML
<!DOCTYPE html>
<html>
<body style="font-family:Inter,Arial,sans-serif;background:#f4f6fb;padding:32px;color:#252b37;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;
              box-shadow:0 22px 60px rgba(31,37,48,0.12);padding:34px;">
    <h2 style="margin:0 0 12px;color:#8A2BE2;font-size:22px;">Dr. R Pharmacy</h2>
    <p style="margin:0 0 18px;">Hi <strong>{$safeName}</strong>,</p>
    <p style="margin:0 0 18px;">Use the code below to reset your password.
       It expires in <strong>10 minutes</strong>.</p>
    <div style="text-align:center;margin:26px 0;">
      <span style="display:inline-block;font-size:32px;letter-spacing:8px;
                   font-weight:800;color:#6b21a8;background:#f3e8ff;
                   padding:14px 26px;border-radius:10px;">{$safeCode}</span>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#747d8c;">
      If you didn't request this, you can safely ignore this email.
    </p>
    <hr style="border:0;border-top:1px solid #e6eaf2;margin:22px 0;">
    <p style="font-size:12px;color:#9aa3b2;text-align:center;margin:0;">
      &copy; {$year} Dr. R Pharmacy — Capistrano cor. Cruz Taal St., Brgy. 08, CDO
    </p>
  </div>
</body>
</html>
HTML;
}

function sendViaPhpMailer(string $toEmail, string $subject, string $html): bool
{
    $host = trim((string) getenv('MAIL_HOST'));
    $username = trim((string) getenv('MAIL_USERNAME'));
    $password = (string) getenv('MAIL_PASSWORD');
    $from = trim((string) (getenv('PHARMA_MAIL_FROM') ?: $username));
    $fromName = trim((string) (getenv('PHARMA_MAIL_FROM_NAME') ?: 'Dr. R Pharmacy'));
    $encryption = strtolower(trim((string) (getenv('MAIL_ENCRYPTION') ?: 'tls')));
    $port = (int) (getenv('MAIL_PORT') ?: 587);

    if (verificationEmailConfigurationIssue() !== null) {
        error_log('[MAILER] SMTP settings are missing or invalid; verification email was not sent.');
        return false;
    }

    try {
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = $host;
        $mail->SMTPAuth   = true;
        $mail->Username   = $username;
        $mail->Password   = $password;
        $mail->SMTPSecure = $encryption === 'ssl'
            ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $port;
        $mail->Timeout    = 15;
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom($from, $fromName);
        $mail->addAddress($toEmail);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $html;
        $mail->AltBody = trim(strip_tags(str_replace(['</p>', '</div>', '<br>'], "\n", $html)));
        $mail->send();
        return true;
    } catch (\PHPMailer\PHPMailer\Exception $e) {
        error_log('[MAILER] PHPMailer error: ' . $e->getMessage());
        return false;
    }
}