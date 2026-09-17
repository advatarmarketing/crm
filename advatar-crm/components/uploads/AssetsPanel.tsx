"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AssetEntry } from "@/lib/uploads";
import type { ClientChoice } from "@/components/SchedulePanel";
import { EmptyState } from "@/components/EmptyState";
import { field, subheading, meta, errorText, safeObjectName, formatBytes } from "./styles";

// The bucket enforces this too (0028). Checked here as well so the
// person gets a sentence instead of a 413.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Raw footage and reference material — the Uploads tab's second
 * sub-tab.
 *
 * Two shapes, one list, because they are the same thing to whoever is
 * looking for them ("what is this video made from?"):
 *
 *   a link — Drive, Dropbox, WeTransfer. How rushes actually travel.
 *            Nobody is putting 80 GB of footage through a browser
 *            upload, and pretending otherwise would just produce a
 *            feature that fails at the moment it matters.
 *   a file — an image or small document, capped at 10 MB by the
 *            bucket itself. Location photos, framing references, a
 *            logo, a product shot.
 *
 * Everything is attached to a client, and optionally to one video.
 * Whoever is on that client sees it: CEO, the operations manager
 * running it, assigned staff, the videographer shooting it. The
 * client sees what is marked shared — and can add their own material,
 * which is how their footage and logos reach the team without an
 * email thread.
 */
export function AssetsPanel({
  assets,
  clients,
  currentUserId,
  isClient,
  fixedClientId = null,
  canShare,
  problem,
}: {
  assets: AssetEntry[];
  clients: ClientChoice[];
  currentUserId: string;
  isClient: boolean;
  fixedClientId?: string | null;
  /** Whether this viewer chooses who sees it. A client's is always shared. */
  canShare: boolean;
  problem: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(fixedClientId ?? (clients.length === 1 ? clients[0].id : ""));
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [shared, setShared] = useState(isClient);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();
  const router = useRouter();

  const visible = filter ? assets.filter((a) => a.client_id === filter) : assets;

  function resolveClient(): string | null {
    const chosen = fixedClientId ?? clientId;
    return chosen || null;
  }

  async function addLink() {
    const name = title.trim();
    const link = url.trim();
    const forClient = resolveClient();

    if (!name) return setError("Give it a name, so people know what they're opening.");
    if (!forClient) return setError("Pick which client this belongs to.");
    if (!link) return setError("Paste the link.");
    if (!/^https?:\/\//i.test(link)) return setError("The link should start with http:// or https://");

    setBusy(true);
    setError(null);

    const { error: insertError } = await supabase.from("client_assets").insert({
      client_id: forClient,
      kind: "link",
      title: name,
      url: link,
      notes: notes.trim() || null,
      visibility: isClient || shared ? "team_and_client" : "team",
      uploaded_by: currentUserId,
    });

    setBusy(false);
    if (insertError) return setError(insertError.message);

    reset();
    router.refresh();
  }

  /**
   * Bytes go browser -> Storage directly, then a row is written. A
   * server action would carry the whole file in the request body for
   * no benefit, and runs into request size limits on exactly the
   * files people care about.
   *
   * If the row fails, the object is removed again rather than left as
   * something nobody can see or delete from the UI.
   */
  async function uploadFile(file: File) {
    const forClient = resolveClient();

    if (!forClient) return setError("Pick which client this belongs to first.");

    if (file.size > MAX_FILE_BYTES) {
      return setError(
        `That file is ${formatBytes(file.size)} — the limit is 10 MB. For footage, share a Drive or Dropbox link instead.`
      );
    }

    setBusy(true);
    setError(null);

    try {
      // First path segment is the client id, the convention every
      // bucket's policies read (storage_path_client_id, 0016).
      const path = `${forClient}/${crypto.randomUUID()}-${safeObjectName(file.name)}`;
      const contentType = file.type || "application/octet-stream";

      const { error: uploadError } = await supabase.storage
        .from("upload-assets")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const { error: insertError } = await supabase.from("client_assets").insert({
        client_id: forClient,
        kind: "file",
        title: title.trim() || file.name,
        storage_path: path,
        mime_type: contentType,
        size_bytes: file.size,
        notes: notes.trim() || null,
        visibility: isClient || shared ? "team_and_client" : "team",
        uploaded_by: currentUserId,
      });

      if (insertError) {
        await supabase.storage.from("upload-assets").remove([path]);
        setError(insertError.message);
        return;
      }

      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(asset: AssetEntry) {
    setError(null);

    const { error: deleteError } = await supabase.from("client_assets").delete().eq("id", asset.id);
    if (deleteError) return setError(deleteError.message);

    if (asset.storage_path) {
      try {
        await supabase.storage.from("upload-assets").remove([asset.storage_path]);
      } catch {
        // The row is gone, which is what the list reads. A stray
        // object is untidy, not broken.
      }
    }

    router.refresh();
  }

  function reset() {
    setTitle("");
    setUrl("");
    setNotes("");
    setShared(isClient);
    setAdding(false);
    if (!fixedClientId && clients.length !== 1) setClientId("");
  }

  if (problem) {
    return (
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--danger-fg)",
          background: "var(--danger-bg)",
          border: "1px solid var(--danger-border)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 14px",
          lineHeight: 1.55,
        }}
      >
        The footage and assets list couldn&rsquo;t be loaded.
        <span style={{ display: "block", ...meta, marginTop: 6 }}>{problem}</span>
      </p>
    );
  }

  return (
    <div>
      {/* Only worth offering when there is more than one client to
          narrow to — on a videographer with two clients a filter is
          furniture. */}
      {!fixedClientId && clients.length > 2 && assets.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Show one client's material"
            style={{ ...field, maxWidth: 260 }}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body={
            isClient
              ? "Anything your team shares with you — references, stills, footage links — appears here. You can add your own too."
              : "Raw footage links, location photos, logos and references live here, attached to the client they belong to."
          }
          compact
        />
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((asset) => {
            const href = asset.kind === "link" ? asset.url : asset.fileUrl;
            const isImage = (asset.mime_type ?? "").startsWith("image/");
            const mine = asset.uploaded_by === currentUserId;

            return (
              <li
                key={asset.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "11px 13px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {isImage && asset.fileUrl && (
                  <a href={asset.fileUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                    {/* Signed and short-lived, so next/image has
                        nothing to cache — see FeedbackThread. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.fileUrl}
                      alt={asset.title}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                      }}
                    />
                  </a>
                )}

                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 600, color: "var(--text-1)" }}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-1)" }}>
                        {asset.title} ↗
                      </a>
                    ) : (
                      asset.title
                    )}
                  </span>

                  {asset.notes && (
                    <span
                      style={{
                        display: "block",
                        fontFamily: "var(--font-body)",
                        fontSize: 12.5,
                        color: "var(--text-2)",
                        marginTop: 3,
                        lineHeight: 1.5,
                      }}
                    >
                      {asset.notes}
                    </span>
                  )}

                  <span style={{ ...meta, display: "block", marginTop: 4 }}>
                    {[
                      asset.kind === "link" ? "link" : formatBytes(asset.size_bytes) ?? "file",
                      !isClient ? asset.clientName : null,
                      !isClient && asset.visibility === "team_and_client" ? "shared with client" : null,
                      asset.uploaderName,
                      new Date(asset.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>

                {/* A client may only remove their own; the team may
                    remove anything on a client they're on. Both are
                    enforced by policy — this only decides what to
                    offer. */}
                {(!isClient || mine) && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => remove(asset)}
                    style={{ flexShrink: 0 }}
                    aria-label={`Remove ${asset.title}`}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p style={errorText}>{error}</p>}

      {adding ? (
        <div
          style={{
            marginTop: 12,
            padding: "14px 16px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is it? e.g. Shoot day 1 — rushes"
              style={{ ...field, flex: "2 1 220px" }}
            />
            {!fixedClientId && (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                aria-label="Which client is this for?"
                style={{ ...field, flex: "1 1 160px" }}
              >
                <option value="">Which client?</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Drive / Dropbox / WeTransfer link"
            style={{ ...field, width: "100%", marginBottom: 10 }}
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything worth saying about it (optional)"
            style={{ ...field, width: "100%", resize: "vertical", marginBottom: 10 }}
          />

          {canShare && !isClient && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
                style={{ accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-1)" }}>
                Let the client see this
              </span>
            </label>
          )}

          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
            }}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={addLink} disabled={busy} className="btn btn-primary">
              {busy ? "Saving…" : "Add link"}
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn">
              {busy ? "Uploading…" : "Upload a file instead"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setError(null);
              }}
              className="btn"
            >
              Cancel
            </button>
          </div>

          <p style={{ ...meta, margin: "10px 0 0", lineHeight: 1.5 }}>
            Files are capped at 10 MB, so they&rsquo;re for images and small documents. Footage
            goes in as a link — that&rsquo;s how rushes travel anyway.
          </p>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn" style={{ marginTop: 12 }}>
          + Add footage or a file
        </button>
      )}
    </div>
  );
}
