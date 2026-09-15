import { api, unwrap } from './client';
export type RepairAsset = { id: number; assetCode: string; itemName: string; status: string; isActive: boolean; epc?: { epcCode: string; status: string; isActive: boolean } | null };
export type RepairTask = {
  id: number; action: 'START_REPAIR' | 'COMPLETE_REPAIR'; status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'; createdAt: string;
  repair: { id: number; status: string; reason: string; remarks?: string | null; startedAt?: string | null; durationMs?: number | null; asset: RepairAsset; repairLocation: { id: number; locationCode: string; name: string } };
};
export const getRepairTasks = async () => unwrap<RepairTask[]>(await api.get('/repairs/tasks'));
export const getRepairTask = async (id: number) => unwrap<RepairTask>(await api.get(`/repairs/tasks/${id}`));
export const confirmRepairTask = async (id: number, epc: string, completionRemarks?: string) => unwrap<{ id: number; status: string; startedAt?: string | null; completedAt?: string | null; durationMs?: number | null }>(await api.post(`/repairs/tasks/${id}/confirm`, { epc, completionRemarks }));
export const cancelRepairTask = async (id: number) => unwrap<{ taskId: number; status: string }>(await api.post(`/repairs/tasks/${id}/cancel`));
