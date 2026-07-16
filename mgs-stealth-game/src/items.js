// src/items.js
// PUBLIC API:
//   Game.ITEMS — tunable constants:
//     {
//       STARTING_DARTS: 12,   // Game.createInventory()'s starting dart count
//       DART_RANGE: 14,       // meters, max travel distance of a fired dart
//       DART_HIT_PERP: 0.5,   // meters, max perpendicular distance from the
//                             // shot ray for a guard to count as hit
//       STARTING_RATIONS: 3,  // Game.createInventory()'s starting ration count
//       RATION_HEAL: 0.35,    // hp fraction a ration restores (see useRation)
//       STARTING_CHAFF: 2,    // Game.createInventory()'s starting chaff-grenade count
//       CHAFF_S: 15,          // seconds a chaff pop keeps the radar/cameras jammed
//       BOX_FACTOR: 0.05,     // vision-profile multiplier while boxOn && stationary
//                             // (boxOn && moving uses a flat 1.0 instead — no
//                             // discount, "blown if seen moving" — see engine.js's
//                             // BOX VERB contract for where this is actually applied)
//     }
//
//   Game.createInventory() -> inv
//     inv.weapon — "tranq" (only weapon this cycle; a fixed string, not yet a
//       real loadout system).
//     inv.darts  — mutable dart count, starts at ITEMS.STARTING_DARTS (12).
//       Decremented by a successful fireTranq() CALL (any call that actually
//       consumes a dart, hit or miss) — see fireTranq below. Carries over a
//       zone transition unchanged (engine.js never resets/rebuilds inventory
//       on switchZone — darts are mission-scoped, not zone-scoped).
//
//     inv.rations — mutable count, starts at ITEMS.STARTING_RATIONS (3).
//       Decremented only by a successful useRation() call (see below) — a
//       call that would be a no-op (no rations left, or hp already full)
//       spends nothing. Mission-scoped like darts (untouched by switchZone).
//
//     inv.useRation(player) -> { used: false } | { used: true, healAmount }
//       `player` is read-only here (same ENGINE-AGNOSTIC posture as
//       fireTranq below) — this function never sets player.hp itself, it
//       only decides WHETHER a ration would help and reports how much.
//       No-op ({ used: false }, inv.rations untouched) if inv.rations <= 0
//       OR player.hp >= 1 (a ration is never wasted topping off a full bar,
//       and pressing the key with none left does nothing — mirrors
//       fireTranq's "no darts left -> no-op" rule). Otherwise: inv.rations--
//       and returns { used: true, healAmount: ITEMS.RATION_HEAL }. The
//       CALLER (engine.js's RATION VERB) is responsible for actually
//       applying player.hp = Math.min(1, player.hp + healAmount) and
//       emitting the { type: "ration", hp } event — same division of labor
//       as fireTranq/guard.tranq() below: this module computes, engine.js
//       mutates anything outside its own `inv` object.
//
//     inv.chaff — mutable count, starts at ITEMS.STARTING_CHAFF (2).
//       Decremented only by a successful useChaff() call. Mission-scoped
//       like darts/rations.
//
//     inv.useChaff() -> { used: false } | { used: true }
//       No-op ({ used: false }, inv.chaff untouched) if inv.chaff <= 0.
//       Otherwise: inv.chaff-- and returns { used: true }. Pure inventory
//       bookkeeping only — starting the CHAFF_S jam timer, emitting the
//       chaff-pop noise, and pushing the { type: "chaff" } event are all
//       engine.js's job (see its CHAFF VERB contract), same ENGINE-AGNOSTIC
//       split as everything else in this file.
//
//     inv.keycards — { L1: boolean, L2: boolean, L3: boolean }, all false at
//       construction (NEW — Laboratory cycle). Mission-scoped like darts/
//       rations/chaff (untouched by engine.js's switchZone). Flipped true by
//       inv.collectPickup("keycardL1"|"keycardL2"|"keycardL3") below — this
//       module never sets a keycard flag any other way. Read by engine.js's
//       DOORS step to decide whether a locked door may auto-open (see
//       src/engine.js's own DOORS contract) and by src/hud.js's additive
//       `keycards` field for display.
//
//     inv.collectPickup(item) -> boolean (true iff this item was actually
//       applied)
//       `item` is the opaque string from a zone.pickups[] entry (see
//       src/world.js's schema note — "keycardL1" | "keycardL2" | "keycardL3"
//       | "chaff" this cycle). Distance-to-player checking and "has this
//       specific pickup already been collected" bookkeeping are engine.js's
//       job (see its own PICKUPS step) — this function is a pure "apply this
//       named item to the inventory" mutator, called only once engine.js has
//       already decided the pickup should be collected:
//         "keycardL1"/"keycardL2"/"keycardL3" -> sets the matching
//           inv.keycards.L* to true (idempotent — collecting the same
//           keycard twice, e.g. via a re-triggered pickup, is a harmless
//           no-op the second time) and returns true.
//         "chaff" -> inv.chaff++ (a bonus grenade beyond ITEMS.STARTING_CHAFF
//           — no cap) and returns true.
//         anything else (an unrecognized item string) -> returns false,
//         touches nothing. Defensive only; every pickup this cycle's zone
//         data actually places uses one of the four names above.
//
//     inv.hasBox — boolean, always true this cycle (no pickup system yet —
//       same "not yet a real loadout system" caveat as inv.weapon above; a
//       future cycle could make this pickup-gated without changing the
//       boxOn toggle's own shape).
//     inv.boxOn — mutable boolean, starts false. Toggled by engine.js's BOX
//       VERB (B key, edge-triggered) — this module never flips it itself;
//       it's a plain readable/writable flag, same shape as inv.darts being
//       a plain counter engine.js/fireTranq both touch.
//
//     BOX / DRAG / LOCKER INTERACTION MATRIX ("one disguise at a time" — the
//     full gating logic lives in engine.js's tick(), see its BOX VERB / DRAG
//     VERB / LOCKER VERB contracts; documented here per this cycle's design
//     brief since this is where boxOn/hasBox themselves are defined):
//       - B (box toggle) is a no-op while engine.dragging is set OR
//         engine.playerHidden is true — you can't pull a box over your head
//         mid-drag or while already tucked in a locker.
//       - G (drag attach/release, locker hide/exit) is ENTIRELY a no-op
//         while inv.boxOn is true — dressed as a box, both hands are full,
//         so no branch of engine.js's handleDragKey() runs at all (not
//         "attach is blocked but release still works" — the whole key is
//         dead while boxed).
//       - E (fire tranq) is BLOCKED while inv.boxOn is true — emits { type:
//         "busy" } instead; no dart is spent. Hands-full logic: same as dragging.
//       - Q (CQC takedown) is BLOCKED while inv.boxOn is true — emits
//         { type: "busy" } instead; target remains awake. Hands-full logic:
//         same as dragging.
//       - K (knock) is ALWAYS ALLOWED while inv.boxOn — reaching out to tap
//         a wall is tactically interesting and feasible.
//       - R (ration) and C (chaff) are ALWAYS ALLOWED while inv.boxOn —
//         consumables do not conflict with the disguise.
//       Because of the two rules above, boxOn and (dragging || playerHidden)
//       can never be true at the same time — there is no live "box mid-drag"
//       state to transition OUT of, so no separate "auto-off when a drag/
//       locker starts" rule is needed (it would never fire).
//
//     inv.fireTranq(engine) -> { fired, hit, guardId?, headshot?, impact:{x,y} }
//       `engine` is a live Game.createEngine() instance (or anything shaped
//       like one: .player {x,y,facing}, .world (raycast), .guards[] (each
//       with x, y, id, state, squad.phase)) — read-only, this function never
//       mutates engine/player/world/guards itself (see ENGINE-AGNOSTIC note
//       below).
//
//       No darts left (inv.darts <= 0): returns { fired: false } immediately,
//       no dart consumed, no other field set.
//
//       Otherwise: inv.darts-- (a dart is spent on every actual shot,
//       regardless of hit/miss), then the shot is resolved as a straight ray
//       from the player's position along player.facing, max ITEMS.DART_RANGE
//       (14m):
//         1. WALL CLIP: engine.world.raycast(player.x, player.y, farX, farY)
//            (farX/farY = the ray's endpoint at max range) gives the wall hit
//            distance (or DART_RANGE if the ray is totally clear — no wall in
//            range).
//         2. GUARD HIT TEST: for every guard in engine.guards that is NOT
//            currently "SLEEPING" (an awake, non-sleeping guard — a sleeping
//            body cannot be shot again by this pass; see guardAI.js's
//            SLEEPING contract), project the guard's offset from the player
//            onto the ray direction ("along") and perpendicular to it
//            ("perp"). A guard qualifies as a hit candidate iff:
//              - along > 0 (in front of the player, not behind), AND
//              - perp < ITEMS.DART_HIT_PERP (0.5m — close enough to the ray
//                line), AND
//              - along < wallHitDistance (closer than whatever wall would
//                otherwise stop the dart — a guard standing behind a wall
//                from the shooter's POV cannot be hit).
//            Among all qualifying guards, the NEAREST one (smallest `along`)
//            is the one hit. No qualifying guard -> a miss.
//         3. RESULT:
//            HIT: { fired: true, hit: true, guardId: <hit guard's id>,
//                    headshot: <hit guard's squad.phase !== "ALERT">,
//                    impact: { x: <hit guard's x>, y: <hit guard's y> } }
//              HEADSHOT RULE (documented here, applied by the CALLER — see
//              ENGINE-AGNOSTIC note below): a dart landing on a guard whose
//              squad is NOT currently in ALERT phase is an unaware target —
//              instant sleep (headshot). A dart landing on a guard whose
//              squad IS in ALERT (the guard is actively hunting/fighting,
//              not caught flat-footed) staggers instead — the guard keeps
//              acting normally for GUARD.STAGGER_SLEEP_S (3s) before it
//              finally goes down. This function only COMPUTES the boolean;
//              guardAI.js's guard.tranq(headshot) is what actually applies
//              the instant-sleep-vs-stagger behavior (see its own contract).
//            MISS: { fired: true, hit: false,
//                     impact: <wall hit point, or the max-range point along
//                     the ray if the ray never hit a wall> }
//            Either way, `impact` is the dart's final resting point — the
//            CALLER (engine.js) is responsible for emitting the dart-impact
//            SHARP noise (SOUND.RADII.dartImpact, 5m unattenuated) there;
//            see the ENGINE-AGNOSTIC note below for why that's not done here.
//
//   ENGINE-AGNOSTIC NOTE: this module reads engine.player/world/guards to do
//   its geometry (that's an ordinary dependency, same shape as every other
//   logic module consuming world/vision/etc.), but it never calls
//   soundEvents.emit/emitRadius and never calls guard.tranq() itself — sound
//   emission and the hit-guard's actual state mutation are ENGINE's job (see
//   src/engine.js's fire-verb wiring), so this module stays a pure "what did
//   the shot do" calculator with no side effects on anything outside its own
//   `inv` object (inv.darts is the only mutation fireTranq performs).
//
// Pure logic module: no THREE, no DOM, no browser APIs, no Math.random/Date —
// runs headless in node. No dependency on other modules for math (own local
// helpers below); consumes an engine-shaped object via .player/.world/.guards
// only, per the contract above.
(function (Game) {
  var ITEMS = {
    STARTING_DARTS: 12,
    DART_RANGE: 14,
    DART_HIT_PERP: 0.5,
    STARTING_RATIONS: 3,
    RATION_HEAL: 0.35,
    STARTING_CHAFF: 2,
    CHAFF_S: 15,
    BOX_FACTOR: 0.05,
  };

  function createInventory() {
    var inv = {
      weapon: "tranq",
      darts: ITEMS.STARTING_DARTS,
      rations: ITEMS.STARTING_RATIONS,
      chaff: ITEMS.STARTING_CHAFF,
      hasBox: true,
      boxOn: false,
      // NEW — Laboratory cycle (see file header). All false until collected
      // via inv.collectPickup(...) below; mission-scoped like every other
      // inventory field in this object.
      keycards: { L1: false, L2: false, L3: false },
    };

    // See file header: pure "apply this named pickup" mutator — engine.js
    // owns the distance check and the "already collected" bookkeeping (see
    // its own PICKUPS step contract). Returns whether anything was actually
    // applied, mirroring useRation/useChaff's own boolean-result posture.
    function collectPickup(item) {
      if (item === "keycardL1") {
        inv.keycards.L1 = true;
        return true;
      }
      if (item === "keycardL2") {
        inv.keycards.L2 = true;
        return true;
      }
      if (item === "keycardL3") {
        inv.keycards.L3 = true;
        return true;
      }
      if (item === "chaff") {
        inv.chaff++;
        return true;
      }
      return false;
    }

    // See file header: pure "would this help, and by how much" calculator —
    // never touches player.hp itself (engine.js's RATION VERB applies the
    // actual heal + pushes the event). The only mutation here is inv.rations,
    // same posture as fireTranq's inv.darts-- below.
    function useRation(player) {
      if (inv.rations <= 0 || player.hp >= 1) return { used: false };
      inv.rations--;
      return { used: true, healAmount: ITEMS.RATION_HEAL };
    }

    // See file header: pure inventory bookkeeping only — starting the jam
    // timer, emitting the pop noise, and pushing the event are engine.js's
    // job (see its CHAFF VERB contract). The only mutation here is
    // inv.chaff--, same posture as fireTranq's inv.darts-- below.
    function useChaff() {
      if (inv.chaff <= 0) return { used: false };
      inv.chaff--;
      return { used: true };
    }

    function fireTranq(engine) {
      if (inv.darts <= 0) return { fired: false };
      inv.darts--;

      var player = engine.player;
      var world = engine.world;
      var guards = engine.guards;

      var dirX = Math.cos(player.facing);
      var dirY = Math.sin(player.facing);
      var farX = player.x + dirX * ITEMS.DART_RANGE;
      var farY = player.y + dirY * ITEMS.DART_RANGE;

      var wallHit = world.raycast(player.x, player.y, farX, farY);
      var wallDist = wallHit ? wallHit.dist : ITEMS.DART_RANGE;

      var bestGuard = null;
      var bestAlong = Infinity;

      for (var i = 0; i < guards.length; i++) {
        var g = guards[i];
        if (g.state === "SLEEPING") continue; // only awake, non-sleeping guards can be hit

        var dx = g.x - player.x;
        var dy = g.y - player.y;
        var along = dx * dirX + dy * dirY;
        if (along <= 0) continue; // behind the shooter

        var perp = Math.abs(dx * dirY - dy * dirX); // distance from (dx,dy) to the ray line
        if (perp < ITEMS.DART_HIT_PERP && along < wallDist) {
          if (along < bestAlong) {
            bestAlong = along;
            bestGuard = g;
          }
        }
      }

      if (bestGuard) {
        var headshot = bestGuard.squad.phase !== "ALERT";
        return {
          fired: true,
          hit: true,
          guardId: bestGuard.id,
          headshot: headshot,
          impact: { x: bestGuard.x, y: bestGuard.y },
        };
      }

      var impact = wallHit ? { x: wallHit.x, y: wallHit.y } : { x: farX, y: farY };
      return { fired: true, hit: false, impact: impact };
    }

    // getState()/setState() (NEW — save/restore cycle, additive only, no
    // behavior change). inv's entire mutable surface is already flat, plain
    // props (see file header) — no private closure state in this module —
    // so this is a straight copy, deep-copying `keycards` (a nested object)
    // so a caller mutating the returned snapshot can never reach back into
    // this inventory's own live state.
    function getState() {
      return {
        weapon: inv.weapon,
        darts: inv.darts,
        rations: inv.rations,
        chaff: inv.chaff,
        hasBox: inv.hasBox,
        boxOn: inv.boxOn,
        keycards: { L1: inv.keycards.L1, L2: inv.keycards.L2, L3: inv.keycards.L3 },
      };
    }

    function setState(state) {
      inv.weapon = state.weapon;
      inv.darts = state.darts;
      inv.rations = state.rations;
      inv.chaff = state.chaff;
      inv.hasBox = state.hasBox;
      inv.boxOn = state.boxOn;
      inv.keycards = { L1: state.keycards.L1, L2: state.keycards.L2, L3: state.keycards.L3 };
    }

    inv.fireTranq = fireTranq;
    inv.useRation = useRation;
    inv.useChaff = useChaff;
    inv.collectPickup = collectPickup;
    inv.getState = getState;
    inv.setState = setState;
    return inv;
  }

  Game.ITEMS = ITEMS;
  Game.createInventory = createInventory;
  if (typeof module !== "undefined")
    module.exports = { createInventory: createInventory, ITEMS: ITEMS };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
