/**
 * The Advatar logo, in the right variant for the current theme and
 * screen size.
 *
 * All four source files are flat-backed images, not transparent
 * cut-outs -- deliberately so, per the brief: keying the grey backdrop
 * out of a metallic wordmark leaves a visible fringe around every
 * letter. Instead each file's backdrop was recoloured to exactly the
 * nav's surface colour in its own theme (#ffffff light, #181818 dark),
 * so it disappears into the bar. The consequence is that the light
 * file only looks right in light mode and vice versa, which is why all
 * four are rendered and CSS decides which one is visible rather than
 * swapping `src` in JavaScript -- that would flicker on load and
 * mismatch between server and client render.
 */
export function Logo({
  height = 26,
  variant = "responsive",
}: {
  height?: number;
  /**
   * "responsive" swaps to the mini mark on narrow screens, which is
   * what the nav needs. "full" always shows the wordmark -- used on
   * the login screen, where there is room for it at any width and the
   * full name does more work than an initial.
   */
  variant?: "responsive" | "full";
} = {}) {
  const fullClass = variant === "full" ? "" : "logo-full";
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
      aria-label="Advatar Marketing"
      role="img"
    >
      <span className={fullClass}>
        <img
          className="logo-for-light"
          src="/logo-light.png"
          alt=""
          width={387}
          height={132}
          style={{ height, width: "auto" }}
        />
        <img
          className="logo-for-dark"
          src="/logo-dark.png"
          alt=""
          width={413}
          height={132}
          style={{ height, width: "auto" }}
        />
      </span>

      {variant === "responsive" && (
      <span className="logo-mark">
        <img
          className="logo-for-light"
          src="/logo-mark-light.png"
          alt=""
          width={111}
          height={132}
          style={{ height: Math.round(height * 1.08), width: "auto" }}
        />
        <img
          className="logo-for-dark"
          src="/logo-mark-dark.png"
          alt=""
          width={111}
          height={132}
          style={{ height: Math.round(height * 1.08), width: "auto" }}
        />
      </span>
      )}
    </span>
  );
}
