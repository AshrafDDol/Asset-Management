export type CreateIssueBatchInput = {
  assetIds: number[];
  jobNo?: string;
  defaultRecipientUserId?: number;
  defaultToLocationId?: number;
  remarks?: string;
  items?: Array<{ assetId: number; recipientUserId?: number | null; toLocationId?: number | null; remarks?: string }>;
};

export type ScanComparisonInput = { epcs: string[]; remarks?: string };
export type ScanAllJobsInput = { epcs: string[]; remarks?: string };
export type SwapIssueBatchAssetInput = { replacementAssetId: number; targetItemId: number; epc?: string; remarks?: string };
export type ReturnScanInput = { epcs: string[]; remarks?: string };
