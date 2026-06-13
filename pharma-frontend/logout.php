<?php
session_set_cookie_params([
    'path' => '/PharmacySystem_for_DocR/',
    'samesite' => 'Lax'
]);
session_start();
$_SESSION = [];
session_destroy();

setcookie(session_name(), '', time() - 42000, '/PharmacySystem_for_DocR/');

header('Location: login.html');
exit();
?>
