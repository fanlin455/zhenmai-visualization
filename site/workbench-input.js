(() => {
  const api=location.protocol.startsWith('http')&&location.port==='8002'?location.origin:'http://127.0.0.1:8002';
  const labels={seismic:'地震',time:'时深',well:'测井',location:'井位'};
  const request=async(path,options={},timeout=300000)=>{
    let response;
    try {response=await fetch(api+path,{...options,signal:AbortSignal.timeout(timeout)});}
    catch(error){throw new Error(error.name==='TimeoutError'?'本地计算等待超时，请检查服务窗口。':'无法连接处理服务，请运行启动物理对齐.ps1后重试。');}
    const data=await response.json();if(!response.ok)throw new Error(data.error||'处理失败。');return data;
  };
  const signature=snapshot=>JSON.stringify(Object.entries(snapshot).map(([kind,value])=>[kind,value.token]));
  const read=()=>InputSession.snapshot();
  const prepare=async(settings,progress=()=>{})=>{
    await InputSession.flush();const snapshot=await read(),version=signature(snapshot);
    const cacheKey='zhenmai-server-files-'+api;
    let cache={};try{cache=JSON.parse(sessionStorage.getItem(cacheKey)||'{}');}catch{}
    const inputs={};
    for(const [kind,group] of Object.entries(snapshot)){
      if(!group.records.length||group.records.some(r=>r.state!=='ready'))throw new Error(`请先在数据输入页载入${labels[kind]}文件。`);
      const ids=[];
      for(let i=0;i<group.records.length;i++){
        const {file}=group.records[i];const key=kind+':'+group.token+':'+i;
        if(!cache[key]){
          progress('正在接入'+file.name+'…');
          const endpoint=kind==='seismic'?'/api/datasets':'/api/inputs';
          const result=await request(endpoint+'?filename='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
          cache[key]=result.dataset_id||result.input_id;
        }
        ids.push(cache[key]);
      }
      inputs[kind]=kind==='well'?ids:ids[0];
    }
    try{sessionStorage.setItem(cacheKey,JSON.stringify(cache));}catch{}
    if(signature(await read())!==version)throw new Error('输入文件已变更，请重新执行。');
    const result=await request('/api/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inputs,settings})});
    return {...result,signature:version};
  };
  globalThis.WorkbenchInput={api,request,read,signature,prepare,summary:snapshot=>Object.entries(snapshot).map(([kind,value])=>labels[kind]+': '+(value.records.map(r=>r.file.name).join('、')||'未载入')).join(' · ')};
})();
