const multer = require("multer");
const path = require("path");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

// --- Cloudinary Direct Upload (existing, kept for backward compatibility) ---
const cloudinaryStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "kinetoscope",
        resource_type: "auto",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf", "docx"],
    },
});

const upload = multer({
    storage: cloudinaryStorage,
});

// --- Memory Storage (serverless safe, fast parallel upload pattern) ---
const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, fieldSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpg|jpeg|png|webp|pdf|docx/;
        const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimeType = allowedTypes.test(file.mimetype) ||
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.mimetype.startsWith('image/');
        if (extName || mimeType) {
      cb(null, true);
    } else {
      cb(new Error('Only jpg, jpeg, png, webp, pdf, and docx files are allowed.'));
    }
  },
});

// --- Rewards Upload Memory Storage (allows images and videos) ---
const rewardsUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpg|jpeg|png|webp|mp4|webm|avi|mov|mkv/;
    const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = allowedTypes.test(file.mimetype) ||
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/');
    if (extName || mimeType) {
      cb(null, true);
    } else {
      cb(new Error('Only images (jpg, jpeg, png, webp) and videos (mp4, webm, avi, mov) are allowed.'));
    }
  },
});

// Generic upload middleware allowing any file type up to 25MB (primarily for email attachments)
const anyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

module.exports = { upload, memoryUpload, rewardsUpload, anyUpload };
