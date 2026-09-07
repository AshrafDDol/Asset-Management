import { api } from "./axios";

export type Machine = {
  id: number;
  machineCode: string;
  machineName: string;
  description?: string | null;
  isActive: boolean;
};
export type MachinePayload = Omit<Machine, "id" | "isActive"> & { isActive?: boolean };
const unwrap = <T,>(response: unknown): T => {
  const value = response as { data?: unknown };
  const nested = value?.data as { data?: unknown } | undefined;
  return (nested?.data ?? value?.data ?? response) as T;
};
export async function getMachinesApi() { return unwrap<Machine[]>((await api.get("/machines")).data); }
export async function createMachineApi(payload: MachinePayload) { return unwrap<Machine>((await api.post("/machines", payload)).data); }
export async function updateMachineApi(id: number, payload: Partial<MachinePayload>) { return unwrap<Machine>((await api.patch(`/machines/${id}`, payload)).data); }
export async function deactivateMachineApi(id: number) { return unwrap<Machine>((await api.delete(`/machines/${id}`)).data); }
