
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import upload from "./config/upload.js";
import cloudinary from "./config/cloudinary.js";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const recipes = [
  {
    id: "r1",
    title: "Roasted Tomato Pasta",
    coverUrl: null,
    coverPublicId: null,
  },
  {
    id: "r2",
    title: "Lemon Rice Bowl",
    coverUrl: null,
    coverPublicId: null,
  },
];

app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "RecipeShelf" });
});

app.get("/api/recipes", (req, res) => {
  res.json({ recipes });
});

app.get("/api/recipes/:recipeId", (req, res) => {
  const recipe = recipes.find(
    (item) => item.id === req.params.recipeId
  );

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found" });
  }

  return res.json({ recipe });
});

// Check the recipe before processing the uploaded file.
function findRecipe(req, res, next) {
  const recipe = recipes.find(
    (item) => item.id === req.params.recipeId
  );

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found" });
  }

  req.recipe = recipe;
  next();
}

// Validate actual file signatures, not just MIME types.
function isValidImage(buffer) {
  if (!buffer || buffer.length < 8) {
    return false;
  }

  // JPEG signature: FF D8 FF
  const isJpeg =
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  const isPng = buffer
    .subarray(0, 8)
    .equals(pngSignature);

  return isJpeg || isPng;
}

function uploadBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "recipeshelf/covers",
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result?.secure_url || !result?.public_id) {
          return reject(
            new Error("Cloudinary returned an incomplete result")
          );
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

app.post(
  "/api/recipes/:recipeId/cover",
  findRecipe,
  upload.single("cover"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message: "Cover image is required",
      });
    }

    if (!isValidImage(req.file.buffer)) {
      return res.status(400).json({
        message: "Only valid JPG and PNG images are allowed",
      });
    }

    const recipe = req.recipe;
    const previousPublicId = recipe.coverPublicId;

    let result;

    // Upload the new image first.
    try {
      result = await uploadBuffer(req.file.buffer);
    } catch (error) {
      console.error("Cloudinary upload failed:", error.message);

      return res.status(502).json({
        message: "Failed to upload cover to Cloudinary",
      });
    }

    // Save the new cover before deleting the previous cover.
    recipe.coverUrl = result.secure_url;
    recipe.coverPublicId = result.public_id;

    // Delete the previous image only after the new cover is saved.
    if (previousPublicId && previousPublicId !== result.public_id) {
      try {
        const deletion = await cloudinary.uploader.destroy(
          previousPublicId,
          { resource_type: "image" }
        );

        if (deletion.result !== "ok" &&
            deletion.result !== "not found") {
          console.error(
            "Previous cover could not be deleted:",
            previousPublicId
          );
        }
      } catch (error) {
        // The new cover is already saved; do not lose that success.
        console.error(
          "Previous cover cleanup failed:",
          error.message
        );
      }
    }

    return res.status(201).json({
      recipeId: recipe.id,
      coverUrl: recipe.coverUrl,
    });
  }
);

// Centralized upload and application error handling.
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: "Cover image must not exceed 4 MB",
      });
    }

    return res.status(400).json({
      message: error.message,
    });
  }

  if (error.message === "INVALID_COVER_TYPE") {
    return res.status(400).json({
      message: "Only JPG and PNG files are allowed",
    });
  }

  console.error(error);
  return res.status(500).json({
    message: "Unexpected server error",
  });
});

app.listen(port, () => {
  console.log(`RecipeShelf API running on http://localhost:${port}`);
});
