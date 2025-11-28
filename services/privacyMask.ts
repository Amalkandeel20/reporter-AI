import * as StackBlur from 'stackblur-canvas';
import { BoundingBox } from '../types';

export interface PrivacyMaskOptions {
    focusRegions: BoundingBox[];
    redactionRegions: BoundingBox[];
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

export const applyPrivacyMask = async (
    imageDataUrl: string,
    { focusRegions, redactionRegions }: PrivacyMaskOptions
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

        const privacyCanvas = document.createElement('canvas');
        const privacyCtx = privacyCanvas.getContext('2d');
        if (!privacyCtx) {
            return imageDataUrl;
        }
        privacyCanvas.width = width;
        privacyCanvas.height = height;

        // 1. Draw the sharp original image
        privacyCtx.drawImage(baseCanvas, 0, 0);

        // 2. Blur each redaction box in isolation to avoid halos
        const redactionBoxes = mergeBoxes(redactionRegions)
            .map((box) => toPixelBox(box, width, height))
            .map((box) => expandBox(box, width, height, 0.12));

        for (const box of redactionBoxes) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = box.width;
            tempCanvas.height = box.height;
            const tempCtx = tempCanvas.getContext('2d');

            if (!tempCtx) continue;

            // Copy the region, blur it, then paint it back clipped to rounded corners
            tempCtx.drawImage(
                baseCanvas,
                box.x,
                box.y,
                box.width,
                box.height,
                0,
                0,
                box.width,
                box.height
            );

            StackBlur.canvasRGBA(tempCanvas, 0, 0, box.width, box.height, 20);

            privacyCtx.save();
            const radius = Math.min(box.width, box.height) * 0.25;
            privacyCtx.beginPath();
            privacyCtx.roundRect(box.x, box.y, box.width, box.height, radius);
            privacyCtx.clip();
            privacyCtx.drawImage(tempCanvas, box.x, box.y);
            privacyCtx.restore();
        }

        // 3. Draw focus regions (sharp borders)
        const focusBoxes = mergeBoxes(focusRegions)
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
