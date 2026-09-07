import { AssetRequestStatus, Prisma } from "@prisma/client";
import { calculateLineProgress } from "./assetRequest.progress";

export async function recalculateRequestStatus(tx: Prisma.TransactionClient, requestId: number) {
  const request = await tx.assetRequest.findUnique({ where: { id: requestId }, select: { status: true } });
  if (!request || request.status === AssetRequestStatus.CANCELLED) return request?.status;
  const lines = await tx.assetRequestLine.findMany({
    where: { requestId },
    select: { quantityRequested: true, allocations: { select: { status: true, returnPurpose: true, asset: { select: { status: true } } } } },
  });
  const progress = lines.map(calculateLineProgress);
  const allReturned = progress.length > 0 && progress.every((line) => line.quantityReturned >= line.quantityRequested && !line.hasActive);
  const allIssued = progress.length > 0 && progress.every((line) => line.remainingToIssue === 0);
  const started = progress.some((line) => line.hasActive || line.hasSwap || line.quantityReturned > 0);
  const status = allReturned ? AssetRequestStatus.COMPLETED
    : allIssued ? AssetRequestStatus.ISSUED
    : started ? AssetRequestStatus.PROCESSING : AssetRequestStatus.PENDING;
  if (status !== request.status) await tx.assetRequest.update({ where: { id: requestId }, data: { status } });
  return status;
}
