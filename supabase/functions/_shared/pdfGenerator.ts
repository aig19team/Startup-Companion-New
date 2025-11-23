import { createClient } from 'npm:@supabase/supabase-js@2';

export interface PDFGenerationOptions {
  userId: string;
  documentType: 'registration' | 'branding' | 'compliance' | 'hr';
  content: string;
  businessName?: string;
}

export async function generateAndStorePDF(
  options: PDFGenerationOptions,
  supabaseClient: ReturnType<typeof createClient>
): Promise<{ pdfUrl: string; fileName: string } | null> {
  try {
    const { userId, documentType, content, businessName = 'Business' } = options;

    if (!content || content.trim().length === 0) {
      console.error('Cannot generate PDF: content is empty');
      return null;
    }

    if (content.length > 50000) {
      console.warn('Content exceeds recommended length for PDF generation');
    }

    console.log(`Starting PDF generation for ${documentType}, content length: ${content.length} chars`);

    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `${userId}/${documentType}/${documentType}-guide-${timestamp}.pdf`;

    const pdfBuffer = await generatePDFBuffer(content, documentType, businessName);
    console.log(`PDF buffer generated successfully, size: ${pdfBuffer.length} bytes`);

    // Ensure the folder structure exists by attempting to create it if needed
    // Supabase storage creates folders automatically on upload, but we log for debugging
    console.log(`Attempting to upload PDF to: ${fileName}`);
    console.log(`PDF buffer size: ${pdfBuffer.length} bytes`);
    
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('business-documents')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading PDF to storage:', uploadError);
      console.error('Upload error details:', JSON.stringify(uploadError, null, 2));
      console.error('Document type:', documentType);
      console.error('File name attempted:', fileName);
      console.error('User ID:', userId);
      
      // Check if it's a permission error
      if (uploadError.message?.includes('permission') || uploadError.message?.includes('policy')) {
        console.error('Storage permission error detected. Check RLS policies for business-documents bucket.');
      }
      
      // Check if it's a bucket error
      if (uploadError.message?.includes('bucket') || uploadError.message?.includes('not found')) {
        console.error('Bucket error detected. Ensure business-documents bucket exists and is configured correctly.');
      }
      
      return null;
    }

    console.log(`PDF uploaded successfully to: ${fileName}`);
    console.log(`Upload data:`, JSON.stringify(uploadData));

    const { data: urlData } = supabaseClient.storage
      .from('business-documents')
      .getPublicUrl(fileName);

    return {
      pdfUrl: urlData.publicUrl,
      fileName: fileName
    };
  } catch (error) {
    console.error('Error in generateAndStorePDF:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', JSON.stringify(error, null, 2));
    return null;
  }
}

async function generatePDFBuffer(
  content: string,
  documentType: string,
  businessName: string
): Promise<Uint8Array> {
  let PDFDocument;
  try {
    PDFDocument = (await import('npm:pdfkit@0.15.0')).default;
  } catch (importError) {
    console.error('Failed to import pdfkit:', importError);
    throw new Error('PDF library import failed');
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('PDF generation timeout after 30 seconds'));
    }, 30000);

    try {
      const chunks: Uint8Array[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      doc.on('end', () => {
        clearTimeout(timeoutId);
        try {
          const buffer = new Uint8Array(
            chunks.reduce((acc, chunk) => acc + chunk.length, 0)
          );
          let offset = 0;
          for (const chunk of chunks) {
            buffer.set(chunk, offset);
            offset += chunk.length;
          }
          console.log(`PDF buffer assembled: ${buffer.length} bytes from ${chunks.length} chunks`);
          resolve(buffer);
        } catch (bufferError) {
          console.error('Error assembling PDF buffer:', bufferError);
          reject(bufferError);
        }
      });
      doc.on('error', (error) => {
        clearTimeout(timeoutId);
        console.error('PDFKit error:', error);
        reject(error);
      });

      const titleMap: Record<string, string> = {
        registration: 'Company Registration Guide',
        branding: 'Branding Strategy Guide',
        compliance: 'Compliance & Legal Guide',
        hr: 'HR Setup Guide'
      };

      const colorMap: Record<string, string> = {
        registration: '#3B82F6',
        branding: '#9333EA',
        compliance: '#10B981',
        hr: '#F97316'
      };

      const title = titleMap[documentType] || 'Business Guide';
      const primaryColor = colorMap[documentType] || '#3B82F6';

      doc.fontSize(24)
        .fillColor(primaryColor)
        .text(title, { align: 'center' });

      doc.moveDown(0.5);
      doc.fontSize(14)
        .fillColor('#6B7280')
        .text(`Generated for: ${businessName}`, { align: 'center' });

      doc.moveDown(0.3);
      doc.fontSize(10)
        .fillColor('#9CA3AF')
        .text(`Date: ${new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}`, { align: 'center' });

      doc.moveDown(2);
      doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      const lines = content.split('\n');
      let currentFontSize = 11;
      let currentColor = '#1F2937';

      for (const line of lines) {
        if (doc.y > 720) {
          doc.addPage();
        }

        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('# ')) {
          doc.moveDown(0.8);
          doc.fontSize(18).fillColor(primaryColor).text(trimmedLine.substring(2), {
            continued: false
          });
          doc.moveDown(0.5);
          currentFontSize = 11;
          currentColor = '#1F2937';
        } else if (trimmedLine.startsWith('## ')) {
          doc.moveDown(0.6);
          doc.fontSize(14).fillColor(primaryColor).text(trimmedLine.substring(3), {
            continued: false
          });
          doc.moveDown(0.3);
          currentFontSize = 11;
          currentColor = '#1F2937';
        } else if (trimmedLine.startsWith('### ')) {
          doc.moveDown(0.4);
          doc.fontSize(12).fillColor('#374151').text(trimmedLine.substring(4), {
            continued: false
          });
          doc.moveDown(0.2);
          currentFontSize = 11;
          currentColor = '#1F2937';
        } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
          doc.fontSize(11).fillColor('#1F2937');
          const bulletText = trimmedLine.substring(2);
          doc.list([bulletText], {
            bulletRadius: 2,
            textIndent: 20,
            bulletIndent: 10
          });
        } else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
          doc.moveDown(0.2);
          doc.fontSize(11).fillColor('#374151').font('Helvetica-Bold')
            .text(trimmedLine.replace(/\*\*/g, ''), { continued: false });
          doc.font('Helvetica');
          currentFontSize = 11;
          currentColor = '#1F2937';
        } else if (trimmedLine.length > 0) {
          doc.fontSize(currentFontSize).fillColor(currentColor);
          const cleanText = trimmedLine.replace(/\*\*/g, '');
          doc.text(cleanText, {
            align: 'left',
            continued: false
          });
        } else {
          doc.moveDown(0.3);
        }
      }

      doc.moveDown(2);
      const footerY = 750;
      doc.fontSize(8)
        .fillColor('#9CA3AF')
        .text(
          'Generated by StartUP Companion - Your Business Launch Partner',
          50,
          footerY,
          { align: 'center', width: 495 }
        );

      doc.end();
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error in PDF generation try block:', error);
      reject(error);
    }
  });
}
