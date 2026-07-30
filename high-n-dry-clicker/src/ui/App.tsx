/**
 * M1 — one screen: the patty, the till, one generator, save/load.
 *
 * The UI reads engine state and dispatches intents; it holds no economy rules (BUILD_BRIEF §5).
 * Scope is deliberately M1: only the first generator is on the board. The full ladder is M2.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  buyGenerator,
  config,
  createInitialState,
  derive,
  formatCash,
  formatDuration,
  generatorCost,
  load,
  LocalStorageAdapter,
  save,
  settleOffline,
  tap as engineTap,
  tick,
  type GameState,
} from "../engine/index.js";
import tickerContent from "../../content/ticker.json";
import { audio } from "./audio.js";
import { Scene } from "./scene.js";

const adapter = new LocalStorageAdapter();
const SEED = 20260720;
const EARLY_LINES = (tickerContent as { lines: { early: string[] } }).lines.early;

/** Cash the counter shows, eased toward the real value so it never snaps. */
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

export default function App(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const stateRef = useRef<GameState>(createInitialState(SEED, Date.now()));

  const [, force] = useState(0);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [line, setLine] = useState(EARLY_LINES[0] ?? "");
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  /* ---------------------------------------------------------------- boot */

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

  /* --------------------------------------------------------------- scene */

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const scene = new Scene(canvasRef.current);
    sceneRef.current = scene;
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------ game loop */

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
      // Busy-ness: log-scaled so the lamp keeps responding as the numbers get silly.
      const busy = Math.min(1, Math.log10(1 + d.cps) / 4);
      sceneRef.current?.setBusy(busy);
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
        force((v) => v + 1);
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ------------------------------------------------------------- ticker */

  useEffect(() => {
    const id = window.setInterval(() => {
      setLine((current) => {
        let next = current;
        while (next === current && EARLY_LINES.length > 1) {
          next = EARLY_LINES[Math.floor(Math.random() * EARLY_LINES.length)] ?? current;
        }
        return next;
      });
    }, config.ticker.cycleSeconds * config.time.msPerSecond);
    return () => window.clearInterval(id);
  }, []);

  /* -------------------------------------------------------------- intents */

  const onScenePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      audio.init();
      const scene = sceneRef.current;
      if (!scene || !scene.hitsPatty(event.clientX, event.clientY)) return;
      const result = engineTap(stateRef.current, config);
      scene.tap(formatCash(result.earned));
      audio.sear();
      navigator.vibrate?.(8);
      force((v) => v + 1);
    },
    [],
  );

  const onBuy = useCallback(() => {
    audio.init();
    const state = stateRef.current;
    const cost = generatorCost(state, 0, 1, config);
    if (state.cash < cost) return;
    const owned = state.generators[0] ?? 0;
    if (buyGenerator(state, 0, 1, config)) {
      audio.till();
      navigator.vibrate?.([6, 24, 10]);
      const def = config.generators.list[0];
      if (owned === 0 && def) showToast(`${def.name}. ${def.flavour}`);
      save(adapter, state, config);
      force((v) => v + 1);
    }
  }, [showToast]);

  const onToggleMute = useCallback(() => {
    audio.init();
    setMuted((m) => {
      audio.setMuted(!m);
      return !m;
    });
  }, []);

  /* --------------------------------------------------------------- render */

  const state = stateRef.current;
  const d = derive(state, config);
  const shownCash = useEasedCash(state.cash);
  const def = config.generators.list[0];
  const owned = state.generators[0] ?? 0;
  const cost = generatorCost(state, 0, 1, config);
  const affordable = state.cash >= cost;
  const eachRate = def ? def.baseRate * (d.generatorMults[0] ?? 1) * d.globalMult : 0;

  return (
    <>
      <header className="till">
        <div>
          <div className="till__brand">
            HIGH <b>N&apos;</b> DRY
          </div>
          <div className="till__cash">{formatCash(shownCash)}</div>
          <div className="till__rate">
            <b>{formatCash(d.cps)}</b>/sec · {Math.floor(state.burgersSold).toLocaleString()} burgers
            sold
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
          height={440}
          onPointerDown={onScenePointerDown}
          aria-label="The grill. Tap the patty to sell a burger."
        />
        {state.taps === 0 && <div className="scene__hint">tap the patty</div>}
      </div>

      <section className="shop">
        <div className="shop__head">
          <span>The pass</span>
          <span>{formatCash(d.clickPower)} a tap</span>
        </div>

        {def && (
          <button
            className={`docketbtn${affordable ? " docketbtn--afford" : ""}`}
            onClick={onBuy}
            disabled={!affordable}
          >
            <span>
              <span className="docketbtn__name">{def.name}</span>
              <span className="docketbtn__flavour">{def.flavour}</span>
            </span>
            <span>
              <span className="docketbtn__price">{formatCash(cost)}</span>
              <span className="docketbtn__owned">{owned} owned</span>
              <span className="docketbtn__each">{formatCash(eachRate)}/sec each</span>
            </span>
          </button>
        )}

        <div className="locked">Fryer, grill hand and nine more — next build</div>

        <div className="stats">
          <span>
            taps <b>{Math.floor(state.stats.totalTaps).toLocaleString()}</b>
          </span>
          <span>
            lifetime <b>{formatCash(state.lifetimeRevenue)}</b>
          </span>
          <span>
            saved <b>every {config.save.autosaveSeconds}s</b>
          </span>
        </div>
      </section>

      <div className={`toast${toast ? " toast--show" : ""}`}>{toast}</div>
    </>
  );
}
