<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

$seed = require dirname(__DIR__) . '/database/seeds/001_demo.php';
$seed(\LeonsCode\Database::connection());
echo "Seeded Leon’s Code demonstration curriculum and non-production account." . PHP_EOL;
