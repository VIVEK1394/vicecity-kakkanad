/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 3: PLAYER CONTROLLER (ON-FOOT COMBAT & SEAMLESS VEHICLE ENTRY)
 * Implements melee punching combat, carjacking, and responsive driving physics.
 */

class PlayerController {
  constructor(scene, soundEngine) {
    this.scene = scene;
    this.soundEngine = soundEngine;
    this.config = window.KAKKANAD_CONFIG;

    // Vitals & Wallet
    this.health = 100;
    this.armor = 100;
    this.cash = 3500;

    // Mode: "ON_FOOT" or "IN_VEHICLE"
    this.state = "ON_FOOT";
    this.currentVehicle = null;

    // Spatial State: starts on the sidewalk by Kakkanad Bus Stand
    const map = window.mapManager;
    this.spawn = map ? map.spawnPoint() : { x: 0, z: 0, heading: 0 };
    this.position = new THREE.Vector3(this.spawn.x, 0, this.spawn.z);
    this.velocity = new THREE.Vector3();
    this.heading = this.spawn.heading; // Radians
    this.speed = 0;   // Forward speed when driving

    // On-Foot Dynamics (see locomotion.js)
    this.verticalVelocity = 0;
    this.isGrounded = true;

    // Melee Combat State
    this.punchCooldown = 0;

    // In-Vehicle Dynamics
    this.steeringAngle = 0;

    // 3D Character Mesh
    this.characterMesh = window.vehicleModelFactory.createCharacterMesh();
    this.characterMesh.position.copy(this.position);
    this.scene.add(this.characterMesh);
    this.locomotion = new window.OnFootController(this);
    this.gait = new window.ProceduralGait(this.characterMesh.userData);

    // Starter Auto Rickshaw spawned right next to player
    this.spawnStarterVehicle();

    // Input States
    this.keys = {
      up: false, down: false, left: false, right: false,
      sprint: false, jump: false
    };

    this.initInputListeners();
  }

  spawnStarterVehicle() {
    // Parked at the kerb just ahead of the spawn point (within the 6.8 m entry range) so
    // the chase camera, which starts behind the player, never ends up inside the rickshaw.
    const map = window.mapManager;
    let x = this.position.x + Math.sin(this.heading) * 4;
    let z = this.position.z + Math.cos(this.heading) * 4;
    let heading = this.heading;
    if (map && this.spawn.edge) {
      const g = map.graph;
      const e = this.spawn.edge;
      const p = g.lanePoint(e, 1, this.spawn.s + 3.5, e.halfW - 1.1);
      x = p.x;
      z = p.z;
      heading = p.heading;
    }
    const starterMesh = window.vehicleModelFactory.createAutoRickshawMesh();
    starterMesh.position.set(x, 0, z);
    starterMesh.rotation.y = heading;
    this.scene.add(starterMesh);

    this.starterVehicle = {
      id: "starter_auto",
      type: "AUTO_RICKSHAW",
      archetype: this.config.VEHICLE_ARCHETYPES.AUTO_RICKSHAW,
      mesh: starterMesh,
      position: new THREE.Vector3(x, 0, z),
      heading,
      speed: 0,
      steeringAngle: 0,
      isOccupied: false
    };
  }

  // Gameplay actions only count once the start modal has been dismissed, and never
  // for the same click/keypress that dismissed it (Free Roam used to punch a ped).
  acceptsActionInput(e) {
    const engine = window.gameEngine;
    if (!engine || !engine.started) return false;
    return !e || !(e.timeStamp < engine.startedAt);
  }

  initInputListeners() {
    window.addEventListener("keydown", (e) => {
      this.soundEngine.resume();
      switch (e.code) {
        case "KeyW": case "ArrowUp":    this.keys.up = true; break;
        case "KeyS": case "ArrowDown":  this.keys.down = true; break;
        case "KeyA": case "ArrowLeft":  this.keys.left = true; break;
        case "KeyD": case "ArrowRight": this.keys.right = true; break;
        case "ShiftLeft": case "ShiftRight": this.keys.sprint = true; break;
        case "Space":                   this.keys.jump = true; break;
        case "KeyF": case "KeyE":       if (this.acceptsActionInput(e)) this.onActionKey(); break;
        case "KeyH":                    if (this.acceptsActionInput(e)) this.onHornKey(); break;
        case "KeyR":                    this.soundEngine.nextStation(); break;
        case "KeyJ": case "ControlLeft": case "ControlRight": case "Enter":
          if (this.state === "ON_FOOT" && this.acceptsActionInput(e)) this.performPunch();
          break;
      }
    });

    window.addEventListener("keyup", (e) => {
      switch (e.code) {
        case "KeyW": case "ArrowUp":    this.keys.up = false; break;
        case "KeyS": case "ArrowDown":  this.keys.down = false; break;
        case "KeyA": case "ArrowLeft":  this.keys.left = false; break;
        case "KeyD": case "ArrowRight": this.keys.right = false; break;
        case "ShiftLeft": case "ShiftRight": this.keys.sprint = false; break;
        case "Space":                   this.keys.jump = false; break;
      }
    });

    // Left Mouse Click triggers Punch Attack
    window.addEventListener("mousedown", (e) => {
      if (e.gfxCaptureClick) return; // that click captured the mouse for camera look
      if (e.button === 0 && this.state === "ON_FOOT" && this.acceptsActionInput(e)) {
        this.soundEngine.resume();
        this.performPunch();
      }
    });
  }

  onActionKey() {
    if (this.state === "IN_VEHICLE") {
      this.exitVehicle();
    } else {
      this.tryEnterNearestVehicle();
    }
  }

  onHornKey() {
    if (this.state === "IN_VEHICLE" && this.currentVehicle) {
      this.soundEngine.playHorn(this.currentVehicle.archetype.hornSound);
    }
  }

  // --- 1. Melee Combat: Punch People ---
  performPunch() {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = 0.35;
    this.gait.punch();

    this.soundEngine.playPunchWhoosh();

    // Check hit against nearby pedestrians
    if (window.trafficManager) {
      const hit = window.trafficManager.checkPedestrianPunchHit(this);
      if (hit && window.gameEngine && window.gameEngine.cameraRig) window.gameEngine.cameraRig.addShake(0.2);
    }
  }

  update(delta, mapManager, trafficManager, policeManager) {
    if (delta > 0.1) delta = 0.1;

    if (this.punchCooldown > 0) this.punchCooldown -= delta;

    if (this.state === "ON_FOOT") {
      this.updateOnFoot(delta, mapManager, trafficManager);
    } else {
      this.updateInVehicle(delta, mapManager, trafficManager, policeManager);
    }
  }

  // --- 2. On-Foot Mechanics ---
  updateOnFoot(delta, mapManager, trafficManager) {
    // Camera-relative locomotion with acceleration, turn inertia and sprint.
    const rig = window.gameEngine && window.gameEngine.cameraRig;
    const cameraYaw = rig ? rig.yaw : this.heading;
    const speed = this.locomotion.update(delta, this.keys, cameraYaw);
    // Buildings, walls, trees and pillars are solid.
    const wall = mapManager.resolveCircle(this.position, 0.42);
    if (wall) {
      const vn = this.velocity.x * wall.x + this.velocity.z * wall.z;
      if (vn < 0) {
        this.velocity.x -= vn * wall.x;
        this.velocity.z -= vn * wall.z;
      }
    }
    if (this.locomotion.landImpact > 0) this.gait.land(this.locomotion.landImpact);
    this.gait.update(delta, speed, this.locomotion.accelForward, this.locomotion.turnRate, this.isGrounded);

    // Sync Character Mesh
    this.characterMesh.position.copy(this.position);
    this.characterMesh.rotation.y = this.heading;
    this.characterMesh.visible = true;

    // Check Vehicle Proximity & Update 3D Floating Badges
    this.updateVehicleProximityBadges(trafficManager);
  }

  updateVehicleProximityBadges(trafficManager) {
    const list = [...(trafficManager ? trafficManager.vehicles : []), this.starterVehicle].filter(Boolean);
    let nearest = null;
    let minDist = 999;

    list.forEach((v) => {
      const d = this.position.distanceTo(v.position);
      if (d < minDist) {
        minDist = d;
        nearest = { vehicle: v, dist: d };
      }

      // Hide all badges first
      if (v.mesh && v.mesh.userData && v.mesh.userData.badge) {
        v.mesh.userData.badge.visible = false;
      }
    });

    const prompt = document.getElementById("interaction-prompt");

    if (nearest && nearest.dist < 6.8) {
      const v = nearest.vehicle;
      if (v.mesh && v.mesh.userData && v.mesh.userData.badge) {
        v.mesh.userData.badge.visible = true;
        if (window.gameEngine && window.gameEngine.camera) {
          v.mesh.userData.badge.quaternion.copy(v.mesh.quaternion).invert().multiply(window.gameEngine.camera.quaternion);
        }
      }

      if (prompt) {
        prompt.textContent = `[F / E] ENTER ${v.archetype.name.toUpperCase()}`;
        prompt.classList.remove("hidden");
      }
    } else {
      if (prompt) prompt.classList.add("hidden");
    }
  }

  tryEnterNearestVehicle() {
    const list = [...(window.trafficManager ? window.trafficManager.vehicles : []), this.starterVehicle].filter(Boolean);
    let nearest = null;
    let minDist = 999;

    list.forEach((v) => {
      const d = this.position.distanceTo(v.position);
      if (d < minDist) {
        minDist = d;
        nearest = { vehicle: v, dist: d };
      }
    });

    if (nearest && nearest.dist < 6.8) {
      const v = nearest.vehicle;
      this.currentVehicle = v;
      v.isOccupied = true;
      this.state = "IN_VEHICLE";
      this.speed = v.speed || 0;
      this.velocity.set(0, 0, 0);
      if (!v.dynamics) v.dynamics = new window.VehicleDynamics(v);
      v.dynamics.enter(v.speed || 0); // carjacking a moving car keeps its speed

      this.soundEngine.playVehicleDoor();

      // Show driver avatar in vehicle seat
      if (v.mesh.userData && v.mesh.userData.driverAvatar) {
        v.mesh.userData.driverAvatar.visible = true;
      }

      // Hide standing character mesh
      this.characterMesh.visible = false;

      // Toggle HUD elements
      const crosshair = document.getElementById("crosshair");
      if (crosshair) crosshair.classList.add("hidden");
      const onfootHud = document.getElementById("onfoot-hud");
      if (onfootHud) onfootHud.classList.add("hidden");

      // Show Vehicle HUD
      const vHud = document.getElementById("vehicle-hud");
      const vName = document.getElementById("vehicle-name-display");
      if (vHud) vHud.classList.remove("hidden");
      if (vName) vName.textContent = v.archetype.name;

      const prompt = document.getElementById("interaction-prompt");
      if (prompt) prompt.classList.add("hidden");

      // Notify Police if hijacking civilian car
      if (window.policeManager && v !== this.starterVehicle) {
        window.policeManager.addCrimeHeat(this.config.WANTED.CRIME_HEAT.VEHICLE_JACK);
      }
    }
  }

  exitVehicle() {
    if (!this.currentVehicle) return;
    const v = this.currentVehicle;

    this.soundEngine.playVehicleDoor();

    // Hide driver avatar in vehicle
    if (v.mesh.userData && v.mesh.userData.driverAvatar) {
      v.mesh.userData.driverAvatar.visible = false;
    }

    // Place character on road next to driver door
    const exitOffset = new THREE.Vector3(-1.8, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), v.heading);
    this.position.copy(v.position).add(exitOffset);
    this.position.y = 0;

    // The abandoned vehicle stays parked where it was left (traffic recycles it later).
    v.speed = 0;
    v.parked = true;
    v.nav = null;
    if (v.dynamics) v.dynamics.reset();
    v.aiMotion = null;
    v.suspension = null;
    if (v.mesh.userData.body) {
      v.mesh.userData.body.rotation.set(0, 0, 0);
      v.mesh.userData.body.position.set(0, 0, 0);
    }
    if (v.mesh.userData.tailMaterial) v.mesh.userData.tailMaterial.userData.glowBoost = 1;

    v.isOccupied = false;
    this.currentVehicle = null;
    this.state = "ON_FOOT";
    this.heading = v.heading;
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.characterMesh.visible = true;
    this.characterMesh.position.copy(this.position);

    // Restore On-Foot HUD elements
    const crosshair = document.getElementById("crosshair");
    if (crosshair) crosshair.classList.remove("hidden");
    const onfootHud = document.getElementById("onfoot-hud");
    if (onfootHud) onfootHud.classList.remove("hidden");

    // Hide Vehicle HUD
    const vHud = document.getElementById("vehicle-hud");
    if (vHud) vHud.classList.add("hidden");

    this.soundEngine.updateEngine(0, false);
  }

  // --- 3. In-Vehicle Driving Physics (see vehicle-physics.js) ---
  updateInVehicle(delta, mapManager, trafficManager, policeManager) {
    const v = this.currentVehicle;
    const arch = v.archetype;
    if (!v.dynamics) v.dynamics = new window.VehicleDynamics(v);
    const dyn = v.dynamics;

    // Off the tarmac and sidewalks: less grip, more rolling drag.
    const road = mapManager.getNearestRoadPoint(v.position);
    const offRoad = road.distance > road.width * 0.5 + 3.6;
    const surface = offRoad ? window.VEHICLE_SURFACE.OFF_ROAD : window.VEHICLE_SURFACE.ON_ROAD;

    dyn.update(
      delta,
      {
        throttle: this.keys.up ? 1 : 0,
        brake: this.keys.down ? 1 : 0,
        steer: (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0),
        handbrake: this.keys.jump
      },
      surface
    );

    this.collideVehicleWithCity(v, dyn, mapManager);

    // The player mirrors the vehicle (police, traffic, HUD read these).
    this.speed = v.speed;
    this.velocity.copy(v.velocity);
    this.position.copy(v.position);
    this.heading = v.heading;

    v.mesh.position.copy(v.position);
    v.mesh.rotation.y = v.heading;
    window.VehicleVisuals.update(v, delta, dyn.ax, dyn.ay, dyn.steer, dyn.u);
    if (v.mesh.userData.tailMaterial) v.mesh.userData.tailMaterial.userData.glowBoost = dyn.braking ? 3.0 : 1.0;

    // Audio Engine Sync
    const rpmRatio = Math.min(Math.abs(this.speed) / arch.maxSpeed, 1.0);
    const isAuto = arch.type === "AUTO_RICKSHAW";
    this.soundEngine.updateEngine(rpmRatio, isAuto);

    // Update Speedometer UI
    const carSpeedEl = document.getElementById("car-speed");
    if (carSpeedEl) {
      carSpeedEl.textContent = Math.round(Math.abs(this.speed) * 3.6);
    }
  }

  // Buildings stop the vehicle: two circles (nose and tail) are pushed out of every
  // building box; the velocity into the wall is removed (a little bounce), a hard hit
  // shakes the camera. Scraping along a wall keeps the tangential speed.
  collideVehicleWithCity(v, dyn, mapManager) {
    const a = v.archetype;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const r = a.width / 2 + 0.1;
    const off = Math.max(0, a.length / 2 - r);
    const c = this._circle || (this._circle = new THREE.Vector3());
    let normal = null;
    [off, -off].forEach((o) => {
      c.set(v.position.x + fx * o, 0, v.position.z + fz * o);
      const x0 = c.x;
      const z0 = c.z;
      const n = mapManager.resolveCircle(c, r);
      if (!n) return;
      v.position.x += c.x - x0;
      v.position.z += c.z - z0;
      normal = n.clone();
    });
    if (!normal) return;
    const vel = v.velocity;
    const vn = vel.x * normal.x + vel.z * normal.z;
    if (vn >= 0) return;
    const vx = vel.x - 1.25 * vn * normal.x;
    const vz = vel.z - 1.25 * vn * normal.z;
    dyn.u = vx * fx + vz * fz;
    dyn.vl = vx * fz - vz * fx;
    v.speed = dyn.u;
    vel.set(vx, 0, vz);
    if (-vn > 4) {
      const now = performance.now();
      if (!this.lastWallHit || now - this.lastWallHit > 400) {
        this.lastWallHit = now;
        this.soundEngine.playCrash(Math.min(1.2, -vn / 12));
        if (window.gameEngine && window.gameEngine.cameraRig) window.gameEngine.cameraRig.addShake(Math.min(0.6, -vn / 20));
      }
    }
  }

  // Crash with traffic: lose speed and get nudged off line (0.5 s cooldown per car).
  onVehicleImpact(other) {
    const v = this.currentVehicle;
    const now = performance.now();
    if (!v || !v.dynamics || (other.lastImpact && now - other.lastImpact < 500)) return;
    other.lastImpact = now;
    v.dynamics.applyImpact(0.6);
    if (window.gameEngine && window.gameEngine.cameraRig) window.gameEngine.cameraRig.addShake(0.45);
  }

  takeDamage(amount) {
    if (this.armor > 0) {
      this.armor = Math.max(0, this.armor - amount);
    } else {
      this.health = Math.max(0, this.health - amount);
    }

    if (window.gameEngine && window.gameEngine.cameraRig) window.gameEngine.cameraRig.addShake(0.35);

    const flash = document.getElementById("hit-flash");
    if (flash) {
      flash.classList.remove("active");
      void flash.offsetWidth;
      flash.classList.add("active");
      setTimeout(() => flash.classList.remove("active"), 350);
    }

    if (this.health <= 0) {
      this.onWasted();
    }
  }

  onWasted() {
    const banner = document.getElementById("wasted-banner");
    if (banner) banner.classList.remove("hidden");
    setTimeout(() => {
      if (banner) banner.classList.add("hidden");
      this.respawnAtHospital();
    }, 3500);
  }

  respawnAtHospital() {
    this.health = 100;
    this.armor = 50;
    this.cash = Math.max(0, this.cash - 500);
    if (this.state === "IN_VEHICLE") this.exitVehicle();
    // Sunrise Hospital (or Kusumagiri, whichever is nearer)
    const map = window.mapManager;
    const spot = map ? map.nearestLandmarkFront(["sunrise", "kusumagiri"], this.position) : null;
    if (spot) this.position.set(spot.x, 0, spot.z);
    else this.position.set(this.spawn.x, 0, this.spawn.z);
    this.velocity.set(0, 0, 0);
    this.characterMesh.position.copy(this.position);
    if (window.policeManager) window.policeManager.wantedLevel = 0;
  }
}

window.PlayerController = PlayerController;

// Floating Combat & Cash Reward Popups
window.showCombatPopup = function(text, type = "damage") {
  const container = document.getElementById("combat-popups");
  if (!container) return;
  const pop = document.createElement("div");
  pop.className = `combat-popup ${type === "cash" ? "popup-cash" : "popup-damage"}`;
  pop.textContent = text;
  const x = window.innerWidth / 2 + (Math.random() - 0.5) * 80;
  const y = window.innerHeight / 2 - 20 + (Math.random() - 0.5) * 40;
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  container.appendChild(pop);
  setTimeout(() => pop.remove(), 1050);
};

