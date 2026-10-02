import { addToCart, expect, test } from "./fixtures";

test("bỏ trống SĐT vẫn đặt được; màn người bán không có link gọi và vẫn xử lý đơn", async ({
  customerPage,
  sellerPage,
  table,
}) => {
  await sellerPage.goto("/seller");
  await expect(sellerPage.getByRole("region", { name: "Đã gửi" })).toBeVisible();

  await customerPage.goto(`/t/${table.token}`);
  await addToCart(customerPage, table.tea.name);
  await customerPage.getByRole("button", { name: /Xem giỏ/ }).click();
  const sheet = customerPage.getByRole("dialog", { name: "Giỏ của bạn" });
  await expect(sheet.getByLabel("Số điện thoại")).toHaveValue("");
  await expect(sheet.getByText("Bỏ trống thì không nhận tin.", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Đặt nước" }).click();
  await customerPage.waitForURL(/\/o\/[0-9a-f-]{36}$/);

  const card = sellerPage.getByRole("article").filter({ hasText: table.partnerName });
  await expect(card).toBeVisible();
  await expect(card.locator('a[href^="tel:"]')).toHaveCount(0);

  await card.getByRole("button", { name: "Nhận đơn" }).click();
  await expect(customerPage.getByText("Quán đã nhận, đang pha")).toBeVisible();
});
