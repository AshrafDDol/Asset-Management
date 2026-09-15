import assert from 'node:assert/strict';
import { prisma } from '../src/config/prisma';
import { createAsset } from '../src/modules/assets/asset.service';
import { validateNewEpcCode } from '../src/modules/asset-epcs/assetEpc.services';
import { confirmBatchItemIssue, createIssueBatch } from '../src/modules/issue-batches/issueBatch.services';
import { createStockTake, recordStockTakeScans } from '../src/modules/stock-takes/stockTake.services';

const REQUIRED_EXAMPLES = ['617368726166', 'BAA6178ABCDD58', 'BAA6178ABCDD5800', 'F801A1250700000000526346'];
const suffix = Date.now().toString();
const EPC_CASES = [12, 14, 16, 24].map((length, index) => `${'ABCDEF'[index]}${suffix}`.padEnd(length, String(index)).slice(0, length));
let userId = 0; let categoryId = 0; let locationId = 0; let destinationId = 0; let sessionId = 0; let batchId = 0; const assetIds: number[] = [];
async function main() {
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `variable-epc-${suffix}`, fullName: 'Variable EPC Runtime', email: `variable-epc-${suffix}@example.test`, passwordHash: 'runtime-only', roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `VE${suffix.slice(-8)}`, name: 'Variable EPC Runtime' } }); categoryId = category.id;
  const location = await prisma.location.create({ data: { locationCode: `VEH${suffix.slice(-7)}`, name: 'Variable EPC Rack', locationType: 'RACK' } }); locationId = location.id;
  const destination = await prisma.location.create({ data: { locationCode: `VED${suffix.slice(-7)}`, name: 'Variable EPC Destination', locationType: 'PRODUCTION_AREA' } }); destinationId = destination.id;
  assert.deepEqual(REQUIRED_EXAMPLES.map(validateNewEpcCode), REQUIRED_EXAMPLES);
  for (const [index, epcCode] of EPC_CASES.entries()) {
    const asset = await createAsset({ assetCode: `VE-${suffix}-${index}`, itemName: `Variable EPC ${epcCode.length}`, categoryId, locationId, epcCode: `  ${epcCode.toLowerCase()}  ` });
    assetIds.push(asset.id); assert.equal(asset.epc?.epcCode, epcCode);
  }
  assert.throws(() => validateNewEpcCode('ABC123Z9'), /even number of hexadecimal/);
  assert.throws(() => validateNewEpcCode('ABC1234'), /even number of hexadecimal/);
  assert.throws(() => validateNewEpcCode('  '), /required/);

  const stockTake = await createStockTake({ locationId, stockTakeDate: new Date().toISOString().slice(0, 10), pic: 'Variable EPC PIC' }, userId); sessionId = stockTake.id;
  const scanned = await recordStockTakeScans(sessionId, { epcs: EPC_CASES.map(epc => ` ${epc.toLowerCase()} `) });
  assert.deepEqual(scanned.summary, { expected: 4, found: 4, missing: 0, unexpected: 0 });

  const batch = await createIssueBatch({ assetIds: [assetIds[0]], jobNo: `VARIABLE-EPC-${suffix}`, defaultRecipientUserId: userId, defaultToLocationId: destinationId }, userId); batchId = batch.id;
  await assert.rejects(() => confirmBatchItemIssue(batch.items[0].id, EPC_CASES[1], undefined, userId), /does not match/);
  await confirmBatchItemIssue(batch.items[0].id, ` ${EPC_CASES[0].toLowerCase()} `, undefined, userId);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetIds[0] } })).status, 'IN_USE');
  console.log(JSON.stringify({ passed: true, acceptedLengths: EPC_CASES.map(epc => epc.length), invalidNonHexRejected: true, invalidOddRejected: true, emptyRejected: true, exactMismatchRejected: true, normalizedExactMatch: true, stockTakeShortEpcFound: true }, null, 2));
}
main().finally(async () => {
  try {
    if (sessionId) await prisma.stockTakeSession.delete({ where: { id: sessionId } });
    if (assetIds.length) { await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } }); }
    if (batchId) { await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: batchId } }); await prisma.issueBatch.delete({ where: { id: batchId } }); }
    if (assetIds.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }); }
    if (categoryId) await prisma.assetCategory.delete({ where: { id: categoryId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); if (locationId || destinationId) await prisma.location.deleteMany({ where: { id: { in: [locationId, destinationId].filter(Boolean) } } });
  } finally { await prisma.$disconnect(); }
}).catch(error => { console.error(error); process.exitCode = 1; });
