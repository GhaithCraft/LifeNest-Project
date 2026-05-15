(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.study = LN.study || {};
  LN.modules = LN.modules || {};

  var _bound = false;
  var _root = null;

  function core() {
    return (LN && LN.core) ? LN.core : null;
  }

  function qs(sel, root) {
    var c = core();
    if (c && c.qs) return c.qs(sel, root);
    return (root || document).querySelector(sel);
  }

  function setText(id, txt) {
    var c = core();
    if (c && c.setText) return c.setText(id, txt);
    var el = (typeof id === 'string') ? qs('#' + id) : id;
    if (!el) return;
    el.textContent = (txt === null || typeof txt === 'undefined') ? '' : String(txt);
  }

  function clampInt(n, a, b) {
    var x = parseInt(String(n), 10);
    if (!isFinite(x)) x = 0;
    if (x < a) x = a;
    if (x > b) x = b;
    return x;
  }

  function fmtDateYMD(ymd) {
    var c = core();
    if (c && c.fmtDateYMD) return c.fmtDateYMD(ymd);
    return String(ymd || '');
  }

  function state() {
    var c = core();
    return c ? c.state : null;
  }

  function api(method, url, body) {
    var c = core();
    if (!c || !c.api) return Promise.reject(new Error('API not ready'));
    return c.api(method, url, body);
  }

  function loadDashboard() {
    var c = core();
    if (!c || !c.loadDashboard) return Promise.resolve();
    return c.loadDashboard();
  }

  function panelRoot() {
    return _root || qs('.panel--study');
  }

  function gridEl() {
    var r = panelRoot();
    return qs('#studyGrid', r || document);
  }

  function render(items) {
    var st = state();
    var root = gridEl();
    if (!root || !st) return;

    root.innerHTML = '';
    st.studyById = {};

    if (!items || !items.length) {
      var empty = document.createElement('div');
      empty.className = 'study-card';
      empty.innerHTML = '<div class="study-card__top"><div class="study-card__title">No study items yet</div></div><div class="study-card__note">Add one from the button below</div>';
      root.appendChild(empty);
      return;
    }

    items.forEach(function (it) {
      st.studyById[String(it.id)] = it;
      var planned = clampInt(it.planned_minutes || 0, 0, 1000000);
      var done = clampInt(it.done_minutes || 0, 0, 1000000);
      var pct = planned > 0 ? Math.round((done / planned) * 100) : 0;
      pct = clampInt(pct, 0, 100);

      var card = document.createElement('div');
      card.className = 'study-card';
      card.setAttribute('data-study-id', String(it.id));

      var top = document.createElement('div');
      top.className = 'study-card__top';

      var t = document.createElement('div');
      t.className = 'study-card__title';
      t.textContent = String(it.title || '');
      top.appendChild(t);

      var more = document.createElement('button');
      more.className = 'icon-btn icon-btn--tiny';
      more.type = 'button';
      more.setAttribute('data-action', 'edit-study');
      more.setAttribute('aria-label', 'More');
      more.innerHTML = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/></svg>';
      top.appendChild(more);

      card.appendChild(top);

      var hours = document.createElement('div');
      hours.className = 'study-card__hours';
      hours.textContent = Math.floor(done / 60) + '/' + Math.floor(planned / 60) + 'h';
      card.appendChild(hours);

      var bar = document.createElement('div');
      bar.className = 'study-card__bar p' + pct;
      bar.setAttribute('aria-label', 'Study progress');
      bar.innerHTML = '<div class="study-card__track"></div><div class="study-card__fill"></div>';
      card.appendChild(bar);

      var note = document.createElement('div');
      note.className = 'study-card__note';
      note.textContent = it.next_due_date ? ('next due ' + fmtDateYMD(it.next_due_date)) : 'no due date';
      card.appendChild(note);

      root.appendChild(card);
    });
  }

  function resetForm() {
    var st = state();
    if (!st) return;

    st.editStudyId = null;
    if (qs('#studyId')) qs('#studyId').value = '';
    setText('modalStudyTitle', 'Add Study Task');
    setText('studyFormHint', '');
    if (qs('#studyDeleteBtn')) qs('#studyDeleteBtn').hidden = true;
    if (qs('#studyTitle')) qs('#studyTitle').value = '';
    if (qs('#studyPlanned')) qs('#studyPlanned').value = '60';
    if (qs('#studyDone')) qs('#studyDone').value = '0';
    if (qs('#studyDue')) qs('#studyDue').value = '';
  }

  async function openEditor(studyId) {
    var st = state();
    if (!st) return;

    var it = st.studyById ? (st.studyById[String(studyId)] || null) : null;
    if (!it) {
      var d = await api('GET', '/api/study.php');
      var list = d.items || [];
      st.studyById = {};
      for (var i = 0; i < list.length; i++) st.studyById[String(list[i].id)] = list[i];
      it = st.studyById[String(studyId)] || null;
    }
    if (!it) throw new Error('Study item not found');

    st.editStudyId = String(studyId);
    if (qs('#studyId')) qs('#studyId').value = String(studyId);
    setText('modalStudyTitle', 'Edit Study Task');
    setText('studyFormHint', '');
    if (qs('#studyDeleteBtn')) qs('#studyDeleteBtn').hidden = false;

    if (qs('#studyTitle')) qs('#studyTitle').value = String(it.title || '');
    if (qs('#studyPlanned')) qs('#studyPlanned').value = String(it.planned_minutes || 0);
    if (qs('#studyDone')) qs('#studyDone').value = String(it.done_minutes || 0);
    if (qs('#studyDue')) qs('#studyDue').value = it.next_due_date ? String(it.next_due_date) : '';

    if (window.LifeNestUI) window.LifeNestUI.openModal('study');
  }

  async function deleteById(studyId) {
    var st = state();
    await api('DELETE', '/api/study.php?id=' + encodeURIComponent(studyId), {});

    if (st && String(st.editStudyId || '') === String(studyId)) {
      resetForm();
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalStudy');
    }

    await loadDashboard();
  }

  async function submitForm(e) {
    e.preventDefault();

    var st = state();
    if (!st) return;

    setText('studyFormHint', '');

    var title = (qs('#studyTitle') && qs('#studyTitle').value || '').trim();
    var planned = clampInt(qs('#studyPlanned') ? qs('#studyPlanned').value : 0, 0, 1000000);
    var done = clampInt(qs('#studyDone') ? qs('#studyDone').value : 0, 0, 1000000);
    var due = (qs('#studyDue') && qs('#studyDue').value) || null;

    if (!title) {
      setText('studyFormHint', 'Write a title.');
      return;
    }

    try {
      if (st.editStudyId) {
        await api('PATCH', '/api/study.php?id=' + encodeURIComponent(st.editStudyId), {
          title: title,
          planned_minutes: planned,
          done_minutes: done,
          next_due_date: due || null
        });
      } else {
        await api('POST', '/api/study.php', {
          title: title,
          planned_minutes: planned,
          done_minutes: done,
          next_due_date: due || null
        });
      }

      setText('studyFormHint', 'Saved.');
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalStudy');
      resetForm();
      await loadDashboard();
    } catch (err) {
      setText('studyFormHint', err && err.message ? err.message : 'Failed.');
    }
  }

  function bindGlobal() {
    if (_bound) return;
    _bound = true;

    // Reset form before opening (speed dial, menu items, etc.)
    var openers = document.querySelectorAll('[data-open="study"]');
    for (var i = 0; i < openers.length; i++) {
      openers[i].addEventListener('click', function () {
        resetForm();
      }, true);
    }

    var stForm = qs('#studyForm');
    if (stForm) stForm.addEventListener('submit', submitForm);

    var del = qs('#studyDeleteBtn');
    if (del) {
      del.addEventListener('click', function (e) {
        e.preventDefault();
        var st = state();
        if (!st || !st.editStudyId) return;
        if (!window.confirm('Delete this study item?')) return;
        deleteById(st.editStudyId).catch(function () {});
      });
    }
  }

  function bindPanel(root) {
    // Edit button (delegation)
    var sg = qs('#studyGrid', root);
    if (sg) {
      sg.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-action="edit-study"]') : null;
        if (!btn) return;
        var card = btn.closest('.study-card');
        if (!card) return;
        var sid = card.getAttribute('data-study-id');
        if (!sid) return;
        openEditor(sid).catch(function () {});
      });
    }

    // Add button
    var addStudy = qs('#btnAddStudy', root);
    if (addStudy) {
      addStudy.addEventListener('click', function (e) {
        e.preventDefault();
        resetForm();
        if (window.LifeNestUI) window.LifeNestUI.openModal('study');
      });
    }
  }

  function init(root) {
    _root = root || _root;
    bindGlobal();
    if (root) bindPanel(root);
  }

  // Public API
  LN.study.render = render;
  LN.study.resetForm = resetForm;
  LN.study.openEditor = openEditor;
  LN.study.deleteById = deleteById;
  LN.study.submitForm = submitForm;

  // Module registry hook
  LN.modules.study = init;
})();
