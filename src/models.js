/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 1: 3D VEHICLE & CHARACTER MODELS (VICE CITY GRAPHICS UPGRADE)
 * Features rich neon details, Tommy Vercetti character with punch animations, and driver seat integration.
 */

class VehicleModelFactory {
  constructor() {
    // Physically based palette (colours authored in sRGB, linearised by GFX.prepareScene).
    this.paintMaterials = [];
    this.createPalette();
    this.glassMaterial = new THREE.MeshStandardMaterial({ color: 0x0f1a20, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.62 });
    this.headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3dc });
    this.headlightMaterial.userData.glow = { day: 1.3, night: 9.0 };
    this.taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
    this.taillightMaterial.userData.glow = { day: 1.0, night: 4.0 };

    // Kerala liveries: dielectric paint under a clear coat (clearcoat strength follows the quality tier)
    this.autoGreenMat = this.paint(0x1d6b3b);
    this.autoYellowMat = this.paint(0xf0b21a);
    this.busRedMat = this.paint(0xb3141f);
    this.busYellowMat = this.paint(0xf1c40f);
    this.policeWhiteMat = this.paint(0xeef0f2);
    this.policeBlueStripe = this.paint(0x1c5fa8);
    this.ambassadorWhite = this.paint(0xe8ebeb);
    this.strobeRedMat = new THREE.MeshBasicMaterial({ color: 0xff1030 });
    this.strobeRedMat.userData.glow = { day: 5.0, night: 9.0 };
    this.strobeBlueMat = new THREE.MeshBasicMaterial({ color: 0x1070ff });
    this.strobeBlueMat.userData.glow = { day: 5.0, night: 9.0 };

    // Procedural Textures for Authentic 80s Tommy Vercetti
    this.shirtTexture = this.createTommyShirtTexture();
    this.jeansTexture = this.createTommyJeansTexture();
  }

  paint(hex, metalness = 0.12) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.34,
      metalness: metalness,
      clearcoat: 0,
      clearcoatRoughness: 0.07
    });
    this.paintMaterials.push(mat);
    return mat;
  }

  setClearcoat(amount) {
    this.paintMaterials.forEach((m) => (m.clearcoat = amount));
  }

  createTommyShirtTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    // Vibrant Vice City Tropical Cyan Base
    ctx.fillStyle = "#00bcd4";
    ctx.fillRect(0, 0, 256, 256);

    // Dark Navy & Emerald Palm Fronds
    ctx.strokeStyle = "#004d40";
    ctx.lineWidth = 3;
    for (let i = 0; i < 20; i++) {
      const px = (i * 47 + 13) % 240 + 8;
      const py = (i * 37 + 19) % 240 + 8;
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

    // Tropical White & Pink Hibiscus Flowers
    for (let i = 0; i < 14; i++) {
      const fx = (i * 61 + 20) % 230;
      const fy = (i * 53 + 30) % 230;
      ctx.fillStyle = "#ffffff";
      for (let p = 0; p < 5; p++) {
        const angle = (p * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(angle) * 7, fy + Math.sin(angle) * 7, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ff007f"; // Hot pink center
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Open V-Neck Collar with Skin Tone & Gold Chain
    ctx.fillStyle = "#d4a373";
    ctx.beginPath();
    ctx.moveTo(95, 0);
    ctx.lineTo(128, 75);
    ctx.lineTo(161, 0);
    ctx.closePath();
    ctx.fill();

    // Gold Chain Necklace
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128, 35, 20, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // Shirt Placket and White Buttons
    ctx.strokeStyle = "#00838f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(128, 75);
    ctx.lineTo(128, 256);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    for (let b = 95; b < 250; b += 42) {
      ctx.beginPath();
      ctx.arc(128, b, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  createTommyJeansTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    // Denim Navy Blue with Fabric Weave
    ctx.fillStyle = "#1e3a5f";
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let y = 0; y < 128; y += 2) {
      for (let x = 0; x < 128; x += 4) {
        if ((x + y) % 4 === 0) ctx.fillRect(x, y, 2, 1);
      }
    }

    // Denim Stitch Pockets
    ctx.strokeStyle = "#d4a373";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 15, 45, 40);
    ctx.strokeRect(73, 15, 45, 40);

    // Leather Belt & Gold Buckle
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(0, 0, 128, 12);
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(52, 1, 24, 10);

    return new THREE.CanvasTexture(canvas);
  }

  // --- Shared vehicle palette: tyres, rims, chrome, trim, seats... on ONE material ---
  // An 8x1 albedo texture + roughness(G)/metalness(B) texture; parts pick a texel via UVs,
  // so every non-paint part of a vehicle merges into a single draw call.
  createPalette() {
    const entries = [
      ["#1c1c1c", 0.92, 0], // 0 tyre rubber
      ["#c3c7cd", 0.32, 1], // 1 alloy rim
      ["#d9d9d9", 0.12, 1], // 2 chrome
      ["#24262b", 0.7, 0], // 3 dark trim / roll cage
      ["#2b2d36", 0.85, 0], // 4 seat fabric
      ["#111214", 0.55, 0], // 5 black plastic / grille
      ["#4a4d52", 0.4, 1], // 6 hub / engine metal
      ["#e8e8e4", 0.5, 0], // 7 white plastic
    ];
    const albedo = GFX.makeCanvas(8, 1);
    const rm = GFX.makeCanvas(8, 1);
    const a = albedo.getContext("2d");
    const r = rm.getContext("2d");
    entries.forEach(([hex, rough, metal], i) => {
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
    this.paletteMaterial = new THREE.MeshStandardMaterial({
      map: tex(albedo),
      roughnessMap: rmTex,
      metalnessMap: rmTex,
      roughness: 1,
      metalness: 1
    });
  }

  setPaletteUV(geometry, index) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (index + 0.5) / 8, 0.5);
    return geometry;
  }

  paletteMesh(geometry, index) {
    const m = new THREE.Mesh(this.setPaletteUV(geometry, index), this.paletteMaterial);
    m.castShadow = true;
    return m;
  }

  roundLight(radius, depth, material) {
    const geo = new THREE.CylinderGeometry(radius, radius, depth, 14);
    geo.rotateX(Math.PI / 2);
    return new THREE.Mesh(geo, material);
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
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrix);
        return g;
      });
      const merged = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false), material);
      merged.castShadow = true;
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

  // --- 1. KAKKANAD AUTO RICKSHAW (3-Wheeler) ---
  createAutoRickshawMesh() {
    const group = new THREE.Group();
    group.name = "autoRickshaw";

    const lowerBody = this.place(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 2.6), this.autoGreenMat), 0, 0.5, 0, group);
    lowerBody.castShadow = true;
    const noseGeo = new THREE.CylinderGeometry(0.35, 0.7, 0.8, 8);
    noseGeo.rotateX(Math.PI / 2);
    this.place(new THREE.Mesh(noseGeo, this.autoGreenMat), 0, 0.5, 1.4, group);
    const roof = this.place(new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.7, 2.2), this.autoYellowMat), 0, 1.25, -0.1, group);
    roof.castShadow = true;
    this.place(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 0.08), this.glassMaterial), 0, 1.15, 1.05, group);
    this.place(this.roundLight(0.12, 0.1, this.headlightMaterial), 0, 0.55, 1.82, group);
    this.place(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.06), this.taillightMaterial), 0, 0.55, -1.32, group);
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.1, 0.25, 0.5), 4), 0, 0.7, -0.65, group);
    this.place(this.paletteMesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), 2), 0, 1.02, 0.75, group); // handlebar

    const driverAvatar = this.place(this.createDriverAvatar(), 0, 0.75, 0.35, group);
    driverAvatar.visible = false;
    const badge = this.place(this.createInteractionBadge("ENTER [F]"), 0, 2.3, 0, group);

    const wheels = [
      this.place(this.createWheel(0.28, 0.2), 0, 0.28, 1.25, group),
      this.place(this.createWheel(0.3, 0.22), -0.68, 0.3, -0.85, group),
      this.place(this.createWheel(0.3, 0.22), 0.68, 0.3, -0.85, group)
    ];

    group.userData = {
      type: "AUTO_RICKSHAW",
      wheels: wheels,
      driverAvatar: driverAvatar,
      badge: badge,
      collider: { width: 1.5, length: 2.8, height: 1.8 }
    };
    return this.finalizeVehicle(group);
  }

  // --- 2. KERALA PRIVATE BUS ("MINNAL" / "KOMBAN") ---
  createKeralaBusMesh() {
    const group = new THREE.Group();
    group.name = "keralaBus";

    const busBody = this.place(new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 11.2), this.busRedMat), 0, 1.6, 0, group);
    busBody.castShadow = true;
    this.place(new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.5, 11.0), this.busYellowMat), 0, 1.5, 0, group);
    this.place(this.paletteMesh(new THREE.BoxGeometry(2.2, 0.35, 7.5), 2), 0, 2.95, -0.5, group); // roof carrier
    this.place(new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.1, 0.1), this.glassMaterial), 0, 1.9, 5.62, group);
    this.place(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 7.8), this.glassMaterial), 0, 2.05, -0.3, group); // side windows
    const signMat = new THREE.MeshBasicMaterial({ color: 0x35d6ea });
    signMat.userData.glow = { day: 1.0, night: 3.0 };
    this.place(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.2), signMat), 0, 2.65, 5.6, group);
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.4, 0.35, 0.1), 5), 0, 0.8, 5.62, group); // grille
    [-0.9, 0.9].forEach((x) => {
      this.place(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.1), this.headlightMaterial), x, 0.8, 5.63, group);
      this.place(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.08), this.taillightMaterial), x * 1.1, 0.9, -5.62, group);
    });

    const driverAvatar = this.place(this.createDriverAvatar(), -0.8, 1.15, 4.8, group);
    driverAvatar.visible = false;
    const badge = this.place(this.createInteractionBadge("HIJACK BUS [F]"), 0, 3.8, 0, group);

    const wheels = [
      [-1.35, 3.8],
      [1.35, 3.8],
      [-1.35, -3.2],
      [1.35, -3.2],
      [-1.35, -4.6],
      [1.35, -4.6]
    ].map(([x, z]) => this.place(this.createWheel(0.55, 0.35), x, 0.55, z, group));

    group.userData = {
      type: "KERALA_BUS",
      wheels: wheels,
      driverAvatar: driverAvatar,
      badge: badge,
      collider: { width: 3.0, length: 11.5, height: 3.4 }
    };
    return this.finalizeVehicle(group);
  }

  // --- 3. KERALA POLICE MAHINDRA JEEP ---
  createPoliceJeepMesh() {
    const group = new THREE.Group();
    group.name = "policeJeep";

    const body = this.place(new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.8, 4.2), this.policeWhiteMat), 0, 0.8, 0, group);
    body.castShadow = true;
    this.place(new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.22, 2.6), this.policeBlueStripe), 0, 0.85, -0.2, group);
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.7, 0.9, 2.2), 3), 0, 1.6, -0.5, group); // roll cage / canopy
    this.place(new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.65, 0.08), this.glassMaterial), 0, 1.5, 0.65, group);
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.2, 0.12, 0.25), 2), 0, 2.12, 0.6, group); // light bar
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.5, 0.3, 0.1), 5), 0, 0.75, 2.11, group); // grille
    [-0.65, 0.65].forEach((x) => {
      this.place(this.roundLight(0.13, 0.08, this.headlightMaterial), x, 0.85, 2.13, group);
      this.place(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.06), this.taillightMaterial), x * 1.15, 0.95, -2.11, group);
    });

    const redStrobe = this.place(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.2), this.strobeRedMat), -0.35, 2.2, 0.6, group);
    const blueStrobe = this.place(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.2), this.strobeBlueMat), 0.35, 2.2, 0.6, group);

    const spare = this.place(this.createWheel(0.42, 0.28), 0, 0.9, -2.25, group);
    spare.rotation.y = Math.PI / 2;

    const driverAvatar = this.place(this.createDriverAvatar(), -0.4, 0.95, 0.05, group);
    driverAvatar.visible = false;
    const badge = this.place(this.createInteractionBadge("STEAL POLICE JEEP [F]"), 0, 2.8, 0, group);

    const wheels = [
      [-0.98, 1.3],
      [0.98, 1.3],
      [-0.98, -1.3],
      [0.98, -1.3]
    ].map(([x, z]) => this.place(this.createWheel(0.45, 0.3), x, 0.45, z, group));

    group.userData = {
      type: "POLICE_JEEP",
      wheels: wheels,
      strobeRed: redStrobe,
      strobeBlue: blueStrobe,
      driverAvatar: driverAvatar,
      badge: badge,
      collider: { width: 2.0, length: 4.4, height: 2.0 }
    };
    return this.finalizeVehicle(group);
  }

  // --- 4. CLASSIC AMBASSADOR CAR (White Taxi / Official Car) ---
  createAmbassadorMesh() {
    const group = new THREE.Group();
    group.name = "ambassador";

    const body = this.place(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 4.4), this.ambassadorWhite), 0, 0.65, 0, group);
    body.castShadow = true;
    this.place(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 2.4), this.glassMaterial), 0, 1.2, -0.2, group);
    this.place(new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 2.3), this.ambassadorWhite), 0, 1.52, -0.2, group); // roof
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.4, 0.4, 0.15), 2), 0, 0.6, 2.22, group); // chrome grille
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.85, 0.12, 0.12), 2), 0, 0.35, 2.24, group); // bumper
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.85, 0.12, 0.12), 2), 0, 0.35, -2.24, group);
    [-0.62, 0.62].forEach((x) => {
      this.place(this.roundLight(0.12, 0.08, this.headlightMaterial), x, 0.72, 2.22, group);
      this.place(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.06), this.taillightMaterial), x * 1.1, 0.72, -2.21, group);
    });

    const driverAvatar = this.place(this.createDriverAvatar(), -0.4, 0.62, 0.1, group);
    driverAvatar.visible = false;
    const badge = this.place(this.createInteractionBadge("ENTER CAR [F]"), 0, 2.2, 0, group);

    const wheels = [
      [-0.95, 1.3],
      [0.95, 1.3],
      [-0.95, -1.3],
      [0.95, -1.3]
    ].map(([x, z]) => this.place(this.createWheel(0.36, 0.25), x, 0.35, z, group));

    group.userData = {
      type: "AMBASSADOR",
      wheels: wheels,
      driverAvatar: driverAvatar,
      badge: badge,
      collider: { width: 1.9, length: 4.5, height: 1.6 }
    };
    return this.finalizeVehicle(group);
  }

  // --- 5. ROYAL ENFIELD SUPERBIKE (Bullet 350) ---
  createSuperbikeMesh() {
    const group = new THREE.Group();
    group.name = "superbike";

    this.place(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.9), this.paint(0x151515, 0.35)), 0, 0.85, 0.2, group);
    this.place(this.paletteMesh(new THREE.BoxGeometry(0.4, 0.45, 0.5), 6), 0, 0.5, 0.0, group); // engine
    this.place(this.paletteMesh(new THREE.BoxGeometry(0.34, 0.12, 0.62), 4), 0, 0.95, -0.38, group); // seat
    this.place(this.paletteMesh(new THREE.BoxGeometry(0.72, 0.05, 0.05), 2), 0, 1.12, 0.72, group); // handlebar
    [-0.12, 0.12].forEach((x) => this.place(this.paletteMesh(new THREE.BoxGeometry(0.04, 0.8, 0.04), 2), x, 0.72, 0.86, group)); // fork
    this.place(this.roundLight(0.1, 0.08, this.headlightMaterial), 0, 1.0, 0.98, group);
    this.place(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.05), this.taillightMaterial), 0, 0.82, -0.92, group);

    const driverAvatar = this.place(this.createDriverAvatar(), 0, 0.9, -0.25, group);
    driverAvatar.visible = false;
    const badge = this.place(this.createInteractionBadge("RIDE BIKE [F]"), 0, 1.8, 0, group);

    const wheels = [
      this.place(this.createWheel(0.35, 0.12), 0, 0.35, 0.95, group),
      this.place(this.createWheel(0.35, 0.14), 0, 0.35, -0.85, group)
    ];

    group.userData = {
      type: "SUPERBIKE",
      wheels: wheels,
      driverAvatar: driverAvatar,
      badge: badge,
      collider: { width: 0.9, length: 2.2, height: 1.3 }
    };
    return this.finalizeVehicle(group);
  }

  // --- 6. SPORTS CAR ---
  createSportsCarMesh(colorHex = 0xff007f) {
    const group = new THREE.Group();
    group.name = "sportsCar";

    const body = this.place(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 4.5), this.paint(colorHex, 0.45)), 0, 0.45, 0, group);
    body.castShadow = true;
    this.place(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.9), this.glassMaterial), 0, 0.8, -0.2, group);
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.7, 0.16, 0.1), 5), 0, 0.32, 2.22, group); // lower intake
    this.place(this.paletteMesh(new THREE.BoxGeometry(1.9, 0.06, 0.35), 5), 0, 0.72, -2.1, group); // rear wing
    [-0.72, 0.72].forEach((x) => {
      this.place(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.06), this.headlightMaterial), x, 0.56, 2.24, group);
    });
    this.place(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.05), this.taillightMaterial), 0, 0.56, -2.26, group);

    const driverAvatar = this.place(this.createDriverAvatar(), -0.4, 0.38, -0.1, group);
    driverAvatar.visible = false;
    const badge = this.place(this.createInteractionBadge("ENTER SUPERCAR [F]"), 0, 2.0, 0, group);

    const wheels = [
      [-1.05, 1.35],
      [1.05, 1.35],
      [-1.05, -1.35],
      [1.05, -1.35]
    ].map(([x, z]) => this.place(this.createWheel(0.38, 0.3), x, 0.38, z, group));

    group.userData = {
      type: "SPORTS_CAR",
      wheels: wheels,
      driverAvatar: driverAvatar,
      badge: badge,
      collider: { width: 2.2, length: 4.6, height: 1.2 }
    };
    return this.finalizeVehicle(group);
  }

  // --- 7. TOMMY VERCETTI CHARACTER: JOINTED RIG FOR PROCEDURAL ANIMATION ---
  // Root at the feet, facing +Z. Joints: hips > thighs > knees, hips > spine > head,
  // spine > shoulders > elbows. Negative x rotation swings a limb forward.
  createCharacterMesh() {
    const group = new THREE.Group();
    group.name = "playerCharacter";

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xb98356, roughness: 0.55 });
    const shirtMat = new THREE.MeshStandardMaterial({ map: this.shirtTexture, roughness: 0.8, metalness: 0.0 });
    const jeansMat = new THREE.MeshStandardMaterial({ map: this.jeansTexture, roughness: 0.9, metalness: 0.0 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1a0f07, roughness: 0.55 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xe9ebed, roughness: 0.5 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd8ab4a, metalness: 1.0, roughness: 0.25 });
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.05, metalness: 0.6 });

    const part = (parent, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
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
    part(hips, new THREE.BoxGeometry(0.36, 0.2, 0.22), jeansMat, 0, 0, 0);

    // Legs
    const legs = {};
    [["L", -0.1], ["R", 0.1]].forEach(([side, x]) => {
      const thigh = joint(hips, x, -0.04, 0);
      part(thigh, new THREE.BoxGeometry(0.16, 0.46, 0.18), jeansMat, 0, -0.23, 0);
      const knee = joint(thigh, 0, -0.46, 0);
      part(knee, new THREE.BoxGeometry(0.14, 0.42, 0.16), jeansMat, 0, -0.21, 0);
      part(knee, new THREE.BoxGeometry(0.15, 0.1, 0.28), shoeMat, 0, -0.4, 0.05);
      legs["thigh" + side] = thigh;
      legs["knee" + side] = knee;
    });

    // Torso (Hawaiian shirt), gold chain, head with swept-back hair and aviators
    const spine = joint(hips, 0, 0.08, 0);
    part(spine, new THREE.BoxGeometry(0.46, 0.52, 0.26), shirtMat, 0, 0.26, 0);
    const head = joint(spine, 0, 0.54, 0);
    part(head, new THREE.BoxGeometry(0.1, 0.06, 0.1), skinMat, 0, 0.02, 0); // neck
    part(head, new THREE.BoxGeometry(0.24, 0.27, 0.25), skinMat, 0, 0.17, 0);
    part(head, new THREE.BoxGeometry(0.27, 0.09, 0.28), hairMat, 0, 0.32, -0.01);
    part(head, new THREE.BoxGeometry(0.26, 0.18, 0.08), hairMat, 0, 0.22, -0.11);
    part(head, new THREE.BoxGeometry(0.23, 0.07, 0.03), goldMat, 0, 0.2, 0.13);
    part(head, new THREE.BoxGeometry(0.21, 0.055, 0.035), lensMat, 0, 0.2, 0.135);

    // Arms: short sleeves, bare forearms, gold watch on the left wrist
    const arms = {};
    [["L", -0.3], ["R", 0.3]].forEach(([side, x]) => {
      const shoulder = joint(spine, x, 0.47, 0);
      part(shoulder, new THREE.BoxGeometry(0.13, 0.28, 0.14), shirtMat, 0, -0.13, 0);
      const elbow = joint(shoulder, 0, -0.28, 0);
      part(elbow, new THREE.BoxGeometry(0.1, 0.26, 0.1), skinMat, 0, -0.13, 0);
      part(elbow, new THREE.BoxGeometry(0.09, 0.09, 0.1), skinMat, 0, -0.3, 0);
      if (side === "L") part(elbow, new THREE.BoxGeometry(0.12, 0.04, 0.12), goldMat, 0, -0.22, 0);
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
      // aliases used by older code
      leftLeg: legs.thighL,
      rightLeg: legs.thighR,
      leftArm: arms.shoulderL,
      rightArm: arms.shoulderR,
      rightArmPivot: arms.shoulderR
    };

    this.mergeJointMeshes(group);
    return group;
  }

  // --- 8. KAKKANAD PEDESTRIAN: light jointed rig (body, two legs, two arms) ---
  // One shared vertex-coloured material; rigid parts merged => 5 draw calls per person.
  coloredBox(w, h, d, x, y, z, hex) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const c = GFX.color(hex);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }

  getPedMaterial() {
    if (!this.pedMaterial) {
      this.pedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
      this.pedMaterial.userData.linear = true; // vertex colours are already linear
    }
    return this.pedMaterial;
  }

  createPedestrianMesh(shirtHex, lowerHex, wearsLungi) {
    const mat = this.getPedMaterial();
    const skinHex = 0x9a6a45;
    const merge = (geos) => THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false);
    const mesh = (geo, parent) => {
      const m = new THREE.Mesh(geo, mat);
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
    const bodyParts = [
      this.coloredBox(0.44, 0.56, 0.25, 0, 0.3, 0, shirtHex),
      this.coloredBox(0.23, 0.26, 0.24, 0, 0.74, 0, skinHex),
      this.coloredBox(0.25, 0.08, 0.26, 0, 0.89, -0.01, 0x151008),
    ];
    if (wearsLungi) bodyParts.push(this.coloredBox(0.46, 0.5, 0.3, 0, -0.2, 0, lowerHex));
    mesh(merge(bodyParts), body);

    const legs = [-0.1, 0.1].map((x) => {
      const hip = new THREE.Group();
      hip.position.set(x, bodyHeight, 0);
      group.add(hip);
      mesh(this.coloredBox(0.15, 0.86, 0.17, 0, -0.43, 0, wearsLungi ? skinHex : lowerHex), hip);
      return hip;
    });
    const arms = [-0.29, 0.29].map((x) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, 0.54, 0);
      body.add(shoulder);
      mesh(this.coloredBox(0.11, 0.56, 0.12, 0, -0.26, 0, skinHex), shoulder);
      return shoulder;
    });

    group.userData = { type: "PEDESTRIAN", body, bodyHeight, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1] };
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
          const g = m.geometry.clone();
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

  // --- Driver Avatar (one merged, vertex-coloured mesh) ---
  createDriverAvatar() {
    const geo = THREE.BufferGeometryUtils.mergeBufferGeometries(
      [
        this.coloredBox(0.46, 0.45, 0.25, 0, 0.3, 0, 0x2aa8b8),
        this.coloredBox(0.22, 0.25, 0.23, 0, 0.66, 0, 0x9a6a45),
        this.coloredBox(0.24, 0.07, 0.24, 0, 0.8, -0.01, 0x151008)
      ],
      false
    );
    const avatar = new THREE.Mesh(geo, this.getPedMaterial());
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
    const planeGeo = new THREE.PlaneGeometry(1.9, 0.48);
    const planeMat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      fog: false
    });
    planeMat.userData.glow = 1.25; // UI label: stays readable after tone mapping
    const mesh = new THREE.Mesh(planeGeo, planeMat);
    badgeGroup.add(mesh);
    badgeGroup.visible = false;
    return badgeGroup;
  }

  // One mesh per wheel (tyre, rim and spokes on the palette material) so the spin shows.
  createWheel(radius, width) {
    const parts = [];
    const tyre = new THREE.CylinderGeometry(radius, radius, width, 16);
    tyre.rotateZ(Math.PI / 2);
    parts.push(this.setPaletteUV(tyre, 0));
    const rim = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 12);
    rim.rotateZ(Math.PI / 2);
    parts.push(this.setPaletteUV(rim, 1));
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.BoxGeometry(width + 0.04, radius * 1.1, radius * 0.12);
      spoke.rotateX((k * Math.PI) / 3);
      parts.push(this.setPaletteUV(spoke, 6));
    }
    const wheel = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(parts, false), this.paletteMaterial);
    wheel.castShadow = true;
    wheel.rotation.order = "YXZ"; // steer (Y) then spin (X)
    wheel.userData.radius = radius;
    return wheel;
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
