import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default {
  input: "entry.js",
  output: { file: "build/bundle.min.js", format: "umd", name: "AvoDemo" },
  plugins: [resolve(), commonjs(), terser()],
};
