import { api, unwrap } from './client';
import type { IssueLocation, IssuePerson } from './issueBatches';

export type WorkCounts = { processing: number; swap: number; return: number };
export type WorkAsset = {
  id: number;
  assetCode: string;
  itemName: string;
  status: string;
  epc?: { epcCode: string; status: string; isActive: boolean } | null;
  location?: IssueLocation | null;
  homeLocation?: IssueLocation | null;
};
export type ReturnItem = { id: number; assetId: number; asset: WorkAsset; assignment: { id: number; isActive: boolean; status: string } | null };
export type ReturnJob = {
  id: number;
  batchNo: string;
  jobNo?: string | null;
  defaultRecipient?: IssuePerson | null;
  pendingAssetCount: number;
  items: ReturnItem[];
};
export type SwapTask = {
  id: number;
  status: string;
  oldVerifiedEpc?: string | null;
  oldVerifiedAt?: string | null;
  oldVerifiedSource?: 'WEB_ADMIN' | 'HANDHELD' | null;
  newVerifiedEpc?: string | null;
  newVerifiedAt?: string | null;
  newVerifiedSource?: 'WEB_ADMIN' | 'HANDHELD' | null;
  issueBatch: { id: number; batchNo: string; jobNo?: string | null };
  targetItem: { id: number; asset: WorkAsset; assignment?: { isActive: boolean; status: string } | null };
  replacementAsset: WorkAsset;
};

export const getWorkCounts = async () => unwrap<WorkCounts>(await api.get('/handheld-work/counts'));
export const getReturnJobs = async () => unwrap<ReturnJob[]>(await api.get('/handheld-work/returns'));
export const confirmReturns = async (items: Array<{ itemId: number; assignmentId: number; assetId: number; epc: string }>, issueBatchId?: number) => unwrap<{ success: true; status: 'CONFIRMED' | 'ALREADY_CONFIRMED'; alreadyConfirmed: boolean; message: string; results: Array<{ epc: string; classification: string; assetId?: number }> }>(await api.post('/handheld-work/returns/confirm', { items, issueBatchId }));
export const getSwapTasks = async () => unwrap<SwapTask[]>(await api.get('/handheld-work/swaps'));
export const getSwapTask = async (id: number) => unwrap<SwapTask>(await api.get(`/handheld-work/swaps/${id}`));
export const verifySwapEpc = async (id: number, step: 'OLD' | 'REPLACEMENT', epc: string) => unwrap<SwapTask>(await api.post(`/handheld-work/swaps/${id}/verify`, { step, epc, source: 'HANDHELD' }));
export const confirmSwap = async (id: number, oldEpc: string, newEpc: string) => unwrap<{ success: true; status: 'CONFIRMED' | 'ALREADY_CONFIRMED'; alreadyConfirmed: boolean; message: string }>(await api.post(`/handheld-work/swaps/${id}/confirm`, { oldEpc, newEpc }));
export const cancelSwap = async (id: number, reason?: string) => unwrap<{ success: true; status: 'CANCELLED'; message: string }>(await api.post(`/handheld-work/swaps/${id}/cancel`, { reason }));
