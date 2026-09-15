import { api } from './axios';

export type StockTakeItem = { id: number; assetId: number; expectedAssetCode: string; expectedItemName: string; expectedCategoryName: string; expectedEpc?: string | null; result: 'MISSING' | 'FOUND'; scannedAt?: string | null };
export type StockTake = {
  id: number; stockTakeNo: string; stockTakeDate: string; pic: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; createdAt: string; startedAt?: string | null; completedAt?: string | null;
  location: { id: number; locationCode: string; name: string };
  createdBy: { id: number; fullName: string };
  completedBy?: { id: number; fullName: string } | null;
  items: StockTakeItem[];
  scans: Array<{ id: number; epc: string; scannedAt: string }>;
  unexpected: Array<{ id: number; epc: string; scannedAt: string }>;
  summary: { expected: number; found: number; missing: number; unexpected: number };
};
const unwrap = <T,>(response: { data?: { data?: T } }) => response.data?.data as T;
export const getStockTakesApi = async () => unwrap<StockTake[]>(await api.get('/stock-takes'));
export const getStockTakeApi = async (id: number) => unwrap<StockTake>(await api.get(`/stock-takes/${id}`));
export const createStockTakeApi = async (payload: { locationId: number; stockTakeDate: string; pic: string }) => unwrap<StockTake>(await api.post('/stock-takes', payload));
export const completeStockTakeApi = async (id: number) => unwrap<StockTake>(await api.post(`/stock-takes/${id}/complete`));
export const cancelStockTakeApi = async (id: number) => unwrap<StockTake>(await api.post(`/stock-takes/${id}/cancel`));
