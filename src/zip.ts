// Простой ZIP-архив без сжатия (фото JPEG всё равно не сжимаются).
// Файлы не копируются в память целиком: для контрольной суммы читаем их по одному,
// а в архив кладём ссылку на исходный файл. Так телефон не упрётся в память на сотнях фото.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

async function crc32(blob: Blob): Promise<number> {
  const data = new Uint8Array(await blob.arrayBuffer())
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** Путь внутри архива, например photos/MAX_..jpg */
  name: string
  data: Blob
}

/** Время изменения в формате ZIP (MS-DOS). */
function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

export async function makeZip(entries: ZipEntry[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const parts: BlobPart[] = []
  const central: BlobPart[] = []
  const { time, date } = dosDateTime(new Date())
  let offset = 0

  for (let i = 0; i < entries.length; i++) {
    const { name, data } = entries[i]
    const nameBytes = new TextEncoder().encode(name)
    const crc = await crc32(data)
    const size = data.size

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // имена в UTF-8
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true)
    local.setUint32(22, size, true)
    local.setUint16(26, nameBytes.length, true)
    parts.push(local, nameBytes, data)

    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true)
    cen.setUint16(4, 20, true)
    cen.setUint16(6, 20, true)
    cen.setUint16(8, 0x0800, true)
    cen.setUint16(12, time, true)
    cen.setUint16(14, date, true)
    cen.setUint32(16, crc, true)
    cen.setUint32(20, size, true)
    cen.setUint32(24, size, true)
    cen.setUint16(28, nameBytes.length, true)
    cen.setUint32(42, offset, true)
    central.push(cen, nameBytes)

    offset += 30 + nameBytes.length + size
    onProgress?.(i + 1, entries.length)
  }

  const centralSize = central.reduce<number>((s, p) => s + (p as ArrayBufferView).byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}
