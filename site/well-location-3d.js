(() => {
  const palette = ["#56cfe7", "#97a9f3", "#36c69e", "#e8b971", "#de8cbd", "#9bda87"];
  const bounds = values => {
    let min = Infinity, max = -Infinity;
    values.forEach(v => { min = Math.min(min, v); max = Math.max(max, v); });
    if (min === max) { const pad = Math.max(Math.abs(min) * .02, 1); min -= pad; max += pad; }
    return { min, max };
  };
  const number = value => Math.abs(value) >= 100000 ? value.toExponential(2) : String(Number(value.toFixed(1)));
  const render = (target, data, options = {}) => {
    if (!data.positions?.length) throw new Error("缺少井位坐标。");
    const positions = data.positions;
    const xr = bounds(positions.map(p => p.x)), yr = bounds(positions.map(p => p.y));
    const zr = bounds(data.hasZ ? positions.map(p => p.z).concat(data.zMode === "depth" ? [0] : []) : [0]);
    const normalized = positions.map(p => ({
      ...p, v: [(p.x - xr.min) / (xr.max - xr.min) * 2 - 1, (p.y - yr.min) / (yr.max - yr.min) * 2 - 1,
        data.hasZ ? (data.zMode === "depth" ? 1 : -1) * (1 - (p.z - zr.min) / (zr.max - zr.min) * 2) : 1],
    }));
    const groups = new Map();
    normalized.forEach(p => { if (!groups.has(p.name)) groups.set(p.name, []); groups.get(p.name).push(p); });
    if (data.zMode === "depth") groups.forEach(points => points.sort((a, b) => a.z - b.z));
    const canvas = document.createElement("canvas");
    canvas.className = "well-location-canvas"; canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "自动旋转的三维井位分布。拖动或方向键旋转，空格暂停自转，滚轮或加减键缩放，双击或0键复位。");
    target.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    let width = 800, height = 320, yaw = -.6, pitch = .36, zoom = 1, dragging = null, screenPoints = [], disposed = false;
    let automatic = true, animationFrame = 0, previousFrame = 0;
    const project = v => {
      const rx = v[0] * Math.cos(yaw) - v[1] * Math.sin(yaw);
      const ry = v[0] * Math.sin(yaw) + v[1] * Math.cos(yaw);
      const vertical = v[2] * Math.cos(pitch) - ry * Math.sin(pitch);
      const depth = ry * Math.cos(pitch) + v[2] * Math.sin(pitch);
      const scale = Math.min(width * .25, height * .26) * zoom * 5 / (5 - depth);
      const horizontal = Math.max(1, Math.min(2.8, width / (height * 2)));
      return { x: width * .5 + rx * scale * horizontal, y: height * .53 - vertical * scale, depth };
    };
    const line = (a, b, color, weight = 1, dashed = false) => {
      const p = project(a), q = project(b);
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.setLineDash(dashed ? [4, 4] : []);
      ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
    };
    const label = (v, text, color = "#9db9cd", dx = 0, dy = 0) => {
      const p = project(v); ctx.fillStyle = color; ctx.fillText(text, p.x + dx, p.y + dy);
    };
    const draw = () => {
      if (disposed) return;
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height); ctx.fillStyle = options.background || "#08182a"; ctx.fillRect(0, 0, width, height);
      ctx.font = `${height < 160 ? 10 : 12}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`; ctx.textAlign = "left";
      const floor = data.hasZ && data.zMode !== "depth" ? -1 : 1;
      for (let i = 0; i <= 5; i++) {
        const t = -1 + i * .4;
        line([t, -1, floor], [t, 1, floor], "#203e56");
        line([-1, t, floor], [1, t, floor], "#203e56");
        if (data.hasZ) { line([-1, -1, t], [1, -1, t], "#1c344b"); line([1, -1, t], [1, 1, t], "#1c344b"); }
      }
      const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
      if (data.hasZ) [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([a,b]) => line(corners[a], corners[b], "#315574"));
      else [[4,5],[5,6],[6,7],[7,4]].forEach(([a,b]) => line(corners[a], corners[b], "#315574"));
      line([-1,-1,floor], [1,-1,floor], "#62bdd5", 1.3);
      line([-1,-1,floor], [-1,1,floor], "#86a5dc", 1.3);
      if (data.hasZ) line([-1,-1,-1], [-1,-1,1], "#57b797", 1.3);
      label([1,-1,floor], `${data.xLabel}: ${number(xr.max)}`, "#a7cee0", 6, 4);
      label([-1,1,floor], `${data.yLabel}: ${number(yr.max)}`, "#a7cee0", -65, 15);
      label([-1,-1,floor], `${number(xr.min)}, ${number(yr.min)}`, "#7799b4", -60, 17);
      if (data.hasZ) {
        const topValue = data.zMode === "depth" ? zr.min : zr.max;
        const bottomValue = data.zMode === "depth" ? zr.max : zr.min;
        label([-1,-1,1], `${data.zLabel}: ${number(topValue)}`, "#8ccdb9", -58, -8);
        label([-1,-1,-1], number(bottomValue), "#8ccdb9", -38, 0);
      }
      const ordered = Array.from(groups.entries()).map(([name, points], i) => ({ name, points, color: palette[i % palette.length], depth: points.reduce((sum,p) => sum + project(p.v).depth, 0) / points.length })).sort((a,b) => a.depth - b.depth);
      screenPoints = [];
      ordered.forEach(({ name, points, color }) => {
        for (let i = 1; i < points.length; i++) line(points[i-1].v, points[i].v, color, 2.4);
        const orderedPoints = points.map(p => ({ p, projected: project(p.v) })).sort((a,b) => a.projected.depth - b.projected.depth);
        orderedPoints.forEach(({ p, projected }) => {
          ctx.beginPath(); ctx.arc(projected.x, projected.y, points.length > 1 ? 2.8 : 4.5, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill(); screenPoints.push({ ...projected, point: p });
        });
        if (groups.size <= 6) {
          const p = project(points[0].v); ctx.fillStyle = color; ctx.fillText(name.slice(0, 20), p.x + 5, p.y - 5);
        }
      });
      if (groups.size > 6) {
        const count = Math.min(12, groups.size), gap = Math.min(16, (height - 55) / count);
        Array.from(groups.keys()).slice(0, count).forEach((name, i) => {
          const x = Math.max(width * .81, width - 115), y = 34 + i * gap;
          ctx.fillStyle = palette[i % palette.length]; ctx.beginPath(); ctx.arc(x, y - 4, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillText(name.length > 12 ? name.slice(0, 11) + "…" : name, x + 8, y);
        });
      }
      ctx.fillStyle = "#a5c5db"; ctx.fillText(`${groups.size}口井/点位 · ${positions.length}个三维点`, 12, 18);
      if (!data.hasZ) { ctx.fillStyle = "#c9b18b"; ctx.fillText("未提供Z：点位按Z=0显示", 12, 34); }
      ctx.fillStyle = "#7195ae"; ctx.fillText(`${automatic ? "自动旋转" : "自转暂停"} · 拖动接管 · 空格切换 · 滚轮缩放`, 12, height - 10);
    };
    const fit = () => {
      const box = target.getBoundingClientRect();
      width = Math.max(200, box.width || 800); height = Math.max(100, box.height || 320);
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); draw();
    };
    const reset = () => { yaw = -.6; pitch = .36; zoom = 1; automatic = true; previousFrame = 0; draw(); };
    const onDown = event => {
      if (event.button !== undefined && event.button !== 0) return;
      dragging = { x: event.clientX, y: event.clientY, id: event.pointerId }; canvas.setPointerCapture?.(event.pointerId);
    };
    const onMove = event => {
      if (dragging) {
        yaw += (event.clientX - dragging.x) * .008;
        pitch = Math.max(-1.05, Math.min(1.05, pitch + (event.clientY - dragging.y) * .006));
        dragging.x = event.clientX; dragging.y = event.clientY; draw(); return;
      }
      const box = canvas.getBoundingClientRect(), x = (event.clientX - box.left) * width / (box.width || width), y = (event.clientY - box.top) * height / (box.height || height);
      const nearest = screenPoints.find(p => Math.hypot(p.x - x, p.y - y) < 8);
      canvas.title = nearest ? `${nearest.point.name} | ${data.xLabel}=${nearest.point.x}, ${data.yLabel}=${nearest.point.y}, ${data.zLabel}=${nearest.point.z}` : "拖动旋转三维井位图";
    };
    const onUp = () => { dragging = null; };
    const onWheel = event => { event.preventDefault(); zoom = Math.max(.55, Math.min(2, zoom * Math.exp(-event.deltaY * .001))); draw(); };
    const onKey = event => {
      if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","=","-","0"," "].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "0") return reset();
      if (event.key === " ") { automatic = !automatic; previousFrame = 0; draw(); return; }
      if (event.key === "ArrowLeft") yaw -= .12;
      if (event.key === "ArrowRight") yaw += .12;
      if (event.key === "ArrowUp") pitch = Math.min(1.05, pitch + .08);
      if (event.key === "ArrowDown") pitch = Math.max(-1.05, pitch - .08);
      if (["+","="].includes(event.key)) zoom = Math.min(2, zoom * 1.12);
      if (event.key === "-") zoom = Math.max(.55, zoom / 1.12);
      draw();
    };
    const handlers = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp, lostpointercapture: onUp, wheel: onWheel, dblclick: reset, keydown: onKey };
    Object.entries(handlers).forEach(([type, listener]) => canvas.addEventListener(type, listener, type === "wheel" ? { passive: false } : undefined));
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    const animate = time => {
      if (disposed) return;
      const delta = previousFrame ? Math.min(time - previousFrame, 50) : 16;
      previousFrame = time;
      if (automatic && !dragging && !document.hidden) { yaw += delta * .00016; draw(); }
      animationFrame = requestAnimationFrame(animate);
    };
    observer?.observe(target); globalThis.addEventListener?.("resize", fit); fit();
    animationFrame = requestAnimationFrame(animate);
    return () => {
      disposed = true; cancelAnimationFrame(animationFrame); observer?.disconnect(); globalThis.removeEventListener?.("resize", fit);
      Object.entries(handlers).forEach(([type, listener]) => canvas.removeEventListener(type, listener));
    };
  };
  globalThis.WellLocation3D = { render };
})();
