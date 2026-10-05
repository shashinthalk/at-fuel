// "Is it worth driving there?" — compares stations for a fill-up, including the
// fuel (and optionally time) spent reaching each one.
import type { Route } from './routing'

export type FillMode = 'budget' | 'litres'
export type TripType = 'round' | 'oneway'

export interface CompareInputs {
  consumption: number // L / 100 km
  mode: FillMode
  budget: number // € to spend (budget mode)
  litres: number // litres to fill (litres mode)
  tripType: TripType
  timeValue: number // € per hour of driving, 0 = ignore time
  freeTank: number | null // litres of free space in the tank, optional
}

export const DEFAULT_INPUTS: CompareInputs = {
  consumption: 6.5,
  mode: 'budget',
  budget: 50,
  litres: 40,
  tripType: 'round',
  timeValue: 0,
  freeTank: null,
}

export interface Option {
  id: number
  price: number // € / L
  route: Route
  drivenKm: number
  driveMinutes: number
  tripLitres: number // fuel burnt reaching the station (and back, for round trips)
  tripFuelCost: number // value of that fuel at this station's price
  timeCost: number
  litresBought: number
  spend: number // € paid at the pump
  usableLitres: number // litres you actually end up with for the rest of your driving
  totalCost: number // pump + trip fuel + time, € (litres mode)
  effectivePerLitre: number // (spend + time) / usable litres — the fair comparison
  exceedsTank: boolean
}

export function evaluate(price: number, route: Route, id: number, inp: CompareInputs): Option {
  const factor = inp.tripType === 'round' ? 2 : 1
  const drivenKm = route.km * factor
  const driveMinutes = route.minutes * factor
  const tripLitres = (drivenKm * inp.consumption) / 100
  const tripFuelCost = tripLitres * price
  const timeCost = (driveMinutes / 60) * inp.timeValue

  if (inp.mode === 'budget') {
    const litresBought = inp.budget / price
    const usableLitres = litresBought - tripLitres
    return {
      id,
      price,
      route,
      drivenKm,
      driveMinutes,
      tripLitres,
      tripFuelCost,
      timeCost,
      litresBought,
      spend: inp.budget,
      usableLitres,
      totalCost: inp.budget + timeCost,
      effectivePerLitre: usableLitres > 0 ? (inp.budget + timeCost) / usableLitres : Infinity,
      exceedsTank: inp.freeTank !== null && litresBought > inp.freeTank,
    }
  }

  // Litres mode: fill a fixed amount; the trip fuel is an extra cost.
  const litresBought = inp.litres
  const spend = litresBought * price
  const usableLitres = litresBought - tripLitres
  return {
    id,
    price,
    route,
    drivenKm,
    driveMinutes,
    tripLitres,
    tripFuelCost,
    timeCost,
    litresBought,
    spend,
    usableLitres,
    totalCost: spend + tripFuelCost + timeCost,
    effectivePerLitre: usableLitres > 0 ? (spend + timeCost) / usableLitres : Infinity,
    exceedsTank: inp.freeTank !== null && litresBought > inp.freeTank,
  }
}

/** Lower is better. */
export const score = (o: Option, mode: FillMode) => (mode === 'budget' ? -o.usableLitres + o.timeCost / o.price : o.totalCost)

export interface Verdict {
  best: Option
  runnerUp: Option
  cheapestPrice: Option
  /** Advantage of the best option over the runner-up. */
  litresGain: number
  euroGain: number
  /** The cheapest-per-litre station is not the best choice once driving is counted. */
  cheapestNotWorth: boolean
  /** Extra driven km at which the cheaper station stops paying off (vs. the runner-up). */
  breakEvenExtraKm: number | null
}

export function decide(options: Option[], inp: CompareInputs): Verdict | null {
  if (options.length < 2) return null
  const ranked = [...options].sort((a, b) => score(a, inp.mode) - score(b, inp.mode))
  const best = ranked[0]
  const runnerUp = ranked[1]
  const cheapestPrice = [...options].sort((a, b) => a.price - b.price || a.drivenKm - b.drivenKm)[0]

  let litresGain: number
  let euroGain: number
  if (inp.mode === 'budget') {
    litresGain = best.usableLitres - runnerUp.usableLitres
    // Value the extra litres at the runner-up's price (what they would have cost there),
    // and add any time saved.
    euroGain = litresGain * runnerUp.price + (runnerUp.timeCost - best.timeCost)
  } else {
    euroGain = runnerUp.totalCost - best.totalCost
    litresGain = euroGain / best.price
  }

  // Break-even: how many extra km (as driven) the cheaper of the two can be away
  // before its price advantage is eaten up by the fuel burnt getting there
  // (fuel only — time is reported separately).
  const [cheap, dear] = best.price <= runnerUp.price ? [best, runnerUp] : [runnerUp, best]
  let breakEvenExtraKm: number | null = null
  if (cheap.price < dear.price && inp.consumption > 0) {
    const perKmLitres = inp.consumption / 100
    if (inp.mode === 'budget') {
      const priceGainLitres = inp.budget / cheap.price - inp.budget / dear.price
      breakEvenExtraKm = priceGainLitres / perKmLitres
    } else {
      const priceGainEuro = inp.litres * (dear.price - cheap.price)
      breakEvenExtraKm = priceGainEuro / (perKmLitres * cheap.price)
    }
  }

  return {
    best,
    runnerUp,
    cheapestPrice,
    litresGain,
    euroGain,
    cheapestNotWorth: cheapestPrice.id !== best.id && cheapestPrice.price < best.price,
    breakEvenExtraKm,
  }
}
