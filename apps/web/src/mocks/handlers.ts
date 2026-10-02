import { adminHandlers } from "./admin-handlers";
import { customerHandlers } from "./customer-handlers";
import { sellerHandlers } from "./seller-handlers";

// Mỗi nhóm endpoint một file để các phần web phát triển song song không sửa chung một file.
export const handlers = [...customerHandlers, ...sellerHandlers, ...adminHandlers];
