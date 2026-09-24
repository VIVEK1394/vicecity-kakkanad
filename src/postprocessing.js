/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * HDR POST-PROCESSING PIPELINE (Medium / High; Low renders straight to the canvas)
 *
 * 1. Scene -> half-float HDR target with a depth texture (4x MSAA on High / WebGL2).
 * 2. Ambient occlusion: depth-only SAO at half resolution (view-space normals are
 *    rebuilt from depth, so the scene is never rendered twice) + bilateral blur.
 * 3. Bloom: soft-threshold prefilter + dual-filter down/up chain (restrained).
 * 4. Composite: camera motion blur by depth reprojection (the followed subject stays
 *    sharp), screen-space reflections on wet road pixels (High; wetness is written to
 *    the HDR target's alpha by the asphalt material), AO, bloom, exposure, ACES filmic
 *    tone mapping (same fit as three.js), neutral colour grading, vignette, sRGB, dither.
 * 5. FXAA (vendored three.js r128 FXAAShader) when MSAA is not available.
 */

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }
`;

const DEPTH_HELPERS = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uProj;
  uniform mat4 uInvProj;
  vec3 viewPosAt( vec2 uv, float d ) {
    vec4 v = uInvProj * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
    return v.xyz / v.w;
  }
  vec3 viewPosAt( vec2 uv ) {
    return viewPosAt( uv, texture2D( tDepth, uv ).x );
  }
`;

class PostProcessingComposer {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.tier = null;
    this.focusDistance = 5;
    this.stats = { calls: 0, triangles: 0, path: "hdr" };

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.viewProj = new THREE.Matrix4();
    this.prevViewProj = new THREE.Matrix4();
    this.invViewProj = new THREE.Matrix4();
    this.lastCamPos = new THREE.Vector3();
    this.lastCamQuat = new THREE.Quaternion();
    this.hasHistory = false;
    this.size = new THREE.Vector2();
    this.targets = [];
  }

  // --- configuration -------------------------------------------------------------------
  setQuality(tier) {
    this.tier = tier;
    const isWebGL2 = this.renderer.capabilities.isWebGL2;
    this.msaa = tier.msaa && isWebGL2 ? tier.msaa : 0;
    this.useFxaa = tier.fxaa || (tier.msaa > 0 && !isWebGL2);
    this.bloomMips = tier.bloomMips;
    this.buildMaterials();
    this.allocate();
    this.resetHistory();
  }

  setSize() {
    if (this.tier) this.allocate();
  }

  resetHistory() {
    this.hasHistory = false;
  }

  makeTarget(w, h, opts) {
    const o = Object.assign(
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        depthBuffer: false,
        stencilBuffer: false,
      },
      opts
    );
    const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), o);
    rt.texture.generateMipmaps = false;
    this.targets.push(rt);
    return rt;
  }

  allocate() {
    this.targets.forEach((t) => t.dispose());
    this.targets = [];
    if (this.sceneTarget && this.sceneTarget.depthTexture) this.sceneTarget.depthTexture.dispose();

    const size = this.renderer.getDrawingBufferSize(this.size);
    const W = Math.floor(size.x);
    const H = Math.floor(size.y);

    const params = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
    };
    this.sceneTarget = this.msaa
      ? new THREE.WebGLMultisampleRenderTarget(W, H, params)
      : new THREE.WebGLRenderTarget(W, H, params);
    if (this.msaa) this.sceneTarget.samples = this.msaa;
    this.sceneTarget.texture.generateMipmaps = false;
    this.sceneTarget.depthTexture = new THREE.DepthTexture(W, H);
    this.sceneTarget.depthTexture.type = THREE.UnsignedIntType;
    this.targets.push(this.sceneTarget);

    if (this.tier.ao) {
      this.aoTarget = this.makeTarget(W >> 1, H >> 1, { type: THREE.UnsignedByteType });
      this.aoBlurTarget = this.makeTarget(W >> 1, H >> 1, { type: THREE.UnsignedByteType });
    }
    this.bloomTargets = [];
    for (let i = 0; i < this.bloomMips; i++) {
      this.bloomTargets.push(this.makeTarget(W >> (i + 1), H >> (i + 1)));
    }
    if (this.useFxaa) this.ldrTarget = this.makeTarget(W, H, { type: THREE.UnsignedByteType });

    this.fxaaMaterial.uniforms.resolution.value.set(1 / W, 1 / H);
    this.compositeMaterial.uniforms.uResolution.value.set(W, H);
  }

  buildMaterials() {
    const t = this.tier;
    const common = { depthTest: false, depthWrite: false, toneMapped: false };

    this.aoMaterial = new THREE.ShaderMaterial(
      Object.assign({}, common, {
        defines: { AO_SAMPLES: Math.max(4, t.aoSamples || 8) },
        uniforms: {
          tDepth: { value: null },
          uProj: { value: new THREE.Matrix4() },
          uInvProj: { value: new THREE.Matrix4() },
          uResolution: { value: new THREE.Vector2() },
          uRadius: { value: 1.4 },
          uIntensity: { value: 1.1 },
          uBias: { value: 0.025 },
        },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          ${DEPTH_HELPERS}
          uniform vec2 uResolution;
          uniform float uRadius;
          uniform float uIntensity;
          uniform float uBias;
          varying vec2 vUv;
          void main() {
            float d0 = texture2D( tDepth, vUv ).x;
            if ( d0 >= 0.99999 ) { gl_FragColor = vec4( 1.0 ); return; }
            vec2 texel = 1.0 / uResolution;
            vec3 P = viewPosAt( vUv, d0 );
            vec3 Pr = viewPosAt( vUv + vec2( texel.x, 0.0 ) );
            vec3 Pl = viewPosAt( vUv - vec2( texel.x, 0.0 ) );
            vec3 Pu = viewPosAt( vUv + vec2( 0.0, texel.y ) );
            vec3 Pd = viewPosAt( vUv - vec2( 0.0, texel.y ) );
            vec3 dx = abs( Pr.z - P.z ) < abs( P.z - Pl.z ) ? Pr - P : P - Pl;
            vec3 dy = abs( Pu.z - P.z ) < abs( P.z - Pd.z ) ? Pu - P : P - Pd;
            vec3 N = normalize( cross( dx, dy ) );

            float radiusPx = min( uRadius * uProj[ 1 ][ 1 ] * 0.5 * uResolution.y / max( -P.z, 0.1 ), 90.0 );
            float noise = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
            float r2 = uRadius * uRadius;
            float occlusion = 0.0;
            for ( int i = 0; i < AO_SAMPLES; i++ ) {
              float a = ( float( i ) + 0.5 ) / float( AO_SAMPLES );
              float ang = ( noise + a * 7.0 ) * 6.2831853;
              vec2 offset = vec2( cos( ang ), sin( ang ) ) * ( a * radiusPx ) * texel;
              vec3 v = viewPosAt( vUv + offset ) - P;
              float vv = dot( v, v );
              float f = max( r2 - vv, 0.0 );
              occlusion += f * f * f * max( ( dot( v, N ) - uBias ) / ( 0.01 + vv ), 0.0 );
            }
            float ao = max( 0.0, 1.0 - occlusion * uIntensity * 5.0 / ( r2 * r2 * r2 * float( AO_SAMPLES ) ) );
            gl_FragColor = vec4( vec3( ao ), 1.0 );
          }
        `,
      })
    );

    this.aoBlurMaterial = new THREE.ShaderMaterial(
      Object.assign({}, common, {
        uniforms: {
          tAO: { value: null },
          tDepth: { value: null },
          uDir: { value: new THREE.Vector2() },
          uNear: { value: 0.3 },
          uFar: { value: 3000 },
        },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          #include <packing>
          uniform sampler2D tAO;
          uniform sampler2D tDepth;
          uniform vec2 uDir;
          uniform float uNear;
          uniform float uFar;
          varying vec2 vUv;
          float linearZ( vec2 uv ) { return -perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, uNear, uFar ); }
          void main() {
            float z0 = linearZ( vUv );
            float sum = 0.0;
            float wsum = 0.0;
            for ( int i = -3; i <= 3; i++ ) {
              vec2 uv = vUv + uDir * float( i );
              float w = exp( -float( i * i ) / 8.0 ) * max( 0.0, 1.0 - abs( linearZ( uv ) - z0 ) / ( 0.04 * z0 + 0.1 ) );
              sum += texture2D( tAO, uv ).r * w;
              wsum += w;
            }
            gl_FragColor = vec4( vec3( sum / max( wsum, 1e-4 ) ), 1.0 );
          }
        `,
      })
    );

    this.bloomPrefilterMaterial = new THREE.ShaderMaterial(
      Object.assign({}, common, {
        uniforms: {
          tSrc: { value: null },
          uTexel: { value: new THREE.Vector2() },
          uExposure: { value: 1 },
          uThreshold: { value: 1.2 },
          uKnee: { value: 0.6 },
        },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          uniform sampler2D tSrc;
          uniform vec2 uTexel;
          uniform float uExposure;
          uniform float uThreshold;
          uniform float uKnee;
          varying vec2 vUv;
          void main() {
            vec3 c = texture2D( tSrc, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb
                   + texture2D( tSrc, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb
                   + texture2D( tSrc, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb
                   + texture2D( tSrc, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
            c = min( c * 0.25 * uExposure, vec3( 64.0 ) );
            float br = max( c.r, max( c.g, c.b ) );
            float soft = clamp( br - uThreshold + uKnee, 0.0, 2.0 * uKnee );
            soft = soft * soft / ( 4.0 * uKnee + 1e-4 );
            float contribution = max( soft, br - uThreshold ) / max( br, 1e-4 );
            gl_FragColor = vec4( c * contribution, 1.0 );
          }
        `,
      })
    );

    this.bloomDownMaterial = new THREE.ShaderMaterial(
      Object.assign({}, common, {
        uniforms: { tSrc: { value: null }, uHalfTexel: { value: new THREE.Vector2() } },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          uniform sampler2D tSrc;
          uniform vec2 uHalfTexel;
          varying vec2 vUv;
          void main() {
            vec3 sum = texture2D( tSrc, vUv ).rgb * 4.0;
            sum += texture2D( tSrc, vUv - uHalfTexel ).rgb;
            sum += texture2D( tSrc, vUv + uHalfTexel ).rgb;
            sum += texture2D( tSrc, vUv + vec2( uHalfTexel.x, -uHalfTexel.y ) ).rgb;
            sum += texture2D( tSrc, vUv - vec2( uHalfTexel.x, -uHalfTexel.y ) ).rgb;
            gl_FragColor = vec4( sum / 8.0, 1.0 );
          }
        `,
      })
    );

    this.bloomUpMaterial = new THREE.ShaderMaterial(
      Object.assign({}, common, {
        uniforms: { tSrc: { value: null }, uHalfTexel: { value: new THREE.Vector2() } },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          uniform sampler2D tSrc;
          uniform vec2 uHalfTexel;
          varying vec2 vUv;
          void main() {
            vec2 h = uHalfTexel;
            vec3 sum = texture2D( tSrc, vUv + vec2( -h.x * 2.0, 0.0 ) ).rgb;
            sum += texture2D( tSrc, vUv + vec2( -h.x, h.y ) ).rgb * 2.0;
            sum += texture2D( tSrc, vUv + vec2( 0.0, h.y * 2.0 ) ).rgb;
            sum += texture2D( tSrc, vUv + vec2( h.x, h.y ) ).rgb * 2.0;
            sum += texture2D( tSrc, vUv + vec2( h.x * 2.0, 0.0 ) ).rgb;
            sum += texture2D( tSrc, vUv + vec2( h.x, -h.y ) ).rgb * 2.0;
            sum += texture2D( tSrc, vUv + vec2( 0.0, -h.y * 2.0 ) ).rgb;
            sum += texture2D( tSrc, vUv + vec2( -h.x, -h.y ) ).rgb * 2.0;
            gl_FragColor = vec4( sum / 12.0, 1.0 );
          }
        `,
        blending: THREE.AdditiveBlending,
      })
    );

    const defines = {
      MB_SAMPLES: t.motionBlurSamples || 0,
    };
    if (t.ao) defines.USE_AO = "";
    if (t.bloomMips > 0) defines.USE_BLOOM = "";
    if (t.ssr) defines.USE_SSR = "";

    this.compositeMaterial = new THREE.ShaderMaterial(
      Object.assign({}, common, {
        defines,
        uniforms: {
          tScene: { value: null },
          tDepth: { value: null },
          tAO: { value: null },
          tBloom: { value: null },
          uProj: { value: new THREE.Matrix4() },
          uInvProj: { value: new THREE.Matrix4() },
          uView: { value: new THREE.Matrix4() },
          uInvViewProj: { value: new THREE.Matrix4() },
          uPrevViewProj: { value: new THREE.Matrix4() },
          uResolution: { value: new THREE.Vector2() },
          uNear: { value: 0.3 },
          uFar: { value: 3000 },
          uExposure: { value: 1 },
          uBloomStrength: { value: 0.1 },
          uAOStrength: { value: 0.85 },
          uMBScale: { value: 0.5 },
          uMBMax: { value: 0.03 },
          uFocusDistance: { value: 5 },
          uSSR: { value: 1 },
          uWhiteBalance: { value: new THREE.Vector3(1, 1, 1) },
          uSaturation: { value: 1.05 },
          uContrast: { value: 1.04 },
          uVignette: { value: 0.2 },
          uTime: { value: 0 },
        },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          #include <packing>
          ${DEPTH_HELPERS}
          uniform sampler2D tScene;
          uniform sampler2D tAO;
          uniform sampler2D tBloom;
          uniform mat4 uView;
          uniform mat4 uInvViewProj;
          uniform mat4 uPrevViewProj;
          uniform vec2 uResolution;
          uniform float uNear;
          uniform float uFar;
          uniform float uExposure;
          uniform float uBloomStrength;
          uniform float uAOStrength;
          uniform float uMBScale;
          uniform float uMBMax;
          uniform float uFocusDistance;
          uniform float uSSR;
          uniform vec3 uWhiteBalance;
          uniform float uSaturation;
          uniform float uContrast;
          uniform float uVignette;
          uniform float uTime;
          varying vec2 vUv;

          float linearZ( float d ) { return -perspectiveDepthToViewZ( d, uNear, uFar ); }

          // three.js ACES filmic fit (exposure applied beforehand)
          vec3 RRTAndODTFit( vec3 v ) {
            vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
            vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
            return a / b;
          }
          vec3 ACESFilmic( vec3 color ) {
            const mat3 ACESInputMat = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
            const mat3 ACESOutputMat = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
            color = ACESInputMat * ( color / 0.6 );
            color = RRTAndODTFit( color );
            return clamp( ACESOutputMat * color, 0.0, 1.0 );
          }
          vec3 toSRGB( vec3 c ) {
            return mix( pow( c, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), c * 12.92, vec3( lessThanEqual( c, vec3( 0.0031308 ) ) ) );
          }

          void main() {
            vec4 base = texture2D( tScene, vUv );
            vec3 color = base.rgb;
            float depth = texture2D( tDepth, vUv ).x;

            #if MB_SAMPLES > 1
              // Camera motion blur: reproject this pixel with last frame's camera.
              vec4 world = uInvViewProj * vec4( vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
              world /= world.w;
              vec4 prev = uPrevViewProj * world;
              vec2 velocity = ( vUv - ( prev.xy / prev.w * 0.5 + 0.5 ) ) * uMBScale;
              float speed = length( velocity );
              if ( speed > uMBMax ) velocity *= uMBMax / speed;
              float focusFade = smoothstep( uFocusDistance * 1.2, uFocusDistance * 2.4, linearZ( depth ) );
              velocity *= focusFade;
              if ( dot( velocity, velocity ) * dot( uResolution, uResolution ) > 0.25 ) {
                vec3 acc = color;
                float wsum = 1.0;
                for ( int i = 0; i < MB_SAMPLES; i++ ) {
                  vec2 uv = vUv + velocity * ( float( i ) / float( MB_SAMPLES - 1 ) - 0.5 );
                  // ignore samples that land on the (sharp) followed subject
                  float w = smoothstep( uFocusDistance * 1.1, uFocusDistance * 1.6, linearZ( texture2D( tDepth, uv ).x ) );
                  acc += texture2D( tScene, uv ).rgb * w;
                  wsum += w;
                }
                color = acc / wsum;
              }
            #endif

            #ifdef USE_SSR
              // Screen-space reflections on wet road pixels only (flat, horizontal).
              float wet = clamp( 1.0 - base.a, 0.0, 1.0 ) * uSSR;
              if ( wet > 0.02 && depth < 1.0 ) {
                vec3 P = viewPosAt( vUv, depth );
                vec3 N = normalize( ( uView * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
                vec3 V = normalize( P );
                vec3 R = reflect( V, N );
                vec3 Q = P;
                float stepLen = 0.6;
                vec2 hitUv = vec2( -1.0 );
                for ( int i = 0; i < 14; i++ ) {
                  Q += R * stepLen;
                  stepLen *= 1.38;
                  vec4 clip = uProj * vec4( Q, 1.0 );
                  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
                  if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || Q.z > -0.1 ) break;
                  float sceneZ = viewPosAt( uv ).z;
                  float behind = sceneZ - Q.z;
                  // relative thickness: grazing rays must not "hit" the road they start on
                  if ( i > 0 && behind > 0.03 - 0.015 * Q.z && behind < stepLen * 1.5 + 0.4 ) { hitUv = uv; break; }
                }
                if ( hitUv.x >= 0.0 ) {
                  vec2 edge = smoothstep( 0.0, 0.1, hitUv ) * ( 1.0 - smoothstep( 0.9, 1.0, hitUv ) );
                  float fresnel = 0.04 + 0.96 * pow( 1.0 - max( dot( -V, N ), 0.0 ), 5.0 );
                  color += texture2D( tScene, hitUv ).rgb * wet * fresnel * edge.x * edge.y;
                }
              }
            #endif

            #ifdef USE_AO
              float ao = texture2D( tAO, vUv ).r;
              color *= mix( 1.0, ao, uAOStrength );
            #endif

            color *= uExposure;
            #ifdef USE_BLOOM
              color += texture2D( tBloom, vUv ).rgb * uBloomStrength;
            #endif

            color = ACESFilmic( color * uWhiteBalance );

            // neutral grade: gentle saturation + contrast around mid grey, vignette
            float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
            color = max( mix( vec3( luma ), color, uSaturation ), 0.0 );
            vec3 srgb = toSRGB( color );
            srgb = clamp( ( srgb - 0.5 ) * uContrast + 0.5, 0.0, 1.0 );
            vec2 p = vUv - 0.5;
            srgb *= 1.0 - uVignette * dot( p, p ) * 2.0;

            // blue-noise-ish dither against banding
            float n = fract( 52.9829189 * fract( dot( gl_FragCoord.xy + uTime * 61.0, vec2( 0.06711056, 0.00583715 ) ) ) );
            srgb += ( n - 0.5 ) / 255.0;
            gl_FragColor = vec4( srgb, 1.0 );
          }
        `,
      })
    );

    this.fxaaMaterial = new THREE.ShaderMaterial(
      Object.assign({}, common, {
        uniforms: THREE.UniformsUtils.clone(THREE.FXAAShader.uniforms),
        vertexShader: THREE.FXAAShader.vertexShader,
        fragmentShader: THREE.FXAAShader.fragmentShader,
      })
    );
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  // grade: { exposure, whiteBalance (Vector3), saturation, contrast, bloom }
  render(delta, grade) {
    const r = this.renderer;
    const cam = this.camera;
    const info = r.info;
    const autoClear = r.autoClear;
    info.autoReset = false;
    info.reset();
    r.autoClear = false; // bloom upsampling blends onto existing mips

    // 1. Scene (HDR, linear)
    r.setRenderTarget(this.sceneTarget);
    r.clear();
    r.render(this.scene, cam);
    const sceneCalls = info.render.calls;

    const depthTex = this.sceneTarget.depthTexture;
    const size = this.size;
    const W = size.x;
    const H = size.y;

    // Camera matrices (motion blur history is dropped on camera cuts)
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.invViewProj.copy(this.viewProj).invert();
    const moved = cam.position.distanceTo(this.lastCamPos);
    const turned = 2 * Math.acos(Math.min(1, Math.abs(cam.quaternion.dot(this.lastCamQuat))));
    if (!this.hasHistory || moved > 12 || turned > 0.7) this.prevViewProj.copy(this.viewProj);
    this.lastCamPos.copy(cam.position);
    this.lastCamQuat.copy(cam.quaternion);
    this.hasHistory = true;

    // 2. Ambient occlusion (half resolution) + bilateral blur
    if (this.tier.ao) {
      const u = this.aoMaterial.uniforms;
      u.tDepth.value = depthTex;
      u.uProj.value.copy(cam.projectionMatrix);
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uResolution.value.set(this.aoTarget.width, this.aoTarget.height);
      this.pass(this.aoMaterial, this.aoTarget);

      const b = this.aoBlurMaterial.uniforms;
      b.tDepth.value = depthTex;
      b.uNear.value = cam.near;
      b.uFar.value = cam.far;
      b.tAO.value = this.aoTarget.texture;
      b.uDir.value.set(1 / this.aoTarget.width, 0);
      this.pass(this.aoBlurMaterial, this.aoBlurTarget);
      b.tAO.value = this.aoBlurTarget.texture;
      b.uDir.value.set(0, 1 / this.aoTarget.height);
      this.pass(this.aoBlurMaterial, this.aoTarget);
    }

    // 3. Bloom: prefilter, downsample chain, additive upsample chain
    if (this.bloomMips > 0) {
      const pre = this.bloomPrefilterMaterial.uniforms;
      pre.tSrc.value = this.sceneTarget.texture;
      pre.uTexel.value.set(0.5 / W, 0.5 / H);
      pre.uExposure.value = grade.exposure;
      this.pass(this.bloomPrefilterMaterial, this.bloomTargets[0]);
      const down = this.bloomDownMaterial.uniforms;
      for (let i = 1; i < this.bloomMips; i++) {
        const src = this.bloomTargets[i - 1];
        down.tSrc.value = src.texture;
        down.uHalfTexel.value.set(0.5 / src.width, 0.5 / src.height);
        this.pass(this.bloomDownMaterial, this.bloomTargets[i]);
      }
      const up = this.bloomUpMaterial.uniforms;
      for (let i = this.bloomMips - 2; i >= 0; i--) {
        const src = this.bloomTargets[i + 1];
        up.tSrc.value = src.texture;
        up.uHalfTexel.value.set(0.5 / src.width, 0.5 / src.height);
        this.pass(this.bloomUpMaterial, this.bloomTargets[i]);
      }
    }

    // 4. Composite
    const c = this.compositeMaterial.uniforms;
    c.tScene.value = this.sceneTarget.texture;
    c.tDepth.value = depthTex;
    c.tAO.value = this.tier.ao ? this.aoTarget.texture : null;
    c.tBloom.value = this.bloomMips > 0 ? this.bloomTargets[0].texture : null;
    c.uProj.value.copy(cam.projectionMatrix);
    c.uInvProj.value.copy(cam.projectionMatrixInverse);
    c.uView.value.copy(cam.matrixWorldInverse);
    c.uInvViewProj.value.copy(this.invViewProj);
    c.uPrevViewProj.value.copy(this.prevViewProj);
    c.uNear.value = cam.near;
    c.uFar.value = cam.far;
    c.uExposure.value = grade.exposure;
    c.uBloomStrength.value = (grade.bloom !== undefined ? grade.bloom : 0.1) / Math.max(1, this.bloomMips * 0.6);
    c.uMBScale.value = Math.min(1.2, (0.5 / 60) / Math.max(delta, 1 / 240));
    c.uFocusDistance.value = this.focusDistance;
    c.uWhiteBalance.value.copy(grade.whiteBalance);
    c.uSaturation.value = grade.saturation;
    c.uContrast.value = grade.contrast;
    c.uTime.value = (c.uTime.value + delta) % 1000;
    this.pass(this.compositeMaterial, this.useFxaa ? this.ldrTarget : null);

    // 5. FXAA
    if (this.useFxaa) {
      this.fxaaMaterial.uniforms.tDiffuse.value = this.ldrTarget.texture;
      this.pass(this.fxaaMaterial, null);
    }

    this.prevViewProj.copy(this.viewProj);
    this.stats.calls = info.render.calls;
    this.stats.sceneCalls = sceneCalls;
    this.stats.triangles = info.render.triangles;
    this.stats.path = `hdr${this.msaa ? " msaa" + this.msaa : ""}${this.useFxaa ? " fxaa" : ""}`;
    info.autoReset = true;
    r.autoClear = autoClear;
  }
}

window.PostProcessingComposer = PostProcessingComposer;
