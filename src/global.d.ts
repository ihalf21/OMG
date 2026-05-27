// Декларации для side-effect импортов и нестандартных ассетов.

declare module '*.css';
declare module '*.svg' {
  const content: string;
  export default content;
}
declare module '*.png' {
  const content: string;
  export default content;
}
