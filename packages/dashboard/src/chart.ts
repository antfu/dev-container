/** Rounds up to 1, 2 or 5 times a power of ten, so axis ticks land on clean numbers. */
export function niceMax(value: number): number {
  if (value <= 0)
    return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find(n => n * power >= value) ?? 10
  return step * power
}

/** The same for sizes, in whole binary units, so ticks read `512 MiB` rather than `477 MiB`. */
export function niceBytes(value: number): number {
  const unit = 1024 ** Math.max(0, Math.floor(Math.log(Math.max(value, 1)) / Math.log(1024)))
  return niceMax(value / unit) * unit
}

/** A column with a 4px rounded data-end and a square foot on the baseline. */
export function columnPath(x: number, y: number, width: number, height: number, rounded = true): string {
  if (height <= 0)
    return ''
  const r = rounded
    ? Math.min(4, height, width / 2)
    : 0
  return `M${x} ${y + height}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + width - r}Q${x + width} ${y} ${x + width} ${y + r}V${y + height}Z`
}

export function clockLabel(time: number, seconds = false): string {
  return new Date(time).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
  })
}
