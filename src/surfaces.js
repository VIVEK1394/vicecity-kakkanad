/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN: PROCEDURAL PBR SURFACES
 * Everything is generated at load time on canvases (no image assets):
 * 1. Asphalt: albedo + normal + roughness with monsoon puddles (near-mirror patches)
 * 2. Road paint, interlock paver sidewalks, Kerala yellow/black hazard curbs
 * 3. Grass & laterite soil ground, animated river water
 * 4. Building facades: albedo, roughness/metalness and night-time lit-window maps
 * 5. Soft light-pool sprite for street lamps and headlights
 * Colours are authored in sRGB; GFX.prepareScene converts them to linear.
 */

class SurfaceManager {
  constructor() {
    this.textures = {};
    this.buildAsphalt();
    this.buildPavers();
    this.buildGround();
    this.buildWater();

    this.curbTexture = this.generateKeralaCurbTexture();
    this.lightPoolTexture = this.generateLightPoolTexture();

    // Roads: one material per road so overlapping junction asphalt resolves with a
    // stable polygon offset instead of z-fighting (see asphaltFor()).
    this.asphaltMaterials = [];
    this.asphaltMaterial = this.asphaltFor(0);

    this.markingWhite = new THREE.MeshStandardMaterial({
      color: 0xdedcd2,
      roughness: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -40,
    });
    this.markingYellow = this.markingWhite.clone();
    this.markingYellow.color.set(0xd9a326);

    this.sidewalkMaterial = new THREE.MeshStandardMaterial({
      map: this.textures.paverAlbedo,
      normalMap: this.textures.paverNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 4,
    });

    this.curbMaterial = new THREE.MeshStandardMaterial({
      map: this.curbTexture,
      roughness: 0.62,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    });

    this.medianGrassMaterial = new THREE.MeshStandardMaterial({
      map: this.textures.groundAlbedo,
      color: 0xb8c8a8,
      roughness: 0.92,
    });
    this.medianSideMaterial = new THREE.MeshStandardMaterial({ map: this.curbTexture, roughness: 0.62 });

    this.groundMaterial = new THREE.MeshStandardMaterial({
      map: this.textures.groundAlbedo,
      roughness: 0.95,
      vertexColors: true,
    });

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b3d44,
      roughness: 0.06,
      metalness: 0.0,
      normalMap: this.textures.waterNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
    });

    this.roofMaterial = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 0.92 });
    this.concreteMaterial = new THREE.MeshStandardMaterial({ color: 0xb9b5aa, roughness: 0.86 });
    this.steelMaterial = new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.45, metalness: 1.0 });
  }

  asphaltFor(roadIndex) {
    if (!this.asphaltMaterials[roadIndex]) {
      this.asphaltMaterials[roadIndex] = new THREE.MeshStandardMaterial({
        map: this.textures.asphaltAlbedo,
        normalMap: this.textures.asphaltNormal,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughnessMap: this.textures.asphaltRough,
        roughness: 1.0,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4 * (roadIndex + 1),
      });
      this.asphaltMaterials[roadIndex].userData.wetSurface = true;
    }
    return this.asphaltMaterials[roadIndex];
  }

  // --- 1. ASPHALT (8 m tile): aggregate grain, wear mottling, puddles ---------------
  buildAsphalt() {
    const size = 512;
    const rng = GFX.rng(1987);
    const albedo = GFX.makeCanvas(size);
    const rough = GFX.makeCanvas(size);
    const aImg = albedo.getContext("2d").createImageData(size, size);
    const rImg = rough.getContext("2d").createImageData(size, size);
    const grain = new Float32Array(size * size);
    for (let i = 0; i < grain.length; i++) grain[i] = rng();
    const height = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        // 3x3 blurred grain = aggregate relief without per-texel sparkle
        let g = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) g += grain[((y + oy + size) % size) * size + ((x + ox + size) % size)];
        }
        g /= 9;
        const mottle = GFX.fbm(x, y, size, 4, 3, 23);
        const puddleNoise = GFX.fbm(x, y, size, 5, 3, 37);
        const puddle = Math.min(1, Math.max(0, (puddleNoise - 0.66) / 0.05));
        const speck = grain[i] > 0.965 ? 0.1 : 0;

        let v = 0.31 + 0.1 * (mottle - 0.5) + 0.06 * (grain[i] - 0.5) + speck;
        v *= 1 - 0.32 * puddle; // wet asphalt is darker
        aImg.data[i * 4] = v * 247;
        aImg.data[i * 4 + 1] = v * 250;
        aImg.data[i * 4 + 2] = v * 255;
        aImg.data[i * 4 + 3] = 255;

        height[i] = (1 - puddle) * (g + speck * 2);
        const r = (0.74 + 0.16 * (g - 0.5) * 2) * (1 - puddle) + 0.07 * puddle;
        rImg.data[i * 4 + 1] = Math.max(0, Math.min(1, r)) * 255;
        rImg.data[i * 4 + 3] = 255;
      }
    }
    albedo.getContext("2d").putImageData(aImg, 0, 0);
    rough.getContext("2d").putImageData(rImg, 0, 0);

    this.textures.asphaltAlbedo = GFX.texture(albedo, { repeat: [1, 1] });
    this.textures.asphaltRough = GFX.texture(rough, { repeat: [1, 1] });
    this.textures.asphaltNormal = GFX.texture(GFX.normalMapFromHeight(height, size, 3.0), { repeat: [1, 1] });
  }

  // --- 2. INTERLOCK PAVER SIDEWALK (4 m tile) -----------------------------------
  buildPavers() {
    const size = 512;
    const rng = GFX.rng(4242);
    const canvas = GFX.makeCanvas(size);
    const ctx = canvas.getContext("2d");
    const height = new Float32Array(size * size);
    ctx.fillStyle = "#5c5750";
    ctx.fillRect(0, 0, size, size);

    const rows = 20; // 0.2 m bricks on a 4 m tile
    const bh = size / rows;
    const bw = bh * 2;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (bw / 2);
      for (let c = -1; c <= size / bw; c++) {
        const x0 = c * bw + offset;
        const tone = 0.82 + rng() * 0.3;
        const red = rng() < 0.28;
        const base = red ? [150, 96, 80] : [170, 166, 158];
        ctx.fillStyle = `rgb(${(base[0] * tone) | 0},${(base[1] * tone) | 0},${(base[2] * tone) | 0})`;
        ctx.fillRect(x0 + 2, r * bh + 2, bw - 4, bh - 4);
        for (let y = r * bh + 2; y < (r + 1) * bh - 2; y++) {
          for (let x = Math.max(0, x0 + 2); x < Math.min(size, x0 + bw - 2); x++) height[y * size + x] = 1;
        }
      }
    }
    // grime
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = rng() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)";
      ctx.fillRect(rng() * size, rng() * size, 2 + rng() * 3, 2 + rng() * 3);
    }
    this.textures.paverAlbedo = GFX.texture(canvas, { repeat: [1, 1] });
    this.textures.paverNormal = GFX.texture(GFX.normalMapFromHeight(height, size, 1.2), { repeat: [1, 1] });
  }

  // --- 3. GRASS & LATERITE SOIL (16 m tile) ---------------------------------------
  buildGround() {
    const size = 512;
    const canvas = GFX.makeCanvas(size);
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    const rng = GFX.rng(77);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const n = GFX.fbm(x, y, size, 16, 3, 5);
        const s = GFX.fbm(x, y, size, 3, 3, 9);
        const soil = Math.min(1, Math.max(0, (s - 0.56) / 0.12));
        const blade = 0.85 + rng() * 0.3;
        const gr = [0.31 * blade, 0.42 * blade, 0.17 * blade];
        const so = [0.47, 0.29, 0.19];
        const k = 0.75 + 0.5 * n;
        img.data[i] = (gr[0] + (so[0] - gr[0]) * soil) * k * 255;
        img.data[i + 1] = (gr[1] + (so[1] - gr[1]) * soil) * k * 255;
        img.data[i + 2] = (gr[2] + (so[2] - gr[2]) * soil) * k * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.textures.groundAlbedo = GFX.texture(canvas, { repeat: [1, 1] });
  }

  // --- 4. RIVER WATER RIPPLES --------------------------------------------------------
  buildWater() {
    const size = 256;
    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) height[y * size + x] = GFX.fbm(x, y, size, 6, 4, 91);
    }
    this.textures.waterNormal = GFX.texture(GFX.normalMapFromHeight(height, size, 6.0), { repeat: [1, 1] }); // 10 m tile via world UVs
  }

  updateWater(delta) {
    const t = this.textures.waterNormal;
    t.offset.x = (t.offset.x + delta * 0.012) % 1;
    t.offset.y = (t.offset.y + delta * 0.007) % 1;
  }

  // --- 5. KERALA PWD YELLOW & BLACK HAZARD STRIPES (1.2 m period) ------------------
  generateKeralaCurbTexture() {
    const canvas = GFX.makeCanvas(256, 64);
    const ctx = canvas.getContext("2d");
    const stripeWidth = 32;
    for (let x = -64; x < 320; x += stripeWidth * 2) {
      ctx.fillStyle = "#e0a414";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeWidth, 0);
      ctx.lineTo(x + stripeWidth + 64, 64);
      ctx.lineTo(x + 64, 64);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#1c1c1c";
      ctx.beginPath();
      ctx.moveTo(x + stripeWidth, 0);
      ctx.lineTo(x + stripeWidth * 2, 0);
      ctx.lineTo(x + stripeWidth * 2 + 64, 64);
      ctx.lineTo(x + stripeWidth + 64, 64);
      ctx.closePath();
      ctx.fill();
    }
    // weathering
    const rng = GFX.rng(12);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(90,80,60,${0.05 + rng() * 0.12})`;
      ctx.fillRect(rng() * 256, rng() * 64, 1 + rng() * 4, 1 + rng() * 3);
    }
    return GFX.texture(canvas, { repeat: [1, 1] });
  }

  // --- 6. LIGHT POOL SPRITE ----------------------------------------------------------
  generateLightPoolTexture() {
    const canvas = GFX.makeCanvas(128);
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(0.7, "rgba(255,255,255,0.14)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = GFX.texture(canvas);
    tex.anisotropy = 1;
    return tex;
  }

  // --- 7. BUILDING FACADES -------------------------------------------------------------
  // Texture tile = `cols` window bays x 4 floors. Returns a MeshStandardMaterial whose
  // roughness (G) / metalness (B) come from one map and whose lit windows glow at night.
  createFacadeMaterial(opts) {
    const o = Object.assign(
      {
        wall: "#c9c2b4",
        glass: "#27343d",
        frame: "#d8d8d2",
        cols: 4,
        style: "plaster", // "plaster" | "curtain"
        seed: 1,
        lit: 0.4,
        wallRough: 0.86,
        glassRough: 0.08,
        glassMetal: 0.3,
      },
      opts
    );
    const size = 512;
    const rng = GFX.rng(o.seed * 7919);
    const albedo = GFX.makeCanvas(size);
    const rm = GFX.makeCanvas(size);
    const em = GFX.makeCanvas(size);
    const a = albedo.getContext("2d");
    const r = rm.getContext("2d");
    const e = em.getContext("2d");
    const floors = 4;
    const fh = size / floors;
    const cw = size / o.cols;
    const rmColor = (rough, metal) => `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`;

    a.fillStyle = o.wall;
    a.fillRect(0, 0, size, size);
    r.fillStyle = rmColor(o.wallRough, 0);
    r.fillRect(0, 0, size, size);
    e.fillStyle = "#000";
    e.fillRect(0, 0, size, size);

    // plaster grime + monsoon rain streaks
    for (let i = 0; i < 900; i++) {
      a.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.05})`;
      a.fillRect(rng() * size, rng() * size, 1 + rng() * 3, 1 + rng() * 3);
    }

    const curtain = o.style === "curtain";
    for (let f = 0; f < floors; f++) {
      const y0 = f * fh;
      // floor slab band
      a.fillStyle = curtain ? "rgba(20,24,28,0.9)" : "rgba(0,0,0,0.12)";
      a.fillRect(0, y0 + fh - (curtain ? 14 : 6), size, curtain ? 14 : 6);
      if (curtain) {
        r.fillStyle = rmColor(0.5, 0.2);
        r.fillRect(0, y0 + fh - 14, size, 14);
      }
      const litFloor = rng() < o.lit;
      for (let c = 0; c < o.cols; c++) {
        const ww = curtain ? cw - 6 : cw * 0.52;
        const wh = curtain ? fh - 20 : fh * 0.5;
        const x = c * cw + (cw - ww) / 2;
        const y = y0 + (curtain ? 3 : fh * 0.2);
        // frame
        a.fillStyle = o.frame;
        a.fillRect(x - 3, y - 3, ww + 6, wh + 6);
        r.fillStyle = rmColor(0.45, curtain ? 0.9 : 0.5);
        r.fillRect(x - 3, y - 3, ww + 6, wh + 6);
        // glass
        a.fillStyle = o.glass;
        a.fillRect(x, y, ww, wh);
        r.fillStyle = rmColor(o.glassRough, o.glassMetal);
        r.fillRect(x, y, ww, wh);
        if (!curtain) {
          a.fillStyle = "rgba(0,0,0,0.18)"; // rain streak under the sill
          a.fillRect(x + ww * 0.2, y + wh + 3, ww * 0.6, fh * 0.22);
        }
        // night lighting
        const lit = curtain ? litFloor && rng() < 0.85 : rng() < o.lit;
        if (lit) {
          const warm = rng() < 0.7;
          const k = 0.55 + rng() * 0.45;
          e.fillStyle = warm
            ? `rgb(${255 * k | 0},${205 * k | 0},${140 * k | 0})`
            : `rgb(${215 * k | 0},${228 * k | 0},${255 * k | 0})`;
          e.fillRect(x, y, ww, wh);
        }
      }
    }

    const rmTexture = GFX.texture(rm);
    const mat = new THREE.MeshStandardMaterial({
      map: GFX.texture(albedo),
      roughnessMap: rmTexture,
      metalnessMap: rmTexture,
      roughness: 1,
      metalness: 1,
      emissiveMap: GFX.texture(em),
      emissive: 0xffffff,
      emissiveIntensity: 0,
    });
    [mat.map, mat.roughnessMap, mat.emissiveMap].forEach((t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    });
    mat.userData.glow = { day: 0, night: 1.35 };
    return mat;
  }

  // Box with world-unit UVs so a facade tile (tileW x tileH metres) keeps window size
  // on every face. Groups: 0 +x, 1 -x, 2 top, 3 bottom, 4 +z, 5 -z.
  box(w, h, d, tileW, tileH) {
    const g = new THREE.BoxGeometry(w, h, d);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i) + h / 2;
      const z = pos.getZ(i);
      const nx = nor.getX(i);
      const ny = nor.getY(i);
      const nz = nor.getZ(i);
      if (Math.abs(ny) > 0.5) uv.setXY(i, x / tileW, z / tileW);
      else if (Math.abs(nx) > 0.5) uv.setXY(i, (nx > 0 ? -z : z) / tileW + 0.5, y / tileH);
      else uv.setXY(i, (nz > 0 ? x : -x) / tileW + 0.5, y / tileH);
    }
    return g;
  }
}

window.SurfaceManager = SurfaceManager;
