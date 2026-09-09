import { AssetStatus, AssignmentStatus, LocationType } from "@prisma/client";
import { prisma } from "../src/config/prisma";
import { createAsset, deleteAsset, updateAsset } from "../src/modules/assets/asset.service";
import { createLocation, deleteLocation, updateLocation } from "../src/modules/locations/location.services";
import { createDepartment, deleteDepartment, updateDepartment } from "../src/modules/departments/department.services";
import { createAssetCategory, deleteAssetCategory, updateAssetCategory } from "../src/modules/asset-categories/assetCategories.services";
import { createUser, deleteUser, updateUser } from "../src/modules/users/user.services";
import { createRole, deleteRole, updateRole } from "../src/modules/roles/role.services";

const suffix = Date.now().toString(36).toUpperCase();
const ids: Record<string, number | undefined> = {};
const pass = (name: string) => console.log(`PASS ${name}`);
async function expectBlocked(name: string, action: () => Promise<unknown>, text: string) {
  try { await action(); throw new Error(`${name}: deletion unexpectedly succeeded`); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(text)) throw error;
    pass(name);
  }
}

async function run() {
  const role = await createRole({ name: `QA_ROLE_${suffix}`, description: "runtime" }); ids.role = role.id;
  await updateRole(role.id, { description: "runtime edited" }); pass("Role register/edit");
  const department = await createDepartment({ departmentCode: `QD${suffix}`, name: `QA Department ${suffix}` }); ids.department = department.id;
  await updateDepartment(department.id, { name: `QA Department Edited ${suffix}` }); pass("Department register/edit");
  const location = await createLocation({ locationCode: `QL${suffix}`, name: `QA Store ${suffix}`, locationType: LocationType.STORE, departmentId: department.id }); ids.location = location.id;
  await updateLocation(location.id, { description: "runtime edited" }); pass("Location register/edit");
  const child = await createLocation({ locationCode: `QC${suffix}`, name: `QA Child ${suffix}`, locationType: LocationType.BIN, parentLocationId: location.id }); ids.child = child.id;
  const category = await createAssetCategory({ categoryCode: `QCAT${suffix}`, name: `QA Category ${suffix}` }); ids.category = category.id;
  await updateAssetCategory(category.id, { description: "runtime edited" }); pass("Category register/edit");
  const user = await createUser({ username: `qa_${suffix.toLowerCase()}`, fullName: "QA User", email: `qa_${suffix.toLowerCase()}@example.test`, password: "runtime123", roleId: role.id, departmentId: department.id }); ids.user = user.id;
  const updatedUser = await updateUser(user.id, { fullName: "QA User Edited" });
  if (updatedUser.fullName !== "QA User Edited") throw new Error("User full name edit failed");
  pass("User register/edit with optional password");
  const asset = await createAsset({ assetCode: `QA-${suffix}`, itemName: "QA Asset", categoryId: category.id, locationId: location.id, autoGenerateEpc: true }); ids.asset = asset.id;
  await updateAsset(asset.id, { remarks: "runtime edited" }); pass("Asset register/edit");

  await expectBlocked("Parent Location delete blocked", () => deleteLocation(location.id), "child Locations");
  await deleteLocation(child.id); ids.child = undefined; pass("Unused leaf Location delete");
  await expectBlocked("Referenced Location delete blocked", () => deleteLocation(location.id), "reference it");
  await expectBlocked("Referenced Department delete blocked", () => deleteDepartment(department.id), "reference it");
  await expectBlocked("Used Category delete blocked", () => deleteAssetCategory(category.id), "Assets are using it");
  await expectBlocked("Assigned Role delete blocked", () => deleteRole(role.id), "assigned to a User");

  await prisma.asset.update({ where: { id: asset.id }, data: { status: AssetStatus.IN_USE } });
  await expectBlocked("In-use Asset delete blocked", () => deleteAsset(asset.id), "operational lifecycle state");
  await prisma.asset.update({ where: { id: asset.id }, data: { status: AssetStatus.AVAILABLE } });
  const assignment = await prisma.assetAssignment.create({ data: { assignmentNo: `QA-ASG-${suffix}`, assetId: asset.id, assignedToUserId: user.id, assignedByUserId: user.id, departmentId: department.id, locationId: location.id, assignedDate: new Date(), status: AssignmentStatus.ACTIVE, isActive: true } }); ids.assignment = assignment.id;
  await expectBlocked("Active Assignment Asset delete blocked", () => deleteAsset(asset.id), "active operational claim");
  await prisma.assetAssignment.update({ where: { id: assignment.id }, data: { status: AssignmentStatus.RETURNED, isActive: false, returnedAt: new Date(), returnedByUserId: user.id, returnLocationId: location.id } });
  await expectBlocked("Asset history delete blocked", () => deleteAsset(asset.id), "lifecycle history");

  const deactivated = await deleteUser(user.id);
  if (deactivated.isActive) throw new Error("User was not deactivated");
  pass("User with history safely deactivated");
  await prisma.assetAssignment.delete({ where: { id: assignment.id } }); ids.assignment = undefined;
  await deleteAsset(asset.id); ids.asset = undefined; pass("Unused Asset delete");
  await deleteAssetCategory(category.id); ids.category = undefined; pass("Unused Category delete");
  await deleteLocation(location.id); ids.location = undefined; pass("Unused Location delete");
  await prisma.user.delete({ where: { id: user.id } }); ids.user = undefined;
  await deleteDepartment(department.id); ids.department = undefined; pass("Unused Department delete");
  await deleteRole(role.id); ids.role = undefined; pass("Unused Role delete");
}

async function cleanup() {
  if (ids.assignment) await prisma.assetAssignment.deleteMany({ where: { id: ids.assignment } });
  if (ids.asset) { await prisma.assetEpc.deleteMany({ where: { assetId: ids.asset } }); await prisma.asset.deleteMany({ where: { id: ids.asset } }); }
  if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  if (ids.child) await prisma.location.deleteMany({ where: { id: ids.child } });
  if (ids.location) await prisma.location.deleteMany({ where: { id: ids.location } });
  if (ids.category) await prisma.assetCategory.deleteMany({ where: { id: ids.category } });
  if (ids.department) await prisma.department.deleteMany({ where: { id: ids.department } });
  if (ids.role) await prisma.role.deleteMany({ where: { id: ids.role } });
}

run().finally(async () => { await cleanup(); await prisma.$disconnect(); }).catch((error) => { console.error(error); process.exitCode = 1; });
