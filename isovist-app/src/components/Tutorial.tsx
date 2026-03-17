import { MapPin, Eye, Move, RotateCcw, Maximize2 } from 'lucide-react'
import { Dialog, DialogContent, DialogClose } from './ui/dialog'

const steps = [
  {
    icon: <MapPin size={20} color="#60a5fa" />,
    color: 'rgba(59,130,246,0.15)',
    border: 'rgba(59,130,246,0.3)',
    title: 'Place your viewpoint',
    desc: "Tap or click anywhere on the ground to drop a marker. The blue area shows everything visible from that spot — your isovist.",
  },
  {
    icon: <Eye size={20} color="#34d399" />,
    color: 'rgba(52,211,153,0.15)',
    border: 'rgba(52,211,153,0.3)',
    title: 'Street-level view',
    desc: "The panel in the bottom-right shows what you'd see standing at the marker. Drag inside it to look around.",
  },
  {
    icon: <Move size={20} color="#fbbf24" />,
    color: 'rgba(251,191,36,0.15)',
    border: 'rgba(251,191,36,0.3)',
    title: 'Walk around',
    desc: "Use WASD keys to walk. On mobile, use the arrow buttons on the left side of the screen.",
  },
  {
    icon: <RotateCcw size={20} color="#c084fc" />,
    color: 'rgba(192,132,252,0.15)',
    border: 'rgba(192,132,252,0.3)',
    title: 'Orbit the city',
    desc: "Drag the main view to orbit, scroll to zoom. Click a new spot on the ground to move your viewpoint.",
  },
  {
    icon: <Maximize2 size={20} color="#fb7185" />,
    color: 'rgba(251,113,133,0.15)',
    border: 'rgba(251,113,133,0.3)',
    title: 'The isovist shape',
    desc: "The blue polygon changes as you move — tighter streets create narrow, elongated isovists; open plazas create wide ones.",
  },
]

interface TutorialProps {
  open: boolean
  onClose: () => void
}

export default function Tutorial({ open, onClose }: TutorialProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px', marginBottom: 4 }}>
            Welcome to Isovist Explorer
          </h2>
          <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
            Explore what can be seen from any point in Weimar's city centre.
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                flexShrink: 0, width: 38, height: 38, borderRadius: 10,
                background: step.color, border: `1px solid ${step.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {step.icon}
              </div>
              <div style={{ paddingTop: 2 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#f0f0f0', marginBottom: 2 }}>
                  {step.title}
                </p>
                <p style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <DialogClose asChild>
            <button
              onClick={onClose}
              style={{
                padding: '9px 20px', borderRadius: 8,
                background: '#3b82f6', border: 'none',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', letterSpacing: '0.1px',
              }}
            >
              Start exploring →
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
