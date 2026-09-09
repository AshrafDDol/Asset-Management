import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { type User, createUserApi, getUsersApi, updateUserApi, deactivateUserApi } from '../../api/users.api';
import { type Role, getRolesApi } from '../../api/roles.api';
import { type Department, getDepartmentsApi } from '../../api/departments.api';
import { errorMessage } from '../../utils/errorMessage';

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
    if (!form.email.trim()) return "Email is required.";
    if (!form.roleId) return "Role is required.";

    return null;
}

function buildUpdatePayload(form: UserFormState) {
    return {
        username: form.username.trim() || undefined,
        password: form.password.trim() || undefined,
        fullName: form.fullName.trim() || undefined,
        email: form.email.trim() || undefined,
        roleId: form.roleId ? Number(form.roleId) : undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
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
    const [departments, setDepartments] = useState<Department[]>([]);
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

            const [, , departmentData] = await Promise.all([loadUsers(), loadRoles(), getDepartmentsApi()]);
            setDepartments(Array.isArray(departmentData) ? departmentData : []);
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to load Users, Roles, and Departments."));
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
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to save User."));
        } finally {
            setSaving(false);
        }
        return false;
    }

    async function handleDeactivateUser() {
        if (!editingUserId) return false;
        try {
            setSaving(true); setError("");
            await deactivateUserApi(editingUserId);
            setEditingUserId(null); setForm(initialForm);
            await loadUsers();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to deactivate User."));
            return false;
        } finally { setSaving(false); }
    }

    useEffect(() => {
        // Initial API synchronization is intentionally owned by this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadPageData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        users,
        roles,
        departments,
        form,
        loading,
        saving,
        error,
        isEditing,
        editingUserId,
        handleEditUser,
        handleCancelEdit,
        handleSubmitUser,
        handleDeactivateUser,
        updateForm,
        loadPageData,
    };
}
