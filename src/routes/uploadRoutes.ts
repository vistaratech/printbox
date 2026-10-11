import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { UploadedFileInfo } from '../types';

const router = Router();

// Ensure upload directory exists
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|docx?|pptx?|jpe?g|png|webp|txt)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Supported: PDF, Word, PowerPoint, Images, Text'));
    }
  }
});

/**
 * Non-blocking PDF page counter using async file read
 */
async function estimatePdfPages(filePath: string): Promise<number> {
  try {
    const buffer = await fs.promises.readFile(filePath);
    const content = buffer.toString('latin1');
    const matches = content.match(/\/Type\s*\/Page[^s]/g);
    return matches && matches.length > 0 ? matches.length : 1;
  } catch (err) {
    return 1;
  }
}

/**
 * POST /api/upload
 * Handles document upload with async page detection
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  let detectedPages = 1;

  if (ext === '.pdf') {
    detectedPages = await estimatePdfPages(req.file.path);
  } else if (/^\.(jpe?g|png|webp)$/i.test(ext)) {
    detectedPages = 1;
  } else {
    // For DOCX/PPTX, default estimate (client can override)
    detectedPages = 5;
  }

  const fileInfo: UploadedFileInfo = {
    id: path.basename(req.file.filename, ext),
    originalName: req.file.originalname,
    fileName: req.file.filename,
    filePath: req.file.path, // Keep internally but...
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    detectedPages,
    createdAt: new Date().toISOString()
  };

  // Return safe response WITHOUT exposing server filesystem paths
  return res.status(201).json({
    success: true,
    file: {
      id: fileInfo.id,
      originalName: fileInfo.originalName,
      fileName: fileInfo.fileName,
      downloadUrl: `/uploads/${fileInfo.fileName}`,
      fileSize: fileInfo.fileSize,
      mimeType: fileInfo.mimeType,
      detectedPages: fileInfo.detectedPages,
      createdAt: fileInfo.createdAt
    }
  });
});

export default router;
