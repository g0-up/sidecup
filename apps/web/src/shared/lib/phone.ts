// Cùng quy tắc với API: bỏ khoảng trắng, dấu chấm, gạch; +84/84 → 0; còn đúng 10 số bắt đầu bằng 0.
export function normalizePhone(raw: string): string {
  let p = raw.trim().replace(/[\s.-]/g, "");
  if (p.startsWith("+84")) p = "0" + p.slice(3);
  else if (p.startsWith("84") && p.length === 11) p = "0" + p.slice(2);
  return p;
}

export function isVNMobile(raw: string): boolean {
  return /^0\d{9}$/.test(normalizePhone(raw));
}
