(() => {
  const colors = ["#56cfe7", "#97a9f3", "#36c69e", "#e8b971", "#de8cbd", "#9bda87"];
  const kinds = ["seismic", "well", "time", "location"];
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const range = values => {
    let min = Infinity, max = -Infinity;
    values.forEach(v => { if (v !== null && Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); } });
    if (!Number.isFinite(min)) throw new Error("没有可绘制的有限数值。");
    if (min === max) { const pad = Math.max(Math.abs(min) * .05, 1); min -= pad; max += pad; }
    return { min, max };
  };
  const number = n => Math.abs(n) >= 100000 || (Math.abs(n) < .001 && n !== 0) ? n.toExponential(2) : Number(n.toFixed(3)).toString();
  const path = points => { let active = false; return points.map(p => { if (p === null) { active = false; return ""; } const prefix = active ? "L" : "M"; active = true; return `${prefix}${p[0].toFixed(2)},${p[1].toFixed(2)}`; }).join(" "); };
  const svg = markup => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400" role="img"><style>text{fill:#bed1e0;font:15px system-ui,sans-serif}</style><rect width="1000" height="400" fill="#08182a"/>${markup}</svg>`;
  const wells = data => {
    const yr = range(data.series.flatMap(s => s.points.map(p => p[1]))), top = 78, height = 286;
    const gap = 12, width = (884 - gap * (data.series.length - 1)) / data.series.length;
    let markup = `<text x="18" y="24">${escape(data.depthLabel)}</text><text x="18" y="43" style="font-size:12px">${escape(data.depthUnit)}</text>`;
    data.series.forEach((series, index) => {
      const left = 86 + index * (width + gap), color = colors[index % colors.length];
      const xr = range(series.points.map(p => p[0]));
      const sx = v => left + (v - xr.min) / (xr.max - xr.min) * width;
      const sy = v => top + (v - yr.min) / (yr.max - yr.min) * height;
      markup += `<g class="well-preview-track"><title>${escape(series.name)}${series.unit ? ` / ${escape(series.unit)}` : ""}</title><text x="${left + width / 2}" y="24" text-anchor="middle" style="fill:${color};font-weight:600">${escape(series.name)}</text><text x="${left + width / 2}" y="43" text-anchor="middle" style="font-size:12px">${escape(series.unit)}</text><text x="${left}" y="65" style="font-size:12px">${number(xr.min)}</text><text x="${left + width}" y="65" text-anchor="end" style="font-size:12px">${number(xr.max)}</text><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#0b1d30" stroke="#31516a"/>`;
      for (let i = 0; i <= 5; i++) {
        const y = top + height * i / 5;
        markup += `<path d="M${left} ${y}H${left + width}" stroke="#254058"/>`;
        if (!index) markup += `<text x="72" y="${y + 5}" text-anchor="end">${number(yr.min + (yr.max - yr.min) * i / 5)}</text>`;
      }
      for (let i = 0; i <= 4; i++) markup += `<path d="M${left + width * i / 4} ${top}V${top + height}" stroke="#20374d"/>`;
      markup += `<path class="well-preview-curve" d="${path(series.points.map(p => p[0] === null ? null : [sx(p[0]), sy(p[1])]))}" stroke="${color}" fill="none" stroke-width="2" stroke-linejoin="round"/></g>`;
    });
    return svg(markup).replace('role="img"', `role="img" aria-label="${data.series.length}条测井曲线并排展示，共享深度轴"`);
  };
  const scatter = data => {
    const xr = range(data.points.map(p => p[0])), yr = range(data.points.map(p => p[1]));
    const x = v => 95 + (v - xr.min) / (xr.max - xr.min) * 830;
    const y = v => 338 - (v - yr.min) / (yr.max - yr.min) * 282;
    let markup = `<text x="95" y="26">${escape(data.yLabel)}</text><text x="925" y="390" text-anchor="end">${escape(data.xLabel)}</text>`;
    for (let i = 0; i <= 5; i++) {
      const cx = 95 + 830 * i / 5, cy = 338 - 282 * i / 5;
      markup += `<path d="M${cx} 56V338M95 ${cy}H925" stroke="#203e56"/><text x="${cx}" y="365" text-anchor="middle">${number(xr.min + (xr.max - xr.min) * i / 5)}</text><text x="80" y="${cy + 5}" text-anchor="end">${number(yr.min + (yr.max - yr.min) * i / 5)}</text>`;
    }
    const groups = new Map();
    data.points.forEach(p => { const name = data.grouped ? p[2] : '全部'; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(p); });
    if (data.type === "time") Array.from(groups.values()).forEach((points, index) => {
      markup += `<path d="${path(points.map(p => [x(p[0]), y(p[1])]))}" stroke="${colors[index % colors.length]}" fill="none" stroke-width="2"/>`;
    });
    data.points.forEach((p, i) => {
      const index = data.grouped ? Array.from(groups.keys()).indexOf(p[2]) : i;
      markup += `<circle cx="${x(p[0])}" cy="${y(p[1])}" r="${data.type === "location" ? 5 : 3}" fill="${colors[index % colors.length]}"><title>${escape(p[2])}：${number(p[0])}, ${number(p[1])}</title></circle>`;
      if (data.type === "location" && i < 20) markup += `<text x="${x(p[0]) + 9}" y="${y(p[1]) - 8}">${escape(String(p[2]).slice(0, 50))}</text>`;
    });
    return svg(markup);
  };
  const seismic = (target, data) => {
    const height = data.grid.length, width = data.grid[0]?.length;
    if (!height || !width) throw new Error("地震矩阵为空。");
    const finite = data.grid.flat().filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
    if (!finite.length) throw new Error("地震矩阵不含有限数值。");
    const amplitude = finite[Math.floor((finite.length - 1) * .98)] || 1;
    const raster = document.createElement("canvas"); raster.width = width; raster.height = height;
    const source = raster.getContext("2d"), image = source.createImageData(width, height);
    data.grid.forEach((row, r) => row.forEach((value, c) => {
      const index = (r * width + c) * 4;
      const grey = Number.isFinite(value) ? Math.round(128 + Math.max(-1, Math.min(1, value / amplitude)) * 122) : 32;
      image.data[index] = grey; image.data[index + 1] = grey; image.data[index + 2] = grey; image.data[index + 3] = 255;
    }));
    source.putImageData(image, 0, 0);
    const canvas = document.createElement("canvas"); canvas.width = 1000; canvas.height = 400;
    canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "当前上传文件的地震矩阵灰度剖面预览");
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#08182a"; ctx.fillRect(0, 0, 1000, 400);
    ctx.drawImage(raster, 78, 42, 870, 292); ctx.fillStyle = "#bed1e0"; ctx.font = "15px system-ui";
    ctx.fillText(data.yLabel, 18, 24);
    for (let i = 0; i <= 5; i++) {
      ctx.textAlign = "right"; ctx.fillText(String(Math.round(i * (data.rowCount - 1) / 5)), 64, 47 + i * 58.4);
      ctx.textAlign = "center"; ctx.fillText(String(Math.round(i * (data.columnCount - 1) / 5)), 78 + i * 174, 360);
    }
    ctx.textAlign = "right"; ctx.fillText(data.xLabel, 948, 390); ctx.strokeStyle = "#45617b"; ctx.strokeRect(78, 42, 870, 292);
    target.appendChild(canvas);
  };
  let epoch = 0, lists = {}, cache = new WeakMap(), disposeLocation = null;
  const tabs = Array.from(document.querySelectorAll("[data-preview-tab]"));
  const activate = kind => {
    tabs.forEach(tab => {
      const selected = tab.dataset.previewTab === kind;
      tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
      document.getElementById(`panel-${tab.dataset.previewTab}`).hidden = !selected;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activate(tab.dataset.previewTab));
    tab.addEventListener("keydown", event => {
      const index = event.key === "ArrowRight" ? (i + 1) % tabs.length : event.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (index >= 0) { event.preventDefault(); activate(tabs[index].dataset.previewTab); tabs[index].focus(); }
    });
  });
  const render = kind => {
    if (kind === "location") { disposeLocation?.(); disposeLocation = null; }
    const select = document.getElementById(`${kind}-preview-select`), list = lists[kind] || [];
    const item = list[Number(select.value) || 0], status = document.getElementById(`${kind}-preview-status`), target = document.getElementById(`${kind}-actual-plot`);
    target.replaceChildren(); status.classList.remove("preview-error");
    if (!item) { status.textContent = "等待检查文件。"; return; }
    if (!item.result) { status.textContent = `${item.file.name} · 正在解析…`; return; }
    if (item.result.error) { status.textContent = `${item.file.name} · ${item.result.error}`; status.classList.add("preview-error"); return; }
    const data = item.result.data;
    status.textContent = `${item.file.name} · ${data.detail}`;
    try {
      if (kind === "seismic") seismic(target, data);
      else if (kind === "location") disposeLocation = globalThis.WellLocation3D.render(target, data);
      else target.innerHTML = kind === "well" ? wells(data) : scatter(data);
    } catch (e) { target.replaceChildren(); status.textContent = `无法绘图：${e.message}`; status.classList.add("preview-error"); }
  };
  kinds.forEach(kind => document.getElementById(`${kind}-preview-select`).addEventListener("change", () => render(kind)));
  const clear = () => {
    epoch++; lists = {}; cache = new WeakMap(); activate("summary");
    kinds.forEach(kind => {
      document.getElementById(`${kind}-preview-picker`).hidden = true;
      document.getElementById(`${kind}-preview-select`).replaceChildren();
      render(kind);
    });
  };
  const inspect = async (fields, onResult) => {
    const revision = ++epoch; activate("summary"); let ready = 0, failed = 0;
    fields.forEach(field => {
      const kind = field.kind, select = document.getElementById(`${kind}-preview-select`);
      lists[kind] = field.records.map(record => ({ file: record.file, result: null })); select.replaceChildren();
      lists[kind].forEach((item, i) => { const option = document.createElement("option"); option.value = String(i); option.textContent = item.file.name; select.appendChild(option); });
      select.value = "0"; document.getElementById(`${kind}-preview-picker`).hidden = lists[kind].length <= 1; render(kind);
    });
    await Promise.all(fields.map(async field => {
      const kind = field.kind;
      for (let i = 0; i < field.records.length; i++) {
        const record = field.records[i]; let result = cache.get(record.file)?.[kind];
        if (!result) {
          try { result = { data: await globalThis.FilePreview.parse(record.file, kind) }; }
          catch (e) { result = { error: e.message || "无法解析文件。" }; }
          if (revision !== epoch) return;
          const cached = cache.get(record.file) || {}; cached[kind] = result; cache.set(record.file, cached);
        }
        if (revision !== epoch) return;
        lists[kind][i].result = result; result.error ? failed++ : ready++;
        onResult(record, result); render(kind);
      }
    }));
    return revision === epoch ? { ready, failed } : null;
  };
  globalThis.DataVisuals = { inspect, clear };
  clear();
})();
