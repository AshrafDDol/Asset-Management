import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getDepartmentsApi, createDepartmentApi, type Department } from "../../api/departments.api";

type DepartmentFormState = {
    departmentCode: string;
    name: string;
    description: string;
};

const initialForm: DepartmentFormState = {
    departmentCode: "",
    name: "",
    description: ""
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
    };
}

export function useDepartmentPagesFunction() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [form, setForm] = useState<DepartmentFormState>(initialForm);

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
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to load departments."
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadDepartments();
    }, []);

    async function handleCreateDepartment(event: FormEvent) {
        event.preventDefault();

        const validationError = validateForm(form);

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);
            setError("");

            await createDepartmentApi(buildCreatePayload(form));

            setForm(initialForm);
            await loadDepartments();
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to create department."
            );
        } finally {
            setSaving(false);
        }
    }

    return {
        departments,
        form,
        loading,
        saving,
        error,
        updateForm,
        handleCreateDepartment,
        loadDepartments,
    }
}