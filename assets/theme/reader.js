/* 搜索弹窗统一管理焦点、滚动和拖动；图片预览由独立的 Viewer.js 接入模块负责。 */
(() => {
  const dialogs = [...document.querySelectorAll("dialog[data-reader-dialog]")];
  if (!dialogs.length || typeof dialogs[0].showModal !== "function") return;
  const invokers = new WeakMap();
  const syncScroll = () =>
    document.body.classList.toggle(
      "reader-modal-open",
      dialogs.some((item) => item.open),
    );
  function openDialog(dialog, invoker) {
    if (!dialog || dialog.open) return;
    dialogs.forEach((item) => {
      if (item.open) item.close();
    });
    invokers.set(dialog, invoker || document.activeElement);
    dialog.style.transform = "";
    dialog.showModal();
    syncScroll();
    dialog.dispatchEvent(new CustomEvent("reader:open"));
  }
  for (const dialog of dialogs) {
    dialog.addEventListener("close", () => {
      syncScroll();
      // 在关闭事件执行前可能已打开另一弹窗，不能把焦点移到其外部。
      const invoker = invokers.get(dialog);
      if (!dialogs.some((item) => item.open) && invoker?.isConnected)
        invoker.focus({ preventScroll: true });
    });
    let outsideStart = false;
    const outside = (event) => {
      const box = dialog.getBoundingClientRect();
      return (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      );
    };
    dialog.addEventListener("pointerdown", (event) => {
      outsideStart = event.target === dialog && outside(event);
    });
    dialog.addEventListener("click", (event) => {
      if (
        event.target.closest("[data-close-dialog]") ||
        (outsideStart && event.target === dialog && outside(event))
      )
        dialog.close();
      outsideStart = false;
    });
    makeDraggable(dialog);
  }
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-dialog]");
    if (
      !trigger ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    const dialog = document.getElementById(trigger.dataset.openDialog);
    if (!dialogs.includes(dialog)) return;
    event.preventDefault();
    openDialog(dialog, trigger);
  });

  function makeDraggable(dialog) {
    const handle = dialog.querySelector(".reader-dialog-header");
    if (!handle) return;
    let drag,
      offsetX = 0,
      offsetY = 0;
    dialog.addEventListener("reader:open", () => {
      offsetX = 0;
      offsetY = 0;
    });
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button, a, input, select")) return;
      drag = {
        x: event.clientX,
        y: event.clientY,
        box: dialog.getBoundingClientRect(),
        offsetX,
        offsetY,
      };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = Math.min(
        window.innerWidth - 8 - drag.box.right,
        Math.max(8 - drag.box.left, event.clientX - drag.x),
      );
      const dy = Math.min(
        window.innerHeight - 8 - drag.box.bottom,
        Math.max(8 - drag.box.top, event.clientY - drag.y),
      );
      offsetX = drag.offsetX + dx;
      offsetY = drag.offsetY + dy;
      dialog.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });
    const finish = () => {
      drag = null;
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    // 搜索结果或图片加载会改变弹窗尺寸，拖动后仍需保持标题和关闭按钮在窗口内。
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => {
        if (!dialog.open || drag || (!offsetX && !offsetY)) return;
        const box = dialog.getBoundingClientRect();
        offsetX += box.left < 8 ? 8 - box.left : Math.min(0, window.innerWidth - 8 - box.right);
        offsetY += box.top < 8 ? 8 - box.top : Math.min(0, window.innerHeight - 8 - box.bottom);
        dialog.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      }).observe(dialog);
    }
    window.addEventListener("resize", () => {
      finish();
      offsetX = 0;
      offsetY = 0;
      dialog.style.transform = "";
    });
  }

  // 兼容历史搜索地址和书签，正常入口始终在当前页面弹窗。
  const auto = dialogs.find((dialog) => dialog.hasAttribute("data-auto-open"));
  if (auto) openDialog(auto, document.querySelector(".search-toggle"));
})();
