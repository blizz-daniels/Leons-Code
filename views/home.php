<section class="hero section-shell">
  <div class="hero-copy">
    <p class="eyebrow">A calmer way to start coding</p>
    <h1>Learn to code.<br><em>Build your future.</em></h1>
    <p class="lede">Leon’s Code turns beginner-friendly lessons into real practice—so every concept is something you can try, understand, and build with.</p>
    <div class="button-row"><a class="button button-large" href="<?= route('register') ?>">Start learning free <span aria-hidden="true">→</span></a><a class="button button-outline button-large" href="<?= route('courses') ?>">Explore courses</a></div>
    <ul class="trust-list"><li>Beginner-first learning paths</li><li>Practice in your browser</li><li>Built for focused progress</li></ul>
  </div>
  <div class="hero-lab" aria-label="Java lab preview">
    <div class="window-bar"><span></span><span></span><span></span><strong>Main.java</strong><small>Java Lab</small></div>
    <pre><code><i>public class</i> <b>Main</b> {
  <i>public static void</i> main(String[] args) {
    String goal = <mark>"Build something real"</mark>;
    System.out.println(goal);
  }
}</code></pre>
    <div class="console-preview"><span>OUTPUT</span><code>Build something real</code><a href="index.html?starter=java-hello">Run this example <span aria-hidden="true">↗</span></a></div>
  </div>
</section>

<section class="section-shell metric-strip" aria-label="Learning approach"><div><strong>01</strong><span>Learn with short, connected lessons</span></div><div><strong>02</strong><span>Practise as soon as you understand</span></div><div><strong>03</strong><span>Build projects that prove your progress</span></div></section>

<section class="section-shell section-heading"><div><p class="eyebrow">Start with a path</p><h2>Skills that make the web feel less mysterious.</h2></div><a class="text-link with-arrow" href="<?= route('courses') ?>">See all courses <span>→</span></a></section>
<section class="section-shell course-grid">
  <?php foreach ($courses as $course): ?>
    <article class="course-card"><div class="course-art course-art-<?= e($course['category'] === 'Programming' ? 'java' : 'web') ?>"><span><?= $course['category'] === 'Programming' ? '☕' : '&lt;/&gt;' ?></span></div><div class="course-card-copy"><div class="tag-row"><span class="tag"><?= e($course['difficulty']) ?></span><span><?= $course['access_level'] === 'premium' ? 'Premium' : 'Free to start' ?></span></div><h3><?= e($course['title']) ?></h3><p><?= e($course['short_description']) ?></p><footer><span><?= (int) $course['lesson_count'] ?> lessons · <?= (int) $course['estimated_minutes'] ?> min</span><a href="<?= route('course', ['slug' => $course['slug']]) ?>" aria-label="View <?= e($course['title']) ?>">→</a></footer></div></article>
  <?php endforeach; ?>
</section>

<section class="section-shell journey"><div class="journey-intro"><p class="eyebrow">A rhythm you can keep</p><h2>Small wins become useful skills.</h2><p>Move from the idea to the keyboard without getting buried under jargon or a wall of videos.</p><a class="text-link with-arrow" href="<?= route('courses') ?>">Choose a learning path <span>→</span></a></div><ol><li><span>01</span><div><h3>Learn</h3><p>Get the why, the vocabulary, and a practical example.</p></div></li><li><span>02</span><div><h3>Practise</h3><p>Change the code and see what happens in a safe lab.</p></div></li><li><span>03</span><div><h3>Build</h3><p>Use the pieces in projects that are genuinely yours.</p></div></li><li><span>04</span><div><h3>Master</h3><p>Track your progress and return to the hard parts with confidence.</p></div></li></ol></section>

<section class="lab-promo"><div class="section-shell lab-promo-inner"><div><p class="eyebrow">Made for experimentation</p><h2>Your Java lab lives in the browser.</h2><p>Run the documented learning subset in an isolated environment. It supports source checks, useful diagnostics, Scanner input, save/open in your browser, and a clear stop control.</p><a class="button button-light" href="index.html">Open Java Lab <span aria-hidden="true">→</span></a></div><ul><li><strong>Type-safe feedback</strong><span>See compiler and runtime errors separately.</span></li><li><strong>Scanner input</strong><span>Pause, enter input, and resume a program.</span></li><li><strong>Bounded execution</strong><span>Time, source, input, output, and array limits keep the lab responsive.</span></li></ul></div></section>

<section class="section-shell pricing-teaser"><div><p class="eyebrow">Simple access</p><h2>Start free. Upgrade only when you’re ready to go deeper.</h2><p>Plans and pricing are managed by the platform owner in Nigerian naira. There are no fabricated claims or hidden promises about unlimited computing.</p></div><div class="plan-mini-list"><?php foreach ($plans as $plan): ?><article><h3><?= e($plan['name']) ?></h3><strong><?= (int) $plan['amount_kobo'] > 0 ? money($plan['amount_kobo'], $plan['currency']) : 'Free' ?></strong><span><?= e($plan['interval_unit'] === 'annual' ? 'per year' : ($plan['billing_type'] === 'free' ? 'to explore' : 'per month')) ?></span></article><?php endforeach; ?><a class="text-link with-arrow" href="<?= route('pricing') ?>">Compare plans <span>→</span></a></div></section>

<section class="section-shell faq"><div><p class="eyebrow">Good to know</p><h2>Questions beginners often ask.</h2></div><div class="faq-list"><details><summary>Do I need experience before starting?</summary><p>No. The starter courses explain the foundations and let you practise immediately.</p></details><details><summary>Does the Java lab run full Java?</summary><p>No. It supports a documented learning subset. Unsupported features are reported clearly instead of being silently guessed.</p></details><details><summary>Can I learn on a phone?</summary><p>Lessons and dashboards are responsive. For longer coding exercises, a laptop or desktop offers the most comfortable editing experience.</p></details></div></section>
