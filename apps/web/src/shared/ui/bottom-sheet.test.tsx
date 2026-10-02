import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./bottom-sheet";

function renderSheet(onOpenChange = vi.fn()) {
  render(
    <StrictMode>
      <BottomSheet open onOpenChange={onOpenChange} title="Cà phê sữa đá">
        <button type="button">Thêm vào giỏ</button>
      </BottomSheet>
    </StrictMode>,
  );
  return { onOpenChange };
}

describe("BottomSheet", () => {
  it("đang trượt xuống thì nội dung inert, xong mới báo đóng", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderSheet();
    const add = screen.getByRole("button", { name: "Thêm vào giỏ" });
    expect(add.closest("[inert]")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Đóng" }));
    expect(add.closest("[inert]")).not.toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("StrictMode gỡ rồi gắn lại effect: sheet vẫn mở, không báo đóng", () => {
    const { onOpenChange } = renderSheet();
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("trình duyệt đóng thẳng dialog (bỏ qua cancel) vẫn báo parent", () => {
    const { onOpenChange } = renderSheet();
    (screen.getByRole("dialog") as HTMLDialogElement).close();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
