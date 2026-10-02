import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { isApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { login } from "./api";
import { safeNext } from "./next";

export function Component() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      navigate(safeNext(params.get("next")), { replace: true });
    } catch (err) {
      if (isApiError(err, "RATE_LIMITED")) setError("Sai quá nhiều lần. Đợi một phút rồi thử lại.");
      else if (isApiError(err, "INVALID_PASSWORD")) setError("Mật khẩu không đúng");
      else setError(isApiError(err) ? err.message : "Không đăng nhập được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Màn người bán</h1>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            aria-invalid={!!error}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" disabled={busy || password.length === 0}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
    </main>
  );
}
