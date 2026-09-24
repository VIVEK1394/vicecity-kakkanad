/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 4: AMBIENT TRAFFIC & PEDESTRIAN SYSTEM (WITH COMBAT & HIT REACTIONS)
 * - Traffic drives the RoadGraph lanes on the LEFT (India), turns at junctions along
 *   smooth Bezier curves, brakes for whatever is ahead (cars, buses, the player) and
 *   honks; after a long stop it changes lane or squeezes past. Vehicles far from the
 *   player are recycled onto roads near the player, so a small pool fills the city.
 * - Pedestrians walk the sidewalks, flee when attacked, get knocked out (cash drop)
 *   and are recycled around the player too.
 */

class TrafficManager {
  constructor(scene, mapManager) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.graph = mapManager.graph;
    this.config = window.KAKKANAD_CONFIG;
    this.rng = GFX.rng(31337);

    this.vehicles = [];
    this.pedestrians = [];
    this.lines = new Map(); // lane / sidewalk polylines, built on demand
    this.maxVehicles = 26;
    this.maxPedestrians = 28;
    this.recycleVehicleRange = 430;
    this.recyclePedRange = 230;
    this.frozen = false; // tests: park all traffic where it is
    this._camDir = new THREE.Vector3();

    const spawn = mapManager.spawnPoint();
    this.origin = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.initTraffic();
    this.initPedestrians(spawn);
  }

  // --- Polylines ---------------------------------------------------------------------------
  // Offset polyline (mitered) of an edge in travel order: lane centre or sidewalk line.
  line(edge, dir, lateral) {
    const key = `${edge.id}|${dir}|${lateral.toFixed(2)}`;
    let line = this.lines.get(key);
    if (line) return line;
    const g = this.graph;
    const s0 = edge.trimA;
    const s1 = edge.len - edge.trimB;
    let pts = g.sub(edge, s0, Math.max(s0 + 0.5, s1));
    if (dir < 0) pts = pts.slice().reverse();
    const m = this.mapManager.mitered(pts);
    const out = m.map((p) => ({ x: p.x + p.lx * lateral, z: p.z + p.lz * lateral }));
    const cum = [0];
    for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z));
    line = { pts: out, cum, len: cum[cum.length - 1], edge, dir, lateral };
    this.lines.set(key, line);
    return line;
  }

  lineAt(line, s, out) {
    s = Math.max(0, Math.min(line.len, s));
    const cum = line.cum;
    let i = out && out._i !== undefined && out._line === line ? out._i : 0;
    while (i > 0 && cum[i] > s) i--;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const a = line.pts[i];
    const b = line.pts[i + 1] || a;
    const l = Math.max(1e-6, cum[i + 1] - cum[i]);
    const t = Math.min(1, (s - cum[i]) / l);
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.dx = (b.x - a.x) / l;
    out.dz = (b.z - a.z) / l;
    out._i = i;
    out._line = line;
    return out;
  }

  laneLine(edge, dir, lane) {
    return this.line(edge, dir, this.graph.laneOffset(edge, lane));
  }

  // Random point on a road (lane) between rMin and rMax from `center`.
  pickRoadSpot(center, rMin, rMax, tries = 24) {
    const segs = [...this.graph.segmentsNear(center.x, center.z, rMax)];
    if (!segs.length) return null;
    for (let t = 0; t < tries; t++) {
      const sg = segs[Math.floor(this.rng() * segs.length)];
      const e = sg.edge;
      const s = sg.s0 + this.rng() * sg.len;
      const p = this.graph.pointAt(e, s);
      const d = Math.hypot(p.x - center.x, p.z - center.z);
      if (d < rMin || d > rMax) continue;
      if (s < e.trimA + 4 || s > e.len - e.trimB - 4) continue;
      return { edge: e, s, x: p.x, z: p.z };
    }
    return null;
  }

  // Shadow-map budget: only the biggest body part of an AI vehicle casts (wheels, glass,
  // lights and the driver are covered by it and by the contact shadow).
  static trimShadowCasters(mesh) {
    let biggest = null;
    let best = -1;
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    mesh.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = false;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox).getSize(size);
      const v = size.x * size.y * size.z;
      if (v > best) {
        best = v;
        biggest = m;
      }
    });
    if (biggest) biggest.castShadow = true;
  }

  // --- Vehicles ------------------------------------------------------------------------------
  initTraffic() {
    const A = this.config.VEHICLE_ARCHETYPES;
    const F = window.vehicleModelFactory;
    const pool = [
      { arch: A.AUTO_RICKSHAW, build: () => F.createAutoRickshawMesh(), cruise: 11.5 },
      { arch: A.AUTO_RICKSHAW, build: () => F.createAutoRickshawMesh(), cruise: 12 },
      { arch: A.KERALA_BUS, build: () => F.createKeralaBusMesh(), cruise: 12.5 },
      { arch: A.AMBASSADOR, build: () => F.createAmbassadorMesh(), cruise: 13.5 },
      { arch: A.SUPERBIKE, build: () => F.createSuperbikeMesh(), cruise: 15 },
      { arch: A.AUTO_RICKSHAW, build: () => F.createAutoRickshawMesh(), cruise: 11 },
      { arch: A.SPORTS_CAR, build: () => F.createSportsCarMesh(0x00f0ff), cruise: 17 },
      { arch: A.AMBASSADOR, build: () => F.createAmbassadorMesh(), cruise: 14 },
      { arch: A.AUTO_RICKSHAW, build: () => F.createAutoRickshawMesh(), cruise: 12.5 },
      { arch: A.SUPERBIKE, build: () => F.createSuperbikeMesh(), cruise: 14 },
      { arch: A.KERALA_BUS, build: () => F.createKeralaBusMesh(), cruise: 13 },
      { arch: A.AMBASSADOR, build: () => F.createAmbassadorMesh(), cruise: 13 },
      { arch: A.SPORTS_CAR, build: () => F.createSportsCarMesh(0xff3b6b), cruise: 16 },
    ];
    for (let i = 0; i < this.maxVehicles; i++) {
      const item = pool[i % pool.length];
      const mesh = item.build();
      if (mesh.userData.driverAvatar) mesh.userData.driverAvatar.visible = true; // AI driver
      TrafficManager.trimShadowCasters(mesh);
      this.scene.add(mesh);
      const v = {
        id: `traffic_${i}`,
        type: item.arch.type,
        archetype: item.arch,
        mesh,
        position: new THREE.Vector3(),
        heading: 0,
        speed: 0,
        cruise: item.cruise * (0.9 + this.rng() * 0.2),
        isOccupied: false,
        parked: false,
        nav: null,
        stuck: 0,
        ghost: 0,
        hornCooldown: 0,
        _p: {},
      };
      this.vehicles.push(v);
      if (!this.placeVehicle(v, this.origin, 30, 380)) this.hideVehicle(v);
    }
  }

  hideVehicle(v) {
    v.nav = null;
    v.position.set(0, -500, 0);
    v.mesh.position.copy(v.position);
  }

  placeVehicle(v, center, rMin, rMax, avoidView) {
    for (let t = 0; t < 12; t++) {
      const spot = this.pickRoadSpot(center, rMin, rMax);
      if (!spot) continue;
      const e = spot.edge;
      const dir = this.rng() < 0.5 ? 1 : -1;
      const per = this.graph.lanesPerDirection(e);
      const lane = v.archetype.type === "KERALA_BUS" ? 0 : Math.floor(this.rng() * per);
      const line = this.laneLine(e, dir, lane);
      const s = dir > 0 ? spot.s - e.trimA : e.len - e.trimB - spot.s;
      const p = this.lineAt(line, s, {});
      if (avoidView && avoidView(p)) continue;
      // keep a gap to everyone else
      const clash = this.vehicles.some((o) => o !== v && o.nav && Math.hypot(o.position.x - p.x, o.position.z - p.z) < 16);
      if (clash) continue;
      v.nav = { line, s, lane, turn: null };
      v.parked = false;
      v.isOccupied = false;
      v.speed = v.cruise * 0.8;
      v.heading = Math.atan2(p.dx, p.dz);
      v.position.set(p.x, 0, p.z);
      v.mesh.position.copy(v.position);
      v.mesh.rotation.y = v.heading;
      v.stuck = 0;
      v.ghost = 0;
      return true;
    }
    return false;
  }

  // Choose where to go at the end of the current lane line (weighted: straight on and
  // staying on the same road are likelier), then build the turn curve.
  planTurn(v) {
    const g = this.graph;
    const line = v.nav.line;
    const edge = line.edge;
    const node = g.endNode(edge, line.dir);
    const arriving = g.armOf(node, edge, line.dir);
    let options = node.arms.filter((a) => a !== arriving);
    if (!options.length) options = [arriving]; // dead end: U-turn
    const back = arriving ? { x: arriving.dx, z: arriving.dz } : { x: 0, z: 0 };
    const weights = options.map((a) => {
      const straight = -(a.dx * back.x + a.dz * back.z); // 1 = straight on
      let w = 1 + 1.6 * Math.max(0, straight);
      if (a.edge.road.id === edge.road.id) w += 1.5;
      if (a.edge.road.cls === "primary") w += 0.6;
      return w;
    });
    let r = this.rng() * weights.reduce((p, q) => p + q, 0);
    let pick = options[0];
    for (let i = 0; i < options.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = options[i];
        break;
      }
    }
    this.buildTurn(v, pick, arriving);
  }

  // Bezier from the end of the current lane onto `pick` (an arm of the end node).
  buildTurn(v, pick, arriving) {
    const g = this.graph;
    const line = v.nav.line;
    const per = g.lanesPerDirection(pick.edge);
    const lane = Math.min(v.nav.lane, per - 1);
    const next = this.laneLine(pick.edge, pick.dir, lane);
    const P0 = this.lineAt(line, line.len, {});
    const P2 = this.lineAt(next, 0, {});
    // control point: where the two lane lines meet
    const d0 = { x: P0.dx, z: P0.dz };
    const d2 = { x: P2.dx, z: P2.dz };
    const cross = d0.x * d2.z - d0.z * d2.x;
    const gap = Math.hypot(P2.x - P0.x, P2.z - P0.z);
    let P1;
    if (Math.abs(cross) > 0.08) {
      const a = ((P2.x - P0.x) * d2.z - (P2.z - P0.z) * d2.x) / cross;
      if (a > 0 && a < gap * 2.5) P1 = { x: P0.x + d0.x * a, z: P0.z + d0.z * a };
    }
    if (!P1) {
      const k = pick === arriving ? Math.max(6, gap) : gap * 0.5;
      P1 = { x: (P0.x + P2.x) / 2 + d0.x * k * 0.5, z: (P0.z + P2.z) / 2 + d0.z * k * 0.5 };
    }
    const len = Math.max(1, (Math.hypot(P1.x - P0.x, P1.z - P0.z) + Math.hypot(P2.x - P1.x, P2.z - P1.z) + gap) / 2);
    const straightness = Math.max(0, d0.x * d2.x + d0.z * d2.z);
    v.nav.turn = { P0: { x: P0.x, z: P0.z }, P1, P2: { x: P2.x, z: P2.z }, len, u: 0, next, lane, slow: 0.45 + 0.55 * straightness };
  }

  // Distance to the nearest obstacle ahead in this vehicle's path (Infinity if clear).
  obstacleAhead(v, player, police) {
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const half = v.archetype.length / 2;
    let best = Infinity;
    const test = (x, z, len, width) => {
      const dx = x - v.position.x;
      const dz = z - v.position.z;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > 26) return;
      const side = Math.abs(dx * fz - dz * fx);
      if (side > (v.archetype.width + width) / 2 + 0.5) return;
      best = Math.min(best, ahead - half - len / 2);
    };
    for (let i = 0; i < this.vehicles.length; i++) {
      const o = this.vehicles[i];
      if (o === v || (!o.nav && !o.parked && !o.isOccupied)) continue;
      test(o.position.x, o.position.z, o.archetype.length, o.archetype.width);
    }
    if (police) police.policeUnits.forEach((p) => p.isActive && test(p.position.x, p.position.z, p.archetype.length, p.archetype.width));
    if (player) {
      if (player.state === "IN_VEHICLE" && player.currentVehicle) {
        const a = player.currentVehicle.archetype;
        test(player.position.x, player.position.z, a.length, a.width);
      } else test(player.position.x, player.position.z, 0.6, 0.8);
      const starter = player.starterVehicle;
      if (starter && !starter.isOccupied) test(starter.position.x, starter.position.z, starter.archetype.length, starter.archetype.width);
    }
    return best;
  }

  updateVehicle(v, delta, player, police) {
    const nav = v.nav;
    v.hornCooldown = Math.max(0, v.hornCooldown - delta);
    // speed: cruise, slower through turns, brake for what is ahead
    let target = v.cruise * (nav.turn ? nav.turn.slow : 1);
    if (!nav.turn && nav.line.len - nav.s < 22) target *= 0.8;
    if (v.ghost > 0) v.ghost -= delta;
    else {
      const gap = this.obstacleAhead(v, player, police);
      if (gap < 18) target = Math.min(target, Math.max(0, (gap - 2.5) * 1.1));
    }
    const accel = target > v.speed ? 3.5 : 9;
    v.speed += Math.max(-accel * delta, Math.min(accel * delta, target - v.speed));
    if (v.speed < 0.3 && target < 0.5) {
      v.stuck += delta;
      if (v.stuck > 1.2 && v.hornCooldown === 0 && player.position.distanceToSquared(v.position) < 60 * 60) {
        v.hornCooldown = 3 + this.rng() * 3;
        if (window.soundEngine && window.soundEngine.playHorn) window.soundEngine.playHorn(v.archetype.hornSound);
      }
      if (v.stuck > 4) {
        // blocked: change lane if there is one, otherwise squeeze past
        const per = this.graph.lanesPerDirection(nav.line.edge);
        if (!nav.turn && per > 1) {
          const lane = (nav.lane + 1) % per;
          const line = this.laneLine(nav.line.edge, nav.line.dir, lane);
          nav.s = Math.min(line.len, nav.s * (line.len / Math.max(1, nav.line.len)));
          nav.line = line;
          nav.lane = lane;
        } else v.ghost = 1.5;
        v.stuck = 0;
      }
    } else v.stuck = 0;

    const step = v.speed * delta;
    const p = v._p;
    if (nav.turn) {
      const T = nav.turn;
      T.u = Math.min(1, T.u + step / T.len);
      const u = T.u;
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      p.x = a * T.P0.x + b * T.P1.x + c * T.P2.x;
      p.z = a * T.P0.z + b * T.P1.z + c * T.P2.z;
      p.dx = 2 * (1 - u) * (T.P1.x - T.P0.x) + 2 * u * (T.P2.x - T.P1.x);
      p.dz = 2 * (1 - u) * (T.P1.z - T.P0.z) + 2 * u * (T.P2.z - T.P1.z);
      if (u >= 1) {
        nav.line = T.next;
        nav.lane = T.lane;
        nav.s = 0;
        nav.turn = null;
      }
    } else {
      nav.s += step;
      if (nav.s >= nav.line.len) {
        nav.s = nav.line.len;
        this.planTurn(v);
      }
      this.lineAt(nav.line, nav.s, p);
    }
    v.position.set(p.x, 0, p.z);
    if (Math.abs(p.dx) + Math.abs(p.dz) > 1e-6) {
      const h = Math.atan2(p.dx, p.dz);
      let d = h - v.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.heading += d * Math.min(1, delta * 10);
    }
  }

  // --- Pedestrians ------------------------------------------------------------------------------
  initPedestrians(spawn) {
    const cols = [0xe63946, 0x457b9d, 0x2a9d8f, 0xe76f51, 0xf4a261, 0x9d4edd, 0x3a86ff, 0xffbe0b, 0x8ac926];
    for (let i = 0; i < this.maxPedestrians; i++) {
      const lungi = i % 2 === 0;
      const group = window.vehicleModelFactory.createPedestrianMesh(cols[i % cols.length], lungi ? 0xeeeee6 : [0x1d3557, 0x3d405b, 0x6b705c][i % 3], lungi, i * 7919 + 13);
      TrafficManager.trimShadowCasters(group);
      this.scene.add(group);
      const ped = {
        id: `ped_${i}`,
        group,
        position: new THREE.Vector3(),
        heading: 0,
        walkDir: 1,
        health: 50,
        isKnockedOut: false,
        isPanicked: false,
        panicTimer: 0,
        downTimer: 0,
        stroll: 1.25 + this.rng() * 0.5,
        jitter: (this.rng() - 0.5) * 1.1,
        nav: null,
        gait: new window.PedestrianGait(group.userData),
        _p: {},
      };
      this.pedestrians.push(ped);
      // the first few stand on the spawn sidewalk right in front of the player
      if (i < 6) this.placePedOnLine(ped, spawn.edge, 1, spawn.s + 3.5 + i * 3.2, 1);
      else if (!this.placePed(ped, this.origin, 25, 200)) this.hidePed(ped);
    }
  }

  hidePed(ped) {
    ped.nav = null;
    ped.position.set(0, -500, 0);
    ped.group.position.copy(ped.position);
  }

  placePedOnLine(ped, edge, side, sAlongEdge, dir) {
    const lat = side * (edge.halfW + edge.style.sidewalk * 0.55) + ped.jitter * 0.4;
    const line = this.line(edge, 1, lat);
    const s = Math.max(0, Math.min(line.len, sAlongEdge - edge.trimA));
    ped.nav = { line, s, dir };
    ped.isKnockedOut = false;
    ped.isPanicked = false;
    ped.health = 50;
    ped.group.rotation.x = 0;
    this.lineAt(line, s, ped._p);
    ped.position.set(ped._p.x, 0, ped._p.z);
    ped.heading = Math.atan2(ped._p.dx * dir, ped._p.dz * dir);
    ped.group.position.copy(ped.position);
    ped.group.rotation.y = ped.heading;
  }

  placePed(ped, center, rMin, rMax, avoidView) {
    for (let t = 0; t < 10; t++) {
      const spot = this.pickRoadSpot(center, rMin, rMax);
      if (!spot) continue;
      if (avoidView && avoidView(spot)) continue;
      this.placePedOnLine(ped, spot.edge, this.rng() < 0.5 ? 1 : -1, spot.s, this.rng() < 0.5 ? 1 : -1);
      return true;
    }
    return false;
  }

  updatePedestrian(ped, delta, player) {
    if (ped.isKnockedOut) {
      ped.downTimer += delta;
      return;
    }
    const nav = ped.nav;
    if (!nav) return;
    let speed = ped.stroll;
    if (ped.isPanicked) {
      speed = 5.5;
      ped.panicTimer -= delta;
      if (ped.panicTimer <= 0) ped.isPanicked = false;
      // run away from the player along the sidewalk
      const p = this.lineAt(nav.line, nav.s, ped._p);
      const away = (ped.position.x - player.position.x) * p.dx + (ped.position.z - player.position.z) * p.dz;
      nav.dir = away >= 0 ? 1 : -1;
    }
    nav.s += nav.dir * speed * delta;
    if (nav.s < 0 || nav.s > nav.line.len) {
      nav.s = Math.max(0, Math.min(nav.line.len, nav.s));
      nav.dir = -nav.dir; // turn round at the corner
    }
    const p = this.lineAt(nav.line, nav.s, ped._p);
    ped.position.set(p.x, 0, p.z);
    const h = Math.atan2(p.dx * nav.dir, p.dz * nav.dir);
    let d = h - ped.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ped.heading += d * Math.min(1, delta * 8);
    ped.group.position.copy(ped.position);
    ped.group.rotation.y = ped.heading;
    if (ped.group.visible) ped.gait.update(delta, speed);

    // Vehicular hit (player drives into a pedestrian)
    if (player.state === "IN_VEHICLE" && Math.abs(player.speed) > 6.0 && player.position.distanceToSquared(ped.position) < 2.5 * 2.5) {
      this.knockOut(ped, player, 150, 45);
      window.soundEngine.playCrash(1.0);
    }
  }

  knockOut(ped, player, reward, heat) {
    ped.health = 0;
    ped.isKnockedOut = true;
    ped.downTimer = 0;
    ped.group.rotation.x = Math.PI / 2;
    ped.group.position.y = 0.2;
    window.soundEngine.playPedestrianScream();
    player.cash += reward;
    window.soundEngine.playCashPickup();
    if (window.showCombatPopup) window.showCombatPopup(`+₹${reward}`, "cash");
    if (window.policeManager) window.policeManager.addCrimeHeat(heat);
  }

  // --- Melee Punch Combat Check ---
  checkPedestrianPunchHit(player) {
    let hitAny = false;
    this.pedestrians.forEach((ped) => {
      if (ped.isKnockedOut || !ped.nav) return;
      if (player.position.distanceTo(ped.position) >= 3.8) return;
      hitAny = true;
      ped.health -= 50;
      window.soundEngine.playPunchImpact();
      window.soundEngine.playPedestrianScream();
      const crosshair = document.getElementById("crosshair");
      if (crosshair) {
        crosshair.classList.add("hit");
        setTimeout(() => crosshair.classList.remove("hit"), 180);
      }
      if (window.showCombatPopup) window.showCombatPopup("POW! -50", "damage");
      // knockback along the punch
      ped.position.x += Math.sin(player.heading) * 2.5;
      ped.position.z += Math.cos(player.heading) * 2.5;
      ped.group.position.copy(ped.position);
      if (ped.health <= 0) {
        const reward = 100 + Math.floor(Math.random() * 150);
        this.knockOut(ped, player, reward, 35);
      } else {
        ped.isPanicked = true;
        ped.panicTimer = 6.0;
      }
    });
    if (hitAny) {
      this.pedestrians.forEach((p) => {
        if (!p.isKnockedOut && p.nav && player.position.distanceTo(p.position) < 12.0) {
          p.isPanicked = true;
          p.panicTimer = 5.0;
        }
      });
    }
    return hitAny;
  }

  // --- Frame update ----------------------------------------------------------------------------------
  update(delta, player) {
    if (delta > 0.1) delta = 0.1;
    const police = window.policeManager;
    const cam = window.gameEngine && window.gameEngine.camera;
    let inView = null;
    if (cam) {
      const f = cam.getWorldDirection(this._camDir);
      inView = (p) => {
        const dx = p.x - cam.position.x;
        const dz = p.z - cam.position.z;
        const d = Math.hypot(dx, dz);
        return d < 260 && (dx * f.x + dz * f.z) / Math.max(1, d) > 0.2;
      };
    }

    // 1. Civilian traffic (recycling is throttled: a failed placement waits a moment)
    this.vehicles.forEach((v) => {
      if (v.isOccupied || this.frozen) return;
      const far = v.position.distanceTo(player.position) > this.recycleVehicleRange;
      if (!v.nav || far) {
        v.retry = (v.retry || 0) - delta;
        if ((far || !v.parked) && v.retry <= 0) {
          if (!this.placeVehicle(v, player.position, 140, 380, inView)) {
            v.retry = 0.5;
            if (!v.nav) this.hideVehicle(v);
          }
        }
        if (!v.nav) return;
      }
      if (v.parked) return;
      this.updateVehicle(v, delta, player, police);
      v.mesh.position.copy(v.position);
      v.mesh.rotation.y = v.heading;
      if (v.mesh.visible) window.VehicleVisuals.animateAI(v, delta);
      if (v.position.distanceToSquared(player.position) < 3.2 * 3.2) this.handleVehicleCollision(v, player);
    });

    // 2. Pedestrians
    this.pedestrians.forEach((ped) => {
      const d = ped.position.distanceTo(player.position);
      const expired = ped.isKnockedOut && (ped.downTimer > 30 || d > 120);
      if (!ped.nav || d > this.recyclePedRange || expired) {
        ped.retry = (ped.retry || 0) - delta;
        if (ped.retry <= 0 && !this.placePed(ped, player.position, 70, 200, inView)) {
          ped.retry = 0.5;
          this.hidePed(ped);
        }
        return;
      }
      this.updatePedestrian(ped, delta, player);
    });
  }

  handleVehicleCollision(trafficVehicle, player) {
    if (player.state === "IN_VEHICLE") {
      window.soundEngine.playCrash(1.0);
      if (player.onVehicleImpact) player.onVehicleImpact(trafficVehicle);
      trafficVehicle.speed *= 0.5;
      if (Math.abs(player.speed) > 15.0 && window.policeManager) {
        window.policeManager.addCrimeHeat(window.KAKKANAD_CONFIG.WANTED.CRIME_HEAT.HIT_AND_RUN);
      }
    } else if (trafficVehicle.speed > 2) {
      player.takeDamage(25);
      window.soundEngine.playCrash(0.8);
      const knockback = new THREE.Vector3(Math.sin(trafficVehicle.heading), 0, Math.cos(trafficVehicle.heading)).multiplyScalar(4.0);
      player.position.add(knockback);
      trafficVehicle.speed = 0;
    }
  }
}

window.TrafficManager = TrafficManager;
