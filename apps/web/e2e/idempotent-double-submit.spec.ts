import { addToCart, expect, openCartAndFillPhone, test } from "./fixtures";

test("bấm Đặt nước liên tục và tải lại giữa chừng vẫn chỉ tạo một đơn", async ({ customerPage, seller, table }) => {
  await customerPage.goto(`/t/${table.token}`);
  await addToCart(customerPage, table.tea.name);
  const sheet = await openCartAndFillPhone(customerPage);

  // Làm chậm request đầu để có cửa sổ bấm đúp và tải lại trước khi nhận phản hồi.
  let first = true;
  await customerPage.route("**/api/t/*/orders", async (route) => {
    if (first) {
      first = false;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });

  const submit = sheet.getByRole("button", { name: "Đặt nước" });
  await submit.dblclick();
  await customerPage.waitForURL(/\/o\//);

  const orders = await seller.ordersOf(table.partnerId);
  expect(orders).toHaveLength(1);
});

test("mất phản hồi rồi tải lại trang, bấm lại dùng cùng Idempotency-Key", async ({ customerPage, seller, table }) => {
  await customerPage.goto(`/t/${table.token}`);
  await addToCart(customerPage, table.tea.name);
  let sheet = await openCartAndFillPhone(customerPage);

  // Request tới server và tạo đơn, nhưng trình duyệt "mất mạng" trước khi nhận phản hồi.
  const keys: string[] = [];
  await customerPage.route("**/api/t/*/orders", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    await route.fetch();
    await route.abort("internetdisconnected");
  });
  await sheet.getByRole("button", { name: "Đặt nước" }).click();
  await expect(sheet.getByRole("alert")).toContainText("Mất kết nối");
  await customerPage.unroute("**/api/t/*/orders");

  await customerPage.reload();
  await customerPage.route("**/api/t/*/orders", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    await route.continue();
  });
  sheet = await openCartAndFillPhone(customerPage);
  await sheet.getByRole("button", { name: "Đặt nước" }).click();
  await customerPage.waitForURL(/\/o\//);

  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(await seller.ordersOf(table.partnerId)).toHaveLength(1);
});
