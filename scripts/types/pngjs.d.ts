declare module "pngjs" {
  interface PngImage {
    width: number
    height: number
    data: Uint8Array
  }

  export class PNG {
    static sync: {
      read(buffer: Buffer | Uint8Array): PngImage
    }
  }
}
