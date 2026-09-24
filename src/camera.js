/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * THIRD-PERSON CAMERA RIG
 * - Critically damped springs on yaw, pitch, distance, pivot and FOV.
 * - Driving: follows the direction of travel (drifts show the car's flank), lags into
 *   turns, looks ahead with speed, widens FOV with speed, subtle high-speed shake.
 * - On foot: free mouse orbit; eases back behind the player when running.
 * - Mouse: pointer lock on click (Esc releases); right-drag orbit as a fallback.
 *   Driving: mouse look springs back behind the vehicle after a moment.
 * - Collision: ray vs building / parked-vehicle boxes; pulls in instantly, eases out.
 * - Modes (C): chase, hood / first person, high cinematic.
 */

// Critically damped spring (exact exponential form), returns the new value; vel is {v}.
function springDamp(current, target, vel, smoothTime, dt) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  return target + (change + temp) * exp;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

class CameraRig {
  constructor(camera, domElement, mapManager) {
    this.camera = camera;
    this.dom = domElement;
    this.map = mapManager;

    this.yaw = 0; // direction the camera looks (same convention as headings)
    this.pitch = 0.22; // positive looks down
    this.distance = 4.4;
    this.fov = 60;
    this.pivot = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.vel = { yaw: { v: 0 }, pitch: { v: 0 }, dist: { v: 0 }, fov: { v: 0 }, px: { v: 0 }, py: { v: 0 }, pz: { v: 0 }, coll: { v: 0 } };
    this.collisionDistance = 100;

    this.mouseYaw = 0; // pending mouse deltas
    this.mousePitch = 0;
    this.lookOffset = 0; // driving: temporary mouse look around the car
    this.pitchOffset = 0;
    this.lastMouseTime = -10;
    this.time = 0;
    this.shake = 0;
    this.cut = true;
    this.lastMode = -1;
    this.lastPlayerPos = new THREE.Vector3();
    this.lastVehiclePos = new THREE.Vector3();
    this.travelVel = new THREE.Vector3();
    this.smoothedYawRate = 0;
    this.lastVehicleHeading = 0;

    this.pointerLocked = false;
    this.pointerLockFailed = !(this.dom && this.dom.requestPointerLock);
    this.dragging = false;
    this.sensitivity = 0.0024;

    this._v = new THREE.Vector3();
    this._back = new THREE.Vector3();
    this.initInput();
  }

  initInput() {
    const dom = this.dom;
    if (!dom) return;
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.addEventListener("mousedown", (e) => {
      const engine = window.gameEngine;
      if (!engine || !engine.started) return;
      if (e.button === 2) {
        this.dragging = true;
      } else if (e.button === 0 && !this.pointerLocked && !this.pointerLockFailed) {
        e.gfxCaptureClick = true; // this click grabs the mouse; it is not a punch
        try {
          const req = dom.requestPointerLock();
          if (req && req.catch) req.catch(() => (this.pointerLockFailed = true));
        } catch (err) {
          this.pointerLockFailed = true;
        }
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) this.dragging = false;
    });
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === dom;
    });
    document.addEventListener("pointerlockerror", () => {
      this.pointerLockFailed = true;
    });
    window.addEventListener("mousemove", (e) => {
      if (!this.pointerLocked && !this.dragging) return;
      this.mouseYaw -= e.movementX * this.sensitivity;
      this.mousePitch += e.movementY * this.sensitivity;
      this.lastMouseTime = this.time;
    });
  }

  snap() {
    this.cut = true;
  }

  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount);
  }

  // --- collision -------------------------------------------------------------------------
  // Ray (origin, unit dir) vs oriented boxes {center, half, rotY}; returns nearest t or Infinity.
  raycastBoxes(origin, dir, maxT, boxes, inflate) {
    let best = maxT;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const c = Math.cos(b.rotY);
      const s = Math.sin(b.rotY);
      const ox = origin.x - b.center.x;
      const oz = origin.z - b.center.z;
      const o = [c * ox - s * oz, origin.y - b.center.y, s * ox + c * oz];
      const d = [c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z];
      const h = [b.half.x + inflate, b.half.y + inflate, b.half.z + inflate];
      if (Math.abs(o[0]) < h[0] && Math.abs(o[1]) < h[1] && Math.abs(o[2]) < h[2]) continue; // pivot inside: ignore
      let tmin = 0;
      let tmax = best;
      let hit = true;
      for (let k = 0; k < 3 && hit; k++) {
        if (Math.abs(d[k]) < 1e-8) {
          if (Math.abs(o[k]) > h[k]) hit = false;
        } else {
          let t1 = (-h[k] - o[k]) / d[k];
          let t2 = (h[k] - o[k]) / d[k];
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
          }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) hit = false;
        }
      }
      if (hit && tmin < best) best = tmin;
    }
    return best;
  }

  vehicleBoxes(player, traffic, police) {
    const boxes = [];
    const add = (v) => {
      if (!v || v === player.currentVehicle || !v.mesh.visible) return;
      if (v.position.distanceToSquared(player.position) > 30 * 30) return;
      const a = v.archetype;
      boxes.push({
        center: this._tmpCenter(v.position.x, a.height * 0.5, v.position.z),
        half: new THREE.Vector3(a.width * 0.5, a.height * 0.5, a.length * 0.5),
        rotY: v.heading,
      });
    };
    add(player.starterVehicle);
    if (traffic) traffic.vehicles.forEach(add);
    if (police) police.policeUnits.forEach((p) => p.isActive && add(p));
    return boxes;
  }

  _tmpCenter(x, y, z) {
    return new THREE.Vector3(x, y, z);
  }

  // --- per frame --------------------------------------------------------------------------
  update(dt, player, mode, traffic, police) {
    this.time += dt;
    if (mode !== this.lastMode) {
      this.cut = true;
      this.lastMode = mode;
    }
    if (player.position.distanceTo(this.lastPlayerPos) > 25) this.cut = true; // respawn, busted, teleports
    this.lastPlayerPos.copy(player.position);

    const inVehicle = player.state === "IN_VEHICLE" && player.currentVehicle;
    if (mode === 1) this.updateFirstPerson(dt, player, inVehicle);
    else if (mode === 2) this.updateCinematic(dt, player);
    else this.updateChase(dt, player, inVehicle, traffic, police);

    this.mouseYaw = 0;
    this.mousePitch = 0;
    this.wasCut = this.cut;
    this.cut = false;
  }

  updateChase(dt, player, v, traffic, police) {
    const cut = this.cut;
    let targetYaw;
    let targetPitch;
    let targetDist;
    let targetFov;
    let yawSmooth;
    const pivotTarget = this._v;
    const mouseActive = this.time - this.lastMouseTime < 1.4;

    if (v) {
      const a = v.archetype;
      const speed = Math.abs(player.speed);
      const speedRatio = Math.min(1, speed / a.maxSpeed);

      // direction of travel from the vehicle's real motion (shows drifts)
      if (cut) this.lastVehiclePos.copy(v.position);
      if (dt > 0) {
        this.travelVel.subVectors(v.position, this.lastVehiclePos).divideScalar(dt);
        this.travelVel.y = 0;
      }
      this.lastVehiclePos.copy(v.position);
      let travelYaw = v.heading;
      if (player.speed > 3 && this.travelVel.lengthSq() > 9) travelYaw = Math.atan2(this.travelVel.x, this.travelVel.z);

      const yawRate = dt > 0 ? wrapAngle(v.heading - this.lastVehicleHeading) / dt : 0;
      this.lastVehicleHeading = v.heading;
      this.smoothedYawRate += (yawRate - this.smoothedYawRate) * Math.min(1, dt * 4);

      // mouse look around the car, springs back when the mouse rests
      this.lookOffset = wrapAngle(this.lookOffset + this.mouseYaw);
      this.pitchOffset = THREE.MathUtils.clamp(this.pitchOffset + this.mousePitch, -0.3, 0.9);
      if (!mouseActive) {
        const k = Math.min(1, dt * 2.2);
        this.lookOffset -= this.lookOffset * k;
        this.pitchOffset -= this.pitchOffset * k;
      }

      targetYaw = travelYaw + this.lookOffset;
      targetPitch = 0.2 + this.pitchOffset - speedRatio * 0.04;
      targetDist = 4.4 + a.length * 0.62 + speedRatio * 1.3;
      targetFov = 58 + 14 * Math.pow(speedRatio, 1.3);
      yawSmooth = mouseActive ? 0.06 : 0.3 - 0.1 * speedRatio;

      const ahead = Math.min(3.5, speed * 0.13);
      pivotTarget.set(
        v.position.x + Math.sin(travelYaw) * ahead,
        v.position.y + a.height * 0.72,
        v.position.z + Math.cos(travelYaw) * ahead
      );
      if (speedRatio > 0.65) this.shake = Math.max(this.shake, (speedRatio - 0.65) * 0.35);
    } else {
      // on foot: mouse orbit; ease in behind the player while running forward
      this.yaw = wrapAngle(this.yaw + this.mouseYaw);
      this.pitch = THREE.MathUtils.clamp(this.pitch + this.mousePitch, -0.35, 1.1);
      this.lookOffset = 0;
      this.pitchOffset = 0;
      const vel = player.velocity;
      const speed = Math.hypot(vel.x, vel.z);
      targetYaw = this.yaw;
      targetPitch = this.pitch;
      yawSmooth = 0.04;
      if (!mouseActive && speed > 1.5) {
        // Running mostly forward: swing round behind the player (never while strafing,
        // which would make the player spiral).
        const moveYaw = Math.atan2(vel.x, vel.z);
        if (Math.cos(wrapAngle(moveYaw - this.yaw)) > 0.3) {
          targetYaw = moveYaw;
          yawSmooth = 1.1;
        }
        targetPitch = this.pitch + (0.2 - this.pitch) * Math.min(1, dt * 1.5);
      }
      const sprinting = speed > 7;
      targetDist = 4.3 + (sprinting ? 0.5 : 0);
      targetFov = sprinting ? 63 : 58;
      const right = 0.35; // slight over-the-shoulder offset
      pivotTarget.set(
        player.position.x - Math.cos(this.yaw) * right,
        player.position.y + 1.55,
        player.position.z + Math.sin(this.yaw) * right
      );
    }

    if (cut) {
      this.yaw = targetYaw;
      this.pitch = targetPitch;
      this.distance = targetDist;
      this.fov = targetFov;
      this.pivot.copy(pivotTarget);
      this.collisionDistance = targetDist;
      Object.values(this.vel).forEach((s) => (s.v = 0));
    } else {
      this.yaw = this.yaw + wrapAngle(springDamp(0, wrapAngle(targetYaw - this.yaw), this.vel.yaw, yawSmooth, dt));
      this.yaw = wrapAngle(this.yaw);
      this.pitch = springDamp(this.pitch, targetPitch, this.vel.pitch, 0.25, dt);
      this.distance = springDamp(this.distance, targetDist, this.vel.dist, 0.45, dt);
      this.fov = springDamp(this.fov, targetFov, this.vel.fov, 0.5, dt);
      const pivotSmooth = v ? 0.05 : 0.07;
      this.pivot.x = springDamp(this.pivot.x, pivotTarget.x, this.vel.px, pivotSmooth, dt);
      this.pivot.y = springDamp(this.pivot.y, pivotTarget.y, this.vel.py, 0.12, dt);
      this.pivot.z = springDamp(this.pivot.z, pivotTarget.z, this.vel.pz, pivotSmooth, dt);
    }

    // Camera placement + collision (pull in instantly, ease back out).
    const cp = Math.cos(this.pitch);
    this._back.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
    const boxes = this.map.colliders.concat(this.vehicleBoxes(player, traffic, police));
    const hitT = this.raycastBoxes(this.pivot, this._back, this.distance + 0.4, boxes, 0.3);
    const allowed = Math.max(0.9, Math.min(this.distance, hitT - 0.35));
    if (cut || allowed < this.collisionDistance) {
      this.collisionDistance = allowed;
      this.vel.coll.v = 0;
    } else {
      this.collisionDistance = springDamp(this.collisionDistance, allowed, this.vel.coll, 0.5, dt);
    }

    const cam = this.camera;
    cam.position.copy(this.pivot).addScaledVector(this._back, this.collisionDistance);
    if (cam.position.y < 0.4) cam.position.y = 0.4;

    // look target: pivot, leaning into turns when driving
    this.lookAt.copy(this.pivot);
    if (v) {
      const lean = THREE.MathUtils.clamp(this.smoothedYawRate * 1.1, -1.6, 1.6);
      this.lookAt.x += Math.cos(this.yaw) * lean;
      this.lookAt.z -= Math.sin(this.yaw) * lean;
    }
    this.applyShake(dt);
    cam.lookAt(this.lookAt);
    this.applyFov(this.fov);
  }

  applyShake(dt) {
    if (this.shake <= 0.001) return;
    const t = this.time;
    const k = this.shake * 0.06;
    this.lookAt.x += (Math.sin(t * 37.1) + Math.sin(t * 23.3)) * k;
    this.lookAt.y += (Math.sin(t * 41.7) + Math.sin(t * 19.9)) * k;
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  applyFov(fov) {
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  updateFirstPerson(dt, player, v) {
    const cam = this.camera;
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.mousePitch, -0.9, 1.1);
    if (v) {
      const a = v.archetype;
      this.lookOffset = THREE.MathUtils.clamp(wrapAngle(this.lookOffset + this.mouseYaw), -1.8, 1.8);
      if (this.time - this.lastMouseTime > 1.4) this.lookOffset -= this.lookOffset * Math.min(1, dt * 2.5);
      const body = v.mesh.userData.body || v.mesh;
      body.updateMatrixWorld();
      cam.position.set(0, a.height * 0.62, a.length * 0.3).applyMatrix4(body.matrixWorld);
      const yaw = v.heading + this.lookOffset;
      this.yaw = yaw;
      this.lookAt.set(cam.position.x + Math.sin(yaw) * 20, cam.position.y - 1.2 - this.pitch * 6, cam.position.z + Math.cos(yaw) * 20);
    } else {
      this.yaw = wrapAngle(this.yaw + this.mouseYaw);
      cam.position.set(player.position.x, player.position.y + 1.62, player.position.z);
      cam.position.x += Math.sin(this.yaw) * 0.2;
      cam.position.z += Math.cos(this.yaw) * 0.2;
      this.lookAt.set(
        cam.position.x + Math.sin(this.yaw) * Math.cos(this.pitch) * 20,
        cam.position.y - Math.sin(this.pitch) * 20,
        cam.position.z + Math.cos(this.yaw) * Math.cos(this.pitch) * 20
      );
    }
    cam.lookAt(this.lookAt);
    this.applyFov(70);
  }

  updateCinematic(dt, player) {
    const cam = this.camera;
    const target = this._v.set(player.position.x - 18, player.position.y + 24, player.position.z - 18);
    if (this.cut) {
      this.pivot.copy(target);
      Object.values(this.vel).forEach((s) => (s.v = 0));
    } else {
      this.pivot.x = springDamp(this.pivot.x, target.x, this.vel.px, 0.35, dt);
      this.pivot.y = springDamp(this.pivot.y, target.y, this.vel.py, 0.35, dt);
      this.pivot.z = springDamp(this.pivot.z, target.z, this.vel.pz, 0.35, dt);
    }
    cam.position.copy(this.pivot);
    cam.lookAt(player.position);
    this.yaw = Math.atan2(player.position.x - cam.position.x, player.position.z - cam.position.z);
    this.applyFov(52);
  }
}

window.CameraRig = CameraRig;
window.springDamp = springDamp;
