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

  it("gửi FormData nguyên vẹn, không đặt Content-Type JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ url: "https://img.example/a.webp" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { request } = await import("./http");
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "image/webp" }), "a.webp");

    await expect(request("/api/seller/products/images", { method: "POST", body: form })).resolves.toEqual({
      url: "https://img.example/a.webp",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(form);
    expect(init.headers).not.toHaveProperty("Content-Type");
  });

  it("vẫn gửi JSON cho body thường", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { request } = await import("./http");
    await request("/api/seller/products", { method: "POST", body: { name: "Trà" } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"name":"Trà"}');
    expect(init.headers).toHaveProperty("Content-Type", "application/json");
  });
});
