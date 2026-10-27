<?php
declare(strict_types=1);

return static function (\PDO $pdo): void {
    $pdo->beginTransaction();
    try {
        foreach (['student', 'instructor', 'administrator'] as $role) {
            $pdo->prepare('INSERT INTO roles (name, created_at) VALUES (:name, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name = VALUES(name)')->execute(['name' => $role]);
        }

        $email = 'demo.student@leonscode.test';
        $pdo->prepare('INSERT INTO users (name, email, password_hash, status, created_at, updated_at) VALUES ("Demo Student", :email, :password, "active", UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = UTC_TIMESTAMP()')->execute([
            'email' => $email,
            'password' => password_hash('DemoStudentOnly-ChangeMe', PASSWORD_DEFAULT),
        ]);
        $user = $pdo->prepare('SELECT id FROM users WHERE email = :email');
        $user->execute(['email' => $email]);
        $studentId = (int) $user->fetchColumn();
        $role = $pdo->query('SELECT id FROM roles WHERE name = "student"')->fetchColumn();
        $pdo->prepare('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)')->execute(['user_id' => $studentId, 'role_id' => $role]);

        $plans = [
            ['Free', 'free', 'Try the first lessons and explore the coding lab.', 0, 'free', 'monthly', ['Free preview lessons', 'Java Lab in your browser', 'Course catalogue access'], 1],
            ['Learner', 'learner-monthly', 'Continue through the guided learning paths.', 650000, 'subscription', 'monthly', ['Premium course lessons', 'Quizzes and progress tracking', 'Practice projects'], 2],
            ['Pro', 'pro-annual', 'A full-year learning path for consistent builders.', 9900000, 'subscription', 'annual', ['Everything in Learner', 'All published learning paths', 'Certificates when available'], 3],
        ];
        foreach ($plans as [$name, $slug, $description, $amount, $type, $interval, $benefits, $order]) {
            $pdo->prepare('INSERT INTO subscription_plans (name, slug, description, amount_kobo, currency, billing_type, interval_unit, benefits_json, is_active, display_order, created_at, updated_at) VALUES (:name, :slug, :description, :amount, "NGN", :type, :interval, :benefits, 1, :display_order, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), amount_kobo = VALUES(amount_kobo), benefits_json = VALUES(benefits_json), display_order = VALUES(display_order), updated_at = UTC_TIMESTAMP()')->execute([
                'name' => $name, 'slug' => $slug, 'description' => $description, 'amount' => $amount, 'type' => $type, 'interval' => $interval, 'benefits' => json_encode($benefits, JSON_THROW_ON_ERROR), 'display_order' => $order,
            ]);
        }

        $courses = [
            [
                'Java Foundations', 'java-foundations', 'Write your first Java programs, understand variables, and solve practical problems.', 'Programming', 'beginner', 300, 'free',
                [['Start with output', true, 'Meet System.out.println() and run your first program.', 15], ['Values and arithmetic', false, 'Use variables, integer division, and floating-point calculations.', 30], ['Ask for input', false, 'Build a personal greeting with Scanner.', 30]],
            ],
            [
                'Responsive HTML & CSS', 'responsive-html-css', 'Build accessible pages that adapt beautifully from mobile to desktop.', 'Web Development', 'beginner', 360, 'premium',
                [['Semantic HTML', true, 'Give page content a clear, meaningful structure.', 25], ['CSS layout systems', false, 'Use Flexbox and Grid to arrange a responsive interface.', 45], ['Responsive design', false, 'Adapt typography and layouts without sacrificing accessibility.', 40]],
            ],
            [
                'JavaScript for Interfaces', 'javascript-interfaces', 'Turn static pages into useful, approachable interactive experiences.', 'Web Development', 'beginner', 330, 'premium',
                [['Variables and events', true, 'Respond safely to a user action in the browser.', 25], ['DOM updates', false, 'Use selected elements to create dynamic interfaces.', 35], ['Build a calculator', false, 'Bring conditions, functions, and validation together.', 60]],
            ],
        ];
        foreach ($courses as [$title, $slug, $summary, $category, $difficulty, $minutes, $access, $lessons]) {
            $pdo->prepare('INSERT INTO courses (title, slug, short_description, description, category, difficulty, estimated_minutes, access_level, status, published_at, created_at, updated_at) VALUES (:title, :slug, :summary, :description, :category, :difficulty, :minutes, :access, "published", UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE title = VALUES(title), short_description = VALUES(short_description), description = VALUES(description), category = VALUES(category), difficulty = VALUES(difficulty), estimated_minutes = VALUES(estimated_minutes), access_level = VALUES(access_level), status = "published", updated_at = UTC_TIMESTAMP()')->execute([
                'title' => $title, 'slug' => $slug, 'summary' => $summary, 'description' => $summary, 'category' => $category, 'difficulty' => $difficulty, 'minutes' => $minutes, 'access' => $access,
            ]);
            $course = $pdo->prepare('SELECT id FROM courses WHERE slug = :slug');
            $course->execute(['slug' => $slug]);
            $courseId = (int) $course->fetchColumn();
            $pdo->prepare('INSERT INTO course_modules (course_id, title, description, position, created_at, updated_at) VALUES (:course_id, "Core lessons", "A practical, progressive module.", 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE title = VALUES(title), updated_at = UTC_TIMESTAMP()')->execute(['course_id' => $courseId]);
            $module = $pdo->prepare('SELECT id FROM course_modules WHERE course_id = :course_id AND position = 1');
            $module->execute(['course_id' => $courseId]);
            $moduleId = (int) $module->fetchColumn();
            foreach ($lessons as $position => [$lessonTitle, $preview, $body, $lessonMinutes]) {
                $lessonSlug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $lessonTitle), '-'));
                $pdo->prepare('INSERT INTO lessons (module_id, title, slug, body_markdown, estimated_minutes, is_free_preview, status, position, created_at, updated_at) VALUES (:module_id, :title, :slug, :body, :minutes, :preview, "published", :position, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE title = VALUES(title), body_markdown = VALUES(body_markdown), estimated_minutes = VALUES(estimated_minutes), is_free_preview = VALUES(is_free_preview), status = "published", updated_at = UTC_TIMESTAMP()')->execute([
                    'module_id' => $moduleId, 'title' => $lessonTitle, 'slug' => $lessonSlug, 'body' => $body . "\n\nThis seeded lesson is a concise starting point. Add richer course content through the administration workflow before publishing to students.", 'minutes' => $lessonMinutes, 'preview' => $preview ? 1 : 0, 'position' => $position + 1,
                ]);
            }
        }

        $pdo->prepare('INSERT INTO projects (title, slug, description, rubric, status, created_at, updated_at) VALUES ("Student profile page", "student-profile-page", "Create an accessible personal profile page with a responsive layout.", "Use semantic landmarks, readable contrast, and a responsive layout.", "published", UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE description = VALUES(description), rubric = VALUES(rubric), status = "published", updated_at = UTC_TIMESTAMP()')->execute();
        $pdo->prepare('INSERT INTO site_settings (setting_key, setting_value, updated_at) VALUES ("default_currency", "NGN", UTC_TIMESTAMP()), ("payment_mode", "test", UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = UTC_TIMESTAMP()')->execute();
        $pdo->commit();
    } catch (Throwable $exception) {
        $pdo->rollBack();
        throw $exception;
    }
};
