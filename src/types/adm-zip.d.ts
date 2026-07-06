declare module "adm-zip" {
  export type ZipEntry = {
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer;
  };

  export default class AdmZip {
    constructor(filePath: string);
    getEntries(): ZipEntry[];
  }
}
