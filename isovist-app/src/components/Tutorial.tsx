import { MapPin, Eye, Move, RotateCcw, Maximize2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from './ui/dialog'
import { Button } from './ui/button'

const steps = [
  {
    icon: <MapPin size={22} className="text-blue-400" />,
    title: 'Place your viewpoint',
    desc: 'Tap or click anywhere on the ground to drop a marker. The blue area shows everything visible from that spot — your isovist.',
  },
  {
    icon: <Eye size={22} className="text-emerald-400" />,
    title: 'Street-level view',
    desc: 'The panel in the bottom-right shows what you\'d see standing at the marker. Drag inside it to look around.',
  },
  {
    icon: <Move size={22} className="text-amber-400" />,
    title: 'Walk around',
    desc: 'Use WASD keys to walk. On mobile, use the arrow buttons on the left side of the screen.',
  },
  {
    icon: <RotateCcw size={22} className="text-purple-400" />,
    title: 'Orbit the city',
    desc: 'Drag the main view to orbit, scroll to zoom. Click a new spot on the ground to move your viewpoint.',
  },
  {
    icon: <Maximize2 size={22} className="text-rose-400" />,
    title: 'The isovist shape',
    desc: 'The blue polygon changes as you move — tighter streets create narrow, elongated isovists; open plazas create wide ones.',
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
        <DialogHeader>
          <DialogTitle>Welcome to Isovist Explorer</DialogTitle>
          <DialogDescription>
            Explore what can be seen from any point in Weimar's city centre.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                {step.icon}
              </div>
              <div>
                <p className="font-medium text-sm text-white">{step.title}</p>
                <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <DialogClose asChild>
            <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-500 text-white border-0">
              Start exploring
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
