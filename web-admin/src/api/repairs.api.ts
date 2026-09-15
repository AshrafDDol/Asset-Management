import { api } from './axios';
import type { Asset } from './assets.api';
export type RepairTask = { id: number; action: 'START_REPAIR' | 'COMPLETE_REPAIR'; status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'; createdAt: string };
export type AssetRepair = { id: number; status: 'PREPARED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; reason: string; remarks?: string | null; repairLocationId: number; startedAt?: string | null; completedAt?: string | null; durationMs?: number | null; completionRemarks?: string | null; asset: Asset; repairLocation: { id: number; locationCode: string; name: string; isActive: boolean }; tasks: RepairTask[] };
const unwrap = <T,>(response: { data?: { data?: T } }) => response.data?.data as T;
export const getRepairsApi = async () => unwrap<AssetRepair[]>(await api.get('/repairs'));
export const prepareStartRepairApi = async (payload: { assetId: number; reason: string; repairLocationId: number; remarks?: string }) => unwrap<{ id: number }>(await api.post('/repairs/start', payload));
export const prepareCompleteRepairApi = async (repairId: number) => unwrap<{ id: number }>(await api.post(`/repairs/${repairId}/complete`));
export const cancelRepairTaskApi = async (taskId: number) => unwrap<{ taskId: number; status: string }>(await api.post(`/repairs/tasks/${taskId}/cancel`));
