export function sentenceBoundaries(text: string) {
  const boundaries: Array<[number, number]> = []
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    const next = text[index + 1] || ""
    const isEnding = /[。！？!?；;]/.test(character)
      || (character === "." && (!next || /\s|[\u3400-\u9fff]/.test(next)))
    if (!isEnding) continue

    let end = index + 1
    while (end < text.length && /[”’」』】）》\])}]/.test(text[end])) end += 1
    boundaries.push([start, end])
    start = end
    index = end - 1
  }

  if (start < text.length) boundaries.push([start, text.length])
  return boundaries
}
