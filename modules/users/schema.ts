import * as z from "zod";

export const roleChangeSchema = z.strictObject({
  role: z.enum(["customer", "driver", "dispatcher", "admin"]),
});

export const profileUpdateSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  // NOTE: role intentionally absent — never writable via profile update.
});

export const vanUpsertSchema = z.strictObject({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  driverId: z.uuid().nullable().optional(),
  connectorTypes: z.array(z.enum(["CCS2", "CHAdeMO", "Type2", "Other"])).min(1).max(8),
  capacityKwh: z.number().positive().max(500),
  currentKwh: z.number().min(0).max(500),
  city: z.string().trim().min(1).max(60).default("Bengaluru"),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
