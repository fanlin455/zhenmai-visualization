(() => {
  const clock = document.getElementById("dashboard-clock");
  const renderClock = () => {
    if (!clock) return;
    clock.textContent = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date());
  };
  renderClock();
  setInterval(renderClock, 1000);

  const seismic = document.getElementById("seismic-waveform");
  const well = document.getElementById("well-waveform");
  if (!seismic || !well) return;
  const cycle = 15000;
  const tau = Math.PI * 2;
  const reflectors = [[.055,.35],[.12,-.56],[.185,.8],[.26,-.68],[.33,.92],
    [.41,-.7],[.49,.55],[.57,-.88],[.64,.6],[.715,-.72],[.79,.9],[.865,-.56],[.94,.42]];
  const layerValues = [.4,.63,.31,.7,.48,.57,.36];
  const path = (points) => points.map(([x,y],i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const seismicPath = (phase) => path(Array.from({ length: 401 }, (_,i) => {
    const t = i / 400;
    let value = .065 * Math.sin(tau * 37 * t + phase * 3)
      + .045 * Math.sin(tau * 71 * t - phase * 2);
    reflectors.forEach(([center,amp],j) => {
      const shifted = center + .013 * Math.sin(phase + j * .7);
      const u = (t - shifted) / (.012 + .003 * Math.sin(phase * 2 + j * .5));
      value += amp * (.9 + .1 * Math.cos(phase + j)) * (1 - 2 * u * u) * Math.exp(-u * u);
    });
    return [56 + t * 512, 72 - Math.max(-1,Math.min(1,value)) * 42];
  }));
  const wellPath = (phase) => path(Array.from({ length: 141 }, (_,i) => {
    const depth = i / 140;
    const layer = Math.min(6,Math.floor(depth * 7));
    const value = layerValues[layer] + .035 * Math.sin(i * .52 + phase * 2)
      + .02 * Math.sin(i * .17 - phase) + .055 * Math.sin(phase + depth * 5);
    return [64 + value * 494,22 + depth * 104];
  }));
  const metrics = [["cpu",25],["memory",15],["gpu",35]].map(([id,min]) => {
    const value = document.getElementById(`${id}-usage`);
    const chart = value.closest(".metric-chart").querySelector(".usage-chart");
    return { min,value,chart,arc: chart.querySelector(".usage-fill"),name: chart.getAttribute("aria-label").split("演示")[0] };
  });
  let lastStep = -1;
  const render = (elapsed) => {
    const phase = (elapsed % cycle) / cycle * tau;
    seismic.setAttribute("d",seismicPath(phase));
    well.setAttribute("d",wellPath(phase));
    const step = Math.floor(elapsed / 10000) % 10;
    if (step === lastStep) return;
    lastStep = step;
    const offset = step <= 5 ? step : 10 - step;
    metrics.forEach(({ min,value,chart,arc,name }) => {
      const percent = min + offset;
      value.textContent = `${percent}%`;
      arc.setAttribute("stroke-dasharray",`${percent} ${100 - percent}`);
      chart.setAttribute("aria-label",`${name}演示：${percent}%`);
    });
  };
  const started = performance.now();
  let previous = -Infinity;
  const frame = (now) => {
    if (now - previous >= 33) { render(now - started); previous = now; }
    requestAnimationFrame(frame);
  };
  render(0);
  requestAnimationFrame(frame);
})();
