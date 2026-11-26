(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const blend = (a, b, p) => a + (b - a) * p;
  const palettes = {
    gold: { points: ['#4d5946','#82794c','#a48754','#c79a58','#edc982','#fff0bd','#f6dba9'], glow: ['247,170,63','255,221,139','255,244,209'], metal: [['#fff1ac','#a36d20','#39200f'],['#ffe0b3','#a33e30','#381419'],['#faf5cb','#a39371','#473e34']], frame: '#e9c88c' },
    ice: { points: ['#354e61','#537688','#679ab1','#79adca','#b3e5f7','#e7fbff','#caedff'], glow: ['78,162,227','145,221,255','226,248,255'], metal: [['#f4feff','#6298b7','#213649'],['#defcff','#398f98','#12383e'],['#f6f9ff','#9a9cbc','#454755']], frame: '#cae9f6' },
    rose: { points: ['#5a4152','#785768','#a26e84','#bd8296','#e8adc2','#ffe1e9','#f7cadf'], glow: ['226,117,159','247,179,206','255,228,240'], metal: [['#fff0e1','#bb7488','#542638'],['#ffd7c5','#a24a5a','#401925'],['#fff4e0','#bea17d','#554334']], frame: '#edc1d0' }
  };
  function randomSource(seed) {
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  }
  function texture(size, draw) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size); return canvas;
  }
  function glowTexture(rgb) {
    return texture(64, (g, s) => {
      const r = s / 2, light = g.createRadialGradient(r,r,0,r,r,r);
      for (const [p,a] of [[0,1],[.07,.98],[.17,.72],[.31,.29],[.57,.09],[1,0]]) light.addColorStop(p, 'rgba(' + rgb + ',' + a + ')');
      g.fillStyle = light; g.fillRect(0,0,s,s);
    });
  }
  function ornamentTexture(colors) {
    return texture(64, g => {
      const [light,middle,shadow] = colors;
      g.strokeStyle = light; g.lineWidth=1.6;
      g.beginPath(); g.ellipse(32,9,3.3,5.5,0,0,TAU); g.stroke();
      g.fillStyle=middle; g.fillRect(27,12,10,6);
      const ball=g.createRadialGradient(25,26,1.5,34,37,24);
      ball.addColorStop(0,'#fff8e0'); ball.addColorStop(.12,light); ball.addColorStop(.39,middle); ball.addColorStop(.83,shadow); ball.addColorStop(1,middle);
      g.fillStyle=ball; g.beginPath(); g.arc(32,37,22,0,TAU); g.fill();
      g.strokeStyle='rgba(255,244,220,.45)'; g.lineWidth=1.1;
      g.beginPath(); g.arc(32,37,20,.27,2.15); g.stroke();
    });
  }
  class TreeScene {
    constructor(canvas, greeting, dock) {
      this.canvas=canvas; this.g=canvas.getContext('2d'); this.greeting=greeting; this.dock=dock;
      this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.rand=randomSource(2401225); this.points=[]; this.ornaments=[]; this.ribbons=[]; this.ground=[]; this.stars=[];
      this.photos=[]; this.cards=[]; this.target=0; this.spread=0; this.turn=0; this.yaw=0; this.pitch=0; this.tilt=0;
      this.focused=false; this.aim=null; this.activeCard=null; this.time=0; this.last=0; this.dragging=false;
      this.photoPoses=[]; this.cos=1; this.sin=0; this.quality=1; this.frameCost=0;
      this.makeTree(); this.setTheme('gold'); this.resize();
      this.observer=new ResizeObserver(() => this.resize());
      for (const element of [canvas.parentElement, greeting, dock]) this.observer.observe(element);
      document.fonts?.ready.then(() => this.resize());
      this.draw = this.draw.bind(this); requestAnimationFrame(this.draw);
    }
    scatterLocation() {
      const r=this.rand, angle=r()*TAU, height=r()*2-1, radius=.20+Math.pow(r(),.58)*1.34;
      const horizontal=Math.sqrt(1-height*height)*radius;
      return {sx:Math.cos(angle)*horizontal, sy:height*radius, sz:Math.sin(angle)*horizontal};
    }
    addPoint(x,y,z,kind,color,size) {
      const point={x,y,z,kind,color,size,seed:this.rand()*TAU,...this.scatterLocation()};
      this.points.push(point); return point;
    }
    makeTree() {
      const r=this.rand;
      // Every branch has a curved spine and paired, tapering sprays.
      for(let layer=0;layer<17;layer++){
        const level=(layer+.55)/17, arms=5+Math.floor(level*13), phase=r()*TAU;
        for(let arm=0;arm<arms;arm++){
          const a=phase+TAU*(arm+(r()-.5)*.35)/arms, reach=.34*Math.pow(level,.92)*(.73+r()*.34);
          const base=-.49+level*.88+(r()-.5)*.025, curve=(r()-.5)*.5, lift=.022+r()*.03;
          for(let step=0;step<14;step++){
            const u=(step+.15)/14, angle=a+curve*u, rad=reach*u;
            const y=base+u*(.022+.03*level)+.014*Math.sin(Math.PI*u)-lift*u*u*u;
            const x=Math.cos(angle)*rad,z=Math.sin(angle)*rad;
            this.addPoint(x,y,z,0,Math.floor(r()*3),.0017+r()*.0018);
            for(const side of [-1,1]){
              const fan=side*(1-u*.72)*(.012+.027*level)*(.35+r()*.65);
              const x2=x-Math.sin(angle)*fan+Math.cos(angle)*.006;
              const z2=z+Math.cos(angle)*fan+Math.sin(angle)*.006;
              const shade=r(); const color=shade<.18?0:shade<.43?1:shade<.72?2:shade<.91?3:4;
              this.addPoint(x2,y-Math.abs(fan)*.42+(r()-.5)*.01,z2,0,color,.0012+r()*.0024);
              if(r()<.37) this.addPoint(x2+(r()-.5)*.013,y-.008-r()*.014,z2+(r()-.5)*.013,1,Math.floor(r()*3),.007+r()*.013);
            }
          }
        }
      }
      // Two fine strands follow the same spiral at slightly different heights.
      for(let strand=0;strand<2;strand++){
        const wire=[];
        for(let i=0;i<440;i++){
          const t=.015+.975*i/439, a=t*TAU*4.3-.4+strand*.047;
          const rad=.343*Math.pow(t,.91)+.0025*strand+.003*Math.sin(a*3);
          const y=-.50+t*.946+.012*Math.cos(a)+strand*.008;
          const point=this.addPoint(rad*Math.cos(a),y,rad*Math.sin(a),i%9===0?2:1,i%4===0?2:1,i%9===0?.025:.008+r()*.006);
          if(i%4===0) wire.push(point);
        }
        this.ribbons.push(wire);
      }
      for(let i=0;i<380;i++){
        const t=Math.sqrt(r()), angle=r()*TAU, rad=.33*Math.pow(t,.88)*(.68+.34*r());
        const bright=i%13===0;
        this.addPoint(rad*Math.cos(angle),-.49+t*.94+(r()-.5)*.021,rad*Math.sin(angle),bright?2:1,i%3,(bright ? .032 : .011)+r()*.025);
      }
      for(let i=0;i<72;i++){
        const t=.13+.83*Math.sqrt((i+r()*.7)/72), a=i*2.39996+r()*.30, rad=.336*Math.pow(t,.89)*(.91+r()*.1);
        this.ornaments.push({x:Math.cos(a)*rad,y:-.49+t*.94,z:Math.sin(a)*rad,
          size:(.013+r()*.018)*(.62+.4*t),color:i%6===0?1:i%5===0?2:0,seed:r()*TAU,...this.scatterLocation()});
      }
      for(let i=0;i<240;i++){
        const angle=r()*TAU, radius=Math.sqrt(r())*.58;
        this.ground.push({x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,seed:r(),size:.00065+r()*.0018});
      }
      for(let i=0;i<215;i++) this.stars.push({x:r(),y:r(),size:.35+Math.pow(r(),3)*1.45,seed:r()*TAU,drift:.1+r()*.35,bright:r()});
    }
    setTheme(name) {
      this.palette=palettes[name]; this.glows=this.palette.glow.map(glowTexture); this.baubles=this.palette.metal.map(ornamentTexture);
    }
    resize() {
      const box=this.canvas.getBoundingClientRect(); this.w=box.width; this.h=box.height;
      const ratio=Math.min(window.devicePixelRatio||1,1.75);
      this.canvas.width=Math.max(1,Math.round(box.width*ratio)); this.canvas.height=Math.max(1,Math.round(box.height*ratio)); this.g.setTransform(ratio,0,0,ratio,0,0);
      const top=this.greeting.getBoundingClientRect().bottom+Math.min(28,box.height*.028);
      const bottom=this.dock.getBoundingClientRect().top-Math.min(26,box.height*.026);
      const available=Math.max(90,bottom-top);
      this.scale=Math.min(available*.94,this.w*1.33,920);
      this.cx=this.w*.5; this.cy=(top+bottom)*.5+.014*this.scale;
      this.cloudY=(top+bottom)*.5; this.cloudH=Math.max(100,available*.54);
    }
    setPhotos(photos) {
      this.photos=photos; this.activeCard=null;
      const total=photos.length;
      this.photoPoses=photos.map((_,i)=>{
        const t=.25+.65*(i+.45)/Math.max(1,total), a=i*2.39996+.55, radius=.337*Math.pow(t,.9);
        const orbit=i*TAU/Math.max(1,total)+.36;
        const rows = total<=8 ? [-.46,.06,.53,-.34,.24,.57,-.55,.1] : [-.66,-.19,.39,.61,.13,-.48,.48,.01,.69];
        return {x:Math.cos(a)*radius,y:-.49+t*.94,z:Math.sin(a)*radius,seed:a,
          sx:Math.cos(orbit)*.86,sy:rows[i%rows.length],sz:Math.sin(orbit)*.79,angle:Math.sin(a)*.21};
      });
    }
    setSpread(on) { this.target=on?1:0; if(this.reduced) this.spread=this.target; }
    rotate(dx,dy=0) { this.turn+=dx; this.tilt=clamp(this.tilt+dy,-.17,.17); }
    nearest(x,y,hitOnly=false) {
      let best=null, score=Infinity;
      for(const card of this.cards){
        const dx=x-card.x,dy=y-card.y;
        if(hitOnly){
          const c=Math.cos(card.angle),s=Math.sin(card.angle);
          if(Math.abs(dx*c+dy*s)>card.w*.54+3||Math.abs(-dx*s+dy*c)>card.h*.55+3) continue;
        }
        const distance=dx*dx+dy*dy-card.depth*(hitOnly?150:32);
        if(distance<score){score=distance;best=card;}
      }
      return best;
    }
    project(point) {
      const p=this.spread, c=this.cos,s=this.sin, h=this.scale;
      const tx=point.x*c+point.z*s,tz=point.z*c-point.x*s, ty=point.y-tz*this.pitch;
      const camera=3.9/(3.9-tz);
      const sx=point.sx*c+point.sz*s,sz=point.sz*c-point.sx*s,sy=point.sy-sz*this.pitch;
      const lens=1/(1-sz*.19), curl=Math.sin(p*Math.PI);
      this.px=this.cx+blend(tx*h*camera,sx*this.w*.51*lens,p)-sy*curl*this.scale*.065;
      this.py=blend(this.cy+ty*h*camera,this.cloudY+sy*this.cloudH*lens,p)+sx*curl*this.scale*.045;
      this.pz=blend(tz*2,sz,p); this.lens=blend(camera,lens,p);
    }
    drawSky(time) {
      const g=this.g;
      for(const star of this.stars){
        const x=star.x*this.w+Math.sin(time*.07+star.seed)*3, y=((star.y*this.h+time*star.drift*.85)%(this.h+8))-4;
        const alpha=(.12+.37*star.bright)*(.78+.22*Math.sin(time*.74+star.seed));
        g.globalAlpha=alpha; g.fillStyle=star.bright<.32?'#b8c2c9':this.palette.points[6];
        g.fillRect(x,y,star.size,star.size);
        if(star.size>1.5&&star.bright>.5){g.globalAlpha=alpha*.45;g.fillRect(x-2,y+.25,5, .7);g.fillRect(x+.25,y-2,.7,5);}
      }
      g.globalAlpha=1;
    }
    drawGround() {
      const p=1-this.spread; if(p<.018)return;
      const g=this.g, size=this.scale, floor=this.cy+size*.50;
      g.save(); g.translate(this.cx,floor); g.scale(1,.125); g.globalAlpha=.23*p;
      g.drawImage(this.glows[0],-size*.49,-size*.49,size*.98,size*.98); g.restore();
      g.fillStyle=this.palette.points[4];
      for(const dust of this.ground){
        const x=dust.x*this.cos+dust.z*this.sin,z=dust.z*this.cos-dust.x*this.sin;
        g.globalAlpha=(.11+dust.seed*.37)*p; const d=dust.size*size;
        g.fillRect(this.cx+x*size,floor+z*size*.115,d,d*.7);
      }
      g.globalAlpha=1;
    }
    drawRibbons() {
      if(this.spread>.26)return;
      const g=this.g; g.lineWidth=.62; g.strokeStyle=this.palette.points[4]; g.globalAlpha=.37*(1-this.spread/.26);
      for(const wire of this.ribbons){
        g.beginPath();
        wire.forEach((node,i)=>{this.project(node); if(i===0)g.moveTo(this.px,this.py);else g.lineTo(this.px,this.py);});
        g.stroke();
      }
      g.globalAlpha=1;
    }
    drawPoints(time) {
      const g=this.g,h=this.scale,p=this.spread, palette=this.palette.points;
      const stride=this.quality<.7?2:1;
      for(let i=0;i<this.points.length;i++){
        const point=this.points[i];
        if(stride===2 && i%2===1 && point.kind===0)continue;
        this.project(point);
        const x=this.px,y=this.py,light=clamp(.66+this.pz*.55,.20,1);
        if(x< -25||x>this.w+25||y< -25||y>this.h+25)continue;
        if(point.kind===0){
          const size=Math.max(.48,point.size*h*this.lens*(1+p*.12));
          g.globalAlpha=light*(.82+.10*p); g.fillStyle=palette[point.color+(p>.66&&point.color<4?1:0)];
          g.fillRect(x,y,size,size*(.72+.3*p));
        } else {
          const twinkle=.76+.24*Math.sin(time*(1.3+point.color*.22)+point.seed*8);
          const size=Math.max(2.5,point.size*h*this.lens*(.91+.25*p));
          g.globalAlpha=light*twinkle; g.drawImage(this.glows[point.color],x-size/2,y-size/2,size,size);
          if(point.kind===2&&twinkle>.89){
            const ray=size*.30*(twinkle-.79)*4;
            g.fillStyle=palette[5]; g.globalAlpha=light*(twinkle-.79)*2;
            g.fillRect(x-ray,y-.45,ray*2,.9);g.fillRect(x-.45,y-ray,.9,ray*2);
          }
        }
      }
      g.globalAlpha=1;
    }
    drawMetal() {
      const g=this.g,p=this.spread;
      for(const orb of this.ornaments){
        this.project(orb); const d=orb.size*this.scale*this.lens*(1+p*.85);
        g.globalAlpha=clamp(.77+this.pz*.34,.32,1);
        g.drawImage(this.baubles[orb.color],this.px-d*.5,this.py-d*.5,d,d);
      }
      g.globalAlpha=1;
    }
    drawStar(time) {
      const p=this.spread; if(p>.985)return;
      const g=this.g, x=this.cx, y=this.cy-this.scale*.523, r=this.scale*.0355;
      g.save(); g.translate(x,y); g.globalAlpha=(1-p)*.84;
      g.drawImage(this.glows[0],-r*3.4,-r*3.4,r*6.8,r*6.8);
      g.rotate(-.075+Math.sin(time*.26)*.03); g.globalAlpha=1-p;
      const vertices=[];
      for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5, radius=i%2?r*.44:r; vertices.push([Math.cos(a)*radius,Math.sin(a)*radius]);}
      for(let i=0;i<10;i++){
        g.fillStyle=this.palette.points[[5,3,4,2,5,3,4,2,5,4][i]];
        g.beginPath();g.moveTo(0,0);g.lineTo(...vertices[i]);g.lineTo(...vertices[(i+1)%10]);g.closePath();g.fill();
      }
      g.strokeStyle=this.palette.points[5];g.lineWidth=.72;g.beginPath();vertices.forEach(([vx,vy],i)=>i?g.lineTo(vx,vy):g.moveTo(vx,vy));g.closePath();g.stroke();
      g.restore();
    }
    drawPhotos() {
      const g=this.g,p=this.spread,h=this.scale;
      this.cards=this.photoPoses.map((pose,index)=>{
        this.project(pose);
        const width=blend(h*.072,clamp(this.w*.102,58,156),p)*this.lens*(.94+.14*this.pz);
        return {index,x:this.px,y:this.py,depth:this.pz,w:width,h:width*.8,angle:pose.angle+Math.sin(this.time*.32+pose.seed)*.035};
      }).sort((a,b)=>a.depth-b.depth);
      this.activeCard=this.aim?this.nearest(this.aim.x,this.aim.y):null;
      for(const card of this.cards){
        const photo=this.photos[card.index];
        if(!photo?.image?.naturalWidth)continue;
        const selected=this.activeCard?.index===card.index && p>.7;
        g.save();g.translate(card.x,card.y);g.rotate(card.angle);
        const w=card.w,hc=card.h,edge=Math.max(1,w*.036),iw=w-edge*2,ih=hc-edge*2.8;
        g.globalAlpha=clamp(.85+card.depth*.23,.48,1);
        if(selected){g.shadowBlur=14;g.shadowColor=this.palette.frame;}
        g.fillStyle=this.palette.frame;g.fillRect(-w/2,-hc/2,w,hc);g.shadowBlur=0;
        g.strokeStyle=selected?'#fff9e8':'#fff0cf88';g.lineWidth=selected?2:Math.max(.6,w*.008);
        g.strokeRect(-w/2,-hc/2,w,hc);
        const img=photo.image,scale=Math.max(iw/img.naturalWidth,ih/img.naturalHeight);
        const sw=iw/scale,sh=ih/scale;
        g.drawImage(img,(img.naturalWidth-sw)/2,(img.naturalHeight-sh)/2,sw,sh,-w/2+edge,-hc/2+edge,iw,ih);
        g.restore();
      }
    }
    draw(now) {
      requestAnimationFrame(this.draw);
      if(document.hidden||this.w<1||this.h<1){this.last=0;return;}
      const elapsed=this.last?(now-this.last)/1000:.016;
      if(elapsed<.013 || (this.reduced&&elapsed<.029))return;
      this.last=now; const dt=Math.min(.06,elapsed);
      const start=performance.now();
      if(!this.reduced)this.time+=dt;
      if(!this.reduced&&!this.focused&&!this.dragging&&!this.aim)this.turn+=dt*blend(.10,.052,this.spread);
      this.yaw=blend(this.yaw,this.turn,1-Math.exp(-dt*9)); this.pitch=blend(this.pitch,this.tilt,1-Math.exp(-dt*7));
      this.spread=blend(this.spread,this.target,this.reduced?1:1-Math.exp(-dt*3.25)); if(Math.abs(this.spread-this.target)<.001)this.spread=this.target;
      const rotation=this.yaw+this.spread*.53+Math.sin(this.spread*Math.PI)*.33;
      this.cos=Math.cos(rotation);this.sin=Math.sin(rotation);
      this.g.clearRect(0,0,this.w,this.h);this.drawSky(this.time);this.drawGround();this.drawRibbons();this.drawPoints(this.time);this.drawMetal();this.drawPhotos();this.drawStar(this.time);
      this.frameCost=this.frameCost*.96+(performance.now()-start)*.04;
      if(this.frameCost>19)this.quality=.6; else if(this.frameCost<9)this.quality=1;
    }
  }
  window.WinterOrbit.TreeScene=TreeScene;
})();
