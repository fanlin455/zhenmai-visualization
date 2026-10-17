(() => {
  'use strict';

  const canvas = document.querySelector('[data-narrative-screen]');
  const viewport = document.querySelector('[data-narrative-viewport]');
  if (!canvas || !viewport) return;

  const DESIGN_WIDTH = 1920;
  let frame = 0;

  const fitToViewport = () => {
    frame = 0;
    const viewportRect = viewport.getBoundingClientRect();
    const viewportWidth = Math.max(1, viewportRect.width);
    const viewportHeight = Math.max(1, viewportRect.height);
    const scale = viewportWidth / DESIGN_WIDTH;
    const designHeight = viewportHeight / scale;
    canvas.style.setProperty('--narrative-fit-scale', String(scale));
    canvas.style.height = `${designHeight}px`;
    canvas.dataset.fitScale = scale.toFixed(4);
    canvas.dataset.designHeight = designHeight.toFixed(1);
  };

  const scheduleFit = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fitToViewport);
  };

  fitToViewport();
  addEventListener('resize', scheduleFit, { passive: true });
  globalThis.visualViewport?.addEventListener('resize', scheduleFit, { passive: true });
  if ('ResizeObserver' in globalThis) new ResizeObserver(scheduleFit).observe(viewport);
})();
