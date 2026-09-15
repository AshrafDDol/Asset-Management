import { api, unwrap } from './client';

export type StockTakeItem = { id: number; expectedAssetCode: string; expectedItemName: string; expectedCategoryName: string; expectedEpc?: string | null; result: 'MISSING' | 'FOUND'; scannedAt?: string | null };
export type StockTake = {
  id: number; stockTakeNo: string; stockTakeDate: string; pic: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  location: { id: number; locationCode: string; name: string };
  items: StockTakeItem[];
  unexpected: Array<{ id: number; epc: string; scannedAt: string }>;
  summary: { expected: number; found: number; missing: number; unexpected: number };
};
export const getPendingStockTakes = async () => {
  const items = unwrap<StockTake[]>(await api.get('/stock-takes'));
  return items.filter(item => item.status === 'PENDING' || item.status === 'IN_PROGRESS');
};
export const getStockTake = async (id: number) => unwrap<StockTake>(await api.get(`/stock-takes/${id}`));
export const recordStockTakeScans = async (id: number, epcs: string[]) => unwrap<StockTake>(await api.post(`/stock-takes/${id}/scans`, { epcs }));
export const completeStockTake = async (id: number) => unwrap<StockTake>(await api.post(`/stock-takes/${id}/complete`));
