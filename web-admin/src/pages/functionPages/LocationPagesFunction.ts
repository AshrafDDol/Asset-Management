import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getLocationsApi, createLocationApi, type Location } from "../../api/locations.api";

export type LocationFormState = {
    locationCode: string;
    name: string;
    description: string;
};

const initialForm: LocationFormState = {
    locationCode: "",
    name: "",
    description: ""
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
    };
}

export function useLocationPagesFunction() {
    const [locations, setLocations] = useState<Location[]>([]);
    const [form, setForm] = useState<LocationFormState>(initialForm);

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

            const data = await getLocationsApi();
            setLocations(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setError(
                err?.response?.data?.message || 
                    err?.message ||
                    "Failed to load locations."
            );
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

            await createLocationApi(buildCreatePayload(form));

            setForm(initialForm);
            await loadLocations();
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    "Failed to create location."
            );
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        loadLocations();
    }, []);

    return {
        locations,
        form,
        loading,
        saving,
        error,
        loadLocations,
        updateForm,
        handleCreateLocation
    };
}
