import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdminMock } from "@/mocks/admin-handlers";
import { server } from "@/test/msw-server";
import type { Product, ProductInput } from "./api";
import { shrinkImage } from "./image-shrink";
import { Component as ProductsPage } from "./page";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// jsdom không có canvas/createImageBitmap: thay bước thu nhỏ bằng một blob WebP nhỏ.
vi.mock("./image-shrink", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./image-shrink")>()),
  shrinkImage: vi.fn(),
}));

const R2_URL = "https://img.sidecup.test/products/0b6e.webp";
const photo = () => new File([new Uint8Array(2048)], "IMG_0001.jpg", { type: "image/jpeg" });

async function openNewProduct(name = "Trà tắc") {
  await userEvent.click(await screen.findByRole("button", { name: /Thêm món/ }));
  await userEvent.type(screen.getByLabelText("Tên món"), name);
  await userEvent.clear(screen.getByLabelText("Giá (đồng)"));
  await userEvent.type(screen.getByLabelText("Giá (đồng)"), "15000");
}

function captureSave() {
  const saved: ProductInput[] = [];
  const respond = async ({ request }: { request: Request }) => {
    const body = (await request.json()) as ProductInput;
    saved.push(body);
    const now = new Date().toISOString();
    return HttpResponse.json({ id: "p-new", available: true, ...body, created_at: now, updated_at: now });
  };
  server.use(http.post("/api/seller/products", respond), http.put("/api/seller/products/:id", respond));
  return saved;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductsPage />
    </QueryClientProvider>,
  );
}

describe("Trang món", () => {
  beforeEach(() => {
    resetAdminMock();
    vi.mocked(shrinkImage).mockReset();
    vi.mocked(shrinkImage).mockResolvedValue(new Blob([new Uint8Array(512)], { type: "image/webp" }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("tắt món đổi ngay trên danh sách rồi trả lại khi API lỗi", async () => {
    let patched = false;
    server.use(
      http.patch("/api/seller/products/:id/availability", async () => {
        patched = true;
        await delay(50);
        return HttpResponse.json({ error: { code: "INTERNAL", message: "Máy chủ lỗi" } }, { status: 500 });
      }),
    );
    renderPage();

    const sw = await screen.findByRole("switch", { name: /Cà phê sữa đá/ });
    expect(sw).toHaveAttribute("aria-checked", "true");

    await userEvent.click(sw);
    // Optimistic: đổi trước khi API trả lời.
    expect(screen.getByRole("switch", { name: /Cà phê sữa đá/ })).toHaveAttribute("aria-checked", "false");

    await waitFor(() => expect(screen.getByRole("switch", { name: /Cà phê sữa đá/ })).toHaveAttribute("aria-checked", "true"));
    expect(patched).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Không đổi được trạng thái món: Máy chủ lỗi");
  });

  it("tắt món thành công giữ trạng thái mới", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("switch", { name: /Bạc xỉu/ }));
    await waitFor(() => expect(screen.getByRole("switch", { name: /Bạc xỉu/ })).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByRole("switch", { name: /Bạc xỉu/ })).toHaveAccessibleName("Bạc xỉu: hết món");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("lỗi 422 từ server hiện dưới đúng ô nhập", async () => {
    server.use(
      http.post("/api/seller/products", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION", message: "Dữ liệu chưa hợp lệ", details: { fields: { image_url: "Đường dẫn ảnh không mở được" } } } },
          { status: 422 },
        ),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Thêm món/ }));
    await userEvent.type(screen.getByLabelText("Tên món"), "Trà tắc");
    await userEvent.clear(screen.getByLabelText("Giá (đồng)"));
    await userEvent.type(screen.getByLabelText("Giá (đồng)"), "15000");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đường dẫn ảnh không mở được")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("validate phía client bằng tiếng Việt", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Thêm món/ }));
    await userEvent.clear(screen.getByLabelText("Giá (đồng)"));
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Nhập tên món")).toBeInTheDocument();
    expect(screen.getByText("Nhập giá bằng số")).toBeInTheDocument();
  });

  it("chọn ảnh thì thu nhỏ, tải lên và lưu URL kho ảnh", async () => {
    // Nội dung multipart được kiểm ở api.test.ts: FormData của jsdom không đi qua fetch của Node nguyên vẹn.
    let uploads = 0;
    server.use(
      http.post("/api/seller/products/images", () => {
        uploads++;
        return HttpResponse.json({ url: R2_URL }, { status: 201 });
      }),
    );
    const saved = captureSave();
    renderPage();
    await openNewProduct();
    expect(screen.queryByRole("textbox", { name: /Ảnh/ })).not.toBeInTheDocument();

    const file = photo();
    await userEvent.upload(screen.getByLabelText("Ảnh (không bắt buộc)"), file);

    expect(await screen.findByRole("img", { name: "Ảnh món hiện tại" })).toHaveAttribute("src", R2_URL);
    expect(shrinkImage).toHaveBeenCalledWith(file);
    expect(uploads).toBe(1);
    expect(screen.getByRole("button", { name: "Đổi ảnh món" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ name: "Trà tắc", price: 15000, image_url: R2_URL });
  });

  it("khoá nút Lưu trong lúc đang tải ảnh", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    server.use(
      http.post("/api/seller/products/images", async () => {
        await gate;
        return HttpResponse.json({ url: R2_URL }, { status: 201 });
      }),
    );
    renderPage();
    await openNewProduct();
    await userEvent.upload(screen.getByLabelText("Ảnh (không bắt buộc)"), photo());

    expect(await screen.findByRole("button", { name: "Đang tải ảnh…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();
    expect(screen.getByLabelText("Ảnh (không bắt buộc)")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải ảnh lên");

    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu" })).toBeEnabled());
  });

  it("báo lỗi dưới ô ảnh khi kho ảnh chưa cấu hình", async () => {
    server.use(
      http.post("/api/seller/products/images", () =>
        HttpResponse.json({ error: { code: "UPLOAD_DISABLED", message: "Chưa cấu hình kho ảnh" } }, { status: 503 }),
      ),
    );
    renderPage();
    await openNewProduct();
    await userEvent.upload(screen.getByLabelText("Ảnh (không bắt buộc)"), photo());

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa cấu hình kho ảnh");
    expect(screen.getByRole("button", { name: "Chọn ảnh món" })).toHaveAccessibleDescription("Chưa cấu hình kho ảnh");
    expect(screen.getByRole("button", { name: "Lưu" })).toBeEnabled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("báo lỗi khi trình duyệt không đọc được ảnh", async () => {
    vi.mocked(shrinkImage).mockRejectedValue(new Error("Không đọc được ảnh này, chọn ảnh JPG hoặc PNG"));
    let uploads = 0;
    server.use(
      http.post("/api/seller/products/images", () => {
        uploads++;
        return HttpResponse.json({ url: R2_URL }, { status: 201 });
      }),
    );
    renderPage();
    await openNewProduct();
    await userEvent.upload(screen.getByLabelText("Ảnh (không bắt buộc)"), photo());

    expect(await screen.findByText("Không đọc được ảnh này, chọn ảnh JPG hoặc PNG")).toBeInTheDocument();
    expect(uploads).toBe(0);
  });

  it("xoá ảnh rồi lưu thì gửi image_url null", async () => {
    const now = new Date().toISOString();
    const withImage: Product = {
      id: "p-img",
      name: "Trà vải",
      price: 30000,
      image_url: R2_URL,
      has_sweet: true,
      has_ice: true,
      available: true,
      sort: 10,
      created_at: now,
      updated_at: now,
    };
    server.use(http.get("/api/seller/products", () => HttpResponse.json({ products: [withImage] })));
    const saved = captureSave();
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Sửa Trà vải" }));
    expect(screen.getByRole("img", { name: "Ảnh món hiện tại" })).toHaveAttribute("src", R2_URL);
    await userEvent.click(screen.getByRole("button", { name: "Xoá ảnh món" }));
    expect(screen.queryByRole("img", { name: "Ảnh món hiện tại" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chọn ảnh món" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].image_url).toBeNull();
  });
});
