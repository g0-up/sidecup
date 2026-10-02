import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/shared/api/errors";
import { productsKey, setProductAvailability, type Product } from "../api";

interface Vars {
  id: string;
  available: boolean;
}

// Bật/tắt món là thao tác nóng giờ trưa: đổi ngay trên danh sách, lỗi thì trả lại trạng thái cũ.
export function useToggleAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, available }: Vars) => setProductAvailability(id, available),
    onMutate: async ({ id, available }: Vars) => {
      await qc.cancelQueries({ queryKey: productsKey });
      const previous = qc.getQueryData<Product[]>(productsKey);
      qc.setQueryData<Product[]>(productsKey, (list) => list?.map((p) => (p.id === id ? { ...p, available } : p)));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(productsKey, ctx.previous);
      toast.error(`Không đổi được trạng thái món: ${errorMessage(err)}`);
    },
    onSuccess: (product) => {
      qc.setQueryData<Product[]>(productsKey, (list) => list?.map((p) => (p.id === product.id ? product : p)));
    },
  });
}
