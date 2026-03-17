export interface WallSeg {
  x1: number; z1: number; x2: number; z2: number
}

export interface ParsedData {
  buildingPositions: Float32Array
  wallSegs: WallSeg[]
  streetPositions: Float32Array
}

const SCALE = 10000
// Z (height) is in Rhino meters; XY coords are normalized to ~0.01 range ≈ 1km real world.
// 1 Three.js unit ≈ 7–10m, so divide raw heights by ~8 to match.
const HEIGHT_SCALE = 0.12

function getPolygons(geometry: any): number[][][][] {
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  return []
}

export function parseData(buildingsGeo: any, streetsGeo: any): ParsedData {
  // Compute center from building extents
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const f of buildingsGeo.features) {
    for (const poly of getPolygons(f.geometry)) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }
      }
    }
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  // Parse buildings: face triangles + ground-level wall segments for raycasting
  const bpos: number[] = []
  const wallSegs: WallSeg[] = []

  for (const feature of buildingsGeo.features) {
    for (const poly of getPolygons(feature.geometry)) {
      const ring = poly[0] // outer ring: [x, y, z]
      const verts = ring.slice(0, -1) // drop closing vertex

      // Fan-triangulate the face from vertex 0
      for (let i = 1; i < verts.length - 1; i++) {
        for (const v of [verts[0], verts[i], verts[i + 1]]) {
          // GeoJSON [x, y, z] → Three.js [x, height, z]
          bpos.push((v[0] - cx) * SCALE, v[2] * HEIGHT_SCALE, (v[1] - cy) * SCALE)
        }
      }

      // Extract edges at ground level (z ≈ 0) for isovist ray casting
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1, z1] = ring[i]
        const [x2, y2, z2] = ring[i + 1]
        if (z1 < 0.1 && z2 < 0.1) {
          const sx1 = (x1 - cx) * SCALE, sz1 = (y1 - cy) * SCALE
          const sx2 = (x2 - cx) * SCALE, sz2 = (y2 - cy) * SCALE
          if (Math.hypot(sx2 - sx1, sz2 - sz1) > 0.001) {
            wallSegs.push({ x1: sx1, z1: sz1, x2: sx2, z2: sz2 })
          }
        }
      }
    }
  }

  // Parse streets as line segments
  const spos: number[] = []
  for (const feature of streetsGeo.features) {
    const coords = feature.geometry.coordinates as number[][]
    for (let i = 0; i < coords.length - 1; i++) {
      spos.push(
        (coords[i][0] - cx) * SCALE, 0.05, (coords[i][1] - cy) * SCALE,
        (coords[i + 1][0] - cx) * SCALE, 0.05, (coords[i + 1][1] - cy) * SCALE,
      )
    }
  }

  return {
    buildingPositions: new Float32Array(bpos),
    wallSegs,
    streetPositions: new Float32Array(spos),
  }
}

export function computeIsovist(
  px: number,
  pz: number,
  segs: WallSeg[],
  maxRadius = 150,
  numRays = 360,
): [number, number][] {
  const pts: [number, number][] = []

  for (let i = 0; i < numRays; i++) {
    const angle = (i / numRays) * Math.PI * 2
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    let minT = maxRadius

    for (const s of segs) {
      const ex = s.x2 - s.x1, ez = s.z2 - s.z1
      const cross = dx * ez - dz * ex
      if (Math.abs(cross) < 1e-10) continue
      const fx = s.x1 - px, fz = s.z1 - pz
      const t = (fx * ez - fz * ex) / cross
      const u = (fx * dz - fz * dx) / cross
      if (t > 0.01 && u >= 0 && u <= 1 && t < minT) minT = t
    }

    pts.push([px + dx * minT, pz + dz * minT])
  }

  return pts
}
