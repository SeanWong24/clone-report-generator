import parseXML from "https://denopkg.com/nekobato/deno-xml-parser/index.ts";
import { DB } from "https://deno.land/x/sqlite@v2.1.1/mod.ts";
import { CloneFragment } from "./clone-report.ts";

export function mapChanges(
  basePath: string,
  minRevision: number,
  maxRevision: number,
  reportPath: string,
  changeLogPath: string,
  outputPath: string,
) {
  if (
    !(basePath && !Number.isNaN(minRevision) && !Number.isNaN(maxRevision) &&
      reportPath && changeLogPath && outputPath)
  ) {
    throw new Error("Not all required arguments are provided.");
  }

  console.log("Starting to mapping changes...");

  const revisionAndCloneClassesDict = obtainRevisionAndCloneClassesDict(
    minRevision,
    maxRevision,
    reportPath,
  );
  const cloneGlobalIdAndRevisionsDict = obtainCloneGlobalIdAndRevisionsDict(
    revisionAndCloneClassesDict,
    basePath,
    changeLogPath,
    minRevision,
  );
  writeClonesIntoDatabase(outputPath, cloneGlobalIdAndRevisionsDict);

  console.log("Done.");
}

function writeClonesIntoDatabase(
  outputPath: string,
  cloneGlobalIdAndRevisionsDict: {
    [globalId: number]: { [revision: number]: CloneFragment };
  },
) {
  console.log("Generating database file...");
  try {
    Deno.removeSync(`${outputPath}/clones.db`);
  } catch (error) {}
  const db = new DB(`${outputPath}/clones.db`);
  db.query(
    "CREATE TABLE IF NOT EXISTS clones (" +
      "globalId INTEGER, " +
      "revision INTEGER, " +
      "pcId INTEGER, " +
      "classId INTEGER, " +
      "startLine INTEGER, " +
      "endLine INTEGER, " +
      "additionCount INTEGER, " +
      "deletionCount INTEGER, " +
      "filePath TEXT, " +
      "PRIMARY KEY(globalId, revision)" +
      ")",
  );
  for (
    const [globalId, revisionAndCloneFragmentDict] of Object.entries(
      cloneGlobalIdAndRevisionsDict,
    )
  ) {
    for (
      const [revision, cloneFragment] of Object.entries(
        revisionAndCloneFragmentDict,
      )
    ) {
      db.query(
        "INSERT INTO clones VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          globalId,
          revision,
          cloneFragment.pcId,
          cloneFragment.classId,
          cloneFragment.startLine,
          cloneFragment.endLine,
          cloneFragment.additionCount,
          cloneFragment.deletionCount,
          cloneFragment.filePath,
        ],
      );
    }
  }
  db.close();
}

function obtainCloneGlobalIdAndRevisionsDict(
  revisionAndCloneClassesDict: {
    [revision: number]: { [classId: number]: CloneFragment[] };
  },
  basePath: string,
  changeLogPath: string,
  minRevision: number,
) {
  const cloneGlobalIdAndRevisionsDict: {
    [globalId: number]: { [revision: number]: CloneFragment };
  } = {};
  for (const entry of Object.entries(revisionAndCloneClassesDict)) {
    const [revision, cloneClassIdAndFragmentsDict] = entry;
    console.log(`Processing revision ${revision}...`);

    const cloneFragmentsInCurrentRevision = Object.values(
      cloneClassIdAndFragmentsDict,
    ).flat();
    if (+revision === minRevision) {
      for (const cloneFragment of cloneFragmentsInCurrentRevision) {
        assignGlobalIdForANewCloneFragment(
          cloneFragment,
          cloneGlobalIdAndRevisionsDict,
          +revision,
        );
      }
    } else {
      const changeLogs = obtainChangeLogs(`${changeLogPath}/${revision}`);
      for (const cloneFragment of cloneFragmentsInCurrentRevision) {
        const changeLogsForFileContainingCurrentCloneFragment = changeLogs
          .filter((changeLog) =>
            changeLog[0] ===
              cloneFragment.filePath.substring(`${basePath}/`.length)
          );

        const cloneClassIdAndFragmentsDictForLastRevision =
          revisionAndCloneClassesDict[+revision - 1];
        const cloneFragmentsInLastRevision = Object.values(
          cloneClassIdAndFragmentsDictForLastRevision,
        ).flat();
        let matchedCloneFragmentInLastRevision =
          findMatchedCloneFragmentInLastRevision(
            cloneFragment,
            cloneFragmentsInLastRevision,
            changeLogsForFileContainingCurrentCloneFragment,
          );
        if (matchedCloneFragmentInLastRevision) {
          assignGlobalIdForCloneFragment(
            cloneFragment,
            cloneGlobalIdAndRevisionsDict,
            matchedCloneFragmentInLastRevision.globalId!,
            +revision,
          );
        } else {
          assignGlobalIdForANewCloneFragment(
            cloneFragment,
            cloneGlobalIdAndRevisionsDict,
            +revision,
          );
        }
      }
    }
  }
  return cloneGlobalIdAndRevisionsDict;
}

function findMatchedCloneFragmentInLastRevision(
  cloneFragment: CloneFragment,
  cloneFragmentsInLastRevision: CloneFragment[],
  changeLogsForFileContainingCurrentCloneFragment: string[][],
) {
  const { adjustedStartLine, adjustedEndLine } = obtainAdjustedLineNumbers(
    cloneFragment,
    changeLogsForFileContainingCurrentCloneFragment,
  );

  for (const cloneFragmentForLastRevison of cloneFragmentsInLastRevision) {
    if (
      adjustedStartLine <= cloneFragmentForLastRevison.endLine &&
      cloneFragmentForLastRevison.startLine <= adjustedEndLine
    ) {
      return cloneFragmentForLastRevison;
    }
  }
}

function obtainAdjustedLineNumbers(
  cloneFragment: CloneFragment,
  changeLogsForFile: string[][],
) {
  let lineNumberOffset = 0;
  let adjustedStartLine = cloneFragment.startLine;
  let adjustedEndLine = cloneFragment.endLine;
  for (const changeLog of changeLogsForFile) {
    const lineNumber = +changeLog[1];
    const operator = changeLog[2];
    if (lineNumber <= cloneFragment.startLine) {
      switch (operator) {
        case "+":
          lineNumberOffset++;
          break;
        case "-":
          lineNumberOffset--;
          break;
      }
    } else {
      adjustedStartLine += lineNumberOffset;
    }
    if (lineNumber <= cloneFragment.endLine) {
      switch (operator) {
        case "+":
          lineNumberOffset++;
          cloneFragment.additionCount++;
          break;
        case "-":
          lineNumberOffset--;
          cloneFragment.deletionCount++;
          break;
      }
    } else {
      adjustedEndLine += lineNumberOffset;
      break;
    }
  }
  return { adjustedStartLine, adjustedEndLine };
}

function obtainChangeLogs(changeLogPath: string) {
  const fileContent = Deno.readTextFileSync(changeLogPath);
  return fileContent
    .split("\n")
    .filter((row) => row)
    .map((row) => row.split(":"));
}

function assignGlobalIdForANewCloneFragment(
  cloneFragment: CloneFragment,
  cloneGlobalIdAndRevisionsDict: {
    [globalId: number]: { [revision: number]: CloneFragment };
  },
  revision: number,
) {
  assignGlobalIdForCloneFragment(
    cloneFragment,
    cloneGlobalIdAndRevisionsDict,
    Object.keys(cloneGlobalIdAndRevisionsDict).length,
    revision,
  );
}

function assignGlobalIdForCloneFragment(
  cloneFragment: CloneFragment,
  cloneGlobalIdAndRevisionsDict: {
    [globalId: number]: { [revision: number]: CloneFragment };
  },
  globalId: number,
  revision: number,
) {
  cloneFragment.globalId = globalId;
  if (!cloneGlobalIdAndRevisionsDict[globalId]) {
    cloneGlobalIdAndRevisionsDict[globalId] = {};
  }
  cloneGlobalIdAndRevisionsDict[globalId][revision] = cloneFragment;
}

function obtainRevisionAndCloneClassesDict(
  minRevision: number,
  maxRevision: number,
  reportPath: string,
) {
  const revisionAndCloneClassesDict: {
    [revision: number]: { [classId: number]: CloneFragment[] };
  } = {};
  for (let revision = minRevision; revision <= maxRevision; revision++) {
    const report = obtainCloneReport(`${reportPath}/${revision}`);
    const cloneClassIdAndFragmentsDict: { [classId: number]: CloneFragment[] } =
      {};
    const classNodes = report.root?.children
      .filter((node) => node.name === "class") || [];
    for (const classNode of classNodes) {
      const classId = +classNode.attributes?.classid;
      if (!Number.isNaN(classId)) {
        cloneClassIdAndFragmentsDict[classId] = classNode.children
          ?.map((cloneFragmentNode: any) =>
            obtainCloneFragment(classId, cloneFragmentNode)
          );
      }
    }
    revisionAndCloneClassesDict[revision] = cloneClassIdAndFragmentsDict;
  }
  return revisionAndCloneClassesDict;
}

function obtainCloneFragment(classId: number, cloneFragmentNode: any) {
  const attributes = cloneFragmentNode.attributes;
  return {
    classId: +classId,
    pcId: +attributes.pcid,
    startLine: +attributes.startline,
    endLine: +attributes.endline,
    filePath: attributes.file,
    additionCount: 0,
    deletionCount: 0,
  } as CloneFragment;
}

function obtainCloneReport(reportPath: string) {
  const fileContent = Deno.readTextFileSync(reportPath);
  const reportNode = parseXML(fileContent);
  return reportNode;
}

if (import.meta.main) {
  const args = Deno.args;

  if (!args[0] || args[0].match(/(^-h$)|(^--help$)/)) {
    const helpText =
      "Argument help: <base_path> <min_revision> <max_revision> <report_path> <change_log_path> <output_path>";
    console.log(helpText);
  } else {
    const [
      basePath,
      minRevision,
      maxRevision,
      reportPath,
      changeLogPath,
      outputPath,
    ] = args;

    mapChanges(
      basePath,
      +minRevision,
      +maxRevision,
      reportPath,
      changeLogPath,
      outputPath,
    );
  }
}
