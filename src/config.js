/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * PHASE 0: FROZEN SHARED CONFIGURATION
 * All values are immutable and frozen.
 */

window.KAKKANAD_CONFIG = Object.freeze({
  GEO_CENTER: Object.freeze({ lat: 10.0150, lon: 76.3500 }), // Collectorate / Kakkanad Jct
  METRIC_SCALE: Object.freeze({ latToMeters: 111000, lonToMeters: 109300 }),

  MAP_BOUNDS: Object.freeze({
    minX: -1200, maxX: 1200, // 2.4 km east-west span
    minZ: -1200, maxZ: 1200  // 2.4 km north-south span
  }),

  KEY_LANDMARKS: Object.freeze([
    Object.freeze({ id: "collectorate", name: "CIVIL STATION / COLLECTORATE", x: -220, z: 240, color: 0xff0055, type: "admin" }),
    Object.freeze({ id: "bus_stand",   name: "KAKKANAD PRIVATE BUS STAND",   x: -70,  z: 160, color: 0xffb703, type: "transport" }),
    Object.freeze({ id: "infopark",     name: "INFOPARK PHASE 1 (ATHULYA)",   x: 520,  z: -340, color: 0x00f0ff, type: "tech" }),
    Object.freeze({ id: "smartcity",    name: "SMARTCITY KOCHI",              x: 880,  z: -520, color: 0x39ff14, type: "tech" }),
    Object.freeze({ id: "edachira",     name: "EDACHIRA JUNCTION & THATTUKADA",x: 360, z: 120, color: 0xf58231, type: "food" }),
    Object.freeze({ id: "csez",         name: "CSEZ SPECIAL ECONOMIC ZONE",   x: -480, z: -160, color: 0x9d4edd, type: "industry" }),
    Object.freeze({ id: "watermetro",   name: "KAKKANAD WATER METRO JETTY",   x: 980,  z: 220,  color: 0x0077b6, type: "water" })
  ]),

  // Road network graph derived from real OpenStreetMap Kakkanad coordinates
  ROAD_NETWORK: Object.freeze([
    // 1. Seaport-Airport Road (SPAP Road) - Main 4-lane spine running North-South
    Object.freeze({
      id: "spap_road",
      name: "Seaport-Airport Road",
      width: 20.0,
      lanes: 4,
      isDualCarriageway: true,
      points: Object.freeze([
        Object.freeze({ x: -480, z: -1100 }),
        Object.freeze({ x: -350, z: -600 }),
        Object.freeze({ x: -200, z: -100 }),
        Object.freeze({ x: -70,  z: 160 }),  // Kakkanad Junction
        Object.freeze({ x: 50,   z: 550 }),
        Object.freeze({ x: 180,  z: 1100 })
      ])
    }),

    // 2. InfoPark Express Way - High-speed divided road connecting to Infopark & SmartCity
    Object.freeze({
      id: "infopark_exp",
      name: "InfoPark Express Way",
      width: 18.0,
      lanes: 4,
      isDualCarriageway: true,
      points: Object.freeze([
        Object.freeze({ x: -70,  z: 160 }),  // Junction from SPAP Road
        Object.freeze({ x: 150,  z: 40 }),
        Object.freeze({ x: 360,  z: 120 }),  // Edachira Jct
        Object.freeze({ x: 520,  z: -340 }), // Infopark Phase 1 Athulya
        Object.freeze({ x: 880,  z: -520 })  // SmartCity
      ])
    }),

    // 3. Collectorate / Civil Station Road
    Object.freeze({
      id: "collectorate_rd",
      name: "Collectorate Road",
      width: 14.0,
      lanes: 2,
      isDualCarriageway: false,
      points: Object.freeze([
        Object.freeze({ x: -70,  z: 160 }),
        Object.freeze({ x: -220, z: 240 }),  // Collectorate Complex
        Object.freeze({ x: -450, z: 320 }),
        Object.freeze({ x: -750, z: 420 })
      ])
    }),

    // 4. Edachira - Infopark Back Road
    Object.freeze({
      id: "edachira_rd",
      name: "Infopark-Edachira Road",
      width: 12.0,
      lanes: 2,
      isDualCarriageway: false,
      points: Object.freeze([
        Object.freeze({ x: 360,  z: 120 }),
        Object.freeze({ x: 420,  z: -80 }),
        Object.freeze({ x: 520,  z: -340 })
      ])
    }),

    // 5. Kadamprayar River Link / Water Metro Road
    Object.freeze({
      id: "watermetro_rd",
      name: "Water Metro Riverside Road",
      width: 12.0,
      lanes: 2,
      isDualCarriageway: false,
      points: Object.freeze([
        Object.freeze({ x: 360,  z: 120 }),
        Object.freeze({ x: 620,  z: 180 }),
        Object.freeze({ x: 980,  z: 220 })  // Water Metro Jetty
      ])
    }),

    // 6. CSEZ Industrial Perimeter Road
    Object.freeze({
      id: "csez_rd",
      name: "CSEZ Perimeter Road",
      width: 12.0,
      lanes: 2,
      isDualCarriageway: false,
      points: Object.freeze([
        Object.freeze({ x: -200, z: -100 }),
        Object.freeze({ x: -480, z: -160 }),
        Object.freeze({ x: -700, z: -250 })
      ])
    })
  ]),

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

  // Story Missions
  MISSIONS: Object.freeze([
    Object.freeze({
      id: "mission_1",
      title: "THE 9:00 AM INFOPARK PUNCH-IN",
      client: "Techie Rahul",
      briefing: "Urgent deployment code must reach Athulya Tower before punch-in! Take an Auto from Kakkanad Bus Stand, dodge Seaport-Airport Road traffic, and deliver it under 90 seconds!",
      startPos: Object.freeze({ x: -70, z: 160 }), // Kakkanad Bus Stand
      targetPos: Object.freeze({ x: 520, z: -340 }), // Infopark Athulya
      timeLimit: 90,
      rewardCash: 1500,
      targetRadius: 25.0
    }),
    Object.freeze({
      id: "mission_2",
      title: "AUTO RICKSHAW DRIFT HUSTLE",
      client: "Saji Chettan (Auto Driver Union)",
      briefing: "IT crowd is stranded at Carnival Food Court with monsoon pouring! Pick up 3 techies and rush them to Edachira Junction without totaling the Auto!",
      startPos: Object.freeze({ x: 520, z: -340 }),
      targetPos: Object.freeze({ x: 360, z: 120 }), // Edachira
      timeLimit: 75,
      rewardCash: 2200,
      targetRadius: 20.0
    }),
    Object.freeze({
      id: "mission_3",
      title: "THE COLLECTORATE HEIST",
      client: "Anonymous Whistleblower",
      briefing: "Classified land files located in Civil Station. Grab the briefcase, evade a guaranteed 3-Star Kerala Police pursuit, and cross Kadamprayar bridge to SmartCity!",
      startPos: Object.freeze({ x: -220, z: 240 }), // Civil Station
      targetPos: Object.freeze({ x: 880, z: -520 }), // SmartCity
      timeLimit: 120,
      rewardCash: 5000,
      targetRadius: 25.0
    })
  ]),

  // Radio Stations
  RADIO: Object.freeze([
    Object.freeze({ id: "vice_wave", name: "KAKKANAD WAVE 80s", genre: "Vice City Synthwave" }),
    Object.freeze({ id: "kochi_beats", name: "RADIO KOCHI BEATS", genre: "Mallu Funk / Chenda Synth" }),
    Object.freeze({ id: "infopark_chill", name: "INFOPARK LO-FI LOUNGE", genre: "Chillhop IT Beats" })
  ])
});
