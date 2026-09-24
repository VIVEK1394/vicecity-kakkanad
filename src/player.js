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

    // Spatial State (Starts at Kakkanad Bus Stand)
    this.position = new THREE.Vector3(-70, 0, 160);
    this.velocity = new THREE.Vector3();
    this.heading = 0; // Radians
    this.speed = 0;   // Forward speed when driving

    // On-Foot Dynamics
    this.walkSpeed = 6.0;    // m/s
    this.sprintSpeed = 11.5; // m/s
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.walkAnimTimer = 0;

    // Melee Combat State
    this.isPunching = false;
    this.punchTimer = 0;
    this.punchCooldown = 0;

    // In-Vehicle Dynamics
    this.steeringAngle = 0;

    // 3D Character Mesh
    this.characterMesh = window.vehicleModelFactory.createCharacterMesh();
    this.characterMesh.position.copy(this.position);
    this.scene.add(this.characterMesh);

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
    const starterMesh = window.vehicleModelFactory.createAutoRickshawMesh();
    starterMesh.position.set(-67.5, 0, 158);
    this.scene.add(starterMesh);

    this.starterVehicle = {
      id: "starter_auto",
      type: "AUTO_RICKSHAW",
      archetype: this.config.VEHICLE_ARCHETYPES.AUTO_RICKSHAW,
      mesh: starterMesh,
      position: new THREE.Vector3(-67.5, 0, 158),
      heading: 0.1,
      speed: 0,
      steeringAngle: 0,
      isOccupied: false
    };
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
        case "KeyF": case "KeyE":       this.onActionKey(); break;
        case "KeyH":                    this.onHornKey(); break;
        case "KeyR":                    this.soundEngine.nextStation(); break;
        case "KeyJ": case "ControlLeft": case "ControlRight": case "Enter":
          if (this.state === "ON_FOOT") this.performPunch();
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
      if (e.button === 0 && this.state === "ON_FOOT") {
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
    this.isPunching = true;
    this.punchTimer = 0.22;

    this.soundEngine.playPunchWhoosh();

    // Check hit against nearby pedestrians
    if (window.trafficManager) {
      window.trafficManager.checkPedestrianPunchHit(this);
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
    const moveSpeed = this.keys.sprint ? this.sprintSpeed : this.walkSpeed;
    const moveDir = new THREE.Vector3();

    if (this.keys.up)    moveDir.z -= 1;
    if (this.keys.down)  moveDir.z += 1;
    if (this.keys.left)  moveDir.x -= 1;
    if (this.keys.right) moveDir.x += 1;

    const isMoving = moveDir.lengthSq() > 0.01;

    if (isMoving) {
      moveDir.normalize();
      this.heading = Math.atan2(moveDir.x, moveDir.z);

      this.velocity.x = moveDir.x * moveSpeed;
      this.velocity.z = moveDir.z * moveSpeed;

      this.position.x += this.velocity.x * delta;
      this.position.z += this.velocity.z * delta;

      // Leg swing animation
      this.walkAnimTimer += delta * (this.keys.sprint ? 14 : 9);
      const swing = Math.sin(this.walkAnimTimer) * 0.45;
      if (this.characterMesh.userData.leftLeg) {
        this.characterMesh.userData.leftLeg.rotation.x = swing;
        this.characterMesh.userData.rightLeg.rotation.x = -swing;
        this.characterMesh.userData.leftArm.rotation.x = -swing;
      }
    } else {
      this.velocity.set(0, 0, 0);
      if (this.characterMesh.userData.leftLeg) {
        this.characterMesh.userData.leftLeg.rotation.x = 0;
        this.characterMesh.userData.rightLeg.rotation.x = 0;
        this.characterMesh.userData.leftArm.rotation.x = 0;
      }
    }

    // Punch Arm Swing Animation
    if (this.isPunching) {
      this.punchTimer -= delta;
      if (this.characterMesh.userData.rightArmPivot) {
        this.characterMesh.userData.rightArmPivot.rotation.x = -1.4; // Punch straight forward!
      }
      if (this.punchTimer <= 0) {
        this.isPunching = false;
        if (this.characterMesh.userData.rightArmPivot) {
          this.characterMesh.userData.rightArmPivot.rotation.x = 0;
        }
      }
    } else if (isMoving) {
      const swing = Math.sin(this.walkAnimTimer) * 0.45;
      if (this.characterMesh.userData.rightArmPivot) {
        this.characterMesh.userData.rightArmPivot.rotation.x = swing;
      }
    } else {
      if (this.characterMesh.userData.rightArmPivot) {
        this.characterMesh.userData.rightArmPivot.rotation.x = 0;
      }
    }

    // Jump Physics
    if (this.keys.jump && this.isGrounded) {
      this.verticalVelocity = 6.5;
      this.isGrounded = false;
    }

    if (!this.isGrounded) {
      this.verticalVelocity -= 18.0 * delta;
      this.position.y += this.verticalVelocity * delta;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      }
    }

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

    v.isOccupied = false;
    this.currentVehicle = null;
    this.state = "ON_FOOT";
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

  // --- 3. In-Vehicle Driving Physics ---
  updateInVehicle(delta, mapManager, trafficManager, policeManager) {
    const v = this.currentVehicle;
    const arch = v.archetype;

    // Acceleration & Braking
    if (this.keys.up) {
      this.speed = Math.min(arch.maxSpeed, this.speed + arch.accel * delta);
    } else if (this.keys.down) {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - arch.brake * delta);
      } else {
        this.speed = Math.max(-10.0, this.speed - arch.accel * 0.6 * delta);
      }
    } else {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - 7.0 * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + 7.0 * delta);
      }
    }

    // Handbrake Drift
    if (this.keys.jump && Math.abs(this.speed) > 5.0) {
      this.speed = Math.max(0, this.speed - 14.0 * delta);
    }

    // Steering
    const steerDir = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0);
    const turnRate = (arch.handling * 0.085) * (this.speed >= 0 ? 1 : -1);
    v.heading += steerDir * turnRate * delta;

    // Forward Motion Vector
    const fwd = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
    v.position.addScaledVector(fwd, this.speed * delta);
    this.position.copy(v.position);

    // Synchronize 3D Vehicle Mesh
    v.mesh.position.copy(v.position);
    v.mesh.rotation.y = v.heading;

    // Animate wheels
    window.vehicleModelFactory.updateWheelRotation(v.mesh, this.speed, delta);

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

  takeDamage(amount) {
    if (this.armor > 0) {
      this.armor = Math.max(0, this.armor - amount);
    } else {
      this.health = Math.max(0, this.health - amount);
    }

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
    this.position.set(-70, 0, 160);
    if (this.state === "IN_VEHICLE") {
      this.exitVehicle();
    }
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

