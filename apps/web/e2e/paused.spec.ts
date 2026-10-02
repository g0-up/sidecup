import { expect, test } from "./fixtures";

test("tạm ngưng nhận đơn từ công tắc trên màn người bán → menu khách khoá đặt kèm lý do", async ({
  customerPage,
  sellerPage,
  seller,
  table,
}) => {
  await customerPage.goto(`/t/${table.token}`);
  await expect(customerPage.getByRole("heading", { name: "Bàn 9" })).toBeVisible();

  await sellerPage.goto("/seller");
  const toggle = sellerPage.getByRole("switch");
  await expect(sellerPage.getByText("Đang nhận đơn")).toBeVisible();
  await toggle.click();
  await expect(sellerPage.getByText("Tạm ngưng nhận đơn")).toBeVisible();

  await expect(customerPage.getByRole("status")).toContainText("Quán tạm ngưng nhận đơn", { timeout: 20_000 });

  await seller.setAccepting(true);
  await expect(customerPage.getByRole("status")).toBeHidden({ timeout: 20_000 });
});
