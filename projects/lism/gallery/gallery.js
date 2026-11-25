import catalog from "./selection.json";
import opening from "./featured.json";

const wall = document.querySelector("main");
const dialog = document.querySelector("dialog");
const cross = document.querySelector(".cross");
const [subjectFlap, conditionFlap] = cross.querySelectorAll(".flap");
// The column rule lives in index.html, shared with the arrival tile drawn there before this script runs.
const columnCount = window.lismWallColumns;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
// The wall order is random on each visit. With `?seed=`, it is that seed's order: the LiSM page gives the
// same seed to its hidden copy of this page and to the link it follows (composition.js), so the copy can
// load ahead of time the very images this visit will show first.
const seed = new URLSearchParams(location.search).get("seed");
let random = Math.random;
if (/^[a-z0-9]{1,12}$/.test(seed || "")) {
  let state = 0;
  for (const letter of seed) state = Math.imul(state ^ letter.charCodeAt(0), 2654435761) >>> 0;
  // mulberry32
  random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const images = [...catalog];
for (let i = images.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
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

// Keep the discovery axes independent of the opening-wall curation.
const picks = new Set(opening);
const first = images.filter(sample => picks.has(sample.task + "/" + sample.file));
const featured = new Set(first);
const wallOrder = first.concat(images.filter(s => !featured.has(s)));
// The starter: an attribute image, always among the first eight tiles (the top rows), which the wall
// hint points at. Its row changes only the attribute, the clearest first look at what LiSM does.
const firstAttribute = wallOrder.findIndex(s => s.task === "attributes");
if (firstAttribute >= 8) wallOrder.splice(Math.floor(random() * 8), 0, ...wallOrder.splice(firstAttribute, 1));
let starter = wallOrder.find(s => s.task === "attributes");

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

/* Teaching hints. Nothing is stored: they only track this page load, so a refresh starts over.
   The wall hint shows until an image is opened; the viewer's nudge and control strip show on each
   opening until the reader has made a few moves. */
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
const wallHint = document.querySelector(".hint");
const controls = document.querySelector(".controls");
const EXPLORED = 4;
let openedOnce = false, movesTotal = 0, movesThisOpen = 0, wallTouched = false;

/* Arriving from the LiSM page's grid (composition.js): the link names the grid image, its pose and its
   animal. That image joins the gallery as a keypoint sample of its pose and animal, so it sits in its
   pose's column with the same skeleton, and becomes the first tile of the wall and the starter. The LiSM
   page has already flown it to that tile's place, and index.html drew the tile there for the first frame;
   the wall adopts that tile. Nothing opens by itself: clicking the starter opens the viewer with its
   skeleton pinned. */
const arrivalTile = document.querySelector("main .photo.arrival");
// `?measure`: this page is the LiSM page's hidden probe (composition.js), which loads it ahead of time and
// reads where the header and the first tile are drawn at the reader's window size.
const measuring = new URLSearchParams(location.search).has("measure");
const entry = new URLSearchParams(location.search);
let arrival = null;
if (/^[a-z]+_\d{2}$/.test(entry.get("pose")) && /^[a-z]+$/.test(entry.get("subject")) && /^\d{4}$/.test(entry.get("image"))) {
  // The file is resolved against the keypoints folder (see photo()), hence the step up.
  arrival = { task: "keypoints", subject: entry.get("subject"), request: entry.get("pose"), file: "../composition/" + entry.get("image") + ".webp" };
  images.push(arrival);
  wallOrder.unshift(arrival);
  starter = arrival;
}
// A reload is a plain visit.
if (entry.has("pose") || (entry.has("seed") && !measuring)) history.replaceState(null, "", location.pathname);

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
let settleToken = 0, columnsShown = 0;
function layoutWall() {
  columnsShown = columnCount();
  const columns = Array.from({ length: columnsShown }, () => {
    const column = document.createElement("div");
    column.className = "column";
    return column;
  });
  wallOrder.forEach((sample, i) => {
    let tile = photo(sample, sample !== arrival, sample === arrival ? "high" : "auto");
    // The arriving image keeps the tile index.html drew for it, and its loaded image; it gains the rest.
    if (sample === arrival && arrivalTile) {
      if (!arrivalTile.hasAttribute("aria-label")) {
        arrivalTile.setAttribute("aria-label", tile.getAttribute("aria-label"));
        arrivalTile.append(...[...tile.children].slice(1));
      }
      tile = arrivalTile;
    }
    const key = sample.task + "/" + sample.file;
    wallPhotos.set(key, { sample, tile });
    tile.onclick = () => {
      history.pushState({ lismPhoto: key }, "");
      openCross(sample, tile, sample === arrival);
    };
    if (sample === starter && !openedOnce) {
      tile.classList.add("starter");
      tile.dataset.hint = (finePointer.matches ? "Click" : "Tap") + " to zoom in and explore.";
    }
    columns[i % columns.length].append(tile);
    if (dialog.open && sample === opener?.sample) opener.tile = tile;
  });
  wall.replaceChildren(...columns);
}
layoutWall();
addEventListener("resize", () => { if (columnCount() !== columnsShown) layoutWall(); });
// The wall images of the first screen (plus `extra` pixels below it), which are otherwise lazy.
function firstScreen(extra = 0) {
  const found = [];
  for (const { tile } of wallPhotos.values()) {
    if (tile === arrivalTile || tile.getBoundingClientRect().top >= innerHeight + extra) continue;
    const image = tile.firstElementChild;
    image.loading = "eager";
    found.push(image);
  }
  return found;
}
/* The first frame showed only what the LiSM page carried over; now the rest of the page fades in. The
   LiSM page's hidden copy has already downloaded the first screen's images, so wait (briefly) until they
   are ready to draw: the wall then fades in as finished pictures, in one piece. Any image that is still
   missing after the wait keeps its own fade for when it loads. */
let revealed = Promise.resolve();
if (document.documentElement.classList.contains("arriving")) {
  const eager = firstScreen();
  const ready = Promise.all(eager.map(image => image.decode().then(() => image.classList.remove("fade"), () => {})));
  revealed = (window.lismLanded || Promise.resolve())
    .then(() => Promise.race([ready, new Promise(resolve => setTimeout(resolve, 400))]))
    .then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.classList.remove("arriving");
      resolve();
    }))));
}
if (measuring) {
  // Download what the real visit will show first: the first screen and one more row, since the carried
  // image will push every tile along by one.
  firstScreen(wall.firstElementChild.firstElementChild.getBoundingClientRect().height + 6);
  window.lismLanding = () => {
    if (columnCount() !== columnsShown) layoutWall();
    const box = element => element.getBoundingClientRect().toJSON();
    const title = document.querySelector("h1");
    return {
      logo: box(document.querySelector("header img")),
      title: { ...box(title), fontSize: parseFloat(getComputedStyle(title).fontSize) },
      tile: box(wall.firstElementChild.firstElementChild),
    };
  };
}

// The wall hint: a line in the header and a ring on the starter tile, both until an image is opened.
// Once, shortly after load, a wave spreads across the tiles in view from the starter, and for a
// moment the other tiles dim while the starter shows its caption. Any interaction ends that early.
wallHint.textContent = finePointer.matches ? "Click any image to explore it" : "Tap an image to explore it";
wallHint.hidden = openedOnce;
const touchWall = () => { wallTouched = true; };
for (const type of ["pointerdown", "wheel", "keydown", "scroll"]) addEventListener(type, touchWall, { once: true, passive: true });
wall.addEventListener("pointerover", touchWall, { once: true });
// After an arrival, the wave waits until the page has faded in around the carried image.
if (!reduceMotion.matches && !measuring) revealed.then(() => setTimeout(rippleWall, 900));
function rippleWall() {
  if (wallTouched || openedOnce) return;
  const tiles = [...wall.querySelectorAll(".photo")].filter(tile => {
    const r = tile.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  });
  const peek = wall.querySelector(".starter");
  const centre = rect => [rect.left + rect.width / 2, rect.top + rect.height / 2];
  const [ox, oy] = peek ? centre(peek.getBoundingClientRect()) : [0, 0];
  const delay = tile => { const [x, y] = centre(tile.getBoundingClientRect()); return Math.hypot(x - ox, y - oy) * .25; };
  const waves = tiles.map(tile => tile.animate(
    [{}, { translate: "0 -6px", filter: "brightness(.9)", offset: .4 }, {}],
    { duration: 520, delay: delay(tile), easing: "ease-in-out" },
  ));
  const timers = [];
  if (peek && tiles.includes(peek)) {
    timers.push(setTimeout(() => { peek.classList.add("peek"); wall.classList.add("spotlight"); }, 300));
    timers.push(setTimeout(() => { peek.classList.remove("peek"); wall.classList.remove("spotlight"); }, 1800));
  }
  const stop = () => {
    for (const wave of waves) wave.cancel();
    for (const timer of timers) clearTimeout(timer);
    peek?.classList.remove("peek");
    wall.classList.remove("spotlight");
  };
  for (const type of ["pointerdown", "wheel", "keydown", "scroll"]) addEventListener(type, stop, { once: true, passive: true });
  wall.addEventListener("pointerover", stop, { once: true });
}

// The viewer's control strip. Arrows name the axes: sideways changes the request, up and down the subject.
function fillControls() {
  const key = text => `<kbd>${text}</kbd>`;
  controls.innerHTML = finePointer.matches
    ? `<span>${key("←")}${key("→")} request</span><span class="column-hint">${key("↑")}${key("↓")} subject</span><span>or drag, or scroll</span><span>${key("Esc")} close</span><span class="overlay-hint">click image: pin overlay</span>`
    : `<span>Swipe</span><span>↔ request</span><span class="column-hint">↕ subject</span><span class="overlay-hint">tap image: pin overlay</span>`;
}
// A first look at the board: it slides a little toward its neighbours and back.
// Sideways first, then up and down; arriving from the LiSM grid, up and down comes first: the pinned
// pose stays while another animal slides in under it, which is the grid's own example.
function nudge(uprightFirst = false) {
  if (!dialog.open || leaving || drag || settling || movesThisOpen) return;
  const sideways = neighbors.has("1,0") || neighbors.has("-1,0");
  const upright = neighbors.has("0,1") || neighbors.has("0,-1");
  const steps = [sideways && [1, 0], upright && [0, 1]].filter(Boolean);
  if (uprightFirst) steps.reverse();
  steps.forEach(([x, y], i) => setTimeout(() => {
    if (dialog.open && !leaving && !drag && !settling && !movesThisOpen) bump(x, y, 18, 420);
  }, i * 380));
}
function noteMove() {
  movesThisOpen++;
  movesTotal++;
  if (movesThisOpen >= 2) controls.classList.remove("shown");
}

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

/* The pin. Tapping the centre image pins its keypoints or mask to the board's centre slot instead of
   to the image. Up and down keep the request, so the overlay stays still while the images slide under
   it; sideways changes the request, so the overlay crossfades in place. It stays on until the centre
   is tapped again or the viewer closes, and waits out images that have no overlay. */
const pinLayer = document.createElement("div");
pinLayer.className = "pin-layer";
pinLayer.setAttribute("aria-hidden", "true");
cross.append(pinLayer);
let pinned = false;
const overlaySource = sample => sample.task === "foreground" || sample.task === "keypoints"
  ? "/projects/lism/" + sample.task + "/" + sample.request + ".svg"
  : null;
function showPin(sample) {
  const source = pinned ? overlaySource(sample) : null;
  const current = pinLayer.lastElementChild;
  if (current?.dataset.source === source || (!current && !source)) return;
  const fade = reduceMotion.matches ? 0 : 160;
  if (current) {
    current.animate([{}, { opacity: 0 }], { duration: fade, easing: "ease-in", fill: "forwards" }).onfinish = () => current.remove();
  }
  if (source) {
    const image = new Image(256, 256);
    image.alt = "";
    image.src = source;
    image.dataset.source = source;
    pinLayer.append(image);
    image.animate([{ opacity: 0 }, {}], { duration: fade, easing: "ease-out" });
  }
}
function togglePin() {
  if (!overlaySource(selected)) return;
  pinned = !pinned;
  cross.classList.toggle("pinned", pinned);
  showPin(selected);
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
    // Keyboard activation (a click with no pointer): a neighbour steps there, the centre toggles the pin.
    tile.onclick = event => {
      if (event.detail !== 0) return;
      if (x || y) move(x,y);
      else togglePin();
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
  // Class-only images have no column, so there is no subject axis to point out.
  const noColumn = selected.task === "class";
  cross.querySelector(".viewer-caption").classList.toggle("no-column", noColumn);
  controls.classList.toggle("no-column", noColumn);
  controls.classList.toggle("no-overlay", !overlaySource(selected));
  showPin(selected);
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
// `guided`: the image carried in from the LiSM grid. It opens with its skeleton pinned and nudges up
// and down first: the pose stays while another animal slides in under it, the grid's own example.
function openCross(sample, tile, guided = false) {
  selected = sample;
  opener = { sample, tile };
  const start = tile.getBoundingClientRect();
  dialog.showModal();
  if (guided && overlaySource(sample)) {
    pinned = true;
    cross.classList.add("pinned");
  }
  if (!openedOnce) {
    openedOnce = true;
    wallHint.hidden = true;
    wall.querySelector(".starter")?.classList.remove("starter");
    wall.classList.remove("spotlight");
  }
  movesThisOpen = 0;
  controls.classList.remove("shown");
  renderCross();
  const center = neighbors.get("0,0").tile;
  const end = center.getBoundingClientRect();
  if (movesTotal < EXPLORED) {
    fillControls();
    // After the opening flight lands: the strip fades in and the board shows that it slides.
    setTimeout(() => {
      if (dialog.open && !leaving && movesThisOpen < 2) controls.classList.add("shown");
    }, reduceMotion.matches ? 0 : 450);
    setTimeout(() => nudge(guided), 480);
  }
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
function bump(x, y, distance = 14, duration = 220) {
  if (reduceMotion.matches) return;
  for (const n of neighbors.values()) {
    if (x ? n.y : n.x) continue;
    n.tile.animate([
      { translate: "0 0" },
      { translate: `${-x * distance}px ${-y * distance}px`, offset: .4 },
      { translate: "0 0" },
    ], { duration, easing: "ease-out" });
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
    // A sideways step crossfades the pinned overlay while the images slide; up and down leave it be.
    showPin(next.sample);
  }
  shiftTiles(horizontal, target, duration);
  const originalOpener = opener;
  if (duration) await new Promise(resolve => setTimeout(resolve, duration));
  if (token !== settleToken || !dialog.open || opener !== originalOpener) return;
  if (next) {
    selected = next.sample;
    noteMove();
  }
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
    else togglePin();
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
/* Scrolling moves the board: vertical scroll up and down, horizontal scroll (a trackpad, a tilting
   wheel, or Shift with a wheel) sideways. A mouse wheel steps once per notch. A trackpad sends a long
   stream of small deltas with momentum, so it steps once per gesture: after a step the wheel is
   locked until the stream goes quiet. */
const wheel = { x: 0, y: 0, locked: false, quiet: 0 };
dialog.addEventListener("wheel", e => {
  e.preventDefault();
  if (leaving) return;
  const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1;
  let dx = e.deltaX * scale, dy = e.deltaY * scale;
  if (e.shiftKey && !dx) [dx, dy] = [dy, 0];
  clearTimeout(wheel.quiet);
  wheel.quiet = setTimeout(() => { wheel.locked = false; wheel.x = wheel.y = 0; }, 140);
  // Whole steps of 50px or more, or line/page units, are notches of a mouse wheel.
  const notch = e.deltaMode !== 0 || (Math.max(Math.abs(dx), Math.abs(dy)) >= 50 && Number.isInteger(dx) && Number.isInteger(dy));
  if (notch) {
    if (Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx), 0);
    else if (dy) move(0, Math.sign(dy));
    return;
  }
  if (wheel.locked) return;
  wheel.x += dx;
  wheel.y += dy;
  const threshold = 30;
  if (Math.max(Math.abs(wheel.x), Math.abs(wheel.y)) < threshold) return;
  wheel.locked = true;
  if (Math.abs(wheel.x) > Math.abs(wheel.y)) move(Math.sign(wheel.x), 0);
  else move(0, Math.sign(wheel.y));
  wheel.x = wheel.y = 0;
}, { passive: false });
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
  controls.classList.remove("shown");
  pinned = false;
  cross.classList.remove("pinned");
  pinLayer.replaceChildren();
  closing = false;
  drag = settling = pending = null;
  leaving = false;
  opener?.tile.focus({preventScroll: true});
  opener = null;
};
function restoreViewer() {
  const shown = wallPhotos.get(history.state?.lismPhoto);
  if (shown && !dialog.open) openCross(shown.sample, shown.tile, shown.sample === arrival);
  if (!shown && dialog.open) closeCross();
}
window.addEventListener("popstate", restoreViewer);
// The viewer never opens by itself: any load (a reload, or a remembered viewer entry) starts on the wall.
if (history.state?.lismPhoto) history.replaceState(null, "");
