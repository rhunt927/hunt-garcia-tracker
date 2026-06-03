import { useRef, useState } from 'react'
import { Camera, Upload, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { extractReceiptData } from '../lib/vision'

export function ReceiptScanner({ onExtracted, onClose }) {
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('idle') // idle | scanning | done | error
  const [errorMsg, setErrorMsg] = useState(null)

  async function handleFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target.result
      setPreview(dataUrl)
      setStatus('scanning')
      setErrorMsg(null)
      try {
        // Strip the data URL prefix to get raw base64
        const base64 = dataUrl.split(',')[1]
        const result = await extractReceiptData(base64)
        setStatus('done')
        onExtracted(result)
      } catch (err) {
        setStatus('error')
        setErrorMsg(err.message)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-white/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Scan Receipt</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {/* Camera — works on mobile; on desktop shows file picker with camera option */}
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-xl py-5 transition-colors"
        >
          <Camera size={28} className="text-blue-400" />
          <span className="text-sm font-medium">Take Photo</span>
        </button>

        {/* File picker — any image from device */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-xl py-5 transition-colors"
        >
          <Upload size={28} className="text-blue-400" />
          <span className="text-sm font-medium">Choose Image</span>
        </button>
      </div>

      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {/* Preview + status */}
      {preview && (
        <div className="space-y-3">
          <img
            src={preview}
            alt="Receipt preview"
            className="w-full max-h-48 object-contain rounded-lg border border-white/10"
          />

          {status === 'scanning' && (
            <div className="flex items-center gap-2 text-blue-400 text-sm">
              <Loader2 size={16} className="animate-spin" />
              Scanning receipt...
            </div>
          )}

          {status === 'done' && (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle size={16} />
              Fields extracted — review the form below
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle size={16} />
              {errorMsg ?? 'Could not read receipt — fill in manually'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
