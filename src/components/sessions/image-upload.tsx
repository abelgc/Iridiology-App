'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CropRect } from '@/lib/image-crop'
import { autoContrastInPlace } from '@/lib/image-enhance'
import { findIrisCrop } from '@/lib/image-eye-crop'
import { prepareUploadFile } from '@/lib/images/prepare-upload-file'
import { IrisCropEditor } from './iris-crop-editor'

interface PendingPhoto {
  img: HTMLImageElement
  url: string
  crop: CropRect | null
}

function encodeCrop(img: HTMLImageElement, crop: CropRect): string {
  const MAX = 1536
  let width = crop.width
  let height = crop.height
  if (width > MAX || height > MAX) {
    const scale = Math.min(MAX / width, MAX / height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)
  // Auto-contrast pass: compensates for underexposed/shadow-heavy captures (eyelid
  // shadow, poor lighting) before the image reaches the model — see image-enhance.ts.
  const imageData = ctx.getImageData(0, 0, width, height)
  autoContrastInPlace(imageData.data)
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

interface ImageUploadProps {
  label: string
  value: string | null
  onChange: (base64: string | null) => void
  required?: boolean
}

export function ImageUpload({ label, value, onChange, required = false }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [pending, setPending] = useState<PendingPhoto | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      processFile(files[0])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
  }

  const processFile = async (file: File) => {
    setError(null)

    let prepared: File
    try {
      prepared = await prepareUploadFile(file)
    } catch (err) {
      setError(err instanceof Error && err.message === 'not-image'
        ? 'Please select an image file'
        : 'Failed to read file')
      return
    }

    const img = new Image()
    const objectUrl = URL.createObjectURL(prepared)
    img.onload = () => setPending({ img, url: objectUrl, crop: findIrisCrop(img) })
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      setError('Failed to read file')
    }
    img.src = objectUrl
  }

  const closePending = () => {
    if (pending) URL.revokeObjectURL(pending.url)
    setPending(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleConfirmCrop = (crop: CropRect) => {
    if (!pending) return
    onChange(encodeCrop(pending.img, crop))
    closePending()
  }

  const handleRemove = () => {
    onChange(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {pending ? (
        <IrisCropEditor
          src={pending.url}
          imageWidth={pending.img.naturalWidth}
          imageHeight={pending.img.naturalHeight}
          initialCrop={pending.crop}
          onConfirm={handleConfirmCrop}
          onCancel={closePending}
        />
      ) : value ? (
        <div className="space-y-2">
          <div className="relative w-full h-32 md:h-48 bg-gray-100 rounded-lg overflow-hidden">
            <img
              src={`data:image/jpeg;base64,${value}`}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium min-h-[44px] px-2 py-2"
          >
            <X size={16} />
            Remove
          </button>
        </div>
      ) : (
        <div
          onDragOver={!isTouchDevice ? handleDragOver : undefined}
          onDragLeave={!isTouchDevice ? handleDragLeave : undefined}
          onDrop={!isTouchDevice ? handleDrop : undefined}
          onClick={handleClick}
          className={cn(
            'relative border-2 border-dashed rounded-lg p-6 md:p-8 text-center cursor-pointer transition-colors min-h-[160px] md:min-h-[200px] flex flex-col items-center justify-center',
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400',
            error && 'border-red-300 bg-red-50',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.avif"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload size={32} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">
            {isTouchDevice ? 'Tap to browse your photos' : 'Drag and drop your image here'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isTouchDevice ? 'or use photo library' : 'or click to browse'}
          </p>
        </div>
      )}

      {required && !value && (
        <p className="text-sm text-red-600 font-medium">This field is required</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
