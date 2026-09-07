import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/config/prisma";
import { createAsset, updateAsset } from "../src/modules/assets/asset.service";
import { createAssetRequest, getAssetRequestById, updateAssetRequest } from "../src/modules/asset-requests/assetRequest.services";
import { cancelReservation, confirmIssue, getAvailableAssets, issueAsset, reserveAsset } from "../src/modules/asset-request-allocations/assetRequestAllocation.services";
import { confirmAssetReturn, initiateAssetReturn, returnAssetAssignment } from "../src/modules/asset-assignments/assetAssignment.services";
import { createLocation, getLocationById } from "../src/modules/locations/location.services";

const suffix = `${Date.now()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const assetIds: number[] = [];
const locationIds: number[] = [];
const departmentIds: number[] = [];
let requestId: number | undefined;
let legacyRequestId: number | undefined;
let swapRequestId: number | undefined;
let preparationRequestId: number | undefined;

function successes(results: PromiseSettledResult<unknown>[]) {
  return results.filter((result) => result.status === "fulfilled").length;
}

async function main() {
  const [user, category] = await Promise.all([
    prisma.user.findFirst({ where: { isActive: true } }),
    prisma.assetCategory.findFirst({ where: { isActive: true } }),
  ]);
  assert(user && category, "Runtime test needs an active user and category");

  const storeDepartment = await prisma.department.create({ data: { departmentCode: `POC-STORE-${suffix}`, name: "POC Store" } });
  const productionDepartment = await prisma.department.create({ data: { departmentCode: `POC-PROD-${suffix}`, name: "POC Production" } });
  departmentIds.push(storeDepartment.id, productionDepartment.id);
  async function trackedLocation(input: Parameters<typeof createLocation>[0]) {
    const location = await createLocation(input);
    locationIds.push(location.id);
    return location;
  }
  const storeRoot = await trackedLocation({ locationCode: `POC-STORE-${suffix}`, name: "Store", locationType: "STORE", departmentId: storeDepartment.id });
  const rack = await trackedLocation({ locationCode: `POC-RACK-${suffix}`, name: "Rack A", locationType: "RACK", parentLocationId: storeRoot.id });
  const storage = await trackedLocation({ locationCode: `POC-BIN-${suffix}`, name: "Bin 01", locationType: "BIN", parentLocationId: rack.id });
  const operationRoot = await trackedLocation({ locationCode: `POC-OP-${suffix}`, name: "Operation", locationType: "OTHER", departmentId: productionDepartment.id });
  const production = await trackedLocation({ locationCode: `POC-PRODUCTION-${suffix}`, name: "Production D01", locationType: "PRODUCTION_AREA", parentLocationId: operationRoot.id });
  const overrideRoot = await trackedLocation({ locationCode: `POC-OVERRIDE-ROOT-${suffix}`, name: "Override Root", locationType: "OTHER", departmentId: storeDepartment.id });
  const overrideChild = await trackedLocation({ locationCode: `POC-OVERRIDE-CHILD-${suffix}`, name: "Override Child", locationType: "OTHER", parentLocationId: overrideRoot.id, departmentId: productionDepartment.id });
  const overrideGrandchild = await trackedLocation({ locationCode: `POC-OVERRIDE-GRANDCHILD-${suffix}`, name: "Override Grandchild", locationType: "OTHER", parentLocationId: overrideChild.id });
  const noDepartmentRoot = await trackedLocation({ locationCode: `POC-NONE-ROOT-${suffix}`, name: "No Department Root", locationType: "OTHER" });
  const noDepartmentChild = await trackedLocation({ locationCode: `POC-NONE-CHILD-${suffix}`, name: "No Department Child", locationType: "OTHER", parentLocationId: noDepartmentRoot.id });

  assert.equal((await getLocationById(storage.id)).resolvedDepartment?.id, storeDepartment.id);
  assert.equal((await getLocationById(overrideGrandchild.id)).resolvedDepartment?.id, productionDepartment.id);
  assert.equal((await getLocationById(noDepartmentChild.id)).resolvedDepartment, null);

  const autoOne = await createAsset({ assetCode: `POC-A-${suffix}`, categoryId: category.id, locationId: storage.id, measurementHeight: 111, measurementWidth: 222, autoGenerateEpc: true });
  const autoTwo = await createAsset({ assetCode: `POC-B-${suffix}`, categoryId: category.id, locationId: storage.id, measurementHeight: 111, measurementWidth: 222, autoGenerateEpc: true });
  assetIds.push(autoOne.id, autoTwo.id);
  assert.match(autoOne.epc?.epcCode || "", /^[0-9A-F]{24}$/);
  assert.match(autoTwo.epc?.epcCode || "", /^[0-9A-F]{24}$/);
  assert.notEqual(autoOne.epc?.epcCode, autoTwo.epc?.epcCode);
  assert.equal(autoOne.homeLocationId, storage.id);
  assert.equal(autoOne.locationId, storage.id);

  const manualEpc = randomBytes(12).toString("hex").toUpperCase();
  const manual = await createAsset({ assetCode: `POC-C-${suffix}`, categoryId: category.id, locationId: storage.id, measurementHeight: 111, measurementWidth: 222, epc: manualEpc.toLowerCase() });
  assetIds.push(manual.id);
  assert.equal(manual.epc?.epcCode, manualEpc);
  await assert.rejects(() => createAsset({ assetCode: `POC-D-${suffix}`, categoryId: category.id, locationId: storage.id, measurementHeight: 111, measurementWidth: 222, epc: manualEpc }));
  const movedHome = await updateAsset(autoOne.id, { locationId: rack.id });
  assert.equal(movedHome.locationId, rack.id);
  assert.equal(movedHome.homeLocationId, rack.id);
  const restoredHome = await updateAsset(autoOne.id, { locationId: storage.id });
  assert.equal(restoredHome.locationId, storage.id);
  assert.equal(restoredHome.homeLocationId, storage.id);

  const request = await createAssetRequest({ jobNo: `POC-${suffix}`, rootLocationId: operationRoot.id, lines: [
    { assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: production.id },
    { assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: operationRoot.id },
  ] }, user.id);
  requestId = request.id;
  const [lineOne, lineTwo] = request.lines;
  const pendingEdit = await updateAssetRequest(request.id, { jobNo: `POC-EDITED-${suffix}`, remarks: "Pending edit", lines: request.lines.map((line) => ({ id: line.id, assetCategoryId: line.assetCategoryId!, measurementHeight: Number(line.measurementHeight), measurementWidth: Number(line.measurementWidth), remarks: line.remarks, preparedRecipientUserId: line.preparedRecipientUserId, specificLocationId: line.specificLocationId })) });
  assert.equal(pendingEdit.jobNo, `POC-EDITED-${suffix}`);

  const firstReservation = await reserveAsset(request.id, lineOne.id, { assetId: autoOne.id }, user.id);
  await cancelReservation(firstReservation.allocation.id);
  const reselection = await reserveAsset(request.id, lineOne.id, { assetId: autoOne.id }, user.id);
  await assert.rejects(() => updateAssetRequest(request.id, { lines: [
    { id: lineOne.id, assetCategoryId: category.id, measurementHeight: 112, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: production.id },
    { id: lineTwo.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, remarks: "Processing edit", preparedRecipientUserId: user.id, specificLocationId: operationRoot.id },
  ] }));
  const processingEdit = await updateAssetRequest(request.id, { lines: [
    { id: lineOne.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, remarks: "Reserved remarks allowed", preparedRecipientUserId: user.id, specificLocationId: production.id },
    { id: lineTwo.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, remarks: "Processing edit", preparedRecipientUserId: user.id, specificLocationId: operationRoot.id },
  ] });
  assert.equal(processingEdit.lines[1].remarks, "Processing edit");
  const allocationHistory = await prisma.assetRequestAllocation.findMany({ where: { requestLineId: lineOne.id, assetId: autoOne.id }, orderBy: { id: "asc" } });
  assert.deepEqual(allocationHistory.map((row) => row.status), ["CANCELLED", "RESERVED"]);

  const concurrentReservation = await Promise.allSettled([
    reserveAsset(request.id, lineTwo.id, { assetId: autoTwo.id }, user.id),
    reserveAsset(request.id, lineTwo.id, { assetId: autoTwo.id }, user.id),
  ]);
  assert.equal(successes(concurrentReservation), 1);
  const secondAllocation = await prisma.assetRequestAllocation.findFirstOrThrow({ where: { requestLineId: lineTwo.id, assetId: autoTwo.id, status: "RESERVED" } });

  await assert.rejects(() => updateAssetRequest(request.id, { lines: [
    { id: lineOne.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: storage.id },
    { id: lineTwo.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: operationRoot.id },
  ] }));
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: autoOne.id } })).status, "RESERVED");
  assert.equal(await prisma.assetAssignment.count({ where: { assetId: autoOne.id } }), 0);
  const firstIssue = await issueAsset(reselection.allocation.id, {}, user.id);
  const mixedEdit = await updateAssetRequest(request.id, { remarks: "Mixed request header edit", lines: [
    { id: lineOne.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, remarks: "Reserved remarks allowed", preparedRecipientUserId: user.id, specificLocationId: production.id },
    { id: lineTwo.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, remarks: "Processing edit", preparedRecipientUserId: user.id, specificLocationId: operationRoot.id },
  ] });
  assert.equal(mixedEdit.remarks, "Mixed request header edit");
  await assert.rejects(() => updateAssetRequest(request.id, { lines: request.lines.map((line) => ({ id: line.id, assetCategoryId: line.assetCategoryId!, measurementHeight: Number(line.measurementHeight), measurementWidth: Number(line.measurementWidth), preparedRecipientUserId: line.preparedRecipientUserId, specificLocationId: line.id === lineOne.id ? operationRoot.id : line.specificLocationId })) }));
  const secondIssue = await issueAsset(secondAllocation.id, {}, user.id);
  const issueState = await prisma.asset.findUniqueOrThrow({ where: { id: autoOne.id } });
  assert.equal(issueState.status, "PENDING_CONFIRMATION");
  assert.equal(issueState.locationId, storage.id);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: autoOne.id } }), 0);

  await prisma.location.update({ where: { id: production.id }, data: { parentLocationId: storeRoot.id } });
  await assert.rejects(() => confirmIssue(reselection.allocation.id, { epc: autoOne.epc!.epcCode }, user.id));
  assert.equal(await prisma.assetMovement.count({ where: { assetId: autoOne.id } }), 0);
  await prisma.location.update({ where: { id: production.id }, data: { parentLocationId: operationRoot.id } });
  await assert.rejects(() => confirmIssue(reselection.allocation.id, { epc: manualEpc }, user.id));
  assert.equal((await prisma.assetRequestAllocation.findUniqueOrThrow({ where: { id: reselection.allocation.id } })).status, "ISSUED");
  assert.equal(await prisma.assetScanConfirmation.count({ where: { requestAllocationId: reselection.allocation.id } }), 0);

  const issueConfirmationRace = await Promise.allSettled([
    confirmIssue(reselection.allocation.id, { epc: autoOne.epc!.epcCode }, user.id),
    confirmIssue(reselection.allocation.id, { epc: autoOne.epc!.epcCode }, user.id),
  ]);
  assert.equal(successes(issueConfirmationRace), 1);
  await assert.rejects(() => updateAsset(autoOne.id, { locationId: rack.id }), /only be changed while the Asset is AVAILABLE/);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { requestAllocationId: reselection.allocation.id, confirmationType: "ISSUE_CONFIRMATION" } }), 1);
  const issueAudit = await prisma.assetScanConfirmation.findFirstOrThrow({ where: { requestAllocationId: reselection.allocation.id, confirmationType: "ISSUE_CONFIRMATION" } });
  assert.equal(issueAudit.confirmationSource, "WEB_ADMIN");
  assert.equal(issueAudit.confirmedByUserId, user.id);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: autoOne.id } }), 1);
  const issueMovement = await prisma.assetMovement.findFirstOrThrow({ where: { assetId: autoOne.id, reason: { startsWith: "ISSUE CONFIRMED:" } } });
  assert.equal(issueMovement.fromDepartmentId, storeDepartment.id);
  assert.equal(issueMovement.toDepartmentId, productionDepartment.id);
  assert.equal((await getAssetRequestById(request.id)).status, "PROCESSING");
  await prisma.asset.update({ where: { id: autoOne.id }, data: { homeLocationId: null } });
  await assert.rejects(() => updateAsset(autoOne.id, { homeLocationId: production.id }), /active and storage-compatible/);
  const operationalHome = await updateAsset(autoOne.id, { homeLocationId: storage.id });
  assert.equal(operationalHome.homeLocationId, storage.id);
  assert.equal(operationalHome.locationId, production.id);
  await assert.rejects(() => updateAsset(autoOne.id, { homeLocationId: rack.id }), /already verified/);

  await confirmIssue(secondAllocation.id, { epc: autoTwo.epc!.epcCode }, user.id);
  assert.equal((await getAssetRequestById(request.id)).status, "ISSUED");

  await initiateAssetReturn(firstIssue.assignment.id);
  const pendingReturn = await prisma.assetAssignment.findUniqueOrThrow({ where: { id: firstIssue.assignment.id } });
  assert.equal(pendingReturn.status, "ACTIVE");
  assert.equal(pendingReturn.returnedAt, null);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: autoOne.id } })).status, "RETURN_PENDING");
  assert.equal(await prisma.assetMovement.count({ where: { assetId: autoOne.id } }), 1);
  await assert.rejects(() => confirmAssetReturn(firstIssue.assignment.id, { epc: manualEpc, condition: "GOOD", returnLocationId: storage.id }, user.id));
  assert.equal((await prisma.assetRequestAllocation.findUniqueOrThrow({ where: { id: reselection.allocation.id } })).status, "RETURN_PENDING");
  assert.equal(await prisma.assetScanConfirmation.count({ where: { requestAllocationId: reselection.allocation.id, confirmationType: "RETURN_CONFIRMATION" } }), 0);
  await assert.rejects(() => confirmAssetReturn(firstIssue.assignment.id, { epc: autoOne.epc!.epcCode, condition: "GOOD", returnLocationId: rack.id }, user.id));
  await confirmAssetReturn(firstIssue.assignment.id, { epc: autoOne.epc!.epcCode, condition: "GOOD" }, user.id);
  const returnMovement = await prisma.assetMovement.findFirstOrThrow({ where: { assetId: autoOne.id, reason: { startsWith: "RETURN CONFIRMED:" } } });
  assert.equal(returnMovement.fromDepartmentId, productionDepartment.id);
  assert.equal(returnMovement.toDepartmentId, storeDepartment.id);
  assert.equal(returnMovement.toLocationId, autoOne.homeLocationId);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: autoOne.id } })).homeLocationId, storage.id);
  assert.equal((await getAssetRequestById(request.id)).status, "ISSUED");

  await initiateAssetReturn(secondIssue.assignment.id);
  const returnConfirmationRace = await Promise.allSettled([
    confirmAssetReturn(secondIssue.assignment.id, { epc: autoTwo.epc!.epcCode, condition: "GOOD", returnLocationId: storage.id }, user.id),
    confirmAssetReturn(secondIssue.assignment.id, { epc: autoTwo.epc!.epcCode, condition: "GOOD", returnLocationId: storage.id }, user.id),
  ]);
  assert.equal(successes(returnConfirmationRace), 1);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { requestAllocationId: secondAllocation.id, confirmationType: "RETURN_CONFIRMATION" } }), 1);
  const returnAudit = await prisma.assetScanConfirmation.findFirstOrThrow({ where: { requestAllocationId: secondAllocation.id, confirmationType: "RETURN_CONFIRMATION" } });
  assert.equal(returnAudit.confirmationSource, "WEB_ADMIN");
  assert.equal(returnAudit.confirmedByUserId, user.id);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: autoTwo.id } }), 2);
  assert.equal((await getAssetRequestById(request.id)).status, "COMPLETED");

  const preparationRequest = await createAssetRequest({ jobNo: `PREP-${suffix}`, rootLocationId: operationRoot.id, lines: [
    { assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222 },
  ] }, user.id);
  preparationRequestId = preparationRequest.id;
  const preparationLine = preparationRequest.lines[0];
  await prisma.asset.update({ where: { id: autoOne.id }, data: { homeLocationId: null } });
  assert.equal((await getAvailableAssets(preparationRequest.id, preparationLine.id)).some((asset) => asset.id === autoOne.id), false);
  await assert.rejects(() => reserveAsset(preparationRequest.id, preparationLine.id, { assetId: autoOne.id }, user.id), /home location is unresolved/);
  const resolvedLegacyHome = await updateAsset(autoOne.id, { locationId: storage.id });
  assert.equal(resolvedLegacyHome.homeLocationId, storage.id);
  const preparationReservation = await reserveAsset(preparationRequest.id, preparationLine.id, { assetId: autoOne.id }, user.id);
  await assert.rejects(() => issueAsset(preparationReservation.allocation.id, {}, user.id), /Needs Recipient/);
  await updateAssetRequest(preparationRequest.id, { lines: [{ id: preparationLine.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: null }] });
  await assert.rejects(() => issueAsset(preparationReservation.allocation.id, {}, user.id), /Needs Specific Location/);
  await assert.rejects(() => updateAssetRequest(preparationRequest.id, { lines: [{ id: preparationLine.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: storage.id }] }));
  const prepared = await updateAssetRequest(preparationRequest.id, { lines: [{ id: preparationLine.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: operationRoot.id }] });
  assert.equal(prepared.lines[0].preparedRecipientUserId, user.id);
  assert.equal(prepared.lines[0].specificLocationId, operationRoot.id);
  await cancelReservation(preparationReservation.allocation.id);
  const preparedAfterCancel = await getAssetRequestById(preparationRequest.id);
  assert.equal(preparedAfterCancel.lines[0].preparedRecipientUserId, user.id);
  assert.equal(preparedAfterCancel.lines[0].specificLocationId, operationRoot.id);


  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: autoTwo.id } })).locationId, storage.id);
  const swapRequest = await createAssetRequest({ jobNo: "SWAP-" + suffix, rootLocationId: operationRoot.id, lines: [
    { assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: production.id },
  ] }, user.id);
  swapRequestId = swapRequest.id;
  const swapLine = swapRequest.lines[0];
  const oldSelection = await reserveAsset(swapRequest.id, swapLine.id, { assetId: autoOne.id }, user.id);
  const oldIssue = await issueAsset(oldSelection.allocation.id, {}, user.id);
  await confirmIssue(oldSelection.allocation.id, { epc: autoOne.epc!.epcCode }, user.id);
  assert.equal((await getAssetRequestById(swapRequest.id)).status, "ISSUED");
  await assert.rejects(() => initiateAssetReturn(oldIssue.assignment.id, { returnPurpose: "SWAP", swapReason: "OTHER" }));
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: autoOne.id } })).status, "IN_USE");
  const beforeSwapMovements = await prisma.assetMovement.count({ where: { assetId: autoOne.id } });
  const swapRace = await Promise.allSettled([
    initiateAssetReturn(oldIssue.assignment.id, { returnPurpose: "SWAP", swapReason: "NOT_SUITABLE", remarks: "POC replacement" }),
    initiateAssetReturn(oldIssue.assignment.id, { returnPurpose: "SWAP", swapReason: "NOT_SUITABLE", remarks: "POC replacement" }),
  ]);
  assert.equal(successes(swapRace), 1);
  assert.equal((await getAssetRequestById(swapRequest.id)).status, "PROCESSING");
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: autoOne.id } })).locationId, production.id);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: autoOne.id } }), beforeSwapMovements);
  await assert.rejects(() => reserveAsset(swapRequest.id, swapLine.id, { assetId: autoTwo.id }, user.id));
  await assert.rejects(() => confirmAssetReturn(oldIssue.assignment.id, { epc: autoTwo.epc!.epcCode, condition: "GOOD", returnLocationId: storage.id }, user.id));
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: autoOne.id } })).status, "RETURN_PENDING");
  await confirmAssetReturn(oldIssue.assignment.id, { epc: autoOne.epc!.epcCode, condition: "FAIR" }, user.id);
  const swapReturnMovement = await prisma.assetMovement.findFirstOrThrow({ where: { assetId: autoOne.id, reason: { startsWith: "RETURN CONFIRMED:" } }, orderBy: { id: "desc" } });
  assert.equal(swapReturnMovement.fromLocationId, production.id);
  assert.equal(swapReturnMovement.toLocationId, storage.id);
  const replacementRequired = await getAssetRequestById(swapRequest.id);
  assert.equal(replacementRequired.status, "PROCESSING");
  assert.equal(replacementRequired.lines[0].id, swapLine.id);
  assert.equal(replacementRequired.lines[0].progress.replacementRequired, true);
  assert.equal(replacementRequired.lines[0].progress.quantityReturned, 0);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: autoOne.id } })).status, "AVAILABLE");
  const cancelledReplacement = await reserveAsset(swapRequest.id, swapLine.id, { assetId: autoTwo.id }, user.id);
  await cancelReservation(cancelledReplacement.allocation.id);
  assert.equal((await getAssetRequestById(swapRequest.id)).status, "PROCESSING");
  assert.equal((await getAssetRequestById(swapRequest.id)).lines[0].progress.replacementRequired, true);
  // Competing different Assets for one replacement line: only one can fulfill it.
  const replacementRace = await Promise.allSettled([
    reserveAsset(swapRequest.id, swapLine.id, { assetId: autoTwo.id }, user.id),
    reserveAsset(swapRequest.id, swapLine.id, { assetId: manual.id }, user.id),
  ]);
  assert.equal(successes(replacementRace), 1);
  const replacement = await prisma.assetRequestAllocation.findFirstOrThrow({ where: { requestLineId: swapLine.id, status: "RESERVED" }, include: { asset: { include: { epc: true } } } });
  await updateAssetRequest(swapRequest.id, { lines: [{ id: swapLine.id, assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: operationRoot.id }] });
  const replacementIssue = await issueAsset(replacement.id, {}, user.id);
  assert.equal((await getAssetRequestById(swapRequest.id)).status, "PROCESSING");
  await confirmIssue(replacement.id, { epc: replacement.asset.epc!.epcCode }, user.id);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: replacement.assetId } })).locationId, operationRoot.id);
  assert.equal((await getAssetRequestById(swapRequest.id)).status, "ISSUED");
  await initiateAssetReturn(replacementIssue.assignment.id);
  assert.equal((await getAssetRequestById(swapRequest.id)).status, "ISSUED");
  await confirmAssetReturn(replacementIssue.assignment.id, { epc: replacement.asset.epc!.epcCode, condition: "GOOD" }, user.id);
  const completedSwap = await getAssetRequestById(swapRequest.id);
  assert.equal(completedSwap.status, "COMPLETED");
  assert.equal(completedSwap.lines[0].progress.quantityReturned, 1);
  assert.equal(completedSwap.lines[0].progress.replacementRequired, false);
  assert.equal(completedSwap.lines[0].allocations.find((a) => a.id === oldSelection.allocation.id)?.returnPurpose, "SWAP");
  assert.equal(completedSwap.lines[0].allocations.length, 3);
  console.log("PASS root descendant, root itself (OTHER type), unrelated hierarchy and confirmation revalidation");
  console.log("PASS swap reason validation, concurrent initiation, no early replacement, wrong EPC rollback");
  console.log("PASS same request/line replacement, cancel replacement, different-Asset reservation race, final normal return and retained history");
  console.log("PASS request edit restrictions, preparation readiness, missing-field blocks, hierarchy validation, and preparation persistence after cancel");
  console.log("PASS registration initializes home/current; normal and swap returns target home without return-location input or override");

  const legacyRequest = await createAssetRequest({ jobNo: `LEGACY-${suffix}`, rootLocationId: operationRoot.id, lines: [
    { assetCategoryId: category.id, measurementHeight: 111, measurementWidth: 222, preparedRecipientUserId: user.id, specificLocationId: production.id },
  ] }, user.id);
  legacyRequestId = legacyRequest.id;
  await prisma.assetRequest.update({ where: { id: legacyRequest.id }, data: { rootLocationId: null } });
  const legacyReservation = await reserveAsset(legacyRequest.id, legacyRequest.lines[0].id, { assetId: manual.id }, user.id);
  const legacyAssignment = await prisma.$transaction(async (tx) => {
    const issuedAt = new Date();
    await tx.assetRequestAllocation.update({ where: { id: legacyReservation.allocation.id }, data: { status: "ISSUED" } });
    await tx.asset.update({ where: { id: manual.id }, data: { status: "IN_USE", locationId: production.id } });
    await tx.assetRequest.update({ where: { id: legacyRequest.id }, data: { status: "ISSUED" } });
    return tx.assetAssignment.create({ data: {
      assignmentNo: `LEG-${suffix}`,
      assetId: manual.id,
      requestAllocationId: legacyReservation.allocation.id,
      assignedToUserId: user.id,
      assignedByUserId: user.id,
      departmentId: user.departmentId,
      locationId: production.id,
      assignedDate: issuedAt,
      issuedAt,
      status: "ACTIVE",
      isActive: true,
    } });
  });
  assert.equal((await getAssetRequestById(legacyRequest.id)).lines[0].allocations[0].asset.status, "IN_USE");
  await returnAssetAssignment(legacyAssignment.id, { condition: "GOOD", returnLocationId: storage.id }, user.id);
  assert.equal((await prisma.assetRequestAllocation.findUniqueOrThrow({ where: { id: legacyReservation.allocation.id } })).status, "RETURNED");
  assert.equal((await getAssetRequestById(legacyRequest.id)).status, "COMPLETED");

  console.log("PASS EPC generation: format, uniqueness, manual EPC, duplicate rejection");
  console.log("PASS cancel/reselect and concurrent reservation: exactly one active success");
  console.log("PASS issue initiation, wrong EPC rollback, confirmation race, movement/audit timing");
  console.log("PASS return initiation, wrong EPC rollback, confirmation race, movement/audit timing");
  console.log("PASS multi-line request progression: PROCESSING -> ISSUED -> COMPLETED");
  console.log("PASS legacy ISSUED + IN_USE request assignment remains readable and directly returnable");
  console.log("PASS Location Department inheritance, nearest override, and no-department hierarchy");
  console.log("PASS verified movements store Store -> Production and Production -> Store Department IDs");
}

main().finally(async () => {
  if (assetIds.length) {
    await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } });
    await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } });
    await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } });
    await prisma.assetRequestAllocation.deleteMany({ where: { assetId: { in: assetIds } } });
  }
  const requestIds = [requestId, legacyRequestId, swapRequestId, preparationRequestId].filter((id): id is number => id !== undefined);
  if (requestIds.length) {
    await prisma.assetRequestLine.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.assetRequest.deleteMany({ where: { id: { in: requestIds } } });
  }
  if (assetIds.length) {
    await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } });
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  }
  for (const id of [...locationIds].reverse()) await prisma.location.deleteMany({ where: { id } });
  if (departmentIds.length) await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
  await prisma.$disconnect();
});
