// Ten Euler steps from the seminar's 2-D cat–dog mixture, highlighted seed 131.
export function trajectory({ prior, probe, source, start }) {
  const [wx, wy] = probe.A[0];
  const points = [start];
  for (let step = 0; step < 10; step++) {
    const [x, y] = points[step];
    const t = 1 - step / 10;
    const a = 1 - t;
    const noise = (t * source.sigma) ** 2;
    // Condition each Gaussian on the noisy state, then combine its moments.
    const components = prior.means.map(([mx, my], i) => {
      const [[xx, xy], [, yy]] = prior.covs[i];
      const u = a*a*xx + noise, v = a*a*xy, w = a*a*yy + noise;
      const det = u*w - v*v;
      const dx = x - a*mx - t*source.mean[0], dy = y - a*my - t*source.mean[1];
      const rx = (w*dx - v*dy)/det, ry = (u*dy - v*dx)/det;
      return {
        weight: prior.weights[i] * Math.exp(-0.5*(dx*rx + dy*ry))/Math.sqrt(det),
        x: mx + a*(xx*rx + xy*ry), y: my + a*(xy*rx + yy*ry),
        xx: noise*(xx*w - xy*v)/det, xy: noise*(xy*u - xx*v)/det,
        yy: noise*(yy*u - xy*v)/det,
      };
    });
    const sum = components.reduce((n, c) => n + c.weight, 0);
    const mean = key => components.reduce((n,c) => n + c.weight*c[key], 0)/sum;
    const mx = mean("x"), my = mean("y");
    let cx = 0, cy = 0;
    for (const c of components) {
      const dx = c.x - mx, dy = c.y - my;
      const projection = dx*wx + dy*wy;
      cx += c.weight/sum * (c.xx*wx + c.xy*wy + dx*projection);
      cy += c.weight/sum * (c.xy*wx + c.yy*wy + dy*projection);
    }
    const sd = Math.sqrt(cx*wx + cy*wy);
    const z = (mx*wx + my*wy + probe.b[0])/sd;
    const density = Math.exp(-z*z/2)/Math.sqrt(2*Math.PI);
    // Standard normal tail approximation (Abramowitz & Stegun 26.2.17).
    const k = 1/(1 + 0.2316419*Math.abs(z));
    const tail = density*k*(0.319381530+k*(-0.356563782+k*(1.781477937+k*(-1.821255978+k*1.330274429))));
    const gain = density / ((z < 0 ? tail : 1-tail)*sd);
    points.push([x + (mx+gain*cx-x)/(10*t), y + (my+gain*cy-y)/(10*t)]);
  }
  return points;
}
