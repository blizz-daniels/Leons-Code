<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="<?= e($description) ?>">
  <?php if (in_array($_GET['page'] ?? 'home', ['dashboard', 'admin', 'login', 'register', 'payment-callback'], true)): ?><meta name="robots" content="noindex,nofollow"><?php endif; ?>
  <title><?= e($title) ?></title>
  <link rel="stylesheet" href="assets/platform.css">
  <link rel="stylesheet" href="assets/progress.css">
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <a class="wordmark" href="<?= route() ?>" aria-label="Leon’s Code home"><span class="wordmark-mark">&lt;/&gt;</span><span>Leon’s <strong>Code</strong></span></a>
    <nav class="main-nav" aria-label="Main navigation">
      <a href="<?= route('courses') ?>">Courses</a>
      <a href="index.html">Java Lab</a>
      <a href="<?= route('web-lab') ?>">Web Lab</a>
      <a href="<?= route('pricing') ?>">Pricing</a>
    </nav>
    <div class="account-nav">
      <?php if ($user): ?>
        <a class="text-link" href="<?= route('dashboard') ?>">Hi, <?= e(explode(' ', $user['name'])[0]) ?></a>
        <?php if (in_array('administrator', $user['roles'], true)): ?><a class="text-link" href="<?= route('admin') ?>">Admin</a><?php endif; ?>
        <form method="post" action="index.php" class="inline-form"><?= csrf_field() ?><input type="hidden" name="action" value="logout"><button class="button button-ghost" type="submit">Sign out</button></form>
      <?php else: ?>
        <a class="text-link" href="<?= route('login') ?>">Sign in</a><a class="button button-small" href="<?= route('register') ?>">Start free</a>
      <?php endif; ?>
    </div>
  </header>
  <?php if ($flashes): ?><div class="flash-stack" aria-live="polite"><?php foreach ($flashes as $flash): ?><div class="flash flash-<?= e($flash['type']) ?>"><?= e($flash['message']) ?></div><?php endforeach; ?></div><?php endif; ?>
  <main id="main-content"><?= $content ?></main>
  <footer class="site-footer"><div><a class="wordmark" href="<?= route() ?>"><span class="wordmark-mark">&lt;/&gt;</span><span>Leon’s <strong>Code</strong></span></a><p>Practical, patient learning for future builders.</p></div><nav aria-label="Footer"><a href="<?= route('courses') ?>">Courses</a><a href="<?= route('pricing') ?>">Pricing</a><a href="<?= route('privacy') ?>">Privacy</a><a href="<?= route('terms') ?>">Terms</a><a href="<?= route('refund') ?>">Refund policy</a></nav></footer>
  <script src="assets/platform.js" defer></script>
</body>
</html>
