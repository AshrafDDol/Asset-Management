import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getDepartmentsApi, createDepartmentApi, updateDepartmentApi, deleteDepartmentApi, type Department } from "../../api/departments.api";
import { errorMessage } from "../../utils/errorMessage";

type DepartmentFormState = {
    departmentCode: string;
    name: string;
    description: string;
    isActive: boolean;
};

const initialForm: DepartmentFormState = {
    departmentCode: "",
    name: "",
    description: "",
    isActive: true,
};

function validateForm (form: DepartmentFormState): string | null {
    if (!form.departmentCode.trim()) {
        return "Department code is required.";
    }

    if (!form.name.trim()) {
        return "Department name is required.";
    }

    return null;
}

function buildCreatePayload(form: DepartmentFormState) {
    return {
        departmentCode: form.departmentCode.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        isActive: form.isActive,
    };
}

export function useDepartmentPagesFunction() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [form, setForm] = useState<DepartmentFormState>(initialForm);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function updateForm<K extends keyof DepartmentFormState>(
        key: K,
        value: DepartmentFormState[K]
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value
        }));
    }

    async function loadDepartments() {
        try {
            setLoading(true);
            setError("");

            const data = await getDepartmentsApi();
            setDepartments(Array.isArray(data) ? data : []);
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to load departments."));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        // Initial API synchronization is intentionally owned by this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadDepartments();
    }, []);

    async function handleSubmitDepartment(event: FormEvent) {
        event.preventDefault();

        const validationError = validateForm(form);

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);
            setError("");

            if (editingId) await updateDepartmentApi(editingId, buildCreatePayload(form));
            else await createDepartmentApi(buildCreatePayload(form));

            setForm(initialForm);
            setEditingId(null);
            await loadDepartments();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to save department."));
        } finally {
            setSaving(false);
        }
        return false;
    }

    async function handleDeleteDepartment() {
        if (!editingId) return false;
        try {
            setSaving(true); setError("");
            await deleteDepartmentApi(editingId);
            setEditingId(null); setForm(initialForm);
            await loadDepartments();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to delete department."));
            return false;
        } finally { setSaving(false); }
    }

    return {
        departments,
        form,
        loading,
        saving,
        error,
        updateForm,
        editingId,
        handleSubmitDepartment,
        handleEditDepartment: (department: Department) => {
            setEditingId(department.id);
            setForm({ departmentCode: department.departmentCode, name: department.name, description: department.description || "", isActive: department.isActive !== false });
            setError("");
        },
        handleCancelEdit: () => { setEditingId(null); setForm(initialForm); setError(""); },
        handleDeleteDepartment,
        loadDepartments,
    }
}
