import { geoPhotos } from "@/db/schema";
import { deleteStoredPhotoFile, persistPhotoFile } from "@/db/photoStorage";
import type { GeoPhoto } from "@/types/geo";
import { useSQLiteContext } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { desc, eq } from "drizzle-orm";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

interface GeoPhotosContextType {
  photos: GeoPhoto[];
  isLoading: boolean;
  error: string | null;
  addPhoto: (photo: GeoPhoto) => Promise<void>;
  removePhoto: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const GeoPhotosContext = createContext<GeoPhotosContextType | undefined>(undefined);

function fromRow(row: typeof geoPhotos.$inferSelect): GeoPhoto {
  return {
    id: row.id,
    uri: row.uri,
    coords:
      row.latitude !== null && row.longitude !== null
        ? {
            latitude: row.latitude,
            longitude: row.longitude,
            accuracy: row.accuracy,
            timestamp: row.coordinateTimestamp ?? row.createdAt,
          }
        : null,
    source: row.source,
    createdAt: row.createdAt,
  };
}

export function GeoPhotosProvider({ children }: { children: ReactNode }) {
  const sqlite = useSQLiteContext();
  const db = useMemo(() => drizzle(sqlite, { schema: { geoPhotos } }), [sqlite]);
  const [photos, setPhotos] = useState<GeoPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const rows = await db.select().from(geoPhotos).orderBy(desc(geoPhotos.createdAt));
    setPhotos(rows.map(fromRow));
  };

  useEffect(() => {
    let active = true;
    db.select().from(geoPhotos).orderBy(desc(geoPhotos.createdAt))
      .then((rows) => {
        if (active) setPhotos(rows.map(fromRow));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las fotos.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [db]);

  const addPhoto = async (photo: GeoPhoto) => {
    setError(null);
    let storedUri: string | null = null;
    try {
      storedUri = await persistPhotoFile(photo.uri, photo.id);
      await db.insert(geoPhotos).values({
        id: photo.id,
        uri: storedUri,
        latitude: photo.coords?.latitude ?? null,
        longitude: photo.coords?.longitude ?? null,
        accuracy: photo.coords?.accuracy ?? null,
        coordinateTimestamp: photo.coords?.timestamp ?? null,
        source: photo.source,
        createdAt: photo.createdAt,
      });
      await refresh();
    } catch (cause) {
      if (storedUri) await deleteStoredPhotoFile(storedUri).catch(() => undefined);
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la foto.";
      setError(message);
      throw cause;
    }
  };

  const removePhoto = async (id: string) => {
    setError(null);
    try {
      const [photo] = await db.select({ uri: geoPhotos.uri }).from(geoPhotos).where(eq(geoPhotos.id, id));
      await db.delete(geoPhotos).where(eq(geoPhotos.id, id));
      await refresh();
      if (photo) await deleteStoredPhotoFile(photo.uri).catch(() => undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo eliminar la foto.";
      setError(message);
      throw cause;
    }
  };

  const clearAll = async () => {
    setError(null);
    try {
      const savedPhotos = await db.select({ uri: geoPhotos.uri }).from(geoPhotos);
      await db.delete(geoPhotos);
      setPhotos([]);
      await Promise.allSettled(savedPhotos.map(({ uri }) => deleteStoredPhotoFile(uri)));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudieron eliminar las fotos.";
      setError(message);
      throw cause;
    }
  };

  return (
    <GeoPhotosContext.Provider value={{ photos, isLoading, error, addPhoto, removePhoto, clearAll }}>
      {children}
    </GeoPhotosContext.Provider>
  );
}

export function useGeoPhotos(): GeoPhotosContextType {
  const context = useContext(GeoPhotosContext);
  if (!context) throw new Error("useGeoPhotos debe ser utilizado dentro de GeoPhotosProvider");
  return context;
}
