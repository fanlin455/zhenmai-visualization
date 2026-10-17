(() => {
  const kinds = ['seismic', 'time', 'well', 'location'];
  let database;
  const pending = new Set();
  const open = () => database ||= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('浏览器不支持文件保存，请使用本地工作台。'));
    const request = indexedDB.open('zhenmai-inputs', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
  const run = async (mode, action) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      let value;
      const request = action(tx.objectStore('files'));
      request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('文件保存失败。'));
    });
  };
  const track = promise => {
    pending.add(promise); promise.then(() => pending.delete(promise), () => pending.delete(promise)); return promise;
  };
  const filesFrom = value => value?.records || (value?.file ? [{file:value.file,state:'ready'}] : []);
  globalThis.InputSession = {
    kinds,
    getFiles: async kind => filesFrom(await run('readonly', store => store.get(kind))),
    setFiles: (kind, records) => track(run('readwrite', store => store.put({records, savedAt:Date.now(), token:crypto.randomUUID()}, kind))),
    remove: kind => track(run('readwrite', store => store.delete(kind))),
    snapshot: async () => {
      const entries = await Promise.all(kinds.map(async kind => [kind, await run('readonly', store => store.get(kind))]));
      return Object.fromEntries(entries.map(([kind,value]) => [kind,{records:filesFrom(value), token:value?.token || value?.savedAt || ''}]));
    },
    flush: async () => { while(pending.size) await Promise.all([...pending]); },
  };
  // Let writes complete before navigating. Reading can resume on the next visit.
  document.querySelectorAll('.site-header nav a').forEach(link => link.addEventListener('click', async event => {
    if (!pending.size || event.ctrlKey || event.metaKey || event.shiftKey || event.button) return;
    event.preventDefault();
    try {
      await globalThis.InputSession.flush();
      if (globalThis.ZhenmaiNavigate) globalThis.ZhenmaiNavigate(link.href);
      else location.href = link.href;
    }
    catch { /* The file row exposes storage failure; keep the current page. */ }
  }));
})();
