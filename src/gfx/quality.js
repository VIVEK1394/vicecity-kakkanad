/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * GRAPHICS QUALITY: Low / Medium / High presets, Auto detection, persistence,
 * runtime switching (G), dynamic resolution and the performance overlay (P).
 *
 *   ?quality=low|medium|high|auto   override for this page load (not persisted)
 *   ?governor=0                     disable dynamic resolution (used by the smoke test)
 */

(function () {
  const TIERS = Object.freeze({
    low: Object.freeze({
      label: "LOW",
      pixelRatio: 1.0, // cap on devicePixelRatio
      minScale: 0.6, // dynamic resolution floor
      post: false, // render straight to the canvas (built-in ACES + sRGB, canvas MSAA)
      msaa: 0,
      fxaa: false,
      shadowMapSize: 1024,
      shadowSoft: false,
      shadowExtent: 45,
      ao: false,
      aoSamples: 0,
      bloomMips: 0,
      motionBlurSamples: 0,
      ssr: false,
      clearcoat: 0,
      envRefreshDegrees: 6,
      headlightSpot: false,
      anisotropy: 2,
    }),
    medium: Object.freeze({
      label: "MEDIUM",
      pixelRatio: 1.0,
      minScale: 0.7,
      post: true,
      msaa: 0,
      fxaa: true,
      shadowMapSize: 2048,
      shadowSoft: true,
      shadowExtent: 70,
      ao: true,
      aoSamples: 8,
      bloomMips: 4,
      motionBlurSamples: 6,
      ssr: false,
      clearcoat: 0,
      envRefreshDegrees: 2,
      headlightSpot: true,
      anisotropy: 4,
    }),
    high: Object.freeze({
      label: "HIGH",
      pixelRatio: 1.5,
      minScale: 0.75,
      post: true,
      msaa: 4,
      fxaa: false,
      shadowMapSize: 4096,
      shadowSoft: true,
      shadowExtent: 90,
      ao: true,
      aoSamples: 12,
      bloomMips: 5,
      motionBlurSamples: 10,
      ssr: true,
      clearcoat: 1,
      envRefreshDegrees: 1.5,
      headlightSpot: true,
      anisotropy: 8,
    }),
  });
  const ORDER = ["low", "medium", "high"];
  const STORAGE_KEY = "kakkanad.graphics";

  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || "auto";
    } catch (e) {
      return "auto";
    }
  }

  function writePreference(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
      /* private mode / blocked storage: preference just isn't remembered */
    }
  }

  function detectCaps(renderer) {
    const gl = renderer.getContext();
    const ext = renderer.extensions;
    const webgl2 = renderer.capabilities.isWebGL2;
    const hdr = webgl2
      ? ext.has("EXT_color_buffer_float")
      : ext.has("OES_texture_half_float") &&
        ext.has("OES_texture_half_float_linear") &&
        (ext.has("EXT_color_buffer_half_float") || ext.has("WEBGL_color_buffer_float"));
    const depthTexture = webgl2 || ext.has("WEBGL_depth_texture");
    let gpu = "";
    try {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "");
    } catch (e) {
      gpu = "";
    }
    return { webgl2, hdr: hdr && depthTexture, gpu };
  }

  function detectTier(caps) {
    const gpu = caps.gpu.toLowerCase();
    const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent);
    if (!caps.hdr || mobile) return "low";
    if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(gpu)) return "low";
    if (/mali|adreno|powervr|apple a\d/.test(gpu)) return "low";
    const discrete =
      /geforce|nvidia|quadro|rtx|gtx|radeon rx|radeon pro|arc\(tm\)|intel arc|apple m\d|apple gpu/.test(gpu) &&
      !/geforce mx|mx\d{3}/.test(gpu);
    if (discrete && caps.webgl2) return "high";
    return "medium"; // Intel Iris/UHD, AMD integrated, unknown
  }

  class QualityManager {
    constructor() {
      const params = new URLSearchParams(window.location.search);
      const requested = (params.get("quality") || "").toLowerCase();
      this.urlOverride = TIERS[requested] || requested === "auto" ? requested : null;
      this.preference = this.urlOverride || readPreference();
      if (!TIERS[this.preference] && this.preference !== "auto") this.preference = "auto";
      this.governorEnabled = params.get("governor") !== "0";

      this.tier = null;
      this.tierName = null;
      this.detected = "medium";
      this.caps = { webgl2: false, hdr: false, gpu: "" };
      this.scale = 1;
      this.listeners = [];
      this.resolutionListeners = [];

      this.frameMs = 16.7;
      this.windowMs = 0;
      this.windowFrames = 0;
      this.slowSeconds = 0;
      this.fastSeconds = 0;
      this.overlayTimer = 0;
      this.overlayVisible = false;
      this.statsProvider = null;
    }

    init(renderer) {
      this.renderer = renderer;
      this.caps = detectCaps(renderer);
      this.detected = detectTier(this.caps);
      this.bindUI();
      this.setPreference(this.preference, false);
    }

    resolve(pref) {
      let name = pref === "auto" ? this.detected : pref;
      if (TIERS[name].post && !this.caps.hdr) name = "low"; // no float render targets
      return name;
    }

    setPreference(pref, persist = true) {
      this.preference = pref;
      if (persist && !this.urlOverride) writePreference(pref);
      this.applyTier(this.resolve(pref));
      this.updateButtons();
    }

    applyTier(name) {
      if (name === this.tierName) return;
      this.tierName = name;
      this.tier = Object.assign({ name }, TIERS[name]);
      this.scale = 1;
      this.slowSeconds = 0;
      this.fastSeconds = 0;
      this.listeners.forEach((fn) => fn(this.tier));
    }

    onChange(fn) {
      this.listeners.push(fn);
      if (this.tier) fn(this.tier);
    }

    onResolutionChange(fn) {
      this.resolutionListeners.push(fn);
    }

    pixelRatio() {
      const dpr = window.devicePixelRatio || 1;
      return Math.max(0.5, Math.min(dpr, this.tier ? this.tier.pixelRatio : 1) * this.scale);
    }

    cycle() {
      const next = ORDER[(ORDER.indexOf(this.tierName) + 1) % ORDER.length];
      this.setPreference(next);
      this.toast(`GRAPHICS: ${TIERS[next].label}`);
    }

    // Called once per real frame with the real (unclamped) frame interval in ms.
    frame(ms) {
      if (!(ms > 0) || ms > 250) return; // tab switches, shader-compile hitches
      this.frameMs += (ms - this.frameMs) * 0.1;
      this.windowMs += ms;
      this.windowFrames++;
      this.updateOverlay(ms);
      if (this.windowMs < 1000) return;

      const avg = this.windowMs / this.windowFrames;
      this.windowMs = 0;
      this.windowFrames = 0;
      if (!this.governorEnabled || document.hidden) return;

      if (avg > 19.5) {
        this.fastSeconds = 0;
        this.slowSeconds++;
        if (this.scale > this.tier.minScale + 1e-3) {
          this.setScale(Math.max(this.tier.minScale, this.scale - 0.1));
        } else if (this.preference === "auto" && avg > 25 && this.slowSeconds >= 5) {
          const lower = ORDER[ORDER.indexOf(this.tierName) - 1];
          if (lower) {
            this.applyTier(lower);
            this.toast(`GRAPHICS LOWERED TO ${TIERS[lower].label}`);
          }
        }
      } else if (avg < 17.6) {
        this.slowSeconds = 0;
        if (++this.fastSeconds >= 4 && this.scale < 1) {
          this.fastSeconds = 0;
          this.setScale(Math.min(1, this.scale + 0.05));
        }
      }
    }

    setScale(scale) {
      this.scale = scale;
      this.resolutionListeners.forEach((fn) => fn());
    }

    // --- UI -------------------------------------------------------------------
    bindUI() {
      document.querySelectorAll(".q-btn[data-q]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.setPreference(btn.dataset.q);
        });
      });
      window.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        if (e.code === "KeyG") this.cycle();
        if (e.code === "KeyP") this.toggleOverlay();
      });
      this.overlayEl = document.getElementById("perf-overlay");
      this.toastEl = document.getElementById("gfx-toast");
    }

    updateButtons() {
      document.querySelectorAll(".q-btn[data-q]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.q === this.preference);
        if (btn.dataset.q === "auto") btn.textContent = `AUTO (${TIERS[this.resolve("auto")].label})`;
      });
    }

    toast(text) {
      if (!this.toastEl) return;
      this.toastEl.textContent = text;
      this.toastEl.classList.remove("hidden");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.toastEl.classList.add("hidden"), 1800);
    }

    toggleOverlay() {
      this.overlayVisible = !this.overlayVisible;
      if (this.overlayEl) this.overlayEl.classList.toggle("hidden", !this.overlayVisible);
    }

    updateOverlay(ms) {
      if (!this.overlayVisible || !this.overlayEl) return;
      this.overlayTimer += ms;
      if (this.overlayTimer < 250) return;
      this.overlayTimer = 0;
      const s = this.statsProvider ? this.statsProvider() : null;
      const lines = [
        `${(1000 / this.frameMs).toFixed(0)} FPS  ${this.frameMs.toFixed(1)} ms`,
        `${this.tier.label}${this.preference === "auto" ? " (AUTO)" : ""}  res ${(this.scale * 100).toFixed(0)}%  x${this.pixelRatio().toFixed(2)}`,
      ];
      if (s) lines.push(`draws ${s.calls}  tris ${(s.triangles / 1000).toFixed(0)}k  ${s.path}`);
      this.overlayEl.textContent = lines.join("\n");
    }
  }

  window.GFX_TIERS = TIERS;
  window.gfxQuality = new QualityManager();
})();
