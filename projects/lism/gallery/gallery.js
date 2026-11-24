import catalog from "./selection.json";

const wall = document.querySelector("main");
const dialog = document.querySelector("dialog");
const cross = document.querySelector(".cross");
const [subjectFlap, conditionFlap] = cross.querySelectorAll(".flap");
const mobile = matchMedia("(max-width: 650px)");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const images = [...catalog];
for (let i = images.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [images[i], images[j]] = [images[j], images[i]];
}
// Separate repeated generations of the same request in nearby wall tiles.
const requestKey = s => JSON.stringify([s.task, s.subject, s.request]);
const recent = [];
for (let i = 0; i < images.length; i++) {
  for (let j = i; j < images.length; j++) {
    if (!recent.includes(requestKey(images[j]))) {
      [images[i], images[j]] = [images[j], images[i]];
      break;
    }
  }
  recent.push(requestKey(images[i]));
  if (recent.length > 12) recent.shift();
}

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

function photo(sample, lazy, priority = "auto") {
  const button = document.createElement("button");
  button.className = "photo";
  const base = "/projects/lism/" + sample.task + "/";
  const image = new Image(256, 256);
  image.loading = lazy ? "lazy" : "eager";
  image.alt = [sample.subject, sample.task, sample.request].join(" · ");
  image.fetchPriority = priority;
  image.src = base + sample.file;
  if (lazy) {
    image.className = "fade";
    const show = () => image.classList.add("loaded");
    if (image.complete) show();
    else image.onload = image.onerror = show;
  }
  button.append(image);
  if (sample.task === "foreground" || sample.task === "keypoints") {
    const overlay = new Image(256, 256);
    overlay.loading = image.loading;
    overlay.className = "overlay";
    overlay.alt = "";
    overlay.src = base + sample.request + ".svg";
    button.append(overlay);
  }
  const caption = document.createElement("span");
  caption.className = "caption";
  const subject = capitalize(sample.subject);
  const captions = {
    attributes: `Attribute: ${sample.request}, ${subject}`,
    keypoints: `Keypoints, ${subject}`,
    foreground: `Foreground, ${subject}`,
    class: `Class: ${subject}`,
  };
  caption.textContent = captions[sample.task];
  button.setAttribute("aria-label", caption.textContent);
  button.append(caption);
  return button;
}

const wallPhotos = new Map();
// settling: the step being animated; pending: one step queued behind it; leaving: the close animation.
let selected, opener, drag, settling = null, pending = null, leaving = false, closing = false, neighbors = new Map();
let settleToken = 0;
function layoutWall() {
  const columns = Array.from({ length: mobile.matches ? 2 : 4 }, () => {
    const column = document.createElement("div");
    column.className = "column";
    return column;
  });
  images.forEach((sample, i) => {
    const tile = photo(sample, true);
    const key = sample.task + "/" + sample.file;
    wallPhotos.set(key, { sample, tile });
    tile.onclick = () => {
      history.pushState({ lismPhoto: key }, "");
      openCross(sample, tile);
    };
    columns[i % columns.length].append(tile);
    if (dialog.open && sample === opener?.sample) opener.tile = tile;
  });
  wall.replaceChildren(...columns);
}
layoutWall();
mobile.addEventListener("change", layoutWall);

// Interleave different requests along a row and different subjects down a column.
function axis(field, alternate) {
  const buckets = new Map();
  for (const s of images) {
    if (s.task !== selected.task || s[field] !== selected[field]) continue;
    if (!buckets.has(s[alternate])) buckets.set(s[alternate], []);
    buckets.get(s[alternate]).push(s);
  }
  // Each foreground mask has one class. Keep one stop per mask on its subject row.
  if (selected.task === "foreground" && field === "subject") {
    return [...buckets].map(([mask, samples]) => mask === selected.request ? selected : samples[0]);
  }
  const result = [];
  for (let i = 0; ; i++) {
    const round = [...buckets.values()].filter(group => i < group.length);
    if (!round.length) return result;
    for (const group of round) result.push(group[i]);
  }
}
const flapStates = new WeakMap();
const span = (className, text = "") => {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  element.setAttribute("aria-hidden", "true");
  return element;
};
// Drop one card: the leaf carrying the top of `from` falls to show `to`. Resolves when it has landed.
function dropCard(block, state, from, to, quick) {
  const upper = span("flap-label new-upper", to);
  const lower = span("flap-label old-lower", from);
  const shadow = span("flap-shadow");
  lower.append(shadow);
  const leaf = span("flap-leaf");
  leaf.dataset.front = from;
  leaf.dataset.back = to;
  const front = span("flap-glare front"), back = span("flap-glare back");
  leaf.append(span("flap-rim"), front, back);
  block.append(upper, lower, leaf);
  const angle = degrees => ({ transform: `rotateX(${degrees}deg)` });
  // The leaf falls under its own weight, speeding up until it hits the stop at `land`, then bounces twice.
  const duration = 480, land = .62, fall = "cubic-bezier(.11, 0, .5, 0)";
  const bounce = [
    { offset: land, easing: "ease-out" },
    { offset: .73, easing: "ease-in" },
    { offset: .84, easing: "ease-out" },
    { offset: .91, easing: "ease-in" },
    { offset: 1 },
  ];
  const frames = (start, values) => [{ ...start, easing: fall }, ...bounce.map((frame, i) => ({ ...frame, ...values[i] }))];
  const falling = leaf.animate(frames(angle(0), [-180, -173, -180, -178, -180].map(angle)), { duration, fill: "forwards" });
  state.animations = [
    falling,
    shadow.animate([
      { transform: "scaleY(0)", opacity: 0, easing: fall },
      { transform: "scaleY(1)", opacity: 1, offset: land, easing: "steps(1, start)" },
      { transform: "scaleY(1)", opacity: 0 },
    ], { duration }),
    // Each side is lit most when edge-on. Opacity clamps at 1, so 0 to 2 reaches full light at 90 degrees.
    front.animate([{ opacity: 0, easing: fall }, { opacity: 2, offset: land }, { opacity: 2 }], { duration }),
    back.animate(frames({ opacity: 2 }, [0, .12, 0, .04, 0].map(opacity => ({ opacity }))), { duration }),
  ];
  if (quick) for (const animation of state.animations) animation.playbackRate = 1.6;
  return new Promise(resolve => {
    falling.onfinish = () => {
      upper.remove();
      lower.remove();
      leaf.remove();
      resolve();
    };
  });
}
// One card per change. A label that changes mid-flight does not restart the flip: the card in the
// air finishes fast and one quick card follows with the newest label.
async function runFlap(block, state) {
  const token = ++state.token;
  state.running = true;
  block.classList.add("flipping");
  let hurried = false;
  while (state.shown !== state.target) {
    hurried ||= state.hurry;
    state.hurry = false;
    const to = state.target;
    await dropCard(block, state, state.shown, to, hurried);
    if (token !== state.token) return;
    state.shown = to;
  }
  state.running = state.hurry = false;
  block.classList.remove("flipping");
}
function setFlap(block, value, flip) {
  let state = flapStates.get(block);
  if (!state) {
    state = { face: document.createElement("span"), shown: null, target: null, token: 0, running: false, hurry: false, animations: [] };
    state.face.className = "flap-label";
    flapStates.set(block, state);
  }
  if (flip && value === state.target) return;
  // The real label always holds the final text, for screen readers; the cards are decoration over it.
  state.face.textContent = value;
  state.target = value;
  if (!flip || reduceMotion.matches || state.shown === null) {
    state.token++;
    state.running = state.hurry = false;
    state.shown = value;
    block.replaceChildren(state.face);
    block.classList.remove("flipping");
    return;
  }
  if (state.running) {
    state.hurry = true;
    for (const animation of state.animations) animation.updatePlaybackRate(2.5);
    return;
  }
  if (state.shown !== value) runFlap(block, state);
}

const subjectLabel = sample => capitalize(sample.subject);
const conditionLabel = sample => ({
  attributes: capitalize(sample.request),
  foreground: "Mask " + sample.request,
  keypoints: capitalize(sample.request).replace("_", " pose "),
  class: "Class only",
})[sample.task];
function updateFlaps(sample, flip) {
  setFlap(subjectFlap, subjectLabel(sample), flip);
  setFlap(conditionFlap, conditionLabel(sample), flip);
}

const FADE = "opacity 150ms ease-out";
function renderCross(flip = false) {
  const previous = [...neighbors.values()];
  neighbors = new Map();
  function place(sample, x, y) {
    const key = [x,y].join(",");
    const immediate = Math.abs(x) + Math.abs(y) <= 1;
    const index = previous.findIndex(entry => entry.sample === sample);
    const existing = index >= 0 ? previous.splice(index, 1)[0] : null;
    const tile = existing?.tile ?? photo(sample, false, immediate ? "high" : "auto");
    tile.style.transition = FADE;
    tile.style.opacity = "";
    if (immediate && (!existing || Math.abs(existing.x) + Math.abs(existing.y) > 1)) {
      tile.firstElementChild.fetchPriority = "high";
      // Prepare the actual tile images before the next gesture.
      for (const image of tile.querySelectorAll("img")) image.decode().catch(() => {});
    }
    tile.style.setProperty("--x", x);
    tile.style.setProperty("--y", y);
    tile.classList.toggle("neighbor", Boolean(x || y));
    if (x || y) tile.classList.remove("show-overlay");
    tile.onclick = event => {
      if (event.detail === 0 && (x || y)) move(x,y);
    };
    neighbors.set(key, { sample, tile, x, y });
    if (!existing) {
      cross.append(tile);
      if (flip && !reduceMotion.matches) tile.animate([{ opacity: 0 }, {}], { duration: 180, easing: "ease-out" });
    }
  }
  place(selected, 0, 0);
  const center = neighbors.get("0,0").tile;
  updateFlaps(selected, flip);
  if (cross.contains(document.activeElement)) center.focus({ preventScroll: true });
  for (const horizontal of [true, false]) {
    if (!horizontal && selected.task === "class") continue;
    const line = horizontal ? axis("subject", "request") : axis("request", "subject");
    const index = line.indexOf(selected);
    const reach = Math.ceil((horizontal ? innerWidth : innerHeight) / (2 * cross.offsetWidth));
    for (let step = -reach; step <= reach; step++) {
      if (step && line[index + step]) place(line[index + step], horizontal ? step : 0, horizontal ? 0 : step);
    }
  }
  for (const { tile } of previous) tile.remove();
}
function openCross(sample, tile) {
  selected = sample;
  opener = { sample, tile };
  const start = tile.getBoundingClientRect();
  dialog.showModal();
  renderCross();
  const center = neighbors.get("0,0").tile;
  const end = center.getBoundingClientRect();
  if (reduceMotion.matches) return;
  const timing = { duration: 230, easing: "ease-out" };
  center.style.zIndex = 1;
  center.animate([
    { transform: `translate(${start.x + start.width/2 - end.x - end.width/2}px, ${start.y + start.height/2 - end.y - end.height/2}px) scale(${start.width/end.width})` },
    { transform: "none" },
  ], timing).onfinish = () => { center.style.zIndex = ""; };
  // Everything else arrives with the tile instead of popping in.
  const arrive = [{ opacity: 0 }, {}];
  for (const n of neighbors.values()) if (n.tile !== center) n.tile.animate(arrive, timing);
  cross.querySelector(".viewer-caption").animate(arrive, timing);
}
function closeCross() {
  if (leaving) return;
  if (reduceMotion.matches) { dialog.close(); return; }
  leaving = true;
  settleToken++;
  settling = pending = drag = null;
  const center = neighbors.get("0,0").tile;
  const from = center.getBoundingClientRect();
  // Fly home only when the wall tile of the image on screen is where the reader can see it.
  const to = selected === opener?.sample && opener.tile.isConnected ? opener.tile.getBoundingClientRect() : null;
  const home = to && to.bottom > 0 && to.top < innerHeight;
  dialog.classList.add("leaving");
  center.style.zIndex = 1;
  const fly = center.animate([
    { transform: "none", opacity: 1 },
    home
      ? { transform: `translate(${to.x + to.width/2 - from.x - from.width/2}px, ${to.y + to.height/2 - from.y - from.height/2}px) scale(${to.width/from.width})`, opacity: 1 }
      : { transform: "scale(.92)", opacity: 0 },
  ], { duration: 200, easing: "ease-in-out", fill: "forwards" });
  fly.onfinish = () => {
    dialog.close();
    dialog.classList.remove("leaving");
    center.style.zIndex = "";
    fly.cancel();
    leaving = false;
    restoreViewer();
  };
}
function shiftTiles(horizontal, steps, duration) {
  for (const { tile,x,y } of neighbors.values()) {
    if (horizontal ? y : x) continue;
    tile.style.transition = (duration ? `${horizontal ? "left" : "top"} ${duration}ms ease-out, ` : "") + FADE;
    tile.style.setProperty(horizontal ? "--x" : "--y", (horizontal ? x : y) + steps);
  }
}
const pitch = () => cross.clientWidth + parseFloat(getComputedStyle(dialog).getPropertyValue("--gap"));
// Where the strip is right now, in steps, read back from the centre tile mid-transition.
function currentOffset(horizontal) {
  const style = getComputedStyle(neighbors.get("0,0").tile), p = pitch();
  let offset;
  if (horizontal) offset = parseFloat(style.left) / p;
  else {
    // Inverse of the `top` rule in gallery.css: the board sits in the first interval below the centre.
    const top = parseFloat(style.top), board = cross.clientHeight - cross.clientWidth;
    offset = top < 0 ? top / p : top <= p + board ? top / (p + board) : (top - board) / p;
  }
  return Math.max(-1, Math.min(1, offset || 0));
}
// A short nudge toward a direction that has nothing in it.
function bump(x, y) {
  if (reduceMotion.matches) return;
  for (const n of neighbors.values()) {
    if (x ? n.y : n.x) continue;
    n.tile.animate([
      { translate: "0 0" },
      { translate: `${-x * 14}px ${-y * 14}px`, offset: .4 },
      { translate: "0 0" },
    ], { duration: 220, easing: "ease-out" });
  }
}
// `from` is how far the strip already sits from rest, in steps, so a nearly finished drag settles quickly.
async function move(x, y, horizontal = Boolean(x), from = 0) {
  if (leaving || drag) return;
  if (settling) {
    if (x || y) pending = [x, y];
    return;
  }
  const next = x || y ? neighbors.get([x,y].join(",")) : null;
  if ((x || y) && !next) { bump(Math.sign(x), Math.sign(y)); return; }
  const target = next ? -(x || y) : 0;
  const duration = reduceMotion.matches ? 0 : Math.round(Math.max(70, Math.min(1, Math.abs(target - from)) * 160));
  const token = ++settleToken;
  settling = { horizontal };
  if (next) {
    // Hand over the centre during the slide, and let the other arm leave with it.
    for (const n of neighbors.values()) {
      n.tile.classList.toggle("neighbor", n !== next);
      if (horizontal ? n.y : n.x) n.tile.style.opacity = 0;
    }
    updateFlaps(next.sample, true);
  }
  shiftTiles(horizontal, target, duration);
  const originalOpener = opener;
  if (duration) await new Promise(resolve => setTimeout(resolve, duration));
  if (token !== settleToken || !dialog.open || opener !== originalOpener) return;
  if (next) selected = next.sample;
  renderCross(true);
  settling = null;
  if (pending) {
    const step = pending;
    pending = null;
    move(...step);
  }
}
function slotDirection(e) {
  const r = cross.getBoundingClientRect();
  if (e.clientY >= r.top && e.clientY <= r.top + r.width) return e.clientX < r.left ? [-1,0] : e.clientX > r.right ? [1,0] : null;
  if (e.clientX >= r.left && e.clientX <= r.right) return e.clientY < r.top ? [0,-1] : e.clientY > r.bottom ? [0,1] : null;
  return null;
}
cross.onpointerdown = e => {
  if (leaving || drag || e.button !== 0) return;
  const target = e.target.closest(".photo");
  if (!target) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, target, offset: 0, raw: 0, steps: 0, v: 0, p: 0, t: e.timeStamp };
  cross.setPointerCapture(e.pointerId);
};
cross.onpointermove = e => {
  if (drag?.id !== e.pointerId) return;
  if (!drag.moved) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.max(Math.abs(dx),Math.abs(dy)) <= 5) return;
    drag.moved = true;
    if (settling) {
      // Catch the strip mid-settle and carry on from where it is.
      drag.horizontal = settling.horizontal;
      drag.offset = currentOffset(drag.horizontal);
      drag.x = e.clientX;
      drag.y = e.clientY;
      settleToken++;
      settling = pending = null;
      for (const n of neighbors.values()) {
        n.tile.classList.toggle("neighbor", Boolean(n.x || n.y));
        n.tile.style.opacity = "";
      }
    } else drag.horizontal = Math.abs(dx) >= Math.abs(dy);
  }
  const delta = drag.horizontal ? e.clientX - drag.x : e.clientY - drag.y;
  const raw = drag.offset + delta / pitch();
  const step = -Math.sign(raw);
  const next = neighbors.get(drag.horizontal ? step + ",0" : "0," + step);
  drag.raw = raw;
  drag.steps = next ? Math.max(-1, Math.min(1, raw)) : raw * .12;
  const dt = e.timeStamp - drag.t;
  if (dt > 0) drag.v = .6 * (delta - drag.p) / dt + .4 * drag.v;
  drag.p = delta;
  drag.t = e.timeStamp;
  shiftTiles(drag.horizontal, drag.steps, 0);
};
function release(e, cancel) {
  if (drag?.id !== e.pointerId) return;
  const d = drag;
  drag = null;
  if (cross.hasPointerCapture(e.pointerId)) cross.releasePointerCapture(e.pointerId);
  if (!d.moved) {
    if (cancel) return;
    // A tap while the strip is still settling queues one more step toward the tapped side.
    if (settling) { pending = slotDirection(e); return; }
    const neighbor = [...neighbors.values()].find(n => n.tile === d.target);
    if (!neighbor) return;
    if (neighbor.x || neighbor.y) move(neighbor.x,neighbor.y);
    else if (neighbor.tile.querySelector(".overlay")) neighbor.tile.classList.toggle("show-overlay");
    return;
  }
  const distance = Math.abs(d.raw) * pitch();
  const far = distance > Math.min(48,cross.offsetWidth * .18);
  // A quick flick counts even when it is short.
  const flick = distance > 10 && Math.abs(d.v) > .5 && e.timeStamp - d.t < 90 && Math.sign(d.v) === Math.sign(d.raw);
  let step = !cancel && (far || flick) ? -Math.sign(d.raw) : 0;
  if (step && !neighbors.get(d.horizontal ? step + ",0" : "0," + step)) step = 0;
  move(d.horizontal ? step : 0,d.horizontal ? 0 : step,d.horizontal,d.steps);
}
cross.onpointerup = e => release(e,false);
cross.onpointercancel = e => release(e,true);
dialog.onkeydown = e => {
  const directions = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
  if (directions[e.key]) { e.preventDefault(); move(...directions[e.key]); }
};
function returnToWall() {
  if (closing) return;
  closing = true;
  history.back();
}
dialog.querySelector(".close").onclick = returnToWall;
let pressedBackdrop = false;
dialog.onpointerdown = e => { pressedBackdrop = e.target === dialog; };
dialog.onclick = e => { if (pressedBackdrop && e.target === dialog) returnToWall(); };
dialog.oncancel = e => { e.preventDefault(); returnToWall(); };
dialog.onclose = () => {
  closing = false;
  drag = settling = pending = null;
  leaving = false;
  opener?.tile.focus({preventScroll: true});
  opener = null;
};
function restoreViewer() {
  const entry = wallPhotos.get(history.state?.lismPhoto);
  if (entry && !dialog.open) openCross(entry.sample, entry.tile);
  if (!entry && dialog.open) closeCross();
}
window.addEventListener("popstate", restoreViewer);
restoreViewer();
