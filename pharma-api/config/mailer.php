<?php
// pharma-api/config/mailer.php

function sendVerificationEmail(string $toEmail, string $code, string $displayName = 'User'): bool
{
    $subject  = 'Dr. R Pharmacy – Password Reset Code';
    $bodyHtml = buildVerificationEmailBody($code, $displayName);

    // A: Composer autoload
    $composerAutoload = __DIR__ . '/../vendor/autoload.php';
    if (file_exists($composerAutoload)) {
        require_once $composerAutoload;
        if (class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
            return sendViaPhpMailer($toEmail, $subject, $bodyHtml);
        }
    }

    // B: Manual drop-in
    $manual = __DIR__ . '/../lib/PHPMailer/src/PHPMailer.php';
    if (file_exists($manual)) {
        require_once __DIR__ . '/../lib/PHPMailer/src/PHPMailer.php';
        require_once __DIR__ . '/../lib/PHPMailer/src/SMTP.php';
        require_once __DIR__ . '/../lib/PHPMailer/src/Exception.php';
        if (class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
            return sendViaPhpMailer($toEmail, $subject, $bodyHtml);
        }
    }

    // C: native mail()
    return sendViaNativeMail($toEmail, $subject, $bodyHtml);
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
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = getenv('MAIL_HOST')     ?: 'smtp.gmail.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = getenv('MAIL_USERNAME') ?: 'docRpharmacy@gmail.com';
        $mail->Password   = getenv('MAIL_PASSWORD') ?: 'PUT-GMAIL-APP-PASSWORD-HERE';
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = (int) (getenv('MAIL_PORT') ?: 587);
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom(getenv('MAIL_USERNAME') ?: 'docRpharmacy@gmail.com', 'Dr. R Pharmacy');
        $mail->addAddress($toEmail);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $html;
        $mail->AltBody = 'Your verification code is in the HTML version of this email.';
        $mail->send();
        return true;
    } catch (\Throwable $e) {
        error_log('[MAILER] PHPMailer error: ' . $e->getMessage());
        return false;
    }
}

function sendViaNativeMail(string $toEmail, string $subject, string $html): bool
{
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: Dr. R Pharmacy <docRpharmacy@gmail.com>\r\n";
    return @mail($toEmail, $subject, $html, $headers);
}