import { describe, it, expect } from 'vitest';
import { FORMAT_PRESETS } from './presets';
import { DESIGN_STYLES } from './styles';
import { createDesignFingerprint } from './fingerprint';

describe('Design Configuration Logic', () => {
  describe('Format Presets', () => {
    it('contains exactly 7 format presets', () => {
      expect(Object.keys(FORMAT_PRESETS).length).toBe(7);
    });

    it('has accurate aspect ratios', () => {
      expect(FORMAT_PRESETS.square.aspectRatio).toBe(1);
      expect(FORMAT_PRESETS.portrait.aspectRatio).toBe(1080 / 1350);
      expect(FORMAT_PRESETS.story.aspectRatio).toBe(1080 / 1920);
    });

    it('defines safe area for story format', () => {
      expect(FORMAT_PRESETS.story.safeArea).toBeDefined();
      expect(FORMAT_PRESETS.story.safeArea?.top).toBeGreaterThan(0);
    });
  });

  describe('Design Styles', () => {
    it('contains exactly 5 styles', () => {
      expect(Object.keys(DESIGN_STYLES).length).toBe(5);
    });

    it('requires typography and palette definitions', () => {
      const minimal = DESIGN_STYLES.minimal;
      expect(minimal.defaultPalette.background).toBeDefined();
      expect(minimal.defaultTypography.quoteFont).toBeDefined();
      expect(minimal.composition.paddingScale).toBeGreaterThan(0);
    });
  });

  describe('Fingerprint Cache', () => {
    it('generates identical fingerprints for identical inputs', () => {
      const configA = { format: "square", style: "minimal", a: 1, b: 2 };
      const configB = { style: "minimal", b: 2, a: 1, format: "square" }; // reversed keys
      
      const hashA = createDesignFingerprint(configA);
      const hashB = createDesignFingerprint(configB);
      
      expect(hashA).toBe(hashB);
    });

    it('generates different fingerprints for different formats', () => {
      const configA = { format: "square", style: "minimal" };
      const configB = { format: "portrait", style: "minimal" };
      
      const hashA = createDesignFingerprint(configA);
      const hashB = createDesignFingerprint(configB);
      
      expect(hashA).not.toBe(hashB);
    });
  });
});
