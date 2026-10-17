(() => {
  const nav = document.querySelector('.site-header nav');
  if (!nav || !globalThis.SettingsModel) return;
  const model = SettingsModel;
  const icon = (paths, className = '') => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const gear = icon('<path d="m9.5 3-.6 2.3-1.4.8-2.3-.6-2.5 4.3 1.7 1.7v1.6l-1.7 1.7 2.5 4.3 2.3-.6 1.4.8.6 2.3h5l.6-2.3 1.4-.8 2.3.6 2.5-4.3-1.7-1.7v-1.6l1.7-1.7-2.5-4.3-2.3.6-1.4-.8L14.5 3z"/><circle cx="12" cy="12" r="3"/>');
  const refreshIcon = icon('<path d="M20 5v5h-5M4 19v-5h5"/><path d="M19.2 10a7.5 7.5 0 0 0-12.6-5.3L4 7M4.8 14a7.5 7.5 0 0 0 12.6 5.3L20 17"/>', 'settings-refresh-icon');
  const button = document.createElement('button');
  button.id = 'open-settings'; button.type = 'button'; button.className = 'settings-nav-button';
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'settings-dialog');
  button.innerHTML = `<span>设置${gear}</span>`; nav.append(button);
  const dialog = document.createElement('dialog');
  dialog.id = 'settings-dialog'; dialog.className = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const parameters = model.parameters.map(p => `${escape(p.label)} ${escape(p.value)}`).join(' · ');
  dialog.innerHTML = `<div class="settings-heading"><h2 id="settings-title">设置</h2><span id="settings-status" class="settings-status" role="status" aria-live="polite" data-state="connecting"><i aria-hidden="true"></i><span id="settings-status-text">连接中</span></span><button id="settings-refresh" type="button" class="settings-refresh" aria-label="刷新连接状态" title="刷新">${refreshIcon}</button></div>
    <dl class="settings-rows"><div><dt>模型版本</dt><dd>${escape(model.version)}</dd></div><div><dt>计算设备</dt><dd>${escape(model.device)}</dd></div><div class="settings-parameters"><dt>模型参数</dt><dd>${parameters}</dd></div></dl>
    <div class="settings-footer"><button id="settings-close" type="button">关闭</button></div>`;
  document.body.append(dialog);
  const status = document.getElementById('settings-status');
  const statusText = document.getElementById('settings-status-text');
  const refresh = document.getElementById('settings-refresh');
  const refreshGraphic = refresh.querySelector('svg');
  const api = globalThis.WorkbenchInput?.api || (location.protocol.startsWith('http') && location.port === '8002' ? location.origin : 'http://127.0.0.1:8002');
  let controller = null, generation = 0, poll = null, animation = null;
  const setStatus = state => {
    status.dataset.state = state;
    statusText.textContent = { connecting: '连接中', connected: '已连接', disconnected: '断开' }[state];
  };
  const check = async (spin = false, quiet = false) => {
    if (!dialog.open) return;
    if (quiet && controller) return;
    controller?.abort(); controller = new AbortController();
    const active = controller, current = ++generation;
    const timeout = setTimeout(() => active.abort(), 3500);
    if (!quiet) setStatus('connecting');
    refresh.disabled = true;
    if (spin) {
      animation?.cancel();
      animation = refreshGraphic.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 550, easing: 'ease-in-out' });
    }
    try {
      const response = await fetch(api + '/api/health', { signal: active.signal, cache: 'no-store' });
      const data = response.ok ? await response.json() : null;
      if (dialog.open && current === generation) setStatus(data?.service === 'zhenmai-physical' && Number(data.version) >= 2 ? 'connected' : 'disconnected');
    } catch {
      if (dialog.open && current === generation) setStatus('disconnected');
    } finally {
      clearTimeout(timeout);
      if (current === generation) { controller = null; refresh.disabled = false; }
    }
  };
  button.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.showModal(); check();
    poll = setInterval(() => { if (!document.hidden && dialog.open) check(false, true); }, 8000);
  });
  refresh.addEventListener('click', () => check(true));
  document.getElementById('settings-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    clearInterval(poll); poll = null; generation++; controller?.abort(); controller = null;
    refresh.disabled = false; animation?.cancel(); button.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  window.addEventListener('offline', () => { generation++; controller?.abort(); controller = null; refresh.disabled = false; setStatus('disconnected'); });
  window.addEventListener('online', () => { if (dialog.open) check(); });
})();
