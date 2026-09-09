import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { type Role, createRoleApi, getRolesApi, updateRoleApi, deleteRoleApi } from '../../api/roles.api';
import { errorMessage } from '../../utils/errorMessage';

type RoleFormState = {
    name: string;
    description: string;
    isActive: boolean;
};

const initialForm: RoleFormState = {
    name: "",
    description: "",
    isActive: true,
};

function validateForm(form: RoleFormState): string | null {
    if (!form.name.trim()) {
        return "Name is required.";
    }

    return null;
}

function buildCreatePayload(form: RoleFormState) {
    return {
        name: form.name.trim() || undefined,
        description: form.description.trim() || undefined,
        isActive: form.isActive,
    };
}

export function useRolesPagesFunction() {
    const [roles, setRoles] = useState<Role[]>([]);
    const [form, setForm] = useState<RoleFormState>(initialForm);

    const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const isEditing = editingRoleId !== null;

    function updateForm<K extends keyof RoleFormState>(
        key: K,
        value: RoleFormState[K]
    ) {
        setForm((prevForm) => ({
            ...prevForm,
            [key]: value,
        }));
    }

    async function loadRoles() {
        try {
            setLoading(true);
            setError("");

            const data = await getRolesApi();
            setRoles(Array.isArray(data) ? data : []);
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to load Roles."));
        } finally {
            setLoading(false);
        }
    }

    function handleEditRole(role: Role) {
        setEditingRoleId(role.id);

        setForm({
            name: role.name || "",
            description: role.description || "",
            isActive: role.isActive !== false,
        });
    }

    function handleCancelEdit() {
        setEditingRoleId(null);
        setForm(initialForm);
        setError("");
    }

    async function handleSubmitRole(event: FormEvent) {
        event.preventDefault();

        const validationError = validateForm(form);

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);
            setError("");

            if (isEditing && editingRoleId) {
                await updateRoleApi(editingRoleId, buildCreatePayload(form));
            } else {
                await createRoleApi(buildCreatePayload(form));
            }

            setForm(initialForm);
            setEditingRoleId(null);
            await loadRoles();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to save Role."));
        } finally {
            setSaving(false);
        }
        return false;
    }

    async function handleDeleteRole() {
        if (!editingRoleId) return false;
        try {
            setSaving(true); setError("");
            await deleteRoleApi(editingRoleId);
            setEditingRoleId(null); setForm(initialForm);
            await loadRoles();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to delete Role."));
            return false;
        } finally { setSaving(false); }
    }

    useEffect(() => {
        // Initial API synchronization is intentionally owned by this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadRoles();
    }, []);

    return {
        roles,
        form,
        isEditing,
        editingRoleId,
        loading,
        saving,
        error,
        loadRoles,
        updateForm,
        handleEditRole,
        handleCancelEdit,
        handleSubmitRole,
        handleDeleteRole,
    };
}

