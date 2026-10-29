/**
 * `Math.hypot` without the cost.
 *
 * The built-in is variadic and guards against overflow, and both make it many
 * times slower than the square root it stands for — measured, it was forty per
 * cent of the archipelago survey. Nothing in a scape a few kilometres wide is
 * anywhere near overflow, so these are the plain arithmetic.
 */
export function hypot (x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

export function hypot3 (x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z)
}
