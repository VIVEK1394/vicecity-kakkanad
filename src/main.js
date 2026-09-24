/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 0: MASTER ORCHESTRATION & GAME ENGINE
 * Integrates Domains 1 through 8 in 60 FPS WebGL loop with dynamic camera and lifecycle state.
 */

class ViceCityGameEngine {
  constructor() {
    this.container = document.getElementById("canvas-container");
    this.lastTime = performance.now();
    this.cameraMode = 0; // 0 = Chase, 1 = Hood, 2 = High Bird's Eye
    this.started = false;
    this.startedAt = Infinity;
    this.cameraNeedsSnap = true;

    // ?test=1 (tools/smoke-test.js): no automatic loop; the harness steps frames via tick().
    this.testMode = new URLSearchParams(window.location.search).get("test") === "1";
    this.ready = false;

    // Three.js Core
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Domain Systems
    this.mapManager = null;
    this.player = null;
    this.trafficManager = null;
    this.policeManager = null;
    this.missionEngine = null;
    this.hud = null;
    this.soundEngine = window.soundEngine;

    this.init();
  }

  init() {
    // 1. Scene & 360-Degree Vice City Sunset Atmosphere
    this.scene = new THREE.Scene();
    const envMap = this.createViceCityEnvironmentMap();
    this.scene.environment = envMap;
    this.scene.background = envMap;
    this.scene.fog = new THREE.FogExp2(0x280b3d, 0.0004);
    this.scene.fog.color.convertSRGBToLinear();

    // 2. Camera Setup
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.3, 2800);

    // 3. WebGL Renderer
    // Colour pipeline: linear lighting, ACES filmic tone mapping, sRGB output.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.frameStats = { calls: 0, triangles: 0, path: "direct" };

    this.quality = window.gfxQuality;
    this.quality.init(this.renderer);

    // 4. Authentic Vice City Dual-Tone Sunset Lighting
    const ambLight = new THREE.AmbientLight(0xffecd2, 0.55); // Warm ambient fill
    ambLight.color.convertSRGBToLinear();
    this.scene.add(ambLight);

    const hemiLight = new THREE.HemisphereLight(0xffbe53, 0x1f0d3d, 0.65); // Warm golden sky + twilight purple ground
    hemiLight.color.convertSRGBToLinear();
    hemiLight.groundColor.convertSRGBToLinear();
    this.scene.add(hemiLight);

    // Calibrated Directional Sunlight with Focused Real-Time Shadow Frustum
    const sunLight = new THREE.DirectionalLight(0xff9944, 1.8);
    sunLight.color.convertSRGBToLinear();
    sunLight.position.set(200, 220, 150);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 400;
    sunLight.shadow.camera.left = -65;
    sunLight.shadow.camera.right = 65;
    sunLight.shadow.camera.top = 65;
    sunLight.shadow.camera.bottom = -65;
    sunLight.shadow.bias = -0.0006;
    this.sunLight = sunLight;
    this.scene.add(sunLight);
    this.scene.add(sunLight.target);

    // 7. Post-processing pipeline (HDR path; Low renders straight to the canvas)
    this.composer = null;

    // 8. Initialize Domain Systems (Sequential Integration Gates)
    this.mapManager = new window.KakkanadMapManager(this.scene);
    this.player = new window.PlayerController(this.scene, this.soundEngine);
    window.playerController = this.player;

    this.trafficManager = new window.TrafficManager(this.scene, this.mapManager);
    window.trafficManager = this.trafficManager;

    this.policeManager = new window.KeralaPoliceManager(this.scene, this.soundEngine);
    window.policeManager = this.policeManager;

    this.missionEngine = new window.MissionEngine(this.scene, this.soundEngine);
    window.missionEngine = this.missionEngine;

    this.hud = new window.HUDController(this.mapManager);

    // Everything is built: convert authored sRGB colours to linear, then apply quality.
    GFX.prepareScene(this.scene);
    this.quality.onChange((tier) => this.applyQuality(tier));
    this.quality.onResolutionChange(() => this.onResize());
    this.quality.statsProvider = () => this.frameStats;

    // 6. UI & Modal Listeners
    this.initUIListeners();

    // 7. Window Resize Listener
    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyC") {
        this.cameraMode = (this.cameraMode + 1) % 3;
      }
    });

    this.ready = true;

    // Start 60 FPS Loop
    if (!this.testMode) requestAnimationFrame((t) => this.animate(t));
  }

  initUIListeners() {
    const freeRoamBtn = document.getElementById("start-free-roam-btn");
    if (freeRoamBtn) {
      freeRoamBtn.addEventListener("click", () => {
        this.startGame();
      });
    }

    const mission1Btn = document.getElementById("start-mission-1-btn");
    if (mission1Btn) {
      mission1Btn.addEventListener("click", () => {
        this.startGame();
        this.missionEngine.startMission("mission_1");
      });
    }
  }

  startGame() {
    if (!this.started) {
      this.started = true;
      this.startedAt = performance.now();
    }
    this.soundEngine.init();
    this.soundEngine.resume();
    this.soundEngine.showRadioBanner();

    const modal = document.getElementById("start-modal");
    if (modal) modal.classList.add("hidden");

    this.lastTime = performance.now();
  }

  applyQuality(tier) {
    this.tier = tier;
    GFX.anisotropy = Math.min(tier.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
    window.vehicleModelFactory.setClearcoat(tier.clearcoat);
    this.renderer.shadowMap.type = tier.shadowSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (this.sunLight) {
      const shadow = this.sunLight.shadow;
      if (shadow.mapSize.x !== tier.shadowMapSize) {
        shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
        if (shadow.map) {
          shadow.map.dispose();
          shadow.map = null;
        }
      }
      const e = tier.shadowExtent;
      shadow.camera.left = -e;
      shadow.camera.right = e;
      shadow.camera.top = e;
      shadow.camera.bottom = -e;
      shadow.camera.updateProjectionMatrix();
    }
    this.onResize();
    // Tone mapping / shadow type are program parameters r128 doesn't track: recompile.
    GFX.invalidateAll(this.scene);
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.quality ? this.quality.pixelRatio() : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  animate(currentTime) {
    requestAnimationFrame((t) => this.animate(t));

    const frameMs = currentTime - this.lastTime;
    const delta = Math.min(frameMs / 1000, 0.1);
    this.lastTime = currentTime;
    this.quality.frame(frameMs);
    this.tick(delta, true);
  }

  // One simulation step (+ optional render). Also driven directly by the smoke test.
  tick(delta, render = true) {
    GFX.uniforms.gfxTime.value += delta;
    this.mapManager.update(delta);

    // 1. Update Player Controller
    this.player.update(delta, this.mapManager, this.trafficManager, this.policeManager);

    // 2. Update Ambient Traffic & Pedestrians
    this.trafficManager.update(delta, this.player);

    // 3. Update Kerala Police AI & Wanted Stars
    this.policeManager.update(delta, this.player, this.mapManager);

    // 4. Update Mission Storyline
    this.missionEngine.update(delta, this.player);

    // 5. Update Vice City HUD & Radar Minimap
    this.hud.update(this.player, this.trafficManager, this.policeManager, this.missionEngine, delta);

    // 6. Update Directional Shadow Light to track Player tightly for razor-sharp real-time shadows
    if (this.player && this.sunLight) {
      const pPos = this.player.position;
      this.sunLight.position.set(pPos.x + 80, 140, pPos.z + 60);
      this.sunLight.target.position.copy(pPos);
      this.sunLight.target.updateMatrixWorld();
    }

    // 7. Update Dynamic Camera
    this.updateCamera(delta);
    this.cullDynamicObjects();

    if (!render) return;

    // 8. Render 3D Scene (via RenderWare Post-Processing Composer if active)
    if (this.composer) {
      this.composer.render(delta);
    } else {
      this.renderer.render(this.scene, this.camera);
      this.frameStats.calls = this.renderer.info.render.calls;
      this.frameStats.triangles = this.renderer.info.render.triangles;
    }
  }

  // Draw distance for vehicles and pedestrians: beyond it they are a few fogged pixels.
  cullDynamicObjects() {
    const cam = this.camera.position;
    const vehicleRange2 = 350 * 350;
    const pedRange2 = 160 * 160;
    this.trafficManager.vehicles.forEach((v) => {
      v.mesh.visible = v.isOccupied || v.mesh.position.distanceToSquared(cam) < vehicleRange2;
    });
    this.policeManager.policeUnits.forEach((p) => {
      p.mesh.visible = p.isActive && p.mesh.position.distanceToSquared(cam) < vehicleRange2;
    });
    const starter = this.player.starterVehicle;
    if (starter) starter.mesh.visible = starter.isOccupied || starter.mesh.position.distanceToSquared(cam) < vehicleRange2;
    this.trafficManager.pedestrians.forEach((ped) => {
      ped.group.visible = ped.group.position.distanceToSquared(cam) < pedRange2;
    });
  }

  createViceCityEnvironmentMap() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    // 1980s Vice City Sky Gradient (Equirectangular: y=0 Zenith, y=256 Horizon, y=512 Nadir)
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.00, "#080114"); // Zenith: Deep cosmic midnight violet
    grad.addColorStop(0.20, "#240046"); // High sky: Rich indigo purple
    grad.addColorStop(0.36, "#7209b7"); // Mid sky: Electric magenta / violet
    grad.addColorStop(0.44, "#f72585"); // Low sky: Iconic Vice City neon hot pink
    grad.addColorStop(0.48, "#ff7b00"); // Near horizon: Sunset orange
    grad.addColorStop(0.50, "#ffb703"); // Horizon line (y=256): Warm golden sunset glow
    grad.addColorStop(0.53, "#3c096c"); // Just below horizon: Atmospheric haze
    grad.addColorStop(0.65, "#10002b"); // Ground reflection
    grad.addColorStop(1.00, "#050010"); // Nadir: Deep ground plane
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    // Glowing Golden Sun on the Horizon (elevation ~ 3 degrees above horizon)
    const sunGrad = ctx.createRadialGradient(720, 245, 5, 720, 245, 65);
    sunGrad.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
    sunGrad.addColorStop(0.3, "rgba(255, 225, 120, 0.9)");
    sunGrad.addColorStop(0.7, "rgba(255, 110, 60, 0.4)");
    sunGrad.addColorStop(1.0, "rgba(255, 50, 100, 0.0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(720, 245, 65, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  updateCamera(delta) {
    const pPos = this.player.position;
    const pHeading = this.player.heading;
    const isInVehicle = this.player.state === "IN_VEHICLE";

    let targetCamPos = new THREE.Vector3();
    let lookTarget = new THREE.Vector3();

    if (this.cameraMode === 0) {
      // 3rd Person Follow / Chase Cam
      const distBehind = isInVehicle ? 7.5 : 4.5;
      const heightAbove = isInVehicle ? 2.8 : 2.0;

      const backDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), pHeading);
      targetCamPos.copy(pPos).addScaledVector(backDir, distBehind);
      targetCamPos.y = pPos.y + heightAbove;

      lookTarget.copy(pPos);
      lookTarget.y += isInVehicle ? 1.0 : 1.4;

      // Snap on the first frame instead of flying in from the world origin.
      if (this.cameraNeedsSnap) this.camera.position.copy(targetCamPos);
      else this.camera.position.lerp(targetCamPos, Math.min(1, 12.0 * delta));
      this.camera.lookAt(lookTarget);

    } else if (this.cameraMode === 1) {
      // Hood / First Person View
      if (isInVehicle) {
        const hoodOffset = new THREE.Vector3(0, 1.1, 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), pHeading);
        this.camera.position.copy(pPos).add(hoodOffset);

        const fwdDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), pHeading);
        lookTarget.copy(pPos).addScaledVector(fwdDir, 30.0);
        lookTarget.y = pPos.y + 1.2;
        this.camera.lookAt(lookTarget);
      } else {
        // First Person on foot
        this.camera.position.copy(pPos);
        this.camera.position.y += 1.6;
        const fwdDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), pHeading);
        lookTarget.copy(pPos).addScaledVector(fwdDir, 20.0);
        lookTarget.y += 1.6;
        this.camera.lookAt(lookTarget);
      }

    } else {
      // High Bird's Eye / Cinematic Cam
      targetCamPos.set(pPos.x - 18, pPos.y + 24, pPos.z - 18);
      lookTarget.copy(pPos);
      if (this.cameraNeedsSnap) this.camera.position.copy(targetCamPos);
      else this.camera.position.lerp(targetCamPos, Math.min(1, 8.0 * delta));
      this.camera.lookAt(lookTarget);
    }
    this.cameraNeedsSnap = false;
  }
}

// Instantiate robustly whether DOM is already interactive or still loading
function initGame() {
  if (!window.gameEngine) {
    window.gameEngine = new ViceCityGameEngine();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGame);
} else {
  initGame();
}

// Global Space/Enter key fallback to dismiss start modal
window.addEventListener("keydown", (e) => {
  const modal = document.getElementById("start-modal");
  if (modal && !modal.classList.contains("hidden")) {
    if (e.code === "Space" || e.code === "Enter" || e.code === "KeyF") {
      if (window.gameEngine) window.gameEngine.startGame();
      else modal.classList.add("hidden");
    }
  }
});

