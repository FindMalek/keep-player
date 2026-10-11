import { useState } from "react";
import { coverUrl } from "../lib/subsonic";

interface CoverProps {
  id: string | undefined;
  size: number;
  /** Rendered size in CSS; the request asks for 2x for sharp retina covers. */
  className?: string;
  alt?: string;
}

/** Square album art; a plain square with a disc mark when there is none or it fails to load. */
export function Cover({ id, size, className = "", alt = "" }: CoverProps) {
  const [failed, setFailed] = useState(false);
  const src = coverUrl(id, size * 2);
  return (
    <div className={`cover ${className}`}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="cover-empty" aria-hidden="true" />
      )}
    </div>
  );
}
