---
title: Recipient address field in the cart delivered
date: 2026-10-06
summary: Optional free-text "Địa chỉ người nhận" under "Ghi chú", shown to customer and seller, purged with the phone after 90 days; uncommitted
---

# Recipient address field in the cart delivered

## What happened

"Giỏ của bạn" now has an optional free-text "Địa chỉ người nhận" box (≤ 200 characters,
with a counter) directly under "Ghi chú". It travels as `recipient_address` on
`POST /api/t/{token}/orders`. It is stored in the new `orders.recipient_address` column
(migration `000004`) and returned in both the public and the seller order view. The
customer order page and the seller order card show it under the note.

## Decisions

- The PRD said the app collects no name or location, and an address is location data.
  The user chose to show it to both the customer and the seller. Anyone holding the
  order link can therefore read it.
- The user chose to erase it after 90 days. `Writer.ClearCustomerPhone` became
  `ClearCustomerContact` and clears both columns. `Scheduler.PurgePhones` became
  `PurgeCustomerContact`, and `PhoneRetention` became `ContactRetention`.
- The address is not remembered in `localStorage`, unlike the phone. Nobody asked for
  that, and it would keep more personal data on shared devices.
- Zalo messages do not include the address. They do not include the note either.

## Verification

- API: `go vet` (both tags) and the full `go test -race -tags integration ./...` pass
  against a throwaway Postgres on port 55432, which was stopped afterwards.
  `TestMigrateRoundTrip` now expects version 4.
- Web: `tsc -b` and `eslint` are clean, and the three new tests pass.

## Traps

- Six web tests that navigate between routes (`customer-menu`, `customer-order`,
  `notifier-banner`) already failed before this change, with
  `RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal`.
  They fail on both Node 24.14.1 and 24.21.0. The new submit test waits for the saved
  order instead of navigation so that it does not depend on that failure. The
  blank-address assertions added to "bỏ trống SĐT…" sit behind the same navigation
  failure. The API test `TestCreateOrderRecipientAddressIsOptional` covers that case.
- Three `admin-products` tests fail. They belong to the uncommitted image-upload work,
  not to this change.
