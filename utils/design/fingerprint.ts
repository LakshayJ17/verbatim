/* eslint-disable @typescript-eslint/no-explicit-any */
export function createDesignFingerprint(designConfig: any): string {
  // A canonical serialization that sorts object keys before stringifying
  const canonicalize = (obj: any): any => {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(canonicalize);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: any = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(obj[key]);
    }
    return result;
  };

  const serialized = JSON.stringify(canonicalize(designConfig));
  
  // Create a simple deterministic hash using standard Web Crypto or simple hash function
  let hash = 0;
  for (let i = 0; i < serialized.length; i++) {
    const char = serialized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return hash.toString(16);
}
