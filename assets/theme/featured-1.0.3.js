/* 首页原文随静态模板输出；本地增强排版，无管理接口调用。 */
(() => {
  const source = document.querySelector('[data-feature-source]');
  if (!source || typeof window.markdownit !== 'function' || !window.DOMPurify?.isSupported) return;
  const original = source.textContent;
  const base = new URL(source.dataset.articleUrl, document.baseURI).href;
  const home = document.querySelector('.brand[href]')?.href || document.baseURI;
  const safeURL = (value, context = base, protocols = ['http:', 'https:']) => {
    try {
      if (!value?.trim()) return '';
      const url = new URL(value, context);
      return protocols.includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  const mediaURL = (value, context = base) => {
    const path = value?.trim().match(/^\/?assets\/media\/(.+)$/);
    return safeURL(path ? new URL('assets/media/' + path[1], home).href : value, context);
  };
  let publishedImages;
  function resolvePublishedImages() {
    if (publishedImages) return publishedImages;
    publishedImages = (async () => {
      // 仅在内部素材或图片失效时，从同源公开文章读取系统已解析的图片。
      if (location.origin === 'null' || new URL(base).origin !== location.origin) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(base, { credentials: 'omit', signal: controller.signal, headers: { Accept: 'text/html' } });
        if (!response.ok || new URL(response.url).origin !== location.origin) return [];
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const body = doc.querySelector('article[data-pagefind-body] > .prose');
        return body ? [...body.querySelectorAll('img')].map(img => ({ src: mediaURL(img.getAttribute('src'), response.url), alt: img.getAttribute('alt') || '' })) : [];
      } catch { return []; }
      finally { clearTimeout(timer); }
    })();
    return publishedImages;
  }
  try {
    const parser = window.markdownit({ html: true, linkify: false, typographer: false });
    const fragment = window.DOMPurify.sanitize(parser.render(original), {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_TAGS: ['p','br','hr','h1','h2','h3','h4','h5','h6','strong','em','b','i','s','del','blockquote','ul','ol','li','pre','code','a','img','figure','figcaption','table','thead','tbody','tfoot','tr','th','td','div','span','sup','sub','kbd','details','summary'],
      ALLOWED_ATTR: ['href','src','alt','title','width','height','start','colspan','rowspan','data-src','id'],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false
    });
    const anchors = new Map();
    let count = 0;
    fragment.querySelectorAll('[id],h1,h2,h3,h4,h5,h6').forEach(node => {
      const id = 'featured-section-' + (++count);
      if (node.id) anchors.set(node.id, id);
      anchors.set(node.textContent.trim().toLowerCase().replace(/\s+/g, '-'), id);
      node.id = id;
      if (/^H[1-6]$/.test(node.tagName)) {
        const heading = document.createElement('h' + Math.min(6, Math.max(3, Number(node.tagName[1]) + 1)));
        heading.id = id;
        heading.append(...node.childNodes);
        node.replaceWith(heading);
      }
    });
    fragment.querySelectorAll('a[href]').forEach(link => {
      const raw = link.getAttribute('href');
      let anchor = '';
      try { anchor = raw.startsWith('#') ? anchors.get(decodeURIComponent(raw.slice(1))) : ''; } catch {}
      if (anchor) { link.setAttribute('href', '#' + anchor); return; }
      const internal = /^\/(?:posts|p|categories|tags|search|page)(?:\/|$)/.test(raw) || raw === '/';
      const url = safeURL(internal ? new URL(raw.slice(1), home).href : raw, base, ['http:', 'https:', 'mailto:', 'tel:']);
      if (!url) { link.replaceWith(...link.childNodes); return; }
      link.href = url;
      const rel = new Set((link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
      ['noopener', 'noreferrer'].forEach(value => rel.add(value));
      if (/^(www\.)?(goflybit\.com|99ba\.net)$/i.test(new URL(url).hostname) && /(?:[?&])code=/.test(new URL(url).search + new URL(url).hash)) rel.add('sponsored');
      link.rel = [...rel].join(' ');
    });
    fragment.querySelectorAll('img').forEach((img, index) => {
      const direct = mediaURL(img.getAttribute('src') || img.getAttribute('data-src'));
      img.removeAttribute('data-src');
      const dimensions = {"0e818fe8-625a-4fb3-9821-9f299da49704.webp":[1672,941],"f3fc24ed-c5f9-460a-9b23-e7f0a3a3f27c.webp":[900,1638],"04cc35df-32c1-442f-8923-90ca6446b478.webp":[1536,1024],"5d84daad-92ce-47a4-ad9c-538f7fd61421.webp":[1536,1024],"94b543bb-008e-44f9-ac91-096c1afad063.png":[128,128],"a25ebe1e-fd45-42cc-b394-ea05b870f632.webp":[1536,1024],"5abbc11f-659d-4dff-a9be-7384b7c728af.webp":[900,1450],"633f5fbb-75d6-4961-8430-c8693f1397b8.webp":[1536,1024],"23239792-c02c-41c7-8a29-cb55b4d9d3d2.webp":[1600,1000],"794301c0-1d05-4353-8a82-63c3d14b90da.webp":[900,1638],"fc4e075a-5d8b-49a8-b1ea-ba2d3a89ad6a.webp":[1536,1024],"453210de-c2c2-48ea-8261-025ea9039d34.webp":[1536,1024],"b0d43bf8-b353-4c92-8924-a8ee3b031555.webp":[1536,1024],"abbce6ef-c0f6-4bb2-b591-2fa22abf29db.webp":[1672,941],"c68a8308-9811-4710-9e86-60036d77d925.webp":[900,1638],"c6b9c4f3-f703-4776-9b6b-32150c2afd65.webp":[900,1638],"2a9415c4-129a-4d61-9948-6e300094dfd6.webp":[1536,1024],"93309624-fbf3-4b51-bbe2-ebf3b49e5017.webp":[1600,1000],"0d1d0c77-35ec-4f97-b14a-e29281ac4a48.webp":[900,1394],"16a67006-cabd-43ff-b116-fd24fb8773bb.png":[1672,941],"223d7124-d733-4570-af32-5d65c94d4b8c.png":[900,1638],"2a19a852-b15d-40e7-ad5e-c719b4f81b7e.png":[1536,1024],"48af0ab4-25b6-477e-b761-3c11f750f108.png":[1536,1024],"4bf82c49-08d9-433f-91f4-206c92d3c8fa.png":[128,128],"5305aaf5-69b2-4c4b-8089-0b74df330999.png":[1536,1024],"55eaf9ee-bfa1-49b0-a029-3f486606cc03.png":[900,1450],"6c9865b5-e0c6-4437-a983-c2cbabe3a8b0.png":[1536,1024],"7fccd520-0f8d-4524-be25-008f0ec796d9.png":[1600,1000],"9350516c-0ac2-4b5f-a0ef-41507de2eaca.png":[900,1638],"94ec45ce-c4c5-4b61-ad37-3ccda25f0eed.png":[1536,1024],"974e7f2a-b06a-42bf-a42e-9929456bfc47.png":[1536,1024],"b6b65920-9f48-4ffe-ae90-507e582d271f.png":[1536,1024],"bb3bde56-b9a4-4a10-aa84-ad6a31b52686.png":[1672,941],"c744e463-9104-4b7c-8928-17ef47d292c0.png":[900,1638],"cba6cc05-ee47-459b-b4bc-74a48b2667e7.png":[900,1638],"d9b761b1-c7f4-45a0-b202-a55aa5a21c61.png":[1536,1024],"dc0705e7-ef21-4f81-a505-c84a2b936425.png":[1600,1000],"fc0c31e8-1078-4e36-82a5-7ee9a4772c68.png":[900,1394]};
      const size = dimensions[direct?.split('/').pop()];
      if (size) { img.width = size[0]; img.height = size[1]; }
      img.loading = index === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      let attempted = false;
      const unavailable = () => {
        const link = document.createElement('a');
        link.className = 'feature-image-fallback';
        link.href = base;
        link.textContent = (img.alt ? img.alt + ' · ' : '') + '查看原文图片';
        img.replaceWith(link);
      };
      const recover = async () => {
        if (attempted) { unavailable(); return; }
        attempted = true;
        const images = await resolvePublishedImages();
        const matches = img.alt ? images.filter(item => item.alt === img.alt) : [];
        const candidate = matches.length === 1 ? matches[0] : images[index];
        if (candidate?.src && candidate.src !== direct) img.src = candidate.src;
        else unavailable();
      };
      img.addEventListener('error', recover);
      if (direct) img.src = direct;
      else { img.removeAttribute('src'); recover(); }
    });
    source.replaceChildren(fragment);
    source.classList.add('is-rendered');
    source.hidden = false;
  } catch {
    source.textContent = original;
    source.hidden = false;
  }
})();
