afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function callWith(origin: string | undefined) {
  if (origin !== undefined) vi.stubEnv("VITE_API_ORIGIN", origin);
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
  const { request } = await import("./http");
  await request("/api/seller/me");
  return fetchMock.mock.calls[0] as [string, RequestInit];
}

describe("request", () => {
  it("gọi đường dẫn tương đối khi không đặt VITE_API_ORIGIN", async () => {
    const [url, init] = await callWith(undefined);
    expect(url).toBe("/api/seller/me");
    expect(init.credentials).toBe("include");
  });

  it("gọi API ở hostname riêng và gửi kèm cookie", async () => {
    const [url, init] = await callWith("https://api.example.vn/");
    expect(url).toBe("https://api.example.vn/api/seller/me");
    expect(init.credentials).toBe("include");
  });
});
