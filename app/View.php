<?php
declare(strict_types=1);

namespace LeonsCode;

final class View
{
    public static function render(string $name, array $data = []): void
    {
        $views = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'views' . DIRECTORY_SEPARATOR;
        $view = $views . $name . '.php';
        if (!is_file($view)) {
            http_response_code(404);
            $view = $views . 'not-found.php';
        }
        extract($data, EXTR_SKIP);
        ob_start();
        require $view;
        $content = (string) ob_get_clean();
        $title = $data['title'] ?? 'Leon’s Code';
        $description = $data['description'] ?? 'Learn programming through practical projects and a safe coding lab.';
        try {
            $user = Auth::user();
        } catch (\RuntimeException) {
            // Public setup pages must remain useful before MySQL is configured.
            $user = null;
        }
        $flashes = Security::consumeFlash();
        require $views . 'layout.php';
    }
}
