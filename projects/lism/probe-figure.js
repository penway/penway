import model from "./probe-model.json";
import density from "./probe-density.json";
import { trajectory } from "./probe-flow.js";

const panel = document.querySelector(".paper");
const svg = panel.querySelector("svg");
function shape(tag, attrs) {
  const el = document.createElementNS(svg.namespaceURI, tag);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key, value);
  svg.append(el);
  return el;
}

const project = ([x,y]) => [(x+2.8)*50, (2.65-y)*50];
// Filled density bands from the slide model, in the same coordinates as the samples.
const colors = { cats: "#bd4434", dogs: "#366498", source: "#77716b" };
for (const [group, bands] of Object.entries(density)) {
  bands.forEach((d, level) => shape("path", {
    d, transform: "matrix(50 0 0 -50 140 132.5)", fill: colors[group],
    "fill-rule": "evenodd", opacity: [0.09, 0.17, 0.28][level],
  }));
}
for (const [x,y,cat] of model.points) {
  const [cx,cy] = project([x,y]);
  shape("circle", {cx, cy, r: 1.7, fill: cat ? "#bd4434" : "#366498", opacity: 0.55});
}
const [wx,wy] = model.probe.A[0];
const boundary = y => project([-(wy*y+model.probe.b[0])/wx,y]);
const d = "M" + trajectory(model).map(project).join(" L");
shape("path", {d: "M"+boundary(-3.6)+" L"+boundary(2.65), stroke: "#888", "stroke-dasharray": "3 4"});
const [arrowX, arrowY] = boundary(0.65);
const angle = Math.atan2(-wy, wx) * 180 / Math.PI;
shape("path", {
  d: "M0 -1.2H22V-4L30 0L22 4V1.2H0Z",
  transform: `translate(${arrowX} ${arrowY}) rotate(${angle})`, fill: "#333",
});
shape("path", {d, fill: "none", stroke: "#ccc", "stroke-width": 2});
const trace = shape("path", {d, fill: "none", stroke: "#161616", "stroke-width": 3, pathLength: 1, "stroke-dasharray": 1});
const dot = shape("circle", {r: 4, fill: "#161616"});
const length = trace.getTotalLength();
function draw(progress) {
  trace.setAttribute("stroke-dashoffset", 1-progress);
  const point = trace.getPointAtLength(length*progress);
  dot.setAttribute("cx", point.x);
  dot.setAttribute("cy", point.y);
}

const motion = matchMedia("(prefers-reduced-motion: no-preference) and (hover: hover)");
let progress = 0, velocity = 0, target = 0, last = 0, raf = 0;
function tick(now) {
  // Critically damped motion keeps both position and speed continuous on reversal.
  const dt = (now-last)/1000;
  last = now;
  const error = progress-target, rate = 7;
  const slope = velocity + rate*error, decay = Math.exp(-rate*dt);
  progress = target + (error+slope*dt)*decay;
  velocity = (velocity-rate*slope*dt)*decay;
  if (Math.abs(progress-target)<0.0005 && Math.abs(velocity)<0.003) {
    progress = target;
    velocity = raf = 0;
    draw(progress);
  } else {
    draw(progress);
    raf = requestAnimationFrame(tick);
  }
}
function update() {
  target = panel.matches(":hover, :focus-visible") ? 1 : 0;
  if (!motion.matches) {
    cancelAnimationFrame(raf);
    raf = velocity = 0;
    draw(progress = 1);
  } else if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}
for (const event of ["pointerenter","pointerleave","focus","blur"]) panel.addEventListener(event,update);
motion.addEventListener("change",update);
update();
