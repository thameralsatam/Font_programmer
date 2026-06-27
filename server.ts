import express from "express";
import cors from "cors";
import path from "path";
import opentype from "opentype.js";
import { createServer as createViteServer } from "vite";
import { svgToOpentype } from "./src/Svgprocessor";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up standard middlewares with reasonable limits
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "success", message: "السيرفر المدمج يعمل بنجاح" });
  });

  // Core endpoint: Generate TTF font from SVG paths
  app.post("/api/generate-font", (req, res) => {
    try {
      const { fontName, glyphs } = req.body;

      if (!glyphs || !Array.isArray(glyphs) || glyphs.length === 0) {
        return res.status(400).json({ error: "الرجاء إرسال حرف واحد على الأقل." });
      }

      // 1. Calculate the overall font metrics (ascent / descent)
      let ascent = 800;
      let descent = -200;

      for (const g of glyphs) {
        if (g.ascent !== undefined && g.ascent !== null) {
          ascent = Math.max(ascent, Number(g.ascent));
        }
        if (g.descent !== undefined && g.descent !== null) {
          descent = Math.min(descent, Number(g.descent));
        }
      }

      // 2. Build the standard required `.notdef` glyph
      const notdefPath = new opentype.Path();
      notdefPath.moveTo(100, 0);
      notdefPath.lineTo(100, 700);
      notdefPath.lineTo(500, 700);
      notdefPath.lineTo(500, 0);
      notdefPath.closePath();

      const notdefGlyph = new opentype.Glyph({
        name: ".notdef",
        unicode: 0,
        path: notdefPath,
        advanceWidth: 600
      });

      const fontGlyphs = [notdefGlyph];

      // 3. Process each incoming Arabic glyph
      for (const g of glyphs) {
        const pathData = g.pathData || "";
        
        // Convert SVG Path string to opentype.Path
        const path = svgToOpentype(pathData);

        // Ensure unicode value is valid
        const uniVal = Number(g.unicode);

        const glyph = new opentype.Glyph({
          name: g.name || `uni${uniVal.toString(16).toUpperCase().padStart(4, "0")}`,
          unicode: uniVal,
          path: path,
          advanceWidth: g.advanceWidth !== undefined ? Number(g.advanceWidth) : 600
        });

        fontGlyphs.push(glyph);
      }

      // 4. Create the OpenType Font object
      const font = new opentype.Font({
        familyName: fontName || "SmartArabicFont",
        styleName: "Regular",
        unitsPerEm: 1000,
        ascender: ascent,
        descender: descent,
        glyphs: fontGlyphs
      });

      // 5. Convert font to ArrayBuffer and send as downloadable TTF
      const arrayBuffer = font.toArrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader("Content-Type", "font/ttf");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fontName || "font")}.ttf"`);
      return res.send(buffer);

    } catch (err: any) {
      console.error("Error generating font on server:", err);
      return res.status(500).json({ error: err.message || "فشل توليد ملف الخط." });
    }
  });

  // Vite middleware or Static files serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
