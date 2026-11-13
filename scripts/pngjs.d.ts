// pngjs no trae tipos. Alcanza con lo que usa verificar-etiquetas.ts.
declare module 'pngjs' {
  const pngjs: {
    PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } };
  };
  export default pngjs;
}
