/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 1: 3D VEHICLE & CHARACTER MODELS
 * Every model is built in code (no model files), with real-world proportions:
 * - Vehicles: side-profile extrusions with wheel-arch cut-outs and rounded (bevelled)
 *   edges, a narrower cabin with inset glass, chrome and black trim, round or square
 *   lamps, Kerala number plates, lathe-turned tyres and proper rims. Hindustan
 *   Ambassador, Bajaj-style auto rickshaw, Kerala private bus with livery and route
 *   board, Kerala Police SUV, Royal Enfield-style Bullet 350 and a wedge sports car.
 * - People: a sculpted parametric head (skull, brow, cheekbones, jaw and chin) with the
 *   face and hair painted in real proportions (eyes, iris, brows, lips, Kerala moustaches
 *   and beards, bindis, kajal), a modelled nose and ears, and hair volume inside the
 *   hairline; rounded limbs, hands and shoes. The player keeps the jointed rig (hips >
 *   thighs > knees, spine > head, shoulders > elbows); pedestrians use a light 5-part rig
 *   and one shared atlas material (heads + cloth patterns), so each person costs 5 draw
 *   calls. Men in shirts or T-shirts with a lungi, mundu or trousers; women in sarees
 *   (with the pallu over the shoulder) or churidars, braids or a bun with jasmine.
 * Parts that share a material are merged, so a vehicle costs ~7 draw calls + wheels.
 */

const PALETTE = [
  ["#1b1b1b", 0.92, 0], // 0 tyre rubber
  ["#b9bec5", 0.3, 1], // 1 alloy / steel rim
  ["#e2e4e6", 0.1, 1], // 2 chrome
  ["#22242a", 0.7, 0], // 3 dark trim
  ["#2b2d36", 0.85, 0], // 4 seat fabric
  ["#0e0f11", 0.55, 0], // 5 black plastic / grille
  ["#55585d", 0.45, 1], // 6 engine / hub metal
  ["#ecece8", 0.5, 0], // 7 white plastic
  ["#5a3520", 0.6, 0], // 8 brown leather
  ["#f29a1f", 0.4, 0], // 9 amber lens
  ["#111111", 0.95, 0], // 10 black canvas
  ["#8a8f96", 0.35, 1], // 11 brushed steel
];
const PAL = { tyre: 0, rim: 1, chrome: 2, trim: 3, seat: 4, black: 5, metal: 6, white: 7, leather: 8, amber: 9, canvas: 10, steel: 11 };

// Head profile by polar angle from the crown, every 15 degrees: [height, half-width, front
// depth, back depth, ring centre z] in metres. Face towards +Z; the neck meets the underside.
const HEAD_PROFILE = [
  [0.125, 0.0, 0.0, 0.0, -0.01],
  [0.121, 0.03, 0.031, 0.033, -0.01],
  [0.11, 0.053, 0.059, 0.063, -0.01],
  [0.093, 0.068, 0.08, 0.085, -0.01],
  [0.071, 0.077, 0.093, 0.099, -0.01],
  [0.045, 0.08, 0.1, 0.104, -0.01], // brow ridge
  [0.016, 0.08, 0.094, 0.103, -0.008], // eyes, set in
  [-0.014, 0.077, 0.1, 0.094, -0.004], // cheekbones
  [-0.042, 0.07, 0.1, 0.076, 0.002], // mouth
  [-0.067, 0.059, 0.092, 0.054, 0.008], // jaw
  [-0.087, 0.044, 0.078, 0.038, 0.014], // chin
  [-0.1, 0.024, 0.05, 0.026, 0.018],
  [-0.104, 0.0, 0.0, 0.0, 0.02],
];
// Hairline (degrees from the crown) every 15 degrees of azimuth, from the face to the back.
const HAIRLINES = {
  short: [40, 41, 45, 52, 62, 98, 84, 88, 100, 110, 118, 122, 124],
  receding: [27, 25, 31, 46, 62, 96, 84, 88, 100, 110, 118, 122, 124],
  long: [37, 38, 42, 50, 68, 100, 104, 112, 122, 132, 138, 141, 142],
};

class VehicleModelFactory {
  constructor() {
    this.paintMaterials = [];
    this.createPalette();
    this.glassMaterial = new THREE.MeshStandardMaterial({ color: 0x05090c, roughness: 0.02, metalness: 0.35, transparent: true, opacity: 0.84 });
    this.headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3dc });
    this.headlightMaterial.userData.glow = { day: 1.3, night: 9.0 };
    this.taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
    this.taillightMaterial.userData.glow = { day: 1.0, night: 4.0 };
    this.indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0xffa21a });
    this.indicatorMaterial.userData.glow = { day: 0.9, night: 2.2 };

    // Kerala liveries: dielectric paint under a clear coat (clearcoat follows the tier)
    this.autoGreenMat = this.paint(0x17603a);
    this.autoYellowMat = this.paint(0xf2b418, 0.02, 0.55); // canvas hood, semi-matt
    this.policeWhiteMat = this.paint(0xf1f3f4);
    this.policeBlueStripe = this.paint(0x163f8f);
    this.ambassadorWhite = this.paint(0xd8d5cb); // off-white, so the curves still shade in full sun
    this.busCreamMat = this.paint(0xf1ead8);
    this.bulletBlackMat = this.paint(0x0d0d0f, 0.4, 0.2);
    this.strobeRedMat = new THREE.MeshBasicMaterial({ color: 0xff1030 });
    this.strobeRedMat.userData.glow = { day: 5.0, night: 9.0 };
    this.strobeBlueMat = new THREE.MeshBasicMaterial({ color: 0x1070ff });
    this.strobeBlueMat.userData.glow = { day: 5.0, night: 9.0 };

    this.decalMaterial = this.createDecalAtlas(); // number plates, POLICE, route board
    this.busLiveryMat = this.createBusLivery();

    // People
    this.shirtTexture = this.createTommyShirtTexture();
    this.jeansTexture = this.createTommyJeansTexture();
    this.peopleAtlas = this.createPeopleAtlas();
  }

  paint(hex, metalness = 0.12, roughness = 0.3) {
    const mat = new THREE.MeshPhysicalMaterial({ color: hex, roughness, metalness, clearcoat: 0, clearcoatRoughness: 0.07 });
    this.paintMaterials.push(mat);
    return mat;
  }

  setClearcoat(amount) {
    this.paintMaterials.forEach((m) => (m.clearcoat = amount));
  }

  // --- Shared vehicle palette: tyres, rims, chrome, trim, seats... on ONE material -------
  createPalette() {
    const n = PALETTE.length;
    const albedo = GFX.makeCanvas(16, 1);
    const rm = GFX.makeCanvas(16, 1);
    const a = albedo.getContext("2d");
    const r = rm.getContext("2d");
    PALETTE.forEach(([hex, rough, metal], i) => {
      a.fillStyle = hex;
      a.fillRect(i, 0, 1, 1);
      r.fillStyle = `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
      r.fillRect(i, 0, 1, 1);
    });
    const tex = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return t;
    };
    const rmTex = tex(rm);
    this.paletteMaterial = new THREE.MeshStandardMaterial({ map: tex(albedo), roughnessMap: rmTex, metalnessMap: rmTex, roughness: 1, metalness: 1 });
    this.paletteSize = 16;
    void n;
  }

  setPaletteUV(geometry, index) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (index + 0.5) / this.paletteSize, 0.5);
    return geometry;
  }

  // Number plates, the Kerala Police door text and the bus route board on one texture.
  createDecalAtlas() {
    const c = GFX.makeCanvas(512, 512);
    const ctx = c.getContext("2d");
    const cells = {};
    const plate = (key, x, y, bg, fg, text) => {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, 256, 64);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 4, y + 4, 248, 56);
      ctx.fillStyle = fg;
      ctx.font = "bold 38px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + 128, y + 34);
      cells[key] = [x / 512, 1 - (y + 64) / 512, (x + 256) / 512, 1 - y / 512];
    };
    plate("private", 0, 0, "#f4f4f0", "#111", "KL 07 BZ 4821");
    plate("commercial", 256, 0, "#f2c21a", "#111", "KL 07 CT 2319");
    plate("police", 0, 64, "#f4f4f0", "#111", "KL 01 AP 1106");
    plate("bike", 256, 64, "#f4f4f0", "#111", "KL 39 H 3350");
    // POLICE door panel (Kerala Police blue on white)
    ctx.fillStyle = "#f1f3f4";
    ctx.fillRect(0, 128, 512, 128);
    ctx.fillStyle = "#163f8f";
    ctx.font = "bold 72px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("POLICE", 256, 178);
    ctx.font = "bold 30px Arial, sans-serif";
    ctx.fillStyle = "#c8102e";
    ctx.fillText("KERALA POLICE • 112", 256, 232);
    cells.police_door = [0, 1 - 256 / 512, 1, 1 - 128 / 512];
    // Route board: amber LED text on black
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 256, 512, 96);
    ctx.fillStyle = "#ffb52e";
    ctx.font = "bold 58px 'Courier New', monospace";
    ctx.fillText("KAKKANAD", 256, 306);
    cells.route = [0, 1 - 352 / 512, 1, 1 - 256 / 512];
    // Fare / "AMMA" sticker for autos: Malayalam-free, reads at a glance
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 352, 256, 64);
    ctx.fillStyle = "#ffd23f";
    ctx.font = "bold 34px Arial, sans-serif";
    ctx.fillText("AMMA", 128, 386);
    cells.auto_sticker = [0, 1 - 416 / 512, 0.5, 1 - 352 / 512];
    const tex = GFX.texture(c);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.1 });
    mat.userData.cells = cells;
    return mat;
  }

  // Kerala private bus livery: cream base, bold multi-colour sweeps, the bus's name.
  createBusLivery() {
    const W = 1024;
    const H = 256;
    const c = GFX.makeCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f1ead8";
    ctx.fillRect(0, 0, W, H);
    const band = (y, h, col, skew) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y - skew);
      ctx.lineTo(W, y - skew + h);
      ctx.lineTo(0, y + h);
      ctx.closePath();
      ctx.fill();
    };
    band(186, 34, "#c8102e", 18);
    band(172, 12, "#ff8c1a", 18);
    band(222, 10, "#1d3fa0", 18);
    band(40, 10, "#c8102e", -6);
    // name, big and italic, on the lower panel
    ctx.save();
    ctx.translate(W * 0.5, 146);
    ctx.transform(1, 0, -0.25, 1, 0, 0);
    ctx.font = "bold 78px 'Arial Black', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#1d3fa0";
    ctx.strokeText("MINNAL", 0, 0);
    ctx.fillStyle = "#ffd23f";
    ctx.fillText("MINNAL", 0, 0);
    ctx.restore();
    ctx.font = "bold 22px Arial, sans-serif";
    ctx.fillStyle = "#1d3fa0";
    ctx.textAlign = "center";
    ctx.fillText("KAKKANAD • PADAMUGAL • VYTTILA • FORT KOCHI", W * 0.5, 250 - 22);
    const tex = GFX.texture(c);
    // ExtrudeGeometry cap UVs are shape coordinates in metres: z in [-5.6, 5.6], y in [0.55, 3.2]
    tex.repeat.set(1 / 11.2, 1 / 2.65);
    tex.offset.set(0.5, -0.55 / 2.65);
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.32, metalness: 0.1, clearcoat: 0, clearcoatRoughness: 0.08 });
    this.paintMaterials.push(mat);
    return mat;
  }

  // --- Geometry helpers ---------------------------------------------------------------------
  // Consistent attributes for merging: indexed, position/normal/uv only.
  std(g) {
    Object.keys(g.attributes).forEach((k) => {
      if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    });
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.index) {
      const n = g.attributes.position.count;
      const ids = new Array(n);
      for (let i = 0; i < n; i++) ids[i] = i;
      g.setIndex(ids);
    }
    g.clearGroups();
    return g;
  }

  // Walk the bottom edge from z0 to z1 at height y, cutting a notch around each wheel.
  bottomWithArches(pts, z0, z1, y, arches, segs = 10) {
    pts.push([z0, y]);
    arches
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach((w) => {
        const dy = y - w.y;
        const h = Math.sqrt(Math.max(0.0001, w.r * w.r - dy * dy));
        let a1 = Math.atan2(dy, -h);
        const a2 = Math.atan2(dy, h);
        if (a1 < 0) a1 += Math.PI * 2; // axle above the sill: still go over the wheel
        for (let i = 0; i <= segs; i++) {
          const a = a1 + ((a2 - a1) * i) / segs;
          pts.push([w.z + Math.cos(a) * w.r, w.y + Math.sin(a) * w.r]);
        }
      });
    pts.push([z1, y]);
    return pts;
  }

  // Side profile [[z, y]...] (counter-clockwise) extruded across the width (X), bevelled.
  profileBody(pts, width, bevel = 0.06, segs = 3) {
    const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const depth = Math.max(0.01, width - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: segs, steps: 1, curveSegments: 6 });
    g.translate(0, 0, -depth / 2);
    g.rotateY(-Math.PI / 2);
    // weld by position only (paint is untextured) so the bevels shade smoothly
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    const merged = THREE.BufferGeometryUtils.mergeVertices(g, 1e-4);
    merged.computeVertexNormals();
    return this.std(merged);
  }

  // Flat pane (glass, decal) through the 4 corners (bl, br, tr, tl) facing outwards.
  pane(corners, uv = [0, 0, 1, 1]) {
    const g = new THREE.BufferGeometry();
    const p = [];
    corners.forEach((c) => p.push(c[0], c[1], c[2]));
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }

  // Side window: polygon [[z, y]...] on the plane x, facing +X (outward > 0) or -X.
  sideGlass(poly, x, outward) {
    const src = new THREE.ShapeGeometry(new THREE.Shape(poly.map(([z, y]) => new THREE.Vector2(z, y))));
    const sp = src.attributes.position;
    const p = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) {
      p[i * 3] = x;
      p[i * 3 + 1] = sp.getY(i);
      p[i * 3 + 2] = sp.getX(i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", src.attributes.uv.clone());
    const idx = Array.from(src.index.array);
    // (z, y) seen from +X runs right-to-left: flip the winding for the +X side
    if (outward > 0) {
      for (let i = 0; i < idx.length; i += 3) {
        const t = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = t;
      }
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    return this.std(g);
  }

  // Shrink a polygon towards its centroid (quick inset for window openings).
  inset(poly, k) {
    let cz = 0;
    let cy = 0;
    poly.forEach(([z, y]) => {
      cz += z;
      cy += y;
    });
    cz /= poly.length;
    cy /= poly.length;
    return poly.map(([z, y]) => [cz + (z - cz) * k, cy + (y - cy) * k]);
  }

  box(w, h, d, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  }

  cyl(rTop, rBot, h, seg, x, y, z, axis = "y") {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    if (axis === "x") g.rotateZ(Math.PI / 2);
    if (axis === "z") g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    return g;
  }

  sphere(r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 12, hs = 8) {
    const g = new THREE.SphereGeometry(r, ws, hs);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return g;
  }

  // Parts list [[geometry, material, paletteIndex?]] -> meshes added to the group.
  addParts(group, parts) {
    parts.forEach(([geo, mat, pal]) => {
      if (pal !== undefined) this.setPaletteUV(geo, pal);
      const m = new THREE.Mesh(this.std(geo), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    });
  }

  roundLamp(r, x, y, z, mat, bezel = true, facing = 1) {
    const out = [[this.cyl(r, r, 0.04, 16, x, y, z, "z"), mat]];
    if (bezel) {
      const t = new THREE.TorusGeometry(r + 0.012, 0.014, 6, 18);
      t.translate(x, y, z + 0.015 * facing);
      out.push([t, this.paletteMaterial, PAL.chrome]);
    }
    return out;
  }

  plate(kind, x, y, z, facing, w = 0.52, h = 0.13) {
    const cell = this.decalMaterial.userData.cells[kind];
    const hw = w / 2;
    const f = facing;
    // facing +1: towards +Z (front); -1: towards -Z (rear)
    const corners = f > 0
      ? [[x - hw, y - h / 2, z], [x + hw, y - h / 2, z], [x + hw, y + h / 2, z], [x - hw, y + h / 2, z]]
      : [[x + hw, y - h / 2, z], [x - hw, y - h / 2, z], [x - hw, y + h / 2, z], [x + hw, y + h / 2, z]];
    return [
      [this.pane(corners, cell), this.decalMaterial],
      [this.box(w + 0.03, h + 0.03, 0.02, x, y, z - 0.012 * f), this.paletteMaterial, PAL.black],
    ];
  }

  // Wheel: lathe-turned tyre + rim style ("alloy", "steel", "hubcap", "spoke", "auto").
  createWheel(radius, width, style = "alloy") {
    const parts = [];
    const r = radius;
    const hw = width / 2;
    const rr = style === "spoke" ? r * 0.82 : r * 0.64; // rim radius
    const round = Math.min(0.045, width * 0.25);
    const prof = [
      [rr, -hw * 0.9],
      [r - round, -hw],
      [r - round * 0.3, -hw + round * 0.4],
      [r, -hw + round],
      [r, hw - round],
      [r - round * 0.3, hw - round * 0.4],
      [r - round, hw],
      [rr, hw * 0.9],
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const tyre = new THREE.LatheGeometry(prof, 22);
    tyre.rotateZ(Math.PI / 2);
    parts.push(this.setPaletteUV(this.std(tyre), PAL.tyre));
    if (style === "spoke") {
      const rim = new THREE.TorusGeometry(rr, 0.014, 6, 24);
      rim.rotateY(Math.PI / 2);
      parts.push(this.setPaletteUV(this.std(rim), PAL.chrome));
      parts.push(this.setPaletteUV(this.std(this.cyl(0.05, 0.05, width * 0.9, 10, 0, 0, 0, "x")), PAL.chrome));
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const s = this.cyl(0.004, 0.004, rr, 3, 0, 0, 0);
        s.translate(0, rr / 2, 0);
        s.rotateX(a);
        s.translate((k % 2 ? 1 : -1) * 0.02, 0, 0);
        parts.push(this.setPaletteUV(this.std(s), PAL.steel));
      }
    } else {
      const dishDepth = width * 0.7;
      const rimGeo = this.cyl(rr, rr, dishDepth, 18, 0, 0, 0, "x");
      parts.push(this.setPaletteUV(this.std(rimGeo), style === "alloy" ? PAL.rim : PAL.steel));
      if (style === "alloy") {
        for (let k = 0; k < 5; k++) {
          const s = this.box(0.03, rr * 1.6, rr * 0.22, (width / 2) * 0.72, 0, 0);
          s.rotateX((k / 5) * Math.PI);
          parts.push(this.setPaletteUV(this.std(s), PAL.chrome));
        }
      }
      // hub / hubcap on both faces
      [-1, 1].forEach((sd) => {
        const cap = this.sphere(rr * (style === "hubcap" ? 0.78 : 0.36), (sd * dishDepth) / 2, 0, 0, 0.35, 1, 1, 14, 6);
        parts.push(this.setPaletteUV(this.std(cap), style === "hubcap" ? PAL.chrome : PAL.metal));
      });
    }
    const wheel = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(parts, false), this.paletteMaterial);
    wheel.castShadow = true;
    wheel.rotation.order = "YXZ"; // steer (Y) then spin (X)
    wheel.userData.radius = radius;
    return wheel;
  }

  place(mesh, x, y, z, parent) {
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  // Sprung body group, merged same-material parts, per-vehicle brake-light material,
  // front/rear wheel sets. Called at the end of every vehicle builder.
  finalizeVehicle(group) {
    const ud = group.userData;
    const body = new THREE.Group();
    body.name = "body";
    const keep = new Set([...ud.wheels, ud.badge]);
    group.children.slice().forEach((child) => {
      if (!keep.has(child)) {
        group.remove(child);
        body.add(child);
      }
    });
    group.add(body);

    const tail = this.taillightMaterial.clone();
    tail.userData = Object.assign({}, this.taillightMaterial.userData);
    body.traverse((o) => {
      if (o.isMesh && o.material === this.taillightMaterial) o.material = tail;
    });

    const separate = new Set([ud.strobeRed, ud.strobeBlue, ud.driverAvatar].filter(Boolean));
    const byMaterial = new Map();
    body.children.forEach((c) => {
      if (!c.isMesh || separate.has(c)) return;
      if (!byMaterial.has(c.material)) byMaterial.set(c.material, []);
      byMaterial.get(c.material).push(c);
    });
    byMaterial.forEach((meshes, material) => {
      if (meshes.length < 2) return;
      const geos = meshes.map((m) => {
        m.updateMatrix();
        const g = this.std(m.geometry.clone());
        g.applyMatrix4(m.matrix);
        return g;
      });
      const merged = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false), material);
      merged.castShadow = material !== this.glassMaterial;
      merged.receiveShadow = true;
      meshes.forEach((m) => body.remove(m));
      body.add(merged);
    });

    ud.body = body;
    ud.tailMaterial = tail;
    ud.frontWheels = ud.wheels.filter((w) => w.position.z > 0.2);
    ud.rearWheels = ud.wheels.filter((w) => w.position.z <= 0.2);
    return group;
  }

  finish(group, type, wheels, avatar, badge, collider, extra = {}) {
    group.userData = Object.assign({ type, wheels, driverAvatar: avatar, badge, collider }, extra);
    return this.finalizeVehicle(group);
  }

  // --- 1. KAKKANAD AUTO RICKSHAW (Bajaj RE-style three-wheeler) --------------------------------
  createAutoRickshawMesh() {
    const group = new THREE.Group();
    group.name = "autoRickshaw";
    const G = this.autoGreenMat;
    const Y = this.autoYellowMat;
    const P = this.paletteMaterial;
    const rw = 0.23;
    const rear = -0.74;
    const parts = [];

    // rear passenger tub: full width, rounded, notched over the rear wheels
    const tub = this.bottomWithArches([], -1.3, 0.3, 0.27, [{ z: rear, y: rw, r: 0.3 }]);
    tub.push([0.3, 0.8], [-1.2, 0.8], [-1.3, 0.7]);
    parts.push([this.profileBody(tub, 1.28, 0.07), G]);
    // front cowl: narrower, bulging nose that carries the headlamp
    const cowl = [[0.25, 0.52], [1.16, 0.52], [1.3, 0.56], [1.33, 0.68], [1.26, 0.86], [1.06, 0.98], [0.25, 0.98]];
    parts.push([this.profileBody(cowl, 0.9, 0.12, 4), G]);
    // front mudguard over the front wheel
    const guard = new THREE.TorusGeometry(rw + 0.07, 0.06, 6, 12, Math.PI * 0.9);
    guard.rotateY(Math.PI / 2);
    guard.rotateX(-Math.PI * 0.05);
    guard.translate(0, rw, 0.98);
    parts.push([guard, G]);
    // floor / step and the black bumper strip
    parts.push([this.box(1.18, 0.05, 1.5, 0, 0.3, -0.5), P, PAL.black]);
    parts.push([this.box(1.3, 0.12, 0.08, 0, 0.36, -1.33), P, PAL.black]);

    // canopy: rounded canvas hood on black posts
    const arch = new THREE.Shape();
    arch.moveTo(-0.66, 0);
    arch.lineTo(-0.66, 0.1);
    arch.quadraticCurveTo(-0.62, 0.3, 0, 0.34);
    arch.quadraticCurveTo(0.62, 0.3, 0.66, 0.1);
    arch.lineTo(0.66, 0);
    arch.lineTo(0.62, 0);
    arch.lineTo(0.62, 0.09);
    arch.quadraticCurveTo(0.58, 0.26, 0, 0.3);
    arch.quadraticCurveTo(-0.58, 0.26, -0.62, 0.09);
    arch.lineTo(-0.62, 0);
    arch.lineTo(-0.66, 0);
    const hood = new THREE.ExtrudeGeometry(arch, { depth: 2.05, bevelEnabled: false, curveSegments: 10 });
    hood.translate(0, 1.38, -1.3);
    parts.push([this.std(THREE.BufferGeometryUtils.mergeVertices(hood)), Y]);
    parts.push([this.box(1.3, 0.62, 0.04, 0, 1.1, -1.28), P, PAL.canvas]); // rear canvas panel
    parts.push([this.box(0.7, 0.24, 0.02, 0, 1.18, -1.305), this.glassMaterial]); // rear window
    [[-0.63, -1.25], [0.63, -1.25], [-0.63, 0.55], [0.63, 0.55]].forEach(([x, z]) => {
      parts.push([this.cyl(0.022, 0.022, 0.62, 6, x, 1.1, z), P, PAL.trim]);
    });
    // windscreen, wiper, handlebar, mirrors
    parts.push([this.pane([[-0.5, 0.98, 0.98], [0.5, 0.98, 0.98], [0.52, 1.48, 0.8], [-0.52, 1.48, 0.8]]), this.glassMaterial]);
    parts.push([this.box(0.02, 0.02, 0.4, 0.1, 1.2, 0.9), P, PAL.black]);
    parts.push([this.cyl(0.016, 0.016, 0.74, 8, 0, 1.02, 0.66, "x"), P, PAL.chrome]);
    [-0.4, 0.4].forEach((x) => parts.push([this.cyl(0.024, 0.024, 0.1, 8, x, 1.02, 0.66, "x"), P, PAL.black]));
    [-0.56, 0.56].forEach((x) => parts.push([this.box(0.1, 0.07, 0.02, x, 1.35, 0.84), P, PAL.chrome]));
    // seats: driver saddle and rear bench with backrest
    parts.push([this.box(0.44, 0.1, 0.34, 0, 0.72, 0.3), P, PAL.leather]);
    parts.push([this.box(1.1, 0.14, 0.44, 0, 0.66, -0.72), P, PAL.seat]);
    parts.push([this.box(1.1, 0.42, 0.1, 0, 0.9, -1.0), P, PAL.seat]);
    // lamps and plates
    this.roundLamp(0.085, 0, 0.72, 1.335, this.headlightMaterial).forEach((p) => parts.push(p));
    [-0.34, 0.34].forEach((x) => parts.push([this.box(0.07, 0.05, 0.03, x, 0.83, 1.22), this.indicatorMaterial]));
    [-0.5, 0.5].forEach((x) => parts.push([this.box(0.14, 0.08, 0.03, x, 0.55, -1.34), this.taillightMaterial]));
    this.plate("commercial", 0, 0.52, -1.345, -1, 0.34, 0.1).forEach((p) => parts.push(p));
    this.plate("commercial", 0, 0.5, 1.32, 1, 0.3, 0.09).forEach((p) => parts.push(p));
    parts.push([this.pane([[0.3, 0.6, -1.345], [-0.3, 0.6, -1.345], [-0.3, 0.7, -1.345], [0.3, 0.7, -1.345]], this.decalMaterial.userData.cells.auto_sticker), this.decalMaterial]);
    this.addParts(group, parts);

    const avatar = this.place(this.createDriverAvatar(), 0, 0.72, 0.28, group);
    avatar.visible = false;
    const badge = this.place(this.createInteractionBadge("ENTER [F]"), 0, 2.3, 0, group);
    const wheels = [
      this.place(this.createWheel(rw, 0.14, "auto"), 0, rw, 0.98, group),
      this.place(this.createWheel(rw, 0.14, "auto"), -0.58, rw, rear, group),
      this.place(this.createWheel(rw, 0.14, "auto"), 0.58, rw, rear, group),
    ];
    return this.finish(group, "AUTO_RICKSHAW", wheels, avatar, badge, { width: 1.5, length: 2.8, height: 1.8 });
  }

  // --- 2. KERALA PRIVATE BUS ------------------------------------------------------------------
  createKeralaBusMesh() {
    const group = new THREE.Group();
    group.name = "keralaBus";
    const P = this.paletteMaterial;
    const parts = [];
    const rw = 0.5;
    const fz = 3.65;
    const rz = -3.3;

    // body: livery on the flanks (extrude caps), cream roof / ends (extrude walls)
    const prof = this.bottomWithArches([], -5.6, 5.6, 0.55, [{ z: fz, y: rw, r: 0.62 }, { z: rz, y: rw, r: 0.62 }], 12);
    prof.push([5.62, 1.2], [5.56, 2.85], [5.42, 3.12], [5.2, 3.2], [-5.35, 3.2], [-5.58, 3.02], [-5.6, 0.55]);
    const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
    const depth = 2.5;
    const ext = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 });
    ext.translate(0, 0, -depth / 2);
    ext.rotateY(-Math.PI / 2);
    // split groups: 0 = caps (flanks, livery), 1 = walls (roof, nose, tail)
    const split = (grp) => {
      const g = new THREE.BufferGeometry();
      ["position", "normal", "uv"].forEach((k) => {
        const src = ext.attributes[k];
        const it = src.itemSize;
        const arr = new Float32Array(grp.count * it);
        arr.set(src.array.subarray(grp.start * it, (grp.start + grp.count) * it));
        g.setAttribute(k, new THREE.Float32BufferAttribute(arr, it));
      });
      return this.std(g);
    };
    const groups = ext.groups;
    const flanks = split(groups[0]);
    // cap UVs are (z, y) in metres; seen from +X, +Z runs leftwards: mirror that flank
    const fp = flanks.attributes.position;
    const fu = flanks.attributes.uv;
    for (let i = 0; i < fu.count; i++) if (fp.getX(i) > 0) fu.setX(i, -fu.getX(i));
    parts.push([flanks, this.busLiveryMat]);
    if (groups[1]) parts.push([split(groups[1]), this.busCreamMat]);

    // window band with pillars, both sides
    const sx = depth / 2 + 0.055;
    [1, -1].forEach((side) => {
      parts.push([this.sideGlass([[-5.1, 1.72], [4.55, 1.72], [4.55, 2.78], [-5.1, 2.78]], side * sx, side), this.glassMaterial]);
      for (let z = -5.1; z <= 4.6; z += 1.08) parts.push([this.box(0.03, 1.08, 0.12, side * (sx + 0.01), 2.25, z), this.busCreamMat]);
    });
    // doors on the kerb (left, +X) side: dark openings with steps
    [2.6, -2.45].forEach((z) => {
      parts.push([this.box(0.03, 2.05, 0.95, sx + 0.02, 1.62, z), P, PAL.black]);
      parts.push([this.box(0.3, 0.06, 0.95, sx - 0.1, 0.62, z), P, PAL.steel]);
    });
    // windscreen (two panes), route board, grille, bumpers, lamps
    [-0.6, 0.6].forEach((x) => parts.push([this.pane([[x - 0.58, 1.5, 5.66], [x + 0.58, 1.5, 5.66], [x + 0.56, 2.78, 5.6], [x - 0.56, 2.78, 5.6]]), this.glassMaterial]));
    parts.push([this.box(0.05, 1.3, 0.05, 0, 2.14, 5.65), P, PAL.black]);
    const route = this.decalMaterial.userData.cells.route;
    const board = new THREE.MeshBasicMaterial({ map: this.decalMaterial.map });
    board.userData.glow = { day: 1.0, night: 2.4 };
    parts.push([this.pane([[-0.95, 2.86, 5.55], [0.95, 2.86, 5.55], [0.95, 3.08, 5.5], [-0.95, 3.08, 5.5]], route), board]);
    parts.push([this.box(1.6, 0.34, 0.04, 0, 0.98, 5.67), P, PAL.black]);
    for (let y = 0.86; y <= 1.1; y += 0.08) parts.push([this.box(1.5, 0.025, 0.02, 0, y, 5.695), P, PAL.chrome]);
    parts.push([this.box(2.62, 0.26, 0.2, 0, 0.62, 5.66), P, PAL.black]);
    parts.push([this.box(2.62, 0.26, 0.2, 0, 0.62, -5.66), P, PAL.black]);
    [-1.0, -0.72, 0.72, 1.0].forEach((x) => this.roundLamp(0.09, x, 0.98, 5.68, this.headlightMaterial).forEach((p) => parts.push(p)));
    [-1.0, 1.0].forEach((x) => {
      parts.push([this.box(0.2, 0.3, 0.04, x, 1.0, -5.64), this.taillightMaterial]);
      parts.push([this.box(0.12, 0.08, 0.04, x, 1.25, 5.66), this.indicatorMaterial]);
    });
    parts.push([this.pane([[1.05, 1.4, -5.64], [-1.05, 1.4, -5.64], [-1.05, 2.7, -5.64], [1.05, 2.7, -5.64]]), this.glassMaterial]);
    this.plate("commercial", 0, 0.72, 5.77, 1, 0.5, 0.12).forEach((p) => parts.push(p));
    this.plate("commercial", 0, 0.9, -5.67, -1, 0.5, 0.12).forEach((p) => parts.push(p));
    // roof rails, mirrors on stalks
    [-0.9, 0.9].forEach((x) => parts.push([this.box(0.05, 0.08, 8.5, x, 3.28, -0.5), P, PAL.steel]));
    [-1.35, 1.35].forEach((x) => {
      parts.push([this.box(0.04, 0.04, 0.5, x * 1.02, 2.5, 5.5), P, PAL.black]);
      parts.push([this.box(0.06, 0.34, 0.2, x * 1.08, 2.35, 5.72), P, PAL.black]);
    });
    this.addParts(group, parts);

    const avatar = this.place(this.createDriverAvatar(), -0.75, 1.05, 4.75, group);
    avatar.visible = false;
    const badge = this.place(this.createInteractionBadge("HIJACK BUS [F]"), 0, 3.8, 0, group);
    const wheels = [
      [-1.08, fz],
      [1.08, fz],
      [-1.02, rz],
      [1.02, rz],
      [-1.02, rz - 1.25],
      [1.02, rz - 1.25],
    ].map(([x, z]) => this.place(this.createWheel(rw, 0.34, "steel"), x, rw, z, group));
    return this.finish(group, "KERALA_BUS", wheels, avatar, badge, { width: 3.0, length: 11.5, height: 3.4 });
  }

  // --- 3. KERALA POLICE SUV (Bolero-style) ------------------------------------------------------
  createPoliceJeepMesh() {
    const group = new THREE.Group();
    group.name = "policeJeep";
    const W = this.policeWhiteMat;
    const P = this.paletteMaterial;
    const parts = [];
    const rw = 0.37;
    const az = 1.34;

    const lower = this.bottomWithArches([], -2.02, 2.02, 0.44, [{ z: az, y: rw, r: 0.47 }, { z: -az, y: rw, r: 0.47 }]);
    lower.push([2.05, 0.92], [1.98, 1.04], [1.1, 1.08], [0.74, 1.1], [-2.0, 1.1], [-2.04, 0.9]);
    parts.push([this.profileBody(lower, 1.78, 0.06), W]);
    const cabin = [[0.74, 1.08], [0.42, 1.72], [0.3, 1.76], [-1.96, 1.78], [-2.0, 1.08]];
    parts.push([this.profileBody(cabin, 1.64, 0.05), W]);
    // blue waist band and POLICE door panels
    const hx = 0.9;
    [1, -1].forEach((s) => {
      parts.push([this.box(0.02, 0.16, 3.6, s * hx, 0.98, 0), this.policeBlueStripe]);
      const cell = this.decalMaterial.userData.cells.police_door;
      const x = s * (hx + 0.012);
      const zc = -0.35;
      // seen from +X, +Z is on the left; from -X it is on the right
      const c = s > 0
        ? [[x, 0.55, zc + 0.55], [x, 0.55, zc - 0.55], [x, 0.83, zc - 0.55], [x, 0.83, zc + 0.55]]
        : [[x, 0.55, zc - 0.55], [x, 0.55, zc + 0.55], [x, 0.83, zc + 0.55], [x, 0.83, zc - 0.55]];
      parts.push([this.pane(c, cell), this.decalMaterial]);
      // side glass (front + rear doors, quarter) with pillars left in paint
      const gx = s * 0.84;
      parts.push([this.sideGlass([[0.62, 1.14], [0.36, 1.66], [-0.12, 1.68], [-0.12, 1.14]], gx, s), this.glassMaterial]);
      parts.push([this.sideGlass([[-0.22, 1.14], [-0.22, 1.69], [-1.1, 1.7], [-1.1, 1.14]], gx, s), this.glassMaterial]);
      parts.push([this.sideGlass([[-1.2, 1.14], [-1.2, 1.7], [-1.9, 1.71], [-1.9, 1.14]], gx, s), this.glassMaterial]);
      // side step, door handles, mirror
      parts.push([this.box(0.14, 0.05, 1.9, s * 0.93, 0.44, 0), P, PAL.steel]);
      [0.2, -0.75].forEach((z) => parts.push([this.box(0.03, 0.03, 0.14, s * 0.905, 1.0, z), P, PAL.black]));
      parts.push([this.box(0.06, 0.16, 0.22, s * 0.98, 1.28, 0.72), P, PAL.black]);
    });
    parts.push([this.pane([[-0.74, 1.13, 0.73], [0.74, 1.13, 0.73], [0.7, 1.68, 0.46], [-0.7, 1.68, 0.46]]), this.glassMaterial]);
    parts.push([this.pane([[0.7, 1.16, -2.03], [-0.7, 1.16, -2.03], [-0.7, 1.66, -2.03], [0.7, 1.66, -2.03]]), this.glassMaterial]);
    // grille, bumpers, bull bar, lamps
    parts.push([this.box(1.2, 0.3, 0.04, 0, 0.84, 2.06), P, PAL.black]);
    for (let x = -0.5; x <= 0.5; x += 0.2) parts.push([this.box(0.03, 0.26, 0.02, x, 0.84, 2.085), P, PAL.chrome]);
    parts.push([this.box(1.84, 0.2, 0.22, 0, 0.5, 2.08), P, PAL.black]);
    parts.push([this.box(1.84, 0.2, 0.18, 0, 0.5, -2.08), P, PAL.black]);
    [-0.3, 0.3].forEach((x) => parts.push([this.cyl(0.03, 0.03, 0.5, 8, x, 0.72, 2.24), P, PAL.black]));
    parts.push([this.cyl(0.03, 0.03, 0.7, 8, 0, 0.95, 2.24, "x"), P, PAL.black]);
    [-0.72, 0.72].forEach((x) => {
      parts.push([this.box(0.26, 0.16, 0.04, x, 0.86, 2.07), this.headlightMaterial]);
      parts.push([this.box(0.1, 0.06, 0.04, x * 1.12, 0.74, 2.07), this.indicatorMaterial]);
      parts.push([this.box(0.16, 0.3, 0.04, x * 1.14, 1.0, -2.03), this.taillightMaterial]);
    });
    this.plate("police", 0, 0.52, 2.2, 1, 0.5, 0.12).forEach((p) => parts.push(p));
    this.plate("police", 0, 0.78, -2.04, -1, 0.5, 0.12).forEach((p) => parts.push(p));
    // roof light bar (strobes are separate meshes so they can flash)
    parts.push([this.box(1.2, 0.08, 0.3, 0, 1.83, 0.1), P, PAL.black]);
    this.addParts(group, parts);
    const redStrobe = this.place(new THREE.Mesh(this.box(0.48, 0.13, 0.26, 0, 0, 0), this.strobeRedMat), -0.3, 1.93, 0.1, group);
    const blueStrobe = this.place(new THREE.Mesh(this.box(0.48, 0.13, 0.26, 0, 0, 0), this.strobeBlueMat), 0.3, 1.93, 0.1, group);
    const spare = this.place(this.createWheel(0.36, 0.24, "steel"), 0, 1.0, -2.2, group);
    spare.rotation.y = Math.PI / 2;

    const avatar = this.place(this.createDriverAvatar(), -0.42, 0.9, 0.0, group);
    avatar.visible = false;
    const badge = this.place(this.createInteractionBadge("STEAL POLICE JEEP [F]"), 0, 2.8, 0, group);
    const wheels = [
      [-0.76, az],
      [0.76, az],
      [-0.76, -az],
      [0.76, -az],
    ].map(([x, z]) => this.place(this.createWheel(rw, 0.25, "steel"), x, rw, z, group));
    return this.finish(group, "POLICE_JEEP", wheels, avatar, badge, { width: 2.0, length: 4.4, height: 2.0 }, { strobeRed: redStrobe, strobeBlue: blueStrobe });
  }

  // --- 4. HINDUSTAN AMBASSADOR -----------------------------------------------------------------
  createAmbassadorMesh() {
    const group = new THREE.Group();
    group.name = "ambassador";
    const Wm = this.ambassadorWhite;
    const P = this.paletteMaterial;
    const parts = [];
    const rw = 0.33;
    const az = 1.24;

    const lower = this.bottomWithArches([], -2.1, 2.1, 0.32, [{ z: az, y: rw, r: 0.41 }, { z: -az + 0.01, y: rw, r: 0.41 }]);
    lower.push([2.15, 0.46], [2.14, 0.7], [2.03, 0.85], [1.72, 0.94], [0.72, 0.99], [-1.12, 0.99], [-1.36, 0.97], [-1.86, 0.92], [-2.08, 0.8], [-2.16, 0.55]);
    parts.push([this.profileBody(lower, 1.66, 0.1, 4), Wm]);
    // domed cabin
    const cabinPts = [[0.72, 0.98], [0.46, 1.3], [0.24, 1.47], [-0.2, 1.54], [-0.72, 1.51], [-1.02, 1.38], [-1.36, 0.97]];
    parts.push([this.profileBody(cabinPts, 1.38, 0.12, 4), Wm]);
    // glass: front/rear door windows and quarter lights, windscreen, rear window
    [1, -1].forEach((s) => {
      const gx = s * 0.705;
      parts.push([this.sideGlass([[0.6, 1.03], [0.42, 1.3], [0.22, 1.44], [-0.12, 1.49], [-0.12, 1.03]], gx, s), this.glassMaterial]);
      parts.push([this.sideGlass([[-0.22, 1.03], [-0.22, 1.49], [-0.66, 1.47], [-0.92, 1.36], [-1.08, 1.12], [-1.08, 1.03]], gx, s), this.glassMaterial]);
      // chrome side strip, door handles, mirror
      parts.push([this.box(0.015, 0.025, 3.7, s * 0.845, 0.78, 0.02), P, PAL.chrome]);
      [0.02, -0.92].forEach((z) => parts.push([this.box(0.03, 0.025, 0.12, s * 0.84, 0.92, z), P, PAL.chrome]));
      parts.push([this.box(0.05, 0.08, 0.1, s * 0.86, 1.08, 0.68), P, PAL.chrome]);
    });
    parts.push([this.pane([[-0.62, 1.02, 0.7], [0.62, 1.02, 0.7], [0.54, 1.44, 0.28], [-0.54, 1.44, 0.28]]), this.glassMaterial]);
    parts.push([this.pane([[0.58, 1.02, -1.31], [-0.58, 1.02, -1.31], [-0.5, 1.35, -1.05], [0.5, 1.35, -1.05]]), this.glassMaterial]);
    // the famous grille, round headlamps in the wings, chrome bumpers with guards
    parts.push([this.box(0.96, 0.3, 0.05, 0, 0.62, 2.14), P, PAL.black]);
    for (let y = 0.5; y <= 0.75; y += 0.05) parts.push([this.box(0.94, 0.018, 0.03, 0, y, 2.165), P, PAL.chrome]);
    parts.push([this.box(1.0, 0.03, 0.04, 0, 0.785, 2.16), P, PAL.chrome]);
    [-0.64, 0.64].forEach((x) => {
      this.roundLamp(0.095, x, 0.66, 2.12, this.headlightMaterial).forEach((p) => parts.push(p));
      parts.push([this.cyl(0.03, 0.03, 0.03, 10, x * 0.8, 0.48, 2.16, "z"), this.indicatorMaterial]);
      parts.push([this.box(0.1, 0.2, 0.04, x * 1.1, 0.66, -2.13), this.taillightMaterial]);
    });
    [2.2, -2.2].forEach((z) => {
      parts.push([this.box(1.72, 0.1, 0.1, 0, 0.36, z), P, PAL.chrome]);
      [-0.36, 0.36].forEach((x) => parts.push([this.box(0.06, 0.18, 0.06, x, 0.42, z + Math.sign(z) * 0.03), P, PAL.chrome]));
    });
    this.plate("private", 0, 0.5, 2.17, 1, 0.46, 0.11).forEach((p) => parts.push(p));
    this.plate("private", 0, 0.58, -2.13, -1, 0.46, 0.11).forEach((p) => parts.push(p));
    parts.push([this.box(1.2, 0.02, 0.9, 0, 0.99, 1.3), Wm]); // hood crease
    this.addParts(group, parts);

    const avatar = this.place(this.createDriverAvatar(), -0.38, 0.55, 0.05, group);
    avatar.visible = false;
    const badge = this.place(this.createInteractionBadge("ENTER CAR [F]"), 0, 2.2, 0, group);
    const wheels = [
      [-0.66, az],
      [0.66, az],
      [-0.66, -az],
      [0.66, -az],
    ].map(([x, z]) => this.place(this.createWheel(rw, 0.2, "hubcap"), x, rw, z, group));
    return this.finish(group, "AMBASSADOR", wheels, avatar, badge, { width: 1.9, length: 4.5, height: 1.6 });
  }

  // --- 5. BULLET 350 (Royal Enfield-style) ---------------------------------------------------------
  createSuperbikeMesh() {
    const group = new THREE.Group();
    group.name = "bullet350";
    const B = this.bulletBlackMat;
    const P = this.paletteMaterial;
    const parts = [];
    const rw = 0.33;
    const fz = 0.72;
    const rz = -0.7;

    // teardrop tank, side boxes, frame tubes
    const tank = new THREE.SphereGeometry(0.2, 18, 12);
    tank.scale(0.62, 0.62, 1.4);
    tank.translate(0, 0.9, 0.2);
    parts.push([tank, B]);
    parts.push([this.box(0.03, 0.02, 0.3, 0.12, 0.93, 0.2), P, PAL.chrome]); // pinstripe badge
    parts.push([this.box(0.03, 0.02, 0.3, -0.12, 0.93, 0.2), P, PAL.chrome]);
    [-1, 1].forEach((s) => parts.push([this.box(0.1, 0.2, 0.28, s * 0.14, 0.66, -0.25), B]));
    parts.push([this.cyl(0.025, 0.025, 1.05, 8, 0, 0.72, 0.05, "z"), P, PAL.trim]);
    const down = this.cyl(0.025, 0.025, 0.62, 8, 0, 0, 0);
    down.rotateX(0.5);
    down.translate(0, 0.62, 0.46);
    parts.push([down, P, PAL.trim]);
    // engine: finned barrel, crankcase, gearbox cover
    for (let i = 0; i < 6; i++) parts.push([this.cyl(0.09, 0.09, 0.015, 12, 0, 0.62 + i * 0.03, 0.02), P, PAL.steel]);
    parts.push([this.cyl(0.07, 0.07, 0.2, 12, 0, 0.7, 0.02), P, PAL.metal]);
    parts.push([this.sphere(0.16, 0, 0.44, 0.0, 0.8, 0.9, 1.1, 14, 8), P, PAL.steel]);
    parts.push([this.sphere(0.12, 0.1, 0.46, -0.18, 0.5, 1, 1.2, 12, 8), P, PAL.chrome]);
    // long chrome exhaust with the peashooter silencer
    const pipe = this.cyl(0.03, 0.03, 1.0, 10, 0, 0, 0, "z");
    pipe.translate(0.16, 0.34, -0.35);
    parts.push([pipe, P, PAL.chrome]);
    parts.push([this.cyl(0.05, 0.035, 0.34, 12, 0.17, 0.36, -0.86, "z"), P, PAL.chrome]);
    // split seat and pillion, mudguards, forks, headlamp nacelle, bars, mirrors
    parts.push([this.box(0.26, 0.08, 0.36, 0, 0.95, -0.2), P, PAL.leather]);
    parts.push([this.box(0.24, 0.07, 0.28, 0, 0.93, -0.52), P, PAL.leather]);
    [[fz, 0.2], [rz, -0.2]].forEach(([z, tilt]) => {
      const g = new THREE.TorusGeometry(rw + 0.05, 0.05, 6, 14, Math.PI * 0.75);
      g.scale(1, 1, 0.9);
      g.rotateY(Math.PI / 2);
      g.rotateX(-Math.PI * 0.12 + tilt);
      g.translate(0, rw, z);
      parts.push([g, B]);
    });
    [-0.09, 0.09].forEach((x) => {
      const fork = this.cyl(0.022, 0.022, 0.72, 8, 0, 0, 0);
      fork.rotateX(-0.42);
      fork.translate(x, 0.66, fz - 0.13);
      parts.push([fork, P, PAL.chrome]);
    });
    parts.push([this.sphere(0.12, 0, 1.0, 0.82, 1, 1, 0.8, 16, 10), P, PAL.chrome]);
    this.roundLamp(0.085, 0, 1.0, 0.915, this.headlightMaterial, false).forEach((p) => parts.push(p));
    [-0.06, 0.06].forEach((x) => parts.push([this.cyl(0.018, 0.018, 0.02, 8, x * 1.8, 1.08, 0.86, "z"), this.indicatorMaterial]));
    parts.push([this.cyl(0.014, 0.014, 0.72, 8, 0, 1.12, 0.66, "x"), P, PAL.chrome]);
    [-0.38, 0.38].forEach((x) => {
      parts.push([this.cyl(0.02, 0.02, 0.1, 8, x, 1.12, 0.66, "x"), P, PAL.black]);
      parts.push([this.cyl(0.008, 0.008, 0.18, 6, x * 0.8, 1.22, 0.68), P, PAL.chrome]);
      parts.push([this.cyl(0.04, 0.04, 0.012, 12, x * 0.8, 1.32, 0.68, "z"), P, PAL.chrome]);
    });
    parts.push([this.box(0.12, 0.06, 0.04, 0, 0.84, -0.9), this.taillightMaterial]);
    this.plate("bike", 0, 0.74, -0.93, -1, 0.26, 0.08).forEach((p) => parts.push(p));
    this.addParts(group, parts);

    const avatar = this.place(this.createDriverAvatar(), 0, 0.72, -0.22, group);
    avatar.visible = false;
    const badge = this.place(this.createInteractionBadge("RIDE BIKE [F]"), 0, 1.8, 0, group);
    const wheels = [
      this.place(this.createWheel(rw, 0.1, "spoke"), 0, rw, fz, group),
      this.place(this.createWheel(rw, 0.12, "spoke"), 0, rw, rz, group),
    ];
    return this.finish(group, "SUPERBIKE", wheels, avatar, badge, { width: 0.9, length: 2.2, height: 1.3 });
  }

  // --- 6. SPORTS CAR (low wedge supercar) -------------------------------------------------------
  createSportsCarMesh(colorHex = 0xff007f) {
    const group = new THREE.Group();
    group.name = "sportsCar";
    const Pt = this.paint(colorHex, 0.45, 0.22);
    const P = this.paletteMaterial;
    const parts = [];
    const fz = 1.38;
    const rz = -1.33;

    const lower = this.bottomWithArches([], -2.28, 2.28, 0.2, [{ z: fz, y: 0.33, r: 0.42 }, { z: rz, y: 0.35, r: 0.44 }]);
    lower.push([2.34, 0.34], [2.12, 0.52], [1.2, 0.76], [0.72, 0.84], [-0.95, 0.9], [-1.22, 0.93], [-2.2, 0.86], [-2.3, 0.72], [-2.3, 0.3]);
    parts.push([this.profileBody(lower, 1.98, 0.09, 4), Pt]);
    const canopy = [[0.74, 0.84], [0.05, 1.16], [-0.5, 1.15], [-0.96, 0.9]];
    parts.push([this.profileBody(canopy, 1.36, 0.1, 4), Pt]);
    [1, -1].forEach((s) => {
      parts.push([this.sideGlass([[0.62, 0.88], [0.06, 1.12], [-0.48, 1.11], [-0.82, 0.9]], s * 0.685, s), this.glassMaterial]);
      // side intake behind the door, mirror
      parts.push([this.box(0.03, 0.2, 0.55, s * 0.99, 0.62, -0.8), P, PAL.black]);
      parts.push([this.box(0.12, 0.07, 0.14, s * 0.8, 0.9, 0.55), Pt]);
    });
    parts.push([this.pane([[-0.64, 0.87, 0.72], [0.64, 0.87, 0.72], [0.56, 1.13, 0.07], [-0.56, 1.13, 0.07]]), this.glassMaterial]);
    parts.push([this.pane([[0.56, 0.92, -0.97], [-0.56, 0.92, -0.97], [-0.5, 1.12, -0.52], [0.5, 1.12, -0.52]]), this.glassMaterial]);
    // splitter, light strips, wing, exhausts, tail bar
    parts.push([this.box(1.9, 0.05, 0.3, 0, 0.2, 2.22), P, PAL.black]);
    [-0.66, 0.66].forEach((x) => parts.push([this.box(0.42, 0.06, 0.2, x, 0.5, 2.18), this.headlightMaterial]));
    parts.push([this.box(1.7, 0.08, 0.04, 0, 0.66, -2.31), this.taillightMaterial]);
    [-0.55, 0.55].forEach((x) => parts.push([this.box(0.06, 0.24, 0.06, x, 0.98, -1.95), P, PAL.black]));
    parts.push([this.box(1.84, 0.05, 0.36, 0, 1.12, -1.98), P, PAL.black]);
    [-0.3, -0.18, 0.18, 0.3].forEach((x) => parts.push([this.cyl(0.045, 0.045, 0.2, 10, x, 0.3, -2.3, "z"), P, PAL.chrome]));
    parts.push([this.box(1.6, 0.14, 0.06, 0, 0.3, -2.3), P, PAL.black]);
    this.plate("private", 0, 0.44, -2.33, -1, 0.46, 0.11).forEach((p) => parts.push(p));
    this.addParts(group, parts);

    const avatar = this.place(this.createDriverAvatar(), -0.38, 0.3, -0.12, group);
    avatar.visible = false;
    const badge = this.place(this.createInteractionBadge("ENTER SUPERCAR [F]"), 0, 2.0, 0, group);
    const wheels = [
      [-0.84, fz, 0.33, 0.26],
      [0.84, fz, 0.33, 0.26],
      [-0.82, rz, 0.35, 0.32],
      [0.82, rz, 0.35, 0.32],
    ].map(([x, z, r, w]) => this.place(this.createWheel(r, w, "alloy"), x, r, z, group));
    return this.finish(group, "SPORTS_CAR", wheels, avatar, badge, { width: 2.2, length: 4.6, height: 1.2 });
  }

  // =====================================================================================
  // PEOPLE
  // =====================================================================================
  createTommyShirtTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1b86b8";
    ctx.fillRect(0, 0, 256, 256);
    // palm leaves and hibiscus, the classic tropical print
    ctx.strokeStyle = "#0b4a5c";
    ctx.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      const px = ((i * 47 + 13) % 240) + 8;
      const py = ((i * 37 + 19) % 240) + 8;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + 16, py - 22, px + 32, py - 12);
      ctx.stroke();
      for (let l = -3; l <= 3; l++) {
        ctx.beginPath();
        ctx.moveTo(px + 16 + l * 4, py - 16);
        ctx.lineTo(px + 16 + l * 4 + 8, py - 26);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 14; i++) {
      const fx = (i * 61 + 20) % 230;
      const fy = (i * 53 + 30) % 230;
      ctx.fillStyle = "#f4f1e8";
      for (let p = 0; p < 5; p++) {
        const a = (p * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * 7, fy + Math.sin(a) * 7, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#e0447a";
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1.5);
    return tex;
  }

  createTommyJeansTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#23405f";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let y = 0; y < 128; y += 2) {
      for (let x = 0; x < 128; x += 4) if ((x + y) % 4 === 0) ctx.fillRect(x, y, 2, 1);
    }
    ctx.strokeStyle = "rgba(210,160,90,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 64);
    ctx.lineTo(128, 64);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // --- People: parametric head ---------------------------------------------------------------------
  // Rings from the crown (theta 0) to under the chin (theta 180), each an ellipse with a flatter
  // face (a superellipse at the front). UVs: u = 0.5 is the face (+Z), the seam is at the back of
  // the head, v runs from the crown (1) to under the chin (0).
  headRing(theta) {
    const P = HEAD_PROFILE;
    const t = Math.min(180, Math.max(0, theta)) / 15;
    const i = Math.min(P.length - 2, Math.floor(t));
    const f = t - i;
    const row = (k) => P[Math.max(0, Math.min(P.length - 1, k))];
    const a = row(i - 1);
    const b = row(i);
    const c = row(i + 1);
    const d = row(i + 2);
    // Catmull-Rom through the table rows
    const cr = (k) => 0.5 * (2 * b[k] + (c[k] - a[k]) * f + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * f * f + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * f * f * f);
    return { y: cr(0), w: Math.max(0, cr(1)), front: Math.max(0, cr(2)), back: Math.max(0, cr(3)), zc: cr(4) };
  }

  headPoint(theta, phi, out) {
    const r = this.headRing(theta);
    const s = Math.sin(phi);
    const c = Math.cos(phi);
    const e = c > 0 ? 0.8 : 1; // flatter across the face
    return out.set(r.w * Math.sign(s) * Math.abs(s) ** e, r.y, r.zc + (c > 0 ? r.front : r.back) * Math.sign(c) * Math.abs(c) ** e);
  }

  // Hairline (degrees from the crown) at azimuth phi (0 = the face, +-PI = the back).
  hairline(phi, style) {
    const T = HAIRLINES[style] || HAIRLINES.short;
    const a = (Math.min(Math.PI, Math.abs(phi)) / Math.PI) * 12;
    const i = Math.min(11, Math.floor(a));
    return T[i] + (T[i + 1] - T[i]) * (a - i);
  }

  // Point on the face (x to the viewer's right, y up; metres from the head centre) -> head UV.
  faceUV(x, y) {
    if (!this.headRings) this.headRings = Array.from({ length: 181 }, (_, t) => this.headRing(t));
    const R = this.headRings;
    let th = 180;
    if (y >= R[0].y) th = 0;
    else {
      for (let t = 1; t <= 180; t++) {
        if (R[t].y <= y) {
          th = t - 1 + (R[t - 1].y - y) / (R[t - 1].y - R[t].y);
          break;
        }
      }
    }
    const w = Math.max(1e-4, this.headRing(th).w);
    const phi = Math.sign(x) * Math.asin(Math.min(1, Math.abs(x) / w) ** 1.25);
    return [0.5 + phi / (Math.PI * 2), 1 - th / 180];
  }

  // Head mesh. Inside the hairline the surface is pushed out into a hair volume (the hair itself
  // is painted on the head texture by drawHead, so the hairline is sharp).
  headGeometry(style, hair = 0.011, segW = 24, segH = 18) {
    const pos = [];
    const uv = [];
    const p = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (let j = 0; j <= segH; j++) {
      const theta = (j / segH) * 180;
      for (let i = 0; i <= segW; i++) {
        const phi = -Math.PI + (i / segW) * Math.PI * 2;
        this.headPoint(theta, phi, p);
        const inside = this.hairline(phi, style) - theta;
        if (hair > 0 && inside > 0) {
          const k = Math.min(1, inside / 14);
          const top = Math.max(0, Math.cos((theta * Math.PI) / 180));
          dir.set(p.x, p.y - 0.01, p.z + 0.01).normalize();
          p.addScaledVector(dir, hair * k * k * (3 - 2 * k) * (0.55 + 0.45 * top));
        }
        pos.push(p.x, p.y, p.z);
        uv.push(i / segW, 1 - j / segH);
      }
    }
    const idx = [];
    const row = segW + 1;
    for (let j = 0; j < segH; j++) {
      for (let i = 0; i < segW; i++) {
        const a = j * row + i;
        const b = a + row;
        if (j < segH - 1) idx.push(a, b, b + 1);
        if (j > 0) idx.push(a, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // smooth across the seam at the back; straight up / down at the poles
    const n = g.attributes.normal;
    for (let j = 0; j <= segH; j++) {
      const a = j * row;
      const b = a + segW;
      const x = n.getX(a) + n.getX(b);
      const y = n.getY(a) + n.getY(b);
      const z = n.getZ(a) + n.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l);
      n.setXYZ(b, x / l, y / l, z / l);
    }
    for (let i = 0; i <= segW; i++) {
      n.setXYZ(i, 0, 1, 0);
      n.setXYZ(segH * row + i, 0, -1, 0);
    }
    return g;
  }

  // Nose: a small wedge, textured from the face behind it (nostrils, shading).
  noseGeometry() {
    const V = [
      [0, 0.014, 0.085], // root, between the eyes
      [-0.0085, -0.006, 0.096],
      [0.0085, -0.006, 0.096],
      [0, -0.021, 0.117], // tip
      [-0.016, -0.028, 0.095], // wings
      [0.016, -0.028, 0.095],
      [0, -0.032, 0.104], // base
    ];
    const p = [];
    const uv = [];
    V.forEach((v) => {
      p.push(...v);
      uv.push(...this.faceUV(v[0], v[1]));
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 1, 3, 0, 3, 2, 1, 4, 3, 2, 3, 5, 4, 6, 3, 6, 5, 3]);
    g.computeVertexNormals();
    // the root and the wings take the face's normal, so the nose blends into the face
    const n = g.attributes.normal;
    n.setXYZ(0, 0, 0.3, 0.954);
    n.setXYZ(4, -0.3, -0.15, 0.942);
    n.setXYZ(5, 0.3, -0.15, 0.942);
    return g;
  }

  earGeometry(side) {
    const g = new THREE.SphereGeometry(0.03, 10, 8);
    g.scale(0.32, 1, 0.62);
    g.rotateY(-side * 0.35); // the back of the ear stands off the head
    g.translate(side * 0.077, -0.01, -0.014);
    return g;
  }

  // Head parts in head space, tagged by role for the caller's materials: "head" (the painted
  // head texture), "skin", "hair", "gold" and "flower" (jasmine).
  headParts(o, detail = 1) {
    const parts = [{ g: this.headGeometry(o.style, o.female ? 0.012 : 0.011, detail > 1 ? 32 : 24, detail > 1 ? 24 : 18), role: "head" }];
    parts.push({ g: this.noseGeometry(), role: "head" });
    [-1, 1].forEach((s) => parts.push({ g: this.earGeometry(s), role: "skin" }));
    if (o.female) {
      [-1, 1].forEach((s) => {
        parts.push({ g: this.sphere(0.0065, s * 0.079, -0.044, -0.01, 1, 1, 1, 8, 6), role: "gold" }); // jhumka
        parts.push({ g: this.sphere(0.0075, s * 0.079, -0.056, -0.01, 1, 0.8, 1, 8, 6), role: "gold" });
      });
      if (o.bun) {
        parts.push({ g: this.sphere(0.042, 0, -0.035, -0.106, 1, 0.85, 0.9, 12, 8), role: "hair" });
        const ring = new THREE.TorusGeometry(0.043, 0.008, 5, 16);
        ring.translate(0, -0.035, -0.112);
        parts.push({ g: ring, role: "flower" });
      } else {
        const braid = this.capsule(0.026, 0.018, 0.34, 8);
        braid.rotateX(0.1);
        braid.translate(0, -0.075, -0.094);
        parts.push({ g: braid, role: "hair" });
        if (o.jasmine) {
          const loop = new THREE.TorusGeometry(0.03, 0.0085, 5, 12, Math.PI);
          loop.rotateZ(Math.PI); // hanging U round the top of the braid
          loop.translate(0, -0.052, -0.088);
          parts.push({ g: loop, role: "flower" });
        }
      }
      parts.forEach(({ g }) => g.scale(0.95, 0.98, 0.97));
    }
    return parts;
  }

  // Map a head part into the people atlas.
  headRole(g, role, faceIdx, face) {
    if (role === "head") return this.atlasPart(g, faceIdx, "#ffffff");
    if (role === "hair") return this.atlasPart(g, 14, face.hair);
    if (role === "gold") return this.atlasPart(g, 8, "#d4a437");
    if (role === "flower") return this.atlasPart(g, 8, "#f7f5ee");
    return this.atlasPart(g, 8, face.skin);
  }

  // Paint a head texture for headGeometry: skin, face and hair. Features are placed in metres on
  // the face (x to the viewer's right, y up from the head centre) and mapped through the head
  // shape, so the eyes, nose and mouth land where the geometry is.
  drawHead(ctx, x0, y0, W, H, o) {
    const TAU = Math.PI * 2;
    const P = (x, y) => {
      const [u, v] = this.faceUV(x, y);
      return [x0 + u * W, y0 + (1 - v) * H];
    };
    const px = W / (TAU * 0.08); // pixels per metre across the face
    const sc = W / 256;
    const rgba = (hex, a) => {
      const c = new THREE.Color(hex);
      return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
    };
    const path = (pts) => {
      ctx.beginPath();
      pts.forEach(([x, y], k) => {
        const [a, b] = P(x, y);
        if (k) ctx.lineTo(a, b);
        else ctx.moveTo(a, b);
      });
    };
    const fill = (pts, style) => {
      path(pts);
      ctx.closePath();
      ctx.fillStyle = style;
      ctx.fill();
    };
    const stroke = (pts, width, style) => {
      path(pts);
      ctx.lineWidth = Math.max(0.7, width * px);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = style;
      ctx.stroke();
    };
    const oval = (cx, cy, rx, ry, n = 18) => Array.from({ length: n }, (_, k) => [cx + Math.cos((k / n) * TAU) * rx, cy + Math.sin((k / n) * TAU) * ry]);
    const bez = (a, b, c, n = 10) =>
      Array.from({ length: n + 1 }, (_, k) => {
        const t = k / n;
        const u = 1 - t;
        return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
      });
    const rng = GFX.rng(o.seed || 7);

    // skin, lightly mottled
    ctx.fillStyle = o.skin;
    ctx.fillRect(x0, y0, W, H);
    for (let k = 0; k < 220; k++) {
      ctx.fillStyle = rng() < 0.5 ? "rgba(255,226,200,0.03)" : "rgba(70,30,15,0.04)";
      ctx.beginPath();
      ctx.arc(x0 + rng() * W, y0 + rng() * H, (1.5 + rng() * 4) * sc, 0, TAU);
      ctx.fill();
    }
    // beard or stubble on the jaw and chin (the mouth is painted over it)
    if (o.beard) {
      const full = o.beard === "full";
      const passes = full ? 3 : 6;
      const beardTop = (deg) => (deg < 20 ? 131 - deg * 0.25 : deg < 55 ? 126 - (deg - 20) * 0.5 : 108.5 - (deg - 55) * 0.25);
      for (let cx = 0; cx < W; cx++) {
        const deg = Math.abs(((cx + 0.5) / W - 0.5) * 360);
        if (deg > 100) continue;
        const a = ((full ? 0.9 : 0.3) * Math.min(1, (100 - deg) / 12)) / passes;
        ctx.fillStyle = rgba(o.hair, a); // stacked passes give a soft top edge
        for (let k = 0; k < passes; k++) {
          const top = beardTop(deg) + k * (full ? 0.8 : 1.4);
          ctx.fillRect(x0 + cx, y0 + (top / 180) * H, 1, ((172 - top) / 180) * H);
        }
      }
      for (let k = 0; k < 900 * sc; k++) {
        const cx = rng() * W;
        const deg = Math.abs((cx / W - 0.5) * 360);
        if (deg > 95) continue;
        const top = beardTop(deg) + 2;
        ctx.fillStyle = rgba(o.hair, full ? 0.3 : 0.18);
        ctx.fillRect(x0 + cx, y0 + ((top + rng() * (170 - top)) / 180) * H, 0.9 * sc, 0.9 * sc);
      }
    }
    // eye sockets, the sides of the nose, nostrils, smile lines
    [-1, 1].forEach((s) => {
      for (let k = 3; k >= 1; k--) fill(oval(s * 0.03, 0.021, 0.011 + k * 0.004, 0.006 + k * 0.0025), "rgba(70,35,20,0.06)");
      stroke([[s * 0.0105, 0.014], [s * 0.012, -0.012], [s * 0.017, -0.027]], 0.004, "rgba(70,35,20,0.06)");
      fill(oval(s * 0.0075, -0.0315, 0.0042, 0.0021), "rgba(35,15,8,0.75)");
      stroke(bez([s * 0.019, -0.03], [s * 0.027, -0.042], [s * 0.028, -0.058]), 0.0018, "rgba(70,35,20,0.26)");
      if (o.female) fill(oval(s * 0.045, -0.012, 0.018, 0.012), "rgba(190,70,60,0.06)");
    });
    // eyes: almond white, iris, pupil, catch-light, lids (kajal for women)
    [-1, 1].forEach((s) => {
      const cx = s * 0.031;
      const cy = 0.018;
      const eye = Array.from({ length: 20 }, (_, k) => {
        const a = (k / 20) * TAU;
        return [cx + Math.cos(a) * 0.0135, cy + Math.sin(a) * (Math.sin(a) > 0 ? 0.0056 : 0.0043)];
      });
      stroke(bez([cx - s * 0.013, cy + 0.006], [cx, cy + 0.0125], [cx + s * 0.014, cy + 0.0045]), 0.0012, "rgba(60,30,15,0.35)");
      fill(eye, "#e0d6c6");
      const ix = cx - s * 0.001;
      ctx.save();
      path(eye);
      ctx.closePath();
      ctx.clip();
      fill(oval(ix, cy - 0.0004, 0.0057, 0.0057), o.iris || "#3a2314");
      fill(oval(ix, cy - 0.0004, 0.0025, 0.0025), "#070404");
      fill([[cx - 0.015, cy + 0.007], [cx + 0.015, cy + 0.007], [cx + 0.015, cy + 0.0033], [cx - 0.015, cy + 0.0033]], "rgba(40,20,10,0.35)");
      ctx.restore();
      fill(oval(ix + 0.0018, cy + 0.0016, 0.001, 0.001), "rgba(255,255,255,0.9)");
      stroke(eye.slice(0, 11), o.female ? 0.0024 : 0.0015, "#140906");
      stroke(eye.slice(10).concat([eye[0]]), o.female ? 0.0014 : 0.0008, o.female ? "rgba(20,9,6,0.85)" : "rgba(70,35,20,0.5)");
    });
    // eyebrows (thinner for women)
    const bw = o.female ? 0.55 : 1;
    [-1, 1].forEach((s) => {
      const top = bez([s * 0.012, 0.0335 + 0.005 * bw], [s * 0.029, 0.0415 + 0.006 * bw], [s * 0.047, 0.0375], 8);
      const bottom = bez([s * 0.047, 0.0375], [s * 0.029, 0.0415], [s * 0.012, 0.0335], 8);
      fill(top.concat(bottom), o.hair);
    });
    // mouth: upper lip with a cupid's bow, fuller lower lip, the line between
    const my = -0.05;
    const lip = o.female ? "#9a3a42" : new THREE.Color(o.skin).lerp(new THREE.Color("#6e2a24"), 0.45).getStyle();
    const lipLow = new THREE.Color(lip).lerp(new THREE.Color("#ffffff"), 0.08).getStyle();
    fill([[-0.024, my], [-0.013, my + 0.0048], [-0.005, my + 0.0062], [0, my + 0.0046], [0.005, my + 0.0062], [0.013, my + 0.0048], [0.024, my], [0.012, my - 0.0006], [-0.012, my - 0.0006]], lip);
    fill(bez([-0.022, my - 0.0004], [0, my - 0.0155], [0.022, my - 0.0004]), lipLow);
    stroke(bez([-0.0245, my + 0.0003], [0, my - 0.0014], [0.0245, my + 0.0003]), 0.0012, "rgba(35,10,6,0.8)");
    stroke(bez([-0.011, my - 0.0115], [0, my - 0.0145], [0.011, my - 0.0115]), 0.0025, "rgba(60,25,12,0.18)");
    // moustache (most Kerala men)
    if (o.moustache) {
      const k = o.moustache === "thin" ? 0.5 : 1;
      const top = [[-0.03, -0.0535], [-0.024, -0.0445], [-0.014, -0.039], [-0.004, -0.037], [0.004, -0.037], [0.014, -0.039], [0.024, -0.0445], [0.03, -0.0535]];
      const bottom = [[0.026, -0.0505], [0.016, -0.0458], [0.006, -0.0447], [-0.006, -0.0447], [-0.016, -0.0458], [-0.026, -0.0505]];
      fill(top.map(([x, y]) => [x * (0.8 + 0.2 * k), -0.0455 + (y + 0.0455) * k]).concat(bottom), o.hair);
      for (let n = 0; n < 24; n++) {
        const x = (rng() - 0.5) * 0.05;
        stroke([[x, -0.039 - rng() * 0.003], [x * 1.12, -0.045 - rng() * 0.002]], 0.0005, "rgba(0,0,0,0.35)");
      }
    }
    if (o.bindi) fill(oval(0, 0.045, 0.0034, 0.0034), o.bindi);
    if (o.sandal) {
      stroke([[0, 0.05], [0, 0.07]], 0.005, "rgba(236,208,150,0.95)"); // sandal paste
      fill(oval(0, 0.046, 0.0022, 0.0022), "#b3121c");
    }
    // hair: everything above the hairline, soft edge, strands, a sheen, the parting
    const hairT = (cx) => this.hairline(((cx + 0.5) / W - 0.5) * TAU, o.style);
    ctx.fillStyle = o.hair;
    for (let cx = 0; cx < W; cx++) ctx.fillRect(x0 + cx, y0, 1, (hairT(cx) / 180) * H);
    ctx.fillStyle = rgba(o.hair, 0.4);
    for (let cx = 0; cx < W; cx++) ctx.fillRect(x0 + cx, y0 + (hairT(cx) / 180) * H, 1, 1.5 * sc);
    const hr = GFX.rng((o.seed || 7) + 101);
    ctx.lineWidth = Math.max(0.7, 0.9 * sc);
    for (let k = 0; k < 520 * sc; k++) {
      const cx = Math.floor(hr() * W);
      const lim = (hairT(cx) / 180) * H;
      const y = hr() * lim;
      ctx.strokeStyle = hr() < 0.35 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.moveTo(x0 + cx, y0 + y);
      ctx.lineTo(x0 + cx + (hr() - 0.5) * 3 * sc, y0 + Math.min(lim, y + (3 + hr() * 9) * sc));
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x0, y0 + (16 / 180) * H, W, (12 / 180) * H);
    const part = o.style === "long" ? 0 : -0.45;
    ctx.fillStyle = rgba(o.skin, 0.55);
    ctx.fillRect(x0 + (0.5 + part / TAU) * W - 0.6 * sc, y0 + (6 / 180) * H, 1.2 * sc, ((this.hairline(part, o.style) - 8) / 180) * H);
  }

  // One atlas for every pedestrian: 8 heads + cloth patterns (vertex colours tint them).
  createPeopleAtlas() {
    const size = 1024;
    const cell = 256;
    const c = GFX.makeCanvas(size, size);
    const ctx = c.getContext("2d");
    const cells = {};
    const at = (i) => [(i % 4) * cell, Math.floor(i / 4) * cell];
    const faces = [
      { skin: "#8e5c3d", hair: "#120b07", moustache: "full", style: "short" },
      { skin: "#a26c4a", hair: "#1a120c", moustache: "full", beard: "stubble", style: "short" },
      { skin: "#6f4430", hair: "#0d0907", moustache: "thin", style: "short" },
      { skin: "#b47d58", hair: "#77726c", moustache: "full", style: "receding" },
      { skin: "#9a6546", hair: "#120b07", female: true, bindi: "#b3121c", style: "long" },
      { skin: "#b98460", hair: "#1a120c", female: true, bindi: "#c96b1e", style: "long" },
      { skin: "#7c4d34", hair: "#0d0907", female: true, bindi: "#b3121c", style: "long" },
      { skin: "#a8734f", hair: "#20150e", moustache: "full", beard: "full", style: "short", sandal: true },
    ];
    faces.forEach((f, i) => {
      const [x, y] = at(i);
      this.drawHead(ctx, x, y, cell, cell, Object.assign({ seed: 31 + i * 17 }, f));
      cells[`face${i}`] = Object.assign({}, f);
    });
    // 8: plain white (skin, shoes, jewellery: tinted by vertex colour)
    let [x, y] = at(8);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, cell, cell);
    // 9: checks (lungi, shirts)
    [x, y] = at(9);
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    for (let k = 0; k < cell; k += 16) {
      ctx.fillRect(x + k, y, 5, cell);
      ctx.fillRect(x, y + k, cell, 5);
    }
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let k = 9; k < cell; k += 16) {
      ctx.fillRect(x + k, y, 2, cell);
      ctx.fillRect(x, y + k, cell, 2);
    }
    // 10: pin stripes (shirts)
    [x, y] = at(10);
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let k = 0; k < cell; k += 8) ctx.fillRect(x + k, y, 2, cell);
    // 11: floral print (sarees, churidar)
    [x, y] = at(11);
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(x, y, cell, cell);
    const rng = GFX.rng(505);
    for (let k = 0; k < 70; k++) {
      const fx = x + rng() * cell;
      const fy = y + rng() * cell;
      ctx.fillStyle = `rgba(${rng() < 0.5 ? "255,230,120" : "255,255,255"},0.9)`;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * 5, fy + Math.sin(a) * 5, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(fx, fy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // 12: kasavu: off-white with a gold border just above the hem (v = 0) - mundu, set-saree
    [x, y] = at(12);
    ctx.fillStyle = "#f6f2e6";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "#d4a437";
    ctx.fillRect(x, y + cell - 18, cell, 13);
    ctx.fillStyle = "#b8862a";
    ctx.fillRect(x, y + cell - 22, cell, 2);
    // 13: denim
    [x, y] = at(13);
    ctx.fillStyle = "#e8eef6";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let k = 0; k < cell; k += 3) ctx.fillRect(x, y + k, cell, 1);
    // 14: hair strands (braid, bun)
    [x, y] = at(14);
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    for (let k = 0; k < 200; k++) {
      const hx = x + rng() * cell;
      ctx.lineWidth = 1 + rng();
      ctx.beginPath();
      ctx.moveTo(hx, y);
      ctx.quadraticCurveTo(hx + (rng() - 0.5) * 20, y + cell / 2, hx + (rng() - 0.5) * 10, y + cell);
      ctx.stroke();
    }
    // 15: shirt front: a button placket on the lathe seam (u = 0 / 1 is the front) and a pocket
    [x, y] = at(15);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, cell, cell);
    const pad = cell * 0.02;
    const span = cell - 2 * pad;
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(x + pad + 6, y, 1.5, cell);
    ctx.fillRect(x + cell - pad - 7.5, y, 1.5, cell);
    for (let k = 0; k < 6; k++) {
      const by = y + pad + span * (0.14 + k * 0.1);
      [x + pad, x + cell - pad].forEach((bx) => {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f2f2f2";
        ctx.beginPath();
        ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + pad + span * 0.06, y + pad + span * 0.47, span * 0.08, span * 0.1);
    const tex = GFX.texture(c);
    tex.anisotropy = 2;
    this.peopleCells = cells;
    this.peopleCellSize = cell / size;
    const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.78 });
    mat.userData.linear = true; // vertex colours are already linear
    return mat;
  }

  getPedMaterial() {
    return this.peopleAtlas;
  }

  // Remap a geometry's 0..1 UVs into atlas cell i (inset against bleeding) and tint it.
  atlasPart(g, cellIndex, hex) {
    this.std(g);
    const k = this.peopleCellSize;
    const cx = (cellIndex % 4) * k;
    const cy = 1 - (Math.floor(cellIndex / 4) + 1) * k; // flipY: row 0 is the top
    const pad = k * 0.02;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = Math.min(1, Math.max(0, uv.getX(i)));
      const v = Math.min(1, Math.max(0, uv.getY(i)));
      uv.setXY(i, cx + pad + u * (k - 2 * pad), cy + pad + v * (k - 2 * pad));
    }
    const c = GFX.color(hex);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) {
      col[i] = c.r;
      col[i + 1] = c.g;
      col[i + 2] = c.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }

  // Rounded limb along -Y from the joint: lathe capsule with radii rTop -> rBot.
  capsule(rTop, rBot, len, seg = 10) {
    const pts = [];
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.sin(a) * rBot, -len - Math.cos(a) * rBot * 0.8));
    }
    for (let i = n; i >= 0; i--) {
      const a = (i / n) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.sin(a) * rTop, Math.cos(a) * rTop * 0.8));
    }
    pts[0].x = 0.0001;
    pts[pts.length - 1].x = 0.0001;
    return new THREE.LatheGeometry(pts, seg);
  }

  // Torso / skirt: lathe of [radius, y] pairs (y ascending, so the faces point outwards),
  // elliptical by scaling the depth. u = 0 / 1 is the front (+Z).
  lathe(profile, seg = 14, depthScale = 0.62) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
    g.scale(1, 1, depthScale);
    return g;
  }

  // Radius of a lathe profile at height y (the lathe is linear between profile points).
  profileRadius(profile) {
    return (y) => {
      for (let k = 0; k < profile.length - 1; k++) {
        const [r0, y0] = profile[k];
        const [r1, y1] = profile[k + 1];
        if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
      }
      return y < profile[0][1] ? profile[0][0] : profile[profile.length - 1][0];
    };
  }

  // Patch lying on the front of a lathe torso: rows [y, xLeft, xRight] from the top down.
  torsoPatch(profile, depthScale, rows, lift = 0.004, cols = 4) {
    const rAt = this.profileRadius(profile);
    const pos = [];
    const uv = [];
    const idx = [];
    rows.forEach(([y, xa, xb], j) => {
      const r = rAt(y);
      for (let i = 0; i <= cols; i++) {
        const x = xa + ((xb - xa) * i) / cols;
        pos.push(x, y, depthScale * Math.sqrt(Math.max(0, r * r - x * x)) + lift);
        uv.push(i / cols, 1 - j / (rows.length - 1));
      }
    });
    for (let j = 0; j < rows.length - 1; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i;
        const b = a + cols + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Diagonal band around a lathe torso (saree pallu, dupatta): centre line y = y0 + slope * x.
  // v = 0 is the lower edge (the kasavu border lands there).
  sash(profile, depthScale, y0, slope, halfWidth, lift = 0.006, n = 28) {
    const rAt = this.profileRadius(profile);
    const yMax = profile[profile.length - 1][1] - halfWidth - 0.012; // stays on the shoulder
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      let y = y0;
      for (let k = 0; k < 4; k++) y = Math.min(yMax, y0 + slope * rAt(y) * s);
      [-halfWidth, halfWidth].forEach((dy, e) => {
        const r = rAt(y + dy) + lift;
        pos.push(r * s, y + dy, r * c * depthScale);
        uv.push(i / n, e);
      });
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // --- 7. PLAYER CHARACTER: JOINTED RIG FOR PROCEDURAL ANIMATION ---------------------------------
  // Root at the feet, facing +Z. Joints: hips > thighs > knees, hips > spine > head,
  // spine > shoulders > elbows. Negative x rotation swings a limb forward.
  createCharacterMesh() {
    const group = new THREE.Group();
    group.name = "playerCharacter";
    const skinHex = "#b27a54";
    const faceOpts = { skin: skinHex, hair: "#120b07", moustache: "full", beard: "stubble", style: "short", seed: 5 };
    const faceCanvas = GFX.makeCanvas(512, 512);
    this.drawHead(faceCanvas.getContext("2d"), 0, 0, 512, 512, faceOpts);
    const faceMat = new THREE.MeshStandardMaterial({ map: GFX.texture(faceCanvas), roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.55 });
    const shirtMat = new THREE.MeshStandardMaterial({ map: this.shirtTexture, roughness: 0.8 });
    const jeansMat = new THREE.MeshStandardMaterial({ map: this.jeansTexture, roughness: 0.9 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xeceeef, roughness: 0.5 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd8ab4a, metalness: 1.0, roughness: 0.25 });

    const part = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(this.std(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const joint = (parent, x, y, z) => {
      const j = new THREE.Group();
      j.position.set(x, y, z);
      parent.add(j);
      return j;
    };

    const hipHeight = 0.95;
    const hips = joint(group, 0, hipHeight, 0);
    // pelvis (jeans) and belt
    part(hips, this.lathe([[0.001, -0.12], [0.15, -0.1], [0.165, -0.02], [0.16, 0.06], [0.001, 0.07]], 14, 0.7), jeansMat);
    part(hips, this.lathe([[0.163, 0.04], [0.163, 0.075]], 14, 0.7), soleMat);

    const legs = {};
    [["L", -0.095], ["R", 0.095]].forEach(([side, x]) => {
      const thigh = joint(hips, x, -0.04, 0);
      part(thigh, this.capsule(0.085, 0.064, 0.44, 12), jeansMat);
      const knee = joint(thigh, 0, -0.46, 0);
      part(knee, this.capsule(0.062, 0.05, 0.4, 12), jeansMat);
      // sneakers: rounded toe, white upper, dark sole
      part(knee, this.sphere(0.062, 0, -0.43, 0.05, 0.85, 0.55, 1.85, 12, 8), shoeMat);
      part(knee, this.box(0.1, 0.025, 0.25, 0, -0.47, 0.05), soleMat);
      legs["thigh" + side] = thigh;
      legs["knee" + side] = knee;
    });

    // torso: Hawaiian shirt worn open at the neck over a gold chain
    const spine = joint(hips, 0, 0.08, 0);
    const torso = [[0.158, -0.02], [0.17, 0.12], [0.188, 0.28], [0.196, 0.38], [0.18, 0.44], [0.13, 0.5], [0.07, 0.528], [0.001, 0.538]];
    const depth = 0.62;
    part(spine, this.lathe(torso, 16, depth), shirtMat);
    part(spine, this.cyl(0.056, 0.062, 0.16, 12, 0, 0.58, -0.012), skinMat); // neck
    const vRows = [[0.532, -0.05, 0.05], [0.5, -0.046, 0.046], [0.46, -0.032, 0.032], [0.42, -0.016, 0.016], [0.39, -0.002, 0.002]];
    part(spine, this.torsoPatch(torso, depth, vRows, 0.003, 4), skinMat); // open neck
    [-1, 1].forEach((s) => {
      const rows = vRows.map(([y, , xb]) => (s > 0 ? [y, Math.max(0.001, xb - 0.004), xb + 0.034] : [y, -xb - 0.034, Math.min(-0.001, -xb + 0.004)]));
      part(spine, this.torsoPatch(torso, depth, rows, 0.007, 3), shirtMat); // lapel
    });
    const collar = new THREE.LatheGeometry([[0.08, 0.5], [0.074, 0.545], [0.07, 0.565]].map(([r, y]) => new THREE.Vector2(r, y)), 14, 0.95, Math.PI * 2 - 1.9);
    collar.translate(0, 0, -0.012);
    part(spine, collar, shirtMat);
    const rAt = this.profileRadius(torso);
    const onChest = (x, y) => new THREE.Vector3(x, y, depth * Math.sqrt(Math.max(0, rAt(y) ** 2 - x * x)) + 0.006);
    const chain = new THREE.CatmullRomCurve3([onChest(-0.056, 0.535), onChest(-0.04, 0.49), onChest(0, 0.462), onChest(0.04, 0.49), onChest(0.056, 0.535)]);
    part(spine, new THREE.TubeGeometry(chain, 20, 0.0035, 5, false), goldMat);

    // head: painted face and hair on a sculpted head, nose and ears
    const head = joint(spine, 0, 0.575, 0);
    this.headParts(faceOpts, 2).forEach(({ g, role }) => part(head, g, role === "head" ? faceMat : role === "gold" ? goldMat : skinMat, 0, 0.1, 0));

    const arms = {};
    [["L", -0.205], ["R", 0.205]].forEach(([side, x]) => {
      const shoulder = joint(spine, x, 0.44, 0);
      part(shoulder, this.sphere(0.058, -Math.sign(x) * 0.018, -0.012, 0, 1, 0.92, 0.95, 12, 8), shirtMat); // shoulder
      part(shoulder, this.capsule(0.06, 0.055, 0.2, 12), shirtMat); // short sleeve
      part(shoulder, this.capsule(0.052, 0.046, 0.28, 12), skinMat); // upper arm
      const elbow = joint(shoulder, 0, -0.3, 0);
      part(elbow, this.capsule(0.046, 0.036, 0.25, 12), skinMat); // forearm
      part(elbow, this.sphere(0.05, 0, -0.325, 0.006, 0.36, 1.72, 0.9, 12, 8), skinMat); // hand
      if (side === "L") part(elbow, this.cyl(0.042, 0.042, 0.03, 14, 0, -0.23, 0), goldMat); // watch
      arms["shoulder" + side] = shoulder;
      arms["elbow" + side] = elbow;
    });

    group.userData = {
      type: "CHARACTER",
      hipHeight,
      hips,
      spine,
      head,
      thighL: legs.thighL,
      thighR: legs.thighR,
      kneeL: legs.kneeL,
      kneeR: legs.kneeR,
      shoulderL: arms.shoulderL,
      shoulderR: arms.shoulderR,
      elbowL: arms.elbowL,
      elbowR: arms.elbowR,
      leftLeg: legs.thighL,
      rightLeg: legs.thighR,
      leftArm: arms.shoulderL,
      rightArm: arms.shoulderR,
      rightArmPivot: arms.shoulderR,
    };
    this.mergeJointMeshes(group);
    return group;
  }

  // --- 8. KAKKANAD PEDESTRIAN: 5-part rig (body + head, two legs, two arms), one material ---------
  // Men in shirts or T-shirts with a lungi, a mundu (kasavu border) or trousers; women in sarees
  // (some in the cream-and-gold Kerala set-saree) or a churidar with a dupatta.
  createPedestrianMesh(shirtHex, lowerHex, wearsLungi, seed) {
    const rng = GFX.rng(seed !== undefined ? seed : Math.floor(Math.random() * 1e9));
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const hex = (n) => (typeof n === "number" ? `#${n.toString(16).padStart(6, "0")}` : n);
    const female = rng() < 0.42;
    const faceIdx = female ? pick([4, 5, 6]) : pick([0, 1, 2, 3, 7]);
    const face = this.peopleCells[`face${faceIdx}`];
    const skin = face.skin;
    const A = (g, cell, tint) => this.atlasPart(g, cell, tint);
    const mesh = (geos, parent) => {
      const m = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false), this.peopleAtlas);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    const group = new THREE.Group();
    group.name = "pedestrian";
    const bodyHeight = 0.9;
    const body = new THREE.Group();
    body.position.y = bodyHeight;
    group.add(body);

    let outfit;
    if (female) outfit = rng() < 0.55 ? "saree" : "churidar";
    else outfit = wearsLungi ? (rng() < 0.5 ? "mundu" : "lungi") : "trousers";
    const setSaree = outfit === "saree" && rng() < 0.35;
    const sareeHex = setSaree ? "#f5f0e2" : pick(["#b3121c", "#1f7a4d", "#6d1b7b", "#e07b10", "#1f4aa8", "#c2185b"]);
    const collared = !female && rng() < 0.7;
    const topHex = outfit === "saree" ? (setSaree ? pick(["#1f7a4d", "#b3121c", "#6d1b7b"]) : sareeHex) : hex(shirtHex);
    const topCell = female ? (outfit === "churidar" ? pick([8, 11]) : 8) : collared ? pick([15, 15, 9, 10]) : 8;
    const sleeveCell = topCell === 15 ? 8 : topCell;

    // torso: shirt, blouse or kurta, worn untucked over the waist
    const torso = female
      ? [[0.152, -0.08], [0.146, 0.0], [0.134, 0.12], [0.157, 0.26], [0.163, 0.34], [0.15, 0.42], [0.116, 0.47], [0.06, 0.5], [0.0, 0.508]]
      : [[0.165, -0.1], [0.158, -0.02], [0.155, 0.08], [0.166, 0.22], [0.176, 0.34], [0.172, 0.42], [0.142, 0.47], [0.075, 0.505], [0.0, 0.515]];
    const depth = female ? 0.63 : 0.64;
    const parts = [A(this.lathe(torso, 16, depth), topCell, topHex)];
    parts.push(A(female ? this.cyl(0.043, 0.047, 0.16, 10, 0, 0.56, -0.012) : this.cyl(0.05, 0.055, 0.16, 10, 0, 0.56, -0.012), 8, skin)); // neck
    if (collared) {
      const band = new THREE.LatheGeometry([[0.066, 0.495], [0.061, 0.525], [0.059, 0.538]].map(([r, y]) => new THREE.Vector2(r, y)), 12, 0.55, Math.PI * 2 - 1.1);
      band.translate(0, 0, -0.012);
      parts.push(A(band, 8, topHex));
      parts.push(A(this.torsoPatch(torso, depth, [[0.508, 0.012, 0.055], [0.47, 0.02, 0.05], [0.445, 0.03, 0.038]], 0.006, 2), 8, topHex));
      parts.push(A(this.torsoPatch(torso, depth, [[0.508, -0.055, -0.012], [0.47, -0.05, -0.02], [0.445, -0.038, -0.03]], 0.006, 2), 8, topHex));
    }
    const headOpts = Object.assign({ bun: female && rng() < 0.35, jasmine: female && rng() < 0.5 }, face);
    this.headParts(headOpts).forEach(({ g, role }) => {
      g.translate(0, 0.68, 0);
      parts.push(this.headRole(g, role, faceIdx, face));
    });

    // lower garment: a wrap (lungi, mundu, saree, kurta hem) is a skirt over the legs
    let leg = { cell: 8, hex: skin, r: [0.064, 0.042] };
    if (outfit === "trousers") {
      const cell = rng() < 0.5 ? 13 : 8;
      parts.push(A(this.lathe([[0.15, -0.17], [0.165, -0.07], [0.157, 0.01]], 16, 0.68), cell, hex(lowerHex)));
      leg = { cell, hex: hex(lowerHex), r: [0.07, 0.054] };
    } else {
      const long = outfit !== "lungi" || rng() < 0.6; // lungis are often folded up to the knee
      const hemY = outfit === "churidar" ? -0.42 : long ? -0.84 : -0.46;
      const hemR = outfit === "churidar" ? 0.2 : long ? 0.205 : 0.19;
      const cell = { saree: setSaree ? 12 : 11, mundu: 12, lungi: 9, churidar: topCell }[outfit];
      const tint = { saree: sareeHex, mundu: "#ffffff", lungi: pick(["#2a6fb8", "#1f7a4d", "#7a1f2b", "#e8e4d8", "#4a3d8f"]), churidar: topHex }[outfit];
      parts.push(A(this.lathe([[hemR, hemY], [0.186, hemY * 0.55], [0.168, -0.14], [0.15, -0.01], [0.13, 0.03]], 16, 0.72), cell, tint));
      if (outfit === "saree") parts.push(A(this.sash(torso, depth, 0.24, 1.25, 0.06), setSaree ? 12 : 11, sareeHex)); // pallu
      if (outfit === "churidar") {
        parts.push(A(this.sash(torso, depth, 0.3, -1.1, 0.045), 8, pick(["#f4efe0", "#e0447a", "#ffd23f", "#1f4aa8"]))); // dupatta
        leg = { cell: 8, hex: pick(["#f4efe0", "#1b1b1b", hex(lowerHex)]), r: [0.064, 0.042] };
      }
    }
    mesh(parts, body);

    // legs: thigh and shin in one rigid piece, foot or shoe, sole or chappal
    const soleHex = pick(["#2b1b12", "#3a2a20", "#1b1b1b", "#6b4a2b"]);
    const shoes = outfit === "trousers" && rng() < 0.6;
    const legs = [-0.085, 0.085].map((x) => {
      const hip = new THREE.Group();
      hip.position.set(x, bodyHeight, 0);
      group.add(hip);
      mesh(
        [
          A(this.capsule(leg.r[0], leg.r[1], 0.82, 10), leg.cell, leg.hex),
          A(this.sphere(0.05, 0, -0.866, 0.045, 0.82, 0.5, 2.3, 10, 6), 8, shoes ? soleHex : skin),
          A(this.box(0.086, 0.012, 0.25, 0, -0.894, 0.045), 8, soleHex),
        ],
        hip
      );
      return hip;
    });
    // arms: shoulder, sleeve, bare arm, hand (bangles for women)
    const sx = female ? 0.16 : 0.18;
    const sleeve = female ? (outfit === "saree" ? 0.1 : 0.38) : rng() < 0.3 ? 0.46 : 0.2;
    const arms = [-sx, sx].map((x) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, female ? 0.445 : 0.455, 0);
      body.add(shoulder);
      const geos = [
        A(this.sphere(0.05, -Math.sign(x) * 0.012, -0.01, 0, 1, 0.9, 0.95, 10, 8), sleeveCell, topHex),
        A(this.capsule(0.05, 0.045, sleeve, 10), sleeveCell, topHex),
        A(this.capsule(0.04, 0.031, 0.53, 10), 8, skin),
        A(this.sphere(0.05, 0, -0.6, 0.004, 0.34, 1.6, 0.86, 10, 8), 8, skin),
      ];
      if (female) geos.push(A(this.cyl(0.037, 0.037, 0.035, 12, 0, -0.5, 0), 8, "#d4a437"));
      mesh(geos, shoulder);
      return shoulder;
    });
    if (female) group.scale.setScalar(0.94);

    group.userData = { type: "PEDESTRIAN", body, bodyHeight, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], skirt: outfit !== "trousers", female };
    return group;
  }

  // Merge a joint's direct mesh children that share a material (keeps the rig, fewer draws).
  mergeJointMeshes(root) {
    const joints = [];
    root.traverse((o) => {
      if (!o.isMesh && o.children.some((c) => c.isMesh)) joints.push(o);
    });
    joints.forEach((joint) => {
      const byMat = new Map();
      joint.children.filter((c) => c.isMesh).forEach((m) => {
        if (!byMat.has(m.material)) byMat.set(m.material, []);
        byMat.get(m.material).push(m);
      });
      byMat.forEach((meshes, material) => {
        if (meshes.length < 2) return;
        const geos = meshes.map((m) => {
          m.updateMatrix();
          const g = this.std(m.geometry.clone());
          g.applyMatrix4(m.matrix);
          return g;
        });
        const merged = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false), material);
        merged.castShadow = true;
        merged.receiveShadow = true;
        meshes.forEach((m) => joint.remove(m));
        joint.add(merged);
      });
    });
  }

  // --- Driver avatar: one merged mesh, seated, hands forward on the wheel / bars -------------------
  createDriverAvatar() {
    const faceIdx = [0, 1, 2, 3, 7][Math.floor(Math.random() * 5)];
    const face = this.peopleCells[`face${faceIdx}`];
    const shirt = ["#f4f1e8", "#2a6fb8", "#b3121c", "#2e7d4f", "#e0c070"][Math.floor(Math.random() * 5)];
    const geos = [];
    geos.push(this.atlasPart(this.lathe([[0.15, 0.0], [0.165, 0.14], [0.176, 0.28], [0.15, 0.4], [0.07, 0.44], [0.0, 0.448]], 12, 0.62), 15, shirt));
    geos.push(this.atlasPart(this.cyl(0.044, 0.05, 0.14, 8, 0, 0.47, -0.012), 8, face.skin));
    this.headParts(face).forEach(({ g, role }) => {
      g.translate(0, 0.585, 0);
      geos.push(this.headRole(g, role, faceIdx, face));
    });
    // arms reaching forward to the controls
    [-0.19, 0.19].forEach((x) => {
      const arm = this.capsule(0.045, 0.036, 0.42, 8);
      arm.rotateX(-1.15);
      arm.translate(x, 0.38, 0.02);
      geos.push(this.atlasPart(arm, 8, shirt));
      geos.push(this.atlasPart(this.sphere(0.045, x * 0.8, 0.22, 0.4, 0.38, 0.9, 1.6, 8, 6), 8, face.skin));
    });
    // thighs forward, sitting
    [-0.09, 0.09].forEach((x) => {
      const thigh = this.capsule(0.07, 0.06, 0.4, 8);
      thigh.rotateX(-Math.PI / 2 + 0.1);
      thigh.translate(x, 0.02, 0.0);
      geos.push(this.atlasPart(thigh, 13, "#2d3a4a"));
    });
    const avatar = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false), this.peopleAtlas);
    avatar.castShadow = true;
    return avatar;
  }

  // --- Floating 3D Interaction Badge ---
  createInteractionBadge(text = "[F] ENTER") {
    const badgeGroup = new THREE.Group();
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(8, 12, 22, 0.92)";
    ctx.fillRect(4, 4, 248, 56);
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Orbitron', monospace, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 8;
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const planeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, fog: false });
    planeMat.userData.glow = 1.25; // UI label: stays readable after tone mapping
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), planeMat);
    badgeGroup.add(mesh);
    badgeGroup.visible = false;
    return badgeGroup;
  }

  updateWheelRotation(vehicleGroup, speed, delta) {
    if (!vehicleGroup.userData || !vehicleGroup.userData.wheels) return;
    const wheels = vehicleGroup.userData.wheels;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += (speed / (wheels[i].userData.radius || 0.35)) * delta;
    }
  }
}

window.vehicleModelFactory = new VehicleModelFactory();
