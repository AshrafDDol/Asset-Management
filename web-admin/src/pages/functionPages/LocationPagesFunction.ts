import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getLocationsApi, createLocationApi, updateLocationApi, deleteLocationApi, type Location } from "../../api/locations.api";
import { getDepartmentsApi, type Department } from "../../api/departments.api";
import { errorMessage } from "../../utils/errorMessage";

export type LocationFormState = {
    locationCode: string;
    name: string;
    description: string;
    parentLocationId: string;
    departmentId: string;
    locationType: string;
    isActive: boolean;
};

const initialForm: LocationFormState = {
    locationCode: "",
    name: "",
    description: "",
    parentLocationId: "",
    departmentId: "",
    locationType: "STORAGE",
    isActive: true,
};

function validateForm (form: LocationFormState): string | null {
    if (!form.locationCode.trim()) {
        return "Location code is required.";
    }

    if (!form.name.trim()) {
        return "Location name is required.";
    }

    return null;
}

function buildCreatePayload(form: LocationFormState) {
    return {
        locationCode: form.locationCode.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        parentLocationId: form.parentLocationId ? Number(form.parentLocationId) : null,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        locationType: form.locationType,
    };
}

export function useLocationPagesFunction() {
    const [locations, setLocations] = useState<Location[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [form, setForm] = useState<LocationFormState>(initialForm);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function updateForm<K extends keyof LocationFormState>(
        key: K,
        value: LocationFormState[K]
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value
        }));
    }

    async function loadLocations() {
        try {
            setLoading(true);
            setError("");

            const [data, departmentData] = await Promise.all([getLocationsApi(), getDepartmentsApi()]);
            setLocations(Array.isArray(data) ? data : []);
            setDepartments(Array.isArray(departmentData) ? departmentData : []);
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to load locations."));
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateLocation(event: FormEvent) {
        event.preventDefault();

        const validationError = validateForm(form);

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);
            setError("");

            if (editingId) {
                await updateLocationApi(editingId, { ...buildCreatePayload(form), isActive: form.isActive });
            } else {
                await createLocationApi(buildCreatePayload(form));
            }

            setForm(initialForm);
            setEditingId(null);
            await loadLocations();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to save location."));
        } finally {
            setSaving(false);
        }
        return false;
    }

    async function handleDeleteLocation() {
        if (!editingId) return false;
        try {
            setSaving(true); setError("");
            await deleteLocationApi(editingId);
            setForm(initialForm); setEditingId(null);
            await loadLocations();
            return true;
        } catch (err: unknown) {
            setError(errorMessage(err, "Failed to delete location."));
            return false;
        } finally { setSaving(false); }
    }

    useEffect(() => {
        // Initial API synchronization is intentionally owned by this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadLocations();
    }, []);

    return {
        locations,
        departments,
        form,
        loading,
        saving,
        error,
        loadLocations,
        updateForm,
        handleCreateLocation,
        editingId,
        handleEditLocation: (location: Location) => {
            setEditingId(location.id);
            setForm({
                locationCode: location.locationCode,
                name: location.name,
                description: location.description || "",
                parentLocationId: location.parentLocationId ? String(location.parentLocationId) : "",
                departmentId: location.departmentId ? String(location.departmentId) : "",
                locationType: location.locationType || "STORAGE",
                isActive: location.isActive !== false,
            });
        },
        handleCancelEdit: () => { setEditingId(null); setForm(initialForm); setError(""); },
        handleDeleteLocation,
    };
}
