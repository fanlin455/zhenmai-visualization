(() => {
  const dialog = document.getElementById("data-check-dialog");
  const rows = document.getElementById("file-check-rows");
  const button = document.getElementById("validate-data");
  const fields = [
    ["seismic-file", "地震数据", "seismic"], ["time-depth-file", "时深关系", "time"],
    ["well-file", "测井曲线", "well"], ["well-location-file", "井位数据", "location"],
  ].map(([id, label, kind]) => ({
    input: document.getElementById(id), list: document.getElementById(`${id}-status`),
    label, kind, records: [], revision: 0,
  }));
  if (!dialog || !rows || !button || fields.some(({ input, list }) => !input || !list)) return;
  let restoring = true, restoreRevision = 0;
  const sizeText = (size) => size < 1024 ? `${size} B`
    : size < 1048576 ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / 1048576).toFixed(1)} MB`;
  const ready = (field) => field.records.length > 0 && field.records.every((record) => record.state === "ready");
  const sync = () => {
    const complete = fields.filter(ready).length;
    button.disabled = restoring || complete !== fields.length;
    globalThis.dispatchEvent?.(new CustomEvent("zhenmai:input-state", { detail: {
      complete: !restoring && complete === fields.length,
      readyKinds: complete,
      totalKinds: fields.length,
      restoring,
    }}));
  };
  const render = (field) => {
    field.list.replaceChildren();
    if (!field.records.length) {
      const item = document.createElement("li");
      item.className = "hint";
      item.textContent = "等待选择文件";
      field.list.appendChild(item);
      return;
    }
    field.records.forEach((record) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.className = "upload-file-name";
      name.textContent = record.file.name;
      name.title = record.file.name;
      const status = document.createElement("span");
      status.className = "upload-file-state";
      status.setAttribute("data-state", record.state);
      status.textContent = record.state === "ready" ? "✓"
        : record.state === "error" ? record.error : `读取中 ${record.progress}%`;
      if (record.state === "ready") {
        status.setAttribute("aria-label", "本地载入成功");
        status.title = "本地载入成功";
      }
      item.appendChild(name);
      item.appendChild(status);
      const deletion = document.createElement("button");
      deletion.type = "button"; deletion.className = "remove-upload-file";
      deletion.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
      deletion.setAttribute("aria-label", `删除${record.file.name}`); deletion.title = `删除${record.file.name}`;
      deletion.addEventListener("click", () => remove(field, record));
      item.appendChild(deletion);
      field.list.appendChild(item);
    });
  };
  const persist = async field => {
    if (!globalThis.InputSession) return;
    await InputSession.setFiles(field.kind, field.records.map(({file,state,progress,error}) => ({file,state,progress,error})));
  };
  const invalidate = () => {
    if (dialog.open) dialog.close(); globalThis.DataVisuals?.clear(); rows.replaceChildren();
    globalThis.dispatchEvent?.(new CustomEvent("zhenmai:validation-state", { detail: { valid: false } }));
  };
  const remove = async (field, record) => {
    ++field.revision; invalidate(); field.records = field.records.filter(item => item !== record); field.input.value = "";
    field.input.removeAttribute("aria-invalid"); render(field); sync();
    try { await persist(field); } catch { field.list.setAttribute("title", "无法保存删除状态，请检查浏览器存储空间。"); }
    if (field.records.some(item => item.state === "pending")) await load(field, field.records.map(item => item.file));
  };
  const load = async (field, supplied) => {
    const revision = ++field.revision;
    // 更换文件时立即使旧结果失效，异步读取不能覆盖新选择。
    if (dialog.open) dialog.close();
    globalThis.DataVisuals?.clear();
    rows.replaceChildren();
    field.input.removeAttribute("aria-invalid");
    let files = Array.from(supplied || field.input.files || []);
    if (!supplied && field.kind === "well") {
      const existing = field.records.map(record => record.file);
      files = [...existing, ...files.filter(file => !existing.some(old => old.name === file.name && old.size === file.size && old.lastModified === file.lastModified))];
    }
    field.records = files.map((file) => ({ file, state: "pending", progress: 0 }));
    render(field);
    sync();
    try { await persist(field); } catch { field.list.setAttribute("title", "文件暂未保存，切换页面可能丢失；请检查浏览器存储空间。"); }
    if (revision !== field.revision) return;
    for (const record of field.records) {
      try {
        if (!record.file.size) throw new Error("文件为空，请重新选择。");
        const chunk = 1048576;
        for (let offset = 0; offset < record.file.size; offset += chunk) {
          if (revision !== field.revision) return;
          const end = Math.min(offset + chunk, record.file.size);
          const bytes = await record.file.slice(offset, end).arrayBuffer();
          if (revision !== field.revision) return;
          if (bytes.byteLength !== end - offset) throw new Error("文件读取不完整，请重新选择。");
          const progress = Math.floor(end / record.file.size * 100);
          if (progress - record.progress >= 10) {
            record.progress = progress;
            render(field);
          }
        }
        record.state = "ready";
      } catch (error) {
        if (revision !== field.revision) return;
        record.state = "error";
        record.error = error.message === "文件为空，请重新选择。" || error.message === "文件读取不完整，请重新选择。"
          ? error.message : "文件读取失败，请检查文件权限或占用情况后重新选择。";
        field.input.setAttribute("aria-invalid", "true");
      }
      try { await persist(field); }
      catch { record.state = "error"; record.error = "文件保存失败，请检查浏览器存储空间后重试。"; }
      if (revision !== field.revision) return;
      render(field);
      sync();
    }
  };
  const showCheck = async () => {
    if (restoring || !fields.every(ready)) return sync();
    rows.replaceChildren();
    fields.forEach(({ label, records }) => records.forEach(({ file }) => {
      const row = document.createElement("tr");
      [label, file.name, sizeText(file.size), "非空 · 完整读取通过", "等待解析"].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      rows.appendChild(row);
    }));
    globalThis.syncValidationDialogSize?.();
    if (!dialog.open) dialog.showModal();
    const note = document.getElementById("data-check-note");
    note.textContent = "文件读取通过，正在解析图表；井震对应关系在物理对齐中检查。";
    const records = fields.flatMap(field => field.records);
    const checks = Array.from(rows.children).map(row => row.lastElementChild);
    const result = await globalThis.DataVisuals.inspect(fields, (record, preview) => {
      const cell = checks[records.indexOf(record)];
      cell.textContent = preview.error ? `无法预览：${preview.error}` : preview.data.detail.includes("请复核") ? "可绘图 · 数据需复核" : "结构解析通过 · 可预览";
      cell.className = preview.error || preview.data?.detail.includes("请复核") ? "preview-error" : "preview-success";
    });
    if (result) {
      note.textContent = `读取检查通过；${result.ready}个文件可预览${result.failed ? `，${result.failed}个文件无法预览，请查看提示` : ""}。井震对应关系在物理对齐中检查。`;
      globalThis.dispatchEvent?.(new CustomEvent("zhenmai:validation-state", { detail: { valid: result.failed === 0, ...result } }));
    }
  };
  fields.forEach((field) => {
    field.input.addEventListener("change", () => {
      // Cancelling a file picker must never clear a previously saved file.
      if (!field.input.files?.length) return;
      return load(field);
    });
    render(field);
  });
  button.addEventListener("click", showCheck);
  document.getElementById("close-data-check").addEventListener("click", () => dialog.close());
  document.querySelectorAll("#seismic-form, #well-form").forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
  });
  const restore = async () => {
    const attempt = ++restoreRevision;
    restoring = true; sync();
    for (const field of fields) {
      const revision = field.revision;
      try {
        const records = await globalThis.InputSession?.getFiles(field.kind);
        if (attempt !== restoreRevision) return;
        if (revision !== field.revision || !records) continue;
        if (records.every(record => record.state === "ready")) { field.records = records; render(field); sync(); }
        else await load(field, records.map(record => record.file));
      } catch { field.list.setAttribute("title", "无法恢复已保存文件，请检查浏览器存储空间。"); }
    }
    if (attempt === restoreRevision) { restoring = false; sync(); }
  };
  globalThis.addEventListener?.("pageshow", event => { if (event.persisted) restore(); });
  sync(); restore();
})();
