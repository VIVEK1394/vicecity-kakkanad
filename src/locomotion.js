/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * ON-FOOT LOCOMOTION & PROCEDURAL ANIMATION
 * - OnFootController: classic GTA controls. W/S run forwards/back relative to the view,
 *   A/D turn the view (CameraRig) and the player turns with it (in place when standing,
 *   stepping round). Acceleration / deceleration, turn inertia (slower while sprinting),
 *   reduced air control, jump and landing impact.
 * - ProceduralGait: jointed-rig animation driven by distance travelled (feet don't
 *   slide); walk and run poses blend by speed; knee and elbow bend, hip bob and sway,
 *   forward lean with speed/acceleration, banking into turns, idle breathing, airborne
 *   tuck, landing dip and a wind-up / strike / recover punch.
 * - PedestrianGait: the same idea, cheaper, for the ambient pedestrians.
 */

const LOCOMOTION = Object.freeze({
  jogSpeed: 5.5, // m/s
  sprintSpeed: 8.5,
  accel: 22, // m/s^2 towards the target velocity
  decel: 30,
  airAccel: 5,
  turnRate: 12, // rad/s
  sprintTurnRate: 6,
  jumpSpeed: 6.5,
  gravity: 18,
});

function gaitSmooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

class OnFootController {
  constructor(player) {
    this.player = player;
    this.turnRate = 0; // rad/s, for banking
    this.accelForward = 0; // m/s^2 along facing, for leaning
    this.landImpact = 0; // set on the frame the player lands
    this.turningInPlace = false; // A/D while standing: the player steps round with the view
    this.jumpHeld = false;
    this._wish = new THREE.Vector3();
  }

  update(dt, keys, cameraYaw) {
    const p = this.player;
    const fwd = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    const turnKey = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const side = 0; // A/D turn the view (see CameraRig), they don't strafe
    const wish = this._wish.set(
      Math.sin(cameraYaw) * fwd - Math.cos(cameraYaw) * side,
      0,
      Math.cos(cameraYaw) * fwd + Math.sin(cameraYaw) * side
    );
    const hasInput = wish.lengthSq() > 0.01;
    if (hasInput) wish.normalize();
    const targetSpeed = hasInput ? (keys.sprint ? LOCOMOTION.sprintSpeed : LOCOMOTION.jogSpeed) : 0;

    // Velocity approaches the target with bounded acceleration.
    const vx0 = p.velocity.x;
    const vz0 = p.velocity.z;
    const accel = p.isGrounded ? (hasInput ? LOCOMOTION.accel : LOCOMOTION.decel) : LOCOMOTION.airAccel;
    let dvx = wish.x * targetSpeed - vx0;
    let dvz = wish.z * targetSpeed - vz0;
    const dv = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dv > maxDv) {
      dvx *= maxDv / dv;
      dvz *= maxDv / dv;
    }
    p.velocity.x = vx0 + dvx;
    p.velocity.z = vz0 + dvz;
    const speed = Math.hypot(p.velocity.x, p.velocity.z);

    // Facing turns towards the input direction with limited rate (turn inertia). Turning
    // on the spot follows the view, so the player always faces where the camera looks.
    const prevHeading = p.heading;
    this.turningInPlace = !hasInput && turnKey !== 0 && speed < 0.4;
    if (hasInput || speed > 0.4 || this.turningInPlace) {
      const desired = hasInput ? Math.atan2(wish.x, wish.z) : this.turningInPlace ? cameraYaw : Math.atan2(p.velocity.x, p.velocity.z);
      const sprintK = gaitSmooth(LOCOMOTION.jogSpeed, LOCOMOTION.sprintSpeed, speed);
      const maxTurn = (LOCOMOTION.turnRate + (LOCOMOTION.sprintTurnRate - LOCOMOTION.turnRate) * sprintK) * dt;
      const diff = wrapPi(desired - p.heading);
      p.heading = wrapPi(p.heading + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    }
    this.turnRate = dt > 0 ? wrapPi(p.heading - prevHeading) / dt : 0;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    this.accelForward = dt > 0 ? (dvx * fx + dvz * fz) / dt : 0;

    p.position.x += p.velocity.x * dt;
    p.position.z += p.velocity.z * dt;

    // Jump (one per press) and gravity.
    this.landImpact = 0;
    if (keys.jump && !this.jumpHeld && p.isGrounded) {
      p.verticalVelocity = LOCOMOTION.jumpSpeed;
      p.isGrounded = false;
    }
    this.jumpHeld = keys.jump;
    if (!p.isGrounded) {
      p.verticalVelocity -= LOCOMOTION.gravity * dt;
      p.position.y += p.verticalVelocity * dt;
      if (p.position.y <= 0) {
        this.landImpact = Math.min(1, -p.verticalVelocity / 8);
        p.position.y = 0;
        p.verticalVelocity = 0;
        p.isGrounded = true;
      }
    }
    return speed;
  }
}

class ProceduralGait {
  constructor(rig) {
    this.rig = rig; // characterMesh.userData joints
    this.phase = 0;
    this.time = 0;
    this.air = 0;
    this.drop = 0;
    this.dropVel = { v: 0 };
    this.lean = 0;
    this.bank = 0;
    this.punchT = -1;
  }

  punch() {
    this.punchT = 0;
  }

  land(impact) {
    this.dropVel.v -= impact * 1.3;
  }

  update(dt, speed, accelForward, turnRate, grounded) {
    const r = this.rig;
    this.time += dt;
    const move = gaitSmooth(0.15, 1.2, speed);
    const run = gaitSmooth(2.2, 5.0, speed);
    const sprint = gaitSmooth(6.0, 8.5, speed);
    const cycle = 1.25 + 0.26 * speed; // metres per stride (two steps)
    if (grounded) this.phase = (this.phase + (speed / cycle) * Math.PI * 2 * dt) % (Math.PI * 2);
    this.air += ((grounded ? 0 : 1) - this.air) * Math.min(1, dt * 10);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const lerp = (a, b, t) => a + (b - a) * t;

    // Legs: negative x swings forward; knees bend through the swing.
    const thighAmp = (lerp(0.42, 0.72, run) + 0.14 * sprint) * move;
    const kneeAmp = lerp(0.6, 1.3, run) * move;
    let thighL = -s * thighAmp;
    let thighR = s * thighAmp;
    let kneeL = 0.06 * move + kneeAmp * Math.pow(Math.max(0, c), 1.5);
    let kneeR = 0.06 * move + kneeAmp * Math.pow(Math.max(0, -c), 1.5);

    // Arms counter-swing; elbows bend more when running.
    const armAmp = lerp(0.32, 0.78, run) * move;
    let shoulderL = s * armAmp;
    let shoulderR = -s * armAmp;
    let elbowL = -(lerp(0.2, 1.35, run) * move + 0.12);
    let elbowR = elbowL;
    let armOut = 0.07 + 0.05 * (1 - move);

    // Airborne tuck
    if (this.air > 0.01) {
      const a = this.air;
      thighL = lerp(thighL, -0.55, a);
      thighR = lerp(thighR, -0.15, a);
      kneeL = lerp(kneeL, 0.95, a);
      kneeR = lerp(kneeR, 0.45, a);
      shoulderL = lerp(shoulderL, -0.5, a);
      shoulderR = lerp(shoulderR, 0.3, a);
      armOut = lerp(armOut, 0.35, a);
    }

    // Body: bob (walk peaks at mid-stance, run dips), sway, lean, bank, landing dip.
    const bob = move * lerp(0.03 * Math.cos(2 * this.phase), -0.05 * Math.cos(2 * this.phase), run);
    this.drop = springDamp(this.drop, 0, this.dropVel, 0.12, dt);
    const targetLean = 0.02 + 0.022 * speed + 0.025 * Math.max(-4, Math.min(4, accelForward));
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);
    const targetBank = Math.max(-0.28, Math.min(0.28, -turnRate * speed * 0.018));
    this.bank += (targetBank - this.bank) * Math.min(1, dt * 6);
    const breathe = Math.sin(this.time * 1.7) * 0.015 * (1 - move);

    r.hips.position.y = r.hipHeight + bob + this.drop;
    r.hips.rotation.z = this.bank + move * (1 - run) * 0.035 * s;
    r.hips.rotation.y = move * 0.08 * s;
    r.spine.rotation.x = this.lean + breathe;
    r.spine.rotation.y = -move * 0.1 * s;
    r.head.rotation.x = -this.lean * 0.6;

    // Punch: wind-up, strike, recover (right arm), guard (left arm), torso twist.
    let twist = 0;
    if (this.punchT >= 0) {
      this.punchT += dt;
      const t = this.punchT;
      let w;
      let sh;
      let el;
      if (t < 0.07) {
        const k = t / 0.07;
        w = k;
        sh = 0.35;
        el = -1.7;
        twist = -0.25 * k;
      } else if (t < 0.15) {
        const k = (t - 0.07) / 0.08;
        w = 1;
        sh = lerp(0.35, -1.55, k);
        el = lerp(-1.7, -0.05, k);
        twist = lerp(-0.25, 0.32, k);
      } else if (t < 0.36) {
        const k = (t - 0.15) / 0.21;
        w = 1 - k * k;
        sh = -1.55;
        el = -0.05;
        twist = 0.32 * (1 - k);
      } else {
        w = 0;
        sh = 0;
        el = 0;
        this.punchT = -1;
      }
      shoulderR = lerp(shoulderR, sh, w);
      elbowR = lerp(elbowR, el, w);
      shoulderL = lerp(shoulderL, -0.75, w);
      elbowL = lerp(elbowL, -1.9, w);
    }
    r.spine.rotation.y += twist;

    r.thighL.rotation.x = thighL;
    r.thighR.rotation.x = thighR;
    r.kneeL.rotation.x = kneeL;
    r.kneeR.rotation.x = kneeR;
    r.shoulderL.rotation.x = shoulderL;
    r.shoulderR.rotation.x = shoulderR;
    r.shoulderL.rotation.z = armOut;
    r.shoulderR.rotation.z = -armOut;
    r.elbowL.rotation.x = elbowL;
    r.elbowR.rotation.x = elbowR;
  }
}

class PedestrianGait {
  constructor(rig) {
    this.rig = rig;
    this.phase = Math.random() * Math.PI * 2;
  }

  update(dt, speed) {
    const r = this.rig;
    const cycle = 1.2 + 0.28 * speed;
    this.phase = (this.phase + (speed / cycle) * Math.PI * 2 * dt) % (Math.PI * 2);
    const s = Math.sin(this.phase);
    const run = gaitSmooth(2.2, 5.0, speed);
    const legAmp = 0.45 + 0.3 * run;
    r.legL.rotation.x = -s * legAmp;
    r.legR.rotation.x = s * legAmp;
    r.armL.rotation.x = s * (0.35 + 0.4 * run);
    r.armR.rotation.x = -s * (0.35 + 0.4 * run);
    r.body.position.y = r.bodyHeight + (0.025 - 0.05 * run) * Math.cos(2 * this.phase);
    r.body.rotation.x = 0.04 + 0.12 * run;
  }
}

window.LOCOMOTION = LOCOMOTION;
window.OnFootController = OnFootController;
window.ProceduralGait = ProceduralGait;
window.PedestrianGait = PedestrianGait;
