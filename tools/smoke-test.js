#!/usr/bin/env node
/**
 * Dev-only smoke test (never loaded by the game; the game itself stays zero-build).
 *
 * Serves the repo on a local port, loads it in headless Chromium, steps the game
 * deterministically through ?test=1 and checks that every feature still works.
 * Fails (exit code 1) on any console error/warning, page error, NaN, or broken feature.
 *
 *   node tools/smoke-test.js                                  # medium tier
 *   node tools/smoke-test.js --tiers=low,medium,high --shots=/tmp/shots
 *   node tools/smoke-test.js --webgl1                         # force the WebGL1 fallback
 *   node tools/smoke-test.js --switch                         # also cycle quality at runtime
 *
 * Requires Playwright + Chromium: `npm i -g playwright && npx playwright install chromium`.
 * Rendering in headless Chromium is software (SwiftShader), so frame times are meaningless;
 * draw calls, triangles and correctness are what this measures.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const args = {};
process.argv.slice(2).forEach((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  args[k] = v === undefined ? true : v;
});
const TIERS = String(args.tiers || "medium").split(",");
const SHOTS = args.shots ? path.resolve(String(args.shots)) : null;
const TIMES = String(args.times || "08:45,12:00,18:30,22:00").split(",");

// Same camera poses as the pre-upgrade baseline screenshots.
const POSES = {
  street: { p: [-58, 2.2, 245], t: [-110, 1.5, 0] },
  junction: { p: [-40, 14, 215], t: [-70, 0, 160] },
  infopark: { p: [430, 6, -250], t: [520, 30, -340] },
};
// Same draw-call probe views as the baseline measurement (spawnView = game camera).
const PROBES = {
  downSPAPRoad: { p: [-60, 3, 250], t: [-150, 1, -300] },
  birdsEye: { p: [-70, 60, 260], t: [-70, 0, 160] },
};

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (e) {
    const globalRoot = require("child_process").execSync("npm root -g").toString().trim();
    return require(path.join(globalRoot, "playwright"));
  }
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split("?")[0]);
      if (rel === "/") rel = "/index.html";
      const file = path.join(ROOT, path.normalize(rel));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Code below runs inside the page.
// ---------------------------------------------------------------------------

function installHelpers() {
  const g = window.gameEngine;
  const key = (code, down) =>
    window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
  window.__smoke = {
    key,
    tap(code) {
      key(code, true);
      key(code, false);
    },
    run(seconds, dt = 1 / 60) {
      for (let t = 0; t < seconds - 1e-9; t += dt) g.tick(dt, false);
    },
    render(frames = 1) {
      for (let i = 0; i < frames; i++) g.tick(1 / 60, true);
    },
    pose(p, t) {
      g.updateCamera = () => {};
      g.camera.position.set(p[0], p[1], p[2]);
      g.camera.lookAt(t[0], t[1], t[2]);
      g.camera.updateMatrixWorld();
      if (g.composer && g.composer.resetHistory) g.composer.resetHistory();
    },
    unpose() {
      delete g.updateCamera; // back to the prototype method
      if (g.cameraRig && g.cameraRig.snap) g.cameraRig.snap();
    },
    setTime(hhmm) {
      const [h, m] = hhmm.split(":").map(Number);
      if (g.timeOfDay && g.timeOfDay.setTime) {
        g.timeOfDay.setTime(h, m);
        return true;
      }
      return false;
    },
    measureCalls() {
      const r = g.renderer;
      const autoReset = r.info.autoReset;
      const target = r.getRenderTarget();
      r.info.autoReset = false;
      r.setRenderTarget(null);
      r.shadowMap.autoUpdate = false;
      r.info.reset();
      r.render(g.scene, g.camera);
      const mainCalls = r.info.render.calls;
      const mainTris = r.info.render.triangles;
      r.shadowMap.autoUpdate = true;
      r.info.reset();
      r.render(g.scene, g.camera);
      const shadowCalls = r.info.render.calls - mainCalls;
      r.info.autoReset = autoReset;
      r.setRenderTarget(target);
      return { mainCalls, mainTris, shadowCalls };
    },
  };
}

function scanScene() {
  const g = window.gameEngine;
  let nanMeshes = 0;
  let meshes = 0;
  let casters = 0;
  const materials = new Set();
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.castShadow) casters++;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m));
    const pos = o.geometry && o.geometry.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.array.length; i++) {
      if (Number.isNaN(pos.array[i])) {
        nanMeshes++;
        break;
      }
    }
  });
  const r = g.renderer;
  return {
    meshes,
    shadowCasters: casters,
    materials: materials.size,
    nanMeshes,
    webgl2: r.capabilities.isWebGL2,
    programs: r.info.programs ? r.info.programs.length : null,
    tier: g.quality ? g.quality.tierName : "n/a",
  };
}

function runScenario() {
  const S = window.__smoke;
  const g = window.gameEngine;
  const P = g.player;
  const T = g.trafficManager;
  const POL = g.policeManager;
  const M = g.missionEngine;
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
  const finite = (v) => [v.x, v.y, v.z].every(Number.isFinite);
  const resetPolice = () => {
    POL.wantedLevel = 0;
    POL.crimeHeat = 0;
    POL.evasionTimer = 0;
    POL.deactivateAllPolice();
  };

  // Free Roam was clicked with a real mouse before this runs.
  check("freeRoamClickDoesNotPunch", POL.wantedLevel === 0 && P.cash === 3500, { wanted: POL.wantedLevel, cash: P.cash });

  // Park all traffic far away except one car kept for the carjack test.
  const jack = T.vehicles[0];
  T.vehicles.forEach((v, i) => {
    v.speed = 0;
    if (v === jack) v.position.set(-30, 0, 120);
    else v.position.set(2000 + i * 25, 0, 2000);
    v.mesh.position.copy(v.position);
  });

  S.run(0.5);
  const starter = P.starterVehicle;
  starter.mesh.updateMatrixWorld(true);
  const camLocal = g.camera.position.clone().applyMatrix4(starter.mesh.matrixWorld.clone().invert());
  const insideAuto = Math.abs(camLocal.x) < 0.9 && Math.abs(camLocal.z) < 1.9 && camLocal.y < 2.2;
  check("cameraClearOfStarterAuto", !insideAuto && g.camera.position.distanceTo(starter.position) > 2.0, {
    dist: +g.camera.position.distanceTo(starter.position).toFixed(2),
  });

  // Walk, sprint, jump.
  let p0 = P.position.clone();
  S.key("KeyW", true);
  S.run(1.5);
  S.key("KeyW", false);
  const walked = P.position.distanceTo(p0);
  S.run(0.6);
  check("walk", walked > 4 && P.state === "ON_FOOT", { metres: +walked.toFixed(2) });

  p0 = P.position.clone();
  S.key("KeyW", true);
  S.key("ShiftLeft", true);
  S.run(1.5);
  S.key("ShiftLeft", false);
  S.key("KeyW", false);
  const sprinted = P.position.distanceTo(p0);
  S.run(0.6);
  check("sprint", sprinted > walked * 1.2, { metres: +sprinted.toFixed(2) });

  S.key("Space", true);
  S.run(0.05);
  S.key("Space", false);
  S.run(0.15);
  const airborneY = P.position.y;
  S.run(1.5);
  check("jump", airborneY > 0.3 && P.position.y === 0 && P.isGrounded, { peakSample: +airborneY.toFixed(2) });

  // Punch a pedestrian placed right in front of the player.
  const ped = T.pedestrians[0];
  const fwd = new THREE.Vector3(Math.sin(P.heading), 0, Math.cos(P.heading));
  ped.position.copy(P.position).addScaledVector(fwd, 1.4);
  ped.group.position.copy(ped.position);
  ped.health = 50;
  ped.isKnockedOut = false;
  P.punchCooldown = 0;
  const cash0 = P.cash;
  S.tap("Enter");
  S.run(0.4);
  check("punchKnockoutCashAndWanted", P.cash > cash0 && ped.isKnockedOut && POL.wantedLevel >= 1, {
    cashGain: P.cash - cash0,
    wanted: POL.wantedLevel,
  });
  resetPolice();

  // Enter the starter rickshaw and drive it.
  P.position.set(starter.position.x - 2, 0, starter.position.z);
  S.tap("KeyF");
  S.run(0.1);
  check("enterVehicle", P.state === "IN_VEHICLE" && P.currentVehicle === starter, { state: P.state });

  S.key("KeyW", true);
  S.run(3.0);
  const cruise = P.speed;
  const speedText = Number((document.getElementById("car-speed") || {}).textContent);
  check("accelerate", cruise > 8, { speed: +cruise.toFixed(2), hudKmh: speedText });
  check("speedometerHud", speedText > 20, { hudKmh: speedText });

  const h0 = starter.heading;
  let maxRoll = 0;
  S.key("KeyA", true);
  for (let i = 0; i < 72; i++) {
    S.run(1 / 60);
    const body = starter.mesh.userData.body;
    if (body) maxRoll = Math.max(maxRoll, Math.abs(body.rotation.z));
  }
  S.key("KeyA", false);
  check("steer", Math.abs(starter.heading - h0) > 0.3, { headingChange: +(starter.heading - h0).toFixed(2) });
  if (starter.mesh.userData.body) check("bodyRoll", maxRoll > 0.004, { maxRollRad: +maxRoll.toFixed(4) });

  if (starter.dynamics) {
    S.run(1.0);
    let maxSlip = 0;
    S.key("KeyD", true);
    S.key("Space", true);
    for (let i = 0; i < 60; i++) {
      S.run(1 / 60);
      maxSlip = Math.max(maxSlip, Math.abs(starter.dynamics.lateralSpeed || 0));
    }
    S.key("Space", false);
    S.key("KeyD", false);
    check("handbrakeDrift", maxSlip > 1.0, { maxLateralMs: +maxSlip.toFixed(2) });
  }

  // Brake until stopped (holding S any longer would engage reverse).
  S.key("KeyW", false);
  S.key("KeyS", true);
  let brakeTime = 0;
  while (P.speed > 0.3 && brakeTime < 6) {
    S.run(1 / 60);
    brakeTime += 1 / 60;
  }
  S.key("KeyS", false);
  S.run(0.5);
  check("brake", Math.abs(P.speed) < 1.5 && brakeTime < 6, { speed: +P.speed.toFixed(2), seconds: +brakeTime.toFixed(2) });

  S.tap("KeyH");
  const station0 = window.soundEngine.currentStation;
  S.tap("KeyR");
  check("radio", window.soundEngine.currentStation !== station0, { station: window.soundEngine.currentStation });

  S.tap("KeyF");
  S.run(0.1);
  check("exitVehicle", P.state === "ON_FOOT" && !P.currentVehicle, { state: P.state });

  // Carjack the parked traffic car.
  P.position.set(jack.position.x + 2, 0, jack.position.z);
  const heat0 = POL.crimeHeat;
  S.tap("KeyF");
  S.run(0.1);
  check("carjack", P.currentVehicle === jack && POL.crimeHeat > heat0, { heat: POL.crimeHeat });
  S.tap("KeyF");
  S.run(0.1);
  resetPolice();

  // Mission 1: start, teleport to the target, complete.
  const cash1 = P.cash;
  M.startMission("mission_1");
  S.run(0.1);
  const target = M.activeMission && M.activeMission.targetPos;
  if (target) P.position.set(target.x, 0, target.z);
  S.run(0.2);
  check("missionComplete", !!target && M.activeMission === null && P.cash >= cash1 + 1500, { cashGain: P.cash - cash1 });

  // Police pursuit.
  P.position.set(-70, 0, 160);
  POL.addCrimeHeat(130);
  S.run(0.1);
  const units = POL.policeUnits.filter((u) => u.isActive);
  const d0 = units.length ? units[0].position.distanceTo(P.position) : 0;
  S.run(0.8);
  const d1 = units.length ? units[0].position.distanceTo(P.position) : 0;
  const stars = document.querySelectorAll(".star.active").length;
  check("policePursuit", POL.wantedLevel >= 3 && units.length >= 2 && d1 < d0 && stars === POL.wantedLevel, {
    wanted: POL.wantedLevel,
    units: units.length,
    closing: +(d0 - d1).toFixed(2),
    stars,
  });
  resetPolice();
  S.run(0.2);

  // Camera modes cycle back to chase.
  const mode0 = g.cameraMode;
  for (let i = 0; i < 3; i++) {
    S.tap("KeyC");
    S.run(0.3);
    if (!finite(g.camera.position)) break;
  }
  check("cameraModes", g.cameraMode === mode0 && finite(g.camera.position), { mode: g.cameraMode });

  // HUD: clock ticking, radar drawn.
  const clock = document.getElementById("clock-display").textContent;
  const radar = document.getElementById("radar-canvas");
  const px = radar.getContext("2d").getImageData(0, 0, radar.width, radar.height).data;
  let drawn = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) drawn++;
  check("hud", clock !== "08:45 AM" && drawn > 500, { clock, radarPixels: drawn });

  check("noNaN", finite(P.position) && finite(g.camera.position) && Number.isFinite(P.heading), {});
  return results;
}

// ---------------------------------------------------------------------------

async function runTier(browser, port, tier) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    const type = m.type();
    if (type !== "error" && type !== "warning") return;
    const url = (m.location() && m.location().url) || "";
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return; // fonts are blocked offline on purpose
    problems.push(`${type}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?quality=${tier}&test=1&governor=0`, { waitUntil: "load" });
  await page.waitForFunction(() => window.gameEngine && window.gameEngine.ready === true, null, { timeout: 120000 });
  await page.evaluate(installHelpers);
  const scene = await page.evaluate(scanScene);

  await page.click("#start-free-roam-btn");
  await page.evaluate(() => window.__smoke.render(3));
  const loadSeconds = (Date.now() - t0) / 1000;

  const calls = { spawnView: await page.evaluate(() => window.__smoke.measureCalls()) };
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${tier}-spawn.png`) });
  for (const [name, pose] of Object.entries(PROBES)) {
    calls[name] = await page.evaluate(({ p, t }) => {
      window.__smoke.pose(p, t);
      return window.__smoke.measureCalls();
    }, pose);
  }
  const frameStats = await page.evaluate(() => {
    const g = window.gameEngine;
    window.__smoke.render(2);
    return g.composer && g.composer.stats ? g.composer.stats : null;
  });

  if (SHOTS) {
    for (const hhmm of TIMES) {
      const hasClock = await page.evaluate((t) => window.__smoke.setTime(t), hhmm);
      for (const [name, pose] of Object.entries(POSES)) {
        await page.evaluate(({ p, t }) => {
          window.__smoke.pose(p, t);
          window.__smoke.render(3);
        }, pose);
        await page.screenshot({ path: path.join(SHOTS, `${tier}-${name}-${hhmm.replace(":", "")}.png`) });
      }
      if (!hasClock) break; // pre-sky builds have a fixed look; one set is enough
    }
    await page.evaluate(() => window.__smoke.setTime("08:45"));
  }
  await page.evaluate(() => window.__smoke.unpose());

  const results = await page.evaluate(runScenario);

  if (SHOTS) {
    // Driving shot: back in the starter rickshaw, heading up the road at speed.
    await page.evaluate(() => {
      const S = window.__smoke;
      const P = window.gameEngine.player;
      const v = P.starterVehicle;
      if (P.state === "IN_VEHICLE") S.tap("KeyF");
      v.position.set(-120, 0, -20);
      v.heading = Math.atan2(-200 - -120, -100 - -20) + 0.35;
      v.speed = 0;
      if (v.dynamics && v.dynamics.reset) v.dynamics.reset();
      v.mesh.position.copy(v.position);
      v.mesh.rotation.y = v.heading;
      P.position.set(v.position.x - 2, 0, v.position.z);
      S.tap("KeyF");
      S.key("KeyW", true);
      S.run(2.5);
      S.key("KeyA", true);
      S.run(0.35);
      S.render(3);
    });
    await page.screenshot({ path: path.join(SHOTS, `${tier}-driving.png`) });
    await page.evaluate(() => {
      window.__smoke.key("KeyA", false);
      window.__smoke.key("KeyW", false);
    });
  }

  if (args.switch) {
    const switched = await page.evaluate(() => {
      const g = window.gameEngine;
      if (!g.quality) return "n/a";
      const seen = [];
      for (let i = 0; i < 3; i++) {
        window.__smoke.tap("KeyG");
        window.__smoke.render(2);
        seen.push(g.quality.tierName);
      }
      return seen.join(">");
    });
    results.push({ name: "runtimeQualitySwitch", pass: switched !== "", detail: { sequence: switched } });
  }

  await context.close();
  return { tier, loadSeconds, scene, calls, frameStats, results, problems };
}

(async () => {
  const { chromium } = loadPlaywright();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const launchArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  if (args.webgl1) launchArgs.push("--disable-webgl2");
  const browser = await chromium.launch({ args: launchArgs });

  let failed = false;
  const report = [];
  for (const tier of TIERS) {
    const r = await runTier(browser, port, tier);
    report.push(r);
    const bad = r.results.filter((x) => !x.pass);
    if (bad.length || r.problems.length || r.scene.nanMeshes) failed = true;

    console.log(`\n=== tier: ${tier}${args.webgl1 ? " (WebGL1)" : ""}  active: ${r.scene.tier}  webgl2: ${r.scene.webgl2}  load: ${r.loadSeconds.toFixed(1)}s`);
    console.log(`scene: ${r.scene.meshes} meshes, ${r.scene.shadowCasters} shadow casters, ${r.scene.materials} materials, NaN meshes: ${r.scene.nanMeshes}`);
    for (const [view, c] of Object.entries(r.calls)) {
      console.log(`draw calls ${view.padEnd(13)} main ${String(c.mainCalls).padStart(5)}  shadow ${String(c.shadowCalls).padStart(4)}  tris ${c.mainTris}`);
    }
    if (r.frameStats) console.log("frame stats:", JSON.stringify(r.frameStats));
    r.results.forEach((x) => console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name.padEnd(28)} ${JSON.stringify(x.detail)}`));
    console.log(r.problems.length ? `console problems (${r.problems.length}):\n  ${r.problems.slice(0, 15).join("\n  ")}` : "console: clean");
  }
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(report, null, 2));

  await browser.close();
  server.close();
  console.log(failed ? "\nSMOKE TEST FAILED" : "\nSMOKE TEST PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
