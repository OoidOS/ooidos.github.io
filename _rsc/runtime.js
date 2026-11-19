// An island is a wrapper only: its content is what lays out.
if (!document.getElementById("sluurp-react-style")) {
  const style = document.createElement("style");
  style.id = "sluurp-react-style";
  style.textContent = "sluurp-react{display:contents}";
  document.head.append(style);
}
if (!customElements.get("sluurp-react")) customElements.define("sluurp-react", class extends HTMLElement {
  connectedCallback() {
    if (this.__mounted || this.__waiting) return;
    // When it wakes: at once, when scrolled near (`client="visible"`), when a media query holds
    // (`client="media:(min-width: 800px)"`), or never (`client="never"`: its markup is all there is).
    const when = this.getAttribute("client") || "";
    if (when === "never") return;
    const wake = () => {
      this.__waiting = null;
      this.wake();
    };
    // A wrapper has no box of its own (display: contents): what it holds is watched.
    const seen = this.firstElementChild;
    if (when === "visible" && seen && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((all) => all.some((e) => e.isIntersecting) && (io.disconnect(), wake()), { rootMargin: "200px" });
      io.observe(seen);
      this.__waiting = () => io.disconnect();
      return;
    }
    if (when.startsWith("media:")) {
      const query = matchMedia(when.slice("media:".length));
      if (!query.matches) {
        const change = () => query.matches && (query.removeEventListener("change", change), wake());
        query.addEventListener("change", change);
        this.__waiting = () => query.removeEventListener("change", change);
        return;
      }
    }
    this.wake();
  }
  wake() {
    const c = this.dataset.c;
    let loading = null;
    if (c) {
      const [file, name] = c.split("#");
      loading = import("/_rsc/" + file + ".js").then((m) => m.mount(this, name));
    } else {
      // An island (islands/<name>.tsx), as before.
      const island = this.dataset.island || this.getAttribute("src");
      if (island) loading = import("/_rsc/island-" + island + ".js").then((m) => m.mount(this));
    }
    if (!loading) return;
    // Live once mounted; a broken one keeps what it showed and says why, its neighbours untouched.
    this.__mounted = loading.then(
      (root) => (this.setAttribute("data-hydrated", ""), root),
      (error) => {
        this.setAttribute("data-island-error", String(error?.message ?? error));
        console.error(error);
      },
    );
  }
  disconnectedCallback() {
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.__waiting?.();
      this.__waiting = null;
      const mounted = this.__mounted;
      this.__mounted = null;
      Promise.resolve(mounted).then((root) => root?.unmount?.());
    });
  }
});
// In development: a client component's file changed, so it is mounted again with its module as it is now (the page
// around it is drawn again by the server, see the core's hot script; the others keep their state).
if (!window.__sluurpReactHot) {
  window.__sluurpReactHot = true;
  addEventListener("sluurp:changed", (e) => {
    const path = e.detail?.path || "";
    if (!/.(tsx|jsx|ts|js)$/.test(path)) return;
    const v = Date.now();
    for (const el of document.querySelectorAll("sluurp-react[data-c]")) {
      if (el.dataset.f !== path) continue;
      const [file, name] = el.dataset.c.split("#");
      Promise.resolve(el.__mounted).then((root) => {
        root?.unmount?.();
        el.__mounted = import("/_rsc/" + file + ".js?v=" + v).then((m) => m.mount(el, name, true));
      });
    }
    // Islands placed in markup (<sluurp-react src>), drawn only here: an island or a file it may import changed, so
    // each is mounted again from its bundle as it is now. Nothing else to do for a page the server did not draw.
    if (/^routes\//.test(path)) return;
    const placed = [...document.querySelectorAll("sluurp-react[src]:not([data-c]):not([data-island])")];
    for (const el of placed) {
      Promise.resolve(el.__mounted).then((root) => {
        root?.unmount?.();
        el.__mounted = import("/_rsc/island-" + el.getAttribute("src") + ".js?v=" + v).then((m) => m.mount(el));
      });
    }
    if (placed.length && !document.querySelector('meta[name="sluurp-rendered"]')) e.preventDefault();
  });
}