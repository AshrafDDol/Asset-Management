export type CreateMachineInput = {
  machineCode: string;
  machineName: string;
  description?: string;
};

export type UpdateMachineInput = Partial<CreateMachineInput> & {
  isActive?: boolean;
};
