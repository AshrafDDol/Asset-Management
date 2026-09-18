import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { ConfirmDeleteDialog, MasterDataModal } from "../components/MasterDataModal";
import { useAssetCategoriesPagesFunction } from "./functionPages/AssetCategoriesPagesFunction";
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

export function AssetCategoriesPages() {
  const { error, form, saving, loading, assetCategories, editingId, updateForm, loadAssetCategories, handleSubmitAssetCategory, handleEditAssetCategory, handleCancelEdit, handleDeleteAssetCategory } = useAssetCategoriesPagesFunction();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const editing = assetCategories.find((item) => item.id === editingId);
  const visible = useMemo(() => chronological(assetCategories.filter((category) =>
    (!filters.name || category.name.toLowerCase().includes(filters.name.toLowerCase())) &&
    (!filters.code || category.categoryCode.toLowerCase().includes(filters.code.toLowerCase())) &&
    (!filters.status || String(category.isActive !== false) === filters.status)
  ), (category) => category.createdAt, order), [assetCategories, filters, order]);
  useErrorToast(error);
  const close = () => { handleCancelEdit(); setModalOpen(false); setConfirmingDelete(false); };

  return (
    <>
      <PageHeader
        title="Asset Categories"
        description="Manage Asset categories for inventory management."
        actions={
          <>
            <Button onClick={() => { handleCancelEdit(); setModalOpen(true); }}>
              <Plus />
              Register Category
            </Button>
            <Button variant="outline" onClick={loadAssetCategories}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      {!modalOpen && <ErrorBox message={error} />}

      <FilterCard onClear={() => setFilters(EMPTY_FILTERS)}>
        <Field label="Category Name" htmlFor="filter-category-name">
          <Input id="filter-category-name" value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} />
        </Field>
        <Field label="Category Code" htmlFor="filter-category-code">
          <Input id="filter-category-code" value={filters.code} onChange={(event) => setFilters({ ...filters, code: event.target.value })} />
        </Field>
        <Field label="Active Status" htmlFor="filter-category-status">
          <SelectField id="filter-category-status" value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={STATUS_OPTIONS} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="Order" htmlFor="filter-category-order">
          <SelectField id="filter-category-order" value={order} onChange={(value) => setOrder(value as ListOrder)} options={ORDER_OPTIONS} />
        </Field>
      </FilterCard>

      <TableCard
        columns={["No.", "Category", "Code", "Status", "Action"]}
        loading={loading}
        isEmpty={visible.length === 0}
        emptyMessage="No Asset categories match the current filters."
        itemLabel="category"
      >
        {visible.map((category, index) => (
          <TableRow key={category.id}>
            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
            <TableCell className="font-medium">{category.name}</TableCell>
            <TableCell className="font-mono text-xs">{category.categoryCode}</TableCell>
            <TableCell><StatusBadge isActive={category.isActive} /></TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => { handleEditAssetCategory(category); setModalOpen(true); }}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableCard>

      {modalOpen && (
        <MasterDataModal title={editingId ? "Edit Category" : "Register Category"} busy={saving} onClose={close}>
          <ErrorBox message={error} />

          <form className="space-y-6" onSubmit={async (event) => { if (await handleSubmitAssetCategory(event)) { toast.success(editingId ? "Category updated." : "Category registered."); close(); } }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category Code *" htmlFor="category-code">
                <Input id="category-code" value={form.categoryCode} onChange={(event) => updateForm("categoryCode", event.target.value)} />
              </Field>
              <Field label="Category Name *" htmlFor="category-name">
                <Input id="category-name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
              </Field>
              <Field label="Description" htmlFor="category-description" className="sm:col-span-2">
                <Input id="category-description" value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
              </Field>
              {editingId && (
                <Field label="Status">
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox id="category-active" checked={form.isActive} onCheckedChange={(checked) => updateForm("isActive", checked === true)} />
                    <Label htmlFor="category-active" className="font-normal">Active</Label>
                  </div>
                </Field>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {editingId && (
                <Button type="button" variant="destructive" className="mr-auto" onClick={() => setConfirmingDelete(true)}>
                  Delete Category
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
              title="Delete Category?"
              recordLabel={`${editing.categoryCode} — ${editing.name}`}
              busy={saving}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={async () => { if (await handleDeleteAssetCategory()) { toast.success("Category deleted."); close(); } else setConfirmingDelete(false); }}
            />
          )}
        </MasterDataModal>
      )}
    </>
  );
}
