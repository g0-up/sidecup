import { SELLER_NAME } from "@/shared/lib/seller";

// Nói rõ đồ uống không phải của quán ăn (P0-2, chủ quán #2).
export function CustomerFooter() {
  return (
    <footer className="px-4 py-6 text-center text-xs text-muted-foreground">
      Đồ uống do {SELLER_NAME} pha và giao, không phải của quán
    </footer>
  );
}
