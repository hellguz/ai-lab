# 3D Visibility Cone — Design Spec
**Date:** 2026-03-17
**Status:** Approved

## Overview

Add a live 3D visibility cone to the isovist app. The cone is rooted at the walker's eye position, points in the current heading/pitch direction, and updates in real time as the user walks (WASD) and looks around (mouse drag in eye panel).

## Component

**`<VisibilityCone />`** — a new component added inside the existing R3F `<Canvas>` in `App.tsx`, alongside `<Buildings>`, `<IsovistPolygon>`, etc. No new files required.

## Geometry

- `ConeGeometry(radiusBottom=2.5, height=8, radialSegments=32)`
- Point (radiusTop=0) at the walker's eye position
- Wide end extends forward ~8 units
- Default Y-up cone axis rotated 90° to align with forward Z, then heading/pitch applied

## Material

- `MeshBasicMaterial` (no lighting dependency — consistent glow)
- `color: #ffe066` (warm yellow)
- `transparent: true`, `opacity: 0.22`
- `depthWrite: false` (avoids z-fighting with buildings)
- `side: DoubleSide`

## Live Update

`<VisibilityCone>` holds a `useRef<THREE.Mesh>(null)` attached to its `<mesh>` JSX element. A `useFrame()` hook mutates the mesh ref imperatively every frame:

- `posRef.current[0]`, `posRef.current[1]` → cone position `[x, eyeHeight, z]`
- `headingRef.current` → Y rotation
- `pitchRef.current` → X rotation

**Rotation formula:**
```ts
mesh.rotation.order = 'YXZ'  // match eye camera convention
mesh.rotation.set(-Math.PI / 2 + pitch, heading, 0)
```
The `-Math.PI/2` tips the +Y-up cone to point forward along -Z. `+ pitch` tilts the cone up/down matching the eye camera direction. `rotation.order = 'YXZ'` matches the eye camera's convention.

## Integration Points

- Component placed inside `<Canvas>` in `App.tsx` alongside existing components
- Receives `posRef`, `headingRef`, `pitchRef` as props:
  ```ts
  interface VisibilityConeProps {
    posRef: React.MutableRefObject<[number, number]>
    headingRef: React.MutableRefObject<number>
    pitchRef: React.MutableRefObject<number>
  }
  ```
- `posRef.current[0]` = X, `posRef.current[1]` = Z (tuple, not object)
- Cone is **hidden from the eye-level camera** via Three.js layers:
  - `mesh.layers.set(1)` — assigns cone to layer 1 only (not layer 0)
  - Three.js cameras default to layer 0 only — so `eyeCam` cannot see the cone by default
  - The main Canvas camera must explicitly enable layer 1: `camera.layers.enable(1)` via `useThree().camera` inside a `useEffect` in `<VisibilityCone>`
  - `eyeCam.layers.disable(1)` is a defensive safety line — `eyeCam` already defaults to layer 0 only, but this makes intent explicit. Added in a `useEffect` (not `useMemo`) in `App`, after `eyeCam` is created
- No new state, no new data loading, no new dependencies
- Eye height constant reused: `0.20`

## Out of Scope

- Clipping the cone against building geometry
- Adjustable cone length/angle via UI controls
- Cone visible in the eye-level viewport (only in the orbit/top view)
