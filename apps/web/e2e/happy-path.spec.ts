import { expect, placeOrder, test } from "./fixtures";

test("quét mã → đặt → nhận → mang ra → thu tiền mặt → báo cáo hoa hồng đúng", async ({ customerPage, sellerPage, seller, table }) => {
  await sellerPage.goto("/seller");
  await expect(sellerPage.getByRole("region", { name: "Đã gửi" })).toBeVisible();

  await customerPage.goto(`/t/${table.token}`);
  await expect(customerPage.getByRole("heading", { name: "Bàn 9" })).toBeVisible();
  await expect(customerPage.getByText(table.partnerName)).toBeVisible();
  const id = await placeOrder(customerPage, table);
  await expect(customerPage.getByText("Đã gửi").first()).toBeVisible();

  // Đơn mới xuất hiện trên màn người bán qua WebSocket.
  const card = sellerPage.getByRole("article").filter({ hasText: table.partnerName });
  await expect(card).toBeVisible();
  await expect(card.getByText("0901234567")).toBeVisible();

  await card.getByRole("button", { name: "Nhận đơn" }).click();
  await expect(customerPage.getByText("Quán đã nhận, đang pha")).toBeVisible();

  await card.getByRole("button", { name: "Mang ra bàn" }).click();
  await expect(customerPage.getByText("Đang mang ra", { exact: true }).first()).toBeVisible();

  await card.getByRole("button", { name: "Thu tiền mặt" }).click();
  await expect(customerPage.getByText("Đã nhận nước").first()).toBeVisible();
  await expect(card).toBeHidden();

  const report = await seller.commission(table.partnerId);
  expect(report.rows[0].paid_count).toBe(1);
  expect(report.rows[0].revenue).toBe(15000);
  expect(report.rows[0].commission).toBe(2250);
  expect(id).toMatch(/[0-9a-f-]{36}/);
});
