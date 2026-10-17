(() => {
 const el=id=>document.getElementById(id),form=el('processing-form');if(!form)return;
 const method=el('processing-method'),button=el('process-data'),status=el('processing-status'),badge=el('processing-connection');
 let online=false,busy=false,complete=false,shownVersion='';
 const specs={
  well_alignment:{parameters:[]},
  resolution_enhancement:{parameters:[['strength','增强强度',.55,0,1,.05],['preserve_raw','原始保留比例',.35,0,1,.05]]},
  seismic_attributes:{parameters:[['rms_window','能量窗口',9,3,101,1]]},
  poststack_inversion:{parameters:[['regularization','稀疏约束',.035,0,1,.005],['iterations','迭代次数',40,1,120,1]]},
  waveform_indicator:{parameters:[['temperature','概率温度',.12,.01,1,.01]]}
 };
 const message=(text,state='')=>{status.textContent=text;status.dataset.state=state;};
 const sync=()=>{button.disabled=busy||!online||!complete;};
 const renderParameters=()=>{const target=el('processing-parameters');target.replaceChildren();specs[method.value].parameters.forEach(p=>target.appendChild(WorkbenchUI.parameter(...p)));};
 const refresh=async()=>{
  try{
   const snapshot=await WorkbenchInput.read();complete=Object.values(snapshot).every(g=>g.records.length&&g.records.every(r=>r.state==='ready'));
   el('processing-input-info').textContent=WorkbenchInput.summary(snapshot);
   const nextVersion=WorkbenchInput.signature(snapshot);
   if(nextVersion!==shownVersion){shownVersion=nextVersion;if(el('processing-result-dialog').open)el('processing-result-dialog').close();
    el('spatial-figure').querySelector('img').src='assets/alignment-spatial.svg';el('spatial-title').textContent='空间对齐';
    document.querySelector('[aria-labelledby="time-title"] img').src='assets/alignment-waveform.svg';el('time-title').textContent='时深与波形对齐';
    document.querySelector('[aria-labelledby="quality-title"] img').src='assets/alignment-quality.svg';el('quality-title').textContent='对齐质量检查';
   }
   if(!complete)message('请先在数据输入页载入四类文件。');
  }catch(error){complete=false;message(error.message,'error');}sync();
 };
 const connect=async()=>{
  try{const r=await WorkbenchInput.request('/api/health',{},4000);if(r.service!=='zhenmai-physical'||r.version<2)throw new Error('请关闭旧版Python服务，再运行新版启动脚本。');online=true;badge.textContent='服务已连接 · 重试';badge.dataset.state='ready';message('选择方法，使用已保存的输入资料执行。','ready');}
  catch(error){online=false;badge.textContent='服务未连接 · 重试';badge.dataset.state='error';message(error.message,'error');}await refresh();
 };
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!online||!complete||!form.reportValidity())return;
  busy=true;sync();method.disabled=true;button.textContent='处理中…';
  try{
   const settings=WorkbenchUI.settings(),parameters={sample_interval_ms:settings.sample_interval_ms};
   el('processing-parameters').querySelectorAll('input').forEach(input=>parameters[input.name]=Number(input.value));
   const data=await WorkbenchInput.prepare(settings,text=>message(text));
   parameters.sample_interval_ms=data.settings.sample_interval_ms; message('正在运行当前输入的项目算法…');
   const path=method.value==='well_alignment'?'/api/alignment':'/api/process';
   const result=await WorkbenchInput.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset_id:data.dataset_id,operation:method.value,parameters,time_axis:'first',sample_index:0})});
   if(WorkbenchInput.signature(await WorkbenchInput.read())!==data.signature)throw new Error('输入已变更，本次旧输入结果不再展示。');
   if(result.operation==='well_alignment'){
    const spatial=result.outputs.find(output=>output.key==='spatial'),waveform=result.outputs.find(output=>output.key==='waveform');
    if(spatial){const image=el('spatial-figure').querySelector('img');image.src=spatial.image;image.alt=spatial.label;el('spatial-title').textContent='空间对齐 · '+(result.wells?.length||1)+'口井';}
    if(waveform){const image=document.querySelector('[aria-labelledby="time-title"] img');image.src=waveform.image;image.alt=waveform.label;el('time-title').textContent='时深与波形对齐 · '+(result.selected_well||'');}
    const quality=result.outputs.find(output=>output.key==='quality');
    if(quality){const image=document.querySelector('[aria-labelledby="quality-title"] img');image.src=quality.image;image.alt=quality.label;el('quality-title').textContent='对齐质量检查 · '+(100*result.metrics['可融合覆盖率']).toFixed(1)+'%可融合';}
   }
   WorkbenchUI.show(result);message('处理完成，已弹出当前输入的结果。','ready');
  }catch(error){message(error.message,'error');}
  finally{busy=false;method.disabled=false;button.textContent='执行处理';sync();}
 });
 method.addEventListener('change',renderParameters);badge.addEventListener('click',connect);window.addEventListener('focus',()=>{if(!busy)refresh();});
 el('processing-service-link').hidden=location.protocol!=='file:';
 WorkbenchUI.renderSettings(el('case-settings-controls'));renderParameters();connect();
})();
