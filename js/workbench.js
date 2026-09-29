/* Fast navigation and a three-node comparison, using only the current snapshot. */
(function (global) {
  const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = s => String(s.uuid ?? s.id ?? [s.name,s.region_country,s.provider_name].join('|'));
  let options={}, chosen=[], current=null, query='', highlighted=0;
  const dialog=document.createElement('dialog'); dialog.id='workbench-dialog'; dialog.className='workbench-dialog';
  dialog.setAttribute('aria-label','快捷搜索'); document.body.appendChild(dialog);
  const dock=document.createElement('div'); dock.id='compare-dock'; dock.hidden=true; dock.setAttribute('aria-label','节点对比栏'); document.body.appendChild(dock);
  let mode='search';
  function matches(){const q=query.trim().toLowerCase();return (options.servers||[]).map((s,i)=>({s,i})).filter(({s})=>[s.name,s.region_country,s.region_label,s.region_city].join(' ').toLowerCase().includes(q)).slice(0,12);}
  function searchResults(){
    const result=dialog.querySelector('#command-results');if(!result)return;
    const list=matches(); highlighted=Math.min(highlighted,Math.max(0,list.length-1));
    result.innerHTML=list.length?list.map(({s,i},n)=>'<button type="button" class="command-result'+(n===highlighted?' is-selected':'')+'" data-command-node="'+i+'"><span class="command-dot'+(s.online?'':' is-off')+'"></span><span><strong>'+escape(s.name||'未命名')+'</strong><small>'+escape(s.region_label||s.region_country||'地区未知')+'</small></span><span class="command-meta">'+(s.online?'在线':'离线')+' <span>↵</span></span></button>').join(''):'<p class="command-empty">没有匹配的节点</p>';
  }
  function search(){
    mode='search';query='';highlighted=0;
    dialog.setAttribute('aria-label','快捷搜索');
    dialog.innerHTML='<div class="command-input"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/></svg><input id="command-query" type="search" autocomplete="off" aria-label="搜索节点" placeholder="搜索节点名称或地区…"><button type="button" data-wb-close aria-label="关闭快捷搜索">Esc</button></div><div class="command-actions"><button type="button" data-command-page="nodes">◈ 节点</button><button type="button" data-command-page="network">⌁ 网络状况</button><button type="button" data-command-page="resource">▥ 资源概况</button></div><div id="command-results"></div><footer class="command-foot"><span>↑ ↓ 选择　↵ 打开</span><span>Ctrl K</span></footer>';
    searchResults(); if(!dialog.open)dialog.showModal(); dialog.querySelector('input').focus();
  }
  function close(){dialog.close();}
  function select(index){close();options.openNode?.(index);}
  dialog.addEventListener('input',ev=>{if(ev.target.id==='command-query'){query=ev.target.value;highlighted=0;searchResults();}});
  dialog.addEventListener('keydown',ev=>{
    if(mode!=='search'||ev.isComposing)return;
    const list=matches();
    if(ev.target.id==='command-query'&&['ArrowDown','ArrowUp','Enter'].includes(ev.key)){
      ev.preventDefault();
      if(ev.key==='Enter'){if(list[highlighted])select(list[highlighted].i);return;}
      highlighted=(highlighted+(ev.key==='ArrowDown'?1:-1)+list.length)%Math.max(1,list.length);searchResults();
      dialog.querySelector('.command-result.is-selected')?.scrollIntoView({block:'nearest'});
    }
  });
  dialog.addEventListener('click',ev=>{
    if(ev.target===dialog){const r=dialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)close();}
    if(ev.target.closest('[data-wb-close]'))close();
    const node=ev.target.closest('[data-command-node]');if(node)select(Number(node.dataset.commandNode));
    const page=ev.target.closest('[data-command-page]');if(page){close();location.hash=page.dataset.commandPage==='nodes'?'#/column':'#/'+page.dataset.commandPage;}
  });
  function selected(){return chosen.map(k=>(options.servers||[]).find(s=>key(s)===k)).filter(Boolean);}
  function compare(){
    if(selected().length<2)return;
    const wasFocused=dialog.contains(document.activeElement), scroll=dialog.querySelector('.compare-scroll')?.scrollLeft||0;
    mode='compare';dialog.setAttribute('aria-label','节点对比');
    const list=selected(), fmt=options.fmtBytes, speed=options.fmtSpeed, pct=options.pct;
    const ping=(s,role)=>{const p=options.primaryPing(s,role);return p&&p.current_ms>=0?p.current_ms+' ms':'—';};
    const rows=[['状态',s=>s.online?'在线':'离线'],['地区',s=>s.region_label||s.region_country||'—'],['线路延迟',s=>(s.ping||[]).some(ProbeAdapt.isLinePing)?ping(s,'line'):'—'],['落地延迟',s=>(s.ping||[]).some(ProbeAdapt.isLandPing)?ping(s,'land'):'—'],['下行',s=>speed(s.download_speed)],['上行',s=>speed(s.upload_speed)],['CPU',s=>s.cpu_pct==null?'—':Math.round(s.cpu_pct)+'%'],['内存',s=>s.mem_total?Math.round(pct(s.mem_used,s.mem_total))+'%':'—'],['硬盘',s=>s.disk_total?Math.round(pct(s.disk_used,s.disk_total))+'%':'—'],['已用流量',s=>fmt(s.traffic_used,1)],['流量限额',s=>s.traffic_limit?fmt(s.traffic_limit,1):'无限额']];
    dialog.innerHTML='<header class="compare-header"><div><span class="instrument-label">NODE / COMPARE</span><h2>节点对比</h2></div><button data-wb-close type="button" aria-label="关闭节点对比">×</button></header><div class="compare-scroll"><table><thead><tr><th scope="col">指标</th>'+list.map(s=>'<th scope="col">'+escape(s.name)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(([title,get])=>'<tr><th scope="row">'+title+'</th>'+list.map(s=>'<td>'+escape(get(s))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
    if(!dialog.open)dialog.showModal();
    else if(wasFocused)dialog.querySelector('[data-wb-close]').focus({preventScroll:true});
    dialog.querySelector('.compare-scroll').scrollLeft=scroll;
  }
  function updateDock(){
    const list=selected();dock.hidden=!list.length;
    dock.innerHTML='<span class="dock-label">对比 <b>'+list.length+'/3</b></span>'+list.map((s,i)=>'<button type="button" data-compare-remove="'+i+'" title="移除 '+escape(s.name)+'">'+escape(s.name)+' <span>×</span></button>').join('')+'<button class="dock-go" type="button" data-compare-go'+(list.length<2?' disabled':'')+'>开始对比 ↗</button>';
    const btn=document.getElementById('compare-node'), s=(options.servers||[])[current];
    if(btn&&s){const on=chosen.includes(key(s));btn.textContent=on?'已加入对比 ✓':'加入对比 ＋';btn.setAttribute('aria-pressed',String(on));btn.disabled=!on&&list.length>=3;btn.title=btn.disabled?'最多同时对比 3 台节点':'';}
    document.body.classList.toggle('has-compare',!!list.length);
    document.querySelectorAll('[data-quick-compare]').forEach(button=>{
      const s=(options.servers||[])[Number(button.dataset.quickCompare)];if(!s)return;
      const on=chosen.includes(key(s)),mark=on?'✓':'＋';button.setAttribute('aria-pressed',String(on));if(button.textContent!==mark)button.textContent=mark;button.disabled=!on&&list.length>=3;
      button.title=on?'移出对比':button.disabled?'最多对比 3 台':'加入对比';button.setAttribute('aria-label',s.name+'：'+button.title);
    });
  }
  dock.addEventListener('click',ev=>{
    const remove=ev.target.closest('[data-compare-remove]');if(remove){chosen.splice(Number(remove.dataset.compareRemove),1);updateDock();}
    if(ev.target.closest('[data-compare-go]'))compare();
  });
  document.addEventListener('click',ev=>{
    const quick=ev.target.closest('[data-quick-compare]');
    if(quick){const s=(options.servers||[])[Number(quick.dataset.quickCompare)];if(s){const k=key(s);chosen=chosen.includes(k)?chosen.filter(x=>x!==k):chosen.length<3?chosen.concat(k):chosen;updateDock();}}
    if(ev.target.closest('[data-command-open]'))search();
    if(ev.target.closest('#compare-node')){
      const s=(options.servers||[])[current];if(!s)return;
      const k=key(s);chosen=chosen.includes(k)?chosen.filter(x=>x!==k):chosen.length<3?chosen.concat(k):chosen;updateDock();
    }
    const step=ev.target.closest('[data-node-step]');
    if(step&&current!=null){const next=(current+Number(step.dataset.nodeStep)+options.servers.length)%options.servers.length;options.openNode(next);}
  });
  document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='k'){ev.preventDefault();if(dialog.open)close();else search();}});
  global.ProbeWorkbench={
    sync(next){options=next;chosen=chosen.filter(k=>(options.servers||[]).some(s=>key(s)===k));updateDock();if(dialog.open&&mode==='compare')compare();},
    detail(index){current=index;updateDock();},
    search
  };
})(window);
