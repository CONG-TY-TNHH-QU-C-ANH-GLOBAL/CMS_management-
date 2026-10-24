import { Field, areaClass, inputClass } from "@/components/cms/article/fields";

import type { CampaignDraft, TextKey, TextSpec } from "./campaign-draft";

interface Props {
  specs: readonly TextSpec[];
  draft: CampaignDraft;
  set: (key: TextKey, value: string) => void;
}

/** Renders a list of plain text fields from specs, so the editor declares
 *  WHAT it edits and this file owns HOW a text field looks. */
export function TextFields({ specs, draft, set }: Props) {
  return specs.map((spec) => {
    const common = {
      value: draft[spec.key],
      onChange: (e: { target: { value: string } }) => set(spec.key, e.target.value),
      maxLength: spec.max,
      placeholder: spec.placeholder,
    };
    return (
      <Field
        key={spec.key}
        label={spec.label}
        required={spec.required}
        hint={spec.hint}
        count={{ length: draft[spec.key].length, max: spec.max, ideal: spec.ideal }}
      >
        {spec.rows ? (
          <textarea {...common} rows={spec.rows} className={areaClass} />
        ) : (
          <input {...common} className={spec.mono ? `${inputClass} font-mono` : inputClass} />
        )}
      </Field>
    );
  });
}
