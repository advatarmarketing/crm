/**
 * The five sections of a client's Files (0048, client_assets.section).
 *
 * Kept in one place so the client's grid, the client's tab bar and
 * the team's upload form all agree on names and order.
 *
 * `clientCanAdd` mirrors the database policy: a client can hand over
 * their own logos and footage, but invoices, proposals and contracts
 * only ever come from us.
 */
export type FileSection = "assets" | "raw_footage" | "invoices" | "proposals" | "contracts";

export const FILE_SECTIONS: {
  id: FileSection;
  label: string;
  blurb: string;
  clientCanAdd: boolean;
  /** SVG path data, drawn on a 24px grid with a 1.6 stroke. */
  icon: string;
}[] = [
  {
    id: "assets",
    label: "Assets",
    blurb: "Logos, brand images, references and anything else we use to make your content.",
    clientCanAdd: true,
    icon: "M4 5h16v14H4z M4 15l4.5-4.5 4 4 2.5-2.5 5 5 M15.5 9.5a1.5 1.5 0 1 0 0-.01",
  },
  {
    id: "raw_footage",
    label: "Raw Footage",
    blurb: "Unedited clips from shoots, and any footage you send over.",
    clientCanAdd: true,
    icon: "M3 6h13v12H3z M16 10l5-3v10l-5-3",
  },
  {
    id: "invoices",
    label: "Invoices",
    blurb: "Copies of your invoices.",
    clientCanAdd: false,
    icon: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3",
  },
  {
    id: "proposals",
    label: "Proposals",
    blurb: "Proposals and plans we have put together for you.",
    clientCanAdd: false,
    icon: "M5 3h10l4 4v14H5z M15 3v4h4 M8.5 12l2.5 2.5 4.5-4.5",
  },
  {
    id: "contracts",
    label: "Contracts",
    blurb: "Signed agreements between us.",
    clientCanAdd: false,
    icon: "M5 3h10l4 4v14H5z M15 3v4h4 M8 17c1.5-2 2.5-2 3 0s1.5 1 2.5-.5 M8.5 10h7",
  },
];

export const FILE_SECTION_IDS = FILE_SECTIONS.map((s) => s.id);

export function isFileSection(v: unknown): v is FileSection {
  return typeof v === "string" && (FILE_SECTION_IDS as string[]).includes(v);
}

export function sectionLabel(id: FileSection | null | undefined): string {
  return FILE_SECTIONS.find((s) => s.id === id)?.label ?? "Assets";
}
