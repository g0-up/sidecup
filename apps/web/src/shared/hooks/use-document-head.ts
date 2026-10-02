import { useEffect } from "react";

interface DocumentHead {
  title: string;
  // Trang theo token (bàn, đơn) không được lập chỉ mục; nginx cũng gửi X-Robots-Tag, đây là lớp dự phòng.
  noindex?: boolean;
}

// Mọi hook đang bật noindex dùng chung một thẻ meta: thêm khi hook đầu tiên mount, gỡ khi hook cuối unmount.
let robotsMeta: HTMLMetaElement | null = null;
let noindexHolders = 0;

function holdNoindex() {
  noindexHolders += 1;
  if (!robotsMeta) {
    robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    robotsMeta.content = "noindex, nofollow";
    document.head.appendChild(robotsMeta);
  }
}

function releaseNoindex() {
  noindexHolders -= 1;
  if (noindexHolders === 0 && robotsMeta) {
    robotsMeta.remove();
    robotsMeta = null;
  }
}

// useDocumentHead đặt tiêu đề tab (khôi phục tiêu đề cũ khi unmount) và thẻ robots noindex cho route.
export function useDocumentHead({ title, noindex = false }: DocumentHead) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);

  useEffect(() => {
    if (!noindex) return;
    holdNoindex();
    return releaseNoindex;
  }, [noindex]);
}
