import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { ConfirmDeleteDialog, MasterDataModal } from "../components/MasterDataModal";
import { useRolesPagesFunction } from "./functionPages/RolesPagesFunction";
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

const EMPTY_FILTERS = { name: "", status: "" };

export function RolesPages() {
  const { form, error, saving, isEditing, editingRoleId, loading, roles, updateForm, loadRoles, handleEditRole, handleSubmitRole, handleCancelEdit, handleDeleteRole } = useRolesPagesFunction();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const editing = roles.find((role) => role.id === editingRoleId);
  const visible = useMemo(() => chronological(roles.filter((role) =>
    (!filters.name || role.name.toLowerCase().includes(filters.name.toLowerCase())) &&
    (!filters.status || String(role.isActive !== false) === filters.status)
  ), (role) => role.createdAt, order), [roles, filters, order]);
  useErrorToast(error);
  const close = () => { handleCancelEdit(); setModalOpen(false); setConfirmingDelete(false); };

  return (
    <>
      <PageHeader
        title="Roles"
        description="Manage roles assigned to system Users."
        actions={
          <>
            <Button onClick={() => { handleCancelEdit(); setModalOpen(true); }}>
              <Plus />
              Register Role
            </Button>
            <Button variant="outline" onClick={loadRoles}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      {!modalOpen && <ErrorBox message={error} />}

      <FilterCard onClear={() => setFilters(EMPTY_FILTERS)}>
        <Field label="Role Name" htmlFor="filter-role-name">
          <Input id="filter-role-name" value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} />
        </Field>
        <Field label="Active Status" htmlFor="filter-role-status">
          <SelectField id="filter-role-status" value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={STATUS_OPTIONS} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="Order" htmlFor="filter-role-order">
          <SelectField id="filter-role-order" value={order} onChange={(value) => setOrder(value as ListOrder)} options={ORDER_OPTIONS} />
        </Field>
      </FilterCard>

      <TableCard
        columns={["No.", "Role", "Description", "Status", "Action"]}
        loading={loading}
        isEmpty={visible.length === 0}
        emptyMessage="No roles match the current filters."
        itemLabel="role"
      >
        {visible.map((role, index) => (
          <TableRow key={role.id}>
            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
            <TableCell className="font-medium">{role.name}</TableCell>
            <TableCell className="text-muted-foreground">{role.description || "-"}</TableCell>
            <TableCell><StatusBadge isActive={role.isActive} /></TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => { handleEditRole(role); setModalOpen(true); }}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableCard>

      {modalOpen && (
        <MasterDataModal title={isEditing ? "Edit Role" : "Register Role"} busy={saving} onClose={close}>
          <ErrorBox message={error} />

          <form className="space-y-6" onSubmit={async (event) => { if (await handleSubmitRole(event)) { toast.success(isEditing ? "Role updated." : "Role registered."); close(); } }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role Name *" htmlFor="role-name">
                <Input id="role-name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
              </Field>
              <Field label="Description" htmlFor="role-description">
                <Input id="role-description" value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
              </Field>
              {isEditing && (
                <Field label="Status">
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox id="role-active" checked={form.isActive} onCheckedChange={(checked) => updateForm("isActive", checked === true)} />
                    <Label htmlFor="role-active" className="font-normal">Active</Label>
                  </div>
                </Field>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {isEditing && (
                <Button type="button" variant="destructive" className="mr-auto" onClick={() => setConfirmingDelete(true)}>
                  Delete Role
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
              title="Delete Role?"
              recordLabel={`Role: ${editing.name}`}
              busy={saving}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={async () => { if (await handleDeleteRole()) { toast.success("Role deleted."); close(); } else setConfirmingDelete(false); }}
            />
          )}
        </MasterDataModal>
      )}
    </>
  );
}
