import base from "./base.js";

export default [
  ...base,
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
