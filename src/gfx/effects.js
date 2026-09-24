/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * CHEAP LIGHTING EFFECTS (all tiers)
 * 1. LampStreaks: wet-road reflections of street lamps at night - one additive quad per
 *    lamp, stretched along the ground towards the camera in the vertex shader.
 * 2. ContactShadows: soft ambient-occlusion blobs under vehicles and people, drawn as a
 *    single InstancedMesh (the cheap AO term the shadow map cannot provide).
 */

class LampStreaks {
  constructor(scene, lampPositions) {
    const n = lampPositions.length;
    const centers = new Float32Array(n * 4 * 3);
    const corners = new Float32Array(n * 4 * 2);
    const index = [];
    const cornerList = [
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ];
    lampPositions.forEach((p, i) => {
      for (let k = 0; k < 4; k++) {
        centers.set([p.x, 0.1, p.z], (i * 4 + k) * 3);
        corners.set(cornerList[k], (i * 4 + k) * 2);
      }
      const b = i * 4;
      index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(centers, 3)); // placeholder for bounds
    geo.setAttribute("aCenter", new THREE.Float32BufferAttribute(centers, 3));
    geo.setAttribute("aCorner", new THREE.Float32BufferAttribute(corners, 2));
    geo.setIndex(index);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(1.0, 0.72, 0.42) },
        uIntensity: { value: 0 },
        uLength: { value: 11 },
        uWidth: { value: 0.75 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aCenter;
        attribute vec2 aCorner;
        uniform float uLength;
        uniform float uWidth;
        varying vec2 vCorner;
        varying float vFade;
        void main() {
          vec2 toCam = cameraPosition.xz - aCenter.xz;
          float d = length( toCam );
          vec2 dir = toCam / max( d, 1e-3 );
          vec2 side = vec2( -dir.y, dir.x );
          float len = min( uLength, d * 0.85 );
          vec3 p = aCenter + vec3( side.x, 0.0, side.y ) * aCorner.x * uWidth + vec3( dir.x, 0.0, dir.y ) * aCorner.y * len;
          gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
          vCorner = aCorner;
          vFade = 1.0 - smoothstep( 70.0, 220.0, d );
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vCorner;
        varying float vFade;
        void main() {
          float across = 1.0 - abs( vCorner.x );
          across *= across;
          float along = pow( 1.0 - vCorner.y, 0.7 ) * smoothstep( 0.0, 0.1, vCorner.y );
          gl_FragColor = vec4( uColor * ( uIntensity * across * along * vFade ), 1.0 );
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -90,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  update(night, wetness, scale = 1) {
    const k = night * wetness * scale;
    this.material.uniforms.uIntensity.value = 1.6 * k;
    this.mesh.visible = k > 0.001;
  }
}

class ContactShadows {
  constructor(scene, capacity = 64) {
    const canvas = GFX.makeCanvas(128);
    const ctx = canvas.getContext("2d");
    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.shadowBlur = 28;
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    const r = 22;
    ctx.moveTo(34 + r, 34);
    ctx.arcTo(94, 34, 94, 94, r);
    ctx.arcTo(94, 94, 34, 94, r);
    ctx.arcTo(34, 94, 34, 34, r);
    ctx.arcTo(34, 34, 94, 34, r);
    ctx.fill();
    const tex = GFX.texture(canvas);
    tex.anisotropy = 1;

    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: tex,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -60,
    });
    mat.userData.linear = true;
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.capacity = capacity;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    scene.add(this.mesh);
  }

  begin() {
    this.mesh.count = 0;
  }

  // Blob footprint (width x length metres) at a ground position, rotated to heading.
  add(position, heading, width, length, y = 0.11) {
    if (this.mesh.count >= this.capacity) return;
    this._q.setFromAxisAngle(this._up, heading);
    this._p.set(position.x, y, position.z);
    this._s.set(width, 1, length);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(this.mesh.count++, this._m);
  }

  end() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

window.LampStreaks = LampStreaks;
window.ContactShadows = ContactShadows;
