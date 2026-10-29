
import multer from "multer";
import path from "node:path";

// 1. Allow only JPG and PNG files
const allowedMimeTypes = ["image/jpeg", "image/png"];
const allowedExtensions = [".jpg", ".jpeg", ".png"];

// 2. Use memory storage instead of disk storage
const upload = multer({
  storage: multer.memoryStorage(),

  // 3. Limit the file size to 4 MB
  limits: {
    fileSize: 4 * 1024 * 1024,
    files: 1,
  },

  // 4. Validate the file type
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (
      !allowedMimeTypes.includes(file.mimetype) ||
      !allowedExtensions.includes(extension)
    ) {
      return callback(new Error("INVALID_COVER_TYPE"));
    }

    callback(null, true);
  },
});

export default upload;
