export function formatGitDiff(diffContent: string) {
  return simplifyReport(formatReport(diffContent));
}

function formatReport(diffContent: string) {
  const result: string[] = [];

  let path: string = "";
  let line: number = +"";
  let operation: string = "";
  let match: RegExpMatchArray | null;
  const diffContentLines = diffContent.split("\n");
  for (const diffContentLine of diffContentLines) {
    if (match = diffContentLine.match(/---\ (a\/)?.*/)) {
      continue;
    } else if (
      match = diffContentLine.match(/\+\+\+\ (b\/)?([^\s\t\033]+).*/)
    ) {
      path = match[2];
    } else if (
      match = diffContentLine.match(
        /@@\ -[0-9]+(,[0-9]+)?\ \+([0-9]+)(,[0-9]+)?\ @@.*/,
      )
    ) {
      line = +match[2];
    } else if (match = diffContentLine.match(/^(\033\[[0-9;]+m)*([\ +-])/)) {
      operation = match[2];
      result.push(`${path}:${line}:${diffContentLine}`);
      if (match[2] !== "-") {
        line++;
      }
    }
  }

  return result;
}

function simplifyReport(diffLines: string[]) {
  let result: string = "";

  for (const diffLine of diffLines) {
    const parts = diffLine.split(/[\s\t:]+/);
    if (parts[2]?.substring(0, 1).match(/^[+-]$/)) {
      result += `${parts[0]}:${parts[1]}:${parts[2][0]}\n`;
    }
  }

  return result;
}

if (import.meta.main) {
  let inputString = "";
  let p = new Uint8Array(10);
  while (await Deno.stdin.read(p)) {
    const decoder = new TextDecoder("utf-8");
    inputString += decoder.decode(p);
    p = new Uint8Array(10);
  }
  console.log(formatGitDiff(inputString));
}
