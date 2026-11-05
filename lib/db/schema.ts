import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema — Phase 0 profiles + Phase 1 vehicles/bookings
 * + Phase 2A vans/driver_profiles/driver_locations/audit_logs.
 * `profiles` mirrors `auth.users`; one row per user, role lives here.
 * `vehicles`/`bookings` are created by SQL migrations (PostGIS, CHECKs,
 * RLS); these declarations mirror the DB so Drizzle queries type-check.
 */

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  role: text("role", {
    enum: ["customer", "driver", "dispatcher", "admin"],
  })
    .notNull()
    .default("customer"),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** PostGIS geography(Point, 4326) — Drizzle has no built-in geography type. */
const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(Point, 4326)";
  },
});

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: smallint("year").notNull(),
    connectorType: text("connector_type", {
      enum: ["CCS2", "CHAdeMO", "Type2", "Other"],
    }).notNull(),
    batteryKwh: numeric("battery_kwh", { precision: 6, scale: 2 }).notNull(),
    licensePlate: text("license_plate").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vehicles_user_idx").on(t.userId, t.createdAt.desc()),
    uniqueIndex("vehicles_plate_idx").on(t.userId, t.licensePlate),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().default(sql`'EVG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('booking_ref_seq')::text, 6, '0')`).unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => profiles.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    vanId: uuid("van_id"),
    driverId: uuid("driver_id").references(() => profiles.id),
    status: text("status", {
      enum: [
        "requested",
        "assigned",
        "en_route",
        "arrived",
        "charging",
        "completed",
        "cancelled",
        "expired",
        "failed",
      ],
    })
      .notNull()
      .default("requested"),
    location: geographyPoint("location").notNull(),
    address: text("address").notNull(),
    batteryPercent: smallint("battery_percent").notNull(),
    connectorType: text("connector_type", {
      enum: ["CCS2", "CHAdeMO", "Type2", "Other"],
    }).notNull(),
    notes: text("notes"),
    baseFeePaise: integer("base_fee_paise").notNull(),
    perKwhPaise: integer("per_kwh_paise").notNull(),
    estimatedKwh: numeric("estimated_kwh", { precision: 6, scale: 2 }).notNull(),
    estimatedTotalPaise: integer("estimated_total_paise").notNull(),
    deliveredKwh: numeric("delivered_kwh", { precision: 6, scale: 2 }),
    finalTotalPaise: integer("final_total_paise"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    paymentStatus: text("payment_status", {
      enum: ["not_required", "pending", "paid", "failed", "refunded", "partially_refunded"],
    })
      .notNull()
      .default("pending"),
    dispatchAttempts: integer("dispatch_attempts").notNull().default(0),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    etaMinutes: integer("eta_minutes"),
    etaUpdatedAt: timestamp("eta_updated_at", { withTimezone: true }),
    ratingScore: smallint("rating_score"),
    ratingComment: text("rating_comment"),
    ratingCreatedAt: timestamp("rating_created_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    cancelledBy: uuid("cancelled_by").references(() => profiles.id),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // NB: the full booking schema lives in the SQL migration; this
    // declaration mirrors the common indexes for Drizzle queries.
    index("bookings_customer_idx").on(t.customerId, t.createdAt.desc()),
    index("bookings_driver_idx").on(t.driverId, t.createdAt.desc()),
    index("bookings_status_idx").on(t.status, t.createdAt.desc()),
    index("bookings_van_status_idx").on(t.vanId, t.status),
    uniqueIndex("bookings_idem_idx")
      .on(t.customerId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

export type Profile = typeof profiles.$inferSelect;

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limits_reset_idx").on(t.resetAt)],
);

export type UserRole = "customer" | "driver" | "dispatcher" | "admin";

// ---------------------------------------------------------------------------
// Phase 2A dispatch tables. Geography columns use `geographyPoint` above.
// ---------------------------------------------------------------------------

export const driverProfiles = pgTable(
  "driver_profiles",
  {
    userId: uuid("user_id").primaryKey(),
    phone: text("phone").notNull(),
    licenseNumber: text("license_number").notNull(),
    verificationStatus: text("verification_status", {
      enum: ["pending", "verified", "suspended"],
    })
      .notNull()
      .default("pending"),
    rating: numeric("rating", { precision: 2, scale: 1 }).notNull().default("5.0"),
    totalTrips: integer("total_trips").notNull().default(0),
    currentVanId: uuid("current_van_id"),
    status: text("status", { enum: ["offline", "available", "busy"] })
      .notNull()
      .default("offline"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("driver_profiles_status_idx").on(t.status)],
);

export const vans = pgTable(
  "vans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    driverId: uuid("driver_id"),
    status: text("status", {
      enum: ["offline", "available", "assigned", "en_route", "charging", "returning", "maintenance"],
    })
      .notNull()
      .default("offline"),
    connectorTypes: text("connector_types").array().notNull(),
    capacityKwh: numeric("capacity_kwh", { precision: 6, scale: 2 }).notNull(),
    currentKwh: numeric("current_kwh", { precision: 6, scale: 2 }).notNull(),
    location: geographyPoint("location").notNull(),
    locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }).notNull().defaultNow(),
    city: text("city").notNull().default("Bengaluru"),
    rating: numeric("rating", { precision: 2, scale: 1 }).notNull().default("5.0"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vans_status_city_idx").on(t.status, t.city),
    index("vans_driver_idx").on(t.driverId),
  ],
);

export const driverLocations = pgTable(
  "driver_locations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    vanId: uuid("van_id").notNull(),
    driverId: uuid("driver_id").notNull(),
    location: geographyPoint("location").notNull(),
    heading: smallint("heading"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("driver_locations_van_time_idx").on(t.vanId, t.createdAt.desc()),
    index("driver_locations_created_idx").on(t.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt.desc()),
    index("audit_logs_actor_idx").on(t.actorId, t.createdAt.desc()),
    index("audit_logs_resource_idx").on(t.resourceType, t.resourceId),
  ],
);

export type DriverProfile = typeof driverProfiles.$inferSelect;
export type Van = typeof vans.$inferSelect;
export type DriverLocation = typeof driverLocations.$inferSelect;
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    provider: text("provider").notNull().default("razorpay"),
    orderId: text("order_id").notNull().unique(),
    paymentId: text("payment_id").unique(),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status", {
      enum: ["created", "authorized", "captured", "failed", "refunded"],
    })
      .notNull()
      .default("created"),
    method: text("method"),
    receipt: text("receipt").notNull(),
    notes: jsonb("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_booking_idx").on(t.bookingId)],
);

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("razorpay"),
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull(),
  payloadHash: text("payload_hash").notNull(),
  status: text("status", { enum: ["processed", "ignored", "failed"] })
    .notNull()
    .default("processed"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt.desc())],
);

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    city: text("city").notNull(),
    baseFeePaise: integer("base_fee_paise").notNull(),
    perKwhPaise: integer("per_kwh_paise").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pricing_rules_city_idx").on(t.city, t.active)],
);

export const serviceAreas = pgTable(
  "service_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    city: text("city").notNull(),
    polygon: geographyPoint("polygon").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
