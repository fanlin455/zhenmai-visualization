(() => {
  'use strict';

  const createButton = document.getElementById('create-case');
  const alignButton = document.getElementById('run-alignment');
  const status = document.getElementById('input-workflow-status');
  const panel = document.getElementById('active-case-panel');
  const metrics = document.getElementById('active-case-metrics');
  const note = document.getElementById('active-case-note');
  const gate = document.getElementById('active-case-gate');
  const gallery = document.getElementById('alignment-output-gallery');
  if (!createButton || !globalThis.WorkbenchInput) return;

  let inputsReady = false;
  let validated = false;
  let busy = false;
  let activeCase = null;

  const setStatus = (message, state = '') => {
    status.textContent = message;
    status.dataset.state = state;
  };

  const updateButtons = () => {
    createButton.disabled = busy || !inputsReady || !validated;
    alignButton.disabled = busy || !activeCase?.alignment?.enabled;
  };

  const settings = () => ({
    time_axis: document.getElementById('case-time-axis').value,
    sample_index: Number(document.getElementById('case-sample-index').value),
    sample_interval_ms: Number(document.getElementById('case-sample-interval').value),
    time_origin_ms: Number(document.getElementById('case-time-origin').value),
    time_unit: document.getElementById('case-time-unit').value,
    time_depth_source: document.getElementById('case-time-source').value,
  });

  const metric = (label, value, detail) => {
    const box = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    const small = document.createElement('span');
    dt.textContent = label; dd.textContent = value; small.textContent = detail;
    box.append(dt, dd, small); return box;
  };

  const renderCase = record => {
    activeCase = record;
    panel.hidden = false;
    const wells = record.alignment?.wells || [];
    gate.textContent = record.alignment?.enabled ? '物理质量门通过' : '物理质量门未通过';
    gate.dataset.state = record.alignment?.enabled ? 'ready' : 'warning';
    metrics.replaceChildren(
      metric('案例编号', record.dataset_id.slice(0, 8), '本地可追溯 ID'),
      metric('地震输入', record.filename, (record.shape || []).join(' × ')),
      metric('井位匹配', `${wells.filter(well => well.enabled).length} / ${wells.length}`, record.alignment?.selected_well ? `选中 ${record.alignment.selected_well}` : '尚无可融合井'),
      metric('剖面序号', String(record.source_sample_index ?? 0), `时间轴 ${record.settings?.time_axis === 'last' ? '横向' : '纵向'}`),
    );
    note.textContent = record.alignment?.reason || '四类输入已绑定为同一个用户案例，可继续运行物理对齐。';
    try { sessionStorage.setItem('zhenmai-active-case', JSON.stringify({ ...record, createdAt: Date.now() })); } catch {}
    updateButtons();
    panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  };

  const renderAlignment = result => {
    gallery.replaceChildren();
    (result.outputs || []).forEach(output => {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      const caption = document.createElement('figcaption');
      image.src = output.image.startsWith('/') ? WorkbenchInput.api + output.image : output.image;
      image.alt = output.label;
      caption.textContent = output.label;
      figure.append(image, caption); gallery.append(figure);
    });
    if (!result.outputs?.length) gallery.textContent = '服务没有返回可展示的对齐结果。';
    try { sessionStorage.setItem('zhenmai-active-alignment', JSON.stringify({ ...result, completedAt: Date.now() })); } catch {}
  };

  globalThis.addEventListener('zhenmai:input-state', event => {
    inputsReady = Boolean(event.detail?.complete);
    if (!inputsReady) validated = false;
    if (!busy) setStatus(inputsReady ? '四类资料已读取，请执行结构校验与预览。' : `已就绪 ${event.detail?.readyKinds || 0} / ${event.detail?.totalKinds || 4} 类资料。`, inputsReady ? 'ready' : '');
    updateButtons();
  });

  globalThis.addEventListener('zhenmai:validation-state', event => {
    validated = Boolean(event.detail?.valid);
    if (!busy) setStatus(validated ? `结构校验通过：${event.detail?.ready || 0} 个文件可解析，可以建立案例。` : '输入已变化或存在无法解析的文件，请重新校验。', validated ? 'ready' : 'error');
    updateButtons();
  });

  createButton.addEventListener('click', async () => {
    if (busy || !inputsReady) return;
    busy = true; gallery.replaceChildren(); updateButtons();
    try {
      setStatus('正在上传到本地服务并建立案例…', 'working');
      const record = await WorkbenchInput.prepare(settings(), message => setStatus(message, 'working'));
      renderCase(record);
      setStatus('案例建立完成。输入文件、物理映射和质量门结果已绑定。', 'ready');
    } catch (error) {
      setStatus(error.message || '案例建立失败。', 'error');
    } finally {
      busy = false; updateButtons();
    }
  });

  alignButton.addEventListener('click', async () => {
    if (busy || !activeCase?.alignment?.enabled) return;
    busy = true; updateButtons();
    try {
      setStatus('正在运行当前用户案例的物理对齐…', 'working');
      const result = await WorkbenchInput.request('/api/alignment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: activeCase.dataset_id, operation: 'well_alignment', parameters: settings() })
      });
      renderAlignment(result);
      setStatus('物理对齐完成，下面展示的图来自当前上传资料。', 'ready');
    } catch (error) {
      setStatus(error.message || '物理对齐失败。', 'error');
    } finally {
      busy = false; updateButtons();
    }
  });

  try {
    const cached = JSON.parse(sessionStorage.getItem('zhenmai-active-case') || 'null');
    if (cached?.dataset_id) renderCase(cached);
    const aligned = JSON.parse(sessionStorage.getItem('zhenmai-active-alignment') || 'null');
    if (aligned?.outputs) renderAlignment(aligned);
  } catch {}
  updateButtons();
})();
