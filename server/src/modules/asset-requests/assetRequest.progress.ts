type AllocationStatus = "RESERVED" | "ISSUED" | "CONFIRMED" | "RETURN_PENDING" | "RETURNED" | "CANCELLED";
export type AllocationState = { status: AllocationStatus; returnPurpose?: string; asset?: { status?: string; locationId?: number | null } };
type RequestLineProgressInput = { quantityRequested: number; allocations?: AllocationState[] };

const SELECTED_STATUSES: AllocationStatus[] = ["RESERVED", "ISSUED", "CONFIRMED", "RETURN_PENDING", "RETURNED"];
const PHYSICALLY_ISSUED_STATUSES: AllocationStatus[] = ["CONFIRMED", "RETURN_PENDING", "RETURNED"];

export function calculateLineProgress(line: RequestLineProgressInput) {
  const history = line.allocations || [];
  const allocations = history.filter((item) => !(item.returnPurpose === "SWAP" && item.status === "RETURNED"));
  const quantityReserved = allocations.filter((item) => item.status === "RESERVED").length;
  const quantityIssued = allocations.filter((item) => item.returnPurpose !== "SWAP" && (item.status === "CONFIRMED" || item.status === "RETURN_PENDING" || (item.status === "ISSUED" && item.asset?.status === "IN_USE"))).length;
  const quantityReturned = allocations.filter((item) => item.status === "RETURNED").length;
  const quantitySelected = allocations.filter((item) => SELECTED_STATUSES.includes(item.status)).length;
  const quantityPhysicallyIssued = allocations.filter((item) => item.returnPurpose !== "SWAP" && (PHYSICALLY_ISSUED_STATUSES.includes(item.status) || (item.status === "ISSUED" && item.asset?.status === "IN_USE"))).length;
  const quantityReturning = allocations.filter((item) => item.status === "RETURN_PENDING").length;
  const replacementRequired = history.some((item) => item.returnPurpose === "SWAP" && item.status === "RETURNED") && quantitySelected < line.quantityRequested;
  const hasActive = allocations.some((item) => ["RESERVED", "ISSUED", "CONFIRMED", "RETURN_PENDING"].includes(item.status));
  return {
    quantitySelected,
    quantityPhysicallyIssued,
    quantityReturning,
    quantityConfirmed: allocations.filter((item) => item.status === "CONFIRMED" || (item.status === "ISSUED" && item.asset?.status === "IN_USE")).length,
    quantityAwaitingConfirmation: allocations.filter((item) => item.status === "ISSUED" && item.asset?.status !== "IN_USE").length,
    replacementRequired,
    hasActive,
    hasSwap: history.some((item) => item.returnPurpose === "SWAP"),
    quantityRequested: line.quantityRequested,
    quantityReserved,
    quantityIssued,
    quantityReturned,
    remainingToReserve: Math.max(0, line.quantityRequested - quantitySelected),
    remainingToIssue: Math.max(0, line.quantityRequested - quantityPhysicallyIssued),
    remainingToReturn: allocations.filter((item) => item.status === "CONFIRMED" || item.status === "RETURN_PENDING" || (item.status === "ISSUED" && item.asset?.status === "IN_USE")).length,
  };
}

export function calculateRequestProgress(lines: RequestLineProgressInput[]) {
  const lineProgress = lines.map(calculateLineProgress);
  return {
    lineCount: lines.length,
    totalQuantityRequested: lineProgress.reduce((sum, line) => sum + line.quantityRequested, 0),
    totalQuantityReserved: lineProgress.reduce((sum, line) => sum + line.quantityReserved, 0),
    totalQuantityIssued: lineProgress.reduce((sum, line) => sum + line.quantityIssued, 0),
    totalQuantityReturned: lineProgress.reduce((sum, line) => sum + line.quantityReturned, 0),
    totalRemainingToReserve: lineProgress.reduce((sum, line) => sum + line.remainingToReserve, 0),
    totalRemainingToIssue: lineProgress.reduce((sum, line) => sum + line.remainingToIssue, 0),
    totalRemainingToReturn: lineProgress.reduce((sum, line) => sum + line.remainingToReturn, 0),
  };
}
