export type ReserveAssetInput = {
  assetId: number;
  remarks?: string | null;
};

export type AvailableAssetFilters = {
  locationId?: number;
  search?: string;
};

export type IssueAssetInput = {
  assignedToUserId?: number;
  specificLocationId?: number;
  productionLocationId?: number;
  remarks?: string | null;
};

export type ConfirmIssueInput = {
  epc: string;
  remarks?: string | null;
};
