/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 8: VICE CITY HUD & RADAR MINIMAP
 * Implements HUDContract with circular radar, vitals, wanted stars, and location tracker.
 */

class HUDController {
  constructor(mapManager, clock) {
    this.mapManager = mapManager;
    this.clock = clock || null; // shared TimeOfDay (drives sun, sky and lighting)
    this.viewYaw = null; // camera yaw: the radar rotates with the view, like GTA
    this.compassEl = document.querySelector(".compass-n");
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

    // 4. Current locality and street (real Kakkanad names)
    this.locationTimer = (this.locationTimer || 0) - delta;
    if (this.locationEl && this.locationTimer <= 0) {
      this.locationTimer = 0.25;
      const nearestRoad = this.mapManager.getNearestRoadPoint(player.position);
      const place = this.mapManager.localityAt ? this.mapManager.localityAt(player.position.x, player.position.z) : null;
      const road = nearestRoad && nearestRoad.distance < 40 ? nearestRoad.roadName : null;
      const text = [place && place.name, road].filter(Boolean).join(" · ").toUpperCase();
      if (text && text !== this.locationText) {
        this.locationText = text;
        this.locationEl.textContent = text;
      }
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

    // View-aligned radar: camera forward is up, camera right is right.
    const inCar = player.state === "IN_VEHICLE" && player.currentVehicle;
    const heading = inCar ? player.currentVehicle.heading : player.heading;
    const yaw = this.viewYaw !== null ? this.viewYaw : heading;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    ctx.save();
    ctx.translate(center, center);
    ctx.transform(-fz, -fx, fx, -fz, 0, 0); // columns: world +X -> (right . x, -forward . x), world +Z likewise
    if (this.compassEl) {
      // North (-Z) marker orbits the rim
      this.compassEl.style.left = `${50 - 43 * fx}%`;
      this.compassEl.style.top = `${50 + 43 * fz}%`;
      this.compassEl.style.transform = "translate(-50%, -50%)";
    }

    const polyline = (pts) => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const rx = (pts[i].x - player.position.x) * scale;
        const rz = (pts[i].z - player.position.z) * scale;
        if (i === 0) ctx.moveTo(rx, rz);
        else ctx.lineTo(rx, rz);
      }
      ctx.stroke();
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // A. Rivers, then the road network (wider lines for bigger roads)
    const geo = window.KAKKANAD_GEO;
    if (geo) {
      ctx.strokeStyle = "rgba(40, 120, 200, 0.55)";
      geo.rivers.forEach((r) => {
        ctx.lineWidth = Math.max(3, r.width * scale);
        polyline(r.points);
      });
    }
    const widths = { primary: 5, secondary: 3.6, tertiary: 2.4 };
    this.config.ROAD_NETWORK.forEach((road) => {
      ctx.strokeStyle = road.cls === "primary" ? "rgba(0, 240, 255, 0.62)" : "rgba(0, 240, 255, 0.4)";
      ctx.lineWidth = widths[road.cls] || 2.4;
      polyline(road.points);
    });

    // B. Draw Landmarks (at their placed positions)
    const placed = this.mapManager.landmarkPositions || {};
    this.config.KEY_LANDMARKS.forEach((lm) => {
      const at = placed[lm.id] || lm;
      const lx = (at.x - player.position.x) * scale;
      const lz = (at.z - player.position.z) * scale;
      if (Math.hypot(lx, lz) < center - 6) {
        ctx.fillStyle = `#${lm.color.toString(16).padStart(6, '0')}`;
        ctx.fillRect(lx - 3, lz - 3, 6, 6);
      }
    });

    // C. Draw Active Mission Destination Marker (Yellow Diamond)
    if (missionEngine && missionEngine.activeMission) {
      const t = missionEngine.activeTarget || missionEngine.activeMission.targetPos;
      let mx = (t.x - player.position.x) * scale;
      let mz = (t.z - player.position.z) * scale;
      const md = Math.hypot(mx, mz);
      if (md > center - 8) {
        // off the radar: pin to the rim in its direction
        mx *= (center - 8) / md;
        mz *= (center - 8) / md;
      }

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

    // F. Player arrow in the centre, pointing where the player faces relative to the view
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(-(heading - yaw));
    ctx.fillStyle = "#ff007f";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-5, 6);
    ctx.lineTo(5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

window.HUDController = HUDController;
