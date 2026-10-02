import { ageOrder, expect, placeOrder, test } from "./fixtures";

test("khách huỷ khi đơn còn Đã gửi; người bán thấy đơn rời bảng", async ({ customerPage, sellerPage, seller, table }) => {
  await sellerPage.goto("/seller");
  const id = await placeOrder(customerPage, table);
  const card = sellerPage.getByRole("article").filter({ hasText: table.partnerName });
  await expect(card).toBeVisible();

  ageOrder(id, 70);
  await customerPage.reload();
  const prompt = customerPage.getByRole("alert").filter({ hasText: "Quán chưa xác nhận" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Huỷ đơn" }).click();
  await prompt.getByRole("button", { name: "Xác nhận huỷ" }).click();

  await expect(customerPage.getByText("Bạn đã huỷ đơn")).toBeVisible();
  await expect(card).toBeHidden();
  const [order] = (await seller.ordersOf(table.partnerId)).filter((o) => o.id === id);
  expect(order.status).toBe("cancelled");
});
