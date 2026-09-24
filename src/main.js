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
    this.scene = new THREE.Scene();
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.3, 3000);

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
    this.player = new window.PlayerController(this.scene, this.soundEngine);
    window.playerController = this.player;

    this.trafficManager = new window.TrafficManager(this.scene, this.mapManager);
    window.trafficManager = this.trafficManager;

    this.policeManager = new window.KeralaPoliceManager(this.scene, this.soundEngine);
    window.policeManager = this.policeManager;

    this.missionEngine = new window.MissionEngine(this.scene, this.soundEngine);
    window.missionEngine = this.missionEngine;

    this.hud = new window.HUDController(this.mapManager, this.timeOfDay);

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
    this.sky.applyQuality(tier);
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

    this.player.update(delta, this.mapManager, this.trafficManager, this.policeManager);
    this.trafficManager.update(delta, this.player);
    this.policeManager.update(delta, this.player, this.mapManager);
    this.missionEngine.update(delta, this.player);
    this.hud.update(this.player, this.trafficManager, this.policeManager, this.missionEngine, delta);

    this.updateCamera(delta);
    this.cullDynamicObjects();

    // Lighting follows the final camera for this frame.
    this.sky.update(delta, this.player, this.camera);
    this.lampStreaks.update(this.sky.night, GFX.uniforms.gfxWetness.value, this.tier && this.tier.ssr ? 0.5 : 1);
    this.updateContactShadows();

    if (!render) return;
    this.renderFrame(delta);
  }

  renderFrame(delta) {
    if (this.composer && this.tier.post) {
      this.composer.render(delta, this.sky.exposure);
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

