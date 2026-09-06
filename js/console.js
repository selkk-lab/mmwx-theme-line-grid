/* Data-led instruments. All readouts come from the supplied snapshot or series. */
(function (global) {
  let host = {}, resourceMetric = 'mem', resourceOrder = 'pressure', detailTab = 'overview', scopeZoom = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const clamp = n => Math.max(0, Math.min(100, n));
  const ratio = (used, total) => valid(used) && total > 0 ? used / total * 100 : null;
  const percent = n => valid(n) ? Math.round(n) + '%' : '—';
  const ms = n => valid(n) ? Math.round(n * 10) / 10 : '—';
  const loss = n => valid(n) ? Number(n.toFixed(2)) + '%' : '—';
  const avg = values => { const good = values.filter(valid); return good.length ? good.reduce((a,b)=>a+b,0)/good.length : null; };
  const sum = (list, key) => list.reduce((n,s)=>n+(valid(s[key])?s[key]:0),0);
  const bytes = v => valid(v) ? host.fmtBytes(v,1) : '—';
  const speed = v => valid(v) ? host.fmtSpeed(v) : '—';
  const tone = n => !valid(n) ? 'muted' : n >= 85 ? 'danger' : n >= 65 ? 'warn' : 'good';
  const metrics = { cpu: 'CPU', mem: '内存', disk: '硬盘', traffic: '流量' };
  const metric = (s,k) => k === 'cpu' ? (valid(s.cpu_pct)?s.cpu_pct:null) : k === 'traffic' ? ratio(s.traffic_used,s.traffic_limit) : ratio(s[k+'_used'],s[k+'_total']);
  const primary = s => ProbeAdapt.primaryPing(s);
  const pingValues = p => (p?.buckets || []).map(b=>valid(b.ms)?b.ms:-1);
  const plot = (values, height=100, color='var(--live)',options={}) => values.some(valid) ? ProbeCharts.spark(values,{w:800,h:height,color,...options}) : '<div class="instrument-empty">暂无有效样本</div>';
  const lamp = s => '<span class="dot'+(s.online?'':' is-off')+'" aria-label="'+(s.online?'在线':'离线')+'"></span>';
  const region = s => s.region_label || s.region_country || '地区未知';
  const header = (number,title,extra='') => '<header class="console-heading"><h2><span>'+number+'</span>'+title+'</h2>'+extra+'</header>';
  const rangeButtons = (range) => '<div class="seg">'+['1h','6h','24h'].map(r=>'<button type="button" data-range="'+r+'" class="'+(range===r?'is-on':'')+'" aria-pressed="'+(range===r)+'">'+r+'</button>').join('')+'</div>';
  function meter(value,label) {
    return '<div class="micro-meter '+tone(value)+'"><span>'+label+'<b>'+percent(value)+'</b></span><i><i style="width:'+clamp(value||0)+'%"></i></i></div>';
  }
  function quota(s) {
    const value=metric(s,'traffic');
    return '<div class="compact-quota"><span>流量 <b>'+bytes(s.traffic_used)+'</b></span><span>'+(s.traffic_limit>0?bytes(s.traffic_limit):'无限额')+'</span><i class="'+tone(value)+'"><i style="width:'+clamp(value||0)+'%"></i></i></div>';
  }
  function node(s,index,expanded) {
    const p=primary(s), series=pingValues(p);
    const read=role=>{
      const exists=(s.ping||[]).some(role==='line'?ProbeAdapt.isLinePing:ProbeAdapt.isLandPing);
      const target=exists?ProbeAdapt.primaryPing(s,role):null;
      return exists?'<span><small>'+(role==='line'?'线路':'落地')+'</small><b>'+ms(target?.current_ms)+'</b><small>ms</small></span>':'';
    };
    return '<article class="node-tile"><button type="button" class="'+(expanded?'slab':'cell')+' node-instrument '+(s.online?'':'is-bad')+'" data-index="'+index+'">'+
      '<div class="ni-head"><span class="ni-country">'+esc(s.region_country||'—')+'</span><span class="ni-name">'+lamp(s)+'<strong>'+esc(s.name||'未命名')+'</strong><small>'+esc(region(s))+'</small></span><span class="ni-open" aria-hidden="true">↗</span></div>'+
      '<div class="ni-body"><div class="ni-signal"><div class="ni-latency">'+(read('line')+read('land')||'<span><small>延迟</small><b>—</b></span>')+'<em>'+loss(s.online?p?.loss_pct:null)+'<small>丢包</small></em></div><div class="ni-wave">'+plot(series,60)+'</div><div class="ni-speeds"><span><small>↓ 下行</small><b>'+speed(s.download_speed)+'</b></span><span><small>↑ 上行</small><b>'+speed(s.upload_speed)+'</b></span></div></div>'+
      '<div class="ni-resources">'+['cpu','mem','disk'].map(k=>meter(metric(s,k),metrics[k])).join('')+quota(s)+'</div>'+
      (expanded?'<div class="ni-extra"><span>系统<b>'+esc(s.os||'—')+'</b></span><span>规格<b>'+esc(s.cpu_cores||'—')+'C · '+bytes(s.mem_total)+'</b></span><span>回程<b>'+esc((s.return_routes||[]).map(r=>r.route_type).filter(Boolean).join(' / ')||'暂无数据')+'</b></span></div>':'')+'</div>'+
      '<div class="ni-foot"><span>'+ (s.online?'在线 '+esc(host.fmtDays(s.uptime)):'离线')+'</span><span>'+esc(s.provider_name||s.arch||'')+'</span></div></button><button type="button" class="quick-compare" data-quick-compare="'+index+'" aria-pressed="false" aria-label="将 '+esc(s.name)+' 加入对比" title="加入对比">＋</button></article>';
  }
  function stat(label,value,sub,cls='') { return '<article class="console-stat '+cls+'"><span>'+label+'</span><strong>'+value+'</strong><small>'+sub+'</small></article>'; }
  function samples(values) {
    const good=values.filter(valid);
    const changes=values.slice(1).flatMap((v,i)=>valid(v)&&valid(values[i])?[Math.abs(v-values[i])]:[]);
    return {min:good.length?Math.min(...good):null,max:good.length?Math.max(...good):null,jitter:avg(changes),coverage:values.length?good.length/values.length*100:null};
  }
  function network({servers,index,target,range,values}) {
    const s=servers[index], targets=s.ping||[], selected=targets.find(p=>p.key===target);
    const current=selected?selected.current_ms:avg(targets.map(p=>p.current_ms));
    const packetLoss=selected?selected.loss_pct:avg(targets.map(p=>p.loss_pct));
    const stats=samples(values), rangeMinutes={ '1h':60,'6h':360,'24h':1440 }[range];
    const tags=[...new Map(servers.flatMap(s=>(s.ping||[]).map(p=>[p.key,p.label||p.key]))).entries()];
    const max=Math.max(50,...values.filter(valid));
    const absolute=max<=50?50:max<=100?100:max<=200?200:max<=500?500:Math.ceil(max/100)*100;
    const padding=Math.max(3,((stats.max||0)-(stats.min||0))*.18);
    const floor=scopeZoom&&valid(stats.min)?Math.max(0,Math.floor(stats.min-padding)):0;
    const scale=scopeZoom&&valid(stats.max)?Math.ceil(stats.max+padding):absolute;
    const rail=servers.map((item,i)=>'<button type="button" class="channel-node '+(i===index?'is-on':'')+'" data-net="'+i+'" aria-pressed="'+(i===index)+'">'+lamp(item)+'<span><strong>'+esc(item.name)+'</strong><small>'+esc(region(item))+'</small></span><b>'+ms(primary(item)?.current_ms)+'<small>ms</small></b></button>').join('');
    return '<section class="network-console console-page">'+
      '<div class="console-banner"><span class="instrument-label">01 / SIGNAL DESK</span><span>'+servers.length+' 节点 <i>·</i> '+tags.length+' 探测目标</span></div>'+
      '<div class="signal-layout"><aside class="channel-rail">'+header('01','节点通道','<span class="console-count">'+servers.length+'</span>')+'<div class="channel-list">'+rail+'</div></aside>'+
      '<section class="signal-main instrument-panel">'+header('02',esc(s.name),rangeButtons(range))+
      '<div class="signal-stats">'+stat(selected?'当前延迟':'目标当前均值',ms(current)+'<em>ms</em>',esc(selected?.label||'全部目标'), 'signal-primary')+stat('丢包',loss(packetLoss),selected?'所选目标':'目标均值')+stat('相邻样本波动',ms(stats.jitter)+'<em>ms</em>','相邻有效样本绝对差均值')+stat('有效样本',percent(stats.coverage),values.filter(valid).length+' / '+values.length)+'</div>'+
      '<div class="scope-tools"><output class="sample-readout" aria-live="off">'+values.length+' 个样本</output><button type="button" data-scope-zoom aria-pressed="'+scopeZoom+'">'+(scopeZoom?'↙ 恢复零基线':'⌕ 放大波动')+'</button></div>'+
      '<div class="scope-plot"><div class="scope-axis"><span>'+scale+' ms</span><span>'+((scale+floor)/2)+'</span><span>'+floor+'</span></div><div class="scope-drawing" data-scope-view tabindex="0" role="group" aria-label="延迟曲线，左右方向键查看样本">'+plot(values,220,'var(--live)',{min:floor,max:scale})+'<i class="scope-scan" aria-hidden="true"></i></div></div>'+
      '<div class="scope-time"><span>−'+rangeMinutes+' min</span><span>−'+rangeMinutes/2+' min</span><span>最近样本</span></div>'+
      '<div class="scope-footer"><span><i class="legend-dot"></i>'+esc(selected?.label||'全部目标均值')+'</span><span>最低 <b>'+ms(stats.min)+'</b> / 最高 <b>'+ms(stats.max)+'</b> ms</span></div></section>'+
      '<aside class="target-rail">'+header('03','探测目标')+'<button type="button" class="target-average '+(target==='all'?'is-on':'')+'" data-nett="all" aria-pressed="'+(target==='all')+'">全部目标均值 <span>↗</span></button>'+targets.map((p,i)=>'<button type="button" class="target-channel '+(p.key===target?'is-on':'')+'" data-nett="'+esc(p.key)+'" aria-pressed="'+(p.key===target)+'"><span class="target-label"><small>0'+(i+1)+'</small>'+esc(p.label||p.key)+'</span><span class="target-readout"><strong>'+ms(p.current_ms)+'<small>ms</small></strong><span>'+loss(p.loss_pct)+'<small>丢包</small></span></span><span class="target-spark">'+plot(pingValues(p),36)+'</span></button>').join('')+(targets.length?'':'<p class="instrument-empty">未配置探测目标</p>')+'</aside></div>'+
      '<section class="instrument-panel latency-matrix">'+header('04','全节点延迟矩阵','<span class="matrix-legend"><i></i>低延迟 <i></i>高延迟 · ms</span>')+'<div class="matrix-scroll"><table><thead><tr><th scope="col">节点 / 目标</th>'+tags.map(([k,label])=>'<th scope="col">'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+servers.map((item,i)=>'<tr><th scope="row">'+esc(item.name)+'</th>'+tags.map(([key])=>{const p=(item.ping||[]).find(p=>p.key===key),v=p?.current_ms;return '<td>'+(p?'<button type="button" data-matrix-node="'+i+'" data-matrix-target="'+esc(key)+'" class="matrix-cell '+(i===index&&(target===key||target==='all')?'is-selected':'')+'" style="--heat:'+ (valid(v)?Math.min(.45,.07+v/600):0)+'" aria-label="'+esc(item.name)+' '+esc(p.label)+' '+ms(v)+' 毫秒"><b>'+ms(v)+'</b><small>'+loss(p.loss_pct)+'</small></button>':'<span class="matrix-missing">—</span>')+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div></section></section>';
  }
  function gauge(value,label,sub) {
    const p=clamp(value||0);
    return '<article class="capacity-gauge '+tone(value)+'"><div class="gauge-face"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="gauge-track" cx="60" cy="60" r="49"/><circle class="gauge-value" cx="60" cy="60" r="49" pathLength="100" stroke-dasharray="'+p+' 100"/><circle class="gauge-inner" cx="60" cy="60" r="40"/></svg><strong>'+percent(value)+'</strong></div><span>'+label+'</span><small>'+sub+'</small></article>';
  }
  function skyline(list,k) {
    const visible=list.slice(0,18), w=Math.max(1040,visible.length*92+65), h=235;
    let grid='';
    [0,25,50,75,100].forEach(p=>{const y=202-p*1.45;grid+='<path d="M32 '+y+' H'+(w-12)+'"/><text x="6" y="'+(y+3)+'">'+p+'</text>';});
    return '<div class="capacity-landscape"><svg class="skyline" viewBox="0 0 '+w+' '+h+'" role="group" aria-label="'+metrics[k]+' 使用率立体柱状图，百分比"><g class="sky-grid">'+grid+'</g>'+visible.map(({s,i},n)=>{
      const value=metric(s,k),v=valid(value)?value:0,x=55+n*(w-85)/visible.length,b= Math.min(50,(w-85)/visible.length-24),height=clamp(v)*1.45,y=202-height;
      const chassis='<g class="sky-chassis"><path d="M'+x+' 202 V57 l12 -9 h'+b+' V193 l-12 9z M'+x+' 57 h'+b+' l12 -9 M'+(x+b)+' 57 V202"/>'+[25,50,75].map(t=>'<path d="M'+x+' '+(202-t*1.45)+' h'+b+' l12 -9"/>').join('')+'</g>';
      return '<g class="sky-node '+tone(value)+'" data-index="'+i+'" tabindex="0" role="button" aria-label="'+esc(s.name)+' '+metrics[k]+' '+percent(value)+'" style="--node-order:'+n+'"><title>'+esc(s.name)+' · '+metrics[k]+' '+percent(value)+'</title><path class="sky-footprint" d="M'+x+' 202 l12 -9 h'+b+' l-12 9z"/>'+chassis+'<g class="sky-column"><path class="sky-front" d="M'+x+' 202 V'+y+' h'+b+' V202z"/><path class="sky-side" d="M'+(x+b)+' 202 l12 -9 V'+(y-9)+' l-12 9z"/><path class="sky-top" d="M'+x+' '+y+' l12 -9 h'+b+' l-12 9z"/><text class="sky-value" x="'+(x+b/2+6)+'" y="'+(y-20)+'">'+percent(value)+'</text></g><text class="sky-label" x="'+(x+b/2)+'" y="226">'+esc(String(s.name).slice(0,13))+'</text></g>';
    }).join('')+'</svg></div>'+(list.length>18?'<p class="console-note">图中显示前 18 台；下方矩阵包含全部节点。</p>':'');
  }
  function metricTabs() { return '<div class="seg">'+Object.entries(metrics).map(([k,label])=>'<button type="button" data-resource-metric="'+k+'" class="'+(k===resourceMetric?'is-on':'')+'" aria-pressed="'+(k===resourceMetric)+'">'+label+'</button>').join('')+'</div>'; }
  function resource({servers,last7,cost,settings}) {
    const permitted=k=>settings[k]!==false;
    const reported=k=>servers.filter(s=>valid(s[k+'_used'])&&s[k+'_total']>0);
    const memReported=reported('mem'),diskReported=reported('disk');
    const cpu=avg(servers.map(s=>metric(s,'cpu'))), mem=ratio(sum(memReported,'mem_used'),sum(memReported,'mem_total')),disk=ratio(sum(diskReported,'disk_used'),sum(diskReported,'disk_total'));
    const limited=servers.filter(s=>s.traffic_limit>0), remaining=limited.reduce((total,s)=>total+(valid(s.traffic_used)?Math.max(0,s.traffic_limit-s.traffic_used):0),0);
    const ranked=servers.map((s,i)=>({s,i})).sort((a,b)=>resourceOrder==='name'?String(a.s.name).localeCompare(String(b.s.name)):(metric(b.s,resourceMetric)??-1)-(metric(a.s,resourceMetric)??-1));
    const dated=servers.map((s,i)=>({s,i,days:s.expires_at?Math.ceil((new Date(/^\d{4}-\d{2}-\d{2}$/.test(s.expires_at)?s.expires_at+'T00:00:00':s.expires_at)-new Date())/86400000):null})).sort((a,b)=>(Number.isFinite(a.days)?a.days:Infinity)-(Number.isFinite(b.days)?b.days:Infinity));
    let html='<section class="resource-console console-page"><div class="console-banner"><span class="instrument-label">02 / CAPACITY DESK</span><span>'+servers.filter(s=>s.online).length+' / '+servers.length+' 在线</span></div>';
    html+='<div class="resource-overview">';
    if(permitted('show_resource_heatmap'))html+='<section class="instrument-panel capacity-dials">'+header('01','集群容量')+'<div class="dial-grid">'+gauge(cpu,'CPU 平均占用','已上报节点等权平均')+gauge(mem,'内存占用',bytes(sum(memReported,'mem_used'))+' / '+bytes(sum(memReported,'mem_total')))+gauge(disk,'硬盘占用',bytes(sum(diskReported,'disk_used'))+' / '+bytes(sum(diskReported,'disk_total')))+'</div></section>';
    html+='<section class="instrument-panel cost-console">'+header('02','成本与流量')+'<div class="cost-read"><span>月均成本</span><strong><small>¥</small>'+Math.round(cost)+'</strong><span>年化 <b>¥'+Math.round(cost*12)+'</b> · 按续费折算</span></div><div class="cost-bottom"><span>周期已用<b>'+bytes(sum(servers,'traffic_used'))+'</b></span><span>有限额节点<b>'+limited.length+' / '+servers.length+'</b></span></div></section></div>';
    if(permitted('show_resource_heatmap')) html+='<section class="instrument-panel capacity-panel">'+header('03','容量剖面',metricTabs())+skyline(ranked,resourceMetric)+'<div class="capacity-bottom"><span><i class="legend-dot"></i>'+metrics[resourceMetric]+' 当前使用率 · 统一 0–100% 刻度</span><div class="seg"><button type="button" data-resource-order="pressure" class="'+(resourceOrder==='pressure'?'is-on':'')+'">占用优先</button><button type="button" data-resource-order="name" class="'+(resourceOrder==='name'?'is-on':'')+'">名称排序</button></div></div><div class="matrix-scroll"><table class="resource-matrix"><thead><tr><th>节点</th>'+Object.entries(metrics).map(([k,label])=>'<th><button type="button" data-resource-metric="'+k+'" class="'+(k===resourceMetric?'is-on':'')+'">'+label+(k===resourceMetric?' ↓':'')+'</button></th>').join('')+'<th>下行 / 上行</th></tr></thead><tbody>'+ranked.map(({s,i})=>'<tr><th scope="row"><button type="button" data-index="'+i+'">'+lamp(s)+esc(s.name)+' <span>↗</span></button></th>'+Object.keys(metrics).map(k=>'<td>'+meter(metric(s,k),'')+'</td>').join('')+'<td class="resource-speed">↓ '+speed(s.download_speed)+'<small>↑ '+speed(s.upload_speed)+'</small></td></tr>').join('')+'</tbody></table></div></section>';
    html+='<div class="resource-lower">';
    if(permitted('show_traffic_7d'))html+='<section class="instrument-panel traffic-console">'+header('04','近 7 日流量','<span class="console-note">金 / 上行　灰 / 下行</span>')+'<div class="traffic-total"><strong>'+bytes(last7.reduce((n,d)=>n+(d.total||0),0))+'</strong><span>7 日合计</span></div>'+ProbeCharts.stacked(last7,{w:600,h:125,tips:host.trafficTips(last7)})+'<div class="traffic-dates">'+last7.map(d=>'<span>'+esc(d.date.slice(5))+'</span>').join('')+'</div></section>';
    if(permitted('show_traffic_quota'))html+='<section class="instrument-panel quota-console">'+header('05','额度余量','<span class="console-note">仅有限额节点</span>')+'<div class="quota-total"><strong>'+bytes(remaining)+'</strong><span>剩余合计</span></div><div class="quota-segments">'+limited.map(s=>'<span style="flex:'+s.traffic_limit+'" title="'+esc(s.name)+'：'+bytes(Math.max(0,s.traffic_limit-s.traffic_used))+' 剩余"><i style="width:'+clamp(metric(s,'traffic')||0)+'%"></i></span>').join('')+'</div><div class="quota-key">'+limited.map(s=>'<span>'+esc(s.name)+'<b>'+percent(metric(s,'traffic'))+'</b></span>').join('')+'</div></section>';
    html+='</div>';
    if(permitted('show_renewal_timeline'))html+='<section class="instrument-panel renewal-console">'+header('06','续费日程','<span class="console-note">按到期时间排列</span>')+'<div class="renewal-list">'+dated.map(({s,i,days})=>'<button type="button" class="renewal-item '+(Number.isFinite(days)&&days<=7?'warn':'')+'" data-index="'+i+'"><span class="renewal-date">'+esc(s.expires_at||'未设置')+'</span><strong>'+esc(s.name)+'</strong><span>'+(Number.isFinite(days)?days<0?'已过期 '+Math.abs(days)+' 天':days===0?'今日到期':days+' 天后':'日期未知')+'</span><b>¥'+esc(s.renewal_price_cny??'—')+'<small> / '+esc(host.cycles[s.renewal_cycle]||'次')+'</small></b><span aria-hidden="true">↗</span></button>').join('')+'</div></section>';
    return html+'</section>';
  }
  function detail(ctx) {
    const s=ctx.s,p=ctx.ping;
    const tabs=[['overview','总览'],['ping','网络'],['traffic','流量'],['system','系统']];
    const tabbar='<nav class="detail-tabs" aria-label="节点详情分区">'+tabs.map(([key,title])=>'<button type="button" data-detail-tab="'+key+'" class="'+(detailTab===key?'is-on':'')+'" aria-pressed="'+(detailTab===key)+'">'+title+'</button>').join('')+'<span>'+lamp(s)+esc(region(s))+' · '+(s.online?'在线':'离线')+'</span></nav>';
    const signals='<section class="instrument-panel detail-network">'+header('01','延迟观测',rangeButtons(host.range()))+'<div class="detail-targets">'+(s.ping||[]).map(t=>'<button type="button" data-target="'+esc(t.key)+'" class="'+(p?.key===t.key?'is-on':'')+'">'+esc(t.label)+'<b>'+ms(t.current_ms)+' <small>ms</small></b></button>').join('')+'</div><div class="detail-plot">'+plot(ctx.sparkVals,140)+'</div><div class="scope-footer"><span>'+esc(p?.label||'暂无目标')+'</span><span>丢包 <b>'+loss(p?.loss_pct)+'</b></span></div></section>';
    const traffic='<section class="instrument-panel detail-traffic">'+header('02','周期流量','<span class="console-note">'+esc(s.period_start||'—')+' / '+esc(s.period_end||'—')+'</span>')+quota(s)+'<div class="detail-traffic-plot">'+ProbeCharts.stacked(ctx.last7,{w:500,h:135,tips:host.trafficTips(ctx.last7)})+'</div><div class="traffic-dates">'+ctx.last7.map(d=>'<span>'+esc(d.date.slice(5))+'</span>').join('')+'</div></section>';
    const hardware=[['系统',s.os],['内核',s.kernel],['架构',s.arch],['处理器',s.cpu_model],['核心 / 线程',(s.cpu_cores??'—')+'C / '+(s.cpu_threads??'—')+'T'],['负载',s.loadavg],['到期时间',s.expires_at],['续费','¥'+(s.renewal_price_cny??'—')+' / '+(host.cycles[s.renewal_cycle]||'次')]];
    const system='<section class="instrument-panel detail-system">'+header('03','系统档案')+'<dl>'+hardware.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value||'—')+'</dd></div>').join('')+'</dl></section>';
    const routes='<section class="instrument-panel detail-routes">'+header('04','三网回程')+'<div>'+(s.return_routes||[]).map(r=>'<span><small>'+esc(host.carriers[r.carrier]||r.carrier)+'</small><b>'+esc(r.route_type||'—')+'</b></span>').join('')+((s.return_routes||[]).length?'':'<p class="console-note">暂无回程数据</p>')+'</div></section>';
    const kpis='<section class="detail-metrics">'+stat('下行',speed(s.download_speed),'上行 '+speed(s.upload_speed))+['cpu','mem','disk'].map(k=>stat(metrics[k],percent(metric(s,k)),k==='cpu'?esc(s.loadavg||'负载未上报'):bytes(s[k+'_used'])+' / '+bytes(s[k+'_total']))).join('')+stat('运行时间',esc(host.fmtDays(s.uptime)),esc(s.provider_name||'—'))+'</section>';
    let content=detailTab==='overview'?kpis+'<div class="detail-columns">'+signals+traffic+'</div>'+routes:detailTab==='ping'?signals+routes:detailTab==='traffic'?traffic+'<div class="detail-days">'+ctx.last7.map(d=>'<div><span>'+esc(d.date.slice(5))+'</span><b>'+bytes(d.total)+'</b><small>↑ '+bytes(d.uplink)+' / ↓ '+bytes(d.downlink)+'</small></div>').join('')+'</div>':system;
    return '<article class="sheet compact-detail">'+tabbar+'<div class="detail-content" data-detail-content="'+detailTab+'">'+content+'</div></article>';
  }
  let sceneKey='', sceneAnimations=[];
  function enhance(root,key) {
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(sceneKey===key)return;sceneKey=key;
    sceneAnimations.forEach(a=>a.cancel());sceneAnimations=[];
    if(reduced)return;
    if(ProbeFX.on('trace'))root.querySelectorAll('.scope-drawing .spark-line,.detail-plot .spark-line,.ni-wave .spark-line').forEach(path=>{
      const length=path.getTotalLength();sceneAnimations.push(path.animate([{strokeDasharray:length,strokeDashoffset:length},{strokeDasharray:length,strokeDashoffset:0}],{duration:1100,easing:'cubic-bezier(.16,1,.3,1)'}));
    });
    if(ProbeFX.on('rise'))root.querySelectorAll('.sky-column,.gauge-value').forEach((el,i)=>sceneAnimations.push(el.animate([{opacity:.15,transform:el.matches('.sky-column')?'translateY(28px)':'rotate(-35deg)'},{opacity:1,transform:'none'}],{duration:800,delay:i*35,easing:'cubic-bezier(.16,1,.3,1)'})));
  }
  document.addEventListener('mmwx-fx',()=>{if(!ProbeFX.on('trace')||!ProbeFX.on('rise'))sceneAnimations.forEach(a=>a.cancel());});
  document.addEventListener('keydown',ev=>{const sky=ev.target.closest?.('.sky-node');if(sky&&['Enter',' '].includes(ev.key)){ev.preventDefault();host.openNode(Number(sky.dataset.index));}});
  document.addEventListener('click',ev=>{
    if(ev.target.closest('[data-scope-zoom]')){scopeZoom=!scopeZoom;host.render();}
    const tab=ev.target.closest('[data-detail-tab]');if(tab){detailTab=tab.dataset.detailTab;host.render();}
    const control=ev.target.closest('[data-resource-metric],[data-resource-order]');if(control){if(control.dataset.resourceMetric)resourceMetric=control.dataset.resourceMetric;if(control.dataset.resourceOrder)resourceOrder=control.dataset.resourceOrder;host.render();}
  });
  function inspectSample(scope,index) {
    const svg=scope.querySelector('svg.spark');if(!svg)return;
    const points=(svg.dataset.pts||'').split(';').map(s=>s.split(',').map(Number));
    index=Math.max(0,Math.min(points.length-1,index));scope.dataset.sample=String(index);
    const p=points[index], cursor=svg.querySelector('.scope-cur');if(!p||!cursor)return;
    cursor.removeAttribute('hidden');
    const line=cursor.querySelector('line');line.setAttribute('x1',p[0]);line.setAttribute('x2',p[0]);
    const dot=cursor.querySelector('circle');dot.setAttribute('cx',p[0]);dot.setAttribute('cy',p[1]);
    scope.closest('.signal-main').querySelector('.sample-readout').textContent='样本 '+(index+1)+' / '+points.length+' · '+(valid(p[2])?p[2]+' ms':'无有效数据');
  }
  document.addEventListener('pointermove',ev=>{
    const scope=ev.target.closest?.('.scope-drawing');if(!scope)return;
    const svg=scope.querySelector('svg.spark');if(!svg)return;
    const count=svg.dataset.pts.split(';').length,rect=scope.getBoundingClientRect();
    inspectSample(scope,Math.round((ev.clientX-rect.left)/rect.width*(count-1)));
  },{passive:true});
  document.addEventListener('keydown',ev=>{
    const scope=ev.target.closest?.('.scope-drawing');if(!scope||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;
    ev.preventDefault();inspectSample(scope,ev.key==='Home'?0:ev.key==='End'?Infinity:Number(scope.dataset.sample||0)+(ev.key==='ArrowRight'?1:-1));
  });
  global.ProbeConsole={configure(options){host=options;},node,network,resource,detail,enhance,inspectSample,resetDetail(){detailTab='overview';},get metric(){return resourceMetric;},samples};
})(window);
