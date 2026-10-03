'use client'

import { useRef, useState } from 'react'
import type { CropRect } from '@/lib/image-crop'

interface IrisCropEditorProps {
  src: string
  imageWidth: number
  imageHeight: number
  initialCrop: CropRect | null
  onConfirm: (crop: CropRect) => void
  onCancel: () => void
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

function centredSquare(width: number, height: number): CropRect {
  const side = Math.min(width, height)
  return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), width: side, height: side }
}

export function IrisCropEditor({
  src,
  imageWidth,
  imageHeight,
  initialCrop,
  onConfirm,
  onCancel,
}: IrisCropEditorProps) {
  const [crop, setCrop] = useState<CropRect>(initialCrop ?? centredSquare(imageWidth, imageHeight))
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: CropRect } | null>(null)

  const begin = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    frameRef.current?.setPointerCapture?.(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: crop }
  }

  const move = (e: React.PointerEvent) => {
    const d = drag.current
    const frame = frameRef.current
    if (!d || !frame || !frame.clientWidth) return
    const k = imageWidth / frame.clientWidth
    const dx = (e.clientX - d.startX) * k
    const dy = (e.clientY - d.startY) * k
    if (d.mode === 'move') {
      setCrop({
        ...d.start,
        x: Math.round(clamp(d.start.x + dx, 0, imageWidth - d.start.width)),
        y: Math.round(clamp(d.start.y + dy, 0, imageHeight - d.start.height)),
      })
    } else {
      const maxSide = Math.min(imageWidth - d.start.x, imageHeight - d.start.y)
      const side = Math.round(clamp(d.start.width + Math.max(dx, dy), Math.min(64, maxSide), maxSide))
      setCrop({ ...d.start, width: side, height: side })
    }
  }

  const end = () => {
    drag.current = null
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        {initialCrop
          ? 'Check the square covers the whole eye. Drag to move it, use the corner to resize.'
          : 'No eye detected. Place the square over the eye, or use the full photo.'}
      </p>
      <div
        ref={frameRef}
        className="relative inline-block max-w-full select-none touch-none bg-gray-100 rounded-lg overflow-hidden"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <img src={src} alt="Original photo" draggable={false} className="block max-w-full max-h-[60vh] w-auto h-auto" />
        <div
          data-testid="iris-crop-box"
          onPointerDown={begin('move')}
          className="absolute border-2 border-white cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{
            left: `${(crop.x / imageWidth) * 100}%`,
            top: `${(crop.y / imageHeight) * 100}%`,
            width: `${(crop.width / imageWidth) * 100}%`,
            height: `${(crop.height / imageHeight) * 100}%`,
          }}
        >
          <div
            aria-hidden
            onPointerDown={begin('resize')}
            className="absolute -right-2 -bottom-2 w-5 h-5 bg-white border border-gray-500 rounded-sm cursor-nwse-resize"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onConfirm(crop)}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Use crop
        </button>
        <button
          type="button"
          onClick={() => onConfirm({ x: 0, y: 0, width: imageWidth, height: imageHeight })}
          className="min-h-[44px] px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Use full photo
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
