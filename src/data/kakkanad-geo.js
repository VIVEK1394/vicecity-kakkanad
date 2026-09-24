/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * KAKKANAD GEOGRAPHY: real place and road names, laid out on real coordinates.
 *
 * How this was made (no map data is copied from any map provider):
 * - Anchor points: about 40 latitude/longitude pairs for named places along Kakkanad's
 *   main roads, taken from public place listings (businesses, bus stops, colleges,
 *   hospitals) and from the Wikipedia/Wikidata coordinates of Civil Station, InfoPark
 *   and Thrikkakara Temple. Each anchor is marked "real" below.
 * - Road order and connections: the Kochi Metro Pink Line station sequence (Vazhakkala,
 *   Padamughal, Kakkanad Junction, Cochin SEZ, Chittethukara, KINFRA, Infopark) and
 *   public descriptions of Seaport-Airport Road, Civil Line Road, Infopark Expressway
 *   and Kakkanad-Pallikkara Road.
 * - Everything between the anchors (bends, minor roads, river courses, building
 *   footprints) is invented to look plausible. Such points are marked "~".
 *
 * Coordinates are [lat, lon] in degrees (WGS84). The game projects them onto a flat
 * world in metres: +X east, -Z north, compressed by SCALE so the city plays like a
 * GTA map (every bearing and relative position stays true). Road widths and building
 * sizes stay real.
 */

(function () {
  // --- Shared nodes: every junction is one named point used by all of its roads -----
  const N = {
    KAKKANAD_JN: [10.017, 76.3438], // real: Civil Station junction (10.0172, 76.3438)
    SA_MAVELI: [10.02, 76.3418], // ~
    SA_NGO: [10.0212, 76.3408], // ~ (NGO Quarters-Mavelipuram Road meets SA Road)
    BMC_JN: [10.0302, 76.3356], // real: Bharata Mata College, Seaport-Airport Road
    SA_CSEZ: [10.0065, 76.3446], // real: ESI Dispensary, Cochin SEZ, SA Road
    CHITTETHUKARA_JN: [9.9988, 76.3506], // real area: Chittethukara, SA Road
    PADAMUGAL_JN: [10.0141, 76.3336], // real: opposite Padamugal Juma Masjid
    NGO_JN: [10.0156, 76.3364], // real: NGO Quarters (Civil Line Road side)
    VAZHAKKALA_JN: [10.0123, 76.325], // real: Civil Line Road, Vazhakkala
    VAZHAKKALA_MLA: [10.0127, 76.3272], // real: Civil Line Road, Vazhakkala
    THENGODE_JN: [10.0182, 76.351], // ~
    KUSUMAGIRI_JN: [10.0177, 76.3583], // real: Kusumagiri Hospital, Athani
    ATHANI_JN: [10.0157, 76.3644], // real: Athani, Kakkanad
    EDACHIRA_JN: [10.0171, 76.3694], // real: Edachira auto stand, Thengod
    RAJAGIRI_JN: [9.9992, 76.3572], // ~
    INFOPARK_GATE: [10.004, 76.361], // ~ (Infopark Police Station: 10.0071, 76.3616 real)
    IP_LOOP_W: [10.0042, 76.363], // ~
    IP_LOOP_E: [10.0042, 76.36466], // real: Infopark, Kakkanad
    SMARTCITY_JN: [10.004, 76.3735], // ~ (Infopark 2nd gate, SmartCity: 10.0035, 76.3704 real)
    NILAM_JN: [10.0046, 76.3558], // real: Nilampathinjamugal
    THENGODE: [10.0238, 76.3515], // ~
    NGO_QTRS: [10.0213, 76.335], // real: Kakkanad NGO Quarters Road
    TEMPLE_JN: [10.0345, 76.3305], // ~ (temple: 10.0355, 76.3295 real)
    PIPELINE_JN: [10.0327, 76.3259], // real: KMM College, Pipeline Junction
    PIPELINE_S: [10.03, 76.3262], // ~
    MEC_JN: [10.0284, 76.3288], // ~ (Model Engineering College, Karimakkad)
    PALACHUVADU_JN: [10.0003, 76.334], // real: Palachuvadu junction
    WATER_METRO_JN: [9.9983, 76.3445], // ~
  };

  // Road classes set the look (lanes, markings, lamps, median) and traffic priority.
  // zone: default building style along the road (landmark zones below override it).
  const R = (id, name, cls, width, lanes, dual, zone, pts) => ({ id, name, cls, width, lanes, dual, zone, pts });

  const ROADS = [
    R("sa_road", "Seaport-Airport Road", "primary", 22, 4, true, "commercial", [
      [9.9915, 76.3538], // ~ towards Irumpanam
      [9.9955, 76.3522], // ~
      [9.99795, 76.35087], // real: Chittethukara bus stop
      N.CHITTETHUKARA_JN,
      [10.0006, 76.3496], // real: Chittethukara shops
      [10.003, 76.3485], // real: Chittethukara, near ICICI Bank
      N.SA_CSEZ,
      [10.0094, 76.3432], // real: SA Road, Kakkanad
      [10.0132, 76.3434], // ~
      N.KAKKANAD_JN,
      N.SA_MAVELI,
      N.SA_NGO,
      [10.0252, 76.3381], // real: Sunrise Hospital
      [10.028, 76.3366], // ~
      N.BMC_JN,
      [10.034, 76.3362], // ~
      [10.0401, 76.3386], // real: SA Road, Thrikkakara towards Kalamassery
    ]),
    R("civil_line", "Civil Line Road", "primary", 18, 4, true, "commercial", [
      [10.0098, 76.3165], // ~ towards Palarivattom
      [10.0111, 76.3213], // real: Chembumukku bus stop
      [10.0117, 76.3232], // ~
      N.VAZHAKKALA_JN,
      N.VAZHAKKALA_MLA,
      [10.0134, 76.3308], // real: Vazhakkala bus stop
      N.PADAMUGAL_JN,
      [10.0148, 76.3346], // real: Kunnumpuram
      N.NGO_JN,
      [10.0163, 76.3378], // real: Civil Station Juma Masjid
      [10.0162, 76.3398], // real: Kunnumpuram-Civil Station Road
      [10.0168, 76.342], // real
      N.KAKKANAD_JN,
    ]),
    R("kp_road", "Kakkanad-Pallikkara Road", "secondary", 13, 2, false, "commercial", [
      N.KAKKANAD_JN,
      [10.0179, 76.3452], // real: Kakkanad bus stand
      [10.018, 76.3467], // real: Palarivattom-Kakkanad Road, Kakkanad
      N.THENGODE_JN,
      [10.018, 76.355], // ~
      N.KUSUMAGIRI_JN,
      [10.0168, 76.3615], // ~
      N.ATHANI_JN,
      [10.0162, 76.367], // real: Kakkanad-Edachira Vayanasala Road
      N.EDACHIRA_JN,
      [10.0176, 76.373], // ~
      [10.0178, 76.3765], // ~ Kadambrayar bridge
      [10.0182, 76.38], // ~ towards Pallikkara
    ]),
    R("infopark_exp", "Infopark Expressway", "primary", 20, 4, true, "it", [
      N.CHITTETHUKARA_JN,
      [9.9989, 76.354], // ~
      N.RAJAGIRI_JN,
      [9.99938, 76.3588], // real: Infopark Expressway, Kakkanad
      [10.001, 76.3602], // ~
      N.INFOPARK_GATE,
    ]),
    R("infopark_rd", "Infopark Road", "secondary", 12, 2, false, "it", [
      N.INFOPARK_GATE,
      [10.0071, 76.3616], // real: Infopark Police Station
      [10.01, 76.3624], // ~
      [10.013, 76.3636], // ~
      N.ATHANI_JN,
    ]),
    R("smartcity_rd", "Infopark-SmartCity Road", "secondary", 12, 2, false, "it", [
      N.INFOPARK_GATE,
      N.IP_LOOP_W,
      N.IP_LOOP_E,
      [10.0038, 76.368], // ~
      [10.00353, 76.37044], // real: Infopark 2nd gate, SmartCity
      N.SMARTCITY_JN,
    ]),
    R("infopark_loop", "Infopark Phase 1 Road", "tertiary", 10, 2, false, "it", [
      N.IP_LOOP_W,
      [10.0078, 76.3634], // ~
      [10.0082, 76.3662], // ~
      N.IP_LOOP_E,
    ]),
    R("edachira_rd", "Edachira Road", "secondary", 11, 2, false, "it", [
      N.EDACHIRA_JN,
      [10.014, 76.3705], // ~
      [10.011, 76.3715], // ~ Infopark Phase 2
      [10.0075, 76.3728], // ~
      N.SMARTCITY_JN,
    ]),
    R("nilam_rd", "Nilampathinjamugal Road", "tertiary", 9, 2, false, "residential", [
      N.KUSUMAGIRI_JN,
      [10.014, 76.3575], // ~
      [10.01, 76.3565], // ~
      N.NILAM_JN,
    ]),
    R("rajagiri_rd", "Rajagiri Valley Road", "tertiary", 10, 2, false, "residential", [
      N.NILAM_JN,
      [10.0015, 76.3563], // ~
      N.RAJAGIRI_JN,
      [9.9948, 76.3595], // real: Kakkanad Rajagiri Valley Road
      [9.9925, 76.361], // ~ Rajagiri campus
    ]),
    R("csez_rd", "CSEZ Road", "tertiary", 11, 2, false, "industrial", [
      N.SA_CSEZ,
      [10.0068, 76.348], // ~
      [10.006, 76.352], // ~
      N.NILAM_JN,
    ]),
    R("ngo_rd", "NGO Quarters Road", "tertiary", 9, 2, false, "residential", [
      N.NGO_JN,
      [10.0185, 76.3358], // ~
      N.NGO_QTRS,
      [10.0222, 76.3372], // ~
      [10.0225, 76.3392], // real: Kakkanad-NGO Quarters Road, Mavelipuram
      N.SA_NGO,
    ]),
    R("maveli_rd", "Mavelipuram Road", "tertiary", 8, 2, false, "residential", [
      N.SA_MAVELI,
      [10.0212, 76.3432], // real: NGO Quarters-Mavelipuram Road
      [10.0226, 76.345], // ~ Mavelipuram colony
      [10.0234, 76.348], // ~
      N.THENGODE,
    ]),
    R("thengode_rd", "Thengode Road", "tertiary", 9, 2, false, "residential", [
      N.THENGODE_JN,
      [10.021, 76.3513], // ~
      N.THENGODE,
      [10.027, 76.353], // ~
      [10.031, 76.3548], // ~
    ]),
    R("thengode_edachira", "Thengode-Edachira Road", "tertiary", 9, 2, false, "residential", [
      N.THENGODE,
      [10.0228, 76.358], // ~
      [10.021, 76.364], // ~
      [10.019, 76.368], // ~
      N.EDACHIRA_JN,
    ]),
    R("temple_rd", "Thrikkakara Temple Road", "tertiary", 9, 2, false, "residential", [
      N.BMC_JN,
      [10.0318, 76.333], // ~
      N.TEMPLE_JN,
      [10.036, 76.3278], // ~
    ]),
    R("pipeline_rd", "Pipeline Road", "tertiary", 9, 2, false, "residential", [
      N.TEMPLE_JN,
      N.PIPELINE_JN,
      N.PIPELINE_S,
      N.MEC_JN,
    ]),
    R("mec_rd", "Model Engineering College Road", "tertiary", 8, 2, false, "residential", [
      N.MEC_JN,
      [10.0252, 76.332], // ~
      N.NGO_QTRS,
    ]),
    R("vazhakkala_rd", "Vazhakkala-Thrikkakara Road", "tertiary", 9, 2, false, "residential", [
      N.VAZHAKKALA_JN,
      [10.0165, 76.3252], // ~
      [10.0205, 76.3262], // ~
      [10.025, 76.3268], // ~
      N.PIPELINE_S,
    ]),
    R("padamugal_rd", "Padamugal-Palachuvadu Road", "secondary", 10, 2, false, "residential", [
      N.PADAMUGAL_JN,
      [10.011, 76.3338], // ~
      [10.0067, 76.3339], // real: Satellite Township bus stop
      [10.003, 76.3339], // ~
      N.PALACHUVADU_JN,
    ]),
    R("mla_rd", "Kakkanad MLA Road", "tertiary", 9, 2, false, "residential", [
      N.PALACHUVADU_JN,
      [10.002, 76.3305], // ~
      [10.0055, 76.3285], // ~
      [10.0095, 76.3275], // ~
      N.VAZHAKKALA_MLA,
    ]),
    R("thuthiyoor_rd", "Thuthiyoor Road", "secondary", 10, 2, false, "residential", [
      N.PALACHUVADU_JN,
      [10.0005, 76.3354], // real: Thuthiyoor Road, Palachuvadu
      [10.0, 76.3385], // ~
      [9.999, 76.3415], // ~ Thuthiyoor
      N.WATER_METRO_JN,
      [9.9986, 76.3475], // ~
      N.CHITTETHUKARA_JN,
    ]),
    R("watermetro_rd", "Water Metro Road", "tertiary", 8, 2, false, "green", [
      N.WATER_METRO_JN,
      [9.9974, 76.3447], // ~ Kakkanad Water Metro terminal
    ]),
  ];

  // Localities: the HUD shows the nearest one.
  const LOCALITIES = [
    ["Kakkanad Junction", 10.017, 76.3438],
    ["Civil Station", 10.016, 76.3428],
    ["Kunnumpuram", 10.0152, 76.3352],
    ["Padamugal", 10.0136, 76.3326],
    ["Vazhakkala", 10.0126, 76.3262],
    ["Chembumukku", 10.011, 76.3205],
    ["NGO Quarters", 10.0205, 76.3356],
    ["Mavelipuram", 10.0224, 76.3448],
    ["Thrikkakara", 10.0335, 76.3305],
    ["Karimakkad", 10.0275, 76.3285],
    ["Thengode", 10.0236, 76.3518],
    ["Kusumagiri", 10.018, 76.3585],
    ["Athani", 10.0156, 76.3644],
    ["Edachira", 10.0172, 76.3698],
    ["Infopark", 10.0062, 76.3628],
    ["SmartCity", 10.0045, 76.3728],
    ["KINFRA", 10.0012, 76.3628],
    ["Rajagiri Valley", 9.9943, 76.3602],
    ["Nilampathinjamugal", 10.0046, 76.3556],
    ["Cochin SEZ", 10.0068, 76.3485],
    ["Chittethukara", 9.9996, 76.35],
    ["Thuthiyoor", 9.999, 76.3415],
    ["Palachuvadu", 10.0003, 76.3338],
    ["Satellite Township", 10.0067, 76.3339],
    ["Kadambrayar", 10.01, 76.3776],
  ];

  // Landmarks: real names; positions real where known, footprints and looks invented.
  // kind picks the builder in map.js. heading: degrees clockwise from north.
  const LANDMARKS = [
    { id: "civil_station", name: "Civil Station (Ernakulam Collectorate)", short: "CIVIL STATION", kind: "collectorate", at: [10.016, 76.3429], heading: 0, radar: 0xff4f8b },
    { id: "bus_stand", name: "Kakkanad Private Bus Stand", short: "BUS STAND", kind: "bus_stand", at: [10.01845, 76.3454], heading: 90, radar: 0xffb703 },
    { id: "police_thrikkakara", name: "Thrikkakara Police Station", short: "POLICE", kind: "police_station", at: [10.019, 76.3437], heading: 0, radar: 0x3d7bff },
    { id: "infopark", name: "Infopark Phase 1 (Athulya)", short: "INFOPARK", kind: "infopark", at: [10.0067, 76.3598], heading: 0, radar: 0x00f0ff },
    { id: "police_infopark", name: "Infopark Police Station", short: "POLICE", kind: "police_station", at: [10.0074, 76.3624], heading: 270, radar: 0x3d7bff },
    { id: "infopark2", name: "Infopark Phase 2 (Jyothirmaya)", short: "INFOPARK 2", kind: "infopark2", at: [10.0113, 76.3695], heading: 0, radar: 0x00c8ff },
    { id: "smartcity", name: "SmartCity Kochi", short: "SMARTCITY", kind: "smartcity", at: [10.0053, 76.3722], heading: 0, radar: 0x39ff14 },
    { id: "kinfra", name: "KINFRA Export Promotion Industrial Park", short: "KINFRA", kind: "kinfra", at: [10.0012, 76.3635], heading: 0, radar: 0x9d4edd },
    { id: "csez", name: "Cochin Special Economic Zone", short: "CSEZ", kind: "csez", at: [10.0072, 76.3478], heading: 0, radar: 0x9d4edd },
    { id: "water_metro", name: "Kakkanad Water Metro", short: "WATER METRO", kind: "water_metro", at: [9.9968, 76.3448], heading: 200, radar: 0x0077b6 },
    { id: "temple", name: "Thrikkakara Vamanamoorthy Temple", short: "TEMPLE", kind: "temple", at: [10.0355, 76.3295], heading: 90, radar: 0xffd166 },
    { id: "bmc", name: "Bharata Mata College", short: "BHARATA MATA", kind: "college", at: [10.0304, 76.3368], heading: 270, radar: 0xf4a261 },
    { id: "sunrise", name: "Sunrise Hospital", short: "HOSPITAL", kind: "hospital", at: [10.0249, 76.3372], heading: 90, radar: 0xff3b3b },
    { id: "kmm", name: "KMM College", short: "KMM COLLEGE", kind: "college_small", at: [10.0335, 76.3252], heading: 135, radar: 0xf4a261 },
    { id: "mec", name: "Govt. Model Engineering College", short: "MEC", kind: "college_small", at: [10.0283, 76.3278], heading: 90, radar: 0xf4a261 },
    { id: "rajagiri", name: "Rajagiri Valley Campus", short: "RAJAGIRI", kind: "campus", at: [9.9934, 76.3621], heading: 300, radar: 0xf4a261 },
    { id: "kusumagiri", name: "Kusumagiri Hospital", short: "KUSUMAGIRI", kind: "hospital_small", at: [10.0183, 76.3584], heading: 180, radar: 0xff3b3b },
    { id: "padamugal_masjid", name: "Padamugal Juma Masjid", short: "MASJID", kind: "mosque", at: [10.01445, 76.3331], heading: 180, radar: 0x2ec27e },
    { id: "civil_station_masjid", name: "Civil Station Juma Masjid", short: "MASJID", kind: "mosque", at: [10.0167, 76.3372], heading: 180, radar: 0x2ec27e },
    { id: "edachira_thattukada", name: "Edachira Thattukadas", short: "THATTUKADA", kind: "thattukada", at: [10.0166, 76.3688], heading: 180, radar: 0xf58231 },
  ];

  // Kochi Metro Pink Line (under construction in 2026): viaduct pillars along the median,
  // with station boxes. Stations are real (Kochi Metro Phase 2), positions approximate.
  const METRO = {
    name: "Kochi Metro Pink Line",
    route: ["civil_line", "sa_road", "infopark_exp"],
    from: [10.0117, 76.3232],
    stations: [
      ["Vazhakkala", 10.0125, 76.3262],
      ["Padamughal", 10.0144, 76.3342],
      ["Kakkanad Junction", 10.0166, 76.3408],
      ["Cochin SEZ", 10.0078, 76.3438],
      ["Chittethukara", 10.0012, 76.3494],
      ["KINFRA", 9.9993, 76.3585],
      ["Infopark", 10.0028, 76.3608],
    ],
  };

  // Rivers: courses invented to match their known neighbourhoods.
  const RIVERS = [
    {
      id: "chithrapuzha",
      name: "Chithrapuzha",
      width: 34,
      pts: [
        [9.9964, 76.3452],
        [9.9952, 76.3438],
        [9.994, 76.342],
        [9.993, 76.339],
        [9.9912, 76.336],
        [9.989, 76.333],
      ],
    },
    {
      id: "kadambrayar",
      name: "Kadambrayar",
      width: 42,
      pts: [
        [10.029, 76.3782],
        [10.022, 76.3771],
        [10.0178, 76.3766],
        [10.012, 76.3773],
        [10.006, 76.3779],
        [10.0, 76.377],
        [9.994, 76.3752],
        [9.988, 76.3728],
      ],
    },
  ];

  // Building-style zones (radius in real metres) overriding a road's default zone.
  const ZONES = [
    { zone: "it", at: [10.0062, 76.3628], r: 520 },
    { zone: "it", at: [10.0085, 76.371], r: 420 },
    { zone: "industrial", at: [10.0068, 76.349], r: 380 },
    { zone: "industrial", at: [10.0012, 76.3635], r: 220 },
    { zone: "commercial", at: [10.017, 76.3438], r: 420 },
    { zone: "commercial", at: [9.9995, 76.35], r: 330 },
    { zone: "commercial", at: [10.0141, 76.3336], r: 260 },
    { zone: "commercial", at: [10.0123, 76.3255], r: 260 },
    { zone: "commercial", at: [10.0171, 76.3694], r: 160 },
    { zone: "campus", at: [9.9934, 76.3615], r: 260 },
    { zone: "green", at: [9.996, 76.3445], r: 110 },
    { zone: "temple", at: [10.0355, 76.3295], r: 150 },
  ];

  const SCALE = 0.6;
  const ORIGIN = N.KAKKANAD_JN;
  const M_PER_DEG_LAT = 110600;
  const M_PER_DEG_LON = 111320 * Math.cos((ORIGIN[0] * Math.PI) / 180);

  // [lat, lon] -> {x, z} game metres (+X east, -Z north).
  function project(lat, lon) {
    return {
      x: Math.round((lon - ORIGIN[1]) * M_PER_DEG_LON * SCALE * 10) / 10,
      z: Math.round(-(lat - ORIGIN[0]) * M_PER_DEG_LAT * SCALE * 10) / 10,
    };
  }
  const P = (ll) => project(ll[0], ll[1]);

  window.KAKKANAD_GEO = Object.freeze({
    SCALE,
    ORIGIN,
    project,
    roads: ROADS.map((r) => Object.assign({}, r, { points: r.pts.map(P) })),
    localities: LOCALITIES.map(([name, lat, lon]) => Object.assign({ name }, project(lat, lon))),
    landmarks: LANDMARKS.map((l) => Object.assign({}, l, P(l.at))),
    rivers: RIVERS.map((r) => Object.assign({}, r, { points: r.pts.map(P) })),
    zones: ZONES.map((z) => Object.assign({}, z, P(z.at), { radius: z.r * SCALE })),
    metro: Object.assign({}, METRO, {
      start: P(METRO.from),
      stations: METRO.stations.map(([name, lat, lon]) => Object.assign({ name }, project(lat, lon))),
    }),
  });
})();
