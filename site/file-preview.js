(() => {
  const limit = 128 * 1024 * 1024;
  const numeric = value => value !== null && String(value).trim() !== "" && Number.isFinite(Number(value));
  const error = message => { throw new Error(message); };
  const text = async file => {
    if (file.size > 16 * 1024 * 1024) error("文本文件超过16MB，请分段预览或使用后续服务端解析。");
    const bytes = await file.arrayBuffer();
    let result = new TextDecoder().decode(bytes);
    if (result.includes("\ufffd")) result = new TextDecoder("gb18030").decode(bytes);
    return result.replace(/^\ufeff/, "");
  };
  const csv = source => {
    const result = []; let row = [], cell = "", quoted = false;
    const firstLine = source.split(/\r?\n/).find(line => line.trim() && !line.startsWith("#")) || "";
    const separator = firstLine.includes("\t") ? "\t" : ",";
    for (let i = 0; i <= source.length; i++) {
      const ch = i === source.length ? "\n" : source[i];
      if (ch === '"') {
        if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (ch === separator || ch === "\n")) {
        row.push(cell.trim()); cell = "";
        if (ch === "\n") { if (row.some(Boolean) && !row[0].startsWith("#")) result.push(row); row = []; }
      } else if (ch !== "\r" || quoted) cell += ch;
    }
    if (quoted) error("CSV引号未闭合。");
    if (!result.length) error("没有可读取的数据行。");
    return result;
  };
  const table = (rows, kind) => {
    let headers;
    if (Array.isArray(rows[0]) && rows[0].every(numeric)) {
      headers = rows[0].map((_, i) => kind === "well" ? (i ? `曲线${i}` : "depth") : kind === "time" ? ["depth", "time"][i] || `列${i}` : ["x", "y"][i] || `列${i}`);
    } else if (Array.isArray(rows[0])) headers = rows.shift().map(String);
    else {
      headers = Array.from(new Set(rows.flatMap(row => Object.keys(row || {}))));
      rows = rows.map(row => headers.map(key => row[key]));
    }
    if (!rows.length || !headers.length) error("缺少数据行或列名。");
    if (rows.some(row => row.length !== headers.length)) error("数据行的列数不一致。");
    return { headers, rows };
  };
  const find = (headers, names) => headers.findIndex(header => names.includes(header.toLowerCase().replace(/[\s\[\]()]/g, "")));
  const depthNames = ["depth", "depth_m", "dept", "deph", "md", "md_m", "tvd", "tvd_m", "深度", "深度m"];
  const toSeries = ({ headers, rows }, kind, units = [], nullValue = null) => {
    if (kind === "well") {
      const depth = find(headers, depthNames);
      if (depth < 0) error("测井表缺少depth、DEPT、MD或深度列。");
      if (rows.some(row => !numeric(row[depth]))) error("测井深度列包含非数值。");
      const preference = ["GR", "GRD", "GRC", "RHOB", "DEN", "DT", "AC", "RT", "RLLD", "NPHI", "CNL", "SP"];
      const candidates = headers.map((name, i) => ({ name, i })).filter(({ i }) => i !== depth && rows.some(row => numeric(row[i]) && Number(row[i]) !== nullValue));
      candidates.sort((a, b) => (preference.indexOf(a.name.toUpperCase()) < 0 ? 99 : preference.indexOf(a.name.toUpperCase())) - (preference.indexOf(b.name.toUpperCase()) < 0 ? 99 : preference.indexOf(b.name.toUpperCase())));
      const selected = candidates.slice(0, 6);
      if (!selected.length) error("没有可绘制的数值测井曲线。");
      const stride = Math.max(1, Math.ceil(rows.length / 900));
      const sampled = rows.filter((_, i) => i % stride === 0 || i === rows.length - 1);
      return { type: "well", depthLabel: headers[depth], depthUnit: units[depth] || "", series: selected.map(({ name, i }) => ({ name, unit: units[i] || "", points: sampled.map(row => [numeric(row[i]) && Number(row[i]) !== nullValue ? Number(row[i]) : null, Number(row[depth])]) })), detail: `${rows.length}个深度点 · 展示${selected.length}条曲线${candidates.length > 6 ? "（前六条）" : ""}` };
    }
    const x = kind === "time" ? find(headers, depthNames) : find(headers, ["x", "x_m", "xm", "easting", "easting_m", "east", "longitude", "lon", "经度", "东坐标"]);
    const y = kind === "time" ? find(headers, ["time", "twt", "t", "time_ms", "time_s", "twt_ms", "twt_s", "时间", "双程时间"]) : find(headers, ["y", "y_m", "ym", "northing", "northing_m", "north", "latitude", "lat", "纬度", "北坐标"]);
    if (x < 0 || y < 0) error(kind === "time" ? "需要depth和time/TWT列。" : "需要X/Y、Easting/Northing或经纬度列。");
    if (rows.some(row => !numeric(row[x]) || !numeric(row[y]))) error("坐标或时深列含缺失值、非数值。");
    const name = find(headers, ["well", "well_id", "well_name", "name", "id", "井名", "井号"]);
    const stride = Math.max(1, Math.ceil(rows.length / 1500));
    const sampled = rows.map((row, i) => ({ row, i })).filter(({ i }) => i % stride === 0 || i === rows.length - 1);
    const points = sampled.map(({ row, i }) => [Number(row[x]), Number(row[y]), name >= 0 && String(row[name] ?? "").trim() ? String(row[name]) : `点${i + 1}`]);
    if (kind === "location") {
      const depth = find(headers, depthNames);
      const z = depth >= 0 ? depth : find(headers, ["z", "z_m", "zm", "elevation", "elevation_m", "height", "height_m", "高程", "高程m", "井深", "井深m"]);
      const depthMode = depth >= 0 || (z >= 0 && headers[z].includes("井深"));
      if (z >= 0 && rows.some(row => !numeric(row[z]))) error("深度或Z列有缺失值、非数值，请补齐后重新校验。");
      const positions = sampled.map(({ row }, i) => ({ x: Number(row[x]), y: Number(row[y]), z: z >= 0 ? Number(row[z]) : 0, name: points[i][2] }));
      return { type: kind, points, positions, hasZ: z >= 0, zMode: depthMode ? "depth" : "coordinate", xLabel: headers[x], yLabel: headers[y], zLabel: z >= 0 ? headers[z] : "Z（未提供）", detail: `${new Set(positions.map(p => p.name)).size}口井/点位 · ${rows.length}个坐标点${rows.length > positions.length ? ` · 抽样${positions.length}点` : ""}${z >= 0 ? " · 三维坐标" : " · 未提供Z，按Z=0平面显示"}` };
    }
    if (kind === "time" && points.length < 2) error("时深关系至少需要两个点。");
    const lastByWell = new Map();
    const invalidTime = kind === "time" && rows.some(row => {
      const key = name >= 0 ? String(row[name]) : '', previous = lastByWell.get(key);
      lastByWell.set(key,row);
      return previous && (Number(row[x]) <= Number(previous[x]) || Number(row[y]) <= Number(previous[y]));
    });
    const warning = invalidTime ? "；同井时深序列非严格递增，请复核" : "";
    return { type: kind, points, grouped: name >= 0, xLabel: headers[x], yLabel: headers[y], detail: `${rows.length}个点${warning}${kind === "location" ? " · 按原始坐标显示" : " · 单位沿用列名"}` };
  };
  const las = source => {
    let section = "", wrap = false, nullValue = -999.25; const headers = [], units = [], rows = [];
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim(); if (!trimmed || trimmed.startsWith("#")) continue;
      if (trimmed.startsWith("~")) { section = trimmed[1]?.toUpperCase(); continue; }
      if (/^WRAP\s*\..*YES/i.test(trimmed)) wrap = true;
      const nullMatch = trimmed.match(/^NULL\s*\.\s*([-+\d.eE]+)/i); if (nullMatch) nullValue = Number(nullMatch[1]);
      if (section === "C") { const match = trimmed.match(/^([^\s.]+)\s*\.\s*([^\s:]*)/); if (match) { headers.push(match[1]); units.push(match[2]); } }
      if (section === "A") rows.push(trimmed.split(/[\s,]+/));
    }
    if (wrap) error("LAS WRAP=YES换行格式暂不支持，请导出WRAP=NO。");
    if (headers.length < 2 || !rows.length) error("LAS缺少曲线定义或ASCII数据段。");
    if (rows.some(row => row.length !== headers.length)) error("LAS数据列数与曲线定义不一致。");
    return toSeries({ headers, rows }, "well", units, nullValue);
  };
  const npy = buffer => {
    const view = new DataView(buffer), bytes = new Uint8Array(buffer);
    if (bytes.length < 12 || bytes[0] !== 147 || new TextDecoder().decode(bytes.slice(1, 6)) !== "NUMPY") error("NPY文件头不正确。");
    const version = bytes[6]; if (![1, 2, 3].includes(version)) error("不支持的NPY版本。");
    const offset = version === 1 ? 10 : 12;
    const headerSize = version === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
    if (headerSize > 65536 || offset + headerSize > bytes.length) error("NPY文件头截断或过长。");
    const header = new TextDecoder().decode(bytes.slice(offset, offset + headerSize));
    const dtype = header.match(/['"]descr['"]\s*:\s*['"]([<>=|])([fiu])(\d+)['"]/);
    const shape = header.match(/['"]shape['"]\s*:\s*\(([^)]*)\)/)?.[1].split(",").map(s => s.trim()).filter(Boolean).map(Number);
    const order = header.match(/['"]fortran_order['"]\s*:\s*(True|False)/)?.[1];
    if (!dtype || !shape || !order || shape.length < 2 || shape.some(n => !Number.isSafeInteger(n) || n <= 0)) error("需要二维或更高维的数值NPY数组；不支持对象/结构化数组。");
    const width = Number(dtype[3]), dataOffset = offset + headerSize, count = shape.reduce((a, b) => a * b, 1);
    const method = { f4: "getFloat32", f8: "getFloat64", i1: "getInt8", i2: "getInt16", i4: "getInt32", u1: "getUint8", u2: "getUint16", u4: "getUint32" }[dtype[2] + width];
    if (!method) error("当前预览支持float32/64与8/16/32位整数。");
    if (!Number.isSafeInteger(count) || dataOffset + count * width > bytes.length) error("NPY数据长度不足。");
    const nr = shape.at(-2), nc = shape.at(-1), leading = shape.slice(0, -2), coords = leading.map((n, i) => i === leading.length - 1 ? Math.floor(n / 2) : 0);
    let base = 0, rowStride, colStride;
    if (order === "True") { let stride = 1; coords.forEach((v, i) => { base += v * stride; stride *= leading[i]; }); rowStride = stride; colStride = stride * nr; }
    else { let flat = 0; coords.forEach((v, i) => flat = flat * leading[i] + v); base = flat * nr * nc; rowStride = nc; colStride = 1; }
    const height = Math.min(nr, 280), columns = Math.min(nc, 360);
    const grid = Array.from({ length: height }, (_, r) => Array.from({ length: columns }, (_, c) => view[method](dataOffset + (base + Math.floor(r * nr / height) * rowStride + Math.floor(c * nc / columns) * colStride) * width, dtype[1] !== ">")));
    if (!grid.some(row => row.some(Number.isFinite))) error("地震数组没有有限数值。");
    return { type: "seismic", grid, rowCount: nr, columnCount: nc, detail: `数组${shape.join(" × ")} · 末二维切片${leading.length ? ` · 前置索引[${coords.join(",")}]` : ""}`, xLabel: "列索引", yLabel: "行索引" };
  };
  const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = bytes => { let crc = -1; for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ -1) >>> 0; };
  const npz = async buffer => {
    const view = new DataView(buffer); let end = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === buffer.byteLength) { end = i; break; }
    if (end < 0) error("NPZ压缩包目录损坏或采用ZIP64格式。");
    const entries = []; let pos = view.getUint32(end + 16, true);
    const count = view.getUint16(end + 10, true);
    if (count === 65535 || pos === 0xffffffff) error("ZIP64预览需后续服务端解析。");
    for (let i = 0; i < count; i++) {
      if (pos + 46 > buffer.byteLength || view.getUint32(pos, true) !== 0x02014b50) error("NPZ目录损坏。");
      const length = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true);
      const name = new TextDecoder().decode(new Uint8Array(buffer, pos + 46, length));
      if (name.endsWith(".npy") && !/well|label|mask|confidence/i.test(name)) entries.push({ name, flags: view.getUint16(pos + 8, true), method: view.getUint16(pos + 10, true), crc: view.getUint32(pos + 16, true), compressed: view.getUint32(pos + 20, true), size: view.getUint32(pos + 24, true), start: view.getUint32(pos + 42, true) });
      pos += 46 + length + extra + comment;
    }
    entries.sort((a, b) => Number(/^(?:.*\/)?(?:images|seismic|seismic_volume|data|x)\.npy$/i.test(b.name)) - Number(/^(?:.*\/)?(?:images|seismic|seismic_volume|data|x)\.npy$/i.test(a.name)));
    let lastError = "没有可预览的地震数值数组。";
    for (const entry of entries) {
      try {
        if (entry.flags & 1) error("NPZ不能加密。");
        if (entry.size > limit) error("NPZ内数组超过128MB，请使用后续服务端预览。");
        const p = entry.start;
        if (p + 30 > buffer.byteLength || view.getUint32(p, true) !== 0x04034b50) error("NPZ局部文件头损坏。");
        const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
        if (start + entry.compressed > buffer.byteLength) error("NPZ数据截断。");
        let data = new Uint8Array(buffer, start, entry.compressed);
        if (entry.method === 8) {
          if (typeof DecompressionStream === "undefined") error("当前浏览器不支持压缩NPZ预览，请使用NPY。");
          let stream; try { stream = new DecompressionStream("deflate-raw"); } catch { error("当前浏览器不支持压缩NPZ预览，请使用NPY。"); }
          const reader = new Blob([data]).stream().pipeThrough(stream).getReader(), chunks = []; let size = 0;
          while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > limit || size > entry.size) { await reader.cancel(); error("NPZ解压长度异常。"); } chunks.push(next.value); }
          data = new Uint8Array(size); let offset = 0; chunks.forEach(chunk => { data.set(chunk, offset); offset += chunk.length; });
        } else if (entry.method !== 0) error("不支持的NPZ压缩方式。");
        if (data.length !== entry.size || crc32(data) !== entry.crc) error("NPZ长度或CRC校验失败。");
        const result = npy(data.slice().buffer); result.detail += ` · ${entry.name}`; return result;
      } catch (e) { lastError = e.message; }
    }
    error(lastError);
  };
  const segy = async file => {
    if (file.size < 3840) error("SEG-Y文件缺少完整的头部或地震道。");
    const header = new DataView(await file.slice(0, 3600).arrayBuffer());
    const ns = header.getUint16(3220), interval = header.getUint16(3216), format = header.getUint16(3224), extra = header.getInt16(3504);
    const bytes = { 1: 4, 2: 4, 3: 2, 5: 4, 6: 8, 8: 1 }[format];
    if (!bytes || !ns || extra < 0) error("当前仅支持大端、固定道长SEG-Y及明确的扩展文本头。");
    const start = 3600 + extra * 3200, stride = 240 + ns * bytes, traces = Math.floor((file.size - start) / stride);
    if (traces < 1) error("SEG-Y没有完整地震道。");
    const columns = Math.min(traces, 160), height = Math.min(ns, 280), grid = Array.from({ length: height }, () => []);
    for (let c = 0; c < columns; c++) {
      const trace = Math.floor(c * traces / columns), pos = start + trace * stride;
      const view = new DataView(await file.slice(pos, pos + stride).arrayBuffer());
      const localNS = view.getUint16(114); if (localNS && localNS !== ns) error("检测到变长地震道，暂不在浏览器中预览。");
      for (let r = 0; r < height; r++) {
        const p = 240 + Math.floor(r * ns / height) * bytes;
        let value;
        if (format === 1) { const word = view.getUint32(p); value = word === 0 ? 0 : (word >>> 31 ? -1 : 1) * (word & 0xffffff) / 0x1000000 * 16 ** (((word >>> 24) & 127) - 64); }
        else value = view[{ 2: "getInt32", 3: "getInt16", 5: "getFloat32", 6: "getFloat64", 8: "getInt8" }[format]](p);
        grid[r].push(value);
      }
    }
    if (!grid.some(row => row.some(Number.isFinite))) error("地震道没有有限数值。");
    return { type: "seismic", grid, rowCount: ns, columnCount: traces, xLabel: "道索引", yLabel: "采样点", detail: `${traces}道 × ${ns}采样点 · 间隔${interval}μs · 抽样预览` };
  };
  const parse = async (file, kind) => {
    const ext = file.name.split(".").at(-1).toLowerCase();
    if (kind === "seismic" && ["sgy", "segy"].includes(ext)) return segy(file);
    if (kind === "seismic" && ["npy", "npz"].includes(ext)) {
      if (file.size > limit) error("数组文件超过128MB，使用SEG-Y抽样预览或后续服务端解析。");
      const buffer = await file.arrayBuffer(); return ext === "npy" ? npy(buffer) : npz(buffer);
    }
    if (kind === "well" && ext === "las") return las(await text(file));
    if (!["csv", "tsv", "json"].includes(ext)) error("暂不支持此格式预览；请使用地震NPY/NPZ/SEG-Y、测井LAS/CSV，或时深与井位CSV/JSON。");
    const source = await text(file); let data;
    if (ext === "json") {
      data = JSON.parse(source);
      if (kind === "well" && !Array.isArray(data) && Array.isArray(data.depth) && data.curves) data = data.depth.map((depth, i) => Object.fromEntries([["depth", depth], ...Object.entries(data.curves).map(([key, values]) => [key, values[i]])]));
      if (kind === "time" && !Array.isArray(data) && Array.isArray(data.depth) && Array.isArray(data.time)) data = data.depth.map((depth, i) => ({ depth, time: data.time[i] }));
      if (kind === "location" && data.type === "FeatureCollection") data = data.features.map(feature => { if (feature.geometry?.type !== "Point") error("井位GeoJSON仅支持Point。"); return { x: feature.geometry.coordinates[0], y: feature.geometry.coordinates[1], ...(feature.geometry.coordinates.length > 2 ? { z: feature.geometry.coordinates[2] } : {}), name: feature.properties?.well || feature.properties?.well_name || feature.properties?.well_id || feature.properties?.name || "" }; });
      if (!Array.isArray(data) || !data.length) error("JSON需要数据行数组，或depth/time、depth/curves数组对象。");
    } else data = csv(source);
    if (kind === "seismic") {
      if (Array.isArray(data[0]) && data[0].every(v => typeof v === "string" && v.trim() && !numeric(v))) data.shift();
      if (!data.length || !Array.isArray(data[0]) || !data[0].length || data.some(row => !Array.isArray(row) || row.length !== data[0].length || row.some(v => !numeric(v)))) error("地震CSV/JSON需要二维数值矩阵。");
      const nr = data.length, nc = data[0].length, h = Math.min(nr, 280), w = Math.min(nc, 360);
      return { type: "seismic", grid: Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => Number(data[Math.floor(r * nr / h)][Math.floor(c * nc / w)]))), rowCount: nr, columnCount: nc, xLabel: "列索引", yLabel: "行索引", detail: `${nr}行 × ${nc}列 · 数值矩阵` };
    }
    return toSeries(table(data, kind), kind);
  };
  globalThis.FilePreview = { parse };
})();
