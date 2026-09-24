/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * STATIC BATCHER: merges static world meshes into one draw call per material per
 * 600 m map cell (coarse frustum culling, ~1,300 draw calls down to ~80).
 *
 * Usage: build a mesh or a whole Group as usual (never added to the scene), then
 * batcher.add(object); finally batcher.build() merges and adds the chunks.
 * Multi-material meshes (e.g. BoxGeometry with a material array) are split by group.
 * Material flags honoured: userData.depthMaterial -> merged mesh customDepthMaterial.
 */

class StaticBatcher {
  constructor(scene, cellSize = 600) {
    this.scene = scene;
    this.cellSize = cellSize;
    this.buckets = new Map();
    this.meshes = [];
    this._box = new THREE.Box3();
    this._center = new THREE.Vector3();
  }

  add(object) {
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (child.isMesh && child.visible !== false) this.addMesh(child);
    });
  }

  addMesh(mesh) {
    const src = mesh.geometry;
    const materials = Array.isArray(mesh.material) ? mesh.material : null;
    if (materials && src.groups.length) {
      src.groups.forEach((group) => {
        const part = this.extractGroup(src, group);
        this.push(part, materials[group.materialIndex], mesh);
      });
    } else {
      this.push(src.clone(), materials ? materials[0] : mesh.material, mesh);
    }
  }

  extractGroup(geometry, group) {
    const part = new THREE.BufferGeometry();
    for (const name in geometry.attributes) part.setAttribute(name, geometry.attributes[name].clone());
    const index = geometry.index;
    const ids = [];
    if (index) for (let i = group.start; i < group.start + group.count; i++) ids.push(index.getX(i));
    else for (let i = group.start; i < group.start + group.count; i++) ids.push(i);
    part.setIndex(ids);
    return part;
  }

  push(geometry, material, mesh) {
    const g = this.normalise(geometry, mesh.matrixWorld);
    g.computeBoundingBox();
    g.boundingBox.getCenter(this._center);
    const cx = Math.floor(this._center.x / this.cellSize);
    const cz = Math.floor(this._center.z / this.cellSize);
    const key = `${material.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${cx},${cz}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { material, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, geometries: [] };
      this.buckets.set(key, bucket);
    }
    bucket.geometries.push(g);
  }

  // World-space, indexed, exactly {position, normal, uv}.
  normalise(geometry, matrixWorld) {
    const g = geometry;
    Object.keys(g.attributes).forEach((name) => {
      if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    });
    g.morphAttributes = {};
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    if (!g.index) {
      const ids = new Array(count);
      for (let i = 0; i < count; i++) ids[i] = i;
      g.setIndex(ids);
    }
    g.applyMatrix4(matrixWorld);
    if (matrixWorld.determinant() < 0) {
      const idx = g.index;
      for (let i = 0; i < idx.count; i += 3) {
        const b = idx.getX(i + 1);
        idx.setX(i + 1, idx.getX(i + 2));
        idx.setX(i + 2, b);
      }
    }
    g.clearGroups();
    return g;
  }

  build() {
    let triangles = 0;
    this.buckets.forEach((bucket) => {
      const merged =
        bucket.geometries.length === 1
          ? bucket.geometries[0]
          : THREE.BufferGeometryUtils.mergeBufferGeometries(bucket.geometries, false);
      if (!merged) return;
      if (merged !== bucket.geometries[0]) bucket.geometries.forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (bucket.material.userData.depthMaterial) mesh.customDepthMaterial = bucket.material.userData.depthMaterial;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      triangles += merged.index.count / 3;
    });
    this.buckets.clear();
    return { drawables: this.meshes.length, triangles };
  }
}

window.StaticBatcher = StaticBatcher;
