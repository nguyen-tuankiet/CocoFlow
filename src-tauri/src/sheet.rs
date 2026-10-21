//! Spreadsheet conversion without any office suite: xlsx/xls/ods/csv/tsv in, xlsx/ods/csv/tsv/html out.

use calamine::{open_workbook_auto, Reader};
use std::io::Write;
use std::path::Path;

pub struct Sheet {
    pub name: String,
    pub rows: Vec<Vec<String>>,
}

fn parse_delimited(text: &str, delimiter: char) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = text.trim_start_matches('\u{feff}').chars().peekable();
    while let Some(c) = chars.next() {
        if quoted {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    quoted = false;
                }
            } else {
                field.push(c);
            }
        } else if c == '"' && field.is_empty() {
            quoted = true;
        } else if c == delimiter {
            row.push(std::mem::take(&mut field));
        } else if c == '\n' || c == '\r' {
            if c == '\r' && chars.peek() == Some(&'\n') {
                chars.next();
            }
            row.push(std::mem::take(&mut field));
            rows.push(std::mem::take(&mut row));
        } else {
            field.push(c);
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows
}

pub fn read(path: &Path) -> Result<Vec<Sheet>, String> {
    let ext = crate::catalog::ext_of(path);
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    if ext == "csv" || ext == "tsv" {
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&bytes);
        let delimiter = if ext == "tsv" {
            '\t'
        } else {
            // Many locales use ';' in .csv files.
            let first = text.lines().next().unwrap_or("");
            if first.matches(';').count() > first.matches(',').count() { ';' } else { ',' }
        };
        return Ok(vec![Sheet { name: stem, rows: parse_delimited(&text, delimiter) }]);
    }
    let mut workbook = open_workbook_auto(path).map_err(|e| format!("Cannot open spreadsheet: {e}"))?;
    let names = workbook.sheet_names().to_vec();
    let mut sheets = Vec::new();
    for name in names {
        let range = workbook.worksheet_range(&name).map_err(|e| format!("Sheet {name}: {e}"))?;
        let rows = range.rows().map(|row| row.iter().map(|cell| cell.to_string()).collect()).collect();
        sheets.push(Sheet { name, rows });
    }
    if sheets.is_empty() {
        return Err("The workbook has no sheets".into());
    }
    Ok(sheets)
}

fn quote(field: &str, delimiter: char) -> String {
    if field.contains(delimiter) || field.contains('"') || field.contains('\n') || field.contains('\r') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

/// Text that should be stored as a number. Ids with leading zeros ("007") and anything longer than
/// 15 digits (it would lose digits as a float) stay text.
fn as_number(cell: &str) -> Option<f64> {
    let t = cell.trim();
    let digits = t.chars().filter(char::is_ascii_digit).count();
    let unsigned = t.trim_start_matches(['-', '+']);
    let leading_zero = unsigned.len() > 1 && unsigned.starts_with('0') && unsigned.as_bytes()[1].is_ascii_digit();
    if t.is_empty() || digits > 15 || leading_zero {
        return None;
    }
    t.parse::<f64>().ok().filter(|n| n.is_finite())
}

pub fn write_delimited(sheet: &Sheet, path: &Path, delimiter: char) -> Result<(), String> {
    let mut out = String::from('\u{feff}');
    for row in &sheet.rows {
        let line: Vec<String> = row.iter().map(|f| quote(f, delimiter)).collect();
        out.push_str(&line.join(&delimiter.to_string()));
        out.push_str("\r\n");
    }
    std::fs::write(path, out).map_err(|e| e.to_string())
}

pub fn write_xlsx(sheets: &[Sheet], path: &Path) -> Result<(), String> {
    let mut workbook = rust_xlsxwriter::Workbook::new();
    for (index, sheet) in sheets.iter().enumerate() {
        let worksheet = workbook.add_worksheet();
        // Excel limits names to 31 characters and forbids some symbols.
        let mut name: String =
            sheet.name.chars().filter(|c| !"[]:*?/\\".contains(*c)).take(31).collect();
        if name.trim().is_empty() {
            name = format!("Sheet{}", index + 1);
        }
        worksheet.set_name(&name).map_err(|e| e.to_string())?;
        for (r, row) in sheet.rows.iter().enumerate() {
            for (c, cell) in row.iter().enumerate() {
                if cell.is_empty() {
                    continue;
                }
                let result = match as_number(cell) {
                    Some(number) => worksheet.write_number(r as u32, c as u16, number),
                    None => worksheet.write_string(r as u32, c as u16, cell),
                };
                result.map_err(|e| e.to_string())?;
            }
        }
    }
    workbook.save(path).map_err(|e| e.to_string())
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

pub fn write_ods(sheets: &[Sheet], path: &Path) -> Result<(), String> {
    let mut body = String::new();
    for (index, sheet) in sheets.iter().enumerate() {
        let name = if sheet.name.trim().is_empty() { format!("Sheet{}", index + 1) } else { sheet.name.clone() };
        body.push_str(&format!("<table:table table:name=\"{}\">", xml_escape(&name)));
        for row in &sheet.rows {
            body.push_str("<table:table-row>");
            for cell in row {
                match as_number(cell) {
                    Some(n) => body.push_str(
                        &format!("<table:table-cell office:value-type=\"float\" office:value=\"{n}\"><text:p>{n}</text:p></table:table-cell>"),
                    ),
                    None if cell.is_empty() => body.push_str("<table:table-cell/>"),
                    None => body.push_str(&format!(
                        "<table:table-cell office:value-type=\"string\"><text:p>{}</text:p></table:table-cell>",
                        xml_escape(cell)
                    )),
                }
            }
            body.push_str("</table:table-row>");
        }
        body.push_str("</table:table>");
    }
    let content = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><office:document-content \
         xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" \
         xmlns:table=\"urn:oasis:names:tc:opendocument:xmlns:table:1.0\" \
         xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" office:version=\"1.2\">\
         <office:body><office:spreadsheet>{body}</office:spreadsheet></office:body></office:document-content>"
    );
    let manifest = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><manifest:manifest \
        xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\" manifest:version=\"1.2\">\
        <manifest:file-entry manifest:full-path=\"/\" manifest:media-type=\"application/vnd.oasis.opendocument.spreadsheet\"/>\
        <manifest:file-entry manifest:full-path=\"content.xml\" manifest:media-type=\"text/xml\"/></manifest:manifest>";

    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let stored = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated = zip::write::SimpleFileOptions::default();
    let mut add = |name: &str, data: &str, options| -> Result<(), String> {
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        zip.write_all(data.as_bytes()).map_err(|e| e.to_string())
    };
    add("mimetype", "application/vnd.oasis.opendocument.spreadsheet", stored)?;
    add("content.xml", &content, deflated)?;
    add("META-INF/manifest.xml", manifest, deflated)?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// A printable HTML page with one table per sheet (turned into a PDF by Edge).
pub fn write_html(sheets: &[Sheet], path: &Path) -> Result<(), String> {
    let mut html = String::from(
        "<!doctype html><meta charset=\"utf-8\"><style>\
         body{font-family:Segoe UI,Arial,sans-serif;font-size:11px;margin:12px}\
         h2{font-size:14px;margin:16px 0 6px}\
         table{border-collapse:collapse;width:100%}\
         td{border:1px solid #bbb;padding:3px 6px;vertical-align:top}\
         @page{size:A4 landscape;margin:10mm}</style>",
    );
    for sheet in sheets {
        if sheets.len() > 1 {
            html.push_str(&format!("<h2>{}</h2>", xml_escape(&sheet.name)));
        }
        html.push_str("<table>");
        for row in &sheet.rows {
            html.push_str("<tr>");
            for cell in row {
                html.push_str(&format!("<td>{}</td>", xml_escape(cell)));
            }
            html.push_str("</tr>");
        }
        html.push_str("</table>");
    }
    std::fs::write(path, html).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_roundtrip_with_quotes() {
        let rows = parse_delimited("a,b\r\n\"x,1\",\"he said \"\"hi\"\"\"\r\n", ',');
        assert_eq!(rows[1], vec!["x,1".to_string(), "he said \"hi\"".to_string()]);
    }

    #[test]
    fn qa_numbers_stay_numbers_and_ids_stay_text() {
        use calamine::{open_workbook_auto, Data, Reader};
        let dir = std::env::temp_dir().join("cocoflow-tests").join("sheet-types");
        std::fs::create_dir_all(&dir).unwrap();
        let sheets = vec![Sheet {
            name: "T".into(),
            rows: vec![vec!["0.5".into(), "007".into(), "12345678901234567890".into(), "-3".into(), "0".into(), "1234.5".into()]],
        }];
        write_xlsx(&sheets, &dir.join("t.xlsx")).unwrap();
        let mut book = open_workbook_auto(dir.join("t.xlsx")).unwrap();
        let range = book.worksheet_range("T").unwrap();
        let row: Vec<&Data> = range.rows().next().unwrap().iter().collect();
        let is_num = |d: &Data| matches!(d, Data::Float(_) | Data::Int(_));
        assert!(is_num(row[0]), "0.5 must be a number, got {:?}", row[0]);
        assert!(!is_num(row[1]), "007 must stay text, got {:?}", row[1]);
        assert!(!is_num(row[2]), "20-digit id would lose digits as a float, got {:?}", row[2]);
        assert!(is_num(row[3]) && is_num(row[4]) && is_num(row[5]), "plain numbers: {:?}", &row[3..]);
        assert_eq!(row[2].to_string(), "12345678901234567890");
    }

    #[test]
    fn xlsx_and_ods_roundtrip() {
        let dir = std::env::temp_dir().join("cocoflow-tests").join("sheet");
        std::fs::create_dir_all(&dir).unwrap();
        let sheets = vec![Sheet {
            name: "Data".into(),
            rows: vec![vec!["name".into(), "qty".into()], vec!["apple".into(), "3".into()], vec!["pear".into(), "4.5".into()]],
        }];
        write_xlsx(&sheets, &dir.join("t.xlsx")).unwrap();
        write_ods(&sheets, &dir.join("t.ods")).unwrap();
        for f in ["t.xlsx", "t.ods"] {
            let back = read(&dir.join(f)).unwrap();
            assert_eq!(back[0].rows[1], vec!["apple".to_string(), "3".to_string()], "{f}");
            assert_eq!(back[0].rows[2][1], "4.5", "{f}");
        }
    }
}


