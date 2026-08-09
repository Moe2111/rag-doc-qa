// Splits long text into smaller, overlapping chunks.
// WHY chunk: embedding models have a size limit, and smaller pieces retrieve
//   more precisely — you want the relevant paragraph, not the whole document.
// WHY overlap: a sentence sitting on a boundary still appears whole in at
//   least one chunk, so meaning isn't lost at the seams.

export function chunkText(text: string, chunkSize = 1500, overlapPct = 200): string[] {
    const clean = text.replace(/\s+/g, " ").trim();
    const chunks: string[] = [];
    let start = 0;
    while (start < clean.length) {
        const end = Math.min(start + chunkSize, clean.length)
        chunks.push(clean.slice(start, end));
        start += chunkSize - overlapPct;
        if (end == clean.length){
            return chunks
        }
    }
    return chunks;
}
