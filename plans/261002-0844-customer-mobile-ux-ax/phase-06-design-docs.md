---
phase: 6
title: "Design and review docs"
status: pending
priority: P2
effort: "1.5h"
dependencies: [2, 3, 4, 5]
---

# Phase 6: Design and review docs

## Goal

Record the design direction, the review rubric and the agent rules (P16), so that
future UI work keeps the 44 px floor, the 16 px inputs, the motion and
reduced-motion rules, the single gradient CTA and the `noindex` routes.

## Context

- No `DESIGN.md`, `REVIEW.md`, `AGENTS.md` or `CLAUDE.md` exists at the repository
  root. The tokens live only in `apps/web/src/index.css`.
- The docs index is `docs/README.md`, written in Vietnamese. The project docs are in
  Vietnamese, so write these files in Vietnamese too.
- The repository rule allows markdown only under `plans/` and `docs/` unless the
  user explicitly requests otherwise. Location:
  - `DESIGN.md` → `docs/design.md`.
  - `REVIEW.md` → `docs/review.md`.
  - `AGENTS.md` must sit at the repository root for agent tools to find it. Create
    it only after the user confirms (see the unresolved question in `plan.md`).
    Otherwise add its rules to `docs/README.md` under "Quy tắc cho agent".

## Requirements

- **`docs/design.md`:**
  - the UpNext tokens, with a link to `apps/web/src/index.css` instead of copying
    values;
  - the gradient CTA used once per screen;
  - the 44 px minimum target and the 16 px minimum input text;
  - the motion durations and easing tokens, transform and opacity only, and the
    global reduced-motion rule;
  - the native `<dialog>` sheet and the reason for it (the bundle budget);
  - the customer voice: short, friendly Vietnamese that leads with the outcome;
  - the brand line and the theme-color.
- **`docs/review.md`:**
  - the 10-area rubric with 0–3 scores;
  - the viewports 1440×900, 768×1024, 375×812 and 320 px;
  - the capture audit script `apps/web/scripts/capture-customer-audit.mjs` and how to run it;
  - the discovery scan command and the accepted AX gaps, with their reasons;
  - the `noindex` rule for token routes.
- **Agent rules** (`AGENTS.md`, or a section in `docs/README.md`):
  - read `docs/design.md` before UI work;
  - keep the nginx robots, sitemap and `X-Robots-Tag` locations in sync when
    customer routes change;
  - run `make size` for customer-route changes.
- Link both new docs from the table in `docs/README.md`.

## Files

- Create: `docs/design.md`, `docs/review.md`
- Modify: `docs/README.md`
- Create (on approval): `AGENTS.md`

## Steps

1. Read `docs/README.md` and the final `index.css`, `bottom-sheet.tsx` and
   `nginx.conf` from phases 2 and 5, so that the docs describe what was built.
2. Write `docs/design.md` and `docs/review.md`. Each stays under 150 lines and links
   to the source files instead of copying their values.
3. Write the agent rules in the approved location.
4. Update the `docs/README.md` table.

## Todo

- [x] Write `docs/design.md`
- [x] Write `docs/review.md`
- [x] Add the agent rules (`AGENTS.md` or a `docs/README.md` section)
- [x] Link the new docs from `docs/README.md`

## Verification

- Every path and command in the docs exists. Check with `ls` for the paths and
  `--help` or a dry run for the commands.
- Every rule named in P16 appears in exactly one owning file.

## Risks

- **The docs drift from the code.** They link to the source files instead of
  copying token values.
