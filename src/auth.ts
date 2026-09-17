// ---------------------------------------------------------------------------
// Auth (prototype) — sign-in / register / sign-out, stored in localStorage.
// No backend: demo credentials are seeded; registered accounts live in this
// browser only. The signed-in officer name flows into the app header and the
// decision audit trail.
// ---------------------------------------------------------------------------
export interface Officer {
  name: string;
  role: string;
}

interface StoredUser extends Officer {
  email: string;
  password: string;
}

const CURRENT_KEY = "rbc_current_user";
const USERS_KEY = "rbc_users";

const DEMO_USERS: StoredUser[] = [
  { name: "Admin User", email: "admin@railways.gov.in", password: "admin123", role: "Control Office" },
  { name: "Demo User", email: "demo@railways.gov.in", password: "demo123", role: "Divisional Engineer" },
];

function storedUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as StoredUser[];
  } catch {
    return [];
  }
}

export function currentUser(): Officer | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as Partial<Officer>;
    if (u && typeof u.name === "string" && u.name) {
      return { name: u.name, role: typeof u.role === "string" ? u.role : "Control Office" };
    }
  } catch {
    // fall through
  }
  return null;
}

export type AuthResult = { ok: true; officer: Officer } | { ok: false; error: string };

export function signIn(email: string, password: string): AuthResult {
  const e = email.trim().toLowerCase();
  const user = [...DEMO_USERS, ...storedUsers()].find(
    (u) => u.email.toLowerCase() === e && u.password === password
  );
  if (!user) {
    return { ok: false, error: "Invalid email or password. Use the demo access button above." };
  }
  const officer: Officer = { name: user.name, role: user.role };
  localStorage.setItem(CURRENT_KEY, JSON.stringify(officer));
  return { ok: true, officer };
}

export function register(name: string, email: string, password: string, role: string): AuthResult {
  const e = email.trim().toLowerCase();
  const n = name.trim();
  if (!n || !e || !password) return { ok: false, error: "All fields are required." };
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  if ([...DEMO_USERS, ...storedUsers()].some((u) => u.email.toLowerCase() === e)) {
    return { ok: false, error: "An account with this email already exists — sign in instead." };
  }
  const users = storedUsers();
  users.push({ name: n, email: e, password, role });
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  const officer: Officer = { name: n, role };
  localStorage.setItem(CURRENT_KEY, JSON.stringify(officer));
  return { ok: true, officer };
}

export function signOut(): void {
  try {
    localStorage.removeItem(CURRENT_KEY);
  } catch {
    // ignore
  }
}