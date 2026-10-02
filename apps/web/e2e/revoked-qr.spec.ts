import { expect, test } from "./fixtures";

test("mã đã thu hồi: quét lại thấy 'Mã này không còn dùng'; trang đang mở cũng chuyển ngay", async ({
  customerPage,
  customerContext,
  seller,
  table,
}) => {
  await customerPage.goto(`/t/${table.token}`);
  await expect(customerPage.getByRole("heading", { name: "Bàn 9" })).toBeVisible();

  await seller.revoke(table.token);
  await expect(customerPage.getByRole("heading", { name: "Mã này không còn dùng" })).toBeVisible({ timeout: 20_000 });

  const rescan = await customerContext.newPage();
  await rescan.goto(`/t/${table.token}`);
  await expect(rescan.getByRole("heading", { name: "Mã này không còn dùng" })).toBeVisible();
});
