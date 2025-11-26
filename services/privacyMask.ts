import { BoundingBox } from '../types';

export interface PrivacyMaskOptions {
    focusRegions: BoundingBox[];
    redactionRegions: BoundingBox[];
    fallbackRegion?: BoundingBox | null;
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

const clampBox = (box: BoundingBox): BoundingBox => ({
    x: clamp(box.x, 0, 1),
    y: clamp(box.y, 0, 1),
    width: clamp(box.width, 0, 1),
    height: clamp(box.height, 0, 1),
});

const toPixelBox = (box: BoundingBox, width: number, height: number) => {
    const clamped = clampBox(box);
    const pxWidth = Math.max(Math.round(clamped.width * width), 2);
    const pxHeight = Math.max(Math.round(clamped.height * height), 2);
    return {
        x: clamp(Math.round(clamped.x * width), 0, Math.max(width - pxWidth, 0)),
        y: clamp(Math.round(clamped.y * height), 0, Math.max(height - pxHeight, 0)),
        width: pxWidth,
        height: pxHeight,
    };
};

const loadImage = (source: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (event) => reject(event);
        img.src = source;
    });

const expandBox = (box: { x: number; y: number; width: number; height: number }, width: number, height: number, paddingRatio = 0.15) => {
    const padding = Math.round(Math.max(box.width, box.height) * paddingRatio);
    const x = clamp(box.x - padding, 0, width);
    const y = clamp(box.y - padding, 0, height);
    const maxWidth = width - x;
    const maxHeight = height - y;
    return {
        x,
        y,
        width: clamp(box.width + padding * 2, 2, maxWidth),
        height: clamp(box.height + padding * 2, 2, maxHeight),
    };
};

const mergeBoxes = (boxes: BoundingBox[]): BoundingBox[] => {
    const normalized = boxes.map(clampBox).filter((box) => box.width > 0 && box.height > 0);
    if (!normalized.length) return [];
    return normalized.reduce<BoundingBox[]>((acc, box) => {
        if (!acc.length) {
            acc.push(box);
            return acc;
        }
        const last = acc[acc.length - 1];
        const overlapX =
            Math.min(last.x + last.width, box.x + box.width) - Math.max(last.x, box.x);
        const overlapY =
            Math.min(last.y + last.height, box.y + box.height) - Math.max(last.y, box.y);
        if (overlapX > 0.25 * Math.min(last.width, box.width) && overlapY > 0.25 * Math.min(last.height, box.height)) {
            const merged = {
                x: Math.min(last.x, box.x),
                y: Math.min(last.y, box.y),
                width: Math.max(last.x + last.width, box.x + box.width) - Math.min(last.x, box.x),
                height: Math.max(last.y + last.height, box.y + box.height) - Math.min(last.y, box.y),
            };
            acc[acc.length - 1] = clampBox(merged);
        } else {
            acc.push(box);
        }
        return acc;
    }, []);
};

const upscaleBlurred = (
    image: HTMLImageElement,
    width: number,
    height: number
): HTMLCanvasElement => {
    const downscaleFactor = 4;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
        throw new Error('Unable to create temp canvas context');
    }
    tempCanvas.width = Math.max(32, Math.round(width / downscaleFactor));
    tempCanvas.height = Math.max(32, Math.round(height / downscaleFactor));
    tempCtx.drawImage(image, 0, 0, tempCanvas.width, tempCanvas.height);

    const blurCanvas = document.createElement('canvas');
    const blurCtx = blurCanvas.getContext('2d');
    if (!blurCtx) {
        throw new Error('Unable to create blur canvas context');
    }
    blurCanvas.width = width;
    blurCanvas.height = height;

    // Draw the low-res image scaled up with a blur filter
    blurCtx.filter = 'blur(35px)';
    blurCtx.drawImage(tempCanvas, 0, 0, blurCanvas.width, blurCanvas.height);
    blurCtx.filter = 'none';

    return blurCanvas;
};

const splitFallbackRegion = (fallbackRegion?: BoundingBox | null) => {
    if (!fallbackRegion) {
        return {
            focus: [],
            redactions: [],
        };
    }

    const focusHeight = clamp(fallbackRegion.height * 0.7, 0.05, 1);
    const focusY = clamp(fallbackRegion.y + fallbackRegion.height * 0.3, 0, 1 - focusHeight);
    const faceHeight = clamp(fallbackRegion.height * 0.35, 0.05, 1);

    const focusRegion: BoundingBox = {
        x: fallbackRegion.x,
        y: focusY,
        width: fallbackRegion.width,
        height: focusHeight,
    };
    const faceRegion: BoundingBox = {
        x: fallbackRegion.x,
        y: fallbackRegion.y,
        width: fallbackRegion.width,
        height: faceHeight,
    };

    return {
        focus: [focusRegion],
        redactions: [faceRegion],
    };
};

export const applyPrivacyMask = async (
    imageDataUrl: string,
    { focusRegions, redactionRegions, fallbackRegion }: PrivacyMaskOptions
): Promise<string> => {
    if (!imageDataUrl) {
        return imageDataUrl;
    }

    try {
        const image = await loadImage(imageDataUrl);
        const width = image.width || 1;
        const height = image.height || 1;

        const baseCanvas = document.createElement('canvas');
        const baseCtx = baseCanvas.getContext('2d');
        if (!baseCtx) {
            return imageDataUrl;
        }
        baseCanvas.width = width;
        baseCanvas.height = height;
        baseCtx.drawImage(image, 0, 0, width, height);

        const fallbackSplit = splitFallbackRegion(fallbackRegion ?? null);
        const resolvedFocus = focusRegions.length
            ? focusRegions
            : fallbackSplit.focus;
        const resolvedRedactions = redactionRegions;

        const privacyCanvas = document.createElement('canvas');
        const privacyCtx = privacyCanvas.getContext('2d');
        if (!privacyCtx) {
            return imageDataUrl;
        }
        privacyCanvas.width = width;
        privacyCanvas.height = height;

        // 1. Draw the sharp original image
        privacyCtx.drawImage(baseCanvas, 0, 0);

        // 2. Prepare the blurred version
        const blurCanvas = upscaleBlurred(image, width, height);

        // 3. Prepare the mask for redactions (soft, rounded)
        const redactionBoxes = mergeBoxes(resolvedRedactions)
            .map((box) => toPixelBox(box, width, height))
            .map((box) => expandBox(box, width, height, 0.15));

        if (redactionBoxes.length > 0) {
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = width;
            maskCanvas.height = height;
            const maskCtx = maskCanvas.getContext('2d');

            if (maskCtx) {
                // Draw opaque shapes on the mask
                maskCtx.fillStyle = 'black';
                maskCtx.shadowColor = 'black';
                maskCtx.shadowBlur = 20; // Soft feathering

                for (const box of redactionBoxes) {
                    maskCtx.beginPath();
                    const radius = Math.min(box.width, box.height) * 0.4;
                    maskCtx.roundRect(box.x, box.y, box.width, box.height, radius);
                    maskCtx.fill();
                }

                // Composite the blur onto the mask (keep blur where mask is opaque)
                maskCtx.globalCompositeOperation = 'source-in';
                maskCtx.drawImage(blurCanvas, 0, 0);

                // Draw the masked blur onto the main canvas
                privacyCtx.drawImage(maskCanvas, 0, 0);
            }
        }

        // 4. Draw focus regions (sharp borders)
        const focusBoxes = mergeBoxes(resolvedFocus)
            .map((box) => toPixelBox(box, width, height))
            .map((box) => expandBox(box, width, height, 0.1));

        for (const box of focusBoxes) {
            privacyCtx.lineWidth = Math.max(Math.round(width / 280), 2);
            privacyCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            privacyCtx.beginPath();
            const radius = Math.min(box.width, box.height) * 0.1;
            privacyCtx.roundRect(box.x, box.y, box.width, box.height, radius);
            privacyCtx.stroke();
        }

        return privacyCanvas.toDataURL('image/jpeg', 0.92);
    } catch (error) {
        console.warn('Failed to apply privacy mask. Returning original frame.', error);
        return imageDataUrl;
    }
};
