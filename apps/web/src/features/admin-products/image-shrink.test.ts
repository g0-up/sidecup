import { afterEach, describe, expect, it, vi } from "vitest";
import { SHRINK_DECODE_ERROR, shrinkImage } from "./image-shrink";

const file = new File([new Uint8Array(8)], "photo.jpg", { type: "image/jpeg" });

// jsdom không có canvas thật: giả bitmap và toBlob, ghi lại kích thước canvas và định dạng được yêu cầu.
function stubCanvas(width: number, height: number, encodes: (type: string) => string) {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width, height, close }));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  const requested: string[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb, type = "image/png") {
    requested.push(`${type} ${this.width}x${this.height}`);
    cb(new Blob([new Uint8Array(4)], { type: encodes(type) }));
  });
  return { close, drawImage, requested };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shrinkImage", () => {
  it("thu ảnh 4000×3000 về cạnh dài 1200 và mã hoá WebP", async () => {
    const { close, drawImage, requested } = stubCanvas(4000, 3000, (t) => t);

    const out = await shrinkImage(file);

    expect(out.type).toBe("image/webp");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1200, 900);
    expect(requested).toEqual(["image/webp 1200x900"]);
    expect(close).toHaveBeenCalled();
  });

  it("không phóng to ảnh nhỏ", async () => {
    const { requested } = stubCanvas(800, 600, (t) => t);
    await shrinkImage(file);
    expect(requested).toEqual(["image/webp 800x600"]);
  });

  it("trình duyệt không mã hoá được WebP (Safari trả PNG) thì dùng JPEG", async () => {
    const { requested } = stubCanvas(3000, 4000, (t) => (t === "image/webp" ? "image/png" : t));

    const out = await shrinkImage(file);

    expect(out.type).toBe("image/jpeg");
    expect(requested).toEqual(["image/webp 900x1200", "image/jpeg 900x1200"]);
  });

  it("trình duyệt không nhận imageOrientation thì giải mã lại không kèm tuỳ chọn", async () => {
    const { requested } = stubCanvas(4000, 3000, (t) => t);
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    const create = vi.fn().mockRejectedValueOnce(new TypeError("bad option")).mockResolvedValueOnce(bitmap);
    vi.stubGlobal("createImageBitmap", create);

    await shrinkImage(file);

    expect(create).toHaveBeenLastCalledWith(file);
    expect(requested).toEqual(["image/webp 1200x900"]);
  });

  it("không giải mã được ảnh thì báo chọn JPG hoặc PNG", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new DOMException("bad", "InvalidStateError")));
    await expect(shrinkImage(file)).rejects.toThrow(SHRINK_DECODE_ERROR);
  });
});
