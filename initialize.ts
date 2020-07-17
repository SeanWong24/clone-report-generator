import { copySync } from "https://deno.land/std@v0.61.0/fs/copy.ts";
import { isFileOrDirectoryExisting } from "./is-file-or-directory-existing.ts";
import { generateChangeLogs } from "./generate-change-logs.ts";
import { mapChanges } from "./map_changes.ts";

export async function initialize(
  sourceDirectory: string,
  sourceBranchName: string,
  nicadGranularity: string,
  nicadLang: string,
  outputPath: string,
  minRevision: number = 0,
  maxRevision?: number,
) {
  if (
    !(sourceDirectory && sourceBranchName && nicadGranularity && nicadLang &&
      outputPath)
  ) {
    throw new Error("Not all required arguments are provided.");
  }

  const nicadDirectory = `${Deno.cwd()}/NiCad-5.2`;
  const nicadSystemsDirectory = `${nicadDirectory}/systems`;

  await checkInstallations();
  await extractNicadIfNotExsits(nicadDirectory);
  await compileNicadIfNotCompiled(nicadDirectory);

  try {
    Deno.removeSync(`${outputPath}/temp`, { recursive: true });
  } catch (error) {}
  Deno.mkdirSync(`${outputPath}/temp`, { recursive: true });

  await gitCheckout(sourceBranchName, sourceDirectory);
  const gitRevisionList = await obtainGitRevisionList(sourceDirectory);
  Deno.writeTextFileSync(
    `${outputPath}/temp/revisions`,
    gitRevisionList.join("\n"),
  );

  await generateNicadReports(
    outputPath,
    gitRevisionList,
    sourceDirectory,
    nicadSystemsDirectory,
    nicadGranularity,
    nicadLang,
    nicadDirectory,
    minRevision,
    maxRevision,
  );
  await generateChangeLogs(
    outputPath,
    gitRevisionList,
    sourceDirectory,
    minRevision,
    maxRevision,
  );

  await gitCheckout(sourceBranchName, sourceDirectory);

  console.log(
    `Mapping changes with argments of (systems/source, 0, ${gitRevisionList
      .length -
      1}, ${outputPath}/temp/reports, ${outputPath}/temp/changes, ${outputPath})...`,
  );
  mapChanges(
    "systems/source",
    0,
    gitRevisionList.length - 1,
    `${outputPath}/temp/reports`,
    `${outputPath}/temp/changes`,
    outputPath,
  );

  console.log("Saving NiCad params...");
  Deno.writeTextFileSync(
    `${outputPath}/nicad-params`,
    `${sourceBranchName}\n${nicadGranularity}\n${nicadLang}\n${outputPath}`,
  );

  console.log("Done.");
}

async function generateNicadReports(
  outputPath: string,
  gitRevisionList: string[],
  sourceDirectory: string,
  nicadSystemsDirectory: string,
  nicadGranularity: string,
  nicadLang: string,
  nicadDirectory: string,
  minRevision: number = 0,
  maxRevision: number = gitRevisionList.length - 1,
) {
  console.log("Generating NiCad reports...");
  Deno.mkdirSync(`${outputPath}/temp/reports`, { recursive: true });
  for (let revisionId = minRevision; revisionId <= maxRevision; revisionId++) {
    const commitId = gitRevisionList[revisionId];
    console.log(`Processing revision ${revisionId}(${commitId})...`);
    const gitCheckoutProcess = Deno.run({
      cmd: ["git", "checkout", commitId],
      cwd: sourceDirectory,
      stdout: "piped",
    });
    await gitCheckoutProcess.output();
    clearNicadSystemsDirectory(nicadSystemsDirectory);
    copySync(sourceDirectory, `${nicadSystemsDirectory}/source`);
    const nicadProcess = Deno.run({
      cmd: [
        "./nicad5",
        nicadGranularity,
        nicadLang,
        "systems/source",
        "default",
      ],
      cwd: nicadDirectory,
      stdout: "piped",
    });
    await nicadProcess.output();
    const nicadReportOriginalPath =
      `${nicadSystemsDirectory}/source_functions-blind-clones/source_functions-blind-clones-0.30-classes.xml`;
    const nicadReportTargetPath = `${outputPath}/temp/reports/${revisionId}`;
    if (isFileOrDirectoryExisting(nicadReportOriginalPath)) {
      Deno.copyFileSync(nicadReportOriginalPath, nicadReportTargetPath);
    } else {
      Deno.writeTextFileSync(nicadReportTargetPath, "");
    }
  }
  clearNicadSystemsDirectory(nicadSystemsDirectory);
}

function clearNicadSystemsDirectory(nicadSystemsDirectory: string) {
  try {
    Deno.removeSync(`${nicadSystemsDirectory}`, { recursive: true });
    Deno.mkdirSync(`${nicadSystemsDirectory}`, { recursive: true });
  } catch (error) {}
}

async function obtainGitRevisionList(sourceDirectory: string) {
  const utf8TextDecoder = new TextDecoder("utf-8");
  const gitLogProcess = Deno.run({
    cmd: ["git", "log", "--oneline"],
    cwd: sourceDirectory,
    stdout: "piped",
  });
  const gitLogbuffer = await gitLogProcess.output();
  const gitLog = utf8TextDecoder.decode(gitLogbuffer);
  const gitRevisionList = gitLog.split("\n").map((line) => line.split(" ")[0])
    .reverse();

  return gitRevisionList.filter(Boolean);
}

async function gitCheckout(sourceBranchName: string, sourceDirectory: string) {
  console.log(`Checking out Git for branch ${sourceBranchName}...`);
  const gitCheckoutProcess = Deno.run({
    cmd: ["git", "checkout", sourceBranchName],
    cwd: sourceDirectory,
    stdout: "piped",
  });
  await gitCheckoutProcess.output();
}

async function compileNicadIfNotCompiled(nicadDirectory: string) {
  if (!isFileOrDirectoryExisting(`${nicadDirectory}/tools/clonepairs.x`)) {
    console.log("Compiling NiCad...");
    const compileNicadProcess = Deno.run({
      cmd: ["make"],
      cwd: nicadDirectory,
      stdout: "piped",
    });
    await compileNicadProcess.output();
  }
}

async function extractNicadIfNotExsits(nicadDirectory: string) {
  if (!isFileOrDirectoryExisting(nicadDirectory)) {
    console.log("Extracting NiCad...");
    const extractNicadProcess = Deno.run({
      cmd: ["tar", "xvzf", "./NiCad-5.2.tar.gz"],
      stdout: "piped",
    });
    await extractNicadProcess.output();
  }
}

async function checkInstallations() {
  try {
    await Deno.run({
      cmd: ["make", "--help"],
      stdout: "piped",
      stderr: "null",
    }).output();
    await Deno.run({
      cmd: ["gcc", "--help"],
      stdout: "piped",
      stderr: "null",
    }).output();
    await Deno.run({
      cmd: ["txl", "--help"],
      stdout: "piped",
      stderr: "null",
    }).output();
    await Deno.run({
      cmd: ["tar", "--help"],
      stdout: "piped",
      stderr: "null",
    }).output();
    await Deno.run({
      cmd: ["git", "--help"],
      stdout: "piped",
      stderr: "null",
    }).output();
  } catch (error) {
    throw new Error(
      "Make sure you have make, gcc, txl, tar, and git in $PATH.",
    );
  }
}

if (import.meta.main) {
  const args = Deno.args;

  if (!args[0] || args[0].match(/(^-h$)|(^--help$)/)) {
    const helpText =
      "Argument help: <source_directory> <source_branch_name> <nicad_granularity> <nicad_lang> <output_path> <min_revision?> <max_revision?>";
    console.log(helpText);
  } else {
    const [
      sourceDirectory,
      sourceBranchName,
      nicadGranularity,
      nicadLang,
      outputPath,
    ] = args;
    await initialize(
      sourceDirectory,
      sourceBranchName,
      nicadGranularity,
      nicadLang,
      outputPath,
    );
  }
}
