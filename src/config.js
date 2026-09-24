/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * PHASE 0: FROZEN SHARED CONFIGURATION
 * All values are immutable and frozen. The map (roads, landmarks, bounds) is derived
 * from src/data/kakkanad-geo.js: real Kakkanad names on real coordinates.
 */

(function () {
const GEO = window.KAKKANAD_GEO;
const freezeAll = (list) => Object.freeze(list.map((o) => Object.freeze(o)));
const lm = (id) => GEO.landmarks.find((l) => l.id === id);
const at = (x, z) => Object.freeze({ x, z });

let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
GEO.roads.concat(GEO.rivers).forEach((r) => r.points.forEach((p) => {
  minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
  minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
}));

window.KAKKANAD_CONFIG = Object.freeze({
  GEO_CENTER: Object.freeze({ lat: GEO.ORIGIN[0], lon: GEO.ORIGIN[1] }), // Kakkanad Junction (Civil Station)
  WORLD_SCALE: GEO.SCALE, // distances compressed to 60%; widths and heights are real
  NORTH: Object.freeze({ x: 0, z: -1 }), // +X east, -Z north (true map orientation)

  MAP_BOUNDS: Object.freeze({
    minX: Math.floor(minX - 350), maxX: Math.ceil(maxX + 350),
    minZ: Math.floor(minZ - 350), maxZ: Math.ceil(maxZ + 350)
  }),

  KEY_LANDMARKS: freezeAll(GEO.landmarks.map((l) => ({ id: l.id, name: l.name.toUpperCase(), short: l.short, x: l.x, z: l.z, color: l.radar, type: l.kind }))),

  // Road network: real Kakkanad road names (see src/data/kakkanad-geo.js)
  ROAD_NETWORK: freezeAll(GEO.roads.map((r) => ({
    id: r.id, name: r.name, cls: r.cls, zone: r.zone,
    width: r.width, lanes: r.lanes, isDualCarriageway: r.dual, dual: r.dual,
    points: Object.freeze(r.points.map((p) => at(p.x, p.z)))
  }))),

  LOCALITIES: freezeAll(GEO.localities.map((l) => ({ name: l.name, x: l.x, z: l.z }))),

  // Where the player starts: the bus-stand side of Kakkanad-Pallikkara Road.
  SPAWN: Object.freeze({ road: "kp_road", s: 58, side: 1 }),

  // Vehicle Archetypes & Handling Dynamics
  VEHICLE_ARCHETYPES: Object.freeze({
    AUTO_RICKSHAW: Object.freeze({
      type: "AUTO_RICKSHAW",
      name: "Kakkanad Auto Rickshaw",
      maxSpeed: 21.0,        // ~75 km/h
      accel: 15.0,
      brake: 25.0,
      handling: 22.0,        // Very agile, sharp turning
      driftFactor: 0.85,
      mass: 450,
      length: 2.8,
      width: 1.4,
      height: 1.8,
      hornSound: "auto"
    }),
    KERALA_BUS: Object.freeze({
      type: "KERALA_BUS",
      name: "Minnal Private Bus",
      maxSpeed: 25.0,        // ~90 km/h
      accel: 11.0,
      brake: 22.0,
      handling: 9.0,         // Heavy, wide turning
      driftFactor: 0.35,
      mass: 7500,
      length: 11.2,
      width: 2.8,
      height: 3.4,
      hornSound: "bus"
    }),
    POLICE_JEEP: Object.freeze({
      type: "POLICE_JEEP",
      name: "Kerala Police Mahindra",
      maxSpeed: 30.0,        // ~108 km/h
      accel: 19.0,
      brake: 32.0,
      handling: 16.0,
      driftFactor: 0.65,
      mass: 1450,
      length: 4.2,
      width: 1.8,
      height: 1.9,
      hornSound: "siren"
    }),
    AMBASSADOR: Object.freeze({
      type: "AMBASSADOR",
      name: "Ambassador Classic",
      maxSpeed: 23.0,        // ~82 km/h
      accel: 13.0,
      brake: 24.0,
      handling: 12.0,
      driftFactor: 0.50,
      mass: 1250,
      length: 4.4,
      width: 1.7,
      height: 1.6,
      hornSound: "car"
    }),
    SUPERBIKE: Object.freeze({
      type: "SUPERBIKE",
      name: "Bullet 350 Thumper",
      maxSpeed: 33.0,        // ~120 km/h
      accel: 24.0,
      brake: 35.0,
      handling: 24.0,
      driftFactor: 0.70,
      mass: 195,
      length: 2.1,
      width: 0.8,
      height: 1.2,
      hornSound: "bike"
    }),
    SPORTS_CAR: Object.freeze({
      type: "SPORTS_CAR",
      name: "Vice City Infernus",
      maxSpeed: 42.0,        // ~150 km/h
      accel: 26.0,
      brake: 38.0,
      handling: 19.0,
      driftFactor: 0.80,
      mass: 1150,
      length: 4.5,
      width: 2.0,
      height: 1.2,
      hornSound: "car"
    })
  }),

  // Wanted System Constants
  WANTED: Object.freeze({
    MAX_STARS: 5,
    DECAY_TIME_SECONDS: 15.0, // Seconds in hiding to lose 1 star
    CRIME_HEAT: Object.freeze({
      VEHICLE_JACK: 25,
      HIT_AND_RUN: 35,
      RAM_POLICE: 70,
      SPEEDING: 10
    })
  }),

  // Story Missions (real destinations; time limits fit the 60% scale map)
  MISSIONS: freezeAll([
    {
      id: "mission_1",
      title: "THE 9:00 AM INFOPARK PUNCH-IN",
      client: "Techie Rahul",
      briefing: "Deployment code must reach Athulya, Infopark before punch-in! Grab an auto at Kakkanad Bus Stand, take Kakkanad-Pallikkara Road to Athani and turn down Infopark Road.",
      startPos: at(lm("bus_stand").x, lm("bus_stand").z),
      targetPos: at(lm("infopark").x + 92, lm("infopark").z - 6),
      timeLimit: 150,
      rewardCash: 1500,
      targetRadius: 25.0
    },
    {
      id: "mission_2",
      title: "LAST BOAT FROM KAKKANAD",
      client: "Saji Chettan (Auto Driver Union)",
      briefing: "Monsoon pour at Infopark and the techies will miss the last Water Metro to Vyttila! Rush them down Infopark Expressway, through Chittethukara to the Kakkanad Water Metro.",
      startPos: at(lm("infopark").x + 92, lm("infopark").z - 6),
      targetPos: at(lm("water_metro").x, lm("water_metro").z - 42),
      timeLimit: 120,
      rewardCash: 2200,
      targetRadius: 22.0
    },
    {
      id: "mission_3",
      title: "THE COLLECTORATE HEIST",
      client: "Anonymous Whistleblower",
      briefing: "Classified land files are in the Civil Station. Grab the briefcase, survive a guaranteed 3-star Kerala Police pursuit and lose them at SmartCity Kochi!",
      startPos: at(lm("civil_station").x, lm("civil_station").z),
      targetPos: at(lm("smartcity").x + 40, lm("smartcity").z + 70),
      timeLimit: 190,
      rewardCash: 5000,
      targetRadius: 25.0
    },
    {
      id: "mission_4",
      title: "ONAM AT THRIKKAKARA",
      client: "Ammini Amma",
      briefing: "Thrikkakara Appan's Onam festival starts at dusk and the pookkalam flowers are stuck at Kakkanad Junction! Race up Seaport-Airport Road past Bharata Mata College to the temple.",
      startPos: at(22, -58),
      targetPos: at(lm("temple").x + 62, lm("temple").z + 10),
      timeLimit: 110,
      rewardCash: 1800,
      targetRadius: 22.0
    }
  ]),

  // Radio Stations
  RADIO: Object.freeze([
    Object.freeze({ id: "vice_wave", name: "KAKKANAD WAVE 80s", genre: "Vice City Synthwave" }),
    Object.freeze({ id: "kochi_beats", name: "RADIO KOCHI BEATS", genre: "Mallu Funk / Chenda Synth" }),
    Object.freeze({ id: "infopark_chill", name: "INFOPARK LO-FI LOUNGE", genre: "Chillhop IT Beats" })
  ])
});
})();
