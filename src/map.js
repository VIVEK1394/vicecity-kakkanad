/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 2: KAKKANAD 3D MAP
 * Builds the world from src/data/kakkanad-geo.js (real Kakkanad names on real
 * coordinates) through the RoadGraph:
 * - Roads: mitered asphalt per graph edge, junction patches (no overlapping asphalt),
 *   raised kerbs, paver sidewalks with corner fills, medians, lane paint, zebra
 *   crossings, stop lines, street lamps and signals at the big junctions.
 * - Chithrapuzha and Kadambrayar rivers with stone banks and a bridge.
 * - Kochi Metro Pink Line viaduct (under construction) with station boxes.
 * - Landmarks at their real positions (Civil Station, bus stand, Infopark, SmartCity,
 *   CSEZ, Water Metro, Thrikkakara temple, colleges, hospitals, mosques...).
 * - Everything else is hallucinated: shop-houses along the main roads, Kerala houses
 *   with tiled roofs and compound walls, flats, IT towers, sheds, coconut groves.
 * All static geometry goes through StaticBatcher (one draw call per material per cell).
 * Exposes: getNearestRoadPoint, localityAt, collidersNear, resolveCircle, streetLamps.
 */

class KakkanadMapManager {
  constructor(scene) {
    this.scene = scene;
    this.config = window.KAKKANAD_CONFIG;
    this.geo = window.KAKKANAD_GEO;
    this.roads = this.config.ROAD_NETWORK;
    this.landmarks = this.config.KEY_LANDMARKS;
    this.localities = this.config.LOCALITIES;

    this.surfaceManager = new window.SurfaceManager();
    this.batcher = new window.StaticBatcher(scene, 600);
    this.graph = new window.RoadGraph(this.roads);
    this.kit = new window.CityKit(this.surfaceManager, this.batcher);
    this.rng = GFX.rng(2026);

    this.colliders = []; // camera / player collision boxes: {center, half, rotY}
    this.colliderGrid = new Map();
    this.colliderCell = 32;
    this.footprints = []; // occupied ground (buildings, landmarks): OBBs for placement
    this.footprintGrid = new Map();
    this.footprintCell = 48;
    this.streetLamps = []; // lamp head world positions
    this.riverSegments = [];
    this.stats = { buildings: 0, palms: 0, lamps: 0 };

    const S = this.surfaceManager;
    this.lampHousingMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.9 });
    this.lampLensMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    this.lampLensMat.userData.glow = { day: 0.35, night: 6.0 };
    this.lampConeMat = new THREE.MeshBasicMaterial({
      color: 0xffcf8a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false, // fog would add its colour to an additive surface
    });
    this.lampConeMat.userData.glow = { day: 0, night: 0.018 };
    this.lampPoolMat = new THREE.MeshBasicMaterial({
      map: S.lightPoolTexture,
      color: 0xffc98a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -80,
      fog: false,
    });
    this.lampPoolMat.userData.glow = { day: 0, night: 0.14 };
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.85 });
    this.whitePaintMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.45, metalness: 0.2 });
    this.goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a437, roughness: 0.3, metalness: 1.0 });
    this.copperMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.45, metalness: 0.85 });
    this.domeMat = new THREE.MeshStandardMaterial({ color: 0x1f8a5a, roughness: 0.35, metalness: 0.2 });
    this.neonMats = new Map();

    this.initMap();
  }

  neon(hex, day = 0.35, night = 1.3) {
    const key = `${hex}|${day}|${night}`;
    if (!this.neonMats.has(key)) {
      const m = new THREE.MeshBasicMaterial({ color: hex });
      m.userData.glow = { day, night };
      m.userData.lod = "near";
      this.neonMats.set(key, m);
    }
    return this.neonMats.get(key);
  }

  // Level of detail per material (see StaticBatcher): small props fade first.
  assignLods() {
    const S = this.surfaceManager;
    const k = this.kit.mat;
    const tag = (lod, mats) => mats.forEach((m) => m && (m.userData.lod = lod));
    tag("mid", [S.markingWhite, S.markingYellow, S.curbMaterial, S.medianSideMaterial, S.steelMaterial, k.signs, k.boards, k.lawn, this.lampLensMat, this.whitePaintMat, this.domeMat, this.copperMat]);
    tag("near", [this.lampHousingMat, this.lampConeMat, this.lampPoolMat, this.woodMat, this.goldMat]);
    this.lampConeMat.userData.nightOnly = true;
    this.lampPoolMat.userData.nightOnly = true;
  }

  initMap() {
    this.assignLods();
    this.buildGround();
    this.buildRivers();
    this.buildRoads();
    this.buildMetro();
    this.placeLandmarks();
    this.buildCity();
    this.buildLandmarks();
    this.buildSignage();
    this.buildFoliage();
    this.batchStats = this.batcher.build();
  }

  update(delta) {
    this.surfaceManager.updateWater(delta);
  }

  // --- Spatial helpers ---------------------------------------------------------------------
  gridAdd(grid, cell, item, x, z, r) {
    const x0 = Math.floor((x - r) / cell);
    const x1 = Math.floor((x + r) / cell);
    const z0 = Math.floor((z - r) / cell);
    const z1 = Math.floor((z + r) / cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const k = `${gx},${gz}`;
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(item);
      }
    }
  }

  gridQuery(grid, cell, x, z, r, out) {
    const x0 = Math.floor((x - r) / cell);
    const x1 = Math.floor((x + r) / cell);
    const z0 = Math.floor((z - r) / cell);
    const z1 = Math.floor((z + r) / cell);
    out.length = 0;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const list = grid.get(`${gx},${gz}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) if (!list[i]._q) (list[i]._q = true), out.push(list[i]);
      }
    }
    for (let i = 0; i < out.length; i++) out[i]._q = false;
    return out;
  }

  addCollider(x, y, z, hx, hy, hz, rotY = 0) {
    const c = { center: new THREE.Vector3(x, y, z), half: new THREE.Vector3(hx, hy, hz), rotY };
    this.colliders.push(c);
    this.gridAdd(this.colliderGrid, this.colliderCell, c, x, z, Math.hypot(hx, hz));
  }

  collidersNear(pos, radius) {
    this._near = this._near || [];
    return this.gridQuery(this.colliderGrid, this.colliderCell, pos.x, pos.z, radius, this._near);
  }

  // Push a circle (x, z, r) out of every building box. Returns the push normal or null.
  resolveCircle(pos, r, maxY = 3) {
    const near = this.collidersNear(pos, r + 4);
    let hitNormal = null;
    for (let i = 0; i < near.length; i++) {
      const b = near[i];
      if (b.center.y - b.half.y > maxY || b.half.y < 0.3) continue; // overhead decks, flat paint
      const c = Math.cos(b.rotY);
      const s = Math.sin(b.rotY);
      const ox = pos.x - b.center.x;
      const oz = pos.z - b.center.z;
      const lx = c * ox - s * oz;
      const lz = s * ox + c * oz;
      const qx = Math.max(-b.half.x, Math.min(b.half.x, lx));
      const qz = Math.max(-b.half.z, Math.min(b.half.z, lz));
      let dx = lx - qx;
      let dz = lz - qz;
      let d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-6) {
        // centre inside the box: leave by the nearest face
        const px = b.half.x - Math.abs(lx);
        const pz = b.half.z - Math.abs(lz);
        if (px < pz) {
          dx = Math.sign(lx) || 1;
          dz = 0;
          d = -px;
        } else {
          dx = 0;
          dz = Math.sign(lz) || 1;
          d = -pz;
        }
      } else {
        dx /= d;
        dz /= d;
      }
      const push = r - d;
      // local -> world
      const wx = c * dx + s * dz;
      const wz = -s * dx + c * dz;
      pos.x += wx * push;
      pos.z += wz * push;
      hitNormal = hitNormal || new THREE.Vector3();
      hitNormal.set(wx, 0, wz);
    }
    return hitNormal;
  }

  // Oriented footprint {x, z, hw, hd, rot}; returns corners (world xz).
  corners(f) {
    const c = Math.cos(f.rot);
    const s = Math.sin(f.rot);
    return [
      [-f.hw, -f.hd],
      [f.hw, -f.hd],
      [f.hw, f.hd],
      [-f.hw, f.hd],
    ].map(([lx, lz]) => [f.x + lx * c + lz * s, f.z - lx * s + lz * c]);
  }

  // Separating axis test between two oriented rectangles (with margin).
  obbOverlap(a, b, margin) {
    const axes = [a.rot, b.rot];
    for (let k = 0; k < 2; k++) {
      const r = axes[k];
      const ux = [Math.cos(r), -Math.sin(r)];
      const uz = [Math.sin(r), Math.cos(r)];
      for (const u of [ux, uz]) {
        const proj = (f) => {
          const cs = this.corners(f);
          let mn = Infinity;
          let mx = -Infinity;
          cs.forEach(([x, z]) => {
            const p = x * u[0] + z * u[1];
            mn = Math.min(mn, p);
            mx = Math.max(mx, p);
          });
          return [mn, mx];
        };
        const [a0, a1] = proj(a);
        const [b0, b1] = proj(b);
        if (a1 + margin < b0 || b1 + margin < a0) return false;
      }
    }
    return true;
  }

  // Distance from segment (ax,az)-(bx,bz) to an oriented rectangle (0 if they touch).
  segRectDistance(f, ax, az, bx, bz) {
    const c = Math.cos(f.rot);
    const s = Math.sin(f.rot);
    const toL = (x, z) => [c * (x - f.x) - s * (z - f.z), s * (x - f.x) + c * (z - f.z)];
    const [px, pz] = toL(ax, az);
    const [qx, qz] = toL(bx, bz);
    // Liang-Barsky clip against the box
    let t0 = 0;
    let t1 = 1;
    const dx = qx - px;
    const dz = qz - pz;
    const clip = (p, q) => {
      if (Math.abs(p) < 1e-12) return q >= 0;
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
      return true;
    };
    if (clip(-dx, px + f.hw) && clip(dx, f.hw - px) && clip(-dz, pz + f.hd) && clip(dz, f.hd - pz) && t0 <= t1) return 0;
    const pointBox = (x, z) => Math.hypot(Math.max(0, Math.abs(x) - f.hw), Math.max(0, Math.abs(z) - f.hd));
    const pointSeg = (x, z) => {
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / l2)) : 0;
      return Math.hypot(x - px - dx * t, z - pz - dz * t);
    };
    let d = Math.min(pointBox(px, pz), pointBox(qx, qz));
    [
      [-f.hw, -f.hd],
      [f.hw, -f.hd],
      [f.hw, f.hd],
      [-f.hw, f.hd],
    ].forEach(([x, z]) => (d = Math.min(d, pointSeg(x, z))));
    return d;
  }

  // Is the footprint clear of roads (with their sidewalks), rivers and other footprints?
  footprintClear(f, margin = 1.0, roadMargin = 0.6, ignoreRivers = false) {
    const b = this.config.MAP_BOUNDS;
    if (f.x < b.minX + 60 || f.x > b.maxX - 60 || f.z < b.minZ + 60 || f.z > b.maxZ - 60) return false;
    const reach = Math.hypot(f.hw, f.hd);
    const segs = this.graph.segmentsNear(f.x, f.z, reach + 20);
    for (const sg of segs) {
      const need = sg.edge.halfW + sg.edge.style.sidewalk + roadMargin;
      if (this.segRectDistance(f, sg.ax, sg.az, sg.bx, sg.bz) < need) return false;
    }
    for (let i = 0; !ignoreRivers && i < this.riverSegments.length; i++) {
      const r = this.riverSegments[i];
      if (Math.abs(r.ax - f.x) > 400 && Math.abs(r.bx - f.x) > 400) continue;
      if (this.segRectDistance(f, r.ax, r.az, r.bx, r.bz) < r.halfW + 5) return false;
    }
    const near = this.gridQuery(this.footprintGrid, this.footprintCell, f.x, f.z, reach + 40, (this._fpq = this._fpq || []));
    for (let i = 0; i < near.length; i++) if (this.obbOverlap(f, near[i], margin)) return false;
    return true;
  }

  reserve(f) {
    this.footprints.push(f);
    this.gridAdd(this.footprintGrid, this.footprintCell, f, f.x, f.z, Math.hypot(f.hw, f.hd));
  }

  // --- 1. Ground -------------------------------------------------------------------------------
  buildGround() {
    const b = this.config.MAP_BOUNDS;
    const width = b.maxX - b.minX;
    const depth = b.maxZ - b.minZ;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const geo = new THREE.PlaneGeometry(width, depth, Math.ceil(width / 28), Math.ceil(depth / 28));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) + cz;
      uv.setXY(i, x / 16, z / 16);
      const n = GFX.fbm(x + 9000, z + 9000, 16384, 64, 3, 3);
      const soil = GFX.fbm(x + 9000, z + 9000, 16384, 40, 2, 8);
      const lush = GFX.fbm(x + 9000, z + 9000, 16384, 18, 2, 21);
      const k = 0.6 + 0.3 * n;
      const red = Math.max(0, Math.min(1, (soil - 0.58) / 0.25)); // laterite plots, soft-edged
      const green = Math.max(0, Math.min(1, (lush - 0.4) / 0.3)); // wetter, darker pockets
      c.setRGB(k * (0.92 + 0.2 * red - 0.12 * green), k * (0.9 - 0.06 * red - 0.02 * green), k * (0.78 - 0.1 * red - 0.1 * green));
      c.convertSRGBToLinear();
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geo, this.surfaceManager.groundMaterial);
    ground.position.set(cx, -0.05, cz);
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    this.scene.add(ground);
  }

  // --- Ribbon helpers (raw writer) ---------------------------------------------------------------
  mitered(pts) {
    const n = pts.length;
    const dirs = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dz = pts[i + 1].z - pts[i].z;
      const l = Math.hypot(dx, dz) || 1;
      dirs.push({ x: dx / l, z: dz / l });
    }
    const out = [];
    let cum = 0;
    for (let i = 0; i < n; i++) {
      let tx;
      let tz;
      if (i === 0) (tx = dirs[0].x), (tz = dirs[0].z);
      else if (i === n - 1) (tx = dirs[n - 2].x), (tz = dirs[n - 2].z);
      else {
        tx = dirs[i - 1].x + dirs[i].x;
        tz = dirs[i - 1].z + dirs[i].z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
      }
      const lx = tz;
      const lz = -tx; // left of travel
      const ref = dirs[Math.min(i, n - 2)];
      const m = 1 / Math.max(0.35, lx * ref.z + lz * -ref.x);
      if (i > 0) cum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      out.push({ x: pts[i].x, z: pts[i].z, lx: lx * m, lz: lz * m, s: cum });
    }
    return out;
  }

  // Flat mitered ribbon between lateral offsets w0 < w1 (left of travel positive).
  ribbon(w, pts, w0, w1, y, uv) {
    const m = this.mitered(pts);
    w.begin(m[Math.floor(m.length / 2)].x, m[Math.floor(m.length / 2)].z);
    const ids = m.map((p) => {
      const ax = p.x + p.lx * w0;
      const az = p.z + p.lz * w0;
      const bx = p.x + p.lx * w1;
      const bz = p.z + p.lz * w1;
      let ua;
      let va;
      let ub;
      let vb;
      if (uv.world) {
        ua = ax * uv.world;
        va = az * uv.world;
        ub = bx * uv.world;
        vb = bz * uv.world;
      } else {
        ua = (w0 - (uv.w0 || 0)) * uv.across;
        ub = (w1 - (uv.w0 || 0)) * uv.across;
        va = vb = (p.s + (uv.s0 || 0)) * uv.along;
      }
      if (uv.swap) return [w.vertex(ax, y, az, 0, 1, 0, va, ua), w.vertex(bx, y, bz, 0, 1, 0, vb, ub)];
      return [w.vertex(ax, y, az, 0, 1, 0, ua, va), w.vertex(bx, y, bz, 0, 1, 0, ub, vb)];
    });
    for (let i = 0; i < ids.length - 1; i++) {
      const [a0, b0] = ids[i];
      const [a1, b1] = ids[i + 1];
      w.tri(a0, a1, b0);
      w.tri(b0, a1, b1);
    }
  }

  // Vertical mitered strip at lateral offset `lat`, facing left (+1) or right (-1).
  wallRibbon(w, pts, lat, y0, y1, facing, tile = 2.4) {
    const m = this.mitered(pts);
    w.begin(m[Math.floor(m.length / 2)].x, m[Math.floor(m.length / 2)].z);
    const ids = m.map((p) => {
      const x = p.x + p.lx * lat;
      const z = p.z + p.lz * lat;
      const l = Math.hypot(p.lx, p.lz) || 1;
      const nx = (p.lx / l) * facing;
      const nz = (p.lz / l) * facing;
      return [w.vertex(x, y0, z, nx, 0, nz, p.s / tile, 0), w.vertex(x, y1, z, nx, 0, nz, p.s / tile, (y1 - y0) / 0.35)];
    });
    for (let i = 0; i < ids.length - 1; i++) {
      const [b0, t0] = ids[i];
      const [b1, t1] = ids[i + 1];
      if (facing > 0) {
        w.tri(b1, b0, t1);
        w.tri(b0, t0, t1);
      } else {
        w.tri(b0, b1, t0);
        w.tri(b1, t1, t0);
      }
    }
  }

  // Flat polygon (convex or star-shaped around `center`), facing up; world UVs.
  fan(w, center, poly, y, uvScale) {
    w.begin(center.x, center.z);
    const c = w.vertex(center.x, y, center.z, 0, 1, 0, center.x * uvScale, center.z * uvScale);
    const ids = poly.map((p) => w.vertex(p.x, y, p.z, 0, 1, 0, p.x * uvScale, p.z * uvScale));
    for (let i = 0; i < ids.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      // keep the triangle facing up whatever the order
      const cross = (a.x - center.x) * (b.z - center.z) - (a.z - center.z) * (b.x - center.x);
      if (cross < 0) w.tri(c, ids[i], ids[(i + 1) % ids.length]);
      else w.tri(c, ids[(i + 1) % ids.length], ids[i]);
    }
  }

  flatQuad(w, p, y, uvScale) {
    // p: 4 points in order around the quad
    this.fan(w, { x: (p[0].x + p[1].x + p[2].x + p[3].x) / 4, z: (p[0].z + p[1].z + p[2].z + p[3].z) / 4 }, p, y, uvScale);
  }

  // Straight strip on one polyline segment: along [s0,s1], lateral [w0,w1] (left positive).
  strip(w, a, dir, s0, s1, w0, w1, y) {
    const lx = dir.z;
    const lz = -dir.x;
    const P = (s, l) => ({ x: a.x + dir.x * s + lx * l, z: a.z + dir.z * s + lz * l });
    const p00 = P(s0, w0);
    const p01 = P(s0, w1);
    const p10 = P(s1, w0);
    const p11 = P(s1, w1);
    w.begin(p00.x, p00.z);
    const A = w.vertex(p00.x, y, p00.z, 0, 1, 0, s0, w0);
    const B = w.vertex(p01.x, y, p01.z, 0, 1, 0, s0, w1);
    const C = w.vertex(p10.x, y, p10.z, 0, 1, 0, s1, w0);
    const D = w.vertex(p11.x, y, p11.z, 0, 1, 0, s1, w1);
    w.tri(A, C, B);
    w.tri(B, C, D);
  }

  // Call fn(a, dir, sStart, sEnd, segLen) for each segment of a polyline, with global s.
  eachSegment(pts, fn) {
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-3) continue;
      fn(a, { x: (b.x - a.x) / len, z: (b.z - a.z) / len }, s, s + len, len);
      s += len;
    }
    return s;
  }

  // --- 2. Rivers --------------------------------------------------------------------------------
  buildRivers() {
    const S = this.surfaceManager;
    const water = this.batcher.writer(S.waterMaterial, false, true);
    const bank = this.kit.writer(this.kit.mat.plain, false, true);
    const bankTint = window.CityKit.tint("#8d6a4f");
    this.geo.rivers.forEach((river) => {
      const pts = river.points;
      const hw = river.width / 2;
      this.ribbon(water, pts, -hw, hw, 0.02, { world: 0.1 });
      // laterite stone banks
      [-1, 1].forEach((side) => {
        const w0 = side > 0 ? hw : -hw - 2.2;
        const w1 = side > 0 ? hw + 2.2 : -hw;
        const m = this.mitered(pts);
        bank.begin(m[0].x, m[0].z);
        const ids = m.map((p) => [
          bank.vertex(p.x + p.lx * w0, 0.12, p.z + p.lz * w0, 0, 1, 0, p.s / 4, 0, bankTint[0], bankTint[1], bankTint[2]),
          bank.vertex(p.x + p.lx * w1, 0.12, p.z + p.lz * w1, 0, 1, 0, p.s / 4, 0.5, bankTint[0], bankTint[1], bankTint[2]),
        ]);
        for (let i = 0; i < ids.length - 1; i++) {
          bank.tri(ids[i][0], ids[i + 1][0], ids[i][1]);
          bank.tri(ids[i][1], ids[i + 1][0], ids[i + 1][1]);
        }
      });
      for (let i = 0; i < pts.length - 1; i++) {
        this.riverSegments.push({ river, ax: pts[i].x, az: pts[i].z, bx: pts[i + 1].x, bz: pts[i + 1].z, halfW: hw });
      }
    });
  }

  // --- 3. Roads ---------------------------------------------------------------------------------
  buildRoads() {
    const S = this.surfaceManager;
    const k = this.kit;
    this.w = {
      asphalt: this.batcher.writer(S.asphaltFor(0), false, true),
      white: this.batcher.writer(S.markingWhite, false, true),
      yellow: this.batcher.writer(S.markingYellow, false, true),
      sidewalk: this.batcher.writer(S.sidewalkMaterial, false, true),
      curb: this.batcher.writer(S.curbMaterial, false, true),
      medianTop: this.batcher.writer(S.medianGrassMaterial, false, true),
      medianSide: this.batcher.writer(S.medianSideMaterial, false, true),
    };
    this.graph.edges.forEach((e) => this.buildEdge(e));
    this.graph.nodes.forEach((n) => this.buildJunction(n));
    this.buildBridges();
    this.buildRiverColliders();
    this.stats.lamps = this.streetLamps.length;
  }

  // Rivers are not drivable: low boxes along the water, left open under the bridges.
  buildRiverColliders() {
    const bridges = this.bridges || [];
    this.riverSegments.forEach((r) => {
      const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
      const pieces = Math.ceil(len / 30);
      const rot = Math.atan2(r.bx - r.ax, r.bz - r.az);
      for (let i = 0; i < pieces; i++) {
        const t = (i + 0.5) / pieces;
        const x = r.ax + (r.bx - r.ax) * t;
        const z = r.az + (r.bz - r.az) * t;
        if (bridges.some((b) => Math.hypot(b.x - x, b.z - z) < r.halfW + 30)) continue;
        this.addCollider(x, 0.3, z, r.halfW - 1.5, 0.35, len / pieces / 2 + 1, rot);
      }
    });
  }

  buildEdge(e) {
    const g = this.graph;
    const st = e.style;
    const road = e.road;
    const s0 = e.trimA;
    const s1 = e.len - e.trimB;
    if (s1 - s0 < 1) return;
    const pts = g.sub(e, s0, s1);
    const hw = e.halfW;
    const sw = st.sidewalk;
    const W = this.w;
    const Y = 0.06;
    const YS = 0.1;

    this.ribbon(W.asphalt, pts, -hw, hw, Y, { across: 1 / 8, along: 1 / 8, w0: -hw, s0 });
    // kerb faces + kerb tops + sidewalks
    this.wallRibbon(W.curb, pts, hw, Y - 0.02, YS, -1);
    this.wallRibbon(W.curb, pts, -hw, Y - 0.02, YS, 1);
    this.ribbon(W.curb, pts, hw, hw + 0.3, YS, { across: 1 / 0.35, along: 1 / 2.4, swap: true });
    this.ribbon(W.curb, pts, -hw - 0.3, -hw, YS, { across: 1 / 0.35, along: 1 / 2.4, swap: true });
    this.ribbon(W.sidewalk, pts, hw + 0.3, hw + sw, YS, { world: 1 / 4 });
    this.ribbon(W.sidewalk, pts, -hw - sw, -hw - 0.3, YS, { world: 1 / 4 });

    const medianHalf = road.dual ? st.median / 2 : 0;
    if (road.dual) {
      this.ribbon(W.medianTop, pts, -medianHalf, medianHalf, 0.3, { world: 1 / 6 });
      this.wallRibbon(W.medianSide, pts, medianHalf, Y - 0.02, 0.3, 1);
      this.wallRibbon(W.medianSide, pts, -medianHalf, Y - 0.02, 0.3, -1);
    }

    // --- paint ---
    const YM = 0.065;
    const edgeLine = hw - 0.45;
    const junctionA = e.a.junction && e.a.arms.length >= 3;
    const junctionB = e.b.junction && e.b.arms.length >= 3;
    const total = this.eachSegment(pts, () => {});
    const dash = (lat, material, period = 9, len = 3) => {
      this.eachSegment(pts, (a, dir, sa, sb) => {
        const first = Math.ceil((sa - 2) / period) * period + 2;
        for (let s = first; s + len <= sb; s += period) {
          if (s < 6 || s + len > total - 6) continue;
          this.strip(material, a, dir, s - sa, s - sa + len, lat - 0.075, lat + 0.075, YM);
        }
      });
    };
    const solid = (lat, width, material) => {
      this.eachSegment(pts, (a, dir, sa, sb, len) => this.strip(material, a, dir, 0, len, lat - width / 2, lat + width / 2, YM));
    };
    const per = g.lanesPerDirection(e);
    if (road.dual) {
      solid(medianHalf + 0.25, 0.12, W.yellow);
      solid(-medianHalf - 0.25, 0.12, W.yellow);
      for (let l = 1; l < per; l++) {
        const lat = medianHalf + ((hw - medianHalf) / per) * l;
        dash(lat, W.white);
        dash(-lat, W.white);
      }
    } else if (st.centreLine) {
      dash(0, W.white, road.cls === "tertiary" ? 12 : 9, road.cls === "tertiary" ? 2.5 : 3);
    }
    if (st.edgeLines) {
      solid(edgeLine, 0.15, W.white);
      solid(-edgeLine, 0.15, W.white);
    }
    // zebra crossings + stop lines at busy junctions
    if (road.cls !== "tertiary") {
      const zebraAt = (sz, stopSide, stopS) => {
        this.eachSegment(pts, (a, dir, sa, sb) => {
          if (sz < sa || sz + 3.2 > sb) return;
          for (let lat = -hw + 0.9; lat <= hw - 0.9; lat += 1.0) {
            if (road.dual && Math.abs(lat) < medianHalf + 0.5) continue;
            this.strip(W.white, a, dir, sz - sa, sz - sa + 3.2, lat - 0.25, lat + 0.25, YM);
          }
          if (stopS >= sa && stopS + 0.4 <= sb) {
            const l0 = stopSide > 0 ? medianHalf + 0.3 : -hw + 0.5;
            const l1 = stopSide > 0 ? hw - 0.5 : -medianHalf - 0.3;
            this.strip(W.white, a, dir, stopS - sa, stopS - sa + 0.4, l0, l1, YM);
          }
        });
      };
      if (junctionA && total > 16) zebraAt(0.6, -1, 5.2);
      if (junctionB && total > 16) zebraAt(total - 3.8, 1, total - 5.6);
    }

    // --- street lamps ---
    let side = e.id % 2 === 0 ? 1 : -1;
    this.eachSegment(pts, (a, dir, sa, sb) => {
      const first = Math.ceil((sa - 10) / st.lampSpacing) * st.lampSpacing + 10;
      for (let s = first; s <= sb - 4; s += st.lampSpacing) {
        if (s > total - 8) continue;
        const sides = st.lampBothSides ? [1, -1] : [side];
        sides.forEach((sd) => {
          const lat = sd * (hw + 0.8);
          const x = a.x + dir.x * (s - sa) + dir.z * lat;
          const z = a.z + dir.z * (s - sa) - dir.x * lat;
          // the arm reaches back over the road: face = towards the centreline
          const face = Math.atan2(-dir.z * sd, dir.x * sd);
          this.addStreetlight(x, z, face);
        });
        side = -side;
      }
    });
  }

  buildJunction(node) {
    if (!node.junction || !node.poly) return;
    const W = this.w;
    this.fan(W.asphalt, node, node.poly, 0.06, 1 / 8);
    const arms = node.arms;
    const n = arms.length;
    let corners = 0;
    for (let i = 0; i < n; i++) {
      const a = arms[i];
      const b = arms[(i + 1) % n];
      if (n === 1 || a.gapNext > 3.5) continue;
      const anx = -a.dz;
      const anz = a.dx;
      const bnx = -b.dz;
      const bnz = b.dx;
      const ca = { x: node.x + a.dx * a.trim, z: node.z + a.dz * a.trim };
      const cb = { x: node.x + b.dx * b.trim, z: node.z + b.dz * b.trim };
      const kerbA = { x: ca.x + anx * a.w, z: ca.z + anz * a.w };
      const outA = { x: ca.x + anx * (a.w + a.sw), z: ca.z + anz * (a.w + a.sw) };
      const kerbB = { x: cb.x - bnx * b.w, z: cb.z - bnz * b.w };
      const outB = { x: cb.x - bnx * (b.w + b.sw), z: cb.z - bnz * (b.w + b.sw) };
      this.flatQuad(W.sidewalk, [kerbA, outA, outB, kerbB], 0.1, 1 / 4);
      // kerb face along the corner, facing the junction centre
      this.wallRibbon(W.curb, [kerbA, kerbB], 0, 0.04, 0.1, -1);
      this.wallRibbon(W.curb, [kerbA, kerbB], 0, 0.04, 0.1, 1);
      // signals at the big junctions
      const major = arms.some((x) => x.edge.road.cls === "primary") && n >= 3;
      if (major && corners < 2 && i % 2 === 0) {
        corners++;
        const px = (outA.x + outB.x) / 2 * 0.5 + (kerbA.x + kerbB.x) / 2 * 0.5;
        const pz = (outA.z + outB.z) / 2 * 0.5 + (kerbA.z + kerbB.z) / 2 * 0.5;
        this.addSignal(px, pz, Math.atan2(node.x - px, node.z - pz));
      }
    }
  }

  addSignal(x, z, face) {
    const k = this.kit;
    k.cylinder({ x, z, r: 0.1, h: 5.6, seg: 6, mat: k.mat.steel });
    const [ax, az] = [x + Math.sin(face) * 1.6, z + Math.cos(face) * 1.6];
    k.box({ x: (x + ax) / 2, z: (z + az) / 2, y: 5.4, w: 0.1, h: 0.1, d: 3.2, rot: face, side: k.mat.steel });
    k.box({ x: ax, z: az, y: 4.3, w: 0.42, h: 1.2, d: 0.32, rot: face, side: k.mat.dark });
    const lens = [0xff2a1a, 0xffb000, 0x1aff6a];
    const lit = Math.floor(this.rng() * 3);
    lens.forEach((col, i) => {
      const m = i === lit ? this.neon(col, 1.2, 3.2) : this.neon(col, 0.08, 0.12);
      k.quad({ mat: m, x: ax + Math.sin(face + Math.PI) * 0.17, z: az + Math.cos(face + Math.PI) * 0.17, y: 5.12 - i * 0.37, w: 0.26, h: 0.26, rot: face + Math.PI });
    });
  }

  // Parapets where roads cross rivers.
  buildBridges() {
    const k = this.kit;
    const inter = (p, q, r, s) => {
      const d = (q.x - p.x) * (s.z - r.z) - (q.z - p.z) * (s.x - r.x);
      if (Math.abs(d) < 1e-9) return null;
      const t = ((r.x - p.x) * (s.z - r.z) - (r.z - p.z) * (s.x - r.x)) / d;
      const u = ((r.x - p.x) * (q.z - p.z) - (r.z - p.z) * (q.x - p.x)) / d;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
    };
    this.graph.edges.forEach((e) => {
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i];
        const b = e.pts[i + 1];
        this.riverSegments.forEach((r) => {
          const t = inter(a, b, { x: r.ax, z: r.az }, { x: r.bx, z: r.bz });
          if (t === null) return;
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
          const cx = a.x + (b.x - a.x) * t;
          const cz = a.z + (b.z - a.z) * t;
          const span = r.halfW * 2 + 16;
          const rot = Math.atan2(dir.x, dir.z);
          [-1, 1].forEach((sd) => {
            const lat = sd * (e.halfW + e.style.sidewalk + 0.2);
            const px = cx + dir.z * lat;
            const pz = cz - dir.x * lat;
            k.box({ x: px, z: pz, w: 0.35, h: 1.1, d: span, rot, side: k.mat.plain, top: k.mat.plain, tint: window.CityKit.tint("#d8d4c8") });
            this.addCollider(px, 0.55, pz, 0.18, 0.55, span / 2, rot);
          });
          // deck edge seen from the water
          k.box({ x: cx, z: cz, y: -0.9, w: (e.halfW + e.style.sidewalk) * 2 + 0.8, h: 0.95, d: span, rot, side: k.mat.concrete, top: null });
          this.bridges = this.bridges || [];
          this.bridges.push({ x: cx, z: cz, road: e.road.name, river: r.river.name });
        });
      }
    });
  }

  addStreetlight(x, z, angle) {
    const S = this.surfaceManager;
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 9.2, 6), S.steelMaterial);
    pole.position.y = 4.6;
    pole.castShadow = true;
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), S.steelMaterial);
    arm.position.set(0, 9.1, 1.0);
    arm.rotation.x = 0.12;
    group.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.75), this.lampHousingMat);
    head.position.set(0, 9.0, 1.95); // (no shadow: the pole's shadow reads fine)
    group.add(head);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.62), this.lampLensMat);
    lens.position.set(0, 8.91, 1.95);
    group.add(lens);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 8.2, 10, 1, true), this.lampConeMat);
    cone.position.set(0, 4.8, 1.95);
    group.add(cone);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), this.lampPoolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.1, 1.95);
    group.add(pool);
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    group.updateMatrixWorld(true);
    this.streetLamps.push(new THREE.Vector3(0, 8.9, 1.95).applyMatrix4(group.matrixWorld));
    this.batcher.add(group);
  }

  // --- 4. Kochi Metro Pink Line (viaduct under construction) --------------------------------------
  polyline(points) {
    const pts = points.map((p) => ({ x: p.x, z: p.z }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    return { pts, cum, len: cum[cum.length - 1] };
  }

  project(poly, x, z) {
    let best = Infinity;
    let bestS = 0;
    for (let i = 0; i < poly.pts.length - 1; i++) {
      const a = poly.pts[i];
      const b = poly.pts[i + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / l2)) : 0;
      const d = Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
      if (d < best) {
        best = d;
        bestS = poly.cum[i] + t * Math.sqrt(l2);
      }
    }
    return bestS;
  }

  at(poly, s) {
    s = Math.max(0, Math.min(poly.len, s));
    let i = 0;
    while (i < poly.cum.length - 2 && poly.cum[i + 1] < s) i++;
    const a = poly.pts[i];
    const b = poly.pts[i + 1];
    const l = Math.max(1e-6, poly.cum[i + 1] - poly.cum[i]);
    const t = (s - poly.cum[i]) / l;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / l, dz: (b.z - a.z) / l };
  }

  slice(poly, sA, sB) {
    const out = [this.at(poly, sA)];
    const lo = Math.min(sA, sB);
    const hi = Math.max(sA, sB);
    const mid = [];
    for (let i = 1; i < poly.pts.length - 1; i++) if (poly.cum[i] > lo + 0.5 && poly.cum[i] < hi - 0.5) mid.push(poly.pts[i]);
    if (sB < sA) mid.reverse();
    mid.forEach((p) => out.push({ x: p.x, z: p.z }));
    out.push(this.at(poly, sB));
    return out.map((p) => ({ x: p.x, z: p.z }));
  }

  buildMetro() {
    const metro = this.geo.metro;
    const roadPoly = (id) => this.polyline(this.roads.find((r) => r.id === id).points);
    const route = [];
    let cursor = metro.start;
    metro.route.forEach((id, i) => {
      const poly = roadPoly(id);
      const next = i + 1 < metro.route.length ? roadPoly(metro.route[i + 1]) : null;
      const sA = this.project(poly, cursor.x, cursor.z);
      let sB;
      if (next) {
        // hand over where this road meets the next one
        let best = Infinity;
        poly.pts.forEach((p, k) => {
          const d = Math.hypot(p.x - next.pts[0].x, p.z - next.pts[0].z);
          const e = Math.min(d, ...next.pts.map((q) => Math.hypot(p.x - q.x, p.z - q.z)));
          if (e < best) {
            best = e;
            sB = poly.cum[k];
          }
        });
      } else sB = poly.len;
      const part = this.slice(poly, sA, sB);
      part.forEach((p, k) => {
        if (route.length && k === 0 && Math.hypot(p.x - route[route.length - 1].x, p.z - route[route.length - 1].z) < 1) return;
        route.push(p);
      });
      cursor = part[part.length - 1];
    });
    const poly = this.polyline(route);
    this.metroRoute = poly;
    const k = this.kit;
    const pillars = [];
    const spacing = 30;
    const nearJunction = (x, z) => this.graph.nodes.some((n) => n.junction && Math.hypot(n.x - x, n.z - z) < 24);
    for (let s = 15; s < poly.len - 10; s += spacing) {
      const p = this.at(poly, s);
      if (nearJunction(p.x, p.z)) continue;
      pillars.push({ s, p });
      const rot = Math.atan2(p.dx, p.dz);
      k.cylinder({ x: p.x, z: p.z, r: 0.95, h: 10.6, seg: 10, mat: k.mat.concrete, cap: false });
      k.box({ x: p.x, z: p.z, y: 10.6, w: 4.4, h: 1.3, d: 2.2, rot, side: k.mat.concrete });
      this.addCollider(p.x, 5.3, p.z, 0.95, 5.3, 0.95, rot);
    }
    // U-girder deck spans; a few are still missing (under construction)
    const stationS = metro.stations.map((st) => ({ st, s: this.project(poly, st.x, st.z) }));
    for (let i = 0; i < pillars.length - 1; i++) {
      const A = pillars[i];
      const B = pillars[i + 1];
      if (B.s - A.s > 75) continue;
      if (i % 6 === 4 || (A.s > poly.len - 190 && i % 2 === 1)) continue;
      const mx = (A.p.x + B.p.x) / 2;
      const mz = (A.p.z + B.p.z) / 2;
      const len = Math.hypot(B.p.x - A.p.x, B.p.z - A.p.z);
      const rot = Math.atan2(B.p.x - A.p.x, B.p.z - A.p.z);
      k.box({ x: mx, z: mz, y: 11.9, w: 8.4, h: 0.5, d: len, rot, side: k.mat.concrete });
      [-1, 1].forEach((sd) => {
        const ox = Math.cos(rot) * 4.0 * sd;
        const oz = -Math.sin(rot) * 4.0 * sd;
        k.box({ x: mx + ox, z: mz + oz, y: 12.4, w: 0.4, h: 1.3, d: len, rot, side: k.mat.concrete });
      });
      this.addCollider(mx, 12.4, mz, 4.2, 0.9, len / 2, rot);
    }
    // elevated stations
    stationS.forEach(({ st, s }) => {
      const p = this.at(poly, s);
      const rot = Math.atan2(p.dx, p.dz);
      const glass = k.mat.glassB;
      k.box({ x: p.x, z: p.z, y: 11.3, w: 22, h: 7.5, d: 72, rot, side: glass, top: k.mat.roof, tileW: 12, tileH: 14 });
      k.gableRoof({ x: p.x, z: p.z, y: 18.8, w: 74, d: 24, rot: rot + Math.PI / 2, rise: 2.6, mat: k.mat.sheet, tint: window.CityKit.tint("#c9d3dc"), overhang: 0.8 });
      // station concourse legs on both sidewalks
      [-1, 1].forEach((sd) => {
        [-24, 24].forEach((along) => {
          const lx = Math.cos(rot) * 12.5 * sd + Math.sin(rot) * along;
          const lz = -Math.sin(rot) * 12.5 * sd + Math.cos(rot) * along;
          k.box({ x: p.x + lx, z: p.z + lz, w: 1.6, h: 11.3, d: 1.6, rot, side: k.mat.concrete });
          this.addCollider(p.x + lx, 5.6, p.z + lz, 0.8, 5.6, 0.8, rot);
        });
      });
      this.addCollider(p.x, 15, p.z, 11, 3.8, 36, rot);
      const cell = k.board(`${st.name.toUpperCase()}`, { bg: "#d8216f", fg: "#ffffff", border: "#ffffff", sub: "#ffe3f0" }, "KOCHI METRO • PINK LINE");
      [-1, 1].forEach((sd) => {
        const ox = Math.cos(rot) * 11.1 * sd;
        const oz = -Math.sin(rot) * 11.1 * sd;
        k.quad({ mat: k.mat.boards, x: p.x + ox, z: p.z + oz, y: 15.4, w: 12, h: 3, rot: rot + (sd > 0 ? Math.PI / 2 : -Math.PI / 2), uv: cell });
      });
    });
    this.metroStations = stationS.map(({ st }) => st);
  }

  // --- 5. Landmarks: real places, invented looks ----------------------------------------------------
  // Footprint (w along the facing road, d depth) per kind.
  static get LANDMARK_SIZES() {
    return {
      collectorate: [104, 70],
      bus_stand: [78, 34],
      police_station: [30, 20],
      infopark: [64, 36],
      infopark2: [44, 44],
      smartcity: [96, 46],
      kinfra: [120, 80],
      csez: [140, 110],
      water_metro: [40, 22],
      temple: [74, 74],
      college: [80, 48],
      college_small: [56, 30],
      hospital: [52, 34],
      hospital_small: [46, 30],
      campus: [110, 70],
      mosque: [22, 20],
      thattukada: [30, 10],
    };
  }

  placeLandmarks() {
    this.placedLandmarks = [];
    const sizes = KakkanadMapManager.LANDMARK_SIZES;
    this.geo.landmarks.forEach((lm) => {
      const [w, d] = sizes[lm.kind] || [30, 30];
      const road = this.graph.nearest(lm.x, lm.z, 600);
      let x = lm.x;
      let z = lm.z;
      let rot = 0;
      if (road) {
        // face the nearest road and stand clear of it
        let nx = x - road.x;
        let nz = z - road.z;
        let dist = Math.hypot(nx, nz);
        if (dist < 1e-3) {
          nx = road.dz;
          nz = -road.dx;
          dist = 1;
        }
        nx /= dist;
        nz /= dist;
        const need = road.edge.halfW + road.edge.style.sidewalk + d / 2 + 6;
        if (dist < need) {
          x = road.x + nx * need;
          z = road.z + nz * need;
        }
        rot = Math.atan2(-nx, -nz);
      }
      if (lm.kind === "temple") rot = Math.PI / 2; // Kerala temples face east
      const f = { x, z, hw: w / 2, hd: d / 2, rot, lm };
      // nudge until clear of every road (landmarks ignore each other)
      const wet = lm.kind === "water_metro";
      if (!this.footprintClear(f, 2, 1.5, wet)) {
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        let found = false;
        for (let r = 4; r <= 64 && !found; r += 4) {
          for (const [lx, lz] of [
            [0, -r],
            [r, -r * 0.5],
            [-r, -r * 0.5],
            [r, 0],
            [-r, 0],
          ]) {
            const g = Object.assign({}, f, { x: x + lx * c + lz * s, z: z - lx * s + lz * c });
            if (this.footprintClear(g, 2, 1.5, wet)) {
              f.x = g.x;
              f.z = g.z;
              found = true;
              break;
            }
          }
        }
      }
      this.reserve(f);
      this.placedLandmarks.push(f);
    });
  }

  buildLandmarks() {
    this.placedLandmarks.forEach((f) => {
      const fn = this[`lm_${f.lm.kind}`];
      if (fn) fn.call(this, f, f.lm);
      const ref = this.landmarks.find((l) => l.id === f.lm.id);
      if (ref) {
        // radar / missions read the final position
        this.landmarkPositions = this.landmarkPositions || {};
        this.landmarkPositions[f.lm.id] = { x: f.x, z: f.z, rot: f.rot };
      }
    });
  }

  // Local helpers for landmark builders (lx along the frontage, lz towards the road).
  L(f, lx, lz) {
    return window.CityKit.local(f, lx, lz);
  }

  lbox(f, lx, lz, o) {
    const [x, z] = this.L(f, lx, lz);
    this.kit.box(Object.assign({ x, z, rot: f.rot }, o));
    if (o.collide !== false && o.h > 1.2) this.addCollider(x, (o.y || 0) + o.h / 2, z, o.w / 2, o.h / 2, o.d / 2, f.rot + (o.rotOff || 0));
  }

  sign(f, text, style, sub, lx, lz, y, w, h, rotOff = 0) {
    const [x, z] = this.L(f, lx, lz);
    const cell = this.kit.board(text, style, sub);
    this.kit.quad({ mat: this.kit.mat.boards, x, z, y, w, h, rot: f.rot + rotOff, uv: cell });
  }

  // two-post roadside name board facing the road
  postBoard(f, text, style, sub, lx, lz, w = 6, h = 1.5) {
    const k = this.kit;
    [-1, 1].forEach((sd) => {
      const [px, pz] = this.L(f, lx + sd * (w / 2 - 0.2), lz - 0.05);
      k.cylinder({ x: px, z: pz, r: 0.06, h: 2.2 + h, seg: 5, mat: k.mat.steel });
    });
    this.sign(f, text, style, sub, lx, lz, 2.1, w, h);
  }

  lawn(f, lx, lz, w, d) {
    const [x, z] = this.L(f, lx, lz);
    this.kit.box({ x, z, y: 0, w, h: 0.08, d, rot: f.rot, side: null, top: this.kit.mat.lawn, cast: false });
  }

  lm_collectorate(f) {
    const k = this.kit;
    const cream = window.CityKit.tint("#efe6d2");
    const trim = window.CityKit.tint("#8a5a3c");
    // U-shaped 4-storey civil station around a courtyard, entrance block in front
    this.lbox(f, 0, -18, { w: 96, h: 14.4, d: 18, side: k.mat.plaster, top: k.mat.roof, tint: cream, tileW: 9, tileH: 13.6 });
    this.lbox(f, -39, 6, { w: 18, h: 14.4, d: 34, side: k.mat.plaster, top: k.mat.roof, tint: cream, tileW: 9, tileH: 13.6 });
    this.lbox(f, 39, 6, { w: 18, h: 14.4, d: 34, side: k.mat.plaster, top: k.mat.roof, tint: cream, tileW: 9, tileH: 13.6 });
    this.lbox(f, 0, 16, { w: 30, h: 10.2, d: 12, side: k.mat.plaster, top: k.mat.roof, tint: cream, tileW: 9, tileH: 13.6 });
    // sunshade bands
    for (let fl = 1; fl <= 4; fl++) {
      this.lbox(f, 0, -8.6, { y: fl * 3.4 - 0.9, w: 96.4, h: 0.12, d: 0.9, side: k.mat.plain, tint: trim, collide: false });
    }
    // portico with columns
    this.lbox(f, 0, 26, { y: 6.2, w: 20, h: 0.6, d: 8, side: k.mat.plain, top: k.mat.plain, tint: cream, collide: false });
    [-8, -3, 3, 8].forEach((lx) => {
      const [x, z] = this.L(f, lx, 29.3);
      k.cylinder({ x, z, r: 0.35, h: 6.2, seg: 8, mat: k.mat.plain, tint: cream });
    });
    this.sign(f, "CIVIL STATION, KAKKANAD", { bg: "#6e4527", fg: "#fff4dc", border: "#e0c38a", sub: "#ffe7b0" }, "ERNAKULAM DISTRICT COLLECTORATE", 0, 22.12, 7.4, 17, 2.3);
    // flag mast + boundary wall with gate
    const [mx, mz] = this.L(f, 18, 30);
    k.cylinder({ x: mx, z: mz, r: 0.09, h: 12, seg: 6, mat: this.whitePaintMat });
    [-1, 1].forEach((sd) => this.lbox(f, sd * 30, f.hd + 1, { w: 44, h: 1.6, d: 0.3, side: k.mat.plain, top: k.mat.plain, tint: cream }));
    this.lawn(f, 0, 3, 56, 26);
  }

  lm_bus_stand(f) {
    const k = this.kit;
    const S = this.surfaceManager;
    // bus bays: long sheet roof on pillars, with a shopping block behind
    this.lbox(f, 0, 2, { y: 7.2, w: 70, h: 0.35, d: 18, side: k.mat.sheet, top: k.mat.sheet, tint: window.CityKit.tint("#3c78b5"), collide: false });
    for (let lx = -32; lx <= 32; lx += 8) {
      [-6, 8].forEach((lz) => {
        const [x, z] = this.L(f, lx, lz);
        k.cylinder({ x, z, r: 0.28, h: 7.2, seg: 8, mat: k.mat.concrete });
        this.addCollider(x, 3.6, z, 0.3, 3.6, 0.3);
      });
    }
    this.lbox(f, 0, -12, { w: 74, h: 7.2, d: 10, side: k.mat.shopfront, top: k.mat.roof, tileW: 12, tileH: 3.6 });
    this.lbox(f, 0, 4, { w: 60, h: 0.45, d: 3, side: k.mat.plain, top: k.mat.plain, tint: window.CityKit.tint("#d9d2c2"), collide: false });
    this.sign(f, "KAKKANAD BUS STAND", { bg: "#b3121c", fg: "#ffffff", border: "#ffd23f", sub: "#ffe08a" }, "PRIVATE BUS STAND • THRIKKAKARA MUNICIPALITY", 0, 11.2, 7.6, 20, 2.4);
  }

  lm_police_station(f, lm) {
    const k = this.kit;
    this.lbox(f, 0, -2, { w: 26, h: 7, d: 14, side: k.mat.plaster, top: k.mat.roof, tint: window.CityKit.tint("#e9dcc4"), tileW: 9, tileH: 12.8 });
    this.lbox(f, 0, 6.5, { y: 3.1, w: 26.4, h: 0.14, d: 1.2, side: k.mat.plain, tint: window.CityKit.tint("#7d2d25"), collide: false });
    this.sign(f, lm.name.toUpperCase(), { bg: "#20315e", fg: "#ffffff", border: "#ffd23f", sub: "#ffd23f" }, "KERALA POLICE", 0, 5.14, 3.6, 16, 1.9);
    const [mx, mz] = this.L(f, 11, 9);
    k.cylinder({ x: mx, z: mz, r: 0.08, h: 9, seg: 6, mat: this.whitePaintMat });
  }

  lm_infopark(f) {
    const k = this.kit;
    // Athulya: park office, stepped glass block
    this.lbox(f, 0, 0, { w: 60, h: 5, d: 34, side: k.mat.plain, top: k.mat.roof, tint: window.CityKit.tint("#e8e8e4") });
    this.lbox(f, 0, 0, { y: 5, w: 54, h: 26, d: 28, side: k.mat.glassB, top: k.mat.roof, tileW: 12, tileH: 14 });
    this.lbox(f, 0, 0, { y: 31, w: 55, h: 1.4, d: 29, side: k.mat.steel, top: k.mat.roof, collide: false });
    this.sign(f, "ATHULYA", { bg: "#0d1b24", fg: "#7ff3ff", border: "#35d6ea", sub: "#bff8ff" }, "INFOPARK KOCHI", 0, 14.3, 25, 14, 3.5);
    this.lawn(f, 0, 26, 50, 14);
    // Infopark entrance sign at the gate
    const gate = this.graph.nodes.find((n) => Math.hypot(n.x - 1131, n.z - 863) < 3);
    if (gate) {
      const g = { x: gate.x - 26, z: gate.z - 20, rot: Math.PI * 0.75, hd: 0 };
      this.sign(g, "INFOPARK", { bg: "#0d1b24", fg: "#7ff3ff", border: "#35d6ea", sub: "#ffffff" }, "KOCHI • PHASE 1", 0, 0, 0.4, 12, 3.4);
    }
    // Thejomaya and Vismaya inside the Phase 1 loop road
    const inLoop = [
      ["THEJOMAYA", 1335, 705, 16, 44, 30, 0.12, "glassA"],
      ["VISMAYA", 1400, 790, 11, 36, 26, 0.05, "glassC"],
    ];
    inLoop.forEach(([name, x, z, floors, w, d, rot, glass]) => {
      const g = { x, z, hw: w / 2, hd: d / 2, rot: rot + Math.PI };
      if (!this.footprintClear(g, 2, 1.0)) {
        g.x += 10;
        if (!this.footprintClear(g, 2, 1.0)) return;
      }
      this.reserve(g);
      const H = this.kit.office(Object.assign({ floors, glass: glass === "glassA" ? 0 : 2, podiumTint: window.CityKit.tint("#cfd3d6"), fin: true }, g, { w, d }), this.rng);
      this.addCollider(g.x, H / 2, g.z, w / 2 + 3, H / 2, d / 2 + 3, g.rot);
      this.sign(Object.assign({}, g, { hd: d / 2 }), name, { bg: "#0d1b24", fg: "#7ff3ff", border: "#35d6ea" }, "", 0, d / 2 + 0.25, H - 4, w * 0.5, w * 0.125);
      this.stats.buildings++;
    });
  }

  lm_infopark2(f) {
    const H = this.kit.office(Object.assign({ floors: 14, glass: 1, podiumTint: window.CityKit.tint("#d7dade"), fin: true }, f, { w: 38, d: 38 }), this.rng);
    this.addCollider(f.x, H / 2, f.z, 22, H / 2, 22, f.rot);
    this.sign(f, "JYOTHIRMAYA", { bg: "#0d1b24", fg: "#7ff3ff", border: "#35d6ea" }, "", 0, 19.3, H - 5, 20, 5);
    this.postBoard(f, "INFOPARK PHASE 2", { bg: "#0d1b24", fg: "#7ff3ff", border: "#35d6ea", sub: "#ffffff" }, "KAKKANAD", 0, f.hd + 4, 8, 2);
  }

  lm_smartcity(f) {
    const k = this.kit;
    // SCK 01: two linked glass wings on a podium
    this.lbox(f, 0, 0, { w: 96, h: 6, d: 46, side: k.mat.plain, top: k.mat.roof, tint: window.CityKit.tint("#e6e8ea") });
    [-26, 26].forEach((lx) => this.lbox(f, lx, 0, { y: 6, w: 40, h: 38, d: 36, side: k.mat.glassA, top: k.mat.roof, tileW: 12, tileH: 14 }));
    this.lbox(f, 0, 0, { y: 26, w: 14, h: 14, d: 20, side: k.mat.glassB, top: k.mat.roof, tileW: 12, tileH: 14 });
    this.sign(f, "SMARTCITY KOCHI", { bg: "#f4f6f4", fg: "#0f7b3f", border: "#39ff14", sub: "#1b1b1b" }, "SCK 01", 0, 23.1, 1.2, 22, 3.6);
    this.lawn(f, 0, 30, 90, 12);
  }

  shedsIn(f, count, tint, roofTint, h = 9) {
    const cols = Math.ceil(Math.sqrt(count));
    const cw = (f.hw * 2) / cols;
    const rows = Math.ceil(count / cols);
    const rd = (f.hd * 2) / rows;
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && n < count; c++, n++) {
        const lx = -f.hw + cw * (c + 0.5);
        const lz = -f.hd + rd * (r + 0.5);
        const [x, z] = this.L(f, lx, lz);
        const lot = { x, z, rot: f.rot, w: cw - 10, d: rd - 14, h, tint, roofTint, officeTint: window.CityKit.tint("#e9e2d2") };
        const H = this.kit.shed(lot, this.rng);
        this.addCollider(x, H / 2, z, lot.w / 2, H / 2, lot.d / 2, f.rot);
        this.stats.buildings++;
      }
    }
  }

  lm_csez(f) {
    this.shedsIn(f, 6, window.CityKit.tint("#dfe6ec"), window.CityKit.tint("#5d7f9e"));
    // gate arch towards Seaport-Airport Road
    const k = this.kit;
    [-9, 9].forEach((lx) => this.lbox(f, lx, f.hd + 3, { w: 1.6, h: 7, d: 1.6, side: k.mat.plain, top: k.mat.plain, tint: window.CityKit.tint("#c9c1b0") }));
    this.lbox(f, 0, f.hd + 3, { y: 7, w: 20, h: 1.8, d: 1.6, side: k.mat.plain, top: k.mat.plain, tint: window.CityKit.tint("#c9c1b0") });
    this.sign(f, "COCHIN SPECIAL ECONOMIC ZONE", { bg: "#2d2f73", fg: "#ffffff", border: "#ffd23f", sub: "#ffd23f" }, "GOVERNMENT OF INDIA", 0, f.hd + 3.85, 7.05, 19, 1.7);
  }

  lm_kinfra(f) {
    this.shedsIn(f, 4, window.CityKit.tint("#e5e1d8"), window.CityKit.tint("#9e3b2f"), 8);
    this.postBoard(f, "KINFRA", { bg: "#0f5f8a", fg: "#ffffff", border: "#ffffff", sub: "#dff3ff" }, "EXPORT PROMOTION INDUSTRIAL PARK", 0, f.hd + 4, 9, 2.2);
  }

  lm_water_metro(f) {
    const k = this.kit;
    // terminal: glass box under a curved white roof, pontoon jetty and a boat
    this.lbox(f, 0, 0, { w: 34, h: 5.2, d: 16, side: k.mat.glassC, top: k.mat.roof, tileW: 12, tileH: 14 });
    k.gableRoof({ x: f.x, z: f.z, y: 5.2, w: 40, d: 22, rot: f.rot, rise: 2.2, mat: k.mat.sheet, tint: window.CityKit.tint("#f2f4f6"), overhang: 1.2 });
    this.sign(f, "KOCHI WATER METRO", { bg: "#0b3d91", fg: "#ffffff", border: "#26c6da", sub: "#b2ebf2" }, "KAKKANAD TERMINAL", 0, 8.3, 5.4, 16, 2.4);
    // pontoon and boat towards the river (behind the terminal)
    this.lbox(f, 0, -18, { y: 0.1, w: 28, h: 0.7, d: 8, side: k.mat.concrete, top: k.mat.concrete, collide: false });
    const [bx, bz] = this.L(f, 0, -26);
    k.box({ x: bx, z: bz, y: 0.1, w: 7, h: 1.3, d: 24, rot: f.rot + Math.PI / 2, side: k.mat.plain, top: k.mat.plain, tint: window.CityKit.tint("#f4f6f8") });
    k.box({ x: bx, z: bz, y: 1.4, w: 6.2, h: 2.3, d: 16, rot: f.rot + Math.PI / 2, side: k.mat.glassB, top: k.mat.plain, tileW: 6, tileH: 7 });
    k.box({ x: bx, z: bz, y: 0.95, w: 7.1, h: 0.35, d: 24.2, rot: f.rot + Math.PI / 2, side: k.mat.plain, tint: window.CityKit.tint("#1e88e5"), top: null });
  }

  lm_temple(f) {
    const k = this.kit;
    const laterite = window.CityKit.tint("#9c4f36");
    const lime = window.CityKit.tint("#efe9dc");
    const tile = window.CityKit.tint("#b0583c");
    const R = 34;
    // compound wall with the eastern gopuram
    [
      [0, -R, 2 * R, 0.8],
      [-R, 0, 0.8, 2 * R],
      [R, 0, 0.8, 2 * R],
    ].forEach(([lx, lz, w, d]) => this.lbox(f, lx, lz, { w, h: 2.4, d, side: k.mat.plain, top: k.mat.plain, tint: laterite }));
    [-1, 1].forEach((sd) => this.lbox(f, sd * (R / 2 + 4), R, { w: R - 8, h: 2.4, d: 0.8, side: k.mat.plain, top: k.mat.plain, tint: laterite }));
    // gopuram (gatehouse) with a two-tier tiled roof
    this.lbox(f, 0, R, { w: 10, h: 4.2, d: 6, side: k.mat.plain, top: null, tint: lime });
    const [gx, gz] = this.L(f, 0, R);
    k.hipRoof({ x: gx, z: gz, y: 4.2, w: 12, d: 8, rot: f.rot, rise: 2.2, mat: k.mat.tile, tint: tile, overhang: 0.8 });
    k.hipRoof({ x: gx, z: gz, y: 5.9, w: 7, d: 5, rot: f.rot, rise: 1.8, mat: k.mat.tile, tint: tile, overhang: 0.4 });
    // nalambalam (cloister) and the square sreekovil with a copper pyramid roof
    [
      [0, -14, 36, 6],
      [0, 14, 36, 6],
      [-15, 0, 6, 22],
      [15, 0, 6, 22],
    ].forEach(([lx, lz, w, d]) => {
      this.lbox(f, lx, lz, { w, h: 3.2, d, side: k.mat.plain, top: null, tint: lime });
      const [x, z] = this.L(f, lx, lz);
      k.hipRoof({ x, z, y: 3.2, w, d, rot: f.rot, rise: 2.0, mat: k.mat.tile, tint: tile, overhang: 0.9 });
    });
    this.lbox(f, 0, 0, { w: 9, h: 4.6, d: 9, side: k.mat.plain, top: null, tint: laterite });
    const [sx, sz] = this.L(f, 0, 0);
    k.hipRoof({ x: sx, z: sz, y: 4.6, w: 9, d: 9, rot: f.rot, rise: 5, mat: this.copperMat, overhang: 1.2, pyramid: true });
    const [kx, kz] = this.L(f, 0, 0);
    k.cylinder({ x: kx, z: kz, y: 9.6, r: 0.35, rTop: 0.05, h: 1.4, seg: 8, mat: this.goldMat });
    // golden flagstaff (dhwajasthambham) and lamp tower on the east axis
    const [fx, fz] = this.L(f, 0, 22);
    k.box({ x: fx, z: fz, w: 2.4, h: 1.2, d: 2.4, rot: f.rot, side: k.mat.plain, top: k.mat.plain, tint: laterite });
    k.cylinder({ x: fx, z: fz, y: 1.2, r: 0.28, rTop: 0.18, h: 15, seg: 8, mat: this.goldMat });
    this.addCollider(fx, 8, fz, 1.2, 8, 1.2);
    const [lx2, lz2] = this.L(f, 0, 27);
    k.cylinder({ x: lx2, z: lz2, r: 0.5, rTop: 0.3, h: 5.5, seg: 8, mat: k.mat.plain, tint: window.CityKit.tint("#6f6a60") });
    // temple pond (kulam) with laterite steps, just outside the south wall
    const [px, pz] = this.L(f, -R - 20, 0);
    k.box({ x: px, z: pz, y: 0, w: 22, h: 0.12, d: 22, rot: f.rot, side: k.mat.plain, top: k.mat.plain, tint: laterite });
    k.box({ x: px, z: pz, y: 0.1, w: 16, h: 0.05, d: 16, rot: f.rot, side: null, top: this.surfaceManager.waterMaterial });
    this.sign(f, "THRIKKAKARA", { bg: "#7a1f1f", fg: "#ffd34d", border: "#ffd34d", sub: "#fff1c1" }, "SREE VAMANAMOORTHY TEMPLE", 0, R + 3.05, 4.4, 9, 1.8);
  }

  lm_college(f, lm) {
    const k = this.kit;
    const cream = window.CityKit.tint("#efe2c4");
    const roofT = window.CityKit.tint("#a8563c");
    [
      [0, -12, 70, 14, 4],
      [-30, 8, 14, 26, 3],
      [30, 8, 14, 26, 3],
    ].forEach(([lx, lz, w, d, floors]) => {
      const [x, z] = this.L(f, lx, lz);
      const H = k.campusBlock({ x, z, rot: f.rot, w, d, floors, tint: cream, roofTint: roofT }, this.rng);
      this.addCollider(x, H / 2, z, w / 2, H / 2, d / 2, f.rot);
    });
    this.lawn(f, 0, 10, 44, 22);
    // arch gate with the name
    [-6, 6].forEach((lx) => this.lbox(f, lx, f.hd + 2, { w: 1.2, h: 6, d: 1.2, side: k.mat.plain, top: k.mat.plain, tint: cream }));
    this.lbox(f, 0, f.hd + 2, { y: 6, w: 14, h: 1.6, d: 1.2, side: k.mat.plain, top: k.mat.plain, tint: cream });
    this.sign(f, lm.name.toUpperCase(), { bg: "#5b1f1f", fg: "#ffe9b0", border: "#ffe9b0", sub: "#ffffff" }, "THRIKKAKARA", 0, f.hd + 2.65, 6.05, 13, 1.5);
  }

  lm_college_small(f, lm) {
    const k = this.kit;
    const H = k.campusBlock({ x: f.x, z: f.z, rot: f.rot, w: 52, d: 16, floors: 3, tint: window.CityKit.tint("#e8dcc8"), roofTint: window.CityKit.tint("#9a4a33") }, this.rng);
    this.addCollider(f.x, H / 2, f.z, 26, H / 2, 8, f.rot);
    this.postBoard(f, lm.name.toUpperCase(), { bg: "#5b1f1f", fg: "#ffe9b0", border: "#ffe9b0", sub: "#ffffff" }, "THRIKKAKARA", 0, f.hd + 3, 9, 1.8);
  }

  lm_hospital(f, lm) {
    const k = this.kit;
    this.lbox(f, 0, 0, { w: 52, h: 5, d: 34, side: k.mat.plain, top: k.mat.roof, tint: window.CityKit.tint("#f4f4f2") });
    this.lbox(f, 0, -2, { y: 5, w: 46, h: 26, d: 26, side: k.mat.flats, top: k.mat.roof, tint: window.CityKit.tint("#f6f7f8"), tileW: 12, tileH: 12.4 });
    this.lbox(f, 14, 12.2, { y: 5, w: 12, h: 26, d: 1.6, side: k.mat.glassB, top: k.mat.plain, tileW: 12, tileH: 14 });
    // ambulance canopy
    this.lbox(f, -10, 21, { y: 4.2, w: 18, h: 0.4, d: 8, side: k.mat.plain, top: k.mat.plain, tint: window.CityKit.tint("#e8eef4"), collide: false });
    this.sign(f, lm.name.toUpperCase(), { bg: "#ffffff", fg: "#d7141a", border: "#1f4aa8", sub: "#1f4aa8" }, "MULTI SPECIALITY • 24 HRS EMERGENCY", 0, 17.12, 27.5, 22, 3.2);
  }

  lm_hospital_small(f, lm) {
    const k = this.kit;
    const H = k.campusBlock({ x: f.x, z: f.z, rot: f.rot, w: 40, d: 18, floors: 2, tint: window.CityKit.tint("#f1ece0"), roofTint: window.CityKit.tint("#9a4a33") }, this.rng);
    this.addCollider(f.x, H / 2, f.z, 20, H / 2, 9, f.rot);
    this.postBoard(f, lm.name.toUpperCase(), { bg: "#ffffff", fg: "#1f4aa8", border: "#d7141a", sub: "#d7141a" }, "ATHANI, KAKKANAD", 0, f.hd + 3, 8, 1.8);
  }

  lm_campus(f) {
    const brick = window.CityKit.tint("#b86b4b");
    const roofT = window.CityKit.tint("#8e3b2a");
    [
      [-30, -10, 36, 16, 4],
      [24, -14, 30, 16, 3],
      [-6, 20, 40, 14, 3],
    ].forEach(([lx, lz, w, d, floors]) => {
      const [x, z] = this.L(f, lx, lz);
      const H = this.kit.campusBlock({ x, z, rot: f.rot, w, d, floors, tint: brick, roofTint: roofT }, this.rng);
      this.addCollider(x, H / 2, z, w / 2, H / 2, d / 2, f.rot);
    });
    this.postBoard(f, "RAJAGIRI", { bg: "#1b3a6b", fg: "#ffffff", border: "#ffd23f", sub: "#ffd23f" }, "RAJAGIRI VALLEY CAMPUS", 0, f.hd + 3, 8, 2);
  }

  lm_mosque(f, lm) {
    const k = this.kit;
    const white = window.CityKit.tint("#f7f7f2");
    this.lbox(f, 0, 0, { w: 18, h: 7, d: 14, side: k.mat.plain, top: k.mat.plain, tint: white });
    // dome and two minarets (mesh path: a few curved parts)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.domeMat);
    dome.position.set(f.x, 7, f.z);
    dome.castShadow = true;
    dome.receiveShadow = true;
    this.batcher.add(dome);
    [-1, 1].forEach((sd) => {
      const [x, z] = this.L(f, sd * 8.2, 6.2);
      k.cylinder({ x, z, r: 0.7, rTop: 0.55, h: 15, seg: 8, mat: k.mat.plain, tint: white });
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 8), this.domeMat);
      cap.position.set(x, 16.1, z);
      cap.castShadow = true;
      this.batcher.add(cap);
      this.addCollider(x, 7.5, z, 0.7, 7.5, 0.7);
    });
    this.sign(f, lm.name.toUpperCase(), { bg: "#0f6b3f", fg: "#ffffff", border: "#ffd23f", sub: "#e8ffe8" }, "", 0, 7.12, 4.4, 12, 1.4);
  }

  lm_thattukada(f) {
    const k = this.kit;
    [-10, 0, 10].forEach((lx, i) => {
      this.lbox(f, lx, 0, { w: 4.8, h: 2.5, d: 3.2, side: this.woodMat, top: null });
      const [x, z] = this.L(f, lx, 0);
      k.hipRoof({ x, z, y: 2.5, w: 4.8, d: 3.2, rot: f.rot, rise: 1.3, mat: k.mat.tile, tint: window.CityKit.tint("#b0583c"), overhang: 0.6 });
      const [lampX, lampZ] = this.L(f, lx, 1.9);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), this.neon(0xffc56b, 1.0, 5.0));
      lamp.position.set(lampX, 2.2, lampZ);
      this.batcher.add(lamp);
      this.sign(Object.assign({}, f), ["CHAYA KADA", "THATTUKADA", "PUTTU & KADALA"][i], { bg: "#f5c400", fg: "#b3121c", border: "#b3121c" }, "", lx, 1.72, 2.55, 3.4, 0.7);
      // benches
      this.lbox(f, lx, 3.6, { w: 3.2, h: 0.45, d: 0.5, side: this.woodMat, top: this.woodMat, collide: false });
    });
  }

  // --- 6. The hallucinated city ---------------------------------------------------------------------
  zoneAt(x, z, fallback) {
    for (const zn of this.geo.zones) {
      if (Math.hypot(x - zn.x, z - zn.z) < zn.radius) return zn.zone;
    }
    return fallback;
  }

  pick(arr) {
    return arr[Math.floor(this.rng() * arr.length)];
  }

  range(a, b) {
    return a + (b - a) * this.rng();
  }

  static get PALETTE() {
    return {
      shop: ["#f2e6c8", "#e8d4a8", "#cfe3d0", "#f0d6cf", "#d7e3ef", "#f4f1ea", "#e9c9a0", "#d9e8c8", "#f3dfa6", "#e3d7ee", "#f5d28a", "#c7e2e8"],
      house: ["#f6f2e8", "#f1d98f", "#cfe8b8", "#f6c9b4", "#bfdcf0", "#fbf6ee", "#e8d27a", "#b9e0c9", "#f4c7a0", "#e6c3e6", "#fff0c8", "#a9d8d0"],
      wall: ["#e8e0cc", "#d6c7a8", "#b86b4b", "#e9e4d8", "#c9b99a"],
      roof: ["#b5573a", "#a24a31", "#c0654a", "#8e4330", "#b86a4e"],
      sheetRoof: ["#3d6d99", "#8f3b30", "#6f7a82", "#44705a", "#9aa3aa"],
    };
  }

  lotFor(zone, isBackRow) {
    const r = (a, b) => this.range(a, b);
    if (isBackRow) zone = zone === "it" || zone === "industrial" ? zone : "residential";
    switch (zone) {
      case "commercial":
        return { type: "shop", w: r(8, 15), d: r(11, 18), setback: r(0.3, 1.8), gap: r(0.2, 1.6), floors: this.rng() < 0.12 ? Math.floor(r(5, 8)) : Math.floor(r(1, 4.99)) };
      case "residential":
        return this.rng() < 0.07
          ? { type: "flats", w: r(22, 32), d: r(16, 22), setback: r(6, 10), gap: r(8, 14), floors: Math.floor(r(6, 13)) }
          : { type: "house", w: r(9, 13), d: r(8, 12), setback: r(3, 7), gap: r(3, 7), floors: this.rng() < 0.55 ? 2 : 1 };
      case "it":
        return this.rng() < 0.2
          ? { type: "flats", w: r(24, 34), d: r(18, 24), setback: r(8, 12), gap: r(10, 18), floors: Math.floor(r(9, 16)) }
          : { type: "office", w: r(28, 48), d: r(20, 32), setback: r(10, 16), gap: r(14, 24), floors: Math.floor(r(5, 12)) };
      case "industrial":
        return { type: "shed", w: r(26, 44), d: r(20, 34), setback: r(7, 12), gap: r(8, 14) };
      case "campus":
        return { type: "campus", w: r(28, 40), d: r(14, 20), setback: r(12, 18), gap: r(16, 24), floors: 3 };
      default:
        return null;
    }
  }

  emitLot(lot, zone) {
    const P = KakkanadMapManager.PALETTE;
    const k = this.kit;
    const T = window.CityKit.tint;
    let H = 0;
    let colliderHalf = null;
    switch (lot.type) {
      case "shop":
        lot.tint = T(this.pick(P.shop));
        lot.sign = Math.floor(this.rng() * 64);
        lot.tank = this.rng() < 0.6;
        H = k.shopHouse(lot, this.rng);
        break;
      case "house":
        lot.tint = T(this.pick(P.house));
        lot.roofStyle = this.rng() < 0.62 ? "tile" : "flat";
        lot.truss = lot.roofStyle === "flat" && this.rng() < 0.35;
        lot.roofTint = lot.truss ? T(this.pick(P.sheetRoof)) : T(this.pick(P.roof));
        lot.tank = this.rng() < 0.7;
        lot.wall = lot.front && this.rng() < 0.8;
        lot.wallTint = T(this.pick(P.wall));
        H = k.house(lot, this.rng);
        break;
      case "flats":
        lot.tint = T(this.pick(P.house));
        H = k.flats(lot, this.rng);
        break;
      case "office":
        lot.glass = Math.floor(this.rng() * 3);
        lot.podiumTint = T(this.pick(["#d9dcdf", "#c8ccd0", "#e6e2da"]));
        lot.fin = this.rng() < 0.4;
        H = k.office(lot, this.rng);
        colliderHalf = [lot.w / 2 + 3, lot.d / 2 + 3];
        break;
      case "shed":
        lot.h = this.range(7, 10);
        lot.tint = T(this.pick(["#e2e6ea", "#d7dde2", "#e9e4da"]));
        lot.roofTint = T(this.pick(P.sheetRoof));
        lot.officeTint = T(this.pick(P.shop));
        H = k.shed(lot, this.rng);
        break;
      case "campus":
        lot.tint = T(this.pick(["#efe2c4", "#e9dcc8", "#b86b4b"]));
        lot.roofTint = T(this.pick(P.roof));
        H = k.campusBlock(lot, this.rng);
        break;
    }
    const half = colliderHalf || [lot.w / 2, lot.d / 2];
    this.addCollider(lot.x, H / 2, lot.z, half[0], H / 2, half[1], lot.rot);
    this.stats.buildings++;
    return H;
  }

  buildCity() {
    const g = this.graph;
    this.yardSpots = [];
    g.edges.forEach((e) => {
      [1, -1].forEach((side) => {
        let s = e.trimA + 4;
        const end = e.len - e.trimB - 4;
        while (s < end) {
          const p = g.pointAt(e, s);
          const zone = this.zoneAt(p.x, p.z, e.road.zone);
          const lot = this.lotFor(zone, false);
          if (!lot) {
            s += 14;
            continue;
          }
          if (s + lot.w > end) break;
          const c = g.pointAt(e, s + lot.w / 2);
          const lx = c.dz * side;
          const lz = -c.dx * side; // outward: left of travel for side +1
          const dist = e.halfW + e.style.sidewalk + lot.setback + lot.d / 2;
          Object.assign(lot, { x: c.x + lx * dist, z: c.z + lz * dist, rot: Math.atan2(-lx, -lz), hw: lot.w / 2, hd: lot.d / 2, front: true, yard: lot.setback - 0.6 });
          const f = { x: lot.x, z: lot.z, hw: lot.hw, hd: lot.hd + (lot.type === "house" ? lot.setback * 0.5 : 0), rot: lot.rot };
          if (lot.type === "house") {
            // include the front yard in the footprint (wall line)
            f.x = lot.x - lx * lot.setback * 0.25;
            f.z = lot.z - lz * lot.setback * 0.25;
          }
          if (this.footprintClear(f, 0.8)) {
            this.reserve(f);
            this.emitLot(lot, zone);
            if (lot.type === "shop" || lot.type === "office") {
              // paved forecourt from the sidewalk to the shop front
              const d0 = e.halfW + e.style.sidewalk - 0.05;
              const d1 = dist - lot.d / 2 + 0.05;
              const half = lot.w / 2 + lot.gap / 2 + 0.05;
              const tx = -lz;
              const tz = lx; // along the road
              const P = (along, out) => ({ x: c.x + tx * along + lx * out, z: c.z + tz * along + lz * out });
              this.flatQuad(this.w.sidewalk, [P(-half, d0), P(half, d0), P(half, d1), P(-half, d1)], 0.1, 1 / 4);
            }
            if (lot.type === "house" || lot.type === "flats") this.yardSpots.push({ x: lot.x, z: lot.z, rot: lot.rot, w: lot.w, d: lot.d });
            // a second, quieter row behind the frontage
            if (this.rng() < (zone === "commercial" ? 0.75 : 0.5)) {
              const back = this.lotFor(zone, true);
              if (back) {
                const dist2 = dist + lot.d / 2 + this.range(4, 10) + back.d / 2;
                Object.assign(back, { x: c.x + lx * dist2, z: c.z + lz * dist2, rot: Math.atan2(-lx, -lz) + (this.rng() - 0.5) * 0.2, hw: back.w / 2, hd: back.d / 2, front: false, yard: 0 });
                if (this.footprintClear(back, 1.5)) {
                  this.reserve(back);
                  this.emitLot(back, zone);
                  if (back.type === "house") this.yardSpots.push({ x: back.x, z: back.z, rot: back.rot, w: back.w, d: back.d });
                }
              }
            }
            s += lot.w + lot.gap;
          } else {
            s += 3;
          }
        }
      });
    });
    this.buildHinterland();
  }

  // Houses scattered among the coconut groves between the roads.
  buildHinterland() {
    const b = this.config.MAP_BOUNDS;
    const step = 58;
    this.groveSpots = [];
    for (let x = b.minX + 120; x < b.maxX - 120; x += step) {
      for (let z = b.minZ + 120; z < b.maxZ - 120; z += step) {
        const px = x + (this.rng() - 0.5) * step * 0.8;
        const pz = z + (this.rng() - 0.5) * step * 0.8;
        const road = this.graph.nearest(px, pz, 420);
        if (!road) continue;
        const zone = this.zoneAt(px, pz, "residential");
        if (zone === "green" || zone === "temple") {
          this.groveSpots.push({ x: px, z: pz });
          continue;
        }
        if (this.rng() < 0.52 && zone !== "industrial") {
          const lot = this.lotFor(zone === "it" ? "it" : "residential", true);
          if (!lot) continue;
          const rot = Math.atan2(road.dx, road.dz) + (this.rng() < 0.5 ? 0 : Math.PI / 2) + (this.rng() - 0.5) * 0.3;
          Object.assign(lot, { x: px, z: pz, rot, hw: lot.w / 2, hd: lot.d / 2, front: false, yard: 0 });
          if (this.footprintClear(lot, 3)) {
            this.reserve(lot);
            this.emitLot(lot, zone);
            if (lot.type === "house") this.yardSpots.push({ x: px, z: pz, rot, w: lot.w, d: lot.d });
            continue;
          }
        }
        this.groveSpots.push({ x: px, z: pz });
      }
    }
  }

  // --- 7. Road signs: place names at junctions, road names on the big roads ---------------------------
  localityAt(x, z) {
    let best = null;
    let bd = Infinity;
    for (const l of this.localities) {
      const d = (l.x - x) ** 2 + (l.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }

  buildSignage() {
    const k = this.kit;
    let placed = 0;
    this.graph.nodes.forEach((node) => {
      if (!node.junction || node.arms.length < 3) return;
      const loc = this.localityAt(node.x, node.z);
      // board on the corner of the first arm, facing traffic on the widest road
      const main = node.arms.reduce((a, b) => (b.w > a.w ? b : a));
      const nx = -main.dz;
      const nz = main.dx;
      const d = main.trim + 6;
      const lat = main.w + main.sw - 0.6;
      const x = node.x + main.dx * d + nx * lat;
      const z = node.z + main.dz * d + nz * lat;
      const f = { x, z, rot: Math.atan2(main.dx, main.dz), hd: 0 };
      const name = loc ? loc.name.toUpperCase() : "KAKKANAD";
      const roads = [...new Set(node.arms.map((a) => a.edge.road.name))];
      const sub = roads.length > 1 ? roads.slice(0, 2).join(" • ").toUpperCase() : "THRIKKAKARA MUNICIPALITY";
      [-1, 1].forEach((sd) => {
        const [px, pz] = this.L(f, sd * 2.8, -0.05);
        k.cylinder({ x: px, z: pz, r: 0.07, h: 4.2, seg: 5, mat: k.mat.steel });
      });
      this.sign(f, name, "place", sub, 0, 0, 2.6, 6.4, 1.6);
      [-1, 1].forEach((sd) => {
        const [px, pz] = this.L(f, sd * 2.8, -0.05);
        this.addCollider(px, 2, pz, 0.12, 2, 0.12);
      });
      placed++;
    });
    this.stats.boards = placed;
  }

  // --- 8. Coconut palms, banana plants ------------------------------------------------------------------
  buildFoliage() {
    this.foliageManager = new window.FoliageManager(this.scene);
    const fm = this.foliageManager;
    [fm.trunkMaterial, fm.frondMaterial, fm.bananaMaterial, fm.coconutMaterial].forEach((m) => (m.userData.lod = "mid"));
    const trunk = this.batcher.writer(fm.trunkMaterial, true, true);
    const frond = this.batcher.writer(fm.frondMaterial, true, true);
    const banana = this.batcher.writer(fm.bananaMaterial, true, true);
    this.trees = [];
    const ok = (x, z, clearance = 0.8) => {
      const r = this.graph.nearest(x, z, 60);
      if (r && r.distance < r.edge.halfW + r.edge.style.sidewalk + clearance) return false;
      const near = this.gridQuery(this.footprintGrid, this.footprintCell, x, z, 30, (this._palmq = this._palmq || []));
      const probe = { x, z, hw: 0.6, hd: 0.6, rot: 0 };
      for (let i = 0; i < near.length; i++) if (this.obbOverlap(probe, near[i], 0.2)) return false;
      for (let i = 0; i < this.riverSegments.length; i++) {
        const s = this.riverSegments[i];
        const vx = s.bx - s.ax;
        const vz = s.bz - s.az;
        const l2 = vx * vx + vz * vz;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / l2));
        if (Math.hypot(x - s.ax - vx * t, z - s.az - vz * t) < s.halfW + 2.6) return false;
      }
      return true;
    };
    const palm = (x, z) => {
      if (this.stats.palms >= 7000 || !ok(x, z)) return false;
      this.emitPalm(trunk, frond, x, z, this.range(10, 17), this.range(0.6, 2.4));
      this.addCollider(x, 3, z, 0.3, 3, 0.3);
      this.trees.push(new THREE.Vector3(x, 0, z));
      this.stats.palms++;
      return true;
    };
    const bananaAt = (x, z) => {
      if (!ok(x, z, 0.4)) return;
      this.emitBanana(trunk, banana, x, z);
    };
    // yards: palms and bananas around houses
    this.yardSpots.forEach((h) => {
      const n = 1 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) {
        const a = this.rng() * Math.PI * 2;
        const r = Math.max(h.w, h.d) / 2 + this.range(2.5, 6);
        palm(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r);
      }
      if (this.rng() < 0.45) {
        const a = this.rng() * Math.PI * 2;
        bananaAt(h.x + Math.cos(a) * (h.w / 2 + 2), h.z + Math.sin(a) * (h.d / 2 + 2));
      }
    });
    // groves
    this.groveSpots.forEach((g) => {
      const n = 2 + Math.floor(this.rng() * 4);
      for (let i = 0; i < n; i++) palm(g.x + (this.rng() - 0.5) * 30, g.z + (this.rng() - 0.5) * 30);
      if (this.rng() < 0.5) bananaAt(g.x + (this.rng() - 0.5) * 12, g.z + (this.rng() - 0.5) * 12);
    });
    // undergrowth: clumps of low bushes on open ground
    this.stats.bushes = 0;
    const bushW = this.batcher.writer(this.bushMaterial(), true, true);
    const b = this.config.MAP_BOUNDS;
    const shades = ["#3f6b2a", "#2f5a24", "#56793a", "#46612c", "#61803f"].map((h) => window.CityKit.tint(h));
    for (let i = 0; i < 2600; i++) {
      const cx = b.minX + 80 + this.rng() * (b.maxX - b.minX - 160);
      const cz = b.minZ + 80 + this.rng() * (b.maxZ - b.minZ - 160);
      const n = 2 + Math.floor(this.rng() * 4);
      for (let k = 0; k < n; k++) {
        const x = cx + (this.rng() - 0.5) * 9;
        const z = cz + (this.rng() - 0.5) * 9;
        if (!ok(x, z, 0.4)) continue;
        this.emitBush(bushW, x, z, 0.8 + this.rng() * 1.5, this.pick(shades));
        this.stats.bushes++;
      }
    }
    // riverbanks
    this.geo.rivers.forEach((river) => {
      const m = this.mitered(river.points);
      for (let i = 0; i < m.length - 1; i++) {
        const a = m[i];
        const b = m[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        for (let s = 0; s < len; s += 13) {
          [-1, 1].forEach((sd) => {
            if (this.rng() < 0.35) return;
            const t = s / len;
            const off = sd * (river.width / 2 + this.range(4, 9));
            palm(a.x + (b.x - a.x) * t + a.lx * off, a.z + (b.z - a.z) * t + a.lz * off);
          });
        }
      }
    });
    // a few detailed palms at the spawn junction for close-ups
    const spawn = this.spawnPoint();
    for (let i = 0; i < 5; i++) {
      const x = spawn.x - 26 + i * 13 + (this.rng() - 0.5) * 3;
      const z = spawn.z - 14 - this.rng() * 6;
      if (!ok(x, z, 1.5)) continue;
      const p = fm.createCoconutPalm(13 + (i % 3) * 1.5, 1.2 + (i % 2) * 0.6);
      p.position.set(x, 0, z);
      this.batcher.add(p);
      this.addCollider(x, 3, z, 0.35, 3, 0.35);
      this.trees.push(new THREE.Vector3(x, 0, z));
    }
    fm.trees = this.trees;
  }

  // Low-poly coconut palm: curved 6-sided trunk + 9 drooping fronds (~110 vertices).
  emitPalm(trunkW, frondW, x, z, height, lean) {
    const rng = this.rng;
    const la = rng() * Math.PI * 2;
    const ldx = Math.cos(la);
    const ldz = Math.sin(la);
    const segs = 3;
    const sides = 5;
    trunkW.begin(x, z);
    const rings = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const cx = x + ldx * lean * t * t;
      const cz = z + ldz * lean * t * t;
      const y = height * t;
      const r = 0.34 - 0.13 * t;
      const ring = [];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ring.push(trunkW.vertex(cx + ca * r, y, cz + sa * r, ca, 0, sa, k / sides, t * height * 0.4));
      }
      rings.push(ring);
    }
    for (let i = 0; i < segs; i++) {
      for (let k = 0; k < sides; k++) {
        trunkW.tri(rings[i][k], rings[i + 1][k], rings[i][k + 1]);
        trunkW.tri(rings[i][k + 1], rings[i + 1][k], rings[i + 1][k + 1]);
      }
    }
    const top = { x: x + ldx * lean, y: height, z: z + ldz * lean };
    frondW.begin(x, z);
    const fronds = 8;
    for (let f = 0; f < fronds; f++) {
      const az = (f / fronds) * Math.PI * 2 + rng() * 0.4;
      const len = 4.4 + rng() * 1.2;
      const up = 0.35 + rng() * 0.4;
      const droop = 2.2 + rng() * 1.3;
      const dx = Math.cos(az);
      const dz = Math.sin(az);
      const wx = -dz;
      const wz = dx;
      const ids = [];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const hw = 0.75 * Math.sin(Math.PI * (0.15 + 0.85 * t)) + 0.05;
        const px = top.x + dx * len * t;
        const pz = top.z + dz * len * t;
        const py = top.y + up * len * t - droop * t * t;
        ids.push([
          frondW.vertex(px - wx * hw, py, pz - wz * hw, 0, 1, 0, 0, t),
          frondW.vertex(px + wx * hw, py, pz + wz * hw, 0, 1, 0, 1, t),
        ]);
      }
      for (let i = 0; i < 4; i++) {
        frondW.tri(ids[i][0], ids[i + 1][0], ids[i][1]);
        frondW.tri(ids[i][1], ids[i + 1][0], ids[i + 1][1]);
      }
    }
  }

  // Leafy bush material: noisy greens, tinted per bush.
  bushMaterial() {
    if (this._bushMat) return this._bushMat;
    const size = 128;
    const canvas = GFX.makeCanvas(size);
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = GFX.fbm(x, y, size, 16, 3, 71);
        const leaf = GFX.fbm(x, y, size, 32, 2, 73) > 0.55 ? 1.25 : 0.85;
        const v = (0.55 + 0.6 * n) * leaf;
        const i = (y * size + x) * 4;
        img.data[i] = Math.min(255, 200 * v);
        img.data[i + 1] = Math.min(255, 215 * v);
        img.data[i + 2] = Math.min(255, 170 * v);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = GFX.texture(canvas, { repeat: [1, 1] });
    this._bushMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, vertexColors: true });
    this._bushMat.userData.lod = "mid";
    return this._bushMat;
  }

  // Low-poly bush: a six-sided dome (13 vertices).
  emitBush(w, x, z, r, tint) {
    w.begin(x, z);
    const h = r * (0.8 + this.rng() * 0.5);
    const a0 = this.rng() * Math.PI;
    const ring = (y, rad, v) => {
      const ids = [];
      for (let k = 0; k < 6; k++) {
        const a = a0 + (k / 6) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const jitter = 0.85 + this.rng() * 0.3;
        ids.push(w.vertex(x + ca * rad * jitter, y, z + sa * rad * jitter, ca * 0.8, 0.6, sa * 0.8, k / 3, v, tint[0], tint[1], tint[2]));
      }
      return ids;
    };
    const base = ring(0, r, 0);
    const mid = ring(h * 0.55, r * 0.95, 0.6);
    const top = w.vertex(x, h, z, 0, 1, 0, 0.5, 1, tint[0] * 1.15, tint[1] * 1.15, tint[2] * 1.1);
    for (let k = 0; k < 6; k++) {
      const n = (k + 1) % 6;
      w.tri(base[k], mid[k], base[n]);
      w.tri(base[n], mid[k], mid[n]);
      w.tri(mid[k], top, mid[n]);
    }
  }

  emitBanana(trunkW, leafW, x, z) {
    const rng = this.rng;
    trunkW.begin(x, z);
    const h = 2.2 + rng() * 0.6;
    const ring = [];
    for (let k = 0; k <= 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ring.push([
        trunkW.vertex(x + Math.cos(a) * 0.17, 0, z + Math.sin(a) * 0.17, Math.cos(a), 0, Math.sin(a), k / 5, 0),
        trunkW.vertex(x + Math.cos(a) * 0.11, h, z + Math.sin(a) * 0.11, Math.cos(a), 0, Math.sin(a), k / 5, 1),
      ]);
    }
    for (let k = 0; k < 5; k++) {
      trunkW.tri(ring[k][0], ring[k][1], ring[k + 1][0]);
      trunkW.tri(ring[k + 1][0], ring[k][1], ring[k + 1][1]);
    }
    leafW.begin(x, z);
    for (let f = 0; f < 6; f++) {
      const az = (f / 6) * Math.PI * 2 + rng() * 0.5;
      const dx = Math.cos(az);
      const dz = Math.sin(az);
      const ids = [];
      for (let i = 0; i <= 3; i++) {
        const t = i / 3;
        const hw = 0.5 * Math.sin(Math.PI * (0.1 + 0.8 * t)) + 0.05;
        const px = x + dx * 2.2 * t;
        const pz = z + dz * 2.2 * t;
        const py = h + 0.9 * t - 1.1 * t * t;
        ids.push([leafW.vertex(px + dz * hw, py, pz - dx * hw, 0, 1, 0, 0, t), leafW.vertex(px - dz * hw, py, pz + dx * hw, 0, 1, 0, 1, t)]);
      }
      for (let i = 0; i < 3; i++) {
        leafW.tri(ids[i][0], ids[i + 1][0], ids[i][1]);
        leafW.tri(ids[i][1], ids[i + 1][0], ids[i + 1][1]);
      }
    }
  }

  // --- Queries used by gameplay ------------------------------------------------------------------------
  // The player spawn: sidewalk by Kakkanad bus stand (see config SPAWN).
  spawnPoint() {
    const sp = this.config.SPAWN;
    const e = this.graph.edges.find((ed) => ed.road.id === sp.road);
    const s = Math.min(e.len - 10, e.trimA + sp.s);
    const lat = sp.side * (e.halfW + e.style.sidewalk * 0.55);
    const p = this.graph.lanePoint(e, 1, s, lat);
    return { x: p.x, z: p.z, heading: p.heading, edge: e, s };
  }

  getNearestRoadPoint(pos) {
    const r = this.graph.nearest(pos.x, pos.z, 2500, (this._nr = this._nr || {}));
    if (!r) return { point: new THREE.Vector3(pos.x, 0.08, pos.z), distance: Infinity, heading: 0, roadId: this.roads[0].id, width: 10 };
    return {
      point: new THREE.Vector3(r.x, 0.08, r.z),
      distance: r.distance,
      heading: Math.atan2(r.dx, r.dz),
      roadId: r.road.id,
      roadName: r.road.name,
      width: r.road.width,
      edge: r.edge,
      s: r.s,
    };
  }

  // Sidewalk point in front of the nearest of the given landmarks (respawns, missions).
  nearestLandmarkFront(ids, pos, extra = 5) {
    let best = null;
    let bd = Infinity;
    (this.placedLandmarks || []).forEach((f) => {
      if (!ids.includes(f.lm.id)) return;
      const d = Math.hypot(f.x - pos.x, f.z - pos.z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    });
    if (!best) return null;
    return { x: best.x + Math.sin(best.rot) * (best.hd + extra), z: best.z + Math.cos(best.rot) * (best.hd + extra), heading: best.rot + Math.PI };
  }

  getLandmarkPositions() {
    return this.landmarks.map((l) => {
      const p = (this.landmarkPositions && this.landmarkPositions[l.id]) || l;
      return { id: l.id, name: l.name, position: new THREE.Vector3(p.x, 0, p.z), color: l.color };
    });
  }
}

window.KakkanadMapManager = KakkanadMapManager;
