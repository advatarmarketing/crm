"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/names";

const SIZE = 200;

export interface EditableProfile {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  email?: string | null;
}

/**
 * Name, phone and photo for one person.
 *
 * Used in two places with the same code: someone editing their own
 * profile, and management editing somebody else's from their detail
 * page. Which of those it is doesn't change what this renders — RLS
 * decides whether the write lands ("profiles: update own" from 0001,
 * "profiles: management update any" from 0022), so a videographer
 * opening this on a teammate would simply have their save refused.
 *
 * The name field is required and refuses to save empty: profiles
 * .full_name is NOT NULL with a no-blanks check (0022), so an empty
 * save would be rejected by the database anyway — catching it here
 * gives a readable message instead of a constraint error.
 */
export function ProfilePanel({
  profile,
  canEdit = true,
}: {
  profile: EditableProfile;
  canEdit?: boolean;
}) {
  const [name, setName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();

  const dirty =
    name.trim() !== (profile.full_name ?? "").trim() || phone.trim() !== (profile.phone ?? "").trim();

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
          if (!ctx) return reject(new Error("Canvas not supported"));
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
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
      setAvatarUrl(URL.createObjectURL(blob)); // optimistic preview

      // `<id>.jpg` is what the storage policy parses to decide whose
      // photo this is (0022), so the filename is not cosmetic.
      const path = `${profile.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("profile-avatars").getPublicUrl(path);

      // Cache-bust: the path never changes, so without this the old
      // photo stays on screen everywhere until a hard refresh.
      const busted = `${publicUrl}?v=${Date.now()}`;

      const { error: saveError } = await supabase
        .from("profiles")
        .update({ avatar_url: busted })
        .eq("id", profile.id);

      if (saveError) throw saveError;

      setAvatarUrl(busted);
      router.refresh();
    } catch (e) {
      setAvatarUrl(profile.avatar_url); // revert
      setError(e instanceof Error ? e.message : "Could not upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function saveFields() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A name is required — it's what everyone sees you as across the app.");
      return;
    }

    setBusy(true);
    setError(null);
    setSaved(false);

    const { error: saveError } = await supabase
      .from("profiles")
      .update({ full_name: trimmed, phone: phone.trim() || null })
      .eq("id", profile.id);

    setBusy(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
    router.refresh();
  }

  return (
    <div className="card card-pad" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: "50%",
            border: "1px solid var(--border)",
            background: avatarUrl ? `center/cover no-repeat url(${avatarUrl})` : "var(--surface-3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: 30,
            color: "var(--text-2)",
            flexShrink: 0,
          }}
        >
          {!avatarUrl && initials(profile.full_name)}
        </div>

        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? "…" : avatarUrl ? "Change" : "Add photo"}
            </button>
          </>
        )}
      </div>

      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={labelStyle}>Full name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            required
            placeholder="Jordan Smith"
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={labelStyle}>Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!canEdit}
            type="tel"
            placeholder="07700 900123"
            style={fieldStyle}
          />
        </label>

        {profile.email && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", margin: "0 0 16px" }}>
            {profile.email} · {profile.role.replace(/_/g, " ")}
          </p>
        )}

        {error && <p style={{ color: "var(--danger-fg)", fontSize: 12.5, margin: "0 0 12px" }}>{error}</p>}

        {canEdit && (
          <button
            type="button"
            onClick={saveFields}
            disabled={busy || !dirty || !name.trim()}
            className="btn btn-accent"
          >
            {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save changes"}
          </button>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-2)",
  marginBottom: 6,
};

const fieldStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
};
