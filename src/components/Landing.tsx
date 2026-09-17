// ---------------------------------------------------------------------------
// LANDING + AUTH — shown while no officer is signed in. Sign-in flows straight
// into the planning app; sign-out returns here. One design system throughout.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { signIn, register, type Officer } from "../auth";

type Mode = "landing" | "login" | "register";

interface LandingProps {
  onSignedIn: (o: Officer) => void;
}

const inputCls =
  "focus-primary w-full rounded-[10px] border border-[#e3e6f0] bg-white px-3 py-2.5 text-[13px] font-medium text-[#171a30] outline-none transition-colors duration-200 placeholder:text-[#a2a7ba]";
const labelCls = "mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-[#878da1]";

function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#2e3092" />
      <path d="M8 21L16 9L24 21" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 21.5H24.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="21.5" r="1.6" fill="#fff" />
      <circle cx="20" cy="21.5" r="1.6" fill="#fff" />
    </svg>
  );
}

function AuthCard({
  mode,
  onSwitch,
  onSignedIn,
}: {
  mode: "login" | "register";
  onSwitch: (m: Mode) => void;
  onSignedIn: (o: Officer) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Control Office");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = mode === "login" ? signIn(email, password) : register(name, email, password, role);
    if (result.ok) onSignedIn(result.officer);
    else setError(result.error);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-4 py-10">
      <div className="w-full max-w-[400px] rounded-2xl border border-[#e3e6f0] bg-white p-7 shadow-[0_8px_30px_rgba(23,26,48,0.10)]">
        {mode === "login" && (
          <div className="mb-4 flex justify-center">
            <Logo />
          </div>
        )}
        <h2 className="text-center text-xl font-extrabold text-[#171a30]">
          {mode === "login" ? "Railway Operations" : "Create account"}
        </h2>
        <p className="mb-5 mt-1 text-center text-[13px] text-[#878da1]">
          {mode === "login" ? "Sign in to the block planning control room" : "Prototype only — credentials stay in this browser"}
        </p>

        {mode === "login" && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#2e3092]/40 bg-[#eef0fa] px-4 py-2.5">
            <div>
              <div className="text-[10px] font-extrabold tracking-wider text-[#2e3092]">QUICK DEMO ACCESS</div>
              <div className="font-mono text-[11px] text-[#4d5468]">admin@railways.gov.in · admin123</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEmail("admin@railways.gov.in");
                setPassword("admin123");
                setError("");
              }}
              className="focus-primary rounded-lg bg-[#2e3092] px-3 py-1.5 text-[11px] font-bold text-white transition-colors duration-200 hover:bg-[#24266f]"
            >
              Fill demo
            </button>
          </div>
        )}

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <div className="mb-3.5">
                <label className={labelCls}>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Full name" required />
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                  <option>Control Office</option>
                  <option>Divisional Engineer</option>
                  <option>Section Engineer</option>
                  <option>Traffic Planning Cell</option>
                </select>
              </div>
            </>
          )}
          <div className="mb-3.5">
            <label className={labelCls}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@railways.gov.in" required />
          </div>
          <div className="mb-3.5">
            <label className={labelCls}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder={mode === "login" ? "Enter password" : "Min 6 characters"}
              required
              minLength={mode === "register" ? 6 : undefined}
            />
          </div>
          {error && (
            <div className="mb-3.5 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2.5 text-xs font-semibold text-[#991b1b]">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="focus-primary w-full rounded-xl bg-[#2e3092] py-2.5 text-[13px] font-bold text-white transition-colors duration-200 hover:bg-[#24266f]"
          >
            {mode === "login" ? "Sign in & launch control room →" : "Register"}
          </button>

          <div className="mt-5 flex items-center justify-between text-[13px]">
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => onSwitch("landing")} className="focus-primary font-semibold text-[#2e3092] hover:underline">
                  ← Back to home
                </button>
                <button type="button" onClick={() => onSwitch("register")} className="focus-primary font-semibold text-[#2e3092] hover:underline">
                  Create account →
                </button>
              </>
            ) : (
              <button type="button" onClick={() => onSwitch("login")} className="focus-primary font-semibold text-[#2e3092] hover:underline">
                ← Back to sign in
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Landing({ onSignedIn }: LandingProps) {
  const [mode, setMode] = useState<Mode>("landing");
  if (mode === "login" || mode === "register") {
    return <AuthCard mode={mode} onSwitch={setMode} onSignedIn={onSignedIn} />;
  }

  return (
    <div className="min-h-screen bg-white text-[#171a30]">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-[#e3e6f0] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center gap-6 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div>
              <div className="text-xs font-extrabold tracking-wider">BLOCK PLANNING</div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#878da1]">Maintenance Coordination</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-5 text-[13px] font-semibold text-[#4d5468]">
            <a href="#workflow" className="hover:text-[#2e3092]">How it works</a>
            <a href="#principles" className="hover:text-[#2e3092]">Principles</a>
            <button
              onClick={() => setMode("login")}
              className="focus-primary rounded-lg bg-[#2e3092] px-4 py-2 text-xs font-bold text-white transition-colors duration-200 hover:bg-[#24266f]"
            >
              Sign in
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="bg-gradient-to-b from-white to-[#f6f7fb] px-6 py-16">
        <div className="mx-auto grid max-w-[1120px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <div>
            <span className="inline-flex items-center rounded-full border border-[#e3e6f0] bg-[#f6f7fb] px-3 py-1.5 text-[11px] font-bold text-[#4d5468]">
              Frontend prototype · synthetic data · simulated outputs
            </span>
            <h1 className="mt-5 text-[clamp(34px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight">
              Plan every block.
              <br />
              <span className="text-[#2e3092]">Protect every window.</span>
            </h1>
            <p className="mt-4 max-w-[54ch] text-base leading-relaxed text-[#4d5468]">
              Maintenance requests arrive from multiple railway systems. The workspace unifies them, finds compatible
              work and fits it into real traffic windows — always leaving the final decision to the railway officer.
            </p>
            <button
              onClick={() => setMode("login")}
              className="focus-primary mt-6 inline-flex items-center gap-2 rounded-xl bg-[#2e3092] px-6 py-3 text-sm font-bold text-white transition-colors duration-200 hover:bg-[#24266f]"
            >
              Enter the prototype <ArrowRight size={15} />
            </button>
          </div>
          {/* Schematic preview panel */}
          <div className="rounded-2xl border border-[#e3e6f0] bg-white p-4 shadow-[0_8px_30px_rgba(23,26,48,0.10)]">
            <div className="flex items-center gap-2 border-b border-[#eef0f6] pb-3">
              <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
              <span className="text-[10px] font-extrabold tracking-[0.12em] text-[#171a30]">TONIGHT · NDLS–BSB TRUNK</span>
              <span className="ml-auto font-mono text-[11px] text-[#878da1]">22:00 → 08:00</span>
            </div>
            {(
              [
                {
                  label: "NDLS–GZB UP",
                  bars: [
                    { cls: "border border-dashed border-[#2e3092]/70 bg-[#eef0fa] text-[#2e3092]", left: "15%", width: "30%", text: "W1 · 3 jobs" },
                    { cls: "border border-[#16a34a]/60 bg-[#16a34a]/15 text-[#166534]", left: "4%", width: "11%", text: "12951" },
                    { cls: "border border-[#16a34a]/60 bg-[#16a34a]/15 text-[#166534]", left: "9%", width: "11%", text: "12313" },
                    { cls: "bg-[#2e3092] text-white", left: "20%", width: "22%", text: "J-02 weld" },
                  ],
                },
                {
                  label: "TDL–CNB DOWN",
                  bars: [
                    { cls: "border border-dashed border-[#2e3092]/70 bg-[#eef0fa] text-[#2e3092]", left: "14%", width: "40%", text: "W2 · 1 job" },
                    { cls: "border border-[#64748b]/60 bg-[#94a3b8]/30 text-[#4d5468]", left: "6%", width: "37%", text: "BLK-0417" },
                    { cls: "bg-[#2e3092] text-white", left: "19%", width: "38%", text: "J-04 BCM" },
                  ],
                },
                {
                  label: "PRYJ–DDU UP",
                  bars: [
                    { cls: "border border-dashed border-[#2e3092]/70 bg-[#eef0fa] text-[#2e3092]", left: "14%", width: "47%", text: "W3 · 2 jobs" },
                    { cls: "bg-[#dc2626] text-white", left: "32%", width: "16%", text: "CONCOR" },
                    { cls: "bg-[#2e3092] text-white", left: "19%", width: "16%", text: "J-05" },
                    { cls: "bg-[#2e3092] text-white", left: "37%", width: "28%", text: "J-07" },
                  ],
                },
              ] as const
            ).map((lane) => (
              <div key={lane.label} className="flex items-center gap-2.5 border-b border-dashed border-[#eef0f6] py-2.5 last:border-0">
                <div className="w-24 shrink-0 text-right text-[10px] font-bold text-[#4d5468]">{lane.label}</div>
                <div className="relative h-11 flex-1 overflow-hidden rounded-[10px] border border-[#e3e6f0] bg-[#fafbfd]">
                  {lane.bars.map((b) => (
                    <span
                      key={b.text + b.left}
                      className={`absolute top-1/2 h-[18px] -translate-y-1/2 overflow-hidden whitespace-nowrap rounded px-1 font-mono text-[9px] font-bold leading-[18px] ${b.cls}`}
                      style={{ left: b.left, width: b.width }}
                    >
                      {b.text}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex justify-center gap-2 border-t border-[#eef0f6] pt-3 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
              <span>Tier 0–4 rulebook</span>
              <span>·</span>
              <span>Human approval required</span>
            </div>
          </div>
        </div>
      </header>

      {/* Workflow */}
      <section id="workflow" className="px-6 py-16">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#2e3092]">How it works</div>
          <h2 className="mb-9 text-[clamp(24px,3vw,32px)] font-extrabold tracking-tight">One workflow, four steps</h2>
          <div className="flex flex-wrap items-stretch gap-3">
            {(
              [
                ["1", "Observe", "Critical work, available windows and traffic alerts in one command view."],
                ["2", "Plan", "Compatible jobs consolidated into possessions that respect the tier rulebook."],
                ["3", "Simulate", "Reserve a path or change a window — see exactly what moves, and why."],
                ["4", "Approve", "The officer authorizes, modifies or rejects. Every decision is audited."],
              ] as const
            ).map(([n, title, desc], i) => (
              <div key={title} className="flex flex-1 items-center gap-3 min-w-[280px]">
                <div className="flex-1 rounded-2xl border border-[#e3e6f0] bg-white p-5">
                  <div className="mb-3 grid h-7 w-7 place-items-center rounded-lg bg-[#2e3092] text-[13px] font-extrabold text-white">{n}</div>
                  <div className="mb-1.5 text-[15px] font-extrabold">{title}</div>
                  <p className="m-0 text-[13px] leading-relaxed text-[#4d5468]">{desc}</p>
                </div>
                {i < 3 && <div className="text-lg font-bold text-[#878da1]">→</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section id="principles" className="border-y border-[#eef0f6] bg-[#f6f7fb] px-6 py-16">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#2e3092]">Platform</div>
          <h2 className="mb-9 text-[clamp(24px,3vw,32px)] font-extrabold tracking-tight">Built around real railway constraints</h2>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Unified maintenance queue", "TMS · SMMS · TDMS · BDMS feeds merged into one Tier 0–4 priority rulebook — no opaque scores."],
                ["Compatibility rulebook", "Work is combined by method, isolation and resources — never by corridor proximity alone."],
                ["Real traffic windows", "Passenger, freight and special movements shape every possession on the 22:00–08:00 horizon."],
                ["Officer authority", "Simulations and drafts are advisory only. Approval, modification and rejection are human decisions."],
              ] as const
            ).map(([title, desc]) => (
              <div key={title} className="rounded-2xl border border-[#e3e6f0] bg-white p-5">
                <div className="mb-1.5 flex items-center gap-2 text-sm font-extrabold">
                  <ShieldCheck size={15} className="text-[#2e3092]" />
                  {title}
                </div>
                <p className="m-0 text-[13px] leading-relaxed text-[#4d5468]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e3e6f0] bg-white px-6 py-5">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 text-xs text-[#878da1]">
          <span>Railway Block Planning & Maintenance Coordination — prototype</span>
          <span className="font-mono">No backend · no live data · simulated feeds</span>
        </div>
      </footer>
    </div>
  );
}

export default Landing;