/**
 * Remotion entry point. `remotion studio` / `remotion render` load this and
 * expect the root registered here.
 */
import { registerRoot } from "remotion";
import { Root } from "./Root.js";

registerRoot(Root);
