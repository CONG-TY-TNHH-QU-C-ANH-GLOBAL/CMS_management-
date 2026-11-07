-- 0065: Preserve proof that a monthly-source PDF passed a byte-signature check.
--
-- `media.mime` is declared by the uploading browser and can be forged.  The
-- monthly PDF route stamps this immutable upload-time fact only after checking
-- the file's `%PDF-` signature; later metadata edits cannot turn another file
-- into a publishable monthly PDF.

ALTER TABLE media
  ADD COLUMN monthly_pdf_verified INTEGER NOT NULL DEFAULT 0
  CHECK (monthly_pdf_verified IN (0, 1));
