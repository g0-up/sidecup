import type { Ordering } from "../api";
import { orderingMessage } from "../ordering-message";

export function OrderingBanner({ ordering }: { ordering: Ordering }) {
  const msg = orderingMessage(ordering);
  if (!msg) return null;
  return (
    <div role="status" className="mx-4 mb-3 rounded-lg border border-warning bg-warning/15 px-4 py-3 text-sm font-medium">
      {msg}
    </div>
  );
}
