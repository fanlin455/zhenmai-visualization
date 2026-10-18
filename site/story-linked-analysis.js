(() => {
  'use strict';

  const data = globalThis.StoryAnalysisData;
  if (!data) return;

  const state = {
    trace: Number(sessionStorage.getItem('geology-selected-trace')) || 220,
    threshold: Number(sessionStorage.getItem('geology-reservoir-threshold')) || data.stats.targetThreshold,
    interval: Number(sessionStorage.getItem('geology-reservoir-interval')) || 0,
    hoverRow: 76,
    consoles: []
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nearestColumn = (trace) => {
    let best = 0;
    data.grid.traces.forEach((value, index) => {
      if (Math.abs(value - trace) < Math.abs(data.grid.traces[best] - trace)) best = index;
    });
    return best;
  };
  const zoneOf = (trace) => trace < 265 ? ['西部稳定层状区', '反射连续、风险较低'] : trace <= 290 ? ['F1 构造转换带', '五条层界同步错动'] : ['东部扰动区', '局部不相干响应增强'];
  const colors = ['#55d9e7', '#69b7d1', '#7e9fd1', '#55c7a5', '#c7aa68'];
  const faultColor = '#c66f78';
  const caseMeta = {
    regional: { code: 'F3-R04', primary: '公开 F3 实测层位', support: 'SYN-WELL-01 方法验证基线' },
    strata: { code: 'F3-R04', primary: '公开 F3 实测层位', support: 'SYN-WELL-01 方法验证基线' },
    welltie: { code: 'SYN-WELL-01', primary: '合成井震验证案例', support: '三井 · 五层位 · 统一采样网格' },
    fault: { code: 'SYN-WELL-01', primary: '合成构造验证案例', support: 'F1 断裂 · 五层位 · 统一采样网格' },
    reservoir: { code: 'SYN-WELL-01', primary: '合成储层验证案例', support: '属性体 · 三井 · 五层位' }
  };
  const intervalNames = ['H1—H2', 'H2—H3', 'H3—H4', 'H4—H5'];
  function createCanvas(className, label) {
    const canvas = document.createElement('canvas');
    canvas.className = className;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
    return canvas;
  }

  class AnalysisConsole {
    constructor(root) {
      this.root = root;
      this.mode = root.dataset.analysis || 'regional';
      this.mainCanvas = createCanvas('linked-analysis-canvas', '可交互的联动主视图，点击选择地震道');
      this.detailCanvas = createCanvas('linked-detail-canvas', '当前地震道的关联证据视图');
      this.hover = null;
      this.build();
      this.bind();
      this.resize();
      this.render();
    }

    build() {
      const titles = {
        regional: ['空间—剖面联动台', '从测线坐标定位到地下时间剖面'],
        strata: ['层位—厚度联动台', '点击任意道读取五条层位与层间厚度'],
        welltie: ['井—震同步游标', '选择井位或地震道，对照振幅与测井响应'],
        fault: ['构造证据联动台', '将层界错动、风险代理量和断距放在同一位置核验'],
        reservoir: ['属性解释联动台', '阈值、层段与弹性属性沿同一道同步读取']
      };
      const title = titles[this.mode][0];
      const meta = caseMeta[this.mode];
      this.root.innerHTML = `
        <div class="analysis-console-head">
          <div><span class="analysis-case-code">CASE ${meta.code}</span><h2>${title}</h2></div>
          <div class="analysis-source-chain"><b>${meta.primary}</b><i>→</i><span>${meta.support}</span></div>
        </div>
        <div class="analysis-toolbar">
          <label>当前道号 <strong data-trace-label>${state.trace}</strong><input data-trace-slider type="range" min="0" max="447" step="1" value="${state.trace}"></label>
          <div class="analysis-well-buttons" role="group" aria-label="快速定位井位"></div>
          <div class="analysis-toolbar-tail">
            ${this.mode === 'reservoir' ? `<div class="analysis-reservoir-controls"><label class="analysis-interval">评价层段 <select data-interval-select>${intervalNames.map((name, index) => `<option value="${index}"${index === state.interval ? ' selected' : ''}>${name}</option>`).join('')}</select></label><label class="analysis-threshold">优选阈值 <strong data-threshold-label>${state.threshold.toFixed(2)}</strong><input data-threshold-slider type="range" min="0.70" max="0.95" step="0.01" value="${state.threshold.toFixed(2)}"></label></div>` : ''}
            <output data-coordinate>读取坐标…</output>
          </div>
        </div>
        <div class="analysis-layout">
          <figure class="analysis-view analysis-view-main"><div class="analysis-view-title"><b data-main-title>主证据</b></div></figure>
          <aside class="analysis-inspector">
            <div class="analysis-view-title"><b data-detail-title>关联证据</b><span data-zone></span></div>
            <dl class="analysis-readout">
              <div><dt data-metric-label="time">双程时间</dt><dd data-time>—</dd></div><div><dt data-metric-label="amplitude">振幅</dt><dd data-amplitude>—</dd></div>
              <div><dt data-metric-label="risk">风险代理</dt><dd data-risk>—</dd></div><div><dt data-metric-label="reservoir">储层指示</dt><dd data-reservoir>—</dd></div>
            </dl>
            <div class="analysis-conclusion"><span>动态结论</span><strong data-conclusion>正在建立证据链…</strong><small data-conclusion-evidence></small></div>
          </aside>
        </div>`;
      this.root.querySelector('.analysis-view-main').append(this.mainCanvas);
      this.root.querySelector('.analysis-inspector').insertBefore(this.detailCanvas, this.root.querySelector('.analysis-readout'));
      const buttons = this.root.querySelector('.analysis-well-buttons');
      data.wells.forEach((well) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.trace = well.trace;
        button.innerHTML = `<i style="--well:${well.colour}"></i>${well.name}`;
        buttons.append(button);
      });
      const labels = {
        regional: ['地震振幅与层位', '测线空间位置'], strata: ['五条层位起伏', '当前道层间厚度'],
        welltie: ['地震振幅与井位', '最近井 GR / RHOB'], fault: ['风险、层界与 F1', '横向风险与层位视错距'],
        reservoir: ['相对储层指示剖面', '当前道弹性属性']
      }[this.mode];
      this.root.querySelector('[data-main-title]').textContent = labels[0];
      this.root.querySelector('[data-detail-title]').textContent = labels[1];
      const metricLabels = {
        regional: ['双程时间', '振幅', '风险代理', '储层指示'],
        strata: ['双程时间', '振幅', '最大层厚', '对应层段'],
        welltie: ['双程时间', '振幅', '平均残差', '标定置信度'],
        fault: ['双程时间', '风险代理', '距 F1 中心', '平均视错距'],
        reservoir: ['双程时间', '当前指示', '层段保留率', '连续候选区']
      }[this.mode];
      ['time', 'amplitude', 'risk', 'reservoir'].forEach((key, index) => {
        this.root.querySelector(`[data-metric-label="${key}"]`).textContent = metricLabels[index];
      });
    }

    bind() {
      const slider = this.root.querySelector('[data-trace-slider]');
      slider.addEventListener('input', () => setTrace(Number(slider.value), 'slider'));
      const threshold = this.root.querySelector('[data-threshold-slider]');
      threshold?.addEventListener('input', () => {
        state.threshold = Number(threshold.value);
        sessionStorage.setItem('geology-reservoir-threshold', String(state.threshold));
        state.consoles.forEach((consoleView) => consoleView.render());
        window.dispatchEvent(new CustomEvent('geology:reservoir', { detail: { threshold: state.threshold, interval: state.interval } }));
      });
      this.root.querySelector('[data-interval-select]')?.addEventListener('change', (event) => {
        state.interval = Number(event.target.value);
        sessionStorage.setItem('geology-reservoir-interval', String(state.interval));
        state.consoles.forEach((consoleView) => consoleView.render());
        window.dispatchEvent(new CustomEvent('geology:reservoir', { detail: { threshold: state.threshold, interval: state.interval } }));
      });
      this.root.querySelectorAll('[data-trace]').forEach((button) => button.addEventListener('click', () => setTrace(Number(button.dataset.trace), 'well')));
      const locate = (event, commit = false) => {
        const rect = this.mainCanvas.getBoundingClientRect();
        const x = clamp(event.clientX - rect.left, 0, rect.width);
        const y = clamp(event.clientY - rect.top, 0, rect.height);
        const plot = this.plotRect(rect.width, rect.height);
        const col = clamp(Math.round((x - plot.x) / plot.w * (data.grid.traces.length - 1)), 0, data.grid.traces.length - 1);
        const row = clamp(Math.round((y - plot.y) / plot.h * (data.grid.rows.length - 1)), 0, data.grid.rows.length - 1);
        this.hover = { col, row, x, y };
        state.hoverRow = row;
        sessionStorage.setItem('geology-hover-row', String(row));
        if (commit || event.buttons === 1) setTrace(data.grid.traces[col], 'canvas');
        else { this.updateReadout(); this.render(); }
      };
      this.mainCanvas.addEventListener('pointermove', locate);
      this.mainCanvas.addEventListener('pointerdown', (event) => locate(event, true));
      this.mainCanvas.addEventListener('pointerleave', () => { this.hover = null; this.render(); });
      this.mainCanvas.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); setTrace(state.trace + (event.key === 'ArrowLeft' ? -2 : 2), 'keyboard');
        }
      });
      new ResizeObserver(() => { this.resize(); this.render(); }).observe(this.root);
    }

    resizeCanvas(canvas) {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(280, Math.round(rect.width));
      const height = Math.max(210, Math.round(rect.height));
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr; canvas.height = height * dpr;
      }
      return { width, height, dpr };
    }

    resize() {
      this.mainSize = this.resizeCanvas(this.mainCanvas);
      this.detailSize = this.resizeCanvas(this.detailCanvas);
    }

    ctx(canvas, size) {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      return ctx;
    }

    plotRect(w, h) { return { x: 48, y: 15, w: Math.max(80, w - 65), h: Math.max(80, h - 45) }; }

    heatColor(value, mode) {
      if (mode === 'seismic') {
        const v = (value + 127) / 254;
        if (v < .5) { const t = v * 2; return [Math.round(78 - 71 * t), Math.round(130 - 105 * t), Math.round(188 - 143 * t)]; }
        const t = (v - .5) * 2; return [Math.round(7 + 191 * t), Math.round(25 + 145 * t), Math.round(45 + 62 * t)];
      }
      const t = value / 255;
      const stops = mode === 'risk' ? [[6,22,43],[18,60,88],[40,111,121],[109,159,134],[199,170,104],[198,111,120]] : [[6,22,43],[16,61,88],[29,113,129],[58,166,157],[118,201,168],[199,173,111]];
      const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
      return stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f));
    }

    drawHeatmap(ctx, size, values, mode, horizons = true) {
      const plot = this.plotRect(size.width, size.height);
      const rows = values.length, cols = values[0].length;
      const image = new ImageData(cols, rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        let [red, green, blue] = this.heatColor(values[r][c], mode);
        const i = (r * cols + c) * 4;
        if (mode === 'reservoir') {
          const time = data.grid.timesMs[r];
          const insideInterval = time >= data.horizons.timesMs[state.interval][c] && time <= data.horizons.timesMs[state.interval + 1][c];
          const retained = insideInterval && values[r][c] / 255 >= state.threshold;
          const blend = retained ? 1 : insideInterval ? .22 : .08;
          red = Math.round(red * blend + 5); green = Math.round(green * blend + 13); blue = Math.round(blue * blend + 24);
        }
        image.data[i] = red; image.data[i + 1] = green; image.data[i + 2] = blue; image.data[i + 3] = 255;
      }
      const off = document.createElement('canvas'); off.width = cols; off.height = rows; off.getContext('2d').putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(off, plot.x, plot.y, plot.w, plot.h);
      if (horizons) {
        data.horizons.timesMs.forEach((line, index) => {
          ctx.beginPath(); line.forEach((time, c) => {
            const x = plot.x + c / (cols - 1) * plot.w;
            const y = plot.y + (time - data.grid.timesMs[0]) / (data.grid.timesMs.at(-1) - data.grid.timesMs[0]) * plot.h;
            c ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }); ctx.strokeStyle = colors[index]; ctx.lineWidth = 1.1; ctx.stroke();
        });
      }
      data.wells.forEach((well) => {
        const x = plot.x + well.trace / 447 * plot.w;
        ctx.strokeStyle = well.colour; ctx.globalAlpha = .78; ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = '#dffbff'; ctx.font = '11px Consolas'; ctx.fillText(well.name, x + 3, plot.y + 13);
      });
      if (this.mode === 'fault') {
        const fx = plot.x + data.stats.faultTrace / 447 * plot.w;
        ctx.strokeStyle = faultColor; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(fx, plot.y); ctx.lineTo(fx, plot.y + plot.h); ctx.stroke(); ctx.setLineDash([]);
      }
      this.drawAxes(ctx, plot);
      this.drawCursor(ctx, plot, cols, rows);
      if (mode === 'reservoir') {
        const summary = this.reservoirSummary();
        this.drawCandidateBoundaries(ctx, plot, summary);
        this.drawThresholdLegend(ctx, plot, summary);
      }
    }

    drawThresholdLegend(ctx, plot, summary) {
      const { kept, total, share } = summary;
      ctx.fillStyle = '#03111de8'; ctx.fillRect(plot.x + 8, plot.y + 8, 212, 35);
      ctx.strokeStyle = '#4fcfdc'; ctx.strokeRect(plot.x + 8, plot.y + 8, 212, 35);
      ctx.fillStyle = '#79e1e8'; ctx.font = '700 11px Consolas'; ctx.textAlign = 'left';
      ctx.fillText(`${intervalNames[state.interval]} · 保留 ≥ ${state.threshold.toFixed(2)}`, plot.x + 16, plot.y + 22);
      ctx.fillStyle = '#b6ccd6'; ctx.font = '10px "Microsoft YaHei",sans-serif';
      ctx.fillText(`层内样本 ${kept}/${total} · ${(share * 100).toFixed(1)}% · ${summary.candidates.length} 个候选区`, plot.x + 16, plot.y + 36);
    }

    drawCandidateBoundaries(ctx, plot, summary) {
      summary.candidates.slice(0, 4).forEach((candidate, index) => {
        const x1 = plot.x + candidate.start / (data.grid.traces.length - 1) * plot.w;
        const x2 = plot.x + candidate.end / (data.grid.traces.length - 1) * plot.w;
        ctx.fillStyle = index === 0 ? '#59e0c614' : '#59d8e40d'; ctx.fillRect(x1, plot.y, Math.max(2, x2 - x1), plot.h);
        ctx.strokeStyle = index === 0 ? '#7ff0d4' : '#62dce8'; ctx.lineWidth = index === 0 ? 1.5 : 1;
        ctx.setLineDash([4, 3]); ctx.strokeRect(x1, plot.y + 1, Math.max(2, x2 - x1), plot.h - 2); ctx.setLineDash([]);
        ctx.fillStyle = '#061725e8'; ctx.fillRect(x1 + 3, plot.y + plot.h - 19, 42, 15);
        ctx.fillStyle = index === 0 ? '#8bf3dc' : '#7bdde7'; ctx.font = '700 10px Consolas'; ctx.textAlign = 'left';
        ctx.fillText(`C${index + 1}`, x1 + 8, plot.y + plot.h - 8);
      });
    }

    drawAxes(ctx, plot) {
      ctx.strokeStyle = '#33546a'; ctx.lineWidth = 1; ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
      ctx.fillStyle = '#9ab6c4'; ctx.font = '11px Consolas'; ctx.textAlign = 'center';
      [0, 112, 224, 336, 447].forEach((trace) => ctx.fillText(String(trace), plot.x + trace / 447 * plot.w, plot.y + plot.h + 15));
      ctx.textAlign = 'right'; [100, 260, 420, 580, 738].forEach((time) => ctx.fillText(`${time}`, plot.x - 6, plot.y + (time - 100) / 638 * plot.h + 3));
      ctx.save(); ctx.translate(11, plot.y + plot.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('双程时间 TWT (ms)', 0, 0); ctx.restore();
    }

    drawCursor(ctx, plot, cols, rows) {
      const col = nearestColumn(state.trace);
      const row = this.hover?.row ?? state.hoverRow;
      const x = plot.x + col / (cols - 1) * plot.w;
      const y = plot.y + row / (rows - 1) * plot.h;
      ctx.strokeStyle = '#f7fbff'; ctx.lineWidth = 1; ctx.globalAlpha = .9;
      ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#071827e8'; ctx.fillRect(clamp(x + 7, plot.x, plot.x + plot.w - 86), clamp(y - 19, plot.y, plot.y + plot.h - 20), 80, 18);
      ctx.fillStyle = '#e9fbff'; ctx.font = '11px Consolas'; ctx.textAlign = 'left'; ctx.fillText(`T${data.grid.traces[col]} · ${data.grid.timesMs[row]}ms`, clamp(x + 11, plot.x + 4, plot.x + plot.w - 102), clamp(y - 10, plot.y + 12, plot.y + plot.h - 10));
    }

    drawHorizonProfiles(ctx, size) {
      const plot = this.plotRect(size.width, size.height), times = data.horizons.timesMs;
      const min = 160, max = 690;
      ctx.fillStyle = '#07192c'; ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
      times.forEach((line, index) => {
        ctx.beginPath(); line.forEach((time, c) => {
          const x = plot.x + c / (line.length - 1) * plot.w;
          const y = plot.y + (time - min) / (max - min) * plot.h;
          c ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }); ctx.strokeStyle = colors[index]; ctx.lineWidth = 2; ctx.stroke();
      });
      const x = plot.x + nearestColumn(state.trace) / (data.grid.traces.length - 1) * plot.w;
      ctx.fillStyle = '#c66f781f'; ctx.fillRect(plot.x + 265 / 447 * plot.w, plot.y, 25 / 447 * plot.w, plot.h);
      ctx.strokeStyle = '#f4fbff'; ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke();
      this.drawAxes(ctx, plot);
    }

    drawSurvey(ctx, size) {
      const p = { x: 38, y: 25, w: size.width - 62, h: size.height - 55 };
      const xs = data.survey.traceX, ys = data.survey.traceY;
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const pt = (i) => [p.x + (xs[i] - minX) / (maxX - minX) * p.w, p.y + p.h - (ys[i] - minY) / (maxY - minY) * p.h];
      ctx.fillStyle = '#07192c'; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#21475e'; for (let i = 0; i <= 4; i++) { const x = p.x + p.w * i / 4; const y = p.y + p.h * i / 4; ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y); ctx.stroke(); }
      ctx.strokeStyle = colors[0]; ctx.lineWidth = 2; ctx.beginPath(); xs.forEach((_, i) => { const [x, y] = pt(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.strokeStyle = '#5f84964f'; ctx.setLineDash([5, 4]); ctx.strokeRect(p.x + 4, p.y + 4, p.w - 8, p.h - 8); ctx.setLineDash([]);
      const selected = nearestColumn(state.trace), [sx, sy] = pt(selected); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
      data.wells.forEach((well) => { const wi = nearestColumn(well.trace), [x, y] = pt(wi); ctx.fillStyle = well.colour; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#dffbff'; ctx.font = '11px Consolas'; ctx.fillText(well.name, x + 6, y - 6); });
      const scaleKm = 2, scalePx = scaleKm * 1000 / (maxX - minX) * p.w;
      ctx.strokeStyle = '#d8eef4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x + 8, p.y + p.h - 12); ctx.lineTo(p.x + 8 + scalePx, p.y + p.h - 12); ctx.stroke();
      ctx.fillStyle = '#c6dde5'; ctx.font = '11px Consolas'; ctx.fillText('0', p.x + 8, p.y + p.h - 16); ctx.textAlign = 'right'; ctx.fillText(`${scaleKm} km`, p.x + 8 + scalePx, p.y + p.h - 16);
      ctx.textAlign = 'center'; ctx.fillStyle = '#5ee0eb'; ctx.font = '700 12px Consolas'; ctx.fillText('N', p.x + p.w - 14, p.y + 13); ctx.beginPath(); ctx.moveTo(p.x + p.w - 14, p.y + 18); ctx.lineTo(p.x + p.w - 19, p.y + 29); ctx.lineTo(p.x + p.w - 14, p.y + 26); ctx.lineTo(p.x + p.w - 9, p.y + 29); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9ebbc7'; ctx.font = '11px Consolas'; ctx.textAlign = 'left'; ctx.fillText(`E ${Math.round(xs[selected])} m`, p.x, size.height - 10); ctx.textAlign = 'right'; ctx.fillText(`N ${Math.round(ys[selected])} m`, p.x + p.w, size.height - 10); ctx.textAlign = 'left';
    }

    drawThickness(ctx, size) {
      const col = nearestColumn(state.trace), values = data.horizons.timesMs.slice(1).map((line, i) => line[col] - data.horizons.timesMs[i][col]);
      const p = { x: 75, y: 25, w: size.width - 100, h: size.height - 55 }, max = Math.max(...values) * 1.18;
      values.forEach((v, i) => { const y = p.y + i * p.h / 4 + 9, w = v / max * p.w; ctx.fillStyle = `${colors[i]}35`; ctx.fillRect(p.x, y, p.w, 18); ctx.fillStyle = colors[i]; ctx.fillRect(p.x, y, w, 18); ctx.fillStyle = '#cbe1e8'; ctx.font = '11px Consolas'; ctx.textAlign = 'right'; ctx.fillText(`H${i + 1}–H${i + 2}`, p.x - 8, y + 12); ctx.textAlign = 'left'; ctx.fillText(`${v.toFixed(1)} ms`, p.x + w + 6, y + 12); });
    }

    drawWellLogs(ctx, size) {
      const well = data.wells.reduce((best, item) => Math.abs(item.trace - state.trace) < Math.abs(best.trace - state.trace) ? item : best, data.wells[0]);
      const p = { x: 42, y: 22, w: size.width - 72, h: size.height - 48 }, n = well.depth.length;
      const minG = Math.min(...well.gr), maxG = Math.max(...well.gr), minD = Math.min(...well.density), maxD = Math.max(...well.density);
      const line = (values, min, max, color, offset, width) => { ctx.beginPath(); values.forEach((v, i) => { const x = p.x + offset + (v - min) / (max - min) * width; const y = p.y + i / (n - 1) * p.h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke(); };
      ctx.fillStyle = '#07192c'; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.strokeStyle = '#294b61'; ctx.strokeRect(p.x, p.y, p.w, p.h);
      line(well.gr, minG, maxG, well.colour, 0, p.w * .47); line(well.density, minD, maxD, colors[4], p.w * .53, p.w * .47);
      const cursorY = p.y + (state.hoverRow / (data.grid.rows.length - 1)) * p.h;
      ctx.strokeStyle = '#f4fbff'; ctx.globalAlpha = .85; ctx.setLineDash([4,3]); ctx.beginPath(); ctx.moveTo(p.x, cursorY); ctx.lineTo(p.x + p.w, cursorY); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = '#e7f9ff'; ctx.font = '11px Consolas'; ctx.fillText(`${data.grid.timesMs[state.hoverRow].toFixed(0)} ms`, p.x + 4, cursorY - 4);
      ctx.fillStyle = well.colour; ctx.font = '11px Consolas'; ctx.fillText(`${well.name} · GR`, p.x, 14); ctx.fillStyle = colors[4]; ctx.textAlign = 'right'; ctx.fillText('RHOB', p.x + p.w, 14); ctx.textAlign = 'left';
    }

    drawFaultEvidence(ctx, size) {
      const p = { x: 48, y: 18, w: size.width - 67, h: (size.height - 50) * .44 }, profile = data.grid.risk[0].map((_, c) => data.grid.risk.reduce((sum, row) => sum + row[c], 0) / data.grid.risk.length / 255);
      ctx.beginPath(); profile.forEach((v, i) => { const x = p.x + i / (profile.length - 1) * p.w, y = p.y + p.h - v * p.h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = colors[0]; ctx.lineWidth = 1.7; ctx.stroke();
      const sx = p.x + nearestColumn(state.trace) / (profile.length - 1) * p.w; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(sx, p.y); ctx.lineTo(sx, p.y + p.h); ctx.stroke();
      data.stats.faultThrowMs.forEach((v, i) => { const y = p.y + p.h + 25 + i * 20; ctx.fillStyle = `${colors[i]}38`; ctx.fillRect(p.x, y, p.w, 8); ctx.fillStyle = colors[i]; ctx.fillRect(p.x, y, v / 26 * p.w, 8); ctx.fillStyle = '#c2dbe4'; ctx.font = '11px Consolas'; ctx.fillText(`H${i + 1} ${v.toFixed(1)} ms`, p.x + v / 26 * p.w + 5, y + 8); });
    }

    drawPropertyProfile(ctx, size) {
      const col = nearestColumn(state.trace), arrays = [data.grid.velocity.map(r => r[col]), data.grid.densityX1000.map(r => r[col]), data.grid.impedanceX100.map(r => r[col])];
      const p = { x: 42, y: 23, w: size.width - 68, h: size.height - 50 };
      ctx.fillStyle = '#07192c'; ctx.fillRect(p.x, p.y, p.w, p.h);
      arrays.forEach((values, index) => { const min = Math.min(...values), max = Math.max(...values); ctx.beginPath(); values.forEach((v, i) => { const x = p.x + (v - min) / Math.max(max - min, 1) * p.w; const y = p.y + i / (values.length - 1) * p.h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = colors[index === 0 ? 0 : index === 1 ? 1 : 4]; ctx.lineWidth = 1.45; ctx.stroke(); });
      ctx.font = '11px Consolas'; ctx.fillStyle = colors[0]; ctx.fillText('VP', p.x, 14); ctx.fillStyle = colors[1]; ctx.fillText('RHOB', p.x + 38, 14); ctx.fillStyle = colors[4]; ctx.fillText('AI', p.x + 92, 14);
    }

    render() {
      if (!this.mainSize || !this.detailSize) return;
      const main = this.ctx(this.mainCanvas, this.mainSize), detail = this.ctx(this.detailCanvas, this.detailSize);
      if (this.mode === 'strata') this.drawHorizonProfiles(main, this.mainSize);
      else this.drawHeatmap(main, this.mainSize, this.mode === 'fault' ? data.grid.risk : this.mode === 'reservoir' ? data.grid.reservoir : data.grid.seismic, this.mode === 'fault' ? 'risk' : this.mode === 'reservoir' ? 'reservoir' : 'seismic');
      ({ regional: () => this.drawSurvey(detail, this.detailSize), strata: () => this.drawThickness(detail, this.detailSize), welltie: () => this.drawWellLogs(detail, this.detailSize), fault: () => this.drawFaultEvidence(detail, this.detailSize), reservoir: () => this.drawPropertyProfile(detail, this.detailSize) })[this.mode]();
      this.updateReadout();
    }

    updateReadout() {
      const col = this.hover?.col ?? nearestColumn(state.trace), row = this.hover?.row ?? state.hoverRow;
      const trace = data.grid.traces[col], time = data.grid.timesMs[row], seismic = data.grid.seismic[row][col] / 127;
      const risk = data.grid.risk[row][col] / 255, reservoir = data.grid.reservoir[row][col] / 255;
      const [zone] = zoneOf(trace);
      this.root.querySelector('[data-trace-label]').textContent = trace;
      this.root.querySelector('[data-trace-slider]').value = trace;
      this.root.querySelector('[data-coordinate]').textContent = `E ${Math.round(data.survey.traceX[col])} m · N ${Math.round(data.survey.traceY[col])} m`;
      this.root.querySelector('[data-zone]').textContent = zone;
      this.root.querySelector('[data-time]').textContent = `${time.toFixed(0)} ms`;
      this.root.querySelector('[data-amplitude]').textContent = `${seismic >= 0 ? '+' : ''}${seismic.toFixed(2)}`;
      this.root.querySelector('[data-risk]').textContent = `${(risk * 100).toFixed(0)}%`;
      this.root.querySelector('[data-reservoir]').textContent = reservoir.toFixed(2);
      if (this.mode === 'strata') {
        const thickness = data.horizons.timesMs.slice(1).map((line, index) => line[col] - data.horizons.timesMs[index][col]);
        const index = thickness.indexOf(Math.max(...thickness));
        this.root.querySelector('[data-risk]').textContent = `${thickness[index].toFixed(1)} ms`;
        this.root.querySelector('[data-reservoir]').textContent = intervalNames[index];
      } else if (this.mode === 'welltie') {
        const nearestWell = data.wells.reduce((best, well) => Math.abs(well.trace - trace) < Math.abs(best.trace - trace) ? well : best, data.wells[0]);
        const validation = this.wellTieValidation(nearestWell);
        this.root.querySelector('[data-risk]').textContent = `${validation.meanAbs.toFixed(1)} ms`;
        this.root.querySelector('[data-reservoir]').textContent = `${(validation.confidence * 100).toFixed(0)}%`;
      } else if (this.mode === 'fault') {
        const meanThrow = data.stats.faultThrowMs.reduce((sum, value) => sum + value, 0) / data.stats.faultThrowMs.length;
        this.root.querySelector('[data-amplitude]').textContent = `${(risk * 100).toFixed(0)}%`;
        this.root.querySelector('[data-risk]').textContent = `${Math.abs(trace - data.stats.faultTrace)} 道`;
        this.root.querySelector('[data-reservoir]').textContent = `${meanThrow.toFixed(1)} ms`;
      } else if (this.mode === 'reservoir') {
        const summary = this.reservoirSummary();
        this.root.querySelector('[data-amplitude]').textContent = reservoir.toFixed(2);
        this.root.querySelector('[data-risk]').textContent = `${(summary.share * 100).toFixed(1)}%`;
        this.root.querySelector('[data-reservoir]').textContent = `${summary.candidates.length} 区`;
      }
      const thresholdLabel = this.root.querySelector('[data-threshold-label]');
      if (thresholdLabel) thresholdLabel.textContent = state.threshold.toFixed(2);
      this.root.querySelectorAll('[data-trace]').forEach((button) => button.classList.toggle('is-active', Number(button.dataset.trace) === trace));
      this.updateConclusion({ col, row, trace, time, seismic, risk, reservoir, zone });
      this.updateLinkedMarkers(trace);
    }

    wellTieValidation(well) {
      const col = nearestColumn(well.trace);
      const residuals = data.horizons.timesMs.map(line => {
        const picked = line[col];
        let pickedRow = 0;
        data.grid.timesMs.forEach((time, row) => { if (Math.abs(time - picked) < Math.abs(data.grid.timesMs[pickedRow] - picked)) pickedRow = row; });
        let peakRow = pickedRow, peakAmplitude = 0;
        for (let row = Math.max(0, pickedRow - 5); row <= Math.min(data.grid.timesMs.length - 1, pickedRow + 5); row += 1) {
          const amplitude = Math.abs(data.grid.seismic[row][col]);
          if (amplitude > peakAmplitude) { peakAmplitude = amplitude; peakRow = row; }
        }
        const residual = data.grid.timesMs[peakRow] - picked;
        const confidence = clamp(Math.exp(-Math.abs(residual) / 14) * (1 - data.grid.risk[peakRow][col] / 255 * .55), 0, 1);
        return { residual, confidence };
      });
      return {
        residuals,
        meanAbs: residuals.reduce((sum, item) => sum + Math.abs(item.residual), 0) / residuals.length,
        maxAbs: Math.max(...residuals.map(item => Math.abs(item.residual))),
        confidence: residuals.reduce((sum, item) => sum + item.confidence, 0) / residuals.length
      };
    }

    reservoirSummary(threshold = state.threshold) {
      const top = data.horizons.timesMs[state.interval];
      const base = data.horizons.timesMs[state.interval + 1];
      const perColumn = data.grid.traces.map((trace, col) => {
        const previous = Math.max(0, col - 1), next = Math.min(data.grid.traces.length - 1, col + 1);
        const dx = Math.hypot(data.survey.traceX[next] - data.survey.traceX[previous], data.survey.traceY[next] - data.survey.traceY[previous]) / Math.max(next - previous, 1);
        let kept = 0, total = 0, grossArea = 0, netArea = 0;
        data.grid.timesMs.forEach((time, row) => {
          if (time < top[col] || time > base[col]) return;
          const cellArea = dx * data.grid.velocity[row][col] * .004 / 2;
          const selected = data.grid.reservoir[row][col] / 255 >= threshold;
          total += 1; grossArea += cellArea;
          if (selected) { kept += 1; netArea += cellArea; }
        });
        return { trace, col, kept, total, share: total ? kept / total : 0, grossArea, netArea };
      });
      const smoothed = perColumn.map((item, index) => {
        const neighbours = perColumn.slice(Math.max(0, index - 2), Math.min(perColumn.length, index + 3));
        return neighbours.reduce((sum, entry) => sum + entry.share, 0) / neighbours.length;
      });
      const candidates = [];
      let active = null;
      perColumn.forEach((item, index) => {
        const selected = smoothed[index] >= .06 && item.kept > 0;
        if (selected && !active) active = { start: index, end: index, netArea: 0, grossArea: 0 };
        if (selected) { active.end = index; active.netArea += item.netArea; active.grossArea += item.grossArea; }
        if ((!selected || index === perColumn.length - 1) && active) { candidates.push(active); active = null; }
      });
      candidates.forEach(candidate => {
        candidate.startTrace = data.grid.traces[candidate.start]; candidate.endTrace = data.grid.traces[candidate.end];
        candidate.length = Math.hypot(data.survey.traceX[candidate.end] - data.survey.traceX[candidate.start], data.survey.traceY[candidate.end] - data.survey.traceY[candidate.start]);
      });
      candidates.sort((a, b) => b.netArea - a.netArea);
      const kept = perColumn.reduce((sum, item) => sum + item.kept, 0), total = perColumn.reduce((sum, item) => sum + item.total, 0);
      const netArea = perColumn.reduce((sum, item) => sum + item.netArea, 0), grossArea = perColumn.reduce((sum, item) => sum + item.grossArea, 0);
      return { kept, total, share: total ? kept / total : 0, netArea, grossArea, perColumn, candidates };
    }

    updateConclusion(reading) {
      const conclusion = this.root.querySelector('[data-conclusion]');
      const evidence = this.root.querySelector('[data-conclusion-evidence]');
      if (!conclusion || !evidence) return;
      const thickness = data.horizons.timesMs.slice(1).map((line, index) => line[reading.col] - data.horizons.timesMs[index][reading.col]);
      const thickest = thickness.indexOf(Math.max(...thickness));
      const nearestWell = data.wells.reduce((best, well) => Math.abs(well.trace - reading.trace) < Math.abs(best.trace - reading.trace) ? well : best, data.wells[0]);
      const wellValidation = this.wellTieValidation(nearestWell);
      const meanThrow = data.stats.faultThrowMs.reduce((sum, value) => sum + value, 0) / data.stats.faultThrowMs.length;
      const copy = {
        regional: [`${reading.zone}为当前定位单元`, `Trace ${reading.trace} · E ${Math.round(data.survey.traceX[reading.col])} m · N ${Math.round(data.survey.traceY[reading.col])} m`],
        strata: [`${intervalNames[thickest]}为当前道最厚层段`, `厚度 ${thickness[thickest].toFixed(1)} ms；白色游标已同步至剖面与周边证据图`],
        welltie: [`${nearestWell.name} 平均标定残差 ${wellValidation.meanAbs.toFixed(1)} ms`, `最大残差 ${wellValidation.maxAbs.toFixed(1)} ms · 综合置信度 ${(wellValidation.confidence * 100).toFixed(0)}% · 当前游标 ${reading.time.toFixed(0)} ms`],
        fault: [Math.abs(reading.trace - data.stats.faultTrace) <= 14 ? '层位错断与风险高值共同支持 F1 解释' : '当前位置缺少进入 F1 核心带的联合证据', `距断层中心 ${Math.abs(reading.trace - data.stats.faultTrace)} 道 · 风险 ${(reading.risk * 100).toFixed(0)}% · 平均视错距 ${meanThrow.toFixed(1)} ms`],
        reservoir: ['', '']
      }[this.mode];
      if (this.mode === 'reservoir') {
        const summary = this.reservoirSummary();
        const baseline = this.reservoirSummary(.85);
        const best = summary.candidates[0];
        copy[0] = best ? `C1：Trace ${best.startTrace}—${best.endTrace} 为首选连续候选区` : `${intervalNames[state.interval]} 在当前阈值下未形成连续候选区`;
        copy[1] = `阈值 ${state.threshold.toFixed(2)} · 保留率 ${(summary.share * 100).toFixed(1)}%（较 0.85 ${summary.share >= baseline.share ? '+' : ''}${((summary.share - baseline.share) * 100).toFixed(1)} pct） · 等效净面积 ${Math.round(summary.netArea).toLocaleString('zh-CN')} m²`;
      }
      conclusion.textContent = copy[0]; evidence.textContent = copy[1];
    }

    installLinkedMarkers() {
      document.querySelectorAll('.story-panel').forEach((panel, index) => {
        const heading = panel.querySelector('.story-panel-heading');
        if (!heading || heading.querySelector('.data-case-chip')) return;
        const isF3 = index === 0 && (this.mode === 'regional' || this.mode === 'strata');
        const chip = document.createElement('em');
        chip.className = `data-case-chip ${isF3 ? 'is-f3' : 'is-synthetic'}`;
        chip.textContent = isF3 ? 'F3-R04 · 实测层位' : 'SYN-WELL-01 · 方法验证';
        heading.append(chip);
      });
      const patterns = {
        regional: ['data-seismic-section', 'data-horizon-profiles'],
        strata: ['data-stratigraphic-architecture', 'data-thickness-heatmap', 'data-horizon-profiles'],
        welltie: ['data-seismic-section', 'data-well-log-correlation'],
        fault: ['data-structural-framework', 'data-risk-domain-profile', 'data-quality-risk'],
        reservoir: ['data-elastic-properties', 'data-reservoir-indicator']
      }[this.mode];
      document.querySelectorAll('.story-panel img').forEach((image) => {
        if (!patterns.some(pattern => image.src.includes(pattern))) return;
        const panel = image.closest('.story-panel');
        if (!panel || panel.querySelector('.linked-selection-marker')) return;
        const marker = document.createElement('div');
        marker.className = 'linked-selection-marker'; marker.setAttribute('aria-hidden', 'true');
        marker.innerHTML = '<i></i><span></span>';
        panel.append(marker);
      });
    }

    updateLinkedMarkers(trace) {
      document.querySelectorAll('.linked-selection-marker').forEach((marker) => {
        marker.style.setProperty('--linked-position', `${clamp(trace / 447 * 100, 2, 98)}%`);
        marker.querySelector('span').textContent = `T${trace}`;
      });
    }
  }

  function setTrace(trace, source) {
    state.trace = clamp(Math.round(trace), 0, 447);
    sessionStorage.setItem('geology-selected-trace', String(state.trace));
    state.consoles.forEach((consoleView) => consoleView.render());
    window.dispatchEvent(new CustomEvent('geology:trace', { detail: { trace: state.trace, source } }));
  }

  const boot = () => {
    document.querySelectorAll('[data-analysis]').forEach((root) => {
      const consoleView = new AnalysisConsole(root);
      state.consoles.push(consoleView);
      consoleView.installLinkedMarkers();
    });
    setTrace(state.trace, 'boot');
    window.dispatchEvent(new CustomEvent('geology:reservoir', { detail: { threshold: state.threshold, interval: Number(sessionStorage.getItem('geology-reservoir-interval')) || 0 } }));
    if (location.hash === '#analysis-console') requestAnimationFrame(() => {
      const target = document.querySelector('#analysis-console');
      if (!target) return;
      const previous = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.max(0, target.offsetTop - 8));
      requestAnimationFrame(() => { document.documentElement.style.scrollBehavior = previous; });
    });
  };
  window.addEventListener('geology:reservoir', (event) => {
    if (Number.isFinite(event.detail?.threshold)) state.threshold = event.detail.threshold;
    if (Number.isFinite(event.detail?.interval)) state.interval = event.detail.interval;
    state.consoles.forEach((consoleView) => consoleView.render());
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
