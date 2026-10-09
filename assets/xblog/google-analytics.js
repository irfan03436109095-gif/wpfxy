/* 仅在已绑定的公开站点采集，后台预览、localhost 与下载后的离线文件不加载 Google。 */
(() => {
  const script = document.querySelector("script[data-xblog-google-analytics]");
  if (!script || window.__xblogGoogleAnalytics) return;
  const id = script.getAttribute("data-xblog-google-analytics") || "";
  const hosts = (script.getAttribute("data-site-hosts") || "").split(",");
  if (
    !/^G-[A-Z0-9]{6,20}$/.test(id) ||
    !/^https?:$/.test(window.location.protocol) ||
    hosts.indexOf(window.location.hostname.toLowerCase()) === -1
  ) return;

  window.__xblogGoogleAnalytics = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", id);

  if (!document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]')) {
    const loader = document.createElement("script");
    loader.async = true;
    loader.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(loader);
  }
})();
