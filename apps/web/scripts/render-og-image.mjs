// Vẽ ảnh chia sẻ (Open Graph) 1200×630 từ token màu của web, bằng Chromium của @playwright/test.
// Ảnh chung, không có tên người bán, bàn hay đơn. Chạy lại khi đổi màu hoặc chữ (đổi chữ thì sửa cả og:image:alt trong vite.config.ts):
//   pnpm exec playwright install chromium   (lần đầu)
//   node scripts/render-og-image.mjs        → public/og-image.png
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const out = new URL("../public/og-image.png", import.meta.url).pathname;
const fontDir = join(dirname(require.resolve("@fontsource-variable/inter-tight/package.json")), "files");
const font = readFileSync(join(fontDir, "inter-tight-vietnamese-wght-normal.woff2")).toString("base64");
const fontLatin = readFileSync(join(fontDir, "inter-tight-latin-wght-normal.woff2")).toString("base64");

// Trùng với --navy-700, --accent-orange, --accent-crimson trong src/index.css.
const NAVY = "#233c65";
const ORANGE = "#f45d29";
const CRIMSON = "#f2295b";

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: "Inter Tight"; font-weight: 100 900; src: url(data:font/woff2;base64,${fontLatin}) format("woff2"); }
  @font-face { font-family: "Inter Tight"; font-weight: 100 900; src: url(data:font/woff2;base64,${font}) format("woff2");
    unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: ${NAVY}; color: #fff; font-family: "Inter Tight", sans-serif;
    display: flex; flex-direction: column; justify-content: center; padding: 0 96px; position: relative; overflow: hidden; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 24px; background: linear-gradient(260deg, ${ORANGE} 0%, ${CRIMSON} 100%); }
  .dot { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(260deg, ${ORANGE} 0%, ${CRIMSON} 100%); margin-bottom: 40px; }
  h1 { font-size: 104px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; }
  p { margin-top: 32px; font-size: 44px; font-weight: 500; color: rgba(255,255,255,0.82); }
</style></head>
<body><div class="dot"></div><h1>Gọi nước tại bàn</h1><p>Quét QR · Đặt nước · Trả tiền khi nhận</p><div class="bar"></div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: "png" });
} finally {
  await browser.close();
}
console.log(`${out}: ${(statSync(out).size / 1024).toFixed(1)} KB`);
