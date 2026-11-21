// LiSM logo geometry, lighting and timing from the Teaser X animation.
import * as THREE from 'three';

export function create(opts) {
  opts = opts || {};

  /* ---------- timing (seconds) ---------- */
  var SHIFT = 10;                 // tops start a quarter module to the right
  var T_IN = 0.08, T_HIT = 0.34;  // ball enters; ball meets the M's shoulder
  var DUR = 0.12;                 // one top piece's slide
  var TM = T_HIT + 0.034;
  // dominoes, right to left (M right, M middle, M left, S right, S left, L): the gaps shrink, so the row speeds up
  var ST = [0, 0.11, 0.2, 0.275, 0.335, 0.385].map(function (d) { return TM + d; });
  // three steps, with a pause between them; the speeds inside each step are unchanged
  var PAUSE = 0.1;
  var R0 = ST[5] + DUR + PAUSE, R1 = R0 + 0.92;   // step 2: the roll home, after the row has settled
  var LIGHT0 = R1 + PAUSE, END = LIGHT0 + 1.0;   // step 3: the light climbs overhead

  /* ---------- helpers ---------- */
  function seg(t, a, b) { return t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a); }
  function eo(x) { return 1 - Math.pow(1 - x, 3); }
  function eio(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function lerp(a, b, k) { return a + (b - a) * k; }

  /* ---------- fixed slit ends ---------- */
  function topPiece(left, right, bottom, leftSlit, rightSlit) {
    var path = 'M' + left + ' 0 H' + right;
    if (rightSlit) path += ' V10 A5 5 0 0 0 ' + (right - 5) + ' 15';
    path += ' V' + bottom;
    if (leftSlit) return path + ' H' + (left + 5) + ' V15 A5 5 0 0 0 ' + left + ' 10 Z';
    return path + ' H' + left + ' Z';
  }
  function bottomCap(right, bottom) {
    return 'V' + (bottom - 5) + ' A5 5 0 0 0 ' + right + ' ' + (bottom - 5);
  }

  /* ---------- the roll's speed, taken from the recording ----------
     ROLL[i] = fraction of the distance covered after i/96 of the roll. Speed is one smooth hump, v ~ u^1.5 (1-u)^1.9
     (fastest at 44% of the roll); the recording's loudness is reshaped to follow it (speed^0.7), so ball and sound agree. */
  var ROLL = [0.0, 8e-05, 0.00044, 0.00121, 0.00247, 0.00421, 0.00658, 0.00955, 0.01307, 0.01733, 0.02226, 0.02772, 0.03399, 0.04094, 0.04838, 0.05667, 0.06562, 0.07499, 0.08523, 0.09609, 0.10728, 0.11932, 0.13195, 0.1448, 0.15849, 0.17269, 0.18702, 0.20215, 0.21772, 0.23331, 0.24965, 0.26635, 0.28296, 0.30027, 0.31786, 0.33525, 0.35328, 0.37149, 0.38942, 0.4079, 0.42649, 0.44469, 0.46338, 0.48207, 0.50031, 0.51894, 0.5375, 0.55552, 0.57386, 0.59204, 0.60961, 0.62741, 0.64499, 0.6619, 0.67896, 0.69571, 0.71176, 0.72786, 0.74361, 0.75861, 0.77359, 0.78816, 0.80196, 0.81567, 0.82891, 0.84138, 0.85368, 0.86549, 0.87653, 0.88734, 0.89763, 0.90717, 0.91642, 0.92514, 0.93315, 0.94083, 0.94798, 0.95446, 0.96059, 0.9662, 0.9712, 0.97583, 0.97998, 0.98359, 0.98685, 0.98967, 0.99203, 0.99407, 0.99574, 0.99706, 0.9981, 0.99887, 0.9994, 0.99974, 0.99992, 0.99999, 1.0];
  function rollPos(u) {
    var x = Math.min(Math.max(u, 0), 1) * (ROLL.length - 1), i = Math.min(Math.floor(x), ROLL.length - 2);
    return lerp(ROLL[i], ROLL[i + 1], x - i);
  }

  /* ---------- the ball: a sphere seen from above ---------- */
  function nrm(v) { var n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; }
  var TAIL = nrm([0.76, 0.18, 0.62]), HEAD = nrm([-0.63, -0.18, 0.76]);
  var OM = Math.acos(TAIL[0] * HEAD[0] + TAIL[1] * HEAD[1] + TAIL[2] * HEAD[2]), SO = Math.sin(OM);
  var AX = nrm([TAIL[1] * HEAD[2] - TAIL[2] * HEAD[1], TAIL[2] * HEAD[0] - TAIL[0] * HEAD[2], TAIL[0] * HEAD[1] - TAIL[1] * HEAD[0]]);
  function onArc(u) {
    var a = Math.sin((1 - u) * OM) / SO, b = Math.sin(u * OM) / SO;
    return [a * TAIL[0] + b * HEAD[0], a * TAIL[1] + b * HEAD[1], a * TAIL[2] + b * HEAD[2]];
  }

  /* ---------- the 3D scene: a top-down orthographic view of a lit table ---------- */
  var HGT = 14;                                     // height of the blocks (they only show as shadows)
  var R = 20;                                       // ball radius
  var EL0 = 28 * Math.PI / 180, AZ = 135 * Math.PI / 180;   // the light: low, from the upper left, there from the start
  var CX = 195, CY = -80;                           // centre of the logo in world units (y is up here)
  var TOP_END = END - 0.05;                         // the light is fully overhead this long after the ball seats

  var renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setClearColor(0xffffff, 1);
  renderer.setPixelRatio(opts.pixelRatio || Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  var scene = new THREE.Scene();
  var cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000);
  cam.position.set(CX, CY, 1500); cam.lookAt(CX, CY, 0);
  var W = 1, H = 1, S = 1, curT = 0;
  // opts.centerY: where the logo's centre sits, as a share of the height from the top (default .5)
  var CY_FRAC = opts.centerY == null ? 0.5 : opts.centerY;
  function resize(w, h) {
    W = w; H = h; S = opts.markWidth() / 390;
    renderer.setSize(W, H, opts.setStyle !== false); makeTargets();
    // bounds are relative to the camera, which sits over the logo
    cam.left = -W / (2 * S); cam.right = W / (2 * S); cam.top = CY_FRAC * H / S; cam.bottom = -(1 - CY_FRAC) * H / S;
    cam.updateProjectionMatrix();
  }

  var sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -520; sun.shadow.camera.right = 520; sun.shadow.camera.top = 520; sun.shadow.camera.bottom = -520;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 2500;
  sun.shadow.radius = 1.5; sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.15;
  sun.target.position.set(CX, CY, 0);
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdddddd, 0.5));
  /* ---- the light is an area light: each frame is the average of many renders with the light moved over a small disc.
         Shadows are then sharp where they touch an object and softer farther away; the highlight spreads into a glow. ---- */
  var SIZE0 = 7.5, SIZE1 = 24;                      // angular radius of the light, in degrees: crisp at first, spread wide as it climbs
  var N_CLIMB = 24;                                 // at least this many samples while the light is wide, so the soft shadow does not band
  var N_ANIM = 20, N_REST = 64, nAnim = N_ANIM;     // samples per frame while moving / once at rest
  var gl = renderer.getContext();
  var useFloat = renderer.capabilities.isWebGL2 && !!gl.getExtension('EXT_color_buffer_float');
  var rtS = null, rtA = null;
  var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadGeo = new THREE.PlaneGeometry(2, 2);
  var blendMat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
  var copyMat = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
  var blendScene = new THREE.Scene(), copyScene = new THREE.Scene();
  blendScene.add(new THREE.Mesh(quadGeo, blendMat)); copyScene.add(new THREE.Mesh(quadGeo, copyMat));
  function makeTargets() {
    var sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (rtS) { rtS.dispose(); rtA.dispose(); }
    var o = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
    rtS = new THREE.WebGLRenderTarget(sz.x, sz.y, o);
    o = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: useFloat ? THREE.HalfFloatType : THREE.UnsignedByteType };
    rtA = new THREE.WebGLRenderTarget(sz.x, sz.y, o);
    blendMat.map = rtS.texture; blendMat.needsUpdate = true; copyMat.map = rtA.texture; copyMat.needsUpdate = true;
  }
  var L0 = new THREE.Vector3(), E1 = new THREE.Vector3(), E2 = new THREE.Vector3(), Ls = new THREE.Vector3();
  function draw(n, el, sizeDeg) {
    var LIGHT_SIZE = Math.tan(sizeDeg * Math.PI / 180);
    L0.set(Math.cos(AZ) * Math.cos(el), Math.sin(AZ) * Math.cos(el), Math.sin(el));
    var helper = Math.abs(L0.z) < 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    E1.crossVectors(helper, L0).normalize(); E2.crossVectors(L0, E1);
    var i, r, a, u, v, hx, hy, hb;
    for (i = 0; i < n; i++) {
      r = Math.sqrt((i + 0.5) / n); a = i * 2.399963229728653;          // light position: a spiral over the disc
      u = r * Math.cos(a) * LIGHT_SIZE; v = r * Math.sin(a) * LIGHT_SIZE;
      Ls.copy(L0).addScaledVector(E1, u).addScaledVector(E2, v); if (Ls.z < 0.45) Ls.z = 0.45; Ls.normalize();   // a wide light never dips lower than where it started, so no shadow stretches off the page
      sun.position.set(CX + 1000 * Ls.x, CY + 1000 * Ls.y, 1000 * Ls.z);
      hx = 0; hy = 0; hb = i + 1;                                         // camera: a sub-pixel shift (Halton 2,3) for smooth edges
      for (var f = 0.5, q = hb; q > 0; f /= 2, q = Math.floor(q / 2)) hx += f * (q % 2);
      for (f = 1 / 3, q = hb; q > 0; f /= 3, q = Math.floor(q / 3)) hy += f * (q % 3);
      cam.setViewOffset(W, H, hx - 0.5, hy - 0.5, W, H);
      renderer.setRenderTarget(rtS); renderer.autoClear = true; renderer.render(scene, cam);
      blendMat.opacity = 1 / (i + 1);
      renderer.setRenderTarget(rtA); renderer.autoClear = false; renderer.render(blendScene, quadCam);
    }
    cam.clearViewOffset();
    renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(copyScene, quadCam);
  }

  var shadowMat = new THREE.ShadowMaterial({ opacity: 0.3 });
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000), shadowMat);
  ground.position.set(CX, CY, 0); ground.receiveShadow = true; scene.add(ground);

  var ink = new THREE.MeshBasicMaterial({ color: 0x111111 });   // blocks: flat black, no texture, no shading

  /* ---- slit-end path strings (from the 2D page) -> flat extruded shapes ---- */
  function arcPts(x0, y0, r, fa, fs, x1, y1, out) {
    var hx = (x0 - x1) / 2, hy = (y0 - y1) / 2, lam = (hx * hx + hy * hy) / (r * r);
    if (lam > 1) r *= Math.sqrt(lam);
    var d = hx * hx + hy * hy, k = d > 0 ? Math.sqrt(Math.max(0, (r * r - d) / d)) : 0;
    var sg = (fa === fs) ? -1 : 1;
    var cxp = sg * k * hy, cyp = -sg * k * hx;
    var cx = cxp + (x0 + x1) / 2, cy = cyp + (y0 + y1) / 2;
    var t1 = Math.atan2((hy - cyp) / r, (hx - cxp) / r), t2 = Math.atan2((-hy - cyp) / r, (-hx - cxp) / r), dt = t2 - t1;
    if (fs === 0 && dt > 0) dt -= 2 * Math.PI; if (fs === 1 && dt < 0) dt += 2 * Math.PI;
    for (var i = 1; i <= 14; i++) { var a = t1 + dt * i / 14; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  function pathPts(dstr) {
    var tk = dstr.match(/[MHVAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi), i = 0, x = 0, y = 0, pts = [], c;
    function num() { return parseFloat(tk[i++]); }
    while (i < tk.length) {
      c = tk[i++];
      if (c === 'M') { x = num(); y = num(); pts.push([x, y]); }
      else if (c === 'H') { x = num(); pts.push([x, y]); }
      else if (c === 'V') { y = num(); pts.push([x, y]); }
      else if (c === 'A') { var rx = num(); num(); num(); var fa = num(), fs = num(), ex = num(), ey = num(); arcPts(x, y, rx, fa, fs, ex, ey, pts); x = ex; y = ey; }
    }
    var out = [];
    pts.forEach(function (p) { var q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 1e-6) out.push(p); });
    var f = out[0], l = out[out.length - 1];
    if (out.length > 1 && Math.abs(f[0] - l[0]) + Math.abs(f[1] - l[1]) < 1e-6) out.pop();
    return out;
  }
  function shapeGeo(dstr) {
    var sh = new THREE.Shape(pathPts(dstr).map(function (p) { return new THREE.Vector2(p[0], -p[1]); }));
    return new THREE.ExtrudeGeometry(sh, { depth: HGT, bevelEnabled: false, curveSegments: 1 });
  }
  function box(x, y, w, h) {                        // an SVG rect (top-left x, y, size w, h) as a block
    var m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ink);
    m.castShadow = true; scene.add(m); placeBox(m, x, y, w, h); return m;
  }
  function placeBox(m, x, y, w, h) { m.scale.set(w, h, HGT); m.position.set(x + w / 2, -(y + h / 2), HGT / 2); }

  function fixedShape(path) {
    var mesh = new THREE.Mesh(shapeGeo(path), ink);
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  }
  fixedShape('M0 60 H40 ' + bottomCap(50, 150) + ' V120 H90 V160 H0 Z');
  fixedShape('M200 60 H240 V160 H150 V120 H190 ' + bottomCap(200, 150) + ' Z');
  var mRight = fixedShape(topPiece(345, 390, 60, true, false));
  var mMiddle = fixedShape(topPiece(295, 345, 60, true, true));
  var mLeft = fixedShape(topPiece(250, 295, 60, false, true));
  var sRight = fixedShape(topPiece(195, 240, 40, true, false));
  var sLeft = fixedShape(topPiece(150, 195, 100, false, true));
  var ltop = box(0, 0, 40, 60);
  box(100, 60, 40, 100); box(250, 60, 40, 100); box(300, 60, 40, 100); box(350, 60, 40, 100);
  var brl = box(0, 59.5, 40, 1), br1 = box(250, 59.5, 40, 1), br2 = box(300, 59.5, 40, 1), br3 = box(350, 59.5, 40, 1), brs = box(199.5, 60, 1, 40);

  /* ---- the ball: a glossy sphere, with the dashed ring and the arrow painted on its surface ---- */
  var ballG = new THREE.Group(); scene.add(ballG);
  var sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 72, 54), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.42, metalness: 0 }));
  sphere.castShadow = true; sphere.receiveShadow = true; ballG.add(sphere);
  var flat = new THREE.Mesh(new THREE.SphereGeometry(R * 1.003, 48, 36), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0, depthWrite: false }));
  flat.renderOrder = 5; ballG.add(flat);                       // fades in over the shaded ball: the flat 2D look

  function loc(v, r) { return new THREE.Vector3(v[0] * r, -v[1] * r, v[2] * r); }   // 2D-logo sphere coords -> world axes (y up)
  var matDash = new THREE.MeshBasicMaterial({ color: 0xa6a6a6 }), matInk = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  function stroke(points, rad, mat) {
    var g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(6, points.length * 3), rad, 8, false), mat));
    [points[0], points[points.length - 1]].forEach(function (p) { var c = new THREE.Mesh(new THREE.SphereGeometry(rad, 10, 8), mat); c.position.copy(p); g.add(c); });
    return g;
  }
  var B = [0.225, -0.974], k, j, pts;
  for (k = 0; k < 10; k++) {                                   // ten dashes round the great circle
    pts = [];
    for (j = 0; j <= 8; j++) { var a = (k * 36 - 10 + j * 20 / 8) * Math.PI / 180; pts.push(loc([B[0] * Math.sin(a), B[1] * Math.sin(a), Math.cos(a)], R + 0.15)); }
    ballG.add(stroke(pts, 0.75, matDash));
  }
  pts = [];
  for (j = 0; j <= 16; j++) pts.push(loc(onArc(0.84 * j / 16), R + 0.15));   // the arrow's shaft, along the surface
  ballG.add(stroke(pts, 1.3, matInk));
  (function () {                                               // the arrow head: a small spherical triangle
    var base = onArc(0.8), tip = onArc(1.03);
    var c1 = nrm([base[0] + 0.2 * AX[0], base[1] + 0.2 * AX[1], base[2] + 0.2 * AX[2]]);
    var c2 = nrm([base[0] - 0.2 * AX[0], base[1] - 0.2 * AX[1], base[2] - 0.2 * AX[2]]);
    var N = 8, pos = [], idx = [], row = [], i2, j2, p, q;
    for (i2 = 0; i2 <= N; i2++) {
      row[i2] = [];
      for (j2 = 0; j2 <= N - i2; j2++) {
        var u = i2 / N, v = j2 / N, w = 1 - u - v;
        q = nrm([tip[0] * w + c1[0] * u + c2[0] * v, tip[1] * w + c1[1] * u + c2[1] * v, tip[2] * w + c1[2] * u + c2[2] * v]);
        p = loc(q, R + 0.3); row[i2][j2] = pos.length / 3; pos.push(p.x, p.y, p.z);
      }
    }
    for (i2 = 0; i2 < N; i2++) for (j2 = 0; j2 < N - i2; j2++) {
      idx.push(row[i2][j2], row[i2 + 1][j2], row[i2][j2 + 1]);
      if (j2 < N - i2 - 1) idx.push(row[i2 + 1][j2], row[i2 + 1][j2 + 1], row[i2][j2 + 1]);
    }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    ballG.add(new THREE.Mesh(g, matInk));
  })();

  /* ---------- one frame, from t alone ---------- */
  var startX = 560;   // where the ball comes from
  function smooth(x) { return x * x * (3 - 2 * x); }
  function render(t, quality) {
    curT = t;
    function slide(start) { return SHIFT * (1 - eo(seg(t, start, start + DUR))); }
    var mr = slide(ST[0]), mm = slide(ST[1]), ml = slide(ST[2]);
    var sr = slide(ST[3]), sl = slide(ST[4]), l = slide(ST[5]);
    mRight.position.x = mr;
    mMiddle.position.x = mm;
    mLeft.position.x = ml;
    sRight.position.x = sr;
    sLeft.position.x = sl;
    ltop.position.x = 20 + l;
    [[brl, 0, l], [br1, 250, ml], [br2, 300, mm], [br3, 350, mr]].forEach(function (b) {
      placeBox(b[0], b[1] + b[2], 59.5, 40 - b[2], 1);
    });
    brs.visible = sl > 9.7;

    var cx;
    if (t < T_HIT) cx = lerp(startX, 420, seg(t, T_IN, T_HIT));
    else if (t < R0) cx = 410 + mr;
    else cx = lerp(410, 120, rollPos(seg(t, R0, R1)));
    // over the blocks the ball rides on their tops (lifted by their height); on open ground it rests on the table
    var lift = HGT * (1 - smooth(seg(cx, 396, 420))) * smooth(seg(cx, 130, 170));
    ballG.position.set(cx, -20, R + lift);
    ballG.rotation.y = (cx - 120) / R;               // true rolling: turn = distance / radius
    ballG.visible = t >= T_IN;

    // the light has been on from the start; once the ball seats it climbs to straight overhead
    var climb = eio(seg(t, LIGHT0, TOP_END));
    var el = EL0 + (Math.PI / 2 - EL0) * climb, deg = el * 180 / Math.PI;
    flat.material.opacity = smooth(seg(deg, 50, 90));            // shine and shading give way to the flat black disc
    shadowMat.opacity = 0.3 * (1 - smooth(seg(deg, 76, 90)));    // shadows shorten under their objects, then are gone
    // as it climbs the light also spreads: shadows soften and thin out, the ball's highlight widens into a glow
    draw(quality === 'rest' ? N_REST : (t >= LIGHT0 ? Math.max(nAnim, N_CLIMB) : nAnim), el, lerp(SIZE0, SIZE1, climb));   // the spread moves exactly with the climb
  }

  resize(opts.width || window.innerWidth, opts.height || window.innerHeight);

  return {
    domElement: renderer.domElement,
    gl: gl,
    END: END,
    LIGHT0: LIGHT0,
    render: render,
    resize: resize,
    get t() { return curT; },
    get samples() { return nAnim; },
    set samples(n) { nAnim = n; },
    get maxSamples() { return N_ANIM; },
    setSamples: function (n) { nAnim = n; N_ANIM = n; },
    get startX() { return startX; },
    set startX(x) { startX = x; },
    offscreenStartX: function () { return Math.max(480, (W - (W - 390 * S) / 2) / S + 30); },
  };
}
