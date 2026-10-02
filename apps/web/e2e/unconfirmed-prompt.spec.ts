import { ageOrder, expect, placeOrder, test } from "./fixtures";

test("đơn chưa xác nhận sau 60 giây: hiện hộp; Chờ thêm ẩn 60 giây rồi hiện lại", async ({ customerPage, table }) => {
  const id = await placeOrder(customerPage, table);
  const prompt = customerPage.getByRole("alert").filter({ hasText: "Quán chưa xác nhận" });
  await expect(customerPage.getByText("Đã gửi").first()).toBeVisible();
  await expect(prompt).toBeHidden();

  // Đơn đã chờ 70 giây (seed SQL); mốc 60 giây tính theo giờ server nên phải đổi dữ liệu, không đổi đồng hồ trình duyệt.
  ageOrder(id, 70);
  await customerPage.clock.install();
  await customerPage.reload();
  await expect(prompt).toBeVisible();

  await prompt.getByRole("button", { name: "Chờ thêm" }).click();
  await expect(prompt).toBeHidden();
  // Tua dưới 65 giây để không chạm ngưỡng heartbeat WebSocket (sẽ resync lại mốc giờ server thật).
  await customerPage.clock.fastForward("00:30");
  await expect(prompt).toBeHidden();
  await customerPage.clock.fastForward("00:31");
  await expect(prompt).toBeVisible();
});
