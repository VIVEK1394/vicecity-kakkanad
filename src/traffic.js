/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 4: AMBIENT TRAFFIC & PEDESTRIAN SYSTEM (WITH COMBAT & HIT REACTIONS)
 * Features pedestrian punch reactions, ragdoll knockdowns, cash drops, and vehicular collisions.
 */

class TrafficManager {
  constructor(scene, mapManager) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.config = window.KAKKANAD_CONFIG;

    this.vehicles = [];
    this.pedestrians = [];

    this.initTraffic();
    this.initPedestrians();
  }

  initTraffic() {
    const archetypes = this.config.VEHICLE_ARCHETYPES;
    const poolConfigs = [
      { type: "AUTO_RICKSHAW", arch: archetypes.AUTO_RICKSHAW, builder: () => window.vehicleModelFactory.createAutoRickshawMesh() },
      { type: "AUTO_RICKSHAW", arch: archetypes.AUTO_RICKSHAW, builder: () => window.vehicleModelFactory.createAutoRickshawMesh() },
      { type: "KERALA_BUS",    arch: archetypes.KERALA_BUS,    builder: () => window.vehicleModelFactory.createKeralaBusMesh() },
      { type: "AMBASSADOR",    arch: archetypes.AMBASSADOR,    builder: () => window.vehicleModelFactory.createAmbassadorMesh() },
      { type: "SUPERBIKE",     arch: archetypes.SUPERBIKE,     builder: () => window.vehicleModelFactory.createSuperbikeMesh() },
      { type: "SPORTS_CAR",    arch: archetypes.SPORTS_CAR,    builder: () => window.vehicleModelFactory.createSportsCarMesh(0x00f0ff) },
      { type: "AMBASSADOR",    arch: archetypes.AMBASSADOR,    builder: () => window.vehicleModelFactory.createAmbassadorMesh() },
      { type: "AUTO_RICKSHAW", arch: archetypes.AUTO_RICKSHAW, builder: () => window.vehicleModelFactory.createAutoRickshawMesh() }
    ];

    this.config.ROAD_NETWORK.forEach((road, rIdx) => {
      const pts = road.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const item = poolConfigs[(rIdx + i) % poolConfigs.length];
        const mesh = item.builder();
        this.scene.add(mesh);

        const p1 = pts[i];
        const p2 = pts[i + 1];
        const midX = (p1.x + p2.x) / 2 + (Math.random() - 0.5) * 4;
        const midZ = (p1.z + p2.z) / 2 + (Math.random() - 0.5) * 4;
        const heading = Math.atan2(p2.x - p1.x, p2.z - p1.z);

        const vehicle = {
          id: `traffic_${this.vehicles.length}`,
          type: item.type,
          archetype: item.arch,
          mesh: mesh,
          position: new THREE.Vector3(midX, 0, midZ),
          heading: heading,
          speed: 12.0 + Math.random() * 6.0,
          targetPointIndex: i + 1,
          roadPoints: pts,
          isOccupied: false
        };

        this.vehicles.push(vehicle);
      }
    });
  }

  initPedestrians() {
    const pedColors = [0xe63946, 0x457b9d, 0x2a9d8f, 0xe76f51, 0xf4a261, 0x9d4edd];
    // Include pedestrians right near spawn (-70, 160) for immediate combat and vehicle interactions.
    // They stand in front of the player (spawn faces +Z), not behind where the camera sits.
    const sidewalkSpots = [
      { x: -71.5, z: 163.0 }, // Directly in front of Tommy at spawn
      { x: -74.0, z: 166.0 },
      { x: -76.0, z: 162.5 },
      { x: -72.5, z: 169.5 },
      { x: -69.0, z: 172.0 },
      { x: -75.0, z: 175.0 },
      { x: 350.0, z: 140.0 },
      { x: 370.0, z: 130.0 },
      { x: 535.0, z: -320.0 },
      { x: 510.0, z: -350.0 }
    ];

    sidewalkSpots.forEach((spot, idx) => {
      const col = pedColors[idx % pedColors.length];
      // White mundu/lungi or dark trousers
      const lungi = idx % 2 === 0;
      const group = window.vehicleModelFactory.createPedestrianMesh(col, lungi ? 0xeeeee6 : 0x1d3557, lungi);
      group.position.set(spot.x, 0, spot.z);
      this.scene.add(group);

      this.pedestrians.push({
        id: `ped_${idx}`,
        group: group,
        position: new THREE.Vector3(spot.x, 0, spot.z),
        walkDir: Math.random() > 0.5 ? 1 : -1,
        originX: spot.x,
        originZ: spot.z,
        health: 50, // 1 punch to knockout & cash drop
        isKnockedOut: false,
        isPanicked: false,
        panicTimer: 0,
        gait: new window.PedestrianGait(group.userData)
      });
    });
  }

  // --- Melee Punch Combat Check ---
  checkPedestrianPunchHit(player) {
    let hitAny = false;

    this.pedestrians.forEach((ped) => {
      if (ped.isKnockedOut) return;

      const d = player.position.distanceTo(ped.position);
      if (d < 3.8) {
        hitAny = true;
        ped.health -= 50;

        window.soundEngine.playPunchImpact();
        window.soundEngine.playPedestrianScream();

        // Crosshair hit feedback
        const crosshair = document.getElementById("crosshair");
        if (crosshair) {
          crosshair.classList.add("hit");
          setTimeout(() => crosshair.classList.remove("hit"), 180);
        }

        // Floating Damage Popup
        if (window.showCombatPopup) {
          window.showCombatPopup("POW! -50", "damage");
        }

        // Knockback physics
        const knockDir = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
        ped.position.addScaledVector(knockDir, 2.5);
        ped.group.position.copy(ped.position);

        if (ped.health <= 0) {
          // Knocked out! Ragdoll flat on ground
          ped.isKnockedOut = true;
          ped.group.rotation.x = Math.PI / 2;
          ped.group.position.y = 0.2;

          // Cash Drop
          const reward = 100 + Math.floor(Math.random() * 150);
          player.cash += reward;
          window.soundEngine.playCashPickup();

          // Floating Cash Reward Popup
          if (window.showCombatPopup) {
            window.showCombatPopup(`+₹${reward}`, "cash");
          }

          // Alert Police
          if (window.policeManager) {
            window.policeManager.addCrimeHeat(35);
          }
        } else {
          // Panic and run away
          ped.isPanicked = true;
          ped.panicTimer = 6.0;
        }
      }
    });

    if (hitAny) {
      // Scare other nearby pedestrians
      this.pedestrians.forEach((p) => {
        if (!p.isKnockedOut && player.position.distanceTo(p.position) < 12.0) {
          p.isPanicked = true;
          p.panicTimer = 5.0;
        }
      });
    }
    return hitAny;
  }

  update(delta, player) {
    if (delta > 0.1) delta = 0.1;

    // 1. Update Civilian Traffic
    this.vehicles.forEach((v) => {
      if (v.isOccupied) return;

      const pts = v.roadPoints;
      const target = pts[v.targetPointIndex];

      if (target) {
        const dx = target.x - v.position.x;
        const dz = target.z - v.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 10.0) {
          v.targetPointIndex = (v.targetPointIndex + 1) % pts.length;
        } else {
          const targetHeading = Math.atan2(dx, dz);
          let diff = targetHeading - v.heading;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          v.heading += diff * 4.0 * delta;
        }

        const fwd = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
        v.position.addScaledVector(fwd, v.speed * delta);

        v.mesh.position.copy(v.position);
        v.mesh.rotation.y = v.heading;
        window.vehicleModelFactory.updateWheelRotation(v.mesh, v.speed, delta);

        // Vehicle on Player Collision
        const pDist = v.position.distanceTo(player.position);
        if (pDist < 3.2) {
          this.handleVehicleCollision(v, player);
        }
      }
    });

    // 2. Update Pedestrians (Walk or Flee Panic)
    this.pedestrians.forEach((ped) => {
      if (ped.isKnockedOut) return;

      const speed = ped.isPanicked ? 5.5 : 1.5;
      ped.position.x += ped.walkDir * speed * delta;

      if (ped.isPanicked) {
        ped.panicTimer -= delta;
        if (ped.panicTimer <= 0) ped.isPanicked = false;
      }

      if (Math.abs(ped.position.x - ped.originX) > 18) {
        ped.walkDir *= -1;
      }

      ped.group.position.copy(ped.position);
      ped.group.rotation.y = ped.walkDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (ped.group.visible) ped.gait.update(delta, speed);

      // Vehicular Manslaughter Check (Player drives into pedestrian)
      if (player.state === "IN_VEHICLE" && Math.abs(player.speed) > 6.0) {
        const d = player.position.distanceTo(ped.position);
        if (d < 2.5) {
          ped.health = 0;
          ped.isKnockedOut = true;
          ped.group.rotation.x = Math.PI / 2;
          ped.group.position.y = 0.2;

          window.soundEngine.playCrash(1.0);
          window.soundEngine.playPedestrianScream();

          // Cash reward
          player.cash += 150;
          window.soundEngine.playCashPickup();

          // Immediate Police Alert
          if (window.policeManager) {
            window.policeManager.addCrimeHeat(45);
          }
        }
      }
    });
  }

  handleVehicleCollision(trafficVehicle, player) {
    if (player.state === "IN_VEHICLE") {
      window.soundEngine.playCrash(1.0);
      trafficVehicle.speed *= 0.5;
      if (Math.abs(player.speed) > 15.0 && window.policeManager) {
        window.policeManager.addCrimeHeat(window.KAKKANAD_CONFIG.WANTED.CRIME_HEAT.HIT_AND_RUN);
      }
    } else {
      player.takeDamage(25);
      window.soundEngine.playCrash(0.8);
      const knockback = new THREE.Vector3(Math.sin(trafficVehicle.heading), 0, Math.cos(trafficVehicle.heading)).multiplyScalar(4.0);
      player.position.add(knockback);
    }
  }
}

window.TrafficManager = TrafficManager;
