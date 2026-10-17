(() => {
  'use strict';
  const root = document.getElementById('uploaded-case-context');
  if (!root) return;
  let record, result;
  try {
    record = JSON.parse(sessionStorage.getItem('zhenmai-active-case') || 'null');
    result = JSON.parse(sessionStorage.getItem('zhenmai-active-alignment') || 'null');
  } catch { return; }
  if (!record?.dataset_id) return;

  const header = document.createElement('header');
  const title = document.createElement('div');
  const eyebrow = document.createElement('span');
  const heading = document.createElement('h2');
  const badge = document.createElement('b');
  eyebrow.textContent = 'ACTIVE USER CASE';
  heading.textContent = `当前用户案例 · ${record.filename}`;
  badge.textContent = record.alignment?.enabled ? '物理质量门通过' : '待补充物理约束';
  badge.dataset.state = record.alignment?.enabled ? 'ready' : 'warning';
  title.append(eyebrow, heading); header.append(title, badge);

  const description = document.createElement('p');
  description.textContent = result?.outputs?.length
    ? '下列结果来自本次上传数据；其后的联动分析台与图表为公开/演示基线，用于对照解释结构。'
    : '案例已经建立。下方联动分析台仍为公开/演示基线；请返回数据接入页运行当前案例的物理对齐。';
  const actions = document.createElement('div'); actions.className = 'active-case-actions';
  const back = document.createElement('a'); back.href = 'input.html#active-case-panel'; back.textContent = result?.outputs?.length ? '返回数据接入' : '返回并运行物理对齐'; actions.append(back);
  const gallery = document.createElement('div'); gallery.className = 'alignment-output-gallery';
  (result?.outputs || []).forEach(output => {
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    const caption = document.createElement('figcaption');
    image.src = output.image; image.alt = output.label; caption.textContent = output.label;
    figure.append(image, caption); gallery.append(figure);
  });
  root.replaceChildren(header, description, actions, gallery);
  root.hidden = false;
})();
