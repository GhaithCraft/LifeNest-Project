(function () {
  'use strict';

  function setMenu(open) {
    const menuButton = document.querySelector('[data-landing-menu]');
    const mobilePanel = document.querySelector('[data-landing-mobile]');
    if (!menuButton || !mobilePanel) return;

    menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    mobilePanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    mobilePanel.classList.toggle('is-open', open);
    document.body.classList.toggle('is-menu-open', open);
  }

  function initMobileMenu() {
    const menuButton = document.querySelector('[data-landing-menu]');
    const closeButton = document.querySelector('[data-landing-close]');
    const mobilePanel = document.querySelector('[data-landing-mobile]');
    if (!menuButton || !mobilePanel) return;

    menuButton.addEventListener('click', function () {
      const isExpanded = menuButton.getAttribute('aria-expanded') === 'true';
      setMenu(!isExpanded);
    });

    if (closeButton) {
      closeButton.addEventListener('click', function () {
        setMenu(false);
      });
    }

    mobilePanel.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target === mobilePanel || target.closest('a')) {
        setMenu(false);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenu(false);
    });
  }

  function initPreviewTabs() {
    const buttons = Array.from(document.querySelectorAll('[data-preview-tab]'));
    const panels = Array.from(document.querySelectorAll('.landing-preview-panel'));
    if (!buttons.length || !panels.length) return;

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        const targetId = button.getAttribute('data-preview-tab');
        if (!targetId) return;

        buttons.forEach(function (item) {
          const isActive = item === button;
          item.classList.toggle('is-active', isActive);
          item.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        panels.forEach(function (panel) {
          const isActive = panel.id === targetId;
          panel.classList.toggle('is-active', isActive);
          panel.hidden = !isActive;
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initMobileMenu();
    initPreviewTabs();
  });
}());
