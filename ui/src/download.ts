/** Start a browser download of `href`; the file streams to disk, it is never buffered in JS memory. */
export function downloadUrl(href: string, fileName: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  // Safari ignores a detached anchor and cancels a download whose blob is revoked too early.
  document.body.append(link);
  link.click();
  link.remove();
}

export function downloadFile(fileName: string, file: Blob) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  // Safari ignores a detached anchor and cancels a download whose blob is revoked too early.
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
