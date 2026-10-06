import { request } from "@/shared/api/http";

export interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  has_sweet: boolean;
  has_ice: boolean;
  available: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
}

// Body POST/PUT đúng theo UpsertReq của API (API từ chối field lạ).
export interface ProductInput {
  name: string;
  price: number;
  image_url: string | null;
  has_sweet: boolean;
  has_ice: boolean;
  sort: number;
  available?: boolean;
}

export const productsKey = ["seller", "products"] as const;

export async function listProducts(signal?: AbortSignal) {
  return (await request<{ products: Product[] }>("/api/seller/products", { signal })).products;
}

export function createProduct(body: ProductInput) {
  return request<Product>("/api/seller/products", { method: "POST", body });
}

export function updateProduct(id: string, body: ProductInput) {
  return request<Product>(`/api/seller/products/${encodeURIComponent(id)}`, { method: "PUT", body });
}

export function setProductAvailability(id: string, available: boolean) {
  return request<Product>(`/api/seller/products/${encodeURIComponent(id)}/availability`, {
    method: "PATCH",
    body: { available },
  });
}

// uploadProductImage gửi ảnh (đã thu nhỏ) lên kho ảnh và trả URL công khai để gán vào image_url.
export async function uploadProductImage(file: Blob) {
  const body = new FormData();
  body.append("file", file, "image");
  return (await request<{ url: string }>("/api/seller/products/images", { method: "POST", body })).url;
}
