#!/usr/bin/env node
/**
 * Dev-only unit checks for the pure-maths modules (no browser needed):
 * vehicle dynamics per archetype, camera spring, time-of-day sun path, and the
 * real-Kakkanad map data / road graph.
 *   node tools/unit-checks.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const context = { console, Math, performance: { now: () => 0 } };
context.window = context;
vm.createContext(context);
["libs/three.min.js", "src/data/kakkanad-geo.js", "src/config.js", "src/roadgraph.js", "src/vehicle-physics.js", "src/camera.js", "src/gfx/sky.js"].forEach((f) => {
  let code = fs.readFileSync(path.join(ROOT, f), "utf8");
  if (f.endsWith("three.min.js")) code = code.replace(/^/, "var exports = undefined, module = undefined, define = undefined;\n");
  vm.runInContext(code, context, { filename: f });
});
const { THREE, VehicleDynamics, VEHICLE_SURFACE, springDamp, TimeOfDay, KAKKANAD_CONFIG, KAKKANAD_GEO, RoadGraph } = vm.runInContext(
  "({ THREE, VehicleDynamics, VEHICLE_SURFACE, springDamp, TimeOfDay, KAKKANAD_CONFIG, KAKKANAD_GEO, RoadGraph })",
  context
);

let failures = 0;
const check = (name, pass, detail) => {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name.padEnd(46)} ${detail}`);
};

function makeVehicle(arch) {
  return { archetype: arch, position: new THREE.Vector3(), heading: 0, speed: 0 };
}
function run(dyn, seconds, input, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) dyn.update(dt, input, VEHICLE_SURFACE.ON_ROAD);
}
const finite = (v) => [v.position.x, v.position.z, v.heading, v.speed].every(Number.isFinite);

// --- vehicles -------------------------------------------------------------------------
Object.values(KAKKANAD_CONFIG.VEHICLE_ARCHETYPES).forEach((arch) => {
  const v = makeVehicle(arch);
  const dyn = new VehicleDynamics(v);

  // Acceleration and top speed
  let t90 = null;
  for (let t = 0; t < 40; t += 1 / 60) {
    dyn.update(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false }, VEHICLE_SURFACE.ON_ROAD);
    if (t90 === null && v.speed >= 0.9 * arch.maxSpeed) t90 = t;
  }
  const top = v.speed;
  check(`${arch.type} top speed ~ config ${arch.maxSpeed} m/s`, Math.abs(top - arch.maxSpeed) / arch.maxSpeed < 0.05, `${top.toFixed(2)} m/s`);
  check(`${arch.type} 0-90% top speed in 2-9 s`, t90 !== null && t90 > 2 && t90 < 9, `${t90 === null ? "never" : t90.toFixed(2) + " s"} (old model ${(arch.maxSpeed * 0.9 / arch.accel).toFixed(2)} s)`);

  // Braking from top speed
  let dist = 0;
  let tb = 0;
  const z0 = v.position.clone();
  while (v.speed > 0.3 && tb < 10) {
    dyn.update(1 / 60, { throttle: 0, brake: 1, steer: 0, handbrake: false }, VEHICLE_SURFACE.ON_ROAD);
    tb += 1 / 60;
  }
  dist = v.position.distanceTo(z0);
  const ideal = (arch.maxSpeed * arch.maxSpeed) / (2 * arch.brake);
  check(`${arch.type} brakes to rest`, tb < 10 && dist < ideal * 1.6, `${dist.toFixed(1)} m in ${tb.toFixed(2)} s`);

  // No turning on the spot
  dyn.enter(0);
  const h0 = v.heading;
  run(dyn, 2, { throttle: 0, brake: 0, steer: 1, handbrake: false });
  check(`${arch.type} does not rotate while stationary`, Math.abs(v.heading - h0) < 1e-6, `dHeading ${(v.heading - h0).toExponential(1)}`);

  // Cornering at speed stays controllable; handbrake produces a slide
  dyn.enter(arch.maxSpeed * 0.7);
  run(dyn, 2.5, { throttle: 0.6, brake: 0, steer: 1, handbrake: false });
  const slipGrip = Math.abs(dyn.lateralSpeed);
  const yawGrip = Math.abs(dyn.r);
  const speedGrip = Math.abs(v.speed);
  dyn.enter(arch.maxSpeed * 0.7);
  let maxSlip = 0;
  for (let t = 0; t < 1.0; t += 1 / 60) {
    dyn.update(1 / 60, { throttle: 0.6, brake: 0, steer: 1, handbrake: true }, VEHICLE_SURFACE.ON_ROAD);
    maxSlip = Math.max(maxSlip, Math.abs(dyn.lateralSpeed));
  }
  const sideslipDeg = (Math.atan2(slipGrip, Math.max(1, speedGrip)) * 180) / Math.PI;
  check(
    `${arch.type} full-lock cornering without spinning`,
    yawGrip > 0.05 && yawGrip < 1.0 && sideslipDeg < 8 && finite(v),
    `yaw ${yawGrip.toFixed(2)} rad/s, sideslip ${sideslipDeg.toFixed(1)} deg`
  );
  check(`${arch.type} handbrake slides the rear`, maxSlip > slipGrip + 0.8, `max lateral ${maxSlip.toFixed(2)} m/s`);

  // Stability at the largest frame step the game allows
  dyn.enter(arch.maxSpeed);
  for (let i = 0; i < 300; i++) {
    dyn.update(0.1, { throttle: 1, brake: 0, steer: i % 40 < 20 ? 1 : -1, handbrake: i % 7 === 0 }, VEHICLE_SURFACE.OFF_ROAD);
  }
  check(`${arch.type} stable at dt=0.1 (no NaN / blow-up)`, finite(v) && Math.abs(v.speed) <= arch.maxSpeed * 1.05, `speed ${v.speed.toFixed(2)}`);
});

// --- camera spring: critically damped, no overshoot -----------------------------------
{
  let x = 0;
  const vel = { v: 0 };
  let over = 0;
  for (let i = 0; i < 240; i++) {
    x = springDamp(x, 10, vel, 0.3, 1 / 60);
    over = Math.max(over, x - 10);
  }
  check("camera spring converges without overshoot", Math.abs(x - 10) < 1e-3 && over < 1e-6, `x=${x.toFixed(4)} overshoot=${over.toExponential(1)}`);
}

// --- time of day: sun path at 10 deg N ---------------------------------------------------
{
  const tod = new TimeOfDay();
  const dir = new THREE.Vector3();
  const elev = (h) => {
    tod.setTime(h, 0);
    tod.sunDirection(dir);
    return (Math.asin(dir.y) * 180) / Math.PI;
  };
  check("sun near zenith at noon", elev(12) > 80, `${elev(12).toFixed(1)} deg`);
  check("sun below horizon at midnight", elev(0) < -70, `${elev(0).toFixed(1)} deg`);
  check("sunrise ~06:00, sunset ~18:00", elev(5.8) < 0 && elev(6.2) > 0 && elev(17.8) > 0 && elev(18.2) < 0, `05:48 ${elev(5.8).toFixed(1)}, 18:12 ${elev(18.2).toFixed(1)}`);
  tod.setTime(7, 0);
  tod.sunDirection(dir);
  check("morning sun rises in the east (+X)", dir.x > 0.5, `dir.x ${dir.x.toFixed(2)}`);
  tod.setTime(12, 0);
  tod.sunDirection(dir);
  check("noon sun slightly south (+Z) at 10N, decl 5N", dir.z > 0.05 && dir.z < 0.15, `dir.z ${dir.z.toFixed(3)}`);
}

// --- real Kakkanad map data and road graph -------------------------------------------------
{
  const C = KAKKANAD_CONFIG;
  const roads = C.ROAD_NETWORK;
  const allPts = roads.flatMap((r) => r.points);
  check("map data: roads with real names", roads.length >= 20 && roads.every((r) => r.name && r.points.length >= 2), `${roads.length} roads`);
  check("map data: coordinates finite", allPts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)), `${allPts.length} points`);
  const names = roads.map((r) => r.name);
  const must = ["Seaport-Airport Road", "Civil Line Road", "Infopark Expressway", "Kakkanad-Pallikkara Road"];
  check("map data: main Kakkanad roads present", must.every((n) => names.includes(n)), must.filter((n) => !names.includes(n)).join(", ") || "all");
  const lm = (id) => C.KEY_LANDMARKS.find((l) => l.id === id);
  // bearings from Kakkanad Junction (origin): Infopark east-south-east, temple north-west
  const bearing = (l) => ((Math.atan2(l.x, -l.z) * 180) / Math.PI + 360) % 360;
  check("geography: Infopark ESE of Kakkanad Jn", bearing(lm("infopark")) > 100 && bearing(lm("infopark")) < 140, `${bearing(lm("infopark")).toFixed(0)} deg`);
  check("geography: Thrikkakara temple NW", bearing(lm("temple")) > 300 && bearing(lm("temple")) < 340, `${bearing(lm("temple")).toFixed(0)} deg`);
  check("geography: Water Metro south", bearing(lm("water_metro")) > 170 && bearing(lm("water_metro")) < 190, `${bearing(lm("water_metro")).toFixed(0)} deg`);

  const g = new RoadGraph(roads);
  const junctions = g.nodes.filter((n) => n.junction);
  check("road graph: junctions found", junctions.length >= 20 && g.edges.length >= 40, `${g.nodes.length} nodes, ${junctions.length} junctions, ${g.edges.length} edges`);
  // connected: BFS over edges from Kakkanad Junction
  const origin = g.nodes.find((n) => Math.hypot(n.x, n.z) < 1);
  const seen = new Set([origin]);
  const queue = [origin];
  while (queue.length) {
    const n = queue.shift();
    n.arms.forEach((a) => {
      const other = a.dir > 0 ? a.edge.b : a.edge.a;
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    });
  }
  check("road graph: every node reachable", seen.size === g.nodes.length, `${seen.size}/${g.nodes.length}`);
  const badTrim = g.edges.filter((e) => !(e.trimA >= 0 && e.trimB >= 0 && e.trimA + e.trimB < e.len));
  check("road graph: junction trims leave road", badTrim.length === 0, `${badTrim.length} bad`);
  const q = g.nearest(3, 4, 100);
  check("road graph: nearest road query", q && q.distance < 6, q ? `${q.road.name} ${q.distance.toFixed(2)} m` : "none");
  // lanes keep left: travelling a->b, lane 0 lies to the left
  const e0 = g.edges[0];
  const p0 = g.lanePoint(e0, 1, e0.len / 2, g.laneOffset(e0, 0));
  const c0 = g.pointAt(e0, e0.len / 2);
  const leftDot = (p0.x - c0.x) * c0.dz - (p0.z - c0.z) * c0.dx;
  check("lanes: traffic keeps left (India)", leftDot > 0, `offset ${leftDot.toFixed(2)} m`);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL UNIT CHECKS PASSED");
process.exit(failures ? 1 : 0);
