import cn from "cnfast";
import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";

import { Button } from "#/components/ui/Button";

export const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/gif": [".gif"],
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function ImagePicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: IMAGE_ACCEPT,
    maxSize: MAX_IMAGE_BYTES,
    multiple: false,
    onDropAccepted: (files) => {
      setRejectionError(null);
      onChange(files[0] ?? null);
    },
    onDropRejected: (rejections) => {
      const code = rejections[0]?.errors[0]?.code;
      setRejectionError(
        code === "file-too-large"
          ? "La imagen no puede superar 5 MB."
          : "Formato no soportado. Usa JPG, PNG, WebP, AVIF o GIF.",
      );
    },
  });

  const previewUrl = file ? URL.createObjectURL(file) : null;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-sea-ink">Imagen (opcional)</span>
      <div
        {...getRootProps({
          className: cn(
            "flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition",
            isDragActive
              ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20"
              : "border-chip-line hover:border-orange-300",
          ),
        })}
      >
        <input {...getInputProps()} />
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Vista previa"
            className="mx-auto max-h-40 max-w-full rounded-lg object-contain"
          />
        ) : (
          <p className="text-sm text-sea-ink-soft">
            {isDragActive
              ? "Suelta la imagen aquí…"
              : "Arrastra una imagen o haz clic para elegirla"}
          </p>
        )}
      </div>
      {file && (
        <div className="mt-1 flex items-center gap-2">
          <span className="max-w-60 truncate text-xs text-sea-ink-soft">{file.name}</span>
          <Button
            variant="danger-ghost"
            size="sm"
            onClick={() => onChange(null)}
            aria-label="Quitar imagen"
          >
            ✕
          </Button>
        </div>
      )}
      {rejectionError && <p className="mt-1 text-xs text-red-500">{rejectionError}</p>}
    </div>
  );
}
