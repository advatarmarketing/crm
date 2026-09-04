"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordUploadedDocument } from "@/app/app/clients/[id]/actions";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Uploads a file straight from the browser into the private
 * `client-documents` bucket, then asks the server to file it in the
 * `documents` table.
 *
 * The bytes go browser -> Storage directly rather than through a
 * server action: a server action posts the whole file as part of the
 * request body, which on a large PDF is slow and runs into request
 * size limits for no benefit. The upload runs under the user's own
 * session, so the bucket's policies
 * (0012_documents_fathom_activity.sql) decide whether it's allowed.
 *
 * The path is always `<client_id>/<uuid>-<filename>`, because those
 * policies read the client id back out of the first path segment to
 * work out who is allowed to touch the file.
 */
export function DocumentUpload({ clientId }: { clientId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(file: File) {
    setError(null);

    if (file.size > MAX_BYTES) {
      setError("That file is over 25 MB. Try compressing it or sharing a link instead.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();

      // Strip anything that would make a messy object key, but keep
      // the extension so the browser knows what it's downloading.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
      const path = `${clientId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const result = await recordUploadedDocument({
        clientId,
        storagePath: path,
        name: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
      });

      if (result.error) {
        // The file landed but the row didn't — clean up rather than
        // leaving an orphan nobody can see or delete from the UI.
        await supabase.storage.from("client-documents").remove([path]);
        setError(result.error);
        return;
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button type="button" className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : "+ Upload document"}
      </button>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", margin: "8px 0 0" }}>
        Briefs, contracts, brand guidelines — up to 25 MB. Only your team and this client can open them.
      </p>
      {error && (
        <p style={{ color: "var(--status-closed)", fontSize: 13, margin: "8px 0 0" }}>{error}</p>
      )}
    </div>
  );
}
