/**
 * What a staff member may see (0044), chosen by the CEO.
 *
 * The database is the real boundary: staff_can() inside the row level
 * security policies decides what comes back. This only decides which
 * tabs and sections to show, so nobody is offered a page that will
 * always be empty for them.
 */

export type AccessArea = "contracts" | "logins" | "money";

export interface TeamAccess {
  contracts: boolean;
  logins: boolean;
  money: boolean;
}

export const ACCESS_AREAS: { key: AccessArea; label: string; detail: string }[] = [
  { key: "contracts", label: "Contracts", detail: "Client documents and signed agreements" },
  { key: "logins", label: "Logins", detail: "The client's saved social media passwords" },
  { key: "money", label: "Money", detail: "Invoices and whether the client is up to date (read-only)" },
];

/** What a staff member has before the CEO changes anything. Matches staff_can() in 0044. */
export const STAFF_DEFAULT: TeamAccess = { contracts: true, logins: true, money: false };

const NONE: TeamAccess = { contracts: false, logins: false, money: false };
const ALL: TeamAccess = { contracts: true, logins: true, money: true };

/** Videographers' fixed access (0039, 0043): none of the three. */
export function accessForRole(role: string | null | undefined, row: Partial<TeamAccess> | null): TeamAccess {
  if (role === "ceo" || role === "operations_manager") return ALL;
  if (role !== "staff") return NONE;
  if (!row) return STAFF_DEFAULT;
  return {
    contracts: row.contracts ?? STAFF_DEFAULT.contracts,
    logins: row.logins ?? STAFF_DEFAULT.logins,
    money: row.money ?? STAFF_DEFAULT.money,
  };
}

/**
 * The signed-in person's access. Never throws: before 0044 is run the
 * table does not exist and staff keep what they had.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadMyAccess(supabase: any, userId: string, role: string | null | undefined): Promise<TeamAccess> {
  if (role !== "staff") return accessForRole(role, null);
  const { data, error } = await supabase
    .from("team_access")
    .select("contracts, logins, money")
    .eq("profile_id", userId)
    .maybeSingle();
  return accessForRole(role, error ? null : (data as TeamAccess | null));
}
