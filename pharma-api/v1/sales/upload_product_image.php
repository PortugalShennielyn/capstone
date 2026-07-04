<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'POST is required.']);
        exit();
    }

    $productId = trim((string) ($_POST['product_id'] ?? ''));
    if ($productId === '') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'A valid product is required.']);
        exit();
    }

    if (!isset($_FILES['product_image']) || !is_array($_FILES['product_image'])) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Select an image to upload.']);
        exit();
    }

    $file = $_FILES['product_image'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Unable to read the selected image.']);
        exit();
    }

    if (($file['size'] ?? 0) > 3 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Product image must be 3 MB or smaller.']);
        exit();
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file((string) $file['tmp_name']);
    $extensions = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];
    if (!isset($extensions[$mime])) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Upload a JPG, PNG, WEBP, or GIF image.']);
        exit();
    }

    $exists = $pdo->prepare('SELECT product_id FROM product WHERE product_id = :product_id LIMIT 1');
    $exists->execute([':product_id' => $productId]);
    if (!$exists->fetchColumn()) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Product was not found.']);
        exit();
    }

    $projectRoot = realpath(__DIR__ . '/../../..');
    if ($projectRoot === false) {
        throw new RuntimeException('Unable to locate project root.');
    }
    $uploadDir = $projectRoot . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'products';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Unable to create product image upload folder.');
    }

    $filename = 'product-' . preg_replace('/[^a-zA-Z0-9-]/', '', $productId) . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(4)) . '.' . $extensions[$mime];
    $targetPath = $uploadDir . DIRECTORY_SEPARATOR . $filename;
    if (!move_uploaded_file((string) $file['tmp_name'], $targetPath)) {
        throw new RuntimeException('Unable to save product image.');
    }

    $relativePath = 'uploads/products/' . $filename;
    $update = $pdo->prepare('UPDATE product SET product_image = :product_image WHERE product_id = :product_id');
    $update->execute([
        ':product_image' => $relativePath,
        ':product_id' => $productId,
    ]);

    echo json_encode([
        'status' => 'success',
        'data' => [
            'product_id' => $productId,
            'product_image' => $relativePath,
            'message' => 'Product image uploaded.',
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage() ?: 'Unable to upload product image.',
    ]);
}

?>
