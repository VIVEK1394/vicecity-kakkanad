/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 0: MASTER ORCHESTRATION & GAME ENGINE
 * Owns the renderer, quality tiers, sky / time of day, cheap lighting effects, the
 * render path and the game loop that drives Domains 1 through 8.
 */

class ViceCityGameEngine {
  constructor() {
    this.container = document.getElementById("canvas-container");
    this.lastTime = performance.now();
    this.cameraMode = 0; // 0 = Chase, 1 = Hood, 2 = High Bird's Eye
    this.started = false;
    this.startedAt = Infinity;

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
    this.scene = new THREE.Scene();
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.3, 2200);

    // Renderer: linear lighting, ACES filmic tone mapping, sRGB output.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.frameStats = { calls: 0, triangles: 0, path: "direct" };

    this.quality = window.gfxQuality;
    this.quality.init(this.renderer);

    // Sky, sun/moon light, fog and image-based ambient light, all driven by the game clock.
    this.sky = new window.SkySystem(this.scene, this.renderer);
    this.timeOfDay = this.sky.time;

    // HDR post-processing pipeline (Medium/High); Low renders straight to the canvas.
    this.composer = null;

    // Domain systems
    this.mapManager = new window.KakkanadMapManager(this.scene);
    window.mapManager = this.mapManager;
    this.player = new window.PlayerController(this.scene, this.soundEngine);
    window.playerController = this.player;

    this.trafficManager = new window.TrafficManager(this.scene, this.mapManager);
    window.trafficManager = this.trafficManager;

    this.policeManager = new window.KeralaPoliceManager(this.scene, this.soundEngine);
    window.policeManager = this.policeManager;

    this.missionEngine = new window.MissionEngine(this.scene, this.soundEngine);
    window.missionEngine = this.missionEngine;

    this.hud = new window.HUDController(this.mapManager, this.timeOfDay);
    this.cameraRig = new window.CameraRig(this.camera, this.renderer.domElement, this.mapManager);

    // Cheap lighting effects (all tiers)
    this.lampStreaks = new window.LampStreaks(this.scene, this.mapManager.streetLamps);
    this.contactShadows = new window.ContactShadows(this.scene, 80);

    // Everything is built: convert authored sRGB colours to linear, then apply quality.
    GFX.prepareScene(this.scene);
    this.quality.onChange((tier) => this.applyQuality(tier));
    this.quality.onResolutionChange(() => this.onResize());
    this.quality.statsProvider = () => this.frameStats;

    this.initUIListeners();
    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyC") {
        this.cameraMode = (this.cameraMode + 1) % 3;
      }
    });

    this.ready = true;
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
    // HDR path: the scene stays linear and the composite tone-maps; Low tone-maps directly.
    this.renderer.toneMapping = tier.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.sky.applyQuality(tier);
    this.onResize();
    if (tier.post) {
      if (!this.composer) this.composer = new window.PostProcessingComposer(this.renderer, this.scene, this.camera);
      this.composer.setQuality(tier);
    } else if (this.composer && this.composer.tier) {
      this.composer.dispose();
    }
    // Tone mapping / shadow type are program parameters r128 doesn't track: recompile.
    GFX.invalidateAll(this.scene);
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.quality ? this.quality.pixelRatio() : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer && this.tier && this.tier.post) {
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

    this.player.update(delta, this.mapManager, this.trafficManager, this.policeManager);
    this.trafficManager.update(delta, this.player);
    this.policeManager.update(delta, this.player, this.mapManager);
    this.missionEngine.update(delta, this.player);

    this.updateCamera(delta);
    this.cullDynamicObjects();
    this.hud.viewYaw = this.cameraRig.yaw;
    this.hud.update(this.player, this.trafficManager, this.policeManager, this.missionEngine, delta);

    // Lighting follows the final camera for this frame.
    this.sky.update(delta, this.player, this.camera);
    this.lampStreaks.update(this.sky.night, GFX.uniforms.gfxWetness.value, this.tier && this.tier.ssr ? 0.5 : 1);
    this.updateContactShadows();

    if (!render) return;
    this.renderFrame(delta);
  }

  renderFrame(delta) {
    if (this.composer && this.tier.post) {
      this.composer.focusDistance = this.camera.position.distanceTo(this.player.position);
      this.composer.render(delta, this.sky.grade);
      this.frameStats = this.composer.stats;
    } else {
      this.renderer.toneMappingExposure = this.sky.exposure;
      this.renderer.render(this.scene, this.camera);
      this.frameStats.calls = this.renderer.info.render.calls;
      this.frameStats.triangles = this.renderer.info.render.triangles;
      this.frameStats.path = "direct";
    }
  }

  // Draw distance for vehicles and pedestrians: beyond it they are a few fogged pixels.
  // Whole map cells beyond the tier's draw distance are hidden as well.
  cullDynamicObjects() {
    const cam = this.camera.position;
    this.mapManager.batcher.updateVisibility(cam, (this.tier && this.tier.drawDistance) || 1100, this.sky.night);
    const vehicleRange2 = 280 * 280;
    const pedRange2 = 100 * 100;
    const detailRange2 = 65 * 65;
    // Beyond 65 m a moving vehicle drops its wheels and driver (several draw calls each).
    const vehicleDetail = (v, near, aiDriven) => {
      if (v._near === near && v._ai === aiDriven) return;
      v._near = near;
      v._ai = aiDriven;
      const u = v.mesh.userData;
      [u.frontWheels, u.rearWheels].forEach((list) => list && list.forEach((w) => (w.visible = near)));
      if (aiDriven && u.driverAvatar) u.driverAvatar.visible = near;
    };
    this.trafficManager.vehicles.forEach((v) => {
      const d2 = v.mesh.position.distanceToSquared(cam);
      v.mesh.visible = v.isOccupied || d2 < vehicleRange2;
      vehicleDetail(v, v.isOccupied || v.parked || d2 < detailRange2, !!v.nav && !v.isOccupied);
    });
    this.policeManager.policeUnits.forEach((p) => {
      const d2 = p.mesh.position.distanceToSquared(cam);
      p.mesh.visible = p.isActive && d2 < vehicleRange2;
      vehicleDetail(p, d2 < detailRange2, true);
    });
    const starter = this.player.starterVehicle;
    if (starter) starter.mesh.visible = starter.isOccupied || starter.mesh.position.distanceToSquared(cam) < vehicleRange2;
    this.trafficManager.pedestrians.forEach((ped) => {
      ped.group.visible = ped.group.position.distanceToSquared(cam) < pedRange2;
    });
  }

  // Soft contact shadows (ambient occlusion) under everything that moves.
  updateContactShadows() {
    const cs = this.contactShadows;
    const cam = this.camera.position;
    cs.begin();
    const addVehicle = (v) => {
      if (!v.mesh.visible || v.mesh.position.distanceToSquared(cam) > 120 * 120) return;
      const a = v.archetype;
      cs.add(v.position, v.heading, a.width * 1.3, a.length * 1.12);
    };
    this.trafficManager.vehicles.forEach(addVehicle);
    this.policeManager.policeUnits.forEach(addVehicle);
    if (this.player.starterVehicle) addVehicle(this.player.starterVehicle);

    if (this.player.state === "ON_FOOT") {
      const lift = Math.min(1, this.player.position.y * 0.6);
      const size = 0.95 * (1 - lift * 0.4);
      cs.add(this.player.position, this.player.heading, size, size);
    }
    this.trafficManager.pedestrians.forEach((ped) => {
      if (!ped.group.visible) return;
      if (ped.isKnockedOut) cs.add(ped.position, ped.group.rotation.y, 0.9, 1.9);
      else cs.add(ped.position, ped.group.rotation.y, 0.85, 0.85);
    });
    cs.end();
  }

  updateCamera(delta) {
    this.cameraRig.update(delta, this.player, this.cameraMode, this.trafficManager, this.policeManager);
    if (this.cameraRig.wasCut && this.composer) this.composer.resetHistory();
    // hide the driver's body in the hood / first-person view
    const v = this.player.currentVehicle;
    if (v && v.mesh.userData.driverAvatar) v.mesh.userData.driverAvatar.visible = this.cameraMode !== 1;
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

