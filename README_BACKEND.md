# LifeNest Backend Scaffold (PHP)

هذا تمهيد باك-إند آمن (CSP بدون inline + Sessions + CSRF + Prepared Statements) جاهز للتوسعة.

## 1) تشغيل سريع
- ارفع الملفات على استضافة PHP.
- انسخ `.env.example` إلى `.env` (أو عرّف المتغيرات كـ Environment Variables في الاستضافة).
- أنشئ قاعدة بيانات MySQL ثم نفّذ:
  - `migrations/001_init.sql`

## 2) نقاط مهمة
- واجهة الموقع تُخدم عبر `index.php` وتستورد `index.html` كما هي.
- كل Endpoints تحت `/api/` تُرجع JSON.
- أي تعديل (POST/PATCH/DELETE) يتطلب CSRF عبر الهيدر: `X-CSRF-Token`.

## 3) Endpoints الحالية
- `GET /api/bootstrap.php` -> يرجع `csrf_token` + user (إن كان مسجّل دخول)
- Auth:
  - `POST /api/auth/register.php`
  - `POST /api/auth/login.php`
  - `POST /api/auth/logout.php`
  - `GET  /api/auth/me.php`
- Tasks:
  - `GET /api/tasks.php`
  - `POST /api/tasks.php`
  - `PATCH /api/tasks.php?id=123`
  - `DELETE /api/tasks.php?id=123`
- Budget/Expenses:
  - `GET /api/budget.php?month=YYYY-MM`
  - `POST /api/budget.php`
  - `GET /api/expenses.php?limit=10`
  - `POST /api/expenses.php`
- Study:
  - `GET /api/study.php`
  - `POST /api/study.php`
  - `PATCH /api/study.php?id=123`
