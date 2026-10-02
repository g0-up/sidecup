// Chỉ cho quay về đường dẫn nội bộ của màn người bán (chống open redirect qua ?next=).
export function safeNext(next: string | null): string {
  if (next && next.startsWith("/seller") && !next.startsWith("//") && !next.includes("://")) return next;
  return "/seller";
}

export function loginPath(current: string): string {
  return `/seller/login?next=${encodeURIComponent(current)}`;
}
