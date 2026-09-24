/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 2: KAKKANAD 3D MAP (VICE CITY NEON GRAPHICS UPGRADE)
 * Features retro 1980s neon storefronts, zebra crossings, and sunset lighting.
 */

class KakkanadMapManager {
  constructor(scene) {
    this.scene = scene;
    this.config = window.KAKKANAD_CONFIG;
    this.roads = this.config.ROAD_NETWORK;
    this.landmarks = this.config.KEY_LANDMARKS;

    // Surface Materials Engine Integration
    if (typeof window.SurfaceManager !== "undefined") {
      this.surfaceManager = new window.SurfaceManager();
      this.asphaltMat = this.surfaceManager.asphaltMaterial;
      this.curbMat = this.surfaceManager.curbMaterial;
      this.medianMat = this.surfaceManager.medianGrassMaterial;
    } else {
      this.asphaltMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.5, metalness: 0.25 });
      this.curbMat = new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.6 });
      this.medianMat = new THREE.MeshStandardMaterial({ color: 0x1f3823, roughness: 0.8 });
    }
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.1, metalness: 0.85 });
    this.glassBuildingMat = new THREE.MeshStandardMaterial({ color: 0x0a192f, roughness: 0.15, metalness: 0.9 });
    this.concreteMat = new THREE.MeshStandardMaterial({ color: 0xadb5bd, roughness: 0.7 });
    this.thattukadaRoofMat = new THREE.MeshStandardMaterial({ color: 0x9e2a2b, roughness: 0.6 });
    this.palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 });
    this.palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.7 });

    // Neon Glow Materials
    this.neonPinkMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
    this.neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.neonGoldMat = new THREE.MeshBasicMaterial({ color: 0xffb703 });
    this.neonPurpleMat = new THREE.MeshBasicMaterial({ color: 0xb5179e });
    this.roadStripeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.roadStripeYellow = new THREE.MeshBasicMaterial({ color: 0xffd166 });

    this.roadMeshes = [];
    this.initMap();
  }

  initMap() {
    this.buildTerrainGround();
    this.buildRiver();
    this.buildRoadNetwork();
    this.buildViceCityNeonBuildings();
    this.buildLandmarks();
    this.buildThattukadas();
    this.buildPalmTrees();
  }

  buildTerrainGround() {
    const bounds = this.config.MAP_BOUNDS;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;

    const groundGeo = new THREE.PlaneGeometry(width, depth);
    groundGeo.rotateX(-Math.PI / 2);

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0e1713,
      roughness: 0.9
    });

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -0.05, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildRiver() {
    const riverGeo = new THREE.PlaneGeometry(400, 2400);
    riverGeo.rotateX(-Math.PI / 2);
    const river = new THREE.Mesh(riverGeo, this.waterMat);
    river.position.set(1100, 0.05, 0);
    this.scene.add(river);

    // River Bridge
    const bridgeGeo = new THREE.BoxGeometry(220, 1.2, 22);
    const bridge = new THREE.Mesh(bridgeGeo, this.concreteMat);
    bridge.position.set(980, 1.8, -520);
    this.scene.add(bridge);
  }

  buildRoadNetwork() {
    this.roads.forEach((road) => {
      const pts = road.points;
      const halfW = road.width / 2;

      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = new THREE.Vector3(pts[i].x, 0.08, pts[i].z);
        const p2 = new THREE.Vector3(pts[i + 1].x, 0.08, pts[i + 1].z);

        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        dir.normalize();

        const normal = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

        // Asphalt Road Surface
        const roadGeo = new THREE.BufferGeometry();
        const v = [];
        const idx = [];

        const c1 = new THREE.Vector3().copy(p1).addScaledVector(normal, -halfW);
        const c2 = new THREE.Vector3().copy(p1).addScaledVector(normal, halfW);
        const c3 = new THREE.Vector3().copy(p2).addScaledVector(normal, -halfW);
        const c4 = new THREE.Vector3().copy(p2).addScaledVector(normal, halfW);

        v.push(c1.x, c1.y, c1.z);
        v.push(c2.x, c2.y, c2.z);
        v.push(c3.x, c3.y, c3.z);
        v.push(c4.x, c4.y, c4.z);

        idx.push(0, 1, 2);
        idx.push(1, 3, 2);

        roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        roadGeo.setIndex(idx);
        roadGeo.computeVertexNormals();

        const mesh = new THREE.Mesh(roadGeo, this.asphaltMat);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.roadMeshes.push({ roadId: road.id, p1, p2, width: road.width });

        // Yellow Road Markings & White Dashes
        this.addRoadMarkings(p1, p2, dir, normal, len, road.isDualCarriageway);

        // Center Median / Curbs for Dual Carriageways
        if (road.isDualCarriageway) {
          const medGeo = new THREE.BoxGeometry(1.4, 0.35, len);
          const medMesh = new THREE.Mesh(medGeo, this.medianMat);
          const midPos = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
          medMesh.position.set(midPos.x, 0.2, midPos.z);
          medMesh.rotation.y = Math.atan2(dir.x, dir.z);
          this.scene.add(medMesh);

          // Streetlights along outer curbs
          if (len > 70) {
            this.addStreetlight(
              midPos.x + normal.x * (road.width * 0.5 + 2.5),
              midPos.z + normal.z * (road.width * 0.5 + 2.5),
              Math.atan2(normal.x, normal.z)
            );
          }
        }
      }
    });
  }

  addRoadMarkings(p1, p2, dir, normal, len, isDual) {
    const steps = Math.floor(len / 8);
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const pos = new THREE.Vector3().copy(p1).addScaledVector(dir, t * len);

      // Center divider dash
      const dashGeo = new THREE.BoxGeometry(0.2, 0.02, 3.5);
      const dash = new THREE.Mesh(dashGeo, isDual ? this.roadStripeYellow : this.roadStripeWhite);
      dash.position.set(pos.x, 0.1, pos.z);
      dash.rotation.y = Math.atan2(dir.x, dir.z);
      this.scene.add(dash);
    }

    // Zebra Crossings at junctions
    if (len > 60) {
      const crossPos = new THREE.Vector3().copy(p1).addScaledVector(dir, 8.0);
      for (let z = -4; z <= 4; z += 1.5) {
        const barGeo = new THREE.BoxGeometry(0.8, 0.02, 4.0);
        const bar = new THREE.Mesh(barGeo, this.roadStripeWhite);
        const zPos = new THREE.Vector3().copy(crossPos).addScaledVector(normal, z);
        bar.position.set(zPos.x, 0.1, zPos.z);
        bar.rotation.y = Math.atan2(dir.x, dir.z);
        this.scene.add(bar);
      }
    }
  }

  addStreetlight(x, z, angle = 0) {
    const group = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.6, metalness: 0.8 });

    // Dark graphite metallic pole
    const poleGeo = new THREE.CylinderGeometry(0.10, 0.15, 9.2, 8);
    const pole = new THREE.Mesh(poleGeo, steelMat);
    pole.position.y = 4.6;
    group.add(pole);

    // Cantilever arm arching over roadway
    const armGeo = new THREE.BoxGeometry(0.08, 0.08, 2.2);
    const arm = new THREE.Mesh(armGeo, steelMat);
    arm.position.set(0, 9.1, -1.0);
    arm.rotation.x = -0.12;
    group.add(arm);

    // High-Pressure Sodium Streetlamp Fixture
    const lampGeo = new THREE.BoxGeometry(0.4, 0.18, 0.7);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6a7 });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0, 9.0, -1.9);
    group.add(lamp);

    // Atmospheric warm downward light cone
    const glowGeo = new THREE.ConeGeometry(2.4, 7.5, 8, 1, true);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffc300,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 4.8, -1.9);
    group.add(glow);

    group.position.set(x, 0, z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  createNeonSignTexture(text, textColor = "#ff007f", glowColor = "#ff77a9") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    // Dark glass backing
    ctx.fillStyle = "#080b14";
    ctx.fillRect(0, 0, 512, 128);

    // Glowing border frame
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 112);

    // Neon Text with double shadow glow
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 38px 'Orbitron', 'Rajdhani', sans-serif";

    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = textColor;
    ctx.fillText(text, 256, 64);

    // Second inner pass for white hot tube center
    ctx.shadowBlur = 4;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // Procedural Window Grid Texture
  createBuildingWindowTexture(baseColor = "#f8edeb", windowColor = "#ffe66d") {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 256);

    // Draw grid of warm glowing windows
    ctx.fillStyle = windowColor;
    for (let y = 14; y < 240; y += 38) {
      for (let x = 16; x < 240; x += 42) {
        ctx.fillRect(x, y, 26, 22);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 4);
    return tex;
  }

  // --- 4. Vice City Neon Architecture & Billboards ---
  buildViceCityNeonBuildings() {
    const buildingSpots = [
      { x: -95,  z: 145, w: 32, h: 36, d: 24, title: "HOTEL MALABAR ★", col: "#ff007f", glow: "#ff77aa", baseCol: "#ff8fa3", winCol: "#fff3b0" },
      { x: -95,  z: 185, w: 28, h: 42, d: 26, title: "OCEAN DRIVE CAFE 🌴", col: "#00f0ff", glow: "#70f5ff", baseCol: "#48cae4", winCol: "#caf0f8" },
      { x: -40,  z: 130, w: 34, h: 48, d: 28, title: "VICE CITY KAKKANAD", col: "#ff007f", glow: "#ff77aa", baseCol: "#fce7f3", winCol: "#ffd166" },
      { x: 120,  z: 180, w: 40, h: 60, d: 30, title: "KOCHI SYNTH LOUNGE 🍸", col: "#b5179e", glow: "#e056fd", baseCol: "#7209b7", winCol: "#f72585" },
      { x: 260,  z: 60,  w: 45, h: 70, d: 35, title: "INFOPARK BOULEVARD", col: "#00f0ff", glow: "#70f5ff", baseCol: "#1e293b", winCol: "#38bdf8" },
      { x: 420,  z: 220, w: 35, h: 50, d: 30, title: "EDACHIRA PLAZA ★", col: "#ffd166", glow: "#ffe49e", baseCol: "#ffbe0b", winCol: "#fffae0" }
    ];

    buildingSpots.forEach((b) => {
      const bldgGroup = new THREE.Group();

      // Textured facade with illuminated window grids
      const winTex = this.createBuildingWindowTexture(b.baseCol, b.winCol);
      const bldgMat = new THREE.MeshStandardMaterial({
        map: winTex,
        roughness: 0.4,
        metalness: 0.1
      });

      // Main building body
      const bGeo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const bMesh = new THREE.Mesh(bGeo, bldgMat);
      bMesh.position.y = b.h / 2;
      bMesh.castShadow = true;
      bldgGroup.add(bMesh);

      // Glowing Canvas Neon Signboard
      const signTex = this.createNeonSignTexture(b.title, b.col, b.glow);
      const signMat = new THREE.MeshBasicMaterial({ map: signTex });
      const signGeo = new THREE.BoxGeometry(b.w * 0.85, 5.5, 0.8);
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(0, b.h + 3.2, b.d / 2 + 0.4);
      bldgGroup.add(sign);

      // Top glowing neon crown tube
      const crownMat = new THREE.MeshBasicMaterial({ color: b.col === "#00f0ff" ? 0x00f0ff : (b.col === "#ffd166" ? 0xffd166 : 0xff007f) });
      const crownGeo = new THREE.BoxGeometry(b.w + 0.8, 1.0, b.d + 0.8);
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.y = b.h;
      bldgGroup.add(crown);

      // Mid-level horizontal neon strip
      const stripGeo = new THREE.BoxGeometry(b.w + 0.5, 0.6, b.d + 0.5);
      const strip = new THREE.Mesh(stripGeo, crownMat);
      strip.position.y = b.h * 0.55;
      bldgGroup.add(strip);

      bldgGroup.position.set(b.x, 0, b.z);
      this.scene.add(bldgGroup);
    });
  }

  // --- 5. Key Kakkanad Landmarks ---
  buildLandmarks() {
    this.landmarks.forEach((lm) => {
      const group = new THREE.Group();
      group.position.set(lm.x, 0, lm.z);

      if (lm.id === "infopark") {
        // Athulya & Vismaya IT Glass Towers
        const towerGeo = new THREE.BoxGeometry(65, 105, 45);
        const tower = new THREE.Mesh(towerGeo, this.glassBuildingMat);
        tower.position.y = 52.5;
        tower.castShadow = true;
        group.add(tower);

        // Glowing Neon "INFOPARK ATHULYA" Rooftop Sign
        const signGeo = new THREE.BoxGeometry(45, 6, 2);
        const sign = new THREE.Mesh(signGeo, this.neonCyanMat);
        sign.position.set(0, 108, 22.8);
        group.add(sign);

        // Neon Crown Trim
        const trimGeo = new THREE.BoxGeometry(66, 1.2, 46);
        const trim = new THREE.Mesh(trimGeo, this.neonPinkMat);
        trim.position.y = 105.5;
        group.add(trim);

        // Carnival Food Court Annex
        const foodGeo = new THREE.BoxGeometry(35, 14, 35);
        const foodMat = new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.4 });
        const foodCourt = new THREE.Mesh(foodGeo, foodMat);
        foodCourt.position.set(55, 7, 0);
        group.add(foodCourt);

      } else if (lm.id === "collectorate") {
        // Civil Station / Collectorate Administrative Building
        const mainGeo = new THREE.BoxGeometry(90, 32, 50);
        const mainBldg = new THREE.Mesh(mainGeo, this.concreteMat);
        mainBldg.position.y = 16;
        mainBldg.castShadow = true;
        group.add(mainBldg);

        // Porch
        const porchGeo = new THREE.BoxGeometry(34, 10, 18);
        const porch = new THREE.Mesh(porchGeo, this.concreteMat);
        porch.position.set(0, 5, 32);
        group.add(porch);

        // Indian Tricolor Flag Mast on Roof
        const mastGeo = new THREE.CylinderGeometry(0.1, 0.1, 14, 8);
        const mast = new THREE.Mesh(mastGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        mast.position.set(0, 38, 0);
        group.add(mast);

      } else if (lm.id === "smartcity") {
        // Futuristic Angled IT Towers
        const scGeo = new THREE.BoxGeometry(52, 120, 52);
        const scTower = new THREE.Mesh(scGeo, new THREE.MeshStandardMaterial({ color: 0x14213d, roughness: 0.1, metalness: 0.9 }));
        scTower.position.y = 60;
        scTower.rotation.y = 0.25;
        group.add(scTower);

        const neonEdge = new THREE.Mesh(new THREE.BoxGeometry(54, 2, 54), this.neonCyanMat);
        neonEdge.position.y = 120;
        group.add(neonEdge);

      } else if (lm.id === "watermetro") {
        // Kochi Water Metro Kakkanad Jetty
        const terminalGeo = new THREE.BoxGeometry(42, 10, 26);
        const terminalMat = new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.4 });
        const terminal = new THREE.Mesh(terminalGeo, terminalMat);
        terminal.position.y = 5.0;
        group.add(terminal);

        const pontoonGeo = new THREE.BoxGeometry(22, 1.5, 36);
        const pontoon = new THREE.Mesh(pontoonGeo, this.concreteMat);
        pontoon.position.set(30, 0.5, 0);
        group.add(pontoon);

      } else if (lm.id === "bus_stand") {
        // Kakkanad Private Bus Terminal Shed (Spacious open passenger concourse)
        const shedGeo = new THREE.BoxGeometry(65, 0.8, 28);
        const shedRoof = new THREE.Mesh(shedGeo, this.thattukadaRoofMat);
        shedRoof.position.y = 7.8;

        const pGeo = new THREE.CylinderGeometry(0.2, 0.2, 7.8, 8);
        [-26, -14, 14, 26].forEach((px) => {
          [-12, 12].forEach((pz) => {
            const p = new THREE.Mesh(pGeo, this.concreteMat);
            p.position.set(px, 3.9, pz);
            group.add(p);
          });
        });
        group.add(shedRoof);
      }

      this.scene.add(group);
    });
  }

  // --- 6. Authentic Thattukada Tea Stalls ---
  buildThattukadas() {
    const spots = [
      { x: 380, z: 150 },
      { x: -45, z: 185 },
      { x: 490, z: -270 }
    ];

    spots.forEach((pt) => {
      const stall = new THREE.Group();

      const baseGeo = new THREE.BoxGeometry(4.8, 2.5, 3.2);
      const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x582f0e }));
      base.position.y = 1.25;

      const roofGeo = new THREE.ConeGeometry(3.8, 1.5, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roof = new THREE.Mesh(roofGeo, this.thattukadaRoofMat);
      roof.position.y = 3.2;

      // Glowing Tea Glass Lantern & Neon Sign
      const lampGeo = new THREE.SphereGeometry(0.25, 8, 8);
      const lamp = new THREE.Mesh(lampGeo, this.neonGoldMat);
      lamp.position.set(0, 2.2, 1.7);

      const sign = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.4, 0.1), this.neonPinkMat);
      sign.position.set(0, 2.7, 1.65);

      stall.add(base);
      stall.add(roof);
      stall.add(lamp);
      stall.add(sign);
      stall.position.set(pt.x, 0, pt.z);
      this.scene.add(stall);
    });
  }

  // --- 7. Coconut Palm Trees & Tropical Foliage ---
  buildPalmTrees() {
    if (typeof window.FoliageManager !== "undefined") {
      this.foliageManager = new window.FoliageManager(this.scene);
      this.foliageManager.populateMapFoliage(this);
    } else {
      const palmLocations = [
        { x: -62, z: 165 }, { x: -78, z: 155 }, { x: -62, z: 145 }, { x: -78, z: 175 },
        { x: -60, z: 220 }, { x: -80, z: 260 }, { x: 340, z: 90 }, { x: 370, z: 70 },
        { x: 500, z: -380 }, { x: 540, z: -410 }, { x: 860, z: -460 }, { x: 920, z: 160 }
      ];

      palmLocations.forEach((loc) => {
        const palm = new THREE.Group();
        const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 8.5, 8);
        const trunk = new THREE.Mesh(trunkGeo, this.palmTrunkMat);
        trunk.position.y = 4.25;
        trunk.rotation.z = 0.08;
        palm.add(trunk);

        for (let i = 0; i < 7; i++) {
          const leafGeo = new THREE.ConeGeometry(1.3, 4.4, 5);
          const leaf = new THREE.Mesh(leafGeo, this.palmLeafMat);
          leaf.position.set(0, 8.4, 0);
          leaf.rotation.z = 0.85;
          leaf.rotation.y = (i / 7) * Math.PI * 2;
          palm.add(leaf);
        }

        palm.position.set(loc.x, 0, loc.z);
        this.scene.add(palm);
      });
    }
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
      color: l.color
    }));
  }
}

window.KakkanadMapManager = KakkanadMapManager;
