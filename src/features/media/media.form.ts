// Typed extraction at the multipart boundary.
//
// `FormData.get()` returns `string | File | null`. The upload route read a text field with
// `String(form.get("alt_text") ?? "")`, so a client that submitted a FILE under `alt_text` had
// `"[object File]"` written into the media table as the image's alternative text — accessible
// metadata, persisted, and served to every page that renders the image. Nothing rejected it;
// the coercion made malformed input look valid.
//
// The fix is to parse each field as its DECLARED type and refuse anything else, rather than
// coercing whatever arrives. These helpers are deliberately route-local to the media vertical
// slice — three small functions, not a multipart framework.

/** A field that failed its declared type. Carries the field name so the route can answer with
 *  a bounded message that says which field was wrong, without echoing the value back. */
export class FormFieldTypeError extends Error {
  constructor(
    readonly field: string,
    expected: "text" | "file",
  ) {
    super(`Field "${field}" must be ${expected === "file" ? "a file" : "a text value"}`);
    this.name = "FormFieldTypeError";
  }
}

/**
 * A required file field.
 *
 * Absent and wrong-type are distinct: a missing `file` is "nothing was uploaded", a string
 * under `file` is a malformed request. Both are 4xx, but only one is the client forgetting to
 * attach something.
 */
export function requiredFileField(form: FormData, name: string): File {
  const value = form.get(name);
  if (value === null) throw new FormFieldTypeError(name, "file");
  if (!(value instanceof File)) throw new FormFieldTypeError(name, "file");
  return value;
}

/**
 * An optional text field.
 *
 * Absent → `null` (the caller applies its own documented default). Present as a string →
 * returned trimmed. Present as a File → THROWS. That last case is the whole point: it used to
 * be silently stringified.
 */
export function optionalTextField(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (value === null) return null;
  if (typeof value !== "string") throw new FormFieldTypeError(name, "text");
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * An optional text field whose absent value is the empty string rather than null.
 *
 * `alt_text` is documented as a plain string on UploadMediaInput and is stored NOT NULL, so
 * "absent" and "empty" are the same thing for it. Kept separate from `optionalTextField` so
 * that equivalence is stated at the call site instead of being a `?? ""` at the end of a
 * chain — which is exactly the shape the original bug hid in.
 */
export function optionalTextFieldOrEmpty(form: FormData, name: string): string {
  return optionalTextField(form, name) ?? "";
}

/** A single path segment: no separators, no traversal, no leading dot. */
const SAFE_SEGMENT_MAX = 64;

/**
 * A field that becomes part of an object-storage key.
 *
 * `tag` is interpolated into the R2 key as `${tag}/${id}-${name}.${ext}`, so its content is a
 * PATH, not a label. Unvalidated it could contain `/` or `..` and place an object anywhere in
 * the bucket — including under the private `applicants/` prefix that holds CVs. This does not
 * expose anything (reads are still denied there), but the namespace should be write-isolated
 * too, and a field that composes a storage path has to be validated as one.
 *
 * Restricted to a single lowercase-ish slug segment, which is what every real tag already is.
 */
export function optionalKeySegmentField(form: FormData, name: string): string | null {
  const value = optionalTextField(form, name);
  if (value === null) return null;
  const invalid =
    value.length > SAFE_SEGMENT_MAX ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.startsWith(".");
  if (invalid) throw new FormFieldTypeError(name, "text");
  return value;
}
