import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { type User, createUserApi, getUsersApi, updateUserApi } from '../../api/users.api';
import { type Role, getRolesApi } from '../../api/roles.api';

type UserFormState = {
    username: string;
    password: string;
    fullName: string;
    email: string;
    roleId: string;
    departmentId: string;
    isActive: boolean;
};

const initialForm: UserFormState = {
    username: "",
    password: "",
    fullName: "",
    email: "",
    roleId: "",
    departmentId: "",
    isActive: true,
};

function validateForm(form: UserFormState, isEditing: boolean): string | null {
    if (!form.username.trim()) {
        return "Username is required.";
    }

    if (!isEditing && !form.password.trim()) {
        return "Password is required.";
    }

    if (!form.fullName.trim()) {
        return "Full name is required.";
    }

    return null;
}

function buildUpdatePayload(form: UserFormState) {
    return {
        username: form.username.trim() || undefined,
        password: form.password.trim() || undefined,
        fullName: form.fullName.trim() || undefined,
        email: form.email.trim() || undefined,
        roleId: form.roleId ? Number(form.roleId) : undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        isActive: form.isActive,
    };
}

function buildCreatePayload(form: UserFormState) {
    return {
        username: form.username.trim(),
        password: form.password.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
        roleId: form.roleId ? Number(form.roleId) : undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
    };
}

export function useUserPagesFunction() {
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [form, setForm] = useState<UserFormState>(initialForm);

    const [editingUserId, setEditingUserId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const isEditing = editingUserId !== null;

    function updateForm<K extends keyof UserFormState>(
        key: K,
        value: UserFormState[K]
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
    }

    async function loadUsers() {
        const data = await getUsersApi();
        setUsers(Array.isArray(data) ? data : []);
    }

    async function loadRoles() {
        const data = await getRolesApi();
        setRoles(Array.isArray(data) ? data : []);
    }

    async function loadPageData() {
        try {
            setLoading(true);
            setError("");

            await Promise.all([loadUsers(), loadRoles()]);
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to load data users and roles."
            );
        } finally {
            setLoading(false);
        }
    }

    function handleEditUser(user: User) {
        setEditingUserId(user.id);

        setForm({
            username: user.username || "",
            password: "",
            fullName: user.fullName || "",
            email: user.email || "",
            roleId: user.roleId ? String(user.roleId) : "",
            departmentId: user.departmentId ? String(user.departmentId) : "",
            isActive: user.isActive !== false,
        });
    }

    function handleCancelEdit() {
        setEditingUserId(null);
        setForm(initialForm);
        setError("");
    }

    async function handleSubmitUser(event: FormEvent) {
        event.preventDefault();

        const validationError = validateForm(form, isEditing);
        if(validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);
            setError("");

            if (isEditing && editingUserId) {
                await updateUserApi(editingUserId, buildUpdatePayload(form));
            } else {
                await createUserApi(buildCreatePayload(form));
            }

            setForm(initialForm);
            setEditingUserId(null);
            await loadUsers();
        } catch  (err: any) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to save user."
            );
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        loadPageData();
    }, []);

    return {
        users,
        roles,
        form,
        loading,
        saving,
        error,
        isEditing,
        handleEditUser,
        handleCancelEdit,
        handleSubmitUser,
        updateForm,
        loadPageData,
    };
}