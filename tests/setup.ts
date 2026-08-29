import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
document.documentElement.style.setProperty("--breakpoint-md", "768px");
const {
  cleanupReactRoots,
  configureReactTestEnvironment,
} = await import("./support/react");
configureReactTestEnvironment();

afterEach(() => {
  cleanupReactRoots();
  document.body.replaceChildren();
});
