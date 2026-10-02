// Ngân hàng phổ biến và mã BIN (NAPAS) dùng cho VietQR.
// Nguồn: https://api.vietqr.io/v2/banks — cập nhật 2026-10-01.
// Danh sách có thể lỗi thời (ngân hàng đổi tên, sáp nhập): form luôn cho nhập BIN tay.
export interface Bank {
  bin: string;
  short: string;
  name: string;
}

export const BANKS_SOURCE = "api.vietqr.io/v2/banks";
export const BANKS_UPDATED_AT = "01/10/2026";

export const BANKS: Bank[] = [
  { bin: "970436", short: "Vietcombank", name: "Ngân hàng TMCP Ngoại Thương Việt Nam" },
  { bin: "970415", short: "VietinBank", name: "Ngân hàng TMCP Công thương Việt Nam" },
  { bin: "970418", short: "BIDV", name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam" },
  { bin: "970405", short: "Agribank", name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam" },
  { bin: "970422", short: "MBBank", name: "Ngân hàng TMCP Quân đội" },
  { bin: "970407", short: "Techcombank", name: "Ngân hàng TMCP Kỹ thương Việt Nam" },
  { bin: "970416", short: "ACB", name: "Ngân hàng TMCP Á Châu" },
  { bin: "970432", short: "VPBank", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng" },
  { bin: "970423", short: "TPBank", name: "Ngân hàng TMCP Tiên Phong" },
  { bin: "970403", short: "Sacombank", name: "Ngân hàng TMCP Sài Gòn Thương Tín" },
  { bin: "970437", short: "HDBank", name: "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh" },
  { bin: "970441", short: "VIB", name: "Ngân hàng TMCP Quốc tế Việt Nam" },
  { bin: "970443", short: "SHB", name: "Ngân hàng TMCP Sài Gòn - Hà Nội" },
  { bin: "970431", short: "Eximbank", name: "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam" },
  { bin: "970426", short: "MSB", name: "Ngân hàng TMCP Hàng Hải Việt Nam" },
  { bin: "970448", short: "OCB", name: "Ngân hàng TMCP Phương Đông" },
  { bin: "970440", short: "SeABank", name: "Ngân hàng TMCP Đông Nam Á" },
  { bin: "970449", short: "LPBank", name: "Ngân hàng TMCP Lộc Phát Việt Nam" },
  { bin: "970454", short: "VietCapitalBank", name: "Ngân hàng TMCP Bản Việt" },
  { bin: "970428", short: "NamABank", name: "Ngân hàng TMCP Nam Á" },
  { bin: "970409", short: "BacABank", name: "Ngân hàng TMCP Bắc Á" },
  { bin: "970425", short: "ABBANK", name: "Ngân hàng TMCP An Bình" },
  { bin: "970412", short: "PVcomBank", name: "Ngân hàng TMCP Đại Chúng Việt Nam" },
  { bin: "970419", short: "NCB", name: "Ngân hàng TMCP Quốc Dân" },
  { bin: "970452", short: "KienLongBank", name: "Ngân hàng TMCP Kiên Long" },
  { bin: "970433", short: "VietBank", name: "Ngân hàng TMCP Việt Nam Thương Tín" },
  { bin: "970427", short: "VietABank", name: "Ngân hàng TMCP Việt Á" },
  { bin: "970438", short: "BaoVietBank", name: "Ngân hàng TMCP Bảo Việt" },
  { bin: "970400", short: "SaigonBank", name: "Ngân hàng TMCP Sài Gòn Công Thương" },
  { bin: "970429", short: "SCB", name: "Ngân hàng TMCP Sài Gòn" },
  { bin: "546034", short: "CAKE", name: "Ngân hàng số CAKE by VPBank" },
  { bin: "546035", short: "Ubank", name: "Ngân hàng số Ubank by VPBank" },
  { bin: "963388", short: "Timo", name: "Ngân hàng số Timo by Ban Viet Bank" },
  { bin: "970424", short: "ShinhanBank", name: "Ngân hàng TNHH MTV Shinhan Việt Nam" },
  { bin: "970457", short: "Woori", name: "Ngân hàng TNHH MTV Woori Việt Nam" },
];

export function findBank(bin: string): Bank | undefined {
  return BANKS.find((b) => b.bin === bin.trim());
}
