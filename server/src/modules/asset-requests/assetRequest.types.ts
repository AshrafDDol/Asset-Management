export type AssetRequestLineInput = {
  id?: number;
  preparedRecipientUserId?: number | null;
  specificLocationId?: number | null;
  assetCategoryId: number;
  measurementHeight: number | string;
  measurementWidth: number | string;
  remarks?: string | null;
};

export type CreateAssetRequestInput = {
  rootLocationId: number;
  jobNo: string;
  remarks?: string | null;
  lines: AssetRequestLineInput[];
};

export type UpdateAssetRequestInput = Partial<Omit<CreateAssetRequestInput, "lines">> & {
  lines?: AssetRequestLineInput[];
};

export type AssetRequestFilters = {
  status?: string;
  jobNo?: string;
  requestedBy?: number;
  search?: string;
};
