((root) => {
  const xPixel = f1 => 122 + (f1 - .3) / .7 * 430;
  const quantile = (sorted, probability) => {
    const index = (sorted.length - 1) * probability, lower = Math.floor(index);
    return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
  };
  const summarize = points => {
    const sorted = points.map(p => p.f1).sort((a, b) => a - b);
    const q1 = quantile(sorted, .25), q3 = quantile(sorted, .75), iqr = q3 - q1;
    const inside = sorted.filter(value => value >= q1 - 1.5 * iqr && value <= q3 + 1.5 * iqr);
    return { q1, q3, median: quantile(sorted, .5),
      mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      low: inside[0], high: inside.at(-1), iqr };
  };
  const renderSvg = data => {
    const rows = data.bands.map(band => ({ ...band, stats: summarize(band.points) })).sort((a, b) => b.stats.mean - a.stats.mean);
    const svg = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 400" aria-hidden="true" focusable="false" font-family="system-ui,Microsoft YaHei,sans-serif">
      <rect x="122" y="43" width="430" height="282" rx="5" fill="#071525" stroke="#28465e"/>`];
    for (let i = 0; i <= 7; i++) {
      const value = .3 + i * .1, x = xPixel(value);
      svg.push(`<path d="M${x} 43V325" stroke="#86a2b7" opacity=".13"/><text x="${x}" y="346" text-anchor="middle" font-size="13" fill="#a5bdcf">${value.toFixed(1)}</text>`);
    }
    svg.push(`<path d="M${xPixel(.7)} 43V325" stroke="#fa616d" stroke-width="1.4" opacity=".9"/>
      <text x="${xPixel(.7) - 5}" y="18" text-anchor="end" font-size="12" fill="#fa8791">0.70 可用下限</text>
      <path d="M${xPixel(.845)} 43V325" stroke="#4edacd" stroke-width="1.4" opacity=".9"/>
      <text x="${xPixel(.845)}" y="34" text-anchor="middle" font-size="12" fill="#6be2d6">Macro-F1 0.845</text>
      <text x="616" y="30" text-anchor="end" font-size="12" fill="#91b0c4">平均 F1</text>`);
    rows.forEach((band, index) => {
      const y = 63 + index * 35, stats = band.stats;
      const weak = stats.mean < .8, colour = weak ? '#eda567' : '#91c8ea';
      svg.push(`<text x="110" y="${y + 5}" text-anchor="end" font-size="15" fill="#c0d6e7">${band.name}</text>`);
      svg.push(`<path d="M122 ${y + 17.5}H552" stroke="#7492aa" opacity=".06"/>`);
      for (const point of band.points) {
        const jitter = (((point.block * 17 + index * 11) % 43) / 42 - .5) * 16;
        const below = point.f1 < .7;
        svg.push(`<circle class="facies-block-point" cx="${xPixel(point.f1)}" cy="${y + jitter}" r="${below ? 2.8 : 2.3}" fill="${below ? '#ff445e' : colour}" opacity="${below ? .95 : .38}"><title>${band.name} · 示意空间块 ${point.block}：F1 ${point.f1.toFixed(3)}</title></circle>`);
      }
      svg.push(`<path d="M${xPixel(stats.low)} ${y}H${xPixel(stats.high)}" stroke="${colour}" stroke-width="1.2"/>
        <path d="M${xPixel(stats.low)} ${y - 6}v12M${xPixel(stats.high)} ${y - 6}v12" stroke="${colour}" stroke-width="1.3"/>
        <rect class="facies-box" x="${xPixel(stats.q1)}" y="${y - 9}" width="${xPixel(stats.q3) - xPixel(stats.q1)}" height="18" rx="2" fill="${colour}" fill-opacity=".15" stroke="${colour}" stroke-width="1.4"><title>Q1 ${stats.q1.toFixed(3)} · 中位数 ${stats.median.toFixed(3)} · Q3 ${stats.q3.toFixed(3)} · 1.5 IQR须 ${stats.low.toFixed(3)}–${stats.high.toFixed(3)}</title></rect>
        <path d="M${xPixel(stats.median) - 4} ${y}h8" stroke="#ffffff" stroke-width="2.5"/>
        <path class="facies-mean-marker" d="M${xPixel(stats.mean) - 3} ${y - 16}l6 6m-6 0l6 -6" stroke="${colour}" stroke-width="1.5"/>
        <text x="616" y="${y + 5}" text-anchor="end" font-size="16" fill="${colour}" font-variant-numeric="tabular-nums">${stats.mean.toFixed(3)}</text>`);
      if (weak) svg.push(`<text class="facies-weak-label" x="628" y="${y + 4}" font-size="12" fill="#eda567">偏弱</text>`);
    });
    svg.push('<text x="337" y="369" text-anchor="middle" font-size="15" fill="#c0d7e6">F1</text>');
    svg.push('<text x="337" y="394" text-anchor="middle" font-size="11" fill="#8eacbf">× 均值　白线 中位数　红点 F1 &lt; 0.70　每相带42块</text></svg>');
    return svg.join('');
  };
  root.FaciesBoxplot = { summarize, renderSvg, xPixel };
  if (typeof module !== 'undefined') module.exports = root.FaciesBoxplot;
  if (root.document) {
    const target = document.getElementById('facies-boxplot');
    if (target && root.FaciesBoxData) target.innerHTML = renderSvg(root.FaciesBoxData);
  }
})(globalThis);
