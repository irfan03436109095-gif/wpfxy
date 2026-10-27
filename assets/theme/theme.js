/* 主题交互与 Artalk 接入不依赖外部字体或公共脚本 CDN。 */
(() => {
  document.documentElement.dataset.colorMode="dark";
  document.documentElement.classList.add("dark");
  setupMobileNavigation();
  // 页头页脚始终留在视口中，首页、列表和文章仅滚动中间的内容容器。
  // 保留 article-scroll 回退，兼容使用旧文章模板的自定义主题。
  const pageScroll =
    document.querySelector(".page-scroll") || document.querySelector(".article-scroll");
  const articleScroll = document.querySelector(".article-scroll");
  const backToTop = document.getElementById("back-to-top");
  if (pageScroll) {
    // 页头、页脚会随菜单和友链换行而改变高度，侧栏使用真实正文视口而非估算值。
    // 只观察尺寸变化；滚动悬停由 CSS 完成，不在每次滚动时重新计算布局。
    const updateReadingHeight = () => {
      const height = `${pageScroll.clientHeight}px`;
      pageScroll.style.setProperty("--page-scroll-height", height);
      pageScroll.style.setProperty("--article-scroll-height", height);
    };
    updateReadingHeight();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(updateReadingHeight);
      observer.observe(pageScroll);
    } else {
      window.addEventListener("resize", updateReadingHeight);
    }
    window.addEventListener("pageshow", updateReadingHeight);
  }
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
