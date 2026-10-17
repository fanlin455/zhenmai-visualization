(() => {
  'use strict';

  const data = globalThis.StoryAnalysisData;
  const root = document.querySelector('[data-analysis]');
  if (!data || !root) return;

  const mode = root.dataset.analysis;
  if (mode === 'regional') return;
  const state = {
    trace: Number(sessionStorage.getItem('geology-selected-trace')) || 220,
    threshold: Number(sessionStorage.getItem('geology-reservoir-threshold')) || data.stats.targetThreshold,
    interval: Number(sessionStorage.getItem('geology-reservoir-interval')) || 0,
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const nearestColumn = trace => clamp(Math.round(trace / 2), 0, data.grid.traces.length - 1);
  const nearestRow = time => {
    let best = 0;
    data.grid.timesMs.forEach((value, index) => { if (Math.abs(value - time) < Math.abs(data.grid.timesMs[best] - time)) best = index; });
    return best;
  };
  const fmt = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);
  const section = document.createElement('section');
  section.id = 'professional-tools';
  section.className = `professional-tools professional-${mode}`;
  const storyGrid = document.querySelector('.story-grid');
  (storyGrid || root).insertAdjacentElement('afterend', section);

  let averageRiskProfile = null, profileMin = 0, profileMax = 1;
  const faultConfidence = trace => {
    if (!averageRiskProfile) {
      averageRiskProfile = data.grid.risk[0].map((_, column) => data.grid.risk.reduce((sum, row) => sum + row[column], 0) / data.grid.risk.length / 255);
      profileMin = Math.min(...averageRiskProfile);
      profileMax = Math.max(...averageRiskProfile);
    }
    const column = nearestColumn(trace), normalized = (averageRiskProfile[column] - profileMin) / Math.max(profileMax - profileMin, 1e-6);
    const location = Math.exp(-Math.pow((trace - data.stats.faultTrace) / 18, 2));
    return clamp(normalized * .58 + location * .42, 0, 1);
  };

  const residuals = well => {
    const column = nearestColumn(well.trace);
    return data.horizons.timesMs.map((line, index) => {
      const picked = line[column], row = nearestRow(picked), start = Math.max(0, row - 5), end = Math.min(data.grid.timesMs.length - 1, row + 5);
      let peak = row, amplitude = 0;
      for (let r = start; r <= end; r++) {
        const value = Math.abs(data.grid.seismic[r][column]);
        if (value > amplitude) { amplitude = value; peak = r; }
      }
      const residual = data.grid.timesMs[peak] - picked;
      const confidence = clamp(Math.exp(-Math.abs(residual) / 14) * (1 - data.grid.risk[peak][column] / 255 * .55), 0, 1);
      return { name: data.horizons.names[index], picked, peak: data.grid.timesMs[peak], residual, confidence };
    });
  };

  const reservoirMetrics = () => {
    const top = data.horizons.timesMs[state.interval], base = data.horizons.timesMs[state.interval + 1];
    const perColumn = data.grid.traces.map((trace, column) => {
      const previous = Math.max(0, column - 1), next = Math.min(data.grid.traces.length - 1, column + 1);
      const dx = Math.hypot(data.survey.traceX[next] - data.survey.traceX[previous], data.survey.traceY[next] - data.survey.traceY[previous]) / Math.max(next - previous, 1);
      let samples = 0, favourable = 0, grossArea = 0, netArea = 0, score = 0;
      data.grid.timesMs.forEach((time, row) => {
        if (time < top[column] || time > base[column]) return;
        const vertical = data.grid.velocity[row][column] * .004 / 2;
        const cellArea = dx * vertical;
        const value = data.grid.reservoir[row][column] / 255;
        samples += 1; grossArea += cellArea; score += value;
        if (value >= state.threshold) { favourable += 1; netArea += cellArea; }
      });
      return { trace, samples, favourable, share: samples ? favourable / samples : 0, grossArea, netArea, score: samples ? score / samples : 0 };
    });
    const candidates = [];
    let active = null;
    perColumn.forEach((item, index) => {
      const selected = item.share >= .12 && item.score >= Math.max(.55, state.threshold - .18);
      if (selected && !active) active = { start: index, end: index, area: 0, gross: 0, score: 0, count: 0 };
      if (selected) { active.end = index; active.area += item.netArea; active.gross += item.grossArea; active.score += item.score; active.count += 1; }
      if ((!selected || index === perColumn.length - 1) && active) { candidates.push(active); active = null; }
    });
    candidates.forEach(candidate => {
      candidate.startTrace = perColumn[candidate.start].trace;
      candidate.endTrace = perColumn[candidate.end].trace;
      candidate.length = Math.hypot(data.survey.traceX[candidate.end] - data.survey.traceX[candidate.start], data.survey.traceY[candidate.end] - data.survey.traceY[candidate.start]);
      candidate.meanScore = candidate.score / Math.max(candidate.count, 1);
      candidate.rankScore = candidate.area * candidate.meanScore;
    });
    candidates.sort((a, b) => b.rankScore - a.rankScore);
    const grossArea = perColumn.reduce((sum, item) => sum + item.grossArea, 0), netArea = perColumn.reduce((sum, item) => sum + item.netArea, 0);
    return { perColumn, candidates, grossArea, netArea, ntg: grossArea ? netArea / grossArea : 0 };
  };

  const baseMarkup = () => '<div class="professional-body"></div>';

  const renderStrata = body => {
    body.innerHTML = `<div class="strata-controls"><fieldset><legend>层位</legend>${['H1','H2','D0','H3'].map((name, i) => `<label><input type="checkbox" data-layer="${i}" checked>${name}</label>`).join('')}</fieldset><label>透明度 <output data-opacity>55%</output><input data-opacity-slider type="range" min="0.18" max="0.92" step="0.01" value="0.55"></label><label>垂向比例 <output data-exaggeration>1.0×</output><input data-exaggeration-slider type="range" min="0.65" max="2.4" step="0.05" value="1"></label><label class="contour-control"><input data-contours type="checkbox" checked>网格线</label></div>`;
    const dispatch = () => {
      const visibility = Array.from(body.querySelectorAll('[data-layer]')).map(input => input.checked);
      const opacity = Number(body.querySelector('[data-opacity-slider]').value), exaggeration = Number(body.querySelector('[data-exaggeration-slider]').value), contours = body.querySelector('[data-contours]').checked;
      body.querySelector('[data-opacity]').textContent = `${Math.round(opacity * 100)}%`;
      body.querySelector('[data-exaggeration]').textContent = `${exaggeration.toFixed(1)}×`;
      window.dispatchEvent(new CustomEvent('geology:layers', { detail: { visibility, opacity, exaggeration, contours } }));
    };
    body.querySelectorAll('input').forEach(input => input.addEventListener('input', dispatch));
    dispatch();
  };

  const renderWelltie = body => {
    const update = () => {
      const nearest = data.wells.reduce((best, item) => Math.abs(item.trace - state.trace) < Math.abs(best.trace - state.trace) ? item : best, data.wells[0]);
      body.innerHTML = `<div class="residual-summary"><div><strong>${nearest.name}</strong><small>Trace ${nearest.trace}</small></div><table><thead><tr><th>层位</th><th>解释 TWT</th><th>振幅极值</th><th>残差</th><th>置信度</th></tr></thead><tbody>${residuals(nearest).map(item => `<tr><td>${item.name}</td><td>${item.picked.toFixed(1)} ms</td><td>${item.peak.toFixed(1)} ms</td><td class="${Math.abs(item.residual) > 8 ? 'warn' : ''}">${item.residual >= 0 ? '+' : ''}${item.residual.toFixed(1)} ms</td><td><i class="confidence-bar"><b style="width:${(item.confidence * 100).toFixed(0)}%"></b></i>${(item.confidence * 100).toFixed(0)}%</td></tr>`).join('')}</tbody></table></div>`;
    };
    body._update = update; update();
  };

  const heat = value => {
    const v = (value + 127) / 254;
    return v < .5 ? [Math.round(40 + 205 * v * 2), Math.round(88 + 157 * v * 2), 220] : [245, Math.round(245 - 185 * (v - .5) * 2), Math.round(245 - 180 * (v - .5) * 2)];
  };
  const renderFault = body => {
    body.innerHTML = `<div class="fault-professional-grid"><figure><h3>断层置信带</h3><canvas class="fault-confidence-canvas" aria-label="断层置信度随道号变化"></canvas></figure><figure><h3>构造复原对比 <output data-split-label>50%</output></h3><canvas class="fault-restore-canvas" aria-label="原始剖面和构造复原剖面对比"></canvas><input data-fault-split type="range" min="8" max="92" value="50" aria-label="对比分割位置"></figure></div>`;
    const confidenceCanvas = body.querySelector('.fault-confidence-canvas'), compareCanvas = body.querySelector('.fault-restore-canvas'), split = body.querySelector('[data-fault-split]');
    const draw = () => {
      const fit = canvas => { const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.max(300, Math.round(box.width * dpr)); canvas.height = Math.max(150, Math.round(box.height * dpr)); const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return { ctx, w: box.width, h: box.height }; };
      const a = fit(confidenceCanvas), pad = { x: 36, y: 15, w: a.w - 50, h: a.h - 38 };
      a.ctx.fillStyle = '#061727'; a.ctx.fillRect(0,0,a.w,a.h); a.ctx.fillStyle = '#f1a26922';
      let start = null; data.grid.traces.forEach((trace, i) => { const c = faultConfidence(trace); if (c >= .68 && start === null) start = i; if ((c < .68 || i === data.grid.traces.length - 1) && start !== null) { const end = c < .68 ? i - 1 : i; a.ctx.fillRect(pad.x + start/(data.grid.traces.length-1)*pad.w,pad.y,(end-start+1)/(data.grid.traces.length-1)*pad.w,pad.h); start = null; } });
      a.ctx.beginPath(); data.grid.traces.forEach((trace,i) => { const x=pad.x+i/(data.grid.traces.length-1)*pad.w,y=pad.y+pad.h-faultConfidence(trace)*pad.h; i?a.ctx.lineTo(x,y):a.ctx.moveTo(x,y); }); a.ctx.strokeStyle='#62dce8';a.ctx.lineWidth=2;a.ctx.stroke();
      const sx=pad.x+nearestColumn(state.trace)/(data.grid.traces.length-1)*pad.w;a.ctx.strokeStyle='#fff';a.ctx.beginPath();a.ctx.moveTo(sx,pad.y);a.ctx.lineTo(sx,pad.y+pad.h);a.ctx.stroke();a.ctx.fillStyle='#b2ced9';a.ctx.font='11px Consolas';a.ctx.fillText('0',pad.x,pad.y+pad.h+15);a.ctx.textAlign='right';a.ctx.fillText('447',pad.x+pad.w,pad.y+pad.h+15);a.ctx.textAlign='left';
      const b=fit(compareCanvas), rows=data.grid.seismic.length, cols=data.grid.seismic[0].length, raw=document.createElement('canvas'), restored=document.createElement('canvas'); raw.width=restored.width=cols;raw.height=restored.height=rows;
      [raw,restored].forEach((canvas,index)=>{const context=canvas.getContext('2d'),image=context.createImageData(cols,rows),shift=Math.round(data.stats.faultThrowMs.reduce((s,v)=>s+v,0)/data.stats.faultThrowMs.length/4);for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const source=index&&c>nearestColumn(data.stats.faultTrace)?clamp(r+shift,0,rows-1):r;const color=heat(data.grid.seismic[source][c]),p=(r*cols+c)*4;image.data[p]=color[0];image.data[p+1]=color[1];image.data[p+2]=color[2];image.data[p+3]=255;}context.putImageData(image,0,0);});
      b.ctx.drawImage(raw,0,0,b.w,b.h);const cut=Number(split.value)/100*b.w;b.ctx.save();b.ctx.beginPath();b.ctx.rect(cut,0,b.w-cut,b.h);b.ctx.clip();b.ctx.drawImage(restored,0,0,b.w,b.h);b.ctx.restore();b.ctx.strokeStyle='#fff';b.ctx.beginPath();b.ctx.moveTo(cut,0);b.ctx.lineTo(cut,b.h);b.ctx.stroke();b.ctx.fillStyle='#dff7fb';b.ctx.font='11px Consolas';b.ctx.fillText('原始',8,15);b.ctx.textAlign='right';b.ctx.fillText('构造复原',b.w-8,15);b.ctx.textAlign='left';body.querySelector('[data-split-label]').textContent=`${split.value}%`;
    };
    body._update = draw; split.addEventListener('input', draw); new ResizeObserver(draw).observe(body); requestAnimationFrame(draw);
  };

  const renderReservoir = body => {
    body.innerHTML = `<div class="reservoir-controls"><label>评价层段<select data-reservoir-interval>${['H1—H2','H2—H3','H3—H4','H4—H5'].map((name,i)=>`<option value="${i}"${i===state.interval?' selected':''}>${name}</option>`).join('')}</select></label></div><div data-reservoir-metrics></div><div data-reservoir-ranking></div>`;
    const update = () => {
      const metrics = reservoirMetrics(), best = metrics.candidates.slice(0,3);
      body.querySelector('[data-reservoir-metrics]').innerHTML = `<table class="reservoir-metric-table"><thead><tr><th>层段</th><th>等效净面积</th><th>净毛比</th><th>单位宽度体积</th></tr></thead><tbody><tr><td>H${state.interval+1}—H${state.interval+2}</td><td>${fmt(metrics.netArea)} m²</td><td>${(metrics.ntg*100).toFixed(1)}%</td><td>${fmt(metrics.netArea)} m³/m</td></tr></tbody></table>`;
      body.querySelector('[data-reservoir-ranking]').innerHTML = `<div class="candidate-ranking"><h3>候选区段排序</h3>${best.length ? best.map((item,i)=>`<article><b>0${i+1}</b><div><strong>Trace ${item.startTrace}—${item.endTrace}</strong><span>长度 ${(item.length/1000).toFixed(2)} km · 净面积 ${fmt(item.area)} m² · 平均指示 ${item.meanScore.toFixed(2)}</span></div></article>`).join('') : '<p>当前阈值下没有形成连续候选区段。</p>'}</div>`;
    };
    body._update = update;
    body.querySelector('[data-reservoir-interval]').addEventListener('change', event => { state.interval=Number(event.target.value);sessionStorage.setItem('geology-reservoir-interval',String(state.interval));window.dispatchEvent(new CustomEvent('geology:reservoir',{detail:{interval:state.interval,threshold:state.threshold}}));update(); });
    update();
  };

  section.innerHTML = baseMarkup();
  const body = section.querySelector('.professional-body');
  ({ strata: renderStrata, welltie: renderWelltie, fault: renderFault, reservoir: renderReservoir })[mode](body);
  const revealProfessionalTools = () => {
    if (location.hash === '#professional-tools') section.scrollIntoView({ block: 'start', behavior: 'auto' });
  };
  requestAnimationFrame(revealProfessionalTools);
  addEventListener('load', () => setTimeout(revealProfessionalTools, 620), { once: true });

  window.addEventListener('geology:trace', event => {
    state.trace = event.detail.trace;
    body._update?.();
  });
  window.addEventListener('geology:reservoir', event => {
    if (Number.isFinite(event.detail?.threshold)) state.threshold = event.detail.threshold;
    if (Number.isFinite(event.detail?.interval)) state.interval = event.detail.interval;
    body._update?.();
  });
})();
