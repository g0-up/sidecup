import { expect, placeOrder, test } from "./fixtures";

test("người bán từ chối (xác nhận hai bước) → khách thấy quán từ chối", async ({ customerPage, sellerPage, table }) => {
  await sellerPage.goto("/seller");
  await placeOrder(customerPage, table);

  const card = sellerPage.getByRole("article").filter({ hasText: table.partnerName });
  await card.getByRole("button", { name: "Từ chối" }).click();
  const confirm = sellerPage.getByRole("alertdialog");
  await expect(confirm).toContainText("Từ chối đơn này?");
  await confirm.getByRole("button", { name: "Xác nhận" }).click();

  await expect(card).toBeHidden();
  await expect(customerPage.getByText("Quán từ chối đơn")).toBeVisible();
});
