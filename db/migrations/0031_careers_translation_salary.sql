-- 0031: localize careers salary + salary_unit (Workstream C — JD pages)
--
-- The careers EN/ZH job pages showed "7 triệu" / "+ hoa hồng + thưởng" because
-- salary + salary_unit were NON-translated (served from the VI source for all
-- locales). Add them to careers_job_translations so the translate pipeline can
-- localize the comp line ("+ commission + bonus", "700万", …). Nullable — the
-- public reader COALESCEs to the VI source when a translation hasn't filled
-- them yet (so existing reviewed rows keep working until re-translated).
--
-- location/badge/employment_type intentionally remain non-translated (physical
-- address / already-English labels).

ALTER TABLE careers_job_translations ADD COLUMN salary TEXT;
ALTER TABLE careers_job_translations ADD COLUMN salary_unit TEXT;
