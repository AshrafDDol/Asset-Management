export type PrepareStartRepairInput = { assetId: number; reason: string; repairLocationId: number; remarks?: string };
export type ConfirmRepairInput = { epc: string; completionRemarks?: string };
