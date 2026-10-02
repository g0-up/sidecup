import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { listProducts, productsKey } from "@/features/admin-products/api";
import { errorMessage, isApiError } from "@/shared/api/errors";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { getPartner, partnerKey, type Partner } from "../api";
import { PartnerFormDialog } from "../components/partner-form";
import { TableList } from "../components/table-list";
import { formatRatePercent, PAYOUT_LABEL } from "../format";
import { summarizeOpenHours } from "../open-hours";

export function Component() {
  const { id = "" } = useParams();
  const { data, isPending, error, refetch } = useQuery({ queryKey: partnerKey(id), queryFn: ({ signal }) => getPartner(id, signal) });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/seller/partners">
          <ArrowLeft /> Danh sách quán
        </Link>
      </Button>
      {isPending ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : error ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive">{errorMessage(error)}</p>
          {!isApiError(error, "PARTNER_NOT_FOUND") && (
            <Button variant="outline" onClick={() => void refetch()}>
              Thử lại
            </Button>
          )}
        </div>
      ) : (
        <PartnerDetail partner={data} />
      )}
    </div>
  );
}

function PartnerDetail({ partner }: { partner: Partner }) {
  const [editing, setEditing] = useState(false);
  const products = useQuery({ queryKey: productsKey, queryFn: ({ signal }) => listProducts(signal) });
  const hiddenNames = (products.data ?? []).filter((p) => partner.hidden_product_ids.includes(p.id)).map((p) => p.name);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{partner.name}</h1>
          {partner.active ? <Badge>Đang hợp tác</Badge> : <Badge variant="secondary">Ngừng</Badge>}
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Sửa quán
        </Button>
      </div>

      <Tabs defaultValue="tables">
        <TabsList>
          <TabsTrigger value="tables">Bàn &amp; mã QR</TabsTrigger>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
        </TabsList>
        <TabsContent value="tables" className="pt-2">
          <TableList partner={partner} />
        </TabsContent>
        <TabsContent value="info" className="pt-2">
          <Card>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted-foreground">Hoa hồng</dt>
                <dd className="tabular-nums">{formatRatePercent(partner.commission_rate)}</dd>
                <dt className="text-muted-foreground">Kỳ trả</dt>
                <dd>{PAYOUT_LABEL[partner.payout_period] ?? partner.payout_period}</dd>
                <dt className="text-muted-foreground">Giờ bán</dt>
                <dd>{summarizeOpenHours(partner.open_hours)}</dd>
                <dt className="text-muted-foreground">Món ẩn</dt>
                <dd>
                  {partner.hidden_product_ids.length === 0
                    ? "Không"
                    : hiddenNames.length > 0
                      ? hiddenNames.join(", ")
                      : `${partner.hidden_product_ids.length} món`}
                </dd>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PartnerFormDialog target={editing ? partner : null} onClose={() => setEditing(false)} />
    </>
  );
}
