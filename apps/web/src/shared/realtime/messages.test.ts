import { wsUrl } from "./messages";

describe("wsUrl", () => {
  it("dùng host của trang khi API cùng origin", () => {
    expect(wsUrl("/ws/seller", "")).toBe(`ws://${window.location.host}/ws/seller`);
  });

  it("đổi https thành wss khi API ở hostname riêng", () => {
    expect(wsUrl("/ws/seller", "https://api.example.vn")).toBe("wss://api.example.vn/ws/seller");
  });

  it("đổi http thành ws khi API ở hostname riêng", () => {
    expect(wsUrl("/ws/customer?token=a", "http://localhost:8080")).toBe("ws://localhost:8080/ws/customer?token=a");
  });
});
