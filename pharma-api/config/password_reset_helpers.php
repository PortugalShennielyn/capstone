<?php
require_once __DIR__ . '/id_helpers.php';
require_once __DIR__ . '/mailer.php';

function generateVerificationCode(): string
{
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function createPasswordReset(PDO $pdo, string $userId, string $email, string $code): string
{
    $resetId = newUuid($pdo);

    $pdo->prepare(
        'UPDATE password_resets
         SET used_at = NOW()
         WHERE user_id = :user_id AND used_at IS NULL'
    )->execute([':user_id' => $userId]);

    $stmt = $pdo->prepare(
        'INSERT INTO password_resets
            (reset_id, user_id, email, code_hash, expires_at)
         VALUES
            (:reset_id, :user_id, :email, :code_hash, DATE_ADD(NOW(), INTERVAL 10 MINUTE))'
    );
    $stmt->execute([
        ':reset_id'  => $resetId,
        ':user_id'   => $userId,
        ':email'     => $email,
        ':code_hash' => password_hash($code, PASSWORD_DEFAULT),
    ]);

    return $resetId;
}

function verifyPasswordReset(PDO $pdo, string $email, string $code): ?array
{
    $stmt = $pdo->prepare(
        'SELECT reset_id, user_id, code_hash, attempts, expires_at
         FROM password_resets
         WHERE email = :email
           AND used_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1'
    );
    $stmt->execute([':email' => $email]);
    $row = $stmt->fetch();
    if (!$row) return null;

    if ((int) $row['attempts'] >= 5) return null;

    if (!password_verify($code, $row['code_hash'])) {
        $pdo->prepare(
            'UPDATE password_resets SET attempts = attempts + 1
             WHERE reset_id = :reset_id'
        )->execute([':reset_id' => $row['reset_id']]);
        return null;
    }

    return $row;
}

function consumePasswordReset(PDO $pdo, string $resetId): void
{
    $pdo->prepare(
        'UPDATE password_resets SET used_at = NOW() WHERE reset_id = :reset_id'
    )->execute([':reset_id' => $resetId]);
}