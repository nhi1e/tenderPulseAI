import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tenderAlerts = sqliteTable("tender_alerts", {
  id: text("id").primaryKey(),
  sourceKey: text("source_key").notNull(),
  kind: text("kind", { enum: ["new", "updated"] }).notNull(),
  contentHash: text("content_hash").notNull(),
  detectedAt: text("detected_at").notNull(),
  syncGeneratedAt: text("sync_generated_at").notNull(),
  subOu: text("sub_ou").notNull(),
  productGroup: text("product_group").notNull(),
  hospital: text("hospital").notNull(),
  buyerId: text("buyer_id").notNull().default(""),
  productName: text("product_name").notNull(),
  company: text("company").notNull(),
  tenderNotice: text("tender_notice").notNull().default(""),
  decisionDate: text("decision_date").notNull().default(""),
  payloadJson: text("payload_json").notNull(),
}, (table) => [
  index("tender_alerts_detected_at_idx").on(table.detectedAt),
  index("tender_alerts_sub_ou_idx").on(table.subOu),
  index("tender_alerts_source_key_idx").on(table.sourceKey),
]);

export const alertReads = sqliteTable("alert_reads", {
  alertId: text("alert_id").notNull().references(() => tenderAlerts.id, { onDelete: "cascade" }),
  readerId: text("reader_id").notNull(),
  readAt: text("read_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.alertId, table.readerId] }),
  index("alert_reads_reader_id_idx").on(table.readerId),
]);

export const alertSyncRuns = sqliteTable("alert_sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  generatedAt: text("generated_at").notNull(),
  receivedAt: text("received_at").notNull(),
  newRecords: integer("new_records").notNull().default(0),
  changedRecords: integer("changed_records").notNull().default(0),
  insertedAlerts: integer("inserted_alerts").notNull().default(0),
});
