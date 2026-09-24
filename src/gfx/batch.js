/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * STATIC BATCHER: merges static world meshes into one draw call per material per
 * map cell (coarse frustum culling), plus a draw-distance cut per cell.
 *
 * Two ways in:
 * - batcher.add(object): any Mesh or Group built as usual (never added to the scene).
 *   Multi-material meshes (e.g. BoxGeometry with a material array) are split by group.
 * - batcher.writer(material, castShadow, receiveShadow): raw vertex writer for the
 *   procedural city (thousands of boxes without creating a Mesh per box).
 * Materials with vertexColors keep a colour attribute (default white) so one material
 * can tint many buildings. userData.depthMaterial -> merged mesh customDepthMaterial.
 *
 * Level of detail by material (userData.lod): "far" (buildings, roads: 900 m cells, the
 * tier's draw distance), "mid" (paint, palms, signs: 600 m cells, <= 720 m) and "near"
 * (small props: 300 m cells, <= 380 m). userData.nightOnly meshes (light cones and
 * pools) are hidden in daylight. Far cells stay cheap: few materials, big cells.
 */

const BATCH_LOD = Object.freeze({
  far: { cell: 900, range: Infinity },
  mid: { cell: 600, range: 720 },
  near: { cell: 300, range: 380 },
});

class StaticBatcher {
  constructor(scene, cellSize = 600) {
    this.scene = scene;
    this.cellSize = cellSize; // for materials without a LOD class
    this.buckets = new Map();
    this.meshes = [];
    this.cells = new Map(); // "lod|cx,cz" -> { lod, meshes, box }
    this.night = 1;
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

  bucket(material, castShadow, receiveShadow, x, z) {
    const lod = material.userData.lod || "far";
    const size = material.userData.lod ? BATCH_LOD[lod].cell : this.cellSize;
    const cx = Math.floor(x / size);
    const cz = Math.floor(z / size);
    // One bucket per material and cell: shadow flags are OR-ed (a lamp arm casting a
    // shadow costs less than a second draw call for the same material).
    const key = `${material.uuid}|${cx},${cz}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { material, castShadow, receiveShadow, lod, cell: `${lod}|${cx},${cz}`, geometries: [], raw: null };
      this.buckets.set(key, b);
    }
    b.castShadow = b.castShadow || castShadow;
    b.receiveShadow = b.receiveShadow || receiveShadow;
    return b;
  }

  push(geometry, material, mesh) {
    const g = this.normalise(geometry, mesh.matrixWorld, material.vertexColors);
    g.computeBoundingBox();
    g.boundingBox.getCenter(this._center);
    this.bucket(material, mesh.castShadow, mesh.receiveShadow, this._center.x, this._center.z).geometries.push(g);
  }

  // World-space, indexed, exactly {position, normal, uv} (+ color for vertexColors).
  normalise(geometry, matrixWorld, keepColor) {
    const g = geometry;
    Object.keys(g.attributes).forEach((name) => {
      if (name !== "position" && name !== "normal" && name !== "uv" && !(keepColor && name === "color")) g.deleteAttribute(name);
    });
    g.morphAttributes = {};
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    if (keepColor && !g.attributes.color) g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
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

  // Raw writer: w.begin(x, z) picks the cell, then vertex()/tri()/quad() append.
  writer(material, castShadow = true, receiveShadow = true) {
    const self = this;
    const color = !!material.vertexColors;
    let raw = null;
    return {
      material,
      begin(x, z) {
        const b = self.bucket(material, castShadow, receiveShadow, x, z);
        if (!b.raw) b.raw = { p: [], n: [], uv: [], c: color ? [] : null, i: [] };
        raw = b.raw;
        return raw.p.length / 3;
      },
      vertex(x, y, z, nx, ny, nz, u, v, r = 1, g = 1, bl = 1) {
        raw.p.push(x, y, z);
        raw.n.push(nx, ny, nz);
        raw.uv.push(u, v);
        if (raw.c) raw.c.push(r, g, bl);
        return raw.p.length / 3 - 1;
      },
      tri(a, b, c) {
        raw.i.push(a, b, c);
      },
      quad(a, b, c, d) {
        raw.i.push(a, b, c, b, d, c);
      },
    };
  }

  rawGeometry(raw) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(raw.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(raw.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(raw.uv, 2));
    if (raw.c) g.setAttribute("color", new THREE.Float32BufferAttribute(raw.c, 3));
    g.setIndex(raw.i);
    return g;
  }

  build() {
    let triangles = 0;
    this.buckets.forEach((bucket) => {
      if (bucket.raw && bucket.raw.i.length) bucket.geometries.push(this.rawGeometry(bucket.raw));
      if (!bucket.geometries.length) return;
      const merged =
        bucket.geometries.length === 1
          ? bucket.geometries[0]
          : THREE.BufferGeometryUtils.mergeBufferGeometries(bucket.geometries, false);
      if (!merged) return;
      if (merged !== bucket.geometries[0]) bucket.geometries.forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (bucket.material.userData.depthMaterial) mesh.customDepthMaterial = bucket.material.userData.depthMaterial;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      let cell = this.cells.get(bucket.cell);
      if (!cell) {
        cell = { lod: bucket.lod, meshes: [], box: new THREE.Box3(), visible: true };
        this.cells.set(bucket.cell, cell);
      }
      mesh.userData.nightOnly = !!bucket.material.userData.nightOnly;
      cell.meshes.push(mesh);
      cell.box.union(merged.boundingBox);
      triangles += merged.index.count / 3;
    });
    this.buckets.clear();
    return { drawables: this.meshes.length, triangles };
  }

  // Hide whole cells beyond their draw distance (fog by then), and night-only meshes in
  // daylight. Cheap: ~100 cells.
  updateVisibility(cameraPos, maxDistance, night = this.night) {
    const nightChanged = night > 0.03 !== this.night > 0.03;
    this.night = night;
    this.cells.forEach((cell) => {
      const range = Math.min(maxDistance, BATCH_LOD[cell.lod] ? BATCH_LOD[cell.lod].range : Infinity);
      const visible = cell.box.distanceToPoint(cameraPos) < range;
      if (cell.visible === visible && !nightChanged) return;
      cell.visible = visible;
      const lit = night > 0.03;
      cell.meshes.forEach((m) => (m.visible = visible && (lit || !m.userData.nightOnly)));
    });
  }
}

window.StaticBatcher = StaticBatcher;
