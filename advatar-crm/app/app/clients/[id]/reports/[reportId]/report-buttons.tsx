"use client";

/**
 * The two ways out of the screen. "Save as PDF" opens the browser's
 * print window, where the destination "Save as PDF" writes the file.
 * "Download for Word" saves the same report as a document Word and
 * Google Docs open directly.
 */

const WORD_STYLE = `
  body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #111; line-height: 1.5; }
  h1 { font-size: 24pt; margin: 0 0 4pt; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
  th, td { border: 1px solid #bbb; padding: 4pt 6pt; text-align: left; font-size: 9.5pt; }
  th { background: #f0f0f0; }
  .report-kicker, .report-note { color: #666; font-size: 9.5pt; }
  .report-period { font-size: 12pt; }
`;

export function ReportButtons({ filename }: { filename: string }) {
  function word() {
    const report = document.getElementById("report");
    if (!report) return;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${filename.replace(/[<>&]/g, "")}</title><style>${WORD_STYLE}</style></head><body>${report.innerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename.replace(/[\\/:*?"<>|]/g, "")}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="report-buttons">
      <button type="button" className="btn btn-primary" onClick={() => window.print()}>
        Save as PDF
      </button>
      <button type="button" className="btn" onClick={word}>
        Download for Word
      </button>
    </div>
  );
}
