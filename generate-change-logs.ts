import { formatGitDiff } from "./format-git-diff.ts";

export async function generateChangeLogs(
  outputPath: string,
  gitRevisionList: string[],
  sourceDirectory: string,
  minRevision: number = 0,
  maxRevision: number = gitRevisionList.length - 1,
) {
  console.log("Generating Change logs...");
  Deno.mkdirSync(`${outputPath}/temp/changes`, { recursive: true });
  for (let revisionId = minRevision; revisionId <= maxRevision; revisionId++) {
    const previousRevisionId = revisionId - 1;
    if (previousRevisionId >= 0) {
      const commitId = gitRevisionList[revisionId];
      const previousCommitId = gitRevisionList[previousRevisionId];
      console.log(
        `Generating change log for revision ${revisionId}(${commitId}, ${previousCommitId})...`,
      );
      const utf8TextDecoder = new TextDecoder("utf-8");
      const gitDiffProcess = Deno.run({
        cmd: ["git", "diff", commitId, previousCommitId],
        cwd: sourceDirectory,
        stdout: "piped",
      });
      const gitDiffBuffer = await gitDiffProcess.output();
      const gitDiff = utf8TextDecoder.decode(gitDiffBuffer);
      const gitChanges = formatGitDiff(gitDiff);
      Deno.writeTextFileSync(
        `${outputPath}/temp/changes/${revisionId}`,
        gitChanges,
      );
    }
  }
}

if (import.meta.main) {
  const args = Deno.args;

  if (!args[0] || args[0].match(/(^-h$)|(^--help$)/)) {
    const helpText =
      "Argument help: <output_path> <git_revision_list_path> <source_directory> <min_revision?> <max_revision?>";
    console.log(helpText);
  } else {
    const [
      outputPath,
      gitRevisionListPath,
      sourceDirectory,
      minRevision,
      maxRevision,
    ] = args;
    const gitRevisionList = Deno.readTextFileSync(gitRevisionListPath).split(
      "\n",
    ).filter(Boolean);
    generateChangeLogs(
      outputPath,
      gitRevisionList,
      sourceDirectory,
      +minRevision,
      +maxRevision,
    );
  }
}
