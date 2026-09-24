/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN: ALPHA-CUTOUT TROPICAL FOLIAGE ENGINE (Subagent β)
 * Features high-resolution alpha-cutout textures for coconut palm fronds,
 * curved palm trunks, clustered coconuts, and lush tropical undergrowth.
 */

class FoliageManager {
  constructor(scene) {
    this.scene = scene;
    this.frondTexture = this.generatePalmFrondAlphaTexture();
    this.trunkTexture = this.generateBarkTexture();
    this.bananaLeafTexture = this.generateBananaLeafTexture();

    // Reusable Foliage Materials with Alpha Cutout
    this.frondMaterial = new THREE.MeshStandardMaterial({
      map: this.frondTexture,
      alphaTest: 0.45,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.65,
      metalness: 0.1
    });

    this.trunkMaterial = new THREE.MeshStandardMaterial({
      map: this.trunkTexture,
      roughness: 0.85,
      metalness: 0.05
    });

    this.coconutMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5d23, // Unripe coconut green with amber tones
      roughness: 0.75,
      metalness: 0.1
    });

    this.bananaMaterial = new THREE.MeshStandardMaterial({
      map: this.bananaLeafTexture,
      alphaTest: 0.45,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.6
    });

    this.trees = [];
  }

  // --- 1. PROCEDURAL 512x512 ALPHA-CUTOUT PALM FROND TEXTURE ---
  generatePalmFrondAlphaTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    // Completely transparent background
    ctx.clearRect(0, 0, 512, 512);

    // Central Stem (Rachis)
    ctx.strokeStyle = "#8cb33e";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(256, 500);
    ctx.quadraticCurveTo(256, 260, 256, 30);
    ctx.stroke();

    // Inner Stem Highlight
    ctx.strokeStyle = "#b5d45d";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(256, 490);
    ctx.quadraticCurveTo(256, 260, 256, 35);
    ctx.stroke();

    // 48 Individually Tapered Pinnate Leaflets
    const leafletsCount = 44;
    for (let i = 0; i < leafletsCount; i++) {
      const t = i / leafletsCount;
      const y = 480 - t * 440;
      const maxLength = 210 * Math.sin(t * Math.PI * 0.9 + 0.15);

      // Varying natural shades of tropical palm green
      const greenHue = 105 + (i % 7) * 4;
      const lightVal = 32 + (i % 5) * 6;
      ctx.fillStyle = `hsl(${greenHue}, 75%, ${lightVal}%)`;
      ctx.strokeStyle = `hsl(${greenHue}, 80%, ${lightVal - 8}%)`;
      ctx.lineWidth = 1.5;

      // Left Leaflet
      ctx.beginPath();
      ctx.moveTo(254, y);
      const leftTipX = 254 - maxLength;
      const leftTipY = y + 35 + t * 40;
      ctx.quadraticCurveTo(254 - maxLength * 0.5, y - 8, leftTipX, leftTipY);
      ctx.quadraticCurveTo(254 - maxLength * 0.5, y + 14, 254, y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Right Leaflet
      ctx.beginPath();
      ctx.moveTo(258, y);
      const rightTipX = 258 + maxLength;
      const rightTipY = y + 35 + t * 40;
      ctx.quadraticCurveTo(258 + maxLength * 0.5, y - 8, rightTipX, rightTipY);
      ctx.quadraticCurveTo(258 + maxLength * 0.5, y + 14, 258, y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  // --- 2. PROCEDURAL TRUNK BARK TEXTURE ---
  generateBarkTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    // Earthy brown base
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(0, 0, 128, 256);

    // Fibrous ring marks on coconut trunk
    for (let y = 0; y < 256; y += 14) {
      ctx.fillStyle = "#2c1b18";
      ctx.fillRect(0, y, 128, 4);

      ctx.fillStyle = "#5d4037";
      ctx.fillRect(0, y + 4, 128, 2);

      // Bark noise
      for (let x = 0; x < 128; x += 6) {
        if ((x + y) % 5 === 0) {
          ctx.fillStyle = "rgba(0,0,0,0.2)";
          ctx.fillRect(x, y, 4, 10);
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 4);
    return texture;
  }

  // --- 3. PROCEDURAL BANANA LEAF ALPHA TEXTURE ---
  generateBananaLeafTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, 256, 512);

    // Broad banana leaf blade
    ctx.fillStyle = "#2e7d32";
    ctx.beginPath();
    ctx.moveTo(128, 500);
    ctx.bezierCurveTo(20, 360, 20, 140, 128, 20);
    ctx.bezierCurveTo(236, 140, 236, 360, 128, 500);
    ctx.closePath();
    ctx.fill();

    // Central Midrib
    ctx.strokeStyle = "#aed581";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(128, 510);
    ctx.lineTo(128, 20);
    ctx.stroke();

    // Lateral Veins
    ctx.strokeStyle = "rgba(174, 213, 129, 0.4)";
    ctx.lineWidth = 2;
    for (let y = 60; y < 480; y += 18) {
      ctx.beginPath();
      ctx.moveTo(128, y);
      ctx.lineTo(40, y - 25);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(128, y);
      ctx.lineTo(216, y - 25);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  // --- 4. BUILD 3D COCONUT PALM WITH CURVED ALPHA FRONDS & COCONUTS ---
  createCoconutPalm(height = 14, lean = 1.8) {
    const palmGroup = new THREE.Group();
    palmGroup.name = "coconutPalm";

    // A. Curved Segmented Trunk
    const segments = 7;
    const segHeight = height / segments;
    let currentPos = new THREE.Vector3(0, 0, 0);
    const leanAngle = (Math.random() - 0.5) * 0.35;
    const leanDir = new THREE.Vector2(Math.sin(leanAngle), Math.cos(leanAngle)).normalize();

    for (let s = 0; s < segments; s++) {
      const topRad = 0.38 - (s / segments) * 0.12;
      const botRad = 0.45 - (s / segments) * 0.12;
      const segGeo = new THREE.CylinderGeometry(topRad, botRad, segHeight, 9);
      const segMesh = new THREE.Mesh(segGeo, this.trunkMaterial);

      const t = s / segments;
      const offsetX = leanDir.x * t * t * lean;
      const offsetZ = leanDir.y * t * t * lean;

      segMesh.position.set(offsetX, currentPos.y + segHeight * 0.5, offsetZ);
      segMesh.rotation.z = -leanDir.x * t * 0.15;
      segMesh.rotation.x = leanDir.y * t * 0.15;
      segMesh.castShadow = true;
      segMesh.receiveShadow = true;
      palmGroup.add(segMesh);

      currentPos.y += segHeight;
    }

    const crownPos = new THREE.Vector3(
      leanDir.x * lean,
      currentPos.y,
      leanDir.y * lean
    );

    // B. Cluster of Real Coconuts at Crown
    const coconutGeo = new THREE.SphereGeometry(0.28, 8, 8);
    coconutGeo.scale(0.85, 1.2, 0.85); // Elongated coconut shape
    const coconutCount = 7;
    for (let c = 0; c < coconutCount; c++) {
      const nut = new THREE.Mesh(coconutGeo, this.coconutMaterial);
      const angle = (c / coconutCount) * Math.PI * 2;
      nut.position.set(
        crownPos.x + Math.cos(angle) * 0.45,
        crownPos.y - 0.35,
        crownPos.z + Math.sin(angle) * 0.45
      );
      nut.rotation.x = Math.random() * 0.4;
      nut.castShadow = true;
      palmGroup.add(nut);
    }

    // C. 14 Cascading Alpha-Cutout Fronds
    const frondCount = 14;
    for (let f = 0; f < frondCount; f++) {
      const azimuth = (f / frondCount) * Math.PI * 2 + (Math.random() * 0.2);
      const droopTier = (f % 3); // 3 tiers of elevation & droop

      // Curved Frond Geometry (Bent downward along Y)
      const frondLength = 4.8 + Math.random() * 0.8;
      const frondWidth = 1.5;
      const frondGeo = new THREE.PlaneGeometry(frondWidth, frondLength, 4, 8);

      // Curve the plane into an authentic parabolic leaf arc
      const posAttr = frondGeo.attributes.position;
      for (let p = 0; p < posAttr.count; p++) {
        const yVal = posAttr.getY(p); // -length/2 to +length/2
        // 0 (stem) to 1 (tip). Clamped: float error can make the stem row a tiny
        // negative, and Math.pow(negative, 2.2) is NaN (broke ~half of all fronds).
        const normY = Math.min(1, Math.max(0, (yVal + frondLength * 0.5) / frondLength));
        const bend = Math.pow(normY, 2.2) * (1.8 + droopTier * 0.4);
        posAttr.setZ(p, -bend);
      }
      frondGeo.computeVertexNormals();

      const frondMesh = new THREE.Mesh(frondGeo, this.frondMaterial);

      // Position at crown with downward tilt
      frondMesh.position.copy(crownPos);
      frondMesh.rotation.y = azimuth;
      frondMesh.rotation.x = 0.55 + droopTier * 0.22;
      frondMesh.castShadow = true;
      frondMesh.receiveShadow = true;

      palmGroup.add(frondMesh);
    }

    return palmGroup;
  }

  // --- 5. BUILD TROPICAL BANANA PLANT ---
  createBananaPlant() {
    const plantGroup = new THREE.Group();
    plantGroup.name = "bananaPlant";

    const stemGeo = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 7);
    const stemMesh = new THREE.Mesh(stemGeo, this.trunkMaterial);
    stemMesh.position.y = 1.2;
    stemMesh.castShadow = true;
    plantGroup.add(stemMesh);

    const leafCount = 6;
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leafGeo = new THREE.PlaneGeometry(1.2, 2.8, 3, 6);

      // Curve leaf tip
      const pos = leafGeo.attributes.position;
      for (let p = 0; p < pos.count; p++) {
        const yVal = pos.getY(p);
        const normY = (yVal + 1.4) / 2.8;
        pos.setZ(p, -Math.pow(normY, 2.0) * 0.9);
      }
      leafGeo.computeVertexNormals();

      const leaf = new THREE.Mesh(leafGeo, this.bananaMaterial);
      leaf.position.set(0, 2.2, 0);
      leaf.rotation.y = angle;
      leaf.rotation.x = 0.65;
      leaf.castShadow = true;
      plantGroup.add(leaf);
    }

    return plantGroup;
  }

  // --- 6. POPULATE PALM GROVES ACROSS KAKKANAD ---
  populateMapFoliage(mapManager) {
    const bounds = mapManager.config.MAP_BOUNDS;

    // Coconut Palms along Seaport-Airport Road Median & Sidewalks
    const spapSpots = [
      { x: -75, z: 120 }, { x: -65, z: 180 }, { x: -75, z: 240 },
      { x: -65, z: 300 }, { x: -75, z: 360 }, { x: -65, z: 420 },
      { x: -75, z: 60 },  { x: -65, z: 0 },   { x: -75, z: -60 },
      { x: -65, z: -120 },{ x: -75, z: -180 },{ x: -65, z: -240 },
      { x: -75, z: -300 },{ x: -65, z: -360 },{ x: -75, z: -420 },
      // Edachira Junction Groves
      { x: 340, z: -480 }, { x: 370, z: -510 }, { x: 400, z: -470 },
      { x: 420, z: -530 }, { x: 310, z: -550 }, { x: 350, z: -600 },
      // Infopark Expressway Median
      { x: -20, z: 20 },  { x: 80, z: -80 },  { x: 180, z: -180 },
      { x: 280, z: -280 },{ x: 450, z: -450 },{ x: 600, z: -500 },
      // Kadamprayar Riverbank Coconut Line
      { x: 860, z: -400 }, { x: 870, z: -480 }, { x: 880, z: -560 },
      { x: 890, z: -640 }, { x: 860, z: -720 }, { x: 880, z: -320 },
      { x: 870, z: -240 }, { x: 890, z: -160 }
    ];

    spapSpots.forEach((spot, idx) => {
      const palm = this.createCoconutPalm(13 + (idx % 4) * 1.5, 1.5 + (idx % 3) * 0.4);
      palm.position.set(spot.x, 0, spot.z);
      this.scene.add(palm);
      this.trees.push(palm);
    });

    // Banana Plants around Thattukadas & Riverbanks
    const bananaSpots = [
      { x: 380, z: -505 }, { x: 385, z: -515 },
      { x: -60, z: 140 },  { x: -80, z: 210 },
      { x: 850, z: -510 }, { x: 855, z: -470 }
    ];

    bananaSpots.forEach((spot) => {
      const banana = this.createBananaPlant();
      banana.position.set(spot.x, 0, spot.z);
      this.scene.add(banana);
      this.trees.push(banana);
    });
  }
}

window.FoliageManager = FoliageManager;
