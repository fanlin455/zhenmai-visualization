(() => {
  const panel = document.getElementById("visual-screen");
  const image = panel?.querySelector(".hero-image");
  const overlay = document.getElementById("trace-connections");
  if (!panel || !image || !overlay) return;
  const links = [
    { name: "seismic", chart: "demo-seismic", x: .24, y: .39, lane: .07 },
    { name: "well", chart: "demo-well", x: .711, y: .35, lane: .93 },
  ];
  const update = () => {
    const scene = overlay.getBoundingClientRect();
    const box = image.getBoundingClientRect();
    if (!scene.width || !scene.height || !box.width || !box.height) return;
    overlay.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
    const width = image.naturalWidth || Number(image.getAttribute("width"));
    const height = image.naturalHeight || Number(image.getAttribute("height"));
    const scale = Math.min(box.width / width, box.height / height);
    const left = box.left - scene.left + (box.width - width * scale) / 2;
    const top = box.top - scene.top + (box.height - height * scale) / 2;
    links.forEach((link) => {
      const target = document.getElementById(link.chart).getBoundingClientRect();
      const startX = left + width * scale * link.x;
      const startY = top + height * scale * link.y;
      const endX = target.left - scene.left + target.width / 2;
      const endY = target.top - scene.top;
      const elbowX = left + width * scale * link.lane;
      const elbowY = endY - 8;
      const entry = link.name === "well"
        ? `M${startX},${startY} L${startX},${top + height * scale * .06} L${elbowX},${top + height * scale * .06}`
        : `M${startX},${startY} L${elbowX},${startY}`;
      document.getElementById(`${link.name}-connector`).setAttribute("d",
        `${entry} L${elbowX},${elbowY} L${endX},${elbowY} L${endX},${endY}`);
    });
  };
  image.addEventListener("load", update);
  window.addEventListener("resize", update);
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    observer.observe(image);
  }
  update();
})();
