# Asset Request workspace and swap POC

## Scope and migration

Migration: `20260907090000_request_workspace_asset_swap` (applied).

- `asset_requests.root_location_id`: nullable FK to `locations.id`, indexed, delete restricted.
- `asset_request_allocations.return_purpose`: `NORMAL_RETURN | SWAP`, default `NORMAL_RETURN`.
- Nullable allocation `swap_reason` and `swap_remarks`; reasons are `WRONG_ASSET`, `NOT_SUITABLE`, `WRONG_MEASUREMENT`, `CONDITION_ISSUE`, `OTHER`.
- Existing roots remain null; historical allocations retain normal-return semantics. No guessed backfill.
- Allocation concurrency indexes and serializable conditional claims remain unchanged.
- No new Asset/Allocation lifecycle statuses, no AssetEvent, no hardware-specific source additions, no Department ownership changes.

## Workspace

The previous page always displayed its create form, then required opening a Request detail and processing lines individually. The new page uses the existing list API, enriched with root and focused confirmation history, plus the existing category/user/location list APIs. It makes no per-request detail calls.

- **Requesting:** grouped expandable Jobs, requirement rows, summaries, immediate Find/Select, Cancel Selection confirmation, replacement selection, and allocation history. Completed/cancelled Jobs are available through a checkbox.
- **Issue & Confirmation:** Reserved, Awaiting EPC Confirmation, and In Use rows; recipient and Specific Location selection; EPC confirmation; Swap Asset.
- **Returning:** normal in-use Assets, normal/swap pending returns, initiation and EPC confirmation, and an explicit legacy-return action.
- New Request is a focused dialog: required Job No, Root Location, and one or more Category + H × W requirements; optional header/line remarks.
- Global Job/Asset/EPC search includes allocation history. Tab-specific filters cover the approved states, category/measurement, root/specific location, recipient, return purpose, and verified location.
- Tab counters count all actionable workspace records, independently of filters. Job summaries describe the entire Job even when row filters are applied.
- Native modal dialogs provide focus containment and Escape/Close behavior; busy operations disable repeat submission. API errors stay in the active dialog.

## Root and Specific Location

New requests require an active top-level Location. The Root Location itself or any descendant, regardless of Location type, may be selected as the destination. The selector only offers active destinations in that hierarchy. The backend validates containment in both issue and EPC-confirmation transactions, including hierarchy changes between the two actions.

`specificLocationId` is the preferred issue payload field; `productionLocationId` remains an accepted compatibility alias. Department is still resolved through the existing location hierarchy.

Historical rootless requests remain readable and operational under the original `PRODUCTION_AREA` / `MACHINE_LOCATION` destination restriction. No roots are inferred. Legacy `ISSUED + IN_USE` allocations remain directly returnable and are not offered the new swap action. Historical requirement rows without Category/Measurement remain readable but cannot use exact-match selection.

## Swap and fulfillment

The existing `POST /api/asset-assignments/:id/initiate-return` accepts:

```json
{
  "returnPurpose": "SWAP",
  "swapReason": "NOT_SUITABLE",
  "remarks": "Optional explanation"
}
```

Omitted return purpose means `NORMAL_RETURN`. Swap requires an allowed reason; `OTHER` also requires nonblank remarks. Swap remarks are stored separately from final return remarks.

1. Start Swap: allocation `CONFIRMED → RETURN_PENDING`, Asset `IN_USE → RETURN_PENDING`, purpose `SWAP`, request `PROCESSING`. Assignment stays active; verified location and movement history do not change.
2. Confirm Return EPC: existing atomic return transaction completes the old assignment/allocation and releases the Asset to the verified Store location. It creates the usual movement and structured confirmation audit. The original request and line are retained.
3. Completed SWAP allocations are historical and excluded from selected/fulfilled/final-return quantities. With no current replacement, the line derives `Replacement Required`; the request remains `PROCESSING`.
4. Find Replacement uses the existing reservation transaction and creates a new allocation. Cancelled replacement attempts remain historical and do not clear replacement-required status.
5. Replacement issue/confirmation returns the request to `ISSUED` when every requirement is physically satisfied.
6. Final `NORMAL_RETURN` of the replacement contributes to `COMPLETED`; old swap returns never do.

Central `calculateLineProgress` is used by reservation checks, list/detail summaries, and request status recalculation. Cancelled allocations never count. A pending SWAP still occupies its requirement until physically returned, preventing early replacement reservation.

Request statuses: unstarted `PENDING`; incomplete or unresolved replacement `PROCESSING`; every requirement physically fulfilled (including normal pending/finished returns) `ISSUED`; all final normal returns with no active allocations `COMPLETED`. Existing cancellation restrictions remain. Requirements with allocation history cannot be deleted/recreated through the edit API.

## Physical timing and history

Issue and return movement timing is unchanged: movements and verified location updates occur only after successful EPC confirmation. Wrong EPC rolls back all state, movement, and audit changes. Swap uses the same return confirmation transaction. Existing legacy direct-return behavior is unchanged.

Confirmation records retain structured Asset/allocation/assignment, EPC, authenticated user, time, source and remarks. Web calls still record `WEB_ADMIN`; `HANDHELD` remains only an existing future-compatible value. No reader or mobile implementation was added.

## Verification (2026-09-07)

- Prisma validate: passed. Migration status: all 16 migrations applied.
- Prisma generate: initial Windows DLL rename EPERM; types generated with `--no-engine`, then normal generate succeeded. Final runtime uses the normal generated client.
- Server build: passed. Web build: passed.
- Changed workspace/API lint: passed. Full web lint: unchanged baseline, 27 errors and 1 warning in other files.
- Runtime suite: EPC generation/manual duplicates; cancel/reselect; duplicate reservation; wrong issue/return EPC; concurrent issue/return confirmation; atomic movement/audit timing; multi-line progression; Department inheritance; legacy direct return; root/descendant acceptance and unrelated rejection; confirmation hierarchy revalidation; swap reason validation; concurrent swap initiation; no early replacement; cancel replacement; two different Assets competing for one replacement line; retained history and final completion.
- Desktop Edge automation at 1440×900: create two requirements, inline selection, cancel/reselect, root/child-only selector, issue to root and child, wrong EPC error, correct EPC, swap, EPC swap return, replacement selection/issue/confirmation, both final normal returns, Completed Job and history. Rendered screenshot inspected.
- Tests create uniquely named fixtures and delete only their own fixture rows, including fixture audit/movement rows. Existing POC records are not reset or rewritten.

### Repeat runtime suite

From `server`:

```powershell
node node_modules/typescript/bin/tsc --ignoreConfig scripts/epc-confirmation-lifecycle.runtime.ts --outDir .runtime-tests --module commonjs --target ES2020 --moduleResolution node --esModuleInterop --skipLibCheck --strict --ignoreDeprecations 6.0 --types node
node .runtime-tests/scripts/epc-confirmation-lifecycle.runtime.js
```

The browser script `server/scripts/request-workspace.browser.cjs` requires the web dev server at `127.0.0.1:5175` with `VITE_API_URL=http://127.0.0.1:4101/api`, isolated Edge CDP at port 9225, and `.runtime-tests` for its generated screenshot. It owns a loopback-only test API on 4101 and permits only the test origin there. The application's existing CORS configuration is not changed. Do not use a personal browser profile for this test.

## Known limits and next step

- Team acceptance is still required at the actual target workstation resolution; 1440×900 is the automated desktop check, not a substitute for the team's POC.
- The existing list response is unpaginated. No frontend N+1 was added; server-side pagination can be considered if data volume grows.
- Existing lint debt and legacy rootless destination restrictions remain explicit compatibility limits.
- No Git reset/clean/stash/commit/push, database reset, or db push was performed.

Next: **Manual team POC of redesigned Asset Request workspace**. Discuss hardware scan architecture separately afterward.

## Request preparation and Asset home-location amendment (2026-09-07)

These continuation notes supersede older workspace descriptions above where they differ.

Migration `20260907120000_request_preparation_asset_home` was applied once before the continuation run and was not reapplied. It adds nullable `assets.home_location_id`, prepared recipient and Specific Location fields on request lines, restricted foreign keys, and focused indexes. Its backfill updates only AVAILABLE Assets at an active storage-compatible current Location with no active allocation or assignment; it does not infer a home for ambiguous or operational legacy records.

Recipient and Specific Location are now requirement preparation data. They can be entered during creation, through Edit Request, or through Prepare in Requesting, and persist through Cancel Selection. Issue uses those prepared values and the Web Admin Issue action does not ask for them again. Missing/inactive preparation or a destination outside the request root blocks Issue.

A RESERVED line permits recipient, Specific Location, and line-remarks edits, but Category/measurement changes require Cancel Selection first. ISSUED, CONFIRMED, and RETURN_PENDING lines are locked. Final normal-return history remains locked; a completed swap can prepare its replacement while retaining historical specification. After any line issues, shared Job/root fields and requirement-list structure are locked. In a mixed PROCESSING Job, request remarks and eligible unissued lines remain editable.

Registration requires an active storage-compatible location and initializes both home and current verified location. Issue confirmation changes current location only. Normal and swap return confirmation derive the return destination from home, and the Web Admin does not ask for a return location. A caller-supplied compatibility override must exactly match home.

Unresolved legacy Assets are excluded from Find/Select and direct reservation is rejected. Their UI home label is explicit, and request-driven return confirmation is blocked until an administrator verifies a storage home. An AVAILABLE Asset with no active allocation/assignment can be resolved by saving a verified storage location. Non-request legacy assignments retain their generic direct-return compatibility path.

Final continuation validation:

- Prisma validate and normal Prisma generate passed; all 17 migrations are applied and the schema is up to date.
- Live audit: 67 Assets total; 17 have a resolved home and 50 remain intentionally unresolved. No safely identifiable backfill candidate remains. Unresolved statuses: 31 AVAILABLE, 8 RESERVED, 10 IN_USE, and 1 UNDER_MAINTENANCE.
- Server build and Web build passed.
- Focused lint for the changed Asset Request/Asset files passed. Full Web lint retains unrelated baseline debt: 23 errors and 1 warning.
- Runtime coverage passed for request edit restrictions, preparation readiness/persistence, cancel/reselect and concurrency, home initialization/correction, automatic normal/swap home return, wrong-EPC rollback, duplicate confirmation races, request progression, movement/audit timing, hierarchy revalidation, and legacy compatibility.
- Desktop Edge automation at 1440x900 passed create/edit, selection, preparation, cancel/reselect persistence, Issue without re-entry, wrong EPC, automatic-home normal/swap returns, replacement, and Completed history.
