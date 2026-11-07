export type GitHubRepository = {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  stars: number;
};
