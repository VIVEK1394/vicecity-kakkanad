/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 5: KERALA POLICE & WANTED LEVEL AI
 * Implements PoliceWantedContract with 1-5 Stars, sirens, pursuits, and arrest mechanics.
 */

class KeralaPoliceManager {
  constructor(scene, soundEngine) {
    this.scene = scene;
    this.soundEngine = soundEngine;
    this.config = window.KAKKANAD_CONFIG;

    this.wantedLevel = 0; // 0 to 5 stars
    this.crimeHeat = 0;
    this.evasionTimer = 0;

    // Active Police Units Pool
    this.policeUnits = [];
    this.maxPoliceJeeps = 3;

    // Sirens Audio Loop & Strobe FX State
    this.strobeTimer = 0;
    this.strobeState = false;

    this.initPoliceUnits();
  }

  initPoliceUnits() {
    for (let i = 0; i < this.maxPoliceJeeps; i++) {
      const mesh = window.vehicleModelFactory.createPoliceJeepMesh();
      mesh.visible = false;
      if (mesh.userData.driverAvatar) mesh.userData.driverAvatar.visible = true;
      this.scene.add(mesh);

      this.policeUnits.push({
        id: `police_jeep_${i}`,
        type: "POLICE_JEEP",
        archetype: this.config.VEHICLE_ARCHETYPES.POLICE_JEEP,
        mesh: mesh,
        position: new THREE.Vector3(0, 0, 0),
        heading: 0,
        speed: 0,
        isActive: false
      });
    }
  }

  addCrimeHeat(amount) {
    this.crimeHeat += amount;
    const oldLevel = this.wantedLevel;

    if (this.crimeHeat >= 180) this.wantedLevel = 4;
    else if (this.crimeHeat >= 120) this.wantedLevel = 3;
    else if (this.crimeHeat >= 60) this.wantedLevel = 2;
    else if (this.crimeHeat >= 25) this.wantedLevel = 1;

    this.evasionTimer = 0;

    if (this.wantedLevel > oldLevel) {
      this.soundEngine.playHorn("police_siren");
      this.updateActivePoliceCount();
    }
  }

  update(delta, player, mapManager) {
    if (delta > 0.1) delta = 0.1;

    // 1. Update Wanted Stars Display
    this.updateWantedUI();

    // 2. Strobe Lights Animation
    this.strobeTimer += delta;
    if (this.strobeTimer > 0.12) {
      this.strobeTimer = 0;
      this.strobeState = !this.strobeState;

      this.policeUnits.forEach((p) => {
        if (p.isActive && p.mesh.userData) {
          if (p.mesh.userData.strobeRed) p.mesh.userData.strobeRed.visible = this.strobeState;
          if (p.mesh.userData.strobeBlue) p.mesh.userData.strobeBlue.visible = !this.strobeState;
        }
      });

      const strobeFx = document.getElementById("siren-strobe");
      if (strobeFx) {
        if (this.wantedLevel >= 2) strobeFx.classList.add("active");
        else strobeFx.classList.remove("active");
      }
    }

    if (this.wantedLevel === 0) {
      this.deactivateAllPolice();
      return;
    }

    // 3. Evasion & Decay Timer
    let playerSpotted = false;

    this.policeUnits.forEach((p) => {
      if (!p.isActive) return;

      const d = p.position.distanceTo(player.position);
      if (d < 75.0) playerSpotted = true;

      // Pursuit AI: Steer and accelerate towards player
      const dx = player.position.x - p.position.x;
      const dz = player.position.z - p.position.z;
      const targetHeading = Math.atan2(dx, dz);

      let diff = targetHeading - p.heading;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      p.heading += diff * (4.5 * delta);

      // Accelerate towards player (Max speed scales with wanted level)
      const topSpeed = 22.0 + this.wantedLevel * 2.5;
      if (p.speed < topSpeed) {
        p.speed += 18.0 * delta;
      }

      // Move forward
      const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
      p.position.addScaledVector(fwd, p.speed * delta);

      p.mesh.position.copy(p.position);
      p.mesh.rotation.y = p.heading;
      if (p.mesh.visible) window.VehicleVisuals.animateAI(p, delta);

      // Ram Player
      if (d < 3.8) {
        this.soundEngine.playCrash(1.2);
        player.takeDamage(15);
        p.speed *= 0.3;

        // Arrest check (if player is stationary on foot or car)
        if (Math.abs(player.speed) < 2.0 && player.velocity.lengthSq() < 1.0) {
          this.triggerBusted(player);
        }
      }
    });

    // 4. Natural Decay if hiding
    if (!playerSpotted) {
      this.evasionTimer += delta;
      if (this.evasionTimer >= this.config.WANTED.DECAY_TIME_SECONDS) {
        this.evasionTimer = 0;
        this.wantedLevel = Math.max(0, this.wantedLevel - 1);
        this.crimeHeat = Math.max(0, this.crimeHeat - 50);
        this.updateActivePoliceCount();
      }
    }
  }

  updateActivePoliceCount() {
    const targetActive = Math.min(this.wantedLevel, this.maxPoliceJeeps);

    this.policeUnits.forEach((p, idx) => {
      if (idx < targetActive) {
        if (!p.isActive) {
          // Spawn behind player view
          const player = window.playerController;
          const spawnOffset = new THREE.Vector3(
            (Math.random() - 0.5) * 60 - 40,
            0,
            (Math.random() - 0.5) * 60 - 40
          );
          p.position.copy(player ? player.position : new THREE.Vector3()).add(spawnOffset);
          p.position.y = 0;
          p.isActive = true;
          p.mesh.visible = true;
        }
      } else {
        p.isActive = false;
        p.mesh.visible = false;
      }
    });
  }

  deactivateAllPolice() {
    this.policeUnits.forEach((p) => {
      p.isActive = false;
      p.mesh.visible = false;
    });
  }

  updateWantedUI() {
    for (let s = 1; s <= 5; s++) {
      const starEl = document.getElementById(`star-1`);
      const targetStar = document.getElementById(`star-${s}`);
      if (targetStar) {
        if (s <= this.wantedLevel) {
          targetStar.classList.add("active");
        } else {
          targetStar.classList.remove("active");
        }
      }
    }
  }

  triggerBusted(player) {
    const banner = document.getElementById("busted-banner");
    if (banner) banner.classList.remove("hidden");

    setTimeout(() => {
      if (banner) banner.classList.add("hidden");
      player.cash = Math.max(0, player.cash - 1000);
      this.wantedLevel = 0;
      this.crimeHeat = 0;
      this.deactivateAllPolice();
      // Respawn at Collectorate Police Station (exit first: exiting places you by the car)
      if (player.state === "IN_VEHICLE") player.exitVehicle();
      player.position.set(-220, 0, 240);
      player.velocity.set(0, 0, 0);
    }, 3500);
  }
}

window.KeralaPoliceManager = KeralaPoliceManager;
