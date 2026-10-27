<?php
declare(strict_types=1);

namespace LeonsCode;

use DomainException;
use PDO;

final class CourseRepository
{
    public static function catalogue(array $filters = []): array
    {
        $clauses = ['c.status = "published"'];
        $parameters = [];
        if (($query = trim((string) ($filters['q'] ?? ''))) !== '') {
            $clauses[] = '(c.title LIKE :query OR c.short_description LIKE :query)';
            $parameters['query'] = '%' . $query . '%';
        }
        if (($level = $filters['level'] ?? '') && in_array($level, ['beginner', 'intermediate', 'advanced'], true)) {
            $clauses[] = 'c.difficulty = :level';
            $parameters['level'] = $level;
        }
        if (($category = trim((string) ($filters['category'] ?? ''))) !== '') {
            $clauses[] = 'c.category = :category';
            $parameters['category'] = $category;
        }
        $sorts = [
            'newest' => 'c.published_at DESC, c.id DESC',
            'title' => 'c.title ASC',
            'duration' => 'c.estimated_minutes ASC',
        ];
        $sort = $sorts[$filters['sort'] ?? 'newest'] ?? $sorts['newest'];
        $sql = 'SELECT c.*, u.name AS instructor_name, COUNT(DISTINCT l.id) AS lesson_count FROM courses c LEFT JOIN users u ON u.id = c.instructor_id LEFT JOIN course_modules m ON m.course_id = c.id LEFT JOIN lessons l ON l.module_id = m.id AND l.status = "published" WHERE ' . implode(' AND ', $clauses) . ' GROUP BY c.id ORDER BY ' . $sort;
        $statement = Database::connection()->prepare($sql);
        $statement->execute($parameters);
        return $statement->fetchAll();
    }

    public static function categories(): array
    {
        return Database::connection()->query('SELECT DISTINCT category FROM courses WHERE status = "published" AND category IS NOT NULL ORDER BY category')->fetchAll(PDO::FETCH_COLUMN);
    }

    public static function bySlug(string $slug): ?array
    {
        $statement = Database::connection()->prepare('SELECT c.*, u.name AS instructor_name FROM courses c LEFT JOIN users u ON u.id = c.instructor_id WHERE c.slug = :slug AND c.status = "published" LIMIT 1');
        $statement->execute(['slug' => $slug]);
        $course = $statement->fetch();
        if (!$course) {
            return null;
        }
        $modules = Database::connection()->prepare('SELECT m.*, l.id AS lesson_id, l.title AS lesson_title, l.slug AS lesson_slug, l.is_free_preview, l.estimated_minutes AS lesson_minutes FROM course_modules m LEFT JOIN lessons l ON l.module_id = m.id AND l.status = "published" WHERE m.course_id = :course_id ORDER BY m.position, l.position');
        $modules->execute(['course_id' => $course['id']]);
        $course['modules'] = $modules->fetchAll();
        return $course;
    }

    public static function lesson(int $id): ?array
    {
        $statement = Database::connection()->prepare('SELECT l.*, m.title AS module_title, c.id AS course_id, c.title AS course_title, c.slug AS course_slug, c.access_level FROM lessons l JOIN course_modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.id = :id AND l.status = "published" AND c.status = "published" LIMIT 1');
        $statement->execute(['id' => $id]);
        return $statement->fetch() ?: null;
    }

    public static function canAccessLesson(array $lesson, ?array $user): bool
    {
        if ((int) $lesson['is_free_preview'] === 1 || $lesson['access_level'] === 'free') {
            return true;
        }
        if (!$user) {
            return false;
        }
        return self::isEnrolled((int) $lesson['course_id'], (int) $user['id']) && self::hasPaidAccess((int) $user['id']);
    }

    public static function enroll(int $courseId, int $userId): void
    {
        $course = Database::connection()->prepare('SELECT access_level, status FROM courses WHERE id = :id LIMIT 1');
        $course->execute(['id' => $courseId]);
        $record = $course->fetch();
        if (!$record || $record['status'] !== 'published') {
            throw new DomainException('This course is not available for enrolment.');
        }
        if ($record['access_level'] === 'premium' && !self::hasPaidAccess($userId)) {
            throw new DomainException('Choose an active plan before enrolling in this premium course.');
        }
        Database::connection()->prepare('INSERT INTO enrollments (user_id, course_id, enrolled_at, last_accessed_at) VALUES (:user_id, :course_id, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE last_accessed_at = UTC_TIMESTAMP()')->execute(['user_id' => $userId, 'course_id' => $courseId]);
    }

    public static function isEnrolled(int $courseId, int $userId): bool
    {
        $statement = Database::connection()->prepare('SELECT 1 FROM enrollments WHERE user_id = :user_id AND course_id = :course_id LIMIT 1');
        $statement->execute(['user_id' => $userId, 'course_id' => $courseId]);
        return (bool) $statement->fetchColumn();
    }

    public static function hasPaidAccess(int $userId): bool
    {
        $statement = Database::connection()->prepare('SELECT 1 FROM subscriptions WHERE user_id = :user_id AND status IN ("active", "non_renewing") AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP()) LIMIT 1');
        $statement->execute(['user_id' => $userId]);
        return (bool) $statement->fetchColumn();
    }

    public static function markLessonComplete(int $lessonId, int $userId): void
    {
        $lesson = self::lesson($lessonId);
        if (!$lesson || !self::canAccessLesson($lesson, Auth::user())) {
            throw new DomainException('This lesson is not available to your account.');
        }
        Database::transaction(function (PDO $pdo) use ($lesson, $lessonId, $userId): void {
            $pdo->prepare('INSERT INTO lesson_progress (user_id, lesson_id, status, completed_at, updated_at) VALUES (:user_id, :lesson_id, "completed", UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status = "completed", completed_at = COALESCE(completed_at, UTC_TIMESTAMP()), updated_at = UTC_TIMESTAMP()')->execute(['user_id' => $userId, 'lesson_id' => $lessonId]);
            $pdo->prepare('UPDATE enrollments SET last_accessed_at = UTC_TIMESTAMP() WHERE user_id = :user_id AND course_id = :course_id')->execute(['user_id' => $userId, 'course_id' => $lesson['course_id']]);
        });
    }

    public static function dashboard(int $userId): array
    {
        $courses = Database::connection()->prepare('SELECT c.id, c.title, c.slug, c.short_description, c.difficulty, c.estimated_minutes, COUNT(DISTINCT l.id) AS lessons_total, COUNT(DISTINCT CASE WHEN lp.status = "completed" THEN lp.lesson_id END) AS lessons_complete, MAX(e.last_accessed_at) AS last_accessed_at FROM enrollments e JOIN courses c ON c.id = e.course_id LEFT JOIN course_modules m ON m.course_id = c.id LEFT JOIN lessons l ON l.module_id = m.id AND l.status = "published" LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = e.user_id WHERE e.user_id = :user_id GROUP BY c.id ORDER BY last_accessed_at DESC');
        $courses->execute(['user_id' => $userId]);
        $subscription = Database::connection()->prepare('SELECT s.*, p.name AS plan_name, p.interval_unit FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.user_id = :user_id ORDER BY s.updated_at DESC LIMIT 1');
        $subscription->execute(['user_id' => $userId]);
        return ['courses' => $courses->fetchAll(), 'subscription' => $subscription->fetch() ?: null];
    }

    public static function plans(): array
    {
        return Database::connection()->query('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY display_order, amount_kobo')->fetchAll();
    }

    public static function plan(int $id): ?array
    {
        $statement = Database::connection()->prepare('SELECT * FROM subscription_plans WHERE id = :id AND is_active = 1 LIMIT 1');
        $statement->execute(['id' => $id]);
        return $statement->fetch() ?: null;
    }

    public static function adminMetrics(): array
    {
        $pdo = Database::connection();
        return [
            'students' => (int) $pdo->query('SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.name = "student" AND u.status = "active"')->fetchColumn(),
            'enrollments' => (int) $pdo->query('SELECT COUNT(*) FROM enrollments')->fetchColumn(),
            'active_subscriptions' => (int) $pdo->query('SELECT COUNT(*) FROM subscriptions WHERE status IN ("active", "non_renewing") AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())')->fetchColumn(),
            'verified_revenue' => (int) $pdo->query('SELECT COALESCE(SUM(amount_kobo), 0) FROM payments WHERE status = "success"')->fetchColumn(),
            'pending_payments' => (int) $pdo->query('SELECT COUNT(*) FROM payments WHERE status = "pending"')->fetchColumn(),
            'courses' => (int) $pdo->query('SELECT COUNT(*) FROM courses WHERE status = "published"')->fetchColumn(),
        ];
    }
}
