import { api } from "./axios";

type MovementLocation = {
  id: number;
  locationCode: string;
  name: string;
} | null;

type MovementDepartment = {
  id: number;
  departmentCode: string;
  name: string;
} | null;

export type AssetMovement = {
  id: number;
  movementNo: string;
  assetId: number;
  fromDepartmentId?: number | null;
  toDepartmentId?: number | null;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  movedByUserId: number;
  movementType: string;
  movementDate: string;
  reason?: string | null;
  remarks?: string | null;
  asset: { id: number; assetCode: string; itemName: string; status: string; condition: string };
  movedByUser: { id: number; username: string; fullName: string };
  fromDepartment: MovementDepartment;
  toDepartment: MovementDepartment;
  fromLocation: MovementLocation;
  toLocation: MovementLocation;
};

function unwrap<T>(response: unknown): T {
  const envelope = response as { data?: T };
  return (envelope.data ?? response) as T;
}

export async function getAssetMovementsApi(): Promise<AssetMovement[]> {
  const response = await api.get("/asset-movements");
  return unwrap<AssetMovement[]>(response.data);
}
