/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * SKY, TIME OF DAY & LIGHTING
 *
 * - TimeOfDay: the game clock (08:45 start, 2 game minutes per real second) drives
 *   the sun along its real path for Kochi (10°N) and a full moon opposite it.
 * - Physically based sky dome: Preetham analytic daylight model. The scattering
 *   maths is derived from three.js r128 examples/js/objects/Sky.js (MIT, © three.js
 *   authors; Preetham model first implemented by Simon Wallner, improved by Martin
 *   Upitis, three.js integration by zz85), extended with linear HDR output, a night
 *   sky with stars and moon, and the same height fog as the scene at the horizon.
 * - Image-based ambient light: a PMREM of the live sky (sun disc removed), refreshed
 *   every few degrees of sun travel, is the scene environment for every PBR material.
 * - One shadow-casting directional light (sun by day, moon by night) whose soft
 *   shadow frustum follows the player and is snapped to shadow-map texels.
 * - Fog colour/density, exposure and night glow are all derived from the sun.
 */

const SKY_TR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const SKY_MIE = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
// Raw Preetham radiance has a ~13:1 horizon:zenith ratio at mid sun heights (real clear
// skies are ~2-5:1), so the sky is gently compressed: radiance = SKY_SCALE * raw^SKY_POW.
const SKY_SCALE = 0.36;
const SKY_POW = 0.7;
const SUN_INTENSITY = 1.65;
const GROUND_ALBEDO = [0.12, 0.115, 0.09];
const LATITUDE = (10.0 * Math.PI) / 180;
const DECLINATION = (5.0 * Math.PI) / 180;

class TimeOfDay {
  constructor(startMinutes = 8 * 60 + 45, rate = 2.0) {
    this.minutes = startMinutes;
    this.rate = rate; // game minutes per real second
  }

  update(delta) {
    this.minutes = (this.minutes + delta * this.rate) % 1440;
  }

  setTime(hours, minutes = 0) {
    this.minutes = (((hours * 60 + minutes) % 1440) + 1440) % 1440;
  }

  get hours() {
    return this.minutes / 60;
  }

  format() {
    const h = Math.floor(this.minutes / 60) % 24;
    const m = Math.floor(this.minutes % 60);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    return `${displayH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${ampm}`;
  }

  // World direction to the sun (+X east, +Y up, +Z north), local solar time = clock.
  sunDirection(target) {
    const H = ((this.hours - 12) / 24) * Math.PI * 2;
    const east = -Math.cos(DECLINATION) * Math.sin(H);
    const up = Math.sin(LATITUDE) * Math.sin(DECLINATION) + Math.cos(LATITUDE) * Math.cos(DECLINATION) * Math.cos(H);
    const north = Math.cos(LATITUDE) * Math.sin(DECLINATION) - Math.sin(LATITUDE) * Math.cos(DECLINATION) * Math.cos(H);
    return target.set(east, up, north).normalize();
  }
}

// CPU port of the Preetham sky (same maths as the shader) for fog and sun colours.
const SkyModel = {
  params: { turbidity: 3.0, rayleigh: 1.0, mieCoefficient: 0.006, mieDirectionalG: 0.82 },

  radiance(dir, sun, out) {
    const p = this.params;
    const zc = Math.min(1, Math.max(-1, sun.y));
    const sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(zc)) / 1.5)));
    const rc = p.rayleigh - (1 - Math.min(1, Math.exp(sun.y)));
    const mieC = 0.434 * 0.2 * p.turbidity * 10e-18 * p.mieCoefficient;
    const za = Math.acos(Math.max(0, dir.y));
    const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(93.885 - (za * 180) / Math.PI, -1.253));
    const ct = dir.x * sun.x + dir.y * sun.y + dir.z * sun.z;
    const rPhase = 0.05968310365946075 * (1 + Math.pow(ct * 0.5 + 0.5, 2));
    const g = p.mieDirectionalG;
    const mPhase = 0.07957747154594767 * ((1 - g * g) / Math.pow(1 - 2 * g * ct + g * g, 1.5));
    const fade = Math.min(1, Math.max(0, Math.pow(1 - sun.y, 5)));
    const rgb = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const bR = SKY_TR[i] * rc;
      const bM = SKY_MIE[i] * mieC;
      const fex = Math.exp(-(bR * 8.4e3 * inv + bM * 1.25e3 * inv));
      const ratio = (bR * rPhase + bM * mPhase) / (bR + bM);
      let lin = Math.pow(sunE * ratio * (1 - fex), 1.5);
      lin *= 1 + (Math.pow(sunE * ratio * fex, 0.5) - 1) * fade;
      rgb[i] = SKY_SCALE * Math.pow((lin + 0.1 * fex) * 0.04 + [0, 0.0003, 0.00075][i], SKY_POW);
    }
    return out.setRGB(rgb[0], rgb[1], rgb[2]);
  },

  // Direct sunlight transmittance (colour of the sun after the atmosphere).
  transmittance(sun, out) {
    const p = this.params;
    const za = Math.acos(Math.max(0, sun.y));
    const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(93.885 - (za * 180) / Math.PI, -1.253));
    const rc = p.rayleigh - (1 - Math.min(1, Math.exp(sun.y)));
    const mieC = 0.434 * 0.2 * p.turbidity * 10e-18 * p.mieCoefficient;
    const t = [0, 1, 2].map((i) => Math.exp(-(SKY_TR[i] * rc * 8.4e3 * inv + SKY_MIE[i] * mieC * 1.25e3 * inv)));
    return out.setRGB(t[0], t[1], t[2]);
  },
};

const SkyShader = {
  uniforms: {
    sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    moonDirection: { value: new THREE.Vector3(0, -1, 0) },
    turbidity: { value: SkyModel.params.turbidity },
    rayleigh: { value: SkyModel.params.rayleigh },
    mieCoefficient: { value: SkyModel.params.mieCoefficient },
    mieDirectionalG: { value: SkyModel.params.mieDirectionalG },
    uSkyScale: { value: SKY_SCALE },
    uSkyPow: { value: SKY_POW },
    uGround: { value: new THREE.Color() },
    uTwilight: { value: 0.0 },
    uSunDisc: { value: 1.0 },
    uNight: { value: 0.0 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.0015 },
    uFogFalloff: { value: 0.012 },
    uCamHeight: { value: 2.0 },
    uTime: { value: 0.0 },
  },

  vertexShader: /* glsl */ `
    uniform vec3 sunDirection;
    uniform float rayleigh;
    uniform float turbidity;
    uniform float mieCoefficient;

    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    varying vec3 vBetaR;
    varying vec3 vBetaM;
    varying float vSunE;

    const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
    const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
    const float cutoffAngle = 1.6110731556870734;
    const float steepness = 1.5;
    const float EE = 1000.0;

    void main() {
      vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      gl_Position.z = gl_Position.w; // at the far plane: drawn only where nothing else is

      vSunDirection = normalize( sunDirection );
      float zc = clamp( vSunDirection.y, -1.0, 1.0 );
      vSunE = EE * max( 0.0, 1.0 - exp( -( ( cutoffAngle - acos( zc ) ) / steepness ) ) );
      float sunfade = min( 1.0, exp( vSunDirection.y ) );
      vBetaR = totalRayleigh * ( rayleigh - ( 1.0 - sunfade ) );
      vBetaM = 0.434 * ( 0.2 * turbidity ) * 10E-18 * MieConst * mieCoefficient;
    }
  `,

  fragmentShader: /* glsl */ `
    uniform float mieDirectionalG;
    uniform vec3 moonDirection;
    uniform float uSkyScale;
    uniform float uSkyPow;
    uniform vec3 uGround;
    uniform float uTwilight;
    uniform float uSunDisc;
    uniform float uNight;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform float uFogFalloff;
    uniform float uCamHeight;
    uniform float uTime;
    uniform float uDesaturate;

    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    varying vec3 vBetaR;
    varying vec3 vBetaM;
    varying float vSunE;

    const float pi = 3.141592653589793;
    const float rayleighZenithLength = 8.4E3;
    const float mieZenithLength = 1.25E3;
    const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;
    const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
    const float ONE_OVER_FOURPI = 0.07957747154594767;

    float hash13( vec3 p ) {
      p = fract( p * 0.1031 );
      p += dot( p, p.zyx + 31.32 );
      return fract( ( p.x + p.y ) * p.z );
    }

    void main() {
      vec3 direction = normalize( vWorldPosition - cameraPosition );
      vec3 up = vec3( 0.0, 1.0, 0.0 );

      // --- Preetham daylight (from three.js r128 Sky.js) ---
      float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
      float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
      float sR = rayleighZenithLength * inverse;
      float sM = mieZenithLength * inverse;
      vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );
      float cosTheta = dot( direction, vSunDirection );
      float rPhase = THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta * 0.5 + 0.5, 2.0 ) );
      vec3 betaRTheta = vBetaR * rPhase;
      float g2 = mieDirectionalG * mieDirectionalG;
      float mPhase = ONE_OVER_FOURPI * ( ( 1.0 - g2 ) / pow( 1.0 - 2.0 * mieDirectionalG * cosTheta + g2, 1.5 ) );
      vec3 betaMTheta = vBetaM * mPhase;
      vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
      Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );
      vec3 L0 = vec3( 0.1 ) * Fex;
      float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
      L0 += ( vSunE * 19000.0 * Fex ) * sundisk * uSunDisc;
      vec3 sky = uSkyScale * pow( ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 ), vec3( uSkyPow ) );

      // --- twilight glow over the horizon on the sun's side, just after sunset/before sunrise ---
      float h = max( direction.y, 0.0 );
      vec2 sunXZ = normalize( vSunDirection.xz + vec2( 1e-5 ) );
      vec2 dirXZ = normalize( direction.xz + vec2( 1e-5 ) );
      float tw = uTwilight * pow( max( dot( sunXZ, dirXZ ), 0.0 ), 2.0 ) * pow( 1.0 - h, 5.0 );
      sky += vec3( 0.30, 0.12, 0.05 ) * tw * 0.4;

      // --- night sky: airglow + warm city glow on the horizon, stars, full moon ---
      vec3 night = mix( vec3( 0.030, 0.042, 0.080 ), vec3( 0.007, 0.011, 0.026 ), pow( h, 0.45 ) );
      night += vec3( 0.060, 0.034, 0.018 ) * pow( 1.0 - h, 10.0 );
      vec3 cell = floor( direction * 420.0 );
      float star = hash13( cell );
      float twinkle = 0.7 + 0.3 * sin( uTime * 3.0 + star * 60.0 );
      night += vec3( 0.9, 0.95, 1.0 ) * smoothstep( 0.9982, 1.0, star ) * smoothstep( 0.05, 0.3, h ) * twinkle * 0.5;
      float moonCos = dot( direction, normalize( moonDirection ) );
      night += vec3( 0.95, 0.97, 1.0 ) * ( smoothstep( 0.99994, 0.99996, moonCos ) * 2.2 * uSunDisc + pow( max( moonCos, 0.0 ), 600.0 ) * 0.06 );
      sky += night * uNight;

      // --- below the horizon: light bounced off the ground (matters for the environment map) ---
      float below = smoothstep( 0.0, -0.2, direction.y );
      sky = mix( sky, uGround, below );

      // --- height fog at the horizon, matching the scene fog at the far plane ---
      float rd = direction.y * uFogFalloff * 2800.0;
      float fogAmount = uFogDensity * exp( - uFogFalloff * uCamHeight ) * 2800.0 * ( abs( rd ) > 1e-4 ? ( 1.0 - exp( - rd ) ) / rd : 1.0 );
      float fogF = ( 1.0 - exp( - clamp( fogAmount, 0.0, 60.0 ) ) ) * smoothstep( 0.35, 0.0, direction.y );
      sky = mix( sky, uFogColor, fogF );

      sky = mix( sky, vec3( dot( sky, vec3( 0.2126, 0.7152, 0.0722 ) ) ), uDesaturate );

      // tiny dither against banding in 8-bit output paths
      sky += ( hash13( vec3( gl_FragCoord.xy, uTime ) ) - 0.5 ) * 0.0015;

      gl_FragColor = vec4( max( sky, vec3( 0.0 ) ), 1.0 );
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }
  `,
};

class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = new TimeOfDay();
    this.tier = null;

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.sunColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.skyAverage = new THREE.Color();
    this.night = 0; // 0 day .. 1 night (lights on)
    this.exposure = 1;
    this.grade = { exposure: 1, whiteBalance: new THREE.Vector3(1, 1, 1), saturation: 1.05, contrast: 1.05, bloom: 0.1 };
    this.shadowExtent = 70;

    // Shared uniforms between the visible dome and the environment-map dome.
    const shared = THREE.UniformsUtils.clone(SkyShader.uniforms);
    const makeMaterial = (sunDisc) =>
      new THREE.ShaderMaterial({
        name: "PreethamSky",
        // The environment (ambient light) capture is slightly desaturated: the pure
        // Preetham sky would tint every shaded wall cyan.
        uniforms: Object.assign({}, shared, {
          uSunDisc: { value: sunDisc },
          uCamHeight: { value: 2.0 },
          uDesaturate: { value: sunDisc > 0 ? 0 : 0.25 },
        }),
        vertexShader: SkyShader.vertexShader,
        fragmentShader: SkyShader.fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
      });
    this.skyUniforms = shared;
    this.dome = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), makeMaterial(1));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 1e6; // last among opaques: early-z skips covered pixels
    this.scene.add(this.dome);

    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), makeMaterial(0));
    this.envScene.add(this.envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.envSunDir = new THREE.Vector3(0, -2, 0);
    this.envNight = -1;

    // Scene fog: THREE.Fog repurposed by the GFX height-fog patch (near = density, far = falloff).
    this.scene.fog = new THREE.Fog(0x000000, 0.0015, 0.012);
    this.scene.background = null;

    // Sun by day, moon by night: one shadow-casting directional light.
    this.light = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
    this.light.castShadow = true;
    this.light.shadow.camera.near = 1;
    this.light.shadow.camera.far = 800;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.04;
    this.scene.add(this.light);
    this.scene.add(this.light.target);

    // Player headlights at night (Medium/High); always present on those tiers so
    // toggling it never recompiles shaders.
    this.headlight = new THREE.SpotLight(0xfff1dc, 0, 48, 0.62, 0.55, 1.4);
    this.headlight.castShadow = false;
    this.headlightTarget = new THREE.Object3D();
    this.headlight.target = this.headlightTarget;

    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
    this._nightFog = new THREE.Color(0.012, 0.016, 0.026);
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this.update(0, null, null, true);
  }

  applyQuality(tier) {
    this.tier = tier;
    const shadow = this.light.shadow;
    if (shadow.mapSize.x !== tier.shadowMapSize) {
      shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
      if (shadow.map) {
        shadow.map.dispose();
        shadow.map = null;
      }
    }
    this.shadowExtent = -1; // force frustum rebuild
    if (tier.headlightSpot && !this.headlight.parent) {
      this.scene.add(this.headlight);
      this.scene.add(this.headlightTarget);
    } else if (!tier.headlightSpot && this.headlight.parent) {
      this.scene.remove(this.headlight);
      this.scene.remove(this.headlightTarget);
    }
    this.envSunDir.set(0, -2, 0); // refresh environment for the new tier
  }

  // --- per frame ------------------------------------------------------------------------
  update(delta, player, camera, force = false) {
    this.time.update(delta);
    this.time.sunDirection(this.sunDir);
    this.moonDir.copy(this.sunDir).negate();
    const s = this.sunDir.y;

    // Day/night factors
    this.night = 1 - THREE.MathUtils.smoothstep(s, -0.08, 0.1);
    const skyNight = 1 - THREE.MathUtils.smoothstep(s, -0.2, 0.02);

    // Sun colour from atmospheric transmittance; moon takes over below the horizon.
    SkyModel.transmittance(this.sunDir, this.sunColor);
    const sunI = SUN_INTENSITY * THREE.MathUtils.smoothstep(s, -0.03, 0.06);
    const moonI = 0.22 * THREE.MathUtils.smoothstep(this.moonDir.y, 0.02, 0.25) * skyNight;
    if (s > -0.03) {
      this.lightDir.copy(this.sunDir);
      this.light.color.copy(this.sunColor);
      this.light.intensity = sunI;
    } else {
      this.lightDir.copy(this.moonDir);
      this.light.color.setRGB(0.62, 0.72, 1.0);
      this.light.intensity = moonI;
    }

    // Sky, fog and ambient colours from the same model.
    this._v.set(-this.sunDir.z, 0.04, this.sunDir.x).normalize(); // horizon, 90 deg from the sun
    SkyModel.radiance(this._v, this.sunDir, this.fogColor);
    this.fogColor.lerp(this._nightFog, skyNight);
    const zen = SkyModel.radiance(this._up.set(0, 1, 0), this.sunDir, this._c);
    this.skyAverage.copy(zen).lerp(this.fogColor, 0.6);

    const hour = this.time.hours;
    const morningHaze = Math.max(0, 1 - Math.abs(hour - 6.8) / 1.6);
    const fog = this.scene.fog;
    fog.color.copy(this.fogColor);
    fog.near = 0.0006 + 0.0016 * morningHaze + 0.0006 * skyNight; // density at ground level
    fog.far = 0.012 + 0.012 * morningHaze; // height falloff

    // Ground bounce (lower hemisphere of the environment) and twilight glow.
    const sunLum = sunI * Math.max(0, s);
    this.groundBounce = this.groundBounce || new THREE.Color();
    this.groundBounce
      .setRGB(GROUND_ALBEDO[0], GROUND_ALBEDO[1], GROUND_ALBEDO[2])
      .multiply(this._c.copy(this.sunColor).multiplyScalar(sunLum).add(this.skyAverage));
    this.groundBounce.r += 0.004 * skyNight;
    this.groundBounce.g += 0.005 * skyNight;
    this.groundBounce.b += 0.008 * skyNight;
    const twilight = THREE.MathUtils.smoothstep(s, -0.22, -0.03) * (1 - THREE.MathUtils.smoothstep(s, 0.0, 0.1));
    GFX.uniforms.gfxSunDir.value.copy(this.sunDir);
    GFX.uniforms.gfxSunScatter.value.copy(this.sunColor).multiplyScalar(sunI * 0.45 * (1 - skyNight));

    // Exposure: partial adaptation to the estimated scene brightness.
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const sceneLum = sunI * Math.max(0, s) * lum(this.sunColor) + lum(this.skyAverage) + moonI * 0.5 + 0.004;
    this.exposure = THREE.MathUtils.clamp(Math.pow(1.45 / sceneLum, 0.42), 1.0, 3.2);

    // Colour grade for the HDR composite: neutral by day, slightly warm at golden hour,
    // cooler and less saturated at night.
    const golden = THREE.MathUtils.smoothstep(s, -0.02, 0.08) * (1 - THREE.MathUtils.smoothstep(s, 0.15, 0.4));
    this.grade.exposure = this.exposure;
    this.grade.whiteBalance.set(1 + 0.05 * golden - 0.05 * skyNight, 1 - 0.01 * skyNight, 1 - 0.07 * golden + 0.07 * skyNight);
    this.grade.saturation = 1.06 - 0.12 * skyNight;
    this.grade.contrast = 1.05;
    this.grade.bloom = 0.1 + 0.12 * this.night;

    // Night glow for lamps, neon, windows, head/tail lights.
    GFX.glow.update(this.night);

    // Sky dome uniforms
    const u = this.skyUniforms;
    u.sunDirection.value.copy(this.sunDir);
    u.moonDirection.value.copy(this.moonDir);
    u.uNight.value = skyNight;
    u.uGround.value.copy(this.groundBounce);
    u.uTwilight.value = twilight;
    u.uFogColor.value.copy(this.fogColor);
    u.uFogDensity.value = fog.near;
    u.uFogFalloff.value = fog.far;
    u.uTime.value += delta;

    if (camera) {
      this.dome.position.copy(camera.position);
      this.dome.material.uniforms.uCamHeight.value = camera.position.y;
      this.updateShadowFrustum(player, camera);
    }
    if (player) this.updateHeadlight(player);
    this.updateEnvironment(force);
  }

  updateEnvironment(force) {
    const minAngle = ((this.tier ? this.tier.envRefreshDegrees : 3) * Math.PI) / 180;
    const moved = this.envSunDir.y < -1.5 || this.envSunDir.angleTo(this.sunDir) > minAngle;
    const nightChanged = Math.abs(this.night - this.envNight) > 0.08;
    if (!force && !moved && !nightChanged) return;
    this.envSunDir.copy(this.sunDir);
    this.envNight = this.night;
    const target = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = target;
    this.scene.environment = target.texture;
  }

  // Shadow frustum centred ahead of the player, snapped to whole shadow-map texels so
  // it does not shimmer while moving; its size grows a little with speed.
  updateShadowFrustum(player, camera) {
    const tierExtent = this.tier ? this.tier.shadowExtent : 70;
    const speed = player ? Math.abs(player.state === "IN_VEHICLE" ? player.speed : player.velocity.length()) : 0;
    const extent = tierExtent * (1 + 0.5 * Math.min(1, speed / 30));
    const quantised = Math.ceil(extent / 10) * 10;
    const cam = this.light.shadow.camera;
    if (quantised !== this.shadowExtent) {
      this.shadowExtent = quantised;
      cam.left = -quantised;
      cam.right = quantised;
      cam.top = quantised;
      cam.bottom = -quantised;
      cam.updateProjectionMatrix();
    }

    const focus = this._v.copy(player ? player.position : camera.position);
    camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() > 1e-6) focus.addScaledVector(this._fwd.normalize(), this.shadowExtent * 0.35);

    const L = this.lightDir;
    this._right.set(0, 1, 0).cross(L);
    if (this._right.lengthSq() < 1e-6) this._right.set(1, 0, 0);
    this._right.normalize();
    this._up.copy(L).cross(this._right).normalize();
    const texel = (2 * this.shadowExtent) / this.light.shadow.mapSize.x;
    const px = Math.round(focus.dot(this._right) / texel) * texel;
    const py = Math.round(focus.dot(this._up) / texel) * texel;
    const pz = focus.dot(L);
    focus.copy(this._right).multiplyScalar(px).addScaledVector(this._up, py).addScaledVector(L, pz);

    this.light.target.position.copy(focus);
    this.light.position.copy(focus).addScaledVector(L, 400);
    this.light.target.updateMatrixWorld();
  }

  updateHeadlight(player) {
    if (!this.headlight.parent) return;
    const v = player.state === "IN_VEHICLE" ? player.currentVehicle : null;
    if (!v) {
      this.headlight.intensity = 0;
      return;
    }
    const half = (v.archetype.length || 4) * 0.5;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    this.headlight.position.set(v.position.x + fx * half, 1.0, v.position.z + fz * half);
    this.headlightTarget.position.set(v.position.x + fx * (half + 20), 0, v.position.z + fz * (half + 20));
    this.headlightTarget.updateMatrixWorld();
    this.headlight.intensity = 3.2 * this.night;
  }
}

window.TimeOfDay = TimeOfDay;
window.SkyModel = SkyModel;
window.SkySystem = SkySystem;
