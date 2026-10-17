((root) => {
  const colours = { red: '#ed777a', blue: '#71a8e6', neutral: '#8d929d' };
  const bounds = { left: 60, width: 716, top: 18, height: 310, histogramTop: 413, histogramHeight: 155 };
  const xPixel = x => bounds.left + (x + .8) / 1.6 * bounds.width;
  const yPixel = y => bounds.top + (5 - y) / 5 * bounds.height;
  const histogram = points => {
    const bins = Array.from({ length: 60 }, (_, i) => ({ start: -.8 + i * 1.6 / 60, count: 0 }));
    for (const point of points) {
      const index = Math.max(0, Math.min(59, Math.floor((point.effect + .8) / 1.6 * 60)));
      bins[index].count++;
    }
    return bins;
  };
  const renderSvg = data => {
    const { left, width, top, height, histogramTop, histogramHeight } = bounds;
    const bins = histogram(data.points), maxCount = Math.max(...bins.map(b => b.count));
    const markup = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 580" aria-hidden="true" focusable="false" font-family="system-ui,Microsoft YaHei,sans-serif">
      <defs><clipPath id="volcano-scatter-clip"><rect x="${left}" y="${top}" width="${width}" height="${height}"/></clipPath><clipPath id="volcano-histogram-clip"><rect x="${left}" y="${histogramTop}" width="${width}" height="${histogramHeight}" rx="9"/></clipPath></defs>
      <rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#081521" stroke="#2a4153"/>
      <g clip-path="url(#volcano-scatter-clip)">
      <rect x="${left}" y="${top}" width="${xPixel(-.12) - left}" height="${yPixel(1.301) - top}" fill="${colours.blue}" opacity=".075"/>
      <rect x="${xPixel(.12)}" y="${top}" width="${left + width - xPixel(.12)}" height="${yPixel(1.301) - top}" fill="${colours.red}" opacity=".075"/>`];
    for (let i = 0; i <= 8; i++) {
      const x = xPixel(-.8 + .2 * i);
      markup.push(`<path d="M${x} ${top}V${top + height}" stroke="#9bb9ce" opacity=".07"/>`);
    }
    for (let i = 0; i <= 5; i++) {
      const y = yPixel(i);
      markup.push(`<path d="M${left} ${y}H${left + width}" stroke="#9bb9ce" opacity=".09"/>`);
    }
    for (const sign of [-1, 1]) markup.push(`<path d="M${xPixel(sign * .12)} ${top}V${top + height}" stroke="${sign > 0 ? colours.red : colours.blue}" stroke-width="1.4" opacity=".8"/>`);
    markup.push(`<path d="M${left} ${yPixel(1.301)}H${left + width}" stroke="#e7eff5" stroke-width="1.15" stroke-dasharray="5 4" opacity=".75"/>`);
    for (const point of [...data.points].sort((a, b) => a.significance - b.significance)) {
      const significant = point.group !== 'neutral';
      const colour = significant ? colours[point.group] : point.effect < 0 ? '#7f94a7' : '#a39586';
      markup.push(`<circle class="volcano-point" cx="${xPixel(point.effect)}" cy="${yPixel(point.significance)}" r="${significant ? 2.1 : 1.65}" fill="${colour}" opacity="${significant ? .82 : .5}"><title>站点 ${point.id}（统计示意）：ΔZ=${point.effect.toFixed(3)}；−log₁₀(p)=${point.significance.toFixed(3)}；p=${point.p.toExponential(2)}</title></circle>`);
    }
    markup.push('</g>');
    for (let i = 0; i <= 5; i++) markup.push(`<text x="${left - 11}" y="${yPixel(i) + 4}" fill="#9ab1c2" font-size="13" text-anchor="end">${i}</text>`);
    markup.push(`<text transform="translate(19 111) rotate(-90)" text-anchor="middle" fill="#c3d7e3" font-size="15">−log₁₀(p)</text>`);
    markup.push(`<text x="${left + width - 9}" y="${yPixel(1.301) - 8}" text-anchor="end" fill="#d9e4ec" font-size="11">p = 0.05</text>`);
    for (const x of [-.8, -.4, 0, .4, .8]) {
      markup.push(`<path d="M${xPixel(x)} ${top + height}v5" stroke="#5b788d"/><text x="${xPixel(x)}" y="351" text-anchor="middle" fill="#a8bdca" font-size="14">${x === 0 ? '0' : x > 0 ? '+' + x.toFixed(1) : x.toFixed(1)}</text>`);
    }
    markup.push('<text x="418" y="384" text-anchor="middle" fill="#c8dbe7" font-size="14">效应量 ΔZ = 稳定区阻抗 − 断裂带阻抗　(m/s · g/cm³)</text>');
    markup.push(`<rect x="${left}" y="${histogramTop}" width="${width}" height="${histogramHeight}" rx="9" fill="#0b1c2b" stroke="#294555"/>`);
    markup.push('<g clip-path="url(#volcano-histogram-clip)">');
    for (const bin of bins) {
      const centre = bin.start + 1.6 / 120;
      const colour = centre < -.12 ? colours.blue : centre > .12 ? colours.red : colours.neutral;
      const barHeight = maxCount ? bin.count / maxCount * (histogramHeight - 50) : 0;
      markup.push(`<rect class="volcano-bin" x="${xPixel(bin.start) + .5}" y="${histogramTop + histogramHeight - 31 - barHeight}" width="${width / 60 - 1}" height="${barHeight}" fill="${colour}" opacity=".8"><title>ΔZ ${bin.start.toFixed(3)} 至 ${(bin.start + 1.6 / 60).toFixed(3)}：${bin.count} 个站点</title></rect>`);
    }
    for (const sign of [-1, 1]) markup.push(`<path d="M${xPixel(sign * .12)} ${histogramTop}V${histogramTop + histogramHeight - 31}" stroke="${sign > 0 ? colours.red : colours.blue}" stroke-width="1.4"/>`);
    markup.push('</g>');
    markup.push(`<text x="${left + 9}" y="${histogramTop + 16}" fill="#9eb5c6" font-size="11">站点频数 · 60箱</text>`);
    markup.push('<text x="418" y="556" text-anchor="middle" font-size="13"><tspan fill="#71a8e6">蓝：断裂带更致密</tspan><tspan fill="#9ca6b1">　　灰：无差异</tspan><tspan fill="#ed777a">　　红：断裂带更破碎</tspan></text></svg>');
    return markup.join('');
  };
  root.VolcanoChart = { histogram, renderSvg, xPixel, yPixel, bounds };
  if (typeof module !== 'undefined') module.exports = root.VolcanoChart;
  if (root.document) {
    const target = document.getElementById('volcano-chart');
    if (target && root.VolcanoData) target.innerHTML = renderSvg(root.VolcanoData);
  }
})(globalThis);
