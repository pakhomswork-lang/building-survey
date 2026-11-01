// Скриншоты концепций в размере телефона (375×812).
// Запуск: node design-drafts/screenshot.mjs  (нужен пакет playwright-core и установленный Chrome)
// путь к playwright-core можно передать в PW, если пакет стоит в другой папке
const { chromium } = await import(process.env.PW || 'playwright-core')
import { mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const only = process.argv[2]
const files = readdirSync(dir).filter(f => f.startsWith('concept-') && f.endsWith('.html') && (!only || f.includes(only)))

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
// для файлов с несколькими рамками телефона нужно широкое обычное окно
const wide = await browser.newContext({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 2 })
for (const f of files) {
  const page = await (f.includes('screens') ? wide : ctx).newPage()
  await page.goto(pathToFileURL(join(dir, f)).href)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  // файл с несколькими экранами: снимаем каждую рамку телефона отдельно
  const frames = await page.locator('[data-shot]').all()
  if (frames.length) {
    for (const el of frames) {
      const png = join(dir, f.replace('.html', ''), (await el.getAttribute('data-shot')) + '.png')
      mkdirSync(dirname(png), { recursive: true })
      await el.screenshot({ path: png })
      console.log(png)
    }
  } else {
    const png = join(dir, f.replace('.html', '-mobile.png'))
    await page.screenshot({ path: png })
    console.log(png)
  }
  await page.close()
}
await browser.close()
