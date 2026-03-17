import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { parseData, computeIsovist, type ParsedData } from './utils/geo'
import { HelpCircle, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import Tutorial from './components/Tutorial'

// ── Mobile detection ──────────────────────────────────────────────────────
const isMobile = /Mobi|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1

const EYE_HEIGHT = 0.20
const EYE_W = isMobile ? 0.50 : 0.35
const EYE_H = isMobile ? 0.38 : 0.30
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
        if (Math.sqrt(dx * dx + dy * dy) < 8) onClick(e.point.x, e.point.z)
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

// ── Sun – smaller shadow map on mobile ───────────────────────────────────

function SunLight() {
  const ref = useRef<THREE.DirectionalLight>(null)
  useEffect(() => {
    const light = ref.current
    if (!light) return
    const mapSize = isMobile ? 512 : 2048
    light.shadow.mapSize.set(mapSize, mapSize)
    light.shadow.camera.left   = -100
    light.shadow.camera.right  =  100
    light.shadow.camera.top    =  100
    light.shadow.camera.bottom = -100
    light.shadow.camera.near   = 0.1
    light.shadow.camera.far    = 600
    light.shadow.radius = 4
    light.shadow.bias   = -0.0005
    light.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <directionalLight
      ref={ref}
      position={[60, 100, 50]}
      intensity={1.6}
      color="#ffffff"
      castShadow={!isMobile}
    />
  )
}

// ── Eye-level controller ──────────────────────────────────────────────────

interface EyeControllerProps {
  posRef: React.MutableRefObject<[number, number]>
  headingRef: React.MutableRefObject<number>
  pitchRef: React.MutableRefObject<number>
  eyeCam: THREE.PerspectiveCamera
  mobileKeysRef: React.MutableRefObject<{ w: boolean; a: boolean; s: boolean; d: boolean }>
  orbitRef: React.MutableRefObject<OrbitControlsImpl | null>
}

function EyeLevelController({ posRef, headingRef, pitchRef, eyeCam, mobileKeysRef, orbitRef }: EyeControllerProps) {
  const { gl } = useThree()
  const keys = useRef({ w: false, a: false, s: false, d: false })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const touchLook = useRef<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const SENS = 0.004
    const TOUCH_SENS = 0.006

    const inEye = (clientX: number, clientY: number) => {
      const r = gl.domElement.getBoundingClientRect()
      return (clientX - r.left) >= r.width * (1 - EYE_W) &&
             (clientY - r.top)  >= r.height * (1 - EYE_H)
    }

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = e.key.toLowerCase() as keyof typeof keys.current
      if (k in keys.current) { e.preventDefault(); keys.current[k] = true }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase() as keyof typeof keys.current
      if (k in keys.current) keys.current[k] = false
    }

    // Mouse look in eye view
    const onMouseDown = (e: MouseEvent) => {
      if (inEye(e.clientX, e.clientY)) {
        drag.current = { x: e.clientX, y: e.clientY }
        if (orbitRef.current) orbitRef.current.enabled = false
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!drag.current) return
      headingRef.current -= (e.clientX - drag.current.x) * SENS
      pitchRef.current   -= (e.clientY - drag.current.y) * SENS
      pitchRef.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitchRef.current))
      drag.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseUp = () => {
      drag.current = null
      if (orbitRef.current) orbitRef.current.enabled = true
    }

    // Touch look in eye view
    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (inEye(t.clientX, t.clientY) && !touchLook.current) {
          touchLook.current = { id: t.identifier, x: t.clientX, y: t.clientY }
          if (orbitRef.current) orbitRef.current.enabled = false
        }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!touchLook.current) return
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === touchLook.current.id) {
          headingRef.current -= (t.clientX - touchLook.current.x) * TOUCH_SENS
          pitchRef.current   -= (t.clientY - touchLook.current.y) * TOUCH_SENS
          pitchRef.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitchRef.current))
          touchLook.current = { id: t.identifier, x: t.clientX, y: t.clientY }
        }
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchLook.current) return
      const cur = touchLook.current
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === cur.id) {
          touchLook.current = null
          if (orbitRef.current) orbitRef.current.enabled = true
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    gl.domElement.addEventListener('touchstart', onTouchStart, { passive: true })
    gl.domElement.addEventListener('touchmove', onTouchMove, { passive: true })
    gl.domElement.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      gl.domElement.removeEventListener('touchstart', onTouchStart)
      gl.domElement.removeEventListener('touchmove', onTouchMove)
      gl.domElement.removeEventListener('touchend', onTouchEnd)
    }
  }, [gl, headingRef, pitchRef])

  useFrame((_, delta) => {
    const SPEED = 20
    const dt = Math.min(delta, 0.05)
    const h = headingRef.current
    let [px, pz] = posRef.current
    const kb = keys.current
    const mk = mobileKeysRef.current
    if (kb.w || mk.w) { px -= Math.sin(h) * SPEED * dt; pz -= Math.cos(h) * SPEED * dt }
    if (kb.s || mk.s) { px += Math.sin(h) * SPEED * dt; pz += Math.cos(h) * SPEED * dt }
    if (kb.a || mk.a) { px -= Math.cos(h) * SPEED * dt; pz += Math.sin(h) * SPEED * dt }
    if (kb.d || mk.d) { px += Math.cos(h) * SPEED * dt; pz -= Math.sin(h) * SPEED * dt }
    posRef.current = [px, pz]

    eyeCam.position.set(px, EYE_HEIGHT, pz)
    eyeCam.rotation.y = headingRef.current
    eyeCam.rotation.x = pitchRef.current
  })

  return null
}

// ── Eye-level renderer ────────────────────────────────────────────────────

function EyeLevelRenderer({ eyeCam }: { eyeCam: THREE.PerspectiveCamera }) {
  useFrame(({ gl: renderer, scene, size }) => {
    const { width, height } = size
    const ew = Math.floor(width  * EYE_W)
    const eh = Math.floor(height * EYE_H)

    eyeCam.aspect = ew / eh
    eyeCam.updateProjectionMatrix()

    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false
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

// ── Mobile D-pad ──────────────────────────────────────────────────────────

function DPad({ keysRef }: { keysRef: React.MutableRefObject<{ w: boolean; a: boolean; s: boolean; d: boolean }> }) {
  const set = (k: keyof typeof keysRef.current, v: boolean) => { keysRef.current[k] = v }

  const btn = (k: keyof typeof keysRef.current, icon: React.ReactNode) => (
    <button
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(k, true) }}
      onPointerUp={() => set(k, false)}
      onPointerCancel={() => set(k, false)}
      style={{
        width: 48, height: 48, borderRadius: 10,
        background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
        backdropFilter: 'blur(6px)', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', touchAction: 'none', userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {icon}
    </button>
  )

  return (
    <div style={{
      position: 'absolute',
      bottom: `calc(${EYE_H * 100}% + 16px)`,
      left: 16,
      display: 'grid',
      gridTemplateColumns: '48px 48px 48px',
      gridTemplateRows: '48px 48px',
      gap: 4,
    }}>
      <div />
      {btn('w', <ArrowUp size={20} />)}
      <div />
      {btn('a', <ArrowLeft size={20} />)}
      {btn('s', <ArrowDown size={20} />)}
      {btn('d', <ArrowRight size={20} />)}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [data, setData] = useState<ParsedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isovistPts, setIsovistPts] = useState<[number, number][]>([])
  const [isovistOrigin, setIsovistOrigin] = useState<[number, number] | null>(null)
  const [showTutorial, setShowTutorial] = useState(false)

  const posRef     = useRef<[number, number]>([0, 0])
  const headingRef = useRef(0)
  const pitchRef   = useRef(0)
  const mobileKeysRef = useRef({ w: false, a: false, s: false, d: false })
  const orbitRef = useRef<OrbitControlsImpl | null>(null)

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
      // Open tutorial on first visit
      if (!localStorage.getItem('isovist-tutorial-seen')) {
        setShowTutorial(true)
      }
    })
  }, [])

  const handleCloseTutorial = () => {
    setShowTutorial(false)
    localStorage.setItem('isovist-tutorial-seen', '1')
  }

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
          flexDirection: 'column', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: '#3b82f6', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: '#888', fontSize: 14, fontFamily: 'system-ui' }}>Loading city…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {!loading && data && (
        <Canvas
          shadows={isMobile ? false : 'soft'}
          frameloop="always"
          camera={{ position: [0, 200, 200], fov: 45, near: 0.1, far: 5000 }}
          gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
          dpr={[1, isMobile ? 1.5 : 2]}
          style={{ position: 'absolute', inset: 0 }}
        >
          <hemisphereLight args={['#ddeeff', '#f5f5f5', 1.4]} />
          <SunLight />

          <Buildings positions={data.buildingPositions} />
          <Streets   positions={data.streetPositions} />
          <GreenGround onClick={handlePlace} />

          {isovistOrigin && isovistPts.length > 0 && (
            <IsovistPolygon viewpoint={isovistOrigin} points={isovistPts} />
          )}

          <MarkerTracker posRef={posRef} />

          <EyeLevelController
            posRef={posRef}
            headingRef={headingRef}
            pitchRef={pitchRef}
            eyeCam={eyeCam}
            mobileKeysRef={mobileKeysRef}
            orbitRef={orbitRef}
          />
          <EyeLevelRenderer eyeCam={eyeCam} />

          {!isMobile && (
            <EffectComposer>
              <N8AO aoRadius={6} intensity={3} distanceFalloff={1} screenSpaceRadius={false} color="black" />
            </EffectComposer>
          )}

          <OrbitControls ref={orbitRef} makeDefault />
        </Canvas>
      )}

      {/* Hint panel – top left */}
      {!loading && (
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(15,15,15,0.75)', backdropFilter: 'blur(10px)',
          borderRadius: 10, padding: '9px 14px',
          fontSize: 12, color: '#ccc', fontFamily: 'system-ui',
          border: '1px solid rgba(255,255,255,0.1)',
          pointerEvents: 'none', userSelect: 'none', lineHeight: 1.7,
          maxWidth: 220,
        }}>
          {isovistOrigin
            ? <><span style={{ color: '#fff' }}>Tap ground</span> to move viewpoint<br /><span style={{ color: '#888' }}>Drag eye view to look · WASD to walk</span></>
            : <><span style={{ color: '#fff' }}>Tap the ground</span><br />to place your viewpoint</>}
        </div>
      )}

      {/* Tutorial button – top right */}
      {!loading && (
        <button
          onClick={() => setShowTutorial(true)}
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(15,15,15,0.75)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#ccc', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          title="How to use"
        >
          <HelpCircle size={18} />
        </button>
      )}

      {/* Eye-level label + border */}
      {!loading && (
        <>
          <div style={{
            position: 'absolute',
            bottom: `calc(${EYE_H * 100}% + 4px)`, right: 0,
            width: `${EYE_W * 100}%`, textAlign: 'center',
            color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'system-ui',
            pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          }}>
            Eye-level · drag to look{!isMobile && ' · WASD to walk'}
          </div>
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: `${EYE_W * 100}%`, height: `${EYE_H * 100}%`,
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px 0 0 0', pointerEvents: 'none',
          }} />
        </>
      )}

      {/* Mobile D-pad */}
      {!loading && isMobile && (
        <DPad keysRef={mobileKeysRef} />
      )}

      {/* Tutorial dialog */}
      <Tutorial open={showTutorial} onClose={handleCloseTutorial} />
    </div>
  )
}
