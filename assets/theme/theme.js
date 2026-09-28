/* 主题交互与 Artalk 接入不依赖外部字体或公共脚本 CDN。 */
(() => {
  const root = document.documentElement;
  const toggle = document.getElementById("theme-mode");
  const status = document.getElementById("theme-mode-status");
  const system = matchMedia("(prefers-color-scheme: dark)");
  const modes = ["system", "light", "dark"];
  const labels = { system: "跟随系统", light: "明亮", dark: "暗黑" };
  const validMode = (value) => (modes.includes(value) ? value : "system");
  let mode = validMode(root.dataset.colorMode);
  const applyMode = () => {
    root.dataset.colorMode = mode;
    root.classList.toggle("dark", mode === "dark" || (mode === "system" && system.matches));
    if (toggle) {
      const next = modes[(modes.indexOf(mode) + 1) % modes.length];
      toggle.title = `${labels[mode]} · 点击切换为${labels[next]}`;
      toggle.setAttribute("aria-label", `明暗模式：${labels[mode]}，点击切换为${labels[next]}`);
    }
  };
  applyMode();
  // 原生按钮同时支持鼠标、触屏、回车及空格；单击按三种模式循环。
  toggle?.addEventListener("click", () => {
    mode = modes[(modes.indexOf(mode) + 1) % modes.length];
    applyMode();
    if (status) status.textContent = `已切换为${labels[mode]}`;
    try {
      localStorage.setItem("reader-theme", mode);
    } catch {
      /* 预览沙箱仍可在当前页面切换。 */
    }
  });
  // 手动选择时不被系统覆盖；跟随系统时实时更新，并同步同站点的其他标签页。
  if (system.addEventListener) system.addEventListener("change", applyMode);
  else system.addListener(applyMode);
  window.addEventListener("storage", (event) => {
    if (event.key === "reader-theme" || event.key === null) {
      mode = validMode(event.newValue);
      applyMode();
    }
  });
  setupMobileNavigation();
  // 文章使用独立滚动容器，不能滚动 window；按钮仅在正文下滑后出现。
  const articleScroll = document.querySelector(".article-scroll");
  const backToTop = document.getElementById("back-to-top");
  if (articleScroll && backToTop) {
    const updateBackToTop = () => {
      backToTop.hidden = articleScroll.scrollTop < 320;
    };
    articleScroll.addEventListener("scroll", updateBackToTop, { passive: true });
    window.addEventListener("resize", updateBackToTop);
    window.addEventListener("pageshow", updateBackToTop);
    backToTop.addEventListener("click", () => {
      // 遵循系统减少动态效果的偏好，并将键盘焦点交回正文。
      articleScroll.scrollTo({
        top: 0,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
      document.getElementById("main")?.focus({ preventScroll: true });
    });
    updateBackToTop();
  }
  document.querySelectorAll(".prose pre").forEach((block) => {
    const button = document.createElement("button");
    button.className = "code-copy";
    button.textContent = "复制";
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(block.querySelector("code")?.textContent || "");
        button.textContent = "已复制";
        setTimeout(() => {
          button.textContent = "复制";
        }, 1500);
      } catch {
        button.textContent = "请手动复制";
      }
    });
    block.append(button);
  });
  // 手机导航是普通链接组成的展开面板，保留浏览器原生的链接及 Tab 键行为。
  // 初始化成功后才收起导航，脚本不可用时仍能直接访问站点菜单。
  function setupMobileNavigation() {
    const button = document.getElementById("menu-toggle");
    const navigation = document.getElementById("site-navigation");
    const header = document.querySelector(".header-inner");
    if (!button || !navigation || !header) return;
    const mobile = matchMedia("(max-width: 760px)");
    let expanded = false;
    const setExpanded = (value) => {
      expanded = mobile.matches && value;
      navigation.classList.toggle("is-open", expanded);
      button.setAttribute("aria-expanded", String(expanded));
      const label = expanded ? "关闭菜单" : "打开菜单";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    };
    header.classList.add("navigation-ready");
    button.addEventListener("click", () => {
      setExpanded(!expanded);
      if (expanded) navigation.querySelector("a[href]")?.focus();
    });
    navigation.addEventListener("click", (event) => {
      if (event.target.closest("a[href]")) setExpanded(false);
    });
    const dismissOutside = (event) => {
      if (expanded && !navigation.contains(event.target) && !button.contains(event.target)) {
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", (event) => {
      if (expanded && event.key === "Escape") {
        setExpanded(false);
        button.focus();
        event.preventDefault();
      }
    });
    // 回退恢复页面及窗口跨越断点时清除旧状态，避免浮层意外保留。
    window.addEventListener("pageshow", () => setExpanded(false));
    mobile.addEventListener("change", () => {
      setExpanded(false);
      if (mobile.matches && navigation.contains(document.activeElement)) button.focus();
    });
  }
})();
