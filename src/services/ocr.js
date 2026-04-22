import { createWorker } from 'tesseract.js';

export async function extractText(imageBuffer) {
  const worker = await createWorker('pol+eng');
  const { data: { text } } = await worker.recognize(imageBuffer);
  await worker.terminate();
  return text;
}
