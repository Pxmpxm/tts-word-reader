export function oldestAudioToRemove<T extends { byte_size: number }>(
  oldestFirst: T[], maxItems = 500, maxBytes = 300 * 1024 * 1024,
) {
  let bytes = oldestFirst.reduce((total, item) => total + item.byte_size, 0)
  let count = oldestFirst.length
  const removed: T[] = []
  for (const item of oldestFirst) {
    if (count <= maxItems && bytes <= maxBytes) break
    removed.push(item)
    count -= 1
    bytes -= item.byte_size
  }
  return removed
}
