const test = require("node:test");
const assert = require("node:assert");
const { redactJson, redactHeaders, describeBody } = require("./api-log.js");

test("redacts nested secrets", () => {
  const input = { password: "p", data: { token: "t", employee: { name: "A" } }, meta: { bypass_token: "b" } };
  const copy = JSON.stringify(input);
  const out = redactJson(input);
  assert.deepStrictEqual(out, { password: "***", data: { token: "***", employee: { name: "A" } }, meta: { bypass_token: "***" } });
  assert.strictEqual(JSON.stringify(input), copy);
});

test("redacts case-insensitively", () => {
  assert.deepStrictEqual(redactJson({ Face_Token: "x", list: [{ ACCESS_TOKEN: "y" }] }), { Face_Token: "***", list: [{ ACCESS_TOKEN: "***" }] });
});

test("redacts authorization header", () => {
  assert.deepStrictEqual(redactHeaders({ authorization: "Bearer abc", Accept: "x" }), { authorization: "Bearer ***", Accept: "x" });
  const h = redactHeaders(new Headers({ Authorization: "Bearer abc", Accept: "x" }));
  assert.strictEqual(h.authorization, "Bearer ***");
  assert.strictEqual(h.accept, "x");
});

test("describes formdata", () => {
  const fd = new FormData();
  fd.append("lat", "1");
  fd.append("face_token", "x");
  fd.append("file_photo", new File([new Uint8Array(2048)], "selfie.jpg"));
  assert.deepStrictEqual(describeBody(fd), { lat: "1", face_token: "***", file_photo: "[file selfie.jpg, 2 KB]" });
});

test("parses json string body", () => {
  assert.deepStrictEqual(describeBody('{"password":"p","a":1}'), { password: "***", a: 1 });
  assert.strictEqual(describeBody("plain"), "plain");
});

test("null body", () => {
  assert.strictEqual(describeBody(null), null);
  assert.strictEqual(describeBody(undefined), null);
});
