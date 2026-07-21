import json, math

import os
cfg = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'economy.config.json')))

REAL_SEC_PER_GMIN = cfg['time']['realSecondsPerGameMinute']
HOUR_MULT = {}
for k, v in cfg['demand']['hourMultipliers'].items():
    a, b = k.split('-')
    for h in range(int(a), int(b) + 1):
        HOUR_MULT[h] = v
DAY_MULT = [0.8, 0.8, 1.0, 1.1, 1.8, 1.6, 1.2]  # mon..sun

TICKET = cfg['revenue']['avgTicketDollars']
MARGIN = cfg['revenue']['grossMarginPct']
WAGES = cfg['revenue']['wagesSkimPct']
BASE_DEMAND = cfg['demand']['baseCustomersPerGameMinute']

g = cfg['stations']['grill']; r = cfg['stations']['register']
GRILL_BASE, GRILL_G = g['baseCost'], g['costGrowth']
REG_BASE, REG_G = r['baseCost'], r['costGrowth']
MANAGER_COST = cfg['managers']['venueManager']['cost']
VENUE_COST = cfg['venues']['baseCost']

def cost(base, growth, owned):
    return base * (growth ** owned)

# Greedy player: buys whichever station relieves the binding constraint, cheapest-first
cash = 0.0
grills, regs = 1, 1
first_manager_min = None
second_venue_min = None
manager_bought = False

gmin = 0
while gmin < 60 * 24 * 7 * 4:  # up to 4 game weeks
    day = (gmin // 1440) % 7
    hour = (gmin % 1440) // 60
    demand = BASE_DEMAND * HOUR_MULT[hour] * DAY_MULT[day]
    capacity = min(grills * 1.0, regs * 2.0)
    served = min(demand, capacity)
    cash += served * TICKET * MARGIN * (1 - WAGES)

    # buy priority: manager > venue > capacity
    if not manager_bought and cash >= MANAGER_COST:
        cash -= MANAGER_COST
        manager_bought = True
        first_manager_min = gmin * REAL_SEC_PER_GMIN / 60
    elif manager_bought and second_venue_min is None and cash >= VENUE_COST:
        cash -= VENUE_COST
        second_venue_min = gmin * REAL_SEC_PER_GMIN / 60
        break
    else:
        # relieve binding constraint if affordable and demand exceeds capacity at peak (heuristic: always expand)
        gc = cost(GRILL_BASE, GRILL_G, grills - 1)
        rc = cost(REG_BASE, REG_G, regs - 1)
        if grills * 1.0 <= regs * 2.0:
            if cash >= gc and (not manager_bought or cash - gc > 0):
                cash -= gc; grills += 1
        else:
            if cash >= rc:
                cash -= rc; regs += 1
    gmin += 1

print(f"First manager at: {first_manager_min:.1f} real minutes (target 20-40)" if first_manager_min else "Manager never afforded")
print(f"Second venue at: {second_venue_min:.1f} real minutes (target 50-90)" if second_venue_min else "Second venue never afforded in 4 game weeks")
print(f"End state: {grills} grills, {regs} registers, ${cash:,.0f} cash")
