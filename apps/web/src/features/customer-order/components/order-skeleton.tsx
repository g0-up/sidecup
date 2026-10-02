// Khung chờ cùng bố cục với trang đơn (dòng thương hiệu, câu trạng thái, 4 bước, thẻ món) để trang không nhảy khi dữ liệu về.
// Nhịp nhấp nháy tắt theo quy tắc giảm chuyển động chung.
export function OrderSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto min-h-dvh max-w-md space-y-5 px-4 pt-6 pb-10">
      <p className="sr-only">Đang tải đơn…</p>
      <div aria-hidden="true" className="animate-pulse space-y-5">
        <div className="space-y-2">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-8 w-full rounded bg-muted" />
          <div className="h-4 w-24 rounded bg-muted" />
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="size-8 rounded-full bg-muted" />
              <div className="h-3 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="h-36 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
