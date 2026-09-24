/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * VEHICLE HANDLING & SUSPENSION VISUALS
 *
 * VehicleDynamics - single-track ("bicycle") model integrated at 120 Hz:
 * - tyre lateral force = mu * Fz * sin(C * atan(B * slipAngle)) (Pacejka-style curve),
 *   rear lateral grip limited by a friction circle when driving/braking;
 * - longitudinal load transfer (nose-heavy under braking, more rear grip accelerating);
 * - engine force with a power-limited top end, drag, rolling resistance, engine braking;
 * - handbrake locks the rear: rear grip drops with the archetype's driftFactor -> drifts;
 * - steering lock shrinks with speed (speed-sensitive steering), steering rate limited;
 * - low speed and reverse blend to a kinematic model (no turning on the spot, no jitter).
 * Archetype values (mass, accel, brake, maxSpeed, handling, driftFactor, dimensions)
 * come from config.js; VEHICLE_TUNING adds grip, weight split and body-motion gains.
 *
 * VehicleVisuals - spring-damped body pitch/roll/bounce from the accelerations, wheel
 * spin and front-wheel steering, for the player's vehicle and AI traffic alike.
 */

const VEHICLE_TUNING = Object.freeze({
  AUTO_RICKSHAW: { grip: 0.92, frontWeight: 0.42, roll: 0.022, pitch: 0.018, cgHeight: 0.4 },
  KERALA_BUS: { grip: 0.82, frontWeight: 0.5, roll: 0.02, pitch: 0.009, cgHeight: 0.42 },
  POLICE_JEEP: { grip: 1.0, frontWeight: 0.52, roll: 0.017, pitch: 0.013, cgHeight: 0.4 },
  AMBASSADOR: { grip: 0.92, frontWeight: 0.53, roll: 0.016, pitch: 0.013, cgHeight: 0.36 },
  SUPERBIKE: { grip: 1.05, frontWeight: 0.47, roll: -0.075, pitch: 0.012, cgHeight: 0.45, lean: true },
  SPORTS_CAR: { grip: 1.15, frontWeight: 0.45, roll: 0.008, pitch: 0.009, cgHeight: 0.35 },
});

const ON_ROAD = Object.freeze({ grip: 1.0, rolling: 1.0 });
const OFF_ROAD = Object.freeze({ grip: 0.72, rolling: 4.0 });

function vClamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

class VehicleDynamics {
  constructor(vehicle) {
    const a = vehicle.archetype;
    const t = VEHICLE_TUNING[a.type] || {};
    this.vehicle = vehicle;
    this.arch = a;
    this.mass = a.mass;
    this.L = a.length * 0.62; // wheelbase
    const fw = t.frontWeight !== undefined ? t.frontWeight : 0.5;
    this.a = this.L * (1 - fw); // CG -> front axle
    this.b = this.L * fw; // CG -> rear axle
    this.h = a.height * (t.cgHeight || 0.38);
    this.inertia = (this.mass * (this.L * this.L + a.width * a.width)) / 12;
    this.mu = t.grip || 1;
    this.engineForce = this.mass * a.accel * 0.8;
    this.power = this.engineForce * a.maxSpeed * 0.5;
    this.rollRes = 0.015 * this.mass * 9.81;
    const vTerminal = a.maxSpeed * 1.08; // drag balances power just above the limiter
    this.dragK = Math.max(0.05, (this.power / vTerminal - this.rollRes) / (vTerminal * vTerminal));
    this.brakeForce = this.mass * a.brake;
    this.steerLock = vClamp(0.36 + a.handling * 0.012, 0.42, 0.66);
    this.steerRef = 10 + a.handling * 0.35; // speed where the lock has halved
    this.handbrakeGrip = 1 - 0.62 * a.driftFactor;
    this.maxReverse = 10;
    if (!vehicle.velocity) vehicle.velocity = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.u = 0; // forward speed (m/s)
    this.vl = 0; // lateral speed, + = left
    this.r = 0; // yaw rate, + = turning left
    this.steer = 0;
    this.ax = 0;
    this.ay = 0;
    this.braking = false;
    this.lateralSpeed = 0;
    this.vehicle.velocity.set(0, 0, 0);
  }

  enter(speed) {
    this.reset();
    this.u = speed || 0;
  }

  tyre(slip) {
    return Math.sin(1.4 * Math.atan(9 * slip));
  }

  update(dt, input, surface = ON_ROAD) {
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, input, surface);
    const v = this.vehicle;
    const s = Math.sin(v.heading);
    const c = Math.cos(v.heading);
    v.speed = this.u;
    v.velocity.set(s * this.u + c * this.vl, 0, c * this.u - s * this.vl);
    this.lateralSpeed = this.vl;
  }

  step(h, input, surface) {
    const v = this.vehicle;
    const m = this.mass;
    const L = this.L;
    const a = this.a;
    const b = this.b;
    const u = this.u;
    const absU = Math.abs(u);

    // Speed-sensitive, rate-limited steering.
    const lock = this.steerLock / (1 + (absU / this.steerRef) * (absU / this.steerRef));
    const target = input.steer * lock;
    const rate = (Math.abs(target) > Math.abs(this.steer) ? 2.8 : 4.5) * h;
    this.steer += vClamp(target - this.steer, -rate, rate);
    const d = this.steer;

    // Longitudinal forces. rearFx = what the rear tyres transmit (drive, rear brake share,
    // locked handbrake) - it eats into their lateral grip (friction circle).
    let Fx = 0;
    let rearFx = 0;
    this.braking = false;
    if (input.throttle > 0) {
      if (u > -0.5) {
        const drive = Math.min(this.engineForce, this.power / Math.max(absU, 1)) * input.throttle;
        Fx += drive;
        rearFx += drive;
      } else {
        Fx += this.brakeForce * input.throttle;
        this.braking = true;
      }
    }
    if (input.brake > 0) {
      if (u > 0.5) {
        Fx -= this.brakeForce * input.brake;
        rearFx -= 0.4 * this.brakeForce * input.brake;
        this.braking = true;
      } else if (u > -this.maxReverse) {
        Fx -= this.engineForce * 0.55 * input.brake;
      }
    }
    if (input.handbrake && absU > 0.5) {
      Fx -= Math.sign(u) * m * 5.5;
      rearFx -= Math.sign(u) * m * 5.5;
      this.braking = true;
    }
    const coasting = !(input.throttle > 0) && !(input.brake > 0);
    if (absU > 0.05) {
      Fx -= Math.sign(u) * (this.rollRes * surface.rolling + this.dragK * u * u);
      if (coasting) Fx -= Math.sign(u) * m * 1.6; // engine braking
    }
    if (u >= this.arch.maxSpeed && Fx > 0) Fx = 0; // limiter

    // Axle loads with longitudinal weight transfer.
    const W = m * 9.81;
    const Fzf = Math.max(0.15 * W, (W * b) / L - (m * this.ax * this.h) / L);
    const Fzr = Math.max(0.15 * W, (W * a) / L + (m * this.ax * this.h) / L);

    // Weight of the kinematic (no-slip) model: 1 below ~1 m/s and in reverse, 0 above 3.5 m/s.
    const t = vClamp((3.5 - absU) / 2.5, 0, 1);
    const kin = u < 0 ? 1 : t * t * (3 - 2 * t);

    // Lateral tyre forces (faded out where the kinematic model takes over). The rear axle
    // gets a little more grip than the front so the cars understeer at the limit instead
    // of spinning - unless the handbrake is pulled.
    let Fyf = 0;
    let Fyr = 0;
    if (kin < 1) {
      const uS = Math.max(absU, 2.0);
      const slipF = Math.atan2(this.vl + a * this.r, uS) - d;
      const slipR = Math.atan2(this.vl - b * this.r, uS);
      const grip = this.mu * surface.grip;
      const muR = grip * 1.12 * (input.handbrake ? this.handbrakeGrip : 1);
      // traction-control-like: drive force only partly eats into lateral grip
      const used = Math.min(Math.abs(rearFx) * (input.handbrake ? 0.8 : 0.35), muR * Fzr * 0.95);
      const maxR = Math.sqrt(Math.max(0, muR * Fzr * (muR * Fzr) - used * used));
      Fyf = -grip * Fzf * this.tyre(slipF) * (1 - kin);
      Fyr = -maxR * this.tyre(slipR) * (1 - kin);
    }

    const sd = Math.sin(d);
    const cd = Math.cos(d);
    const ax = (Fx - Fyf * sd) / m;
    const ay = (Fyf * cd + Fyr) / m;
    this.u += (ax + this.vl * this.r) * h;
    this.vl += (ay - u * this.r) * h;
    this.r += ((a * Fyf * cd - b * Fyr) / this.inertia) * h;
    if (!input.handbrake) this.r -= this.r * 1.5 * h; // yaw stability (arcade-leaning)

    // Low speed and reverse: kinematic bicycle (no slip), so no spinning on the spot.
    if (kin > 0) {
      const rKin = (this.u * Math.tan(d)) / L;
      this.r += (rKin - this.r) * kin;
      this.vl -= this.vl * Math.min(1, kin * 12 * h);
    }
    if (coasting && !input.handbrake && Math.abs(this.u) < 0.08) this.u = 0;
    if (this.u < -this.maxReverse) this.u = -this.maxReverse;

    v.heading += this.r * h;
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    v.position.x += (sh * this.u + ch * this.vl) * h;
    v.position.z += (ch * this.u - sh * this.vl) * h;

    const k = Math.min(1, h * 12);
    this.ax += (ax - this.ax) * k;
    this.ay += (ay - this.ay) * k;
  }

  // Crash: lose speed, get knocked off line a little.
  applyImpact(keep) {
    this.u *= keep;
    this.vl *= keep;
    this.r += (Math.random() - 0.5) * 0.8;
  }
}

const VehicleVisuals = {
  // Spring-damped body motion (about 1.5 Hz, lightly damped) + wheel spin and steer.
  update(vehicle, dt, ax, ay, steer, u) {
    const ud = vehicle.mesh.userData;
    if (!ud.body) return;
    const t = VEHICLE_TUNING[vehicle.archetype.type] || {};
    const s = vehicle.suspension || (vehicle.suspension = { pitch: 0, pv: 0, roll: 0, rv: 0, time: Math.random() * 10 });
    const pitchT = vClamp(-ax * (t.pitch || 0.012), -0.08, 0.08);
    const rollLimit = t.lean ? 0.6 : 0.12;
    const rollT = vClamp(ay * (t.roll || 0.015), -rollLimit, rollLimit);
    const steps = Math.max(1, Math.ceil(dt * 60));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      s.pv += (90 * (pitchT - s.pitch) - 7 * s.pv) * h;
      s.pitch += s.pv * h;
      s.rv += ((t.lean ? 40 : 90) * (rollT - s.roll) - 7 * s.rv) * h;
      s.roll += s.rv * h;
    }
    s.time += dt;
    const bump = Math.min(1, Math.abs(u) / 20) * 0.012 * Math.sin(s.time * 17.0) * Math.sin(s.time * 5.3);
    ud.body.rotation.x = s.pitch;
    ud.body.rotation.z = s.roll;
    ud.body.position.y = bump;

    const wheels = ud.wheels;
    for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x += (u / (wheels[i].userData.radius || 0.35)) * dt;
    const front = ud.frontWheels || [];
    for (let i = 0; i < front.length; i++) front[i].rotation.y = steer;
  },

  // AI vehicles set heading/speed directly; derive their accelerations for body motion.
  animateAI(vehicle, dt) {
    const st = vehicle.aiMotion || (vehicle.aiMotion = { heading: vehicle.heading, speed: vehicle.speed });
    let dh = vehicle.heading - st.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const r = dt > 0 ? dh / dt : 0;
    const ax = dt > 0 ? (vehicle.speed - st.speed) / dt : 0;
    st.heading = vehicle.heading;
    st.speed = vehicle.speed;
    const steer = Math.atan((r * vehicle.archetype.length * 0.62) / Math.max(vehicle.speed, 1));
    this.update(vehicle, dt, vClamp(ax, -12, 12), vClamp(vehicle.speed * r, -12, 12), vClamp(steer, -0.6, 0.6), vehicle.speed);
  },
};

window.VEHICLE_TUNING = VEHICLE_TUNING;
window.VEHICLE_SURFACE = { ON_ROAD, OFF_ROAD };
window.VehicleDynamics = VehicleDynamics;
window.VehicleVisuals = VehicleVisuals;
