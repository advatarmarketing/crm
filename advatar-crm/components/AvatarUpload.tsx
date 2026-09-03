"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SIZE = 160;

/**
 * Resizes the picked image to a 160x160 JPEG on a canvas (same
 * approach as the original single-file portal's avatar cropper),
 * uploads it to the public `client-avatars` Storage bucket, and
 * writes the resulting public URL onto clients.avatar_url. Optimistic:
 * the new image shows immediately from the local canvas output while
 * the upload + DB write happen in the background.
 */
export function AvatarUpload({
  clientId,
  initialUrl,
  name,
}: {
  clientId: string;
  initialUrl: string | null;
  name: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  function resizeToSquareJpeg(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas not supported"));
            return;
          }
          // center-crop to a square, then draw at 160x160
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
            "image/jpeg",
            0.85
          );
        };
        img.onerror = () => reject(new Error("Could not read image"));
        img.src = String(e.target?.result);
      };
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await resizeToSquareJpeg(file);
      const localPreview = URL.createObjectURL(blob);
      setUrl(localPreview); // optimistic preview

      const path = `${clientId}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("client-avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("client-avatars").getPublicUrl(path);

      // cache-bust so the freshly uploaded image doesn't get served
      // stale from the CDN/browser cache under the same path
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("clients")
        .update({ avatar_url: bustedUrl })
        .eq("id", clientId);

      if (updateError) throw updateError;

      setUrl(bustedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUrl(initialUrl); // revert
    } finally {
      setBusy(false);
    }
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Upload avatar"
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          border: "1px solid var(--border)",
          background: url ? `center/cover no-repeat url(${url})` : "var(--surface-3)",
          color: "var(--text-2)",
          fontFamily: "var(--font-display)",
          fontSize: 24,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
          padding: 0,
        }}
      >
        {!url && initial}
      </button>
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            background: "none",
            border: "none",
            color: "var(--text-2)",
            cursor: busy ? "default" : "pointer",
            textDecoration: "underline",
            padding: 0,
          }}
        >
          {busy ? "Uploading…" : "Change photo"}
        </button>
        {error && (
          <span style={{ display: "block", fontSize: 11, color: "var(--status-closed)", marginTop: 4 }}>
            {error}
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
