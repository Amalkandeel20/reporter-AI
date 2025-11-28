import { jsPDF } from 'jspdf';
import { ReportData } from '../types';

export const generatePdf = async (reportData: ReportData): Promise<Blob> => {
    const doc = new jsPDF();
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = margin;

    // Brand colors (matching app theme)
    const brandTeal: [number, number, number] = [0, 77, 86]; // #004D56
    const brandTealLight: [number, number, number] = [0, 109, 122]; // #006D7A

    // Cover Page with branded header
    doc.setFillColor(...brandTeal);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(reportData.projectTitle || 'Worksite Activity Report', pageWidth / 2, y + 15, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    y += 50;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text(`Project: ${reportData.projectTitle}`, margin, y);
    y += 10;
    doc.text(`Site: ${reportData.site}`, margin, y);
    y += 10;
    doc.text(`Date: ${reportData.date}`, margin, y);
    y += 20;

    // Summary section with teal accent
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...brandTeal);
    doc.text('Summary:', margin, y);
    doc.setTextColor(0, 0, 0);
    y += 7;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const summaryLines = doc.splitTextToSize(reportData.summary, pageWidth - margin * 2);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 5 + 10;

    const addImageWithLabel = (label: string, imageData: string, x: number, yPos: number, width: number, height: number) => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(label, x + width / 2, yPos - 2, { align: 'center' });
        doc.addImage(imageData, 'JPEG', x, yPos, width, height);
    };

    const imageWidth = (pageWidth - margin * 3) / 2;
    const imageHeight = imageWidth * 0.75;
    if (reportData.beforeImage) {
        addImageWithLabel('Before', reportData.beforeImage, margin, y, imageWidth, imageHeight);
    }
    if (reportData.afterImage) {
        addImageWithLabel('After', reportData.afterImage, margin + imageWidth + margin, y, imageWidth, imageHeight);
    }
    if (reportData.beforeImage || reportData.afterImage) {
        y += imageHeight + 15;
    }

    // Episodes Page
    doc.addPage();
    y = margin;

    // Header with teal background
    doc.setFillColor(...brandTeal);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Episode Log', pageWidth / 2, 18, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    y = 45;

    doc.setFont('helvetica', 'normal');
    for (const item of reportData.episodes) {
        if (y > 250) { // Check for page break
            doc.addPage();
            y = margin;
        }

        const thumbnailWidth = 40;
        const thumbnailHeight = 30;

        const episodeImage = item.episodeData.highlightedFrame || item.episodeData.thumbnail;
        doc.addImage(episodeImage, 'JPEG', margin, y, thumbnailWidth, thumbnailHeight);

        const textX = margin + thumbnailWidth + 5;
        const textWidth = pageWidth - textX - margin;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const summaryLines = doc.splitTextToSize(item.summary, textWidth);
        doc.text(summaryLines, textX, y + 5);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...brandTealLight);
        doc.text(`Time: ${item.episodeData.startTime}s - ${item.episodeData.endTime}s`, textX, y + 15);
        doc.setTextColor(100);
        const toolsText = item.episodeData.detectedTools.length
            ? item.episodeData.detectedTools.join(', ')
            : 'Not detected';
        doc.text(`Tools: ${toolsText}`, textX, y + 20);
        const actionsText = item.episodeData.keyActions.length
            ? item.episodeData.keyActions.join(', ')
            : 'Not detected';
        doc.text(`Actions: ${actionsText}`, textX, y + 25);

        y += thumbnailHeight + 15;
        doc.setTextColor(0);
    }

    return doc.output('blob');
};

