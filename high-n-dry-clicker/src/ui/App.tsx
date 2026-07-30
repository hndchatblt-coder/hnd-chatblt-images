/**
 * M2 — the full ladder and the upgrade families, still on one screen.
 *
 * The patty never leaves the screen: the shop below it swaps between STAFF (the 12-generator
 * ladder) and UPGRADES (the three families). That's a panel swap, not a second gameplay screen.
 *
 * The UI reads engine state and dispatches intents; it holds no economy rules (BUILD_BRIEF §5).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  availableUpgrades,
  buyGenerator,
  buyUpgrade,
  config,
  createInitialState,
  derive,
  formatCash,
  formatDuration,
  generatorCost,
  load,
  LocalStorageAdapter,
  parseTierUpgradeId,
  save,
  settleOffline,
  tap as engineTap,
  tick,
  totalGenerators,
  upgradeCost,
  type GameState,
  type PurchaseOption,
} from "../engine/index.js";
import tickerContent from "../../content/ticker.json";
import { audio } from "./audio.js";
import { Scene, VIEW_NAMES, type View } from "./scene.js";
import { regularName, staffFor } from "../engine/staff.js";

const adapter = new LocalStorageAdapter();
const SEED = 20260720;

type TickerContent = {
  tiers: Record<string, { minGenerators: number }>;
  lines: Record<string, string[]>;
};
const TICKER = tickerContent as TickerContent;

/** Pools unlock as the business grows, so the copy tracks where the player actually is. */
function tickerPool(generators: number, prestiges: number): string[] {
  const pool: string[] = [];
  for (const [tier, gate] of Object.entries(TICKER.tiers)) {
    if (generators >= gate.minGenerators) pool.push(...(TICKER.lines[tier] ?? []));
  }
  if (prestiges > 0) pool.push(...(TICKER.lines.prestige ?? []));
  return pool.length > 0 ? pool : (TICKER.lines.early ?? []);
}

function useEasedCash(target: number): number {
  const [shown, setShown] = useState(target);
  const ref = useRef(target);
  useEffect(() => {
    let raf = 0;
    const step = (): void => {
      const gap = target - ref.current;
      ref.current += Math.abs(gap) < 0.01 ? gap : gap * 0.18;
      setShown(ref.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

/** Who is standing at each station this run. A fresh crew rolls in after every sale. */
function staffNames(state: GameState): Record<number, string> {
  const names: Record<number, string> = {};
  config.generators.list.forEach((_, index) => {
    if ((state.generators[index] ?? 0) > 0) {
      names[index] = staffFor(SEED, state.prestigeCount, index).name;
    }
  });
  return names;
}

const UPGRADE_FAMILY: Record<string, string> = {
  tier: "Station",
  click: "The pass",
  global: "The business",
};

export default function App(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const stateRef = useRef<GameState>(createInitialState(SEED, Date.now()));

  const [, force] = useState(0);
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<"staff" | "upgrades">("staff");
  const [bulk, setBulk] = useState(1);
  const [view, setView] = useState<View>(0);
  const [unlockedView, setUnlockedView] = useState<View>(0);
  const [toast, setToast] = useState<string | null>(null);
  const [line, setLine] = useState(TICKER.lines.early?.[0] ?? "");
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    const loaded = load(adapter);
    if (loaded) {
      stateRef.current = loaded;
      const report = settleOffline(stateRef.current, Date.now());
      if (report.earned > 0 && report.seconds >= config.offline.minSecondsToReport) {
        showToast(
          `Closed for ${formatDuration(report.seconds)}. The place kept trading: ${formatCash(report.earned)}.`,
        );
      }
    } else {
      stateRef.current.wallClockMs = Date.now();
    }
    force((v) => v + 1);
  }, [showToast]);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const scene = new Scene(canvasRef.current);
    // Roughly one face in four is someone you know. Names only — no mechanics.
    scene.regularFor = (customerId: number) =>
      customerId % 4 === 0
        ? regularName(SEED, stateRef.current.prestigeCount, customerId)
        : undefined;
    sceneRef.current = scene;
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let sinceSave = 0;
    let sinceRender = 0;
    const loop = (now: number): void => {
      const dt = Math.min(0.25, (now - last) / config.time.msPerSecond);
      last = now;
      const state = stateRef.current;
      tick(state, dt, config);
      const d = derive(state, config);
      const busy = Math.min(1, Math.log10(1 + d.cps) / 4);
      // The shop is the readout: push what's owned so the scene can show the business.
      // autoServesPerSecond is presentation only — the cash itself comes from the engine tick.
      sceneRef.current?.setBusiness({
        generators: state.generators,
        busy,
        autoServesPerSecond: Math.min(4, Math.log10(1 + d.cps) * 0.5),
        staffNames: staffNames(state),
      });
      audio.setBusy(busy);
      sinceSave += dt;
      if (sinceSave >= config.save.autosaveSeconds) {
        sinceSave = 0;
        state.wallClockMs = Date.now();
        save(adapter, state, config);
      }
      sinceRender += dt;
      if (sinceRender >= 0.1) {
        sinceRender = 0;
        const scene = sceneRef.current;
        if (scene) {
          setView(scene.getView());
          setUnlockedView(scene.getUnlockedView());
        }
        force((v) => v + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const state = stateRef.current;
      const pool = tickerPool(totalGenerators(state), state.prestigeCount);
      setLine((current) => {
        let next = current;
        for (let i = 0; i < 8 && next === current; i += 1) {
          next = pool[Math.floor(Math.random() * pool.length)] ?? current;
        }
        return next;
      });
    }, config.ticker.cycleSeconds * config.time.msPerSecond);
    return () => window.clearInterval(id);
  }, []);

  const onScenePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    audio.init();
    const scene = sceneRef.current;
    // Only a real customer pays. Tapping empty air does nothing, so the queue is the target.
    if (!scene || !scene.tapAt(event.clientX, event.clientY)) return;
    const result = engineTap(stateRef.current, config);
    scene.showSale(formatCash(result.earned));
    audio.sear();
    navigator.vibrate?.(8);
    force((v) => v + 1);
  }, []);

  const onBuyGenerator = useCallback(
    (index: number) => {
      audio.init();
      const state = stateRef.current;
      const owned = state.generators[index] ?? 0;
      if (buyGenerator(state, index, bulk, config)) {
        audio.till();
        navigator.vibrate?.([6, 24, 10]);
        const def = config.generators.list[index];
        if (owned === 0 && def) {
          const person = staffFor(SEED, state.prestigeCount, index);
          showToast(`${person.name} is on the ${def.name.toLowerCase()}. ${person.quirk}`);
        }
        // Crossing a tier threshold is a power beat — make it unmistakable.
        const after = state.generators[index] ?? 0;
        if (config.generatorTiers.thresholds.some((t) => owned < t && after >= t)) {
          audio.stinger();
          navigator.vibrate?.([10, 40, 10, 40, 16]);
        }
        save(adapter, state, config);
        force((v) => v + 1);
      }
    },
    [bulk, showToast],
  );

  const onBuyUpgrade = useCallback(
    (id: string, name: string) => {
      audio.init();
      const state = stateRef.current;
      if (buyUpgrade(state, id, config)) {
        audio.stinger();
        navigator.vibrate?.([8, 30, 12]);
        showToast(`${name}. Everything it touches got better.`);
        save(adapter, state, config);
        force((v) => v + 1);
      }
    },
    [showToast],
  );

  const onToggleMute = useCallback(() => {
    audio.init();
    setMuted((m) => {
      audio.setMuted(!m);
      return !m;
    });
  }, []);

  const state = stateRef.current;
  const d = derive(state, config);
  const shownCash = useEasedCash(state.cash);
  const crew = (index: number) => staffFor(SEED, state.prestigeCount, index);

  /** Progressive reveal: what you own, plus the next rung once it's within sight. */
  const visibleGenerators = useMemo(() => {
    const list: number[] = [];
    let revealNext = true;
    config.generators.list.forEach((_, index) => {
      const owned = state.generators[index] ?? 0;
      const cost = generatorCost(state, index, 1, config);
      const inSight = state.lifetimeRevenue >= cost * 0.35;
      if (owned > 0 || inSight || revealNext) {
        list.push(index);
        revealNext = owned > 0 || inSight;
      }
    });
    return list;
  }, [state, state.cash, state.lifetimeRevenue]);

  const upgrades: PurchaseOption[] = useMemo(() => {
    return availableUpgrades(state, config)
      .map((o) => ({ ...o, cost: upgradeCost(o.id, config) }))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 14);
  }, [state, state.cash, state.upgrades.length, state.generators]);

  const affordableUpgrades = upgrades.filter((u) => state.cash >= u.cost).length;

  return (
    <>
      <header className="till">
        <div>
          <div className="till__brand">
            HIGH <b>N&apos;</b> DRY
          </div>
          <div className="till__cash">{formatCash(shownCash)}</div>
          <div className="till__rate">
            <b>{formatCash(d.cps)}</b>/sec · {formatCash(d.clickPower)} a tap
          </div>
        </div>
        <button
          className="iconbtn"
          onClick={onToggleMute}
          aria-label={muted ? "Unmute sound" : "Mute sound"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </header>

      <div className="ticker">{line}</div>

      <div className="scene">
        <canvas
          ref={canvasRef}
          width={390}
          height={360}
          onPointerDown={onScenePointerDown}
          aria-label="The shop. Tap a customer at the counter to serve them."
        />
        {state.taps === 0 && view === 0 && (
          <div className="scene__hint">tap a customer to serve them</div>
        )}
        {view > 1 && (
          <div className="scene__hint">zoom in to serve · the shop runs itself out here</div>
        )}
      </div>

      {unlockedView > 0 && (
        <div className="zoom">
          {([0, 1, 2] as View[]).slice(0, unlockedView + 1).map((v) => (
            <button
              key={v}
              className={`zoom__btn${view === v ? " zoom__btn--on" : ""}`}
              onClick={() => sceneRef.current?.setView(v)}
              aria-label={VIEW_NAMES[v]}
            >
              {VIEW_NAMES[v]}
            </button>
          ))}
        </div>
      )}

      <nav className="tabs" role="tablist">
        <button
          className={`tab${panel === "staff" ? " tab--on" : ""}`}
          role="tab"
          aria-selected={panel === "staff"}
          onClick={() => setPanel("staff")}
        >
          Staff &amp; sites
        </button>
        <button
          className={`tab${panel === "upgrades" ? " tab--on" : ""}`}
          role="tab"
          aria-selected={panel === "upgrades"}
          onClick={() => setPanel("upgrades")}
        >
          Upgrades
          {affordableUpgrades > 0 && <i className="tab__dot">{affordableUpgrades}</i>}
        </button>
      </nav>

      <section className="shop">
        {panel === "staff" ? (
          <>
            <div className="shop__head">
              <span>{totalGenerators(state)} on the books</span>
              <span className="bulk">
                {[1, 10].map((n) => (
                  <button
                    key={n}
                    className={`bulk__btn${bulk === n ? " bulk__btn--on" : ""}`}
                    onClick={() => setBulk(n)}
                  >
                    ×{n}
                  </button>
                ))}
              </span>
            </div>

            {visibleGenerators.map((index) => {
              const def = config.generators.list[index];
              if (!def) return null;
              const owned = state.generators[index] ?? 0;
              const cost = generatorCost(state, index, bulk, config);
              const affordable = state.cash >= cost;
              const each = def.baseRate * (d.generatorMults[index] ?? 1) * d.globalMult;
              const share = d.cps > 0 ? ((d.generatorCps[index] ?? 0) / d.cps) * 100 : 0;
              const nextTier = config.generatorTiers.thresholds.find((t) => owned < t);
              return (
                <button
                  key={def.id}
                  className={`docketbtn${affordable ? " docketbtn--afford" : ""}`}
                  onClick={() => onBuyGenerator(index)}
                  disabled={!affordable}
                >
                  <span>
                    <span className="docketbtn__name">{def.name}</span>
                    <span className="docketbtn__flavour">
                      {owned > 0 ? crew(index).quirk : def.flavour}
                    </span>
                    {owned > 0 && (
                      <span className="docketbtn__meta">
                        {crew(index).name}
                        {owned > 1 ? ` and ${owned - 1} more` : ""} · {formatCash(each)}/sec each ·{" "}
                        {share.toFixed(0)}%
                        {nextTier !== undefined && ` · ×2 at ${nextTier}`}
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="docketbtn__price">{formatCash(cost)}</span>
                    <span className="docketbtn__owned">{owned} owned</span>
                  </span>
                </button>
              );
            })}
          </>
        ) : (
          <>
            <div className="shop__head">
              <span>{state.upgrades.length} bought</span>
              <span>{upgrades.length === 0 ? "nothing on offer" : "cheapest first"}</span>
            </div>

            {upgrades.length === 0 && (
              <div className="locked">
                Hire someone and the suppliers start returning your calls.
              </div>
            )}

            {upgrades.map((u) => {
              const affordable = state.cash >= u.cost;
              const tier = parseTierUpgradeId(u.id);
              const def =
                u.kind === "click"
                  ? config.clickUpgrades.find((x) => x.id === u.id)
                  : u.kind === "global"
                    ? config.globalUpgrades.find((x) => x.id === u.id)
                    : undefined;
              const generator = tier
                ? config.generators.list.find((g) => g.id === tier.generatorId)
                : undefined;
              return (
                <button
                  key={u.id}
                  className={`docketbtn${affordable ? " docketbtn--afford" : ""}`}
                  onClick={() => onBuyUpgrade(u.id, u.name)}
                  disabled={!affordable}
                >
                  <span>
                    <span className="docketbtn__kind">
                      {UPGRADE_FAMILY[u.kind] ?? u.kind}
                      {generator ? ` · ${generator.name}` : ""}
                    </span>
                    <span className="docketbtn__name">{u.name}</span>
                    <span className="docketbtn__flavour">
                      {def?.flavour ?? `Everything ${generator?.name ?? "here"} makes, doubled.`}
                    </span>
                  </span>
                  <span>
                    <span className="docketbtn__price">{formatCash(u.cost)}</span>
                  </span>
                </button>
              );
            })}
          </>
        )}

        <div className="stats">
          <span>
            taps <b>{Math.floor(state.stats.totalTaps).toLocaleString()}</b>
          </span>
          <span>
            lifetime <b>{formatCash(state.lifetimeRevenue)}</b>
          </span>
          <span>
            burgers <b>{Math.floor(state.burgersSold).toLocaleString()}</b>
          </span>
        </div>
      </section>

      <div className={`toast${toast ? " toast--show" : ""}`}>{toast}</div>
    </>
  );
}
