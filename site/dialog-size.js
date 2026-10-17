(() => {
  const dialog = document.getElementById("data-check-dialog");
  const reference = document.getElementById("seismic-reference-card");
  if (!dialog || !reference) return;
  const sync = () => {
    const box = reference.getBoundingClientRect();
    if (!box.width || !box.height) return;
    dialog.style.setProperty("--validation-width", `${(box.width * 1.25).toFixed(2)}px`);
    dialog.style.setProperty("--validation-height", `${(box.height * 1.5625).toFixed(2)}px`);
  };
  globalThis.syncValidationDialogSize = sync;
  const resize = () => { if (dialog.open) sync(); };
  window.addEventListener("resize", resize);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(reference);
})();
