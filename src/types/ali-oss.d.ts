declare module 'ali-oss' {
  namespace OSS {
    interface PutObjectResult {
      name: string
      url: string
      res: any
    }
  }

  class OSS {
    constructor(options: any)
    put(name: string, file: File | Blob, options?: any): Promise<OSS.PutObjectResult>
    multipartUpload(name: string, file: File | Blob, options?: any): Promise<OSS.PutObjectResult>
    abortMultipartUpload(name: string, uploadId: string): Promise<any>
  }

  export = OSS
}
