import { addToCart, expect, openCartAndFillPhone, test } from "./fixtures";

test("món hết khi đang trong giỏ: dòng giỏ báo Hết món, nút đặt khoá tới khi bỏ dòng", async ({ customerPage, seller, table }) => {
  await customerPage.goto(`/t/${table.token}`);
  await addToCart(customerPage, table.tea.name);
  await addToCart(customerPage, table.water.name);
  const sheet = await openCartAndFillPhone(customerPage);
  const submit = sheet.getByRole("button", { name: "Đặt nước" });
  await expect(submit).toBeEnabled();

  await seller.setAvailable(table.tea.id, false);

  // menu.updated qua WebSocket (≤ 2s); fallback polling 15s vẫn nằm trong timeout.
  await expect(sheet.getByText("Hết món")).toBeVisible({ timeout: 20_000 });
  await expect(submit).toBeDisabled();
  await expect(sheet.getByText("Bỏ món đã hết khỏi giỏ để đặt")).toBeVisible();

  await sheet.getByRole("listitem").filter({ hasText: "Hết món" }).getByRole("button", { name: "Bỏ" }).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await customerPage.waitForURL(/\/o\//);

  await seller.setAvailable(table.tea.id, true);
});
