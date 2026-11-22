/**
 * Extracts a stable YouTube Video ID from various valid URL forms.
 * Returns null if the URL is not a recognized YouTube video.
 * Handles:
 * - youtube.com/watch?v=ID
 * - youtu.be/ID
 * - m.youtube.com/watch?v=ID
 * - youtube.com/v/ID
 * - youtube.com/embed/ID
 * 
 * Specifically rejects or returns null for:
 * - playlists (/playlist?list=)
 * - channels (/c/, /channel/, /@user)
 * - shorts (/shorts/ID)
 */
export type YouTubeUrlType = 'video' | 'shorts' | 'playlist' | 'channel' | 'unsupported';

export interface ParsedYouTubeUrl {
  type: YouTubeUrlType;
  id?: string;
}

export function parseYouTubeUrl(url: string): ParsedYouTubeUrl {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, '').replace(/^m\./, '');

    if (hostname !== 'youtube.com' && hostname !== 'youtu.be') {
      return { type: 'unsupported' };
    }

    if (parsedUrl.pathname.startsWith('/playlist')) {
      return { type: 'playlist' };
    }
    
    if (parsedUrl.pathname.startsWith('/c/') || 
        parsedUrl.pathname.startsWith('/channel/') ||
        parsedUrl.pathname.startsWith('/@')) {
      return { type: 'channel' };
    }

    if (parsedUrl.pathname.startsWith('/shorts/')) {
      const parts = parsedUrl.pathname.split('/');
      return { type: 'shorts', id: parts[parts.length - 1] };
    }

    if (hostname === 'youtu.be') {
      const id = parsedUrl.pathname.slice(1);
      return id ? { type: 'video', id } : { type: 'unsupported' };
    }

    if (hostname === 'youtube.com') {
      if (parsedUrl.pathname === '/watch') {
        const v = parsedUrl.searchParams.get('v');
        return v ? { type: 'video', id: v } : { type: 'unsupported' };
      }
      if (parsedUrl.pathname.startsWith('/embed/') || parsedUrl.pathname.startsWith('/v/')) {
        const parts = parsedUrl.pathname.split('/');
        return { type: 'video', id: parts[parts.length - 1] };
      }
    }

    return { type: 'unsupported' };
  } catch {
    return { type: 'unsupported' };
  }
}
