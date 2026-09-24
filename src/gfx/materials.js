/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * GFX CORE: COLOUR MANAGEMENT, SHARED SHADER UNIFORMS & GLOBAL SHADER PATCHES
 *
 * Loaded straight after three.js, before any material compiles.
 * - Colour management: material/texture colours authored as sRGB are converted to
 *   linear once (prepareScene), output is sRGB with ACES filmic tone mapping.
 * - Global shader patches (every built-in material, no per-material code):
 *     * fog is mixed before tone mapping/encoding, i.e. in linear HDR on every tier;
 *     * exponential height fog with a sun-coloured glow (THREE.Fog repurposed:
 *       fog.near = density at ground level, fog.far = height falloff, both per metre);
 *     * directional shadows fade out at the edge of the shadow frustum.
 * - Glow registry: emissive/neon materials scale between day and night intensity.
 * - Procedural texture helpers (seeded, tileable value noise, height -> normal map).
 */

(function () {
  const GFX = {};

  // Shared uniform objects: injected by reference, so updating .value updates every material.
  GFX.uniforms = {
    gfxSunDir: { value: new THREE.Vector3(0, 1, 0) },
    gfxSunScatter: { value: new THREE.Color(0, 0, 0) },
    gfxTime: { value: 0 },
    gfxWetness: { value: 0.35 },
  };
  GFX.anisotropy = 4;

  // ---------------------------------------------------------------------------
  // 1. Global shader patches
  // ---------------------------------------------------------------------------
  const CH = THREE.ShaderChunk;

  // three r128 mixes fog after tone mapping + sRGB encoding; move it before both.
  const fogOrder = /#include <tonemapping_fragment>(\s*)#include <encodings_fragment>(\s*)#include <fog_fragment>/;
  Object.keys(THREE.ShaderLib).forEach((name) => {
    const lib = THREE.ShaderLib[name];
    if (fogOrder.test(lib.fragmentShader)) {
      lib.fragmentShader = lib.fragmentShader.replace(
        fogOrder,
        "#include <fog_fragment>$1#include <tonemapping_fragment>$2#include <encodings_fragment>"
      );
    }
  });

  CH.fog_pars_vertex = `
#ifdef USE_FOG
	varying float fogDepth;
	varying vec3 vFogViewPosition;
#endif`;

  CH.fog_vertex = `
#ifdef USE_FOG
	fogDepth = - mvPosition.z;
	vFogViewPosition = mvPosition.xyz;
#endif`;

  CH.fog_pars_fragment = `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float fogDepth;
	varying vec3 vFogViewPosition;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	uniform vec3 gfxSunDir;
	uniform vec3 gfxSunScatter;
#endif`;

  // Height fog: density(y) = fogNear * exp(-fogFar * y), integrated analytically along
  // the view ray. Only viewMatrix is used (cameraPosition is not uploaded for basic
  // materials in r128): world ray = R^T * viewPos, camera height = -(R^T t).y.
  CH.fog_fragment = `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#else
		vec3 fogRay = vec3( dot( viewMatrix[ 0 ].xyz, vFogViewPosition ), dot( viewMatrix[ 1 ].xyz, vFogViewPosition ), dot( viewMatrix[ 2 ].xyz, vFogViewPosition ) );
		float fogCamY = - dot( viewMatrix[ 1 ].xyz, viewMatrix[ 3 ].xyz );
		float fogDist = length( fogRay );
		vec3 fogDir = fogRay / max( fogDist, 1e-4 );
		float fogB = max( fogFar, 1e-5 );
		float fogRd = fogDir.y * fogB * fogDist;
		float fogAmount = fogNear * exp( - fogB * max( fogCamY, 0.0 ) ) * fogDist * ( abs( fogRd ) > 1e-4 ? ( 1.0 - exp( - fogRd ) ) / fogRd : 1.0 );
		float fogFactor = 1.0 - exp( - clamp( fogAmount, 0.0, 60.0 ) );
		float fogSun = pow( max( dot( fogDir, gfxSunDir ), 0.0 ), 8.0 );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor + gfxSunScatter * fogSun, fogFactor );
	#endif
#endif`;

  // Fade directional/spot shadows out towards the shadow frustum edge (no hard cut-off).
  const shadowEnd = /return shadow;(\s*}\s*vec2 cubeToUV)/;
  if (shadowEnd.test(CH.shadowmap_pars_fragment)) {
    CH.shadowmap_pars_fragment = CH.shadowmap_pars_fragment.replace(
      shadowEnd,
      "vec2 gfxShadowEdge = abs( shadowCoord.xy * 2.0 - 1.0 );\n" +
        "\t\treturn mix( shadow, 1.0, smoothstep( 0.8, 1.0, max( gfxShadowEdge.x, gfxShadowEdge.y ) ) );$1"
    );
  } else {
    console.warn("GFX: shadow edge-fade patch did not apply (unexpected three.js build)");
  }

  GFX.injectUniforms = function (shader) {
    for (const key in GFX.uniforms) shader.uniforms[key] = GFX.uniforms[key];
  };
  // One shared function => one shared program per material type (cache key = its source).
  GFX.onBeforeCompileDefault = function (shader) {
    GFX.injectUniforms(shader);
  };

  // ---------------------------------------------------------------------------
  // 2. Colour management
  // ---------------------------------------------------------------------------
  const DEFAULT_ON_BEFORE_COMPILE = THREE.Material.prototype.onBeforeCompile;

  // Linear colour from an sRGB hex (for materials created with userData.linear = true).
  GFX.color = function (hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  };

  GFX.prepareMaterial = function (m) {
    if (!m || m.userData.gfxReady) return;
    m.userData.gfxReady = true;
    if (m.isShaderMaterial) return; // custom shaders handle colour themselves
    if (!m.userData.linear) {
      if (m.color) m.color.convertSRGBToLinear();
      if (m.emissive) m.emissive.convertSRGBToLinear();
    }
    ["map", "emissiveMap"].forEach((slot) => {
      const tex = m[slot];
      if (tex && tex.encoding !== THREE.sRGBEncoding) {
        tex.encoding = THREE.sRGBEncoding;
        tex.needsUpdate = true;
      }
    });
    if (m.userData.glow !== undefined) GFX.glow.add(m, m.userData.glow);
    if (m.onBeforeCompile === DEFAULT_ON_BEFORE_COMPILE) m.onBeforeCompile = GFX.onBeforeCompileDefault;
    m.needsUpdate = true;
  };

  GFX.prepareScene = function (root) {
    root.traverse((obj) => {
      if (!obj.material) return;
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(GFX.prepareMaterial);
      if (obj.customDepthMaterial) GFX.prepareMaterial(obj.customDepthMaterial);
    });
  };

  GFX.invalidateAll = function (root) {
    root.traverse((obj) => {
      if (!obj.material) return;
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => (m.needsUpdate = true));
      if (obj.customDepthMaterial) obj.customDepthMaterial.needsUpdate = true;
    });
  };

  // ---------------------------------------------------------------------------
  // 3. Glow registry: lights, neon and lit windows brighten at night
  // ---------------------------------------------------------------------------
  // spec: number (constant multiplier) or { day, night } multipliers of the base colour.
  // Unlit materials scale .color (HDR values > 1 drive bloom); lit ones scale emissiveIntensity.
  GFX.glow = {
    items: [],
    night: 0,
    add(mat, spec) {
      const s = typeof spec === "number" ? { day: spec, night: spec } : spec;
      const unlit = !mat.emissive;
      this.items.push({ mat, day: s.day, night: s.night, unlit, base: unlit ? mat.color.clone() : null });
      this.apply(this.items[this.items.length - 1]);
    },
    apply(item) {
      const k = (item.day + (item.night - item.day) * this.night) * (item.mat.userData.glowBoost || 1);
      if (item.unlit) item.mat.color.copy(item.base).multiplyScalar(k);
      else item.mat.emissiveIntensity = k;
    },
    update(night) {
      this.night = night;
      for (let i = 0; i < this.items.length; i++) this.apply(this.items[i]);
    },
  };

  // ---------------------------------------------------------------------------
  // 4. Procedural texture helpers
  // ---------------------------------------------------------------------------
  GFX.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 144269504) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // Tileable value noise in [0,1): period in lattice cells.
  GFX.valueNoise = function (x, y, period, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2(x0, y0, seed);
    const b = hash2(x1, y0, seed);
    const c = hash2(x0, y1, seed);
    const d = hash2(x1, y1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  // Tileable fractal noise over a size x size texture; baseCells = lattice cells of octave 0.
  GFX.fbm = function (px, py, size, baseCells, octaves, seed) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let cells = baseCells;
    for (let o = 0; o < octaves; o++) {
      sum += amp * GFX.valueNoise((px / size) * cells, (py / size) * cells, cells, seed + o * 17);
      norm += amp;
      amp *= 0.5;
      cells *= 2;
    }
    return sum / norm;
  };

  GFX.makeCanvas = function (w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h || w;
    return c;
  };

  // Heightfield (Float32Array, size*size, wraps) -> tangent-space normal map canvas.
  GFX.normalMapFromHeight = function (height, size, strength) {
    const canvas = GFX.makeCanvas(size);
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const l = height[y * size + ((x - 1 + size) % size)];
        const r = height[y * size + ((x + 1) % size)];
        const u = height[((y - 1 + size) % size) * size + x];
        const d = height[((y + 1) % size) * size + x];
        let nx = (l - r) * strength;
        let ny = (d - u) * strength;
        const len = Math.sqrt(nx * nx + ny * ny + 1);
        const i = (y * size + x) * 4;
        img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };

  GFX.texture = function (canvas, opts) {
    const o = opts || {};
    const tex = new THREE.CanvasTexture(canvas);
    if (o.srgb) tex.encoding = THREE.sRGBEncoding;
    if (o.repeat) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(o.repeat[0], o.repeat[1]);
    }
    tex.anisotropy = o.anisotropy || GFX.anisotropy;
    return tex;
  };

  window.GFX = GFX;
})();
