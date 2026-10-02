import { expect, placeOrder, test } from "./fixtures";

test("chặn /ws: trang khách và màn người bán vẫn cập nhật qua polling 15 giây", async ({
  customerPage,
  sellerPage,
  seller,
  table,
}) => {
  const logs: string[] = [];
  customerPage.on("console", (m) => logs.push(m.text()));
  // Đóng mọi WebSocket ngay khi mở: giả lập webview/proxy chặn WS.
  await customerPage.routeWebSocket(/\/ws\//, (ws) => ws.close());
  await sellerPage.routeWebSocket(/\/ws\//, (ws) => ws.close());

  await sellerPage.goto("/seller");
  await expect(sellerPage.getByText("Kết nối chậm, đang tự thử lại")).toBeVisible({ timeout: 20_000 });

  const id = await placeOrder(customerPage, table);
  const card = sellerPage.getByRole("article").filter({ hasText: table.partnerName });
  await expect(card).toBeVisible({ timeout: 20_000 });

  await seller.transition(id, "sent", "accepted");
  await expect(customerPage.getByText("Quán đã nhận, đang pha")).toBeVisible({ timeout: 20_000 });
  expect(logs.some((l) => l.includes("ws_fallback"))).toBeTruthy();
});
