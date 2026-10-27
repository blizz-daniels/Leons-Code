<?php
declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';

use LeonsCode\Auth;
use LeonsCode\CourseRepository;
use LeonsCode\Database;
use LeonsCode\PaystackService;
use LeonsCode\RateLimiter;
use LeonsCode\Security;
use LeonsCode\View;

const PAGES = ['home', 'courses', 'course', 'lesson', 'pricing', 'login', 'register', 'dashboard', 'admin', 'lab', 'web-lab', 'payment-callback', 'privacy', 'terms', 'refund'];

function redirect_page(string $page = 'home', array $parameters = []): never
{
    header('Location: ' . route(in_array($page, PAGES, true) ? $page : 'home', $parameters), true, 303);
    exit;
}

function posted_page(): string
{
    $page = (string) ($_POST['return_page'] ?? 'home');
    return in_array($page, PAGES, true) ? $page : 'home';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        Security::verifyCsrf($_POST['_csrf'] ?? null);
        $action = (string) ($_POST['action'] ?? '');
        if ($action === 'register') {
            $identity = (string) ($_POST['email'] ?? '') . '|' . ($_SERVER['REMOTE_ADDR'] ?? '');
            if (!RateLimiter::allowed('register', $identity, 4, 3600)) {
                throw new \DomainException('Too many registration attempts. Please wait before trying again.');
            }
            try {
                Auth::register((string) ($_POST['name'] ?? ''), (string) ($_POST['email'] ?? ''), (string) ($_POST['password'] ?? ''));
                RateLimiter::clear('register', $identity);
                Security::flash('success', 'Your account is ready. Start with a free lesson or explore the lab.');
                redirect_page('dashboard');
            } catch (Throwable $exception) {
                RateLimiter::hit('register', $identity, 3600);
                throw $exception;
            }
        }
        if ($action === 'login') {
            $email = (string) ($_POST['email'] ?? '');
            $identity = $email . '|' . ($_SERVER['REMOTE_ADDR'] ?? '');
            if (!RateLimiter::allowed('login', $identity, 5, 900)) {
                throw new \DomainException('Too many sign-in attempts. Please wait 15 minutes and try again.');
            }
            $user = Auth::attempt($email, (string) ($_POST['password'] ?? ''));
            if (!$user) {
                RateLimiter::hit('login', $identity);
                throw new \DomainException('We could not sign you in with those details.');
            }
            RateLimiter::clear('login', $identity);
            Security::flash('success', 'Welcome back, ' . $user['name'] . '.');
            redirect_page('dashboard');
        }
        if ($action === 'logout') {
            Auth::logout();
            Security::flash('success', 'You have been signed out.');
            redirect_page('home');
        }
        if ($action === 'enroll') {
            $user = Auth::requireUser();
            CourseRepository::enroll((int) ($_POST['course_id'] ?? 0), (int) $user['id']);
            Security::flash('success', 'You are enrolled. Your learning dashboard is ready.');
            redirect_page('dashboard');
        }
        if ($action === 'complete_lesson') {
            $user = Auth::requireUser();
            CourseRepository::markLessonComplete((int) ($_POST['lesson_id'] ?? 0), (int) $user['id']);
            Security::flash('success', 'Lesson marked complete. Your progress has been saved.');
            redirect_page('dashboard');
        }
        if ($action === 'checkout') {
            $url = PaystackService::beginCheckout(Auth::requireUser(), (int) ($_POST['plan_id'] ?? 0));
            $parts = parse_url($url);
            if (($parts['scheme'] ?? '') !== 'https' || ($parts['host'] ?? '') !== 'checkout.paystack.com') {
                throw new \DomainException('The payment provider returned an unexpected checkout address.');
            }
            header('Location: ' . $url, true, 303);
            exit;
        }
        throw new \DomainException('That form action is not available.');
    } catch (\DomainException $exception) {
        Security::flash('error', $exception->getMessage());
        redirect_page(posted_page());
    } catch (Throwable $exception) {
        Database::log('Request failure: ' . $exception->getMessage());
        Security::flash('error', 'We could not complete that request. Please try again.');
        redirect_page(posted_page());
    }
}

$page = (string) ($_GET['page'] ?? 'home');
if (!in_array($page, PAGES, true)) {
    http_response_code(404);
    View::render('not-found', ['title' => 'Page not found']);
    exit;
}

try {
    if ($page === 'home') {
        View::render('home', ['title' => 'Leon’s Code — Learn to code. Build your future.', 'courses' => array_slice(CourseRepository::catalogue(), 0, 3), 'plans' => CourseRepository::plans()]);
    } elseif ($page === 'courses') {
        $filters = ['q' => (string) ($_GET['q'] ?? ''), 'level' => (string) ($_GET['level'] ?? ''), 'category' => (string) ($_GET['category'] ?? ''), 'sort' => (string) ($_GET['sort'] ?? 'newest')];
        View::render('courses', ['title' => 'Courses — Leon’s Code', 'courses' => CourseRepository::catalogue($filters), 'categories' => CourseRepository::categories(), 'filters' => $filters]);
    } elseif ($page === 'course') {
        $course = CourseRepository::bySlug((string) ($_GET['slug'] ?? ''));
        if (!$course) { http_response_code(404); View::render('not-found', ['title' => 'Course not found']); }
        else { View::render('course', ['title' => $course['title'] . ' — Leon’s Code', 'course' => $course, 'enrolled' => Auth::user() ? CourseRepository::isEnrolled((int) $course['id'], (int) Auth::user()['id']) : false]); }
    } elseif ($page === 'lesson') {
        $lesson = CourseRepository::lesson((int) ($_GET['id'] ?? 0));
        if (!$lesson) { http_response_code(404); View::render('not-found', ['title' => 'Lesson not found']); }
        elseif (!CourseRepository::canAccessLesson($lesson, Auth::user())) { Security::flash('error', 'This lesson requires enrolment and an active plan.'); redirect_page('course', ['slug' => $lesson['course_slug']]); }
        else { View::render('lesson', ['title' => $lesson['title'] . ' — Leon’s Code', 'lesson' => $lesson]); }
    } elseif ($page === 'pricing') {
        View::render('pricing', ['title' => 'Pricing — Leon’s Code', 'plans' => CourseRepository::plans(), 'paymentReady' => PaystackService::configured()]);
    } elseif ($page === 'dashboard') {
        $user = Auth::requireUser();
        View::render('dashboard', ['title' => 'Your dashboard — Leon’s Code', 'dashboard' => CourseRepository::dashboard((int) $user['id'])]);
    } elseif ($page === 'admin') {
        Auth::requireRole('administrator');
        View::render('admin', ['title' => 'Administration — Leon’s Code', 'metrics' => CourseRepository::adminMetrics()]);
    } elseif ($page === 'payment-callback') {
        $reference = (string) ($_GET['reference'] ?? '');
        if ($reference === '') { throw new \DomainException('The payment reference is missing.'); }
        PaystackService::verifyForUser($reference, Auth::requireUser());
        Security::flash('success', 'Payment verified. Your plan access is now active.');
        redirect_page('dashboard');
    } elseif (in_array($page, ['login', 'register'], true)) {
        View::render('auth', ['title' => ucfirst($page) . ' — Leon’s Code', 'mode' => $page]);
    } else {
        View::render($page, ['title' => ucfirst(str_replace('-', ' ', $page)) . ' — Leon’s Code']);
    }
} catch (\DomainException $exception) {
    Security::flash('error', $exception->getMessage());
    redirect_page(Auth::user() ? 'dashboard' : 'login');
} catch (Throwable $exception) {
    Database::log('Page failure: ' . $exception->getMessage());
    if (\LeonsCode\Config::get('APP_ENV', 'local') !== 'local') {
        http_response_code(503);
    }
    View::render('setup', ['title' => 'Finish platform setup — Leon’s Code']);
}
