(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function ensureSearchMessage(card) {
    var box = qs('#accountSearchMessage', card);
    if (box) return box;
    box = document.createElement('div');
    box.id = 'accountSearchMessage';
    box.className = 'help';
    box.hidden = true;
    card.insertBefore(box, qs('.help', card) || null);
    return box;
  }

  function filterAccountSections(rawQuery) {
    var card = qs('.auth-card');
    if (!card) return;

    var message = ensureSearchMessage(card);
    var query = String(rawQuery || '').trim().toLowerCase();
    var matches = 0;

    qsa('.section-title', card).forEach(function (heading) {
      var form = heading.nextElementSibling;
      var haystack = heading.textContent || '';
      if (form) haystack += ' ' + (form.textContent || '');
      var matched = !query || haystack.toLowerCase().indexOf(query) !== -1;
      heading.hidden = !matched;
      if (form) form.hidden = !matched;
      if (matched) matches += 1;
    });

    if (!query) {
      message.hidden = true;
      return;
    }

    message.hidden = false;
    if (matches > 0) {
      message.textContent = 'Showing ' + matches + ' matching settings section' + (matches === 1 ? '.' : 's.');
      var firstHeading = qsa('.section-title', card).filter(function (el) { return !el.hidden; })[0] || null;
      if (firstHeading) {
        try { firstHeading.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      }
    } else {
      message.textContent = 'No settings section matches this search.';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.addEventListener('lifenest:topbar-search', function (event) {
      var detail = event && event.detail ? event.detail : {};
      if (String(detail.scope || '') !== 'account') return;
      filterAccountSections(detail.query || '');
    });
  });
})();
