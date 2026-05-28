declare module 'html2canvas' {
  interface Html2CanvasOptions {
    scale?: number;
    useCORS?: boolean;
    backgroundColor?: string | null;
    logging?: boolean;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    scrollX?: number;
    scrollY?: number;
    windowWidth?: number;
    windowHeight?: number;
  }
  function html2canvas(element: HTMLElement, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
  export default html2canvas;
}

declare module 'jspdf' {
  interface JsPDFOptions {
    orientation?: 'portrait' | 'landscape' | 'p' | 'l';
    unit?: 'pt' | 'mm' | 'cm' | 'in' | 'px';
    format?: string | [number, number];
  }
  class jsPDF {
    constructor(options?: JsPDFOptions);
    addImage(
      imageData: string,
      format: string,
      x: number, y: number,
      w: number, h: number,
    ): this;
    addPage(): this;
    save(filename: string): void;
    internal: {
      pageSize: { getWidth(): number; getHeight(): number };
    };
  }
  export { jsPDF };
}
