import { expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({ env: {} }));

import {
  FormFieldTypeError,
  optionalKeySegmentField,
  optionalTextField,
  optionalTextFieldOrEmpty,
  requiredFileField,
} from "./media.form";

// `FormData.get()` returns `string | File | null`. The upload route read a text field with
// `String(form.get("alt_text") ?? "")`, so a File submitted under `alt_text` was persisted as
// the literal "[object File]" — malformed input silently became valid metadata. These tests
// pin the typed boundary that replaced it.

function formOf(entries: Record<string, string | File>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.append(key, value);
  return form;
}

const pdf = () => new File(["%PDF"], "cv.pdf", { type: "application/pdf" });

// ── Text fields ─────────────────────────────────────────────────────────────────────────────

test("a normal string is preserved, trimmed", () => {
  expect(optionalTextField(formOf({ alt_text: "  A red mug  " }), "alt_text")).toBe("A red mug");
});

test("an absent optional field is null; the OrEmpty variant is the empty string", () => {
  const empty = formOf({});
  expect(optionalTextField(empty, "alt_text")).toBeNull();
  // alt_text is stored NOT NULL, so absent and empty are the same thing for it.
  expect(optionalTextFieldOrEmpty(empty, "alt_text")).toBe("");
});

test("a whitespace-only value collapses to the documented default", () => {
  expect(optionalTextField(formOf({ alt_text: "   " }), "alt_text")).toBeNull();
  expect(optionalTextFieldOrEmpty(formOf({ alt_text: "   " }), "alt_text")).toBe("");
});

test("an empty string is the documented default, not an error", () => {
  expect(optionalTextFieldOrEmpty(formOf({ alt_text: "" }), "alt_text")).toBe("");
});

test("a FILE under a text field THROWS instead of stringifying", () => {
  // The exact defect: this used to produce "[object File]".
  const form = formOf({ alt_text: pdf() });
  expect(() => optionalTextFieldOrEmpty(form, "alt_text")).toThrow(FormFieldTypeError);
  try {
    optionalTextFieldOrEmpty(form, "alt_text");
  } catch (error) {
    expect((error as FormFieldTypeError).field).toBe("alt_text");
    // Names the field; never echoes the submitted value back.
    expect((error as Error).message).toContain("alt_text");
    expect((error as Error).message).not.toContain("[object");
  }
});

test("no text helper can ever return an object stringification", () => {
  for (const helper of [optionalTextField, optionalTextFieldOrEmpty]) {
    const form = formOf({ title: pdf() });
    let value: unknown;
    try {
      value = helper(form, "title");
    } catch {
      value = undefined;
    }
    expect(String(value)).not.toContain("[object");
  }
});

// ── File field ──────────────────────────────────────────────────────────────────────────────

test("a real file is returned", () => {
  const file = requiredFileField(formOf({ file: pdf() }), "file");
  expect(file.name).toBe("cv.pdf");
});

test("a missing required file throws", () => {
  expect(() => requiredFileField(formOf({}), "file")).toThrow(FormFieldTypeError);
});

test("a STRING under the file field throws instead of being accepted", () => {
  expect(() => requiredFileField(formOf({ file: "not-a-file" }), "file")).toThrow(
    FormFieldTypeError,
  );
});

// ── Storage-key segment ─────────────────────────────────────────────────────────────────────

test("a normal tag passes through", () => {
  expect(optionalKeySegmentField(formOf({ tag: "blog" }), "tag")).toBe("blog");
  expect(optionalKeySegmentField(formOf({}), "tag")).toBeNull();
});

test("a tag that would escape its segment is rejected", () => {
  // `tag` is interpolated into the R2 key as `${tag}/${id}-${name}.${ext}`, so it composes a
  // PATH. Unvalidated it could place an object anywhere in the bucket — including under the
  // private `applicants/` prefix that holds CVs.
  for (const bad of ["../applicants", "applicants/nested", "a\\b", ".hidden", "x".repeat(65)]) {
    expect(() => optionalKeySegmentField(formOf({ tag: bad }), "tag"), bad).toThrow(
      FormFieldTypeError,
    );
  }
});

test("a File under tag is rejected before the segment check", () => {
  expect(() => optionalKeySegmentField(formOf({ tag: pdf() }), "tag")).toThrow(FormFieldTypeError);
});

// ── The route: malformed multipart cannot persist a coerced value ───────────────────────────

async function upload(entries: Record<string, string | File>) {
  mock.module("@/features/auth/auth.service", () => ({
    requireSession: async () => ({ id: 1, email: "editor@thg.test", role: "editor" }),
  }));
  const persisted: unknown[] = [];
  mock.module("@/features/media", () => ({
    uploadMedia: async (_actorId: number, input: unknown) => {
      persisted.push(input);
      return { id: 1 };
    },
  }));

  const { Route } = (await import("@/routes/api/v1/(admin)/media/upload")) as {
    Route: {
      options: { server: { handlers: Record<string, (ctx: unknown) => Promise<Response>> } };
    };
  };
  const form = formOf(entries);
  const response = await Route.options.server.handlers.POST({
    request: new Request("https://cms.thgfulfill.com/api/v1/media/upload", {
      method: "POST",
      body: form,
    }),
  });
  return { status: response.status, body: await response.json(), persisted };
}

const png = () => new File(["PNG"], "mug.png", { type: "image/png" });

test("a valid upload persists the supplied alt text", async () => {
  const result = await upload({ file: png(), alt_text: "A red mug", tag: "products" });
  expect(result.status).toBe(201);
  expect(result.persisted[0]).toMatchObject({ alt_text: "A red mug", tag: "products" });
});

test("an upload with no alt_text persists the empty-string default", async () => {
  const result = await upload({ file: png() });
  expect(result.status).toBe(201);
  expect(result.persisted[0]).toMatchObject({ alt_text: "", tag: null, title: null });
});

test("a File submitted as alt_text is REJECTED and nothing is persisted", async () => {
  // Previously this returned 201 and wrote "[object File]" into the media table.
  const result = await upload({ file: png(), alt_text: pdf() });
  expect(result.status).toBe(400);
  expect((result.body as { error: string }).error).toContain("alt_text");
  expect(result.persisted).toEqual([]);
});

test("a missing file is still a bounded 400", async () => {
  const result = await upload({ alt_text: "orphan" });
  expect(result.status).toBe(400);
  expect(result.persisted).toEqual([]);
});

test("a traversal tag is rejected before anything reaches storage", async () => {
  const result = await upload({ file: png(), tag: "../applicants" });
  expect(result.status).toBe(400);
  expect(result.persisted).toEqual([]);
});

test("no accepted upload can carry an object stringification into storage", async () => {
  const cases: Record<string, string | File>[] = [
    { file: png(), alt_text: "ok" },
    { file: png() },
    { file: png(), title: "t", tag: "blog" },
  ];
  for (const entries of cases) {
    const result = await upload(entries);
    expect(JSON.stringify(result.persisted)).not.toContain("[object");
  }
});
