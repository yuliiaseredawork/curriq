declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfParse = (
    data: Buffer,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  const pdfParse: PdfParse;
  export default pdfParse;
}
