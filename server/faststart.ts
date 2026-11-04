/**
 * MP4 "faststart": move the `moov` index in front of the media data.
 *
 * Phones and editing apps usually write the index at the END of an MP4. A browser then has to
 * download the end of the file before it can show a single frame, which is why some screen videos
 * took a long time to start. With the index first, playback starts after the first chunk.
 *
 * Pure JavaScript (no ffmpeg needed on the server). Only the box order and the chunk offset tables
 * change; the audio and video data are copied byte for byte.
 */

interface Box {
  type: string;
  start: number;
  size: number;
  header: number;
}

function readBoxes(buf: Buffer, from: number, to: number): Box[] | null {
  const boxes: Box[] = [];
  let p = from;
  while (p + 8 <= to) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      if (p + 16 > to) return null;
      const big = buf.readBigUInt64BE(p + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(big);
      header = 16;
    } else if (size === 0) {
      size = to - p;
    }
    if (size < header || p + size > to) return null;
    boxes.push({ type, start: p, size, header });
    p += size;
  }
  return p === to ? boxes : null;
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);

/** Add `delta` to every chunk offset (stco / co64) inside a moov box held in `moov`. */
function shiftOffsets(moov: Buffer, from: number, to: number, delta: number): boolean {
  const kids = readBoxes(moov, from, to);
  if (!kids) return false;
  for (const b of kids) {
    const body = b.start + b.header;
    if (CONTAINERS.has(b.type)) {
      if (!shiftOffsets(moov, body, b.start + b.size, delta)) return false;
    } else if (b.type === 'stco') {
      const n = moov.readUInt32BE(body + 4);
      if (body + 8 + n * 4 > b.start + b.size) return false;
      for (let i = 0; i < n; i++) {
        const at = body + 8 + i * 4;
        const v = moov.readUInt32BE(at) + delta;
        if (v > 0xffffffff) return false; // would need co64; leave the file as it is
        moov.writeUInt32BE(v, at);
      }
    } else if (b.type === 'co64') {
      const n = moov.readUInt32BE(body + 4);
      if (body + 8 + n * 8 > b.start + b.size) return false;
      for (let i = 0; i < n; i++) {
        const at = body + 8 + i * 8;
        moov.writeBigUInt64BE(moov.readBigUInt64BE(at) + BigInt(delta), at);
      }
    }
  }
  return true;
}

/** True when the file is an MP4 whose index comes after its media data. */
export function needsFaststart(head: Buffer): boolean | null {
  // look at the top-level boxes we can see in the first bytes of the file
  let p = 0;
  while (p + 8 <= head.length) {
    let size = head.readUInt32BE(p);
    const type = head.toString('latin1', p + 4, p + 8);
    if (size === 1 && p + 16 <= head.length) size = Number(head.readBigUInt64BE(p + 8));
    if (type === 'moov' || type === 'moof') return false;
    if (type === 'mdat') return true;
    if (size < 8) return null;
    p += size;
  }
  return null;
}

/**
 * Returns the rearranged file, or null when nothing needs doing (already faststart, not an MP4,
 * fragmented MP4, or a layout this simple rewriter does not handle).
 */
export function faststart(buf: Buffer): Buffer | null {
  const top = readBoxes(buf, 0, buf.length);
  if (!top || top[0]?.type !== 'ftyp') return null;
  if (top.some((b) => b.type === 'moof')) return null;
  const moovIdx = top.findIndex((b) => b.type === 'moov');
  const mdatIdx = top.findIndex((b) => b.type === 'mdat');
  if (moovIdx < 0 || mdatIdx < 0 || moovIdx < mdatIdx) return null;
  const moovBox = top[moovIdx];
  const moov = Buffer.from(buf.subarray(moovBox.start, moovBox.start + moovBox.size));
  // every byte from the first mdat onwards moves down by the size of the moov box
  if (!shiftOffsets(moov, moovBox.header, moov.length, moovBox.size)) return null;
  const parts: Buffer[] = [];
  top.forEach((b, i) => {
    if (i === mdatIdx) parts.push(moov);
    if (i !== moovIdx) parts.push(buf.subarray(b.start, b.start + b.size));
  });
  const out = Buffer.concat(parts);
  if (out.length !== buf.length) return null;
  const check = readBoxes(out, 0, out.length);
  if (!check || check.findIndex((b) => b.type === 'moov') > check.findIndex((b) => b.type === 'mdat')) return null;
  return out;
}
