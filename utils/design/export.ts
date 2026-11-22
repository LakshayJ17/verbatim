import { toPng } from 'html-to-image';

/**
 * Renders the design node with `elementId` to a full-size PNG data URL.
 *
 * The node may sit inside a CSS-scaled parent (ScaledRenderer scales a
 * full-size Renderer down with `transform: scale()` on a wrapper).
 * html-to-image clones the node and copies the computed style of the node and
 * its descendants only, so a transform on an ancestor does not shrink the
 * clone. Two inherited or own properties can still leak into the image, so
 * they are reset on the clone through the `style` option:
 * - `visibility`: ScaledRenderer hides its wrapper until it has measured, and
 *   visibility is inherited, so an unmeasured tile would export blank.
 * - `transform` / `margin`: in case a caller ever puts them on the node itself.
 */
export async function exportDesignToPng(elementId: string, width: number, height: number): Promise<string> {
  const node = document.getElementById(elementId);
  if (!node) {
    throw new Error(`Element with id ${elementId} not found`);
  }

  // We temporarily modify the node to be exact export size
  const originalWidth = node.style.width;
  const originalHeight = node.style.height;

  node.style.width = `${width}px`;
  node.style.height = `${height}px`;

  try {
    const dataUrl = await toPng(node, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1, // standard ratio
      cacheBust: true,
      skipFonts: false,
      style: {
        visibility: 'visible',
        transform: 'none',
        margin: '0',
      },
    });

    return dataUrl;
  } finally {
    // Restore
    node.style.width = originalWidth;
    node.style.height = originalHeight;
  }
}

/** Same as exportDesignToPng, as a PNG Blob ready to upload or share. */
export async function exportDesignToPngBlob(elementId: string, width: number, height: number): Promise<Blob> {
  const dataUrl = await exportDesignToPng(elementId, width, height);
  const res = await fetch(dataUrl);
  return res.blob();
}
