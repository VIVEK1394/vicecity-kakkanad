/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * ROAD GRAPH: turns the named road polylines into junction nodes and edges.
 * - Nodes: road ends plus every point shared by two or more roads.
 * - Arms: the edges leaving a node, sorted by angle, each trimmed back so the road
 *   strips stop exactly where the junction patch begins (no overlapping asphalt).
 * - A 40 m segment grid answers "nearest road" queries in constant time.
 * - Lanes: India keeps LEFT. Lane offsets are measured to the left of travel.
 * Used by the map (geometry), traffic and pedestrians (navigation), police and HUD.
 */

const ROAD_STYLE = Object.freeze({
  primary: { sidewalk: 3.4, lampSpacing: 38, lampBothSides: true, edgeLines: true, centreLine: true, median: 2.6 },
  secondary: { sidewalk: 2.6, lampSpacing: 44, lampBothSides: false, edgeLines: true, centreLine: true, median: 1.6 },
  tertiary: { sidewalk: 1.8, lampSpacing: 58, lampBothSides: false, edgeLines: false, centreLine: true, median: 1.4 },
});

class RoadGraph {
  constructor(roads) {
    this.roads = roads;
    this.nodes = [];
    this.edges = [];
    this.segments = [];
    this.cell = 40;
    this.grid = new Map();
    this.buildTopology();
    this.buildArms();
    this.buildGrid();
  }

  static style(road) {
    return ROAD_STYLE[road.cls] || ROAD_STYLE.tertiary;
  }

  key(p) {
    return `${Math.round(p.x * 10)},${Math.round(p.z * 10)}`;
  }

  buildTopology() {
    const usage = new Map(); // key -> Set of road ids touching it
    this.roads.forEach((road) => {
      road.points.forEach((p) => {
        const k = this.key(p);
        if (!usage.has(k)) usage.set(k, new Set());
        usage.get(k).add(road.id);
      });
    });
    const nodeByKey = new Map();
    const nodeFor = (p) => {
      const k = this.key(p);
      let node = nodeByKey.get(k);
      if (!node) {
        node = { id: this.nodes.length, x: p.x, z: p.z, arms: [], poly: null };
        nodeByKey.set(k, node);
        this.nodes.push(node);
      }
      return node;
    };
    this.roads.forEach((road) => {
      const pts = road.points;
      let start = 0;
      for (let i = 1; i < pts.length; i++) {
        const isNode = i === pts.length - 1 || usage.get(this.key(pts[i])).size > 1;
        if (!isNode) continue;
        const slice = pts.slice(start, i + 1).map((p) => ({ x: p.x, z: p.z }));
        const cum = [0];
        for (let k = 1; k < slice.length; k++) cum.push(cum[k - 1] + Math.hypot(slice[k].x - slice[k - 1].x, slice[k].z - slice[k - 1].z));
        this.edges.push({
          id: this.edges.length,
          road,
          style: RoadGraph.style(road),
          halfW: road.width / 2,
          pts: slice,
          cum,
          len: cum[cum.length - 1],
          a: nodeFor(pts[start]),
          b: nodeFor(pts[i]),
          trimA: 0,
          trimB: 0,
        });
        start = i;
      }
    });
  }

  buildArms() {
    this.edges.forEach((e) => {
      const n = e.pts.length;
      const da = this.norm(e.pts[1].x - e.pts[0].x, e.pts[1].z - e.pts[0].z);
      const db = this.norm(e.pts[n - 2].x - e.pts[n - 1].x, e.pts[n - 2].z - e.pts[n - 1].z);
      e.a.arms.push({ edge: e, dir: 1, dx: da.x, dz: da.z, w: e.halfW, sw: e.style.sidewalk, trim: 0 });
      e.b.arms.push({ edge: e, dir: -1, dx: db.x, dz: db.z, w: e.halfW, sw: e.style.sidewalk, trim: 0 });
    });
    this.nodes.forEach((node) => {
      const arms = node.arms;
      arms.forEach((a) => (a.angle = Math.atan2(a.dz, a.dx)));
      arms.sort((p, q) => p.angle - q.angle);
      node.junction = arms.length >= 2;
      if (!node.junction) return;
      // Trim each arm back to where its outer (sidewalk) edge meets the neighbour's.
      arms.forEach((a) => (a.trim = a.w + a.sw));
      for (let i = 0; i < arms.length; i++) {
        const a = arms[i];
        const b = arms[(i + 1) % arms.length];
        let alpha = b.angle - a.angle;
        if (alpha <= 0) alpha += Math.PI * 2;
        a.gapNext = alpha;
        if (alpha > 2.97) continue; // nearly straight on: no corner constraint
        const wa = a.w + a.sw;
        const wb = b.w + b.sw;
        const s = Math.sin(alpha);
        const c = Math.cos(alpha);
        a.trim = Math.max(a.trim, (wb + wa * c) / s);
        b.trim = Math.max(b.trim, (wa + wb * c) / s);
      }
      arms.forEach((a) => {
        a.trim = Math.min(45, a.trim + 1.0);
        if (a.dir === 1) a.edge.trimA = a.trim;
        else a.edge.trimB = a.trim;
      });
      // Junction patch: each arm's right then left corner, going round by angle.
      const poly = [];
      arms.forEach((a) => {
        const nx = -a.dz;
        const nz = a.dx; // +90 deg towards the next arm
        const cx = node.x + a.dx * a.trim;
        const cz = node.z + a.dz * a.trim;
        poly.push({ x: cx - nx * a.w, z: cz - nz * a.w });
        poly.push({ x: cx + nx * a.w, z: cz + nz * a.w });
      });
      node.poly = poly;
    });
    // Keep short edges from being trimmed away entirely.
    this.edges.forEach((e) => {
      const room = e.len - 4;
      if (e.trimA + e.trimB > room) {
        const k = Math.max(0, room) / (e.trimA + e.trimB);
        e.trimA *= k;
        e.trimB *= k;
      }
    });
  }

  norm(x, z) {
    const l = Math.hypot(x, z) || 1;
    return { x: x / l, z: z / l };
  }

  buildGrid() {
    this.edges.forEach((e) => {
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i];
        const b = e.pts[i + 1];
        const seg = { edge: e, i, ax: a.x, az: a.z, bx: b.x, bz: b.z, s0: e.cum[i], len: e.cum[i + 1] - e.cum[i] };
        this.segments.push(seg);
        const pad = e.halfW + 4;
        const x0 = Math.floor((Math.min(a.x, b.x) - pad) / this.cell);
        const x1 = Math.floor((Math.max(a.x, b.x) + pad) / this.cell);
        const z0 = Math.floor((Math.min(a.z, b.z) - pad) / this.cell);
        const z1 = Math.floor((Math.max(a.z, b.z) + pad) / this.cell);
        for (let gx = x0; gx <= x1; gx++) {
          for (let gz = z0; gz <= z1; gz++) {
            const k = `${gx},${gz}`;
            if (!this.grid.has(k)) this.grid.set(k, []);
            this.grid.get(k).push(seg);
          }
        }
      }
    });
  }

  // Closest point on any road centreline. Returns null beyond maxDist.
  nearest(x, z, maxDist = 400, out = {}) {
    const gx = Math.floor(x / this.cell);
    const gz = Math.floor(z / this.cell);
    let best = maxDist;
    let hit = null;
    const maxRing = Math.ceil(maxDist / this.cell) + 1;
    const seen = new Set();
    for (let r = 0; r <= maxRing; r++) {
      if (hit && (r - 1) * this.cell > best) break;
      for (let ix = gx - r; ix <= gx + r; ix++) {
        for (let iz = gz - r; iz <= gz + r; iz++) {
          if (Math.max(Math.abs(ix - gx), Math.abs(iz - gz)) !== r) continue;
          const list = this.grid.get(`${ix},${iz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k++) {
            const s = list[k];
            if (seen.has(s)) continue;
            seen.add(s);
            const vx = s.bx - s.ax;
            const vz = s.bz - s.az;
            const l2 = vx * vx + vz * vz;
            let t = l2 > 0 ? ((x - s.ax) * vx + (z - s.az) * vz) / l2 : 0;
            t = Math.max(0, Math.min(1, t));
            const px = s.ax + vx * t;
            const pz = s.az + vz * t;
            const d = Math.hypot(x - px, z - pz);
            if (d < best) {
              best = d;
              hit = s;
              out.x = px;
              out.z = pz;
              out.t = t;
            }
          }
        }
      }
    }
    if (!hit) return null;
    const l = Math.max(1e-6, hit.len);
    out.segment = hit;
    out.edge = hit.edge;
    out.road = hit.edge.road;
    out.distance = best;
    out.s = hit.s0 + out.t * hit.len;
    out.dx = (hit.bx - hit.ax) / l;
    out.dz = (hit.bz - hit.az) / l;
    return out;
  }

  // Segments with any part within r of (x, z) (grid-accelerated, may include extras).
  segmentsNear(x, z, r) {
    const out = new Set();
    const x0 = Math.floor((x - r) / this.cell);
    const x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell);
    const z1 = Math.floor((z + r) / this.cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const list = this.grid.get(`${gx},${gz}`);
        if (list) list.forEach((s) => out.add(s));
      }
    }
    return out;
  }

  // Point and unit tangent at arc length s along edge a->b.
  pointAt(edge, s, out = {}) {
    const cum = edge.cum;
    s = Math.max(0, Math.min(edge.len, s));
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const a = edge.pts[i];
    const b = edge.pts[i + 1];
    const l = Math.max(1e-6, cum[i + 1] - cum[i]);
    const t = (s - cum[i]) / l;
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.dx = (b.x - a.x) / l;
    out.dz = (b.z - a.z) / l;
    return out;
  }

  // Polyline of edge between arc lengths s0 < s1 (vertices kept for mitering).
  sub(edge, s0, s1) {
    const pts = [];
    const p0 = this.pointAt(edge, s0);
    pts.push({ x: p0.x, z: p0.z });
    for (let i = 1; i < edge.pts.length - 1; i++) {
      if (edge.cum[i] > s0 + 0.01 && edge.cum[i] < s1 - 0.01) pts.push({ x: edge.pts[i].x, z: edge.pts[i].z });
    }
    const p1 = this.pointAt(edge, s1);
    pts.push({ x: p1.x, z: p1.z });
    return pts;
  }

  lanesPerDirection(edge) {
    return Math.max(1, Math.round(edge.road.lanes / 2));
  }

  // Lateral offset (to the left of travel) of lane k's centre.
  laneOffset(edge, k) {
    const road = edge.road;
    const per = this.lanesPerDirection(edge);
    const inner = road.dual ? edge.style.median / 2 : 0;
    const laneW = (edge.halfW - inner) / per;
    // lane 0 is the kerb lane (slow), higher lanes towards the centre
    return edge.halfW - laneW * (k + 0.5);
  }

  // Position/heading of a lane point: travelling dir (+1 a->b, -1 b->a) at arc s.
  lanePoint(edge, dir, s, lateral, out = {}) {
    this.pointAt(edge, s, out);
    const fx = out.dx * dir;
    const fz = out.dz * dir;
    // left of travel = (fz, -fx)
    out.x += fz * lateral;
    out.z += -fx * lateral;
    out.fx = fx;
    out.fz = fz;
    out.heading = Math.atan2(fx, fz);
    return out;
  }

  // The arm by which a vehicle travelling `dir` along `edge` leaves its end node.
  endNode(edge, dir) {
    return dir > 0 ? edge.b : edge.a;
  }

  armOf(node, edge, dir) {
    // arm whose edge is `edge` and which points back along it (arriving side)
    return node.arms.find((a) => a.edge === edge && a.dir === -dir) || node.arms.find((a) => a.edge === edge);
  }
}

window.ROAD_STYLE = ROAD_STYLE;
window.RoadGraph = RoadGraph;
