import * as THREE from './vendor/three/three.webgl.min.js';

const DATA = globalThis.StoryAnalysisData;
const F3 = globalThis.F3GeologyData;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// Keep the interpreted horizons visually stable across machines.  Basic materials
// preserve these data colours instead of letting WebGL lighting wash them toward cyan.
const COLORS = ['#58e3ea', '#e1bd5c', '#df786b', '#8b9ff0', '#55c7a5'];
const FAULT = '#df786b';

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
    child.material?.map?.dispose?.();
  });
}

function labelSprite(text, colour = '#dffaff') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(3, 16, 29, .82)';
  context.fillRect(3, 3, 250, 66);
  context.strokeStyle = colour;
  context.lineWidth = 2;
  context.strokeRect(3, 3, 250, 66);
  context.font = '600 28px "Microsoft YaHei", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = colour;
  context.fillText(text, 128, 36);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.15, .32, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function makeLine(points, colour, opacity = .8) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity }));
}

class ThreeGeologyScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.shell = canvas.closest('.story-interactive-3d');
    this.type = canvas.dataset.scene || 'regional';
    this.auto = true;
    this.dragging = false;
    this.visible = true;
    this.yaw = { regional: -.72, strata: .58, welltie: -.62, fault: -.58, reservoir: -.48 }[this.type];
    this.pitch = { regional: -.28, strata: -.46, welltie: -.18, fault: -.28, reservoir: -.34 }[this.type];
    this.zoom = { regional: .94, strata: 1.08, welltie: 1, fault: 1, reservoir: 1 }[this.type];
    this.base = { yaw: this.yaw, pitch: this.pitch, zoom: 1 };
    this.layerOpacity = .46;
    this.layerVisibility = [true, true, true, true];
    this.verticalExaggeration = 1;
    this.showContours = true;
    this.reservoirInterval = Number(sessionStorage.getItem('geology-reservoir-interval')) || 0;
    this.reservoirThreshold = Number(sessionStorage.getItem('geology-reservoir-threshold')) || DATA?.stats?.targetThreshold || .85;
    this.initRenderer();
    this.buildScene();
    this.bind();
    this.resize();
    this.lastFrame = 0;
    this.animationFrame = requestAnimationFrame((time) => this.animate(time));
  }

  initRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (primaryError) {
      console.warn('High-performance WebGL unavailable; retrying with compatibility settings.', primaryError);
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'default' });
      this.canvas.dataset.webglProfile = 'compatibility';
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .9;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x041321);
    this.scene.fog = new THREE.FogExp2(0x041321, .075);
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    this.camera.position.set(0, 2.5, 6.4);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0x9ed7e5, 0x07111d, .9));
    const key = new THREE.DirectionalLight(0xd5edf4, 1.15);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const cyan = new THREE.PointLight(0x55d9e7, 4.2, 12, 2);
    cyan.position.set(-3, 1, 2);
    this.scene.add(cyan);
    const amber = new THREE.PointLight(0xc7aa68, 2.5, 10, 2);
    amber.position.set(3, -1, 1);
    this.scene.add(amber);
    this.canvas.dataset.renderer = 'threejs-webgl';
    this.shell?.classList.add('is-threejs');
    const hint = this.shell?.querySelector('.story-3d-hint');
    if (hint) hint.textContent = 'THREE.JS · WEBGL · 拖拽旋转 · 滚轮缩放';
  }

  buildScene() {
    const grid = new THREE.GridHelper(7, 20, 0x2a879d, 0x12394c);
    grid.position.y = -1.62;
    grid.material.transparent = true;
    grid.material.opacity = .42;
    this.root.add(grid);
    const builders = {
      regional: () => this.buildRegionalF3Block(),
      strata: () => this.buildF3Layers(true),
      welltie: () => this.buildWellTie(),
      fault: () => this.buildFault(),
      reservoir: () => this.buildReservoir()
    };
    builders[this.type]?.();
    this.root.rotation.order = 'YXZ';
  }

  createF3Surface(layer, separated = false) {
    const horizon = F3.horizons[layer];
    const columns = F3.x.length;
    const rows = F3.y.length;
    const [minX, maxX, minZ, maxZ] = F3.xyRange;
    const [minTime, maxTime] = F3.timeRange;
    const positions = [];
    const indices = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const coordinateIndex = (row * columns + column) * 2;
        const x = (F3.coordinates[coordinateIndex] - minX) / (maxX - minX) * 4.5 - 2.25;
        const z = (F3.coordinates[coordinateIndex + 1] - minZ) / (maxZ - minZ) * 3.2 - 1.6;
        const time = horizon.values[row * columns + column];
        const y = 1.2 - (time - minTime) / (maxTime - minTime) * 2.5 + (separated ? (1.5 - layer) * .3 : 0);
        positions.push(x, y, z);
      }
    }
    for (let row = 0; row < rows - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const a = row * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      color: COLORS[layer],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: separated ? .34 : this.layerOpacity,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = layer + 1;
    const wire = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: COLORS[layer],
      wireframe: true,
      transparent: true,
      opacity: separated ? .9 : .82,
      depthWrite: false,
      toneMapped: false
    }));
    wire.renderOrder = layer + 2;
    const group = new THREE.Group();
    group.add(mesh, wire);
    return { group, mesh, wire, horizon };
  }

  buildF3Layers(separated) {
    this.layers = [];
    if (!F3?.horizons?.length) {
      this.buildSyntheticLayers(separated, false);
      return;
    }
    F3.horizons.slice(0, 4).forEach((horizon, index) => {
      const layer = this.createF3Surface(index, separated);
      const label = labelSprite(horizon.name, COLORS[index]);
      label.position.set(-2.15, 1.35 - index * .68 + (separated ? (1.5 - index) * .3 : 0), -1.5);
      layer.group.add(label);
      this.root.add(layer.group);
      this.layers.push(layer);
    });
    this.addBounds();
  }

  buildRegionalF3Block() {
    this.buildF3Layers(false);
    this.addWells();

    const surveyColour = 0x66e4ee;
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2.32, 1.56, -1.68),
      new THREE.Vector3(2.32, 1.56, -1.68),
      new THREE.Vector3(2.32, 1.56, 1.68),
      new THREE.Vector3(-2.32, 1.56, 1.68),
      new THREE.Vector3(-2.32, 1.56, -1.68)
    ]);
    const outline = new THREE.Line(outlineGeometry, new THREE.LineBasicMaterial({ color: surveyColour, transparent: true, opacity: .76 }));
    this.root.add(outline);

    [
      [new THREE.Vector3(-2.2, 1.575, -1.28), new THREE.Vector3(2.2, 1.575, .92)],
      [new THREE.Vector3(-2.2, 1.575, .95), new THREE.Vector3(2.2, 1.575, -1.2)]
    ].forEach((points) => this.root.add(makeLine(points, 0x3aa9bd, .46)));

    const surveyLabel = labelSprite('F3 区域地质体 · 井网与测线', '#72e8f0');
    surveyLabel.position.set(0, 1.92, -1.48);
    surveyLabel.scale.set(1.78, .4, 1);
    this.root.add(surveyLabel);
  }

  syntheticHorizonY(layer, column, faulted = false) {
    const lines = DATA?.horizons?.timesMs;
    const width = DATA?.grid?.traces?.length || 224;
    const index = clamp(Math.round(column), 0, width - 1);
    const source = lines?.[clamp(layer, 0, (lines?.length || 2) - 1)]?.[index] ?? (240 + layer * 95);
    let y = 1.25 - (source - 100) / 640 * 2.5;
    if (faulted && index > (DATA?.stats?.faultTrace || 276) / 2) y -= .2 + layer * .035;
    return y;
  }

  buildSyntheticLayers(separated, faulted) {
    this.layers = [];
    const columns = 56;
    const rows = 22;
    for (let layer = 0; layer < 4; layer += 1) {
      const positions = [];
      const indices = [];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const sourceColumn = column / (columns - 1) * ((DATA?.grid?.traces?.length || 224) - 1);
          const x = column / (columns - 1) * 4.5 - 2.25;
          const z = row / (rows - 1) * 3.1 - 1.55;
          const crossline = Math.sin(row * .42 + column * .08) * .025;
          const y = this.syntheticHorizonY(layer, sourceColumn, faulted) + crossline + (separated ? (1.5 - layer) * .28 : 0);
          positions.push(x, y, z);
        }
      }
      for (let row = 0; row < rows - 1; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
          const a = row * columns + column;
          const b = a + 1;
          const c = a + columns;
          indices.push(a, c, b, b, c, c + 1);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({ color: COLORS[layer], transparent: true, opacity: separated ? .34 : this.layerOpacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(geometry, material);
      const wire = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLORS[layer], transparent: true, opacity: separated ? .9 : .82, wireframe: true, depthWrite: false, toneMapped: false }));
      const group = new THREE.Group();
      group.add(mesh, wire);
      this.root.add(group);
      this.layers.push({ group, mesh, wire });
    }
    this.addBounds();
  }

  seismicTexture() {
    const rows = DATA.grid.seismic.length;
    const columns = DATA.grid.seismic[0].length;
    const pixels = new Uint8Array(rows * columns * 4);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const value = clamp(DATA.grid.seismic[row][column] / 110, -1, 1);
        const index = (row * columns + column) * 4;
        if (value >= 0) {
          pixels[index] = Math.round(71 + value * 127);
          pixels[index + 1] = Math.round(111 + value * 59);
          pixels[index + 2] = Math.round(107 - value * 4);
        } else {
          const magnitude = -value;
          pixels[index] = Math.round(7 + magnitude * 71);
          pixels[index + 1] = Math.round(25 + magnitude * 105);
          pixels[index + 2] = Math.round(45 + magnitude * 143);
        }
        pixels[index + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(pixels, columns, rows, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  addWells(parent = this.root) {
    const traces = DATA?.grid?.traces || [];
    (DATA?.wells || []).forEach((well, index) => {
      const traceIndex = Math.max(0, traces.indexOf(well.trace));
      const x = traceIndex / Math.max(1, traces.length - 1) * 4.5 - 2.25;
      const z = -.75 + index * .76;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 1.52, z),
        new THREE.Vector3(x + .03 * (index - 1), .55, z + .05),
        new THREE.Vector3(x + .08 * (index - 1), -.55, z + .1),
        new THREE.Vector3(x + .13 * (index - 1), -1.5, z + .14)
      ]);
      const geometry = new THREE.TubeGeometry(curve, 36, .026, 8, false);
      const colour = new THREE.Color(well.colour);
      const material = new THREE.MeshBasicMaterial({ color: colour, toneMapped: false });
      parent.add(new THREE.Mesh(geometry, material));
      const head = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 12), material.clone());
      head.position.set(x, 1.52, z);
      parent.add(head);
      const label = labelSprite(well.name, well.colour);
      label.position.set(x, 1.82, z);
      parent.add(label);
    });
  }

  buildWellTie() {
    if (!DATA?.grid?.seismic) return this.buildSyntheticLayers(false, false);
    const texture = this.seismicTexture();
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
    const mainFence = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.75, 56, 20), material);
    mainFence.position.y = -.05;
    this.root.add(mainFence);
    const crossFence = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.75, 38, 20), material.clone());
    crossFence.rotation.y = Math.PI / 2;
    crossFence.position.set(.38, -.05, 0);
    crossFence.material.opacity = .68;
    crossFence.material.transparent = true;
    this.root.add(crossFence);
    for (let layer = 0; layer < 4; layer += 1) {
      const points = [];
      for (let column = 0; column < 56; column += 1) {
        const source = column / 55 * (DATA.grid.traces.length - 1);
        points.push(new THREE.Vector3(column / 55 * 4.5 - 2.25, this.syntheticHorizonY(layer, source), .025));
      }
      this.root.add(makeLine(points, COLORS[layer], .95));
    }
    this.addWells();
    this.addBounds();
  }

  buildFault() {
    this.buildSyntheticLayers(false, true);
    const planeGeometry = new THREE.PlaneGeometry(2.9, 3.25, 12, 12);
    const planeMaterial = new THREE.MeshBasicMaterial({ color: FAULT, transparent: true, opacity: .48, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.y = Math.PI / 2 - .13;
    plane.rotation.x = -.08;
    plane.position.set(.5, -.05, 0);
    plane.renderOrder = 12;
    this.root.add(plane);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(planeGeometry), new THREE.LineBasicMaterial({ color: 0xd9959c, transparent: true, opacity: .9 }));
    edges.rotation.copy(plane.rotation);
    edges.position.copy(plane.position);
    edges.renderOrder = 13;
    this.root.add(edges);
    const label = labelSprite('F1 断裂', FAULT);
    label.position.set(.68, 1.62, .15);
    this.root.add(label);
  }

  buildReservoir() {
    this.reservoirGroup = new THREE.Group();
    this.root.add(this.reservoirGroup);
    this.rebuildReservoir();
    this.addWells(this.root);
    this.addBounds();
  }

  rebuildReservoir() {
    if (!this.reservoirGroup || !DATA?.grid?.seismic) return;
    disposeObject(this.reservoirGroup);
    this.reservoirGroup.clear();
    const rows = DATA.grid.seismic.length;
    const columns = DATA.grid.seismic[0].length;
    const positions = [];
    const colours = [];
    const sizes = [];
    const color = new THREE.Color();
    const intervalOffset = this.reservoirInterval * .12;
    for (let row = 2; row < rows - 2; row += 3) {
      for (let column = 1; column < columns - 1; column += 2) {
        const amplitude = Math.abs(DATA.grid.seismic[row][column]) / 127;
        const lateral = .18 * Math.sin(column * .16) + .12 * Math.cos(row * .13);
        const value = clamp(.38 + amplitude * .5 + lateral + intervalOffset, 0, 1);
        if (value < Math.max(.42, this.reservoirThreshold - .24)) continue;
        const x = column / (columns - 1) * 4.5 - 2.25;
        const y = 1.26 - row / (rows - 1) * 2.55;
        const z = Math.sin(column * .21 + row * .1) * .72 + Math.cos(row * .17) * .32;
        positions.push(x, y, z);
        color.set(value >= this.reservoirThreshold ? 0xc7aa68 : value > .68 ? 0x55c7a5 : 0x456e8c);
        colours.push(color.r, color.g, color.b);
        sizes.push(value);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    const material = new THREE.PointsMaterial({ size: .095, vertexColors: true, transparent: true, opacity: 1, sizeAttenuation: true, depthWrite: false, toneMapped: false });
    this.reservoirGroup.add(new THREE.Points(geometry, material));
    const shell = new THREE.Mesh(new THREE.BoxGeometry(4.55, 2.6, 2.4), new THREE.MeshBasicMaterial({ color: 0x58e3ea, wireframe: true, transparent: true, opacity: .24, toneMapped: false }));
    this.reservoirGroup.add(shell);
    const label = labelSprite(`H${this.reservoirInterval + 1} 属性体`, '#c7aa68');
    label.position.set(-1.75, 1.56, -1.05);
    this.reservoirGroup.add(label);
  }

  addBounds() {
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const helper = new THREE.Box3Helper(box, 0x27788f);
    helper.material.transparent = true;
    helper.material.opacity = .28;
    this.root.add(helper);
  }

  bind() {
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
    motion?.addEventListener('click', () => { this.auto = !this.auto; syncMotion(); });
    syncMotion();
    this.shell?.querySelector('.story-3d-reset')?.addEventListener('click', () => this.reset());
    this.canvas.addEventListener('pointerdown', (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.dragging = true;
      this.pointer = [event.clientX, event.clientY];
      this.canvas.classList.add('is-dragging');
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.pointer[0];
      const dy = event.clientY - this.pointer[1];
      this.yaw += dx * .008;
      this.pitch = clamp(this.pitch + dy * .006, -1.08, .2);
      this.pointer = [event.clientX, event.clientY];
    });
    const stop = () => { this.dragging = false; this.canvas.classList.remove('is-dragging'); };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.zoom = clamp(this.zoom * Math.exp(-event.deltaY * .001), .68, 1.8);
    }, { passive: false });
    this.canvas.addEventListener('dblclick', () => this.reset());
    this.canvas.addEventListener('keydown', (event) => {
      if (event.key === ' ') { event.preventDefault(); this.auto = !this.auto; syncMotion(); }
      if (event.key === 'Home') { event.preventDefault(); this.reset(); }
      if (event.key === 'ArrowLeft') this.yaw -= .12;
      if (event.key === 'ArrowRight') this.yaw += .12;
      if (event.key === 'ArrowUp') this.pitch = clamp(this.pitch - .1, -1.08, .2);
      if (event.key === 'ArrowDown') this.pitch = clamp(this.pitch + .1, -1.08, .2);
    });
    window.addEventListener('geology:layers', (event) => {
      const detail = event.detail || {};
      if (Array.isArray(detail.visibility)) this.layerVisibility = detail.visibility;
      if (Number.isFinite(detail.opacity)) this.layerOpacity = detail.opacity;
      if (Number.isFinite(detail.exaggeration)) this.verticalExaggeration = detail.exaggeration;
      if (typeof detail.contours === 'boolean') this.showContours = detail.contours;
      this.updateLayers();
    });
    window.addEventListener('geology:reservoir', (event) => {
      if (Number.isFinite(event.detail?.interval)) this.reservoirInterval = event.detail.interval;
      if (Number.isFinite(event.detail?.threshold)) this.reservoirThreshold = event.detail.threshold;
      this.rebuildReservoir();
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.shell || this.canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; }, { rootMargin: '160px' });
    this.intersectionObserver.observe(this.canvas);
    window.addEventListener('beforeunload', () => this.dispose(), { once: true });
  }

  updateLayers() {
    this.layers?.forEach((layer, index) => {
      layer.group.visible = this.layerVisibility[index] !== false;
      layer.mesh.material.opacity = this.layerOpacity;
      layer.wire.visible = this.showContours;
    });
    this.root.scale.y = this.verticalExaggeration;
  }

  reset() {
    this.yaw = this.base.yaw;
    this.pitch = this.base.pitch;
    this.zoom = this.base.zoom;
    this.auto = true;
    const motion = this.shell?.querySelector('.story-3d-motion');
    if (motion) { motion.textContent = '暂停自转'; motion.setAttribute('aria-pressed', 'true'); }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(220, Math.round(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  animate(time) {
    this.animationFrame = requestAnimationFrame((next) => this.animate(next));
    if (!this.visible || document.hidden || time - this.lastFrame < 30) return;
    const delta = Math.min(50, this.lastFrame ? time - this.lastFrame : 16);
    this.lastFrame = time;
    if (this.auto && !this.dragging) this.yaw += delta * .00016;
    this.root.rotation.y = this.yaw;
    this.root.rotation.x = this.pitch;
    this.camera.position.z = 6.4 / this.zoom;
    this.camera.lookAt(0, -.05, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    disposeObject(this.root);
    this.renderer.dispose();
  }
}

function start() {
  const canvases = [...document.querySelectorAll('.story-geology-canvas')];
  if (!canvases.length) return;
  try {
    canvases.forEach((canvas) => new ThreeGeologyScene(canvas));
    document.documentElement.dataset.geologyRenderer = 'threejs-webgl';
  } catch (error) {
    console.warn('Three.js geology renderer unavailable; loading Canvas fallback.', error);
    import('./story-geology-3d.js?v=scene-distinction-1');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

