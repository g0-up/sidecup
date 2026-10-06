import type { OrderStatus } from "@/shared/lib/order-status";

export interface OrderItem {
  product_id: string;
  name: string;
  unit_price: number;
  qty: number;
  sweet: string | null;
  ice: string | null;
  line_total: number;
}

// OrderBase là phần đơn khách và người bán đều thấy: không SĐT, không client_id.
interface OrderBase {
  id: string;
  code: string;
  status: OrderStatus;
  items: OrderItem[];
  note: string | null;
  recipient_address: string | null;
  total: number;
  partner_name: string;
  table_label: string;
  cancel_reason: string | null;
  payment_method: "cash" | "transfer" | null;
  created_at: string;
  accepted_at: string | null;
  delivering_at: string | null;
  paid_at: string | null;
  closed_at: string | null;
  updated_at: string;
  // Đường tương đối về menu của bàn ("/t/<token>") cho nút gọi thêm.
  menu_path: string;
}

// PublicOrder là view của khách: thêm thời gian pha dự kiến và việc khách có nhận tin Zalo không.
export interface PublicOrder extends OrderBase {
  eta_minutes: number;
  notify_zalo: boolean;
}

// SellerOrder thêm SĐT và hoa hồng; chỉ có sau khi người bán đăng nhập.
export interface SellerOrder extends OrderBase {
  partner_id: string;
  qr_token: string;
  customer_phone: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
}

export const SWEET_TEXT: Record<string, string> = { less: "Ít ngọt", medium: "Ngọt vừa", sweet: "Ngọt" };
export const ICE_TEXT: Record<string, string> = { none: "Không đá", less: "Ít đá", normal: "Đá bình thường" };

export function itemOptions(it: Pick<OrderItem, "sweet" | "ice">): string {
  return [it.sweet && SWEET_TEXT[it.sweet], it.ice && ICE_TEXT[it.ice]].filter(Boolean).join(" · ");
}
