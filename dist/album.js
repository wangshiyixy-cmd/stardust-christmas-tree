(() => {
  'use strict';
  const names=['雪林木屋','枝头灯火','冬夜小街','日照雪峰','窗边暖意','极光之夜'];
  const MAX_PHOTOS=24;
  function loadImage(src) {
    return new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('图片无法解码'));image.src=src;
    });
  }
  function openStore(albumKey) {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('winter-orbit-recording-'+albumKey,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('album');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('相册暂时被占用'));
    });
  }
  function readOrSeedAlbum(db,initialPhotos){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('album','readwrite');
      const store=tx.objectStore('album'), read=store.get('photos');
      let records;
      read.onsuccess=()=>{
        records=read.result;
        if(records===undefined){
          records=initialPhotos;
          store.put(records,'photos');
        }
      };
      tx.oncomplete=()=>resolve(records);
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
  }
  async function resized(file) {
    const temporary=URL.createObjectURL(file);
    try{
      const image=await loadImage(temporary), ratio=Math.min(1,1440/Math.max(image.naturalWidth,image.naturalHeight));
      const surface=document.createElement('canvas');
      surface.width=Math.max(1,Math.round(image.naturalWidth*ratio));surface.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const g=surface.getContext('2d');g.fillStyle='#efe8d9';g.fillRect(0,0,surface.width,surface.height);g.drawImage(image,0,0,surface.width,surface.height);
      const src=surface.toDataURL('image/jpeg',.87);
      return {name:file.name.replace(/\.[^.]+$/u,'').slice(0,80)||'我的照片',src,image:await loadImage(src)};
    }finally{URL.revokeObjectURL(temporary);}
  }
  class Album {
    constructor(onChange){this.onChange=onChange;this.samples=[];this.personal=[];this.db=null;this.busy=false;}
    get photos(){return this.personal.length?this.personal:this.samples;}
    async init(){
      this.samples=await Promise.all(names.map(async(name,i)=>{
        const src=window.WinterOrbit.assets.photoURL('assets/winter-'+(i+1)+'.jpg');return {name,src,image:await loadImage(src)};
      }));
      const portableAlbum=await window.WinterOrbit.loadPackagedAlbum();
      let saved=portableAlbum.photos;
      try{
        this.db=await openStore(portableAlbum.key);
        saved=await readOrSeedAlbum(this.db,portableAlbum.photos);
      }catch{
        this.db?.close();this.db=null;
      }
      if(Array.isArray(saved)){
        const loaded=await Promise.allSettled(saved.slice(0,MAX_PHOTOS).map(async entry=>
          ({...entry,image:await loadImage(entry.src)})));
        this.personal=loaded.filter(item=>item.status==='fulfilled').map(item=>item.value);
      }
      this.onChange();
    }
    async edit(change,available){
      let records, saved=false;
      if(this.db){
        try{
          const db=this.db;
          records=await new Promise((resolve,reject)=>{
            const tx=db.transaction('album','readwrite'),store=tx.objectStore('album');
            const get=store.get('photos');let next;
            get.onsuccess=()=>{
              next=change(Array.isArray(get.result)?get.result:[]);
              store.put(next.map(({id,name,src})=>({id,name,src})),'photos');
            };
            tx.oncomplete=()=>resolve(next);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
          });
          saved=true;
        }catch{this.db.close();this.db=null;}
      }
      if(!records)records=change(this.personal);
      const cache=new Map(available.map(photo=>[photo.id||photo.src,photo]));
      this.personal=await Promise.all(records.map(async record=>
        cache.get(record.id||record.src)||{...record,image:await loadImage(record.src)}));
      return saved;
    }
    async add(files){
      if(this.busy)return null;
      this.busy=true;
      const additions=[];let failed=0,overLimit=0;
      try{
        for(const file of files){
          if(this.personal.length+additions.length>=MAX_PHOTOS){overLimit++;continue;}
          try{const photo=await resized(file);photo.id=crypto.randomUUID();additions.push(photo);}catch{failed++;}
        }
        const known=[...this.personal,...additions];
        const saved=additions.length?await this.edit(current=>[...current,...additions].slice(0,MAX_PHOTOS),known):Boolean(this.db);
        const retained=new Set(this.personal.map(photo=>photo.id));
        const added=additions.filter(photo=>retained.has(photo.id)).length;
        return {added,failed,overLimit:overLimit+additions.length-added,saved};
      }finally{this.busy=false;this.onChange();}
    }
    async remove(index){
      if(this.busy || !this.personal[index])return;
      this.busy=true;const selected=this.personal[index];
      try{
        return await this.edit(current=>{
          const position=current.findIndex(item=>selected.id?item.id===selected.id:item.src===selected.src);
          return position<0?current:current.filter((_,i)=>i!==position);
        },this.personal);
      }finally{this.busy=false;this.onChange();}
    }
  }
  window.WinterOrbit.Album=Album;
})();
