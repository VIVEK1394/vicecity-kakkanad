/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 1: 3D VEHICLE & CHARACTER MODELS (VICE CITY GRAPHICS UPGRADE)
 * Features rich neon details, Tommy Vercetti character with punch animations, and driver seat integration.
 */

class VehicleModelFactory {
  constructor() {
    // Physically based palette (colours authored in sRGB, linearised by GFX.prepareScene).
    this.paintMaterials = [];
    this.tireMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.92 });
    this.rimMaterial = new THREE.MeshStandardMaterial({ color: 0xc3c7cd, metalness: 1.0, roughness: 0.32 });
    this.glassMaterial = new THREE.MeshStandardMaterial({ color: 0x0f1a20, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.62 });
    this.chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 1.0, roughness: 0.12 });
    this.trimMaterial = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.7 });
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

  // --- 1. KAKKANAD AUTO RICKSHAW (3-Wheeler) ---
  createAutoRickshawMesh() {
    const group = new THREE.Group();
    group.name = "autoRickshaw";

    // Lower Green Body
    const lowerGeo = new THREE.BoxGeometry(1.4, 0.6, 2.6);
    const lowerBody = new THREE.Mesh(lowerGeo, this.autoGreenMat);
    lowerBody.position.y = 0.5;
    lowerBody.castShadow = true;
    group.add(lowerBody);

    // Front Nose Taper
    const noseGeo = new THREE.CylinderGeometry(0.35, 0.7, 0.8, 8);
    noseGeo.rotateX(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, this.autoGreenMat);
    nose.position.set(0, 0.5, 1.4);
    group.add(nose);

    // Upper Yellow Canopy / Hood
    const roofGeo = new THREE.BoxGeometry(1.35, 0.7, 2.2);
    const roof = new THREE.Mesh(roofGeo, this.autoYellowMat);
    roof.position.set(0, 1.25, -0.1);
    roof.castShadow = true;
    group.add(roof);

    // Front Windshield
    const windGeo = new THREE.BoxGeometry(1.2, 0.55, 0.08);
    const windshield = new THREE.Mesh(windGeo, this.glassMaterial);
    windshield.position.set(0, 1.15, 1.05);
    group.add(windshield);

    // Front Headlight (Single center round lamp)
    const hlGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12);
    hlGeo.rotateX(Math.PI / 2);
    const headlight = new THREE.Mesh(hlGeo, this.headlightMaterial);
    headlight.position.set(0, 0.55, 1.82);
    group.add(headlight);

    // Taillights
    const tlGeo = new THREE.BoxGeometry(1.1, 0.08, 0.06);
    const taillight = new THREE.Mesh(tlGeo, this.taillightMaterial);
    taillight.position.set(0, 0.55, -1.32);
    group.add(taillight);

    // Driver Seat & Passenger Bench
    const seatGeo = new THREE.BoxGeometry(1.1, 0.25, 0.5);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x2b2d36, roughness: 0.85 });
    const rearSeat = new THREE.Mesh(seatGeo, seatMat);
    rearSeat.position.set(0, 0.7, -0.65);
    group.add(rearSeat);

    // Driver Avatar (visible when driving!)
    const driverAvatar = this.createDriverAvatar();
    driverAvatar.position.set(0, 0.75, 0.35);
    driverAvatar.visible = false;
    group.add(driverAvatar);

    // Floating 3D "[F] ENTER" Prompt Badge
    const badge = this.createInteractionBadge("ENTER [F]");
    badge.position.set(0, 2.3, 0);
    group.add(badge);

    // 3 Wheels (1 Front Center, 2 Rear)
    const wheels = [];
    const frontWheel = this.createWheel(0.28, 0.2);
    frontWheel.position.set(0, 0.28, 1.25);
    group.add(frontWheel);
    wheels.push(frontWheel);

    const rearLeft = this.createWheel(0.3, 0.22);
    rearLeft.position.set(-0.68, 0.3, -0.85);
    group.add(rearLeft);
    wheels.push(rearLeft);

    const rearRight = this.createWheel(0.3, 0.22);
    rearRight.position.set(0.68, 0.3, -0.85);
    group.add(rearRight);
    wheels.push(rearRight);

    group.userData = {
      type: "AUTO_RICKSHAW",
      wheels: wheels,
      driverAvatar: driverAvatar,
      badge: badge,
      collider: { width: 1.5, length: 2.8, height: 1.8 }
    };

    return group;
  }

  // --- 2. KERALA PRIVATE BUS ("MINNAL" / "KOMBAN") ---
  createKeralaBusMesh() {
    const group = new THREE.Group();
    group.name = "keralaBus";

    // Main Red Chassis Body
    const bodyGeo = new THREE.BoxGeometry(2.8, 2.4, 11.2);
    const busBody = new THREE.Mesh(bodyGeo, this.busRedMat);
    busBody.position.y = 1.6;
    busBody.castShadow = true;
    group.add(busBody);

    // Yellow Side Racing Stripes & Livery
    const stripeGeo = new THREE.BoxGeometry(2.84, 0.5, 11.0);
    const stripe = new THREE.Mesh(stripeGeo, this.busYellowMat);
    stripe.position.y = 1.5;
    group.add(stripe);

    // Roof Luggage Carrier & Air Conditioning Unit
    const carrierGeo = new THREE.BoxGeometry(2.2, 0.35, 7.5);
    const carrier = new THREE.Mesh(carrierGeo, this.chromeMaterial);
    carrier.position.set(0, 2.95, -0.5);
    group.add(carrier);

    // Large Front Windshield (Two-piece Kerala bus style)
    const windGeo = new THREE.BoxGeometry(2.5, 1.1, 0.1);
    const windshield = new THREE.Mesh(windGeo, this.glassMaterial);
    windshield.position.set(0, 1.9, 5.62);
    group.add(windshield);

    // "MINNAL" Destination Board Box on Top
    const signGeo = new THREE.BoxGeometry(1.8, 0.4, 0.2);
    const signMat = new THREE.MeshBasicMaterial({ color: 0x35d6ea });
    signMat.userData.glow = { day: 1.0, night: 3.0 };
    const signBox = new THREE.Mesh(signGeo, signMat);
    signBox.position.set(0, 2.65, 5.6);
    group.add(signBox);

    // Dual Headlights & Air Horn Grille
    const hlGeo = new THREE.BoxGeometry(0.5, 0.2, 0.1);
    const hlL = new THREE.Mesh(hlGeo, this.headlightMaterial);
    hlL.position.set(-0.9, 0.8, 5.62);
    const hlR = hlL.clone();
    hlR.position.x = 0.9;
    group.add(hlL);
    group.add(hlR);

    // Floating 3D Badge
    const badge = this.createInteractionBadge("HIJACK BUS [F]");
    badge.position.set(0, 3.8, 0);
    group.add(badge);

    // Wheels (6 wheels: 2 front, 4 rear double axle)
    const wheels = [];
    const wheelPositions = [
      { x: -1.35, y: 0.55, z: 3.8 },
      { x: 1.35, y: 0.55, z: 3.8 },
      { x: -1.35, y: 0.55, z: -3.2 },
      { x: 1.35, y: 0.55, z: -3.2 },
      { x: -1.35, y: 0.55, z: -4.6 },
      { x: 1.35, y: 0.55, z: -4.6 }
    ];

    wheelPositions.forEach((pos) => {
      const wheel = this.createWheel(0.55, 0.35);
      wheel.position.set(pos.x, pos.y, pos.z);
      group.add(wheel);
      wheels.push(wheel);
    });

    group.userData = {
      type: "KERALA_BUS",
      wheels: wheels,
      badge: badge,
      collider: { width: 3.0, length: 11.5, height: 3.4 }
    };

    return group;
  }

  // --- 3. KERALA POLICE MAHINDRA JEEP ---
  createPoliceJeepMesh() {
    const group = new THREE.Group();
    group.name = "policeJeep";

    // White Off-Road Body
    const bodyGeo = new THREE.BoxGeometry(1.85, 0.8, 4.2);
    const body = new THREE.Mesh(bodyGeo, this.policeWhiteMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);

    // Blue Kerala Police Door Decal Stripe
    const stripeGeo = new THREE.BoxGeometry(1.88, 0.22, 2.6);
    const stripe = new THREE.Mesh(stripeGeo, this.policeBlueStripe);
    stripe.position.set(0, 0.85, -0.2);
    group.add(stripe);

    // Open Cabin Roll Cage & Canopy Frame
    const cageGeo = new THREE.BoxGeometry(1.7, 0.9, 2.2);
    const cageMat = this.trimMaterial;
    const cage = new THREE.Mesh(cageGeo, cageMat);
    cage.position.set(0, 1.6, -0.5);
    group.add(cage);

    // Upright Windshield
    const windGeo = new THREE.BoxGeometry(1.65, 0.65, 0.08);
    const windshield = new THREE.Mesh(windGeo, this.glassMaterial);
    windshield.position.set(0, 1.5, 0.65);
    group.add(windshield);

    // Roof Siren Light Bar
    const strobeBarGeo = new THREE.BoxGeometry(1.2, 0.12, 0.25);
    const strobeBar = new THREE.Mesh(strobeBarGeo, this.chromeMaterial);
    strobeBar.position.set(0, 2.12, 0.6);

    const redStrobe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.2), this.strobeRedMat);
    redStrobe.position.set(-0.35, 2.2, 0.6);
    const blueStrobe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.2), this.strobeBlueMat);
    blueStrobe.position.set(0.35, 2.2, 0.6);

    group.add(strobeBar);
    group.add(redStrobe);
    group.add(blueStrobe);

    // Rear Mounted Spare Tire
    const spare = this.createWheel(0.42, 0.28);
    spare.position.set(0, 0.9, -2.25);
    spare.rotation.y = Math.PI / 2;
    group.add(spare);

    // Floating 3D Badge
    const badge = this.createInteractionBadge("STEAL POLICE JEEP [F]");
    badge.position.set(0, 2.8, 0);
    group.add(badge);

    // 4 Wheels
    const wheels = [];
    [
      { x: -0.98, y: 0.45, z: 1.3 },
      { x: 0.98, y: 0.45, z: 1.3 },
      { x: -0.98, y: 0.45, z: -1.3 },
      { x: 0.98, y: 0.45, z: -1.3 }
    ].forEach((pos) => {
      const wheel = this.createWheel(0.45, 0.3);
      wheel.position.set(pos.x, pos.y, pos.z);
      group.add(wheel);
      wheels.push(wheel);
    });

    group.userData = {
      type: "POLICE_JEEP",
      wheels: wheels,
      strobeRed: redStrobe,
      strobeBlue: blueStrobe,
      badge: badge,
      collider: { width: 2.0, length: 4.4, height: 2.0 }
    };

    return group;
  }

  // --- 4. CLASSIC AMBASSADOR CAR (White Taxi / Official Car) ---
  createAmbassadorMesh() {
    const group = new THREE.Group();
    group.name = "ambassador";

    const bodyGeo = new THREE.BoxGeometry(1.8, 0.65, 4.4);
    const body = new THREE.Mesh(bodyGeo, this.ambassadorWhite);
    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);

    const cabinGeo = new THREE.BoxGeometry(1.5, 0.6, 2.4);
    const cabin = new THREE.Mesh(cabinGeo, this.glassMaterial);
    cabin.position.set(0, 1.2, -0.2);
    group.add(cabin);

    const grilleGeo = new THREE.BoxGeometry(1.4, 0.4, 0.15);
    const grille = new THREE.Mesh(grilleGeo, this.chromeMaterial);
    grille.position.set(0, 0.6, 2.22);
    group.add(grille);

    const badge = this.createInteractionBadge("ENTER CAR [F]");
    badge.position.set(0, 2.2, 0);
    group.add(badge);

    const wheels = [];
    [
      { x: -0.95, y: 0.35, z: 1.3 },
      { x: 0.95, y: 0.35, z: 1.3 },
      { x: -0.95, y: 0.35, z: -1.3 },
      { x: 0.95, y: 0.35, z: -1.3 }
    ].forEach((pos) => {
      const wheel = this.createWheel(0.36, 0.25);
      wheel.position.set(pos.x, pos.y, pos.z);
      group.add(wheel);
      wheels.push(wheel);
    });

    group.userData = {
      type: "AMBASSADOR",
      wheels: wheels,
      badge: badge,
      collider: { width: 1.9, length: 4.5, height: 1.6 }
    };

    return group;
  }

  // --- 5. ROYAL ENFIELD SUPERBIKE (Bullet 350) ---
  createSuperbikeMesh() {
    const group = new THREE.Group();
    group.name = "superbike";

    const tankMat = this.paint(0x151515, 0.35);

    const tankGeo = new THREE.BoxGeometry(0.5, 0.35, 0.9);
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(0, 0.85, 0.2);
    group.add(tank);

    const engGeo = new THREE.BoxGeometry(0.4, 0.45, 0.5);
    const engine = new THREE.Mesh(engGeo, this.chromeMaterial);
    engine.position.set(0, 0.5, 0.0);
    group.add(engine);

    const badge = this.createInteractionBadge("RIDE BIKE [F]");
    badge.position.set(0, 1.8, 0);
    group.add(badge);

    const wheels = [];
    const fWheel = this.createWheel(0.35, 0.12);
    fWheel.position.set(0, 0.35, 0.95);
    group.add(fWheel);
    wheels.push(fWheel);

    const rWheel = this.createWheel(0.35, 0.14);
    rWheel.position.set(0, 0.35, -0.85);
    group.add(rWheel);
    wheels.push(rWheel);

    group.userData = {
      type: "SUPERBIKE",
      wheels: wheels,
      badge: badge,
      collider: { width: 0.9, length: 2.2, height: 1.3 }
    };

    return group;
  }

  // --- 6. VICE CITY SPORTS CAR (Infernus / Cheetah) ---
  createSportsCarMesh(colorHex = 0xff007f) {
    const group = new THREE.Group();
    group.name = "sportsCar";

    const bodyMat = this.paint(colorHex, 0.45);

    const bodyGeo = new THREE.BoxGeometry(2.1, 0.45, 4.5);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.45;
    body.castShadow = true;
    group.add(body);

    const cabinGeo = new THREE.BoxGeometry(1.6, 0.4, 1.9);
    const cabin = new THREE.Mesh(cabinGeo, this.glassMaterial);
    cabin.position.set(0, 0.8, -0.2);
    group.add(cabin);

    const badge = this.createInteractionBadge("ENTER SUPERCAR [F]");
    badge.position.set(0, 2.0, 0);
    group.add(badge);

    const wheels = [];
    [
      { x: -1.05, y: 0.38, z: 1.35 },
      { x: 1.05, y: 0.38, z: 1.35 },
      { x: -1.05, y: 0.38, z: -1.35 },
      { x: 1.05, y: 0.38, z: -1.35 }
    ].forEach((pos) => {
      const wheel = this.createWheel(0.38, 0.3);
      wheel.position.set(pos.x, pos.y, pos.z);
      group.add(wheel);
      wheels.push(wheel);
    });

    group.userData = {
      type: "SPORTS_CAR",
      wheels: wheels,
      badge: badge,
      collider: { width: 2.2, length: 4.6, height: 1.2 }
    };

    return group;
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

  createPedestrianMesh(shirtHex, lowerHex, wearsLungi) {
    if (!this.pedMaterial) {
      this.pedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
      this.pedMaterial.userData.linear = true; // vertex colours are already linear
    }
    const mat = this.pedMaterial;
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

  // --- Driver Avatar for Cockpit ---
  createDriverAvatar() {
    const avatar = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x2aa8b8, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xb98356, roughness: 0.55 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.45, 0.25), shirtMat);
    torso.position.y = 0.3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), skinMat);
    head.position.y = 0.65;

    avatar.add(torso);
    avatar.add(head);
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

  createWheel(radius, width) {
    const wheelGroup = new THREE.Group();
    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 14);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, this.tireMaterial);
    tire.castShadow = true;

    const rimGeo = new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, width + 0.02, 10);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, this.rimMaterial);

    wheelGroup.add(tire);
    wheelGroup.add(rim);
    return wheelGroup;
  }

  updateWheelRotation(vehicleGroup, speed, delta) {
    if (!vehicleGroup.userData || !vehicleGroup.userData.wheels) return;
    const wheels = vehicleGroup.userData.wheels;
    const angVel = (speed / 0.35) * delta;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += angVel;
    }
  }
}

window.vehicleModelFactory = new VehicleModelFactory();
