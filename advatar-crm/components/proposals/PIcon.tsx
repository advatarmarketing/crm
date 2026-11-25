import type { IconName } from "@/lib/proposals/content";

/** Line icons for the proposal's visual tiles. */
const PATHS: Record<IconName, string> = {
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  light: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3",
  tripod: "M9 3h6v5H9zM12 8v5M12 13l-6 8M12 13l6 8M12 13v8",
  megaphone: "M3 10v4h4l7 4V6L7 10H3ZM17 8a5 5 0 0 1 0 8M7 14l1 6",
  chat: "M4 5h16v11H9l-5 4z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
  car: "M5 16l1.5-5h11L19 16M4 16h16v3H4zM7 19v2M17 19v2",
  phone: "M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM11 18h2",
  star: "M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 20a5 5 0 0 0-4-5",
  handshake: "M3 12l4-4 5 3 5-3 4 4M7 8l-4 4 6 6 3-2 3 2 6-6-4-4M9 14l2 2M12 12l2 2",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-5-5",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  check: "M5 12l5 5L20 7",
};

export function PIcon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.spark} />
    </svg>
  );
}
