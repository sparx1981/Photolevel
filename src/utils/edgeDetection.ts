export interface DetectedLine {
  x1: number;    // left endpoint x, normalised 0–1
  y1: number;    // left endpoint y, normalised 0–1
  x2: number;    // right endpoint x, normalised 0–1
  y2: number;    // right endpoint y, normalised 0–1
  normX: number; // centre x, normalised
  normY: number; // top edge y, normalised (minimum of y1, y2)
  normWidth: number;
  angleDeg: number; // slope angle in degrees
  strength: number; // 0–1, how strong/clear this edge is
}

export async function detectHorizontalEdges(
  imageDataUrl: string
): Promise<DetectedLine[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Work at a fixed analysis resolution for consistent results
      const ANALYSIS_W = 640;
      const ANALYSIS_H = Math.round((img.naturalHeight / img.naturalWidth) * ANALYSIS_W);

      const canvas = document.createElement("canvas");
      canvas.width  = ANALYSIS_W;
      canvas.height = ANALYSIS_H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, ANALYSIS_W, ANALYSIS_H);

      const imageData = ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);
      const data = imageData.data;

      // ── Step 1: Greyscale ─────────────────────────────────────────────
      const grey = new Float32Array(ANALYSIS_W * ANALYSIS_H);
      for (let i = 0; i < ANALYSIS_W * ANALYSIS_H; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        grey[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }

      // ── Step 2: Sobel horizontal gradient (detects horizontal edges) ──
      // Sobel Y kernel detects horizontal edges (sharp vertical contrast changes)
      const sobelY = new Float32Array(ANALYSIS_W * ANALYSIS_H);
      for (let y = 1; y < ANALYSIS_H - 1; y++) {
        for (let x = 1; x < ANALYSIS_W - 1; x++) {
          const idx = y * ANALYSIS_W + x;
          const gy =
            -grey[(y-1) * ANALYSIS_W + (x-1)] - 2*grey[(y-1)*ANALYSIS_W+x] - grey[(y-1)*ANALYSIS_W+(x+1)]
            +grey[(y+1) * ANALYSIS_W + (x-1)] + 2*grey[(y+1)*ANALYSIS_W+x] + grey[(y+1)*ANALYSIS_W+(x+1)];
          sobelY[idx] = Math.abs(gy);
        }
      }

      // ── Step 3: Threshold the gradient map ───────────────────────────
      const THRESHOLD = 40;
      const edges = new Uint8Array(ANALYSIS_W * ANALYSIS_H);
      for (let i = 0; i < sobelY.length; i++) {
        edges[i] = sobelY[i] > THRESHOLD ? 1 : 0;
      }

      // ── Step 4: Simplified Hough-style horizontal scan ────────────────
      // For each row, find horizontal runs of edge pixels.
      // Group runs that are close in Y into single line segments.
      const MIN_LINE_LENGTH = Math.round(ANALYSIS_W * 0.06); // min 6% of width
      const MAX_GAP         = Math.round(ANALYSIS_W * 0.04); // allow 4% gap within a line

      const rawLines: Array<{ y: number; x1: number; x2: number }> = [];

      for (let row = 1; row < ANALYSIS_H - 1; row++) {
        let runStart = -1;
        let gapCount = 0;

        for (let col = 0; col < ANALYSIS_W; col++) {
          const isEdge = edges[row * ANALYSIS_W + col] === 1;

          if (isEdge) {
            if (runStart === -1) runStart = col;
            gapCount = 0;
          } else {
            if (runStart !== -1) {
              gapCount++;
              if (gapCount > MAX_GAP) {
                const len = col - gapCount - runStart;
                if (len >= MIN_LINE_LENGTH) {
                  rawLines.push({ y: row, x1: runStart, x2: col - gapCount });
                }
                runStart = -1;
                gapCount = 0;
              }
            }
          }
        }
        // Close any open run at end of row
        if (runStart !== -1) {
          const len = ANALYSIS_W - runStart;
          if (len >= MIN_LINE_LENGTH) {
            rawLines.push({ y: row, x1: runStart, x2: ANALYSIS_W - 1 });
          }
        }
      }

      // ── Step 5: Merge lines in nearby rows into single segments ───────
      const MERGE_Y_TOLERANCE = 4; // rows within 4px are the same edge
      const merged: Array<{ ySum: number; count: number; x1: number; x2: number }> = [];

      for (const line of rawLines) {
        const existing = merged.find(m =>
          Math.abs(m.ySum / m.count - line.y) <= MERGE_Y_TOLERANCE &&
          line.x1 < m.x2 + ANALYSIS_W * 0.05 &&
          line.x2 > m.x1 - ANALYSIS_W * 0.05
        );
        if (existing) {
          existing.ySum += line.y;
          existing.count++;
          existing.x1 = Math.min(existing.x1, line.x1);
          existing.x2 = Math.max(existing.x2, line.x2);
        } else {
          merged.push({ ySum: line.y, count: 1, x1: line.x1, x2: line.x2 });
        }
      }

      // ── Step 6: Convert to normalised DetectedLine format ─────────────
      const results: DetectedLine[] = merged
        .filter(m => (m.x2 - m.x1) >= MIN_LINE_LENGTH)
        .map(m => {
          const avgY  = m.ySum / m.count;
          const normX1 = m.x1 / ANALYSIS_W;
          const normX2 = m.x2 / ANALYSIS_W;
          const normYv = avgY  / ANALYSIS_H;
          return {
            x1: normX1,
            y1: normYv,
            x2: normX2,
            y2: normYv,
            normX:     (normX1 + normX2) / 2,
            normY:     normYv,
            normWidth: normX2 - normX1,
            angleDeg:  0, // horizontal scan = 0° by definition
            strength:  Math.min(1, (m.x2 - m.x1) / (ANALYSIS_W * 0.3))
          };
        })
        // Sort by strength descending — strongest edges first
        .sort((a, b) => b.strength - a.strength)
        // Keep top 40 candidates — more than enough
        .slice(0, 40);

      console.log(`[EdgeDetect] Found ${results.length} horizontal edge candidates`);
      resolve(results);
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}
