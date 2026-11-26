(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const {TreeScene,Album,HandControl,assets}=window.WinterOrbit;
  const sky=$('sky'), panel=$('album'), guide=$('guide'), viewer=$('viewer');
  const scene=new TreeScene(sky,$('greeting'),$('dock'));
  const colors={gold:'鎏金',ice:'冰蓝',rose:'玫瑰'};
  let theme='gold',photoIndex=0,gesturePhoto=false,noticeTimer=0,drag=null,albumReady=false;
  const icon=(name)=>{const node=document.createElementNS('http://www.w3.org/2000/svg','svg');node.setAttribute('class','icon');node.setAttribute('aria-hidden','true');const use=document.createElementNS(node.namespaceURI,'use');use.setAttribute('href','#i-'+name);node.append(use);return node;};
  function notify(message){
    const notice=$('notice'),top=viewer.open?viewer:panel.open?panel:guide.open?guide:document.body;
    top.append(notice);notice.textContent=message;notice.hidden=false;
    clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;},6500);
  }
  function chooseTheme(name,persist=true){
    if(!colors[name])return;
    theme=name;document.documentElement.dataset.theme=name;scene.setTheme(name);$('themeLabel').textContent=colors[name];
    for(const button of document.querySelectorAll('[data-color]')) button.setAttribute('aria-pressed',String(button.dataset.color===name));
    if(persist)try{localStorage.setItem('winter-orbit-theme',name);}catch{}
  }
  function updateHint(){
    const live=hand.phase==='live';
    $('actionHint').textContent=live?(scene.target?'移动手掌旋转 · 对准相框轻捏放大':'张开手掌散开星光 · 比 V 换色'):'拖动旋转 · 点击相框看照片';
  }
  function setSpread(open){
    scene.setSpread(open);const button=$('shapeButton');
    button.querySelector('span').textContent=open?'聚成树形':'散开星光';
    button.querySelector('use').setAttribute('href',open?'#i-tree':'#i-spark');
    updateHint();
  }
  function renderAlbum(){
    const grid=$('albumGrid'), personal=album.personal.length>0,photos=album.photos;
    grid.replaceChildren();
    photos.forEach((photo,index)=>{
      const cell=document.createElement('div');cell.className='tile';
      const button=document.createElement('button');button.className='thumbnail';button.setAttribute('aria-label','查看'+photo.name);
      const img=document.createElement('img');img.alt='';img.src=photo.src;
      const caption=document.createElement('span');caption.textContent=photo.name;
      button.append(img,caption);button.onclick=()=>openPhoto(index,'album');cell.append(button);
      if(personal){
        const remove=document.createElement('button');remove.className='icon-button remove-photo';remove.title='从树上移除';remove.setAttribute('aria-label','从树上移除'+photo.name);
        remove.append(icon('close'));remove.onclick=async()=>{
          const saved=await album.remove(index);
          if(saved===false)$('storageHint').textContent='已从本次相册移除，浏览器未保存这项更改。';
        };cell.append(remove);
      }
      grid.append(cell);
    });
    $('albumDescription').textContent=personal?'你的照片已挂在树上。点缩略图可以预览。':'现在挂着六张冬日明信片。导入照片，让它们挂上你的树。';
    $('albumCount').textContent=personal?photos.length+' / 24 张':'6 张冬日明信片';
    $('storageHint').textContent=album.db?'最多 24 张，保存在当前浏览器。':'最多 24 张。当前会话可以使用导入的照片。';
    $('importButton').disabled=!albumReady || album.busy || album.personal.length>=24;
    scene.setPhotos(photos);
  }
  const album=new Album(renderAlbum);
  function showPhotoContents(){
    const photos=album.photos,photo=photos[photoIndex];if(!photo)return;
    const large=$('largePhoto');large.src=photo.src;large.alt=photo.name;
    $('photoTitle').textContent=photo.name;$('photoNumber').textContent=String(photoIndex+1).padStart(2,'0')+' / '+String(photos.length).padStart(2,'0');
    $('prevPhoto').disabled=$('nextPhoto').disabled=photos.length<2;
  }
  function openPhoto(index,source,card=null){
    if(!album.photos[index]||viewer.open)return;
    photoIndex=index;gesturePhoto=source==='hand';scene.focused=true;
    $('handPointer').hidden=true;showPhotoContents();viewer.showModal();
    const back=source==='album'?'返回相册':'返回星空';$('backPhoto').textContent=back;$('closePhoto').setAttribute('aria-label',back);$('closePhoto').title=back;
    if(!scene.reduced){
      const frame=$('print'),rect=frame.getBoundingClientRect();
      const x=card?card.x-rect.left-rect.width/2:0,y=card?card.y-rect.top-rect.height/2:12;
      const size=card?Math.max(.09,Math.min(.65,card.w/rect.width)):.92;
      frame.animate([{opacity:.12,transform:'translate('+x+'px,'+y+'px) scale('+size+') rotate('+(card?card.angle:0)+'rad)'},
        {opacity:1,transform:'translate(0,0) scale(1) rotate(0)'}],{duration:460,easing:'cubic-bezier(.17,.78,.23,1)'});
    }
  }
  function closePhoto(){if(viewer.open)viewer.close();}
  viewer.addEventListener('close',()=>{scene.focused=panel.open||guide.open;gesturePhoto=false;});
  function stepPhoto(step){
    if(!viewer.open||!album.photos.length)return;
    photoIndex=(photoIndex+step+album.photos.length)%album.photos.length;showPhotoContents();
    if(!scene.reduced)$('print').animate([{opacity:.6},{opacity:1}],{duration:180});
  }
  function clearAim(){scene.aim=null;$('handPointer').hidden=true;}
  const cameraSelect=$('cameraSelect'),cameraRetry=$('cameraRetry'),cameraAdvice=$('cameraAdvice');
  function showCameraAdvice(text){
    cameraAdvice.textContent=text;cameraAdvice.hidden=!text;
  }
  const hand=new HandControl({
    video:$('cameraVideo'),skeleton:$('skeleton'),status:$('cameraStatus'),
    onState(phase){
      const live=phase==='live',off=phase==='off',button=$('cameraButton');
      const pending=!live&&!off;
      $('cameraView').hidden=off || phase==='asking';button.setAttribute('aria-pressed',String(!off));
      cameraSelect.disabled=pending||cameraSelect.options.length<2;cameraRetry.disabled=pending;
      if(phase==='connecting')$('cameraStatus').textContent='正在等待画面';
      if(phase==='loading')$('cameraStatus').textContent='加载手势模型';
      button.querySelector('span').textContent={off:'开启手势',asking:'取消连接',connecting:'取消连接',loading:'取消加载',live:'关闭手势'}[phase];
      $('modeStatus').classList.toggle('live',live);
      $('modeStatus').querySelector('span').textContent={off:'手动模式',asking:'请求摄像头',connecting:'等待摄像头画面',loading:'加载本地识别引擎',live:'手势模式'}[phase];
      updateHint();
    },
    onMove(point,dx,dy){
      if(panel.open||guide.open||viewer.open){clearAim();return;}
      const x=point.x*scene.w,y=point.y*scene.h;
      scene.aim={x,y};const cursor=$('handPointer');cursor.hidden=false;cursor.style.transform='translate('+x+'px,'+y+'px)';
      scene.rotate(dx*4.2,dy*.52);
    },
    onPose(pose,previous,pointer){
      if(panel.open||guide.open)return;
      if(gesturePhoto&&previous==='pinch'&&pose!=='pinch')closePhoto();
      if(viewer.open)return;
      if(pose==='open')setSpread(true);
      else if(pose==='fist')setSpread(false);
      else if(pose==='victory'){const keys=Object.keys(colors);chooseTheme(keys[(keys.indexOf(theme)+1)%keys.length]);}
      else if(pose==='pinch'&&scene.target===1){
        const card=scene.nearest(pointer.x*scene.w,pointer.y*scene.h);if(card)openPhoto(card.index,'hand',card);
      }
    },
    onLost(){clearAim();if(gesturePhoto)closePhoto();},
    onDevices(devices,currentId,label){
      const options=devices.map((device,index)=>new Option(device.label||'摄像头 '+(index+1),device.deviceId));
      if(!options.some(option=>option.value===currentId))options.unshift(new Option(label||'浏览器默认',currentId));
      cameraSelect.replaceChildren(...options);cameraSelect.value=currentId;
      cameraSelect.disabled=hand.phase!=='live'||options.length<2;
      cameraSelect.title=cameraSelect.selectedOptions[0]?.textContent||'选择摄像头';
    },
    onSignal:showCameraAdvice,
    onError(message){
      $('cameraView').hidden=false;$('cameraStatus').textContent='摄像头未连接';
      cameraSelect.disabled=cameraSelect.options.length<2;cameraRetry.disabled=false;
      showCameraAdvice(message);notify(message);
    }
  });
  $('cameraButton').onclick=()=>hand.phase==='off'?hand.start():hand.stop();
  cameraSelect.onchange=()=>hand.reconnect(cameraSelect.value,true);
  cameraRetry.onclick=()=>hand.reconnect(cameraSelect.value);
  $('shapeButton').onclick=()=>setSpread(!scene.target);
  for(const button of document.querySelectorAll('[data-color]'))button.onclick=()=>chooseTheme(button.dataset.color);
  function openPanel(dialog){clearAim();scene.focused=true;dialog.showModal();}
  $('albumButton').onclick=()=>openPanel(panel);$('guideButton').onclick=()=>openPanel(guide);
  for(const dialog of [panel,guide]){
    dialog.querySelector('[data-dismiss]').onclick=()=>dialog.close();
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{scene.focused=viewer.open;});
  }
  const details=guide.querySelector('.credits');
  details.addEventListener('toggle',async()=>{
    if(!details.open||$('licenses').textContent)return;
    try{
      const texts=await Promise.all(['vision/LICENSE.txt','assets/GreatVibes-OFL.txt'].map(async name=>new TextDecoder().decode(await assets.bytes(name))));
      $('licenses').textContent='MediaPipe · Google LLC\n\n'+texts[0]+'\n\nGreat Vibes\n\n'+texts[1];
    }catch{ $('licenses').textContent='MediaPipe · Apache License 2.0\nGreat Vibes · SIL Open Font License 1.1'; }
  });
  $('importButton').onclick=()=>$('fileInput').click();
  $('fileInput').addEventListener('change',async event=>{
    const files=Array.from(event.target.files);event.target.value='';if(!files.length)return;
    $('importButton').disabled=true;$('importButton').querySelector('span').textContent='正在处理';
    try{
      const result=await album.add(files);if(!result)return;
      const summary=[];
      if(result.added)summary.push('已挂上 '+result.added+' 张照片');
      if(result.failed)summary.push(result.failed+' 张无法读取，可尝试 JPG 或 PNG');
      if(result.overLimit)summary.push('相册最多容纳 24 张');
      if(result.added&&!result.saved)summary.push('当前浏览器仅能保留到本次关闭前');
      $('storageHint').textContent=summary.join('。')+'。';
    }finally{$('importButton').querySelector('span').textContent='导入照片';}
  });
  $('prevPhoto').onclick=()=>stepPhoto(-1);$('nextPhoto').onclick=()=>stepPhoto(1);
  $('closePhoto').onclick=$('backPhoto').onclick=closePhoto;
  viewer.querySelector('.viewer-inner').onclick=event=>{if(event.target===event.currentTarget)closePhoto();};
  const fullscreen=$('fullButton');
  if(!document.fullscreenEnabled)fullscreen.hidden=true;
  fullscreen.onclick=async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch{notify('当前窗口无法进入全屏，可在独立浏览器窗口打开。');}
  };
  document.addEventListener('fullscreenchange',()=>{const label=document.fullscreenElement?'退出全屏':'全屏';fullscreen.title=label;fullscreen.setAttribute('aria-label',label);scene.resize();});
  sky.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0)return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false};
    sky.setPointerCapture(event.pointerId);scene.dragging=true;sky.classList.add('dragging');
  });
  sky.addEventListener('pointermove',event=>{
    if(!drag){sky.style.cursor=scene.nearest(event.clientX,event.clientY,true)?'pointer':'';return;}
    if(drag.id!==event.pointerId)return;
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>5)drag.moved=true;
    if(drag.moved)scene.rotate((event.clientX-drag.x)*.007,(event.clientY-drag.y)*.0017);
    drag.x=event.clientX;drag.y=event.clientY;
  });
  function release(event){
    if(!drag||drag.id!==event.pointerId)return;
    const tap=event.type==='pointerup'&&!drag.moved;drag=null;scene.dragging=false;sky.classList.remove('dragging');
    if(sky.hasPointerCapture(event.pointerId))sky.releasePointerCapture(event.pointerId);
    if(tap){const card=scene.nearest(event.clientX,event.clientY,true);if(card)openPhoto(card.index,'pointer',card);}
  }
  sky.addEventListener('pointerup',release);sky.addEventListener('pointercancel',release);sky.addEventListener('lostpointercapture',release);
  document.addEventListener('keydown',event=>{
    if(event.altKey||event.metaKey||event.ctrlKey)return;
    if(viewer.open){if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();stepPhoto(event.key==='ArrowLeft'?-1:1);}return;}
    if(guide.open||panel.open)return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();scene.rotate(event.key==='ArrowLeft'?-.25:.25);}
    if(event.code==='Space'&&!event.repeat && !event.target.closest('button,input,summary')){event.preventDefault();setSpread(!scene.target);}
    if(event.key==='Escape')setSpread(false);
  });
  window.addEventListener('pagehide',()=>hand.stop());
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&hand.phase==='live')hand.resetHand();});
  try{chooseTheme(localStorage.getItem('winter-orbit-theme')||'gold',false);}catch{chooseTheme('gold',false);}
  album.init().then(()=>{albumReady=true;renderAlbum();}).catch(()=>notify('相册读取失败，请重新打开完整成品。'));
})();
