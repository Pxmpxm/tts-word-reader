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

export function splitTextIntoTTSChunks(text: string) {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    if (!normalizedText) return [];
    if (normalizedText.length <= 150) return [normalizedText];

    const chunks: string[] = [];
    let currentChunk = "";
    let lastPosition = 0;
    const matches = [...normalizedText.matchAll(/[，。！？；：、,.!?;:]/g)];

    const pushOversizedText = (value: string) => {
      let remaining = value.trim();
      while (remaining.length > 150) {
        const partsLeft = Math.ceil(remaining.length / 150);
        const idealLength = Math.ceil(remaining.length / partsLeft);
        const whitespace = remaining.lastIndexOf(" ", idealLength);
        const cutAt = whitespace >= idealLength / 2 ? whitespace + 1 : idealLength;
        chunks.push(remaining.slice(0, cutAt).trim());
        remaining = remaining.slice(cutAt).trimStart();
      }
      if (remaining) chunks.push(remaining);
    };

    const pushSegment = (segment: string) => {
      const normalizedSegment = currentChunk ? segment : segment.trimStart();
      if (!normalizedSegment.trim()) return;

      if (normalizedSegment.length > 150) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        pushOversizedText(normalizedSegment);
        return;
      }

      if (currentChunk.length + normalizedSegment.length <= 150) {
        currentChunk += normalizedSegment;
        return;
      }

      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = normalizedSegment.trimStart();
    };

    if (matches.length === 0) {
      pushOversizedText(normalizedText);
      return chunks;
    }

    for (const match of matches) {
      if (match.index === undefined) continue;
      const segment = normalizedText.slice(lastPosition, match.index + match[0].length);
      pushSegment(segment);
      lastPosition = match.index + match[0].length;
    }

    if (lastPosition < normalizedText.length) {
      pushSegment(normalizedText.slice(lastPosition));
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
}
