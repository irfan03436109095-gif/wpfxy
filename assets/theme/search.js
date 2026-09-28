// 首次打开弹窗时加载官方组件和索引；关闭后保留搜索词及结果，再次打开无需重载。
(() => {
  const dialog = document.getElementById("search-dialog");
  const ui = document.getElementById("site-search-ui");
  const status = document.getElementById("search-status");
  const retry = document.getElementById("search-retry");
  if (!dialog || !ui || !status || !retry) return;
  // 官方组件的模块加载错误会被浏览器缓存，重载搜索地址可完整恢复组件状态。
  retry.addEventListener("click", () =>
    location.assign(document.querySelector(".search-toggle").href),
  );
  let started = false;
  let queryTimeout;
  let failed = false;
  const showError = () => {
    failed = true;
    clearTimeout(queryTimeout);
    ui.hidden = true;
    status.textContent = "搜索暂时无法加载，请稍后重试。";
    status.hidden = false;
    retry.hidden = false;
  };
  const focusInput = () => {
    if (dialog.open) ui.querySelector("input")?.focus();
  };
  const loadStyles = () =>
    new Promise((resolve, reject) => {
      const style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = new URL(ui.dataset.stylesheet, document.baseURI).href;
      style.onload = resolve;
      style.onerror = reject;
      document.head.append(style);
    });
  const open = async () => {
    if (started) {
      if (!failed) focusInput();
      return;
    }
    started = true;
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("搜索组件加载超时")), 15000);
    });
    const initialize = async () => {
      // 沙箱中的经典脚本没有模块解析基址，显式转换为文档的完整地址。
      await Promise.all([loadStyles(), import(new URL(ui.dataset.module, document.baseURI).href)]);
      const instance = window.PagefindComponents.getInstanceManager().getInstance("default");
      instance.on("error", showError);
      await instance.triggerLoad();
      instance.on("loading", () => {
        clearTimeout(queryTimeout);
        queryTimeout = setTimeout(showError, 15000);
      });
      instance.on("results", () => clearTimeout(queryTimeout));
    };
    try {
      await Promise.race([initialize(), deadline]);
      if (failed) return;
      status.hidden = true;
      ui.hidden = false;
      focusInput();
    } catch {
      showError();
    } finally {
      clearTimeout(timeout);
    }
  };
  dialog.addEventListener("reader:open", open);
})();
