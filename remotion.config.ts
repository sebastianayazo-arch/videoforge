/**
 * Remotion configuration.
 *
 * The project uses NodeNext-style import specifiers (e.g. `import {Root} from
 * "./Root.js"`) in its .tsx sources, which tsc/tsx resolve to .ts/.tsx. The
 * Remotion webpack bundler needs the same mapping via `resolve.extensionAlias`,
 * otherwise it looks for a literal `Root.js` and the bundle fails. This override
 * teaches webpack to try .ts/.tsx for a `.js` specifier.
 */
import { Config } from "@remotion/cli/config";

Config.overrideWebpackConfig((config) => {
  return {
    ...config,
    resolve: {
      ...config.resolve,
      extensionAlias: {
        ...(config.resolve?.extensionAlias ?? {}),
        ".js": [".js", ".ts", ".tsx"],
        ".jsx": [".jsx", ".tsx"],
      },
    },
  };
});
