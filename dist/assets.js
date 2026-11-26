(() => {
  'use strict';
  const urls = new Map();
  const namespace = window.WinterOrbit = {};
  const embedded = name => document.getElementById('asset:' + name);
  const decompress = async element => {
    const encoded = atob(element.textContent.trim());
    const bytes = Uint8Array.from(encoded, character => character.charCodeAt(0));
    if (!element.hasAttribute('data-gzip')) return bytes;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  namespace.assets = {
    photoURL(name) {
      const element = embedded(name);
      return element ? 'data:image/jpeg;base64,' + element.textContent.trim() : './' + name;
    },
    async url(name, type) {
      const element = embedded(name);
      if (!element) return new URL(name, document.baseURI).href;
      if (!urls.has(name)) {
        const bytes = await decompress(element);
        urls.set(name, URL.createObjectURL(new Blob([bytes], {type})));
      }
      return urls.get(name);
    },
    async bytes(name) {
      const element = embedded(name);
      if (element) return decompress(element);
      const response = await fetch(new URL(name, document.baseURI));
      if (!response.ok) throw new Error('资源读取失败');
      return new Uint8Array(await response.arrayBuffer());
    }
  };
})();
