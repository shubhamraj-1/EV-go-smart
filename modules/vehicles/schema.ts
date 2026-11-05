import * as z from "zod";

export const connectorTypes = ["CCS2", "CHAdeMO", "Type2", "Other"] as const;

export const createVehicleSchema = z.strictObject({
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z.number().int().min(2008).max(2100),
  connectorType: z.enum(connectorTypes),
  batteryKwh: z.number().positive().max(500),
  licensePlate: z.string().trim().min(2).max(12),
  isDefault: z.boolean().optional().default(false),
});

export const updateVehicleSchema = z.strictObject({
  make: z.string().trim().min(1).max(60).optional(),
  model: z.string().trim().min(1).max(60).optional(),
  year: z.number().int().min(2008).max(2100).optional(),
  connectorType: z.enum(connectorTypes).optional(),
  batteryKwh: z.number().positive().max(500).optional(),
  licensePlate: z.string().trim().min(2).max(12).optional(),
  isDefault: z.boolean().optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
