import { expect, test } from "bun:test";

import { parseYouTubeId } from "./youtube";

const ID = "q7NiFssAaRE";

test.each([
  [`https://youtu.be/${ID}`],
  [`https://youtu.be/${ID}?si=abc`],
  [`https://www.youtube.com/watch?v=${ID}&t=30s`],
  [`https://m.youtube.com/watch?v=${ID}`],
  [`https://www.youtube.com/shorts/${ID}`],
  [`https://www.youtube.com/embed/${ID}`],
  [`https://www.youtube.com/live/${ID}`],
  [`youtube.com/watch?v=${ID}`],
  [`  https://youtu.be/${ID}  `],
])("reads the id from %s", (url) => {
  expect(parseYouTubeId(url)).toBe(ID);
});

test.each([
  [""],
  [null],
  ["https://www.facebook.com/share/p/1Spw5uMYPT/"],
  ["https://www.youtube.com/@thgfulfillment"],
  ["https://youtu.be/short"],
  ["https://notyoutube.com/watch?v=q7NiFssAaRE"],
  ["không phải link"],
])("rejects %s", (url) => {
  expect(parseYouTubeId(url)).toBeNull();
});
