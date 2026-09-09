import { api } from "./axios";
import type { Asset } from "./assets.api";
import type { Location } from "./locations.api";
import type { User } from "./users.api";

export type IssueBatchItem = {
  id: number; issueBatchId: number; assetId: number; status: string;
  replacementForItemId?: number | null;
  recipientUserId?: number | null; toLocationId?: number | null;
  remarks?: string | null; asset: Asset; recipient?: User | null; toLocation?: Location | null;
  assignment?: { id: number; issuedAt?: string | null; isActive: boolean; status: string; locationId?: number | null } | null;
};
export type IssueBatch = { id: number; batchNo: string; jobNo?: string | null; status: string; remarks?: string | null; defaultRecipientUserId?: number | null; defaultToLocationId?: number | null; items: IssueBatchItem[]; createdAt: string };
export type ScanResult = {
  epc: string; classification: string; assetId?: number; assetCode?: string; itemId?: number;
  batchNo?: string; jobNo?: string | null; recipient?: string | null; toLocation?: string | null;
};
export type ReturnScanResult = {
  epc: string;
  classification: "RETURNED" | "ALREADY_RETURNED" | "NOT_IN_USE" | "INVALID_OR_INACTIVE_EPC" | "DUPLICATE_SCAN" | "HOME_LOCATION_UNRESOLVED" | "NO_ACTIVE_ASSIGNMENT";
  assetId?: number;
  assetCode?: string;
  previousLocation?: string | null;
  homeLocation?: string | null;
};
const unwrap = <T,>(value: { data?: { data?: T } }) => value.data?.data as T;
export const getIssueBatchesApi = async () => unwrap<IssueBatch[]>((await api.get("/issue-batches")));
export const createIssueBatchApi = async (payload: { assetIds: number[]; jobNo?: string; defaultRecipientUserId?: number; defaultToLocationId?: number; remarks?: string; items?: Array<{ assetId: number; recipientUserId?: number; toLocationId?: number }> }) => unwrap<IssueBatch>(await api.post("/issue-batches", payload));
export const addAssetsToIssueBatchApi = async (id: number, payload: { assetIds: number[]; jobNo: string; defaultRecipientUserId?: number; defaultToLocationId?: number; remarks?: string; items?: Array<{ assetId: number; recipientUserId?: number; toLocationId?: number }> }) => unwrap<IssueBatch>(await api.post(`/issue-batches/${id}/items`, payload));
export const swapIssueBatchAssetApi = async (id: number, payload: { replacementAssetId: number; targetItemId: number; epc?: string; remarks?: string }) => unwrap<IssueBatch>(await api.post(`/issue-batches/${id}/swap`, payload));
export const cancelIssueBatchApi = async (id: number) => unwrap<{ batch: IssueBatch; cancelledCount: number; confirmedCount: number }>(await api.post(`/issue-batches/${id}/cancel`));
export const cancelBatchIssueApi = async (id: number) => unwrap<IssueBatch>(await api.post(`/issue-batches/items/${id}/cancel-issue`));
export const compareBatchScansApi = async (id: number, epcs: string[], remarks?: string) => unwrap<{ batch: IssueBatch; results: ScanResult[] }>(await api.post(`/issue-batches/${id}/scan-comparison`, { epcs, remarks }));
export const scanAllJobsApi = async (epcs: string[], remarks?: string) => unwrap<{ results: ScanResult[] }>(await api.post("/issue-batches/scan-all-jobs", { epcs, remarks }));
export const confirmBatchItemIssueApi = async (id: number, epc: string, remarks?: string) => unwrap<IssueBatch>(await api.post(`/issue-batches/items/${id}/confirm-issue`, { epc, remarks }));
export const returnScanApi = async (epcs: string[], remarks?: string) => unwrap<{ results: ReturnScanResult[] }>(await api.post("/issue-batches/return-scan", { epcs, remarks }));
