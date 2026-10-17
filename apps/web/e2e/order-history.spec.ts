import { expect, placeOrder, test } from "./fixtures";

test("Tất cả đơn: lọc theo quán và trạng thái, trạng thái mới hiện không cần tải lại", async ({ customerPage, sellerPage, table }) => {
  await sellerPage.goto("/seller");
  const orderId = await placeOrder(customerPage, table);

  await sellerPage.getByRole("tab", { name: "Tất cả đơn" }).click();
  await sellerPage.getByRole("combobox", { name: "Quán" }).click();
  await sellerPage.getByRole("option", { name: table.partnerName }).click();
  const row = sellerPage.getByRole("row").filter({ has: sellerPage.locator(`a[href="/seller/orders/${orderId}"]`) });
  await expect(row).toContainText("Đã gửi");
  await expect(row).toContainText(table.partnerName);

  // Từ chối ở tab Đang mở rồi quay lại: danh sách lấy trạng thái sống từ bảng đơn.
  await sellerPage.getByRole("tab", { name: /Đang mở/ }).click();
  const card = sellerPage.getByRole("article").filter({ hasText: table.partnerName });
  await card.getByRole("button", { name: "Từ chối" }).click();
  await sellerPage.getByRole("alertdialog").getByRole("button", { name: "Xác nhận" }).click();
  await expect(card).toBeHidden();
  await sellerPage.getByRole("tab", { name: "Tất cả đơn" }).click();
  await expect(row).toContainText("Đã từ chối");

  const status = sellerPage.getByRole("combobox", { name: "Trạng thái" });
  await status.click();
  await sellerPage.getByRole("option", { name: "Đã thu tiền" }).click();
  await expect(sellerPage.getByText("Không có đơn trong khoảng này")).toBeVisible();
  await expect(row).toBeHidden();
  await status.click();
  await sellerPage.getByRole("option", { name: "Mọi trạng thái" }).click();
  await expect(row).toContainText("Đã từ chối");

  // Quán của spec mới tạo hôm nay nên hôm qua không có đơn.
  await sellerPage.getByRole("button", { name: "Kỳ trước" }).click();
  await expect(sellerPage.getByText("Không có đơn trong khoảng này")).toBeVisible();
  await sellerPage.getByRole("button", { name: "Kỳ sau" }).click();
  await expect(row).toBeVisible();
});
