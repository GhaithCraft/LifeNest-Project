/*
  dashboard/shell.js
  - Stable namespace + lightweight event bus.
  - Module init registry: scans [data-module] and initializes matching modules.
  - No DOM restructuring.
*/
(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});

  LN.bus = LN.bus || {
    emit: function (name, detail) {
      try {
        document.dispatchEvent(new CustomEvent(String(name), { detail: detail || {} }));
      } catch (_) {
        var ev = document.createEvent('CustomEvent');
        ev.initCustomEvent(String(name), false, false, detail || {});
        document.dispatchEvent(ev);
      }
    },
    on: function (name, handler) {
      document.addEventListener(String(name), handler);
      return function () { document.removeEventListener(String(name), handler); };
    }
  };

  LN.modules = LN.modules || {};

  LN.initModules = LN.initModules || function initModules() {
    var nodes = document.querySelectorAll('[data-module]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || !el.getAttribute) continue;
      if (el.getAttribute('data-ln-inited') === '1') continue;
      var name = (el.getAttribute('data-module') || '').trim();
      if (!name) continue;
      var fn = LN.modules && LN.modules[name];
      if (typeof fn !== 'function') continue;
      el.setAttribute('data-ln-inited', '1');
      try { fn(el); } catch (_) {}
    }
  };

  function onReady() {
    try { LN.initModules(); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
