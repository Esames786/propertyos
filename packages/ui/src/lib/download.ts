/** Hands the browser a file to save (simulated exports, templates). Nothing leaves the device. */
export function saveFile(file: { fileName: string; mime: string; content: string }): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  a.click();
  URL.revokeObjectURL(url);
}
