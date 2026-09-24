/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 5: KERALA POLICE & WANTED LEVEL AI
 * Implements PoliceWantedContract with 1-5 Stars, sirens, pursuits, and arrest mechanics.
 * Jeeps spawn on the roads behind the player and chase along the road graph (at each
 * junction they take the arm that points at the player); within sight range they drive
 * straight at the player, sliding along buildings instead of through them.
 * BUSTED sends you to the nearest police station (Thrikkakara or Infopark).
 */

class KeralaPoliceManager {
  constructor(scene, soundEngine) {
    this.scene = scene;
    this.soundEngine = soundEngine;
    this.config = window.KAKKANAD_CONFIG;
    this.map = window.mapManager || null;

    this.wantedLevel = 0; // 0 to 5 stars
    this.crimeHeat = 0;
    this.evasionTimer = 0;

    this.policeUnits = [];
    this.maxPoliceJeeps = 3;
    this.directRange = 70; // leave the roads and ram within this distance

    this.strobeTimer = 0;
    this.strobeState = false;
    this._p = {};

    this.initPoliceUnits();
  }

  initPoliceUnits() {
    for (let i = 0; i < this.maxPoliceJeeps; i++) {
      const mesh = window.vehicleModelFactory.createPoliceJeepMesh();
      if (window.TrafficManager) window.TrafficManager.trimShadowCasters(mesh);
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
        isActive: false,
        nav: null,
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

  // Put a unit on the road network: nearest lane to (x, z), facing the player.
  attachToRoad(p, player) {
    const T = window.trafficManager;
    const map = this.map || window.mapManager;
    if (!T || !map) return false;
    const hit = map.graph.nearest(p.position.x, p.position.z, 300);
    if (!hit) return false;
    const e = hit.edge;
    const toPlayer = (player.position.x - hit.x) * hit.dx + (player.position.z - hit.z) * hit.dz;
    const dir = toPlayer >= 0 ? 1 : -1;
    const lane = map.graph.lanesPerDirection(e) - 1; // the fast lane
    const line = T.laneLine(e, dir, lane);
    const s = dir > 0 ? hit.s - e.trimA : e.len - e.trimB - hit.s;
    p.nav = { line, s: Math.max(0, Math.min(line.len, s)), lane, turn: null };
    return true;
  }

  // At the end of a lane line, take the arm that points most towards the player.
  chooseArm(p, player) {
    const T = window.trafficManager;
    const map = this.map || window.mapManager;
    const g = map.graph;
    const line = p.nav.line;
    const node = g.endNode(line.edge, line.dir);
    const arriving = g.armOf(node, line.edge, line.dir);
    let options = node.arms.filter((a) => a !== arriving);
    if (!options.length) options = [arriving];
    const tx = player.position.x - node.x;
    const tz = player.position.z - node.z;
    const tl = Math.hypot(tx, tz) || 1;
    let best = options[0];
    let bestScore = -Infinity;
    options.forEach((a) => {
      const score = (a.dx * tx + a.dz * tz) / tl + (a.edge.road.cls === "primary" ? 0.1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    });
    T.buildTurn(p, best, arriving); // same smooth junction curve as traffic
  }

  update(delta, player, mapManager) {
    if (delta > 0.1) delta = 0.1;
    if (mapManager) this.map = mapManager;

    this.updateWantedUI();

    // Strobe lights
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

    let playerSpotted = false;
    const topSpeed = 22.0 + this.wantedLevel * 2.5;

    this.policeUnits.forEach((p) => {
      if (!p.isActive) return;
      const d = p.position.distanceTo(player.position);
      if (d < 75.0) playerSpotted = true;
      if (d > 520) {
        // lost far behind: bring the unit back in behind the player
        this.spawnUnit(p, player);
        return;
      }

      p.speed = Math.min(topSpeed, p.speed + 18.0 * delta);
      const direct = d < this.directRange || !p.nav;
      if (direct) {
        // Ram mode: steer at the player, slide along buildings
        p.nav = null;
        const targetHeading = Math.atan2(player.position.x - p.position.x, player.position.z - p.position.z);
        let diff = targetHeading - p.heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        p.heading += diff * (4.5 * delta);
        p.position.x += Math.sin(p.heading) * p.speed * delta;
        p.position.z += Math.cos(p.heading) * p.speed * delta;
        if (this.map && this.map.resolveCircle(p.position, 1.1)) p.speed *= 0.97;
        if (d > this.directRange + 25) this.attachToRoad(p, player);
      } else {
        // Road mode: follow lanes, choosing the arm towards the player at junctions
        const T = window.trafficManager;
        const nav = p.nav;
        const step = p.speed * delta;
        const q = this._p;
        if (nav.turn) {
          const t = nav.turn;
          t.u = Math.min(1, t.u + step / t.len);
          const u = t.u;
          q.x = (1 - u) * (1 - u) * t.P0.x + 2 * (1 - u) * u * t.P1.x + u * u * t.P2.x;
          q.z = (1 - u) * (1 - u) * t.P0.z + 2 * (1 - u) * u * t.P1.z + u * u * t.P2.z;
          q.dx = 2 * (1 - u) * (t.P1.x - t.P0.x) + 2 * u * (t.P2.x - t.P1.x);
          q.dz = 2 * (1 - u) * (t.P1.z - t.P0.z) + 2 * u * (t.P2.z - t.P1.z);
          if (u >= 1) {
            nav.line = t.next;
            nav.s = 0;
            nav.turn = null;
          }
        } else {
          nav.s += step;
          if (nav.s >= nav.line.len) {
            nav.s = nav.line.len;
            this.chooseArm(p, player);
          }
          T.lineAt(nav.line, nav.s, q);
        }
        p.position.set(q.x, 0, q.z);
        const h = Math.atan2(q.dx, q.dz);
        let diff = h - p.heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        p.heading += diff * Math.min(1, delta * 10);
      }

      p.mesh.position.copy(p.position);
      p.mesh.rotation.y = p.heading;
      if (p.mesh.visible) window.VehicleVisuals.animateAI(p, delta);

      // Ram Player
      if (d < 3.8) {
        this.soundEngine.playCrash(1.2);
        player.takeDamage(15);
        p.speed *= 0.3;
        if (Math.abs(player.speed) < 2.0 && player.velocity.lengthSq() < 1.0) {
          this.triggerBusted(player);
        }
      }
    });

    // Natural decay if hiding
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

  // Spawn on a road 90-200 m from the player, preferably behind the camera.
  spawnUnit(p, player) {
    const T = window.trafficManager;
    let placed = false;
    if (T) {
      const cam = window.gameEngine && window.gameEngine.camera;
      const f = new THREE.Vector3(0, 0, 1);
      if (cam) cam.getWorldDirection(f);
      for (let i = 0; i < 20 && !placed; i++) {
        const spot = T.pickRoadSpot(player.position, 90, 200);
        if (!spot) continue;
        const behind = (spot.x - player.position.x) * f.x + (spot.z - player.position.z) * f.z < 0;
        if (!behind && i < 14) continue;
        p.position.set(spot.x, 0, spot.z);
        placed = this.attachToRoad(p, player);
      }
    }
    if (!placed) {
      const a = Math.random() * Math.PI * 2;
      p.position.set(player.position.x + Math.cos(a) * 60, 0, player.position.z + Math.sin(a) * 60);
      p.nav = null;
    }
    p.heading = Math.atan2(player.position.x - p.position.x, player.position.z - p.position.z);
    p.speed = 8;
    p.mesh.position.copy(p.position);
    p.mesh.rotation.y = p.heading;
  }

  updateActivePoliceCount() {
    const targetActive = Math.min(this.wantedLevel, this.maxPoliceJeeps);
    const player = window.playerController;
    this.policeUnits.forEach((p, idx) => {
      if (idx < targetActive) {
        if (!p.isActive) {
          if (player) this.spawnUnit(p, player);
          p.isActive = true;
          p.mesh.visible = true;
        }
      } else {
        p.isActive = false;
        p.mesh.visible = false;
        p.nav = null;
      }
    });
  }

  deactivateAllPolice() {
    this.policeUnits.forEach((p) => {
      p.isActive = false;
      p.mesh.visible = false;
      p.nav = null;
    });
  }

  updateWantedUI() {
    for (let s = 1; s <= 5; s++) {
      const targetStar = document.getElementById(`star-${s}`);
      if (targetStar) {
        if (s <= this.wantedLevel) targetStar.classList.add("active");
        else targetStar.classList.remove("active");
      }
    }
  }

  triggerBusted(player) {
    if (this.busted) return;
    this.busted = true;
    const banner = document.getElementById("busted-banner");
    if (banner) banner.classList.remove("hidden");

    setTimeout(() => {
      this.busted = false;
      if (banner) banner.classList.add("hidden");
      player.cash = Math.max(0, player.cash - 1000);
      this.wantedLevel = 0;
      this.crimeHeat = 0;
      this.deactivateAllPolice();
      // Nearest police station (exit first: exiting places you by the car)
      if (player.state === "IN_VEHICLE") player.exitVehicle();
      const map = this.map || window.mapManager;
      const spot = map ? map.nearestLandmarkFront(["police_thrikkakara", "police_infopark"], player.position) : null;
      if (spot) player.position.set(spot.x, 0, spot.z);
      player.velocity.set(0, 0, 0);
    }, 3500);
  }
}

window.KeralaPoliceManager = KeralaPoliceManager;
