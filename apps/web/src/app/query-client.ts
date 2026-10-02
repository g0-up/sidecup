import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "@/shared/api/errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // Không thử lại lỗi 4xx (sai quyền, không tồn tại); chỉ thử lại lỗi mạng/5xx.
      retry: (count, err) => count < 2 && !(isApiError(err) && err.status >= 400 && err.status < 500),
    },
    mutations: { retry: false },
  },
});
