<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/config/auth_context.php';

function authIsolationAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function authIsolationRequest(string $path, string $token, string $phpSessionId, string $method = 'GET'): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . ltrim($path, '/'));
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_COOKIE => session_name() . '=' . $phpSessionId,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Tab-Token: ' . $token],
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    authIsolationAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$users = $pdo->query(
    "SELECT user_id, username
     FROM users
     WHERE status = 'Active'
       AND COALESCE(is_deleted, 0) = 0
     ORDER BY username
     LIMIT 2"
)->fetchAll();

authIsolationAssert(count($users) >= 2, 'Two active users are required for the isolation test.');
authIsolationAssert(tableExists($pdo, 'auth_sessions'), 'The auth_sessions table is required.');

$sharedPhpSessionId = session_id();
$sharedPhpSessionName = session_name();
session_write_close();
$records = [];

try {
    foreach ($users as $index => $user) {
        $token = bin2hex(random_bytes(32));
        $authSessionId = newUuid($pdo);
        $pdo->prepare(
            'INSERT INTO auth_sessions
                (auth_session_id, php_session_id, user_id, session_token_hash, expires_at, ip_address, user_agent)
             VALUES
                (:auth_session_id, :php_session_id, :user_id, :session_token_hash,
                 DATE_ADD(NOW(), INTERVAL 1 DAY), :ip_address, :user_agent)'
        )->execute([
            ':auth_session_id' => $authSessionId,
            ':php_session_id' => $sharedPhpSessionId,
            ':user_id' => $user['user_id'],
            ':session_token_hash' => hash('sha256', $token),
            ':ip_address' => '127.0.0.1',
            ':user_agent' => 'Auth isolation regression test',
        ]);
        $records[$index] = compact('token', 'authSessionId', 'user');
    }

    foreach ($records as $record) {
        $_SERVER['HTTP_X_TAB_TOKEN'] = $record['token'];
        $authSession = loadAuthSessionByPresentedToken($pdo);
        authIsolationAssert((bool) $authSession, 'The presented tab token must resolve.');
        authIsolationAssert(hydrateSessionFromAuthRecord($pdo, $authSession), 'The token user must hydrate.');
        authIsolationAssert(
            $_SESSION['user_id'] === $record['user']['user_id'],
            'Each token must restore its own user even when the PHP session cookie is shared.'
        );
    }

    $multi = curl_multi_init();
    $handles = [];
    foreach ($records as $index => $record) {
        $handle = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/auth/check_session.php');
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_COOKIE => $sharedPhpSessionName . '=' . $sharedPhpSessionId,
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Tab-Token: ' . $record['token']],
            CURLOPT_TIMEOUT => 15,
        ]);
        curl_multi_add_handle($multi, $handle);
        $handles[$index] = $handle;
    }
    do {
        $result = curl_multi_exec($multi, $running);
        if ($running) curl_multi_select($multi, 1.0);
    } while ($running && $result === CURLM_OK);
    foreach ($handles as $index => $handle) {
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $payload = json_decode((string) curl_multi_getcontent($handle), true) ?: [];
        authIsolationAssert(
            $status === 200,
            'Concurrent session checks must return HTTP 200; got ' . $status . ' with ' . json_encode($payload)
        );
        authIsolationAssert(($payload['user_id'] ?? '') === $records[$index]['user']['user_id'], 'Concurrent checks must not swap users.');
        curl_multi_remove_handle($multi, $handle);
        curl_close($handle);
    }
    curl_multi_close($multi);

    $logout = authIsolationRequest('auth/logout.php', $records[0]['token'], $sharedPhpSessionId, 'POST');
    authIsolationAssert($logout['status'] === 200, 'Token-scoped logout must succeed.');

    $statusStmt = $pdo->prepare(
        'SELECT auth_session_id, is_revoked, is_active
         FROM auth_sessions
         WHERE auth_session_id IN (:first_id, :second_id)'
    );
    $statusStmt->execute([
        ':first_id' => $records[0]['authSessionId'],
        ':second_id' => $records[1]['authSessionId'],
    ]);
    $statuses = [];
    foreach ($statusStmt->fetchAll() as $status) {
        $statuses[$status['auth_session_id']] = $status;
    }

    authIsolationAssert((int) $statuses[$records[0]['authSessionId']]['is_revoked'] === 1, 'Logout must revoke its presented token.');
    authIsolationAssert((int) $statuses[$records[1]['authSessionId']]['is_revoked'] === 0, 'Logout must not revoke another tab token.');
    authIsolationAssert((int) $statuses[$records[1]['authSessionId']]['is_active'] === 1, 'The other user session must remain active.');

    $firstAfterLogout = authIsolationRequest('auth/check_session.php', $records[0]['token'], $sharedPhpSessionId);
    $secondAfterLogout = authIsolationRequest('auth/check_session.php', $records[1]['token'], $sharedPhpSessionId);
    authIsolationAssert($firstAfterLogout['status'] === 401, 'The logged-out token must return HTTP 401.');
    authIsolationAssert($secondAfterLogout['status'] === 200, 'The other tab must stay authenticated after logout.');
    authIsolationAssert(($secondAfterLogout['body']['user_id'] ?? '') === $records[1]['user']['user_id'], 'The surviving tab must keep its own user.');

    echo "PASS: concurrent users sharing one PHP cookie resolve independently; logout is token-scoped.\n";
} finally {
    if ($records) {
        $ids = array_column($records, 'authSessionId');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("DELETE FROM auth_sessions WHERE auth_session_id IN ($placeholders)")->execute($ids);
    }
}
