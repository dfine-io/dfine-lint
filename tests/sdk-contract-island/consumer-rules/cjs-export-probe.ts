// A test-only consumer rule in CommonJS form: it loads only through the jiti interop that project rules keep.
module.exports = {
  meta: { category: "quality", description: "Test probe that only has to load from a module.exports rule" },
  check() {},
};
