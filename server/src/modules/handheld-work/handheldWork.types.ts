export type PrepareSwapInput = {
  issueBatchId: number;
  targetItemId: number;
  replacementAssetId: number;
  remarks?: string;
  oldVerifiedEpc?: string;
};

export type ConfirmSwapInput = { oldEpc: string; newEpc: string };
export type VerifySwapInput = {
  step: 'OLD' | 'REPLACEMENT';
  epc: string;
  source: 'WEB_ADMIN' | 'HANDHELD';
};
export type CancelSwapInput = { reason?: string };
export type ConfirmReturnsInput = { issueBatchId?: number; items: Array<{ itemId: number; assignmentId: number; assetId: number; epc: string }>; remarks?: string };
