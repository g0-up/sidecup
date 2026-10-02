import { request, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SELLER_PASSWORD } from "./fixtures";

export const SELLER_STATE = "e2e/.auth/seller.json";

// Đăng nhập một lần cho cả bộ E2E: API giới hạn 5 lần đăng nhập/phút/IP, mỗi spec đăng nhập lại sẽ bị 429.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post("/api/seller/login", { data: { password: SELLER_PASSWORD } });
  if (!res.ok()) throw new Error(`Đăng nhập người bán thất bại: ${res.status()} ${await res.text()}`);
  mkdirSync(dirname(SELLER_STATE), { recursive: true });
  await ctx.storageState({ path: SELLER_STATE });
  await ctx.dispose();
}
