// Общие тестовые данные для черновиков интерфейса: план этажа, точки и «фото».
// Фото рисуются на холсте, чтобы превью выглядели как снимки с объекта, а не серые квадраты.

window.SURVEY = (() => {
  const TYPES = {
    general: 'Общий вид',
    defect: 'Дефект',
    measure: 'Замер',
    node: 'Узел',
    opening: 'Вскрытие, шурф',
  }

  // x, y — положение на листе в процентах
  const POINTS = [
    { n: 1, x: 30, y: 30, room: '101 Тамбур', note: 'Входная группа', photos: ['general', 'general', 'defect'], author: 'PP' },
    { n: 2, x: 45, y: 26, room: '102 Коридор', note: 'Отслоение штукатурки', photos: ['general', 'defect', 'defect', 'measure'], author: 'PP' },
    { n: 3, x: 62, y: 33, room: '103 Кухня', note: 'Трещина над дверным проёмом, раскрытие до 2 мм', photos: ['general', 'defect', 'defect', 'measure', 'measure'], author: 'PP' },
    { n: 4, x: 82, y: 45, room: '104 Комната', note: '', photos: ['general', 'node'], author: 'IVA' },
    { n: 5, x: 26, y: 64, room: '105 Санузел', note: 'Следы протечек на потолке', photos: ['general', 'defect', 'defect'], author: 'IVA' },
    { n: 6, x: 52, y: 66, room: '106 Комната', note: 'Вскрытие пола у оси 3', photos: ['general', 'opening', 'opening', 'opening'], author: 'PP' },
    { n: 7, x: 66, y: 60, room: '106 Комната', note: '', photos: ['general', 'node'], author: 'PP' },
    { n: 8, x: 88, y: 72, room: '104 Комната', note: 'Узел опирания перемычки', photos: ['node', 'node', 'measure'], author: 'IVA' },
  ]

  const SHEETS = [
    { name: 'План 1 этажа', points: 8, photos: 26 },
    { name: 'План 2 этажа', points: 5, photos: 14 },
    { name: 'Фасад 1–5', points: 3, photos: 9 },
    { name: 'Кровля', points: 0, photos: 0 },
  ]

  /** План этажа SVG. c — цвета: paper, wall, axis, text. */
  function planSvg(c) {
    const ax = [200, 520, 840, 1160, 1400]
    const ay = [200, 560, 900]
    const rooms = [
      ['101', 'Тамбур', 360, 380], ['102', 'Коридор', 680, 380], ['103', 'Кухня', 1000, 380],
      ['104', 'Комната', 1280, 740], ['105', 'Санузел', 360, 740], ['106', 'Комната', 760, 740],
    ]
    let s = `<svg viewBox="0 0 1600 1100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%">`
    s += `<rect width="1600" height="1100" fill="${c.paper}"/>`
    s += `<g stroke="${c.axis}" stroke-width="2" stroke-dasharray="18 8 4 8" fill="none">`
    ax.forEach(x => (s += `<line x1="${x}" y1="110" x2="${x}" y2="1000"/>`))
    ay.forEach(y => (s += `<line x1="130" y1="${y}" x2="1480" y2="${y}"/>`))
    s += `</g><g stroke="${c.axis}" stroke-width="2" fill="${c.paper}">`
    ax.forEach(x => (s += `<circle cx="${x}" cy="70" r="30"/>`))
    ay.forEach(y => (s += `<circle cx="90" cy="${y}" r="30"/>`))
    s += `</g><g fill="${c.text}" font-family="${c.font || 'sans-serif'}" font-size="30" text-anchor="middle">`
    ax.forEach((x, i) => (s += `<text x="${x}" y="81">${i + 1}</text>`))
    ay.forEach((y, i) => (s += `<text x="90" y="${y + 11}">${'АБВ'[i]}</text>`))
    s += `</g>`
    // стены: наружные толще
    s += `<g stroke="${c.wall}" fill="none" stroke-linecap="square">`
    s += `<rect x="200" y="200" width="1200" height="700" stroke-width="22"/>`
    s += `<path d="M520 200V900M840 200V560M1160 200V900M200 560H1160" stroke-width="10"/>`
    s += `</g>`
    // проёмы
    s += `<g fill="${c.paper}"><rect x="290" y="885" width="120" height="30"/><rect x="505" y="300" width="30" height="110"/><rect x="900" y="545" width="110" height="30"/><rect x="1145" y="640" width="30" height="110"/><rect x="620" y="185" width="140" height="30"/><rect x="1240" y="185" width="110" height="30"/></g>`
    s += `<g fill="${c.text}" font-family="${c.font || 'sans-serif'}" font-size="28" text-anchor="middle" opacity=".8">`
    rooms.forEach(([no, name, x, y]) => (s += `<text x="${x}" y="${y}">${no}</text><text x="${x}" y="${y + 36}" font-size="24">${name}</text>`))
    s += `</g></svg>`
    return s
  }

  // простой генератор случайных чисел, чтобы «фото» были одинаковыми при каждом открытии
  function rng(seed) {
    let a = seed * 9301 + 49297
    return () => ((a = (a * 9301 + 49297) % 233280) / 233280)
  }

  const cache = {}
  /** «Фото» нужного типа как data URL. */
  function photo(type, seed, w = 480, h = 360) {
    const key = [type, seed, w, h].join('-')
    if (cache[key]) return cache[key]
    const r = rng(seed + 7)
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const g = cv.getContext('2d')
    const tones = ['#c9c2b4', '#b8b3aa', '#d3cbbb', '#a9a49b', '#c2b8a6']
    const base = tones[seed % tones.length]

    function grain(n, alpha) {
      for (let i = 0; i < n; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '0,0,0' : '255,255,255'},${r() * alpha})`
        g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3)
      }
    }
    function light() {
      const lg = g.createRadialGradient(w * 0.3, h * 0.2, 10, w * 0.5, h * 0.5, w * 0.8)
      lg.addColorStop(0, 'rgba(255,255,255,.18)')
      lg.addColorStop(1, 'rgba(0,0,0,.28)')
      g.fillStyle = lg
      g.fillRect(0, 0, w, h)
    }
    function crack(x0, width) {
      g.strokeStyle = 'rgba(45,35,25,.85)'
      g.lineWidth = width
      g.beginPath()
      let x = x0, y = -5
      g.moveTo(x, y)
      while (y < h) {
        x += (r() - 0.45) * w * 0.09
        y += h * 0.07
        g.lineTo(x, y)
        if (r() > 0.8) {
          g.moveTo(x, y)
          g.lineTo(x + (r() - 0.5) * 40, y + 20)
          g.moveTo(x, y)
        }
      }
      g.stroke()
    }

    if (type === 'general') {
      // угол помещения: стена, пол, потолок, окно
      g.fillStyle = base
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#e9e5dd'
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w * 0.62, h * 0.18); g.lineTo(w * 0.38, h * 0.18); g.closePath(); g.fill()
      g.fillStyle = '#8a7660'
      g.beginPath(); g.moveTo(0, h); g.lineTo(w, h); g.lineTo(w * 0.62, h * 0.74); g.lineTo(w * 0.38, h * 0.74); g.closePath(); g.fill()
      g.fillStyle = 'rgba(0,0,0,.12)'
      g.beginPath(); g.moveTo(w * 0.62, h * 0.18); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w * 0.62, h * 0.74); g.closePath(); g.fill()
      g.fillStyle = '#dfe9ef'
      g.fillRect(w * 0.44, h * 0.3, w * 0.13, h * 0.26)
      g.strokeStyle = '#f4f2ee'; g.lineWidth = 4
      g.strokeRect(w * 0.44, h * 0.3, w * 0.13, h * 0.26)
      grain(1500, 0.06)
      light()
    } else if (type === 'defect') {
      g.fillStyle = base
      g.fillRect(0, 0, w, h)
      grain(3500, 0.1)
      if (seed % 2) {
        // отслоение штукатурки
        g.fillStyle = '#8f7f6c'
        g.beginPath()
        const cx = w * (0.35 + r() * 0.3), cy = h * (0.35 + r() * 0.3)
        for (let a = 0; a < 6.3; a += 0.4) {
          const rr = 50 + r() * 50
          g.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr)
        }
        g.fill()
        g.fillStyle = '#7a3e2c'
        for (let i = 0; i < 20; i++) g.fillRect(cx - 60 + (i % 5) * 26, cy - 30 + Math.floor(i / 5) * 16, 22, 12)
      }
      crack(w * (0.3 + r() * 0.4), 3)
      light()
    } else if (type === 'measure') {
      g.fillStyle = base
      g.fillRect(0, 0, w, h)
      grain(2500, 0.08)
      crack(w * 0.55, 2.5)
      // рулетка / щуп
      g.save()
      g.translate(w * 0.1, h * 0.62)
      g.rotate(-0.12)
      g.fillStyle = '#e8c21a'
      g.fillRect(0, 0, w * 0.9, 34)
      g.fillStyle = '#1b1b1b'
      for (let i = 0; i < 40; i++) g.fillRect(i * 11, 0, 1.5, i % 5 ? 10 : 18)
      g.font = '14px sans-serif'
      for (let i = 0; i < 8; i++) g.fillText(String(i + 1), i * 55 + 2, 30)
      g.restore()
      light()
    } else if (type === 'node') {
      // опирание балки / перемычки на кладку
      g.fillStyle = '#9b5b45'
      g.fillRect(0, 0, w, h)
      for (let row = 0; row < 14; row++) {
        for (let col = -1; col < 8; col++) {
          g.fillStyle = `hsl(14, ${30 + r() * 15}%, ${32 + r() * 10}%)`
          g.fillRect(col * 70 + (row % 2) * 35, row * 28, 66, 24)
        }
      }
      g.fillStyle = '#6f6f6c'
      g.fillRect(0, h * 0.28, w * 0.72, h * 0.16)
      g.fillStyle = 'rgba(0,0,0,.35)'
      g.fillRect(0, h * 0.44, w * 0.72, 6)
      g.fillStyle = '#5a3b2a'
      g.fillRect(w * 0.6, h * 0.28, 8, h * 0.16)
      grain(2500, 0.12)
      light()
    } else {
      // вскрытие: слои пола
      const layers = [['#7b5a3a', 0.12], ['#cfc7b8', 0.08], ['#9c9a94', 0.22], ['#d8cfae', 0.18], ['#6e6a62', 0.4]]
      let y = 0
      layers.forEach(([col, part]) => {
        g.fillStyle = col
        g.fillRect(0, y, w, h * part + 2)
        y += h * part
      })
      grain(4500, 0.14)
      g.fillStyle = '#e8c21a'
      g.fillRect(w * 0.78, 0, 26, h)
      g.fillStyle = '#1b1b1b'
      for (let i = 0; i < 34; i++) g.fillRect(w * 0.78, i * 11, i % 5 ? 9 : 16, 1.5)
      light()
    }
    cache[key] = cv.toDataURL('image/jpeg', 0.82)
    return cache[key]
  }

  /** Сколько фото каждого типа у точки. */
  function counts(point) {
    const c = {}
    point.photos.forEach(t => (c[t] = (c[t] || 0) + 1))
    return c
  }

  const totals = {}
  POINTS.forEach(p => p.photos.forEach(t => (totals[t] = (totals[t] || 0) + 1)))

  return { TYPES, POINTS, SHEETS, planSvg, photo, counts, totals, project: 'Ул. Садовая, 14', projectFull: 'Жилой дом, ул. Садовая, 14' }
})()
