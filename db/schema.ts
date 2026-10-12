import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const geoPhotos = sqliteTable("geo_photos", {
  id: text("id").primaryKey().notNull(),
  uri: text("uri").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  accuracy: real("accuracy"),
  coordinateTimestamp: integer("coordinate_timestamp"),
  source: text("source", { enum: ["camera", "gallery"] }).notNull(),
  createdAt: integer("created_at").notNull(),
});

export type GeoPhotoRow = typeof geoPhotos.$inferSelect;
export type NewGeoPhotoRow = typeof geoPhotos.$inferInsert;
