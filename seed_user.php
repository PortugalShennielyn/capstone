<?php
require_once 'pharma-api/config/db_connection.php';

$username = 'admin';
$plainPassword = 'admin123';
$hashedPassword = password_hash('admin123', PASSWORD_BCRYPT);

try {
    $statement = $pdo->prepare(
        'INSERT INTO users (username, password, full_name, role, status)
         VALUES (:username, :password, :full_name, :role, :status)'
    );

    $statement->execute([
        ':username' => $username,
        ':password' => $hashedPassword,
        ':full_name' => 'Dr. ADMIN',
        ':role' => 'Admin',
        ':status' => 'Active'
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Admin user successfully seeded!'
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
?>
