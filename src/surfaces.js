/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN: SURFACE TEXTURING & ROAD MATERIALS ENGINE (Subagent δ)
 * Generates high-fidelity procedural diffuse and bump maps for:
 * 1. Gritty asphalt roads with tyre rubber skids and aggregate stone noise
 * 2. Authentic Kerala yellow & black hazard striped curbs
 * 3. Weathered pedestrian crosswalk markings
 * 4. Paved concrete sidewalk slabs
 */

class SurfaceManager {
  constructor() {
    this.asphaltTexture = this.generateAsphaltTexture();
    this.asphaltBumpMap = this.generateAsphaltBumpMap();
    this.curbTexture = this.generateKeralaCurbTexture();
    this.sidewalkTexture = this.generateSidewalkTexture();

    // Reusable Materials Palette
    this.asphaltMaterial = new THREE.MeshStandardMaterial({
      map: this.asphaltTexture,
      bumpMap: this.asphaltBumpMap,
      bumpScale: 0.04,
      roughness: 0.45, // Wet road sheen reflecting sunset
      metalness: 0.25,
      envMapIntensity: 1.4
    });

    this.curbMaterial = new THREE.MeshStandardMaterial({
      map: this.curbTexture,
      roughness: 0.65,
      metalness: 0.1
    });

    this.sidewalkMaterial = new THREE.MeshStandardMaterial({
      map: this.sidewalkTexture,
      roughness: 0.75,
      metalness: 0.1
    });

    this.medianGrassMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f3d26,
      roughness: 0.85,
      metalness: 0.05
    });
  }

  // --- 1. PROCEDURAL 512x512 ASPHALT DIFFUSE TEXTURE ---
  generateAsphaltTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    // Dark charcoal asphalt tarmac base
    ctx.fillStyle = "#181a20";
    ctx.fillRect(0, 0, 512, 512);

    // Aggregate Stone Flecks
    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const gray = 30 + Math.floor(Math.random() * 45);
      ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // Subtle Tyre Skid Stains (Dark streaks along traffic lines)
    ctx.fillStyle = "rgba(10, 10, 14, 0.25)";
    for (let s = 0; s < 8; s++) {
      const sx = Math.random() * 400 + 50;
      ctx.fillRect(sx, 0, 16, 512);
    }

    // Damp Sunset Specular Puddle Patches
    ctx.fillStyle = "rgba(22, 28, 38, 0.4)";
    for (let p = 0; p < 4; p++) {
      const px = Math.random() * 400 + 50;
      const py = Math.random() * 400 + 50;
      ctx.beginPath();
      ctx.ellipse(px, py, 40, 70, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 16);
    return texture;
  }

  // --- 2. PROCEDURAL ASPHALT BUMP / NORMAL MAP ---
  generateAsphaltBumpMap() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const val = Math.random() > 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${val}, ${val}, ${val}, 0.25)`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 16);
    return texture;
  }

  // --- 3. KERALA PWD YELLOW & BLACK HAZARD STRIPED CURBS ---
  generateKeralaCurbTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");

    // Alternating Yellow & Black 45-degree diagonal hazard stripes
    const stripeWidth = 32;
    for (let x = -64; x < 320; x += stripeWidth * 2) {
      // Yellow Stripe
      ctx.fillStyle = "#ffb703";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeWidth, 0);
      ctx.lineTo(x + stripeWidth + 64, 64);
      ctx.lineTo(x + 64, 64);
      ctx.closePath();
      ctx.fill();

      // Black Stripe
      ctx.fillStyle = "#141414";
      ctx.beginPath();
      ctx.moveTo(x + stripeWidth, 0);
      ctx.lineTo(x + stripeWidth * 2, 0);
      ctx.lineTo(x + stripeWidth * 2 + 64, 64);
      ctx.lineTo(x + stripeWidth + 64, 64);
      ctx.closePath();
      ctx.fill();
    }

    // Concrete Grime & Edge Chamfer
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(0, 58, 256, 6);
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(0, 0, 256, 4);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 1);
    return texture;
  }

  // --- 4. CONCRETE SIDEWALK SLAB TEXTURE ---
  generateSidewalkTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    // Sandstone / Concrete Base
    ctx.fillStyle = "#a8b2bc";
    ctx.fillRect(0, 0, 256, 256);

    // Slab Grid Seams (64x64 pavers)
    ctx.strokeStyle = "#5a626a";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }

    // Paver Surface Noise
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 20);
    return texture;
  }
}

window.SurfaceManager = SurfaceManager;
