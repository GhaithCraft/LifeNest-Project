<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/security_headers.php';
require_once __DIR__ . '/includes/session.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/assets.php';
require_once __DIR__ . '/includes/site_settings.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/page_chrome.php';

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

auth_bootstrap();

$brand = site_brand_name();
$canAdmin = is_admin_user();

if (current_user_id() === null) {
    header('Location: /login.php', true, 302);
    exit;
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h($brand) ?> — Notes</title>
  <script src="<?= h(asset_url('/assets/js/core/theme.js')) ?>"></script>
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/app.css')) ?>" />
  <link rel="stylesheet" href="/theme.php" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/shell.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/app_pages.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/notes.css')) ?>" />
</head>
<body>
  <div class="bg"></div>

  <div class="dashboard-shell">

    <?php render_app_sidebar(['active' => 'notes', 'brand' => $brand, 'logo_url' => site_logo_url(), 'can_admin' => $canAdmin]); ?>

    <div class="dashboard-main">
      <?php render_app_topbar(['title' => 'Notes', 'eyebrow' => 'Notes workspace', 'search_id' => 'noteGlobalSearch', 'search_placeholder' => 'Search notes', 'search_aria' => 'Search notes', 'can_admin' => $canAdmin]); ?>

      <?php render_app_drawer(['active' => 'notes', 'can_admin' => $canAdmin]); ?>

  <main class="page" role="main">
    <section class="nt-hero-compact" aria-label="Notes page heading">
      <h1 class="nt-hero-compact__date" id="ntHeroDate">Monday, July 17, 2023</h1>
    </section>

    <section class="nt-grid" aria-label="Notes workspace">
      <article class="card nt-panel nt-panel--filters" aria-label="Views and filters">
        <div class="card__header nt-panel__header nt-panel__header--filters">
          <div class="nt-panel__heading">
            <h2 class="card__title">Note Views &amp; Filters</h2>
            <p class="card__subtitle nt-panel__subtitle">Switch between note views, narrow the feed by task, and browse linked categories from one clean control panel.</p>
          </div>
        </div>

        <div class="nt-panel__body">

          <div class="nt-views" role="tablist" aria-label="Note views">
            <button class="nt-view is-active" type="button" data-view="all" role="tab" aria-selected="true">
              <span class="nt-view__ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>
              <span class="nt-view__label">All Notes</span>
              <span class="nt-view__badge" id="cntAll">0</span>
            </button>

            <button class="nt-view" type="button" data-view="recent" role="tab" aria-selected="false">
              <span class="nt-view__ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0-9-9 9 9 0 0 0 9 9Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
              <span class="nt-view__label">Recent</span>
              <span class="nt-view__badge" id="cntRecent">0</span>
            </button>

            <button class="nt-view" type="button" data-kind="study" role="tab" aria-selected="false">
              <span class="nt-view__ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M20 5h-6a3 3 0 0 0-3 3v14a3 3 0 0 1 3-3h6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>
              <span class="nt-view__label">Study</span>
              <span class="nt-view__badge" id="cntStudy">0</span>
            </button>

            <button class="nt-view" type="button" data-kind="personal" role="tab" aria-selected="false">
              <span class="nt-view__ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>
              <span class="nt-view__label">Personal</span>
              <span class="nt-view__badge" id="cntPersonal">0</span>
            </button>
          </div>

          <div class="nt-block">
            <div class="nt-block__title">Filtered by Tasks</div>
            <div class="nt-task-filter">
              <div class="select-wrap nt-task-filter__select">
                <select class="select select--native" id="filterTask" aria-label="Filter by task">
                  <option value="">All tasks</option>
                </select>
                <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <button class="btn btn--ghost btn--sm" type="button" id="btnClearFilters" hidden>Clear</button>
            </div>
          </div>

          <div class="nt-block">
            <div class="nt-block__title">Filtered by Categories</div>
            <div class="nt-cats" id="catList" aria-label="Tasks with notes"></div>
          </div>

          <div class="nt-hint" id="leftHint" aria-live="polite"></div>
        </div>
      </article>
      <article class="card nt-panel nt-panel--feed nt-panel--feed-wide" aria-label="Note feed">
        <div class="card__header">
          <h2 class="card__title" id="feedTitle">Note Feed - All Notes</h2>
          <div class="card__tools">
            <span class="muted nt-sort" id="feedSortHint">Sorted newest-first</span>
          </div>
        </div>

        <div class="nt-feed-toolbar">
          <button class="nt-feed-add" type="button" id="btnAddFromFeed" title="Add note" aria-label="Add note">+</button>
        </div>

        <div class="nt-feed" id="noteFeed" aria-label="Notes list"></div>

        <div class="nt-empty" id="ntEmpty" hidden>
          No notes found for the current filters.
        </div>
      </article>
    </section>

    <div class="nt-modal" id="noteDetailsModal" hidden aria-hidden="true">
      <div class="nt-modal__backdrop" data-close="note-details" aria-hidden="true"></div>
      <div class="nt-modal__dialog card nt-panel nt-panel--details" role="dialog" aria-modal="true" aria-labelledby="dtTaskTitle">
        <div class="card__header nt-detail-header nt-detail-header--modal">
          <div class="nt-detail-header__copy">
            <div class="nt-detail-header__eyebrow" id="dtModalMode">Note details</div>
            <div class="nt-detail-header__sub">Edit a linked note. Changes save automatically.</div>
          </div>
          <div class="nt-detail-header__tools">
            <button class="nt-modal__close" type="button" id="btnCloseNoteDetails" aria-label="Close note details">
              <svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>

        <div class="nt-details">
          <div class="nt-task">
            <div class="nt-note-preview-title-wrap">
              <div class="nt-task__title" id="dtTaskTitle">Select a note</div>
              <div class="nt-note-preview-link" id="dtPreviewLinkedTask">Linked Task: —</div>
            </div>

            <div class="nt-note-actionbar" aria-label="Note actions">
              <button class="nt-action-btn" type="button" id="btnEditNote" disabled>
                <span class="nt-action-btn__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4Zm11-13 4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span>Undo</span>
              </button>
              <button class="nt-action-btn" type="button" id="btnFavoriteNote" aria-pressed="false">
                <span class="nt-action-btn__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="m12 20-1.4-1.3C5.4 13.8 2 10.7 2 6.9 2 4 4.2 2 7 2c1.6 0 3.2.8 4 2 1-1.2 2.4-2 4-2 2.8 0 5 2 5 4.9 0 3.8-3.4 6.9-8.6 11.8L12 20Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span>Favorite</span>
              </button>
              <button class="nt-action-btn nt-action-btn--danger" type="button" id="btnDeleteNote" disabled>
                <span class="nt-action-btn__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span>Delete</span>
              </button>
              <button class="nt-action-btn" type="button" id="btnClearNote">
                <span class="nt-action-btn__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span>Clear</span>
              </button>
            </div>

            <div class="nt-task__meta nt-task__meta--preview">
              <span class="pill pill--mint" id="dtTaskKind" hidden>personal</span>
              <span class="pill pill--sm pill--amber" id="dtPriority" hidden>medium</span>
              <span class="pill pill--sm pill--red" id="dtStatus" hidden>todo</span>
              <span class="pill pill--sm pill--soft" id="dtFavoriteBadge" hidden>Favorite</span>
              <span class="nt-note-time" id="dtNoteTime">—</span>
            </div>

            <section class="nt-editor-shell" id="noteEditor" data-color="blue" aria-label="Note editor">
              <div class="nt-editor-shell__head">
                <div class="nt-editor-shell__copy">
                  <div class="nt-editor-shell__title">Note Content</div>
                  <div class="nt-editor-shell__hint">Add an optional note title, then write the full content separately. Existing notes save automatically while you type.</div>
                </div>
                <div class="nt-editor-shell__status" id="noteColorCurrent">Blue note</div>
              </div>
              <label class="sr-only" for="noteTitle">Note title</label>
              <input class="input nt-note-title-input" id="noteTitle" type="text" maxlength="160" placeholder="Note title (optional)" aria-label="Note title" />
              <label class="sr-only" for="noteBody">Note body</label>
              <textarea class="textarea" id="noteBody" rows="12" placeholder="Write your note here..." aria-label="Note body"></textarea>
            </section>

            <div class="nt-note-meta-grid" aria-label="Task fields">
              <div class="nt-field"><div class="nt-field__label">Due Date</div><div class="nt-field__value" id="dtDue">—</div></div>
              <div class="nt-field"><div class="nt-field__label">Duration</div><div class="nt-field__value" id="dtDur">—</div></div>
              <div class="nt-field"><div class="nt-field__label">Created</div><div class="nt-field__value" id="dtTaskCreated">—</div></div>
              <div class="nt-field"><div class="nt-field__label">Updated</div><div class="nt-field__value" id="dtTaskUpdated">—</div></div>
            </div>

            <div class="nt-note__link nt-note__link--detail">
              <label class="sr-only" for="detailTaskSelect">Linked task</label>
              <div class="select-wrap">
                <select class="select select--native" id="detailTaskSelect">
                  <option value="">Linked Task…</option>
                </select>
                <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </div>

            <div class="nt-color">
              <div class="nt-color__label">Note color</div>
              <div class="nt-colors" id="noteColorPicker" role="group" aria-label="Note color">
                <button class="nt-color-chip is-active" type="button" data-color="blue" aria-pressed="true" aria-label="Blue" title="Blue">
                  <span class="nt-color-chip__swatch" aria-hidden="true"></span>
                  <span class="nt-color-chip__label">Blue</span>
                </button>
                <button class="nt-color-chip" type="button" data-color="mint" aria-pressed="false" aria-label="Mint" title="Mint">
                  <span class="nt-color-chip__swatch" aria-hidden="true"></span>
                  <span class="nt-color-chip__label">Mint</span>
                </button>
                <button class="nt-color-chip" type="button" data-color="yellow" aria-pressed="false" aria-label="Yellow" title="Yellow">
                  <span class="nt-color-chip__swatch" aria-hidden="true"></span>
                  <span class="nt-color-chip__label">Yellow</span>
                </button>
                <button class="nt-color-chip" type="button" data-color="pink" aria-pressed="false" aria-label="Pink" title="Pink">
                  <span class="nt-color-chip__swatch" aria-hidden="true"></span>
                  <span class="nt-color-chip__label">Pink</span>
                </button>
                <button class="nt-color-chip" type="button" data-color="gray" aria-pressed="false" aria-label="Gray" title="Gray">
                  <span class="nt-color-chip__swatch" aria-hidden="true"></span>
                  <span class="nt-color-chip__label">Gray</span>
                </button>
              </div>
            </div>

            <div class="nt-note__actions nt-note__actions--bottom">
              <button class="btn btn--primary" type="button" id="btnAddNote">New Note</button>
              <a class="btn btn--ghost" href="/tasks.php" id="btnOpenTasks">Open Tasks</a>
            </div>

            <div class="nt-hint" id="noteHint" aria-live="polite"></div>
          </div>
        </div>
      </div>
    </div>

    <footer class="footer" role="contentinfo">
      <div class="footer__text">Last synced: <span id="lastSynced">—</span>.&nbsp;&nbsp; Secure Connection.&nbsp;&nbsp; Version 2.1.</div>
    </footer>
  </main>

  <nav class="bottom-nav" aria-label="Bottom navigation">
    <a class="bottom-nav__item" href="/index.php" aria-label="Home">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z" fill="currentColor"/>
      </svg>
      <span>Home</span>
    </a>

    <a class="bottom-nav__item" href="/tasks.php" aria-label="Tasks">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h14v2H7V4Zm0 7h14v2H7v-2Zm0 7h14v2H7v-2ZM3 5.5l1.2 1.2L6.4 4.5l1.1 1.1L4.2 9 2 6.8 3 5.5Zm0 7 1.2 1.2L6.4 11.5l1.1 1.1L4.2 16 2 13.8 3 12.5Zm0 7 1.2 1.2L6.4 18.5l1.1 1.1L4.2 23 2 20.8 3 19.5Z" fill="currentColor"/>
      </svg>
      <span>Tasks</span>
    </a>

    <a class="bottom-nav__item bottom-nav__item--ghost" href="#" aria-label="Add note" data-action="add-note">
      <span class="nav-fab" aria-hidden="true">+</span>
    </a>

    <a class="bottom-nav__item" href="/study.php" aria-label="Study">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5 12 2l8 3.5v12L12 21l-8-3.5v-12Zm8 1.9L6 6v9.6l6 2.6 6-2.6V6l-6 1.4Z" fill="currentColor"/>
      </svg>
      <span>Study</span>
    </a>

    <a class="bottom-nav__item" href="/finance.php" aria-label="Finance">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C7.6 2 4 5.6 4 10s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8Zm1 13.5V17h-2v-1.5c-1.2-.2-2.2-1-2.4-2.2l2-.4c.1.6.6 1.1 1.4 1.1.8 0 1.3-.4 1.3-1 0-.7-.7-.9-1.8-1.2-1.6-.4-2.9-1-2.9-2.7 0-1.3 1-2.3 2.4-2.6V3h2v1.5c1 .2 1.9.9 2.2 2l-2 .5c-.1-.5-.5-.9-1.2-.9-.7 0-1.2.3-1.2.9 0 .6.6.8 1.8 1.1 1.8.4 2.9 1.2 2.9 2.8 0 1.4-1 2.4-2.3 2.6Z" fill="currentColor"/>
      </svg>
      <span>Finance</span>
    </a>

    <a class="bottom-nav__item bottom-nav__item--more" href="#" aria-label="More" data-action="drawer">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor"/>
      </svg>
      <span>More</span>
    </a>
  </nav>

    </div>
  </div>

  <script src="<?= h(asset_url('/assets/js/core/app.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/shell.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/notes.js')) ?>"></script>
</body>
</html>
