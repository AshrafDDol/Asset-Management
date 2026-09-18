import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { ConfirmDeleteDialog, MasterDataModal } from "../components/MasterDataModal";
import { useUserPagesFunction } from "./functionPages/userPagesFunction";
import { chronological, type ListOrder } from "../utils/listOrder";
import { useErrorToast } from "@/hooks/useErrorToast";
import { ErrorBox } from "@/components/common/ErrorBox";
import { Field, FilterCard } from "@/components/common/FilterCard";
import { PageHeader } from "@/components/common/PageHeader";
import { ORDER_OPTIONS, STATUS_OPTIONS, SelectField } from "@/components/common/SelectField";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableCard } from "@/components/common/TableCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";

const EMPTY_FILTERS = { search: "", role: "", department: "", status: "" };

export function UsersPages() {
  const { users, roles, departments, form, loading, saving, error, isEditing, editingUserId, updateForm, loadPageData, handleEditUser, handleCancelEdit, handleSubmitUser, handleDeactivateUser } = useUserPagesFunction();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const editing = users.find((user) => user.id === editingUserId);
  const visible = useMemo(() => {
    const search = filters.search.toLowerCase();
    return chronological(users.filter((user) =>
      (!search || [user.fullName, user.username, user.email].some((value) => value?.toLowerCase().includes(search))) &&
      (!filters.role || String(user.roleId ?? "") === filters.role) &&
      (!filters.department || String(user.departmentId ?? "") === filters.department) &&
      (!filters.status || String(user.isActive !== false) === filters.status)
    ), (user) => user.createdAt, order);
  }, [users, filters, order]);
  useErrorToast(error);
  const close = () => { handleCancelEdit(); setModalOpen(false); setConfirmingDelete(false); };

  const roleOptions = roles.map((role) => ({ value: String(role.id), label: role.name }));
  const departmentOptions = departments.map((department) => ({ value: String(department.id), label: department.name }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage system Users and role assignments."
        actions={
          <>
            <Button onClick={() => { handleCancelEdit(); setModalOpen(true); }}>
              <Plus />
              Register User
            </Button>
            <Button variant="outline" onClick={loadPageData}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      {!modalOpen && <ErrorBox message={error} />}

      <FilterCard onClear={() => setFilters(EMPTY_FILTERS)}>
        <Field label="Name / Username / Email" htmlFor="filter-user-search">
          <Input id="filter-user-search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </Field>
        <Field label="Role" htmlFor="filter-user-role">
          <SelectField id="filter-user-role" value={filters.role} onChange={(role) => setFilters({ ...filters, role })} options={roleOptions} emptyLabel="All roles" placeholder="All roles" />
        </Field>
        <Field label="Department" htmlFor="filter-user-department">
          <SelectField id="filter-user-department" value={filters.department} onChange={(department) => setFilters({ ...filters, department })} options={departmentOptions} emptyLabel="All departments" placeholder="All departments" />
        </Field>
        <Field label="Active Status" htmlFor="filter-user-status">
          <SelectField id="filter-user-status" value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={STATUS_OPTIONS} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="Order" htmlFor="filter-user-order">
          <SelectField id="filter-user-order" value={order} onChange={(value) => setOrder(value as ListOrder)} options={ORDER_OPTIONS} />
        </Field>
      </FilterCard>

      <TableCard
        columns={["No.", "Username", "Full Name", "Email", "Role", "Department", "Status", "Action"]}
        loading={loading}
        isEmpty={visible.length === 0}
        emptyMessage="No Users match the current filters."
        itemLabel="user"
      >
        {visible.map((user, index) => (
          <TableRow key={user.id}>
            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
            <TableCell className="font-medium">{user.username}</TableCell>
            <TableCell>{user.fullName}</TableCell>
            <TableCell className="text-muted-foreground">{user.email || "-"}</TableCell>
            <TableCell>{user.role?.name || "-"}</TableCell>
            <TableCell>{user.department?.name || "-"}</TableCell>
            <TableCell><StatusBadge isActive={user.isActive} /></TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => { handleEditUser(user); setModalOpen(true); }}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableCard>

      {modalOpen && (
        <MasterDataModal title={isEditing ? "Edit User" : "Register User"} busy={saving} onClose={close}>
          <ErrorBox message={error} />

          <form className="space-y-6" onSubmit={async (event) => { if (await handleSubmitUser(event)) { toast.success(isEditing ? "User updated." : "User registered."); close(); } }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username *" htmlFor="user-username">
                <Input id="user-username" value={form.username} onChange={(event) => updateForm("username", event.target.value)} />
              </Field>
              <Field label={`Password${isEditing ? "" : " *"}`} htmlFor="user-password">
                <Input
                  id="user-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => updateForm("password", event.target.value)}
                  placeholder={isEditing ? "Leave blank to keep password" : "Enter password"}
                />
              </Field>
              <Field label="Full Name *" htmlFor="user-fullname">
                <Input id="user-fullname" value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} />
              </Field>
              <Field label="Email *" htmlFor="user-email">
                <Input id="user-email" type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
              </Field>
              <Field label="Role *" htmlFor="user-role">
                <SelectField
                  id="user-role"
                  value={form.roleId}
                  onChange={(roleId) => updateForm("roleId", roleId)}
                  placeholder="Select role"
                  options={roles
                    .filter((role) => role.isActive !== false || String(role.id) === form.roleId)
                    .map((role) => ({ value: String(role.id), label: role.name }))}
                />
              </Field>
              <Field label="Department" htmlFor="user-department">
                <SelectField
                  id="user-department"
                  value={form.departmentId}
                  onChange={(departmentId) => updateForm("departmentId", departmentId)}
                  emptyLabel="No department"
                  placeholder="No department"
                  options={departments
                    .filter((department) => department.isActive !== false || String(department.id) === form.departmentId)
                    .map((department) => ({ value: String(department.id), label: `${department.departmentCode} — ${department.name}` }))}
                />
              </Field>
              <Field label="Status">
                <div className="flex h-9 items-center gap-2">
                  <Checkbox id="user-active" checked={form.isActive} onCheckedChange={(checked) => updateForm("isActive", checked === true)} />
                  <Label htmlFor="user-active" className="font-normal">Active</Label>
                </div>
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {isEditing && (
                <Button type="button" variant="destructive" className="mr-auto" onClick={() => setConfirmingDelete(true)}>
                  Deactivate User
                </Button>
              )}
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button disabled={saving} type="submit">
                {saving ? "Saving..." : isEditing ? "Save Changes" : "Register"}
              </Button>
            </div>
          </form>

          {confirmingDelete && editing && (
            <ConfirmDeleteDialog
              title="Deactivate User?"
              recordLabel={`Username: ${editing.username}`}
              actionLabel="Deactivate"
              message="The User will be unable to sign in, while operational audit history remains intact."
              busy={saving}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={async () => { if (await handleDeactivateUser()) { toast.success("User deactivated."); close(); } else setConfirmingDelete(false); }}
            />
          )}
        </MasterDataModal>
      )}
    </>
  );
}
