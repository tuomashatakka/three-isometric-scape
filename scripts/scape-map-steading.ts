import type { ArchipelagoSurvey } from '../src/scene/landscape/archipelago.ts'
import { surveyHearths } from '../src/scene/landscape/hearths.ts'
import { surveyWindows } from '../src/scene/landscape/windows.ts'


/**
 * The chimneys, and how far each mouth stands over the ground under it.
 *
 * `lowest` is the whole check: it is the clearance of the worst stack in the
 * archipelago, and anything under about three metres means a mouth has been
 * placed against a floor it does not stand on.
 */
export interface HearthStats {
  count:  number
  lowest: number
}

/** Every glazed pane, its tightest clearance, and its sign. */
export interface WindowStats {
  count:  number
  lowest: number

  /**
   * Panes whose outward bearing points back at their own building's middle —
   * a glow painted on the inside of the wall it belongs to, and from the
   * default pose indistinguishable from the lamps simply not working.
   */
  inward: number
}

const round = (value: number, places = 1): number => Number(value.toFixed(places))

/**
 * Every hearth in the archipelago, and the tightest clearance among them.
 *
 * The stacks are surveyed rather than drawn — see `landscape/hearths.ts` — so
 * this asks the same pure function the scape does and reports what it got.
 */
export function hearthStats (survey: ArchipelagoSurvey): HearthStats {
  const stacks = surveyHearths(survey)
  const clear  = stacks.map(stack => stack.y - survey.field.heightAt(stack.x, stack.z))

  return {
    count:  stacks.length,
    lowest: round(clear.length ? Math.min(...clear) : 0, 2),
  }
}

/**
 * Every pane in the archipelago, its tightest clearance, and its sign.
 *
 * Surveyed rather than drawn — see `landscape/windows.ts` — so this asks the
 * same pure function the scape does and reports what it got.
 */
export function windowStats (survey: ArchipelagoSurvey): WindowStats {
  const panes = surveyWindows(survey)
  const clear = panes.map(pane => pane.y - survey.field.heightAt(pane.x, pane.z))

  const inward = panes.filter(pane =>
    Math.sin(pane.angle) * (pane.x - pane.centre.x) +
    Math.cos(pane.angle) * (pane.z - pane.centre.z) <= 0)

  return {
    count:  panes.length,
    lowest: round(clear.length ? Math.min(...clear) : 0, 2),
    inward: inward.length,
  }
}
