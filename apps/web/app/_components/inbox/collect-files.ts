/** Helpers that turn a picked or dropped folder into files with paths relative to the submission folder. */

export interface PickedFile {
  file: File;
  /** Path inside the submission folder, e.g. "evidence/DEC-SDF-CPF2_Flare-Log_Daily_2025.csv". */
  relativePath: string;
}

/** Skips OS metadata such as ".DS_Store" and "__MACOSX". */
const isJunk = (path: string) => path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX" || part === "Thumbs.db");

/** "DEC_Southern-Dunes-CPF2_RY2025/evidence/x.csv" → "evidence/x.csv" */
const stripTopFolder = (path: string) => path.split("/").slice(1).join("/");

function clean(files: PickedFile[]) {
  return files.filter((f) => f.relativePath && !isJunk(f.relativePath));
}

/** From an <input type="file">. Folder pickers report `webkitRelativePath` starting with the folder name. */
export function fromFileList(list: FileList): PickedFile[] {
  return clean(
    Array.from(list, (file) => ({
      file,
      relativePath: file.webkitRelativePath ? stripTopFolder(file.webkitRelativePath) : file.name,
    })),
  );
}

/**
 * From a drop event. Walks dropped folders with `webkitGetAsEntry`. When exactly one folder is
 * dropped, its name is removed from the paths so they are relative to the submission folder.
 * Must be called synchronously inside the drop handler (the item list expires after the event).
 */
export async function fromDataTransfer(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(dt.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length === 0) return clean(Array.from(dt.files, (file) => ({ file, relativePath: file.name })));

  const singleFolder = entries.length === 1 && entries[0].isDirectory;
  const found = (await Promise.all(entries.map(walk))).flat();
  return clean(found.map(({ file, path }) => ({ file, relativePath: singleFolder ? stripTopFolder(path) : path })));
}

async function walk(entry: FileSystemEntry): Promise<{ file: File; path: string }[]> {
  const path = entry.fullPath.replace(/^\/+/, "");
  if (isFile(entry)) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    return [{ file, path }];
  }
  if (isDirectory(entry)) {
    const reader = entry.createReader();
    const children: FileSystemEntry[] = [];
    // readEntries returns results in batches; an empty batch means the folder is fully read.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      children.push(...batch);
    }
    return (await Promise.all(children.map(walk))).flat();
  }
  return [];
}

const isFile = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;
const isDirectory = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry => entry.isDirectory;

/** Adds files, replacing any with the same path, sorted with top-level files first. */
export function mergeFiles(current: PickedFile[], added: PickedFile[]): PickedFile[] {
  const byPath = new Map(current.map((f) => [f.relativePath, f]));
  for (const f of added) byPath.set(f.relativePath, f);
  return [...byPath.values()].sort((a, b) => {
    const depth = a.relativePath.split("/").length - b.relativePath.split("/").length;
    return depth || a.relativePath.localeCompare(b.relativePath);
  });
}

export const isWorkbook = (path: string) => /\.xlsx$/i.test(path);
