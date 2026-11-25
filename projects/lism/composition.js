import rows from "./composition.json";

const grid = document.querySelector(".composition");
const assets = "/projects/lism/composition/";

for (const row of rows) {
  const skeleton = assets + row.pose + ".svg";
  // "tiger_01_cross_horse": the gallery calls the pose "tiger_01" (its request) and the animal its subject.
  const request = row.pose.split("_").slice(0, 2).join("_");
  row.images.forEach((id, n) => {
    const tile = document.createElement("span");
    tile.dataset.request = request;
    tile.dataset.subject = row.species;
    tile.dataset.n = n;
    tile.dataset.image = id;
    const photo = new Image();
    photo.alt = "";
    photo.src = assets + id + ".webp";
    const overlay = new Image();
    overlay.alt = "";
    overlay.className = "pose-overlay";
    overlay.src = skeleton;
    tile.append(photo, overlay);
    grid.append(tile);
  });
}

/* One continuous take into the gallery or the paper. Following a panel's link carries pieces of this page
   to where the next page draws them: the logo and the panel's title always, and for the gallery one grid
   image as well (the image that was clicked, or the top-left one for a click anywhere else in the panel),
   which joins the gallery as the first tile of its wall (gallery.js).

   The whole move happens here, before the page changes: the pieces fly to their places on the next page
   and everything else fades to white. Then the browser goes to that page, which draws exactly that frame
   first (gallery/index.html, paper/index.html) and fades the rest in. Waiting for the page to load is a
   still hold on the finished frame, not a freeze before the motion.

   To know where the next page draws things, this page loads it ahead of time in a hidden frame at the
   reader's window size and asks it (`?measure`). That also preloads the page's code and styles. If the
   frame is not ready, or the reader prefers less motion, the link just navigates. */
const logo = document.querySelector(".logo-stage img");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
let take = null;
// The gallery's wall order is random; this seed fixes it, so the hidden frame and the visit that follows
// build the same wall and the frame's downloaded images are the ones the visit shows first.
const seed = Math.random().toString(36).slice(2, 10) || "0";

const DURATION = 640, EASE = "cubic-bezier(.45, 0, .2, 1)";
function fly(layer, source, clone, to, scale) {
  const from = source.getBoundingClientRect();
  Object.assign(clone.style, {
    position: "absolute", left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px",
    margin: "0", transformOrigin: "0 0",
  });
  layer.append(clone);
  source.style.visibility = "hidden";
  const sx = scale ?? to.width / from.width, sy = scale ?? to.height / from.height;
  return clone.animate(
    [{ transform: "none" }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${sx}, ${sy})` }],
    { duration: DURATION, easing: EASE, fill: "forwards" },
  );
}
// `place` holds the next page's boxes: logo, and where it has them, title and tile.
function play({ image, title }, place) {
  const layer = document.createElement("div");
  Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "1000", pointerEvents: "none" });
  const veil = document.createElement("div");
  Object.assign(veil.style, { position: "absolute", inset: "0", background: "#fff" });
  layer.append(veil);
  document.body.append(layer);
  const sources = [];
  const animations = [veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION * .6, easing: "ease-out", fill: "forwards" })];

  if (image && place.tile) {
    animations.push(fly(layer, image, image.cloneNode(), place.tile));
    sources.push(image);
  }
  if (logo && place.logo) {
    animations.push(fly(layer, logo, logo.cloneNode(), place.logo));
    sources.push(logo);
  }
  if (title && place.title) {
    // The title is set again as plain text in the same type, scaled to the heading's size and centred
    // on its line, so its letters land on the heading's.
    const style = getComputedStyle(title);
    const text = document.createElement("div");
    text.textContent = title.textContent;
    for (const property of ["fontFamily", "fontWeight", "fontStyle", "fontSize", "letterSpacing", "lineHeight", "color"]) text.style[property] = style[property];
    text.style.whiteSpace = "nowrap";
    const size = parseFloat(style.fontSize), scale = place.title.fontSize / size;
    const line = parseFloat(style.lineHeight) || size * 1.2;
    const to = { left: place.title.left, top: place.title.top + (place.title.height - line * scale) / 2 };
    animations.push(fly(layer, title, text, to, scale));
    sources.push(title);
  }
  take = { layer, animations, sources };
  return Promise.all(animations.map(animation => animation.finished));
}

/* One panel's take. `measure` is the next page's address for the hidden frame; `carried` picks the grid
   image for a click, if the panel carries one; `href` gives the address to follow, for a plain visit
   (`taking` false) or for one that arrives on the finished frame. */
function route(link, { measure, carried, href }) {
  if (!link) return;
  const title = link.querySelector("h2");
  let probe = null;
  function warm() {
    if (probe) return;
    probe = document.createElement("iframe");
    probe.src = new URL(measure, location.href).href;
    probe.tabIndex = -1;
    probe.inert = true;
    probe.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, {
      position: "fixed", left: "-300vw", top: "0", border: "0", visibility: "hidden", pointerEvents: "none",
      width: innerWidth + "px", height: innerHeight + "px",
    });
    document.body.append(probe);
  }
  function landing() {
    try {
      if (!probe) return null;
      probe.style.width = innerWidth + "px";
      probe.style.height = innerHeight + "px";
      return probe.contentWindow?.lismLanding?.() ?? null;
    } catch { return null; }
  }
  // Load the next page in the background once this page has settled, or sooner if the reader heads for it.
  addEventListener("load", () => (window.requestIdleCallback || setTimeout)(warm, { timeout: 2500 }), { once: true });
  for (const type of ["pointerenter", "focusin", "touchstart"]) link.addEventListener(type, warm, { once: true, passive: true });

  link.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const tile = carried ? carried(event) : null;
    if (carried && !tile) return;
    link.href = href(tile, false);
    if (take || reduceMotion.matches) return;
    const place = landing();
    if (!place) return;
    event.preventDefault();
    const next = href(tile, true);
    play({ image: tile?.firstElementChild, title }, place).then(() => location.assign(next));
  });
}

route(grid.closest("a"), {
  measure: "./gallery/?measure&seed=" + seed,
  carried: event => event.target.closest(".composition > span") || grid.firstElementChild,
  href: tile => {
    const { request, subject, image } = tile.dataset;
    return `./gallery/?pose=${encodeURIComponent(request)}&subject=${encodeURIComponent(subject)}&image=${encodeURIComponent(image)}&seed=${seed}`;
  },
});
route(document.querySelector("a.paper"), {
  measure: "./paper/?measure",
  href: (_, taking) => taking ? "./paper/?from=lism" : "./paper/",
});

// Back from the next page restores this page as it was left: the finished frame. Play the take in reverse.
addEventListener("pageshow", event => {
  if (!event.persisted || !take) return;
  const { layer, animations, sources } = take;
  take = null;
  for (const animation of animations) animation.reverse();
  Promise.all(animations.map(animation => animation.finished)).finally(() => {
    layer.remove();
    for (const source of sources) source.style.visibility = "";
  });
});
