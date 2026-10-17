(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const CLOSE_DURATION = 180;
  const OPEN_DURATION = 240;
  let navigationPending = false;

  const commitNavigation = (destination, replace = false) => {
    if (replace) location.replace(destination);
    else location.assign(destination);
  };

  const beginNavigation = (destination, replace = false) => {
    if (navigationPending) return;
    if (reduceMotion) {
      commitNavigation(destination, replace);
      return;
    }

    navigationPending = true;
    root.classList.remove('page-entering', 'page-ready');
    root.classList.add('page-leaving');
    setTimeout(() => commitNavigation(destination, replace), CLOSE_DURATION);
  };

  globalThis.ZhenmaiNavigate = (destination, options = {}) => {
    beginNavigation(destination, Boolean(options.replace));
  };

  const reveal = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.add('page-ready');
      setTimeout(() => root.classList.remove('page-entering', 'page-ready'), OPEN_DURATION + 30);
    }));
  };

  if (!reduceMotion) {
    root.classList.add('page-entering');
    if (document.readyState === 'complete') reveal();
    else addEventListener('load', reveal, { once: true });
  }

  document.addEventListener('click', event => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    ) return;

    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;

    const url = new URL(anchor.href, location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;

    event.preventDefault();
    beginNavigation(url.href);
  });

  addEventListener('pageshow', event => {
    if (event.persisted) {
      navigationPending = false;
      root.classList.remove('page-entering', 'page-ready', 'page-leaving');
    }
  });
})();
