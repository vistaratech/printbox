import fs from 'fs';
import path from 'path';
import { PDFDocument, degrees } from 'pdf-lib';
import { PrintOptions } from '../../types';
import { config } from '../../config';

export class PdfProcessorService {
  private static processedDir = path.join(config.uploadDir, 'processed');

  private static ensureProcessedDir(): void {
    if (!fs.existsSync(this.processedDir)) {
      fs.mkdirSync(this.processedDir, { recursive: true });
    }
  }

  /**
   * Parse a page range string like "1-3, 5, 7-9" into an array of 0-indexed page indices
   */
  public static parseRange(rangeText: string, totalPages: number): number[] {
    const indices = new Set<number>();
    const parts = rangeText.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      const match = trimmed.match(/^(\d+)(?:-(\d+))?$/);
      if (!match) continue;

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : start;

      const min = Math.max(1, Math.min(start, end));
      const max = Math.min(totalPages, Math.max(start, end));

      for (let i = min; i <= max; i++) {
        indices.add(i - 1); // Convert 1-indexed to 0-indexed
      }
    }

    const sorted = Array.from(indices).sort((a, b) => a - b);
    return sorted.length > 0 ? sorted : Array.from({ length: totalPages }, (_, i) => i);
  }

  /**
   * Merges multiple files (PDFs and/or images) into a single unified PDF document.
   * Returns total page count of the merged document.
   */
  public static async mergeDocuments(filePaths: string[], outputPath: string): Promise<number> {
    this.ensureProcessedDir();
    const mergedDoc = await PDFDocument.create();

    for (const fp of filePaths) {
      if (!fs.existsSync(fp)) {
        console.warn(`[PdfProcessor] Skipping missing file during merge: ${fp}`);
        continue;
      }

      const ext = path.extname(fp).toLowerCase();
      try {
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          const imgBytes = fs.readFileSync(fp);
          const img = ext === '.png' ? await mergedDoc.embedPng(imgBytes) : await mergedDoc.embedJpg(imgBytes);
          const page = mergedDoc.addPage([595.28, 841.89]);
          const { width, height } = img.scaleToFit(595.28 - 40, 841.89 - 40);
          page.drawImage(img, {
            x: (595.28 - width) / 2,
            y: (841.89 - height) / 2,
            width,
            height
          });
        } else if (ext === '.pdf') {
          const fileBytes = fs.readFileSync(fp);
          const srcDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
          const pageIndices = srcDoc.getPageIndices();
          const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
          for (const page of copiedPages) {
            mergedDoc.addPage(page);
          }
        }
      } catch (err: any) {
        console.error(`[PdfProcessor] Failed to merge file ${fp}:`, err?.message || err);
      }
    }

    if (mergedDoc.getPageCount() === 0) {
      // Fallback empty page if all files failed
      mergedDoc.addPage([595.28, 841.89]);
    }

    const mergedBytes = await mergedDoc.save({ useObjectStreams: true });
    fs.writeFileSync(outputPath, mergedBytes);
    console.log(`[PdfProcessor] Merged ${filePaths.length} documents into ${outputPath} (${mergedDoc.getPageCount()} pages)`);
    return mergedDoc.getPageCount();
  }

  /**
   * Pre-process an uploaded file according to user's PrintOptions:
   * 1. Extracts only selected pages (e.g. range 1-3, or excluded pages in page editor)
   * 2. Applies page rotations (0, 90, 180, 270)
   * 3. Multiplies collated copies if copies > 1
   * 4. Converts single images into standard print-ready PDF
   * 
   * Returns the file path of the final, print-ready PDF.
   */
  public static async processForPrinting(
    inputFilePath: string,
    options: PrintOptions,
    jobCode: string
  ): Promise<string> {
    this.ensureProcessedDir();

    if (!fs.existsSync(inputFilePath)) {
      console.warn(`[PdfProcessor] Input file does not exist: ${inputFilePath}`);
      return inputFilePath;
    }

    const ext = path.extname(inputFilePath).toLowerCase();
    const outputPath = path.join(this.processedDir, `${jobCode}_print_ready.pdf`);

    try {
      // ── CASE A: Image Files (JPG, PNG) ──
      if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        console.log(`[PdfProcessor] Converting image to print-ready PDF for ${jobCode}`);
        const imgBytes = fs.readFileSync(inputFilePath);
        const pdfDoc = await PDFDocument.create();

        let embeddedImg;
        if (ext === '.png') {
          embeddedImg = await pdfDoc.embedPng(imgBytes);
        } else {
          embeddedImg = await pdfDoc.embedJpg(imgBytes);
        }

        // Standard A4 dimensions in points: 595.28 x 841.89
        const a4Width = options.orient === 'landscape' ? 841.89 : 595.28;
        const a4Height = options.orient === 'landscape' ? 595.28 : 841.89;

        const copies = options.copies || 1;
        for (let c = 0; c < copies; c++) {
          const page = pdfDoc.addPage([a4Width, a4Height]);
          const { width, height } = embeddedImg.scaleToFit(a4Width - 40, a4Height - 40);
          page.drawImage(embeddedImg, {
            x: (a4Width - width) / 2,
            y: (a4Height - height) / 2,
            width,
            height
          });
        }

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, pdfBytes);
        return outputPath;
      }

      // ── CASE B: PDF Documents ──
      if (ext === '.pdf') {
        const fileBytes = fs.readFileSync(inputFilePath);
        const srcDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
        const totalPages = srcDoc.getPageCount();

        // 1. Determine active page indices and individual rotations
        let targetPages: { index: number; rotation: number }[] = [];

        if (Array.isArray(options.pageList) && options.pageList.length > 0) {
          // Use detailed pageList from interactive page editor
          for (const item of options.pageList) {
            if (!item.d && item.i >= 1 && item.i <= totalPages) {
              targetPages.push({
                index: item.i - 1,
                rotation: Number(item.r) || 0
              });
            }
          }
        } else if (options.range === 'custom' && options.rangeText) {
          // Use range text (e.g. "1-3, 5")
          const indices = this.parseRange(options.rangeText, totalPages);
          targetPages = indices.map(idx => ({ index: idx, rotation: 0 }));
        } else {
          // All pages
          targetPages = Array.from({ length: totalPages }, (_, i) => ({ index: i, rotation: 0 }));
        }

        if (targetPages.length === 0) {
          targetPages = Array.from({ length: totalPages }, (_, i) => ({ index: i, rotation: 0 }));
        }

        console.log(`[PdfProcessor] Processing PDF for ${jobCode}: ${targetPages.length} pages of ${totalPages} selected`);

        // 2. Create the destination document
        const finalDoc = await PDFDocument.create();
        const copies = options.collate ? (options.copies || 1) : 1;

        // Copy and append pages (duplicated for collated copies)
        for (let c = 0; c < copies; c++) {
          const pageIndices = targetPages.map(p => p.index);
          const copiedPages = await finalDoc.copyPages(srcDoc, pageIndices);

          for (let i = 0; i < copiedPages.length; i++) {
            const page = copiedPages[i];
            const rotationOffset = targetPages[i].rotation;
            if (rotationOffset) {
              const currentRotation = page.getRotation().angle;
              page.setRotation(degrees((currentRotation + rotationOffset) % 360));
            }
            finalDoc.addPage(page);
          }
        }

        // 3. Save optimized output PDF
        const finalPdfBytes = await finalDoc.save({ useObjectStreams: true });
        fs.writeFileSync(outputPath, finalPdfBytes);
        console.log(`[PdfProcessor] Successfully saved print-ready PDF: ${outputPath} (${(finalPdfBytes.length / 1024).toFixed(1)} KB)`);
        return outputPath;
      }

      // If other format, return original file path safely
      return inputFilePath;
    } catch (err: any) {
      console.error(`[PdfProcessor] Error preprocessing PDF for ${jobCode}:`, err?.message || err);
      // Fallback: return original file
      return inputFilePath;
    }
  }
}
