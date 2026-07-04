<?php
require_once '../pharma-api/config/db_connection.php';
require_once '../pharma-api/config/auth_context.php';

revokeCurrentAuthSession($pdo);
$_SESSION = [];
session_destroy();
clearCurrentPhpSessionCookie();

header('Location: login.php');
exit();
?>
