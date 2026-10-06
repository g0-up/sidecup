import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadProductImage } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("uploadProductImage", () => {
  it("gửi ảnh trong field file của multipart và trả URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ url: "https://img.example/products/a.webp" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const image = new Blob([new Uint8Array(16)], { type: "image/webp" });

    await expect(uploadProductImage(image)).resolves.toBe("https://img.example/products/a.webp");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/seller/products/images");
    expect(init.method).toBe("POST");
    const file = (init.body as FormData).get("file");
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).type).toBe("image/webp");
    expect((file as Blob).size).toBe(16);
  });
});
