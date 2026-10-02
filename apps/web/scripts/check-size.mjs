// Kiểm ngân sách JS của route khách: tổng gzip mọi chunk cần để mở /t/:token (entry + import tĩnh
// + chunk trang menu và import tĩnh của nó) phải ≤ 120 KB. Chạy sau `vite build` (cần build.manifest).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 120;
const dist = new URL("../dist/", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(dist, ".vite/manifest.json"), "utf8"));

function collect(key, seen) {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return;
  seen.add(key);
  for (const imp of chunk.imports ?? []) collect(imp, seen);
}

const routes = {
  "/t/:token (menu)": "src/features/customer-menu/page.tsx",
  "/o/:id (trạng thái đơn)": "src/features/customer-order/page.tsx",
};

let failed = false;
for (const [label, page] of Object.entries(routes)) {
  if (!manifest[page]) {
    console.error(`Không thấy ${page} trong manifest`);
    process.exit(1);
  }
  const keys = new Set();
  collect("index.html", keys);
  collect(page, keys);
  let total = 0;
  const rows = [];
  for (const k of keys) {
    const file = manifest[k].file;
    if (!file.endsWith(".js")) continue;
    const size = gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;
    total += size;
    rows.push([file, (size / 1024).toFixed(1)]);
  }
  const kb = total / 1024;
  console.log(`\n${label}: ${kb.toFixed(1)} KB gzip (ngân sách ${BUDGET_KB} KB)`);
  for (const [f, s] of rows.sort((a, b) => b[1] - a[1])) console.log(`  ${s.padStart(6)} KB  ${f}`);
  if (kb > BUDGET_KB) failed = true;
}

if (failed) {
  console.error(`\nVượt ngân sách ${BUDGET_KB} KB gzip cho route khách`);
  process.exit(1);
}
