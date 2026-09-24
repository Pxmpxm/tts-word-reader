import "server-only"
import { adminDb } from "./supabase/server"
import { oldestAudioToRemove } from "./audioCachePolicy"

export async function pruneAudioCache() {
  const db = adminDb()
  const { data, error } = await db.from("audio_cache")
    .select("user_id,document_id,cache_key,storage_path,byte_size")
    .order("last_used_at", { ascending: true }).limit(1000)
  if (error) throw error
  const removals = oldestAudioToRemove(data || [])
  for (let index = 0; index < removals.length; index += 50) {
    const batch = removals.slice(index, index + 50)
    const { error: storageError } = await db.storage.from("audio").remove(batch.map((item) => item.storage_path))
    if (storageError) throw storageError
    const { error: deleteError } = await db.from("audio_cache").delete()
      .in("storage_path", batch.map((item) => item.storage_path))
    if (deleteError) throw deleteError
  }
  return removals.length
}
