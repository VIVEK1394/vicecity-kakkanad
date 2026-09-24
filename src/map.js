/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 2: KAKKANAD 3D MAP
 * OpenStreetMap-derived road network with mitered asphalt, lane markings, zebra
 * crossings, interlock sidewalks, hazard-striped curbs and medians, street lamps,
 * PBR building facades with night-lit windows, landmarks and thattukadas.
 * All static geometry is merged by StaticBatcher (one draw call per material per cell).
 * Also exposes camera colliders (buildings) and street-lamp positions.
 */

class KakkanadMapManager {
  constructor(scene) {
    this.scene = scene;
    this.config = window.KAKKANAD_CONFIG;
    this.roads = this.config.ROAD_NETWORK;
    this.landmarks = this.config.KEY_LANDMARKS;

    this.surfaceManager = new window.SurfaceManager();
    this.batcher = new window.StaticBatcher(scene, 600);

    this.roadMeshes = []; // {roadId, p1, p2, width} per segment, used by getNearestRoadPoint
    this.colliders = []; // camera collision boxes: {center, half, rotY}
    this.streetLamps = []; // lamp head world positions
    this.junctions = [];

    const S = this.surfaceManager;
    this.darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.8 });
    this.lampHousingMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.9 });
    this.lampLensMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    this.lampLensMat.userData.glow = { day: 0.35, night: 9.0 };
    this.lampConeMat = new THREE.MeshBasicMaterial({
      color: 0xffcf8a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.lampConeMat.userData.glow = { day: 0, night: 0.05 };
    this.lampPoolMat = new THREE.MeshBasicMaterial({
      map: S.lightPoolTexture,
      color: 0xffc98a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -80,
    });
    this.lampPoolMat.userData.glow = { day: 0, night: 0.55 };
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.85 });
    this.tileRoofMat = new THREE.MeshStandardMaterial({ color: 0x8e3a2a, roughness: 0.78 });
    this.sheetRoofMat = new THREE.MeshStandardMaterial({ color: 0x8a2f2c, roughness: 0.5, metalness: 0.6 });
    this.whitePaintMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.45, metalness: 0.2 });
    this.neonMats = new Map();

    this.initMap();
  }

  neon(hex, day = 0.35, night = 4.0) {
    const key = `${hex}|${day}|${night}`;
    if (!this.neonMats.has(key)) {
      const m = new THREE.MeshBasicMaterial({ color: hex });
      m.userData.glow = { day, night };
      this.neonMats.set(key, m);
    }
    return this.neonMats.get(key);
  }

  initMap() {
    this.analyseJunctions();
    this.buildTerrainGround();
    this.buildRiver();
    this.buildRoadNetwork();
    this.buildBuildings();
    this.buildLandmarks();
    this.buildThattukadas();
    this.buildPalmTrees();
    this.batchStats = this.batcher.build();
  }

  update(delta) {
    this.surfaceManager.updateWater(delta);
  }

  addCollider(x, y, z, hx, hy, hz, rotY = 0) {
    this.colliders.push({ center: new THREE.Vector3(x, y, z), half: new THREE.Vector3(hx, hy, hz), rotY });
  }

  // --- 1. Ground & River ---------------------------------------------------------------
  buildTerrainGround() {
    const bounds = this.config.MAP_BOUNDS;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const geo = new THREE.PlaneGeometry(width, depth, 64, 64);
    geo.rotateX(-Math.PI / 2);

    // World-unit UVs (16 m texture tile) + low-frequency vertex tint to hide tiling.
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uv.setXY(i, x / 16, z / 16);
      const n = GFX.fbm(x + 5000, z + 5000, 10000, 24, 3, 3);
      const dry = GFX.fbm(x + 5000, z + 5000, 10000, 9, 2, 8);
      const k = 0.78 + 0.34 * n;
      const c = new THREE.Color(k * (1 + 0.12 * dry), k, k * (1 - 0.1 * dry)).convertSRGBToLinear();
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const ground = new THREE.Mesh(geo, this.surfaceManager.groundMaterial);
    ground.position.set(0, -0.05, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildRiver() {
    const riverGeo = new THREE.PlaneGeometry(400, 2400);
    riverGeo.rotateX(-Math.PI / 2);
    const pos = riverGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) riverGeo.attributes.uv.setXY(i, pos.getX(i) / 10, pos.getZ(i) / 10);
    const river = new THREE.Mesh(riverGeo, this.surfaceManager.waterMaterial);
    river.position.set(1100, 0.05, 0);
    river.receiveShadow = true;
    this.scene.add(river);

    const bridge = new THREE.Mesh(this.surfaceManager.box(220, 1.2, 22, 4, 1.2), this.surfaceManager.concreteMaterial);
    bridge.position.set(980, 1.8, -520);
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    this.batcher.add(bridge);
    this.addCollider(980, 1.8, -520, 110, 0.6, 11);
  }

  // --- 2. Road network ---------------------------------------------------------------
  analyseJunctions() {
    const roadsAt = new Map();
    this.roads.forEach((road) => {
      road.points.forEach((p) => {
        const key = `${p.x},${p.z}`;
        const list = roadsAt.get(key) || [];
        if (!list.includes(road)) list.push(road);
        roadsAt.set(key, list);
      });
    });
    roadsAt.forEach((list, key) => {
      if (list.length < 2) return;
      const [x, z] = key.split(",").map(Number);
      this.junctions.push({ x, z, trim: Math.max(...list.map((r) => r.width / 2)) + 4 });
    });
  }

  junctionTrim(p) {
    const j = this.junctions.find((jn) => Math.abs(jn.x - p.x) < 0.01 && Math.abs(jn.z - p.z) < 0.01);
    return j ? j.trim : 0;
  }

  // Flat quad (y up) from 4 corners [start-left, start-right, end-left, end-right].
  quad(c, uvs, y) {
    const g = new THREE.BufferGeometry();
    const p = [];
    c.forEach((v) => p.push(v.x, y, v.z));
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    // wind counter-clockwise seen from above
    const ab = new THREE.Vector3().subVectors(c[1], c[0]);
    const ac = new THREE.Vector3().subVectors(c[2], c[0]);
    const up = ab.z * ac.x - ab.x * ac.z > 0;
    g.setIndex(up ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]);
    return g;
  }

  addQuad(corners, uvs, y, material, receiveShadow = true) {
    const mesh = new THREE.Mesh(this.quad(corners, uvs, y), material);
    mesh.receiveShadow = receiveShadow;
    this.batcher.add(mesh);
  }

  // Straight strip between along-positions s0..s1 and lateral offsets w0..w1 on one
  // segment (UVs in metres; used for untextured road paint).
  addStrip(a, dir, nrm, s0, s1, w0, w1, y, material) {
    const p = (s, w) => new THREE.Vector3(a.x + dir.x * s + nrm.x * w, 0, a.z + dir.z * s + nrm.z * w);
    this.addQuad([p(s0, w0), p(s0, w1), p(s1, w0), p(s1, w1)], [s0, w0, s0, w1, s1, w0, s1, w1], y, material);
  }

  buildRoadNetwork() {
    const S = this.surfaceManager;
    this.roads.forEach((road, roadIndex) => {
      const pts = road.points.map((p) => new THREE.Vector3(p.x, 0, p.z));
      const n = pts.length;
      const halfW = road.width / 2;
      const dirs = [];
      for (let i = 0; i < n - 1; i++) dirs.push(new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize());

      // Mitered vertex normals so consecutive segments share edges (no gaps/overlaps).
      const normals = [];
      const miter = [];
      for (let i = 0; i < n; i++) {
        const t = i === 0 ? dirs[0].clone() : i === n - 1 ? dirs[n - 2].clone() : dirs[i - 1].clone().add(dirs[i]).normalize();
        const nv = new THREE.Vector3(-t.z, 0, t.x);
        const ref = dirs[Math.min(i, n - 2)];
        miter.push(1 / Math.max(0.35, nv.dot(new THREE.Vector3(-ref.z, 0, ref.x))));
        normals.push(nv);
      }

      let along = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dir = dirs[i];
        const len = a.distanceTo(b);
        const nrm = new THREE.Vector3(-dir.z, 0, dir.x);
        const off = (k, w) => new THREE.Vector3().copy(pts[k]).addScaledVector(normals[k], w * miter[k]);

        // Asphalt (8 m texture tile, continuous v along the whole road).
        this.addQuad(
          [off(i, halfW), off(i, -halfW), off(i + 1, halfW), off(i + 1, -halfW)],
          [0, along / 8, road.width / 8, along / 8, 0, (along + len) / 8, road.width / 8, (along + len) / 8],
          0.08,
          S.asphaltFor(roadIndex)
        );
        this.roadMeshes.push({
          roadId: road.id,
          p1: new THREE.Vector3(a.x, 0.08, a.z),
          p2: new THREE.Vector3(b.x, 0.08, b.z),
          width: road.width,
        });

        const trimA = this.junctionTrim(a);
        const trimB = this.junctionTrim(b);
        const s0 = trimA;
        const s1 = len - trimB;
        if (s1 - s0 > 4) {
          this.addRoadMarkings(road, a, dir, nrm, len, s0, s1, trimA > 0, trimB > 0);
          this.addSidewalks(road, i, a, dir, nrm, len, s0, s1, off, trimA > 0, trimB > 0);
          if (road.isDualCarriageway) this.addMedian(a, dir, s0, s1);
          this.addStreetLights(road, roadIndex, i, a, dir, nrm, s0, s1);
        }
        along += len;
      }
    });
  }

  addRoadMarkings(road, a, dir, nrm, len, s0, s1, junctionA, junctionB) {
    const S = this.surfaceManager;
    const halfW = road.width / 2;
    const y = 0.085;
    const dashes = (lateral, material) => {
      for (let s = s0 + 2; s + 3 <= s1; s += 9) this.addStrip(a, dir, nrm, s, s + 3, lateral - 0.075, lateral + 0.075, y, material);
    };
    const solid = (lateral, width, material) => {
      for (let s = s0; s < s1; s += 50) {
        this.addStrip(a, dir, nrm, s, Math.min(s1, s + 50), lateral - width / 2, lateral + width / 2, y, material);
      }
    };

    if (road.isDualCarriageway) {
      const laneLine = 0.7 + (halfW - 0.7) / 2;
      dashes(laneLine, S.markingWhite);
      dashes(-laneLine, S.markingWhite);
      solid(0.95, 0.12, S.markingYellow);
      solid(-0.95, 0.12, S.markingYellow);
    } else {
      dashes(0, S.markingWhite);
    }
    solid(halfW - 0.45, 0.15, S.markingWhite);
    solid(-(halfW - 0.45), 0.15, S.markingWhite);

    // Zebra crossings just outside each junction.
    const zebra = (s) => {
      for (let w = -halfW + 0.8; w <= halfW - 0.8; w += 1.0) {
        if (road.isDualCarriageway && Math.abs(w) < 1.1) continue;
        this.addStrip(a, dir, nrm, s, s + 3.2, w - 0.25, w + 0.25, y, S.markingWhite);
      }
    };
    if (junctionA) zebra(s0 + 1.5);
    if (junctionB && len > 30) zebra(s1 - 4.7);
  }

  addSidewalks(road, i, a, dir, nrm, len, s0, s1, off, junctionA, junctionB) {
    const S = this.surfaceManager;
    const halfW = road.width / 2;
    // Corner points: mitered at shared (non-junction) vertices, perpendicular where trimmed.
    const corner = (end, w) => {
      if (end === 0 && !junctionA) return off(i, w);
      if (end === 1 && !junctionB) return off(i + 1, w);
      const s = end === 0 ? s0 : s1;
      return new THREE.Vector3(a.x + dir.x * s + nrm.x * w, 0, a.z + dir.z * s + nrm.z * w);
    };
    [1, -1].forEach((side) => {
      const band = (w0, w1, y, material, uTile, vTile) => {
        const c = [corner(0, side * w0), corner(0, side * w1), corner(1, side * w0), corner(1, side * w1)];
        const uv = [s0 / uTile, 0, s0 / uTile, (w1 - w0) / vTile, s1 / uTile, 0, s1 / uTile, (w1 - w0) / vTile];
        this.addQuad(c, uv, y, material);
      };
      band(halfW, halfW + 0.35, 0.078, S.curbMaterial, 2.4, 0.35);
      band(halfW + 0.35, halfW + 3.4, 0.075, S.sidewalkMaterial, 4, 4);
    });
  }

  addMedian(a, dir, s0, s1) {
    const S = this.surfaceManager;
    const len = s1 - s0;
    const geo = S.box(1.4, 0.3, len, 2.4, 0.3);
    const median = new THREE.Mesh(geo, [
      S.medianSideMaterial,
      S.medianSideMaterial,
      S.medianGrassMaterial,
      S.medianSideMaterial,
      S.medianSideMaterial,
      S.medianSideMaterial,
    ]);
    const mid = (s0 + s1) / 2;
    median.position.set(a.x + dir.x * mid, 0.15, a.z + dir.z * mid);
    median.rotation.y = Math.atan2(dir.x, dir.z);
    median.receiveShadow = true;
    this.batcher.add(median);
  }

  addStreetLights(road, roadIndex, segIndex, a, dir, nrm, s0, s1) {
    const halfW = road.width / 2;
    let k = roadIndex + segIndex;
    for (let s = s0 + 8; s <= s1 - 6; s += 45, k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const lateral = side * (halfW + 1.2);
      const x = a.x + dir.x * s + nrm.x * lateral;
      const z = a.z + dir.z * s + nrm.z * lateral;
      // lamp arm points back over the road
      const facing = Math.atan2(-nrm.x * side, -nrm.z * side);
      this.addStreetlight(x, z, facing);
    }
  }

  addStreetlight(x, z, angle) {
    const S = this.surfaceManager;
    const group = new THREE.Group();

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 9.2, 8), S.steelMaterial);
    pole.position.y = 4.6;
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), S.steelMaterial);
    arm.position.set(0, 9.1, 1.0);
    arm.rotation.x = 0.12;
    group.add(arm);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.75), this.lampHousingMat);
    head.position.set(0, 9.0, 1.95);
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

  createNeonSignTexture(text, textColor = "#ff007f", glowColor = "#ff77a9") {
    const canvas = GFX.makeCanvas(512, 128);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#07090e";
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 38px 'Orbitron', 'Rajdhani', sans-serif";
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = textColor;
    ctx.fillText(text, 256, 64);
    ctx.shadowBlur = 3;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 256, 64);
    return GFX.texture(canvas);
  }

  signBoard(width, text, col, glow) {
    const signMat = new THREE.MeshBasicMaterial({ map: this.createNeonSignTexture(text, col, glow) });
    signMat.userData.glow = { day: 1.0, night: 2.6 };
    const d = this.darkMetalMat;
    return new THREE.Mesh(new THREE.BoxGeometry(width, 5.5, 0.6), [d, d, d, d, signMat, d]);
  }

  // --- 3. Buildings ---------------------------------------------------------------------
  buildBuildings() {
    const S = this.surfaceManager;
    const spots = [
      { x: -95, z: 145, w: 32, h: 36, d: 24, title: "HOTEL MALABAR ★", col: "#ff4f8b", glow: "#ff8fb3", wall: "#d8b3ad", neon: 0xff4f8b },
      { x: -95, z: 185, w: 28, h: 42, d: 26, title: "OCEAN DRIVE CAFE 🌴", col: "#35d6ea", glow: "#8ff0fa", wall: "#9cc0c6", neon: 0x35d6ea },
      { x: -40, z: 130, w: 34, h: 48, d: 28, title: "VICE CITY KAKKANAD", col: "#ff4f8b", glow: "#ff8fb3", wall: "#e6ddd2", neon: 0xff4f8b },
      { x: 120, z: 180, w: 40, h: 60, d: 30, title: "KOCHI SYNTH LOUNGE 🍸", col: "#c85fe0", glow: "#e3a3f2", wall: "#9b90a6", neon: 0xc85fe0 },
      { x: 260, z: 60, w: 45, h: 70, d: 35, title: "INFOPARK BOULEVARD", col: "#35d6ea", glow: "#8ff0fa", wall: "#56606b", neon: 0x35d6ea, curtain: true },
      { x: 420, z: 220, w: 35, h: 50, d: 30, title: "EDACHIRA PLAZA ★", col: "#ffcc4d", glow: "#ffe49e", wall: "#dcc38a", neon: 0xffcc4d },
    ];

    spots.forEach((b, idx) => {
      const facade = S.createFacadeMaterial({
        wall: b.wall,
        style: b.curtain ? "curtain" : "plaster",
        cols: b.curtain ? 8 : 4,
        seed: idx + 11,
        glass: b.curtain ? "#2c4250" : "#26323a",
        frame: b.curtain ? "#8d949b" : "#e3e0d8",
        glassMetal: b.curtain ? 0.55 : 0.3,
        lit: 0.42,
      });
      const floorH = b.h / Math.max(1, Math.round(b.h / 3.6));
      const group = new THREE.Group();

      const body = new THREE.Mesh(S.box(b.w, b.h, b.d, 12, floorH * 4), [facade, facade, S.roofMaterial, S.roofMaterial, facade, facade]);
      body.position.y = b.h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const sign = this.signBoard(b.w * 0.85, b.title, b.col, b.glow);
      sign.position.set(0, b.h + 3.2, b.d / 2 + 0.3);
      sign.castShadow = true;
      group.add(sign);

      const tube = this.neon(b.neon);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.35, b.d + 0.6), tube);
      crown.position.y = b.h + 0.1;
      group.add(crown);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.25, b.d + 0.3), tube);
      strip.position.y = b.h * 0.55;
      group.add(strip);

      group.position.set(b.x, 0, b.z);
      this.batcher.add(group);
      this.addCollider(b.x, b.h / 2 + 3, b.z, b.w / 2, b.h / 2 + 3, b.d / 2 + 0.6);
    });
  }

  // --- 4. Landmarks ----------------------------------------------------------------------
  buildLandmarks() {
    const S = this.surfaceManager;
    const facade = (opts) => S.createFacadeMaterial(opts);

    this.landmarks.forEach((lm) => {
      const group = new THREE.Group();
      group.position.set(lm.x, 0, lm.z);

      if (lm.id === "infopark") {
        const glass = facade({ style: "curtain", cols: 8, wall: "#1f2a33", glass: "#2e4a5a", frame: "#9aa1a8", seed: 31, lit: 0.5, glassMetal: 0.6, glassRough: 0.05 });
        const tower = new THREE.Mesh(S.box(65, 105, 45, 12, 14), [glass, glass, S.roofMaterial, S.roofMaterial, glass, glass]);
        tower.position.y = 52.5;
        tower.castShadow = true;
        tower.receiveShadow = true;
        group.add(tower);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(45, 6, 2), this.neon(0x35d6ea, 0.8, 4.5));
        sign.position.set(0, 108, 22.8);
        group.add(sign);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(66, 0.6, 46), this.neon(0xff4f8b));
        trim.position.y = 105.3;
        group.add(trim);
        const food = facade({ wall: "#e0b659", cols: 4, seed: 32, lit: 0.6 });
        const foodCourt = new THREE.Mesh(S.box(35, 14, 35, 12, 14), [food, food, S.roofMaterial, S.roofMaterial, food, food]);
        foodCourt.position.set(55, 7, 0);
        foodCourt.castShadow = true;
        foodCourt.receiveShadow = true;
        group.add(foodCourt);
        this.addCollider(lm.x, 55, lm.z, 32.5, 55, 22.5);
        this.addCollider(lm.x + 55, 7, lm.z, 17.5, 7, 17.5);
      } else if (lm.id === "collectorate") {
        const civil = facade({ wall: "#e5dfcf", frame: "#7a5a3c", glass: "#2b2f2e", cols: 4, seed: 41, lit: 0.3 });
        const main = new THREE.Mesh(S.box(90, 32, 50, 12, 14.4), [civil, civil, S.roofMaterial, S.roofMaterial, civil, civil]);
        main.position.y = 16;
        main.castShadow = true;
        main.receiveShadow = true;
        group.add(main);
        const porch = new THREE.Mesh(S.box(34, 10, 18, 4, 4), S.concreteMaterial);
        porch.position.set(0, 5, 32);
        porch.castShadow = true;
        porch.receiveShadow = true;
        group.add(porch);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 14, 8), this.whitePaintMat);
        mast.position.set(0, 39, 0);
        mast.castShadow = true;
        group.add(mast);
        this.addCollider(lm.x, 16, lm.z, 45, 16, 25);
        this.addCollider(lm.x, 5, lm.z + 32, 17, 5, 9);
      } else if (lm.id === "smartcity") {
        const glass = facade({ style: "curtain", cols: 8, wall: "#141d2b", glass: "#20344a", frame: "#7e8792", seed: 51, lit: 0.45, glassMetal: 0.65, glassRough: 0.05 });
        const tower = new THREE.Mesh(S.box(52, 120, 52, 12, 14), [glass, glass, S.roofMaterial, S.roofMaterial, glass, glass]);
        tower.position.y = 60;
        tower.rotation.y = 0.25;
        tower.castShadow = true;
        tower.receiveShadow = true;
        group.add(tower);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(54, 1.2, 54), this.neon(0x35d6ea));
        edge.position.y = 120;
        edge.rotation.y = 0.25;
        group.add(edge);
        this.addCollider(lm.x, 60, lm.z, 26, 60, 26, 0.25);
      } else if (lm.id === "watermetro") {
        const terminalMat = facade({ style: "curtain", cols: 6, wall: "#1d5f8c", glass: "#2f5566", frame: "#c9ced3", seed: 61, lit: 0.6 });
        const terminal = new THREE.Mesh(S.box(42, 10, 26, 12, 14), [terminalMat, terminalMat, S.roofMaterial, S.roofMaterial, terminalMat, terminalMat]);
        terminal.position.y = 5;
        terminal.castShadow = true;
        terminal.receiveShadow = true;
        group.add(terminal);
        const pontoon = new THREE.Mesh(S.box(22, 1.5, 36, 4, 1.5), S.concreteMaterial);
        pontoon.position.set(30, 0.5, 0);
        pontoon.receiveShadow = true;
        group.add(pontoon);
        this.addCollider(lm.x, 5, lm.z, 21, 5, 13);
      } else if (lm.id === "bus_stand") {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(65, 0.5, 28), this.sheetRoofMat);
        roof.position.y = 7.9;
        roof.castShadow = true;
        roof.receiveShadow = true;
        group.add(roof);
        const pillarGeo = new THREE.CylinderGeometry(0.22, 0.22, 7.8, 10);
        [-26, -14, 14, 26].forEach((px) => {
          [-12, 12].forEach((pz) => {
            const p = new THREE.Mesh(pillarGeo, S.concreteMaterial);
            p.position.set(px, 3.9, pz);
            p.castShadow = true;
            group.add(p);
          });
        });
        this.addCollider(lm.x, 7.9, lm.z, 32.5, 0.4, 14);
      }

      this.batcher.add(group);
    });
  }

  // --- 5. Thattukada tea stalls ------------------------------------------------------
  buildThattukadas() {
    const spots = [
      { x: 380, z: 150 },
      { x: -45, z: 185 },
      { x: 490, z: -270 },
    ];
    spots.forEach((pt) => {
      const stall = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.5, 3.2), this.woodMat);
      base.position.y = 1.25;
      base.castShadow = true;
      base.receiveShadow = true;
      const roofGeo = new THREE.ConeGeometry(3.8, 1.5, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roof = new THREE.Mesh(roofGeo, this.tileRoofMat);
      roof.position.y = 3.2;
      roof.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.neon(0xffc56b, 1.0, 7.0));
      lamp.position.set(0, 2.2, 1.7);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.4, 0.1), this.neon(0xff4f8b));
      sign.position.set(0, 2.7, 1.65);
      stall.add(base, roof, lamp, sign);
      stall.position.set(pt.x, 0, pt.z);
      this.batcher.add(stall);
      this.addCollider(pt.x, 1.8, pt.z, 2.6, 1.8, 1.8);
    });
  }

  // --- 6. Coconut palms & banana plants (FoliageManager feeds the batcher) -----------------
  buildPalmTrees() {
    this.foliageManager = new window.FoliageManager(this.scene);
    this.foliageManager.populateMapFoliage(this);
  }

  getNearestRoadPoint(pos) {
    let bestDist = Infinity;
    let bestPt = new THREE.Vector3();
    let bestHeading = 0;
    let bestRoadId = "spap_road";

    this.roadMeshes.forEach((r) => {
      const v = new THREE.Vector3().subVectors(r.p2, r.p1);
      const w = new THREE.Vector3().subVectors(pos, r.p1);
      const c1 = w.dot(v);
      const c2 = v.dot(v);
      let t = 0;
      if (c2 > 0) t = Math.max(0, Math.min(1, c1 / c2));

      const proj = new THREE.Vector3().copy(r.p1).addScaledVector(v, t);
      const d = pos.distanceTo(proj);

      if (d < bestDist) {
        bestDist = d;
        bestPt.copy(proj);
        bestHeading = Math.atan2(v.x, v.z);
        bestRoadId = r.roadId;
      }
    });

    return { point: bestPt, distance: bestDist, heading: bestHeading, roadId: bestRoadId };
  }

  getLandmarkPositions() {
    return this.landmarks.map((l) => ({
      id: l.id,
      name: l.name,
      position: new THREE.Vector3(l.x, 0, l.z),
      color: l.color,
    }));
  }
}

window.KakkanadMapManager = KakkanadMapManager;
