import { FaceDetector, FilesetResolver, Detection } from '@mediapipe/tasks-vision';
import { BoundingBox } from '../types';

let faceDetector: FaceDetector | null = null;

const initializeFaceDetector = async () => {
    if (faceDetector) return faceDetector;

    const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
    );

    faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
            delegate: 'GPU',
        },
        runningMode: 'IMAGE',
    });

    return faceDetector;
};

export const detectFaces = async (imageSource: string): Promise<BoundingBox[]> => {
    try {
        const detector = await initializeFaceDetector();

        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = imageSource;

        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
        });

        const detections = detector.detect(image);

        if (!detections.detections) return [];

        return detections.detections.map((detection: Detection) => {
            const box = detection.boundingBox;
            if (!box) return null;

            // Normalize coordinates (0-1)
            return {
                x: box.originX / image.width,
                y: box.originY / image.height,
                width: box.width / image.width,
                height: box.height / image.height,
            };
        }).filter((box): box is BoundingBox => box !== null);

    } catch (error) {
        console.error('Face detection failed:', error);
        return [];
    }
};
