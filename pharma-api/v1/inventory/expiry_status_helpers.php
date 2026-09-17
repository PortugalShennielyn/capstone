<?php

function inventoryExpiryStatus($expiryDate, $daysUntilExpiry, int $alertDays = 30, bool $noExpiry = false): string
{
    if ($noExpiry) {
        return 'No Expiry';
    }
    if (empty($expiryDate)) {
        return 'Not Recorded';
    }

    $days = (int) $daysUntilExpiry;
    if ($days <= 0) {
        return 'Expired';
    }
    if ($days <= $alertDays) {
        return 'Expiring Soon';
    }
    return 'Safe';
}
