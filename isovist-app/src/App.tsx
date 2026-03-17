import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { parseData, computeIsovist, type ParsedData } from './utils/geo'

const EYE_HEIGHT = 0.20  // 1.65m × HEIGHT_SCALE(0.12) ≈ 0.20 Three.js units
const EYE_W = 0.35
const EYE_H = 0.30
const SKY_COLOR = new THREE.Color('#87ceeb')

// ── Geometry components ───────────────────────────────────────────────────

function Buildings({ positions }: { positions: Float32Array }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.computeVertexNormals()
    return g
  }, [positions])
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#f2f0ee" roughness={0.85} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Streets({ positions }: { positions: Float32Array }) {
  const obj = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#888' }))
  }, [positions])
  return <primitive object={obj} />
}

function GreenGround({ onClick }: { onClick?: (x: number, z: number) => void }) {
  const down = useRef<{ x: number; y: number } | null>(null)
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.05, 0]}
      receiveShadow
      onPointerDown={onClick ? (e) => { down.current = { x: e.clientX, y: e.clientY } } : undefined}
      onPointerUp={onClick ? (e) => {
        if (!down.current) return
        const dx = e.clientX - down.current.x
        const dy = e.clientY - down.current.y
        if (Math.sqrt(dx * dx + dy * dy) < 5) onClick(e.point.x, e.point.z)
        down.current = null
      } : undefined}
    >
      <planeGeometry args={[2000, 2000]} />
      <meshStandardMaterial color="#f5f5f5" roughness={0.95} metalness={0} />
    </mesh>
  )
}

function IsovistPolygon({ viewpoint, points }: { viewpoint: [number, number]; points: [number, number][] }) {
  const geometry = useMemo(() => {
    const [px, pz] = viewpoint
    const arr: number[] = []
    const n = points.length
    for (let i = 0; i < n; i++) {
      const [x1, z1] = points[i]
      const [x2, z2] = points[(i + 1) % n]
      arr.push(px, 0.2, pz, x1, 0.2, z1, x2, 0.2, z2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
    return g
  }, [viewpoint, points])
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function MarkerTracker({ posRef }: { posRef: React.MutableRefObject<[number, number]> }) {
  const ref = useRef<THREE.Mesh>(null)
  // priority=0 → runs before rendering, updates mesh position each frame
  useFrame(() => {
    if (ref.current) {
      ref.current.position.x = posRef.current[0]
      ref.current.position.z = posRef.current[1]
    }
  })
  return (
    <mesh ref={ref} position={[0, 0.12, 0]} castShadow>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshBasicMaterial color="#ef4444" />
    </mesh>
  )
}

// ── Sun with properly configured soft shadow map ──────────────────────────

function SunLight() {
  const ref = useRef<THREE.DirectionalLight>(null)
  useEffect(() => {
    const light = ref.current
    if (!light) return
    light.shadow.mapSize.set(2048, 2048)
    light.shadow.camera.left   = -100
    light.shadow.camera.right  =  100
    light.shadow.camera.top    =  100
    light.shadow.camera.bottom = -100
    light.shadow.camera.near   = 0.1
    light.shadow.camera.far    = 600
    light.shadow.radius = 4        // soft PCF blur
    light.shadow.bias   = -0.0005
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <directionalLight
      ref={ref}
      position={[60, 100, 50]}
      intensity={1.6}
      color="#ffffff"
      castShadow
    />
  )
}

// ── Eye-level: controller (priority 0) ───────────────────────────────────
// Handles WASD + mouse-look, updates shared refs and eyeCam each frame.

interface EyeControllerProps {
  posRef: React.MutableRefObject<[number, number]>
  headingRef: React.MutableRefObject<number>
  pitchRef: React.MutableRefObject<number>
  eyeCam: THREE.PerspectiveCamera
}

function EyeLevelController({ posRef, headingRef, pitchRef, eyeCam }: EyeControllerProps) {
  const { gl } = useThree()
  const keys = useRef({ w: false, a: false, s: false, d: false })
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const SENS = 0.004

    const inEye = (clientX: number, clientY: number) => {
      const r = gl.domElement.getBoundingClientRect()
      return (clientX - r.left) >= r.width * (1 - EYE_W) &&
             (clientY - r.top)  >= r.height * (1 - EYE_H)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = e.key.toLowerCase() as keyof typeof keys.current
      if (k in keys.current) { e.preventDefault(); keys.current[k] = true }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase() as keyof typeof keys.current
      if (k in keys.current) keys.current[k] = false
    }
    const onMouseDown = (e: MouseEvent) => {
      if (inEye(e.clientX, e.clientY)) drag.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!drag.current) return
      headingRef.current -= (e.clientX - drag.current.x) * SENS
      pitchRef.current   -= (e.clientY - drag.current.y) * SENS
      pitchRef.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitchRef.current))
      drag.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseUp = () => { drag.current = null }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [gl, headingRef, pitchRef])

  // priority=0 → WASD movement runs before rendering
  useFrame((_, delta) => {
    const SPEED = 20
    const dt = Math.min(delta, 0.05)
    const h = headingRef.current
    let [px, pz] = posRef.current
    if (keys.current.w) { px -= Math.sin(h) * SPEED * dt; pz -= Math.cos(h) * SPEED * dt }
    if (keys.current.s) { px += Math.sin(h) * SPEED * dt; pz += Math.cos(h) * SPEED * dt }
    if (keys.current.a) { px -= Math.cos(h) * SPEED * dt; pz += Math.sin(h) * SPEED * dt }
    if (keys.current.d) { px += Math.cos(h) * SPEED * dt; pz -= Math.sin(h) * SPEED * dt }
    posRef.current = [px, pz]

    eyeCam.position.set(px, EYE_HEIGHT, pz)
    eyeCam.rotation.y = headingRef.current
    eyeCam.rotation.x = pitchRef.current
  })

  return null
}

// ── Eye-level: renderer (priority 2) ─────────────────────────────────────
// Runs AFTER EffectComposer (priority=1). Draws the eye-level viewport
// in the bottom-right corner via scissor, on top of the post-processed main view.

function EyeLevelRenderer({ eyeCam }: { eyeCam: THREE.PerspectiveCamera }) {
  useFrame(({ gl: renderer, scene, size }) => {
    const { width, height } = size
    const ew = Math.floor(width  * EYE_W)
    const eh = Math.floor(height * EYE_H)

    eyeCam.aspect = ew / eh
    eyeCam.updateProjectionMatrix()

    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false

    // EffectComposer may have left a render target bound — reset to screen
    renderer.setRenderTarget(null)

    renderer.setScissorTest(true)
    renderer.setScissor(width - ew, 0, ew, eh)
    renderer.setViewport(width - ew, 0, ew, eh)
    renderer.setClearColor(SKY_COLOR, 1)
    renderer.clear(true, true, false)
    renderer.render(scene, eyeCam)

    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
    renderer.autoClear = prevAutoClear
  }, 2)

  return null
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [data, setData] = useState<ParsedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isovistPts, setIsovistPts] = useState<[number, number][]>([])
  const [isovistOrigin, setIsovistOrigin] = useState<[number, number] | null>(null)

  const posRef     = useRef<[number, number]>([0, 0])
  const headingRef = useRef(0)
  const pitchRef   = useRef(0)

  // Eye camera created once, shared between controller and renderer
  const eyeCam = useMemo(() => {
    const c = new THREE.PerspectiveCamera(75, 1, 0.1, 2000)
    c.rotation.order = 'YXZ'
    return c
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('./weimar-buildings-3d.geojson').then(r => r.json()),
      fetch('./weimar-streets.geojson').then(r => r.json()),
    ]).then(([b, s]) => {
      setData(parseData(b, s))
      setLoading(false)
    })
  }, [])

  const handlePlace = (x: number, z: number) => {
    if (!data) return
    posRef.current   = [x, z]
    headingRef.current = 0
    pitchRef.current   = 0
    setIsovistOrigin([x, z])
    setIsovistPts(computeIsovist(x, z, data.wallSegs))
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#111' }}>

      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 10,
        }}>
          <p style={{ color: '#888', fontSize: 18, fontFamily: 'system-ui' }}>Loading city data…</p>
        </div>
      )}

      {!loading && data && (
        <Canvas
          shadows="soft"
          frameloop="always"
          camera={{ position: [0, 200, 200], fov: 45, near: 0.1, far: 5000 }}
          gl={{ antialias: true }}
          style={{ position: 'absolute', inset: 0 }}
        >
          {/* Overcast sky: cool blue from above, warm green-grey from ground */}
          <hemisphereLight args={['#ddeeff', '#f5f5f5', 1.4]} />
          <SunLight />

          <Buildings positions={data.buildingPositions} />
          <Streets   positions={data.streetPositions} />
          <GreenGround onClick={handlePlace} />

          {isovistOrigin && isovistPts.length > 0 && (
            <IsovistPolygon viewpoint={isovistOrigin} points={isovistPts} />
          )}

          <MarkerTracker posRef={posRef} />

          {/* Eye-level: controller updates camera (priority=0), renderer draws scissor (priority=2) */}
          <EyeLevelController posRef={posRef} headingRef={headingRef} pitchRef={pitchRef} eyeCam={eyeCam} />
          <EyeLevelRenderer eyeCam={eyeCam} />

          {/* EffectComposer at priority=1 renders main view with N8AO */}
          <EffectComposer>
            <N8AO
              aoRadius={6}
              intensity={3}
              distanceFalloff={1}
              screenSpaceRadius={false}
              color="black"
            />
          </EffectComposer>

          <OrbitControls makeDefault />
        </Canvas>
      )}

      {/* Top-left hint */}
      <div style={{
        position: 'absolute', top: 16, left: 16,
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)',
        borderRadius: 8, padding: '10px 16px',
        fontSize: 13, color: '#444', fontFamily: 'system-ui',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        pointerEvents: 'none', userSelect: 'none', lineHeight: 1.6,
      }}>
        {isovistOrigin
          ? <>Click ground · move viewpoint<br /><span style={{ color: '#888' }}>WASD · drag eye view to look</span></>
          : 'Click the green ground to place viewpoint'}
      </div>

      {/* Eye-level panel label + border */}
      {!loading && (
        <>
          <div style={{
            position: 'absolute',
            bottom: `calc(${EYE_H * 100}% + 4px)`, right: 0,
            width: `${EYE_W * 100}%`, textAlign: 'center',
            color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: 'system-ui',
            pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          }}>
            Eye-level · drag to look · WASD to walk
          </div>
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: `${EYE_W * 100}%`, height: `${EYE_H * 100}%`,
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px 0 0 0', pointerEvents: 'none',
          }} />
        </>
      )}
    </div>
  )
}
