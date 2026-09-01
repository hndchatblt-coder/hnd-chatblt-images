/**
 * The portrait HUD (§11.5): chrome top and bottom, shop in the middle.
 *
 * Labour% and COGS% are the two numbers a real operator watches, so they are the two the player
 * watches — promoted out of the drawer whenever either crosses a threshold, along with balk rate
 * and mean wait.
 */
import { useEffect, useRef } from "react";
import { GameCanvas } from "./GameCanvas.js";
import { useHud } from "./store.js";
import { brand, type as typeface } from "../config/brand.js";

const money = (n: number): string =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;
const clock = (h: number): string => {
  const hh = Math.floor(h);
  return `${String(hh).padStart(2, "0")}:${String(Math.floor((h - hh) * 60)).padStart(2, "0")}`;
};

export function App(): JSX.Element {
  const hud = useHud();
  const frame = useRef<HTMLDivElement>(null);

  // Portrait, locked. Developed inside a fixed phone-shaped frame so nothing gets designed that
  // doesn't fit a phone (§7.2, §16).
  useEffect(() => {
    document.body.style.background = brand.night;
    document.body.style.margin = "0";
  }, []);

  const stress =
    hud.balked / Math.max(1, hud.covers + hud.balked) > 0.25 || hud.meanWaitMinutes > 8;

  return (
    <div ref={frame} style={styles.shell}>
      {/* -------------------------------------------------------------- top */}
      <header style={styles.top}>
        <div>
          <div style={styles.cash}>{money(hud.cash)}</div>
          <div style={styles.sub}>
            {"★".repeat(Math.round(hud.reputation))}
            <span style={{ opacity: 0.35 }}>{"★".repeat(5 - Math.round(hud.reputation))}</span>
            <span style={{ marginLeft: 8 }}>{hud.reputation.toFixed(2)}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={styles.day}>DAY {hud.day}</div>
          <div style={styles.sub}>{clock(hud.hour)}</div>
        </div>
      </header>

      {/* Promoted stats: only when something is actually wrong (§11.5). */}
      {stress && (
        <div style={styles.alert}>
          <span>BALK {pct(hud.balked / Math.max(1, hud.covers + hud.balked))}</span>
          <span>WAIT {hud.meanWaitMinutes.toFixed(1)}m</span>
          <span>{hud.openOrders} ON</span>
        </div>
      )}

      {/* ------------------------------------------------------------ scene */}
      <main style={styles.scene}>
        <GameCanvas />
      </main>

      {/* ----------------------------------------------------------- bottom */}
      {hud.drawerOpen && (
        <section style={styles.drawer}>
          <Row label="Labour" value={pct(hud.labourPct)} warn={hud.labourPct > 0.34} />
          <Row label="COGS" value={pct(hud.cogsPct)} warn={hud.cogsPct > 0.36} />
          <Row label="Waste" value={pct(hud.wastePct)} warn={hud.wastePct > 0.04} />
          <Row label="Mean wait" value={`${hud.meanWaitMinutes.toFixed(1)} min`} warn={hud.meanWaitMinutes > 8} />
          <Row label="Covers today" value={String(hud.covers)} />
          <Row label="Walked out" value={String(hud.balked)} warn={hud.balked > hud.covers * 0.25} />
        </section>
      )}

      <nav style={styles.bottom}>
        <Btn label={hud.paused ? "Play" : "Pause"} onClick={() => useHud.getState().togglePause()} />
        {[1, 2, 4].map((s) => (
          <Btn key={s} label={`${s}x`} active={hud.speed === s} onClick={() => useHud.getState().setSpeed(s)} />
        ))}
        <Btn
          label={hud.drawerOpen ? "Hide" : "Numbers"}
          onClick={() => useHud.getState().toggleDrawer()}
        />
      </nav>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }): JSX.Element {
  return (
    <div style={styles.row}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ color: warn ? brand.bad : brand.paper, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function Btn({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.btn,
        background: active ? brand.lamp : "#2A2320",
        color: active ? brand.char : brand.paper,
      }}
    >
      {label}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    width: "min(100vw, 440px)",
    minHeight: "100dvh",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    background: brand.night,
    color: brand.paper,
    fontFamily: typeface.body,
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },
  top: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "12px 14px 8px",
  },
  cash: { fontFamily: typeface.mono, fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  day: { fontFamily: typeface.display, fontSize: 15, letterSpacing: "0.14em" },
  sub: { fontFamily: typeface.mono, fontSize: 11, opacity: 0.75, marginTop: 2 },
  alert: {
    display: "flex",
    justifyContent: "space-between",
    margin: "0 14px 6px",
    padding: "5px 10px",
    background: "rgba(208,52,43,0.16)",
    boxShadow: `inset 0 0 0 1px ${brand.red}`,
    borderRadius: 3,
    fontFamily: typeface.mono,
    fontSize: 10,
    letterSpacing: "0.1em",
  },
  scene: { flex: "1 1 auto", margin: "0 8px", borderRadius: 3, overflow: "hidden", minHeight: 0 },
  drawer: {
    margin: "8px 14px 0",
    padding: "8px 10px",
    background: "rgba(255,255,255,0.05)",
    borderRadius: 3,
    fontFamily: typeface.mono,
    fontSize: 11,
  },
  row: { display: "flex", justifyContent: "space-between", padding: "3px 0" },
  bottom: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 6,
    padding: "10px 10px max(10px, env(safe-area-inset-bottom))",
  },
  btn: {
    padding: "11px 4px",
    border: "none",
    borderRadius: 3,
    fontFamily: typeface.mono,
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
};
