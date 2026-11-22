export type NormalizedSegment = {
  start: number;
  end: number;
  speaker?: string;
  text: string;
};

/**
 * Parses raw TXT content. Treats the entire text as a single segment since no timestamps exist.
 */
export function parseTxt(content: string): NormalizedSegment[] {
  if (!content.trim()) return [];
  return [{ start: 0, end: 0, text: content.trim() }];
}

/**
 * Parses SRT content into normalized segments.
 */
export function parseSrt(content: string): NormalizedSegment[] {
  if (!content.trim()) return [];
  
  const blocks = content.trim().split(/\r?\n\r?\n/);
  const segments: NormalizedSegment[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) continue; // Needs at least time and text

    // SRT index is on lines[0], time is on lines[1]. However, some malformed SRTs might skip index.
    let timeLine = lines[1];
    let textLines = lines.slice(2);

    let timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timeMatch) {
      // Try line 0 in case the index is missing
      timeLine = lines[0];
      textLines = lines.slice(1);
      timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    }

    if (!timeMatch) continue;

    const start = parseTimestamp(timeMatch[1]);
    const end = parseTimestamp(timeMatch[2]);
    let text = textLines.join('\n').trim();
    if (!text) continue; // skip empty text segments

    let speaker: string | undefined;

    // Optional speaker extraction: "Speaker Name: Text"
    const speakerMatch = text.match(/^([^:]+):\s*(.*)$/);
    if (speakerMatch && speakerMatch[1].length < 30) { // arbitrary limit for speaker name length
      speaker = speakerMatch[1].trim();
      text = speakerMatch[2].trim();
    }

    segments.push({ start, end, speaker, text });
  }
  return segments;
}

/**
 * Parses VTT content into normalized segments.
 */
export function parseVtt(content: string): NormalizedSegment[] {
  if (!content.trim()) return [];
  
  const lines = content.trim().split(/\r?\n/);
  const segments: NormalizedSegment[] = [];
  let currentSegment: Partial<NormalizedSegment> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('WEBVTT') || line === '') {
      continue;
    }

    // Time match: MM:SS.MMM or HH:MM:SS.MMM
    const timeMatch = line.match(/(?:(\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*(?:(\d{2}:)?\d{2}:\d{2}\.\d{3})/);
    
    if (timeMatch) {
      if (currentSegment && currentSegment.text) {
         segments.push(currentSegment as NormalizedSegment);
      }
      const [startStr, endStr] = line.split('-->').map(s => s.trim());
      currentSegment = {
        start: parseVttTimestamp(startStr),
        end: parseVttTimestamp(endStr.split(' ')[0]), // Split space in case of extra alignment settings
        text: '',
      };
    } else if (currentSegment) {
       // Extract speaker from <v Speaker>Text
       let textLine = line;
       const vSpeakerMatch = textLine.match(/<v\s+([^>]+)>(.*)/);
       if (vSpeakerMatch) {
         currentSegment.speaker = vSpeakerMatch[1].trim();
         textLine = vSpeakerMatch[2];
       } else if (!currentSegment.speaker) {
         // Fallback to "Speaker: Text" pattern
         const fallbackSpeakerMatch = textLine.match(/^([^:]+):\s*(.*)$/);
         if (fallbackSpeakerMatch && fallbackSpeakerMatch[1].length < 30) {
           currentSegment.speaker = fallbackSpeakerMatch[1].trim();
           textLine = fallbackSpeakerMatch[2];
         }
       }

       // Strip HTML-like tags (e.g. <b>, <i>, <c.class>)
       textLine = textLine.replace(/<\/?[^>]+(>|$)/g, "");

       if (currentSegment.text) {
         currentSegment.text += '\n' + textLine;
       } else {
         currentSegment.text = textLine;
       }
    }
  }

  if (currentSegment && currentSegment.text) {
    segments.push(currentSegment as NormalizedSegment);
  }

  return segments;
}

function parseTimestamp(timestamp: string): number {
  const [hms, ms = '0'] = timestamp.split(/[,.]/);
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
}

function parseVttTimestamp(timestamp: string): number {
  const parts = timestamp.split(':');
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) {
    [h, m, s] = [Number(parts[0]), Number(parts[1]), parseFloat(parts[2])];
  } else if (parts.length === 2) {
    [m, s] = [Number(parts[0]), parseFloat(parts[1])];
  }
  return h * 3600 + m * 60 + s;
}

export function parseTranscript(content: string, type: 'txt' | 'srt' | 'vtt'): NormalizedSegment[] {
  switch (type) {
    case 'txt':
      return parseTxt(content);
    case 'srt':
      return parseSrt(content);
    case 'vtt':
      return parseVtt(content);
    default:
      throw new Error(`Unsupported transcript type: ${type}`);
  }
}
