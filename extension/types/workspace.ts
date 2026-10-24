export interface GitFileStatus {
  path: string;
  code: string;
  shortCode: string;
  status: "modified" | "added" | "deleted" | "untracked";
  staged: boolean;
}

export interface GitStatusData {
  isGit: boolean;
  project: string;
  branch: string;
  files: GitFileStatus[];
  stats: {
    total: number;
    modified: number;
    added: number;
    deleted: number;
    untracked: number;
  };
}

export interface FileTreeNode {
  name: string;
  path: string;
  relPath: string;
  type: "dir" | "file";
  ext?: string;
  size?: number;
  children?: FileTreeNode[];
}

export interface CommandLogEntry {
  id: string;
  name: string;
  args: any;
  project: string;
  time: string;
  duration: number;
  status: "success" | "error";
  output: string;
}
