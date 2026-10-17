// Public interpreted horizon coordinates, independent of the inference results.
((root) => {
  const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
  const buildMesh = (data, cutaway = true) => {
    const { x, y, horizons, timeRange, xyRange, coordinates } = data;
    const nx = x.length, ny = y.length, triangles = [];
    const span = Math.max(xyRange[1] - xyRange[0], xyRange[3] - xyRange[2]);
    const position = (layer, i, j) => {
      const t = horizons[layer].values[j * nx + i];
      if (t === null || !Number.isFinite(t)) return null;
      const offset = (j * nx + i) * 2;
      return [(coordinates[offset] - (xyRange[0] + xyRange[1]) / 2) / span * 2.6,
        .72 - (t - timeRange[0]) / (timeRange[1] - timeRange[0]) * 1.44,
        (coordinates[offset + 1] - (xyRange[2] + xyRange[3]) / 2) / span * 2.6];
    };
    const add = (a, b, c, colour) => {
      if (!a || !b || !c) return;
      const u = b.map((v, i) => v - a[i]), v = c.map((w, i) => w - a[i]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(...n);
      if (length < 1e-10) return;
      for (const p of [a, b, c]) triangles.push(...p, ...n.map(k => k / length), ...colour);
    };
    const quad = (a, b, c, d, colour) => { add(a, b, c, colour); add(a, c, d, colour); };
    const kept = (i, j) => i >= 0 && j >= 0 && i < nx - 1 && j < ny - 1 &&
      !(cutaway && i >= Math.floor((nx - 1) / 2) && j >= Math.floor((ny - 1) / 2));
    for (let k = 0; k < horizons.length; k++) {
      const colour = hex(horizons[k].colour);
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        if (!kept(i, j)) continue;
        quad(position(k, i, j), position(k, i + 1, j), position(k, i + 1, j + 1), position(k, i, j + 1), colour);
        if (k === horizons.length - 1) continue;
        const edges = [
          [i - 1, j, i, j, i, j + 1], [i + 1, j, i + 1, j + 1, i + 1, j],
          [i, j - 1, i + 1, j, i, j], [i, j + 1, i, j + 1, i + 1, j + 1]
        ];
        for (const [ni, nj, ai, aj, bi, bj] of edges) {
          if (!kept(ni, nj)) quad(position(k, ai, aj), position(k, bi, bj), position(k + 1, bi, bj), position(k + 1, ai, aj), colour);
        }
      }
    }
    return new Float32Array(triangles);
  };
  const canSpin = state => state.automatic && !state.dragging && !state.hidden;
  root.PublicGeology = { buildMesh, canSpin };
  if (typeof module !== 'undefined') module.exports = root.PublicGeology;
  if (!root.document) return;
  const canvas = document.getElementById('public-geology-canvas');
  if (!canvas) return;
  const stage = canvas.closest?.('.public-geology-stage');
  const status = document.getElementById('public-geology-status');
  const motion = document.getElementById('public-geology-motion');
  const cutaway = document.getElementById('public-geology-cutaway');
  const data = root.F3GeologyData;
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
  if (!gl || !data) {
    status.textContent = !data ? '当前显示 F3 演示图；公开层位数据未加载。' : '当前显示 F3 演示图；启用硬件加速可切换为交互三维。';
    stage?.classList.add('is-fallback');
    motion.disabled = cutaway.disabled = true;
    return;
  }
  const state = { automatic: true,
    hover: false, dragging: false, focused: false, hidden: document.hidden,
    yaw: -.65, pitch: -.36, distance: 3.8 };
  const vertex = `attribute vec3 position; attribute vec3 normal; attribute vec3 colour;
    uniform float yaw; uniform float pitch; uniform float aspect; uniform float cameraDistance;
    varying vec3 tint;
    vec3 rotate(vec3 p) {
      p = vec3(cos(yaw)*p.x + sin(yaw)*p.z, p.y, -sin(yaw)*p.x + cos(yaw)*p.z);
      return vec3(p.x, cos(pitch)*p.y - sin(pitch)*p.z, sin(pitch)*p.y + cos(pitch)*p.z);
    }
    void main() {
      vec3 p = rotate(position); float z = p.z - cameraDistance;
      gl_Position = vec4(p.x*2.1/aspect, p.y*2.1, -1.01005*z - .201005, -z);
      tint = colour * (.57 + .43 * abs(dot(normalize(rotate(normal)), normalize(vec3(.4,.8,1.)))));
    }`;
  const fragment = 'precision mediump float; varying vec3 tint; void main(){ gl_FragColor=vec4(tint,1.); }';
  const shader = (type, text) => {
    const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
  } catch {
    status.textContent = '三维渲染初始化失败，请检查浏览器硬件加速。';
    return;
  }
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  ['position', 'normal', 'colour'].forEach((name, index) => {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 36, index * 12);
  });
  const uniforms = Object.fromEntries(['yaw', 'pitch', 'aspect', 'distance'].map(name => [name, gl.getUniformLocation(program, name === 'distance' ? 'cameraDistance' : name)]));
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  let count = 0, frame = 0, previous = 0, dirty = true, drag = null;
  const updateMesh = () => {
    const mesh = buildMesh(data, cutaway.checked);
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW); count = mesh.length / 9; dirty = true;
  };
  const resize = () => {
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height); dirty = true;
  };
  const draw = () => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const name of ['yaw', 'pitch']) gl.uniform1f(uniforms[name], state[name]);
    gl.uniform1f(uniforms.distance, state.distance * Math.max(1, canvas.height / canvas.width));
    gl.uniform1f(uniforms.aspect, canvas.width / canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, count); dirty = false;
  };
  const tick = now => {
    frame = 0;
    const delta = previous ? Math.min((now - previous) / 1000, .05) : 0; previous = now;
    if (canSpin(state)) { state.yaw += delta * .16; dirty = true; }
    if (dirty && !state.hidden) draw();
    if (canSpin(state)) schedule();
  };
  const schedule = () => { if (!frame && !state.hidden) frame = requestAnimationFrame(tick); };
  const syncMotion = () => {
    motion.textContent = state.automatic ? '暂停自转' : '开始自转';
    motion.setAttribute('aria-pressed', String(state.automatic)); previous = 0; schedule();
  };
  canvas.addEventListener('pointerenter', () => { state.hover = true; });
  canvas.addEventListener('pointerleave', () => { state.hover = false; previous = 0; schedule(); });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || state.dragging) return;
    state.dragging = true; drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging'); event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    state.yaw += (event.clientX - drag.x) * .008;
    state.pitch = Math.max(-1.25, Math.min(1.25, state.pitch + (event.clientY - drag.y) * .008));
    drag.x = event.clientX; drag.y = event.clientY; dirty = true; schedule();
  });
  const finish = event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null; state.dragging = false; canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    previous = 0; schedule();
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => canvas.addEventListener(type, finish));
  canvas.addEventListener('focus', () => { state.focused = true; });
  canvas.addEventListener('blur', () => { state.focused = false; previous = 0; schedule(); });
  canvas.addEventListener('wheel', event => {
    state.distance = Math.max(3.2, Math.min(8, state.distance + Math.sign(event.deltaY) * .2));
    dirty = true; schedule(); event.preventDefault();
  }, { passive: false });
  const reset = () => { state.yaw = -.65; state.pitch = -.36; state.distance = 3.8; dirty = true; schedule(); };
  canvas.addEventListener('dblclick', reset);
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') return reset();
    if (event.key === ' ') { state.automatic = !state.automatic; return syncMotion(); }
    state.yaw += event.key === 'ArrowLeft' ? -.1 : event.key === 'ArrowRight' ? .1 : 0;
    state.pitch = Math.max(-1.25, Math.min(1.25, state.pitch + (event.key === 'ArrowUp' ? -.1 : event.key === 'ArrowDown' ? .1 : 0)));
    dirty = true; schedule();
  });
  motion.addEventListener('click', () => { state.automatic = !state.automatic; syncMotion(); });
  cutaway.addEventListener('change', () => { updateMesh(); schedule(); });
  document.getElementById('public-geology-reset').addEventListener('click', reset);
  const observer = new ResizeObserver(() => { resize(); schedule(); }); observer.observe(canvas);
  document.addEventListener('visibilitychange', () => { state.hidden = document.hidden; previous = 0; schedule(); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); state.hidden = true; cancelAnimationFrame(frame); frame = 0;
    status.textContent = '三维绘图上下文已断开，请刷新页面恢复。'; status.hidden = false;
  });
  const legend = document.getElementById('public-geology-legend');
  for (const horizon of data.horizons) {
    const item = document.createElement('span'), dot = document.createElement('i');
    dot.style.setProperty('--colour', horizon.colour); item.append(dot, document.createTextNode(horizon.name)); legend.append(item);
  }
  updateMesh(); resize(); stage?.classList.add('is-webgl-ready'); status.hidden = true; syncMotion();
})(globalThis);
