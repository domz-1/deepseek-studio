import { registerGitRoutes } from "./workspace-git.js";
import { registerFsRoutes, appendCommandLog } from "./workspace-fs.js";

export { appendCommandLog };

export function registerWorkspaceRoutes(app) {
  registerGitRoutes(app);
  registerFsRoutes(app);
}
