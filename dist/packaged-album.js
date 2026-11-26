(() => {
  'use strict';

  async function readPhoto(folder, entry) {
    const response = await fetch(new URL(encodeURIComponent(entry.file), folder));
    if (!response.ok) throw new Error('相册照片读取失败');
    const bytes = await response.arrayBuffer();
    const src = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(new Blob([bytes], {type: 'image/jpeg'}));
    });
    return {id: entry.id, name: entry.name, src};
  }

  window.WinterOrbit.loadPackagedAlbum = async function () {
    const embedded = document.getElementById('recording-album');
    if (embedded) return JSON.parse(embedded.textContent);

    const folder = new URL('./photos/', document.baseURI);
    const response = await fetch(new URL('album.json', folder));
    if (!response.ok) throw new Error('相册清单读取失败');
    const entries = await response.json();
    const photos = await Promise.all(entries.map(entry => readPhoto(folder, entry)));

    // The build script uses the same digest so an edited album gets its own local storage.
    const bytes = new TextEncoder().encode(JSON.stringify(photos));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const key = Array.from(digest.slice(0, 10), byte => byte.toString(16).padStart(2, '0')).join('');
    return {key, photos};
  };
})();
