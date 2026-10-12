import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';

let modelPromise: Promise<mobilenet.MobileNet> | null = null;

export async function loadMobileNet(): Promise<mobilenet.MobileNet> {
  if (!modelPromise) {
    modelPromise = (async () => {
      // Set backend to webgl or cpu safely
      try {
        await tf.ready();
      } catch (err) {
        console.warn('TensorFlow backend initialization note:', err);
      }
      return mobilenet.load({ version: 2, alpha: 0.5 });
    })();
  }
  return modelPromise;
}

/**
 * Extracts a normalized 1024-dimensional feature embedding vector from an HTML Image Element.
 * Returns null gracefully if extraction fails or model is loading.
 */
export async function extractImageEmbedding(
  imageElement: HTMLImageElement
): Promise<number[] | null> {
  try {
    const model = await loadMobileNet();
    // model.infer(img, true) extracts the unflattened / embedding activation vector (before softmax)
    const logits = model.infer(imageElement, true);
    const data = await logits.data();
    logits.dispose();

    const rawArray = Array.from(data);
    return normalizeVector(rawArray);
  } catch (err) {
    console.warn('Client-side MobileNet feature extraction unavailable:', err);
    return null;
  }
}

function normalizeVector(vector: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vector.map(() => 0);
  return vector.map((v) => Math.round((v / norm) * 100000) / 100000);
}
