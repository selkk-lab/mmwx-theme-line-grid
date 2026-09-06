/* A persistent, high-DPI cartographic instrument. No remote assets or GPU dependency. */
(function (global) {
  const RAD = Math.PI / 180;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const vector = (lon, lat) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];
  const coast = (global.ProbeLand || []).map(ring => ring.map(p => vector(p[0], p[1])));
  const grid = [];
  for (let lon = -180; lon < 180; lon += 30) grid.push(Array.from({ length: 91 }, (_, i) => vector(lon, i * 2 - 90)));
  for (let lat = -60; lat <= 60; lat += 30) grid.push(Array.from({ length: 181 }, (_, i) => vector(i * 2 - 180, lat)));
  const dots = [];
  function inside(x, y, ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  }
  (global.ProbeLand || []).forEach(raw => {
    // Unwrap antimeridian crossings before point-in-polygon sampling.
    const ring=[];
    raw.forEach(p=>{let x=p[0];if(ring.length){const previous=ring[ring.length-1][0];while(x-previous>180)x-=360;while(x-previous< -180)x+=360;}ring.push([x,p[1]]);});
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxX - minX > 350) return;
    for (let lat = Math.ceil(minY / 2.4) * 2.4; lat < maxY; lat += 2.4) {
      const step = 2.4 / Math.max(.22, Math.cos(lat * RAD));
      for (let lon = Math.ceil(minX / step) * step; lon < maxX; lon += step) if (inside(lon, lat, ring)) dots.push(vector(lon, lat));
    }
  });
  let root, canvas, ctx, observer, options = {}, servers = [], pins = [], frameCount = 0;
  let lon = 90, lat = 23, zoom = 1, aim = null, drag = null, velocity = [0, 0], hover = -1;
  let width = 0, height = 0, dpr = 1, lastTime = 0, dirty = true, resumeAt = 0, ringTime = 0;
  document.fonts?.ready.then(() => { dirty = true; });
  document.fonts?.addEventListener('loadingdone', () => { dirty = true; });
  let color = {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const enabled = key => !global.ProbeFX || ProbeFX.on(key);
  function colors() {
    const style = getComputedStyle(document.documentElement);
    ['ink', 'ink-soft', 'ink-dim', 'live', 'gold', 'void', 'down'].forEach(k => color[k] = style.getPropertyValue('--' + k).trim());
    color.light = document.documentElement.dataset.theme === 'light';
    color.tint = Number(style.getPropertyValue('--globe-tint')) || 0;
  }
  function resize() {
    if (!root || !root.isConnected) return;
    width = root.clientWidth; height = root.clientHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dirty = true;
  }
  function project(v, radius, cx, cy, sl, cl, sp, cp) {
    const x = v[0] * cl - v[2] * sl, z = v[0] * sl + v[2] * cl;
    return { x: cx + radius * x, y: cy - radius * (v[1] * cp - z * sp), z: v[1] * sp + z * cp };
  }
  function draw(now) {
    if (!ctx || width < 1 || height < 1) return;
    colors(); frameCount++;
    const r = Math.min(width * .315, height * .355) * zoom;
    const cx = width * .5, cy = height * .49;
    const sl = Math.sin(lon * RAD), cl = Math.cos(lon * RAD), sp = Math.sin(lat * RAD), cp = Math.cos(lat * RAD);
    const proj = v => project(v, r, cx, cy, sl, cl, sp, cp);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = .6;
    // Azimuth ring and register marks.
    ctx.strokeStyle = color['ink']; ctx.globalAlpha = .18;
    ctx.beginPath(); ctx.arc(cx, cy, r + 24, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 120; i++) {
      const a = i * Math.PI / 60, len = i % 10 === 0 ? 9 : i % 5 === 0 ? 5 : 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r + 27), cy + Math.sin(a) * (r + 27));
      ctx.lineTo(cx + Math.cos(a) * (r + 27 + len), cy + Math.sin(a) * (r + 27 + len)); ctx.stroke();
    }
    ctx.globalAlpha = .3; ctx.font = '9px "JetBrains Mono", "Noto Sans SC", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color['ink-dim'];
    if (width > 520) ['000', '090', '180', '270'].forEach((n, i) => {
      const a = (i - 1) * Math.PI / 2; ctx.fillText(n, cx + Math.cos(a) * (r + 48), cy + Math.sin(a) * (r + 48) + 3);
    });
    // Delicate atmosphere and a subdued translucent surface.
    const atmosphere = ctx.createRadialGradient(cx, cy, r * .85, cx, cy, r + 13);
    atmosphere.addColorStop(0, 'transparent'); atmosphere.addColorStop(.65, color.light ? 'rgba(79,102,56,.05)' : 'rgba(143,166,118,.09)'); atmosphere.addColorStop(1, 'transparent');
    ctx.globalAlpha = 1; ctx.fillStyle = atmosphere; ctx.beginPath(); ctx.arc(cx, cy, r + 13, 0, Math.PI * 2); ctx.fill();
    const ocean = ctx.createRadialGradient(cx - r * .35, cy - r * .4, 0, cx, cy, r);
    ocean.addColorStop(0, color.light ? 'rgba(80,110,85,.08)' : 'rgba(109,143,127,.13)');
    ocean.addColorStop(1, color.light ? 'rgba(55,70,40,.025)' : 'rgba(8,12,9,.28)');
    ctx.globalAlpha = clamp(color.tint / .15, 0, 3); ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    function line(points, alpha, stroke, weight) {
      ctx.beginPath(); let previous = null;
      for (const v of points) {
        const p = proj(v);
        if (p.z > 0) { if (previous && previous.z > 0) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
        previous = p;
      }
      ctx.globalAlpha = alpha; ctx.strokeStyle = stroke; ctx.lineWidth = weight; ctx.stroke();
    }
    for (const g of grid) line(g, .15, color.ink, .5);
    ctx.fillStyle = color['ink-soft'];
    for (const v of dots) {
      const p = proj(v); if (p.z <= 0) continue;
      ctx.globalAlpha = .12 + p.z * .43;
      ctx.beginPath(); ctx.arc(p.x, p.y, .55 + p.z * .3, 0, Math.PI * 2); ctx.fill();
    }
    for (const ring of coast) line(ring, .28, color['ink-soft'], .55);
    if (enabled('sweep')) {
      const sweep = Array.from({length:81}, (_,i) => vector(ringTime / 100 % 360, i * 2 - 80));
      line(sweep, .32, color.live, 1.2);
    }
    ctx.globalAlpha = .45; ctx.lineWidth = .9; ctx.strokeStyle = color['ink-soft']; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // Pins and labels represent supplied nodes; moving arcs are decorative.
    pins = [];
    servers.forEach((s, index) => {
      const ll = ProbeAdapt.coords(s); if (!ll) return;
      const p = proj(vector(ll[0], ll[1]));
      if (p.z > .02) pins.push({ ...p, server: s, index, ll });
    });
    if (enabled('flow') && !reduce.matches) {
      const unique = pins.filter((p, i, list) => p.server.online && list.findIndex(q => q.server.region_country === p.server.region_country) === i);
      unique.slice(1, 5).forEach((b, i) => {
        const a = unique[0], qx = (a.x + b.x) / 2, qy = Math.min(a.y, b.y) - r * .3;
        ctx.strokeStyle = color.live; ctx.lineWidth = .6; ctx.globalAlpha = .23; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(qx, qy, b.x, b.y); ctx.stroke();
        const t = ((now / 5600 + i * .23) % 1), u = 1 - t;
        ctx.fillStyle = color.live; ctx.globalAlpha = .8; ctx.beginPath(); ctx.arc(u*u*a.x+2*u*t*qx+t*t*b.x, u*u*a.y+2*u*t*qy+t*t*b.y, 1.8, 0, Math.PI*2); ctx.fill();
      });
    }
    const small = width < 520;
    const sides = [pins.filter(p => p.x < cx), pins.filter(p => p.x >= cx)];
    sides.forEach((list, side) => {
      list.sort((a, b) => a.y - b.y);
      let y = clamp((list[0]?.y || cy) - (list.length > 2 ? 14 : 0), 60, height - 70 - list.length * 25);
      list.forEach(p => {
        y = Math.max(y, Math.min(p.y, height - 55 - (list.length - list.indexOf(p)) * 25));
        const tag = small ? p.server.region_country || '—' : String(p.server.name || '未命名');
        ctx.font = '10px "JetBrains Mono", "Noto Sans SC", monospace';
        const tw = Math.min(small ? 52 : 145, ctx.measureText(tag).width);
        const labelX = side ? Math.min(width - tw - 18, cx + r + 34) : Math.max(tw + 18, cx - r - 34);
        const on = p.server.online, accent = on ? color.live : color.down;
        ctx.lineWidth = .6; ctx.strokeStyle = color['ink-soft']; ctx.globalAlpha = hover === p.index ? .8 : .35;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(side ? labelX - 10 : labelX + 10, y); ctx.lineTo(labelX, y); ctx.stroke();
        if (on && enabled('pulse') && !reduce.matches) {
          const phase = (now / 3000 + p.index * .2) % 1;
          ctx.globalAlpha = (1 - phase) * .45; ctx.strokeStyle = accent; ctx.beginPath(); ctx.arc(p.x, p.y, 3 + phase * 7, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(p.x, p.y, hover === p.index ? 3.8 : 2.5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = hover === p.index ? 1 : .8; ctx.fillStyle = color['ink']; ctx.textAlign = side ? 'left' : 'right';
        ctx.fillText(tag.length > 21 ? tag.slice(0, 19) + '…' : tag, labelX + (side ? 4 : -4), y + 3, small ? 52 : 145);
        p.label = { x: labelX + (side ? 0 : -tw - 4), y: y - 11, w: tw + 12, h: 24 };
        y += 25;
      });
    });
    ctx.globalAlpha = 1;
    const caption = root.querySelector('.globe-caption');
    if (caption) caption.textContent = Math.abs(lon % 360).toFixed(1) + '° ' + (lon >= 0 ? 'E' : 'W') + ' / ' + Math.abs(lat).toFixed(1) + '° ' + (lat >= 0 ? 'N' : 'S');
    canvas.dataset.frames = String(frameCount);
  }
  function hit(x, y) {
    return pins.find(p => Math.hypot(p.x-x, p.y-y)<13 || p.label && x>=p.label.x && x<=p.label.x+p.label.w && y>=p.label.y && y<=p.label.y+p.label.h);
  }
  function mount(el) {
    root = el; canvas = el.querySelector('canvas'); ctx = canvas.getContext('2d');
    if (observer) observer.disconnect(); observer = new ResizeObserver(resize); observer.observe(el); resize();
    canvas.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      drag = { x:ev.clientX, y:ev.clientY, startX:ev.clientX, startY:ev.clientY, moved:false, id:ev.pointerId };
      velocity = [0,0]; aim = null; canvas.setPointerCapture(ev.pointerId); canvas.classList.add('is-drag');
    });
    canvas.addEventListener('pointermove', ev => {
      const b=canvas.getBoundingClientRect(), pin=hit(ev.clientX-b.left,ev.clientY-b.top);
      hover=pin ? pin.index : -1; canvas.style.cursor = drag ? 'grabbing' : pin ? 'pointer' : 'grab';
      dirty=true;
      if (!drag || ev.pointerId!==drag.id) return;
      const dx=ev.clientX-drag.x, dy=ev.clientY-drag.y;
      drag.moved ||= Math.hypot(ev.clientX-drag.startX,ev.clientY-drag.startY)>4;
      lon -= dx*.26; lat=clamp(lat+dy*.2,-72,72); velocity=[-dx*.12,dy*.09]; drag.x=ev.clientX; drag.y=ev.clientY;
    });
    function release(ev) {
      if (!drag || ev.pointerId!==drag.id) return;
      const saved=drag; drag=null; canvas.classList.remove('is-drag');
      if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
      resumeAt=performance.now()+1600;
      if (!saved.moved && ev.type!=='pointercancel') { const b=canvas.getBoundingClientRect(), p=hit(ev.clientX-b.left,ev.clientY-b.top); if(p) options.onSelect?.(p.index); }
    }
    canvas.addEventListener('pointerup',release); canvas.addEventListener('pointercancel',release);
    canvas.addEventListener('pointerleave',()=>{ hover=-1; dirty=true; });
    canvas.addEventListener('dblclick',()=>{ aim={lon:90,lat:23}; zoom=1; dirty=true; });
    canvas.addEventListener('keydown',ev=>{
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home','Enter'].includes(ev.key)) return;
      ev.preventDefault();
      if(ev.key==='ArrowLeft')lon-=10; if(ev.key==='ArrowRight')lon+=10;
      if(ev.key==='ArrowUp')lat=clamp(lat+8,-72,72); if(ev.key==='ArrowDown')lat=clamp(lat-8,-72,72);
      if(ev.key==='+')zoom=clamp(zoom+.1,.7,1.22); if(ev.key==='-')zoom=clamp(zoom-.1,.7,1.22);
      if(ev.key==='Home'){lon=90;lat=23;zoom=1;}
      if(ev.key==='Enter'&&pins.length)options.onSelect?.(pins[0].index);
      velocity=[0,0];resumeAt=performance.now()+2500;dirty=true;
    });
    el.addEventListener('click',ev=>{
      const b=ev.target.closest('[data-globe-control]'); if(!b)return;
      if(b.dataset.globeControl==='in')zoom=clamp(zoom+.1,.7,1.22);
      if(b.dataset.globeControl==='out')zoom=clamp(zoom-.1,.7,1.22);
      if(b.dataset.globeControl==='reset'){aim={lon:90,lat:23};zoom=1;}
      dirty=true;
    });
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt=Math.min(40, now-lastTime); if(dt<28)return; lastTime=now;
    if(!root?.isConnected || document.hidden || document.body.classList.contains('is-locked'))return;
    if(root.getBoundingClientRect().bottom<0)return;
    let moving=false;
    if(aim){
      const delta=((aim.lon-lon+540)%360)-180;
      lon+=reduce.matches?delta:delta*.12; lat+=reduce.matches?(aim.lat-lat):(aim.lat-lat)*.12;
      moving=true; if(Math.abs(delta)<.1 && Math.abs(aim.lat-lat)<.1)aim=null;
    } else if(!drag&&!reduce.matches){
      lon+=velocity[0];lat=clamp(lat+velocity[1],-72,72); velocity=velocity.map(v=>v*.93);
      if(enabled('rotate')&&now>resumeAt)lon+=dt*.0028;
      moving=enabled('rotate')||Math.abs(velocity[0])+Math.abs(velocity[1])>.002;
    }
    lon=((lon+540)%360)-180;
    if(!reduce.matches)ringTime=now;
    if(dirty||moving||(!reduce.matches&&(enabled('sweep')||enabled('flow')||enabled('pulse')))){draw(now);dirty=false;}
  }
  requestAnimationFrame(frame);
  document.addEventListener('mmwx-fx',()=>{dirty=true;if(!enabled('rotate'))velocity=[0,0];});
  new MutationObserver(()=>{dirty=true;}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','style']});
  global.ProbeGlobe={
    update(el, list, opts){options=opts||{};servers=list||[];if(root!==el)mount(el);dirty=true;},
    aim(ll){if(!ll)return;aim={lon:ll[0],lat:clamp(ll[1],-65,65)};velocity=[0,0];resumeAt=performance.now()+6000;dirty=true;},
    get dragging(){return !!drag;},
    inspect(){return {lon,lat,zoom,frames:frameCount,dots:dots.length,visible:pins.map(p=>({index:p.index,x:p.x,y:p.y})),width,height};}
  };
})(window);
