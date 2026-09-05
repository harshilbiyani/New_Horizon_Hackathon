import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { UploadCloud, Image as ImageIcon, X, Loader2, Camera, Scan } from 'lucide-react';

interface Props {
  onSearchImage: (file: File) => void;
  loading: boolean;
  onClear?: () => void;
}

export default function VLMImageSearchBar({ onSearchImage, loading, onClear }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPG, PNG, WebP).');
      return;
    }
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleRemove = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClear?.();
  };

  const handleExecuteSearch = () => {
    if (!selectedFile || loading) return;
    onSearchImage(selectedFile);
  };

  return (
    <div className="w-full flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      {!selectedFile ? (
        // Dropzone / File Picker
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 transition-all duration-300 flex flex-col items-center justify-center gap-3 group backdrop-blur-md ${
            dragActive
              ? 'border-[#00ffcc] bg-[#00ffcc]/10 shadow-[0_0_30px_rgba(0,255,204,0.25)]'
              : 'border-white/15 bg-white/5 hover:border-[#00ffcc]/50 hover:bg-white/8 hover:shadow-[0_0_24px_rgba(0,255,204,0.12)]'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 group-hover:text-[#00ffcc] group-hover:border-[#00ffcc]/40 group-hover:scale-110 transition-all duration-300">
            <UploadCloud size={28} />
          </div>

          <div className="text-center flex flex-col items-center gap-1">
            <p className="text-sm font-medium text-white group-hover:text-[#00ffcc] transition-colors">
              Click to upload or drag & drop suspect reference image
            </p>
            <p className="text-xs text-gray-400">
              Supports JPEG, PNG, WebP ?" CLIP generates a 512-D vector to match drone detections
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono mt-1">
            <Camera size={12} className="text-[#00ffcc]/70" />
            <span>FACIAL & APPAREL MULTI-MODAL MATCHING</span>
          </div>
        </div>
      ) : (
        // Selected Image & Search Bar Action
        <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl border border-[#00ffcc]/40 bg-white/5 backdrop-blur-md shadow-[0_0_24px_rgba(0,255,204,0.12)]">
          {/* Thumbnail preview */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border border-white/20 bg-black/40 flex-shrink-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Suspect Query Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon size={24} className="text-gray-500" />
              </div>
            )}
            <div className="absolute inset-0 border border-[#00ffcc]/30 pointer-events-none rounded-xl" />
          </div>

          {/* Details & action */}
          <div className="flex-1 flex flex-col justify-between w-full h-full gap-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-semibold text-[#00ffcc] uppercase tracking-wider flex items-center gap-1.5">
                  <Scan size={14} className="animate-pulse" /> Query Suspect Reference
                </span>
                <button
                  onClick={handleRemove}
                  className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Remove image"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm font-medium text-white truncate mt-1">
                {selectedFile.name}
              </p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                {(selectedFile.size / 1024).toFixed(1)} KB ?" Multi-modal Visual Query
              </p>
            </div>

            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <button
                onClick={handleExecuteSearch}
                disabled={loading}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-[#00ffcc] hover:bg-[#00ffcc]/90 text-black font-semibold text-xs px-5 py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(0,255,204,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>EXTRACTING EMBEDDING & SEARCHING...</span>
                  </>
                ) : (
                  <>
                    <Scan size={14} />
                    <span>SEARCH MATCHING PERSONS</span>
                  </>
                )}
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-2.5 rounded-xl transition-all"
              >
                Change Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
