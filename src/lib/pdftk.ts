/**
 * pdftk wrapper for filling the RMD maritime medical PDF form.
 * Uses pdftk system binary — no npm dependency.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

function generateFDF(data: Record<string, unknown>, pdfPath: string): string {
  const fields: string[] = [];

  function escapePdfString(str: string): string {
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const code = str.charCodeAt(i);
      if (code > 127) {
        result += '\\' + code.toString(8).padStart(3, '0');
      } else if (char === '\\' || char === '(' || char === ')') {
        result += '\\' + char;
      } else {
        result += char;
      }
    }
    return result;
  }

  for (const [fieldName, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;

    const escapedFieldName = escapePdfString(fieldName);

    if (typeof value === 'boolean') {
      const checkValue = value ? 'Yes' : 'Off';
      fields.push(`<<\n/T (${escapedFieldName})\n/V /${checkValue}\n>>`);
    } else if (typeof value === 'object' && value !== null && 'onValue' in value) {
      const obj = value as { value: boolean; onValue: string };
      const checkValue = obj.value ? obj.onValue : 'Off';
      fields.push(`<<\n/T (${escapedFieldName})\n/V /${checkValue}\n>>`);
    } else {
      const escapedValue = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
      fields.push(`<<\n/T (${escapedFieldName})\n/V (${escapedValue})\n>>`);
    }
  }

  return `%FDF-1.2
1 0 obj
<<
/FDF
<<
/Fields [
${fields.join('\n')}
]
/F (${pdfPath})
>>
>>
endobj
trailer
<<
/Root 1 0 R
>>
%%EOF`;
}

export async function fillRmdFormPdftk(
  data: Record<string, unknown>,
  outputPath: string
): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'public/templates/rmd_form.pdf');
  const tempFdfPath = `/tmp/marina_fdf_${Date.now()}.fdf`;
  const tempPdfPath = `/tmp/marina_filled_${Date.now()}.pdf`;

  try {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`RMD template not found at: ${templatePath}`);
    }

    const fdfContent = generateFDF(data, templatePath);
    fs.writeFileSync(tempFdfPath, fdfContent, 'latin1');

    await execFileAsync('pdftk', [
      templatePath,
      'fill_form',
      tempFdfPath,
      'output',
      tempPdfPath,
      'drop_xfa',
    ]);

    await execFileAsync('pdftk', [
      tempPdfPath,
      'output',
      outputPath,
      'uncompress',
    ]);

    const pdfBuffer = fs.readFileSync(outputPath);

    fs.unlinkSync(tempFdfPath);
    fs.unlinkSync(tempPdfPath);

    return pdfBuffer;
  } catch (error: unknown) {
    if (fs.existsSync(tempFdfPath)) fs.unlinkSync(tempFdfPath);
    if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);

    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate RMD PDF: ${msg}`);
  }
}

export async function checkPdftkAvailable(): Promise<boolean> {
  try {
    await execFileAsync('pdftk', ['--version']);
    return true;
  } catch {
    return false;
  }
}
