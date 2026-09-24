/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 6: KAKKANAD STORY MISSIONS ENGINE
 * Implements MissionSystemContract with 3 full story missions, checkpoint beacons, and dialogs.
 */

class MissionEngine {
  constructor(scene, soundEngine) {
    this.scene = scene;
    this.soundEngine = soundEngine;
    this.config = window.KAKKANAD_CONFIG;
    this.missions = this.config.MISSIONS;

    this.activeMission = null;
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
    this.beaconCylinder = new THREE.Mesh(cylGeo, cylMat);
    this.beaconCylinder.position.y = 7;
    this.beaconGroup.add(this.beaconCylinder);

    const ringGeo = new THREE.RingGeometry(1.5, 3.2, 16);
    ringGeo.rotateX(-Math.PI / 2);
    this.beaconRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff007f, side: THREE.DoubleSide }));
    this.beaconRing.position.y = 0.15;
    this.beaconGroup.add(this.beaconRing);

    this.beaconGroup.position.set(0, -9999, 0);
    this.beaconGroup.visible = false;
    this.scene.add(this.beaconGroup);
  }

  startMission(missionId) {
    const mission = this.missions.find((m) => m.id === missionId);
    if (!mission) return;

    this.activeMission = mission;
    this.timeRemaining = mission.timeLimit;

    // Position beacon at destination
    this.beaconGroup.position.set(mission.targetPos.x, 0, mission.targetPos.z);
    this.beaconGroup.visible = true;

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
    if (!this.activeMission) return;
    if (delta > 0.1) delta = 0.1;

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
    const distToTarget = player.position.distanceTo(
      new THREE.Vector3(this.activeMission.targetPos.x, 0, this.activeMission.targetPos.z)
    );

    if (distToTarget <= this.activeMission.targetRadius) {
      this.completeMission(player);
    } else if (this.timeRemaining <= 0) {
      this.failMission();
    }
  }

  completeMission(player) {
    const mission = this.activeMission;
    this.soundEngine.playHorn("auto");

    player.cash += mission.rewardCash;
    const cashEl = document.getElementById("cash-val");
    if (cashEl) cashEl.textContent = player.cash.toString().padStart(7, '0');

    this.showDialog("MISSION PASSED", `+₹${mission.rewardCash} REWARD!`);

    this.beaconGroup.visible = false;
    this.activeMission = null;

    const banner = document.getElementById("mission-banner");
    if (banner) banner.classList.add("hidden");
  }

  failMission() {
    this.showDialog("MISSION FAILED", "You were too late! The deadline passed.");
    this.beaconGroup.visible = false;
    this.activeMission = null;

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
