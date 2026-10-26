import { z } from "zod";

/*
 * Subsonic items as the API hands them on: the fields we rely on checked, everything else Navidrome sends passed
 * through untouched (cover ids, replay gain, genres…), so the player gets exactly what Navidrome said.
 */

export const songSchema = z.looseObject({
  id: z.string(),
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  albumId: z.string().optional(),
  coverArt: z.string().optional(),
  duration: z.number().optional(),
});
export type LibrarySong = z.infer<typeof songSchema>;

export const albumSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  artist: z.string().optional(),
  artistId: z.string().optional(),
  coverArt: z.string().optional(),
  year: z.number().optional(),
});
export type LibraryAlbum = z.infer<typeof albumSchema>;

/** A playlist made for you (daily mix, discover weekly, daylist, moods…). */
export const mixSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  songs: z.array(songSchema),
});
export type Mix = z.infer<typeof mixSchema>;
