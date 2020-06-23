export function isFileOrDirectoryExisting(path: string) {
  try {
    return !!Deno.statSync(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    } else {
      throw error;
    }
  }
}

if (import.meta.main) {
  const inputPath = Deno.args[0];
  console.log(isFileOrDirectoryExisting(inputPath));
}
