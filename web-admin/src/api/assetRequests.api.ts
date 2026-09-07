import { api } from "./axios";
import type { BladeSku } from "./bladeSkus.api";
import type { AssetCategory } from "./assetCategories.api";

export type AssetRequestLine = {
  preparedRecipientUserId: number | null;
  specificLocationId: number | null;
  preparedRecipient?: { id: number; fullName: string; username: string; isActive: boolean } | null;
  specificLocation?: { id: number; name: string; isActive: boolean } | null;
  id: number;
  lineNo: number;
  bladeSkuId?: number | null;
  assetCategoryId?: number | null;
  measurementHeight?: string | number | null;
  measurementWidth?: string | number | null;
  quantityRequested: number;
  remarks?: string | null;
  bladeSku?: BladeSku | null;
  assetCategory?: AssetCategory | null;
  allocations: AssetRequestAllocation[];
  progress: LineProgress;
};

export type LineProgress = {
  quantitySelected: number;
  quantityPhysicallyIssued: number;
  quantityReturning: number;
  quantityConfirmed: number;
  quantityAwaitingConfirmation: number;
  replacementRequired: boolean;
  quantityRequested: number;
  quantityReserved: number;
  quantityIssued: number;
  quantityReturned: number;
  remainingToReserve: number;
  remainingToIssue: number;
  remainingToReturn: number;
};

export type AllocationAsset = {
  homeLocationId?: number | null;
  homeLocationPath?: string | null;
  itemName?: string;
  id: number;
  assetCode: string;
  status: string;
  condition: string;
  categoryId: number;
  measurementHeight?: string | number | null;
  measurementWidth?: string | number | null;
  category?: AssetCategory;
  locationId?: number | null;
  locationPath?: string | null;
  epc?: { epcCode: string; status: string; isActive: boolean } | null;
  location?: { id: number; locationCode: string; name: string; locationType: string } | null;
};

export type AssetRequestAllocation = {
  returnPurpose: "NORMAL_RETURN" | "SWAP";
  swapReason?: string | null;
  swapRemarks?: string | null;
  scanConfirmations?: Array<{ id: number; confirmationType: string; confirmationSource: string; confirmedAt: string; epc: string; remarks?: string | null; confirmedBy: { id: number; fullName: string } }>;
  id: number;
  status: "RESERVED" | "ISSUED" | "CONFIRMED" | "RETURN_PENDING" | "RETURNED" | "CANCELLED";
  reservedAt: string;
  cancelledAt?: string | null;
  remarks?: string | null;
  reservedBy: { id: number; username: string; fullName: string };
  asset: AllocationAsset;
  assignment?: {
    id: number;
    issuedAt?: string | null;
    assignedToUser: { id: number; username: string; fullName: string };
    assignedByUser: { id: number; username: string; fullName: string };
    location?: { id: number; locationCode: string; name: string; locationType: string } | null;
    returnedAt?: string | null;
    returnCondition?: string | null;
    returnRemarks?: string | null;
    returnLocation?: { id: number; locationCode: string; name: string; locationType: string } | null;
    returnedByUser?: { id: number; username: string; fullName: string } | null;
  } | null;
};

export type AvailableAsset = AllocationAsset & {
  category: AssetCategory;
};

export type AssetRequest = {
  rootLocationId: number | null;
  rootLocation?: { id: number; name: string; locationCode: string; isActive: boolean } | null;
  id: number;
  requestNo: string;
  jobNo?: string | null;
  productionOrderNo?: string | null;
  salesOrderNo?: string | null;
  externalPoNo?: string | null;
  partCode?: string | null;
  measurementHeight?: string | number | null;
  measurementWidth?: string | number | null;
  process?: string | null;
  sequence?: number | null;
  machineId?: number | null;
  diecutLocation?: string | null;
  status: "PENDING" | "PROCESSING" | "ISSUED" | "COMPLETED" | "CANCELLED";
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
  machine?: { id: number; machineCode: string; machineName: string } | null;
  requestedBy: { id: number; username: string; fullName: string; email?: string };
  lines: AssetRequestLine[];
  progress: {
    lineCount: number;
    totalQuantityRequested: number;
    totalQuantityReserved: number;
    totalQuantityIssued: number;
    totalQuantityReturned: number;
    totalRemainingToReserve: number;
    totalRemainingToIssue: number;
    totalRemainingToReturn: number;
  };
};

export type AssetRequestPayload = {
  rootLocationId: number;
  jobNo: string;
  remarks?: string;
  lines: Array<{ id?: number; assetCategoryId: number; measurementHeight: number; measurementWidth: number; remarks?: string; preparedRecipientUserId?: number | null; specificLocationId?: number | null }>;
};

function unwrap<T>(response: unknown): T {
  const value = response as { data?: unknown };
  const nested = value.data as { data?: unknown } | undefined;
  return (nested?.data ?? value.data ?? response) as T;
}

export async function getAssetRequestsApi() {
  return unwrap<AssetRequest[]>((await api.get("/asset-requests")).data);
}
export async function getAssetRequestApi(id: number) {
  return unwrap<AssetRequest>((await api.get(`/asset-requests/${id}`)).data);
}
export async function createAssetRequestApi(payload: AssetRequestPayload) {
  return unwrap<AssetRequest>((await api.post("/asset-requests", payload)).data);
}
export async function updateAssetRequestApi(id: number, payload: Partial<AssetRequestPayload>) {
  return unwrap<AssetRequest>((await api.patch(`/asset-requests/${id}`, payload)).data);
}
export async function cancelAssetRequestApi(id: number) {
  return unwrap<AssetRequest>((await api.post(`/asset-requests/${id}/cancel`)).data);
}

export async function getAvailableAssetsApi(requestId: number, lineId: number, search?: string) {
  return unwrap<AvailableAsset[]>((await api.get(`/asset-requests/${requestId}/lines/${lineId}/available-assets`, { params: { search: search || undefined } })).data);
}
export async function reserveAssetApi(requestId: number, lineId: number, assetId: number, remarks?: string) {
  return unwrap<{ allocation: AssetRequestAllocation; lineProgress: LineProgress; request: { id: number; requestNo: string; status: string } }>((await api.post(`/asset-requests/${requestId}/lines/${lineId}/reservations`, { assetId, remarks: remarks || undefined })).data);
}
export async function cancelReservationApi(allocationId: number) {
  return unwrap<{ allocation: AssetRequestAllocation; lineProgress: LineProgress; request: { id: number; requestNo: string; status: string } }>((await api.post(`/asset-request-allocations/${allocationId}/cancel`)).data);
}
export async function issueAssetApi(allocationId: number, payload: { remarks?: string } = {}) {
  return unwrap<{ allocation: AssetRequestAllocation; lineProgress: LineProgress; request: { id: number; requestNo: string; status: string }; productionLocationType: string }>((await api.post(`/asset-request-allocations/${allocationId}/issue`, payload)).data);
}
export async function confirmIssueApi(allocationId: number, payload: { epc: string; remarks?: string }) {
  return unwrap<{ allocation: AssetRequestAllocation; request: { id: number; requestNo: string; status: string } }>((await api.post(`/asset-request-allocations/${allocationId}/confirm-issue`, payload)).data);
}
export async function initiateReturnApi(assignmentId: number, payload: { returnPurpose?: "NORMAL_RETURN" | "SWAP"; swapReason?: string; remarks?: string } = {}) {
  return unwrap<unknown>((await api.post(`/asset-assignments/${assignmentId}/initiate-return`, payload)).data);
}
export async function confirmReturnApi(assignmentId: number, payload: { epc: string; condition: string; remarks?: string }) {
  return unwrap<unknown>((await api.post(`/asset-assignments/${assignmentId}/confirm-return`, payload)).data);
}
export async function returnAssetAssignmentApi(assignmentId: number, payload: { condition: string; remarks?: string }) {
  return unwrap<unknown>((await api.patch(`/asset-assignments/${assignmentId}/return`, payload)).data);
}
