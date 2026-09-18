import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { ConfirmDeleteDialog, MasterDataModal } from "../components/MasterDataModal";
import { useDepartmentPagesFunction } from "./functionPages/DepartmentPagesFunction";
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

const EMPTY_FILTERS = { name: "", code: "", status: "" };

export function DepartmentsPages() {
  const { error, form, saving, loading, departments, editingId, updateForm, loadDepartments, handleSubmitDepartment, handleEditDepartment, handleCancelEdit, handleDeleteDepartment } = useDepartmentPagesFunction();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const editing = departments.find((item) => item.id === editingId);
  const visible = useMemo(() => chronological(departments.filter((department) =>
    (!filters.name || department.name.toLowerCase().includes(filters.name.toLowerCase())) &&
    (!filters.code || department.departmentCode.toLowerCase().includes(filters.code.toLowerCase())) &&
    (!filters.status || String(department.isActive !== false) === filters.status)
  ), (department) => department.createdAt, order), [departments, filters, order]);
  useErrorToast(error);
  const close = () => { handleCancelEdit(); setModalOpen(false); setConfirmingDelete(false); };

  return (
    <>
      <PageHeader
        title="Departments"
        description="Manage company departments for ownership."
        actions={
          <>
            <Button onClick={() => { handleCancelEdit(); setModalOpen(true); }}>
              <Plus />
              Register Department
            </Button>
            <Button variant="outline" onClick={loadDepartments}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      {!modalOpen && <ErrorBox message={error} />}

      <FilterCard onClear={() => setFilters(EMPTY_FILTERS)}>
        <Field label="Department Name" htmlFor="filter-department-name">
          <Input id="filter-department-name" value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} />
        </Field>
        <Field label="Department Code" htmlFor="filter-department-code">
          <Input id="filter-department-code" value={filters.code} onChange={(event) => setFilters({ ...filters, code: event.target.value })} />
        </Field>
        <Field label="Active Status" htmlFor="filter-department-status">
          <SelectField id="filter-department-status" value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={STATUS_OPTIONS} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="Order" htmlFor="filter-department-order">
          <SelectField id="filter-department-order" value={order} onChange={(value) => setOrder(value as ListOrder)} options={ORDER_OPTIONS} />
        </Field>
      </FilterCard>

      <TableCard
        columns={["No.", "Department", "Code", "Status", "Action"]}
        loading={loading}
        isEmpty={visible.length === 0}
        emptyMessage="No departments match the current filters."
        itemLabel="department"
      >
        {visible.map((department, index) => (
          <TableRow key={department.id}>
            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
            <TableCell className="font-medium">{department.name}</TableCell>
            <TableCell className="font-mono text-xs">{department.departmentCode}</TableCell>
            <TableCell><StatusBadge isActive={department.isActive} /></TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => { handleEditDepartment(department); setModalOpen(true); }}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableCard>

      {modalOpen && (
        <MasterDataModal title={editingId ? "Edit Department" : "Register Department"} busy={saving} onClose={close}>
          <ErrorBox message={error} />

          <form className="space-y-6" onSubmit={async (event) => { if (await handleSubmitDepartment(event)) { toast.success(editingId ? "Department updated." : "Department registered."); close(); } }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department Code *" htmlFor="department-code">
                <Input id="department-code" value={form.departmentCode} onChange={(event) => updateForm("departmentCode", event.target.value)} />
              </Field>
              <Field label="Department Name *" htmlFor="department-name">
                <Input id="department-name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
              </Field>
              <Field label="Description" htmlFor="department-description" className="sm:col-span-2">
                <Input id="department-description" value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
              </Field>
              {editingId && (
                <Field label="Status">
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox id="department-active" checked={form.isActive} onCheckedChange={(checked) => updateForm("isActive", checked === true)} />
                    <Label htmlFor="department-active" className="font-normal">Active</Label>
                  </div>
                </Field>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {editingId && (
                <Button type="button" variant="destructive" className="mr-auto" onClick={() => setConfirmingDelete(true)}>
                  Delete Department
                </Button>
              )}
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button disabled={saving} type="submit">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Register"}
              </Button>
            </div>
          </form>

          {confirmingDelete && editing && (
            <ConfirmDeleteDialog
              title="Delete Department?"
              recordLabel={`${editing.departmentCode} — ${editing.name}`}
              busy={saving}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={async () => { if (await handleDeleteDepartment()) { toast.success("Department deleted."); close(); } else setConfirmingDelete(false); }}
            />
          )}
        </MasterDataModal>
      )}
    </>
  );
}
