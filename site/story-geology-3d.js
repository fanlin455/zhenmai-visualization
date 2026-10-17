(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const PALETTE = ['#58e3ea', '#e1bd5c', '#df786b', '#8b9ff0', '#55c7a5', '#ed9f58'];
  const LAYER_COLORS = ['#58e3ea', '#e1bd5c', '#df786b', '#8b9ff0'];
  const WELL_X = [-0.678, -0.016, 0.611]; // A-01 / A-02 / A-03，来自 72 / 220 / 360 道
  const WELL_NAMES = ['A-01', 'A-02', 'A-03'];
  const F3 = globalThis.F3GeologyData || null;
  const DATA = globalThis.StoryAnalysisData || null;
  const F3_NAMES = ['H1', 'H2', 'D0', 'H3'];
  const META = {
    regional: { title: '公开 F3 地层块体', legend: [['#69d4c3', 'H1'], ['#d8b76d', 'H2'], ['#d18269', 'D0'], ['#8c94ce', 'H3']] },
    strata: { title: '公开 F3 层位拆解', legend: [['#69d4c3', 'H1'], ['#d8b76d', 'H2'], ['#d18269', 'D0'], ['#8c94ce', 'H3']] },
    welltie: { title: '井震围栏空间', legend: [['#e85462', '正振幅'], ['#3f78dc', '负振幅'], ['#52e3ba', '井轨迹']] },
    fault: { title: 'F1 错断构造', legend: [['#ff5b70', '断裂面'], ['#4bd6e7', '上盘'], ['#ed9f58', '下盘']] },
    reservoir: { title: '储层属性体', legend: [['#ffd45a', '高响应'], ['#47d9d3', '中响应'], ['#52658a', '低响应']] }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rgba = (hex, alpha = 1) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
  };
  const mix = (hex, amount) => {
    const n = parseInt(hex.slice(1), 16);
    const f = amount < 0 ? 0 : 255;
    const p = Math.abs(amount);
    const c = (v) => Math.round(v + (f - v) * p);
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  };
  const noise = (a, b, c = 0) => {
    const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
    return v - Math.floor(v);
  };

  class GeologyScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.type = canvas.dataset.scene || 'regional';
      this.useF3 = Boolean(F3 && (this.type === 'regional' || this.type === 'strata'));
      this.useAnalysis = Boolean(DATA && !this.useF3);
      this.selectedTrace = Number(sessionStorage.getItem('geology-selected-trace')) || 220;
      this.layerOpacity = 0.55;
      this.verticalExaggeration = 1;
      this.layerVisibility = [true, true, true, true];
      this.showContours = true;
      this.reservoirInterval = Number(sessionStorage.getItem('geology-reservoir-interval')) || 0;
      this.reservoirThreshold = Number(sessionStorage.getItem('geology-reservoir-threshold')) || DATA?.stats?.targetThreshold || 0.85;
      this.shell = canvas.closest('.story-interactive-3d');
      this.canvas.dataset.renderer = 'canvas-fallback';
      document.documentElement.dataset.geologyRenderer = 'canvas-fallback';
      this.yaw = ({ regional: -0.56, strata: -0.56, welltie: -0.62, fault: -0.58, reservoir: -0.48 })[this.type];
      this.pitch = ({ regional: -0.34, strata: -0.34, welltie: -0.18, fault: -0.28, reservoir: -0.34 })[this.type];
      this.zoom = ({ regional: 1.28, strata: 1.42, welltie: 1.18, fault: 1.18, reservoir: 1.15 })[this.type];
      this.auto = true;
      this.dragging = false;
      this.last = null;
      this.base = { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom };
      this.primitives = [];
      this.labels = [];
      this.bind();
      this.resize();
    }

    bind() {
      const c = this.canvas;
      const hint = this.shell?.querySelector('.story-3d-hint');
      if (hint) hint.textContent = '兼容渲染 · 自动旋转 · 拖拽接管 · 滚轮缩放';
      let motion = this.shell?.querySelector('.story-3d-motion');
      if (!motion && this.shell) {
        motion = document.createElement('button');
        motion.className = 'story-3d-motion';
        motion.type = 'button';
        this.shell.insertBefore(motion, this.shell.querySelector('.story-3d-reset'));
      }
      const syncMotion = () => {
        if (!motion) return;
        motion.textContent = this.auto ? '暂停自转' : '开始自转';
        motion.setAttribute('aria-pressed', String(this.auto));
      };
      this.syncMotion = syncMotion;
      motion?.addEventListener('click', () => { this.auto = !this.auto; syncMotion(); });
      syncMotion();
      c.addEventListener('pointerdown', (event) => {
        c.setPointerCapture(event.pointerId);
        this.dragging = true;
        this.last = [event.clientX, event.clientY];
        c.classList.add('is-dragging');
      });
      c.addEventListener('pointermove', (event) => {
        if (!this.dragging) return;
        const dx = event.clientX - this.last[0];
        const dy = event.clientY - this.last[1];
        this.yaw += dx * 0.009;
        this.pitch = clamp(this.pitch + dy * 0.007, -1.12, 0.42);
        this.last = [event.clientX, event.clientY];
      });
      const stop = () => {
        this.dragging = false;
        this.last = null;
        c.classList.remove('is-dragging');
      };
      c.addEventListener('pointerup', stop);
      c.addEventListener('pointercancel', stop);
      c.addEventListener('wheel', (event) => {
        event.preventDefault();
        this.zoom = clamp(this.zoom * Math.exp(-event.deltaY * 0.0011), 0.66, 1.85);
      }, { passive: false });
      c.addEventListener('dblclick', () => this.reset());
      c.addEventListener('keydown', (event) => {
        const actions = {
          ArrowLeft: () => { this.yaw -= 0.12; },
          ArrowRight: () => { this.yaw += 0.12; },
          ArrowUp: () => { this.pitch = clamp(this.pitch - 0.1, -1.12, 0.42); },
          ArrowDown: () => { this.pitch = clamp(this.pitch + 0.1, -1.12, 0.42); },
          Home: () => this.reset(),
          ' ': () => { this.auto = !this.auto; syncMotion(); }
        };
        if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
      });
      this.shell?.querySelector('.story-3d-reset')?.addEventListener('click', () => this.reset());
      window.addEventListener('geology:trace', (event) => { this.selectedTrace = event.detail.trace; });
      window.addEventListener('geology:layers', (event) => {
        const detail = event.detail || {};
        if (Array.isArray(detail.visibility)) this.layerVisibility = detail.visibility;
        if (Number.isFinite(detail.opacity)) this.layerOpacity = detail.opacity;
        if (Number.isFinite(detail.exaggeration)) this.verticalExaggeration = detail.exaggeration;
        if (typeof detail.contours === 'boolean') this.showContours = detail.contours;
      });
      window.addEventListener('geology:reservoir', (event) => {
        if (Number.isFinite(event.detail?.interval)) this.reservoirInterval = event.detail.interval;
        if (Number.isFinite(event.detail?.threshold)) this.reservoirThreshold = event.detail.threshold;
      });
      new ResizeObserver(() => this.resize()).observe(this.shell || c);
    }

    reset() {
      this.yaw = this.base.yaw;
      this.pitch = this.base.pitch;
      this.zoom = this.base.zoom;
      this.auto = true;
      this.syncMotion?.();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(300, Math.round(rect.width));
      const h = Math.max(230, Math.round(rect.height));
      if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
      }
      this.w = w;
      this.h = h;
      this.dpr = dpr;
    }

    horizon(k, x, y, displaced = true) {
      if (this.useF3) {
        const layer = clamp(k - 1, 0, F3.horizons.length - 1);
        const columns = F3.x.length, rows = F3.y.length;
        const fx = clamp((x + 1) * 0.5 * (columns - 1), 0, columns - 1);
        const fy = clamp((y + 0.72) / 1.44 * (rows - 1), 0, rows - 1);
        const x0 = Math.floor(fx), x1 = Math.min(columns - 1, x0 + 1), tx = fx - x0;
        const y0 = Math.floor(fy), y1 = Math.min(rows - 1, y0 + 1), ty = fy - y0;
        const values = F3.horizons[layer].values;
        const at = (row, col) => values[row * columns + col];
        const a = at(y0, x0) * (1 - tx) + at(y0, x1) * tx;
        const b = at(y1, x0) * (1 - tx) + at(y1, x1) * tx;
        const time = a * (1 - ty) + b * ty;
        const [minTime, maxTime] = F3.timeRange;
        const z = 0.45 - (time - minTime) / (maxTime - minTime) * 1.28;
        if (k === 0) return (z + 0.19) * this.verticalExaggeration;
        if (k === F3.horizons.length + 1) return (z - 0.2) * this.verticalExaggeration;
        return z * this.verticalExaggeration;
      }
      if (this.useAnalysis) {
        const lines = DATA.horizons.timesMs;
        const column = clamp((x + 1) * 0.5 * (DATA.grid.traces.length - 1), 0, DATA.grid.traces.length - 1);
        const c0 = Math.floor(column), c1 = Math.min(DATA.grid.traces.length - 1, c0 + 1), t = column - c0;
        const at = (index) => lines[index][c0] * (1 - t) + lines[index][c1] * t;
        const time = k <= 0 ? at(0) - 55 : k >= lines.length + 1 ? at(lines.length - 1) + 55 : at(k - 1);
        const z = 0.58 - (time - DATA.grid.timesMs[0]) / (DATA.grid.timesMs.at(-1) - DATA.grid.timesMs[0]) * 1.62;
        return z * this.verticalExaggeration;
      }
      const levels = [0.55, 0.29, 0.06, -0.2, -0.48, -0.78, -1.03];
      const broad = 0.045 * Math.sin((x + 1.05) * 2.7 + k * 0.31) + 0.025 * Math.cos(y * 3.1 - x * 1.4);
      const channel = k > 1 ? -0.035 * Math.exp(-Math.pow(x + 0.34 - y * 0.16, 2) / 0.055) : 0;
      const throwScale = [0, 0.046, 0.05, 0.055, 0.061, 0.067, 0.073][k];
      const fault = displaced && x > 0.22 ? throwScale : 0;
      return levels[k] + broad + channel - fault;
    }

    project(point) {
      const [x, y, z] = point;
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const rx = cy * x - sy * y;
      const ry = sy * x + cy * y;
      const rz = cp * z - sp * ry;
      const depth = sp * z + cp * ry;
      const perspective = 3.4 / (4.25 - depth);
      const scale = Math.min(this.w * 0.39, this.h * 0.5) * this.zoom;
      return [this.w * 0.5 + rx * scale * perspective, this.h * 0.53 - rz * scale * perspective, depth, perspective];
    }

    poly(points, fill, stroke = null, width = 0.6) {
      const p = points.map((v) => this.project(v));
      this.primitives.push({ kind: 'poly', p, fill, stroke, width, depth: p.reduce((s, v) => s + v[2], 0) / p.length });
    }

    line(points, color, width = 1, dash = null) {
      const p = points.map((v) => this.project(v));
      this.primitives.push({ kind: 'line', p, color, width, dash, depth: p.reduce((s, v) => s + v[2], 0) / p.length });
    }

    dot(point, color, radius = 2, shape = 'circle') {
      const p = this.project(point);
      this.primitives.push({ kind: 'dot', p, color, radius: radius * p[3], shape, depth: p[2] });
    }

    text(point, label, color = '#cceaf3', align = 'center') {
      this.labels.push({ p: this.project(point), label, color, align });
    }

    surface(k, color, alpha = 0.48, options = {}) {
      const nx = options.nx || 16, ny = options.ny || 8;
      const x0 = options.x0 ?? -1, x1 = options.x1 ?? 1;
      const y0 = options.y0 ?? -0.72, y1 = options.y1 ?? 0.72;
      const zOff = options.zOff || 0;
      for (let ix = 0; ix < nx; ix++) {
        const xa = x0 + (x1 - x0) * ix / nx, xb = x0 + (x1 - x0) * (ix + 1) / nx;
        for (let iy = 0; iy < ny; iy++) {
          const ya = y0 + (y1 - y0) * iy / ny, yb = y0 + (y1 - y0) * (iy + 1) / ny;
          const pts = [[xa, ya, this.horizon(k, xa, ya, options.displaced) + zOff], [xb, ya, this.horizon(k, xb, ya, options.displaced) + zOff], [xb, yb, this.horizon(k, xb, yb, options.displaced) + zOff], [xa, yb, this.horizon(k, xa, yb, options.displaced) + zOff]];
          const shade = (noise(ix, iy, k) - 0.5) * 0.18;
          const fill = rgba(mix(color, shade), alpha);
          const stroke = rgba(color, options.wireAlpha ?? 0.15);
          const width = options.wireWidth || 0.45;
          // Triangulate the Canvas fallback so it retains the same geological
          // mesh language as the Three.js WebGL renderer.
          this.poly([pts[0], pts[1], pts[2]], fill, stroke, width);
          this.poly([pts[0], pts[2], pts[3]], fill, stroke, width);
        }
      }
    }

    frontLayers(x0 = -1, x1 = 1, rightOffset = 0, range = [0, 6]) {
      const nx = 28, y = -0.72;
      for (let k = range[0]; k < range[1]; k++) {
        for (let ix = 0; ix < nx; ix++) {
          const xa = x0 + (x1 - x0) * ix / nx, xb = x0 + (x1 - x0) * (ix + 1) / nx;
          const localOffset = rightOffset && xa > 0.22 ? rightOffset : 0;
          const pts = [[xa, y, this.horizon(k, xa, y) + localOffset], [xb, y, this.horizon(k, xb, y) + localOffset], [xb, y, this.horizon(k + 1, xb, y) + localOffset], [xa, y, this.horizon(k + 1, xa, y) + localOffset]];
          const shade = (noise(ix, k) - 0.5) * 0.16;
          this.poly(pts, rgba(mix(PALETTE[k], shade), 0.92), rgba(PALETTE[k], 0.38), 0.55);
        }
      }
    }

    drawRegional() {
      const intervalCount = this.useF3 ? 5 : 6;
      this.frontLayers(-1, 1, 0, [0, intervalCount]);
      this.surface(0, '#237e79', 0.84, { wireAlpha: 0.2, nx: this.useF3 ? 20 : 16, ny: this.useF3 ? 12 : 8 });
      for (let k = 1; k < intervalCount; k++) {
        const z = this.horizon(k, -1, -0.72), z2 = this.horizon(k, -1, 0.72);
        this.poly([[-1, -0.72, z], [-1, 0.72, z2], [-1, 0.72, this.horizon(k + 1, -1, 0.72)], [-1, -0.72, this.horizon(k + 1, -1, -0.72)]], rgba(PALETTE[k], 0.67), rgba(PALETTE[k], 0.25));
      }
      if (this.useF3) {
        this.text([-1, -0.76, 0.72], 'X 605836 m', '#8dd9e5', 'left');
        this.text([1, -0.76, 0.72], 'X 629576 m', '#8dd9e5', 'right');
        this.text([-0.98, 0.7, -1.02], 'TWT · ms', '#d6b871', 'left');
        return;
      }
      WELL_X.forEach((x, i) => {
        const y = -0.28 + i * 0.23;
        this.line([[x, y, 0.73], [x, y, -0.95]], '#55f0c0', 2.6);
        this.dot([x, y, 0.73], '#eafff8', 4);
        this.text([x, y, 0.82], WELL_NAMES[i], '#a8ffe6');
      });
      this.line([[0.22, -0.72, 0.53], [0.22, -0.72, -0.92]], '#ff6074', 1.6, [4, 3]);
      this.text([0.22, -0.72, 0.68], 'F1', '#ff8291');
    }

    drawStrata() {
      const count = this.useF3 ? 4 : 5;
      for (let k = 1; k <= count; k++) {
        if (this.useF3 && this.layerVisibility[k - 1] === false) continue;
        const explode = 0;
        const colour = this.useF3 ? LAYER_COLORS[k - 1] : PALETTE[k - 1];
        this.surface(k, colour, this.useF3 ? Math.max(.42, this.layerOpacity) : 0.55, { zOff: explode, nx: this.useF3 ? 32 : 20, ny: this.useF3 ? 20 : 12, wireAlpha: this.showContours ? 0.76 : 0.08, wireWidth: this.showContours ? 0.52 : 0.35 });
        this.text([-1.05, 0.69, this.horizon(k, -1, 0.69) + explode], this.useF3 ? F3_NAMES[k - 1] : `H${k}`, colour, 'right');
      }
      if (this.useF3) return;
      WELL_X.forEach((x, i) => {
        this.line([[x, 0.02, 0.75], [x, 0.02, -0.92]], rgba('#efffff', 0.75), 1.2, [4, 3]);
        this.text([x, 0.02, 0.82], WELL_NAMES[i], '#d8f5fa');
      });
    }

    amplitude(x, z) {
      if (this.useAnalysis) {
        const col = clamp(Math.round((x + 1) * 0.5 * (DATA.grid.traces.length - 1)), 0, DATA.grid.traces.length - 1);
        const row = clamp(Math.round((0.58 - z / this.verticalExaggeration) / 1.62 * (DATA.grid.timesMs.length - 1)), 0, DATA.grid.timesMs.length - 1);
        return DATA.grid.seismic[row][col] / 127;
      }
      let value = 0;
      for (let k = 1; k <= 5; k++) {
        const hz = this.horizon(k, x, -0.7);
        value += Math.sin((z - hz) * 58 + k * 0.7) * Math.exp(-Math.pow(z - hz, 2) / 0.015);
      }
      return Math.tanh(value * 0.78 + 0.18 * Math.sin(x * 17 + z * 35));
    }

    drawWelltie() {
      [1, 3, 5].forEach((k, i) => this.surface(k, PALETTE[i * 2], 0.14, { nx: 12, ny: 6, wireAlpha: 0.2 }));
      const nx = 42, nz = 30, y = -0.76;
      for (let ix = 0; ix < nx; ix++) {
        const xa = -1 + 2 * ix / nx, xb = -1 + 2 * (ix + 1) / nx;
        for (let iz = 0; iz < nz; iz++) {
          const za = 0.57 - 1.58 * iz / nz, zb = 0.57 - 1.58 * (iz + 1) / nz;
          const a = this.amplitude((xa + xb) / 2, (za + zb) / 2);
          const color = a >= 0 ? '#ee4f5c' : '#376fd1';
          this.poly([[xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb]], rgba(color, 0.2 + Math.abs(a) * 0.75), null);
        }
      }
      WELL_X.forEach((x, i) => {
        const yWell = -0.77 + i * 0.18;
        this.line([[x, yWell, 0.76], [x + (i - 1) * 0.035, yWell, -0.98]], '#50e8b8', 3.4);
        for (let k = 1; k <= 5; k++) this.dot([x, yWell, this.horizon(k, x, yWell)], PALETTE[k - 1], 3.4);
        this.text([x, yWell, 0.84], WELL_NAMES[i], '#b3ffe7');
      });
    }

    drawFault() {
      this.frontLayers(-1, 0.17, 0);
      this.frontLayers(0.29, 1, this.useAnalysis ? 0 : -0.12);
      this.surface(0, '#2e9185', 0.74, { x0: -1, x1: 0.17, nx: 9, ny: 7, wireAlpha: 0.22 });
      this.surface(0, '#2e9185', 0.74, { x0: 0.29, x1: 1, nx: 7, ny: 7, zOff: this.useAnalysis ? 0 : -0.12, wireAlpha: 0.22 });
      const uncertainty = this.useAnalysis ? 0.055 : 0;
      if (uncertainty) this.poly([[0.19 - uncertainty, -0.76, 0.7], [0.3 - uncertainty, 0.76, 0.52], [0.3 - uncertainty, 0.76, -1.04], [0.19 - uncertainty, -0.76, -0.92]], rgba('#ff9c6a', 0.1), rgba('#ffb077', 0.35), 0.8);
      this.poly([[0.19, -0.76, 0.68], [0.3, 0.76, 0.5], [0.3, 0.76, -1.03], [0.19, -0.76, -0.9]], rgba('#f5435f', 0.34), rgba('#ff7080', 0.95), 1.5);
      if (uncertainty) this.poly([[0.19 + uncertainty, -0.76, 0.66], [0.3 + uncertainty, 0.76, 0.48], [0.3 + uncertainty, 0.76, -1.02], [0.19 + uncertainty, -0.76, -0.88]], rgba('#ff9c6a', 0.1), rgba('#ffb077', 0.35), 0.8);
      for (let z = -0.75; z <= 0.35; z += 0.28) this.line([[-0.03, -0.2, z], [0.1, -0.2, z + 0.12]], '#65e7f0', 1.4);
      this.text([0.25, 0.58, 0.7], 'F1 断裂面', '#ff8493');
      this.text([-0.48, -0.1, 0.77], '上盘', '#70e8ef');
      this.text([0.63, -0.1, 0.55], '下盘', '#ffc477');
    }

    drawReservoir() {
      const topIndex = clamp(this.reservoirInterval + 1, 1, 4), baseIndex = topIndex + 1;
      this.surface(topIndex, '#5edee1', 0.12, { nx: 13, ny: 7, wireAlpha: 0.26 });
      this.surface(baseIndex, '#e7b657', 0.14, { nx: 13, ny: 7, wireAlpha: 0.3 });
      for (let i = 0; i < 360; i++) {
        const x = -0.98 + 1.96 * noise(i, 2);
        const y = -0.68 + 1.36 * noise(i, 7);
        const top = this.horizon(topIndex, x, y), bottom = this.horizon(baseIndex, x, y);
        const z = bottom + (top - bottom) * noise(i, 11);
        let score;
        if (this.useAnalysis) {
          const col = clamp(Math.round((x + 1) * 0.5 * (DATA.grid.traces.length - 1)), 0, DATA.grid.traces.length - 1);
          const time = DATA.horizons.timesMs[topIndex - 1][col] + (DATA.horizons.timesMs[baseIndex - 1][col] - DATA.horizons.timesMs[topIndex - 1][col]) * noise(i, 11);
          const row = clamp(Math.round((time - DATA.grid.timesMs[0]) / (DATA.grid.timesMs.at(-1) - DATA.grid.timesMs[0]) * (DATA.grid.timesMs.length - 1)), 0, DATA.grid.timesMs.length - 1);
          score = DATA.grid.reservoir[row][col] / 255;
        } else {
          const axis = -0.2 + 0.35 * Math.sin(y * 2.6);
          score = clamp(1 - Math.abs(x - axis) / 0.72 + 0.18 * Math.sin(y * 5 + x * 3), 0, 1);
        }
        if (score < this.reservoirThreshold || noise(i, 19) > 0.22 + score * 0.7) continue;
        const color = score > 0.67 ? '#ffd45a' : score > 0.37 ? '#43d8d0' : '#546b91';
        this.dot([x, y, z], rgba(color, 0.44 + score * 0.5), 2.4 + score * 2.5, i % 4 ? 'square' : 'circle');
      }
      WELL_X.forEach((x, i) => {
        const y = -0.2 + i * 0.2;
        this.line([[x, y, 0.65], [x, y, -0.7]], '#f5fbff', 1.8);
        this.text([x, y, 0.75], WELL_NAMES[i], '#e6fbff');
      });
      this.text([-0.18, 0.18, 0.05], `H${topIndex}—H${baseIndex} · ≥${this.reservoirThreshold.toFixed(2)}`, '#ffe77c');
    }

    drawSelectedTrace() {
      if (this.useF3) return;
      const x = -1 + 2 * this.selectedTrace / 447;
      this.line([[x, -0.79, 0.66], [x, -0.79, -1.02]], '#f7fbff', 1.15, [4, 3]);
      this.dot([x, -0.79, 0.66], '#ffffff', 4.2);
      this.text([x, -0.79, 0.78], `Trace ${this.selectedTrace}`, '#efffff');
    }

    background(ctx) {
      const g = ctx.createRadialGradient(this.w * 0.5, this.h * 0.46, 20, this.w * 0.5, this.h * 0.5, this.w * 0.65);
      g.addColorStop(0, '#11384d');
      g.addColorStop(0.53, '#071d31');
      g.addColorStop(1, '#04111f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.strokeStyle = 'rgba(79,186,207,.08)';
      ctx.lineWidth = 1;
      const horizon = this.h * 0.73;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(this.w * 0.5, horizon - 12);
        ctx.lineTo(this.w * 0.5 + i * this.w * 0.12, this.h);
        ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const y = horizon + Math.pow(i / 4, 1.4) * (this.h - horizon);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.w, y); ctx.stroke();
      }
    }

    render(time) {
      if (this.auto && !this.dragging) this.yaw += 0.00016 * Math.min(34, this.lastTime ? time - this.lastTime : 16);
      this.lastTime = time;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.background(ctx);
      this.primitives = [];
      this.labels = [];
      ({ regional: () => this.drawRegional(), strata: () => this.drawStrata(), welltie: () => this.drawWelltie(), fault: () => this.drawFault(), reservoir: () => this.drawReservoir() })[this.type]();
      this.drawSelectedTrace();
      this.primitives.sort((a, b) => a.depth - b.depth);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const item of this.primitives) {
        if (item.kind === 'poly') {
          ctx.beginPath(); item.p.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
          if (item.fill) { ctx.fillStyle = item.fill; ctx.fill(); }
          if (item.stroke) { ctx.strokeStyle = item.stroke; ctx.lineWidth = item.width; ctx.stroke(); }
        } else if (item.kind === 'line') {
          ctx.beginPath(); item.p.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
          ctx.strokeStyle = item.color; ctx.lineWidth = item.width; ctx.setLineDash(item.dash || []); ctx.stroke(); ctx.setLineDash([]);
        } else {
          ctx.fillStyle = item.color;
          const r = Math.max(1.2, item.radius);
          if (item.shape === 'square') ctx.fillRect(item.p[0] - r, item.p[1] - r, r * 2, r * 2);
          else { ctx.beginPath(); ctx.arc(item.p[0], item.p[1], r, 0, TAU); ctx.fill(); }
        }
      }
      ctx.font = '600 12px "Microsoft YaHei",sans-serif';
      ctx.textBaseline = 'middle';
      this.labels.forEach((label) => {
        ctx.textAlign = label.align;
        ctx.fillStyle = 'rgba(2,13,24,.78)';
        const width = ctx.measureText(label.label).width + 10;
        ctx.fillRect(label.p[0] - (label.align === 'right' ? width : width / 2), label.p[1] - 8, width, 16);
        ctx.fillStyle = label.color;
        ctx.fillText(label.label, label.p[0], label.p[1]);
      });
      this.overlay(ctx);
      requestAnimationFrame((t) => this.render(t));
    }

    overlay(ctx) {
      // The WebGL scene uses DOM controls and in-scene labels rather than a
      // second title/legend painted over the canvas. Keep the compatibility
      // renderer composition identical.
      return;
      /* c8 ignore start */
      const meta = META[this.type];
      ctx.textAlign = 'left';
      ctx.font = '600 13px Consolas,"Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#b9eaf2';
      ctx.fillText(meta.title, 14, 18);
      ctx.font = '11px Consolas,"Microsoft YaHei",sans-serif';
      let x = 14;
      meta.legend.forEach(([color, label]) => {
        ctx.fillStyle = color; ctx.fillRect(x, this.h - 18, 8, 8);
        ctx.fillStyle = '#83a7b8'; ctx.fillText(label, x + 12, this.h - 14);
        x += ctx.measureText(label).width + 34;
      });
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(113,165,181,.7)';
      ctx.fillText(`ROT ${(this.yaw * 180 / Math.PI % 360 + 360) % 360 | 0}°  ZOOM ${this.zoom.toFixed(2)}`, this.w - 13, this.h - 14);
      /* c8 ignore stop */
    }
  }

  const boot = () => document.querySelectorAll('.story-geology-canvas').forEach((canvas) => {
    const scene = new GeologyScene(canvas);
    requestAnimationFrame((t) => scene.render(t));
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
