(() => {
  const el = id => document.getElementById(id);
  const form = el('inference-form');
  if (!form) return;

  const task = el('interpretation-task');
  const button = el('start-inference');
  const badge = el('inference-connection');
  const status = el('inference-status');
  const dialog = el('processing-result-dialog');
  let online = false;
  let busy = false;
  let complete = false;
  let version = '';

  const message = (text, state = '') => {
    status.textContent = text;
    status.dataset.state = state;
  };
  const sync = () => { button.disabled = busy || !online || !complete; };
  const findOutput = (record, key) => {
    const output = record.outputs.find(item => item.key === key);
    if (!output) throw new Error(`模型结果缺少 ${key} 输出。`);
    return output;
  };

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const categoricalLegend = output => (output.class_names || []).map((name, index) => `<span><i style="--legend-colour:${output.palette[index]}"></i>${name}</span>`).join('');

  const renderSlice = (target, output, fusion) => {
    target.sliceCleanup?.();
    const controller = new AbortController();
    const listen = (type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: controller.signal });
    let frame = 0;
    const pending = new Set();
    let demo = null;
    let source = null;
    target.sliceCleanup = () => {
      controller.abort();
      cancelAnimationFrame(frame);
      if (source) { source.onload = null; source.onerror = null; }
    };
    target.replaceChildren();
    target.tabIndex = 0;
    target.setAttribute('aria-description', '拖动空白区域旋转，拖动任一切面沿法向移动，滚轮缩放，双击复位。');
    const volume = document.createElement('div');
    volume.className = `ortho-volume ${fusion ? 'ortho-volume-fusion' : ''}`;
    const state = { rotateX: -18, rotateY: fusion ? 28 : -28, zoom: 1, x: 0, y: 0, z: 0 };
    const planes = {};
    const canvases = {};
    const tags = {};
    const redraw = axis => {
      pending.add(axis);
      if (!demo || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        for (const key of pending) {
          const canvas = canvases[key];
          canvas.getContext('2d').putImageData(new ImageData(demo.render(key, .5 + state[key] / 144, canvas.width, canvas.height), canvas.width, canvas.height), 0, 0);
          tags[key].textContent = `${key.toUpperCase()}切面 · ${Math.round((.5 + state[key] / 144) * 100)}%`;
        }
        pending.clear();
      });
    };
    [['x', 'X', '侧向切面'], ['y', 'Y', '水平切面'], ['z', 'Z', '主剖面']].forEach(([axis, shortName, label]) => {
      const plane = document.createElement('div');
      const canvas = document.createElement('canvas');
      const tag = document.createElement('span');
      plane.className = `ortho-slice ortho-slice-${axis}`;
      plane.dataset.axis = axis;
      plane.setAttribute('role', 'button');
      plane.setAttribute('aria-label', `${label}，按住拖动移动切面`);
      canvas.width = 320;
      canvas.height = 224;
      canvas.setAttribute('aria-label', `${output.label}${label}，二维结果构造的演示切片`);
      tag.className = 'ortho-slice-tag';
      tag.textContent = `${shortName}切面`;
      plane.append(canvas, tag);
      planes[axis] = plane;
      canvases[axis] = canvas;
      tags[axis] = tag;
      volume.appendChild(plane);
    });
    const axes = document.createElement('span');
    axes.className = 'slice-axes';
    axes.setAttribute('aria-hidden', 'true');
    axes.innerHTML = '<i class="axis-x">X</i><i class="axis-y">Y</i><i class="axis-z">Z</i>';
    const hint = document.createElement('span');
    hint.className = 'slice-interaction-hint';
    hint.textContent = '二维插值演示体 · 非真实三维推理';
    hint.title = '拖动空白旋转；拖动切面更新剖面；滚轮缩放；双击复位。';
    const legend = document.createElement('span');
    legend.className = 'structure-legend ortho-structure-legend';
    legend.innerHTML = categoricalLegend(output);
    target.append(volume, axes, legend, hint);
    source = new Image();
    source.onload = () => {
      if (controller.signal.aborted) return;
      try {
        const buffer = document.createElement('canvas');
        buffer.width = 320;
        buffer.height = 224;
        const context = buffer.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = !output.categorical;
        context.drawImage(source, 0, 0, buffer.width, buffer.height);
        demo = DemoVolume.create(context.getImageData(0, 0, buffer.width, buffer.height).data, buffer.width, buffer.height, !!output.categorical);
        ['x', 'y', 'z'].forEach(redraw);
      } catch {
        hint.textContent = '演示切片读取失败，请重新推理或刷新页面';
      }
    };
    source.onerror = () => { hint.textContent = '结果图读取失败，请重新推理'; };
    source.src = output.image;

    const apply = () => {
      volume.style.transform = `rotateX(${state.rotateX}deg) rotateY(${state.rotateY}deg) scale(${state.zoom})`;
      planes.x.style.setProperty('--slice-offset', `${state.x}px`);
      planes.y.style.setProperty('--slice-offset', `${state.y}px`);
      planes.z.style.setProperty('--slice-offset', `${state.z}px`);
    };

    const reset = () => {
      state.rotateX = -18;
      state.rotateY = fusion ? 28 : -28;
      state.zoom = 1;
      state.x = state.y = state.z = 0;
      ['x', 'y', 'z'].forEach(redraw);
      apply();
    };
    let drag = null;
    listen('pointerdown', event => {
      if (event.button !== 0) return;
      const plane = event.target.closest('.ortho-slice');
      drag = { mode: plane ? 'slice' : 'rotate', axis: plane?.dataset.axis, x: event.clientX, y: event.clientY };
      Object.values(planes).forEach(item => item.classList.toggle('is-active', item === plane));
      target.classList.add('is-dragging');
      target.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    listen('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.x = event.clientX; drag.y = event.clientY;
      if (drag.mode === 'rotate') {
        state.rotateY += dx * .45;
        state.rotateX = clamp(state.rotateX - dy * .38, -72, 72);
      } else {
        const delta = drag.axis === 'x' ? dx * .48 : drag.axis === 'y' ? -dy * .48 : (dx - dy) * .34;
        state[drag.axis] = clamp(state[drag.axis] + delta, -72, 72);
        redraw(drag.axis);
      }
      apply();
    });
    const finishDrag = event => {
      if (!drag) return;
      drag = null;
      target.classList.remove('is-dragging');
      Object.values(planes).forEach(item => item.classList.remove('is-active'));
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    };
    listen('pointerup', finishDrag);
    listen('pointercancel', finishDrag);
    listen('wheel', event => {
      state.zoom = clamp(state.zoom - Math.sign(event.deltaY) * .08, .72, 1.42);
      apply();
      event.preventDefault();
    }, { passive: false });
    listen('dblclick', reset);
    apply();
  };

  const bindComparison = (seismic, fusion) => {
    const comparison = el('result-comparison');
    const divider = el('comparison-divider');
    el('comparison-seismic-image').src = seismic.image;
    el('comparison-fusion-image').src = fusion.image;
    comparison.querySelector('.comparison-structure-legend')?.remove();
    if (fusion.categorical) {
      const legend = document.createElement('span');
      legend.className = 'structure-legend comparison-structure-legend';
      legend.innerHTML = categoricalLegend(fusion);
      comparison.appendChild(legend);
    }
    let split = 50;
    const apply = value => {
      split = clamp(value, 10, 90);
      comparison.style.setProperty('--comparison-split', `${split}%`);
      divider.setAttribute('aria-valuenow', Math.round(split));
    };
    const move = event => {
      const bounds = comparison.getBoundingClientRect();
      apply((event.clientX - bounds.left) / bounds.width * 100);
    };
    divider.onpointerdown = event => {
      divider.setPointerCapture(event.pointerId);
      comparison.classList.add('is-dragging');
      move(event);
    };
    divider.onpointermove = event => { if (divider.hasPointerCapture(event.pointerId)) move(event); };
    divider.onpointerup = event => {
      comparison.classList.remove('is-dragging');
      if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
    };
    divider.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      apply(split + (event.key === 'ArrowLeft' ? -2 : 2));
      event.preventDefault();
    };
    apply(50);
  };

  const showResults = record => {
    const seismic = findOutput(record, 'seismic_map');
    const fusion = findOutput(record, 'fusion_map');
    const uncertainty = findOutput(record, 'uncertainty');
    renderSlice(el('seismic-slice-3d'), seismic, false);
    renderSlice(el('fusion-slice-3d'), fusion, true);
    bindComparison(seismic, fusion);
    el('uncertainty-result-image').src = uncertainty.image;
    el('processing-download').href = WorkbenchInput.api + record.download_url;
    el('processing-result-title').textContent = '模型解释结果';
    dialog.showModal();
  };

  const refresh = async () => {
    try {
      const snapshot = await WorkbenchInput.read();
      const nextVersion = WorkbenchInput.signature(snapshot);
      complete = Object.values(snapshot).every(group => group.records.length && group.records.every(record => record.state === 'ready'));
      el('inference-input-info').textContent = WorkbenchInput.summary(snapshot);
      if (version !== nextVersion) {
        version = nextVersion;
        if (dialog.open) dialog.close();
      }
      if (!complete) message('请先在数据输入页载入四类资料。');
    } catch (error) {
      complete = false;
      message(error.message, 'error');
    }
    sync();
  };

  const connect = async () => {
    try {
      const health = await WorkbenchInput.request('/api/health', {}, 4000);
      if (health.service !== 'zhenmai-physical' || health.version < 2) throw new Error('请关闭旧版Python服务，再运行新版启动脚本。');
      online = true;
      badge.textContent = '服务已连接 · 重试';
      badge.dataset.state = 'ready';
      message('使用当前四类输入生成带类别标签的井震融合地质结构。', 'ready');
    } catch (error) {
      online = false;
      badge.textContent = '服务未连接 · 重试';
      badge.dataset.state = 'error';
      message(error.message, 'error');
    }
    await refresh();
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !online || !complete || !form.reportValidity()) return;
    busy = true;
    sync();
    task.disabled = true;
    button.textContent = '联合推理中…';
    try {
      const data = await WorkbenchInput.prepare(WorkbenchUI.settings(), text => message(text));
      message('正在生成纯地震地层类别、井约束融合类别与不确定度…');
      const result = await WorkbenchInput.request('/api/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: data.dataset_id, task: task.value, mode: 'comparison' })
      });
      if (WorkbenchInput.signature(await WorkbenchInput.read()) !== data.signature) throw new Error('输入已变更，旧输入的结果不再展示。');
      showResults(result);
      message('联合模型推理完成，四项结果已弹窗展示。', 'ready');
    } catch (error) {
      message(error.message, 'error');
    } finally {
      busy = false;
      task.disabled = false;
      button.textContent = '开始推理';
      sync();
    }
  });

  badge.addEventListener('click', connect);
  el('close-processing-result').addEventListener('click', () => dialog.close());
  window.addEventListener('focus', () => { if (!busy) refresh(); });
  WorkbenchUI.renderSettings(el('case-settings-controls'));
  connect();
})();
