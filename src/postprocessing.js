/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN: POST-PROCESSING & RENDERWARE TRAILS ENGINE (Subagent α)
 * Recreates the iconic 2002 RenderWare visual pipeline:
 * 1. RenderWare Trails (accumulation framebuffer motion blur on bright lights)
 * 2. Unreal Bloom (dreamy atmospheric glow on neon signs, headlights, and sunset)
 * 3. 1980s Miami Sunset Color Grading (warm golden highlights + violet/magenta shadows)
 * 
 * Architecture:
 * - Pass 1: Render 3D Scene into sceneTarget (linear HDR-ready buffer)
 * - Pass 2: Linear Trails Accumulation into accumTarget (strictly stable linear convex blend)
 * - Pass 3: Final Display Composite to Screen Canvas (Bloom, Color Grade, Vignette)
 */

class PostProcessingComposer {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    // Configuration Uniforms
    this.trailsEnabled = true;
    this.trailDecay = 0.65; // RenderWare decay factor (0.55 - 0.70 is authentic)
    this.bloomStrength = 1.25;
    this.bloomThreshold = 0.65;
    this.colorGradeIntensity = 1.0;

    // Render Targets
    const targetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      depthBuffer: true
    };

    const w = Math.floor(this.width * this.pixelRatio);
    const h = Math.floor(this.height * this.pixelRatio);

    this.sceneTarget = new THREE.WebGLRenderTarget(w, h, targetOptions);
    this.accumTargetA = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false
    });
    this.accumTargetB = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false
    });

    // Fullscreen Orthographic Camera & Quad
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);

    // 1. Trails Accumulation Shader (Linear Convex Blend - Strictly Stable)
    this.trailsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tPrevious: { value: null },
        uTrailDecay: { value: this.trailDecay },
        uTrailsEnabled: { value: this.trailsEnabled ? 1.0 : 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tCurrent;
        uniform sampler2D tPrevious;
        uniform float uTrailDecay;
        uniform float uTrailsEnabled;
        varying vec2 vUv;

        void main() {
          vec4 cur = texture2D(tCurrent, vUv);
          vec4 prev = texture2D(tPrevious, vUv);

          // Linear luminance-weighted accumulation
          // High luminance lights (headlights, neon signs) leave longer streaks
          float prevLum = dot(prev.rgb, vec3(0.299, 0.587, 0.114));
          float decay = uTrailDecay * smoothstep(0.15, 0.85, prevLum) * uTrailsEnabled;

          // Pure linear blend (prevents feedback blowup)
          vec3 accumulated = mix(cur.rgb, prev.rgb, clamp(decay, 0.0, 0.85));
          gl_FragColor = vec4(accumulated, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    // 2. Final Display Composite Shader (Screen Pass: Bloom + Miami Sunset Color Grade)
    this.displayMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tAccum: { value: null },
        uBloomStrength: { value: this.bloomStrength },
        uBloomThreshold: { value: this.bloomThreshold },
        uColorGrade: { value: this.colorGradeIntensity },
        uResolution: { value: new THREE.Vector2(w, h) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tAccum;
        uniform float uBloomStrength;
        uniform float uBloomThreshold;
        uniform float uColorGrade;
        uniform vec2 uResolution;
        varying vec2 vUv;

        void main() {
          vec4 baseTex = texture2D(tAccum, vUv);
          vec3 color = baseTex.rgb;

          // 9-Tap Dreamy Bloom Filter on Bright Highlights & Neon
          vec2 texel = 1.0 / uResolution;
          vec3 bloom = vec3(0.0);
          float weights[5];
          weights[0] = 0.227027;
          weights[1] = 0.1945946;
          weights[2] = 0.1216216;
          weights[3] = 0.054054;
          weights[4] = 0.016216;

          for (int i = 1; i < 4; i++) {
            vec2 offX = vec2(float(i) * 2.4 * texel.x, 0.0);
            vec2 offY = vec2(0.0, float(i) * 2.4 * texel.y);
            vec3 s1 = texture2D(tAccum, vUv + offX).rgb;
            vec3 s2 = texture2D(tAccum, vUv - offX).rgb;
            vec3 s3 = texture2D(tAccum, vUv + offY).rgb;
            vec3 s4 = texture2D(tAccum, vUv - offY).rgb;

            bloom += max(s1 - uBloomThreshold, vec3(0.0)) * weights[i];
            bloom += max(s2 - uBloomThreshold, vec3(0.0)) * weights[i];
            bloom += max(s3 - uBloomThreshold, vec3(0.0)) * weights[i];
            bloom += max(s4 - uBloomThreshold, vec3(0.0)) * weights[i];
          }

          color += bloom * uBloomStrength;

          // 1980s Miami Sunset Split-Tone Color Grading
          if (uColorGrade > 0.0) {
            float lum = dot(color, vec3(0.299, 0.587, 0.114));

            // Deep violet in shadows, warm golden amber in highlights
            vec3 shadowTint = vec3(0.96, 0.88, 1.04);
            vec3 highlightTint = vec3(1.08, 0.98, 0.82);
            vec3 graded = mix(color * shadowTint, color * highlightTint, smoothstep(0.2, 0.85, lum));

            // Gentle filmic S-curve
            graded = (graded - 0.5) * 1.08 + 0.5;

            // Saturation boost for tropical vibrance
            float gradedLum = dot(graded, vec3(0.299, 0.587, 0.114));
            graded = mix(vec3(gradedLum), graded, 1.18);

            // Subtle warm atmospheric top glow
            float sunGlow = smoothstep(0.4, 1.0, 1.0 - vUv.y) * 0.04;
            graded += vec3(0.20, 0.08, 0.01) * sunGlow;

            color = mix(color, clamp(graded, 0.0, 1.0), uColorGrade);
          }

          // Subtle Vignette
          vec2 uvDist = (vUv - 0.5) * 2.0;
          float vignette = 1.0 - dot(uvDist, uvDist) * 0.14;
          color *= clamp(vignette, 0.0, 1.0);

          gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(this.quadGeo, this.trailsMaterial);
    this.quadScene.add(this.quadMesh);

    this.currentAccum = this.accumTargetA;
    this.prevAccum = this.accumTargetB;
    this.hasFirstFrame = false;
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    const w = Math.floor(this.width * this.pixelRatio);
    const h = Math.floor(this.height * this.pixelRatio);

    this.sceneTarget.setSize(w, h);
    this.accumTargetA.setSize(w, h);
    this.accumTargetB.setSize(w, h);

    this.displayMaterial.uniforms.uResolution.value.set(w, h);
  }

  render(delta) {
    if (!this.renderer || !this.scene || !this.camera) return;

    // 1. Render 3D Scene to sceneTarget
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    if (!this.hasFirstFrame) {
      this.hasFirstFrame = true;
      this.renderer.setRenderTarget(this.prevAccum);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }

    // 2. Linear Trails Accumulation Pass (writes to currentAccum)
    this.quadMesh.material = this.trailsMaterial;
    this.trailsMaterial.uniforms.tCurrent.value = this.sceneTarget.texture;
    this.trailsMaterial.uniforms.tPrevious.value = this.prevAccum.texture;

    this.renderer.setRenderTarget(this.currentAccum);
    this.renderer.render(this.quadScene, this.quadCamera);

    // 3. Final Screen Display Pass (Bloom + Color Grading + Vignette -> Output to Screen Canvas)
    this.quadMesh.material = this.displayMaterial;
    this.displayMaterial.uniforms.tAccum.value = this.currentAccum.texture;

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);

    // 4. Ping-Pong Swap for Next Frame
    const temp = this.currentAccum;
    this.currentAccum = this.prevAccum;
    this.prevAccum = temp;
  }

  setTrails(enabled) {
    this.trailsEnabled = enabled;
    this.trailsMaterial.uniforms.uTrailsEnabled.value = enabled ? 1.0 : 0.0;
  }

  setBloom(strength) {
    this.bloomStrength = strength;
    this.displayMaterial.uniforms.uBloomStrength.value = strength;
  }

  setColorGrade(intensity) {
    this.colorGradeIntensity = intensity;
    this.displayMaterial.uniforms.uColorGrade.value = intensity;
  }
}

window.PostProcessingComposer = PostProcessingComposer;
