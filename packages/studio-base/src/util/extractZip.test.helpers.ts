// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

/**
 * Build a Store-mode (no compression) ZIP file from name/data pairs.
 * Used by tests to create valid ZIP archives without external dependencies.
 */
export function buildStoreZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);

    // Local file header (30 bytes + name)
    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(localHeader);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(8, 0, true); // compression: store
    lv.setUint32(14, 0, true); // crc32 (0 for simplicity)
    lv.setUint32(18, entry.data.length, true); // compressed size
    lv.setUint32(22, entry.data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true); // name length
    lv.setUint16(28, 0, true); // extra field length
    new Uint8Array(localHeader).set(nameBytes, 30);

    const localHeaderBytes = new Uint8Array(localHeader);
    parts.push(localHeaderBytes);
    parts.push(entry.data);

    // Central directory entry (46 bytes + name)
    const cdEntry = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(cdEntry);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // compression: store
    cv.setUint32(20, entry.data.length, true); // compressed size
    cv.setUint32(24, entry.data.length, true); // uncompressed size
    cv.setUint16(28, nameBytes.length, true); // name length
    cv.setUint32(42, offset, true); // local header offset
    new Uint8Array(cdEntry).set(nameBytes, 46);

    centralDir.push(new Uint8Array(cdEntry));
    offset += localHeaderBytes.length + entry.data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const entry of centralDir) {
    parts.push(entry);
    cdSize += entry.length;
  }

  // End of central directory (22 bytes)
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true); // signature
  ev.setUint16(8, entries.length, true); // entries on this disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, cdSize, true); // central directory size
  ev.setUint32(16, cdOffset, true); // central directory offset
  parts.push(new Uint8Array(eocd));

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}
