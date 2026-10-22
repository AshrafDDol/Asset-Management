import { api, unwrap } from './client';

export type FindAssetResult = {
  id: number;
  assetCode: string;
  itemName: string;
  locationPath?: string | null;
  location?: { id: number; locationCode: string; name: string } | null;
  epc?: { epcCode: string; status: string; isActive: boolean } | null;
};

const hasActiveEpc = (asset: FindAssetResult): boolean =>
  Boolean(
    asset.epc?.isActive &&
      asset.epc.status === 'ACTIVE' &&
      asset.epc.epcCode?.trim(),
  );

export const searchFindAssets = async (query: string): Promise<FindAssetResult[]> => {
  const term = query.trim();
  if (!term) return [];
  const responses = await Promise.all([
    api.get('/assets', { params: { assetCode: term } }),
    api.get('/assets', { params: { itemName: term } }),
    api.get('/assets', { params: { epc: term } }),
  ]);
  const merged = new Map<number, FindAssetResult>();
  responses.forEach(response => {
    unwrap<FindAssetResult[]>(response).forEach(asset => {
      if (hasActiveEpc(asset)) merged.set(asset.id, asset);
    });
  });
  return Array.from(merged.values());
};
