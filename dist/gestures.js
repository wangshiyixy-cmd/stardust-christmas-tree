(() => {
  'use strict';
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
  const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
  const labels={open:'张开手掌',pinch:'指尖捏合',fist:'握拳',victory:'V 字换色',neutral:'已找到手掌'};
  const edges=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
  function extended(points,base,joint,tip) {
    const a=points[base],b=points[joint],c=points[tip];
    const bend=((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)+(b.z-a.z)*(c.z-b.z)) /
      Math.max(.000001,distance(a,b)*distance(b,c));
    return bend>.38 && distance(points[0],c)>distance(points[0],b)*1.07;
  }
  function classify(screen,world,aspect,wasPinching) {
    const points=world?.length===21 ? world : screen.map(p=>({x:p.x*aspect,y:p.y,z:(p.z||0)*aspect}));
    const palm=Math.max(distance(points[5],points[17]),distance(points[0],points[9])*.85,.000001);
    const fingers=[5,9,13,17].map(n=>extended(points,n,n+1,n+3));
    const reach=distance(points[8],points[0])/palm;
    const worldGap=distance(points[4],points[8])/palm;
    // In a side view, fingertip depth is less reliable than their visible separation.
    const imageDistance=(i,j)=>Math.hypot((screen[i].x-screen[j].x)*aspect,screen[i].y-screen[j].y);
    const imagePalm=Math.max(imageDistance(5,17),imageDistance(0,9)*.85,.000001);
    const imageGap=imageDistance(4,8)/imagePalm;
    const gap=Math.min(worldGap,imageGap+.04);
    const folded=!fingers.some(Boolean);
    // A closed fist also brings the fingertips together, but tucks the index into the palm.
    const fingertipAtEdge=reach>1.22||fingers.slice(1).some(Boolean);
    const pinchThreshold = wasPinching ? .44 : .31;
    if(gap<pinchThreshold && fingertipAtEdge) return 'pinch';
    if(folded && reach<1.23 && gap<.77)return 'fist';
    if(fingers[0]&&fingers[1]&&!fingers[2]&&!fingers[3]&&distance(points[8],points[12])/palm>.31)return 'victory';
    if(fingers.filter(Boolean).length>=3 && gap>.52)return 'open';
    return 'neutral';
  }
  class PoseLatch {
    constructor(){this.reset();}
    reset(){this.candidate='neutral';this.stable='neutral';this.since=0;}
    update(pose,now){
      if(pose!==this.candidate){this.candidate=pose;this.since=now;}
      const dwell={pinch:145,open:175,fist:225,victory:620,neutral:175};
      if(pose!==this.stable && now-this.since>=dwell[pose]){
        const previous=this.stable; this.stable=pose; return {pose,previous};
      }
      return null;
    }
  }
  async function createDetector() {
    const assets=window.WinterOrbit.assets;
    const moduleURL=await assets.url('vision/vision_bundle.mjs','text/javascript');
    const {HandLandmarker,FilesetResolver}=await import(moduleURL);
    const suffix=await FilesetResolver.isSimdSupported()?'internal':'nosimd_internal';
    const basename='vision/vision_wasm_'+suffix;
    const [wasmLoaderPath,wasmBinaryPath,buffer]=await Promise.all([
      assets.url(basename+'.js','text/javascript'),assets.url(basename+'.wasm','application/wasm'),assets.bytes('vision/hand_landmarker.task')
    ]);
    return HandLandmarker.createFromOptions({wasmLoaderPath,wasmBinaryPath},{
      baseOptions:{modelAssetBuffer:buffer,delegate:'CPU'},runningMode:'VIDEO',numHands:1,
      minHandDetectionConfidence:.48,minHandPresenceConfidence:.48,minTrackingConfidence:.5
    });
  }
  const auxiliaryCamera = /\b(?:ir|infrared|depth|virtual|obs|manycam|snap camera)\b|红外|虚拟/i;
  async function availableCameras(){
    try{
      const devices=await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device=>device.kind==='videoinput' && device.deviceId);
    }catch{return [];}
  }
  function preferredCamera(devices,savedId,currentId){
    const named=devices.filter(device=>device.label);
    const saved=named.find(device=>device.deviceId===savedId);
    if(saved)return saved;
    const current=named.find(device=>device.deviceId===currentId);
    if(current && !auxiliaryCamera.test(current.label))return current;
    const regular=named.filter(device=>!auxiliaryCamera.test(device.label));
    return regular.find(device=>/front|facetime|前置/i.test(device.label)) || regular[0] || current || named[0];
  }
  function errorText(error,phase){
    const messages={
      NotAllowedError:'摄像头权限未开启。可在浏览器地址栏允许摄像头，再点「开启手势」。',
      NotFoundError:'没有找到所选摄像头。请重新连接，或在摄像头列表中换一台。',
      NotReadableError:'所选摄像头暂时无法使用。请关闭可能占用它的应用，点「重连」或选择其他摄像头。',
      OverconstrainedError:'所选摄像头暂时无法提供画面，请选择其他摄像头。',
      TimeoutError:'已连接设备，但尚未收到视频。请切换摄像头或点「重连」。'
    };
    return messages[error.name] || (phase==='loading'?'识别引擎未能启动。请用新版 Chrome 或 Edge 打开，并在浏览器设置中开启图形加速。':'摄像头启动失败，可以重新连接或切换设备。');
  }
  class HandControl {
    constructor({video,skeleton,status,onState,onMove,onPose,onLost,onError,onDevices,onSignal}) {
      Object.assign(this,{video,skeleton,status,onState,onMove,onPose,onLost,onError,onDevices,onSignal});
      this.phase='off';this.epoch=0;this.stream=null;this.model=null;this.loading=null;this.timer=0;
      this.latch=new PoseLatch();this.previousHand=null;this.pointer=null;this.lastSeen=0;this.lastVideo=-1;
      this.devices=[];this.currentId='';this.savedId='';this.signal='';
      try{this.savedId=localStorage.getItem('winter-orbit-camera')||'';}catch{}
      const probe=document.createElement('canvas');probe.width=24;probe.height=18;
      this.probe=probe.getContext('2d',{willReadFrequently:true});
      navigator.mediaDevices?.addEventListener?.('devicechange',async()=>{
        const id=this.epoch;
        if(this.phase==='live')await this.refreshDevices(id);
      });
    }
    setPhase(value){this.phase=value;this.onState(value);}
    resetHand(){
      this.latch.reset();this.previousHand=null;this.pointer=null;this.lastSeen=0;
      this.status.textContent='寻找手掌';this.onLost();
    }
    async refreshDevices(id){
      const devices=await availableCameras();
      if(id!==this.epoch)return;
      const track=this.stream?.getVideoTracks()[0];
      this.devices=devices;
      this.currentId=track?.getSettings?.().deviceId || devices.find(device=>track?.label && device.label===track.label)?.deviceId || (track?this.currentId:'');
      this.onDevices(devices,this.currentId,track?.label||'');
    }
    releaseStream(){
      this.video.pause();this.video.srcObject=null;
      this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
      this.skeleton.getContext('2d').clearRect(0,0,this.skeleton.width,this.skeleton.height);
    }
    async requestStream(deviceId,id){
      const video={width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}};
      if(deviceId)video.deviceId={exact:deviceId};else video.facingMode={ideal:'user'};
      const stream=await navigator.mediaDevices.getUserMedia({video,audio:false});
      if(id!==this.epoch){stream.getTracks().forEach(track=>track.stop());return false;}
      this.stream=stream;this.currentId=stream.getVideoTracks()[0]?.getSettings?.().deviceId||deviceId||'';
      return true;
    }
    async start(requestedId='',remember=false){
      if(this.phase!=='off')return;
      if(!navigator.mediaDevices?.getUserMedia){
        this.onError('请在 Chrome 或 Edge 中打开离线成品，或在浏览器中打开 HTTPS 网页。');return;
      }
      const id=++this.epoch;this.signal='';this.onSignal('');this.setPhase('asking');
      try{
        const known=await availableCameras();
        if(id!==this.epoch)return;
        this.devices=known;
        const initial=requestedId || preferredCamera(this.devices,this.savedId,'')?.deviceId || '';
        this.onDevices(this.devices,initial,'');
        try{if(!await this.requestStream(initial,id))return;}
        catch(error){
          if(id!==this.epoch||requestedId||!initial||!['NotFoundError','OverconstrainedError'].includes(error.name))throw error;
          if(!await this.requestStream('',id))return;
        }
        // Labels often appear only after the first grant. Release an auxiliary input before opening the RGB camera.
        await this.refreshDevices(id);if(id!==this.epoch)return;
        const preferred=preferredCamera(this.devices,this.savedId,this.currentId);
        if(!requestedId && this.currentId && preferred && preferred.deviceId!==this.currentId){
          const original=this.currentId;
          this.releaseStream();
          try{if(!await this.requestStream(preferred.deviceId,id))return;}
          catch(error){
            if(id!==this.epoch || error.name==='NotAllowedError')throw error;
            if(!await this.requestStream(original,id))return;
          }
          await this.refreshDevices(id);if(id!==this.epoch)return;
        }
        const stream=this.stream,track=stream.getVideoTracks()[0];
        track.addEventListener('ended',()=>{
          if(id===this.epoch){this.stop();this.onError('摄像头连接已结束。请点「重连」或在列表中选择其他摄像头。');}
        },{once:true});
        this.video.srcObject=stream;this.video.muted=true;this.setPhase('connecting');
        let playTimeout;
        try{
          await Promise.race([this.video.play(), new Promise((_,reject)=>{
            playTimeout=setTimeout(()=>reject(new DOMException('No video frames','TimeoutError')),8500);
          })]);
        }finally{clearTimeout(playTimeout);}
        if(id!==this.epoch)return;
        if(remember&&this.currentId){
          this.savedId=this.currentId;try{localStorage.setItem('winter-orbit-camera',this.savedId);}catch{}
        }
        this.setPhase('loading');
        if(!this.loading) this.loading=createDetector().then(model=>(this.model=model)).catch(error=>{this.loading=null;throw error;});
        await this.loading;
        if(id!==this.epoch)return;
        this.lastFrameAt=performance.now();this.lastSample=0;this.darkSince=0;
        this.lastVideo=-1;this.resetHand();this.setPhase('live');this.tick(id);
      }catch(error){
        if(id!==this.epoch)return;
        const message=errorText(error,this.phase);this.stop();this.onError(message);
      }
    }
    stop(){
      ++this.epoch;clearTimeout(this.timer);this.releaseStream();this.signal='';this.onSignal('');
      this.resetHand();this.setPhase('off');
    }
    reconnect(deviceId,remember=false){
      this.stop();return this.start(deviceId,remember);
    }
    setSignal(message){
      if(message===this.signal)return;
      this.signal=message;this.resetHand();
      if(message)this.status.textContent='等待有效画面';
      this.onSignal(message);
    }
    checkFrame(now,fresh){
      if(fresh)this.lastFrameAt=now;
      if(now-this.lastSample<450)return;
      if(this.stream?.getVideoTracks()[0]?.muted || now-this.lastFrameAt>2600){
        this.lastSample=now;
        this.darkSince=0;
        this.setSignal('设备已连接，但没有送来新画面。请点「重连」或换一台摄像头。');return;
      }
      if(!fresh || !this.probe)return;
      this.lastSample=now;
      const sample=this.probe, width=sample.canvas.width,height=sample.canvas.height;
      sample.drawImage(this.video,0,0,width,height);
      const pixels=sample.getImageData(0,0,width,height).data;
      let total=0,bright=0;
      for(let i=0;i<pixels.length;i+=4){
        const light=pixels[i]*.213+pixels[i+1]*.715+pixels[i+2]*.072;
        total+=light;if(light>30)bright++;
      }
      const count=width*height;
      if(total/count<14 && bright/count<.025){
        if(!this.darkSince)this.darkSince=now;
        if(now-this.darkSince>1750)this.setSignal('画面持续偏黑。请选择彩色摄像头，并检查镜头滑盖和光线。');
      }else{this.darkSince=0;this.setSignal('');}
    }
    drawSkeleton(points){
      const g=this.skeleton.getContext('2d'),w=this.skeleton.width,h=this.skeleton.height;
      g.lineWidth=2.2;g.strokeStyle='#f6d396';g.fillStyle='#fff3d3';
      for(const path of edges){g.beginPath();path.forEach((n,i)=>i?g.lineTo(points[n].x*w,points[n].y*h):g.moveTo(points[n].x*w,points[n].y*h));g.stroke();}
      for(const p of points){g.beginPath();g.arc(p.x*w,p.y*h,2.8,0,Math.PI*2);g.fill();}
    }
    process(result,now) {
      const normalized=result.landmarks?.[0];
      if(!normalized){
        if(this.lastSeen && now-this.lastSeen>420)this.resetHand();
        return;
      }
      this.lastSeen=now;this.drawSkeleton(normalized);
      const pose=classify(normalized,result.worldLandmarks?.[0],this.video.videoWidth/(this.video.videoHeight||1),this.latch.stable==='pinch');
      const palm={x:1-(normalized[0].x+normalized[5].x+normalized[17].x)/3,y:(normalized[5].y+normalized[17].y)/2};
      const dx=this.previousHand?clamp(palm.x-this.previousHand.x,-.10,.10):0;
      const dy=this.previousHand?clamp(palm.y-this.previousHand.y,-.08,.08):0;
      this.previousHand=palm;
      // Mirror once so the on-screen aim follows the user's reflected hand.
      const tip={x:clamp(1-normalized[8].x,.015,.985),y:clamp(normalized[8].y,.035,.965)};
      if(!this.pointer)this.pointer=tip;
      else {this.pointer.x+=(tip.x-this.pointer.x)*.55;this.pointer.y+=(tip.y-this.pointer.y)*.55;}
      this.onMove(this.pointer,pose==='open'?dx:0,pose==='open'?dy:0);
      const change=this.latch.update(pose,now);
      this.status.textContent=labels[this.latch.stable];
      if(change)this.onPose(change.pose,change.previous,this.pointer);
    }
    tick(id){
      if(id!==this.epoch||this.phase!=='live')return;
      try{
        if(!document.hidden){
          const now=performance.now();
          const fresh=this.video.readyState>=2 && this.video.videoWidth>0 && this.video.currentTime!==this.lastVideo;
          if(fresh){
            this.lastVideo=this.video.currentTime;
            this.skeleton.getContext('2d').drawImage(this.video,0,0,this.skeleton.width,this.skeleton.height);
          }
          this.checkFrame(now,fresh);
          if(fresh&&!this.signal)this.process(this.model.detectForVideo(this.video,now),now);
        }
      }catch{
        this.stop();this.model?.close();this.model=null;this.loading=null;
        this.onError('手势识别已中断。点「开启手势」即可重新连接。');return;
      }
      this.timer=setTimeout(()=>this.tick(id),62);
    }
  }
  Object.assign(window.WinterOrbit,{HandControl,classify,PoseLatch});
})();
