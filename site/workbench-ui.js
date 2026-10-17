(() => {
 const el=id=>document.getElementById(id);
 const parameter=(key,label,value,min,max,step)=>{
  const box=document.createElement('div'),text=document.createElement('label'),input=document.createElement('input');input.id='parameter-'+key;input.name=key;input.type='number';input.value=value;input.min=min;input.max=max;input.step=step;input.required=true;text.htmlFor=input.id;text.textContent=label;box.append(text,input);return box;
 };
 const selection=(key,label,values,defaultValue)=>{
  const box=document.createElement('div'),text=document.createElement('label'),select=document.createElement('select');select.id='parameter-'+key;select.name=key;text.htmlFor=select.id;text.textContent=label;
  values.forEach(([value,name])=>{const o=document.createElement('option');o.value=value;o.textContent=name;select.appendChild(o);});select.value=defaultValue;box.append(text,select);return box;
 };
 const renderSettings=container=>{
  container.replaceChildren();
  container.append(selection('time_axis','地震时间轴',[['first','纵轴（行）'],['last','横轴（列）']],'first'),parameter('sample_index','剖面序号',0,0,1000000,1),parameter('sample_interval_ms','采样间隔（ms）',2,.1,20,.1),parameter('time_origin_ms','时间原点（ms）',0,-100000,100000,1),selection('time_unit','时深表时间单位',[['ms','毫秒'],['s','秒']],'ms'),selection('time_depth_source','时深标定依据',[['none','未声明'],['checkshot','Checkshot'],['vsp','VSP'],['calibrated_sonic','已标定声波'],['sonic_integral','声波积分']],'none'));
  let saved={};try{saved=JSON.parse(localStorage.getItem('zhenmai-case-settings')||'{}');}catch{}
  container.querySelectorAll('input, select').forEach(input=>{if(saved[input.name]!==undefined)input.value=saved[input.name];input.addEventListener('change',()=>{try{localStorage.setItem('zhenmai-case-settings',JSON.stringify(settings()));}catch{}});});
 };
 const settings=()=>Object.fromEntries(Array.from(el('case-settings-controls').querySelectorAll('input, select')).map(input=>[input.name,input.type==='number'?Number(input.value):input.value]));
 let result;
 const showOutput=()=>{
  const picker=el('processing-result-select');if(!picker)return;
  const output=result.outputs.find(value=>value.key===picker.value);if(!output)return;
  el('processing-output-image').src=output.image;el('processing-output-title').textContent=output.label+' · 色标 '+output.range.map(v=>Number(v).toPrecision(3)).join(' ～ ');
 };
 const show=record=>{
  result=record;el('processing-result-title').textContent=record.label+' · 结果';
  const gallery=el('processing-result-gallery');
  if(gallery){
   gallery.replaceChildren();record.outputs.slice(0,3).forEach(output=>{const figure=document.createElement('figure'),caption=document.createElement('figcaption'),image=document.createElement('img');caption.textContent=output.label;image.src=output.image;image.alt=output.label;figure.append(caption,image);gallery.appendChild(figure);});
   el('processing-download').href=WorkbenchInput.api+record.download_url;el('processing-result-dialog').showModal();return;
  }
  el('processing-result-info').textContent=record.filename+' · 剖面 '+record.sample_index+' · 输入 '+record.input_shape.join(' × ');
  el('processing-original-image').src=record.input_image;
  const picker=el('processing-result-select');picker.replaceChildren();record.outputs.forEach(output=>{const option=document.createElement('option');option.value=output.key;option.textContent=output.label;picker.appendChild(option);});picker.value=record.outputs[0].key;showOutput();
  el('processing-download').href=WorkbenchInput.api+record.download_url;
  el('processing-result-metrics').replaceChildren();Object.entries(record.metrics||{}).forEach(([name,value])=>{const item=document.createElement('span');item.textContent=name+'：'+(Number.isInteger(value)?value:Number(value).toFixed(4));el('processing-result-metrics').appendChild(item);});
  el('processing-result-note').textContent=record.note;el('processing-result-dialog').showModal();
 };
 el('processing-result-select')?.addEventListener('change',showOutput);el('close-processing-result')?.addEventListener('click',()=>el('processing-result-dialog').close());
 el('processing-result-dialog')?.addEventListener('close',()=>document.querySelector('button[type="submit"]')?.focus());
 globalThis.WorkbenchUI={parameter,renderSettings,settings,show};
})();
