import { api } from "./axios";
import type { AssetCategory } from "./assetCategories.api";

export type BladeSku = {
  id: number;
  skuCode: string;
  name: string;
  categoryId: number;
  bladeType?: string | null;
  specification?: string | null;
  remarks?: string | null;
  isActive: boolean;
  category?: AssetCategory;
};

export type BladeSkuPayload = Omit<BladeSku, "id" | "category" | "isActive"> & { isActive?: boolean };
const unwrap = <T,>(response: unknown): T => {
  const value = response as { data?: unknown };
  const nested = value?.data as { data?: unknown } | undefined;
  return (nested?.data ?? value?.data ?? response) as T;
};
export async function getBladeSkusApi() { return unwrap<BladeSku[]>((await api.get("/blade-skus")).data); }
export async function createBladeSkuApi(payload: BladeSkuPayload) { return unwrap<BladeSku>((await api.post("/blade-skus", payload)).data); }
export async function updateBladeSkuApi(id: number, payload: Partial<BladeSkuPayload>) { return unwrap<BladeSku>((await api.patch(`/blade-skus/${id}`, payload)).data); }
export async function deactivateBladeSkuApi(id: number) { return unwrap<BladeSku>((await api.delete(`/blade-skus/${id}`)).data); }
