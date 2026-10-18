(() => {
  const canvas = document.getElementById('login-motion');
  const context = canvas?.getContext('2d');
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: true, addEventListener() {} };
  let width = 0;
  let height = 0;
  let ratio = 1;
  let animationFrame = 0;

  const resizeCanvas = () => {
    if (!canvas || !context) return;
    ratio = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const drawSeismicField = time => {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const visualWidth = width < 920 ? width : width * .72;
    const top = height * .16;
    const bottom = height * .88;
    const rows = Math.max(17, Math.floor(height / 30));
    const step = (bottom - top) / rows;

    context.save();
    context.beginPath();
    context.rect(0, 0, visualWidth, height);
    context.clip();

    for (let row = 0; row <= rows; row += 1) {
      const yBase = top + row * step;
      const alpha = .09 + (row / rows) * .13;
      context.beginPath();
      for (let x = -20; x <= visualWidth + 20; x += 8) {
        const fault = x > visualWidth * .56 ? step * .68 : 0;
        const basin = Math.pow((x / visualWidth) - .36, 2) * step * 4.4;
        const envelope = .32 + .68 * Math.sin(Math.PI * Math.min(1, x / visualWidth));
        const wave = Math.sin(x * .026 + row * .7 + time * .00055) * 4.2 * envelope;
        const fine = Math.sin(x * .073 - row * .38 - time * .00022) * 1.7;
        const y = yBase + basin + fault + wave + fine;
        if (x === -20) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.strokeStyle = row % 5 === 0 ? `rgba(101,220,240,${alpha + .12})` : `rgba(91,146,190,${alpha})`;
      context.lineWidth = row % 5 === 0 ? 1.15 : .7;
      context.stroke();
    }

    const strata = [
      ['rgba(12,56,84,.22)', .66, .052],
      ['rgba(18,91,105,.16)', .73, .044],
      ['rgba(22,107,92,.14)', .79, .038],
      ['rgba(32,58,108,.2)', .85, .047]
    ];
    strata.forEach(([colour, level, amplitude], index) => {
      context.beginPath();
      context.moveTo(0, height);
      for (let x = 0; x <= visualWidth; x += 12) {
        const y = height * level + Math.sin(x * .008 + index * 1.4 + time * .00011) * height * amplitude + x * .035;
        context.lineTo(x, y);
      }
      context.lineTo(visualWidth, height);
      context.closePath();
      context.fillStyle = colour;
      context.fill();
    });

    const wellX = visualWidth * .42;
    const wellTop = height * .24;
    const wellBottom = height * .79;
    context.beginPath();
    for (let y = wellTop; y <= wellBottom; y += 4) {
      const progress = (y - wellTop) / (wellBottom - wellTop);
      const x = wellX + Math.sin(progress * 3.5) * 24 + progress * 48;
      if (y === wellTop) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.strokeStyle = 'rgba(126,236,239,.82)';
    context.lineWidth = 1.4;
    context.shadowColor = '#51d9e9';
    context.shadowBlur = 9;
    context.stroke();
    context.shadowBlur = 0;

    const pulseProgress = reduceMotion.matches ? .58 : ((time * .000075) % 1);
    const pulseY = wellTop + (wellBottom - wellTop) * pulseProgress;
    const pulseX = wellX + Math.sin(pulseProgress * 3.5) * 24 + pulseProgress * 48;
    const ring = 7 + Math.sin(time * .006) * 2;
    context.beginPath();
    context.arc(pulseX, pulseY, ring, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(91,235,191,.9)';
    context.lineWidth = 1.5;
    context.stroke();
    context.beginPath();
    context.arc(pulseX, pulseY, 2.7, 0, Math.PI * 2);
    context.fillStyle = '#9effdf';
    context.fill();

    context.font = '10px Consolas, monospace';
    context.fillStyle = 'rgba(115,190,205,.72)';
    context.fillText('WELL A-03', wellX - 30, wellTop - 17);
    context.fillStyle = 'rgba(92,137,166,.52)';
    context.fillText(`${(pulseProgress * 3.2).toFixed(2)} km`, pulseX + 14, pulseY + 4);
    context.restore();
  };

  const animate = time => {
    drawSeismicField(time);
    if (!reduceMotion.matches) animationFrame = requestAnimationFrame(animate);
  };

  if (context) {
    resizeCanvas();
    addEventListener('resize', resizeCanvas, { passive: true });
    reduceMotion.addEventListener('change', () => {
      cancelAnimationFrame(animationFrame);
      drawSeismicField(performance.now());
      if (!reduceMotion.matches) animationFrame = requestAnimationFrame(animate);
    });
    animationFrame = requestAnimationFrame(animate);
  }

  const form = document.getElementById('login-form');
  const account = document.getElementById('login-account');
  const password = document.getElementById('login-password');
  const button = document.getElementById('login-button');
  const status = document.getElementById('login-status');
  const demoFill = document.querySelector('[data-demo-fill]');
  const isPublicDemo = location.hostname.endsWith('.github.io');
  const openWorkspace = () => {
    sessionStorage.setItem('zhenmai-demo-authenticated', 'true');
    if (globalThis.ZhenmaiNavigate) globalThis.ZhenmaiNavigate('overview.html', { replace: true });
    else location.replace('overview.html');
  };
  const clearError = () => {
    status.textContent = '';
    account.removeAttribute('aria-invalid'); password.removeAttribute('aria-invalid');
  };
  demoFill?.addEventListener('click', () => {
    account.value = 'guest';
    password.value = 'demo2026';
    clearError();
    account.focus();
  });
  if (isPublicDemo) {
    account.value = 'guest';
    password.value = 'demo2026';
  }
  account.addEventListener('input', clearError); password.addEventListener('input', clearError);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    clearError();
    if (!location.protocol.startsWith('http')) {
      status.textContent = '请通过一键启动打开登录页面。'; return;
    }
    button.disabled = true;
    try {
      if (isPublicDemo) {
        if (account.value.trim() !== 'guest' || password.value !== 'demo2026') {
          account.setAttribute('aria-invalid', 'true'); password.setAttribute('aria-invalid', 'true');
          throw new Error('公开演示请使用 guest / demo2026。');
        }
        button.querySelector('span').textContent = '正在进入分析系统';
        await new Promise(resolve => setTimeout(resolve, 280));
        openWorkspace();
        return;
      }
      const response = await fetch('/api/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.value.trim(), password: password.value }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (response.status === 401) {
          account.setAttribute('aria-invalid', 'true'); password.setAttribute('aria-invalid', 'true');
          password.value = ''; password.focus();
        }
        throw new Error(data.error || '登录失败，请重试。');
      }
      openWorkspace();
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? '连接超时，请检查本地服务后重试。' : error instanceof TypeError ? '无法连接登录服务，请重新一键启动。' : error.message;
    } finally { button.disabled = false; }
  });
})();
