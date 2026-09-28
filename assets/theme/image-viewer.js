/* 九套主题共用 Viewer.js Modal mode；图库按打开时的页面内容创建，兼容异步评论图片。 */
(() => {
  if (typeof window.Viewer !== "function") return;

  const actionLabels = {
    mix: "关闭图片预览",
    "zoom-in": "放大",
    "zoom-out": "缩小",
    "one-to-one": "原始大小",
    reset: "重置图片",
    prev: "上一张",
    next: "下一张",
    "rotate-left": "向左旋转",
    "rotate-right": "向右旋转",
    "flip-horizontal": "水平翻转",
    "flip-vertical": "垂直翻转",
  };
  let viewer = null;
  let modal = null;
  let invoker = null;
  let currentImage = null;
  let sourceLink = null;
  let status = null;
  let imageTimeout;
  let images = [];

  // 排除弹窗自身和搜索弹窗内的图片，避免把缩略图再次加入图库。
  const isContentImage = (image) =>
    Boolean(
      (image.currentSrc || image.getAttribute("src")) &&
      !image.closest("dialog, .viewer-container, [data-ad-link]"),
    );

  function localize() {
    if (!modal) return;
    modal.querySelectorAll("[data-viewer-action]").forEach((button) => {
      const action = button.getAttribute("data-viewer-action");
      const index = Number(button.getAttribute("data-index"));
      const label =
        action === "view"
          ? `查看第 ${index + 1} 张图片${images[index]?.alt ? `：${images[index].alt}` : ""}`
          : actionLabels[action];
      if (!label) return;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      if (action === "view")
        button.querySelector("img").alt = images[index]?.alt || `第 ${index + 1} 张图片`;
    });
    modal.querySelector(".viewer-list").setAttribute("aria-label", "图片缩略图");
  }

  function updateSourceLink(source) {
    sourceLink.hidden = true;
    sourceLink.removeAttribute("href");
    const link =
      source.closest("a[href]") || source.closest(".banner-slide")?.querySelector(".banner-link");
    if (!link) return;
    try {
      const url = new URL(link.href, document.baseURI);
      if (url.protocol === "https:" || url.protocol === "http:") {
        sourceLink.href = url.href;
        sourceLink.hidden = false;
      }
    } catch {
      // 无效自定义链接不进入图片预览；图片仍可正常查看。
    }
  }

  function enlarge(source, trigger = source) {
    if (viewer || !isContentImage(source)) return false;
    images = Array.from(document.querySelectorAll("img")).filter(isContentImage);
    const index = images.indexOf(source);
    if (index < 0) return false;
    invoker = trigger;
    viewer = new window.Viewer(document.body, {
      inline: false,
      className: "theme-image-viewer",
      filter: isContentImage,
      url: (image) => image.currentSrc || image.src,
      // 放大的图片立即加载，不继承正文中的懒加载和响应式缩略图尺寸。
      inheritedAttributes: ["crossOrigin", "decoding", "referrerPolicy"],
      transition: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      navbar: { show: images.length > 1, size: "small", visibleItemCount: 7 },
      navigation: images.length > 1,
      toolbar: {
        zoomIn: true,
        zoomOut: true,
        oneToOne: true,
        reset: true,
        prev: images.length > 1,
        next: images.length > 1,
        rotateLeft: true,
        rotateRight: true,
        flipHorizontal: true,
        flipVertical: true,
      },
      title: () => currentImage?.alt || "图片预览",
      ready() {
        modal = document.querySelector(".theme-image-viewer");
        modal.setAttribute("data-pagefind-ignore", "");
        modal.setAttribute("aria-label", "图片预览");
        status = document.createElement("p");
        status.className = "image-viewer-status";
        status.setAttribute("role", "status");
        sourceLink = document.createElement("a");
        sourceLink.className = "image-source-link";
        sourceLink.textContent = "访问链接 ↗";
        sourceLink.target = "_blank";
        sourceLink.rel = "noopener noreferrer";
        sourceLink.hidden = true;
        const toolbar = modal.querySelector(".viewer-toolbar");
        toolbar.before(status, sourceLink);
        localize();
      },
      shown() {
        // 弹层始终有中文名称，不依赖尚未加载完成的图片说明。
        modal.removeAttribute("aria-labelledby");
      },
      view(event) {
        const { image, originalImage } = event.detail;
        const activeModal = modal;
        currentImage = originalImage;
        updateSourceLink(originalImage);
        localize();
        clearTimeout(imageTimeout);
        status.hidden = false;
        status.textContent = "正在加载图片…";
        image.alt = originalImage.alt || "图片预览";
        const failed = () => {
          if (modal !== activeModal || currentImage !== originalImage || !status) return;
          clearTimeout(imageTimeout);
          status.hidden = false;
          status.textContent = "图片暂时无法加载，请关闭后重试。";
        };
        image.addEventListener("error", failed, { once: true });
        if (image.complete && !image.naturalWidth) failed();
        else
          imageTimeout = setTimeout(() => {
            if (status && !status.hidden) status.textContent = "图片加载较慢，请稍候或关闭后重试。";
          }, 15000);
      },
      viewed() {
        clearTimeout(imageTimeout);
        status.hidden = true;
        localize();
      },
      hidden() {
        const trigger = invoker;
        dispose();
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      },
    });
    viewer.view(index);
    return true;
  }

  function dispose() {
    clearTimeout(imageTimeout);
    viewer?.destroy();
    viewer = modal = currentImage = sourceLink = status = invoker = null;
    images = [];
  }

  function findImage(target, event) {
    if (!(target instanceof Element) || target.closest("dialog, .viewer-container, [data-ad-link]")) return null;
    const direct = target.closest("img");
    if (direct) return direct;
    // 图片横幅的覆盖层点击放大，右下角“访问链接”继续单独跳转。
    if (target.matches(".banner-link")) {
      const slide = target.closest(".banner-slide");
      return (
        document
          .elementsFromPoint(event.clientX, event.clientY)
          .find((item) => item.matches("img") && slide.contains(item)) || slide.querySelector("img")
      );
    }
    return null;
  }

  document.addEventListener(
    "click",
    (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      const source = findImage(event.target, event);
      if (source && enlarge(source, event.target.closest(".banner-link") || source)) {
        event.preventDefault();
        // 只拦截正文图片这一次点击，保留 Viewer.js 自己的弹层操作。
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        (event.key === "Enter" || event.key === " ") &&
        event.target.matches("img.reader-zoomable")
      ) {
        if (enlarge(event.target)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }
    },
    true,
  );

  function prepareImage(image) {
    if (!isContentImage(image) || image.classList.contains("reader-zoomable")) return;
    image.classList.add("reader-zoomable");
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-haspopup", "dialog");
    image.setAttribute("aria-label", image.alt ? `放大图片：${image.alt}` : "放大图片");
    if (!image.title) image.title = "点击放大图片";
  }
  document.querySelectorAll("img").forEach(prepareImage);
  new MutationObserver((changes) => {
    for (const change of changes)
      for (const node of change.addedNodes) {
        if (node.nodeType !== 1 || node.closest("dialog, .viewer-container")) continue;
        if (node.matches("img")) prepareImage(node);
        node.querySelectorAll("img").forEach(prepareImage);
      }
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("pagehide", dispose);
})();
