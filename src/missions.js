/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 6: KAKKANAD STORY MISSIONS ENGINE
 * Implements MissionSystemContract: four story missions between real Kakkanad places,
 * checkpoint beacons, dialogs, and GTA-style start markers in the world (walk or drive
 * into a marker to start its mission). Targets snap to the nearest roadside.
 */

class MissionEngine {
  constructor(scene, soundEngine) {
    this.scene = scene;
    this.soundEngine = soundEngine;
    this.config = window.KAKKANAD_CONFIG;
    this.missions = this.config.MISSIONS;

    this.activeMission = null;
    this.activeTarget = null;
    this.timeRemaining = 0;

    // 3D Checkpoint Beacon
    this.beaconGroup = new THREE.Group();
    const cylGeo = new THREE.CylinderGeometry(2.5, 2.5, 14, 16, 1, true);
    const cylMat = new THREE.MeshBasicMaterial({
      color: 0xffb703,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });
    cylMat.userData.glow = { day: 1.6, night: 2.4 };
    this.beaconCylinder = new THREE.Mesh(cylGeo, cylMat);
    this.beaconCylinder.position.y = 7;
    this.beaconGroup.add(this.beaconCylinder);

    const ringGeo = new THREE.RingGeometry(1.5, 3.2, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff007f, side: THREE.DoubleSide });
    ringMat.userData.glow = { day: 1.6, night: 2.4 };
    this.beaconRing = new THREE.Mesh(ringGeo, ringMat);
    this.beaconRing.position.y = 0.15;
    this.beaconGroup.add(this.beaconRing);

    this.beaconGroup.position.set(0, -9999, 0);
    this.beaconGroup.visible = false;
    this.scene.add(this.beaconGroup);

    this.buildStartMarkers();
  }

  // Nearest roadside point to a place (so a target is always reachable by road).
  roadside(pos, maxOff = 14) {
    const map = window.mapManager;
    if (!map) return { x: pos.x, z: pos.z };
    const r = map.getNearestRoadPoint(new THREE.Vector3(pos.x, 0, pos.z));
    if (!r || !Number.isFinite(r.distance)) return { x: pos.x, z: pos.z };
    const dx = pos.x - r.point.x;
    const dz = pos.z - r.point.z;
    const d = Math.hypot(dx, dz);
    if (d <= maxOff) return { x: pos.x, z: pos.z };
    const k = maxOff / d;
    return { x: r.point.x + dx * k, z: r.point.z + dz * k };
  }

  // Yellow "M" rings at every mission start (GTA-style).
  buildStartMarkers() {
    this.startMarkers = [];
    const ringGeo = new THREE.RingGeometry(1.2, 1.9, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    ringMat.userData.glow = { day: 1.8, night: 2.6 };
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1b1b";
    ctx.font = "bold 84px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("M", 64, 70);
    const tex = new THREE.CanvasTexture(canvas);
    const iconMat = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
    iconMat.userData.glow = { day: 1.0, night: 1.6 };
    this.missions.forEach((m) => {
      const group = new THREE.Group();
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.12;
      group.add(ring);
      const icon = new THREE.Sprite(iconMat);
      icon.scale.set(1.6, 1.6, 1);
      icon.position.y = 2.6;
      group.add(icon);
      const p = this.roadside(m.startPos, 10);
      group.position.set(p.x, 0, p.z);
      this.scene.add(group);
      this.startMarkers.push({ mission: m, group, icon, armed: true });
    });
  }

  startMission(missionId) {
    const mission = this.missions.find((m) => m.id === missionId);
    if (!mission) return;

    this.activeMission = mission;
    this.timeRemaining = mission.timeLimit;
    this.activeTarget = this.roadside(mission.targetPos);

    // Position beacon at destination
    this.beaconGroup.position.set(this.activeTarget.x, 0, this.activeTarget.z);
    this.beaconGroup.visible = true;
    this.startMarkers.forEach((s) => (s.group.visible = false));

    // Show HUD Banner
    const banner = document.getElementById("mission-banner");
    const mTitle = document.getElementById("hud-mission-title");
    const mDesc = document.getElementById("hud-mission-desc");
    if (banner) banner.classList.remove("hidden");
    if (mTitle) mTitle.textContent = mission.title;
    if (mDesc) mDesc.textContent = mission.briefing;

    // Show Dialog
    this.showDialog(mission.client, mission.briefing);

    // Mission 3 Special: Trigger 3-Star Police
    if (missionId === "mission_3" && window.policeManager) {
      window.policeManager.addCrimeHeat(140);
    }
  }

  update(delta, player) {
    if (delta > 0.1) delta = 0.1;
    if (!this.activeMission) {
      this.updateStartMarkers(delta, player);
      return;
    }

    // Beacon Rotation Animation
    this.beaconCylinder.rotation.y += 1.5 * delta;
    this.beaconRing.rotation.z += 1.0 * delta;

    // Timer Countdown
    this.timeRemaining -= delta;

    const timerEl = document.getElementById("hud-mission-timer");
    if (timerEl) {
      const m = Math.floor(Math.max(0, this.timeRemaining) / 60);
      const s = Math.floor(Math.max(0, this.timeRemaining) % 60);
      timerEl.textContent = `⏱ ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // Check Destination Proximity
    const t = this.activeTarget;
    const distToTarget = Math.hypot(player.position.x - t.x, player.position.z - t.z);

    if (distToTarget <= this.activeMission.targetRadius) {
      this.completeMission(player);
    } else if (this.timeRemaining <= 0) {
      this.failMission();
    }
  }

  updateStartMarkers(delta, player) {
    const started = window.gameEngine && window.gameEngine.started;
    this.startMarkers.forEach((s) => {
      s.group.visible = true;
      s.icon.position.y = 2.6 + Math.sin(performance.now() / 400) * 0.18;
      const d = Math.hypot(player.position.x - s.group.position.x, player.position.z - s.group.position.z);
      if (d > 6) s.armed = true; // leave the marker before it can trigger again
      else if (d < 2.4 && s.armed && started) {
        s.armed = false;
        this.startMission(s.mission.id);
      }
    });
  }

  completeMission(player) {
    const mission = this.activeMission;
    this.soundEngine.playHorn("auto");

    player.cash += mission.rewardCash;
    const cashEl = document.getElementById("cash-val");
    if (cashEl) cashEl.textContent = player.cash.toString().padStart(7, '0');

    this.showDialog("MISSION PASSED", `+₹${mission.rewardCash} REWARD!`);
    this.endMission();
  }

  failMission() {
    this.showDialog("MISSION FAILED", "You were too late! The deadline passed.");
    this.endMission();
  }

  endMission() {
    this.beaconGroup.visible = false;
    this.activeMission = null;
    this.activeTarget = null;
    const player = window.playerController;
    this.startMarkers.forEach((s) => {
      // don't re-trigger a marker the player is standing in
      if (player && Math.hypot(player.position.x - s.group.position.x, player.position.z - s.group.position.z) < 6) s.armed = false;
    });
    const banner = document.getElementById("mission-banner");
    if (banner) banner.classList.add("hidden");
  }

  showDialog(speaker, text) {
    const box = document.getElementById("dialog-box");
    const spkEl = document.getElementById("dialog-speaker");
    const txtEl = document.getElementById("dialog-text");

    if (box && spkEl && txtEl) {
      spkEl.textContent = speaker.toUpperCase();
      txtEl.textContent = `"${text}"`;
      box.classList.remove("hidden");
      setTimeout(() => box.classList.add("hidden"), 5500);
    }
  }
}

window.MissionEngine = MissionEngine;
