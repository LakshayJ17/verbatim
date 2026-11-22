import { describe, it, expect } from 'vitest';
import { parseYouTubeUrl } from './normalization';
import { filterValidCategories } from './categories';

describe('Source Pure Logic', () => {
  describe('URL Normalization', () => {
    it('extracts normal watch URLs', () => {
      const res = parseYouTubeUrl('https://www.youtube.com/watch?v=ABC12345');
      expect(res.type).toBe('video');
      expect(res.id).toBe('ABC12345');
    });

    it('extracts shortened URLs', () => {
      const res = parseYouTubeUrl('https://youtu.be/XYZ987');
      expect(res.type).toBe('video');
      expect(res.id).toBe('XYZ987');
    });

    it('handles timestamps safely', () => {
      const res = parseYouTubeUrl('https://youtube.com/watch?v=12345&t=120s');
      expect(res.type).toBe('video');
      expect(res.id).toBe('12345');
    });

    it('identifies playlists as unsupported for direct analysis', () => {
      const res = parseYouTubeUrl('https://youtube.com/playlist?list=PL123');
      expect(res.type).toBe('playlist');
    });

    it('identifies shorts', () => {
      const res = parseYouTubeUrl('https://youtube.com/shorts/SHORT123');
      expect(res.type).toBe('shorts');
      expect(res.id).toBe('SHORT123');
    });
    
    it('identifies channel URLs', () => {
      const res = parseYouTubeUrl('https://youtube.com/@channelName');
      expect(res.type).toBe('channel');
    });
  });

  describe('Category Filtering', () => {
    it('keeps valid categories and drops invalid ones', () => {
      const cats = filterValidCategories(['Technology', 'InvalidCat', 'Business']);
      expect(cats).toEqual(['Technology', 'Business']);
    });

    it('enforces maximum of 3 categories', () => {
      const cats = filterValidCategories(['Music', 'Entertainment', 'Sports', 'Business']);
      expect(cats).toEqual(['Music', 'Entertainment', 'Sports']);
    });

    it('removes duplicates', () => {
      const cats = filterValidCategories(['Technology', 'Technology', 'Science']);
      expect(cats).toEqual(['Technology', 'Science']);
    });
  });
});
