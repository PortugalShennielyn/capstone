
<?php
// pharma-api/config/mailer.php

function sendVerificationEmail(
    string $toEmail,
    string $code,
    string $displayName = 'User'
): bool {
    $subject = 'Dr. R Pharmacy - Password Reset Code';
    $bodyHtml = buildVerificationEmailBody($code, $displayName);

    // Load PHPMailer manually
    $phpMailerDir = dirname(__DIR__) . DIRECTORY_SEPARATOR
    . 'lib' . DIRECTORY_SEPARATOR
    . 'PHPMailer' . DIRECTORY_SEPARATOR
    . 'src';

    $phpMailerFile = $phpMailerDir . '/PHPMailer.php';
    $smtpFile = $phpMailerDir . '/SMTP.php';
    $exceptionFile = dirname($phpMailerDir) . DIRECTORY_SEPARATOR . 'Exception.php';
    file_put_contents(
    __DIR__ . '/mailer_debug.log',
    date('Y-m-d H:i:s') .
    ' | PHPMailer=' . (file_exists($phpMailerFile) ? 'YES' : 'NO') .
    ' | SMTP=' . (file_exists($smtpFile) ? 'YES' : 'NO') .
    ' | Exception=' . (file_exists($exceptionFile) ? 'YES' : 'NO') .
    ' | Directory=' . $phpMailerDir . PHP_EOL,
    FILE_APPEND
);

    // Check whether all PHPMailer files exist
    if (
        !file_exists($phpMailerFile) ||
        !file_exists($smtpFile) ||
        !file_exists($exceptionFile)
    ) {
        $message = 'PHPMailer files missing. Directory: ' . $phpMailerDir;

        error_log('[MAILER] ' . $message);

        file_put_contents(
            __DIR__ . '/mailer_debug.log',
            date('Y-m-d H:i:s') . ' | ' . $message . PHP_EOL,
            FILE_APPEND
        );

        return false;
    }

    // Load PHPMailer classes
    require_once $exceptionFile;
    require_once $phpMailerFile;
    require_once $smtpFile;

    if (!class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
        $message = 'PHPMailer class could not be loaded.';

        error_log('[MAILER] ' . $message);

        file_put_contents(
            __DIR__ . '/mailer_debug.log',
            date('Y-m-d H:i:s') . ' | ' . $message . PHP_EOL,
            FILE_APPEND
        );

        return false;
    }

    return sendViaPhpMailer($toEmail, $subject, $bodyHtml);
}


function buildVerificationEmailBody(
    string $code,
    string $displayName
): string {
    $safeName = htmlspecialchars(
        $displayName,
        ENT_QUOTES,
        'UTF-8'
    );

    $safeCode = htmlspecialchars(
        $code,
        ENT_QUOTES,
        'UTF-8'
    );

    $year = date('Y');

    return <<<HTML
<!DOCTYPE html>
<html>
<body style="font-family:Inter,Arial,sans-serif;background:#f4f6fb;padding:32px;color:#252b37;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;
              box-shadow:0 22px 60px rgba(31,37,48,0.12);padding:34px;">
    <h2 style="margin:0 0 12px;color:#8A2BE2;font-size:22px;">Dr. R Pharmacy</h2>

    <p style="margin:0 0 18px;">Hi <strong>{$safeName}</strong>,</p>

    <p style="margin:0 0 18px;">
      Use the code below to reset your password.
      It expires in <strong>10 minutes</strong>.
    </p>

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


function sendViaPhpMailer(
    string $toEmail,
    string $subject,
    string $html
): bool {
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);

    try {
        $config = require __DIR__ . '/mail_credentials.php';

        $mail->isSMTP();
        $mail->Host = 'smtp.gmail.com';
        $mail->SMTPAuth = true;
        $mail->Username = $config['username'];

        // App Password should be stored without spaces
        $mail->Password = str_replace(
            ' ',
            '',
            trim($config['password'])
        );

        $mail->SMTPSecure =
            \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;

        $mail->Port = 587;
        $mail->CharSet = 'UTF-8';

        $mail->setFrom(
            $config['username'],
            'Dr. R Pharmacy'
        );

        $mail->addAddress($toEmail);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $html;

        $mail->AltBody =
            'Your Dr. R Pharmacy password reset code is in the email.';

        $mail->send();

        return true;

    } catch (\Throwable $e) {
        $message = date('Y-m-d H:i:s')
            . ' | PHPMailer error: '
            . $e->getMessage()
            . ' | SMTP: '
            . $mail->ErrorInfo
            . PHP_EOL;

        error_log('[MAILER] ' . $message);

        file_put_contents(
            __DIR__ . '/mailer_debug.log',
            $message,
            FILE_APPEND
        );

        return false;
    }
}