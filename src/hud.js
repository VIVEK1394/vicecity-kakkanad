/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 8: VICE CITY HUD & RADAR MINIMAP
 * Implements HUDContract with circular radar, vitals, wanted stars, and location tracker.
 */

class HUDController {
  constructor(mapManager, clock) {
    this.mapManager = mapManager;
    this.clock = clock || null; // shared TimeOfDay (drives sun, sky and lighting)
    this.config = window.KAKKANAD_CONFIG;

    // DOM Elements
    this.healthBar = document.getElementById("health-bar");
    this.healthText = document.getElementById("health-text");
    this.armorBar = document.getElementById("armor-bar");
    this.armorText = document.getElementById("armor-text");
    this.cashVal = document.getElementById("cash-val");
    this.locationEl = document.getElementById("current-location");
    this.clockEl = document.getElementById("clock-display");

    // Radar Canvas
    this.radarCanvas = document.getElementById("radar-canvas");
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext("2d") : null;

    // Game Clock (Starts at 8:45 AM)
    this.gameMinutes = 8 * 60 + 45;
  }

  update(player, trafficManager, policeManager, missionEngine, delta) {
    // 1. Game Clock
    if (this.clock) {
      if (this.clockEl) this.clockEl.textContent = this.clock.format();
    } else {
      this.gameMinutes += delta * 2.0; // 1 real second = 2 game minutes
    }
    if (!this.clock && this.clockEl) {
      const h = Math.floor((this.gameMinutes / 60) % 24);
      const m = Math.floor(this.gameMinutes % 60);
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 || 12;
      this.clockEl.textContent = `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
    }

    // 2. Health & Armor Vitals
    if (this.healthBar) this.healthBar.style.width = `${Math.max(0, player.health)}%`;
    if (this.healthText) this.healthText.textContent = Math.round(player.health);
    if (this.armorBar) this.armorBar.style.width = `${Math.max(0, player.armor)}%`;
    if (this.armorText) this.armorText.textContent = Math.round(player.armor);

    // 3. Cash Counter
    if (this.cashVal) {
      this.cashVal.textContent = Math.round(player.cash).toString().padStart(7, '0');
    }

    // 4. Current Street / Landmark
    const nearestRoad = this.mapManager.getNearestRoadPoint(player.position);
    if (this.locationEl && nearestRoad) {
      const roadObj = this.config.ROAD_NETWORK.find((r) => r.id === nearestRoad.roadId);
      if (roadObj) this.locationEl.textContent = roadObj.name.toUpperCase();
    }

    // 5. Radar Minimap Rendering
    this.drawRadar(player, trafficManager, policeManager, missionEngine);
  }

  drawRadar(player, trafficManager, policeManager, missionEngine) {
    if (!this.radarCtx) return;
    const ctx = this.radarCtx;
    const size = this.radarCanvas.width;
    const center = size / 2;
    const radarRange = 320; // 320 meters radius
    const scale = center / radarRange;

    ctx.clearRect(0, 0, size, size);

    // Save context for player-centric rotation
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(-player.heading);

    // A. Draw Kakkanad Road Network
    ctx.strokeStyle = "rgba(0, 240, 255, 0.45)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    this.config.ROAD_NETWORK.forEach((road) => {
      const pts = road.points;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const rx = (pts[i].x - player.position.x) * scale;
        const rz = (pts[i].z - player.position.z) * scale;
        if (i === 0) ctx.moveTo(rx, rz);
        else ctx.lineTo(rx, rz);
      }
      ctx.stroke();
    });

    // B. Draw Landmarks
    this.config.KEY_LANDMARKS.forEach((lm) => {
      const lx = (lm.x - player.position.x) * scale;
      const lz = (lm.z - player.position.z) * scale;
      if (Math.hypot(lx, lz) < center - 6) {
        ctx.fillStyle = `#${lm.color.toString(16).padStart(6, '0')}`;
        ctx.fillRect(lx - 3, lz - 3, 6, 6);
      }
    });

    // C. Draw Active Mission Destination Marker (Yellow Diamond)
    if (missionEngine && missionEngine.activeMission) {
      const m = missionEngine.activeMission;
      const mx = (m.targetPos.x - player.position.x) * scale;
      const mz = (m.targetPos.z - player.position.z) * scale;

      ctx.fillStyle = "#ffb703";
      ctx.beginPath();
      ctx.arc(mx, mz, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // D. Draw Traffic Vehicles (Grey dots)
    if (trafficManager) {
      ctx.fillStyle = "rgba(220, 230, 242, 0.75)";
      trafficManager.vehicles.forEach((v) => {
        const vx = (v.position.x - player.position.x) * scale;
        const vz = (v.position.z - player.position.z) * scale;
        if (Math.hypot(vx, vz) < center - 4) {
          ctx.fillRect(vx - 2, vz - 2, 4, 4);
        }
      });
    }

    // E. Draw Police Units (Flashing Red/Blue dots)
    if (policeManager && policeManager.wantedLevel > 0) {
      policeManager.policeUnits.forEach((p) => {
        if (p.isActive) {
          const px = (p.position.x - player.position.x) * scale;
          const pz = (p.position.z - player.position.z) * scale;
          if (Math.hypot(px, pz) < center - 4) {
            ctx.fillStyle = policeManager.strobeState ? "#ff0055" : "#00f0ff";
            ctx.beginPath();
            ctx.arc(px, pz, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    }

    ctx.restore();

    // F. Draw Player Triangle in Center (Always faces forward)
    ctx.fillStyle = "#ff007f";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center, center - 7);
    ctx.lineTo(center - 5, center + 6);
    ctx.lineTo(center + 5, center + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

window.HUDController = HUDController;
