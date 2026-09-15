import { Prisma, StockTakeStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { CreateStockTakeInput, RecordStockTakeScansInput } from './stockTake.types';

const normalize = (value: unknown) => String(value ?? '').trim().toUpperCase();
const id = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError('Stock Take ID must be valid', 400);
  return parsed;
};
const include = {
  location: { select: { id: true, locationCode: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  completedBy: { select: { id: true, fullName: true } },
  items: { orderBy: { expectedAssetCode: 'asc' as const } },
  scans: { orderBy: { scannedAt: 'asc' as const } },
};

function present<T extends { items: Array<{ result: string; expectedEpc: string | null }>; scans: Array<{ epc: string }> }>(session: T) {
  const expected = new Set(session.items.map(item => normalize(item.expectedEpc)).filter(Boolean));
  const unexpected = session.scans.filter(scan => !expected.has(normalize(scan.epc)));
  const found = session.items.filter(item => item.result === 'FOUND').length;
  return { ...session, summary: { expected: session.items.length, found, missing: session.items.length - found, unexpected: unexpected.length }, unexpected };
}

export async function listStockTakes(status?: string) {
  const valid = status && Object.values(StockTakeStatus).includes(status as StockTakeStatus) ? status as StockTakeStatus : undefined;
  const sessions = await prisma.stockTakeSession.findMany({ where: valid ? { status: valid } : undefined, include, orderBy: { createdAt: 'desc' } });
  return sessions.map(present);
}

export async function getStockTake(value: unknown) {
  const session = await prisma.stockTakeSession.findUnique({ where: { id: id(value) }, include });
  if (!session) throw new AppError('Stock Take not found', 404);
  return present(session);
}

export async function createStockTake(input: CreateStockTakeInput, userId: number) {
  const locationId = Number(input.locationId);
  if (!Number.isInteger(locationId) || locationId <= 0) throw new AppError('Location is required', 400);
  const pic = input.pic?.trim();
  if (!pic) throw new AppError('PIC is required', 400);
  const stockTakeDate = new Date(`${input.stockTakeDate}T00:00:00.000Z`);
  if (!input.stockTakeDate || Number.isNaN(stockTakeDate.getTime())) throw new AppError('Date is required', 400);
  const sessionId = await prisma.$transaction(async tx => {
    const location = await tx.location.findUnique({ where: { id: locationId }, select: { id: true, isActive: true } });
    if (!location?.isActive) throw new AppError('Select an active IMS Location', 400);
    const assets = await tx.asset.findMany({ where: { locationId }, include: { category: true, epc: true }, orderBy: { assetCode: 'asc' } });
    const stamp = new Date();
    const prefix = `ST-${stamp.getUTCFullYear()}${String(stamp.getUTCMonth() + 1).padStart(2, '0')}${String(stamp.getUTCDate()).padStart(2, '0')}`;
    const latest = await tx.stockTakeSession.findFirst({ where: { stockTakeNo: { startsWith: prefix } }, orderBy: { stockTakeNo: 'desc' }, select: { stockTakeNo: true } });
    const parts = latest?.stockTakeNo.split('-');
    const sequence = parts ? Number(parts[parts.length - 1]) + 1 : 1;
    const session = await tx.stockTakeSession.create({
      data: {
        stockTakeNo: `${prefix}-${String(sequence).padStart(4, '0')}`,
        stockTakeDate, locationId, pic, createdByUserId: userId,
        items: { create: assets.map(asset => ({
          assetId: asset.id,
          expectedAssetCode: asset.assetCode,
          expectedItemName: asset.itemName,
          expectedCategoryName: asset.category.name,
          expectedEpc: normalize(asset.epc?.epcCode) || null,
        })) },
      }, select: { id: true },
    });
    return session.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return getStockTake(sessionId);
}

export async function recordStockTakeScans(value: unknown, input: RecordStockTakeScansInput) {
  const sessionId = id(value);
  const epcs = [...new Set((Array.isArray(input.epcs) ? input.epcs : []).map(normalize).filter(Boolean))];
  if (!epcs.length) throw new AppError('At least one EPC is required', 400);
  await prisma.$transaction(async tx => {
    const session = await tx.stockTakeSession.findUnique({ where: { id: sessionId }, select: { status: true } });
    if (!session) throw new AppError('Stock Take not found', 404);
    if (session.status !== StockTakeStatus.PENDING && session.status !== StockTakeStatus.IN_PROGRESS) throw new AppError('Only an open Stock Take can accept scans', 409);
    await tx.stockTakeSession.update({ where: { id: sessionId }, data: { status: StockTakeStatus.IN_PROGRESS, startedAt: session.status === StockTakeStatus.PENDING ? new Date() : undefined } });
    await tx.stockTakeScan.createMany({ data: epcs.map(epc => ({ sessionId, epc })), skipDuplicates: true });
    await tx.stockTakeItem.updateMany({ where: { sessionId, expectedEpc: { in: epcs } }, data: { result: 'FOUND', scannedAt: new Date() } });
  });
  return getStockTake(sessionId);
}

export async function completeStockTake(value: unknown, userId: number) {
  const sessionId = id(value);
  const changed = await prisma.stockTakeSession.updateMany({ where: { id: sessionId, status: { in: [StockTakeStatus.PENDING, StockTakeStatus.IN_PROGRESS] } }, data: { status: StockTakeStatus.COMPLETED, completedAt: new Date(), completedByUserId: userId } });
  if (!changed.count) throw new AppError('Stock Take is not open for completion', 409);
  return getStockTake(sessionId);
}

export async function cancelStockTake(value: unknown) {
  const sessionId = id(value);
  const changed = await prisma.stockTakeSession.updateMany({ where: { id: sessionId, status: { in: [StockTakeStatus.PENDING, StockTakeStatus.IN_PROGRESS] } }, data: { status: StockTakeStatus.CANCELLED } });
  if (!changed.count) throw new AppError('Stock Take is not open for cancellation', 409);
  return getStockTake(sessionId);
}
