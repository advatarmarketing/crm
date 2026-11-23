import Link from "next/link";

/** The Advatar mark, light or dark to suit the theme. */
export function AdvatarMark({ height = 18 }: { height?: number }) {
  return (
    <span className="you-mark" aria-hidden>
      <img className="logo-for-light" src="/logo-mark-light.png" alt="" width={111} height={132} style={{ height, width: "auto" }} />
      <img className="logo-for-dark" src="/logo-mark-dark.png" alt="" width={111} height={132} style={{ height, width: "auto" }} />
    </span>
  );
}

/** "YOU", next to the Clients title: your own content. */
export function YouButton({ href }: { href: string }) {
  return (
    <Link href={href} className="you-btn" title="Your own content: your personal brand and the business">
      <AdvatarMark />
      <span>YOU</span>
    </Link>
  );
}
