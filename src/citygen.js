/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * CITY KIT: procedural Kerala building materials and geometry emitters.
 * - Materials: shopfronts (shutters / lit shop interiors), tintable plaster facades,
 *   Mangalore-tile and corrugated-sheet roofs, curtain-wall glass, shop-sign and
 *   place-name board atlases (all drawn on canvases at load; no image files).
 * - Emitters write straight into the StaticBatcher (box, hip/gable roof, cylinder,
 *   sign quad) so thousands of buildings cost no per-mesh overhead.
 * - Building types: shop-house, Kerala house (tiled or flat roof, compound wall),
 *   apartment block, IT office, industrial shed, campus block.
 * Shop names are invented; place names on boards are real Kakkanad names.
 */

const SHOP_NAMES = [
  ["SREE KRISHNA STORES", "GROCERY & VEGETABLES"],
  ["NEW INDIA BAKERY", "CAKES • PUFFS • TEA"],
  ["HOTEL RAHMATH", "MEALS READY"],
  ["ST. JOSEPH TEXTILES", "SAREES • SHIRTINGS"],
  ["ANUGRAHA MEDICALS", "24 HRS PHARMACY"],
  ["KERALA HARDWARES", "PAINTS • PIPES • TOOLS"],
  ["SAFA JUICE CORNER", "FRESH JUICE • SHAKES"],
  ["AMMA TEA STALL", "CHAYA • PAZHAMPORI"],
  ["PRIYA MOBILES", "SALES & SERVICE"],
  ["MALABAR BIRIYANI", "FAMILY RESTAURANT"],
  ["CITY OPTICALS", "EYE TESTING"],
  ["GREEN VALLEY MART", "SUPERMARKET"],
  ["JOSE AUTO SPARES", "AUTO • BIKE PARTS"],
  ["SREE DURGA JEWELLERY", "916 GOLD"],
  ["NIRMALA BOOK STALL", "BOOKS • STATIONERY"],
  ["MARIA FANCY", "BANGLES • GIFTS"],
  ["PARADISE BAKES", "BAKERY & COOL BAR"],
  ["ARABIAN GRILL", "SHAWAI • ALFAHAM"],
  ["BHARATH TAILORS", "LADIES & GENTS"],
  ["KAIRALI XEROX", "PHOTOSTAT • DTP"],
  ["VANITHA HOTEL", "BREAKFAST • LUNCH"],
  ["AL AMEEN STORES", "WHOLESALE & RETAIL"],
  ["STUDIO SHIVA", "PHOTOS • VIDEOS"],
  ["SAGAR FOOTWEAR", "CHAPPALS • SHOES"],
  ["LUCKY LOTTERY AGENCY", "KERALA LOTTERIES"],
  ["COCHIN ELECTRICALS", "WIRING • FANS"],
  ["TOPSTAR CABLE TV", "BROADBAND"],
  ["RAJ PAINTS", "COLOUR MIXING"],
  ["BEST BAKERY", "SINCE 1987"],
  ["HOTEL SAGARA", "VEG & NON-VEG"],
  ["FRESH FISH STALL", "DAILY CATCH"],
  ["AYURVEDA CLINIC", "PANCHAKARMA"],
  ["SMILE DENTAL CARE", "DR. ANJU"],
  ["SKYLINE TRAVELS", "AIR • BUS TICKETS"],
  ["MOBILE WORLD", "ACCESSORIES"],
  ["HOME APPLIANCES", "EMI AVAILABLE"],
  ["FRUIT STALL", "BANANA • MANGO"],
  ["TEA & SNACKS", "OPEN 6AM - 11PM"],
  ["CHICKEN CENTRE", "FRESH DAILY"],
  ["ANNAPOORNA VEG", "SOUTH INDIAN MEALS"],
  ["GOLD COVERING", "1 GRAM GOLD"],
  ["SREE BHADRA STORES", "PROVISIONS"],
  ["KAKKANAD MOTORS", "TWO WHEELER SERVICE"],
  ["DIGITAL WORLD", "LAPTOPS • PRINTERS"],
  ["CAFE CHAI POINT", "TEA • COFFEE • SNACKS"],
  ["FLOWER MART", "GARLANDS • BOUQUETS"],
  ["IDLI HOUSE", "TIFFIN CENTRE"],
  ["NEW STAR SALOON", "HAIR • BEAUTY"],
];

const SIGN_STYLES = [
  { bg: "#f5c400", fg: "#b3121c", sub: "#1b1b1b" },
  { bg: "#c8102e", fg: "#ffffff", sub: "#ffe08a" },
  { bg: "#1f4aa8", fg: "#ffffff", sub: "#ffd23f" },
  { bg: "#0f7b3f", fg: "#fff3b0", sub: "#ffffff" },
  { bg: "#f4f1e8", fg: "#1f3fa0", sub: "#c8102e" },
  { bg: "#17181c", fg: "#ffcf3f", sub: "#ffffff" },
  { bg: "#6d1b7b", fg: "#ffffff", sub: "#ffd6ff" },
  { bg: "#ff7a00", fg: "#ffffff", sub: "#1b1b1b" },
];

class CityKit {
  constructor(surfaceManager, batcher) {
    this.S = surfaceManager;
    this.batcher = batcher;
    this.writers = new Map();
    this.rng = GFX.rng(1994);
    this.buildMaterials();
  }

  // --- Materials ------------------------------------------------------------------------
  buildMaterials() {
    const S = this.S;
    const tintable = (mat) => {
      mat.vertexColors = true;
      return mat;
    };
    // Few real materials (draw calls = materials x map cells); variety comes from vertex
    // tints and from "aliases": a base material plus a fixed tint (roof, concrete...).
    const plaster = tintable(S.createFacadeMaterial({ wall: "#f3efe6", frame: "#e9e7e1", glass: "#28323a", cols: 3, seed: 3, lit: 0.45 }));
    const glass = tintable(S.createFacadeMaterial({ style: "curtain", cols: 8, wall: "#1f2a33", glass: "#2e4a5a", frame: "#9aa1a8", seed: 31, lit: 0.5, glassMetal: 0.6, glassRough: 0.05 }));
    const plain = tintable(this.createPlainMaterial());
    const alias = (base, hex) => ({ isAlias: true, base, tint: CityKit.tint(hex) });
    this.mat = {
      shopfront: this.createShopfrontMaterial(),
      plaster,
      house: plaster,
      flats: tintable(S.createFacadeMaterial({ wall: "#f3efe6", frame: "#e2ded5", glass: "#27313a", cols: 4, seed: 9, lit: 0.55 })),
      glassA: glass,
      glassB: alias(glass, "#c9d8f2"),
      glassC: alias(glass, "#cfe6d8"),
      plain,
      tile: tintable(this.createTileRoofMaterial()),
      sheet: tintable(this.createSheetMaterial()),
      roof: alias(plain, "#7d786d"),
      concrete: alias(plain, "#bdb8ac"),
      tank: alias(plain, "#1f2124"),
      dark: alias(plain, "#2c2e33"),
      steel: S.steelMaterial,
      lawn: new THREE.MeshStandardMaterial({ map: S.textures.groundAlbedo, color: 0x9fbf7a, roughness: 0.95 }),
      signs: this.createSignAtlas(),
      boards: this.createBoardAtlas(),
    };
    this.mat.signs.userData.glow = { day: 1.0, night: 1.7 };
    this.mat.boards.userData.glow = { day: 1.0, night: 1.15 };
  }

  canvasSet(w, h) {
    const a = GFX.makeCanvas(w, h);
    const r = GFX.makeCanvas(w, h);
    const e = GFX.makeCanvas(w, h);
    return { a, r, e, ac: a.getContext("2d"), rc: r.getContext("2d"), ec: e.getContext("2d") };
  }

  rm(rough, metal) {
    return `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
  }

  finishMaterial(set, extra) {
    const rmTex = GFX.texture(set.r);
    const mat = new THREE.MeshStandardMaterial(
      Object.assign(
        {
          map: GFX.texture(set.a),
          roughnessMap: rmTex,
          metalnessMap: rmTex,
          roughness: 1,
          metalness: 1,
        },
        extra || {}
      )
    );
    [mat.map, mat.roughnessMap, mat.emissiveMap].forEach((t) => {
      if (!t) return;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    });
    return mat;
  }

  // Ground-floor shop row: 4 bays of 3 m, 3.6 m tall (tile 12 x 3.6 m). Power-of-two
  // size so WebGL1 can repeat and mipmap it.
  createShopfrontMaterial() {
    const W = 512;
    const H = 128;
    const s = this.canvasSet(W, H);
    const rng = GFX.rng(4711);
    s.ac.fillStyle = "#d8d0c0";
    s.ac.fillRect(0, 0, W, H);
    s.rc.fillStyle = this.rm(0.85, 0);
    s.rc.fillRect(0, 0, W, H);
    s.ec.fillStyle = "#000";
    s.ec.fillRect(0, 0, W, H);
    const bay = W / 4;
    for (let b = 0; b < 4; b++) {
      const x0 = b * bay + 7;
      const x1 = (b + 1) * bay - 7;
      const top = 26;
      if (rng() < 0.55) {
        // rolling shutter
        const paint = rng() < 0.25 ? ["#3f6d8e", "#5d7f3b", "#8e3b33"][Math.floor(rng() * 3)] : "#8e9296";
        s.ac.fillStyle = paint;
        s.ac.fillRect(x0, top, x1 - x0, H - top);
        for (let y = top; y < H; y += 5) {
          s.ac.fillStyle = "rgba(0,0,0,0.22)";
          s.ac.fillRect(x0, y, x1 - x0, 1.5);
          s.ac.fillStyle = "rgba(255,255,255,0.12)";
          s.ac.fillRect(x0, y + 2, x1 - x0, 1);
        }
        s.ac.fillStyle = "rgba(60,40,20,0.35)";
        s.ac.fillRect(x0, H - 10, x1 - x0, 10);
        s.rc.fillStyle = this.rm(0.42, 0.75);
        s.rc.fillRect(x0, top, x1 - x0, H - top);
      } else {
        // open shop: dark interior, shelves, goods, warm light at night
        s.ac.fillStyle = "#2c2721";
        s.ac.fillRect(x0, top, x1 - x0, H - top);
        for (let y = top + 18; y < H - 30; y += 22) {
          s.ac.fillStyle = "#7a6245";
          s.ac.fillRect(x0 + 4, y, x1 - x0 - 8, 3);
          for (let x = x0 + 6; x < x1 - 10; x += 6 + rng() * 8) {
            s.ac.fillStyle = `hsl(${Math.floor(rng() * 360)},${50 + rng() * 40}%,${35 + rng() * 30}%)`;
            s.ac.fillRect(x, y - 4 - rng() * 10, 4 + rng() * 5, 4 + rng() * 10);
          }
        }
        // counter
        s.ac.fillStyle = "#6b5236";
        s.ac.fillRect(x0 + 6, H - 34, x1 - x0 - 12, 34);
        s.ac.fillStyle = "rgba(255,255,255,0.18)";
        s.ac.fillRect(x0 + 6, H - 34, x1 - x0 - 12, 3);
        const warm = rng() < 0.65;
        const k = 0.6 + rng() * 0.4;
        s.ec.fillStyle = warm ? `rgb(${(255 * k) | 0},${(214 * k) | 0},${(160 * k) | 0})` : `rgb(${(226 * k) | 0},${(238 * k) | 0},${(255 * k) | 0})`;
        s.ec.fillRect(x0, top, x1 - x0, H - top - 34);
        s.ec.fillStyle = `rgba(${(200 * k) | 0},${(170 * k) | 0},${(120 * k) | 0},1)`;
        s.ec.fillRect(x0 + 6, H - 34, x1 - x0 - 12, 34);
      }
      // pillar shading and lintel
      s.ac.fillStyle = "rgba(0,0,0,0.25)";
      s.ac.fillRect(x0 - 2, top, 2, H - top);
      s.ac.fillRect(x1, top, 2, H - top);
    }
    s.ac.fillStyle = "rgba(0,0,0,0.18)";
    s.ac.fillRect(0, 20, W, 6);
    for (let i = 0; i < 500; i++) {
      s.ac.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.05})`;
      s.ac.fillRect(rng() * W, rng() * H, 1 + rng() * 3, 1 + rng() * 3);
    }
    const mat = this.finishMaterial(s, { emissiveMap: GFX.texture(s.e), emissive: 0xffffff, emissiveIntensity: 0 });
    mat.userData.glow = { day: 0.05, night: 0.9 };
    return mat;
  }

  // Plain painted plaster, near white so vertex colour tints it (tile 4 m).
  createPlainMaterial() {
    const size = 256;
    const s = this.canvasSet(size, size);
    const rng = GFX.rng(99);
    const img = s.ac.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = GFX.fbm(x, y, size, 8, 3, 13);
        const streak = GFX.fbm(x, y * 0.25, size, 16, 2, 17);
        const v = 0.93 + 0.07 * (n - 0.5) - 0.05 * Math.max(0, streak - 0.6) * (y / size);
        const i = (y * size + x) * 4;
        img.data[i] = v * 250;
        img.data[i + 1] = v * 247;
        img.data[i + 2] = v * 240;
        img.data[i + 3] = 255;
      }
    }
    s.ac.putImageData(img, 0, 0);
    for (let i = 0; i < 400; i++) {
      s.ac.fillStyle = `rgba(40,40,30,${0.02 + rng() * 0.05})`;
      s.ac.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 2 + rng() * 6);
    }
    s.rc.fillStyle = this.rm(0.9, 0);
    s.rc.fillRect(0, 0, size, size);
    return this.finishMaterial(s);
  }

  // Mangalore-pattern clay tiles (tile 2 m), light so vertex colour picks the clay shade.
  createTileRoofMaterial() {
    const size = 256;
    const s = this.canvasSet(size, size);
    const rng = GFX.rng(321);
    const height = new Float32Array(size * size);
    const rows = 8;
    const cols = 8;
    const rh = size / rows;
    const cw = size / cols;
    const img = s.ac.createImageData(size, size);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tone = 0.8 + rng() * 0.35;
        const mossy = rng() < 0.12;
        const base = mossy ? [118, 108, 78] : [222, 132, 98];
        const x0 = c * cw + (r % 2) * (cw / 2);
        for (let y = 0; y < rh; y++) {
          // each tile course is lighter at its lower, overlapping lip
          const shade = 0.75 + 0.35 * (y / rh);
          for (let x = 0; x < cw; x++) {
            const px = Math.floor(x0 + x) % size;
            const py = r * rh + y;
            const edge = x < 2 || x > cw - 3 ? 0.7 : 1;
            const i = (py * size + px) * 4;
            const k = tone * shade * edge;
            height[py * size + px] = (y / rh) * edge;
            img.data[i] = Math.min(255, base[0] * k);
            img.data[i + 1] = Math.min(255, base[1] * k);
            img.data[i + 2] = Math.min(255, base[2] * k);
            img.data[i + 3] = 255;
          }
        }
      }
    }
    s.ac.putImageData(img, 0, 0);
    for (let i = 0; i < 300; i++) {
      s.ac.fillStyle = `rgba(20,15,10,${0.05 + rng() * 0.1})`;
      s.ac.fillRect(rng() * size, rng() * size, 2 + rng() * 5, 2 + rng() * 4);
    }
    s.rc.fillStyle = this.rm(0.78, 0);
    s.rc.fillRect(0, 0, size, size);
    const mat = this.finishMaterial(s, { normalMap: GFX.texture(GFX.normalMapFromHeight(height, size, 2.2)), normalScale: new THREE.Vector2(0.8, 0.8) });
    mat.normalMap.wrapS = THREE.RepeatWrapping;
    mat.normalMap.wrapT = THREE.RepeatWrapping;
    return mat;
  }

  // Corrugated metal sheet (tile 4 m), light grey so it can be tinted blue/red/rust.
  createSheetMaterial() {
    const size = 256;
    const s = this.canvasSet(size, size);
    const rng = GFX.rng(555);
    const height = new Float32Array(size * size);
    for (let x = 0; x < size; x++) {
      const rib = 0.5 + 0.5 * Math.sin((x / size) * Math.PI * 2 * 20);
      for (let y = 0; y < size; y++) height[y * size + x] = rib;
      s.ac.fillStyle = `rgb(${(200 + rib * 40) | 0},${(204 + rib * 40) | 0},${(208 + rib * 40) | 0})`;
      s.ac.fillRect(x, 0, 1, size);
    }
    for (let i = 0; i < 60; i++) {
      s.ac.fillStyle = `rgba(120,60,20,${0.05 + rng() * 0.12})`;
      s.ac.fillRect(rng() * size, rng() * size, 1 + rng() * 3, 10 + rng() * 60);
    }
    s.rc.fillStyle = this.rm(0.5, 0.55);
    s.rc.fillRect(0, 0, size, size);
    const mat = this.finishMaterial(s, { normalMap: GFX.texture(GFX.normalMapFromHeight(height, size, 3)), normalScale: new THREE.Vector2(0.7, 0.7) });
    mat.normalMap.wrapS = THREE.RepeatWrapping;
    mat.normalMap.wrapT = THREE.RepeatWrapping;
    return mat;
  }

  fitText(ctx, text, maxW, px, weight = "bold", family = "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif") {
    let size = px;
    ctx.font = `${weight} ${size}px ${family}`;
    while (ctx.measureText(text).width > maxW && size > 10) {
      size -= 2;
      ctx.font = `${weight} ${size}px ${family}`;
    }
    return size;
  }

  // Backlit flex shop boards: 4 x 16 cells of 512 x 64 on a 2048 x 1024 atlas.
  createSignAtlas() {
    const canvas = GFX.makeCanvas(2048, 1024);
    const ctx = canvas.getContext("2d");
    const rng = GFX.rng(808);
    this.signCells = [];
    for (let k = 0; k < 64; k++) {
      const col = k % 4;
      const row = Math.floor(k / 4);
      const x = col * 512;
      const y = row * 64;
      const [title, sub] = SHOP_NAMES[k % SHOP_NAMES.length];
      const st = SIGN_STYLES[(k * 5 + Math.floor(k / SHOP_NAMES.length)) % SIGN_STYLES.length];
      ctx.fillStyle = st.bg;
      ctx.fillRect(x, y, 512, 64);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x, y, 512, 18);
      ctx.strokeStyle = st.sub;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 3, y + 3, 506, 58);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = st.fg;
      this.fitText(ctx, title, 470, 34);
      ctx.fillText(title, x + 256, y + 25);
      ctx.fillStyle = st.sub;
      this.fitText(ctx, sub, 440, 15, "bold", "Arial, sans-serif");
      ctx.fillText(sub, x + 256, y + 50);
      if (rng() < 0.3) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(x + rng() * 480, y, 20 + rng() * 40, 64);
      }
      // u0, v0, u1, v1 (flipY: canvas row 0 is v = 1)
      this.signCells.push([col / 4, 1 - (row + 1) / 16, (col + 1) / 4, 1 - row / 16]);
    }
    const tex = GFX.texture(canvas);
    tex.anisotropy = GFX.anisotropy;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.6 });
    return mat;
  }

  // Place-name boards and landmark signs, drawn on demand: 4 x 16 cells of 512 x 128.
  createBoardAtlas() {
    this.boardCanvas = GFX.makeCanvas(2048, 2048);
    this.boardCtx = this.boardCanvas.getContext("2d");
    this.boardCells = new Map();
    this.boardTexture = GFX.texture(this.boardCanvas);
    return new THREE.MeshStandardMaterial({ map: this.boardTexture, emissiveMap: this.boardTexture, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.55 });
  }

  // style: "place" (green NH board), "road" (blue), or {bg, fg, border, sub}
  board(text, style = "place", sub = "") {
    const key = `${text}|${JSON.stringify(style)}|${sub}`;
    if (this.boardCells.has(key)) return this.boardCells.get(key);
    const k = this.boardCells.size;
    if (k >= 64) return this.boardCells.values().next().value;
    const col = k % 4;
    const row = Math.floor(k / 4);
    const x = col * 512;
    const y = row * 128;
    const ctx = this.boardCtx;
    const st =
      style === "place"
        ? { bg: "#0b6b3a", fg: "#ffffff", border: "#ffffff", sub: "#e8ffe8" }
        : style === "road"
        ? { bg: "#1f4aa8", fg: "#ffffff", border: "#ffffff", sub: "#dfe8ff" }
        : style;
    ctx.fillStyle = st.bg;
    ctx.fillRect(x, y, 512, 128);
    ctx.strokeStyle = st.border || st.fg;
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 7, y + 7, 498, 114);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = st.fg;
    this.fitText(ctx, text, 470, sub ? 50 : 62, "bold", "Arial, 'Helvetica Neue', sans-serif");
    ctx.fillText(text, x + 256, y + (sub ? 50 : 66));
    if (sub) {
      ctx.fillStyle = st.sub || st.fg;
      this.fitText(ctx, sub, 460, 26, "bold", "Arial, sans-serif");
      ctx.fillText(sub, x + 256, y + 96);
    }
    this.boardTexture.needsUpdate = true;
    const cell = [col / 4, 1 - (row + 1) / 16, (col + 1) / 4, 1 - row / 16];
    this.boardCells.set(key, cell);
    return cell;
  }

  // --- Emitters -----------------------------------------------------------------------
  writer(mat, castShadow = true, receiveShadow = true) {
    const key = `${mat.uuid}|${castShadow}|${receiveShadow}`;
    let w = this.writers.get(key);
    if (!w) {
      w = this.batcher.writer(mat, castShadow, receiveShadow);
      this.writers.set(key, w);
    }
    return w;
  }

  static tint(hex) {
    const c = GFX.color(hex);
    return [c.r, c.g, c.b];
  }

  // Alias -> [base material, its fixed tint]; plain material -> [material, tint].
  res(mat, tint) {
    if (mat && mat.isAlias) return [mat.base, mat.tint];
    return [mat, tint || [1, 1, 1]];
  }

  // Oriented box. o: {x, z, y, w, h, d, rot, side, top, front, back, tint, frontTint,
  //   tileW, tileH, vOff, noBottom (default true), cast}
  box(o) {
    const rot = o.rot || 0;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const y0 = o.y || 0;
    const hw = o.w / 2;
    const hd = o.d / 2;
    const tileW = o.tileW || 4;
    const tileH = o.tileH || 4;
    const vOff = o.vOff || 0;
    const cast = o.cast !== false;
    const toW = (lx, lz) => [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
    const faces = [
      // name, corners (bl, br) in local xz, normal local
      ["front", [-hw, hd], [hw, hd], [0, 1]],
      ["back", [hw, -hd], [-hw, -hd], [0, -1]],
      ["right", [hw, hd], [hw, -hd], [1, 0]],
      ["left", [-hw, -hd], [-hw, hd], [-1, 0]],
    ];
    faces.forEach(([name, bl, br, n]) => {
      if (!(o[name] || o.side)) return;
      const [mat, tint] = this.res(o[name] || o.side, (name === "front" && o.frontTint) || o.tint);
      const w = this.writer(mat, cast);
      w.begin(o.x, o.z);
      const [x0, z0] = toW(bl[0], bl[1]);
      const [x1, z1] = toW(br[0], br[1]);
      const nx = n[0] * c + n[1] * s;
      const nz = -n[0] * s + n[1] * c;
      const fw = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
      const u0 = (-fw / 2) / tileW + 0.5;
      const u1 = (fw / 2) / tileW + 0.5;
      const v0 = vOff / tileH;
      const v1 = (o.h + vOff) / tileH;
      const a = w.vertex(x0, y0, z0, nx, 0, nz, u0, v0, tint[0], tint[1], tint[2]);
      const b = w.vertex(x1, y0, z1, nx, 0, nz, u1, v0, tint[0], tint[1], tint[2]);
      const d = w.vertex(x0, y0 + o.h, z0, nx, 0, nz, u0, v1, tint[0], tint[1], tint[2]);
      const e = w.vertex(x1, y0 + o.h, z1, nx, 0, nz, u1, v1, tint[0], tint[1], tint[2]);
      w.tri(a, b, d);
      w.tri(b, e, d);
    });
    if (o.top !== null && (o.top || o.side)) {
      const [mat, aliasTint] = this.res(o.top || o.side, o.top ? o.topTint : o.tint);
      const tint = o.topTint || aliasTint;
      const w = this.writer(mat, cast);
      w.begin(o.x, o.z);
      const y = y0 + o.h;
      const tt = o.topTile || tileW;
      const p = [
        [-hw, hd],
        [hw, hd],
        [-hw, -hd],
        [hw, -hd],
      ].map(([lx, lz]) => {
        const [x, z] = toW(lx, lz);
        return w.vertex(x, y, z, 0, 1, 0, lx / tt, -lz / tt, tint[0], tint[1], tint[2]);
      });
      w.tri(p[0], p[1], p[2]);
      w.tri(p[1], p[3], p[2]);
    }
  }

  // Hip roof over a w x d rectangle (local X = w). Ridge along the longer side.
  hipRoof(o) {
    const rot = o.rot || 0;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const ov = o.overhang === undefined ? 0.6 : o.overhang;
    let W = o.w / 2 + ov;
    let D = o.d / 2 + ov;
    const swap = D > W;
    const rise = o.rise;
    const y0 = o.y;
    const [roofMat, tint] = this.res(o.mat, o.tint);
    const w = this.writer(roofMat, o.cast !== false);
    w.begin(o.x, o.z);
    // work in a frame where the long side is along X
    const L = swap ? D : W;
    const S = swap ? W : D;
    const ridge = Math.max(0, L - S) * (o.pyramid ? 0 : 1);
    const toW = (lx, lz) => {
      const ax = swap ? lz : lx;
      const az = swap ? -lx : lz;
      return [o.x + ax * c + az * s, o.z - ax * s + az * c];
    };
    const tile = o.tile || 2;
    const slope = Math.hypot(S, rise);
    const face = (pts, uvs) => {
      // pts: [lx, y, lz]; normal from the first three
      const P = pts.map(([lx, y, lz]) => {
        const [x, z] = toW(lx, lz);
        return [x, y, z];
      });
      const ux = P[1][0] - P[0][0];
      const uy = P[1][1] - P[0][1];
      const uz = P[1][2] - P[0][2];
      const vx = P[2][0] - P[0][0];
      const vy = P[2][1] - P[0][1];
      const vz = P[2][2] - P[0][2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      const ids = P.map((p, i) => w.vertex(p[0], p[1], p[2], nx, ny, nz, uvs[i][0] / tile, uvs[i][1] / tile, tint[0], tint[1], tint[2]));
      if (ids.length === 3) w.tri(ids[0], ids[1], ids[2]);
      else {
        w.tri(ids[0], ids[1], ids[2]);
        w.tri(ids[0], ids[2], ids[3]);
      }
    };
    const yr = y0 + rise;
    const r = ridge / 2;
    // long sides (+z and -z in the work frame)
    face(
      [
        [-L, y0, S],
        [L, y0, S],
        [r, yr, 0],
        [-r, yr, 0],
      ],
      [
        [-L, 0],
        [L, 0],
        [r, slope],
        [-r, slope],
      ]
    );
    face(
      [
        [L, y0, -S],
        [-L, y0, -S],
        [-r, yr, 0],
        [r, yr, 0],
      ],
      [
        [L, 0],
        [-L, 0],
        [-r, slope],
        [r, slope],
      ]
    );
    // hip ends
    face(
      [
        [L, y0, S],
        [L, y0, -S],
        [r, yr, 0],
      ],
      [
        [S, 0],
        [-S, 0],
        [0, Math.hypot(L - r, rise)],
      ]
    );
    face(
      [
        [-L, y0, -S],
        [-L, y0, S],
        [-r, yr, 0],
      ],
      [
        [S, 0],
        [-S, 0],
        [0, Math.hypot(L - r, rise)],
      ]
    );
    // soffit (underside) so the overhang is not see-through from below
    if (o.soffit !== false) {
      const ws = this.writer(o.soffitMat || this.mat.plain, true);
      ws.begin(o.x, o.z);
      const q = [
        [-L, S],
        [L, S],
        [-L, -S],
        [L, -S],
      ].map(([lx, lz]) => {
        const [x, z] = toW(lx, lz);
        return ws.vertex(x, y0 - 0.02, z, 0, -1, 0, 0, 0, 0.55, 0.5, 0.45);
      });
      ws.tri(q[0], q[2], q[1]);
      ws.tri(q[1], q[2], q[3]);
    }
  }

  // Gable roof (ridge along local X) with gable-end walls in `wallMat`.
  gableRoof(o) {
    const rot = o.rot || 0;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const W = o.w / 2 + (o.overhang || 0.4);
    const D = o.d / 2 + (o.overhang || 0.4);
    const y0 = o.y;
    const yr = y0 + o.rise;
    const toW = (lx, lz) => [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
    const [roofMat, tint] = this.res(o.mat, o.tint);
    const w = this.writer(roofMat, o.cast !== false);
    w.begin(o.x, o.z);
    const slope = Math.hypot(D, o.rise);
    const tile = o.tile || 4;
    [1, -1].forEach((side) => {
      const ny0 = D;
      const nz0 = o.rise * side;
      const l = Math.hypot(ny0, nz0);
      const nyL = ny0 / l;
      const nzL = nz0 / l;
      const nx = nzL * s;
      const nz = nzL * c;
      const pts = [
        [-W, y0, D * side, 0, 0],
        [W, y0, D * side, (2 * W) / tile, 0],
        [-W, yr, 0, 0, slope / tile],
        [W, yr, 0, (2 * W) / tile, slope / tile],
      ].map(([lx, y, lz, u, v]) => {
        const [x, z] = toW(lx, lz);
        return w.vertex(x, y, z, nx, nyL, nz, u, v, tint[0], tint[1], tint[2]);
      });
      if (side > 0) {
        w.tri(pts[0], pts[1], pts[2]);
        w.tri(pts[1], pts[3], pts[2]);
      } else {
        w.tri(pts[1], pts[0], pts[3]);
        w.tri(pts[0], pts[2], pts[3]);
      }
    });
    if (o.wallMat) {
      const ww = this.writer(o.wallMat, true);
      ww.begin(o.x, o.z);
      const wt = o.wallTint || [1, 1, 1];
      [1, -1].forEach((side) => {
        const x = (o.w / 2) * side;
        const nx = side * c;
        const nz = -side * s;
        const pts = [
          [x, y0, (o.d / 2) * side],
          [x, y0, (-o.d / 2) * side],
          [x, y0 + o.rise * (o.d / 2 / D), 0],
        ].map(([lx, y, lz]) => {
          const [px, pz] = toW(lx, lz);
          return ww.vertex(px, y, pz, nx, 0, nz, lz / 4, y / 4, wt[0], wt[1], wt[2]);
        });
        ww.tri(pts[0], pts[1], pts[2]);
      });
    }
  }

  cylinder(o) {
    const seg = o.seg || 8;
    const [cylMat, tint] = this.res(o.mat, o.tint);
    const w = this.writer(cylMat, o.cast !== false);
    w.begin(o.x, o.z);
    const y0 = o.y || 0;
    const r0 = o.r;
    const r1 = o.rTop === undefined ? o.r : o.rTop;
    const circ = Math.PI * 2 * r0;
    const tile = o.tile || 4;
    const ring = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const b = w.vertex(o.x + ca * r0, y0, o.z + sa * r0, ca, 0, sa, ((i / seg) * circ) / tile, 0, tint[0], tint[1], tint[2]);
      const t = w.vertex(o.x + ca * r1, y0 + o.h, o.z + sa * r1, ca, 0, sa, ((i / seg) * circ) / tile, o.h / tile, tint[0], tint[1], tint[2]);
      ring.push([b, t]);
    }
    for (let i = 0; i < seg; i++) {
      w.tri(ring[i][0], ring[i][1], ring[i + 1][0]);
      w.tri(ring[i + 1][0], ring[i][1], ring[i + 1][1]);
    }
    if (o.cap !== false && r1 > 0) {
      const center = w.vertex(o.x, y0 + o.h, o.z, 0, 1, 0, 0.5, 0.5, tint[0], tint[1], tint[2]);
      const cap = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        cap.push(w.vertex(o.x + Math.cos(a) * r1, y0 + o.h, o.z + Math.sin(a) * r1, 0, 1, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, tint[0], tint[1], tint[2]));
      }
      for (let i = 0; i < seg; i++) w.tri(center, cap[i + 1], cap[i]);
    }
  }

  // Vertical quad facing direction rot (its normal = local +Z), atlas cell UVs.
  quad(o) {
    const rot = o.rot || 0;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const [quadMat, t] = this.res(o.mat, o.tint);
    const w = this.writer(quadMat, o.cast === true);
    w.begin(o.x, o.z);
    const hw = o.w / 2;
    const nx = s;
    const nz = c;
    const [u0, v0, u1, v1] = o.uv || [0, 0, 1, 1];
    const pt = (lx) => [o.x + lx * c, o.z - lx * s];
    const [xa, za] = pt(-hw);
    const [xb, zb] = pt(hw);
    const a = w.vertex(xa, o.y, za, nx, 0, nz, u0, v0, t[0], t[1], t[2]);
    const b = w.vertex(xb, o.y, zb, nx, 0, nz, u1, v0, t[0], t[1], t[2]);
    const d = w.vertex(xa, o.y + o.h, za, nx, 0, nz, u0, v1, t[0], t[1], t[2]);
    const e = w.vertex(xb, o.y + o.h, zb, nx, 0, nz, u1, v1, t[0], t[1], t[2]);
    w.tri(a, b, d);
    w.tri(b, e, d);
    if (o.doubleSided) {
      w.tri(a, d, b);
      w.tri(b, d, e);
    }
  }

  // Point in a building's local frame -> world.
  static local(lot, lx, lz) {
    const c = Math.cos(lot.rot);
    const s = Math.sin(lot.rot);
    return [lot.x + lx * c + lz * s, lot.z - lx * s + lz * c];
  }

  // Sign board mounted on a facade: local front face is +Z at lz = depth/2.
  signOn(lot, y, width, height, cellIndex, forward = 0.12) {
    const [x, z] = CityKit.local(lot, 0, lot.d / 2 + forward);
    this.quad({ mat: this.mat.signs, x, z, y, w: width, h: height, rot: lot.rot, uv: this.signCells[cellIndex % this.signCells.length] });
    // board frame / back
    const [bx, bz] = CityKit.local(lot, 0, lot.d / 2 + forward / 2);
    this.box({ x: bx, z: bz, y: y - 0.06, w: width + 0.14, h: height + 0.12, d: forward, rot: lot.rot, side: this.mat.dark, top: this.mat.dark, cast: false });
  }

  // --- Building types (lot: {x, z, rot, w, d, ...}; front faces the road) ---------------
  shopHouse(lot, rng) {
    const m = this.mat;
    const floors = lot.floors;
    const gf = 3.6;
    const fh = 3.2;
    const H = gf + (floors - 1) * fh;
    const tint = lot.tint;
    // ground floor: shopfront on the street face, plaster elsewhere
    this.box({ x: lot.x, z: lot.z, w: lot.w, h: gf, d: lot.d, rot: lot.rot, side: m.plaster, front: m.shopfront, tint, frontTint: [1, 1, 1], tileW: 12, tileH: gf, top: floors > 1 ? null : m.roof });
    if (floors > 1) {
      this.box({ x: lot.x, z: lot.z, y: gf, w: lot.w, h: H - gf, d: lot.d, rot: lot.rot, side: m.plaster, top: m.roof, tint, tileW: 9, tileH: fh * 4 });
    }
    // street awning / sunshade over the shops, and one per upper floor
    const [ax, az] = CityKit.local(lot, 0, lot.d / 2 + 0.6);
    const shade = [tint[0] * 0.85, tint[1] * 0.85, tint[2] * 0.85];
    this.box({ x: ax, z: az, y: gf - 0.1, w: lot.w + 0.3, h: 0.14, d: 1.2, rot: lot.rot, side: m.plain, tint: shade });
    for (let f = 1; f < floors; f++) {
      const [sx, sz] = CityKit.local(lot, 0, lot.d / 2 + 0.3);
      this.box({ x: sx, z: sz, y: gf + (f - 1) * fh + 2.55, w: lot.w + 0.1, h: 0.1, d: 0.6, rot: lot.rot, side: m.plain, tint: shade });
    }
    // signboard: across the first floor, or on a parapet for single-storey shops
    const signW = Math.min(lot.w - 0.6, 9);
    if (floors > 1) this.signOn(lot, gf + 0.25, signW, signW / 8 + 0.35, lot.sign);
    else {
      const [px, pz] = CityKit.local(lot, 0, lot.d / 2 - 0.1);
      this.box({ x: px, z: pz, y: H, w: lot.w, h: 1.3, d: 0.2, rot: lot.rot, side: m.plain, tint });
      this.signOn(lot, H + 0.15, signW, 1.0, lot.sign, 0.05);
    }
    if (lot.tank) {
      const [tx, tz] = CityKit.local(lot, (rng() - 0.5) * (lot.w - 2), -lot.d / 4);
      this.cylinder({ x: tx, z: tz, y: H, r: 0.75, h: 1.3, seg: 8, mat: m.tank });
    }
    return H;
  }

  house(lot, rng) {
    const m = this.mat;
    const fh = 3.1;
    const H = lot.floors * fh;
    this.box({ x: lot.x, z: lot.z, w: lot.w, h: H, d: lot.d, rot: lot.rot, side: m.house, top: lot.roofStyle === "tile" ? null : m.roof, tint: lot.tint, tileW: 8, tileH: fh * 4 });
    // sit-out slab over the front door
    const [px, pz] = CityKit.local(lot, lot.w * 0.18, lot.d / 2 + 0.8);
    this.box({ x: px, z: pz, y: 2.75, w: Math.min(4, lot.w * 0.5), h: 0.14, d: 1.6, rot: lot.rot, side: m.plain, tint: lot.tint });
    if (lot.roofStyle === "tile") {
      this.hipRoof({ x: lot.x, z: lot.z, y: H, w: lot.w, d: lot.d, rot: lot.rot, rise: Math.min(lot.w, lot.d) * 0.32, mat: m.tile, tint: lot.roofTint, overhang: 0.7 });
    } else {
      const [px2, pz2] = CityKit.local(lot, 0, 0);
      // parapet
      this.box({ x: px2, z: pz2, y: H, w: lot.w, h: 0.8, d: lot.d, rot: lot.rot, side: m.plain, top: m.roof, tint: lot.tint });
      if (lot.truss) {
        this.hipRoof({ x: lot.x, z: lot.z, y: H + 1.2, w: lot.w * 0.9, d: lot.d * 0.9, rot: lot.rot, rise: 1.4, mat: m.sheet, tint: lot.roofTint, overhang: 0.3, soffit: false });
        [-1, 1].forEach((sx) =>
          [-1, 1].forEach((sz) => {
            const [cx, cz] = CityKit.local(lot, sx * lot.w * 0.4, sz * lot.d * 0.4);
            this.cylinder({ x: cx, z: cz, y: H + 0.8, r: 0.06, h: 0.45, seg: 4, mat: m.steel, cap: false });
          })
        );
      } else if (lot.tank) {
        const [tx, tz] = CityKit.local(lot, lot.w * 0.25, -lot.d * 0.2);
        this.cylinder({ x: tx, z: tz, y: H + 0.8, r: 0.65, h: 1.1, seg: 8, mat: m.tank });
      }
    }
    // compound wall along the street with a gate gap
    if (lot.wall) {
      const wallZ = lot.d / 2 + lot.yard;
      const gate = 3.2;
      const half = lot.w / 2 + 1.5;
      const segs = [
        [-half, -gate / 2 - 0.6],
        [gate / 2 + 0.6, half],
      ];
      segs.forEach(([a, b]) => {
        const [cx, cz] = CityKit.local(lot, (a + b) / 2, wallZ);
        this.box({ x: cx, z: cz, w: b - a, h: 1.35, d: 0.22, rot: lot.rot, side: m.plain, top: m.plain, tint: lot.wallTint, tileW: 4, tileH: 4 });
      });
      // gate pillars
      [-1, 1].forEach((sx) => {
        const [gx, gz] = CityKit.local(lot, sx * (gate / 2 + 0.3), wallZ);
        this.box({ x: gx, z: gz, w: 0.5, h: 1.7, d: 0.5, rot: lot.rot, side: m.plain, top: m.plain, tint: lot.wallTint });
      });
    }
    return H + (lot.roofStyle === "tile" ? Math.min(lot.w, lot.d) * 0.32 : 0.8);
  }

  flats(lot, rng) {
    const m = this.mat;
    const fh = 3.1;
    const H = lot.floors * fh;
    this.box({ x: lot.x, z: lot.z, w: lot.w, h: H, d: lot.d, rot: lot.rot, side: m.flats, top: m.roof, tint: lot.tint, tileW: 12, tileH: fh * 4 });
    const band = [lot.tint[0] * 0.7, lot.tint[1] * 0.7, lot.tint[2] * 0.72];
    // balcony slabs + parapets on the street side
    for (let f = 1; f < lot.floors; f++) {
      const [bx, bz] = CityKit.local(lot, 0, lot.d / 2 + 0.7);
      this.box({ x: bx, z: bz, y: f * fh - 0.1, w: lot.w * 0.9, h: 0.95, d: 1.4, rot: lot.rot, side: m.plain, top: m.plain, tint: band });
    }
    // crown + tanks
    this.box({ x: lot.x, z: lot.z, y: H, w: lot.w * 0.35, h: 3.2, d: lot.d * 0.4, rot: lot.rot, side: m.plain, top: m.roof, tint: band });
    [-1, 1].forEach((sx) => {
      const [tx, tz] = CityKit.local(lot, sx * lot.w * 0.3, -lot.d * 0.25);
      this.cylinder({ x: tx, z: tz, y: H, r: 0.9, h: 1.6, seg: 8, mat: m.tank });
    });
    return H + 3.2;
  }

  office(lot, rng) {
    const m = this.mat;
    const glass = [m.glassA, m.glassB, m.glassC][lot.glass % 3];
    const fh = 3.8;
    const H = lot.floors * fh;
    // glass lobby podium
    this.box({ x: lot.x, z: lot.z, w: lot.w + 6, h: 5, d: lot.d + 6, rot: lot.rot, side: m.glassA, top: m.roof, tint: lot.podiumTint, tileW: 8, tileH: 10 });
    this.box({ x: lot.x, z: lot.z, y: 5, w: lot.w, h: H, d: lot.d, rot: lot.rot, side: glass, top: m.roof, tileW: 12, tileH: 14 });
    // steel crown + fins
    this.box({ x: lot.x, z: lot.z, y: H + 5, w: lot.w + 0.6, h: 1.4, d: lot.d + 0.6, rot: lot.rot, side: m.steel, top: m.roof });
    if (lot.fin) {
      const [fx, fz] = CityKit.local(lot, lot.w / 2 - 1.2, lot.d / 2 + 0.4);
      this.box({ x: fx, z: fz, y: 5, w: 1.4, h: H + 4, d: 1.2, rot: lot.rot, side: m.plain, top: m.plain, tint: lot.podiumTint });
    }
    return H + 6.4;
  }

  shed(lot, rng) {
    const m = this.mat;
    const H = lot.h;
    this.box({ x: lot.x, z: lot.z, w: lot.w, h: H, d: lot.d, rot: lot.rot, side: m.sheet, top: null, tint: lot.tint, tileW: 4, tileH: 4 });
    this.gableRoof({ x: lot.x, z: lot.z, y: H, w: lot.w, d: lot.d, rot: lot.rot, rise: Math.min(3.5, lot.d * 0.16), mat: m.sheet, tint: lot.roofTint, wallMat: m.sheet, wallTint: lot.tint, overhang: 0.5 });
    // office block at the front
    const [ox, oz] = CityKit.local(lot, -lot.w * 0.3, lot.d / 2 + 3.2);
    this.box({ x: ox, z: oz, w: Math.min(12, lot.w * 0.35), h: 6.4, d: 6, rot: lot.rot, side: m.plaster, top: m.roof, tint: lot.officeTint, tileW: 9, tileH: 12.8 });
    return H + 3;
  }

  campusBlock(lot, rng) {
    const m = this.mat;
    const fh = 3.4;
    const H = lot.floors * fh;
    this.box({ x: lot.x, z: lot.z, w: lot.w, h: H, d: lot.d, rot: lot.rot, side: m.plaster, top: null, tint: lot.tint, tileW: 9, tileH: fh * 4 });
    this.hipRoof({ x: lot.x, z: lot.z, y: H, w: lot.w, d: lot.d, rot: lot.rot, rise: Math.min(lot.w, lot.d) * 0.28, mat: m.tile, tint: lot.roofTint, overhang: 0.9 });
    return H + Math.min(lot.w, lot.d) * 0.28;
  }
}

window.CityKit = CityKit;
