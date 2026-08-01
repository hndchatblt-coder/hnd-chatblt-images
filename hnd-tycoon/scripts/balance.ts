/**
 * Policy-bot balance harness. DESIGN.md §25.2.
 *
 * Bots do NOT run continuously — they play three 8-minute sessions per real
 * day with offline gaps and a 9-hour overnight, obeying the §5.2 offline caps.
 * Balancing against a continuous run tunes a game nobody's play pattern
 * matches. See BUILD_PLAN.md step 20.
 *
 * STEP 1 SCOPE: stub only. bot:idle arrives with the arrivals system.
 */
console.log('balance harness: no bots registered yet (Step 1)');
console.log('bots to build: naive, balanced, tightarse, roboboss, idle');
process.exit(0);
